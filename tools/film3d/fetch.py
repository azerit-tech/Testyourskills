# Télécharge les assets tiers du film 3D, hors du dépôt.
#
#   python3 -I tools/film3d/fetch.py
#
# Sketchfab (CC BY, clé SKETCHFAB_API_KEY prise dans l'environnement ou dans
# le .env du dépôt, comme tools/bake/prepare.py), Poly Haven et ambientCG (CC0,
# sans clé). Tout va dans Azerit/design/film/assets/ ; un fichier déjà là n'est
# pas retéléchargé. Les crédits sont dans tools/film3d/CREDITS.md.
# Les fonctions fetch_* servent aussi aux essais (tools/film3d/lab/labfetch.py).
import io
import json
import os
import re
import subprocess
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

SKETCHFAB = {
    # coupé à coin des années 80, dessin de l'auteur (« collective image ») : la v1, en basse définition
    "coupe.glb": "c967ab4abbc54ae4b7933fd81a86c99c",
    # coupé sport générique, dessin de l'auteur, 114 k faces, intérieur : la v2
    "coupe-hd.glb": "820a13c4831c41959ce75e6c2014e882",
    # berline de patrouille des années 80, dessin de l'auteur
    "police.glb": "61766c1e6e1e4b2b803c174f33433a74",
    # trois palmiers hauts, base scannée (la v1, gardée pour la référence du banc d'essai)
    "palms.glb": "fd439b0f82c34497aabb21c68ad2fb34",
    # vingt-cinq cocotiers distincts, troncs courbes ou droits
    "palm-coconut-group.glb": "d05c8ffb6ec64a7184c4b673e21f7224",
    # palmier royal (Roystonea regia) haute définition
    "palm-royal.glb": "3113aadb615e432f934ec5d3407d11ce",
    # fourgonnette des années 70, sans logo, garée le long des trottoirs
    "parked-wagon.glb": "2b734bf738dc405998c2074953965cc6",
    # lampadaires
    "streetlights.glb": "1173b0c4d9b0400bbeaafbee0e94ca59",
    # feu tricolore new-yorkais des années 80, aux carrefours
    "traffic-light.glb": "bad8aa4988474919be8f48920dde7e3d",
    # réservoir d'eau sur pieds, pour les toits
    "water-tank.glb": "aff4e9fd3f7042d5855fade7411df4df",
    # les rez-de-chaussée des façades « kit » et « mix » : lettres néon, intérieurs de boutique,
    # fenêtres, portes vitrées, climatiseurs, garde-corps, néon OPEN, store
    "A-neon-letters.glb": "a88035b37ba4498b8d7fe9cfbc0dccc8",
    "A-storefront-interiors.glb": "348da01c195d46eca29e478e98aab16c",
    "A-window-pack.glb": "e8a3914fb654483790abc0cd72fb7099",
    "A-glass-doors.glb": "e0ff1a543cb34979999d2fd87843203e",
    "A-ac-pack.glb": "3b930497c77f47269847e75b9ee85b20",
    "A-railing-set.glb": "b5b629702e814263816769db0ee660cc",
    "A-neon-open.glb": "9a924db296cf4a1eb12991702ab48da5",
    "A-awning-cc0.glb": "47e5fd8a6b194b48aad20425869d15ba",
    # la distribution (cast.py) : chaque modèle dans son dossier
    # rétroviseur intérieur du coupé
    "cast/rearview-mirror/model.glb": "72f3ac9e3ff5423f823841b3c801d0c1",
    # la patrouille retenue (pare-buffle, cloison), et l'autre finaliste
    "cast/patrol-jeandiz/model.glb": "9166b13b6ae341f4bfc093edb71d74f4",
    "cast/patrol-crownvic/model.glb": "b1615ed43a5443a2876c8020a734cf6e",
    # le fourgon, l'hélicoptère, l'avion (dessin inventé)
    "cast/van-vandura/model.glb": "40cf97bc0f7d4bdb8135c4e9d2264923",
    "cast/heli-solid/model.glb": "02373bff3f7f48bf8649805455fe4260",
    "cast/jet-concept/model.glb": "69012312f3ab4f13b637b6a188aa3d4c",
    # les plots du barrage
    "cast/barrier-fence/model.glb": "2a09091d4e7b4539abe03f6a50762409",
    "cast/cone-worn/model.glb": "1cbffb4169684e5a84ba186882bd55d7",
    "cast/test-spike-strip/model.glb": "2c8370fccfbf4a7f9b9d9729112b8e61",
    "cast/light-tower/model.glb": "9addea6a4129438b83a1fc3ed4a784ec",
    # les gens : conducteur (sweat capuche, capuche nouée), policiers, casquette, arme
    "cast/drv-hoodie-lp/model.glb": "0e95ddfd01ed4d23aeb1d9b7fe79ea26",
    "cast/hood-scarf/model.glb": "5c037f1a66634c5ea25ad8e87a4c3923",
    "cast/cop-tuzzy/model.glb": "98f6136cc24f41f1bb1b1f3262bde2ff",
    "cast/cop-spp/model.glb": "d47bb1f61fa340588b5801cdb63812c8",
    "cast/cap-aramuor/model.glb": "9697ef10105a4e02a6074bc9bca464bd",
    "cast/gun-t77/model.glb": "7e6a5ffc9deb4994a4092ccdba85c965",
    # la voiture poursuivie (lab/hero_cars.py) : la berline des années 60, le coupé des années 70
    "cast/hero-mercedes-w111/model.glb": "b1bb1e82fe394153932ba1c2a341dded",
    "cast/hero-mercedes-slc/model.glb": "79612cb9ee714df9967c6d6c4fc967b1",
}

