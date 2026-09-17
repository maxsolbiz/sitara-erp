# Sitara ERP — routine redeploy from this Windows machine over SSH.
# Usage:  .\deploy\vps\deploy-sitara.ps1
# Optional env overrides: VPS_HOST, VPS_USER, SSH_KEY_PATH
# (defaults match D:\Meezan\infra.env — no secrets stored here).
#
# Scope guardrails: only /root/sitara + PM2 names sitara-api,
# sitara-worker, sitara-web. Fails closed at every step.
$ErrorActionPreference = 'Stop'

$VpsHost = if ($env:VPS_HOST) { $env:VPS_HOST } else { '178.105.109.19' }
$VpsUser = if ($env:VPS_USER) { $env:VPS_USER } else { 'root' }
$SshKey  = if ($env:SSH_KEY_PATH) { $env:SSH_KEY_PATH } else { "$HOME\.ssh\meezan_vps" }
$RepoDir = '/root/sitara'

function Invoke-Remote([string]$Command, [string]$Label) {
  Write-Host "[deploy-sitara] $Label..."
  & ssh -i $SshKey -o ConnectTimeout=15 -o BatchMode=yes "$VpsUser@$VpsHost" $Command
  if ($LASTEXITCODE -ne 0) { throw "FAILED: $Label (exit $LASTEXITCODE)" }
}

# --- 0. Preflight (read-only) ---
Invoke-Remote 'free -h | head -2; swapon -s; pm2 list | grep -E "sitara-(api|worker|web)"; git -C /root/sitara status --porcelain --untracked-files=no; test -z "$(git -C /root/sitara status --porcelain --untracked-files=no)" && echo TREE_CLEAN' 'preflight'

# --- 1. Pull + build ---
Invoke-Remote "git -C $RepoDir pull --ff-only" 'git pull --ff-only'
Invoke-Remote "cd $RepoDir && npm run build -w apps/api" 'build api'
Invoke-Remote "cd $RepoDir && npm run build -w apps/web" 'build web'

# --- 2. Restart Sitara apps only, persist, health-gate ---
Invoke-Remote 'pm2 restart sitara-api sitara-worker sitara-web && pm2 save && sleep 12' 'pm2 restart + save'
Invoke-Remote 'curl -s --max-time 20 http://127.0.0.1:3103/api/v1/health | grep -q status....ok && test "$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 http://127.0.0.1:3104/)" = "200" && echo HEALTH_OK' 'localhost health gate'

Write-Host '[deploy-sitara] OK — now hard-refresh the site (Ctrl+Shift+R) and confirm console is clean.'
