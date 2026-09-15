# Sitara ERP — Node.js SaaS

**Location:** `D:\SasS`  
**Stack:** Express.js + TypeScript + Prisma + PostgreSQL 16 + Next.js 14 + Tailwind CSS + shadcn/ui  
**Status:** In development (migrating from PHP/MySQL)  
**Original PHP app:** `C:\xampp\htdocs\sitara`  

---

## Quick Start

### Prerequisites
- Node.js 20+
- Docker Desktop (for PostgreSQL and Redis)  
- Run `docker compose up -d postgres redis` first

### Setup (first time)

```bash
cd D:\SasS
npm install
npx prisma generate --schema=apps/api/prisma/schema.prisma
npx prisma migrate dev --schema=apps/api/prisma/schema.prisma --name init
npx tsx apps/api/prisma/seed.ts                 # Creates demo tenant + admin user
npx tsx apps/api/prisma/seed-test-data.ts        # Creates Zara Bags demo data
```

### Run (two terminals)

**Terminal 1 — API:**
```bash
npx tsx apps/api/src/index.ts
```

**Terminal 2 — Web:**
```bash
cd apps/web && npx next dev -p 3001
```

### Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@demo.com` | `admin123` |
| Demo User | `demo@demo.com` | `demo123` |

### Infrastructure
| Service | Host | Port |
|---------|------|------|
| PostgreSQL | localhost | 5435 |
| Redis | localhost | 6380 |
| API | localhost | 3000 |
| Web | localhost | 3001 |

---

## Project Structure

```
D:\SasS/
├── apps/
│   ├── api/                          # Express.js backend
│   │   ├── src/
│   │   │   ├── index.ts             # Express app entry
│   │   │   ├── worker.ts            # BullMQ background worker
│   │   │   ├── config/              # Environment config (.env fallbacks)
│   │   │   ├── constants/           # Shared constants (account codes, etc.)
│   │   │   ├── lib/                 # Prisma client, Redis, BullMQ queue
│   │   │   ├── middleware/          # Auth, tenant, RBAC, rate limit, validation, error handler
│   │   │   ├── routes/              # Route files (one per module, 18 files)
│   │   │   ├── services/            # Business logic (9 services)
│   │   │   └── utils/               # Helpers (warehouse, JWT, formatting)
│   │   └── prisma/
│   │       ├── schema.prisma        # 41 models, multi-tenant
│   │       ├── seed.ts              # Demo tenant + admin + roles + CoA
│   │       └── seed-test-data.ts    # Zara Bags demo data (20 products, 12 sales)
│   └── web/                          # Next.js 14 frontend
│       └── src/
│           ├── app/                 # App Router pages (40+ pages)
│           ├── components/          # shadcn/ui + custom components
│           └── lib/                 # API client, auth context, helpers
├── docker/
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   ├── worker.Dockerfile
│   └── nginx.conf
├── docker-compose.yml               # Dev stack (postgres, redis, api, web, worker)
├── docker-compose.prod.yml          # Production overrides
└── AGENTS.md                        # AI session instructions
```

---

## Key Architecture Decisions

### Multi-Tenancy
- Every table has a `tenantId` column
- Prisma client extension auto-injects `tenantId` into all queries
- Tenant context extracted from JWT via auth middleware
- PostgreSQL RLS not used — application-level isolation is sufficient

### Authentication
- JWT access tokens (15 min expiry)
- Refresh tokens (7 days, stored in Redis for revocation)
- Bcrypt password hashing (cost=12)
- Account lockout after 5 failed attempts (15 min cooldown)

### Database
- PostgreSQL 16 with Prisma ORM
- 41 models, all multi-tenant
- Migrations via `prisma migrate dev`
- All multi-step operations in `prisma.$transaction`

### Stock (FIFO)
- `StockBatch` model tracks each purchase receipt batch with `unitCost`
- Sales consume from oldest batches first (`receivedAt ASC`)
- Returns restore to the most recent batch (`receivedAt DESC`)
- `warehouse_stock` is a derived aggregate — always kept in sync with batch totals

### Accounting
- Double-entry journal entries for every sale+return transaction
- Account codes centralized in `constants/accounts.ts`
- Journal entries must balance (`totalDebit === totalCredit`)
- Auto-generated during checkout; manual entry via journal entry page

---

## Module Status Summary

> Updated 2026-09-15 after a from-scratch verification: fresh clone + fresh DB (`migrate deploy` 19/19 clean) + cold full suite green (12 passed, exit 0). Replaces the stale June snapshot below. See `FINAL_PARITY_AUDIT.md` for the last full parity pass — findings here are what was literally re-verified.

