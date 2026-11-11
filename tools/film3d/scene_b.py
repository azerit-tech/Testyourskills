# Scène B du film, la rue des enseignes (docs/cinematique-poursuite.md §2.4) : le plan P3, le barrage.
#
#   lockf -k <verrou> nice -n 10 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup \
#     -P tools/film3d/scene_b.py
#   lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     -P tools/film3d/render_b.py -- --engine workbench            # cadrage : 360 × 640, quelques secondes
#   ... -P tools/film3d/render_b.py -- --engine cycles --samples 32  # lumière : processeur, 2 fils, 360 × 640
#   ... -P tools/film3d/render_b.py -- --engine cycles --percent 100 --samples 256 --gpu   # machine louée
#
# Lit les assets de Azerit/design/film/assets (python3 tools/film3d/fetch.py), écrit assets/scene-b.blend,
# la caméra du plan déjà posée : render.py le rend tel quel (--shot a, par défaut).
#
# Variables d'environnement :
#   FILM3D_PLAN   : le plan à poser (table PLANS plus bas ; P3 par défaut, le seul de la scène)
#   FILM3D_BLEND  : le nom du .blend écrit dans assets (scene-b.blend par défaut)
#   FILM3D_HERO, FILM3D_DRIVER, FILM3D_USURE : la voiture poursuivie, comme dans scene_a.py
#
# Repère de la scène enregistrée : z en haut, la voiture en fuite roule vers +y, y vaut s (le chemin parcouru
# dans la rue, §2.4). La rue fait 150 m (s de 1 à 150), chaussée de 8 m à deux voies, trottoirs de 3 m, façades
# face à face à 14 m ; le barrage à s = 130, la caméra à s = 134 ; au bout (s < 0), l'entrée du rond-point.
# Tout est construit dans le repère de la caméra (voir S_CAM) puis tourné d'un bloc à la fin (to_world).
#
# Ce qui vient d'ailleurs, sans y toucher : la chaussée qui sèche, ses bordures et ses trottoirs (road.py, sur une
# largeur à elle), les immeubles (facade_mix.py : étages en enduit photographique de facade_b.py, boutiques de
# bibliothèque), le ciel et l'étalonnage (scene_a.py), la berline (lab/hero_cars.py par scene_a.street_hero), la
# patrouille à pare-buffle (lab/cast_vehicles.py), les agents (lab/cast_people.py), les modèles libres de la rue et
# du barrage (CREDITS.md : enseigne MOTEL, néon cerise, distributeur de journaux, borne d'incendie, plots et
# panneaux, barrière de foule), remis à leur taille réelle ici. Écrit ici : les dessins d'immeubles propres à la
# rue, la pose des deux rangs, les enseignes en potence, les câbles, lanternes et guirlandes en travers, les
# portières ouvertes, l'îlot du rond-point au fond.
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

ASSETS = A.ASSETS
BLEND = os.environ.get("FILM3D_BLEND", "scene-b.blend")
PLAN = os.environ.get("FILM3D_PLAN", "P3")
lin = A.lin
CORAL, LILAC, AMBER, CREAM, NAVY = A.CORAL, A.LILAC, A.AMBER, A.CREAM, A.NAVY

# la rue. La scène est construite dans le repère de la caméra (« repère de vue » : caméra à y = 0, regard vers +y),
# puis tournée d'un demi-tour et posée à S_CAM : dans la scène enregistrée, la voiture en fuite roule vers +y comme
# dans les autres scènes du film. s = S_CAM - y de vue.
HALF = 4.0             # demi-chaussée : 8 m à deux voies
WALK = 3.0             # trottoir
FRONT = HALF + WALK    # façades à x = ±7, face à face à 14 m
S_CAM = 134.0          # la caméra, 4 m derrière le barrage (s = 130)
Y0, Y_END = -16.0, 133.0   # la rue en repère de vue : s de 150 à 1 ; au-delà, l'entrée du rond-point
RING = (0.0, 150.0)        # le centre du rond-point en repère de vue (s = -16) : îlot de 12 m, anneau de 15 m de rayon
Y_FAR = 176.0              # la place du rond-point s'arrête au muret de la promenade

# Les plans de la scène (docs/cinematique-poursuite.md §2.3 et §2.4), en repère de vue. cam : position ; lens ;
# shift_y : décentrement (l'horizon descend, les enseignes montent) ; hero : (x, y, lacet en degrés), l'avant vers -y
# de vue ; chase : la troisième patrouille (x, y) ; barrage : y de vue du milieu des deux patrouilles.
PLANS = {
    # P3, le barrage : 30 cm du sol, 24 mm, dans l'axe, les patrouilles à 5 m ; l'instant fort : la berline à
    # 110 km/h juste avant les plots, phares en plein contre-jour, les deux agents ouvrent le feu (fire : éclairs)
    "P3": dict(cam=(0.1, 0.0, 0.30), lens=24.0, shift_y=0.2, fstop=4.0, focus=(0.3, 7.5, 0.8),
               hero=(0.35, 14.4, 4.0), chase=(-1.2, 74.4), barrage=8.0, fire=True),
}

# Les quatre dessins de la rue (§2.4 : la boutique d'angle, le petit hôtel, l'Art déco d'angle, le bloc bas), ceux
# de l'avenue réagencés : deux à quatre niveaux (7 à 14 m), d'autres largeurs, balcons en applique (45 cm) pour
# laisser passer les potences, boutiques serrées.
SPECS = {
    "rue_hotel": dict(W=16, D=14, floors=4, nshops=2, lobby_bay=1, eyebrow=True, balc="alt", balc_d=0.45, bay=2.7,
                      ac=0.18, ac_roof=2, tank=True, frame="frame_b"),
    "rue_corner": dict(W=12, D=12, floors=3, nshops=2, ac=0.25, ac_roof=1, vents=2, bay=3.0),
    "rue_deco": dict(W=18, D=14, floors=4, nshops=3, eyebrow=True, step=True, balc="ends", balc_d=0.45, ac_roof=2,
                     stair=True, vents=2, bay=3.0),
    "rue_low": dict(W=20, D=14, floors=2, nshops=4, bay=3.4, wh=1.5, eyebrow=True, ac_roof=3, vents=3),
}
# leurs boutiques et enseignes de rez-de-chaussée (facade_mix.PLAN) : mots génériques seulement
GF_PLAN = {
    "rue_hotel": dict(bays=["bar", "lobby"], words={0: ("BAR", "amber")}, awn={0: 3}, vacancy=True, wash="#ffe2c4"),
    "rue_corner": dict(bays=["cafe", "store"], words={0: ("CAFE", "cream")}, open=1, awn={0: 4}, wash="#ffe2bf"),
    "rue_deco": dict(bays=["store", "bar", "cafe"], words={1: ("BAR", "coral")}, open=2, awn={2: 1}, wash="#ffe6c6",
                     service=True),
    "rue_low": dict(bays=["bar", "store", "cafe", "store"], words={0: ("BAR", "amber"), 2: ("CAFE", "coral")}, open=1,
                    awn={1: 0, 3: 2}, wash="#ffe2bf"),
}
# ce que facade_b ajoute aux étages (facade_b.STYLE) : néons de couronnement, pylône de l'hôtel
UP_STYLE = {
    "rue_hotel": dict(pylon=True, coping="coral", letters="HOTEL", brow="window", ac=0.18),
    "rue_corner": dict(ac=0.25),
    "rue_deco": dict(coping="lilac", speed=True, ac=0.0),
    "rue_low": dict(coping="coral", speed=True, ac=0.0),
}
# des enduits plus profonds que les pastels de l'avenue : terre cuite, ocre, vert d'eau, rose passé, bleu
TINTS = ["#d98a6e", "#e2b56a", "#93c2ab", "#dc9ea2", "#a3bcdc", "#efe0c0", "#bba9d9", "#d9b85c", "#e7a98a",
         "#9fcfc4"]

# les deux rangs d'immeubles, en repère de vue : (dessin, y du bout proche de la caméra), bout à bout jusqu'à 128.
# L'hôtel et son pylône lumineux jamais à moins de 45 m de la caméra : ses lettres tomberaient dans la bande du haut.
# Près de la caméra, les dessins à quatre niveaux : le ciel n'est plus qu'une fente.
LEFT = [("rue_deco", -16.0), ("rue_corner", 2.0), ("rue_deco", 14.0), ("rue_corner", 32.0), ("rue_hotel", 44.0),
        ("rue_low", 60.0), ("rue_deco", 80.0), ("rue_hotel", 98.0), ("rue_corner", 114.0)]
