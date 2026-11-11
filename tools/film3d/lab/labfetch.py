# Télécharge un asset pour les essais du banc, sans toucher à fetch.py (les listes de fetch.py
# reçoivent ensuite ce qui est retenu). Même dossier d'assets, même clé Sketchfab (lue par fetch.py).
#
#   python3 -I tools/film3d/lab/labfetch.py sketchfab <nom.glb> <uid>
#   python3 -I tools/film3d/lab/labfetch.py polyhaven <asset> tex|model|hdri <1k|2k>
#   python3 -I tools/film3d/lab/labfetch.py ambientcg <Asset> [1K|2K]
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import fetch  # noqa: E402

kind, *rest = sys.argv[1:]
os.makedirs(fetch.ASSETS, exist_ok=True)
if kind == "sketchfab":
    print(fetch.fetch_sketchfab(rest[0], rest[1]))
elif kind == "polyhaven":
    print(fetch.fetch_polyhaven(rest[0], rest[1], rest[2]))
elif kind == "ambientcg":
    print(fetch.fetch_ambientcg(rest[0], rest[1] if len(rest) > 1 else "2K"))
else:
    raise SystemExit(__doc__)
