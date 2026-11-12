# Scène F, le rond-point (docs/cinematique-poursuite.md §2.4, l'enrichissement de P2) : le même arc que sur le
# carrefour de la scène A, pris à contresens dans l'anneau, vu du même drone. Aucun immeuble : l'îlot et ses
# palmiers, l'anneau, quatre branches de 30 m, les trottoirs et leurs terrasses.
#
#   lockf -k <verrou> nice -n 10 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup \
#     -P tools/film3d/scene_f.py
#   ... -P tools/film3d/render_b.py -- --scene scene-f.blend [--engine workbench|cycles] [--samples 32]
#
# Écrit assets/scene-f.blend, la caméra du plan posée. Variables : FILM3D_BLEND, FILM3D_HERO, FILM3D_DRIVER.
#
# Repère : le centre de l'îlot en (0, 0), celui de la scène A tourné de rien : l'avenue file vers +y (14 m, branches
# nord et sud), la rue des enseignes part vers -x (8 m, côté ville), l'accès à la plage vers +x (8 m, côté océan).
# Îlot de 12 m (bordure haute de 45 cm), anneau de 9 m à deux voies (rayon extérieur 15 m), trottoir de 4 m.
# La circulation tourne dans le sens trigonométrique (îlot à gauche) : la berline arrive par la branche sud dans sa
# voie extérieure et tourne aussitôt à gauche, à contresens, en frôlant l'îlot (à 1,5 m de sa bordure, l'îlot à
# droite du cadre), vers la rue des enseignes.
#
# Pièces : l'anneau est un maillage en couronne dont la carte UV donne, en mètres, la position en travers et le
# long de la voie (road.mat_asphalt(..., uv=True), plan des voies de road.lane_layout) ; cunettes et bordures sont
# les profils de road.py tournés autour de l'îlot ; branches, passages piétons et cédez-le-passage sont les bandes
# et les décalcomanies de road.py ; berline, patrouilles, sillage et drone viennent de scene_carrefour.py (p2_arc).
import math
import os
import random
import sys
import types

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.join(HERE, "lab")
for p in (HERE, LAB):
    if p not in sys.path:
        sys.path.insert(0, p)

import scene_a as A          # noqa: E402
import road                  # noqa: E402
import lieux                 # noqa: E402  (avant le faux module de road.py : son import y remet scene_a)
import p2_arc as P           # noqa: E402
import scene_carrefour as C  # noqa: E402

ASSETS = A.ASSETS
BLEND = os.environ.get("FILM3D_BLEND", "scene-f.blend")
lin = A.lin
CORAL, LILAC, AMBER = A.CORAL, A.LILAC, A.AMBER
ST = road.STYLES["sechage"]

R_ISLAND = 6.0               # îlot de 12 m
R_OUT = 15.0                 # bord extérieur de l'anneau (cunette comprise)
RING_HALF = (R_OUT - R_ISLAND) / 2      # 4,5 m : l'anneau de 9 m, vu comme une chaussée droite
RING_MID = (R_OUT + R_ISLAND) / 2       # 10,5 m : l'axe de l'anneau
WALK_W = 4.0                 # le trottoir autour de l'anneau
ISLAND_H = 0.45              # la bordure haute de l'îlot
L = 46.0                     # demi-côté du décor : 30 m de branche au-delà du trottoir (80 × 80 m), plus 6 m de
                             # marge pour les coins du cadre tourné du drone
# les branches : (nom, direction vers l'extérieur en degrés, demi-largeur bordure à bordure)
BRANCHES = [("plage", 0.0, 4.0), ("avenue_nord", 90.0, 7.0), ("enseignes", 180.0, 4.0), ("avenue_sud", 270.0, 7.0)]

# Où tombe l'arc de p2_arc.py : la berline arrive par la branche sud, cap au nord, dans la voie extérieure (x = +5,
# comme sur l'avenue de la scène A), et le virage de 30 m passe à 1,5 m de la bordure de l'îlot. Le centre du
# virage est donc à 30 + 6 + 1,5 = 37,5 m du centre de l'îlot ; sa sortie tombe dans la voie de la rue des
# enseignes qui s'éloigne du rond-point (y = +2).
_D = P.R + R_ISLAND + 1.5
_CX = 5.0 - P.R
POSE = (5.0, -math.sqrt(_D ** 2 - _CX ** 2), 0.0)
# les flaques de la voie extérieure (degré, rayon, taille, allongement), faites pour la caméra à 9 m : la caméra A2
# roule dessus (r 12,5 à 13 de l'îlot, 215 à 235°), elles faisaient le miroir noir du bas du cadre ; retirées
OUTER_PUDDLES = ()           # v2 : ((240, 13.4, 1.2, 2.0), (228, 14.0, 0.9, 1.7), (216, 13.2, 1.3, 2.2))
CAR_FILL_W = 800.0           # W, l'appoint lié à la berline (keep_paint) : à 260, la porte à (55, 16, 30) puis
                             # (57, 6, 17) à l'image 28, le bon bordeaux mais plus sombre qu'OUV (73, 29, 26)