RIGHT = [("rue_low", -16.0), ("rue_deco", 4.0), ("rue_corner", 22.0), ("rue_deco", 34.0), ("rue_hotel", 52.0),
         ("rue_low", 68.0), ("rue_hotel", 88.0), ("rue_corner", 104.0), ("rue_corner", 116.0)]

# les enseignes en potence : une tous les 8 à 12 m de chaque côté, entre 4 et 8 m de haut (blade_table()) ;
# beaucoup d'ambre, de crème et de corail, un peu de menthe et de lilas
WORDS = [("HOTEL", "amber"), ("BAR", "coral"), ("CAFE", "cream"), ("VACANCY", "cream"), ("OPEN", "coral"),
         ("BAR", "lilac"), ("HOTEL", "coral"), ("CAFE", "mint"), ("OPEN", "amber"), ("HOTEL", "cream"),
         ("BAR", "amber"), ("CAFE", "amber"), ("VACANCY", "coral"), ("OPEN", "cream")]
NEON_LIGHT = {"amber": "#ffc36b", "cream": "#fff1d6", "coral": "#ff6a3d", "mint": "#7fe0c4", "lilac": "#8d8cf0"}
MOTEL = (-1, 72.0)     # l'enseigne MOTEL sur mât (modèle de bibliothèque) : côté, y de vue

# câbles en travers : y de vue des portées ; une lanterne au milieu de chacune, des guirlandes entre elles
SPANS = [13.0, 20.5, 28.0, 36.5, 46.0, 57.0, 70.0, 84.0, 100.0, 116.0]
# lampadaires tous les 30 m en quinconce : (côté, y de vue)
LAMPS = [(-1, 16.0), (1, 46.0), (-1, 76.0), (1, 106.0)]
# les voitures garées, d'un seul côté (x > 0 en vue), aucune dans les 40 derniers mètres avant le barrage
PARKED = [32.0, 45.5, 59.0, 86.0, 99.5, 113.0]


def log(*a):
    print("[scene_b]", *a, flush=True)


# ---------------------------------------------------------------- les modèles de bibliothèque

def lib_parts(path, groups, hidden, scale=1.0):
    """Importe un modèle libre et en tire des sources : groups = {nom: filtre(objet, centre monde)}. Transformations
    appliquées, maillages copiés (le glTF peut les partager), mis à l'échelle réelle, origine au pied, textures
    ramenées à 1K ; le reste du modèle est supprimé."""
    import cast_vehicles as cv
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, path))
    bpy.context.view_layer.update()
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    info = {}
    for o in meshes:
        mw = o.matrix_world.copy()
        info[o.name] = (mw, sum((mw @ Vector(c) for c in o.bound_box), Vector()) / 8)
    picks = {}
    used = set()
    for g, keep in groups.items():
        picks[g] = [o for o in meshes if o.name not in used and keep(o, info[o.name][1])]
        used.update(o.name for o in picks[g])
    for o in meshes:
        if o.name in used:
            o.data = o.data.copy()
            o.parent = None
            o.data.transform(info[o.name][0])
            o.matrix_world = Matrix.Identity(4)
    for o in new:
        if o.type != "MESH" or o.name not in used:
            bpy.data.objects.remove(o)
    out = {}
    for g, part in picks.items():
        if not part:
            log(f"{path} : rien pour {g}")
            continue
        ob = A.join(part, g)
        if scale != 1.0:
            ob.data.transform(Matrix.Scale(scale, 4))
        # l'emprise (bound_box) n'est recalculée qu'à la mise à jour de l'objet
        ob.data.update()
        bpy.context.view_layer.update()
        dims = A.recentre(ob)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        hidden.objects.link(ob)
        cv.downscale_images([ob], 1024)
        out[g] = ob
        log(f"modèle {g} : {len(ob.data.polygons)} faces, {dims.x:.2f} × {dims.y:.2f} × {dims.z:.2f} m")
    return out


def mat_names(o):
    return " ".join(m.name for m in o.data.materials if m)


# ---------------------------------------------------------------- la chaussée (road.py, sur la largeur de la rue)

def road_module():
    """Un faux scene_a pour road.py : les mêmes fonctions, les cotes de la rue étroite."""
    P = types.SimpleNamespace(**{k: getattr(A, k) for k in dir(A) if not k.startswith("__")})
    P.ROAD_HALF, P.WALK, P.FRONT_X = HALF, WALK, -FRONT
    P.SIDE_STREETS = []
    P.segments = lambda y0, y1: [(y0, y1)]
    P.in_street = lambda y, m=2.0: False
    return P


def build_street(hidden):
    road.S = road_module()
    st = road.STYLES["sechage"]
    # deux voies, double axe, ni tirets ni rives (road.lane_layout), la peinture usée et salie ; la place du
    # rond-point sans aucun marquage
    lay = dict(road.lane_layout(HALF, 2), grime=0.8)
    asphalt = road.mat_asphalt(st, "rue_asphalt", layout=lay)
    plaza = road.mat_asphalt(st, "rue_plaza_asphalt",
                             layout=dict(road.lane_layout(HALF, 2, centre=False), lanes=(60.0,)))
    pan, kerb, walk = road.mat_gutter_pan(st, "rue_gutter"), road.mat_kerb(st, "rue_kerb"), road.mat_pavement(st, "rue_walk")
    paint = road.mat_paint_decal(st, "rue_paint")
    road.strip("rue_road", road.road_profile(), Y0, Y_END + 0.4, asphalt)
    for side in (-1, 1):
        road.strip(f"rue_gutter_{side}", road.pan_profile(side), Y0, Y_END, pan)
        road.strip(f"rue_kerb_{side}", road.kerb_profile(side), Y0, Y_END, kerb, smooth_faces=True)
        x0, x1 = sorted((side * (HALF + road.KERB), side * (FRONT + 0.6)))
        A.box(f"rue_walk_{side}", x0, x1, Y0, Y_END, -0.05, road.WALK_Z, walk)
        # le trottoir du coin, à l'entrée du rond-point, au-delà des derniers immeubles, et sa bordure
        # (le profil tourné d'un quart de tour : il regarde -y et file vers +x)
        xa, xb = sorted((side * (FRONT + 0.6), side * 80.0))
        A.box(f"rue_corner_walk_{side}", xa, xb, 126.0, Y_END, -0.05, road.WALK_Z, walk)
        xa, xb = sorted((side * (HALF + road.KERB), side * (FRONT + 0.6)))
        road.strip(f"rue_corner_kerb_{side}", road.kerb_profile(1, -road.CROWN), 0.0, 80.0 - HALF - road.KERB, kerb,
                   smooth_faces=True, loc=(HALF + road.KERB if side > 0 else -80.0, Y_END + HALF, 0.0), rot=-math.pi / 2)
    # la place du rond-point, 3 cm plus bas (son niveau rejoint le bord de l'enrobé), jusqu'au muret
    road.plane("rue_plaza", 0.0, (Y_END + Y_FAR) / 2, -road.CROWN - 0.002, 160.0, Y_FAR - Y_END, plaza)
    # le cédez-le-passage (ses dents) et le passage piéton à la sortie de la rue
    for k in range(6):
        x = 0.4 + k * 0.55
        road.decal_strip(f"rue_yield_{k}", x, x + 0.3, Y_END - 0.9, Y_END - 0.4, paint)
    for k in range(8):
        x = -HALF + 0.55 + k * 0.98
        road.decal_strip(f"rue_zebra_{k}", x, x + 0.5, Y_END - 4.6, Y_END - 1.6, paint)

    # plaques d'égout dans leur carré refait, avaloirs dans la cunette des deux côtés
    rng = random.Random(41)
    src, dims = road.manhole_source(hidden)
    patch = road.mat_asphalt(st, "rue_asphalt_patch", force_patch=True, layout=lay)
    for k, (x, y) in enumerate(((-1.4, 9.0), (1.6, 36.0), (-0.9, 63.0), (1.3, 95.0), (-1.6, 118.0))):
        z = road.road_z(x)
        road.plane(f"rue_mh_patch_{k}", x, y, z + 0.0015, 1.4, 1.4, patch)
        A.instance(src, f"rue_manhole_{k}", (x, y, z + 0.003 - dims.z), rng.uniform(0, math.tau))
    gm = road.mat_grate("rue_grate")
    throat = A.mat_plain("rue_drain_throat", (0.004, 0.004, 0.004, 1), 0.9)
    k = 0
    for side, start in ((-1, 12.0), (1, 28.0)):
        y = start
        while y < Y_END - 6:
            road.plane(f"rue_grate_{k}", side * (HALF - 0.26), y, road.road_z(HALF - 0.26) + 0.002, 0.72, 0.56, gm,
                       math.pi / 2)
            xa, xb = sorted((side * HALF, side * (HALF + 0.013)))
            A.box(f"rue_throat_{k}", xa - 0.002, xb + 0.002, y - 0.6, y + 0.6, road.road_z(HALF) + 0.005, 0.075, throat)
            k += 1
            y += 26.0
    log(f"rue : chaussée de {2 * HALF:.0f} m à deux voies, trottoirs de {WALK:.0f} m, {Y_END - Y0:.0f} m, "
        f"puis la place du rond-point")
    return kerb


