#!/usr/bin/env bash
#
# Déploiement de Testyourskills sur le VPS `azerit`, dans /opt/testyourskills,
# servi sur https://skills.azerit.tech par ruby-caddy. À lancer DEPUIS LE MAC,
# dans un clone propre, sur master à jour avec origin. Même modèle que
# ops/deploy-sequence-mail.sh du dépôt App.
#
#   scripts/deploy.sh --plan      # vérifie tout, rsync à blanc, n'écrit rien
#   scripts/deploy.sh             # déploie master (confirmation « oui »)
#   scripts/deploy.sh --oui       # sans confirmation
#   scripts/deploy.sh --retour    # remet l'image précédente en service, sans build
#
# Les étapes :
#   1 ref      master propre et égal à origin/master, arbre extrait par git archive  [Mac]
#   2 état     .env, réseau ruby_default, conteneur, commit en service, verrou      [VPS, lecture]
#   3 envoi    rsync --delete, à blanc puis en vrai ; .env et .deployed_commit*
#              du VPS ne sont jamais écrasés ni supprimés
#   4 bascule  image en service gardée en :precedent, puis
#              nice -n 10 docker compose up -d --build, .deployed_commit,
#              attente du HEALTHCHECK                                            [VPS]
#   5 sonde    curl -fsS https://skills.azerit.tech/api/health                    [Mac]
#
# Ne touche ni à Caddy ni au DNS : étapes uniques, voir ops/DEPLOY.md.
#
# Réglages : TYS_SSH_HOST (défaut `azerit`), TYS_PUBLIC_URL (défaut
# https://skills.azerit.tech).
#
# Codes de sortie : 0 déployé (ou plan) · 1 arrêt avant la bascule, ce qui sert
# n'a pas bougé · 2 la nouvelle version tourne mais n'est pas saine (journaux
# affichés ; `scripts/deploy.sh --retour`).
#
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SSH_HOST="${TYS_SSH_HOST:-azerit}"
PUBLIC_URL="${TYS_PUBLIC_URL:-https://skills.azerit.tech}"
APP_DIR="/opt/testyourskills"
CONTAINER="testyourskills"
BRANCH="master"

log() { echo "$*"; }
die() { echo "ERREUR: $*" >&2; exit 1; }
step() { echo; echo "==> [$1/5] $2"; }
usage() { sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

ACTION="deploy"; PLAN=0; YES=0
for arg in "$@"; do
  case "$arg" in
    --plan) PLAN=1 ;;
    --oui) YES=1 ;;
    --retour) ACTION="rollback" ;;
    -h | --help) usage; exit 0 ;;
    *) die "argument inconnu : $arg (scripts/deploy.sh --help)" ;;
  esac
done
for tool in git ssh rsync tar curl; do
  command -v "$tool" >/dev/null 2>&1 || die "outil introuvable sur ce poste : $tool"
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/testyourskills-deploy.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# Ce qui ne part jamais et n'est jamais effacé sur le VPS (rsync --delete).
# Motifs ANCRÉS à la racine. Le premier qui correspond l'emporte : .env.example
# part, tout autre .env* du VPS (les secrets, leurs copies) est intouchable.
# Le reste suit le .dockerignore : ce qui n'entre pas dans l'image ne part pas.
sync_filters() {
  cat <<'EOF'
--include=/.env.example
--exclude=/.env*
--exclude=/.deployed_commit
--exclude=/.deployed_commit.precedent
--exclude=/node_modules/
--exclude=/dist/
--exclude=/var/
--exclude=/tools/
--exclude=/.claude/
--exclude=*.db
--exclude=*.db-*
--exclude=__pycache__/
--exclude=*.blend
--exclude=*.blend1
--exclude=.DS_Store
EOF
}

remote() {
  # le script distant part sur l'entrée standard : jamais de script en ligne
  ssh "$SSH_HOST" bash -s -- "$@" < "$HERE/deploy-remote.sh"
}

state_value() { printf '%s\n' "$STATE" | awk -v k="$1" -F= '$1 == k { sub(/^[^=]*=/, ""); print; exit }'; }
read_state() { STATE="$(remote state)" && [ -n "$STATE" ]; }

