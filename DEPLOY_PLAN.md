# Sitara ERP — VPS Production Deployment Plan

> **Rule:** Every remote step needs explicit approval before execution. Risky steps are marked ⚠️.
> Assumes repo cloned to `/root/sitara`. Secrets created ON the VPS, never committed.

## 0. Preconditions (user does these, no approval needed to verify)
- [ ] Cloudflare: `app.sitarapurse.com` and `api.sitarapurse.com` DNS records point at the VPS.
  Verify: `dig +short app.sitarapurse.com` and `dig +short api.sitarapurse.com` — both should return Cloudflare-proxied IPs.
- [ ] Add 2 GB swap (box has 3.7 GB RAM, ~200 MB free, **zero swap**):
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```
  Verify: `swapon -s` → 2G swap active; `free -h` → Swap: 2.0 GiB.

---

## 1. Clone + Install (low risk)
```bash
cd /root && git clone git@github.com:maxsolbiz/sitara-erp.git sitara && cd sitara
npm ci
```

---

## 2. System Postgres — Dedicated DB + User (⚠️ Creates new database objects; does not touch existing DBs)
```bash
sudo -u postgres psql -c "CREATE USER sitara_prod WITH PASSWORD '<GENERATE_AND_FILL_IN>';"
sudo -u postgres psql -c "CREATE DATABASE sitara_prod OWNER sitara_prod;"
# Generate password locally first: openssl rand -hex 24
```

---

## 3. Redis Install (⚠️ apt install + service start)
```bash
apt update && apt install -y redis-server
systemctl enable --now redis-server
ss -tlnp | grep 6379   # expect 127.0.0.1:6379 ONLY
```
If it shows `0.0.0.0:6379` → edit `/etc/redis/redis.conf`: `bind 127.0.0.1 -::1`, `requirepass <generated>`, `systemctl restart redis-server`, re-verify.
Generate password: `openssl rand -hex 24 > /root/.sitara_redis_pass && chmod 600 /root/.sitara_redis_pass`
Update `.env` with `REDIS_URL=redis://:<password>@127.0.0.1:6379`

---

## 3b. Redis Password in .env
```bash
RPW=$(cat /root/.sitara_redis_pass)
sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:${RPW}@127.0.0.1:6379|" /root/sitara/.env
```

---

## 4. Production .env on the VPS (⚠️ Contains secrets — create by hand, chmod 600, never commit)
```bash
cp /root/sitara/.env.example /root/sitara/.env && chmod 600 /root/sitara/.env && nano /root/sitara/.env
```
Fill **all** values:
```
NODE_ENV=production
PORT=3103
API_PREFIX=api/v1
DATABASE_URL=postgresql://sitara_prod:<step2_password>@127.0.0.1:5432/sitara_prod?schema=public
REDIS_URL=redis://:<step3b_password>@127.0.0.1:6379
JWT_SECRET=<fresh openssl rand -hex 32>
JWT_REFRESH_SECRET=<fresh openssl rand -hex 32, DIFFERENT from JWT_SECRET>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
NEXT_PUBLIC_API_URL=https://api.sitarapurse.com/api/v1
S3_ENDPOINT=
S3_REGION=nbg1
S3_BUCKET=sitara-uploads
S3_ACCESS_KEY=
S3_SECRET_KEY=
RESEND_API_KEY=
MAIL_FROM=noreply@sitarapurse.com
SENTRY_DSN=
LOG_LEVEL=info
LOG_FORMAT=json
```

Verify:
```
ls -la /root/sitara/.env  # -rw------- root
grep -c '=' /root/sitara/.env     # expect ~20 keys
grep -oE '^[A-Z_]+=' /root/sitara/.env  # list keys only
for k in DATABASE_URL REDIS_URL JWT_SECRET JWT_REFRESH_SECRET NEXT_PUBLIC_API_URL; do
  grep "^$k=" /root/sitara/.env | wc -c  # confirm non-empty
done
```

---
```bash
cd /root/sitara && npx prisma migrate status
```
**Expected:** Exactly ONE pending migration (`20260914120000_add_password_security_fields`), nothing else unexpected.
If it shows ANY other drift or unexpected pending migrations, **STOP** — do not proceed, report back for review before touching production data.

Only if clean:
```bash
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```
Verify: `npx prisma migrate status` shows zero pending.

---

## 5. Build (Low risk)
```bash
cd /root/sitara && npm run build -w apps/api && npm run build -w apps/web
```

---

## 6. PM2 Start + Health Checks (⚠️ Starts public-serving processes)
```bash
mkdir -p /var/log/sitara
cp /root/sitara/deploy/vps/ecosystem.config.js /root/sitara/ecosystem.config.js
cd /root/sitara && pm2 start ecosystem.config.js
pm2 list          # expect sitara-api, sitara-worker, sitara-web = online
pm2 save          # persist across reboots
curl -s http://127.0.0.1:3103/api/v1/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3104/
```