def build_ring_end(hidden, kerb):
    """Au fond de la rue, flou : l'îlot du rond-point (12 m, bordure de 45 cm, terre sombre), trois palmiers royaux
    et leurs six projecteurs ambre, le muret de la promenade au-delà. Rien de plus : il est vu à 140 m."""
    cx, cy = RING
    A.cyl("ring_island_kerb", (cx, cy, -0.05), (cx, cy, 0.45), 6.0, kerb, seg=64)
    A.cyl("ring_island_soil", (cx, cy, 0.0), (cx, cy, 0.47), 5.8, A.mat_plain("ring_soil", lin("#1c1612"), 0.9), seg=64)
    royal = A.royal_source(hidden)
    for k, (dx, dy, sc) in enumerate(((0.0, 0.0, 1.12), (-2.6, 1.8, 0.95), (2.4, -1.6, 1.0))):
        ob = A.instance(royal, f"ring_palm_{k}", (cx + dx, cy + dy, 0.45), k * 2.1, sc)
        ob.rotation_euler = (math.radians(1.5 * (k - 1)), math.radians(-1.0 * k), ob.rotation_euler.z)
        # deux projecteurs au pied, vers la couronne
        for j in range(2):
            a = k + j * math.pi
            p = Vector((cx + dx + 0.9 * math.cos(a), cy + dy + 0.9 * math.sin(a), 0.55))
            lo = A.add_light(f"ring_up_{k}_{j}", "SPOT", p, (cx + dx - p.x, cy + dy - p.y, 9.0), lin(AMBER), 2200.0, spot=34)
            lo.visible_glossy = False
    A.box("ring_sea_wall", -80.0, 80.0, Y_FAR - 0.4, Y_FAR, 0.0, 0.9, A.mat_plain("ring_sea_wall", lin("#d9d2c4"), 0.6))
    log("rond-point : îlot de 12 m, 3 palmiers royaux, 6 projecteurs")


# ---------------------------------------------------------------- les immeubles, des deux côtés

def prototypes(M, hidden):
    import facade_b
    import facade_mix
    facade_mix.PLAN.update(GF_PLAN)
    facade_b.STYLE.update(UP_STYLE)
    make = A._maker()
    out = {}
    for key, spec in SPECS.items():
        spec = dict(spec)
        ob, props, lights = make(key, M, spec)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        hidden.objects.link(ob)
        out[key] = (ob, props, lights, spec)
        log(f"dessin {key} : {len(ob.data.polygons)} faces, {len(props)} accessoires, {len(lights)} lumières")
    return out


def place(protos, kind, loc, rot, tint, srcs, lights=True):
    """Pose un dessin (façade en x = 0 tournée vers +x dans son repère) tourné de rot autour de z, avec ses
    accessoires et ses lumières passés dans le même repère (place() de scene_a ne sait que le côté ville)."""
    ob, props, lts, spec = protos[kind]
    n = len([o for o in bpy.data.objects if o.name.startswith(ob.name + "_")])
    inst = A.instance(ob, f"{ob.name}_{n}", loc, rot)
    inst.color = (*lin(tint)[:3], 1)
    R = Matrix.Rotation(rot, 3, "Z")
    t = Vector(loc)
    ac_src, tank_src = srcs
    for j, (pk, p, r, s) in enumerate(props):
        src = random.choice(ac_src) if pk == "ac" else tank_src if pk == "tank" else bpy.data.objects[pk]
        A.instance(src, f"{pk}_{inst.name}_{j}", t + R @ Vector(p), rot + r, s)
    if not lights:
        return inst
    warm = lin("#ffd9a8")
    for j, (lk, l, w) in enumerate(lts):
        at = t + R @ Vector(l)
        if lk == "shop":
            A.add_light(f"shop_{inst.name}_{j}", "AREA", at, R @ Vector((1, 0, -0.35)), lin("#ffcf96"), 90.0 * w / 3, (w, 2.2))
        elif lk == "canopy":
            A.add_light(f"canopy_{inst.name}_{j}", "AREA", at, R @ Vector((0.2, 0, -1)), warm, 260.0, (w, 2.2))
        elif lk == "wash":
            A.add_light(f"wash_{inst.name}_{j}", "SPOT", at, R @ Vector((-1.5, 0, 2.2)), warm, 1800.0, spot=75)
        elif lk == "light":
            L = dict(kind="POINT", direction=(0, 0, -1), color="#ffd9a8", energy=100.0, size=(0.2, 0.2), spot=60.0)
            L.update(w)
            lo = A.add_light(f"fl_{inst.name}_{j}", L["kind"], at, R @ Vector(L["direction"]), lin(L["color"]), L["energy"],
                             L["size"], L["spot"])
            if L.get("hide"):
                lo.visible_camera = lo.visible_glossy = lo.visible_transmission = False
    return inst


def build_city(M, hidden):
    protos = prototypes(M, hidden)
    ac_parts = A.import_glb("exterior_aircon_unit/exterior_aircon_unit.gltf")
    ac_src = [A.source([o], f"rue_ac_src_{i}", hidden) for i, o in enumerate(ac_parts)]
    tank_src = A.source(A.import_glb("water-tank.glb"), "rue_tank_src", hidden)
    srcs = (ac_src, tank_src)
    i = 0
    # côté gauche : façade à x = -7, tournée vers +x
    for kind, y0 in LEFT:
        place(protos, kind, (-FRONT, y0, 0), 0.0, TINTS[i % len(TINTS)], srcs)
        i += 3
    # côté droit : façade à x = +7, tournée vers -x (le dessin tourné d'un demi-tour)
    for kind, y0 in RIGHT:
        W = protos[kind][3]["W"]
        place(protos, kind, (FRONT, y0 + W, 0), math.pi, TINTS[(i + 1) % len(TINTS)], srcs)
        i += 3
    log(f"{len(LEFT) + len(RIGHT)} immeubles")
    return protos


# ---------------------------------------------------------------- les enseignes en potence

def obj_with_mat(src, name, loc, rot, scale, mat):
    """Une instance de `src` (maillage partagé) dont la matière est portée par l'objet."""
    ob = bpy.data.objects.new(name, src.data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot)
    ob.scale = (scale, scale, scale)
    if not ob.material_slots:
        ob.data = src.data.copy()
        ob.data.materials.append(mat)
    for slot in ob.material_slots:
        slot.link = "OBJECT"
        slot.material = mat
    return ob


def blade_table():
    """Les enseignes en potence : (côté, y de vue, bas de l'enseigne, mot, couleur), tous les 8 à 12 m de chaque
    côté, le haut sous 8 m ; aucune contre le mât MOTEL."""
    rng = random.Random(23)
    out = []
    w = 0
    for side, y in ((-1, 11.0), (1, 16.0)):
        while y < 125.0:
            if not (side == MOTEL[0] and abs(y - MOTEL[1]) < 3.5):
                text, col = WORDS[w % len(WORDS)]
                w += 1
                hp = len(text) * 0.504 + 0.36
                out.append((side, round(y, 1), round(4.0 + rng.uniform(0.0, max(0.0, 3.95 - hp)), 2), text, col))
            y += rng.uniform(8.0, 12.0)
    return out