confirm() {
  local answer=""
  [ "$YES" = 1 ] && return 0
  [ -t 0 ] || die "confirmation impossible sans terminal : relire le plan (--plan), puis relancer avec --oui"
  read -r -p "$1 Taper « oui » : " answer
  [ "$answer" = "oui" ] || die "annulé, rien n'a été écrit"
}

remote_logs() {
  log "80 dernières lignes de docker logs $CONTAINER :"
  ssh "$SSH_HOST" docker logs --tail 80 "$CONTAINER" 2>&1 | sed 's/^/    /' || true
}

# --- 1. la ref -------------------------------------------------------------------
resolve_ref() {
  local branch dirty
  step 1 "ref ($ROOT)"
  cd "$ROOT"
  branch="$(git symbolic-ref --quiet --short HEAD || echo "(détaché)")"
  [ "$branch" = "$BRANCH" ] || die "on est sur « $branch » : ne se déploie que depuis $BRANCH"
  dirty="$(git status --porcelain)"
  [ -z "$dirty" ] || die "arbre de travail pas propre : commiter ou ranger d'abord
$(printf '%s\n' "$dirty" | head -20 | sed 's/^/      /')"
  git fetch -q origin "$BRANCH" || die "git fetch origin $BRANCH impossible : on ne déploie pas sans savoir si master est à jour"
  SHA="$(git rev-parse HEAD)"
  [ "$SHA" = "$(git rev-parse "refs/remotes/origin/$BRANCH")" ] \
    || die "$BRANCH n'est pas égal à origin/$BRANCH (en avance : git push ; en retard : git pull --ff-only)"
  git log -1 --format='    %h %s (%cd)' --date=short "$SHA"
  TREE="$TMP/tree"
  mkdir -p "$TREE"
  # seuls les fichiers versionnés partent : rien de var/, .env, node_modules, tools/bake/.cache
  git archive --format=tar "$SHA" | tar -x -C "$TREE"
  for f in Dockerfile docker-compose.yml .dockerignore package-lock.json web/public/3d/city.webp; do
    [ -e "$TREE/$f" ] || die "$f absent du commit ${SHA:0:12}"
  done
}

# --- 2. l'état du VPS ------------------------------------------------------------
announce() {
  local deployed
  step 2 "état du VPS ($SSH_HOST:$APP_DIR)"
  read_state || die "lecture du VPS impossible (ssh $SSH_HOST) : rien n'a été écrit"
  [ "$(state_value dir)" = "ok" ] || die "$APP_DIR n'existe pas : première mise en ligne, suivre ops/DEPLOY.md (le .env d'abord)"
  [ "$(state_value env)" = "ok" ] || die "$APP_DIR/.env absent : le créer d'abord depuis .env.example (ops/DEPLOY.md)"
  [ "$(state_value network)" = "ok" ] || die "réseau docker ruby_default absent sur le VPS : ruby-caddy ne joindrait pas l'app"
  [ "$(state_value lock)" = "free" ] || die "un déploiement de Testyourskills est en cours sur le VPS (verrou $(state_value lock))"
  [ -z "$(state_value env_missing)" ] || log "    ATTENTION : variables vides dans .env : $(state_value env_missing)"
  log "    conteneur $CONTAINER : $(state_value container), santé $(state_value health) ; disque libre : $(state_value disk_free)"
  deployed="$(state_value commit)"
  if [ -z "$deployed" ]; then
    log "    rien en service (premier déploiement)"
  elif git rev-parse --verify --quiet "$deployed^{commit}" >/dev/null; then
    if [ "$(git rev-parse "$deployed^{commit}")" = "$SHA" ]; then
      log "    ${SHA:0:12} est DÉJÀ en service : redéploiement à l'identique"
    else
      log "    en service : $deployed ; partent :"
      git log --no-decorate --format='      %h %s' "$deployed..$SHA" | head -40
    fi
  else
    log "    en service : $deployed (inconnu de ce clone)"
  fi
  if [ "$(state_value previous)" = "yes" ]; then
    log "    image précédente : testyourskills:precedent ($(state_value previous_commit))"
  fi
}

