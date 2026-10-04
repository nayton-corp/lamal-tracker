#!/usr/bin/env bash
# Test de restauration (chaque nuit : systemd/primes-lamal-restore-test.timer). Restaure la dernière
# sauvegarde chiffrée dans un dossier temporaire, contrôle l'intégrité de la base, démarre l'image de
# production dessus sans réseau et vérifie que la clé maître ouvre bien les données. Résultat
# envoyé à RESTORE_PING_URL : une sauvegarde en retard ou illisible déclenche une alerte.
set -uo pipefail
cd "$(dirname "$0")"
PING="$(grep '^RESTORE_PING_URL=' .env | cut -d= -f2- || true)"
TAG="$(grep '^APP_TAG=' .env | cut -d= -f2-)"
IMAGE="ghcr.io/nayton-corp/lamal-tracker:$TAG"
NAME=primes-lamal-restore-test
work="$(mktemp -d /tmp/restauration.XXXXXX)"

fail() {
  echo "Restauration : ÉCHEC — $1" >&2
  [ -z "$PING" ] || curl -fsS --max-time 10 --retry 3 --data-raw "$1" "$PING/fail" >/dev/null
  cleanup; exit 1
}
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1; rm -rf "$work"; }

# 1. Dernière copie depuis le stockage objet (déchiffrée avec la clé age).
docker compose run --rm --no-deps -v "$work:/restore" litestream restore -config /etc/litestream.yml -o /restore/lamal.db /data/lamal.db \
  || fail "impossible de restaurer depuis le stockage objet"
[ -s "$work/lamal.db" ] || fail "copie restaurée vide"
chown -R 1000:1000 "$work" 2>/dev/null || sudo chown -R 1000:1000 "$work"

# 2. L'image de production démarre sur la copie, sans réseau, avec la clé maître de production.
docker run -d --name "$NAME" --network none --read-only --tmpfs /tmp --tmpfs /app/.next/cache \
  -v "$work:/data" -v "$PWD/secrets/master_key:/run/secrets/master_key:ro" \
  -e DATABASE_PATH=/data/lamal.db -e MASTER_KEY_FILE=/run/secrets/master_key -e DISABLE_SCHEDULER=true \
  "$IMAGE" >/dev/null || fail "l'image $TAG ne démarre pas"

healthy=""
for _ in $(seq 1 30); do
  docker exec "$NAME" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status===200?0:r.status===503?3:1)).catch(()=>process.exit(1))"
  rc=$?
  [ $rc -eq 0 ] && { healthy=yes; break; }
  [ $rc -eq 3 ] && fail "la clé maître n'ouvre pas les données restaurées"
  sleep 2
done
[ -n "$healthy" ] || fail "l'app ne répond pas sur la copie restaurée"

# 3. Intégrité de la base et nombre de comptes et de foyers, comparés à la production.
# SQLite intégré à Node (node:sqlite), en lecture seule.
count='const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1],{readOnly:true});
const ok=d.prepare("pragma integrity_check").get().integrity_check;
const n=t=>d.prepare("select count(*) n from "+t).get().n;
console.log(ok, n("app_user"), n("household"), n("household_key"));'
read -r ok users households keys < <(docker exec "$NAME" node --no-warnings -e "$count" /data/lamal.db) || fail "lecture de la copie impossible"
[ "$ok" = ok ] || fail "intégrité de la base : $ok"
read -r _ live_users live_households _ < <(docker compose exec -T app node --no-warnings -e "$count" /data/lamal.db) || fail "lecture de la production impossible"
# Quelques secondes d'écart sont possibles (inscription pendant le test) : tolérance de 2.
[ $(( live_users - users )) -le 2 ] && [ $(( live_households - households )) -le 2 ] \
  || fail "copie en retard : $users comptes et $households foyers, contre $live_users et $live_households en production"

echo "Restauration réussie : $users comptes, $households foyers, $keys clés de foyer ouvertes par la clé maître."
[ -z "$PING" ] || curl -fsS --max-time 10 --retry 3 "$PING" >/dev/null
cleanup