def blade_sign(L, C, k, side, y, z0, text, col, mats):
    """Une enseigne en drapeau : caisson émaillé sombre perpendiculaire à la façade, lettres néon empilées sur les
    deux faces, filet néon autour, deux potences et un tirant, transformateur ; la lueur de sa couleur sur le mur
    et la chaussée (une lumière invisible à la caméra et dans les reflets : le reflet est celui des tubes)."""
    abc = L.get("abc")
    wall = side * FRONT                   # x de la façade
    d = -side                             # la potence part de la façade vers l'axe de la rue
    u0, wp, th = 0.32, 0.92, 0.2          # départ du mur, saillie du caisson, épaisseur
    hl = 0.42                             # hauteur des lettres
    pitch = hl * 1.2
    hp = len(text) * pitch + 0.36
    z1 = z0 + hp
    xa, xb = sorted((wall + d * u0, wall + d * (u0 + wp)))
    xc = (xa + xb) / 2
    B = A.Boxes(f"blade_{k}")
    B.add(xa, xb, y - th / 2, y + th / 2, z0, z1, mats["enamel"])
    # le chant du caisson, un jonc de métal clair
    B.add(xa - 0.025, xb + 0.025, y - th / 2 - 0.012, y + th / 2 + 0.012, z1 - 0.03, z1 + 0.02, mats["rim"])
    B.add(xa - 0.025, xb + 0.025, y - th / 2 - 0.012, y + th / 2 + 0.012, z0 - 0.02, z0 + 0.03, mats["rim"])
    # potences et tirant, platines au mur
    for zz in (z0 + 0.25, z1 - 0.25):
        x0, x1 = sorted((wall, wall + d * u0))
        B.add(x0, x1, y - 0.03, y + 0.03, zz - 0.03, zz + 0.03, mats["iron"])
        px0, px1 = sorted((wall, wall + d * 0.02))
        B.add(px0, px1, y - 0.12, y + 0.12, zz - 0.12, zz + 0.12, mats["iron"])
    # le transformateur au pied, contre le mur
    tx0, tx1 = sorted((wall + d * 0.02, wall + d * 0.16))
    B.add(tx0, tx1, y - 0.16, y + 0.16, z0 - 0.5, z0 - 0.15, mats["transfo"])
    ob = B.done()
    C.tube([[(wall + d * 0.02, y, z1 + 0.8), (wall + d * (u0 + wp * 0.9), y, z1 + 0.02)]], 0.008, mats["iron"],
           f"blade_{k}_stay")
    C.tube([[(wall + d * 0.09, y, z0 - 0.15), (wall + d * 0.12, y + 0.05, z0 - 0.02), (xa if d > 0 else xb, y, z0 + 0.1)]],
           0.006, mats["cable"], f"blade_{k}_cable")
    neon = L["neon"][col]
    R = random.Random(f"blade-{k}")
    # le filet néon sur chaque face, 6 cm en retrait du bord
    for f in (-1, 1):
        yf = y + f * (th / 2 + 0.018)
        i0, i1, j0, j1 = xa + 0.06, xb - 0.06, z0 + 0.06, z1 - 0.06
        C.tube([[(i0, yf, j0), (i1, yf, j0), (i1, yf, j1), (i0, yf, j1), (i0, yf, j0 + 0.001)]], 0.011,
               neon[R.randrange(1, 4)], f"blade_{k}_frame_{f}")
    # les lettres, empilées de haut en bas, sur les deux faces (lettres de bibliothèque, face avant vers -y)
    if abc:
        sc = hl / abc["H"][1].z
        thick = abc["H"][1].y * sc
        tired = R.randrange(len(text)) if R.random() < 0.4 else -1
        for i, ch in enumerate(text):
            if ch not in abc:
                continue
            zc = z1 - 0.18 - (i + 0.5) * pitch - hl / 2
            m = neon[0] if i == tired else neon[R.randrange(1, 4)]
            for f, rot in ((-1, 0.0), (1, math.pi)):
                yf = y + f * (th / 2 + thick / 2 + 0.006)
                obj_with_mat(abc[ch][0], f"blade_{k}_{ch}{i}_{f}", (xc, yf, zc), rot, sc, m)
    # la lueur de l'enseigne : deux points de sa couleur, un de chaque côté, invisibles en reflet
    colr = lin(NEON_LIGHT[col])
    for f in (-1, 1):
        lo = A.add_light(f"blade_{k}_glow_{f}", "POINT", (xc, y + f * 0.55, (z0 + z1) / 2), (0, 0, -1), colr, 70.0)
        lo.data.shadow_soft_size = 0.35
        lo.visible_camera = lo.visible_glossy = lo.visible_transmission = False
    return ob


def build_signs(M, hidden):
    import facade_mix
    import facade_proc as C
    L = facade_mix.lib(M)
    mats = dict(enamel=C.mat_pbr("blade_enamel", "#1f1d24", 0.35, 0.2, noise_amt=0.2, coat=0.4),
                rim=C.mat_pbr("blade_rim", "#c9c3b5", 0.3, 0.9, noise_amt=0.15),
                iron=C.mat_pbr("blade_iron", "#1b1a1d", 0.5, 0.7, noise_amt=0.25),
                transfo=L.get("transfo") or M["metal"], cable=L.get("cable") or M["metal"])
    blades = blade_table()
    for k, (side, y, z0, text, col) in enumerate(blades):
        blade_sign(L, C, k, side, y, z0, text, col, mats)
    # l'enseigne MOTEL sur mât, au bord du trottoir (une des trois du modèle, ramenée à 7 m), face à la rue
    src = lib_parts("lieux/rue/neon-motel/model.glb", {"motel_src": lambda o, c: "motel_1_01" in mat_names(o)},
                    hidden, 0.63).get("motel_src")
    if src:
        side, y = MOTEL
        A.instance(src, "motel_pole", (side * (FRONT - 1.3), y, road.WALK_Z), math.pi / 2)
        for f in (-1, 1):
            lo = A.add_light(f"motel_glow_{f}", "POINT", (side * (FRONT - 1.3), y + f * 0.6, 4.6), (0, 0, -1),
                             lin(CORAL), 160.0)
            lo.data.shadow_soft_size = 0.6
            lo.visible_camera = lo.visible_glossy = lo.visible_transmission = False
    # le néon cerise d'un bar, en drapeau sous sa potence (livré à 20 cm, ramené à 1 m)
    cherry = lib_parts("lieux/rue/neon-cherry/model.glb", {"cherry_src": lambda o, c: True}, hidden, 5.0).get("cherry_src")
    if cherry:
        x, y = FRONT - 0.75, 29.5
        A.instance(cherry, "cherry_sign", (x, y, 3.0), 0.0)
        A.box("cherry_arm", x, FRONT, y - 0.02, y + 0.02, 4.12, 4.16, mats["iron"])
        lo = A.add_light("cherry_glow", "POINT", (x, y - 0.5, 3.5), (0, 0, -1), lin("#ff5a4a"), 45.0)
        lo.visible_camera = lo.visible_glossy = lo.visible_transmission = False
    log(f"{len(blades)} enseignes en potence, l'enseigne MOTEL sur mât, le néon cerise")


# ---------------------------------------------------------------- câbles, lanternes, guirlandes, lampadaires

def lantern_source(hidden, M):
    """La lanterne suspendue : abat-jour émaillé conique (vert sombre dehors, blanc dedans), ampoule et verre
    opalin allumés, crochet. Une source, instanciée sous chaque câble."""
    import facade_proc as C
    me = bpy.data.meshes.new("lantern_src")
    bm = bmesh.new()
    seg = 24
    outer = C.mat_pbr("lantern_enamel", "#24382f", 0.3, 0.1, noise_amt=0.2, coat=0.6)
    inner = A.mat_emit("lantern_inside", lin("#ffe2b0"), 3.0)
    glow = A.mat_emit("lantern_bulb", lin("#ffcf8a"), 40.0)
    me.materials.append(outer)
    me.materials.append(inner)
    me.materials.append(glow)
    rings = [(0.05, 0.0), (0.07, -0.06), (0.30, -0.24), (0.34, -0.27)]
    vs = [[bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for a in (i * math.tau / seg for i in range(seg))] for r, z in rings]
    for j in range(len(rings) - 1):
        for i in range(seg):
            f = bm.faces.new((vs[j][i], vs[j][(i + 1) % seg], vs[j + 1][(i + 1) % seg], vs[j + 1][i]))
            f.material_index = 0
            f.smooth = True
    # le dedans, juste sous la coque, allumé par l'ampoule
    ins = [[bm.verts.new((r * 0.97 * math.cos(a), r * 0.97 * math.sin(a), z - 0.008)) for a in (i * math.tau / seg for i in range(seg))]
           for r, z in rings[1:]]
    for j in range(len(ins) - 1):
        for i in range(seg):
            f = bm.faces.new((ins[j][(i + 1) % seg], ins[j][i], ins[j + 1][i], ins[j + 1][(i + 1) % seg]))
            f.material_index = 1
            f.smooth = True
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.075,
                              matrix=Matrix.Translation((0, 0, -0.2)))
    for f in bm.faces:
        if not f.material_index and all(abs(v.co.z + 0.2) < 0.08 and v.co.length < 0.3 for v in f.verts):
            f.material_index = 2
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("lantern_src", me)
    hidden.objects.link(ob)
    return ob


