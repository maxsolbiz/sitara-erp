# Sitara ERP — VPS Deploy Checklist (178.105.109.19, bare metal, no Docker)

> Rule: every remote step needs explicit approval first. Risky steps are marked ⚠️.
> Assumes repo cloned to /root/sitara. Secrets are created ON the VPS, never committed.

## 0. Preconditions (user does these, no approval needed to verify)
- [ ] Cloudflare: `app.sitarapurse.com` and `api.sitarapurse.com` DNS records point at the VPS.
  Verify: `dig +short app.sitarapurse.com api.sitarapurse.com` should return the VPS IP.
- [ ] Memory verdict: **CAUTION — add 2 GB swap before deploying** (box has 3.7 GB RAM,
  ~200 MB free, **zero swap**; ~8 Node processes already running). Swap does not fix
  a real shortage but prevents OOM-kills on spikes:
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```

## 1. Clone + install (low risk)
```bash
cd /root && git clone git@github.com:maxsolbiz/sitara-erp.git sitara && cd sitara
npm ci
```

## 2. System Postgres — dedicated DB + user (⚠️ new database objects; does not touch existing DBs)
```bash
sudo -u postgres psql -c "CREATE USER sitara_prod WITH PASSWORD '<GENERATE_AND_FILL_IN>';"
sudo -u postgres psql -c "CREATE DATABASE sitara_prod OWNER sitara_prod;"
# Generate the password locally first: openssl rand -hex 24
```

## 3. Redis install (⚠️ apt install + service start)
```bash
apt update && apt install -y redis-server
systemctl enable --now redis-server
ss -tlnp | grep 6379   # expect 127.0.0.1:6379 ONLY — Ubuntu default binds localhost; if it shows 0.0.0.0, set `bind 127.0.0.1` + `requirepass <secret>` in /etc/redis/redis.conf and restart
```

## 4. Production .env on the VPS (⚠️ contains secrets — create by hand, chmod 600, never commit)
```bash
cp /root/sitara/.env.example /root/sitara/.env && chmod 600 /root/sitara/.env && nano /root/sitara/.env
# Fill: NODE_ENV=production, PORT=3103, DATABASE_URL (sitara_prod creds from step 2),
# REDIS_URL=redis://localhost:6379, JWT_SECRET + JWT_REFRESH_SECRET (fresh `openssl rand -hex 32` each),
# NEXT_PUBLIC_API_URL=https://api.sitarapurse.com/api/v1, S3/Resend/Sentry as needed.
```

## 5. Build (low risk)
```bash
cd /root/sitara && npm run build -w apps/api && npm run build -w apps/web
```

## 6. PM2 start (⚠️ starts public-serving processes)
```bash
mkdir -p /var/log/sitara
cp /root/sitara/deploy/vps/ecosystem.config.js /root/sitara/ecosystem.config.js
cd /root/sitara && pm2 start ecosystem.config.js
pm2 list            # expect sitara-api, sitara-worker, sitara-web online
pm2 save            # persist so systemd resurrects on reboot (pm2-root already enabled)
curl -s http://127.0.0.1:3103/api/v1/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3104/
```

## 7. Apache vhosts HTTP-only (⚠️ touches shared Apache config — reload only, no restarts of other sites)
```bash
cp /root/sitara/deploy/vps/apache-app.sitarapurse.com.conf /etc/apache2/sites-available/
cp /root/sitara/deploy/vps/apache-api.sitarapurse.com.conf /etc/apache2/sites-available/
a2ensite app.sitarapurse.com api.sitarapurse.com
apache2ctl configtest   # MUST say "Syntax OK" before reload
systemctl reload apache2
```

## 8. TLS via certbot (⚠️ issues public certs; requires step 0 DNS done)
```bash
certbot --apache -d app.sitarapurse.com -d api.sitarapurse.com
# Verify: curl -s -o /dev/null -w "%{http_code}\n" https://app.sitarapurse.com/
# Verify: curl -s -o /dev/null -w "%{http_code}\n" https://api.sitarapurse.com/api/v1/health
```

## 9. Post-deploy verification (read-only)
- Login via https://app.sitarapurse.com/ as admin, spot-check dashboard/POS.
- Confirm no secrets in responses; confirm rate-limit headers present.
- Schedule: VPS-level pg_dump cron to off-server storage (app backups alone don't survive VPS loss) — separate task, needs approval.