# La ville (SPEC §18.36, docs/cinematique-plan-de-ville.md §4, « Rond-point rogné ») : FILM3D_VILLE = « 1 » (défaut),
# le rond-point rogné à ses deux jonctions, ses bords ouverts sur le vide là où se posent ses voisins ; « 0 »,
# l'ancien lieu autonome, inchangé. Au sud (y < SUD_Y) commence l'avenue (scène A, rognée à son y 340,7, le bord du
# trottoir de l'anneau) ; à l'ouest (x < OUEST_X), la rue des enseignes (scène B, s 91, 8 m). Rien du rond-point ne
# passe ces deux droites : branches, places, terrasses, lampadaires, promenade, plage et mer s'y arrêtent.
VILLE = lieux.ville_on()     # (relu par build, à l'appel)
SUD_Y = -19.0                # la jonction avec l'avenue
OUEST_X = -18.2              # la jonction avec la rue des enseignes
DALLE_X = -89.0              # la dalle du rang de l'avenue nord s'arrête là (au-delà : le boulevard du quai)


ROW_Y = 24.0                 # à l'ouest de la jonction, le rond-point ne garde que le rang de l'avenue nord (y ≥ 24)


def in_lieu(x, y, m=0.0):
    """Le point (x, y), à m près, est-il dans l'emprise du rond-point ? (toujours, hors de la ville)"""
    return not VILLE or (y >= SUD_Y + m and (x >= OUEST_X + m or y >= ROW_Y + m))


def _half(pts, k, lim, sgn):
    """Sutherland-Hodgman sur un demi-plan : garde sgn · (p[k] − lim) ≥ 0."""
    out = []
    for i, p in enumerate(pts):
        q = pts[i - 1]
        pin, qin = sgn * (p[k] - lim) >= 0, sgn * (q[k] - lim) >= 0
        if pin != qin:
            out.append(q + (p - q) * ((lim - q[k]) / (p[k] - q[k])))
        if pin:
            out.append(p)
    return out


def clip_lieu(pts):
    """Un polygone (liste de Vector) coupé aux deux jonctions : [polygones], un ou deux (au nord-ouest, la place et
    le pied du rang de l'avenue nord au-delà de x OUEST_X)."""
    if not VILLE:
        return [pts]
    pts = _half(pts, 1, SUD_Y, 1)
    out = [_half(pts, 0, OUEST_X, 1), _half(_half(pts, 0, OUEST_X, -1), 1, ROW_Y, 1)]
    return [p for p in out if len(p) >= 3]


def log(*a):
    print("[scene_f]", *a, flush=True)


# road.py lit ses cotes dans un module « scene_a » : un faux, dont la demi-largeur change d'une pièce à l'autre
PX = types.SimpleNamespace(**{k: getattr(A, k) for k in dir(A) if not k.startswith("__")})
PX.FRONT_X = -200.0          # aucune façade : pas de bande salie au pied des murs sur les trottoirs
PX.SIDE_STREETS = []
road.S = PX


def with_half(h):
    road.S = PX                  # (lieux, à son import, peut y avoir remis le vrai module)
    PX.ROAD_HALF = h
    return h - road.PAN


def unit(phi):
    a = math.radians(phi)
    return Vector((math.cos(a), math.sin(a), 0.0)), Vector((-math.sin(a), math.cos(a), 0.0))


def branch_rot(phi):
    """Le lacet d'une bande de road.py (le long de +y local) qui part du centre dans la direction phi."""
    return math.radians(phi - 90.0)


# ---------------------------------------------------------------- l'anneau

def revolve(name, prof, rc, mat, gaps=(), step=1.0, flip=False):
    """Un profil (x, z) de road.py tourné autour de l'îlot : rayon rc + x. Carte UV en mètres : u = x (en travers),
    v = longueur d'arc sur l'axe. gaps : [(direction en degrés, demi-ouverture en degrés)], les bouches des
    branches où la pièce s'interrompt."""
    g = sorted(gaps)
    spans = [(0.0, 360.0)] if not g else \
        [(phi + d, g[(i + 1) % len(g)][0] + (360.0 if i + 1 == len(g) else 0.0) - g[(i + 1) % len(g)][1])
         for i, (phi, d) in enumerate(g)]
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    for s0, s1 in spans:
        n = max(2, int((s1 - s0) / step))
        rows = []
        for i in range(n + 1):
            t = math.radians(s0 + (s1 - s0) * i / n)
            rows.append([(bm.verts.new(((rc + x) * math.cos(t), (rc + x) * math.sin(t), z)), x, t * rc) for x, z in prof])
        for i in range(n):
            for j in range(len(prof) - 1):
                q = [rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]]
                f = bm.faces.new([v for v, _, _ in q])
                for lp, (_, u, v) in zip(f.loops, q):
                    lp[uvl].uv = (u, v)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if (sum(p.normal.z for p in me.polygons) < 0) != flip:
        me.flip_normals()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def build_ring(hidden):
    """L'anneau (enrobé à deux voies de même sens, tirets entre elles), ses cunettes, la bordure extérieure coupée
    aux bouches des branches, l'îlot : bordure haute, terre, couvre-sol."""
    with_half(RING_HALF)
    lay = road.lane_layout(RING_HALF, 2, centre=False)
    lay["dashes"] = (0.0,)            # les deux voies vont dans le même sens : un tireté entre elles, pas de double axe
    lay["grime"] = 0.5
    asphalt = road.mat_asphalt(ST, "asphalt_ring", layout=lay, uv=True)
    pan = road.mat_gutter_pan(ST, "gutter_pan_ring", uv=True)
    kerb = road.mat_kerb(ST)
    revolve("ring", road.road_profile(), RING_MID, asphalt, step=0.75)
    revolve("ring_gutter_in", road.pan_profile(-1), RING_MID, pan)
    gp = [(phi, math.degrees(math.asin(h / (R_OUT - 0.25)))) for _, phi, h in BRANCHES]
    gk = [(phi, math.degrees(math.asin((h + road.KERB) / (R_OUT + 0.1)))) for _, phi, h in BRANCHES]
    revolve("ring_gutter_out", road.pan_profile(1), RING_MID, pan, gp)
    revolve("ring_kerb_out", road.kerb_profile(1), RING_MID, kerb, gk)
    # l'îlot : bordure haute de 45 cm, terre sombre, un couvre-sol bas
    A.cyl("island_kerb", (0, 0, -0.05), (0, 0, ISLAND_H), R_ISLAND, kerb, seg=96)
    A.cyl("island_soil", (0, 0, 0.0), (0, 0, ISLAND_H + 0.02), R_ISLAND - 0.22,
          A.mat_plain("island_soil", lin("#2e241b"), 0.9), seg=96)
    return asphalt, kerb


