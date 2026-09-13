import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Full-suite orchestrator. Runs test-setup.ts first, then every suite in
 * sequence, re-running setup before pos-test.ts (sales-test/purchase-test
 * mutate stock mid-suite, which would otherwise cause phantom POS failures).
 * Prints a final summary table; exits non-zero if any suite failed.
 * Pure orchestration — does not change any test file's logic.
 */
const ROOT = process.cwd();
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const SUITES = [
  'auth-test',
  'accounting-test',
  'sales-test',
  'purchase-test',
  'reports-test',
  'settings-test',
  'notification-test',
  'id-validation-test',
  'customer-test',
  'product-test',
  'pos-test',
  'public-test',
];

function run(file: string): { pass: number; fail: number; crashed: boolean } {
  const out = execFileSync(process.execPath, [TSX_CLI, `apps/api/scripts/${file}.ts`], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 300000,
  } as any) as unknown as string;
  const pass = (out.match(/\[PASS\]/g) || []).length;
  const fail = (out.match(/\[FAIL\]/g) || []).length;
  return { pass, fail, crashed: false };
}

function setup() {
  execFileSync(process.execPath, [TSX_CLI, 'apps/api/scripts/test-setup.ts'], {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300000,
  } as any);
  console.log('(reseeded test data)');
}

function main() {
  console.log('=== Full Suite ===\n');
  const rows: { file: string; pass: number; fail: number; note: string }[] = [];
  let failed = false;

  for (const s of SUITES) {
    // pos-test asserts absolute stock levels — always start it from a fresh seed.
    if (s === 'auth-test' || s === 'pos-test') setup();
    try {
      const r = run(s);
      const note = r.fail > 0 ? 'FAILURES' : 'ok';
      rows.push({ file: s, pass: r.pass, fail: r.fail, note });
      console.log(`${s}: PASS=${r.pass} FAIL=${r.fail} ${note}`);
      if (r.fail > 0) failed = true;
    } catch (e: any) {
      const out: string = (e.stdout || '') as string;
      const pass = (out.match(/\[PASS\]/g) || []).length;
      const fail = (out.match(/\[FAIL\]/g) || []).length;
      rows.push({ file: s, pass, fail, note: 'CRASH/EXIT!=0' });
      console.log(`${s}: PASS=${pass} FAIL=${fail} CRASH/EXIT!=0`);
      failed = true;
    }
  }

  console.log('\n--- Summary ---');
  for (const r of rows) console.log(`${r.file} | pass=${r.pass} | fail=${r.fail} | ${r.note}`);
  process.exit(failed ? 1 : 0);
}

main();
