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

### C-B1 middleware hardening + CORS: COMPLETE (commit `edb33a3`, deployed, 19/19 tests PASS)
- `tenant.ts`: port-strip (incl. IPv6-bracket edge), lowercase, `TENANT_SLUG_PATTERN` + `isReservedTenantSlug` (37) replace hardcoded 4-list, explicit `!req.user` 401 guard (defense-in-depth; `{...undefined}` never crashed, it made malformed shape)
- `index.ts`: static 2-origin allowlist → validated `https://*.sitarapurse.com` reflection (leading-dot suffix + LDH label check); no-Origin → allow; dev `*` untouched; apex correctly rejected
- Nested `a.b` hosts resolve by first label by design (DNS wildcard routes single-level only); unknown labels 404 at lookup layer, never CORS layer
- Deploy notes: `deploy-sitara.ps1` preflight has a Windows→ssh quoting bug (`grep -E "sitara-(...)"` parens) — deploy by running its steps via base64-wrapped remote script; VPS `M package-lock.json` was npm `"peer": true` churn, safe to `git checkout --` before pull
- Deploy-script fix COMPLETE: `deploy-sitara.ps1` preflight now via `Invoke-RemoteScript` (base64; single-quoted concat so `$` survives) + health-gate pattern fixed `status....ok`→`status...ok` (4 dots never matched the body; 3 dots do). Mangler characterized: old path strips ONLY `"` chars. CAUTION: historical `HEALTH_OK` lines predate this fix and came via ad-hoc workaround scripts, not this file — do not cite them as proof this script worked on date X. `.sh` counterpart runs on-box natively, never had the bug.
- FAST-FOLLOW next time `deploy-sitara.ps1` is touched: health gate uses `status...ok` (3-dot, coincidental match on current JSON shape) — swap for quoted-literal `'"status":"ok"'` or a real JSON parse (`jq`/python); the base64 transport now carries quotes safely, so the original reason for avoiding it is gone.
- Build #2 carry-over: Apache `ServerAlias *.sitarapurse.com` is a glob and MATCHES multi-level (`a.b...`) unlike DNS wildcards — after vhost goes live, probe a multi-level Host explicitly and confirm first-label behavior is acceptable; do not assume DNS single-level semantics transfer to Apache
- Build #2 status (2026-09-19): S1 `.cloudflare.ini` 600 + CRLF fix, S2 wildcard A (id `9049cc30...`, 14 records, SSL `full`), S3 `sitarapurse-wildcard` cert (serial `0529AA...`, exp 2026-12-18, app cert untouched), S4 wildcard vhost live + rollback-tested (default unchanged, app/api keep original cert), S5 E2E green (prod HTTP registration is DISABLED — fixtures via service only; join table is `role_user` singular)
- TODO to close Build #2: S6 token rotation (verify `renew --dry-run` on NEW token before revoking old) + Apache guard rejecting multi-label Hosts in wildcard vhost (anti-phishing hygiene, non-blocking)
- Build #2 CLOSED 2026-09-19: S6 rotation done (new token placed via stdin-pipe, `renew --dry-run` green BEFORE old revoked; local↔live SHA256 match, `.old-backup` removed, post-rotation api/web/wildcard all 200). Remaining non-blocking follow-up: Apache multi-label Host guard in wildcard vhost.
- NOTE: prod HTTP registration is DISABLED (`403 Public registration is disabled`) — S5 fixtures went via service layer; if self-registration is ever enabled, re-verify reserved-slug rejection + subdomain E2E through the real HTTP endpoint before flipping the flag (untested path)