def ring_z(r):
    """La cote de la chaussée de l'anneau au rayon r (son bombé)."""
    with_half(RING_HALF)
    return road.road_z(r - RING_MID)


# ---------------------------------------------------------------- les branches, les trottoirs

def branch_end(name):
    """Où s'arrête une branche, en m du centre de l'îlot."""
    if name == "avenue_nord":
        return NORTH_END
    if VILLE and name == "avenue_sud":
        return -SUD_Y
    if VILLE and name == "enseignes":
        return -OUEST_X
    return L


def build_branches(kerb):
    """Les quatre branches : la bande de road.py, tournée, qui commence sous le bord de l'anneau ; cunettes et
    bordures depuis la bordure de l'anneau ; passage piéton à 3 m de l'anneau ; cédez-le-passage sur la moitié
    entrante (la circulation à droite : l'entrée est du côté +n, x < 0 dans le repère de la bande)."""
    paint = road.mat_paint_decal(ST)
    mats = {}
    out = []
    for name, phi, h in BRANCHES:
        a = with_half(h)
        if h not in mats:
            lay = road.AVENUE if h >= 7.0 else road.lane_layout(h, 2)
            mats[h] = (road.mat_asphalt(ST, f"asphalt_{int(2 * h)}m", layout=dict(lay, grime=0.4)),
                       road.mat_gutter_pan(ST, f"gutter_pan_{int(2 * h)}m"))
        asphalt, pan = mats[h]
        rot = branch_rot(phi)
        y_road = math.sqrt((R_OUT - 0.5) ** 2 - a ** 2) - 0.3
        y_pan = math.sqrt((R_OUT - 0.25) ** 2 - h ** 2)
        y_kerb = math.sqrt((R_OUT + 0.1) ** 2 - (h + 0.1) ** 2)
        # (l'avenue nord jusqu'au bout du fond de la caméra basse, build_backdrop ; en ville, les branches sud et
        # ouest s'arrêtent à leur jonction)
        end = branch_end(name)
        road.strip(f"{name}_road", road.road_profile(), y_road, end, asphalt, rot=rot)
        for side in (-1, 1):
            road.strip(f"{name}_gutter_{side}", road.pan_profile(side), y_pan, end, pan, rot=rot)
            road.strip(f"{name}_kerb_{side}", road.kerb_profile(side), y_kerb, end, kerb, smooth_faces=True, rot=rot)
        # le passage piéton, bandes parallèles à la circulation, 3,2 m de long ; en ville, reculé vers l'anneau pour
        # finir avant la jonction, et pas de passage s'il n'y tient pas à 1,5 m de l'anneau (la branche ouest)
        y0 = min(y_kerb + 2.6, end - 3.3)
        k, x = 0, -a + 0.45
        while x + 0.5 < a - 0.3 and y0 >= y_kerb + 1.5:
            road.decal_strip(f"{name}_zebra_{k}", x, x + 0.5, y0, y0 + 3.2, paint).rotation_euler.z = rot
            x += 0.98
            k += 1
        # le cédez-le-passage : un tireté en travers de la moitié entrante, au bord de l'anneau
        yg = math.sqrt(R_OUT ** 2 - (a / 2) ** 2) + 0.4
        x = -a + 0.15
        j = 0
        while x + 0.5 < -0.2:
            road.decal_strip(f"{name}_giveway_{j}", x, x + 0.5, yg, yg + 0.3, paint).rotation_euler.z = rot
            x += 0.8
            j += 1
        out.append((name, phi, h, y_kerb))
    log("4 branches : " + ", ".join(f"{n} {2 * h:.0f} m" for n, _, h in BRANCHES))
    return out


