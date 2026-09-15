#!/usr/bin/env tsx
/**
 * Guard against unscoped cross-tenant reads.
 * The Prisma $extends auto-scoping hook cannot see AsyncLocalStorage
 * context at runtime (proven), so every tenant-scoped model read by raw
 * id MUST carry an explicit tenantId — either in the where clause or via
 * an explicit JS comparison right after the fetch.
 *
 * This scans route/service files for `findUnique({ where: { id ...` calls
 * and fails on any that are not in the reviewed allowlist below. When you
 * add a new bare-id read, either scope it or add a reviewed entry here
 * with the reason it is safe.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

interface AllowEntry {
  file: string; // path relative to apps/api/src, uses forward slashes
  pattern: RegExp; // must match the offending source line
  reason: string;
}

const ALLOWLIST: AllowEntry[] = [
  {
    file: 'routes/auth.routes.ts',
    pattern: /prisma\.user\.findUnique\(\{\s*where:\s*\{\s*id:\s*userId\s*\}/,
    reason: 'own user id taken from verified JWT, not request input',
  },
  {
    file: 'routes/sale.routes.ts',
    pattern: /tx\.customer\.findUnique\(\{\s*where:\s*\{\s*id:\s*sale\.customerId\s*\}/,
    reason: 'customer id comes from a tenant-scoped parent sale row fetched just above',
  },
  {
    file: 'routes/settings.routes.ts',
    pattern: /prisma\.tenant\.findUnique\(\{\s*where:\s*\{\s*id:\s*ctx\.tenantId\s*\}/,
    reason: 'own tenant id taken from verified JWT context',
  },
  {
    file: 'routes/tenant.routes.ts',
    pattern: /prisma\.tenant\.findUnique\(\{\s*where:\s*\{\s*id:\s*BigInt\(req\.user\.tenantId\)\s*\}/,
    reason: 'own tenant id taken from verified JWT',
  },
  {
    file: 'services/auth.service.ts',
    pattern: /prisma\.user\.findUnique\(\{\s*where:\s*\{\s*id:\s*user\.id\s*\}/,
    reason: 'own user re-read immediately after successful login in the same call',
  },
  {
    file: 'utils/scope.ts',
    pattern: /prisma\.user\.findUnique\(\{\s*where:\s*\{\s*id:\s*userId\s*\}/,
    reason: 'userId is always JWT-derived at all 5 call sites (req.user.userId); resolves own scope only',
  },
  {
    file: 'routes/customer.routes.ts',
    pattern: /prisma\.sale\.findMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*saleIds\s*\}/,
    reason: 'saleIds mapped from tenant-scoped ledger rows fetched just above (where has tenantId); safe by inheritance',
  },
  {
    file: 'routes/customer.routes.ts',
    pattern: /prisma\.customerPayment\.findMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*paymentIds\s*\}/,
    reason: 'paymentIds mapped from tenant-scoped ledger rows fetched just above; safe by inheritance',
  },
  {
    file: 'routes/customer.routes.ts',
    pattern: /prisma\.salesReturn\.findMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*returnIds\s*\}/,
    reason: 'returnIds mapped from tenant-scoped ledger rows fetched just above; safe by inheritance',
  },
  {
    file: 'routes/auth.routes.ts',
    pattern: /findFirst\(\{\s*where:\s*\{\s*id:\s*sessionId,\s*userId\s*\}/,
    reason: 'session id always paired with JWT-derived userId; only own sessions resolvable',
  },
  {
    file: 'routes/sale.routes.ts',
    pattern: /findFirst\(\{\s*where:\s*\{\s*id:\s*saleId,\s*status:/,
    reason: 'intentional public no-auth QR receipt endpoint; exposes only receipt-safe fields (no cost data, no PII beyond customer first name). NOTE: numeric ids are enumerable — accepted by design, harden with unguessable tokens if this ever carries sensitive data',
  },
  {
    file: 'services/backup.service.ts',
    pattern: /prisma\.backupRecord\.findUnique\(\{\s*where:\s*\{\s*id:\s*BigInt\(backupId\)\s*\}/,
    reason: 'tenant enforced by explicit record.tenantId !== tenantId comparison right after fetch',
  },
];

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // scripts/ holds manual CLI debug one-offs (rbac-debug*.ts etc.),
      // not HTTP-reachable request code — out of scope for this guard.
      if (!['node_modules', '.git', 'dist', 'scripts'].includes(entry.name)) {
        results.push(...findTsFiles(full));
      }
    } else if (extname(entry.name) === '.ts' && !entry.name.startsWith('check-')) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const srcDir = join(process.cwd(), 'src');
  const stat = (() => { try { return statSync(srcDir).isDirectory(); } catch { return false; } })();
  const root = stat ? srcDir : process.cwd();
  const files = findTsFiles(root);
  const bareId = /findUnique\(\{\s*where:\s*\{\s*id\b/;
  // Widened: the fixes in this area mostly use findFirst (findUnique cannot
  // take a non-unique tenantId), and unscoped bulk writes are the same bug
  // class. Statement-level scan: flag when no tenantId appears in the
  // where window following the call.
  const widened = /(findFirst|updateMany|deleteMany)\(\{\s*where:\s*\{\s*id\b/g;
  const WINDOW = 300;
  let failures = 0;
  const seen = new Set<string>();
  const flag = (rel: string, lineNo: number, snippet: string) => {
    const key = rel + ':' + lineNo;
    if (seen.has(key)) return;
    seen.add(key);
    const allowed = ALLOWLIST.some((a) => rel.endsWith(a.file) && a.pattern.test(snippet));
    if (!allowed) {
      failures++;
      console.log(`❌ FAIL: ${rel}:${lineNo} bare-id query without allowlist entry:\n   ${snippet.trim().slice(0, 160)}`);
    }
  };
  for (const file of files) {
    const rel = relative(join(process.cwd(), 'src'), file).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (bareId.test(line)) flag(rel, i + 1, line);
    });
    let m: RegExpExecArray | null;
    widened.lastIndex = 0;
    while ((m = widened.exec(content)) !== null) {
      const lineNo = content.slice(0, m.index).split('\n').length;
      const window = content.slice(m.index, m.index + WINDOW);
      if (!/tenantId/.test(window)) flag(rel, lineNo, window.replace(/\s+/g, ' '));
    }
  }
  if (failures > 0) {
    console.log(`\n❌ tenant-scope-guard: FAILED (${failures} unreviewed bare-id reads)`);
    process.exit(1);
  }
  console.log('✅ tenant-scope-guard: PASSED (all bare-id reads are reviewed)');
}

main();