# --- 3. l'envoi ------------------------------------------------------------------
send() {
  local changed deleted filter
  step 3 "envoi ($SSH_HOST:$APP_DIR)"
  SYNC_ARGS=(-a --checksum --delete)
  while IFS= read -r filter; do SYNC_ARGS+=("$filter"); done <<EOF
$(sync_filters)
EOF
  rsync "${SYNC_ARGS[@]}" --dry-run --itemize-changes "$TREE/" "$SSH_HOST:$APP_DIR/" > "$TMP/dry-run.txt" \
    || die "rsync à blanc en échec : rien n'a été écrit"
  changed="$(grep -vc '^\.' "$TMP/dry-run.txt" || true)"
  deleted="$(grep -c '^\*deleting' "$TMP/dry-run.txt" || true)"
  log "    à blanc : $changed fichier(s) à écrire, $deleted à supprimer"
  if [ "$deleted" -gt 0 ]; then
    grep '^\*deleting' "$TMP/dry-run.txt" | sed 's/^/      /' | head -40
  fi
  if [ "$PLAN" = 1 ]; then
    echo
    log "PLAN : s'arrête ici, rien n'a été écrit sur le VPS."
    exit 0
  fi
  confirm "Déployer Testyourskills ${SHA:0:12} sur $PUBLIC_URL ?"
  rsync "${SYNC_ARGS[@]}" "$TREE/" "$SSH_HOST:$APP_DIR/" \
    || die "rsync en échec : le dossier du VPS peut être à moitié écrit, ce qui SERT n'a pas changé (image inchangée)"
  log "    envoyé"
}

# --- 5. la sonde publique ----------------------------------------------------------
probe_public() {
  local i
  step 5 "sonde publique ($PUBLIC_URL/api/health)"
  # quelques essais : au tout premier déploiement Caddy peut encore finir le certificat
  for i in 1 2 3 4 5; do
    if curl -fsS --max-time 10 "$PUBLIC_URL/api/health"; then
      echo
      return 0
    fi
    [ "$i" = 5 ] || sleep 5
  done
  log "    $PUBLIC_URL/api/health ne répond pas en 2xx (conteneur sain : regarder Caddy et le DNS)"
  remote_logs
  return 1
}

run_deploy() {
  local code=0
  resolve_ref
  announce
  send
  step 4 "bascule (VPS)"
  remote deploy "$SHA" || code=$?
  if [ "$code" != 0 ]; then
    echo
    case "$code" in
      1) log "ARRÊT AVANT LA BASCULE : ce qui sert n'a pas été touché." ;;
      2) log "LA NOUVELLE VERSION N'EST PAS SAINE : scripts/deploy.sh --retour pour remettre la précédente." ;;
      255) log "CONNEXION SSH PERDUE : vérifier à la main (ssh $SSH_HOST docker ps)" ;;
      *) log "la partie distante s'est terminée avec le code $code" ;;
    esac
    exit "$code"
  fi
  probe_public || exit 2
  echo
  log "Testyourskills sert ${SHA:0:12} sur $PUBLIC_URL"
}

run_rollback() {
  local code=0
  step 2 "état du VPS ($SSH_HOST:$APP_DIR)"
  read_state || die "lecture du VPS impossible (ssh $SSH_HOST)"
  [ "$(state_value previous)" = "yes" ] || die "aucune image testyourskills:precedent sur le VPS : rien à quoi revenir"
  [ "$(state_value lock)" = "free" ] || die "un déploiement est en cours sur le VPS (verrou $(state_value lock))"
  log "    en service : $(state_value commit) ; précédente : $(state_value previous_commit)"
  if [ "$PLAN" = 1 ]; then
    log "PLAN : remettrait testyourskills:precedent ($(state_value previous_commit)) en service, sans build. Rien n'a été écrit."
    exit 0
  fi
  confirm "Remettre $(state_value previous_commit) en service sur $PUBLIC_URL ?"
  step 4 "retour arrière (VPS)"
  remote rollback || code=$?
  [ "$code" = 0 ] || exit "$code"
  probe_public || exit 2
  echo
  log "Testyourskills sert de nouveau $(state_value previous_commit). Le dossier du VPS garde le code"
  log "de la version retirée : corriger sur master (git revert), puis scripts/deploy.sh."
}

case "$ACTION" in
  deploy) run_deploy ;;
  rollback) run_rollback ;;
esac