# Poly Haven : (asset, type, résolution), ou (asset, type, résolution, dossier)
POLYHAVEN = [
    ("qwantani_dusk_2_puresky", "hdri", "2k"),
    ("asphalt_02", "tex", "2k"),
    ("beige_wall_001", "tex", "1k"),
    ("concrete_floor_01", "tex", "1k"),
    # le mobilier de rue et des toits (modèles glTF)
    ("exterior_aircon_unit", "model", "1k"),
    ("modular_street_seating", "model", "1k"),
    ("metal_trash_can", "model", "1k"),
    ("outdoor_table_chair_set_01", "model", "1k"),
    ("shrub_01", "model", "1k"),
    # la rue mouillée (road.py)
    ("aerial_asphalt_01", "tex", "2k"),
    ("asphalt_04", "tex", "2k"),
    ("brushed_concrete_04", "tex", "2k"),
    ("water_manhole_cover", "model", "1k"),
    # les façades (facade_b.py, facade_kit.py, facade_mix.py)
    ("coral_fort_wall_01", "tex", "2k"),
    ("modular_metal_gutter", "model", "1k"),
    ("utility_box_01", "model", "1k"),
    ("security_light", "model", "1k"),
    ("potted_plant_02", "model", "1k"),
    ("rollershutter_door", "model", "1k"),
    ("bar_chair_round_01", "model", "1k"),
    # la distribution (cast.py) : (asset, type, résolution, dossier)
    ("concrete_road_barrier", "model", "1k", "cast/barrier-ph01"),
    ("concrete_road_barrier_02", "model", "1k", "cast/barrier-ph02"),
    ("service_pistol", "model", "1k", "cast/gun-service"),
]

