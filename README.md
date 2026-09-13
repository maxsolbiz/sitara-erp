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

| Module | Completion | Key Features |
|--------|-----------|--------------|
| Auth | 90% | Login, register, JWT, RBAC, tenant isolation |
| POS | 75% | Checkout, held sales, returns, discounts, FIFO, balanced JEs, keyboard shortcuts |
| Products | 60% | CRUD, search, categories, detail, edit |
| Customers | 65% | CRUD, search, credit tracking |
| Vendors | 60% | CRUD, search |
| Purchases | 35% | PO create/list/detail. Missing: receiving, stock update, returns |
| Accounting | 65% | CoA, JE, Trial Balance, P&L, Balance Sheet |
| Inventory | 55% | Stock view, movements, warehouses |
| Reports | 5% | All stubs — no real data |
| Settings | 15% | UI only, no persistence |
| **Overall** | **39%** | See `PARITY_AUDIT_REPORT.md` for full gap analysis |

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