### Log-on-500 class-(c) closeout: COMMITTED as `841764c`, deployed [UNVERIFIED-vs-git: test/session claims below from harness output, not in git]
- Reconstructed (inference, not on record anywhere): catches returning 200-with-fallback that B1-B4 couldn't mechanically fix; zero unlogged-500 sites found by leg-split grep [UNVERIFIED-vs-git: session grep output only, not in git]
- Phase 1: 82 added lines containing logger.warn, 0 removed (841764c: 98 ins / 79 del over 28 files) - net-new call sites [git-verifiable]; responses byte-identical [UNVERIFIED-vs-git]; (a): backup config lie → honest 500, retention cleanup → warn+continue, export per-model skips → fail-loud (C-A2b-compatible: createBackup marks failed+rethrows, snapshot failure aborts pre-transaction); (c): intent comments on fail-closed/permit-default swallows
- Harness lessons: `wcount` via `grep -c || echo 0` double-prints (`grep -c` already prints 0) — use capture-then-default; `tail -n 4` truncates Prisma errors (known); tsx-process logger output goes to stdout, NOT the PM2 log file (grep the harness output, not /var/log); join table is `role_user` singular; throwaway-tenant cleanup order documented in cc-tests runs
- Prod HTTP registration disabled noted above; test-4 failure branch + print-receipt route catches verified by code (unreachable live without DB fault — router.param guards 400 malformed ids, NaN query params absorbed)
- ASTERISK carried forward: A1 (`backup.routes.ts:117` honest-500 fix) verified by code-review/analogy only — its failure branch was never observed firing live. If that endpoint is touched again, re-prove it; do not cite this pass as proof.

### Validate-manager hardening + multi-role UI: COMPLETE (commit `5f8739a`, deployed [UNVERIFIED-vs-git: commit touches 3 code files only; deploy/health/tests from session output])
- validate-manager was NEVER unauthenticated (mount-level auth+tenant in `routes/index.ts:45`); audit flag was declaration-level only. Real fixes: login-grade limiter (5/15min), 403→401 oracle close, wrong-password increments shared loginAttempts. Checkout re-verifies creds independently — endpoint grants no capability alone
- Roles: schema is many-to-many (`role_user`); UI was single-select + hardcoded admin-filter + first-role-only preselect (editing multi-role user silently stripped extras). Now checkbox multi-select, all roles listed, admin locked-on for last-admin via existing `isLastAdmin`. No prod incident ever occurred (0 multi-role users, 0 role-change history)
- Harness note: tripping the `auth:*` limiter from localhost only affects server-originated bursts [SUPERSEDED: was "real users key by their own IP" — through Cloudflare, req.ip is the edge address (observed `auth:172.68.x.x`); see follow-up (3)]; bursts show mixed 401/429 sequencing — throttle engages, exact pattern has an unexplained nuance, no security impact
- Open question if `rateLimit.ts` is ever revisited: confirm fixed-vs-sliding window algorithm to explain non-monotonic 401/429 interleaving under burst (request passing just past a window boundary would explain it; security conclusion holds either way)

### Route-UI orphan audit: COMPLETE (read-only) + expense modal BUILT (commit `c2950c8`, deployed [UNVERIFIED-vs-git: commit touches expenses/page.tsx only; tests from session output])
- 37 orphan backend routes catalogued [UNVERIFIED-vs-git: audit table from session grep output, not in git]; audit grep-pattern lesson: raw `fetch()` + generic `handleSave(category)` indirection evade literal `apiPost('...')` searches — `PUT /settings/hardware` + `POST /settings/logos/:slot` were FALSE orphans (both wired), caught on re-check before building. Always re-verify orphans for indirect call sites before acting
- Expense `POST /` was the one true trivial gap (dead button, 30-line page) → create modal following categories-page pattern; live-tested (validation 400 parity, 201+persist+list) [UNVERIFIED-vs-git: test output from session only]. PUT/DELETE expense endpoints remain orphaned by scope decision