def bulb_source(hidden):
    me = bpy.data.meshes.new("bulb_src")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.038)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(A.mat_emit("festoon_bulb", lin("#ffcf8a"), 28.0))
    ob = bpy.data.objects.new("bulb_src", me)
    hidden.objects.link(ob)
    return ob


def build_overhead(M, hidden):
    import facade_proc as C
    cable = M["metal"]
    lantern = lantern_source(hidden, M)
    bulb = bulb_source(hidden)
    lamp_col = lin("#ffcf96")
    n_bulbs = 0
    for k, y in enumerate(SPANS):
        z = 7.6 + (0.4 if k % 2 else 0.0)
        a, b = (-FRONT, y - 0.4, z), (FRONT, y + 0.4, z)
        pts = C.sag(a, b, 0.55, 24)
        C.tube([pts], 0.009, cable, f"span_{k}")
        mid = Vector(pts[12])
        # la lanterne pend sous le câble, son fil et son crochet
        drop = 0.55
        C.tube([[tuple(mid), tuple(mid - Vector((0, 0, drop)))]], 0.006, cable, f"lantern_wire_{k}")
        A.instance(lantern, f"lantern_{k}", mid - Vector((0, 0, drop)), random.uniform(0, 1))
        lo = A.add_light(f"lantern_{k}_down", "SPOT", mid - Vector((0, 0, drop + 0.2)), (0, 0, -1), lamp_col, 1400.0, spot=115)
        lo.data.spot_blend = 0.8
        lo.data.shadow_soft_size = 0.12
        lo.visible_glossy = False
        # les guirlandes : deux brins en zigzag de part et d'autre du câble, plus bas, une ampoule tous les 55 cm
        if k < len(SPANS) - 1:
            yn = SPANS[k + 1]
            for i, (pa, pb) in enumerate((((-FRONT, y + 1.0, 5.6), (FRONT, (y + yn) / 2, 5.9)),
                                          ((FRONT, (y + yn) / 2 + 0.6, 5.7), (-FRONT, yn - 1.0, 5.5)))):
                gp = C.sag(pa, pb, 0.75, 32)
                C.tube([gp], 0.004, cable, f"festoon_{k}_{i}")
                length = (Vector(pb) - Vector(pa)).length
                nb = int(length / 0.55)
                for j in range(1, nb):
                    t = j / nb
                    q = Vector(pa).lerp(Vector(pb), t)
                    q.z -= 0.75 * 4 * t * (1 - t) + 0.06
                    A.instance(bulb, f"bulb_{k}_{i}_{j}", q)
                    n_bulbs += 1
    # des fils de téléphone et d'électricité, plus haut, d'une façade à l'autre
    spans = []
    for y, dz in ((5.0, 10.4), (12.0, 9.2), (40.0, 10.1), (69.0, 9.6), (97.0, 9.9), (121.0, 9.4)):
        spans.append(((-FRONT, y, dz), (FRONT, y + 3.5, dz - 0.3)))
        spans.append(((-FRONT, y + 0.4, dz - 0.35), (FRONT, y - 2.0, dz - 0.1)))
    A.wires("rue_wires", spans, cable, sag=0.9, r=0.01)
    log(f"{len(SPANS)} câbles à lanterne, {n_bulbs} ampoules de guirlande")


def build_lamps(hidden):
    """Un lampadaire à crosse tous les 30 m en quinconce (celui de l'avenue, plus petit pour la rue étroite : tête
    à 6 m), tête ambre et son cône de lumière."""
    parts = A.import_glb("streetlights.glb")
    mine = [o for o in parts if o.name.startswith("polySurface102")]
    for o in [o for o in parts if o not in mine]:
        bpy.data.objects.remove(o)
    lamp = A.join(mine, "rue_lamp_src")
    metal, head = A.mat_plain("rue_lamp_metal", (0.05, 0.05, 0.055, 1), 0.35, 0.8), A.mat_emit("rue_lamp_head", lin(AMBER), 40.0)
    for i, m in enumerate(lamp.data.materials):
        lamp.data.materials[i] = head if m.name.startswith("light") else metal
    A.recentre(lamp)
    for c in list(lamp.users_collection):
        c.objects.unlink(lamp)
    hidden.objects.link(lamp)
    S = 1.3
    for k, (side, y) in enumerate(LAMPS):
        x = side * (HALF + 0.6)
        rot = math.pi / 2 if side < 0 else -math.pi / 2  # le bras (−y du modèle) vers la chaussée
        A.instance(lamp, f"rue_lamp_{k}", (x, y, road.WALK_Z), rot, S)
        hd = Vector((0, -1.68 * S, 4.68 * S))
        hd.rotate(Matrix.Rotation(rot, 3, "Z"))
        lo = A.add_light(f"rue_lamp_light_{k}", "SPOT", Vector((x, y, road.WALK_Z)) + hd - Vector((0, 0, 0.1)),
                         (0, 0, -1), lin(AMBER), 1800.0, spot=130)
        lo.data.spot_blend = 0.5
        lo.data.shadow_soft_size = 0.2
    log(f"{len(LAMPS)} lampadaires")


# ---------------------------------------------------------------- le trottoir

def build_furniture(M, hidden):
    parts = A.import_glb("metal_trash_can/metal_trash_can.gltf")
    mine = [o for o in parts if "rust" not in o.name and "lid" not in o.name]
    for o in [o for o in parts if o not in mine]:
        bpy.data.objects.remove(o)
    can = A.source(mine, "rue_can_src", hidden)
    for side, y in ((-1, 23.0), (1, 41.0), (-1, 58.0), (1, 79.0), (-1, 104.0)):
        A.instance(can, f"rue_can_{y:.0f}", (side * (HALF + 0.75), y, road.WALK_Z), random.uniform(0, 6))
    # la borne d'incendie (une des deux du modèle) près de la caméra, le distributeur de journaux (livré en cm)
    hyd = lib_parts("lieux/rue/fire-hydrant/fire_hydrant.gltf", {"hydrant_src": lambda o, c: c.x < 0}, hidden).get("hydrant_src")
    if hyd:
        A.instance(hyd, "rue_hydrant", (-(HALF + 0.55), 13.5, road.WALK_Z), 2.2)
    box = lib_parts("lieux/rue/newspaper-box/model.glb", {"news_src": lambda o, c: True}, hidden, 0.0068).get("news_src")
    if box:
        A.instance(box, "rue_news_0", (HALF + 0.7, 19.5, road.WALK_Z), math.pi / 2 + 0.1)
        A.instance(box, "rue_news_1", (-(HALF + 0.7), 37.0, road.WALK_Z), -math.pi / 2 - 0.15)
    # les voitures garées d'un seul côté, contre la bordure
    if os.environ.get("FILM3D_PARKED", "1") != "0":
        src = A.parked_wagon_source(hidden)
        tints = ["#5a2633", "#2b4756", "#b9a47c", "#34343a", "#3f5a3e", "#6b5a7a"]
        for k, y in enumerate(PARKED):
            inst = A.instance(src, f"rue_parked_{k}", (HALF - 1.05, y, 0.0), math.pi)
            inst.color = (*lin(tints[k % len(tints)])[:3], 1)


# ---------------------------------------------------------------- le premier plan, au ras du sol

