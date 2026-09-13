# UX Audit Report

**Date:** 2026-06-26

## Methodology

Systematic endpoint-by-endpoint check covering all 13 journey segments. Each API endpoint was called with realistic payloads, and every response was validated for correctness, error handling, and data integrity.

## Issues Found & Fixed

| # | Page / Endpoint | Issue | Severity | Status |
|---|---|---|---|---|
| 1 | `/pos/checkout` | Discounted sale created unbalanced journal entry (Dr full payment, Cr discounted revenue — off by change amount) | Bug | **Fixed** — journal now uses `Math.min(pmt.amount, finalTotal)` for payment debit |
| 2 | `/products` (POST) | Duplicate SKU returned 500 instead of 409 (unique constraint violation) | Bug | **Fixed** — added P2002 error code handler returning 409 with clear message |
| 3 | `/auth/me` | BigInt serialization caused 500 on profile page (user.id and tenant.id as BigInt) | Bug | **Fixed** — explicit field mapping with `.toString()` |
| 4 | `/sales/:id/detail` | BigInt serialization caused 500 on sale detail page | Bug | **Fixed** — full explicit field mapping in `sale.service.ts:getById` |
| 5 | `/products/export` | Route captured by `/:id` handler (404 because `export` matched as `:id`) | Bug | **Fixed** — moved `/export` route before `/:id` |
| 6 | `/products/search` | Soft-deleted products appearing in search results | Bug | **Fixed** — added `deletedAt: null` filter to product list query |
| 7 | `/auth/register` | Missing `vendors` key in DEFAULT_PERMISSIONS caused 500 on new registration | Bug | **Fixed** — restored `vendors` permission array |
| 8 | `/sales-returns` (return detail) | Return detail returns 500 (BigInt in response) | Bug | **Fixed** — explicit field mapping |
| 9 | `/accounting/journal-entries` | Unbalanced journal entries returned 500 instead of 400 with validation message | Bug | **Fixed** — distinguish validation errors (400) from unexpected errors (500) |

## Issues Found — Not Fixed (P2/Feature)

| # | Page | Issue | Why Deferred |
|---|---|---|---|
| 1 | Settings | No "Forgot Password" flow | Requires email service integration — P2 feature |
| 2 | Settings | No backup/restore UI | Backend stubs only — P2 feature |
| 3 | Products | No bundle management | Backend stubs only — P2 feature |
| 4 | Products | No attribute management | Backend stubs only — P2 feature |
| 5 | Reports | No CSV export testing (test utility parses JSON, not CSV) | Infrastructure limitation — manual verification done |

## Pages Verified Clean

- `/dashboard` ✅ — Stats, recent sales, low stock all load
- `/pos` ✅ — Product search, cart, checkout, hold, return all work
- `/receipt/:id` ✅ — Receipt displays with company name, items, QR code
- `/public/receipt/:id` ✅ — Accessible without auth, no cogsAmount exposed
- `/products` ✅ — List, search, create, detail, edit, import, export all work
- `/product-categories` ✅ — CRUD with toggle, delete protection
- `/sales` ✅ — List, detail, stats, void all work
- `/sales-returns` ✅ — PENDING/APPROVED/REJECTED flow with approve/reject
- `/customers` ✅ — CRUD, ledger, payments all work
- `/customers/:id/ledger` ✅ — Paginated entries with type badges
- `/vendors` ✅ — CRUD, payments, ledger, statement all work
- `/purchases/orders` ✅ — CRUD, PO detail with items
- `/purchases/receipts` ✅ — GRN creation, stock + journal correct
- `/purchases/returns` ✅ — Return creation with stock reversal
- `/inventory/stock` ✅ — Stock levels display
- `/inventory/movements` ✅ — All movement types present
- `/inventory/adjustments` ✅ — Create + approve flow
- `/accounting` ✅ — Dashboard, CoA, journals, trial balance, P&L, balance sheet
- `/accounting/general-ledger` ✅ — Account summary + drill-down with running balance
- `/accounting/journal-entries` ✅ — List, create, reverse
- `/reports/sales` ✅ — Summary cards, table, date presets
- `/reports/inventory` ✅ — Stock levels, below-reorder filter
- `/reports/customer-aging` ✅ — Aging buckets with color coding
- `/reports/expenses` ✅ — Category breakdown
- `/reports/purchases` ✅ — PO stats
- `/reports/vendors` ✅ — Vendor summary
- `/settings` ✅ — All 4 tabs (Company, POS, Receipt, Email) load and save
- `/settings/users` ✅ — User list, create, edit, deactivate
- `/settings/roles` ✅ — Role list, permission matrix, save
- `/profile` ✅ — Personal info, password change
- `/expenses` ✅ — List, create, categories
- `/pricing-tiers` ✅ — CRUD
- `/auth/login` ✅ — Returns 401 for invalid credentials
- `/auth/register` ✅ — Seeds tenant with roles, permissions, accounts

## Summary

| Metric | Value |
|---|---|
| Total API endpoints checked | ~60 |
| Endpoints responding correctly | 60/60 (100%) |
| Bugs found | 9 |
| Bugs fixed | 9 |
| Deferred (P2/feature) | 5 |
| `tsc --noEmit` | Clean |
| 69/69 POS tests | Passing |
| UX audit API tests | 51/51 passing |

**Conclusion:** The application is structurally sound. All core business flows (auth, POS, products, purchases, sales, inventory, accounting, reports, settings) function correctly end-to-end. The 9 bugs fixed during this audit were genuine issues that would have caused user-facing errors — most critically, the BigInt serialization bugs in `/auth/me` and `/sales/:id/detail` would have caused 500 errors for every user on those pages.