### Moderate tier Item 1: UI-proven a–d; permission-gate evidence per step 4 (commit `1e4d8ca`, deployed)
- `vendors/[id]/edit` did NOT exist while TWO links pointed at it (detail button + list row action) — dead links, fixed by creating the page (customers-edit mirror); no entry-point change needed. UI evidence via Playwright (`D:\SasS-uitest\`, outside repo): first run 27 PASS lines counted from output (that script had no tally), gate run PASSED 15/15 — create-via-UI → row-Edit click → 8-field prefill → save (PUT body + toast captured) → redirect → reopen match → not-found states with zero PUTs → view-only user: form renders, submit → 403 toast, URL stays, row untouched → no-view user sees no Edit affordances; screenshots in uitest/shots
- Verified before writing: no shared form, PUT passes body straight through (`vendorService.update` 68-73, no whitelist — REPORTED gap, unfixed), `GET /:id` returns `mapVendor` shape for prefill
- `''`-vs-NULL proven live with IS NULL/= '' checks (NOT bare psql print): create stores NULL (`|| null` code), edit stores `''` (customers-edit convention). No unique on optional Vendor cols (only `@@unique([tenantId, code])`) so harmless here
- PUT returns 200 `Updated` on zero-row match — proven live with TWO throwaway tenants (B PUT on A's vendor: md5 + updated_at identical after). Edit page can't hit it (GET guard precedes PUT)
- Gap #1 severity PROVEN live (A4 probe, throwaway tenant): PUT `{"currentBalance":12345,"isActive":false}` applied both — balance overwritten with no ledger entry, vendor deactivated. Priority follow-up; Item 1 doesn't worsen it (UI sends 8 fields only)
- Save-button gate: customers-edit does NOT gate submit (hasPermission only on credit-limit/pricing fields) — vendors page matches reference, no diff needed. Record corrected (was claimed gated)
- Item 1.5 mechanical sweep DONE (redone TWICE: first pass missed single-quoted object literals, second added backtick nav forms — nav 20→29): 92 routes, 152 extracted targets, 84 unique, 83 matched, 1 unmatched (forms lit=41 obj=59 tpl=23 nav=29). Sole dead static link: `sales/page.tsx:38` → `/sales/returns/create/:id` (page reads `?saleId=`; likely one-line fix, logged as Item 1.6, unfixed). Backend-generated links (search `link:`, notification `link:`) all resolve. Query-param deep-links (`/expenses?status=`, `/sales/returns?status=`) land on pages that IGNORE the param (client-side filter only) — cosmetic wrinkle, noted
- UI-test lesson: browser runs share egress IPs — 4 logins in ~10 min tripped the `auth:*` 5/15min limiter mid-run (session died → login page). Budget ≤3 logins per 15-min window per run, or expect 429s; a 10-min wait clears it. Session-death mechanism (code-read, REPORTED unfixed): throttled `/auth/refresh` → `!res.ok` → `clearTokens()` → `logout()` redirect — `lib/api.ts` has no 429 branch. Screenshots + request log + console capture per step proved invaluable (caught strict-mode, label-binding, and session-death issues visibly)
- REPORTED-unfixed follow-ups (priority order): (1) vendor PUT mass assignment — OBSERVED live (`currentBalance`+`isActive` overwritten, no ledger) — pre-go-live blocker; (2) PUT 200-on-zero-row-match — OBSERVED live (md5-identical); (3) login limiter 5/15min keyed auth:<req.ip>; general limiter 30/min keyed ratelimit:<req.ip> (rateLimit.ts:16-22, :27-29, :71-75; index.ts:42 sets trust proxy 'loopback' [CODE-VERIFIED]. index.ts:92 global mount; INFERRED, NOT MEASURED: whether unrelated users sharing one edge address share buckets is unknown. Fix directions (own item, report-only): trust CF ranges / CF-Connecting-IP allow-list, key authed routes by user/tenant, revisit 30/min, add 429 branch to lib/api; (4) lib/api.ts half CODE-VERIFIED (refresh !res.ok -> clearTokens; 401 path -> logout(); no 429 branch). (5) vendors: OBSERVED live; customers-edit: CODE-VERIFIED (inferred from lines 75-100, ungated submit), not observed; (6) sales list Return link and New Return button render without sales.returns.create while backend POST /sales-returns requires it (sales-returns.routes.ts:152) - same class as (5); (7) approve reuses the create slug for purchases.returns (purchase.routes.ts:260 create / :360 approve) and inventory.adjustments (inventory.routes.ts:70 create / :104 approve), unlike sales.returns.approve - segregation-of-duties gap; (8) return-logs.routes.ts:9,21,33 carry no route-level rbac - gap, mount-level gating not yet checked (Item 6); (9) settings.routes.ts registers GET/PUT /:category before the specific paths - ordering hazard, fall-through behavior not yet read

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
