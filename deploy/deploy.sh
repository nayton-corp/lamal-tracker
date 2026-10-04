#!/usr/bin/env bash
# Mise à jour, toujours en deux temps : staging d'abord, production ensuite.
#   ./deploy.sh staging sha-1a2b3c4   nouvelle version sur le staging
#   ./deploy.sh prod sha-1a2b3c4      même version en production (après contrôle sur le staging)
#   ./deploy.sh rollback              production revenue à la version précédente
# Les migrations de schéma s'appliquent au démarrage ; une copie de la base est faite juste avant
# (data/prod/backups). Pas de mise en production non urgente du 16 au 30 novembre (--urgent).
set -euo pipefail
cd "$(dirname "$0")"

HISTORY=.deploy-history
usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

set_var() { # set_var NOM valeur : remplace la ligne NOM=… de .env
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
current() { grep "^$1=" .env | cut -d= -f2-; }

wait_healthy() { # wait_healthy service
  for _ in $(seq 1 30); do
    if docker compose exec -T "$1" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      return 0
    fi
    sleep 4
  done
  return 1
}

[ -f .env ] || { echo "Fichier .env manquant (voir env.example)." >&2; exit 1; }
target="${1:-}"; tag="${2:-}"; flag="${3:-}"

case "$target" in
  staging)
    [[ "$tag" =~ ^(sha-[0-9a-f]{7,}|latest|v[0-9.]+)$ ]] || usage
    set_var STAGING_TAG "$tag"
    docker compose pull staging
    docker compose up -d staging
    if wait_healthy staging; then echo "Staging en $tag. Vérifiez https://$(current STAGING_DOMAIN) avant la production."
    else echo "Le staging ne répond pas : docker compose logs staging" >&2; exit 1; fi
    ;;
  prod)
    [[ "$tag" =~ ^(sha-[0-9a-f]{7,}|v[0-9.]+)$ ]] || { echo "En production, un tag figé (sha-… ou v…), jamais latest." >&2; exit 1; }
    if [ "$(current STAGING_TAG)" != "$tag" ] && [ "$flag" != "--sans-staging" ]; then
      echo "Le staging n'est pas en $tag : ./deploy.sh staging $tag d'abord (ou --sans-staging)." >&2; exit 1
    fi
    md="$(date +%m%d)"
    if [ "$md" -ge 1116 ] && [ "$md" -le 1130 ] && [ "$flag" != "--urgent" ]; then
      echo "Fin novembre : les foyers envoient leurs résiliations. Mise en production seulement si urgent (--urgent)." >&2; exit 1
    fi
    previous="$(current APP_TAG)"
    echo "$(date -Iseconds) $previous -> $tag" >> "$HISTORY"
    set_var APP_TAG "$tag"
    docker compose pull app
    docker compose up -d app
    if wait_healthy app; then echo "Production en $tag (avant : $previous)."
    else
      echo "La production ne répond pas en $tag. Retour arrière : ./deploy.sh rollback" >&2
      echo "Si la migration du schéma a échoué, la base n'a pas changé ; sinon voir data/prod/backups." >&2
      exit 1
    fi
    ;;
  rollback)
    previous="$(tail -n 1 "$HISTORY" 2>/dev/null | awk '{print $2}')"
    [ -n "$previous" ] || { echo "Aucune version précédente connue." >&2; exit 1; }
    echo "$(date -Iseconds) $(current APP_TAG) -> $previous (retour arrière)" >> "$HISTORY"
    set_var APP_TAG "$previous"
    docker compose up -d app
    wait_healthy app && echo "Production revenue en $previous." || { echo "Toujours en panne : docker compose logs app" >&2; exit 1; }
    ;;
  *) usage ;;
esac
