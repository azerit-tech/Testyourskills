# Télécharge les assets tiers du film 3D, hors du dépôt.
#
#   python3 tools/film3d/fetch.py
#
# Sketchfab (CC BY, clé SKETCHFAB_API_KEY prise dans l'environnement ou dans
# le .env du dépôt, comme tools/bake/prepare.py) et Poly Haven (CC0, sans clé).
# Tout va dans Azerit/design/film/assets/ ; un fichier déjà là n'est pas
# retéléchargé. Les crédits sont dans tools/film3d/CREDITS.md.
import json
import os
import subprocess
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

SKETCHFAB = {
    # coupé à coin des années 80, dessin de l'auteur (« collective image »)
    "coupe.glb": "c967ab4abbc54ae4b7933fd81a86c99c",
    # berline de patrouille des années 80, dessin de l'auteur
    "police.glb": "61766c1e6e1e4b2b803c174f33433a74",
    # trois palmiers hauts, base scannée
    "palms.glb": "fd439b0f82c34497aabb21c68ad2fb34",
    # lampadaires
    "streetlights.glb": "1173b0c4d9b0400bbeaafbee0e94ca59",
}

# Poly Haven : (asset, type, résolution)
POLYHAVEN = [
    ("qwantani_dusk_2_puresky", "hdri", "2k"),
    ("asphalt_02", "tex", "2k"),
    ("beige_wall_001", "tex", "1k"),
    ("concrete_floor_01", "tex", "1k"),
]
TEX_MAPS = {"Diffuse": "diff", "nor_gl": "nor_gl", "Rough": "rough", "Displacement": "disp"}


def _roots():
    yield ROOT
    try:
        common = subprocess.run(["git", "-C", ROOT, "rev-parse", "--git-common-dir"], capture_output=True, text=True, check=True).stdout.strip()
        yield os.path.dirname(os.path.abspath(os.path.join(ROOT, common)))
    except Exception:
        pass


# Le dossier du film est à côté du dépôt principal (Azerit/design/film), même
# depuis un worktree : on remonte depuis le dépôt git commun.
ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(os.path.dirname(list(_roots())[-1]), "design", "film", "assets")


def env_key():
    key = os.environ.get("SKETCHFAB_API_KEY")
    if key:
        return key
    for root in _roots():
        path = os.path.join(root, ".env")
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    if line.startswith("SKETCHFAB_API_KEY="):
                        return line.split("=", 1)[1].strip().strip("'\"")
    raise SystemExit("SKETCHFAB_API_KEY manquant (variable d'environnement ou .env)")


def get(url, path=None, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "testyourskills-film3d", **(headers or {})})
    with urllib.request.urlopen(req) as r:
        data = r.read()
    if path is None:
        return json.loads(data)
    with open(path, "wb") as f:
        f.write(data)


def main():
    os.makedirs(ASSETS, exist_ok=True)
    for name, uid in SKETCHFAB.items():
        path = os.path.join(ASSETS, name)
        if os.path.exists(path):
            continue
        links = get(f"https://api.sketchfab.com/v3/models/{uid}/download", headers={"Authorization": f"Token {env_key()}"})
        get(links["glb"]["url"], path)
        meta = get(f"https://api.sketchfab.com/v3/models/{uid}")
        print(f"[fetch] {name} : « {meta['name']} », {meta['user']['displayName']}, {meta['license']['label']}", flush=True)
    for asset, kind, res in POLYHAVEN:
        files = get(f"https://api.polyhaven.com/files/{asset}")
        if kind == "hdri":
            path = os.path.join(ASSETS, f"{asset}_{res}.exr")
            if not os.path.exists(path):
                get(files["hdri"][res]["exr"]["url"], path)
                print(f"[fetch] {asset} (HDRI {res})", flush=True)
            continue
        folder = os.path.join(ASSETS, asset)
        os.makedirs(folder, exist_ok=True)
        for key, short in TEX_MAPS.items():
            if key not in files:
                continue
            path = os.path.join(folder, f"{short}_{res}.jpg" if key != "Displacement" else f"{short}_{res}.png")
            if os.path.exists(path):
                continue
            fmt = "png" if key == "Displacement" and "png" in files[key][res] else "jpg"
            get(files[key][res][fmt]["url"], path)
        print(f"[fetch] {asset} (textures {res})", flush=True)


if __name__ == "__main__":
    main()
