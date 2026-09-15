import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;
let emailConfigured = false;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  if (process.env.RESEND_API_KEY) {
    transporter = nodemailer.createTransport({ host: 'smtp.resend.com', port: 587, secure: false, auth: { user: 'resend', pass: process.env.RESEND_API_KEY } });
    emailConfigured = true;
  } else if (process.env.BREVO_API_KEY) {
    transporter = nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587, secure: false, auth: { user: process.env.SMTP_USER || '', pass: process.env.BREVO_API_KEY } });
    emailConfigured = true;
  } else if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '' } });
    emailConfigured = true;
  }
  if (!emailConfigured) console.warn('[Email] No email provider configured');
  return transporter;
}

const COMPANY_NAME = process.env.COMPANY_NAME || 'Sitara ERP';
const FROM_EMAIL = process.env.MAIL_FROM || 'noreply@sitarapurse.com';

// Brand accents sampled from the Sitara gold monogram logo.
const GOLD = '#C9A227';
const GOLD_DEEP = '#8A6414';
const GOLD_HIGHLIGHT = '#E3C878';
const INK = '#111827';
const MUTED = '#4b5563';
const FAINT = '#9ca3af';
const LINE = '#e5e7eb';
const LOGO_URL = 'https://app.sitarapurse.com/sitara-logo.png';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

interface ShellParts {
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
  companyName: string;
}

