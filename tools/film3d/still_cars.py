# Les contours de la berline sur les images gelées (SPEC §18.54, §18.57), calculés au lieu d'être tracés à la main.
#
# Le site détoure la berline sur les six images qui peuvent geler (la dernière de P1 à P5, celle de FIN6 : images
# 107, 214, 317, 425, 485 et 719 du fichier de 720 images) avec un contour en pixels de l'image 720 × 1280, dans le
# sens des aiguilles d'une montre depuis le haut du toit (web/src/film/freeze.ts, STILL_CARS). Ce contour se lit
# dans la scène elle-même : sur l'image du plan, seule la berline (sa caisse `coupe` et tout ce qui lui est
# accroché : portes, vitres, roues, conducteur) est rendue en Workbench, sur fond transparent, à 720 × 1280 avec la
# caméra du film ; le masque (alpha) est grandi de MARGE pixels, sa plus grande tache suivie sur les bords des
# pixels, puis simplifiée (Douglas-Peucker, EPS pixel). Le résultat va dans shared/film/still-cars.json, que lit
# freeze.ts. Aucune lumière, aucun noyau : quelques secondes par plan une fois la scène construite (ou reprise du
# cache), sur le Mac comme sur la machine louée.
#
# Lancé par render_film.py --still-cars (et à la fin de --assemble quand une prise est faite) ; les empreintes des
# images gelées (dHash 8 × 16, celles de scripts/film-media.test.ts) se relèvent sur les images rendues du plan si
# ce sont des prises, sinon sur le fichier monté : render_film.py --empreintes web/src/film/media/poursuite-720.mp4.
#
# Python pur hors de render_mask (Blender) : python3 tools/film3d/still_cars.py --selftest.
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SITE_JSON = os.path.join(ROOT, "shared", "film", "still-cars.json")

TAILLE = (720, 1280)                 # l'image sur laquelle le site lit les contours (freeze.ts, TRACED)
SHOTS = ("P1", "P2", "P3", "P4", "P5", "FIN6")   # les images qui peuvent geler (freeze.ts, StillShot)
MARGE = 3                            # px : le masque grandi (bords adoucis du site, distorsion de l'objectif, flou)
EPS = 1.0                            # px : l'écart toléré par la simplification
# les objets accrochés à la caisse qui ne sont pas la voiture : repères de roue, gerbes, et l'antenne (un trait d'un
# pixel ferait une pointe dans le contour)
SKIP = ("repere_", "spray_", "fumee", "haze")
SKIP_IN = ("antenna",)


def log(msg):
    print(f"[berlines] {msg}", flush=True)


# ---------------------------------------------------------------- les images gelées

def freeze_frames(cut, order):
    """{plan: image du film} : la dernière image de chaque plan qui peut geler, comptée de 0 dans le fichier entier
    (les tronçons dans l'ordre du montage, cut = images de chaque tronçon, celles de shared/film/parcours.json)."""
    out, start = {}, 0
    for plan in order:
        if plan in SHOTS:
            out[plan] = start + cut[plan] - 1
        start += cut[plan]
    return out


def plan_index(cut_n, rendered_n):
    """L'image gelée comptée dans le plan (1 à sa longueur) : la dernière du tronçon, ou la dernière rendue si la scène
    est plus courte (le montage la tient jusqu'à la fin du tronçon)."""
    return max(1, min(cut_n, rendered_n))


# ---------------------------------------------------------------- le masque (lignes en entiers : bit x = pixel x)

def pixel(rows, w, h, x, y):
    return 0 <= x < w and 0 <= y < h and (rows[y] >> x) & 1


def dilate(rows, w, r):
    """Le masque grandi de r pixels (carré de 2r + 1)."""
    if r <= 0:
        return list(rows)
    full = (1 << w) - 1
    horiz = []
    for b in rows:
        o = b
        for k in range(1, r + 1):
            o |= (b << k) | (b >> k)
        horiz.append(o & full)
    h = len(rows)
    out = []
    for y in range(h):
        o = 0
        for yy in range(max(0, y - r), min(h, y + r + 1)):
            o |= horiz[yy]
        out.append(o)
    return out


