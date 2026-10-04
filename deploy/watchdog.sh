#!/usr/bin/env bash
# Contrôle toutes les 5 minutes (systemd/primes-lamal-watchdog.timer) : le site répond en HTTPS
# depuis l'extérieur, le disque n'est pas plein, la sauvegarde continue tourne. Résultat envoyé à
# WATCHDOG_PING_URL (service de type healthchecks.io), qui alerte sur le téléphone.
set -uo pipefail
cd "$(dirname "$0")"
DOMAIN="$(grep '^DOMAIN=' .env | cut -d= -f2-)"
PING="$(grep '^WATCHDOG_PING_URL=' .env | cut -d= -f2-)"
problems=()

curl -fsS --max-time 15 "https://$DOMAIN/api/health" >/dev/null || problems+=("le site ne répond pas")
used="$(df -P data | awk 'NR==2 { gsub("%", "", $5); print $5 }')"
[ "${used:-0}" -lt 90 ] || problems+=("disque plein à ${used} %")
[ -n "$(docker compose ps --status running --quiet litestream)" ] || problems+=("sauvegarde continue arrêtée")

if [ ${#problems[@]} -eq 0 ]; then
  [ -z "$PING" ] || curl -fsS --max-time 10 --retry 3 "$PING" >/dev/null
else
  message="$(IFS=', '; echo "${problems[*]}")"
  echo "watchdog : $message" >&2
  [ -z "$PING" ] || curl -fsS --max-time 10 --retry 3 --data-raw "$message" "$PING/fail" >/dev/null
  exit 1
fi
