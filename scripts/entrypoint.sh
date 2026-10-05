#!/bin/sh
# Point d'entrée du conteneur : vérifie que /data est accessible en écriture par l'utilisateur
# courant (node, uid 1000) avant de lancer le serveur. Un bind mount créé par Docker appartient
# à root et ferait échouer l'ouverture de la base (SQLITE_CANTOPEN) sans message compréhensible.
set -eu

DATA_DIR="$(dirname "${DATABASE_PATH:-/data/lamal.db}")"

if [ ! -d "$DATA_DIR" ] || [ ! -w "$DATA_DIR" ]; then
  echo "ERREUR : le dossier des données « $DATA_DIR » n'est pas accessible en écriture par l'utilisateur $(id -u)." >&2
  echo "Sur l'hôte, dans le dossier de docker-compose.yml, exécutez :" >&2
  echo "    mkdir -p data && sudo chown 1000:1000 data" >&2
  echo "puis relancez : docker compose up -d" >&2
  exit 1
fi

# Base, journal WAL et copies créés lisibles par ce seul utilisateur (données de santé).
umask 077

exec "$@"
