import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { authService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
import { validateMiddleware } from '../middleware/validate';
import { authRateLimitMiddleware } from '../middleware/rateLimit';
import { hashPassword, verifyPassword, parseIdParam } from '../utils/helpers';
import { getRedis } from '../lib/redis';
import logger from '../utils/logger';

const router = Router();

// Reject malformed numeric IDs with 400 instead of 500/P2025 downstream
// (BigInt('') silently coerces to 0n; BigInt('abc') throws).
router.param('id', (req, res, next, val) => {
  if (parseIdParam(val) === null) {
    res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid id parameter' });
    return;
  }
  next();
});

const registerSchema = z.object({
  tenantName: z.string().min(2).max(200),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  fullName: z.string().min(2).max(100),
});

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(10).max(255), newPassword: z.string().min(8).max(100) });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post('/register', authRateLimitMiddleware(), validateMiddleware(registerSchema), async (req: Request, res: Response) => {
  // Fail-closed: public self-registration is allowed only in development/test
  // or with an explicit opt-in. An unset NODE_ENV is treated as closed —
  // a misconfigured production box must never fall open.
  const registrationOpen =
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    process.env.ALLOW_PUBLIC_REGISTRATION === 'true';
  if (!registrationOpen) {
    res.status(403).json({ status: 403, title: 'Forbidden', detail: 'Public registration is disabled' });
    return;
  }
  try {
    const { tenantName, slug, email, password, fullName } = req.body;
    const result = await authService.registerTenant(tenantName, slug, email, password, fullName);

    res.status(201).json({
      data: {
        tenantId: result.tenant.id.toString(),
        slug: result.tenant.slug,
        message: 'Tenant registered successfully. Please login.',
      },
    });
  } catch (error: any) {
    if (error.message === 'TENANT_EXISTS') {
      res.status(409).json({ status: 409, title: 'Conflict', detail: 'This business name is already registered' });
      return;
    }
    if (error.message === 'EMAIL_EXISTS') {
      res.status(409).json({ status: 409, title: 'Conflict', detail: 'This email is already registered' });
      return;
    }
    logger.error('Registration failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Internal Server Error', detail: 'Registration failed' });
  }
});

router.post('/login', authRateLimitMiddleware(), validateMiddleware(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password, {
      ipAddress: req.ip || (req.socket?.remoteAddress as string) || '',
      userAgent: (req.headers['user-agent'] as string) || '',
    });

    res.json({ data: result });
  } catch (error: any) {
    if (error.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ status: 401, title: 'Unauthorized', detail: 'Invalid email or password' });
      return;
    }
    if (error.message === 'ACCOUNT_INACTIVE') {
      res.status(403).json({ status: 403, title: 'Forbidden', detail: 'Account is inactive. Contact support.' });
      return;
    }
    if (error.message === 'ACCOUNT_LOCKED') {
      res.status(423).json({ status: 423, title: 'Locked', detail: 'Account locked due to too many failed attempts. Try again in 15 minutes.' });
      return;
    }
    logger.error('Login failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Internal Server Error', detail: 'Login failed' });
  }
});

router.post('/refresh', validateMiddleware(refreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshTokens(refreshToken);
    res.json({ data: result });
  } catch (error: any) {
    if (error.message === 'INVALID_REFRESH_TOKEN') {
      res.status(401).json({ status: 401, title: 'Unauthorized', detail: 'Invalid or expired refresh token' });
      return;
    }
    logger.error('Token refresh failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Internal Server Error', detail: 'Token refresh failed' });
  }
});

// Public: request a password-reset link. Always returns success shape
// (no user-enumeration oracle); rate-limited like login.
router.post('/forgot-password', authRateLimitMiddleware(), validateMiddleware(forgotSchema), async (req: Request, res: Response) => {
  try {
    const result = await authService.requestPasswordReset(req.body.email, {
      ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] as string) || '',
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Forgot-password failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Internal Server Error', detail: 'Request failed' });
  }
});

// Public: consume a reset token (single-use, 1h expiry).
router.post('/reset-password', authRateLimitMiddleware(), validateMiddleware(resetSchema), async (req: Request, res: Response) => {
  try {
    const result = await authService.resetPassword(req.body.token, req.body.newPassword);
    res.json({ data: result });
  } catch (error: any) {
    if (error.message === 'INVALID_RESET_TOKEN') {
      res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid or expired reset token' });
      return;
    }
    if (error.message === 'WEAK_PASSWORD') {
      res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Password must be at least 8 characters' });
      return;
    }
    logger.error('Reset-password failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Internal Server Error', detail: 'Request failed' });
  }
});

