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
        road.strip(f"{name}_road", road.road_profile(), y_road, L, asphalt, rot=rot)
        for side in (-1, 1):
            road.strip(f"{name}_gutter_{side}", road.pan_profile(side), y_pan, L, pan, rot=rot)
            road.strip(f"{name}_kerb_{side}", road.kerb_profile(side), y_kerb, L, kerb, smooth_faces=True, rot=rot)
        # le passage piéton, bandes parallèles à la circulation, 3,2 m de long
        y0 = y_kerb + 2.6
        k, x = 0, -a + 0.45
        while x + 0.5 < a - 0.3:
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
        vs = [bm.verts.new((p.x, p.y, road.WALK_Z)) for p in pts]
        bm.faces.new(vs)
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
    A.box("ground", -160, 160, -160, 160, -0.6, -0.25, A.mat_plain("ground_dark", lin("#121214"), 0.8))


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
    # (aucune couronne au-dessus de l'arc, qui longe l'îlot entre 180° et 270° : vue du drone, une couronne à 30 m
    # de l'objectif couvrirait la berline)
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
    log(f"îlot : palmier royal de 12 m, {len(lean)} cocotiers penchés, {len(ups)} projecteurs")


def build_street_life(hidden, branches):
    """Quatre lampadaires aux entrées, les terrasses des quatre angles, les flaques côté îlot."""
    import lieux
    src = lieux.lamp_source(hidden)
    for name, phi, h, y_kerb in branches:
        u, n = unit(phi)
        p = u * (y_kerb + 5.5) + n * (h + 0.6)
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
            A.instance(terrace, f"terrace_{k}", (x, y, road.WALK_Z), rng.uniform(0, math.tau))
            A.parasol(f"parasol_{k}", x, y, canvas[(q + k) % 3], metal, light=True)
            k += 1
    # les flaques : sur la voie intérieure, le long de l'îlot, là où la berline passe à contresens
    water, N, out = A.material("ring_puddle")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.006, 0.006, 0.007, 1)
    bsdf.inputs["Roughness"].default_value = 0.02
    bsdf.inputs["IOR"].default_value = 1.33
    N.link(bsdf.outputs[0], out.inputs["Surface"])
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


def ring_pools():
    """Les gyrophares de la première patrouille jusque sur l'anneau : deux faisceaux serrés, corail à gauche, lilas
    à droite, qui posent leurs taches sur la chaussée mouillée 10 à 14 m devant elle."""
    x, y, h, _ = P.cars()["patrol_1"]
    x, y, h = P.to_scene(POSE, x, y, h)
    f = Vector((-math.sin(math.radians(h)), math.cos(math.radians(h)), 0.0))
    side = Vector((f.y, -f.x, 0.0))
    p0 = Vector((x, y, 2.1))
    for s, col, ahead in ((-1, CORAL, 11.0), (1, LILAC, 13.5)):
        t = Vector((x, y, 0.0)) + f * ahead + side * (s * 3.0)
        # (visibles dans les reflets : sur l'enrobé mouillé, presque tout passe par le reflet)
        lo = A.add_light(f"ring_pool_{s}", "SPOT", p0 + side * (s * 0.4), t - p0, lin(col), 30000.0, spot=22)
        lo.data.spot_blend = 0.9


def build():
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
    C.place_cars(scene, POSE)
    ring_pools()
    for c in bpy.data.collections:
        if c.name == "sources" or c.name.startswith("sources."):
            c.hide_render = True
            c.hide_viewport = True
    A.make_world(scene)
    co = C.drone(scene, POSE)
    A.render_settings(scene)
    scene.render.use_motion_blur = False
    out = os.path.join(ASSETS, BLEND)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    x, y, z = co.location
    log(f"écrit {out} (arc posé en ({POSE[0]:.1f}, {POSE[1]:.2f}), drone à ({x:.1f}, {y:.1f}, {z:.0f}), lacet "
        f"{math.degrees(co.rotation_euler.z):.0f}° ; {len(bpy.data.objects)} objets, "
        f"{len([o for o in bpy.data.objects if o.type == 'LIGHT'])} lumières)")


if __name__ == "__main__":
    build()