def build_walks():
    """Les quatre angles : le trottoir de 4 m autour de l'anneau et, au-delà, la place dallée jusqu'au bord du décor,
    entre les bordures de deux branches voisines (un polygone par angle, l'arc de la bordure au plus près)."""
    walk = road.mat_pavement(ST)
    rk = R_OUT + road.KERB
    for i in range(4):
        n1, phi1, h1 = BRANCHES[i]
        n2, phi2, h2 = BRANCHES[(i + 1) % 4]
        if phi2 <= phi1:
            phi2 += 360.0
        d1 = math.degrees(math.asin((h1 + road.KERB) / rk))
        d2 = math.degrees(math.asin((h2 + road.KERB) / rk))
        u1, nn1 = unit(phi1)
        u2, nn2 = unit(phi2)
        t1 = math.sqrt(rk ** 2 - (h1 + road.KERB) ** 2)
        t2 = math.sqrt(rk ** 2 - (h2 + road.KERB) ** 2)
        pts = []
        n = 48
        for k in range(n + 1):
            t = math.radians(phi1 + d1 + (phi2 - d2 - phi1 - d1) * k / n)
            pts.append(Vector((rk * math.cos(t), rk * math.sin(t), 0)))
        # le long de la bordure de la branche 2 (son côté -n), jusqu'au bord du décor
        pts.append(u2 * (L / max(abs(u2.x), abs(u2.y))) - nn2 * (h2 + road.KERB))
        mid = math.radians((phi1 + phi2) / 2)
        pts.append(Vector((math.copysign(L, math.cos(mid)), math.copysign(L, math.sin(mid)), 0)))
        pts.append(u1 * (L / max(abs(u1.x), abs(u1.y))) + nn1 * (h1 + road.KERB))
        me = bpy.data.meshes.new(f"walk_{n1}_{n2}")
        bm = bmesh.new()
        for poly in clip_lieu(pts):              # (en ville, coupé aux jonctions : une ou deux pièces)
            poly = [p for j, p in enumerate(poly) if (p - poly[j - 1]).length > 1e-4]
            bm.faces.new([bm.verts.new((p.x, p.y, road.WALK_Z)) for p in poly])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        if sum(p.normal.z for p in me.polygons) < 0:
            me.flip_normals()
        ob = bpy.data.objects.new(f"walk_{n1}_{n2}", me)
        bpy.context.collection.objects.link(ob)
        me.materials.append(walk)
    # sous tout, au-delà du décor : un sol sombre (les coins du cadre tourné ne tombent jamais dans le vide)
    # (en deux pièces : il s'arrête au mur de promenade, la plage et la mer sont plus bas, build_backdrop ; en ville,
    # aucun : c'est un faux lointain, les voisins posent leur sol)
    if VILLE:
        return
    ground = A.mat_plain("ground_dark", lin("#121214"), 0.8)
    A.box("ground", -160, 7.2 + AV_WALK, -160, NORTH_END, -0.6, -0.25, ground)
    A.box("ground_e", 7.2 + AV_WALK, SEA_X + 0.35, -160, L + 0.35, -0.6, -0.25, ground)


# ---------------------------------------------------------------- l'îlot, les palmiers, la rue

def build_island(hidden):
    """Un palmier royal de 12 m au centre, quatre cocotiers penchés vers l'extérieur, six projecteurs ambre."""
    royal = A.royal_source(hidden)
    sc = 12.0 / max(royal.dimensions.z, 0.1)
    A.instance(royal, "island_royal", (0, 0, ISLAND_H), 0.4, sc)
    cocos = A.coconut_sources(hidden)
    lean = sorted([c for c in cocos if 7.0 < c[1] < 13.0], key=lambda c: -c[3])[:4]
    for o, *_ in cocos:
        if all(o is not s for s, *_ in lean):
            bpy.data.objects.remove(o)
    ups = []
    # (vue du drone, aucune couronne au-dessus de l'arc, qui longe l'îlot entre 180° et 270° ; le cinquième cocotier
    # de la v2, penché à 222° au-dessus de la voie intérieure, est retiré : la caméra de poursuite v3, à 2,6 m,
    # passait à 3 m de son pied, dans ses palmes)
    for k, (src, top, ang, off) in enumerate(lean):
        phi = math.radians((0.0, 70.0, 130.0, 310.0)[k])
        x, y = 3.6 * math.cos(phi), 3.6 * math.sin(phi)
        A.instance(src, f"island_coco_{k}", (x, y, ISLAND_H), phi - ang, 0.9)
        ups.append((x, y, phi, 3.6 + off))
    # les projecteurs : deux au pied du royal, un au pied de chaque cocotier, vers la couronne
    for j in range(2):
        a = 0.6 + j * math.pi
        ups.append((0.0, 0.0, a, 0.0))
    for k, (x, y, phi, reach) in enumerate(ups):
        p = Vector((x + 0.8 * math.cos(phi + 2.4), y + 0.8 * math.sin(phi + 2.4), ISLAND_H + 0.1))
        top = Vector((reach * math.cos(phi), reach * math.sin(phi), 10.0)) if reach else Vector((0, 0, 12.0))
        # (vus du ciel, des faisceaux serrés n'éclairent que le dessous des palmes : plus larges, ils posent aussi
        # l'ambre sur la terre, les touffes et la voie intérieure, et les flaques le renvoient)
        lo = A.add_light(f"island_up_{k}", "SPOT", p, top - p, lin(AMBER), 3500.0, spot=58)
    # le couvre-sol : des touffes basses entre les troncs
    shrub = A.source(A.import_glb("shrub_01/shrub_01.gltf"), "shrub_src", hidden)
    sd = shrub.dimensions
    ss = 0.9 / max(sd.x, sd.y, 0.01)
    rng = random.Random(3)
    for k in range(18):
        a, r = rng.uniform(0, math.tau), rng.uniform(1.4, R_ISLAND - 0.9)
        A.instance(shrub, f"island_shrub_{k}", (r * math.cos(a), r * math.sin(a), ISLAND_H), rng.uniform(0, math.tau),
                   ss * rng.uniform(0.8, 1.3))
    # le massif et la bordure du côté de l'arc, vus à hauteur de voiture : deux projecteurs bas, tournés vers
    # l'extérieur (les projecteurs du pied n'éclairent que les couronnes)
    for k, deg in enumerate((212.0, 244.0)):
        t = math.radians(deg)
        p = Vector((2.4 * math.cos(t), 2.4 * math.sin(t), 2.6))
        q = Vector(((R_ISLAND - 0.4) * math.cos(t), (R_ISLAND - 0.4) * math.sin(t), ISLAND_H))
        lo = A.add_light(f"island_low_{k}", "SPOT", p, q - p, lin("#ffd9a8"), 700.0, spot=75)
        lo.data.spot_blend = 0.7
        lo.visible_glossy = False
    log(f"îlot : palmier royal de 12 m, {len(lean)} cocotiers penchés, {len(ups)} projecteurs, 2 au ras du massif")


