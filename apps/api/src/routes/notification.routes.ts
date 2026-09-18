import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { parseIdParam } from '../utils/helpers';
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

export async function createNotification(params: { tenantId: bigint; userId: bigint; title: string; message: string; type: string; link?: string }) {
  await prisma.notification.create({ data: { tenantId: params.tenantId, userId: params.userId, title: params.title, message: params.message, type: params.type, data: params.link ? { link: params.link } : undefined } });
}

router.get('/', rbacMiddleware('notifications.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    const unread = req.query.unread === 'true';
    const where: any = { tenantId: ctx.tenantId, userId };
    if (unread) where.isRead = false;
    const notifs = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ data: notifs.map((n) => ({ id: n.id.toString(), title: n.title, message: n.message, type: n.type, isRead: n.isRead, data: n.data, createdAt: n.createdAt })) });
  } catch { res.json({ data: [] }); }
});

router.get('/unread-count', rbacMiddleware('notifications.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ count: 0 }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    const count = await prisma.notification.count({ where: { tenantId: ctx.tenantId, userId, isRead: false } });
    res.json({ data: { count } });
  } catch { res.json({ data: { count: 0 } }); }
});

router.patch('/:id/read', rbacMiddleware('notifications.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    await prisma.notification.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId, userId }, data: { isRead: true, readAt: new Date() } });
    res.json({ data: { message: 'Marked as read' } });
  } catch { logger.error('Notification read failed'); res.status(500).json({ status: 500 }); }
});

router.patch('/read-all', rbacMiddleware('notifications.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    await prisma.notification.updateMany({ where: { tenantId: ctx.tenantId, userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    res.json({ data: { message: 'All marked as read' } });
  } catch { logger.error('Notifications read-all failed'); res.status(500).json({ status: 500 }); }
});

router.delete('/:id', rbacMiddleware('notifications.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    await prisma.notification.deleteMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId, userId } });
    res.json({ data: { message: 'Deleted' } });
  } catch { logger.error('Notification delete failed'); res.status(500).json({ status: 500 }); }
});

export default router;
