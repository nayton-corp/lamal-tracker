#!/usr/bin/env bash
# Préparation d'un VPS neuf (Debian 12 ou Ubuntu 24.04), à lancer UNE fois avec sudo par
# l'utilisateur qui se connecte déjà en SSH avec sa clé :
#   sudo ./provision.sh
# Connexion SSH par clé uniquement, pare-feu (22, 80, 443), mises à jour de sécurité automatiques,
# fail2ban, Docker, dossier /opt/primes-lamal. Relançable sans risque.
set -euo pipefail

APP_DIR=/opt/primes-lamal
ADMIN_USER="${SUDO_USER:-}"

if [ "$(id -u)" -ne 0 ]; then echo "À lancer avec sudo." >&2; exit 1; fi
if [ -z "$ADMIN_USER" ] || [ "$ADMIN_USER" = root ]; then
  echo "Lancez ce script avec sudo depuis votre compte habituel (pas directement en root)." >&2
  exit 1
fi
ADMIN_HOME="$(getent passwd "$ADMIN_USER" | cut -d: -f6)"
# Garde-fou : on ne coupe pas les mots de passe SSH tant qu'aucune clé n'est installée.
if [ ! -s "$ADMIN_HOME/.ssh/authorized_keys" ]; then
  echo "Aucune clé SSH dans $ADMIN_HOME/.ssh/authorized_keys : ajoutez-en une (ssh-copy-id) avant de continuer." >&2
  exit 1
fi

echo "== Paquets et mises à jour"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades apt-listchanges
timedatectl set-timezone Europe/Zurich

echo "== Mises à jour de sécurité automatiques (redémarrage à 4 h 30 si nécessaire)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
cat > /etc/apt/apt.conf.d/52primes-lamal <<'CONF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
CONF

echo "== SSH : clé uniquement, pas de root"
cat > /etc/ssh/sshd_config.d/10-primes-lamal.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
X11Forwarding no
MaxAuthTries 3
CONF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo "== Pare-feu"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== fail2ban (SSH)"
cat > /etc/fail2ban/jail.d/primes-lamal.conf <<'CONF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
CONF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== Docker (dépôt officiel)"
if ! command -v docker >/dev/null; then
  . /etc/os-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'CONF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "no-new-privileges": true
}
CONF
systemctl enable docker
systemctl restart docker
usermod -aG docker "$ADMIN_USER"

echo "== Mémoire d'appoint (1 Go)"
if ! swapon --show | grep -q .; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Dossier de l'app : $APP_DIR"
mkdir -p "$APP_DIR/data/prod" "$APP_DIR/data/staging" "$APP_DIR/secrets"
chown -R 1000:1000 "$APP_DIR/data"
chown "$ADMIN_USER":"$ADMIN_USER" "$APP_DIR" "$APP_DIR/secrets"
chmod 700 "$APP_DIR/secrets"

echo
echo "Terminé. Déconnectez-vous puis reconnectez-vous (groupe docker), puis suivez docs/mise-en-ligne.md."