def build_edges(water):
    """Ce que la berline frôle et ce qui passe entre elle et la caméra basse, dans le quart sud-ouest (la glisse) :
    des balises blanches à bande rétroréfléchissante sur la bordure de l'îlot (la caisse passe à un mètre), et
    trois flaques sur la voie extérieure, entre la caméra et la berline, qui la renvoient sous elle. (Des bornes
    sur la bordure extérieure ne passaient jamais dans le cadre : la caméra regarde vers l'îlot, elles restaient
    sur ses côtés.)"""
    import scene_b as B
    white = A.mat_plain("balise_white", lin("#e8e4dc"), 0.45)
    band = A.mat_emit("balise_band", lin("#ffb46a"), 4.0)
    n = 0
    for deg in range(196, 260, 12):
        t = math.radians(deg)
        r = R_ISLAND - 0.18
        x, y = r * math.cos(t), r * math.sin(t)
        A.cyl(f"balise_{n}", (x, y, ISLAND_H), (x, y, ISLAND_H + 0.75), 0.05, white)
        A.cyl(f"balise_band_{n}", (x, y, ISLAND_H + 0.55), (x, y, ISLAND_H + 0.68), 0.052, band)
        n += 1
    # (degré, rayon, taille, allongement) : sur la voie extérieure, hors de la route de la berline (r 8 à 11 ici)
    for j, (deg, r, rad, sy) in enumerate(OUTER_PUDDLES):
        t = math.radians(deg)
        ob = B.puddle(f"ring_puddle_out_{j}", 0.0, 0.0, rad, sy, 140 + j, water)
        for v in ob.data.vertices:
            lx, ly = v.co.x, v.co.y
            v.co.x = (r + lx) * math.cos(t) - ly * math.sin(t)
            v.co.y = (r + lx) * math.sin(t) + ly * math.cos(t)
            v.co.z = ring_z(math.hypot(v.co.x, v.co.y)) + 0.0025
        ob.data.update()
    log(f"bords : {n} balises sur l'îlot, {len(OUTER_PUDDLES)} flaques sur la voie extérieure")


def build_street_life(hidden, branches):
    """Quatre lampadaires aux entrées, les terrasses des quatre angles, les flaques côté îlot."""
    import lieux
    src = lieux.lamp_source(hidden)
    for name, phi, h, y_kerb in branches:
        u, n = unit(phi)
        p = u * (y_kerb + 5.5) + n * (h + 0.6)
        if not in_lieu(p.x, p.y, 0.5):            # (en ville, celui de la branche ouest tombe dans la rue)
            continue
        lieux.lamp(src, (p.x, p.y, road.WALK_Z), arm=(-n.x, -n.y), name=f"lamp_{name}")
    terrace = A.source(A.import_glb("outdoor_table_chair_set_01/outdoor_table_chair_set_01.gltf"), "terrace_src", hidden)
    metal = A.mat_plain("street_metal", (0.035, 0.035, 0.04, 1), 0.4, 0.8)
    canvas = [A.mat_plain("parasol_cream", lin("#efe4cf"), 0.85), A.mat_plain("parasol_coral", lin("#e0704f"), 0.85),
              A.mat_plain("parasol_mint", lin("#8fcfbf"), 0.85)]
    rng = random.Random(8)
    k = 0
    for q in range(4):
        mid = math.radians(45.0 + 90.0 * q)
        for dr, da in ((22.0, 0.0), (25.5, -0.12), (25.5, 0.12), (29.0, 0.0)):
            x, y = dr * math.cos(mid + da), dr * math.sin(mid + da)
            if not in_lieu(x, y, 1.6):            # (le parasol fait 1,35 m de rayon)
                continue
            A.instance(terrace, f"terrace_{k}", (x, y, road.WALK_Z), rng.uniform(0, math.tau))
            A.parasol(f"parasol_{k}", x, y, canvas[(q + k) % 3], metal, light=True)
            k += 1
    # les flaques : sur la voie intérieure, le long de l'îlot, là où la berline passe à contresens
    # la flaque commune (road.puddle_shader, l'humidité de road.HUMIDITE)
    water, N, out = A.material("ring_puddle")
    road.puddle_shader(N, out)
    import scene_b as B
    for j, (deg, r, rad, sy) in enumerate(((196, 7.4, 0.9, 1.6), (214, 7.0, 0.6, 1.3), (232, 7.8, 1.1, 1.8),
                                          (252, 7.2, 0.7, 1.5), (270, 8.0, 0.8, 1.2), (160, 7.6, 0.6, 1.4))):
        t = math.radians(deg)
        ob = B.puddle(f"ring_puddle_{j}", 0.0, 0.0, rad, sy, 90 + j, water)
        # (la flaque est dessinée au centre, puis allongée le long de l'anneau et posée sur son bombé)
        for v in ob.data.vertices:
            lx, ly = v.co.x, v.co.y
            v.co.x = (r + lx) * math.cos(t) - ly * math.sin(t)
            v.co.y = (r + lx) * math.sin(t) + ly * math.cos(t)
            v.co.z = ring_z(math.hypot(v.co.x, v.co.y)) + 0.0025
        ob.data.update()
    log(f"4 lampadaires, {k} terrasses, 6 flaques le long de l'îlot")