---

## 6b. Set One-Time Password for Production Admin (⚠️ CRITICAL — run AFTER migration + restart)

> **⚠️ IMPORTANT: After this step, your CURRENT saved admin password will stop working. You will be forced through the new /force-password screen on next login using the temp password from this step.**

```bash
cd /root/sitara
npx tsx apps/api/scripts/set-temp-password.ts maxsolbiz@gmail.com sitarapurse
```
This sets `mustChangePassword=true`, kills existing sessions, and prints the temp password **ONCE** to console — capture it immediately, store in password manager, do not let it end up in logs.
After this, your **current saved admin password will stop working**. You must use the temp password and go through the new `/force-password` screen on next login.

---

## 7. Apache vhosts (⚠️ Touches shared Apache — reload only, no restarts of other sites)
```bash
cp /root/sitara/deploy/vps/apache-app.sitarapurse.com.conf /etc/apache2/sites-available/
cp /root/sitara/deploy/vps/apache-api.sitarapurse.com.conf /etc/apache2/sites-available/
a2ensite app.sitarapurse.com api.sitarapurse.com
apache2ctl configtest   # MUST say "Syntax OK" before reload
systemctl reload apache2   # reload, not restart — doesn't drop existing connections
```

**Immediate sanity check (existing sites):**
```bash
for u in http://club.maxsolbiz.com/ http://event.maxsolbiz.com/ https://club.maxsolbiz.com/ https://event.maxsolbiz.com/; do
  curl -s -o /dev/null -w "EXISTING $u -> %{http_code}\n" --max-time 15 "$u"
done
```

**New sites (direct-to-Apache, bypass Cloudflare):**
```bash
curl -s -o /dev/null -w "app-local:%{http_code}\n" --max-time 15 -H 'Host: app.sitarapurse.com' http://127.0.0.1/
curl -s -o /dev/null -w "api-local:%{http_code}\n" --max-time 15 -H 'Host: api.sitarapurse.com' http://127.0.0.1/api/v1/health
```

---

## 8. TLS via certbot (⚠️ Issues public certs; requires DNS confirmed in Step 0)
```bash
# Re-verify DNS before running
dig +short app.sitarapurse.com api.sitarapurse.com

certbot --apache -d app.sitarapurse.com -d api.sitarapurse.com \
  --non-interactive --agree-tos --register-unsafely-without-email --redirect
```
Then:
```
apache2ctl configtest
# re-verify existing sites:
curl -s -o /dev/null -w "%{http_code}\n" http://club.maxsolbiz.com/
curl -s -o /dev/null -w "%{http_code}\n" http://event.maxsolbiz.com/
curl -s -o /dev/null -w "%{http_code}\n" https://club.maxsolbiz.com/
curl -s -o /dev/null -w "%{http_code}\n" https://event.maxsolbiz.com/
# New sites:
curl -s -o /dev/null -w "%{http_code}\n" https://app.sitarapurse.com/
curl -s -o /dev/null -w "%{http_code}\n" https://api.sitarapurse.com/api/v1/health
```

---

## 8b. Re-verify existing sites still healthy after certbot
```
EXISTING http://club.maxsolbiz.com/ -> 301
EXISTING http://event.maxsolbiz.com/ -> 301
EXISTING https://club.maxsolbiz.com/ -> 307
EXISTING https://event.maxsolbiz.com/ -> 200
```

---

## 9. Final HTTPS Verification (through Cloudflare, the real traffic path)
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://app.sitarapurse.com/
curl -s -o /dev/null -w "%{http_code}\n" https://api.sitarapurse.com/api/v1/health
```
Both must return **200**.

---

## 9b. (User action) — Manual Walkthrough
1. SSH in and run: `cat /root/.sitara_admin_pass` → save to password manager → `rm /root/.sitara_admin_pass`
2. Go to `https://app.sitarapurse.com`, log in, do manual walkthrough:
   - Dashboard loads
   - Add a product (if none exist yet)
   - Run one POS sale
   - Verify sale appears in sales list and stock decremented correctly

---

## Standing Follow-ups (separate tickets, not blocking launch)
- [ ] Dependency patch round (`next`, `multer`, `nodemailer`) — rebuild + full re-verify
- [ ] VPS-level `pg_dump` cron to off-server storage (app backups don't survive VPS failure)
- [ ] Tighten cross-repo SSH key (deploy key per repo, not personal key)
- [ ] Fill S3/Resend in `.env` when ready (currently graceful degradation)
- [ ] Git LFS for 60 MB `GeoLite2-City.mmdb` (GitHub flagged it)

---

**End of deploy plan.** Nothing executes until you say "go" on each step.