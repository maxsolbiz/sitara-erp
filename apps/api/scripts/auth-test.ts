import { prisma, setup, teardown, api, pass, fail, hasFailures, tenantId, authToken } from './test-util';

async function main() {
  await setup(); console.log('\n=== Auth & User Tests ===\n');

  // A1: Register new tenant
  let tid = ''; let refToken = '';
  try {
    const r = await api('POST', '/api/v1/auth/register', { tenantName: `E2ETest-${Date.now()}`, slug: `e2e-${Date.now()}`, email: `e2e-${Date.now()}@test.com`, password: 'password123', fullName: 'Test User' });
    if (r.status === 201) { pass('A1: Register'); tid = r.body?.data?.tenantId; refToken = r.body?.data?.refreshToken; }
    else fail('A1: Register', `Status ${r.status}`);
    const tenants = await prisma.tenant.count({ where: { id: BigInt(tid || '0') } });
    if (tenants > 0) pass('A1: Tenant exists'); else fail('A1: Tenant exists', 'Not found');
    const roles = await prisma.role.count({ where: { tenantId: BigInt(tid || '0') } });
    if (roles >= 4) pass(`A1: ${roles} roles seeded`); else fail('A1: Roles', `Got ${roles}`);
    const perms = await prisma.permission.count({ where: { tenantId: BigInt(tid || '0') } });
    if (perms >= 10) pass(`A1: ${perms} permissions seeded`); else fail('A1: Permissions', `Got ${perms}`);
    const accts = await prisma.chartOfAccount.count({ where: { tenantId: BigInt(tid || '0') } });
    if (accts >= 15) pass(`A1: ${accts} accounts seeded`); else fail('A1: Accounts', `Got ${accts}`);
  } catch (e: any) { fail('A1', e.message); }
  await prisma.tenant.deleteMany({ where: { slug: { contains: 'e2e-' } } }).catch(() => {});

  // A2: Login correct
  try {
    const r = await api('POST', '/api/v1/auth/login', { email: `e2e-login@test.com`, password: 'password123' });
    // use test tenant's user — the manager user
    const r2 = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'manager123' });
    if (r2.status === 200 && r2.body?.data?.accessToken) pass('A2: Login'), refToken = r2.body.data.refreshToken; else fail('A2: Login', `Status ${r2.status}`);
  } catch (e: any) { fail('A2', e.message); }

  // A3: Login wrong password
  try { const r = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'wrongpass' }); if (r.status === 401) pass('A3: Wrong password'); else fail('A3', `Status ${r.status}`); } catch (e: any) { fail('A3', e.message); }

  // A4: Login non-existent
  try { const r = await api('POST', '/api/v1/auth/login', { email: 'noone@test.com', password: 'x' }); if (r.status === 401) pass('A4: No user'); else fail('A4', `Status ${r.status}`); } catch (e: any) { fail('A4', e.message); }

  // A5: Refresh token
  try {
    const login = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'manager123' });
    if (login.body?.data?.refreshToken) {
      const r = await api('POST', '/api/v1/auth/refresh', { refreshToken: login.body.data.refreshToken });
      if (r.status === 200 && r.body?.data?.accessToken) pass('A5: Refresh'); else fail('A5', `Status ${r.status}`);
    } else fail('A5', 'No refresh token from login');
  } catch (e: any) { fail('A5', e.message); }

  // A6: Get current user
  try { const r = await api('GET', '/api/v1/auth/me'); if (r.status === 200 && r.body?.data?.fullName) pass('A6: Get me'); else fail('A6', `Status ${r.status}`); } catch (e: any) { fail('A6', e.message); }

  // A7: Logout
  try {
    const login = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'manager123' });
    const tk = login.body?.data?.accessToken; const rt = login.body?.data?.refreshToken;
    if (tk) {
      const r = await api('POST', '/api/v1/auth/logout', {}, tk);
      if (r.status === 200) pass('A7: Logout'); else fail('A7: Logout', `Status ${r.status}`);
      if (rt) { const r2 = await api('POST', '/api/v1/auth/refresh', { refreshToken: rt }); if (r2.status === 401) pass('A7: Refresh invalidated'); else fail('A7: Refresh not invalidated', `Status ${r2.status}`); }
    }
  } catch (e: any) { fail('A7', e.message); }

  // B1: Update profile
  try {
    const r = await api('PUT', '/api/v1/auth/profile', { fullName: 'Updated Name', email: 'updated@test.com' });
    if (r.status === 200) pass('B1: Profile updated'); else fail('B1', `Status ${r.status}`);
    const me = await api('GET', '/api/v1/auth/me');
    if (me.body?.data?.fullName === 'Updated Name') pass('B1: Name reflected'); else fail('B1: Name reflected', `Got ${me.body?.data?.fullName}`);
  } catch (e: any) { fail('B1', e.message); }
  // Restore
  await api('PUT', '/api/v1/auth/profile', { fullName: 'Test Manager', email: 'manager@test.com' });

  // B2: Change password
  try {
    const r = await api('PUT', '/api/v1/auth/password', { currentPassword: 'manager123', newPassword: 'newpass123' });
    if (r.status === 200) pass('B2: Password changed'); else fail('B2', `Status ${r.status}`);
    const oldLogin = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'manager123' });
    if (oldLogin.status === 401) pass('B2: Old password rejected'); else fail('B2: Old password still works', `Status ${oldLogin.status}`);
    const newLogin = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'newpass123' });
    if (newLogin.status === 200) pass('B2: New password accepted'); else fail('B2: New password rejected', `Status ${newLogin.status}`);
    // Restore password
    await api('PUT', '/api/v1/auth/password', { currentPassword: 'newpass123', newPassword: 'manager123' });
  } catch (e: any) { fail('B2', e.message); }

  // B3: Wrong current password
  try { const r = await api('PUT', '/api/v1/auth/password', { currentPassword: 'wrong', newPassword: 'newpass123' }); if (r.status === 400) pass('B3: Wrong current'); else fail('B3', `Status ${r.status}`); } catch (e: any) { fail('B3', e.message); }

  // B4: Duplicate email — skip since we only have one user in test tenant

  // C1: List users
  try { const r = await api('GET', '/api/v1/users'); if (r.status === 200 && r.body?.data?.length >= 1) pass('C1: List users'); else fail('C1', `Status ${r.status}`); } catch (e: any) { fail('C1', e.message); }

  // C2: Create user
  let newUserId = '';
  try {
    const roles = await api('GET', '/api/v1/rbac/roles');
    const cashierRoleId = roles.body?.data?.find((r: any) => r.slug === 'cashier')?.id;
    const r = await api('POST', '/api/v1/users', { username: 'testnew', email: 'new@test.com', password: 'password123', fullName: 'New User', roleId: cashierRoleId || '' });
    if (r.status === 201) { pass('C2: User created'); newUserId = r.body?.data?.id; } else fail('C2', `Status ${r.status}`);
    const list = await api('GET', '/api/v1/users');
    if (list.body?.data?.some((u: any) => u.username === 'testnew')) pass('C2: In list'); else fail('C2: In list', 'Not found');
  } catch (e: any) { fail('C2', e.message); }

  // C3: Update user
  if (newUserId) {
    try { const r = await api('PUT', `/api/v1/users/${newUserId}`, { fullName: 'Updated New' }); if (r.status === 200) pass('C3: Updated'); else fail('C3', `Status ${r.status}`); } catch (e: any) { fail('C3', e.message); }
  }

  // C4: Deactivate user
  if (newUserId) {
    try {
      const r = await api('DELETE', `/api/v1/users/${newUserId}`);
      if (r.status === 200) pass('C4: Deactivated'); else fail('C4', `Status ${r.status}`);
      const login = await api('POST', '/api/v1/auth/login', { email: 'new@test.com', password: 'password123' });
      if (login.status === 401 || login.status === 403) pass('C4: Cannot login'); else fail('C4: Can still login', `Status ${login.status}`);
    } catch (e: any) { fail('C4', e.message); }
    await prisma.userSession.deleteMany({ where: { userId: BigInt(newUserId) } }).catch(() => {});
    await prisma.roleUser.deleteMany({ where: { userId: BigInt(newUserId) } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: BigInt(newUserId) } }).catch(() => {});
  }

  // C5: Cannot delete self
  try { const me = await api('GET', '/api/v1/auth/me'); const myId = me.body?.data?.id; if (myId) { const r = await api('DELETE', `/api/v1/users/${myId}`); if (r.status === 400) pass('C5: Cannot delete self'); else fail('C5', `Status ${r.status}`); } else fail('C5', 'Could not get my ID'); } catch (e: any) { fail('C5', e.message); }

  // D1-D7: Forgot/reset password (uses manager@test.com test user)
  try {
    const r = await api('POST', '/api/v1/auth/forgot-password', { email: 'manager@test.com' });
    if (r.status === 200) pass('D1: Forgot request accepted'); else fail('D1', `Status ${r.status}`);
    const mgr = await prisma.user.findFirst({ where: { tenantId, email: 'manager@test.com' }, select: { id: true, resetToken: true, resetTokenExpiry: true } });
    if (mgr?.resetToken && mgr.resetTokenExpiry && mgr.resetTokenExpiry.getTime() > Date.now()) pass('D2: Reset token stored with future expiry');
    else fail('D2', 'token/expiry missing');
    const token = mgr!.resetToken!;
    // Negative: invalid token
    try { const bad = await api('POST', '/api/v1/auth/reset-password', { token: 'invalid-token-xyz', newPassword: 'Newpass123' }); if (bad.status === 400) pass('D3: Invalid token rejected'); else fail('D3', `Status ${bad.status}`); } catch (e: any) { fail('D3', e.message); }
    // Negative: expired token (force expiry, then attempt)
    await prisma.user.update({ where: { id: mgr!.id }, data: { resetTokenExpiry: new Date(Date.now() - 1000) } });
    try { const exp = await api('POST', '/api/v1/auth/reset-password', { token, newPassword: 'Newpass123' }); if (exp.status === 400) pass('D4: Expired token rejected'); else fail('D4', `Status ${exp.status}`); } catch (e: any) { fail('D4', e.message); }
    // Positive: fresh token works once...
    await api('POST', '/api/v1/auth/forgot-password', { email: 'manager@test.com' });
    const mgr2 = await prisma.user.findFirst({ where: { tenantId, email: 'manager@test.com' }, select: { id: true, resetToken: true } });
    const token2 = mgr2!.resetToken!;
    try { const ok = await api('POST', '/api/v1/auth/reset-password', { token: token2, newPassword: 'Newpass123' }); if (ok.status === 200) pass('D5: Reset succeeds'); else fail('D5', `Status ${ok.status}`); } catch (e: any) { fail('D5', e.message); }
    // ...and cannot be reused
    try { const reuse = await api('POST', '/api/v1/auth/reset-password', { token: token2, newPassword: 'Newpass123' }); if (reuse.status === 400) pass('D6: Reused token rejected'); else fail('D6', `Status ${reuse.status}`); } catch (e: any) { fail('D6', e.message); }
    // Restore manager password for other tests
    await api('POST', '/api/v1/auth/forgot-password', { email: 'manager@test.com' });
    const mgr3 = await prisma.user.findFirst({ where: { tenantId, email: 'manager@test.com' }, select: { resetToken: true } });
    await api('POST', '/api/v1/auth/reset-password', { token: mgr3!.resetToken!, newPassword: 'manager123' });
    const backIn = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'manager123' });
    if (backIn.status === 200) pass('D7: Original password restored'); else fail('D7', `Status ${backIn.status}`);
  } catch (e: any) { fail('D-forgot', e.message); }

  // E1-E3: mustChangePassword server-side enforcement
  try {
    const mgr = await prisma.user.findFirst({ where: { tenantId, email: 'manager@test.com' }, select: { id: true } });
    await prisma.user.update({ where: { id: mgr!.id }, data: { mustChangePassword: true } });
    const lg = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'manager123' });
    const tok = lg.body?.data?.accessToken;
    if (lg.status === 200 && tok) pass('E1: Flagged user can still log in'); else fail('E1', `Status ${lg.status}`);
    const blocked = await api('GET', '/api/v1/products', undefined, tok);
    if (blocked.status === 403 && (blocked.body?.code === 'PASSWORD_CHANGE_REQUIRED' || JSON.stringify(blocked.body).includes('PASSWORD_CHANGE_REQUIRED'))) pass('E2: Unrelated endpoint blocked with code');
    else fail('E2', `Status ${blocked.status}`);
    const chg = await api('PUT', '/api/v1/auth/password', { currentPassword: 'manager123', newPassword: 'TempPass123' }, tok);
    if (chg.status === 200) pass('E3a: Password change allowed while flagged'); else fail('E3a', `Status ${chg.status}`);
    // Password change kills all sessions (incl. current) by design — re-login with the new password
    const lg2 = await api('POST', '/api/v1/auth/login', { email: 'manager@test.com', password: 'TempPass123' });
    const tok2 = lg2.body?.data?.accessToken;
    if (lg2.status === 200 && tok2) pass('E3b: Re-login with new password'); else fail('E3b', `Status ${lg2.status}`);
    const after = tok2 ? await api('GET', '/api/v1/products', undefined, tok2) : { status: 0 };
    if (after.status === 200) pass('E3c: Full access restored after change'); else fail('E3c', `Status ${after.status}`);
    // Restore original password via the new token
    if (tok2) await api('PUT', '/api/v1/auth/password', { currentPassword: 'TempPass123', newPassword: 'manager123' }, tok2);
    const fin = await prisma.user.findFirst({ where: { id: mgr!.id }, select: { mustChangePassword: true } });
    if (fin?.mustChangePassword === false) pass('E3d: Flag cleared'); else fail('E3d', 'flag still set');
  } catch (e: any) { fail('E-mustchange', e.message); }

  await teardown();
  await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll auth tests done');
  process.exit(hasFailures ? 1 : 0);
}

main().catch((e) => { console.error('AUTH TEST FAILED:', e); process.exit(1); });