# ambientCG : (asset, résolution) ; archives zip dont on ne garde que les images
AMBIENTCG = [
    # l'enduit photographique des façades, ses reprises, et les coulures en décalcomanie
    ("PaintedPlaster017", "2K"),
    ("Plaster003", "2K"),
    ("Leaking004", "2K"),
    ("Leaking007", "2K"),
    ("Leaking008", "2K"),
    ("Leaking009", "2K"),
    # les grilles d'avaloir du caniveau
    ("Grate002", "1K"),
    # l'usure de la voiture poursuivie : traces d'essuyage, taches d'eau séchée, grain de poussière
    ("SurfaceImperfections003", "2K"),
    ("SurfaceImperfections013", "2K"),
    ("SurfaceImperfections017", "2K"),
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


SAFE = re.compile(r"^[A-Za-z0-9_.\-]+$")


def _unzip(data, folder, keep=r"\.(jpg|jpeg|png|exr|bin|gltf|glb)$"):
    """Extrait une archive téléchargée (donnée non fiable) : seulement des noms simples, à plat,
    des extensions attendues, jamais de chemin qui sorte du dossier."""
    os.makedirs(folder, exist_ok=True)
    out = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            parts = info.filename.replace("\\", "/").split("/")
            if any(p in ("", "..") or not SAFE.match(p) for p in parts) or not re.search(keep, parts[-1], re.I):
                continue
            rel = os.path.join(*parts)
            dst = os.path.join(folder, rel)
            if not os.path.abspath(dst).startswith(os.path.abspath(folder) + os.sep):
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(info) as src, open(dst, "wb") as f:
                f.write(src.read())
            out.append(rel)
    return out


def fetch_sketchfab(name, uid):
    """Un modèle Sketchfab téléchargeable en glb (ou, à défaut, en glTF zippé dans un dossier).
    Le nom peut descendre dans un sous-dossier (cast/<rôle>/model.glb), créé au besoin."""
    path = os.path.join(ASSETS, name)
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    links = get(f"https://api.sketchfab.com/v3/models/{uid}/download", headers={"Authorization": f"Token {env_key()}"})
    if "glb" in links:
        get(links["glb"]["url"], path)
    else:
        req = urllib.request.Request(links["gltf"]["url"], headers={"User-Agent": "testyourskills-film3d"})
        with urllib.request.urlopen(req) as r:
            _unzip(r.read(), path)
    meta = get(f"https://api.sketchfab.com/v3/models/{uid}")
    print(f"[fetch] {name} : « {meta['name']} », {meta['user']['displayName']}, {meta['license']['label']}", flush=True)
    return path


def fetch_polyhaven(asset, kind, res, dest=None):
    """Un HDRI, une matière ou un modèle Poly Haven, dans assets/<asset>/ ou, avec dest,
    dans assets/<dest>/ (la distribution : cast/<rôle>)."""
    files = get(f"https://api.polyhaven.com/files/{asset}")
    if kind == "hdri":
        path = os.path.join(ASSETS, f"{asset}_{res}.exr")
        if not os.path.exists(path):
            get(files["hdri"][res]["exr"]["url"], path)
            print(f"[fetch] {asset} (HDRI {res})", flush=True)
        return path
    folder = os.path.join(ASSETS, dest or asset)
    os.makedirs(folder, exist_ok=True)
    if kind == "model":
        gl = files["gltf"][res]["gltf"]
        path = os.path.join(folder, f"{asset}.gltf")
        if not os.path.exists(path):
            for rel, inc in gl.get("include", {}).items():
                dst = os.path.join(folder, rel)
                if not os.path.abspath(dst).startswith(os.path.abspath(folder) + os.sep):
                    continue
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                get(inc["url"], dst)
            get(gl["url"], path)
            print(f"[fetch] {asset} (modèle {res})", flush=True)
        return path
    for key, short in TEX_MAPS.items():
        if key not in files or res not in files[key]:
            continue
        path = os.path.join(folder, f"{short}_{res}.jpg" if key != "Displacement" else f"{short}_{res}.png")
        if os.path.exists(path):
            continue
        fmt = "png" if key == "Displacement" and "png" in files[key][res] else "jpg"
        get(files[key][res][fmt]["url"], path)
    print(f"[fetch] {asset} (textures {res})", flush=True)
    return folder


def fetch_ambientcg(asset, res="2K"):
    """Une matière ou une décalcomanie ambientCG (CC0) : Color, NormalGL, Roughness, Displacement,
    Opacity... dans assets/<asset>/, noms d'origine (<asset>_<res>-JPG_<Carte>.jpg)."""
    folder = os.path.join(ASSETS, asset)
    if os.path.isdir(folder) and os.listdir(folder):
        return folder
    url = f"https://ambientcg.com/get?file={asset}_{res}-JPG.zip"
    req = urllib.request.Request(url, headers={"User-Agent": "testyourskills-film3d"})
    with urllib.request.urlopen(req) as r:
        got = _unzip(r.read(), folder, keep=r"\.(jpg|jpeg|png)$")
    print(f"[fetch] {asset} (ambientCG {res}) : {', '.join(got)}", flush=True)
    return folder


def main():
    os.makedirs(ASSETS, exist_ok=True)
    for name, uid in SKETCHFAB.items():
        fetch_sketchfab(name, uid)
    for asset, kind, res, *dest in POLYHAVEN:
        fetch_polyhaven(asset, kind, res, *dest)
    for asset, res in AMBIENTCG:
        fetch_ambientcg(asset, res)


if __name__ == "__main__":
    main()
