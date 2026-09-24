// This server's own public addresses, verified 2026-09-24 via `ip addr`
// (inet 178.105.109.19/32 dynamic eth0, inet6 2a01:4f8:c014:6ae8::1/64).
// Why: server-originated calls (e.g. the Next rewrite proxying app-host
// /api/* to the public API URL) leave through Cloudflare and arrive carrying
// the server's own public address in X-Forwarded-For. Trusting these lets
// Express resolve past them to the real client instead of collapsing all
// app-host traffic into one server-IP bucket. The IPv4 is DHCP-assigned
// ("dynamic"): if either address changes (migration, readdressing), update
// this list - a stale entry only falls back to shared-bucket keying for that
// path, never a bypass. Only requests originating from this box can carry
// these addresses in a trusted position.
export const SERVER_OWN_ADDRESSES: string[] = ['178.105.109.19/32', '2a01:4f8:c014:6ae8::1/128'];