| Module | Status | Evidence |
|--------|--------|----------|
| Auth | ✅ Verified | login/JWT/RBAC/sessions green in e2e; `user_sessions` rows confirmed live; forced-password + forgot flows pass |
| POS | ✅ Verified | walk-in/empty-cart/overstock green incl. receipt + FIFO stock moves |
| Products | ✅ Verified | detail + costPrice contract green (admin sees, viewer role hidden, API-stripped) |
| Inventory | ✅ Verified | stock transfers green (exact movement + overstock 400) |
| Backups | ✅ Verified | backup → download → validate-wizard green in e2e (after the `tenant_id` migration fix) |
| Accounting | ✅ Present | routes guarded (12 inline RBAC); trial balance/P&L per `FINAL_PARITY_AUDIT.md` (90%) — not functionally re-run |
| Customers | ✅ Present | routes guarded (16 inline RBAC); CRUD per audit docs — not functionally re-run |
| Vendors | ✅ Present | routes guarded (14 inline RBAC); CRUD per audit docs — not functionally re-run |
| Purchases | ✅ Present | routes guarded (14 inline RBAC); receiving/stock/journal per later work — not functionally re-run |
| Reports | ✅ Verified | sales/inventory/stock-valuation return 200 with real non-zero data (e.g. revenue 5500, 44 batches valued); full aggregation service, not stubs |
| Settings | ✅ Verified | PUT → GET round-trip persists (`company_phone` change survived reload; restored after test) |

**Fixed since audit (2026-09-15, all verified with literal output):**
- Tenant isolation enforcement: the Prisma `$extends` auto-scoping hook cannot see `AsyncLocalStorage` context at runtime (proven: `getTenantContext()` returns null inside `$allOperations`; ghost-tenant and real-tenant queries returned identical rows). A live cross-tenant attack pre-fix returned HTTP 200 plus a real restore token for another tenant's backup. Fixed by explicit `tenantId` scoping at every bare-id call site (backup validate/download/restore, POS customer/product reads, role assignment, trial-balance FY filter) plus a 7-test cross-tenant negative suite (`apps/web/e2e/tenant-isolation.spec.ts`, green) and an allowlist CI guard (`npm run check:tenant-scope`). Residual caveat: the extension itself is still blind — enforcement lives at the call sites, and a structural fix (making the extension ALS-safe) was evaluated and deferred as higher-risk than explicit scoping.
- Web typecheck: `e2e/reset-password-suspense.spec.ts` imported `../helpers` instead of `./helpers`; fixed, `tsc --noEmit` clean, spec still green.

**Known issues — pre-launch decisions (open, not resolved):**
- Public QR receipt endpoint (`GET /api/v1/public/receipts/:id` via `publicReceiptHandler`, `sale.routes.ts` ~line 341): bare sequential numeric ID, no auth, exposes customer full name and completed/cancelled sale line items to anyone who walks IDs. Two options, decide before `DEPLOY_PLAN.md` executes: (a) harden with an unguessable token/slug instead of the sequential id, or (b) consciously accept enumerable-PII risk for launch and document why. The `check-tenant-scope` allowlist entry describes current behavior only — it is not an approval.
- Doc hygiene: `FINAL_PARITY_AUDIT.md` disagrees with itself (62% overall in one section, ~88% in another). This table's evidence-graded rows are the source of truth over any single percentage; reconcile or retire the old audit percentages separately.

**Overall:** ✅ all test-covered paths green (12/12 e2e cold, twice consecutively with no reseed); ✅ Reports/Settings functionally confirmed this session.

---

## Essential Commands

### Database
```bash
npx prisma generate --schema=apps/api/prisma/schema.prisma    # Generate client
npx prisma migrate dev --schema=apps/api/prisma/schema.prisma --name <name>  # Create + apply migration
npx prisma studio --schema=apps/api/prisma/schema.prisma       # GUI database browser
```

### TypeScript
```bash
npx tsc --noEmit --project apps/api/tsconfig.json             # Check API types
npx tsc --noEmit                                               # Check web types (from apps/web)
```

### Seed Data
```bash
npx tsx apps/api/prisma/seed-test-data.ts                      # Reseed Zara Bags data
```

### Docker
```bash
docker compose up -d postgres redis                            # Start databases only
docker compose down                                            # Stop all containers
```

---

## See Also
- `AGENTS.md` — Instructions for AI coding sessions
- `SESSION_SUMMARY.md` — Session-by-session progress log
- `PARITY_AUDIT_REPORT.md` — Full feature gap analysis (184 features)
