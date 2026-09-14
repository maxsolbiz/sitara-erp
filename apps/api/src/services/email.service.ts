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

async function sendEmail(to: string, subject: string, html: string) {
  const t = getTransporter();
  if (!t) return;
  await t.sendMail({ from: `"${COMPANY_NAME}" <${FROM_EMAIL}>`, to, subject, html });
}

export async function sendPaymentReceiptEmail(to: string, data: { customerName: string; amount: number; reference: string; date: string; balance: number; companyName?: string }) {
  const cn = data.companyName || COMPANY_NAME;
  await sendEmail(to, `Payment Receipt - ${data.reference}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0f172a">${cn}</h2>
      <h3>Payment Receipt</h3>
      <p>Dear ${data.customerName},</p>
      <p>We have received your payment of <strong>Rs. ${data.amount.toLocaleString()}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Reference</td><td style="padding:8px;border:1px solid #e2e8f0">${data.reference}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Date</td><td style="padding:8px;border:1px solid #e2e8f0">${data.date}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Amount Paid</td><td style="padding:8px;border:1px solid #e2e8f0">Rs. ${data.amount.toLocaleString()}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Remaining Balance</td><td style="padding:8px;border:1px solid #e2e8f0">Rs. ${data.balance.toLocaleString()}</td></tr>
      </table>
      <p>Thank you for your payment.</p>
    </div>`);
}

export async function sendSaleInvoiceEmail(to: string, data: { customerName: string; invoiceNumber: string; total: number; date: string; companyName?: string }) {
  const cn = data.companyName || COMPANY_NAME;
  await sendEmail(to, `Invoice ${data.invoiceNumber} from ${cn}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0f172a">${cn}</h2>
      <h3>Sales Invoice</h3>
      <p>Dear ${data.customerName},</p>
      <p>Your invoice <strong>${data.invoiceNumber}</strong> has been generated.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Invoice</td><td style="padding:8px;border:1px solid #e2e8f0">${data.invoiceNumber}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Date</td><td style="padding:8px;border:1px solid #e2e8f0">${data.date}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Total</td><td style="padding:8px;border:1px solid #e2e8f0">Rs. ${data.total.toLocaleString()}</td></tr>
      </table>
      <p>Thank you for your business.</p>
    </div>`);
}

export async function sendPasswordResetEmail(to: string, data: { resetUrl: string; expiryMinutes: number }) {
  await sendEmail(to, 'Password Reset Request', `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0f172a">${COMPANY_NAME}</h2>
      <h3>Password Reset</h3>
      <p>Click the link below to reset your password. It expires in ${data.expiryMinutes} minutes and can only be used once:</p>
      <p><a href="${data.resetUrl}">${data.resetUrl}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>`);
}