def area(rows):
    return sum(bin(b).count("1") for b in rows)


def components(rows, w):
    """Les taches du masque (8-connexes), de la plus grande à la plus petite : [(aire, lignes)]."""
    full = (1 << w) - 1
    rest = list(rows)
    h = len(rows)
    out = []
    while True:
        y0 = next((y for y in range(h) if rest[y]), None)
        if y0 is None:
            break
        b = rest[y0]
        comp = [0] * h
        comp[y0] = b & -b                       # le premier pixel de la première ligne
        lo = hi = y0
        while True:
            changed = False
            for y in range(max(0, lo - 1), min(h, hi + 2)):
                grow = comp[y]
                for yy in (y - 1, y + 1):
                    if 0 <= yy < h:
                        grow |= comp[yy]
                grow = (grow | (grow << 1) | (grow >> 1)) & full & rest[y]
                if grow != comp[y]:
                    comp[y] = grow
                    changed = True
                    lo, hi = min(lo, y), max(hi, y)
            if not changed:
                break
        for y in range(lo, hi + 1):
            rest[y] &= ~comp[y]
        out.append((area(comp[lo:hi + 1]), comp))
    out.sort(key=lambda c: -c[0])
    return out


# ---------------------------------------------------------------- le contour

def trace(rows, w, h):
    """Le bord extérieur de la tache qui contient le premier pixel du haut (le plus à gauche), suivi sur les bords
    des pixels : des sommets entiers (coins de pixels), dans le sens des aiguilles d'une montre à l'écran (y vers le
    bas), depuis le coin haut gauche de ce pixel. Le polygone rempli aux centres des pixels redonne la tache."""
    y0 = next((y for y in range(h) if rows[y]), None)
    if y0 is None:
        return []
    b = rows[y0]
    x0 = (b & -b).bit_length() - 1
    # direction d ; « dedans » à droite de la marche, à l'écran : rot(d) = (-dy, dx)
    start = (x0, y0)
    d = (1, 0)
    v = start
    pts = [start]

    def inside(v, d):          # le pixel à droite du bord v -> v + d (dedans)
        cx = v[0] + d[0] / 2 - d[1] / 2
        cy = v[1] + d[1] / 2 + d[0] / 2
        return pixel(rows, w, h, int(cx // 1), int(cy // 1))

    def outside(v, d):         # le pixel à gauche du même bord
        cx = v[0] + d[0] / 2 + d[1] / 2
        cy = v[1] + d[1] / 2 - d[0] / 2
        return pixel(rows, w, h, int(cx // 1), int(cy // 1))

    limit = 4 * (w + 1) * (h + 1)
    for _ in range(limit):
        v = (v[0] + d[0], v[1] + d[1])
        if v == start and d == (0, -1):
            break
        nd = d
        if not inside(v, d):
            nd = (-d[1], d[0])                  # le bord tourne vers le dedans
        elif outside(v, d):
            nd = (d[1], -d[0])                  # la tache continue de l'autre côté : le bord tourne vers le dehors
        if nd != d:
            pts.append(v)
            d = nd
    else:
        raise RuntimeError("contour sans fin")
    return pts


def _dist(p, a, b):
    """La distance de p à la droite (a, b) (au point a si a == b)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = (dx * dx + dy * dy) ** 0.5
    if n == 0:
        return ((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2) ** 0.5
    return abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / n


def _dp(chain, eps):
    keep = [False] * len(chain)
    keep[0] = keep[-1] = True
    stack = [(0, len(chain) - 1)]
    while stack:
        i, j = stack.pop()
        best, k = -1.0, -1
        for m in range(i + 1, j):
            dd = _dist(chain[m], chain[i], chain[j])
            if dd > best:
                best, k = dd, m
        if best > eps:
            keep[k] = True
            stack += [(i, k), (k, j)]
    return [p for p, kp in zip(chain, keep) if kp]


def simplify(poly, eps=EPS):
    """Douglas-Peucker sur un polygone fermé : coupé au premier sommet et au plus éloigné de lui."""
    if len(poly) <= 4:
        return list(poly)
    a = poly[0]
    far = max(range(len(poly)), key=lambda i: (poly[i][0] - a[0]) ** 2 + (poly[i][1] - a[1]) ** 2)
    one = _dp(poly[:far + 1], eps)
    two = _dp(poly[far:] + [poly[0]], eps)
    return one[:-1] + two[:-1]


def signed_area(poly):
    """L'aire signée (lacets) : positive dans le sens des aiguilles d'une montre à l'écran (y vers le bas)."""
    s = 0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        s += x1 * y2 - x2 * y1
    return s / 2


def from_top(poly):
    """Le même polygone, depuis son sommet le plus haut (le haut du toit ; le plus à gauche à égalité)."""
    k = min(range(len(poly)), key=lambda i: (poly[i][1], poly[i][0]))
    return poly[k:] + poly[:k]


def outline(rows, w, h, marge=MARGE, eps=EPS):
    """Le contour de la berline sur son masque : (points [[x, y]…], infos). La plus grande tache seulement, grandie de
    `marge`, dans le sens des aiguilles d'une montre depuis le haut du toit."""
    grown = dilate(rows, w, marge)
    comps = components(grown, w)
    if not comps:
        raise ValueError("masque vide : la berline n'est pas dans le cadre")
    big, comp = comps[0]
    poly = from_top(simplify(trace(comp, w, h), eps))
    if signed_area(poly) <= 0:
        raise ValueError("contour à l'envers")
    rest = sum(a for a, _ in comps[1:])
    return [[int(x), int(y)] for x, y in poly], dict(aire=big, autres=rest, sommets=len(poly))


def fill(poly, w, h):
    """Le polygone rempli aux centres des pixels (règle pair-impair, comme fillOutline de freeze.ts) : des lignes en
    entiers. Pour les contrôles."""
    rows = []
    for y in range(h):
        fy = y + 0.5
        xs = []
        for i in range(len(poly)):
            (xi, yi), (xj, yj) = poly[i], poly[i - 1]
            if (yi > fy) != (yj > fy):
                xs.append(xi + (fy - yi) / (yj - yi) * (xj - xi))
        xs.sort()
        b = 0
        for k in range(0, len(xs) - 1, 2):
            a = max(0, int(-(-(xs[k] - 0.5) // 1)))
            z = min(w - 1, int((xs[k + 1] - 0.5) // 1))
            if z >= a:
                b |= ((1 << (z - a + 1)) - 1) << a
        rows.append(b)
    return rows


# ---------------------------------------------------------------- dans Blender

def hero_objects(bpy):
    """La berline : la caisse `coupe` (nom gardé par toutes les scènes) et ses enfants maillés, sans SKIP."""
    body = bpy.data.objects.get("coupe")
    if body is None:
        raise RuntimeError("pas d'objet « coupe » (la berline) dans la scène")
    obs = [body] + [o for o in body.children_recursive if o.type == "MESH"]
    return [o for o in obs if not o.name.startswith(SKIP) and not any(s in o.name for s in SKIP_IN)]


def render_mask(bpy, scene, frame, png):
    """Rend l'image `frame` de la scène, la berline seule, en Workbench sur fond transparent, à TAILLE, avec la caméra
    du film ; écrit `png` (le masque, en clair sur noir) et rend (lignes, w, h, nombre d'objets). Défait ses réglages
    de visibilité après coup (la scène reste celle du plan)."""
    import numpy as np
    keep = hero_objects(bpy)
    keep_set = set(o.name for o in keep)
    scene.frame_set(frame)
    # tout le reste caché, vides compris (un vide qui instancie une collection la cache avec lui) ; la berline telle
    # qu'au rendu (une pièce déjà cachée le reste)
    hidden = {}
    for ob in scene.objects:
        if ob.name not in keep_set:
            hidden[ob.name] = ob.hide_render
            ob.hide_render = True
    r = scene.render
    saved = dict(engine=r.engine, x=r.resolution_x, y=r.resolution_y, pct=r.resolution_percentage,
                 transparent=r.film_transparent, blur=r.use_motion_blur, path=r.filepath,
                 fmt=r.image_settings.file_format, mode=r.image_settings.color_mode,
                 depth=r.image_settings.color_depth, comp=scene.compositing_node_group,
                 pixel=(r.pixel_aspect_x, r.pixel_aspect_y))
    sh = scene.display.shading
    r.engine = "BLENDER_WORKBENCH"
    r.resolution_x, r.resolution_y = TAILLE
    r.resolution_percentage = 100
    r.pixel_aspect_x = r.pixel_aspect_y = 1.0
    r.film_transparent = True
    r.use_motion_blur = False
    scene.compositing_node_group = None
    sh.light, sh.color_type, sh.single_color = "FLAT", "SINGLE", (1.0, 1.0, 1.0)
    sh.show_shadows = sh.show_cavity = sh.show_object_outline = False
    try:
        sh.use_dof = False
    except AttributeError:
        pass
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "8"
    tmp = png[:-4] + ".part.png"
    r.filepath = tmp
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        for name, v in hidden.items():
            scene.objects[name].hide_render = v
        r.engine, r.resolution_x, r.resolution_y = saved["engine"], saved["x"], saved["y"]
        r.resolution_percentage, r.film_transparent, r.use_motion_blur = saved["pct"], saved["transparent"], saved["blur"]
        r.filepath, scene.compositing_node_group = saved["path"], saved["comp"]
        r.image_settings.file_format, r.image_settings.color_mode = saved["fmt"], saved["mode"]
        r.image_settings.color_depth = saved["depth"]
        r.pixel_aspect_x, r.pixel_aspect_y = saved["pixel"]
    img = bpy.data.images.load(tmp)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    alpha = px.reshape(h, w, 4)[::-1, :, 3] > 0.5          # Blender range ses lignes de bas en haut
    os.replace(tmp, png)
    rows = [int.from_bytes(np.packbits(row, bitorder="little").tobytes(), "little") for row in alpha]
    return rows, w, h, len(keep)


# ---------------------------------------------------------------- les empreintes (celles de scripts/film-media.test.ts)

def dhash(path, frame=None, ffmpeg=None):
    """L'empreinte d'une image : réduite à 9 × 16 en gris (ffmpeg, moyenne par zone), chaque pixel comparé à son
    voisin de droite, 128 bits en hexadécimal. `frame` : l'image comptée de 0 dans une vidéo ; None pour un PNG."""
    ffmpeg = ffmpeg or os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"
    vf = "scale=9:16:flags=area,format=gray"
    if frame is not None:
        vf = f"select=eq(n\\,{frame})," + vf
    r = subprocess.run([ffmpeg, "-v", "error", "-threads", "2", "-i", path, "-vf", vf, "-vframes", "1", "-f",
                        "rawvideo", "-"], capture_output=True)
    if r.returncode != 0 or len(r.stdout) != 144:
        raise RuntimeError(f"{path}, image {frame} : lecture impossible ({r.stderr.decode(errors='replace')[-200:]})")
    out = ""
    for y in range(16):
        byte = 0
        for x in range(8):
            byte = (byte << 1) | (1 if r.stdout[y * 9 + x] > r.stdout[y * 9 + x + 1] else 0)
        out += f"{byte:02x}"
    return out


def bits_apart(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")


# ---------------------------------------------------------------- le fichier du site

def write_json(data, path=SITE_JSON):
    """shared/film/still-cars.json, un contour par ligne, stable d'un export à l'autre."""
    lines = ["{", '  "//": ' + json.dumps(data["//"], ensure_ascii=False) + ",",
             f'  "taille": {json.dumps(data["taille"])},', f'  "images": {data["images"]},',
             f'  "marge": {data["marge"]},', '  "berlines": {']
    shots = [s for s in SHOTS if s in data["berlines"]]
    for k, s in enumerate(shots):
        b = data["berlines"][s]
        pts = ", ".join(f"[{x}, {y}]" for x, y in b["contour"])
        lines.append(f'    "{s}": {{"image": {b["image"]}, "empreinte": {json.dumps(b.get("empreinte"))}, '
                     f'"contour": [{pts}]}}' + ("," if k < len(shots) - 1 else ""))
    lines += ["  }", "}"]
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    os.replace(tmp, path)


def read_json(path=SITE_JSON):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


HEADER = ("Écrit par python3 tools/film3d/render_film.py --still-cars (SPEC §18.57) : la berline sur chaque image "
          "gelée, en pixels de l'image 720 × 1280, dans le sens des aiguilles d'une montre depuis le haut du toit ; "
          "empreinte : dHash de l'image dans poursuite-720.mp4 (render_film.py --empreintes). Ne pas modifier à la main.")


def check(data, frames, total):
    """Les problèmes du fichier (liste vide : bon) : forme, cadre, sens, et les images gelées du découpage actuel
    (`frames` : {plan: image du film}, `total` : images du fichier)."""
    bad = []
    if not isinstance(data, dict):
        return ["fichier absent ou illisible"]
    if data.get("taille") != list(TAILLE):
        bad.append(f"taille {data.get('taille')} au lieu de {list(TAILLE)}")
    if data.get("images") != total:
        bad.append(f"tracé sur {data.get('images')} images, le film en a {total}")
    cars = data.get("berlines") or {}
    if sorted(cars) != sorted(SHOTS):
        bad.append(f"plans {sorted(cars)} au lieu de {sorted(SHOTS)}")
    for s, b in cars.items():
        pts = b.get("contour") or []
        if s in frames and b.get("image") != frames[s]:
            bad.append(f"{s} : image {b.get('image')}, le découpage gèle l'image {frames[s]}")
        if len(pts) < 4:
            bad.append(f"{s} : {len(pts)} sommets")
            continue
        if any(not (0 <= x <= TAILLE[0] and 0 <= y <= TAILLE[1]) for x, y in pts):
            bad.append(f"{s} : sommet hors du cadre")
        if signed_area(pts) <= 0:
            bad.append(f"{s} : pas dans le sens des aiguilles d'une montre")
        if pts[0][1] != min(y for _, y in pts):
            bad.append(f"{s} : ne part pas du haut du toit")
        e = b.get("empreinte")
        if e is not None and not (isinstance(e, str) and len(e) == 32 and all(c in "0123456789abcdef" for c in e)):
            bad.append(f"{s} : empreinte {e!r}")
    return bad


# ---------------------------------------------------------------- sans Blender

def selftest():
    def mask(w, h, inside):
        return [sum(1 << x for x in range(w) if inside(x, y)) for y in range(h)]

    # un rectangle : quatre coins, sur les bords des pixels, dans le sens des aiguilles d'une montre depuis le haut
    w, h = 40, 30
    rect = mask(w, h, lambda x, y: 5 <= x < 15 and 8 <= y < 20)
    poly = trace(rect, w, h)
    assert poly == [(5, 8), (15, 8), (15, 20), (5, 20)], poly
    assert signed_area(poly) == 120 and fill(poly, w, h) == rect
    # une forme en L (un coin rentrant) : le bord suivi redonne la tache exactement
    ell = mask(w, h, lambda x, y: (3 <= x < 30 and 20 <= y < 26) or (3 <= x < 9 and 4 <= y < 26))
    poly = trace(ell, w, h)
    assert len(poly) == 6 and fill(poly, w, h) == ell and signed_area(poly) > 0, poly
    # deux pixels en diagonale et un carré : deux taches (8-connexes), de la plus grande à la plus petite
    diag = mask(w, h, lambda x, y: (x, y) in ((10, 10), (11, 11)) or (20 <= x < 24 and 20 <= y < 24))
    comps = components(diag, w)
    assert [a for a, _ in comps] == [16, 2], [a for a, _ in comps]
    # le grandissement : un pixel devient un carré de 2r + 1
    one = mask(w, h, lambda x, y: (x, y) == (10, 10))
    assert area(dilate(one, w, 2)) == 25 and area(dilate(one, w, 0)) == 1
    # une silhouette de voiture (un disque aplati sur une caisse) : simplifiée, elle reste à moins de EPS du masque
    W, H = 200, 160
    car = mask(W, H, lambda x, y: (40 <= x < 160 and 80 <= y < 130) or ((x - 100) ** 2 / 45 ** 2 + (y - 80) ** 2 / 30 ** 2 < 1))
    pts, info = outline(car, W, H, marge=0, eps=1.0)
    assert 8 <= info["sommets"] <= 60 and info["autres"] == 0, info
    assert pts[0][1] == 51 and signed_area(pts) > 0, pts[:3]           # le haut du toit
    back = fill(pts, W, H)
    diff = area([a ^ b for a, b in zip(back, car)])
    assert diff < 0.02 * area(car), (diff, area(car))
    # la marge : le contour grandi couvre toute la tache, une miette à part n'y entre pas
    crumb = list(car)
    crumb[5] |= 1 << 5
    pts, info = outline(crumb, W, H, marge=3)
    cover = fill(pts, W, H)
    assert all(c & ~f == 0 for c, f in zip(car, cover)) and not (cover[5] >> 5) & 1 and info["autres"] > 0
    # les images gelées : la dernière de chaque tronçon, comptée de 0 dans le fichier
    order = ("OUV", "P1", "P2", "P3", "P4", "P5", "P6", "FIN6")
    cut = {"OUV": 75, "P1": 33, "P2": 107, "P3": 103, "P4": 108, "P5": 60, "P6": 133, "FIN6": 101}
    fr = freeze_frames(cut, order)
    assert fr == {"P1": 107, "P2": 214, "P3": 317, "P4": 425, "P5": 485, "FIN6": 719}, fr
    assert plan_index(33, 40) == 33 and plan_index(33, 30) == 30
    # le fichier : écrit, relu, contrôlé ; chaque défaut nommé
    import tempfile
    sq = [[300, 600], [420, 600], [420, 830], [300, 830]]
    data = dict({"//": HEADER, "taille": list(TAILLE), "images": 720, "marge": MARGE},
                berlines={s: {"image": fr[s], "empreinte": None, "contour": sq} for s in SHOTS})
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "still-cars.json")
        write_json(data, p)
        back = read_json(p)
        assert back == data and check(back, fr, 720) == [], check(back, fr, 720)
    assert check(None, fr, 720) == ["fichier absent ou illisible"]
    bad = json.loads(json.dumps(data))
    bad["images"] = 414
    bad["berlines"]["P1"]["image"] = 100
    bad["berlines"]["P2"]["contour"] = sq[::-1]
    bad["berlines"]["P3"]["contour"] = sq[2:] + sq[:2]
    bad["berlines"]["P4"]["empreinte"] = "xyz"
    bad["berlines"]["P5"]["contour"] = [[x + 400, y] for x, y in sq]
    msgs = check(bad, fr, 720)
    assert msgs == ["tracé sur 414 images, le film en a 720", "P1 : image 100, le découpage gèle l'image 107",
                    "P2 : pas dans le sens des aiguilles d'une montre", "P2 : ne part pas du haut du toit",
                    "P3 : ne part pas du haut du toit", "P4 : empreinte 'xyz'", "P5 : sommet hors du cadre"], msgs
    assert bits_apart("ff" * 16, "fe" + "ff" * 15) == 1
    # le fichier du dépôt : bien formé (ses images gelées, render_film.py --selftest les compare au découpage)
    site = read_json()
    assert site is not None, f"{SITE_JSON} manque : render_film.py --still-cars"
    assert check(site, {s: site["berlines"][s]["image"] for s in site.get("berlines", {})}, site["images"]) == [], \
        check(site, {}, site["images"])
    log("selftest : suivi du bord (rectangle, L, voiture), taches, marge, simplification, sens et départ du haut, "
        "images gelées, fichier du site (écriture, relecture, défauts) : ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        sys.exit("python3 tools/film3d/still_cars.py --selftest (l'export : render_film.py --still-cars)")