# ---------------------------------------------------------------- le fond, à hauteur de voiture (découpage v2)
#
# La caméra basse du découpage v2 (p2_arc.low_cam_pos) regarde d'abord l'est (la branche de la plage), puis
# pivote vers le nord-nord-est (l'avenue nord). Le décor fait pour le drone s'arrêtait à 46 m du centre : au-delà,
# un sol sombre sous un ciel vide. Ici : la mer et le mur de promenade à l'est (le mur de l'avenue de la scène A),
# l'avenue nord prolongée jusqu'à NORTH_END, ses immeubles à boutiques côté ville (les dessins de la scène A), des
# palmiers et des lampadaires des deux côtés, la mer derrière le mur côté est. Tout est de la bibliothèque déjà
# chargée par les autres scènes.
NORTH_END = 400.0            # l'avenue nord, du rond-point jusque-là
SEA_X = 46.0                 # le mur de promenade, au bout de la branche de la plage
AV_WALK = 4.0                # les trottoirs de l'avenue nord prolongée


def place_building(protos, kind, x, y0, tint, n, srcs):
    """Un dessin de la scène A (façade vers +x au pied x, de y0 à y0 + W), ses accessoires et ses lumières de
    boutique : la recette de scene_a.build_city, réduite à ce que la caméra basse voit."""
    ob, props, lts, spec = protos[kind]
    inst = A.instance(ob, f"{ob.name}_n{n}", (x, y0, 0))
    inst.color = (*lin(tint)[:3], 1)
    for j, (pk, (px, py, pz), rot, s) in enumerate(props):
        src = random.choice(srcs["ac"]) if pk == "ac" else srcs["tank"] if pk == "tank" else bpy.data.objects.get(pk)
        if src is not None:
            A.instance(src, f"{pk}_n{n}_{j}", (x + px, y0 + py, pz), rot, s)
    warm = lin("#ffd9a8")
    for j, (lk, (lx, ly, lz), w) in enumerate(lts):
        loc = (x + lx, y0 + ly, lz)
        if lk == "shop":
            A.add_light(f"shop_n{n}_{j}", "AREA", loc, (1, 0, -0.35), lin("#ffcf96"), 90.0 * w / 3, (w, 2.2))
        elif lk == "canopy":
            A.add_light(f"canopy_n{n}_{j}", "AREA", loc, (0.2, 0, -1), warm, 260.0, (w, 2.2))
        elif lk == "wash":
            A.add_light(f"wash_n{n}_{j}", "SPOT", loc, (-1.5, 0, 2.2), warm, 1800.0, spot=75)
        elif lk == "blade":
            A.add_light(f"blade_n{n}_{j}", "SPOT", loc, (-0.35, 0, 1), warm, 900.0, spot=28)
        elif lk == "light":
            Ld = dict(kind="POINT", direction=(0, 0, -1), color="#ffd9a8", energy=100.0, size=(0.2, 0.2), spot=60.0)
            Ld.update(w)
            lo = A.add_light(f"fl_n{n}_{j}", Ld["kind"], loc, Ld["direction"], lin(Ld["color"]), Ld["energy"],
                             Ld["size"], Ld["spot"])
            if Ld.get("hide"):
                lo.visible_camera = lo.visible_glossy = lo.visible_transmission = False
    if not spec.get("own_uplights"):
        # les façades éclairées du pied (comme sur l'avenue) : sans elles, des blocs noirs au fond du cadre
        yy, zl = 1.5, (spec.get("gf_h", 4.2) + 0.1 if spec.get("gf", "shops") == "shops" else 0.2)
        while yy < spec["W"] - 1:
            A.add_light(f"up_n{n}_{int(yy)}", "SPOT", (x + 0.45, y0 + yy, zl), (-0.16, 0, 1), lin("#ffe2bf"),
                        700.0 if spec.get("uplight") else 380.0, spot=60)
            yy += 4.0
    return spec["W"]


