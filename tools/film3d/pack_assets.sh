#!/bin/sh
# L'archive des assets du film à copier sur la machine louée, faite sur le Mac.
#
#   sh tools/film3d/pack_assets.sh [--manifest <rendu>/assets.txt] [--dry] [archive.tar]
#
# Sans --manifest : tous les fichiers du dossier des assets (FILM3D_ASSETS, sinon design/film/assets à côté du dépôt
# principal), sauf les scènes déjà construites (*.blend, *.blend1 : la machine louée les reconstruit depuis les
# scripts), les fichiers cachés (.env et autres, jamais lus), clés (*.key, *.pem), archives et liens symboliques
# (rien hors du dossier). C'est le choix sûr : un fichier oublié ferait échouer un plan là-bas.
# Avec --manifest : seulement les fichiers que les plans chargent réellement, la liste écrite par
#   python3 tools/film3d/render_film.py --list     (<rendu>/assets.txt : une construction par plan, sans rendu)
# Écrit l'archive (par défaut design/film/film3d-assets.tar, hors du dépôt) et sa liste (archive.txt), et annonce
# la taille avant d'écrire. --dry : la liste et la taille seulement.
# Là-bas : mkdir -p ~/film/assets && tar -xf film3d-assets.tar -C ~/film/assets && export FILM3D_ASSETS=~/film/assets
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
MANIFEST=""
DRY=0
ARCHIVE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --manifest) MANIFEST=$2; shift 2 ;;
    --dry) DRY=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) ARCHIVE=$1; shift ;;
  esac
done

if [ -n "${FILM3D_ASSETS:-}" ]; then
  ASSETS=$FILM3D_ASSETS
else
  COMMON=$(git -C "$HERE" rev-parse --path-format=absolute --git-common-dir)
  ASSETS=$(dirname "$(dirname "$COMMON")")/design/film/assets
fi
ASSETS=$(cd "$ASSETS" && pwd)
[ -n "$ARCHIVE" ] || ARCHIVE=$(dirname "$ASSETS")/film3d-assets.tar
case "$ARCHIVE" in
  "$ASSETS"/*) echo "l'archive ne va pas dans le dossier des assets : $ARCHIVE" >&2; exit 1 ;;
esac
LIST=${ARCHIVE%.tar}.txt

if [ -n "$MANIFEST" ]; then
  # la liste écrite par render_film.py --list : chemins relatifs, fichiers ordinaires du dossier seulement
  : > "$LIST"
  missing=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      /*|..|../*|*/../*|.*|*/.*) echo "refusé (hors du dossier ou caché) : $f" >&2; continue ;;
    esac
    if [ -f "$ASSETS/$f" ] && [ ! -L "$ASSETS/$f" ]; then
      printf './%s\n' "$f" >> "$LIST"
    else
      echo "absent : $f" >&2
      missing=$((missing + 1))
    fi
  done < "$MANIFEST"
  [ "$missing" -eq 0 ] || echo "$missing fichier(s) de la liste absents du dossier" >&2
  SOURCE="la liste $MANIFEST"
else
  (cd "$ASSETS" && find . -type f \
      ! -name '.*' ! -path '*/.*' \
      ! -name '*.blend' ! -name '*.blend[0-9]*' \
      ! -name '*.key' ! -name '*.pem' ! -name '*.tar' ! -name '*.tar.*' ! -name '*.zip' \
      | LC_ALL=C sort) > "$LIST"
  SOURCE="tout le dossier sauf scènes construites, fichiers cachés, clés, archives et liens"
fi

COUNT=$(wc -l < "$LIST" | tr -d ' ')
KB=$( (cd "$ASSETS" && tr '\n' '\0' < "$LIST" | xargs -0 du -k) | awk '{s += $1} END {print s + 0}')
echo "assets : $ASSETS"
echo "source : $SOURCE"
echo "$COUNT fichiers, $((KB / 1024)) Mo -> $ARCHIVE (liste : $LIST)"
[ "$DRY" -eq 0 ] || exit 0

# (COPYFILE_DISABLE et --no-xattrs : ni fichiers « ._ » ni attributs étendus du Mac dans l'archive, que le tar de
# Linux signalerait à chaque fichier)
if tar --version 2>/dev/null | grep -q bsdtar; then
  COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -cf "$ARCHIVE" -C "$ASSETS" -T "$LIST"
else
  tar -cf "$ARCHIVE" -C "$ASSETS" -T "$LIST"
fi
echo "écrit $ARCHIVE : $(du -h "$ARCHIVE" | cut -f1)"