router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user) {
      await authService.logout(BigInt(req.user.userId), req.user.jti, {
        ipAddress: req.ip || (req.socket?.remoteAddress as string) || '',
        userAgent: (req.headers['user-agent'] as string) || '',
      });
    }
    res.json({ data: { message: 'Logged out successfully' } });
  } catch (error: any) {
    logger.error('Logout failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Internal Server Error', detail: 'Logout failed' });
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const prisma = (await import('../lib/prisma')).default;
    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.user!.userId) },
      select: {
        id: true, email: true, fullName: true, username: true,
        isSuperAdmin: true, status: true, lastLogin: true,
        tenant: { select: { id: true, name: true, slug: true, plan: true, status: true, settings: true } },
        roleAssignments: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: { select: { slug: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ status: 404, title: 'Not Found', detail: 'User not found' });
      return;
    }

    const permissionsSet = new Set<string>();
    for (const ra of user.roleAssignments) {
      for (const rp of ra.role.permissions) {
        permissionsSet.add(rp.permission.slug);
      }
    }

    res.json({
      data: {
        id: user.id.toString(),
        email: user.email,
        fullName: user.fullName,
        username: user.username,
        isSuperAdmin: user.isSuperAdmin,
        status: user.status,
        lastLogin: user.lastLogin,
        permissions: Array.from(permissionsSet),
        roleAssignments: user.roleAssignments.map((ra: any) => ({ roleId: ra.role.id.toString(), name: ra.role.name, slug: ra.role.slug })),
        tenant: user.tenant ? { id: user.tenant.id.toString(), name: user.tenant.name, slug: user.tenant.slug, plan: user.tenant.plan, status: user.tenant.status, settings: user.tenant.settings } : null,
      },
    });
  } catch (error: any) {
    logger.error('Profile fetch failed', { error: error.message });
    res.status(500).json({ status: 500, title: 'Internal Server Error', detail: 'Failed to fetch profile' });
  }
});

// ---- Profile ----
router.put('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = BigInt(req.user!.userId);
    const { fullName, email } = req.body;
    if (email) {
      const existing = await prisma.user.findFirst({ where: { email, tenantId: BigInt(req.user!.tenantId), NOT: { id: userId } } });
      if (existing) { res.status(409).json({ status: 409, detail: 'Email already in use' }); return; }
    }
    const data: any = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (email !== undefined) data.email = email;
    await prisma.user.update({ where: { id: userId }, data });
    res.json({ data: { message: 'Profile updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.put('/password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = BigInt(req.user!.userId);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) { res.status(400).json({ status: 400, detail: 'Current and new password required' }); return; }
    if (newPassword.length < 8) { res.status(400).json({ status: 400, detail: 'New password must be at least 8 characters' }); return; }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) { res.status(404).json({ status: 404 }); return; }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) { res.status(400).json({ status: 400, detail: 'Current password is incorrect' }); return; }
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
    // Invalidate all other sessions (deactivate rows so their tokens are rejected)
    await prisma.userSession.updateMany({ where: { userId, NOT: { id: BigInt(0) } }, data: { isActive: false } }).catch(() => {});
    // ...and drop the single-slot refresh token too, so a password change is
    // a log-out-everywhere (including the current device): with no active
    // row and no Redis slot, the next refresh is refused and the client
    // lands on /login via the standard 401 path.
    await getRedis().del(`refresh:${userId}`).catch(() => {});
    res.json({ data: { message: 'Password changed' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.get('/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = BigInt(req.user!.userId);
    const sessions = await prisma.userSession.findMany({ where: { userId, isActive: true }, orderBy: { lastActivity: 'desc' }, take: 50 });
    res.json({ data: sessions.map((s) => ({ id: s.id.toString(), ipAddress: s.ipAddress, userAgent: s.userAgent, startedAt: s.startedAt, lastActivity: s.lastActivity })) });
  } catch { res.json({ data: [] }); }
});

router.delete('/sessions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = BigInt(req.user!.userId);
    const sessionId = BigInt(req.params.id);
    const session = await prisma.userSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) { res.status(404).json({ status: 404 }); return; }
    // Deactivate (not hard-delete): preserves history and keeps the row as
    // the revocation record authMiddleware checks. List endpoint filters active.
    // If this session held the single-slot refresh token (most recent login),
    // also kill refresh so termination can't be bypassed via /auth/refresh.
    const latest = await prisma.userSession.findFirst({
      where: { userId, isActive: true },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    await prisma.userSession.update({ where: { id: sessionId }, data: { isActive: false } });
    if (latest && latest.id === sessionId) {
      await getRedis().del(`refresh:${userId}`).catch(() => {});
    }
    res.json({ data: { message: 'Session terminated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
