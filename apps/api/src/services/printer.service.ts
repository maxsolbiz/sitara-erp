import net from 'net';
import { settingService } from './setting.service';
import { formatPkr } from '../utils/helpers';
import logger from '../utils/logger';

const ESC = 0x1B, GS = 0x1D;

export class PrinterService {
  async getSettings(tenantId: bigint) {
    const s = await settingService.getSettings(tenantId);
    return {
      enabled: (s.hardware_printer_enabled || false) === true || s.hardware_printer_enabled === 'true',
      type: s.hardware_printer_type || 'epson',
      connection: s.hardware_printer_connection || 'usb',
      ip: s.hardware_printer_ip || '',
      port: parseInt(s.hardware_printer_port || '9100', 10),
      paperWidth: parseInt(s.hardware_printer_paper_width || '80', 10),
      charPerLine: parseInt(s.hardware_printer_char_per_line || '48', 10),
      cutPaper: (s.hardware_printer_cut_paper || true) === true || s.hardware_printer_cut_paper === 'true',
      openDrawer: (s.hardware_printer_open_drawer || true) === true || s.hardware_printer_open_drawer === 'true',
      drawerEnabled: (s.hardware_drawer_enabled || false) === true || s.hardware_drawer_enabled === 'true',
      drawerPin: parseInt(s.hardware_drawer_pin || '2', 10),
    };
  }

