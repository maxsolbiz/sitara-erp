#!/usr/bin/env bash
# Sitara ERP — routine redeploy (web + api). Run ON the VPS as root.
#   bash /root/sitara/deploy/vps/deploy-sitara.sh
# Scope guardrails:
#   - Only touches /root/sitara and the exact PM2 names below.
#   - NEVER restarts/reloads anything else (meezan-*, hbl-pwa, club-mgt-*,
#     apache, postgres, redis). No DB/secret/config steps — those are
#     one-time setup in DEPLOY_CHECKLIST.md, not part of routine deploys.
set -euo pipefail

REPO_DIR="/root/sitara"
PM2_APPS=(sitara-api sitara-worker sitara-web)
API_HEALTH="http://127.0.0.1:3103/api/v1/health"
WEB_URL="http://127.0.0.1:3104/"

log() { echo "[deploy-sitara] $*"; }
fail() { echo "[deploy-sitara] FATAL: $*" >&2; exit 1; }

# --- 0. Preflight (read-only) ---
[ -d "$REPO_DIR/.git" ] || fail "$REPO_DIR is not a git repo"
[ -z "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ] \
  || fail "tracked files dirty in $REPO_DIR — commit/stash first"
free -h | head -2
swapon -s || fail "no swap active — do not build under memory pressure"

# --- 1. Pull (fast-forward only) ---
git -C "$REPO_DIR" pull --ff-only \
  || fail "pull failed or non-fast-forward — resolve manually"

# --- 2. Build ---
(cd "$REPO_DIR" && npm run build -w apps/api) || fail "api build failed"
(cd "$REPO_DIR" && npm run build -w apps/web) || fail "web build failed"

# --- 3. Restart ONLY the Sitara apps, by exact name ---
pm2 restart "${PM2_APPS[@]}" || fail "pm2 restart failed"
pm2 save || fail "pm2 save failed"

# --- 4. Local health gate ---
sleep 12
API_OUT="$(curl -s --max-time 20 "$API_HEALTH")" \
  || fail "api health unreachable"
echo "$API_OUT" | grep -q '"status":"ok"' \
  || fail "api health bad: $API_OUT"
WEB_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$WEB_URL")"
[ "$WEB_CODE" = "200" ] || fail "web returned $WEB_CODE, expected 200"

log "OK — api + web healthy. Public check: https://app.sitarapurse.com/"