export function emailShell({ subject, preheader, heading, bodyHtml, companyName }: ShellParts): string {
  const safeCompany = escapeHtml(companyName);
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(subject)}</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        @media (prefers-color-scheme: dark) {
            .dark-bg { background-color: #121212 !important; }
            .dark-card { background-color: #1e1e1e !important; }
            .dark-text { color: #f3f4f6 !important; }
            .dark-muted { color: #9ca3af !important; }
            .dark-border { border-color: #374151 !important; }
        }
        @media only screen and (max-width: 600px) {
            .mobile-full { width: 100% !important; max-width: 100% !important; }
            .mobile-padding { padding: 20px !important; }
            .mobile-hide { display: none !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: ${FONT}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;" class="dark-bg">
    <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #f4f4f7;">
        ${escapeHtml(preheader)}
        &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="dark-bg" style="background-color: #f4f4f7;">
        <tr>
            <td align="center" style="padding: 40px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="mobile-full dark-card" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="height: 6px; background-color: ${GOLD}; font-size: 0; line-height: 0;">&nbsp;</td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px 20px 40px;" class="mobile-padding">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="vertical-align: middle; width: 40px;">
                                        <img src="${LOGO_URL}" alt="Sitara ERP" width="40" height="40" style="display: block; border: 0; outline: none; text-decoration: none; vertical-align: middle;">
                                    </td>
                                    <td style="vertical-align: middle; padding-left: 12px;">
                                        <span style="font-size: 18px; font-weight: 700; color: ${INK}; font-family: ${FONT};" class="dark-text">Sitara ERP</span>
                                    </td>
                                    <td style="vertical-align: middle; text-align: right;">
                                        <span style="font-size: 14px; color: #6b7280; font-family: ${FONT};" class="dark-muted">${safeCompany}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px;" class="mobile-padding">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="border-top: 1px solid ${LINE}; font-size: 0; line-height: 0;" class="dark-border">&nbsp;</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px;" class="mobile-padding">
                            <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: ${INK}; font-family: ${FONT};" class="dark-text">${escapeHtml(heading)}</h1>
                            ${bodyHtml}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; background-color: #f9fafb; border-top: 1px solid ${LINE};" class="mobile-padding dark-card">
                            <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.5; color: ${FAINT}; font-family: ${FONT}; text-align: center;" class="dark-muted">
                                Sent by <strong>${safeCompany}</strong> via Sitara ERP
                            </p>
                            <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.5; color: ${FAINT}; font-family: ${FONT}; text-align: center;" class="dark-muted">
                                Need help? Contact <a href="mailto:${escapeHtml(FROM_EMAIL)}" style="color: ${GOLD_DEEP}; text-decoration: underline;">${escapeHtml(FROM_EMAIL)}</a>
                            </p>
                            <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #d1d5db; font-family: ${FONT}; text-align: center;" class="dark-muted">
                                You received this email because you have an account with ${safeCompany}. &copy; 2026 Sitara ERP. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 24px 0;">
    <tr>
      <td align="center">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="12%" fillcolor="${GOLD}" stroke="f">
          <v:textbox inset="0,0,0,0"><center style="color:#1f2937;font-family:${FONT};font-size:16px;font-weight:700;">${safeLabel}</center></v:textbox>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${safeUrl}" style="display: inline-block; background-color: ${GOLD}; color: #1f2937; font-family: ${FONT}; font-size: 16px; font-weight: 700; line-height: 48px; text-align: center; text-decoration: none; width: 260px; border-radius: 6px; mso-hide: all;">${safeLabel}</a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;
}

function bodyPara(text: string): string {
  return `<p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: ${MUTED}; font-family: ${FONT};" class="dark-muted">${escapeHtml(text)}</p>`;
}

function calloutBox(text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 24px 0;">
    <tr>
      <td style="background-color: #fffbeb; border: 1px solid ${GOLD_HIGHLIGHT}; border-left: 4px solid ${GOLD}; border-radius: 4px; padding: 14px 16px; font-size: 14px; line-height: 1.5; color: ${MUTED}; font-family: ${FONT};" class="dark-muted">${escapeHtml(text)}</td>
    </tr>
  </table>`;
}

function totalsTable(rows: Array<{ label: string; value: string; bold?: boolean; highlight?: boolean }>): string {
  const body = rows.map((r) => {
    const bg = r.highlight ? ` background-color: #fef2f2;` : '';
    const weight = r.bold ? '700' : '400';
    const color = r.highlight ? '#b91c1c' : INK;
    return `<tr>
      <td style="padding: 8px 0; font-size: 15px; color: ${MUTED}; font-family: ${FONT};${bg}" class="dark-muted">${escapeHtml(r.label)}</td>
      <td align="right" style="padding: 8px 0; font-size: 15px; font-weight: ${weight}; color: ${color}; font-family: ${FONT}; white-space: nowrap;${bg}" class="dark-text">${escapeHtml(r.value)}</td>
    </tr>`;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 24px 0;">${body}</table>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const t = getTransporter();
  if (!t) return;
  await t.sendMail({ from: `"${COMPANY_NAME}" <${FROM_EMAIL}>`, to, subject, html });
}

export function renderPaymentReceiptEmail(data: { customerName: string; amount: number; reference: string; date: string; balance: number; companyName?: string; paymentMethod?: string }): { subject: string; html: string } {
  const cn = data.companyName || COMPANY_NAME;
  const body =
    bodyPara(`Dear ${data.customerName},`) +
    bodyPara(`We have received your payment of Rs. ${data.amount.toLocaleString()}. Thank you for your business.`) +
    totalsTable([
      { label: 'Receipt', value: data.reference },
      { label: 'Date', value: data.date },
      ...(data.paymentMethod ? [{ label: 'Payment method', value: data.paymentMethod }] : []),
      { label: 'Amount paid', value: `Rs. ${data.amount.toLocaleString()}` },
      { label: 'Remaining balance', value: `Rs. ${data.balance.toLocaleString()}`, bold: true },
    ]);
  const html = emailShell({
    subject: `Payment Receipt - ${data.reference}`,
    preheader: `Payment of Rs. ${data.amount.toLocaleString()} received (${data.reference})`,
    heading: 'Payment Receipt',
    bodyHtml: body,
    companyName: cn,
  });
  return { subject: `Payment Receipt - ${data.reference}`, html };
}

export async function sendPaymentReceiptEmail(to: string, data: { customerName: string; amount: number; reference: string; date: string; balance: number; companyName?: string; paymentMethod?: string }) {
  const rendered = renderPaymentReceiptEmail(data);
  await sendEmail(to, rendered.subject, rendered.html);
}

export function renderSaleInvoiceEmail(data: { customerName: string; invoiceNumber: string; total: number; date: string; companyName?: string; dueDate?: string; items?: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }> }): { subject: string; html: string } {
  const cn = data.companyName || COMPANY_NAME;
  let overdue = false;
  if (data.dueDate) {
    const daysOverdue = Math.floor((Date.now() - new Date(data.dueDate).getTime()) / 86400000);
    overdue = daysOverdue > 0;
  }
  let itemsHtml = '';
  if (data.items && data.items.length > 0) {
    const head = `<tr>
      <td style="padding: 8px 0; font-size: 13px; font-weight: 700; color: ${FAINT}; font-family: ${FONT}; text-transform: uppercase;" class="dark-muted">Item</td>
      <td align="center" style="padding: 8px 0; font-size: 13px; font-weight: 700; color: ${FAINT}; font-family: ${FONT}; text-transform: uppercase;" class="dark-muted">Qty</td>
      <td align="right" style="padding: 8px 0; font-size: 13px; font-weight: 700; color: ${FAINT}; font-family: ${FONT}; text-transform: uppercase;" class="dark-muted">Total</td>
    </tr>`;
    const rows = data.items.map((it) => `<tr>
      <td style="padding: 8px 0; border-top: 1px solid ${LINE}; font-size: 15px; color: ${INK}; font-family: ${FONT};" class="dark-text dark-border">${escapeHtml(it.name)}<br><span style="font-size: 13px; color: ${FAINT};" class="dark-muted">Rs. ${Number(it.unitPrice).toLocaleString()} each</span></td>
      <td align="center" style="padding: 8px 0; border-top: 1px solid ${LINE}; font-size: 15px; color: ${MUTED}; font-family: ${FONT};" class="dark-muted dark-border">${Number(it.quantity)}</td>
      <td align="right" style="padding: 8px 0; border-top: 1px solid ${LINE}; font-size: 15px; color: ${INK}; font-family: ${FONT}; white-space: nowrap;" class="dark-text dark-border">Rs. ${Number(it.lineTotal).toLocaleString()}</td>
    </tr>`).join('');
    itemsHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 16px 0;">${head}${rows}</table>`;
  }
  const body =
    bodyPara(`Dear ${data.customerName},`) +
    bodyPara(`Your invoice ${data.invoiceNumber} has been generated. Thank you for your business.`) +
    itemsHtml +
    totalsTable([
      { label: 'Invoice', value: data.invoiceNumber },
      { label: 'Date', value: data.date },
      ...(data.dueDate ? [{ label: 'Due date', value: data.dueDate, highlight: overdue }] : []),
      { label: 'Total', value: `Rs. ${Number(data.total).toLocaleString()}`, bold: true, highlight: overdue },
    ]) +
    (overdue ? calloutBox('This invoice is past due. Please arrange payment at your earliest convenience to avoid service interruption.') : '');
  const html = emailShell({
    subject: `Invoice ${data.invoiceNumber} from ${cn}`,
    preheader: `Invoice ${data.invoiceNumber} for Rs. ${Number(data.total).toLocaleString()}`,
    heading: overdue ? 'Invoice Overdue' : 'Sales Invoice',
    bodyHtml: body,
    companyName: cn,
  });
  return { subject: `Invoice ${data.invoiceNumber} from ${cn}`, html };
}

export async function sendSaleInvoiceEmail(to: string, data: { customerName: string; invoiceNumber: string; total: number; date: string; companyName?: string; dueDate?: string; items?: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }> }) {
  const rendered = renderSaleInvoiceEmail(data);
  await sendEmail(to, rendered.subject, rendered.html);
}

export function renderPasswordResetEmail(data: { resetUrl: string; expiryMinutes: number }): { subject: string; html: string } {
  const body =
    bodyPara('You requested a password reset for your Sitara ERP account. Click the button below to set a new password:') +
    ctaButton(data.resetUrl, 'Reset Password') +
    calloutBox(`This link expires in ${data.expiryMinutes} minutes and can only be used once.`) +
    bodyPara('If the button does not work, copy and paste this link into your browser:') +
    `<p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.6; color: ${FAINT}; font-family: ${FONT}; word-break: break-all;" class="dark-muted">${escapeHtml(data.resetUrl)}</p>` +
    bodyPara('If you did not request this, you can safely ignore this email — your password will not change.');
  const html = emailShell({
    subject: 'Password Reset Request',
    preheader: 'Reset your Sitara ERP password — link expires in 60 minutes',
    heading: 'Reset your password',
    bodyHtml: body,
    companyName: COMPANY_NAME,
  });
  return { subject: 'Password Reset Request', html };
}

export async function sendPasswordResetEmail(to: string, data: { resetUrl: string; expiryMinutes: number }) {
  const rendered = renderPasswordResetEmail(data);
  await sendEmail(to, rendered.subject, rendered.html);
}