  private async sendToNetwork(ip: string, port: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      client.setTimeout(5000);
      client.on('connect', () => { client.write(data); client.destroy(); resolve(); });
      client.on('error', (err) => { client.destroy(); reject(err); });
      client.on('timeout', () => { client.destroy(); reject(new Error('Printer timeout')); });
      client.connect(port, ip);
    });
  }

  private txt(text: string): number[] {
    return text.split('').map((c) => c.charCodeAt(0));
  }

  private line(text: string, len: number): number[] {
    const padded = text + '\n'.repeat(Math.max(1, Math.ceil(text.length / len)));
    return this.txt(padded);
  }

  private center(text: string): number[] { return [ESC, 0x61, 0x01, ...this.txt(text), ESC, 0x61, 0x00]; }
  private bold(text: string): number[] { return [ESC, 0x45, 0x01, ...this.txt(text), ESC, 0x45, 0x00]; }
  private centerBold(text: string): number[] { return [ESC, 0x61, 0x01, ESC, 0x45, 0x01, ...this.txt(text), ESC, 0x45, 0x00, ESC, 0x61, 0x00]; }
  private divider(char = '-', len = 48): number[] { return this.txt(char.repeat(len) + '\n'); }

  private buildHead(settings: any, receipt: any): number[] {
    const s = receipt?.settings || {};
    const companyName = s.companyName || 'Business Name';
    const companyAddress = s.address || '';
    const companyPhone = s.phone || '';
    return [
      ESC, 0x40, // Initialize
      ...this.centerBold(companyName),
      ...(companyAddress ? this.line(companyAddress, settings.charPerLine) : []),
      ...(companyPhone ? this.line(companyPhone, settings.charPerLine) : []),
      ...(receipt.header ? this.line(receipt.header, settings.charPerLine) : []),
      ...this.divider('-', settings.charPerLine),
    ];
  }

  private buildFooter(settings: any, receipt: any): number[] {
    const out: number[] = [
      ...this.divider('-', settings.charPerLine),
      ...(receipt.footer ? this.line(receipt.footer, settings.charPerLine) : []),
      ...this.line('Thank you for your business!', settings.charPerLine),
      0x0A, 0x0A, 0x0A, // 3 line feeds
    ];
    if (settings.cutPaper) out.push(GS, 0x56, 0x00); // Cut
    return out;
  }

  async printReceipt(tenantId: bigint, sale: any): Promise<{ success: boolean; reason?: string }> {
    const settings = await this.getSettings(tenantId);
    if (!settings.enabled) return { success: false, reason: 'Printer not configured' };
    if (settings.connection === 'network' && !settings.ip) return { success: false, reason: 'Printer IP not configured' };

    const receipt = {
      settings: await settingService.getSettings(tenantId, 'company_'),
      header: await settingService.getSetting(tenantId, 'receipt_header', ''),
      footer: await settingService.getSetting(tenantId, 'receipt_footer', ''),
    };

    const buf: number[] = [...this.buildHead(settings, receipt)];
    buf.push(...this.line(`Receipt #: ${sale.saleNumber}`, settings.charPerLine));
    buf.push(...this.line(`Date: ${new Date(sale.saleDate).toLocaleString()}`, settings.charPerLine));
    if (sale.createdByUser?.fullName) buf.push(...this.line(`Cashier: ${sale.createdByUser.fullName}`, settings.charPerLine));
    if (sale.customer?.fullName) buf.push(...this.line(`Customer: ${sale.customer.fullName}`, settings.charPerLine));
    buf.push(...this.divider('-', settings.charPerLine));

    for (const item of (sale.items || []).filter((i: any) => i.quantity > 0)) {
      const name = item.product?.name || 'Item';
      buf.push(...this.line(name, settings.charPerLine));
      const lineStr = `${Math.abs(item.quantity)} x ${Number(item.unitPrice).toLocaleString()}     ${Number(item.lineTotal).toLocaleString()}`;
      buf.push(...this.txt(lineStr + '\n'));
    }

    buf.push(...this.divider('-', settings.charPerLine));
    buf.push(...this.line(`Subtotal: ${Number(sale.subtotal).toLocaleString()}`, settings.charPerLine));
    if (Number(sale.discountAmount) > 0) buf.push(...this.line(`Discount: -${Number(sale.discountAmount).toLocaleString()}`, settings.charPerLine));
    buf.push(...this.divider('=', settings.charPerLine));
    buf.push(...[ESC, 0x45, 0x01, ...this.txt(`TOTAL: ${Number(sale.totalAmount).toLocaleString()}\n`), ESC, 0x45, 0x00]);
    buf.push(...this.divider('=', settings.charPerLine));

    for (const pmt of (sale.payments || [])) {
      buf.push(...this.line(`${pmt.paymentMethod}: ${Number(pmt.amount).toLocaleString()}`, settings.charPerLine));
    }
    if (Number(sale.changeAmount) > 0) buf.push(...this.line(`Change: ${Number(sale.changeAmount).toLocaleString()}`, settings.charPerLine));

    buf.push(...this.buildFooter(settings, receipt));

    try {
      await this.sendToNetwork(settings.ip, settings.port, Buffer.from(buf));
      return { success: true };
    } catch (e: any) {
      logger.warn('Network print failed', { error: e.message });
      return { success: false, reason: `Cannot connect to printer at ${settings.ip}:${settings.port} — ${e.message}` };
    }
  }

  async testPrint(tenantId: bigint): Promise<{ success: boolean; reason?: string }> {
    const settings = await this.getSettings(tenantId);
    if (!settings.enabled) return { success: false, reason: 'Printer not configured in settings' };
    if (settings.connection === 'network' && !settings.ip) return { success: false, reason: 'Printer IP not configured' };

    const buf: number[] = [ESC, 0x40];
    buf.push(...this.centerBold('TEST PRINT\n'));
    buf.push(...this.line(new Date().toLocaleString(), settings.charPerLine));
    buf.push(...this.divider('-', settings.charPerLine));
    buf.push(...this.txt('Printer is working correctly!\n'));
    buf.push(...this.divider('=', settings.charPerLine));
    buf.push(...this.line('Thank you for your business!', settings.charPerLine));
    buf.push(0x0A, 0x0A, 0x0A);
    if (settings.cutPaper) buf.push(GS, 0x56, 0x00);

    try {
      await this.sendToNetwork(settings.ip, settings.port, Buffer.from(buf));
      return { success: true };
    } catch (e: any) {
      logger.warn('Test print failed', { error: e.message });
      return { success: false, reason: `Cannot connect to printer at ${settings.ip}:${settings.port}` };
    }
  }

  async openDrawer(tenantId: bigint): Promise<{ success: boolean; reason?: string }> {
    const settings = await this.getSettings(tenantId);
    if (!settings.drawerEnabled) return { success: false, reason: 'Cash drawer not configured' };
    const pin = settings.drawerPin === 5 ? 1 : 0;
    const buf = Buffer.from([ESC, 0x70, pin, 0x19, 0xFA]);

    try {
      if (settings.connection === 'network' && settings.ip) {
        await this.sendToNetwork(settings.ip, settings.port, buf);
        return { success: true };
      }
      return { success: false, reason: 'Drawer requires a network printer connection' };
    } catch (e: any) {
      logger.warn('Cash drawer open failed', { error: e.message });
      return { success: false, reason: `Cannot open drawer: ${e.message}` };
    }
  }

  async checkStatus(tenantId: bigint): Promise<any> {
    const settings = await this.getSettings(tenantId);
    if (!settings.enabled) return { printer: 'not_configured', drawer: 'not_configured' };
    if (settings.connection === 'network' && settings.ip) {
      try {
        await this.sendToNetwork(settings.ip, settings.port, Buffer.from([ESC, 0x40]));
        return { printer: 'online', drawer: settings.drawerEnabled ? 'available' : 'not_configured' };
      } catch {
        logger.warn('Printer status check failed');
        return { printer: 'offline', drawer: 'not_available' };
      }
    }
    return { printer: 'configured', drawer: settings.drawerEnabled ? 'available' : 'not_configured' };
  }
}

export const printerService = new PrinterService();
