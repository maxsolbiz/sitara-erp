/**
 * Tenant slug rules — slugs double as future DNS subdomain labels
 * (<slug>.sitarapurse.com), so they must satisfy the DNS LDH rule
 * (RFC 1035 §2.3.1 as relaxed by RFC 1123 §2.1: letters, digits,
 * hyphens; must start and end with an alphanumeric; max 63 chars
 * per label — we cap at 50, min 3, matching the registration schema).
 * Single source of truth for route validation AND the service layer
 * (which scripts/tests can call directly, bypassing zod).
 */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Subdomains that must never become tenant slugs: infrastructure names,
 * well-known service names, and common phishing/confusion targets.
 * Compared case-insensitively (slugs are lowercase-enforced anyway).
 */
export const RESERVED_TENANT_SLUGS: ReadonlySet<string> = new Set([
  // Infrastructure / DNS
  'app', 'api', 'www', 'mail', 'ftp', 'ssh', 'ns1', 'ns2', 'mx',
  'smtp', 'pop', 'imap', 'db', 'database', 'cdn', 'static', 'assets',
  // Environments / internal
  'admin', 'staging', 'dev', 'test', 'local', 'localhost', 'internal',
  'monitor', 'status', 'portal', 'dashboard',
  // Product-adjacent / abuse targets
  'support', 'help', 'docs', 'blog', 'auth', 'login', 'webhook',
  'example', 'git',
]);

export function isReservedTenantSlug(slug: string): boolean {
  return RESERVED_TENANT_SLUGS.has(slug.toLowerCase());
}

export function isValidTenantSlug(slug: string): boolean {
  if (typeof slug !== 'string') return false;
  if (slug.length < 3 || slug.length > 50) return false;
  if (!TENANT_SLUG_PATTERN.test(slug)) return false;
  return !isReservedTenantSlug(slug);
}
