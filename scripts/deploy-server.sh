#!/usr/bin/env bash
# Nasazení nové verze Srubu Podkozí na vlastním serveru. Spouští root:
#   bash /opt/srub-podkozi/app/scripts/deploy-server.sh
# Postup: záloha databáze → git pull → závislosti → testy → restart → kontrola.
# Když krok před restartem selže, skript skončí a běžící verze zůstane beze změny.
set -euo pipefail

APP=/opt/srub-podkozi/app
SERVICE=srub-podkozi
run() { sudo -u srub "$@"; }

echo "1/6 Záloha databáze před nasazením"
systemctl start srub-podkozi-backup.service

echo "2/6 Stažení nové verze z GitHubu"
cd "$APP"
before=$(run git rev-parse --short HEAD)
run git pull --ff-only --quiet
after=$(run git rev-parse --short HEAD)
echo "    $before -> $after"

echo "3/6 Instalace závislostí"
run npm ci --omit=dev --no-audit --no-fund --loglevel=error

echo "4/6 Testy"
run npm test --silent

echo "5/6 Restart služby"
systemctl restart "$SERVICE"
sleep 4

echo "6/6 Kontrola"
systemctl is-active --quiet "$SERVICE" || { systemctl status "$SERVICE" --no-pager; exit 1; }
curl -fsS -m 10 -o /dev/null http://127.0.0.1:3020/api/me
curl -fsS -m 10 -o /dev/null http://127.0.0.1/
echo "Hotovo: běží verze $after"
