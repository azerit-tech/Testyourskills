# Les données OpenStreetMap de la ville (© OpenStreetMap contributors, ODbL) :
# bâtiments et leurs parties, rues, eau, téléchargés une fois par l'API
# Overpass puis gardés dans tools/bake/.cache (hors dépôt), pour que city.py
# se relance hors ligne et à l'identique.
#
# Python seul, sans Blender : city.py l'importe, et on peut le lancer à part
# pour remplir le cache ou voir ce qu'il trouve :
#
#   python3 tools/bake/osm.py
#
# Les coordonnées sortent en mètres dans le repère de l'œil : x à droite,
# y droit devant (le cap de la caméra), l'œil à l'origine.
import hashlib
import json
import math
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = os.path.join(ROOT, "tools", "bake", ".cache", "osm")
SERVERS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
UA = "Testyourskills-citybake/1.0 (https://github.com/jmougeot/Testyourskills)"
R_EARTH = 6378137.0

ROADS = "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|pedestrian"


def overpass(query):
    """Une requête Overpass, mise en cache sur disque par son texte."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha1(query.encode()).hexdigest()[:16] + ".json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    body = urllib.parse.urlencode({"data": query}).encode()
    wait = 15
    for attempt in range(8):
        url = SERVERS[attempt % len(SERVERS)]
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=400) as r:
                raw = r.read()
            data = json.loads(raw)
            if "elements" not in data:
                raise ValueError("réponse sans éléments")
            if data.get("remark", "").startswith("runtime error"):
                raise ValueError(data["remark"])
            with open(path, "wb") as f:
                f.write(raw)
            print(f"[osm] {len(data['elements'])} éléments ({len(raw) // 1024} Ko) depuis {url}")
            return data
        except Exception as e:  # serveur saturé : on attend, de plus en plus
            print(f"[osm] {url} : {e} ; nouvel essai dans {wait} s")
            time.sleep(wait)
            wait = min(wait * 2, 120)
    raise RuntimeError("Overpass injoignable, et rien en cache")


class Frame:
    """Projection locale (plan tangent) autour de l'œil, tournée vers le cap."""

    def __init__(self, lat, lon, heading):
        self.lat0, self.lon0 = lat, lon
        self.kx = math.radians(1) * R_EARTH * math.cos(math.radians(lat))
        self.ky = math.radians(1) * R_EARTH
        h = math.radians(heading)
        self.c, self.s = math.cos(h), math.sin(h)

    def xy(self, lat, lon):
        e, n = (lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky
        return (e * self.c - n * self.s, e * self.s + n * self.c)

    def latlon(self, x, y):
        e, n = x * self.c + y * self.s, -x * self.s + y * self.c
        return (self.lat0 + n / self.ky, self.lon0 + e / self.kx)


def num(v):
    """« 12 », « 12.5 m », « 12,5 » : un nombre de mètres, ou None."""
    if v is None:
        return None
    try:
        return float(v.strip().split()[0].replace(",", ".").rstrip("m"))
    except (ValueError, IndexError):
        return None


def join_rings(paths):
    """Recoud les morceaux de contour d'une relation en anneaux fermés."""
    paths = [list(p) for p in paths if len(p) >= 2]
    rings = []
    while paths:
        ring = paths.pop()
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, p in enumerate(paths):
                if p[0] == ring[-1]:
                    ring += p[1:]
                elif p[-1] == ring[-1]:
                    ring += p[-2::-1]
                elif p[-1] == ring[0]:
                    ring = p[:-1] + ring
                elif p[0] == ring[0]:
                    ring = p[:0:-1] + ring
                else:
                    continue
                paths.pop(i)
                changed = True
                break
        if len(ring) >= 4:
            rings.append(ring)  # un anneau resté ouvert (coupé) se referme tout droit
    return rings


def polygons(el):
    """Les polygones d'un élément : [(contour, [trous])], en (lat, lon)."""
    pt = lambda g: (g["lat"], g["lon"])
    if el["type"] == "way":
        g = [pt(p) for p in el.get("geometry", [])]
        return [(g, [])] if len(g) >= 4 and g[0] == g[-1] else []
    outers = join_rings([[pt(p) for p in m.get("geometry", [])] for m in el.get("members", []) if m["type"] == "way" and m.get("role") != "inner"])
    inners = join_rings([[pt(p) for p in m.get("geometry", [])] for m in el.get("members", []) if m["type"] == "way" and m.get("role") == "inner"])
    out = [(o, []) for o in outers]
    for h in inners:  # chaque trou dans le contour qui contient son premier point
        for o, holes in out:
            if inside(h[0], o):
                holes.append(h)
                break
    return out


def inside(p, ring):
    x, y = p
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def bbox_for(frame, arc, far, margin=12.0):
    """L'emprise (sud, ouest, nord, est) du secteur vu par la caméra."""
    pts = [(0.0, 0.0)]
    for k in range(13):
        a = math.radians(-arc / 2 - margin + (arc + 2 * margin) * k / 12)
        pts.append((far * math.sin(a), far * math.cos(a)))
    ll = [frame.latlon(x, y) for x, y in pts]
    return (min(p[0] for p in ll), min(p[1] for p in ll), max(p[0] for p in ll), max(p[1] for p in ll))


def tiles(bb, n):
    s, w, nn, e = bb
    for i in range(n):
        for j in range(n):
            yield (s + (nn - s) * i / n, w + (e - w) * j / n, s + (nn - s) * (i + 1) / n, w + (e - w) * (j + 1) / n)


def fmt(bb):
    return ",".join(f"{v:.4f}" for v in bb)


def load(frame, area, water=True):
    """Bâtiments, rues et eau de l'emprise (sud, ouest, nord, est), en mètres
    dans le repère de l'œil. L'emprise est fixe, pour que le cache serve
    encore quand on retouche le cadrage. Sans `water` : pas de plans d'eau
    (sur une côte, la relation de l'océan est énorme et Overpass cale)."""
    bb = area
    els = {}
    for t in tiles(bb, 3):
        q = f'[out:json][timeout:300][maxsize:536870912];(way["building"]({fmt(t)});relation["building"]["type"="multipolygon"]({fmt(t)});way["building:part"]({fmt(t)});relation["building:part"]["type"="multipolygon"]({fmt(t)}););out geom;'
        for el in overpass(q)["elements"]:
            els[(el["type"], el["id"])] = el
    q = f'[out:json][timeout:300];way["highway"~"^({ROADS})$"]({fmt(bb)});out geom;'
    roads_raw = overpass(q)["elements"]
    water_raw = []
    if water:
        q = f'[out:json][timeout:300];(way["natural"="water"]({fmt(bb)});relation["natural"="water"]({fmt(bb)});way["waterway"="riverbank"]({fmt(bb)});relation["waterway"="riverbank"]({fmt(bb)}););out geom;'
        water_raw = overpass(q)["elements"]

    P = lambda ring: [frame.xy(*p) for p in ring]
    # bâtiments : leurs parties quand elles existent (règle « Simple 3D Buildings »),
    # sinon le contour entier
    parts, outlines = [], []
    for el in els.values():
        tags = el.get("tags", {})
        for outer, holes in polygons(el):
            item = {"id": el["id"], "tags": tags, "outer": P(outer), "holes": [P(h) for h in holes]}
            (parts if "building:part" in tags and tags.get("building:part") != "no" else outlines).append(item)
    # grille pour savoir vite si un contour porte des parties
    cell = 50.0
    grid = {}
    for p in parts:
        cx = sum(x for x, _ in p["outer"]) / len(p["outer"])
        cy = sum(y for _, y in p["outer"]) / len(p["outer"])
        grid.setdefault((int(cx // cell), int(cy // cell)), []).append((cx, cy))
    buildings = list(parts)
    for o in outlines:
        xs, ys = [x for x, _ in o["outer"]], [y for _, y in o["outer"]]
        has = False
        for gx in range(int(min(xs) // cell), int(max(xs) // cell) + 1):
            for gy in range(int(min(ys) // cell), int(max(ys) // cell) + 1):
                if any(inside(c, o["outer"]) for c in grid.get((gx, gy), ())):
                    has = True
                    break
            if has:
                break
        if not has:
            buildings.append(o)

    roads = []
    for el in roads_raw:
        t = el.get("tags", {})
        if t.get("tunnel") not in (None, "no") or t.get("covered") == "yes" or num(t.get("layer")) is not None and num(t.get("layer")) < 0:
            continue
        g = el.get("geometry", [])
        if len(g) >= 2:
            roads.append({"id": el["id"], "tags": t, "pts": [frame.xy(p["lat"], p["lon"]) for p in g]})
    water = []
    for el in water_raw:
        for outer, holes in polygons(el):
            water.append({"outer": P(outer), "holes": [P(h) for h in holes]})
    return {"buildings": buildings, "roads": roads, "water": water, "bbox": bb}


def load_tall(frame, area, min_height=35.0, min_levels=10):
    """Seulement les grands bâtiments d'une emprise lointaine (une ligne de
    tours à l'horizon) : une requête légère, en une fois."""
    bb = fmt(area)
    cond = f'(if:number(t["height"])>={min_height} || number(t["building:levels"])>={min_levels})'
    q = f'[out:json][timeout:300];(way["building"]{cond}({bb});relation["building"]["type"="multipolygon"]{cond}({bb});way["building:part"]{cond}({bb}););out geom;'
    out = []
    for el in overpass(q)["elements"]:
        tags = el.get("tags", {})
        for outer, holes in polygons(el):
            out.append({"id": el["id"], "tags": tags, "outer": [frame.xy(*p) for p in outer], "holes": [[frame.xy(*p) for p in h] for h in holes]})
    return out


def load_extras(area):
    """Plages, parcs et pelouses, trait de côte de l'emprise (sud, ouest, nord,
    est), en (lat, lon) bruts : city.py les projette lui-même."""
    bb = fmt(area)
    q = f'[out:json][timeout:300];(way["natural"="beach"]({bb});relation["natural"="beach"]({bb});way["natural"="sand"]({bb});way["leisure"~"^(park|garden|golf_course|pitch)$"]({bb});relation["leisure"~"^(park|garden|golf_course)$"]({bb});way["landuse"~"^(grass|recreation_ground|cemetery)$"]({bb}););out geom;'
    els = overpass(q)["elements"]
    out = {"beach": [], "green": []}
    for el in els:
        t = el.get("tags", {})
        kind = "beach" if t.get("natural") in ("beach", "sand") else "green"
        for outer, holes in polygons(el):
            out[kind].append({"outer": outer, "holes": holes})
    q = f'[out:json][timeout:300];way["natural"="coastline"]({bb});out geom;'
    out["coast"] = [[(p["lat"], p["lon"]) for p in el.get("geometry", [])] for el in overpass(q)["elements"]]
    return out


if __name__ == "__main__":
    import sys

    sys.path.insert(0, os.path.dirname(__file__))
    # les deux emprises de city.py : South Beach (Miami Beach) et, au loin, le centre de Miami
    f = Frame(25.7893, -80.1288, 0.0)
    d = load(f, (25.758, -80.152, 25.815, -80.116), water=False)
    print(len(d["buildings"]), "bâtiments,", len(d["roads"]), "rues, emprise", d["bbox"])
    print(len(load_tall(f, (25.752, -80.205, 25.800, -80.170))), "tours au loin")
    x = load_extras((25.758, -80.152, 25.815, -80.116))
    print(len(x["beach"]), "plages,", len(x["green"]), "espaces verts,", len(x["coast"]), "tronçons de côte")
