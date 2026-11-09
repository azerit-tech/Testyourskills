#!/usr/bin/env bash
#
# Partie VPS du déploiement de Testyourskills. Envoyée par scripts/deploy.sh sur
# l'entrée standard de `ssh azerit bash -s`, jamais lancée à la main (même
# modèle que ops/deploy-sequence-mail-remote.sh du dépôt App).
#
#   state                lignes clé=valeur lues par le Mac
#   deploy <sha>         image précédente gardée, build, bascule, attente « healthy »
#   rollback             image `precedent` remise en service, sans build
#
# N'affiche jamais le contenu du .env : seuls les NOMS des variables vides sont dits.
#
# Codes de sortie : 0 ok · 1 arrêt avant la bascule, ce qui sert n'a pas bougé ·
# 2 la nouvelle version tourne mais n'est pas « healthy » (journaux affichés).
#
set -euo pipefail
APP_DIR="/opt/testyourskills"
IMAGE="testyourskills"
CONTAINER="testyourskills"
NETWORK="ruby_default"
LOCK_DIR="/tmp/testyourskills-deploy.lock"
HEALTH_TIMEOUT="${TYS_HEALTH_TIMEOUT:-180}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERREUR: $*" >&2; exit 1; }

# docker inspect écrit une ligne vide sur stdout quand le conteneur n'existe
# pas : on capture, puis on décide.
inspect_or_absent() {
  local out
  if out="$(docker inspect --format "$1" "$CONTAINER" 2>/dev/null)" && [ -n "$out" ]; then
    echo "$out"
  else
    echo "absent"
  fi
}
container_state() { inspect_or_absent '{{.State.Status}}'; }
container_health() { inspect_or_absent '{{if .State.Health}}{{.State.Health.Status}}{{else}}sans-healthcheck{{end}}'; }
first_word() { awk '{print $1; exit}' "$1" 2>/dev/null || true; }

state() {
  if [ -d "$APP_DIR" ]; then echo "dir=ok"; else echo "dir=absent"; fi
  if [ -f "$APP_DIR/.env" ]; then echo "env=ok"; else echo "env=absent"; fi
  # les variables sans lesquelles l'app ne sert rien (GITHUB_TOKEN : elle s'arrête)
  local missing="" key
  for key in GITHUB_TOKEN OPENROUTER_API_KEY BASE_URL; do
    grep -qE "^${key}=.+" "$APP_DIR/.env" 2>/dev/null || missing="$missing $key"
  done
  echo "env_missing=${missing# }"
  if docker network inspect "$NETWORK" >/dev/null 2>&1; then echo "network=ok"; else echo "network=absent"; fi
  echo "container=$(container_state)"
  echo "health=$(container_health)"
  echo "commit=$(first_word "$APP_DIR/.deployed_commit")"
  if docker image inspect "$IMAGE:precedent" >/dev/null 2>&1; then
    echo "previous=yes"
    echo "previous_commit=$(first_word "$APP_DIR/.deployed_commit.precedent")"
  else
    echo "previous=no"
  fi
  if [ -d "$LOCK_DIR" ]; then echo "lock=$(cat "$LOCK_DIR/holder" 2>/dev/null || echo occupé)"; else echo "lock=free"; fi
  echo "disk_free=$(df -h --output=avail / | tail -1 | tr -d ' ')"
}

take_lock() {
  mkdir "$LOCK_DIR" 2>/dev/null || die "verrou $LOCK_DIR présent : un autre déploiement est en cours (ou a été interrompu : le retirer à la main)"
  echo "$$ $(date '+%Y-%m-%d %H:%M:%S')" > "$LOCK_DIR/holder"
}
release_lock() { rm -rf "$LOCK_DIR"; }

show_logs() {
  log "80 dernières lignes de docker logs $CONTAINER :"
  docker logs --tail 80 "$CONTAINER" 2>&1 | sed 's/^/    /' || true
}