def build_backdrop(hidden):
    import lieux
    M = A.city_mats()
    with_half(7.0)
    walk = road.mat_pavement(ST, "pavement_avenue_nord")
    kx = 7.0 + road.KERB
    # --- l'avenue nord au-delà du décor du drone : ses deux trottoirs (la chaussée, build_branches)
    A.box("av_walk_w", -kx - AV_WALK, -kx, L, NORTH_END, -0.05, road.WALK_Z, walk)
    A.box("av_walk_e", kx, kx + AV_WALK, L, NORTH_END, -0.05, road.WALK_Z, walk)
    A.box("av_block_w", DALLE_X if VILLE else -200.0, -kx - AV_WALK, L, NORTH_END, -0.05, road.WALK_Z, walk)
    # --- le mur de promenade (celui de l'avenue de la scène A) : au bout de la branche de la plage, le long du bord
    # nord de la place, puis le long de l'avenue nord côté mer ; la plage et la mer derrière (en ville, au nord de la
    # jonction de l'avenue seulement : au sud, ce sont les siennes)
    wall = A.mat_plain("sea_wall", lin("#d9d2c4"), 0.6)
    xe = kx + AV_WALK
    ys = SUD_Y if VILLE else None
    for name, (x0, x1, y0, y1) in (("e", (SEA_X, SEA_X + 0.35, ys or -L, L + 0.35)),
                                   ("n", (xe, SEA_X + 0.35, L, L + 0.35)), ("av", (xe, xe + 0.35, L, NORTH_END))):
        A.box(f"sea_wall_{name}", x0, x1, y0, y1, 0.0, 0.85, wall)
        A.box(f"sea_wall_cap_{name}", x0 - 0.08, x1 + 0.1, y0, y1, 0.85, 0.95, M["trim"])
    sand = A.mat_plain("wet_sand", lin("#3a332d"), 0.3)
    A.box("beach_e", SEA_X + 0.35, 120.0, ys or -200.0, L + 0.35, -1.6, -1.5, sand)
    A.box("beach_n", xe + 0.35, 120.0, L + 0.35, 900.0, -1.6, -1.5, sand)
    A.box("sea", 120.0, 4000.0, ys or -1200.0, 4000.0, -1.7, -1.6, A.mat_sea())
    # --- les immeubles côté ville de l'avenue nord, façades vers la chaussée, boutiques allumées
    P = A.prototypes(M)
    protos = {}
    for k, (ob, props, lights, spec) in P.items():
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        hidden.objects.link(ob)
        protos[k] = (ob, props, lights, spec)
    srcs = dict(ac=[A.source([o], f"ac_src_n{i}", hidden) for i, o in
                    enumerate(A.import_glb("exterior_aircon_unit/exterior_aircon_unit.gltf"))],
                tank=A.source(A.import_glb("water-tank.glb"), "tank_src_n", hidden))
    pastels = ["#f2c6cf", "#bfe3d6", "#f4e6b8", "#f6efe0", "#c8dcef", "#f6d2b0", "#d8cdf0", "#e3efd0"]
    rng = random.Random(23)
    seq = ["deco", "shop", "hotel", "block", "liner", "flats", "tower"]
    y, n = 24.0, 0
    while y < NORTH_END - 10.0:
        k = seq[n] if n < len(seq) else rng.choice([kk for kk in protos if kk != "motel"])
        y += place_building(protos, k, -kx - AV_WALK, y, pastels[n % len(pastels)], n, srcs) + rng.choice((0.0, 2.0, 5.0))
        n += 1
    # --- palmiers royaux côté mer et le long de la promenade, lampadaires des deux côtés
    royal = A.royal_source(hidden)
    sc = 12.0 / max(royal.dimensions.z, 0.1)
    palms = 0
    for yy in range(52, int(NORTH_END), 16):
        A.instance(royal, f"av_royal_{palms}", (kx + 1.6, yy, road.WALK_Z), rng.uniform(0, math.tau),
                   sc * rng.uniform(0.85, 1.1))
        palms += 1
    for yy in range(-38, int(L), 13):
        if abs(yy) < 6 or not in_lieu(SEA_X - 2.0, yy, 4.0):   # la bouche de la plage ; l'avenue, en ville
            continue
        A.instance(royal, f"prom_royal_{palms}", (SEA_X - 2.0, yy, road.WALK_Z), rng.uniform(0, math.tau),
                   sc * rng.uniform(0.8, 1.05))
        palms += 1
    src = lieux.lamp_source(hidden)
    lamps = 0
    for yy in range(60, int(NORTH_END), 30):
        for side in (-1, 1):
            lieux.lamp(src, (side * (kx + 0.5), yy + (15 if side < 0 else 0), road.WALK_Z), arm=(-side, 0),
                       name=f"lamp_av_{lamps}")
            lamps += 1
    for yy in range(-30, int(L), 20):
        if not in_lieu(SEA_X - 0.8, yy, 0.5):
            continue
        lieux.lamp(src, (SEA_X - 0.8, yy, road.WALK_Z), arm=(-1, 0), name=f"lamp_prom_{lamps}")
        lamps += 1
    road.S = PX
    log(f"fond : avenue nord jusqu'à {NORTH_END:.0f} m, {n} immeubles, mer et mur de promenade, {palms} palmiers, "
        f"{lamps} lampadaires")


