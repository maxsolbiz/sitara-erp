import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import logger from '../utils/logger';

const router = Router();

export async function createNotification(params: { tenantId: bigint; userId: bigint; title: string; message: string; type: string; link?: string }) {
  await prisma.notification.create({ data: { tenantId: params.tenantId, userId: params.userId, title: params.title, message: params.message, type: params.type, data: params.link ? { link: params.link } : undefined } });
}

router.get('/', async (req: Request, res: Response) => {
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

router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ count: 0 }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    const count = await prisma.notification.count({ where: { tenantId: ctx.tenantId, userId, isRead: false } });
    res.json({ data: { count } });
  } catch { res.json({ data: { count: 0 } }); }
});

router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    await prisma.notification.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId, userId }, data: { isRead: true, readAt: new Date() } });
    res.json({ data: { message: 'Marked as read' } });
  } catch { res.status(500).json({ status: 500 }); }
});

router.patch('/read-all', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    await prisma.notification.updateMany({ where: { tenantId: ctx.tenantId, userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    res.json({ data: { message: 'All marked as read' } });
  } catch { res.status(500).json({ status: 500 }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const userId = req.user ? BigInt(req.user.userId) : BigInt(0);
    await prisma.notification.deleteMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId, userId } });
    res.json({ data: { message: 'Deleted' } });
  } catch { res.status(500).json({ status: 500 }); }
});

export default router;
