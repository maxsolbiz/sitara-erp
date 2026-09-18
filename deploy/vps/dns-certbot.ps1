# Sitara Cloudflare DNS + wildcard cert -- ONE-TIME infra phase.
# This script NEVER runs as part of routine deploys (deploy-sitara.*).
#
# Usage:
#   .\deploy\vps\dns-certbot.ps1                  # verify-only (default, read-only)
#   .\deploy\vps\dns-certbot.ps1 -ExecuteInfra    # perform the infra changes (needs approval)
#
# Reads the token from C:\Users\Max\.sitara-cloudflare.env (outside git).
# The token VALUE never appears in this file, in output, or in logs --
# only lengths and status codes are printed.
#
# Scope guardrails: sitarapurse.com zone ONLY. No other zones, no other
# VPS projects, no firewall changes, Apache reload (never restart).
param([switch]$ExecuteInfra)

$ErrorActionPreference = 'Stop'

# NOTE: dot-sourcing the whole env file silently yields empty values in
# some shells (observed with infra.env-style files) -- so only the
# assignment lines are invoked, never the full file blindly.
$EnvFile = 'C:\Users\Max\.sitara-cloudflare.env'
if (-not (Test-Path $EnvFile)) { throw "Missing $EnvFile -- see deploy/vps/cloudflare-dns.md" }
Get-Content $EnvFile | Select-String -Pattern '^\$env:CF_SITARA_(TOKEN|ZONE_ID)=' | ForEach-Object { Invoke-Expression $_.Line }
if ([string]::IsNullOrEmpty($env:CF_SITARA_TOKEN)) { throw 'CF_SITARA_TOKEN missing -- see deploy/vps/cloudflare-dns.md' }
if ([string]::IsNullOrEmpty($env:CF_SITARA_ZONE_ID)) { throw 'CF_SITARA_ZONE_ID missing -- run verification first' }

$VpsHost = if ($env:VPS_HOST) { $env:VPS_HOST } else { '178.105.109.19' }
$VpsUser = if ($env:VPS_USER) { $env:VPS_USER } else { 'root' }
$SshKey  = if ($env:SSH_KEY_PATH) { $env:SSH_KEY_PATH } else { "$HOME\.ssh\meezan_vps" }
$ZoneId  = $env:CF_SITARA_ZONE_ID
$ApiBase = "https://api.cloudflare.com/client/v4/zones/$ZoneId"
$Hdr = @{ Authorization = 'Bearer ' + $env:CF_SITARA_TOKEN }

function CfGet([string]$Path) {
  return Invoke-RestMethod -Headers $Hdr "$ApiBase$Path"
}

# --- Verify-only (default): read-only checks, secrets never printed ---
Write-Host '[dns-certbot] verifying token + zone (read-only)...'
$zone = CfGet ''
if ($zone.result.name -ne 'sitarapurse.com') { throw 'Zone mismatch -- aborting' }
Write-Host '[dns-certbot] zone OK: sitarapurse.com (active)'
$recs = CfGet '/dns_records?type=A&per_page=100'
$wild = @($recs.result | Where-Object { $_.name -eq '*.sitarapurse.com' })
Write-Host ('[dns-certbot] wildcard record present: ' + ($wild.Count -gt 0))
Write-Host ('[dns-certbot] token length: ' + $env:CF_SITARA_TOKEN.Length)

if (-not $ExecuteInfra) {
  Write-Host '[dns-certbot] Verify-only done. Re-run with -ExecuteInfra to perform changes (requires approval).'
  exit 0
}

# --- Infra phase (explicit opt-in only) ---
throw 'Infra execution not yet approved -- see cloudflare-dns.md. This switch is a placeholder until the DNS-01 plan is approved.'
