import crypto from 'crypto';

const PREFIX = 'v1';
const MASK_CHAR = '•';

function getKey(): Buffer {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('SETTINGS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const parts = String(stored || '').split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Unsupported secret format');
  }
  const [, ivHex, ctHex, tagHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
}

export function maskSecret(plaintext: string): string {
  const s = String(plaintext ?? '');
  if (!s) return '';
  if (s.length <= 8) return MASK_CHAR.repeat(4);
  return s.slice(0, 4) + MASK_CHAR.repeat(s.length - 8) + s.slice(-4);
}

export function isMaskedPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && value.includes(MASK_CHAR);
}
