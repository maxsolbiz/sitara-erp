# AGENTS.md — Instructions for OpenCode Sessions

This file is for AI coding assistants (OpenCode). It provides architecture context, coding rules, and session state so new sessions can resume work immediately without reading the full codebase.

---

## Project Identity

- **Name:** Sitara ERP (Node.js SaaS port)
- **Path:** `D:\SasS`
- **Original PHP app:** `C:\xampp\htdocs\sitara`
- **Goal:** Multi-tenant SaaS ERP for Pakistani SMBs (originally purses/bags retail)
- **Stack:** Express.js + TypeScript + Prisma + PostgreSQL 16 + Next.js 14 + Tailwind CSS + shadcn/ui

---

## Project Structure

```
D:\SasS/
├── apps/api/src/
│   ├── routes/           # Express route files (18 files, one per module)
│   ├── services/         # Business logic (9 services)
│   ├── middleware/        # auth, tenant, rbac, rateLimit, validate, errorHandler
│   ├── lib/              # prisma.ts, redis.ts, queue.ts
│   ├── config/           # index.ts (env-based config)
│   └── constants/        # accounts.ts (ACCOUNT_CODES)
├── apps/web/src/app/     # Next.js 14 App Router pages (40+ pages)
└── apps/api/prisma/      # schema.prisma (41 models), seeds
```

**Docker:** PostgreSQL on port 5435, Redis on port 6380

---

## CRITICAL — Architecture Rules

### 1. No Hardcoded IDs
- `createdBy` must always use `req.user ? BigInt(req.user.userId) : throw`
- `warehouseId` must use `getDefaultWarehouse(tenantId, tx)` from `utils/warehouse.ts`
- Never use literal `1` for any entity ID (customer, product, warehouse, user)

### 2. No Hardcoded Account Codes
- All account code strings in business logic must use `ACCOUNT_CODES` from `constants/accounts.ts`
- Account ID lookup: `chartOfAccount.findUnique({ where: { tenantId_accountCode: ... } })`
- Supported codes: `SALES_REVENUE (4000)`, `SALES_RETURNS (4100)`, `ACCOUNTS_PAYABLE (2000)`,

### 3. All Multi-Step DB Ops in Transactions
- Use `prisma.$transaction(async (tx) => { ... })` for any operation that touches >1 table
- This includes: checkout, purchase receiving, expense approval, sale cancellation

### 4. Journal Entries Must Balance
- Always compute `totalDebit` and `totalCredit` and verify equality before committing
- Throw with message if unbalanced: `throw new Error('Journal entry not balanced: Dr X != Cr Y')`
- Account lookup must be inside the transaction (`tx.chartOfAccount.findUnique`)

### 5. FIFO Stock — Consumption Order
- **Sale (consume):** oldest batches first (`receivedAt ASC`, `quantityRemaining > 0`)  
- **Return (restore):** most recent batch first (`receivedAt DESC`, no `gt: 0` filter)  
- Always decrement both `warehouse_stock` AND `stockBatch.quantityRemaining` in sync
- Validate stock availability before creating the sale record

---

## Current Session State

### Last Session Date: 2026-09-19
### C-A2b restore matrix: COMPLETE (all 10 tests + 2 gap tests PASS, prod clean)
- Commit `bd6845c` (tenant-scoped transactional restore) + `32f15fb` (junction deletes via parent scope) deployed; health `ok`
- T1 happy-path, T2 adversarial child-first order, T3 self-lockout+login, T4 sequence health, T5 mid-restore fail-loud + byte-identical rollback, T6 no-swallow grep, T7/T8 pre-flight gates, T9 record-scope + payload `Backup tenant mismatch`, T10 auto-snapshot discoverable
- Prod verified clean: `backup_records=0`, no `p2rst` tenants/users, `/storage/backups/` empty, tenant 1 untouched, PM2 all online
- Test-harness lessons: use `sql1()` sanitizer (` | grep -E '^[0-9]+$'`) for INSERT...RETURNING captures (psql prints `INSERT 0 1` tag); service API is `authService.registerTenant(name,slug,email,pass,adminName)` positional + free fns `createBackup/requestRestoreToken/executeRestore`; pass IDs via `process.argv` with fully-quoted heredocs; wrap every `npx tsx` in `timeout 150`
- Unexplained single `t3login` tsx hang (epoll, 17 min, killed); login path verified functional before/after — treated as transient, timeout guards now standard
- Redis scare resolved: `-u` URL-parse quirk only; `-a` PONG ok, 0 app connection errors — no outage, no rotation issue
- Process lesson: hotfix was committed before diff review — standing rule is diff-before-COMMIT, not just diff-before-deploy; tighten on next hotfix
- `ca2b-matrix.sh` T5 uses `tail -n 4` which truncates Prisma multi-line errors before the `T5ERR=` marker (false FAIL; re-proven via Gap B) — fix truncation before trusting a clean run if restore code is touched again
- Backup payload shape: `payload.data[modelName] = Array` (dict keyed by model, NOT a list of `{model, rows}`)

