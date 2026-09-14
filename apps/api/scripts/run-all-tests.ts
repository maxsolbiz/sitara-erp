import { execFileSync, spawn, ChildProcess } from 'child_process';
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
  'activity-helper-test',
  // Need a live API server (hit localhost:3000 concurrently); the
  // orchestrator starts/stops it automatically — see runWithLiveServer.
  // Depends on seeded users (admin@demo.com, manager@test.com).
  'tenant-isolation-test',
  // Same live-server requirement (login/terminate/refresh flows).
  'session-tracking-test',
  // Same live-server requirement (performs real mutations, then reads back).
  'activity-log-test',
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

async function waitForPort(url: string, tries = 40): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status < 500) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/** Start a live API server; caller must stop it via the returned handle. */
async function startLiveServer(): Promise<ChildProcess> {
  const proc: ChildProcess = spawn(
    process.execPath,
    [TSX_CLI, '--env-file=.env', 'apps/api/src/index.ts'],
    { cwd: ROOT, stdio: 'ignore', detached: false }
  );
  const up = await waitForPort('http://localhost:3000/api/v1/health');
  if (!up) {
    proc.kill();
    throw new Error('live API server did not start');
  }
  return proc;
}

async function main() {
  console.log('=== Full Suite ===\n');
  const rows: { file: string; pass: number; fail: number; note: string }[] = [];
  let failed = false;
  let liveServer: ChildProcess | null = null;

  const runOne = (s: string) => {
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
  };

  for (const s of SUITES) {
    // pos-test asserts absolute stock levels — always start it from a fresh seed.
    if (s === 'auth-test' || s === 'pos-test') setup();
    if (s === 'tenant-isolation-test' || s === 'session-tracking-test' || s === 'activity-log-test') {
      if (!liveServer) {
        console.log('(starting live API server for live-server tests)');
        liveServer = await startLiveServer();
      }
      runOne(s);
      continue;
    }
    runOne(s);
  }

  console.log('\n--- Summary ---');
  for (const r of rows) console.log(`${r.file} | pass=${r.pass} | fail=${r.fail} | ${r.note}`);
  if (liveServer) liveServer.kill();
  process.exit(failed ? 1 : 0);
}

main();