def puddle(name, cx, cy, r, sy, seed, mat):
    """Une flaque au contour irrégulier qui épouse le bombé de la chaussée (anneaux en éventail), 2,5 mm au-dessus."""
    R = random.Random(seed)
    seg, rings = 40, 4
    ph = [R.uniform(0, math.tau) for _ in range(3)]
    def rad(a):
        return r * (1.0 + 0.22 * math.sin(2 * a + ph[0]) + 0.14 * math.sin(3 * a + ph[1]) + 0.08 * math.sin(5 * a + ph[2]))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    def vert(x, y):
        return bm.verts.new((x, y, road.road_z(x) + 0.0025))
    c = vert(cx, cy)
    ring = []
    for j in range(1, rings + 1):
        t = j / rings
        ring.append([vert(cx + t * rad(a) * math.cos(a), cy + t * rad(a) * sy * math.sin(a))
                     for a in (i * math.tau / seg for i in range(seg))])
    for i in range(seg):
        bm.faces.new((c, ring[0][i], ring[0][(i + 1) % seg]))
    for j in range(rings - 1):
        for i in range(seg):
            bm.faces.new((ring[j][i], ring[j + 1][i], ring[j + 1][(i + 1) % seg], ring[j][(i + 1) % seg]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if sum(p.normal.z for p in me.polygons) < 0:
        me.flip_normals()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def build_foreground(hidden):
    """Le bas du cadre, de 0,7 à 6 m de la caméra : des flaques irrégulières qui noient la double ligne, des
    gravillons, une plaque d'égout dans son carré refait. Sans eux, une surface vide sous les agents."""
    water, N, out = A.material("rue_puddle")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.006, 0.006, 0.007, 1)
    bsdf.inputs["Roughness"].default_value = 0.02
    bsdf.inputs["IOR"].default_value = 1.33
    N.link(bsdf.outputs[0], out.inputs["Surface"])
    # (à 30 cm du sol, une flaque de 50 cm à 2 m remplit le bas du cadre : petites et éclatées près de la caméra)
    for k, (x, y, r, sy) in enumerate(((0.25, 3.2, 0.32, 1.6), (-1.5, 4.6, 0.3, 1.8), (1.3, 2.4, 0.2, 1.4),
                                       (0.0, 6.4, 0.42, 2.0), (2.3, 5.2, 0.3, 2.2), (-0.6, 1.9, 0.16, 1.3))):
        puddle(f"rue_puddle_{k}", x, y, r, sy, 70 + k, water)
    # une plaque d'égout près de la caméra, dans son carré d'enrobé refait
    src, dims = road.manhole_source(hidden)
    st = road.STYLES["sechage"]
    patch = road.mat_asphalt(st, "rue_asphalt_patch_near", force_patch=True, layout=dict(road.lane_layout(HALF, 2), grime=0.8))
    x, y = -1.25, 4.6
    z = road.road_z(x)
    road.plane("rue_mh_patch_near", x, y, z + 0.0015, 1.4, 1.4, patch, 0.06)
    A.instance(src, "rue_manhole_near", (x, y, z + 0.003 - dims.z), 0.7)
    # les gravillons : quatre cailloux sources, quelques centaines d'instances, plus serrés le long des lignes
    stone = A.mat_plain("rue_gravel", lin("#3a3733"), 0.35)
    srcs = []
    for i in range(4):
        me = bpy.data.meshes.new(f"gravel_src_{i}")
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        R = random.Random(300 + i)
        for v in bm.verts:
            v.co *= R.uniform(0.75, 1.15)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(stone)
        ob = bpy.data.objects.new(f"gravel_src_{i}", me)
        hidden.objects.link(ob)
        srcs.append(ob)
    R = random.Random(9)
    n = 0
    while n < 320:
        x = R.uniform(-2.8, 2.8)
        y = R.uniform(1.2, 6.5)
        if abs(abs(x) - 0.15) > 0.35 and R.random() < 0.5:
            continue
        s = R.uniform(0.003, 0.008)
        ob = bpy.data.objects.new(f"gravel_{n}", srcs[n % 4].data)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = (x, y, road.road_z(x) + s * 0.4)
        ob.rotation_euler = (R.uniform(0, 3), R.uniform(0, 3), R.uniform(0, 6))
        ob.scale = (s * R.uniform(1.0, 1.6), s, s * R.uniform(0.5, 0.8))
        n += 1
    log(f"premier plan : 6 flaques, 1 plaque, {n} gravillons")


# ---------------------------------------------------------------- la patrouille, portières ouvertes

def cut_doors(body):
    """La patrouille n'a pas de portières séparées : on découpe les deux portières avant dans le maillage de la caisse
    (faces dont le centre tombe dans la boîte de la portière, côté peau), vitre baissée. Rend {côté: (objet portière,
    charnière en repère local)}, portières enfants de la caisse, fermées ; on les ouvre en tournant leur z."""
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    names = [m.name.lower() if m else "" for m in me.materials]
    wheel = [f for f in bm.faces if "wheel" in names[f.material_index]]
    xs = [v.co.x for f in wheel for v in f.verts if v.co.x > 0]
    front_axle = (max(xs) - 0.36) if xs else 1.45
    paint = [f for f in bm.faces if "paint" in names[f.material_index]]
    hw = max(abs(f.calc_center_median().y) for f in paint if 0.5 < f.calc_center_median().z < 0.9) if paint else 0.98
    xa, xb = front_axle - 1.72, front_axle - 0.6
    z0, z1 = 0.3, 1.37
    sel = {1: set(), -1: set()}
    glass = set()
    for f in bm.faces:
        c = f.calc_center_median()
        if xa < c.x < xb and z0 < c.z < z1 and abs(c.y) > hw - 0.32:
            if "glass" in names[f.material_index] or "wind" in names[f.material_index]:
                glass.add(f.index)
            else:
                sel[1 if c.y > 0 else -1].add(f.index)
    bm.free()
    doors = {}
    for side in (1, -1):
        dm = me.copy()
        dm.name = f"{body.name}_door_{side}"
        b2 = bmesh.new()
        b2.from_mesh(dm)
        b2.faces.ensure_lookup_table()
        bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index not in sel[side]], context="FACES")
        bmesh.ops.delete(b2, geom=[v for v in b2.verts if not v.link_faces], context="VERTS")
        hinge = Vector((xb, side * hw, 0.0))
        bmesh.ops.translate(b2, verts=b2.verts, vec=-hinge)
        b2.to_mesh(dm)
        b2.free()
        dob = bpy.data.objects.new(dm.name, dm)
        body.users_collection[0].objects.link(dob)
        dob.parent = body
        dob.location = hinge
        doors[side] = (dob, hinge)
    b3 = bmesh.new()
    b3.from_mesh(me)
    b3.faces.ensure_lookup_table()
    gone = sel[1] | sel[-1] | glass
    bmesh.ops.delete(b3, geom=[f for f in b3.faces if f.index in gone], context="FACES")
    b3.to_mesh(me)
    b3.free()
    log(f"portières découpées : essieu avant {front_axle:.2f} m, demi-largeur {hw:.2f} m, "
        f"{len(sel[1])} + {len(sel[-1])} faces, {len(glass)} faces de vitre retirées")
    return doors, front_axle, hw


def dup_tree(ob, parent, tag):
    c = ob.copy()
    c.name = f"{ob.name}_{tag}"
    # ses collections, y compris celle d'exclusion des lueurs de rampe (la copie de la rampe y entre aussi)
    for col in ob.users_collection:
        if c.name not in col.objects:
            col.objects.link(c)
    if parent is not None:
        c.parent = parent
        c.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
    for ch in ob.children:
        dup_tree(ch, c, tag)
    return c


def patrol_beams(body, tag, aims):
    """Les gyrophares figés en plein balayage : un faisceau corail et un violet par rampe, vers les points donnés
    (repère de vue), qui lèchent les façades et le mouillé ; la brume les rend visibles."""
    bpy.context.view_layer.update()
    # au-dessus de la rampe : dedans, sa coque arrêterait le faisceau
    top = body.matrix_world @ Vector((-0.12, 0, 2.02))
    out = []
    for k, (col, target, energy, size) in enumerate(aims):
        L = bpy.data.lights.new(f"beam_{tag}_{k}", "SPOT")
        L.color = lin(col)[:3]
        L.energy = energy
        L.spot_size = math.radians(size)
        L.spot_blend = 0.85
        L.shadow_soft_size = 0.05
        # leur puissance est faite pour les façades lointaines : dans la brume, un faisceau, pas un mur de lait
        try:
            L.volume_factor = 0.12
        except AttributeError:
            pass
        lo = bpy.data.objects.new(L.name, L)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = top
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = (Vector(target) - lo.location).normalized().to_track_quat("-Z", "Y")
        lo.visible_glossy = False
        out.append(lo)
    return out


def heading_rot(hx, hy):
    """Lacet d'un véhicule (avant vers +x dans son repère) pour qu'il pointe vers (hx, hy)."""
    return math.atan2(hy, hx)


