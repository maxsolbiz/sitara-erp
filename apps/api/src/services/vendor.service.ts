import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';

function mapVendor(v: any) {
  return {
    id: v.id.toString(),
    tenantId: v.tenantId.toString(),
    code: v.code,
    companyName: v.companyName,
    contactPerson: v.contactPerson,
    email: v.email,
    phone: v.phone,
    address: v.address,
    taxNumber: v.taxNumber,
    paymentTerms: v.paymentTerms,
    creditLimit: Number(v.creditLimit),
    currentBalance: Number(v.currentBalance),
    isActive: v.isActive,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    createdBy: v.createdBy?.toString() || null,
    deletedAt: v.deletedAt,
  };
}

export class VendorService {
  async list(params: { search?: string; page?: number; perPage?: number }) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const where: any = { tenantId: ctx.tenantId, deletedAt: null };
    if (params.search) {
      where.OR = [
        { companyName: { contains: params.search, mode: 'insensitive' } },
        { contactPerson: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
        { code: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const page = params.page || 1, perPage = params.perPage || 20;
    const [items, total] = await Promise.all([
      prisma.vendor.findMany({ where, skip: (page - 1) * perPage, take: perPage, orderBy: { createdAt: 'desc' } }),
      prisma.vendor.count({ where }),
    ]);
    return {
      items: items.map(mapVendor),
      total, page, perPage,
    };
  }

  async getById(id: bigint) {
    const ctx = getTenantContext();
    if (!ctx) return null;
    const v = await prisma.vendor.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } });
    if (!v) return null;
    return mapVendor(v);
  }

  async create(data: any) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const code = `VEN-${Date.now().toString(36).toUpperCase()}`;
    const v = await prisma.vendor.create({
      data: { tenantId: ctx.tenantId, code, companyName: data.companyName, contactPerson: data.contactPerson || null, email: data.email || null, phone: data.phone || null, address: data.address || null, taxNumber: data.taxNumber || null, paymentTerms: data.paymentTerms || 30, creditLimit: data.creditLimit || 0, isActive: true },
    });
    return { id: v.id.toString(), code: v.code };
  }

  async update(id: bigint, data: any) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    
    // Whitelist allowed fields for vendor update
    const allowedFields = ['companyName', 'contactPerson', 'email', 'phone', 'address', 'taxNumber', 'paymentTerms', 'creditLimit'];
    const updateData: any = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }
    
    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return { id: id.toString() };
    }
    
    await prisma.vendor.updateMany({ where: { id, tenantId: ctx.tenantId }, data: updateData });
    return { id: id.toString() };
  }

  async delete(id: bigint) {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    await prisma.vendor.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { deletedAt: new Date() } });
  }

  async getStats() {
    const ctx = getTenantContext();
    if (!ctx) throw new Error('No tenant');
    const [total, active, payable, withBalance] = await Promise.all([
      prisma.vendor.count({ where: { tenantId: ctx.tenantId, deletedAt: null } }),
      prisma.vendor.count({ where: { tenantId: ctx.tenantId, isActive: true, deletedAt: null } }),
      prisma.vendor.aggregate({ where: { tenantId: ctx.tenantId, deletedAt: null }, _sum: { currentBalance: true } }),
      prisma.vendor.count({ where: { tenantId: ctx.tenantId, currentBalance: { gt: 0 }, deletedAt: null } }),
    ]);
    return { total, active, totalPayable: Number(payable._sum.currentBalance || 0), withBalance };
  }
}

export const vendorService = new VendorService();
