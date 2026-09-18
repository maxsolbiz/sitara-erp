# Sitara Cloudflare DNS — reference (NO SECRETS IN THIS FILE)

> Rule: secret values live ONLY in `C:\Users\Max\.sitara-cloudflare.env`
> (outside every git repo). This doc records everything else: purpose,
> scope, locations, procedures. Never paste token values here, in chat
> beyond initial setup, or in any committed file.

## Purpose

Wildcard `*.sitarapurse.com` DNS + certbot DNS-01 challenges for the
subdomain-login feature (`<slug>.sitarapurse.com` per tenant).

## Credential

- **Location:** `C:\Users\Max\.sitara-cloudflare.env` (`$env:CF_SITARA_TOKEN`,
  `$env:CF_SITARA_ZONE_ID`). Home directory, next to `.ssh`.
- **Scope:** `sitarapurse.com` zone, DNS-edit only. Nothing else.
- **Verified:** token authenticates; zone listed as active; DNS-read probe
  succeeds. Write scope proves itself at first write (fail-closed).
- **Hygiene:** values were shared in chat during setup — treat as
  semi-public. Rotate after the wildcard cert is issued and working,
  then update only the home-dir file.

## VPS side (set during the infra phase, not routine deploys)

- Certbot DNS credentials: `/root/.cloudflare.ini` (`chmod 600`,
  `dns_cloudflare_api_token = <value>`), consumed by the certbot
  DNS plugin. Created by `dns-certbot.ps1`, never committed.
- Apache: `ServerAlias *.sitarapurse.com` on the app vhost (scoped to
  this domain only — must not hijack sibling vhosts on the shared box).

## Procedures

- Verify token (read-only, no secrets printed — lengths/status only):
  `tokens/verify`-equivalent via zone list + one TXT-record read.
  See `deploy/vps/dns-certbot.ps1` (verify mode).
- Rotate: mint new token (Edit zone DNS template, this zone only),
  replace the value in the home-dir file, re-verify, delete the old
  token in the dashboard.