### Modules Built (prior sessions):
- POS checkout: FIFO batch consumption, balanced journal entries, dynamic warehouse lookup
- Sales returns: embedded returns now visible in menu, `EMBEDDED`/`STANDALONE` type badges
- Fixed ~112 hardcoded values (P0 items: createdBy, warehouseId, account codes)
- Reverted test sales 17, 33; patched unbalanced JE for F52108
- Seeded Zara Bags & Accessories demo data (20 products, 12 sales, 3 POs)
- Created AGENTS.md / README.md / SESSION_SUMMARY.md

### Files Changed This Session:
- `apps/api/src/routes/pos.routes.ts`
- `apps/api/src/routes/sales-returns.routes.ts`
- `apps/api/src/constants/accounts.ts`
- `apps/api/src/utils/warehouse.ts` (new)
- `apps/web/src/app/(dashboard)/sales/returns/page.tsx`

### Known P0 Issues (not yet fixed):
1. Normal sales (no return items) do NOT create journal entries — all sales should
2. Reports module: all 13 report endpoints return stubs with zeros
3. Purchase receiving: no stock update, no auto-journal
4. RBAC enforcement: only applied to product and customer mutations; most routes unprotected

---

## DO NOT

- Do NOT hardcode IDs (warehouseId=1, createdBy=1, productId=1, accountId=13)
- Do NOT use account code strings like `'4100'` directly — use `ACCOUNT_CODES.SALES_RETURNS`
- Do NOT create a revert script without a `DRY_RUN=true` mode
- Do NOT commit a revert script — delete it after execution
- Do NOT modify files outside `apps/api/src/` or `apps/web/src/` unless necessary for configuration
- Do NOT modify `config/index.ts` fallback credentials — they are `.env` fallbacks for development
- Do NOT create new tenants during development — reuse the `demo` tenant (slug: `demo`)

---

## Common File Locations

| What | Where |
|------|-------|
| Database schema | `apps/api/prisma/schema.prisma` |
| Route registration | `apps/api/src/routes/index.ts` |
| Account code constants | `apps/api/src/constants/accounts.ts` |
| Warehouse lookup helper | `apps/api/src/utils/warehouse.ts` |
| JWT helpers | `apps/api/src/utils/helpers.ts` |
| Prisma client + tenant extension | `apps/api/src/lib/prisma.ts` |
| Auth middleware (JWT) | `apps/api/src/middleware/auth.ts` |
| RBAC middleware | `apps/api/src/middleware/rbac.ts` |
| Tenant middleware | `apps/api/src/middleware/tenant.ts` |
| Frontend API client | `apps/web/src/lib/api.ts` |
| Frontend auth context | `apps/web/src/lib/auth.tsx` |
| Dashboard layout + sidebar | `apps/web/src/app/(dashboard)/layout.tsx` |
| Reusable DataTable | `apps/web/src/components/data-table.tsx` |

---

## Next Priority (for the next session)

| Priority | Module | Task | File |
|----------|--------|------|------|
| P0 | POS/Checkout | Add journal entry creation for normal sales (no returns) | `pos.routes.ts` |
| P0 | Purchases | Purchase receiving with stock update + auto-journal | `purchase.routes.ts` |
| P0 | Reports | Sales/Inventory/Purchase reports with real data | `report.routes.ts` |
| P0 | RBAC | Route-level permission enforcement across all modules | All route files |
| P1 | POS | Multi-warehouse selection in checkout | `pos.routes.ts`, `pos/page.tsx` |
| P1 | POS | Pricing tiers with discount | `pos.routes.ts` |
| P1 | Sales | Cancel sale with full reversal | `sale.routes.ts` |
| P1 | Settings | Persist settings to database | `settings.routes.ts` |