# Attend que le HEALTHCHECK du Dockerfile passe (GET /api/health dans le conteneur).
wait_healthy() {
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT )) health
  while [ "$(date +%s)" -lt "$deadline" ]; do
    health="$(container_health)"
    case "$health" in
      healthy) log "$CONTAINER : healthy"; return 0 ;;
      unhealthy) log "$CONTAINER : unhealthy"; return 1 ;;
    esac
    sleep 3
  done
  log "$CONTAINER pas « healthy » après $HEALTH_TIMEOUT s (état « $(container_state) », santé « $(container_health) »)"
  return 1
}

# Avant de rebâtir : si la version en service est saine, son image devient
# `:precedent` et son commit .deployed_commit.precedent (un seul cran de retour).
# Une version malade ne remplace pas la précédente saine.
keep_previous() {
  local image_id
  if [ "$(container_health)" != "healthy" ]; then
    log "pas de version saine en service : $IMAGE:precedent reste où elle était"
    return 0
  fi
  image_id="$(docker inspect --format '{{.Image}}' "$CONTAINER")"
  docker tag "$image_id" "$IMAGE:precedent"
  if [ -f .deployed_commit ]; then
    # en place (cat >), jamais mv : le fichier garde son propriétaire
    cat .deployed_commit > .deployed_commit.precedent
  fi
  log "image en service étiquetée $IMAGE:precedent ($(first_word .deployed_commit.precedent))"
}

deploy() {
  local sha="$1"
  cd "$APP_DIR" || die "$APP_DIR absent"
  [ -f .env ] || die "$APP_DIR/.env absent : le créer d'abord (ops/DEPLOY.md, première mise en ligne)"
  [ -f docker-compose.yml ] || die "docker-compose.yml absent de $APP_DIR : l'envoi a échoué ?"
  docker network inspect "$NETWORK" >/dev/null 2>&1 || die "réseau docker $NETWORK absent : ruby-caddy ne pourrait pas joindre l'app"
  take_lock
  trap 'release_lock' EXIT

  log "==> image précédente"
  keep_previous

  log "==> build et bascule (nice -n 10)"
  # Le build tourne dans le démon docker : la vraie basse priorité est posée
  # dans le Dockerfile (RUN nice -n 10 …). Celle-ci couvre le client compose.
  # </dev/null partout : ce script arrive par l'entrée standard de bash, une
  # commande qui la lirait mangerait la suite du script.
  if ! nice -n 10 docker compose up -d --build </dev/null; then
    show_logs
    die "docker compose up a échoué : si c'est le build, l'ancien conteneur sert toujours"
  fi

  # La nouvelle image tourne désormais, saine ou non : .deployed_commit le dit.
  printf '%s\n' "${sha:0:12}" > .deployed_commit
  log ".deployed_commit = ${sha:0:12}"

  log "==> attente du HEALTHCHECK"
  if ! wait_healthy; then
    show_logs
    log "Retour à l'image précédente : scripts/deploy.sh --retour"
    exit 2
  fi
}

rollback() {
  cd "$APP_DIR" || die "$APP_DIR absent"
  docker image inspect "$IMAGE:precedent" >/dev/null 2>&1 || die "aucune image $IMAGE:precedent : rien à quoi revenir"
  take_lock
  trap 'release_lock' EXIT
  log "==> retour à $IMAGE:precedent ($(first_word .deployed_commit.precedent))"
  docker tag "$IMAGE:precedent" "$IMAGE:latest"
  docker compose up -d --no-build --force-recreate </dev/null
  if [ -f .deployed_commit.precedent ]; then
    cat .deployed_commit.precedent > .deployed_commit
    log ".deployed_commit = $(first_word .deployed_commit)"
  fi
  if ! wait_healthy; then
    show_logs
    exit 2
  fi
}

case "${1:-}" in
  state) state ;;
  deploy) [ -n "${2:-}" ] || die "usage : deploy <sha>"; deploy "$2" ;;
  rollback) rollback ;;
  *) die "usage : state | deploy <sha> | rollback" ;;
esac
