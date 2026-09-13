import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';

const router = Router();

router.get('/', rbacMiddleware('admin'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.perPage) || 20;
    const skip = (page - 1) * perPage;

    const where: any = { tenantId: ctx.tenantId };
    if (req.query.userId) where.userId = BigInt(String(req.query.userId));
    if (req.query.action) where.action = String(req.query.action).toUpperCase();
    if (req.query.module) where.entityType = String(req.query.module);
    if (req.query.startDate) where.createdAt = { ...where.createdAt, gte: new Date(String(req.query.startDate)) };
    if (req.query.endDate) where.createdAt = { ...where.createdAt, lte: new Date(String(req.query.endDate) + 'T23:59:59.999Z') };

    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
        include: { user: { select: { fullName: true, username: true } } },
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.json({
      data: items.map((a) => ({
        id: a.id.toString(),
        userId: a.userId?.toString() || null,
        userName: a.user?.fullName || a.user?.username || 'System',
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId?.toString() || null,
        description: a.description,
        oldValues: a.oldValues,
        newValues: a.newValues,
        ipAddress: a.ipAddress,
        createdAt: a.createdAt,
      })),
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    });
  } catch { res.status(500).json({ status: 500 }); }
});

export default router;