def officer_light(officers, plan):
    """Les deux agents découpés par les phares : un liseré (un spot chaud derrière chacun, côté berline, à hauteur
    des phares relevée, qui accroche épaules et casquette) ; et, quand le plan ouvre le feu, l'éclair de chaque
    pistolet : une flamme blanche émissive dans l'axe du canon et une lumière ponctuelle forte, brève à l'image.
    Rien n'atteint personne : pas d'impact, pas d'étincelle."""
    bpy.context.view_layer.update()
    flash = None
    if plan.get("fire"):
        me = bpy.data.meshes.new("muzzle_flash")
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(A.mat_emit("muzzle_flash", lin("#fff4e2"), 400.0))
        flash = me
    for k, a in enumerate(officers):
        o = a.matrix_world.translation.copy()
        out = 1.0 if o.x > 0 else -1.0
        tgt = o + Vector((0.0, 0.0, 1.0))
        p = o + Vector((out * 0.5, 2.6, 1.7))
        lo = A.add_light(f"rim_{k}", "SPOT", p, tgt - p, lin("#fff1dc"), 450.0, spot=35)
        lo.data.spot_blend = 0.6
        lo.data.shadow_soft_size = 0.15
        lo.visible_glossy = False
        if flash is None:
            continue
        gun = bpy.data.objects.get(a.get("gun", ""))
        if gun is not None and "muzzle" in gun:
            m = gun.matrix_world @ Vector(tuple(gun["muzzle"]))
            d = (gun.matrix_world.to_3x3() @ Vector((1.0, 0.0, 0.0))).normalized()
        else:
            d = Vector((0.0, 1.0, 0.0))
            m = o + Vector((0.0, 0.55, 1.05))
        # (vu de dos, le corps cache le canon : la flamme est assez longue et large pour déborder de la silhouette)
        for j, (sc, off) in enumerate((((0.36, 0.08, 0.08), 0.3), ((0.07, 0.2, 0.2), 0.08), ((0.14, 0.13, 0.04), 0.2))):
            f = bpy.data.objects.new(f"muzzle_flash_{k}_{j}", flash)
            bpy.context.scene.collection.objects.link(f)
            f.location = m + d * off
            f.rotation_mode = "QUATERNION"
            f.rotation_quaternion = d.to_track_quat("X", "Z")
            f.scale = sc
            f.visible_shadow = False
        lf = A.add_light(f"muzzle_{k}", "POINT", m + d * 0.15 + Vector((0, 0, 0.1)), (0, 0, -1), lin("#fff3e0"), 6000.0)
        lf.data.shadow_soft_size = 0.04
        lf.visible_camera = False
    log(f"agents : liseré des phares{', éclairs de tir' if flash is not None else ''}")


def bar_glow(car, tag):
    """La lueur des deux couleurs de la rampe sur la chaussée mouillée, les portières et la brume autour."""
    bpy.context.view_layer.update()
    for side, col in ((1, CORAL), (-1, LILAC)):
        lo = A.add_light(f"bar_glow_{tag}_{side}", "POINT", car.matrix_world @ Vector((-0.12, side * 0.5, 2.0)),
                         (0, 0, -1), lin(col), 500.0)
        lo.data.shadow_soft_size = 0.12
        lo.visible_camera = lo.visible_glossy = False


def build_barrage(scene, hidden, plan):
    import cast_people as cp
    import cast_vehicles as cv
    pat = cv.load_patrol("jeandiz", lights_on=True, name="patrol_a")
    body = pat["body"]
    doors, front_axle, hw = cut_doors(body)
    shells = [c for c in bpy.data.collections if c.name.endswith("_glow_exclude")]
    cars = [body] + [dup_tree(body, None, tag) for tag in ("b", "c")]
    # les lueurs de rampe excluent la rampe (liaison de lumière) : les copies y sont entrées aussi
    for sh in shells:
        for co in sh.collection_objects:
            co.light_linking.link_state = "EXCLUDE"
    # les deux voitures du barrage, en biais, l'avant vers la berline et vers l'axe, 3 m entre les pare-chocs ;
    # la roue arrière extérieure montée sur le trottoir (roulis et tangage de quelques degrés). Les portières à
    # 7 m de la caméra : plus près, le cadre vertical (45° de champ horizontal) ne montrerait que la brèche.
    yb = plan["barrage"]
    yaw = math.radians(25.0)
    spots = [((-3.4, yb), (math.sin(yaw), math.cos(yaw)), -1, 0.045),   # gauche : sa portière droite (-y local)
             ((3.4, yb), (-math.sin(yaw), math.cos(yaw)), 1, -0.045)]   # droite : sa portière gauche (+y local)
    officers = []
    for car, ((x, y), (hx, hy), open_side, roll) in zip(cars[:2], spots):
        car.location = (x, y, road.road_z(abs(x)) + 0.04)
        car.rotation_euler = (roll, 0.03, heading_rot(hx, hy))
        for ch in car.children:
            if "_door_" in ch.name:
                side = -1 if "_door_-1" in ch.name else 1
                # la portière tourne sur sa charnière avant, son bord arrière s'écarte de la caisse
                ch.rotation_euler = (0, 0, -side * math.radians(58 if side == open_side else 50))
        # l'agent accroupi derrière la portière ouverte, de dos, tourné vers la berline
        a = cp.load_officer("spp")
        cp.pose_officer(a, "crouch", style=len(officers))
        gun = None
        try:
            gun = cp.load_handgun("service")
            cp.attach_handgun(a, gun)
        except Exception as e:
            log(f"arme non posée : {e!r}")
        a["gun"] = gun.name if gun else ""
        bpy.context.view_layer.update()
        p = car.matrix_world @ Vector((front_axle - 1.42, open_side * (hw + 0.6), 0.0))
        a.location = (p.x, p.y, road.road_z(abs(p.x)))
        # l'armature regarde -y au repos, en quaternion : un lacet θ (en Euler) la tourne vers (sin θ, -cos θ) ;
        # l'agent vise la berline (+y de vue), un peu vers l'axe, de dos pour la caméra
        fx, fy = (-0.12 if x > 0 else 0.12), 1.0
        a.rotation_mode = "XYZ"
        a.rotation_euler = (0, 0, math.atan2(fx, -fy))
        officers.append(a)
    # la troisième, 60 m derrière la berline, gyrophares au fond de la rue
    far = cars[2]
    cx, cy = plan["chase"]
    far.location = (cx, cy, road.road_z(abs(cx)))
    far.rotation_euler = (0, 0, heading_rot(0.06, -1.0))
    for ch in far.children:
        if "_door_" in ch.name:
            ch.rotation_euler = (0, 0, 0)
    # les faisceaux : corail #ff6a3d et lilas #8d8cf0, qui balaient façades et chaussée
    # (les taches sur les façades à 25-35 m : plus près, elles tomberaient hors du cadre vertical ; à cette
    # distance, il faut cette puissance pour passer au-dessus des vitrines)
    patrol_beams(cars[0], "a", [(CORAL, (-7.0, yb + 22.0, 6.0), 150000, 18), (LILAC, (2.0, yb + 30.0, 0.0), 60000, 18)])
    patrol_beams(cars[1], "b", [(LILAC, (7.0, yb + 18.0, 6.5), 150000, 18), (CORAL, (-2.0, yb + 34.0, 0.0), 60000, 18)])
    patrol_beams(cars[2], "c", [(CORAL, (-7.0, cy - 6.0, 6.0), 40000, 30), (LILAC, (7.0, cy + 7.0, 5.0), 40000, 30)])
    bar_glow(cars[0], "a")
    bar_glow(cars[1], "b")

    # la ligne de plots en travers de la brèche, deux panneaux rayés à feu aux bouts, barrières de foule sur les
    # trottoirs (modèles libres, déjà à l'échelle) ; un plot sur deux porte sa balise
    S = lib_parts("cast/barricade-set/model.glb", {
        "cone_lamp_src": lambda o, c: o.name.startswith(("Traffic_Cone_2_1.001", "Collar_2.002")),
        "cone_src": lambda o, c: o.name.startswith("Traffic_Cone_2_2.002"),
        "panel_src": lambda o, c: o.name.startswith(("Vertical_Panel_1.001", "Collar_1.002")),
    }, hidden)
    # (dans la brèche, juste devant les nez des patrouilles ; les deux du bout un peu en avant des nez)
    rng = random.Random(5)
    n = 0
    for k, (x, y) in enumerate(((-2.0, yb + 3.2), (-1.2, yb + 2.6), (-0.4, yb + 2.6), (0.4, yb + 2.6), (1.2, yb + 2.6),
                                (2.0, yb + 3.2))):
        src = S.get("cone_lamp_src" if k % 2 else "cone_src")
        if src:
            A.instance(src, f"cone_{k}", (x + rng.uniform(-0.06, 0.06), y + rng.uniform(-0.12, 0.12), road.road_z(abs(x))),
                       rng.uniform(0, math.tau))
            n += 1
    if S.get("panel_src"):
        for side in (-1, 1):
            A.instance(S["panel_src"], f"panel_{side}", (side * 2.8, yb + 3.7, road.road_z(2.8)), side * 0.25)
    officer_light(officers, plan)
    crowd = lib_parts("cast/barrier-crowd/model.glb", {"crowd_src": lambda o, c: True}, hidden).get("crowd_src")
    if crowd:
        for side in (-1, 1):
            A.instance(crowd, f"crowd_{side}", (side * (HALF + 1.6), yb + 3.0, road.WALK_Z), side * 0.06)
    log(f"barrage : 2 patrouilles portières ouvertes, 2 agents accroupis, {n} plots ; la 3e à {cy - plan['hero'][1]:.0f} m "
        f"derrière la berline")
    return cars, officers