def keep_paint():
    """Le bordeaux de la berline (#4e0a28, comme dans OUV) tout le plan. Mesuré sur la porte à 256 échantillons :
    (146, 13, 2) à l'image 1, rouge orangé, (23, 3, 9) à l'image 28, presque noir ; OUV, (73, 29, 26). Les lumières
    ambre et chaudes du rond-point (lampadaires, projecteurs de l'îlot) n'éclairent plus la caisse (liaison de
    lumière, exclusion) ; une source douce liée à la seule berline (lieux.car_fill), du côté de la caméra (son flanc
    gauche, +x dans son repère), lui rend une lumière neutre sur tout le plan."""
    import lieux
    car = bpy.data.objects["coupe"]
    # toute la voiture, caisse comprise : la caisse (ailes, capot, coffre) est l'objet `coupe` lui-même, les portes
    # et les roues ses enfants. (lieux.car_fill ne prend que les enfants : la caisse restait hors de l'appoint, les
    # portes seules le recevaient, rouge magenta sur une caisse presque noire ; la collection est faite ici, il la
    # reprend.)
    whole = [o for o in (car, *car.children_recursive) if o.type == "MESH"]
    sans = bpy.data.collections.new("berline_sans_ambre")
    avec = bpy.data.collections.new(f"{car.name}_lumiere_avec")
    for o in whole:
        sans.objects.link(o)
        if not o.get("vitre"):                     # les vitres hors de l'appoint : lieux.car_parts
            avec.objects.link(o)
    n = 0
    for lo in bpy.data.objects:
        if lo.type == "LIGHT" and lo.name.startswith(("lamp_", "island_low_", "island_up_", "se_up_")):
            lo.light_linking.receiver_collection = sans
            n += 1
    for co in sans.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
    # (sans reflet : vu de 5 m, celui d'une source de 3 m posait une tache rose blanc sur les portes ; chaude et
    # haute : neutre, de 2,8 m, elle sortait la seule porte avant framboise, (82, 20, 50), le reste de la caisse noir)
    # (de 5 m et large de 8 : de 3,4 m, l'aile avant restait 19 % plus sombre que la porte au même galbe)
    fill = lieux.car_fill(car, loc=(5.0, 0.0, 3.0), energy=CAR_FILL_W, color="#ffc89a", size=8.0)
    fill.visible_glossy = False
    # les phares : 1400 W et 50° étaient faits pour le drone ; de face et à ras du sol, ils mangeaient la caisse
    # (image 8 de l'essai 1) ; ceux de P3, de face eux aussi
    for lo in [c for c in car.children_recursive if c.type == "LIGHT" and c.data.type == "SPOT"]:
        lo.data.energy = 400.0
        lo.data.spot_size = math.radians(34)
    log(f"berline : {len(whole)} pièces, {n} lumières chaudes exclues, appoint lié de {CAR_FILL_W:.0f} W, "
        f"phares à 400 W")


def build(plan=None, palier=None):
    """Écrit scene-f.blend (en ligne de commande), ou rend la scène à render_lieux.py (--lieu rond-point --plan
    P2), sans l'écrire. Le plan P2 est animé (28 images, motion.py), posé à l'image de l'image fixe."""
    global VILLE
    VILLE = lieux.ville_on()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    random.seed(17)
    hidden = bpy.data.collections.new("sources")
    scene.collection.children.link(hidden)
    _, kerb = build_ring(hidden)
    branches = build_branches(kerb)
    build_walks()
    build_island(hidden)
    build_street_life(hidden, branches)
    build_backdrop(hidden)
    # (build_dusk retiré : sa lueur d'horizon à l'est, son bosquet éclairé et ses deux lampadaires faisaient un
    # second ciel pour une caméra qui n'existe plus ; lumière v3.1, règle A)
    build_edges(bpy.data.materials["ring_puddle"])
    C.place_cars(scene, POSE, anim=True)
    keep_paint()
    for c in bpy.data.collections:
        if c.name == "sources" or c.name.startswith("sources."):
            c.hide_render = True
            c.hide_viewport = True
    # le ciel commun ; en ville, la bande à l'azimut de la mer de la ville (§3.3, +20° ici), seul, 35° à gauche
    A.make_world(scene, lieux.mer_lieu("rond-point") if VILLE else math.radians(35.0))
    # (découpage v2 : le travelling bas à l'intérieur de l'arc remplace le drone, C.drone garde l'ancien cadre)
    co = C.chase_camera(scene, POSE)
    A.render_settings(scene)
    scene.render.use_motion_blur = True             # le flou de bougé suit les clés (obturateur 0,5)
    scene.render.motion_blur_shutter = 0.5
    __import__("fx").dress("P2", scene)                    # les interactions (fx.py ; FILM3D_FX=0 les retire)
    if plan is not None:
        return scene
    out = os.path.join(ASSETS, BLEND)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    x, y, z = co.location
    log(f"écrit {out} (arc posé en ({POSE[0]:.1f}, {POSE[1]:.2f}), drone à ({x:.1f}, {y:.1f}, {z:.0f}), lacet "
        f"{math.degrees(co.rotation_euler.z):.0f}° ; {len(bpy.data.objects)} objets, "
        f"{len([o for o in bpy.data.objects if o.type == 'LIGHT'])} lumières)")


if __name__ == "__main__":
    build()
