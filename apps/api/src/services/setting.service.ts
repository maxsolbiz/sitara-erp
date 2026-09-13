import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';

export class SettingService {
  async getSettings(tenantId: bigint, category?: string): Promise<Record<string, any>> {
    const where: any = { tenantId };
    if (category) {
      where.key = { startsWith: `${category}_` };
    }
    const rows = await prisma.setting.findMany({ where });
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async getSetting(tenantId: bigint, key: string, defaultValue?: any): Promise<any> {
    const row = await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key } } });
    return row ? row.value : (defaultValue ?? null);
  }

  async upsertSettings(tenantId: bigint, data: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(data)) {
      await prisma.setting.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, value },
        update: { value },
      });
    }
  }
}

export const settingService = new SettingService();