# ---------------------------------------------------------------- le ciel, la brume

def make_world(scene):
    """Le ciel de la rue : l'HDRI de scene_a pour ses nuages, ramené à la nuit bleue ; ni bande corail ni couchant
    (la rue tourne le dos à la mer), une lueur de ville lilas au ras des toits."""
    world = bpy.data.worlds.new("blue_hour_b")
    scene.world = world
    if hasattr(world, "use_nodes"):
        world.use_nodes = True
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N = A.Nodes(nt)
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping", Rotation=(0, 0, math.radians(-90)))
    N.link(tc.outputs["Generated"], mp.inputs[0])
    env = N.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(ASSETS, "qwantani_dusk_2_puresky_2k.exr"))
    N.link(mp.outputs[0], env.inputs[0])
    elev = N.math("MAXIMUM", N.sep(tc.outputs["Generated"])[2], 0.0)
    tint = N.ramp(elev, [(0.0, lin("#55497e")), (0.06, lin("#3d3f86")), (0.25, lin("#2f3a78")), (0.6, lin(NAVY))])
    bw = N.new("ShaderNodeRGBToBW")
    N.link(env.outputs["Color"], bw.inputs[0])
    lum = N.math("MULTIPLY", N.math("POWER", bw.outputs[0], 0.5), 0.9)
    graded = N.new("ShaderNodeMix", _data_type="RGBA", _blend_type="MULTIPLY")
    N.set(graded.inputs["Factor"], 1.0)
    N.link(tint, graded.inputs[6])
    N.link(lum, graded.inputs[7])
    bg = N.new("ShaderNodeBackground", Strength=0.5)
    N.link(graded.outputs[2], bg.inputs["Color"])
    wo = N.new("ShaderNodeOutputWorld")
    N.link(bg.outputs[0], wo.inputs["Surface"])


def haze(name, x0, x1, y0, y1, z0, z1, density, color="#b8b4d8", aniso=0.45, soft=False):
    """Une boîte de brume. soft : la densité s'éteint du centre du sol vers les bords et le haut (une nappe sans
    arête visible dans le cadre)."""
    m, N, out = A.material(name)
    vol = N.new("ShaderNodeVolumePrincipled", Color=lin(color), Density=density, Anisotropy=aniso)
    if soft:
        tc = N.new("ShaderNodeTexCoord")
        mp = N.new("ShaderNodeMapping", Location=(-1.0, -1.0, 0.0), Scale=(2.0, 2.0, 1.0))
        N.link(tc.outputs["Generated"], mp.inputs[0])
        gr = N.new("ShaderNodeTexGradient", _gradient_type="SPHERICAL")
        N.link(mp.outputs[0], gr.inputs["Vector"])
        N.link(N.math("MULTIPLY", N.math("POWER", gr.outputs["Fac"], 1.5), density), vol.inputs["Density"])
    N.link(vol.outputs[0], out.inputs["Volume"])
    ob = A.box(name, x0, x1, y0, y1, z0, z1, m)
    ob.visible_shadow = False
    return ob


# ---------------------------------------------------------------- la scène

def place_hero(scene, plan):
    car = A.street_hero(scene)
    x, y, yaw = plan["hero"]
    car.location = (x, y, 0.0)
    car.rotation_euler = (0, 0, math.radians(yaw))
    # des phares de route : plus forts et plus serrés que ceux de l'avenue, ils découpent les agents dans la brume
    spots = [c for c in car.children_recursive if c.type == "LIGHT" and c.data.type == "SPOT"]
    # les phares sont la source principale du plan : pleins phares dans la brume du barrage, vers la caméra
    for lo in spots:
        lo.data.energy = 4000.0
        lo.data.spot_size = math.radians(55)
        lo.data.spot_blend = 0.45
    # le cœur des phares, vu de face à 20 m : une petite sphère émissive à la place de chaque lampe (le verre du
    # modèle reste trop sage pour découper les agents en contre-jour)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new("hero_lamp_core")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.075)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(A.mat_emit("hero_lamp_core", lin("#fff2dc"), 500.0))
    for k, lo in enumerate(spots):
        core = bpy.data.objects.new(f"hero_lamp_core_{k}", me)
        scene.collection.objects.link(core)
        core.parent = car
        core.matrix_parent_inverse = car.matrix_world.inverted()
        core.matrix_world = Matrix.Translation(lo.matrix_world.translation)
        core.visible_shadow = False
    return car


def to_world(scene):
    """Du repère de vue au repère de la scène : un demi-tour autour de z, la caméra posée à s = S_CAM. La voiture
    en fuite roule alors vers +y et y vaut s."""
    bpy.context.view_layer.update()
    W = Matrix.Translation((0.0, S_CAM, 0.0)) @ Matrix.Rotation(math.pi, 4, "Z")
    roots = [o for o in scene.objects if o.parent is None]
    for o in roots:
        o.matrix_world = W @ o.matrix_world
    bpy.context.view_layer.update()


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    random.seed(11)
    hidden = bpy.data.collections.new("sources")
    scene.collection.children.link(hidden)
    plan = PLANS[PLAN]

    hero = place_hero(scene, plan)
    M = A.city_mats()
    kerb = build_street(hidden)
    build_ring_end(hidden, kerb)
    build_city(M, hidden)
    build_signs(M, hidden)
    build_overhead(M, hidden)
    build_lamps(hidden)
    build_furniture(M, hidden)
    build_foreground(hidden)
    build_barrage(scene, hidden, plan)
    hidden.hide_render = True
    hidden.hide_viewport = True
    for c in bpy.data.collections:
        if c.name == "sources" or c.name.startswith("sources."):
            c.hide_render = True
    make_world(scene)
    # la brume d'après la pluie, plus dense au barrage : les phares et les gyrophares y prennent corps
    haze("haze", -14, 14, Y0, 128.0, -0.1, 30, 0.002)
    haze("haze_end", -60, 60, 128.0, Y_FAR + 2, -0.1, 30, 0.002)
    # (jusqu'au haut de la brume générale : un bord de boîte dans le cadre se lirait comme une ligne)
    haze("haze_barrage", -6.5, 6.5, 1.0, 34.0, -0.05, 30.0, 0.007, aniso=0.55)
    # devant la berline, au ras du sol, une nappe plus dense qui diffuse vers l'avant : le halo des phares
    hx, hy = plan["hero"][:2]
    haze("haze_lamps", hx - 3.5, hx + 3.5, 7.6, hy + 0.5, -0.05, 3.5, 0.05, aniso=0.7, soft=True)

    # la caméra du plan
    cam = bpy.data.cameras.new("cam")
    cam.lens = plan["lens"]
    cam.sensor_fit = "AUTO"
    cam.sensor_width = 36
    cam.shift_y = plan["shift_y"]
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = plan["fstop"]
    cam.dof.aperture_blades = 7
    cam.clip_start = 0.05
    cam.clip_end = 2000
    co = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(co)
    co.location = plan["cam"]
    co.rotation_euler = (math.radians(90.0), 0, 0)
    focus = bpy.data.objects.new("focus", None)
    scene.collection.objects.link(focus)
    focus.location = plan["focus"]
    cam.dof.focus_object = focus
    scene.camera = co
    to_world(scene)
    A.render_settings(scene)
    # le halo des phares plus large que sur l'avenue : ils flarent dans la brume du barrage
    for ng in bpy.data.node_groups:
        for nd in ng.nodes:
            if nd.type == "GLARE":
                try:
                    nd.inputs["Strength"].default_value = 0.22
                    nd.inputs["Size"].default_value = 0.75
                except Exception as e:
                    log(f"halo : {e!r}")
    scene.render.use_motion_blur = False

    out = os.path.join(ASSETS, BLEND)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    log(f"écrit {out} (plan {PLAN}, caméra à s = {co.location.y:.1f}, berline à s = {hero.location.y:.1f}, "
        f"{len(bpy.data.objects)} objets, {len([o for o in bpy.data.objects if o.type == 'LIGHT'])} lumières)")


if __name__ == "__main__":
    build()
