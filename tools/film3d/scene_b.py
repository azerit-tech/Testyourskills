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
# dans la rue, §2.4). La rue fait 162 m (s de 1 à 162), chaussée de 8 m à deux voies, trottoirs de 3 m, façades
# face à face à 14 m ; le barrage à s = 126 (les deux patrouilles) ; la caméra suit la berline de s = 87 à 117 ;
# au bout, le boulevard du quai et le pont qui monte (s > 162) ; derrière (s < 0), l'entrée du rond-point.
# Tout est construit dans un « repère de vue » (celui de l'ancienne caméra fixe, voir S_CAM et vw) puis tourné d'un
# bloc à la fin (to_world).
#
# Ce qui vient d'ailleurs, sans y toucher : la chaussée qui sèche, ses bordures et ses trottoirs (road.py, sur une
# largeur à elle), les immeubles (facade_mix.py : étages en enduit photographique de facade_b.py, boutiques de
# bibliothèque), le ciel et l'étalonnage (scene_a.py), la berline (lab/hero_cars.py par scene_a.street_hero), la
# patrouille à pare-buffle (lab/cast_vehicles.py), les agents (lab/cast_people.py), les modèles libres de la rue et
# du barrage (CREDITS.md : enseigne MOTEL, néon cerise, distributeur de journaux, borne d'incendie, plots et
# panneaux, barrière de foule), remis à leur taille réelle ici. Écrit ici : les dessins d'immeubles propres à la
# rue, la pose des deux rangs, les enseignes en potence, les câbles, lanternes et guirlandes en travers, les
# portières ouvertes, l'îlot du rond-point au fond ; le bout de la rue (boulevard, quai, pont, pylône, autre rive),
# les trottoirs à hauteur de voiture (bornes, étals, vélos, livraison), le sol que la caméra rase.
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
import motion as MO          # noqa: E402  (MO : M désigne ici les matières de la ville)
import p3_enseignes as P3    # noqa: E402

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
S_CAM = 134.0          # le repère de vue est posé à s = 134 (4 m au-delà du barrage, s = 130)
Y0, Y_END = -28.0, 133.0   # la rue en repère de vue : s de 162 à 1 ; au-delà, l'entrée du rond-point
RING = (0.0, 150.0)        # le centre du rond-point en repère de vue (s = -16) : îlot de 12 m, anneau de 15 m de rayon
Y_FAR = 176.0              # la place du rond-point s'arrête au muret de la promenade


def vw(x, y):
    """Du repère monde (après to_world) au repère de vue, où la scène se construit."""
    return -x, S_CAM - y


# Les plans de la scène (docs/cinematique-decoupage-v2.md), en repère de vue. cam : position de départ (les clés
# de plan_P3 la remplacent) ; lens ; shift_y : décentrement ; hero : (x, y, lacet en degrés) à l'image fixe, l'avant
# vers -y de vue ; chase : la patrouille 1 (x, y) à l'image fixe ; barrage : y de vue du milieu des deux
# patrouilles.
_H = P3.hero_pos(P3.T_STILL)
_C = P3.camera(0.0)
_K = P3.chase_pos(P3.T_STILL)
PLANS = {
    # P3, le barrage, de dos (découpage v3.1) : la caméra suit la berline au 24 mm, 7,5 m derrière elle, à 2,4 m de
    # haut, et passe le barrage à sa suite ; la berline passe le barrage, un agent tire, l'autre fait « stop », puis
    # ils se mettent à couvert (fire : éclairs). yaw : lacet de départ en degrés (positif : vers -x de vue).
    "P3": dict(cam=(*vw(_C[0], _C[1]), _C[2]), lens=P3.LENS, shift_y=0.0, yaw=180.0, fstop=4.0,
               focus=(*vw(*_H), 0.8), hero=(*vw(*_H), P3.hero_heading(P3.T_STILL)), chase=vw(*_K), barrage=8.0,
               fire=True),
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

# les deux rangs d'immeubles, en repère de vue : (dessin, y du bout côté rond-point), bout à bout de -28 à 128 (les
# deux premiers font l'angle du boulevard du quai, au bout de la rue).
# L'hôtel et son pylône lumineux jamais à moins de 45 m de la caméra : ses lettres tomberaient dans la bande du haut.
# Près de la caméra, les dessins à quatre niveaux : le ciel n'est plus qu'une fente.
LEFT = [("rue_corner", -28.0), ("rue_deco", -16.0), ("rue_corner", 2.0), ("rue_deco", 14.0), ("rue_corner", 32.0), ("rue_hotel", 44.0),
        ("rue_low", 60.0), ("rue_deco", 80.0), ("rue_hotel", 98.0), ("rue_corner", 114.0)]
RIGHT = [("rue_corner", -28.0), ("rue_low", -16.0), ("rue_deco", 4.0), ("rue_corner", 22.0), ("rue_deco", 34.0), ("rue_hotel", 52.0),
         ("rue_low", 68.0), ("rue_hotel", 88.0), ("rue_corner", 104.0), ("rue_corner", 116.0)]

# les enseignes en potence : une tous les 8 à 12 m de chaque côté, entre 4 et 8 m de haut (blade_table()) ;
# beaucoup d'ambre, de crème et de corail, un peu de menthe et de lilas
WORDS = [("HOTEL", "amber"), ("BAR", "coral"), ("CAFE", "cream"), ("VACANCY", "cream"), ("OPEN", "coral"),
         ("BAR", "lilac"), ("HOTEL", "coral"), ("CAFE", "mint"), ("OPEN", "amber"), ("HOTEL", "cream"),
         ("BAR", "amber"), ("CAFE", "amber"), ("VACANCY", "coral"), ("OPEN", "cream")]
NEON_LIGHT = {"amber": "#ffc36b", "cream": "#fff1d6", "coral": "#ff6a3d", "mint": "#7fe0c4", "lilac": "#8d8cf0"}
MOTEL = (-1, 72.0)     # l'enseigne MOTEL sur mât (modèle de bibliothèque) : côté, y de vue

# câbles en travers : y de vue des portées ; une lanterne au milieu de chacune, des guirlandes entre elles
SPANS = [-24.0, -13.0, 2.5, 13.0, 20.5, 28.0, 36.5, 46.0, 57.0, 70.0, 84.0, 100.0, 116.0]
# lampadaires tous les 30 m en quinconce : (côté, y de vue)
LAMPS = [(1, -14.0), (-1, 16.0), (1, 46.0), (-1, 76.0), (1, 106.0)]
# les voitures garées, d'un seul côté (x > 0 en vue), derrière le départ de P3 : celles d'y de vue 59, 45,5, 32
# et 23 (y monde 75 à 111) sont retirées, la patrouille 1 roule dans leur voie jusqu'au barrage
PARKED = [86.0, 99.5, 113.0]


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


# La chaussée de la rue (style propre, l'avenue garde « sechage ») : l'enrobé plus noir, une pellicule d'eau un peu
# plus lisse. Le vernis d'eau garde son poids plein : le sol pâle de P3 n'était pas un reflet (les passes par groupe
# l'ont mis sur les flammes des tirs, non liées), et le plafonner n'éteignait que les traînées des enseignes.
RUE_STYLE = dict(road.STYLES["sechage"], dark=0.45, wet=(0.36, 0.22), cr=(0.14, 0.24))
# la rugosité de l'enrobé et du caniveau sous la pellicule, × 0,5 (l'essai « rugosite » de render_film.py, retenu) :
# les reflets des phares se resserrent en traînées au lieu de s'étaler en voile
ROAD_ROUGH = 0.5


def road_gloss(k=ROAD_ROUGH):
    n = 0
    for m in bpy.data.materials:
        if not (m.node_tree and m.name.startswith(("rue_asphalt", "rue_gutter"))):
            continue
        nt = m.node_tree
        for p in [nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED"]:
            inp = p.inputs["Roughness"]
            if inp.links:
                mul = nt.nodes.new("ShaderNodeMath")
                mul.operation = "MULTIPLY"
                mul.inputs[1].default_value = k
                nt.links.new(inp.links[0].from_socket, mul.inputs[0])
                nt.links.new(mul.outputs[0], inp)
            else:
                inp.default_value *= k
            n += 1
    log(f"chaussée : rugosité × {k} sur {n} matières")


def build_street(hidden):
    road.S = road_module()
    st = RUE_STYLE
    # deux voies, double axe, ni tirets ni rives (road.lane_layout), la peinture usée et salie ; la place du
    # rond-point sans aucun marquage
    lay = dict(road.lane_layout(HALF, 2), grime=0.6)
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
    # (depuis l'angle du boulevard du quai, au bout de la rue, que la caméra regarde maintenant)
    for side, y in ((-1, -25.0), (1, -20.0)):
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
        lo = A.add_light(f"lantern_{k}_down", "SPOT", mid - Vector((0, 0, drop + 0.2)), (0, 0, -1), lamp_col, 500.0, spot=90)
        # (500 W : à 1400 W, les lanternes au-dessus du premier plan éclairaient la chaussée en plein jour)
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


# ---------------------------------------------------------------- le bout de la rue : le boulevard du quai, le pont

# en s (repère monde, y = s) : la rue finit à 162 ; le boulevard du quai de 162 à 178 ; le quai à 181 ; le pont
# part dans l'axe de la rue et monte à 6 % jusqu'à sa crête (7,2 m), le pylône en H à 330 (52 m au-dessus du
# tablier, feu corail au sommet) : le lieu du plan suivant, vu au loin par la fente de la rue
S_STREET, S_QUAY, S_BRIDGE, S_CREST, S_PYLON, S_FAR = 162.0, 178.0, 181.0, 301.0, 330.0, 600.0
BRIDGE_HALF = 8.5


def deck_z(s):
    """La hauteur du tablier du pont à l'abscisse s : rampe à 6 %, crête de 7,2 m, redescente côté port."""
    if s <= S_BRIDGE:
        return 0.0
    if s <= S_CREST:
        return 0.06 * (s - S_BRIDGE)
    if s <= 440.0:
        return 7.2
    return max(0.0, 7.2 - 0.06 * (s - 440.0))


def deck_sweep(name, x0, x1, dz0, dz1, mat, ss):
    """Un profilé rectangulaire (x0..x1, dz0..dz1 au-dessus du tablier) le long du pont, aux abscisses ss."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for s in ss:
        _, y = vw(0.0, s)
        z = deck_z(s)
        rings.append([bm.verts.new((x, y, z + dz)) for x, dz in ((x0, dz0), (x1, dz0), (x1, dz1), (x0, dz1))])
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def build_street_end(hidden):
    """Ce que la caméra regarde au-delà du barrage (de 40 à 500 m) : le boulevard du quai en travers et ses
    trottoirs, le quai et son garde-corps, l'eau, le pont qui part dans l'axe de la rue et monte, ses lampadaires
    en file, son pylône en H éclairé au pied, le feu corail au sommet, ses haubans ; au loin le port et l'autre
    rive en points de lumière. Trois plans : le barrage, le carrefour, le pont et le ciel."""
    keep = road.S
    import lieux
    road.S = keep
    walk = bpy.data.materials["rue_walk"]
    kerb = bpy.data.materials["rue_kerb"]
    plaza = bpy.data.materials["rue_plaza_asphalt"]
    paint = bpy.data.materials["rue_paint"]
    ya, yb = vw(0.0, S_STREET)[1], vw(0.0, S_QUAY)[1]
    # le boulevard (son enrobé sans marquage, au niveau du bord de la rue) et le passage piéton dans l'axe
    road.plane("bd_asphalt", 0.0, (ya + yb) / 2, -road.CROWN - 0.002, 200.0, ya - yb, plaza)
    for k in range(8):
        x = -HALF + 0.55 + k * 0.98
        road.decal_strip(f"bd_zebra_{k}", x, x + 0.5, ya - 3.4, ya - 0.6, paint)
    # les trottoirs du boulevard : devant les immeubles d'angle (le côté de la rue) et le long du quai
    for side in (-1, 1):
        x0, x1 = sorted((side * (HALF + road.KERB), side * 100.0))
        A.box(f"bd_walk_near_{side}", x0, x1, ya - 3.0, ya + 0.01, -0.05, road.WALK_Z, walk)
        A.box(f"bd_kerb_near_{side}", x0, x1, ya - 3.2, ya - 3.0, -0.05, road.WALK_Z, kerb)
        x0, x1 = sorted((side * BRIDGE_HALF, side * 100.0))
        A.box(f"bd_walk_quay_{side}", x0, x1, yb - 3.0, yb, -0.05, road.WALK_Z, walk)
        A.box(f"bd_kerb_quay_{side}", x0, x1, yb - 0.2, yb, -0.05, road.WALK_Z, kerb)
    # le quai : son mur, son garde-corps (main courante et montants), hors du départ du pont
    quay = lieux.mat_quay("rue_quai")
    rail = lieux.mat_steel("rue_garde_corps", color=(0.32, 0.36, 0.36), rough=0.35, rust=0.3, paint=True)
    yq = yb - 3.0
    for side in (-1, 1):
        x0, x1 = sorted((side * BRIDGE_HALF, side * 100.0))
        A.box(f"bd_quay_wall_{side}", x0, x1, yq - 0.5, yq, lieux.WATER_Z - 1.0, road.WALK_Z, quay)
        A.box(f"bd_rail_{side}", x0, x1, yq - 0.06, yq + 0.0, 1.05, 1.1, rail)
        A.box(f"bd_rail_low_{side}", x0, x1, yq - 0.05, yq - 0.01, 0.55, 0.58, rail)
        x = x0
        while x < x1:
            A.box(f"bd_post_{side}_{x:.0f}", x, x + 0.05, yq - 0.06, yq, road.WALK_Z, 1.1, rail)
            x += 1.6
    # l'eau, de part et d'autre du pont, jusqu'à l'autre rive
    water = lieux.mat_water("rue_lagune")
    yw = vw(0.0, 2400.0)[1]
    lieux.water("rue_eau", (-2500.0, 2500.0), (yw, yq - 0.4), lieux.WATER_Z, mat=water)
    # le pont : tablier (enrobé sombre sur caisson de béton), bordures, parapets, piles
    ss = [S_BRIDGE + k * 4.0 for k in range(int((S_FAR - S_BRIDGE) / 4.0) + 1)]
    conc = lieux.mat_concrete("rue_pont_beton", tint=(0.6, 0.58, 0.55), wet_foot=lieux.WATER_Z + 0.5)
    deck = A.mat_plain("rue_pont_enrobe", lin("#141316"), 0.32)
    deck_sweep("pont_tablier", -BRIDGE_HALF + 0.5, BRIDGE_HALF - 0.5, -0.02, 0.0, deck, ss)
    deck_sweep("pont_caisson", -BRIDGE_HALF, BRIDGE_HALF, -1.8, -0.05, conc, ss)
    for side in (-1, 1):
        x0, x1 = sorted((side * (BRIDGE_HALF - 0.5), side * (BRIDGE_HALF - 2.4)))
        deck_sweep(f"pont_trottoir_{side}", x0, x1, -0.05, 0.15, walk, ss)
        x0, x1 = sorted((side * (BRIDGE_HALF - 0.45), side * BRIDGE_HALF))
        deck_sweep(f"pont_parapet_{side}", x0, x1, -0.05, 1.1, conc, ss)
    for s in range(int(S_BRIDGE + 40), int(S_FAR), 40):
        y = vw(0.0, s)[1]
        for side in (-1, 1):
            A.box(f"pont_pile_{s}_{side}", side * 5.0 - 1.0, side * 5.0 + 1.0, y - 1.2, y + 1.2, lieux.WATER_Z - 1.0,
                  deck_z(s) - 1.8, conc)
    # les lampadaires du pont : ceux de la rue, plus grands ; les quatre premières paires éclairent vraiment, les
    # suivantes ne sont que leur tête lumineuse (une file de points qui monte vers la crête) ; à 2600 W, les
    # parapets montant vers la crête faisaient deux arcs blancs derrière le barrage, plus vifs que lui ; leurs têtes
    # à 10 : la file de points monte pile derrière le barrage, rien au fond de l'axe ne doit battre les rampes
    lamp = bpy.data.objects.get("rue_lamp_src")
    halo = lieux.emit_mat("pont_halo", lin("#ffbf69"), 10.0)
    hb = bmesh.new()
    S = 1.75
    n_real = 0
    for k, s in enumerate(range(int(S_BRIDGE + 8), int(S_FAR - 20), 26)):
        x0, y = vw(0.0, s)
        z = deck_z(s) + 0.15
        for side in (-1, 1):
            x = side * (BRIDGE_HALF - 0.9)
            rot = math.pi / 2 if side < 0 else -math.pi / 2
            if lamp is not None:
                A.instance(lamp, f"pont_lamp_{k}_{side}", (x, y, z), rot, S)
            hd = Vector((0, -1.68 * S, 4.68 * S))
            hd.rotate(Matrix.Rotation(rot, 3, "Z"))
            head = Vector((x, y, z)) + hd
            bmesh.ops.create_uvsphere(hb, u_segments=8, v_segments=5, radius=0.45, matrix=Matrix.Translation(head))
            if k < 4:
                lo = A.add_light(f"pont_lamp_light_{k}_{side}", "SPOT", head - Vector((0, 0, 0.15)), (0, 0, -1),
                                 lin(AMBER), 800.0, spot=130)
                lo.data.spot_blend = 0.5
                lo.data.shadow_soft_size = 0.5
                n_real += 1
    lieux.mesh_object("pont_halos", hb, [halo]).visible_shadow = False
    # le pylône en H, à cheval sur le tablier : deux jambes, deux traverses, projecteurs ambre au pied, feu corail
    yp = vw(0.0, S_PYLON)[1]
    zt = deck_z(S_PYLON) + 52.0
    for side in (-1, 1):
        A.box(f"pylone_jambe_{side}", side * 11.0 - 1.5, side * 11.0 + 1.5, yp - 1.0, yp + 1.0, lieux.WATER_Z - 1.0, zt,
              conc)
        for j in range(2):
            p = Vector((side * 9.0, yp + 2.5 * (j - 0.5) * 2, deck_z(S_PYLON) + 0.3))
            lo = A.add_light(f"pylone_proj_{side}_{j}", "SPOT", p, (side * 2.0, 0.0, 20.0), lin(AMBER), 30000.0, spot=14)
            lo.data.spot_blend = 0.3
            lo.data.shadow_soft_size = 0.3
    for z0 in (deck_z(S_PYLON) + 24.0, zt - 4.0):
        A.box(f"pylone_traverse_{z0:.0f}", -11.0, 11.0, yp - 0.8, yp + 0.8, z0, z0 + 2.2, conc)
    beacon = lieux.emit_mat("pylone_feu", lin(CORAL), 80.0)
    bb = bmesh.new()
    for side in (-1, 1):
        bmesh.ops.create_uvsphere(bb, u_segments=10, v_segments=6, radius=0.6,
                                  matrix=Matrix.Translation((side * 11.0, yp, zt + 0.6)))
        lo = A.add_light(f"pylone_feu_{side}", "POINT", (side * 11.0, yp, zt + 1.6), (0, 0, -1), lin(CORAL), 4000.0)
        lo.data.shadow_soft_size = 0.5
    lieux.mesh_object("pylone_feux", bb, [beacon]).visible_shadow = False
    # les haubans : de chaque jambe, en éventail vers les bords du tablier, de part et d'autre du pylône
    cable = lieux.mat_steel("rue_haubans", color=(0.7, 0.7, 0.72), rough=0.3, rust=0.0)
    paths = []
    for side in (-1, 1):
        for ds in (-95, -70, -45, 45, 70, 95):
            s = S_PYLON + ds
            _, y = vw(0.0, s)
            paths.append([(side * 11.0, yp, zt - 2.0), (side * (BRIDGE_HALF - 0.2), y, deck_z(s) + 1.1)])
    import facade_proc as C
    C.tube(paths, 0.12, cable, "pont_haubans")
    # au loin : l'autre rive (le port, ses mâts) en relief sombre et points de lumière
    land = A.mat_plain("rue_rive", lin("#0c0c16"), 0.9)
    rng = random.Random(17)
    rb = bmesh.new()
    y0 = vw(0.0, 900.0)[1]
    lieux.box_bm(rb, (-2500.0, y0 - 400.0, lieux.WATER_Z - 1.0), (2500.0, y0, 5.0))
    for _ in range(30):
        x = rng.uniform(-900, 900)
        w, h = rng.uniform(30, 160), rng.uniform(8, 36)
        lieux.box_bm(rb, (x, y0 - 300, 0.0), (x + w, y0 - 10, h))
    lieux.mesh_object("rue_rive_relief", rb, [land]).visible_shadow = False
    warm = lieux.emit_mat("rue_rive_feux", lin("#ffb866"), 60.0)
    lb = bmesh.new()
    for _ in range(160):
        x = rng.uniform(-900, 900)
        bmesh.ops.create_uvsphere(lb, u_segments=6, v_segments=4, radius=rng.uniform(0.8, 1.8),
                                  matrix=Matrix.Translation((x, y0 - rng.uniform(5, 40), rng.uniform(1, 22))))
    for x in (-60.0, -20.0, 25.0, 70.0):          # les mâts d'éclairage du port, au pied de la descente du pont
        bmesh.ops.create_uvsphere(lb, u_segments=8, v_segments=5, radius=2.2,
                                  matrix=Matrix.Translation((x, vw(0.0, 620.0)[1], 25.0)))
    lieux.mesh_object("rue_rive_lampes", lb, [warm]).visible_shadow = False
    # les lampadaires du quai, de part et d'autre du départ du pont
    if lamp is not None:
        for k, x in enumerate((-34.0, -16.0, 16.0, 34.0)):
            A.instance(lamp, f"bd_lamp_{k}", (x, yq + 0.6, road.WALK_Z), 0.0, 1.3)
            lo = A.add_light(f"bd_lamp_light_{k}", "SPOT", (x, yq + 0.6 + 1.68 * 1.3, road.WALK_Z + 4.68 * 1.3 - 0.1),
                             (0, 0, -1), lin(AMBER), 1800.0, spot=130)
            lo.data.spot_blend = 0.5
    log(f"bout de rue : boulevard, quai, pont de {S_FAR - S_BRIDGE:.0f} m ({n_real} lampadaires allumés), pylône à "
        f"s = {S_PYLON:.0f}, autre rive")


# ---------------------------------------------------------------- le trottoir à hauteur de voiture

def bike(name, x, y, z, rot, frame_mat, tyre, metal):
    """Un vélo de ville en code (deux roues, cadre, guidon, selle), 1,75 m, appuyé à 8° ; repère : l'avant vers
    +x avant la rotation `rot`."""
    import facade_proc as C
    R = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Rotation(math.radians(8), 4, "X")
    r = 0.33
    wheels = []
    for cx in (-0.55, 0.55):
        wheels.append([tuple(R @ Vector((cx + r * math.cos(a), 0.0, r + r * math.sin(a))))
                       for a in (i * math.tau / 24 for i in range(25))])
    C.tube(wheels, 0.02, tyre, f"{name}_roues")
    P = {k: Vector(v) for k, v in dict(ar=(-0.55, 0, r), av=(0.55, 0, r), pedalier=(-0.05, 0, 0.3),
                                         selle=(-0.22, 0, 0.88), direction=(0.42, 0, 0.86), guidon=(0.38, 0, 1.0)).items()}
    segs = [("ar", "pedalier"), ("pedalier", "selle"), ("selle", "direction"), ("pedalier", "direction"),
            ("ar", "selle"), ("direction", "av"), ("direction", "guidon")]
    C.tube([[tuple(R @ P[a]), tuple(R @ P[b])] for a, b in segs], 0.017, frame_mat, f"{name}_cadre")
    g = P["guidon"]
    C.tube([[tuple(R @ (g + Vector((0, -0.28, 0)))), tuple(R @ (g + Vector((0, 0.28, 0))))]], 0.012, metal, f"{name}_guidon")
    s = P["selle"]
    ob = A.box(f"{name}_selle", -0.12, 0.08, -0.07, 0.07, 0.0, 0.05, tyre)
    ob.matrix_world = R @ Matrix.Translation(s)


def stall(name, x0, x1, y0, y1, wood, tarp, metal):
    """Un étal fermé : comptoir de bois sur pieds, bâché pour la nuit, la bâche nouée, une caisse dessous."""
    A.box(f"{name}_comptoir", x0, x1, y0, y1, 0.72 + road.WALK_Z, 0.95 + road.WALK_Z, wood)
    A.box(f"{name}_bache", x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, 0.95 + road.WALK_Z, 1.25 + road.WALK_Z, tarp)
    A.box(f"{name}_jupe", x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, 0.42 + road.WALK_Z, 0.95 + road.WALK_Z, tarp)
    for xx in (x0 + 0.06, x1 - 0.1):
        for yy in (y0 + 0.06, y1 - 0.1):
            A.box(f"{name}_pied_{xx:.1f}_{yy:.1f}", xx, xx + 0.04, yy, yy + 0.04, road.WALK_Z, 0.42 + road.WALK_Z, metal)
    A.box(f"{name}_caisse", x0 + 0.2, x0 + 0.75, y0 + 0.1, y0 + 0.5, road.WALK_Z, road.WALK_Z + 0.32, wood)


def build_sidewalk(hidden):
    """À hauteur de voiture, là où la caméra regarde : bornes le long des bordures avant le barrage, étals fermés
    et vélos sur les trottoirs, une pile de palettes et de cageots de livraison au bord de la voie de droite (la
    berline la frôle dans sa feinte : p3_enseignes.CRATES), deux chevalets de café."""
    import facade_proc as C
    P = lib_parts("lieux/rue/street-pack/model.glb", {
        "borne_src": lambda o, c: o.name.startswith("Bollard_lp"),
        "poubelle_src": lambda o, c: o.name.startswith("Bin_lp"),
    }, hidden, 6.0)
    n = 0
    if P.get("borne_src"):
        for side in (-1, 1):
            for yw in [100.0 + 1.9 * k for k in range(12)]:
                if side < 0 and 99.0 < yw < 114.0:     # (le long des voitures garées, du côté gauche, pas de bornes)
                    continue
                x, y = vw(side * (HALF + road.KERB + 0.35), yw)
                A.instance(P["borne_src"], f"borne_{side}_{n}", (x, y, road.WALK_Z), 0.0)
                n += 1
    if P.get("poubelle_src"):
        for k, (xw, yw) in enumerate(((5.0, 109.4), (-5.1, 118.6), (4.9, 136.0))):
            x, y = vw(xw, yw)
            A.instance(P["poubelle_src"], f"poubelle_{k}", (x, y, road.WALK_Z), k * 1.3)
    wood = C.mat_pbr("rue_bois_etal", "#5a4330", 0.75, 0.0, noise_amt=0.3)
    tarp = C.mat_pbr("rue_bache", "#1f3a33", 0.6, 0.0, noise_amt=0.25, coat=0.3)
    tarp2 = C.mat_pbr("rue_bache_rayee", "#6b2a2a", 0.6, 0.0, noise_amt=0.25, coat=0.3)
    metal = C.mat_pbr("rue_metal_sombre", "#2a2a2e", 0.45, 0.8, noise_amt=0.2)
    for k, (xw, yw, t) in enumerate(((5.2, 96.0, tarp), (5.3, 113.5, tarp2), (-5.4, 92.0, tarp2))):
        x, y = vw(xw, yw)
        stall(f"etal_{k}", x - 0.55, x + 0.55, y - 1.3, y + 1.3, wood, t, metal)
    # des vélos appuyés le long des façades, côté droit, et deux près du barrage
    frames = [C.mat_pbr(f"rue_velo_{i}", c, 0.4, 0.3, coat=0.5) for i, c in enumerate(("#1f4e5a", "#7a2f25", "#d8cfb8"))]
    tyre = A.mat_plain("rue_pneu_velo", lin("#0b0b0b"), 0.7)
    for k, (xw, yw) in enumerate(((6.4, 100.6), (6.4, 101.5), (6.35, 102.5), (-6.4, 116.2), (-6.4, 117.0))):
        x, y = vw(xw, yw)
        bike(f"velo_{k}", x, y, road.WALK_Z, math.pi / 2, frames[k % 3], tyre, metal)
    # la livraison au bord de la voie de droite : palettes du modèle et cageots de plastique empilés
    pal = lib_parts("lieux/port/pallets/model.glb", {
        "palette_pile_src": lambda o, c: o.name.startswith("Pallet_04"),
        "palette_src": lambda o, c: o.name.startswith("Pallet_01"),
    }, hidden)
    x0, x1, y0, y1 = P3.CRATES
    cx, cy = vw((x0 + x1) / 2, (y0 + y1) / 2)
    if pal.get("palette_pile_src"):
        A.instance(pal["palette_pile_src"], "livraison_pile", (cx, cy + 0.6, road.road_z(abs(cx))), 0.05)
    if pal.get("palette_src"):
        A.instance(pal["palette_src"], "livraison_palette", (cx + 0.05, cy - 0.7, road.road_z(abs(cx))), -0.08)
    crate_cols = ["#2f6b3a", "#c8662a", "#2d4f8a", "#2f6b3a"]
    for k in range(7):
        col = C.mat_pbr(f"rue_cageot_{k % 4}", crate_cols[k % 4], 0.5, 0.0, noise_amt=0.2) \
            if f"rue_cageot_{k % 4}" not in bpy.data.materials else bpy.data.materials[f"rue_cageot_{k % 4}"]
        lvl, j = divmod(k, 3)
        xx = cx - 0.45 + 0.3 * j
        yy = cy - 0.75
        z = road.road_z(abs(cx)) + 0.16 + 0.3 * lvl
        A.box(f"cageot_{k}", xx - 0.14, xx + 0.14, yy - 0.2, yy + 0.2, z, z + 0.28, col)
    # deux chevalets de café (ardoise sombre, cadre de bois) sur le trottoir de gauche
    slate = A.mat_plain("rue_ardoise", lin("#1c1d1f"), 0.6)
    for k, (xw, yw) in enumerate(((-5.0, 104.0), (5.0, 121.0))):
        x, y = vw(xw, yw)
        for f in (-1, 1):
            ob = A.box(f"chevalet_{k}_{f}", -0.3, 0.3, -0.02, 0.02, 0.0, 0.9, slate)
            ob.matrix_world = (Matrix.Translation((x, y + f * 0.17, road.WALK_Z)) @
                               Matrix.Rotation(math.radians(-f * 11), 4, "X"))
            A.box(f"chevalet_cadre_{k}_{f}", -0.32, 0.32, -0.025, 0.025, 0.86, 0.9, wood).matrix_world = ob.matrix_world
    log(f"trottoirs : {n} bornes, 3 étals, 5 vélos, une livraison (palettes, cageots), 2 chevalets")


# ---------------------------------------------------------------- le premier plan, au ras du sol

def puddle(name, cx, cy, r, sy, seed, mat):
    """Une flaque au contour irrégulier qui épouse le bombé de la chaussée (anneaux en éventail), 2,5 mm au-dessus."""
    R = random.Random(seed)
    seg, rings = 40, 4
    ph = [R.uniform(0, math.tau) for _ in range(4)]
    def rad(a):
        return r * (1.0 + 0.12 * math.sin(2 * a + ph[0]) + 0.12 * math.sin(3 * a + ph[1]) + 0.07 * math.sin(5 * a + ph[2])
                    + 0.05 * math.sin(7 * a + ph[3]))
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


def puddle_mat():
    water, N, out = A.material("rue_puddle")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    # (un miroir parfait au ras du sol ne renvoie que le ciel noir : des trous. Une ride fine et un peu de flou
    # étirent dans l'eau les guirlandes, les enseignes et les feux ; le fond, l'enrobé noyé)
    bsdf.inputs["Base Color"].default_value = (0.018, 0.017, 0.018, 1)
    bsdf.inputs["Roughness"].default_value = 0.05
    bsdf.inputs["IOR"].default_value = 1.33
    N.set(bsdf.inputs["Normal"], road.ripples(N, road.coords(N)[0], scale=22.0, strength=0.12))
    N.link(bsdf.outputs[0], out.inputs["Surface"])
    return water


def build_foreground(hidden, plan):
    """Le sol que la caméra rase (p3_enseignes.PUDDLES, repère monde) : des flaques sur la ligne de la berline,
    sous la caméra quand elle descend et devant elle à l'arrêt, où le barrage et ses rampes se reflètent ; une
    reprise d'enrobé et des gravillons le long de la double ligne, là où la caméra passe au plus bas."""
    water = puddle_mat()
    for k, (name, xw, yw, r, sy) in enumerate(P3.PUDDLES):
        x, y = vw(xw, yw)
        puddle(f"rue_{name}", x, y, r, sy, 70 + k, water)
    # une reprise d'enrobé en travers de la voie, sous la caméra au plus bas (son joint défile sous l'objectif)
    patch = road.mat_asphalt(RUE_STYLE, "rue_asphalt_patch_near", force_patch=True,
                             layout=dict(road.lane_layout(HALF, 2), grime=0.6))
    for k, (xw, yw, w, h) in enumerate(((-1.2, 111.0, 2.6, 1.3), (0.9, 116.6, 1.8, 2.2))):
        x, y = vw(xw, yw)
        road.plane(f"rue_patch_near_{k}", x, y, road.road_z(x) + 0.0015, w, h, patch, 0.03 * (k - 0.5))
    # les gravillons, plus serrés le long de la double ligne, du milieu de la rue aux plots
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
    while n < 260:
        x = R.uniform(-2.6, 2.6)
        y = vw(0.0, R.uniform(108.0, 122.5))[1]
        if abs(abs(x) - 0.15) > 0.35 and R.random() < 0.6:
            continue
        s = R.uniform(0.003, 0.008)
        ob = bpy.data.objects.new(f"gravel_{n}", srcs[n % 4].data)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = (x, y, road.road_z(x) + s * 0.4)
        ob.rotation_euler = (R.uniform(0, 3), R.uniform(0, 3), R.uniform(0, 6))
        ob.scale = (s * R.uniform(1.0, 1.6), s, s * R.uniform(0.5, 0.8))
        n += 1
    log(f"sol : {len(P3.PUDDLES)} flaques, 2 reprises, {n} gravillons")


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
    # (les roues sont sorties de la caisse pour tourner, cast_vehicles.split_wheels : l'avant des roues avant est
    # noté sur la caisse, la même mesure qu'avant, sur leurs sommets)
    xs = xs or ([body["front_wheel_x"]] if "front_wheel_x" in body else [])
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


def unshare_lights(root):
    """Les lumières d'une copie de dup_tree (ob.copy() partage leurs données) prennent leurs propres données, et
    les pilotes de ses optiques de rampe (cast_vehicles.bar_drive_lenses) les suivent : chaque patrouille clignote
    à sa phase (motion.flash_bars) au lieu des trois ensemble à celle de la dernière."""
    tree = [root] + list(root.children_recursive)
    new = {}
    for o in tree:
        if o.type == "LIGHT":
            d = o.data.copy()
            new[o.data.name] = d
            o.data = d
    for o in tree:
        ad = o.animation_data
        for fc in (ad.drivers if ad else ()):
            for v in fc.driver.variables:
                for tg in v.targets:
                    if tg.id_type == "LIGHT" and tg.id is not None and tg.id.name in new:
                        tg.id = new[tg.id.name]
    return root


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


def only_on(light, objs, tag):
    """Liaison de lumière : `light` n'éclaire que `objs` (et leurs enfants). Les sources d'appoint posées près du sol
    (liserés, éclairs, nappe sur la berline) blanchissaient la chaussée autour d'elles : le sol devant la caméra doit
    rester un mouillé sombre, éclairé par la rue seulement."""
    col = bpy.data.collections.new(f"{tag}_receivers")
    for o in objs:
        for x in [o] + list(o.children_recursive):
            if x.name not in col.objects and not x.get("vitre"):    # les vitres de la berline : lieux.car_parts
                col.objects.link(x)
    light.light_linking.receiver_collection = col
    return col


def officer_rig(keys, style, name):
    """lieux.officer_rig (l'agent qui garde son armature, ses poses en clés). lieux branche road.S sur la scène A à
    l'import : la rue garde le sien."""
    keep = road.S
    import lieux
    road.S = keep
    return lieux.officer_rig(list(keys), style=style, name=name)


def hero_objects():
    car = bpy.data.objects.get("coupe")
    return [car] + list(car.children_recursive) if car else []


def exclude_hero(lights, tag):
    """Liaison de lumière : ces lumières éclairent tout sauf la berline. Les faisceaux colorés des rampes, faits
    pour les façades, la teintaient de corail et de lilas au passage (le bordeaux doit rester bordeaux)."""
    col = bpy.data.collections.new(f"{tag}_sans_berline")
    for o in hero_objects():
        if o.name not in col.objects:
            col.objects.link(o)
    for co in col.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
    for lo in lights:
        lo.light_linking.receiver_collection = col
    return col


def officer_light(officers, plan, receivers=()):
    """Les deux agents, vus de face : les phares de la berline les éclairent de plus en plus fort ; un liseré (un
    spot froid derrière chacun, côté boulevard, qui accroche épaules et casquette) les détache du fond ; et, quand
    le plan ouvre le feu, l'éclair de chaque pistolet : une flamme blanche émissive dans l'axe du canon et une
    lumière ponctuelle, brève à l'image, attachées à l'arme (l'agent bouge). Rien n'atteint personne : pas
    d'impact, pas d'étincelle."""
    bpy.context.view_layer.update()
    flash = None
    if plan.get("fire"):
        me = bpy.data.meshes.new("muzzle_flash")
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        bm.to_mesh(me)
        bm.free()
        # (25 : à 600, le halo du compositing faisait de l'éclair un voile blanc sur tout le centre du cadre)
        me.materials.append(A.mat_emit("muzzle_flash", lin("#fff4e2"), 25.0))
        flash = me
    for k, a in enumerate(officers):
        o = a.matrix_world.translation.copy()
        out = 1.0 if o.x > 0 else -1.0
        tgt = o + Vector((0.0, 0.0, 1.3))
        # (derrière lui pour la caméra : -y de vue ; devant, ce serait un aplat de face ; 1500 W et non 380 : sur la
        # portière claire, sous les guirlandes, l'agent ne se détachait pas, il lui faut un vrai contre-jour qui
        # dessine casquette et épaules ; il n'éclaire que lui)
        p = o + Vector((out * 0.7, -2.6, 2.3))
        lo = A.add_light(f"rim_{k}", "SPOT", p, tgt - p, lin("#e6ecff"), 1500.0, spot=40)
        lo.data.spot_blend = 0.6
        lo.data.shadow_soft_size = 0.15
        lo.visible_glossy = False
        only_on(lo, [a], f"rim_{k}")
        if flash is None or k not in P3.SHOTS:      # (l'agent qui fait « stop » ne tire pas)
            continue
        gun = bpy.data.objects.get(a.get("gun", ""))
        # (l'arme à sa place au premier tir de l'agent)
        bpy.context.scene.frame_set(min(P3.SHOTS[k]))
        bpy.context.view_layer.update()
        if gun is not None and "muzzle" in gun:
            m = gun.matrix_world @ Vector(tuple(gun["muzzle"]))
            d = (gun.matrix_world.to_3x3() @ Vector((1.0, 0.0, 0.0))).normalized()
        else:
            d = Vector((0.0, 1.0, 0.0))
            m = o + Vector((0.0, 0.55, 1.05))
        flames = []
        for j, (sc, off) in enumerate((((0.62, 0.09, 0.09), 0.55), ((0.07, 0.2, 0.2), 0.08), ((0.14, 0.13, 0.04), 0.2))):
            f = bpy.data.objects.new(f"muzzle_flash_{k}_{j}", flash)
            bpy.context.scene.collection.objects.link(f)
            f.location = m + d * off
            f.rotation_mode = "QUATERNION"
            f.rotation_quaternion = d.to_track_quat("X", "Z")
            f.scale = sc
            f.visible_shadow = False
            flames.append(f)
            if gun is not None:
                keep_world_parent([f], gun)
        # (assez pour découper l'agent, pas pour brûler le flanc blanc de la patrouille à côté)
        lf = A.add_light(f"muzzle_{k}", "POINT", m + d * 0.15 + Vector((0, 0, 0.1)), (0, 0, -1), lin("#fff3e0"), 250.0)
        lf.data.shadow_soft_size = 0.04
        lf.visible_camera = False
        if gun is not None:
            keep_world_parent([lf], gun)
        # (l'éclair n'allume que les agents, leurs armes, les portières et les patrouilles : pas la chaussée)
        col = only_on(lf, list(officers) + list(receivers), f"muzzle_{k}")
        # les flammes aussi, mêmes receveurs : à 600 de force, sans liaison, elles faisaient près des trois quarts de
        # l'éclairement direct du sol au premier plan de P3 (passes par groupe, lab/lightgroups.py) ; la caméra les
        # voit toujours, la liaison ne coupe que ce qu'elles éclairent
        for f in flames:
            f.light_linking.receiver_collection = col
    log(f"agents : liseré des phares{', éclairs de tir' if flash is not None else ''}")


def build_barrage(scene, hidden, plan):
    import cast_people as cp
    import cast_vehicles as cv
    pat = cv.load_patrol("jeandiz", lights_on=True, name="patrol_a")
    body = pat["body"]
    doors, front_axle, hw = cut_doors(body)
    shells = [c for c in bpy.data.collections if c.name.endswith("_glow_exclude")]
    cars = [body] + [unshare_lights(dup_tree(body, None, tag)) for tag in ("b", "c")]
    # les lueurs de rampe excluent la rampe (liaison de lumière) : les copies y sont entrées aussi
    for sh in shells:
        for co in sh.collection_objects:
            co.light_linking.link_state = "EXCLUDE"
    # les deux voitures du barrage, en biais, l'avant vers la berline et vers l'axe, 3 m entre les pare-chocs ;
    # la roue arrière extérieure montée sur le trottoir (roulis et tangage de quelques degrés). Les portières à
    # 7 m de la caméra : plus près, le cadre vertical (45° de champ horizontal) ne montrerait que la brèche.
    yb = plan["barrage"]
    yaw = math.radians(25.0)
    # (à P3.BAR_X de l'axe : écartées pour que la trouée ne se lise pas comme un choc)
    spots = [((-P3.BAR_X, yb), (math.sin(yaw), math.cos(yaw)), -1, 0.045),   # gauche : sa portière droite (-y local)
             ((P3.BAR_X, yb), (-math.sin(yaw), math.cos(yaw)), 1, -0.045)]   # droite : sa portière gauche (+y local)
    officers = []
    for car, ((x, y), (hx, hy), open_side, roll) in zip(cars[:2], spots):
        car.location = (x, y, road.road_z(abs(x)) + 0.04)
        car.rotation_euler = (roll, 0.03, heading_rot(hx, hy))
        for ch in car.children:
            if "_door_" in ch.name:
                side = -1 if "_door_-1" in ch.name else 1
                # la portière tourne sur sa charnière avant, son bord arrière s'écarte de la caisse
                ch.rotation_euler = (0, 0, -side * math.radians(58 if side == open_side else 50))
        # l'agent derrière la portière ouverte, face à la berline (donc à la caméra) : l'un vise debout, l'autre fait
        # « stop », puis ils plongent à couvert quand elle arrive (lieux.officer_rig, ses poses clés :
        # p3_enseignes.COVER)
        k = len(officers)
        a = officer_rig(P3.COVER[k], style=k, name=f"agent_{k}")
        gun = next((c for c in a.children_recursive if "muzzle" in c), None)
        a["gun"] = gun.name if gun else ""
        bpy.context.view_layer.update()
        p = car.matrix_world @ Vector((front_axle - 1.42, open_side * (hw + 0.6), 0.0))
        a.location = (p.x, p.y, road.road_z(abs(p.x)))
        # l'armature regarde -y au repos, en quaternion : un lacet θ (en Euler) la tourne vers (sin θ, -cos θ) ;
        # l'agent vise le pneu avant de la berline (+y de vue), à 17° de l'axe : la caméra, qui arrive 6 m derrière
        # elle, le voit de face, et il ne la vise jamais (à 6° vers l'axe, il visait l'objectif)
        fx, fy = (-0.3 if x > 0 else 0.3), 1.0
        a.rotation_mode = "XYZ"
        a.rotation_euler = (0, 0, math.atan2(fx, -fy))
        officers.append(a)
    # leurs phares, braqués sur la brèche, en veilleuse (120 W au lieu de 450) : à pleine force, de face à 6 m, ils
    # blanchissaient l'avant de la berline jusqu'au rose (le bordeaux d'OUV et de P4 se perdait)
    for car in cars[:2]:
        for lo in car.children_recursive:
            if lo.type == "LIGHT" and "_head_" in lo.name:
                lo.data.energy = 120.0
    # la troisième, la patrouille 1 (p3_enseignes.chase_pos : au bord gauche du cadre à l'image 1)
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
    beams = patrol_beams(cars[0], "a", [(CORAL, (-7.0, yb + 22.0, 6.0), 150000, 18), (LILAC, (2.0, yb + 30.0, 0.0), 60000, 18)])
    beams += patrol_beams(cars[1], "b", [(LILAC, (7.0, yb + 18.0, 6.5), 150000, 18), (CORAL, (-2.0, yb + 34.0, 0.0), 60000, 18)])
    # (la patrouille 1, sortie du cadre par la gauche : ses faisceaux balaient devant elle les façades autour de la
    # berline et du barrage, la meute qui pousse se lit sur les murs)
    beams += patrol_beams(cars[2], "c", [(CORAL, (-7.0, cy - 30.0, 5.5), 50000, 16), (LILAC, (7.0, cy - 40.0, 5.0), 50000, 16)])
    exclude_hero(beams, "faisceaux")
    # les lueurs colorées des rampes (celles du modèle, 600 W à 0,4 m de la rampe) : la berline passe à 1,5 m, elles la teintaient de corail puis de lilas ; la liaison l'en retire comme
    # des faisceaux. (Plus de lueurs à part, bar_glow : copiées des rampes, les lumières des trois patrouilles
    # partagent leurs données et clignotent ensemble ; les lueurs à part battaient à contretemps de leurs optiques.)
    glows = [o for car in cars[:2] for o in car.children_recursive if o.type == "LIGHT" and "_glow_" in o.name]
    for sh in shells:
        for o in hero_objects():
            if o.name not in sh.objects:
                sh.objects.link(o)
        for co in sh.collection_objects:
            co.light_linking.link_state = "EXCLUDE"
    exclude_hero([o for o in glows if o.light_linking.receiver_collection is None], "lueurs")
    for car in cars[:2]:
        for lo in car.children_recursive:
            if lo.type == "LIGHT" and "_head_" in lo.name:
                # (de face, à hauteur de capot, leur cône dans la brume faisait la tache blanche de l'image 21)
                lo.data.volume_factor = 0.1

    # la ligne de plots en travers de la brèche, deux panneaux rayés à feu aux bouts, barrières de foule sur les
    # trottoirs (modèles libres, déjà à l'échelle) ; un plot sur deux porte sa balise
    S = lib_parts("cast/barricade-set/model.glb", {
        "cone_lamp_src": lambda o, c: o.name.startswith(("Traffic_Cone_2_1.001", "Collar_2.002")),
        "cone_src": lambda o, c: o.name.startswith("Traffic_Cone_2_2.002"),
        "panel_src": lambda o, c: o.name.startswith(("Vertical_Panel_1.001", "Collar_1.002")),
    }, hidden)
    # (dans la brèche, juste devant les nez des patrouilles, trois de chaque côté d'un trou où passe la berline :
    # p3_enseignes.CONES, en repère monde, ramenés ici au repère de la caméra)
    rng = random.Random(5)
    n = 0
    for k, (xw, yw) in enumerate(P3.CONES):
        x, y = -xw, S_CAM - yw
        src = S.get("cone_lamp_src" if k % 2 else "cone_src")
        if src:
            A.instance(src, f"cone_{k}", (x, y, road.road_z(abs(x))), rng.uniform(0, math.tau))
            n += 1
    if S.get("panel_src"):
        for side, (xw, yw) in zip((-1, 1), P3.PANELS):    # (P3.PANELS[0] à droite de la berline : à gauche en vue)
            A.instance(S["panel_src"], f"panel_{side}", (-xw, S_CAM - yw, road.road_z(abs(xw))), side * 0.25)
    officer_light(officers, plan, cars[:2])
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
    # la boîte de scene_a a ses faces tournées vers l'intérieur : Cycles croirait la caméra hors du volume et ne
    # poserait la brume qu'au-delà de la boîte, jamais autour d'elle (comme lieux.haze)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.visible_shadow = False
    return ob


# ---------------------------------------------------------------- la scène

# la peinture de la berline dans cette rue : le bordeaux du catalogue (#4e0a28) est tiré vers le pourpre pour
# l'ambre de l'avenue ; sous les lanternes blanches, les guirlandes et le lilas des rampes, il virait au rose
# framboise. Ici, moins de bleu et moins clair : le bordeaux d'OUV et de P4 (FILM3D_PAINT l'emporte toujours)
P3_PAINT = "#3c0812"


def place_hero(scene, plan):
    os.environ.setdefault("FILM3D_PAINT", P3_PAINT)
    car = A.street_hero(scene)
    x, y, yaw = plan["hero"]
    car.location = (x, y, 0.0)
    car.rotation_euler = (0, 0, math.radians(yaw))
    # des phares de route, vus de dos : ils portent vers le barrage, découpent les patrouilles et les agents de plus
    # en plus fort à mesure qu'elle approche, et prennent corps dans la brume devant elle
    # (avant le découpage v2, face à la caméra, ils étaient à 400 W : leur reflet sur l'enrobé mouillé voilait le sol)
    # (0,05 de volume : à 0,35, vue d'en haut, la brume qu'ils allumaient devant le capot remplissait la lunette
    # arrière d'un aplat blanc, images 1 à 14 ; à 0,15, leurs deux cônes faisaient au fond de l'axe deux arcs
    # blancs plus vifs que les rampes du barrage)
    spots = [c for c in car.children_recursive if c.type == "LIGHT" and c.data.type == "SPOT"]
    for lo in spots:
        lo.data.energy = 900.0
        lo.data.spot_size = math.radians(40)
        try:
            lo.data.volume_factor = 0.05
        except AttributeError:
            pass
        lo.data.spot_blend = 0.4
    # la carrosserie bordeaux lisible de dos : une nappe douce au-dessus et en arrière du coffre (la lueur des
    # guirlandes), invisible à la caméra, liée à la berline seule ; son reflet dessine le toit, la lunette et le coffre
    # (150 W d'un blanc à peine chaud : plus fort ou rosé, le bordeaux virait au saumon)
    fill = A.add_light("hero_fill", "AREA", (x, y + 2.2, 3.6), (0.0, -2.2, -3.6), lin("#fff0e6"), 150.0, (2.4, 1.4))
    fill.visible_camera = False
    only_on(fill, [car], "hero_fill")
    # l'habitacle allumé (lieux.cabin_light, 25 W comme scene_d) : de dos, par la lunette, la capuche et les épaules
    # du conducteur se découpent sur un habitacle chaud au lieu d'un trou noir
    keep = road.S
    import lieux
    road.S = keep
    lieux.cabin_light({"body": car.name}, energy=25.0)
    # le cœur des phares, vu de face à 20 m : une petite sphère émissive à la place de chaque lampe (le verre du
    # modèle reste trop sage pour découper les agents en contre-jour)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new("hero_lamp_core")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.075)
    bm.to_mesh(me)
    bm.free()
    # (40 : à 500, le halo du compositing faisait des deux cœurs une seule tache blanche sur la calandre)
    me.materials.append(A.mat_emit("hero_lamp_core", lin("#fff2dc"), 40.0))
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


def keep_world_parent(objs, parent):
    """Parente des objets posés à part (lueurs et faisceaux d'une patrouille) à leur véhicule, leur place gardée."""
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
        o.matrix_world = mw


def plan_P3(scene):
    """P3, le barrage, de dos (48 images, p3_enseignes.py, découpage v3.1), en repère monde après to_world : la
    berline arrive à 106 km/h, lève le pied et freine un peu (feux stop), vise le trou des plots, remet les gaz et
    passe entre les deux agents ; la caméra la suit au 24 mm, 7,5 m derrière, à 2,4 m, et passe le barrage à sa
    suite ; la patrouille 1, devant à gauche, freine, se fait dépasser et sort par le bas à gauche ; les rampes
    clignotent ; un agent tire (un éclair d'une image), l'autre fait « stop », puis ils plongent derrière leurs
    portières. L'image fixe (P3.STILL_FRAME, la 34) : la berline à quelques mètres des plots."""
    frames = range(P3.F0 - 1, P3.F0 + P3.FRAMES + 1)        # une image de plus de chaque côté, pour l'obturateur
    scene.frame_start, scene.frame_end = P3.F0, P3.F0 + P3.FRAMES - 1
    ob = bpy.data.objects
    # --- la berline : son rig au sol sous la caisse, tourné de son cap à l'image fixe ; la nappe d'appoint, la
    # brume des phares et le point de netteté la suivent
    body = ob["coupe"]
    extras = [o for o in (ob.get("hero_fill"), ob.get("haze_lamps"), ob.get("focus")) if o is not None]
    rig = MO.rig_up(body, P3.hero_heading(P3.T_STILL), name="rig_berline", extras=extras)
    wheels = [c for c in body.children if c.name.startswith("wheel_")]
    ys = [Vector(w.location).y for w in wheels]
    wb, front = (max(ys) - min(ys)), -min(ys)                 # l'avant vers -y dans la caisse
    poses = MO.sample(P3.hero_pos, frames, heading=P3.hero_heading, wheel_r=body.get("wheel_r", 0.31),
                      wheelbase=wb, front=front)
    MO.key_vehicle(rig, poses, wheels=wheels)
    MO.wheel_marks(wheels, body.get("wheel_r", 0.31))
    # les feux stop là où elle freine à plus de 2 m/s² (après les clés de la caisse)
    import hero_cars
    for first, last in P3.brake_windows():
        hero_cars.stop_lamps(body, first, last)
    # --- la troisième patrouille, ses deux faisceaux avec elle
    far = ob["patrol_a_c"]
    rig_c = MO.rig_up(far, P3.CHASE[2], name="rig_patrol_c",
                      extras=[o for o in ob if o.name.startswith("beam_c_")])
    wh, wr = MO.wheels_of(far), far.get("wheel_r", 0.36)
    MO.key_vehicle(rig_c, MO.sample(P3.chase_pos, frames, heading=lambda t: P3.CHASE[2], wheel_r=wr, seed=2.0,
                                    wheelbase=far.get("wheelbase", 2.9), front=far.get("front_axle")),
                   wheels=wh, pivot=(0.0, 0.0, 0.36))
    MO.wheel_marks(wh, wr, axis="Y")
    # --- les rampes : lueurs et faisceaux des deux voitures garées rangés sous elles, puis 2 Hz corail / lilas
    for tag, car in (("a", ob["patrol_a"]), ("b", ob["patrol_a_b"])):
        keep_world_parent([o for o in ob if o.name.startswith(f"beam_{tag}_")], car)
    n_bars = MO.flash_bars([ob["patrol_a"], ob["patrol_a_b"], rig_c], frames)
    # les faisceaux du barrage sur les façades devant lui, × BEAM_GAIN de loin : dès l'image 1, les murs battent
    # corail et lilas autour de la berline, avant que le barrage lui-même se lise au-dessus du toit
    gains = (("beam_a_", lambda f: 1.0 + (P3.BEAM_GAIN - 1.0) * (1.0 - MO.smoothstep(*P3.BEAM_FADE, f))),
             ("beam_b_", lambda f: 1.0 + (P3.BEAM_GAIN - 1.0) * (1.0 - MO.smoothstep(*P3.BEAM_FADE, f))))
    seen = set()
    for key, gain in gains:
        for o in [o for o in ob if o.type == "LIGHT" and key in o.name]:
            if o.data.name in seen:
                continue
            seen.add(o.data.name)
            for fc in MO.fcurves(o.data):
                for kp in fc.keyframe_points:
                    kp.co[1] *= gain(kp.co[0])
    # --- les tirs : flamme (trois maillages) et éclair ponctuel allumés une image, cachés sinon
    for k in P3.SHOTS:
        parts = [o for o in ob if o.name.startswith(f"muzzle_flash_{k}_")] + [ob[f"muzzle_{k}"]]
        for o in parts:
            for f in frames:
                o.hide_render = o.hide_viewport = not P3.firing(k, f)
                o.keyframe_insert("hide_render", frame=f)
                o.keyframe_insert("hide_viewport", frame=f)
    # --- la caméra : travelling suiveur, grue qui descend, freinage
    MO.key_camera(ob["cam"], frames, P3.camera)
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    scene.frame_set(P3.STILL_FRAME)
    st = poses[P3.STILL_FRAME - frames[0]]
    log(f"P3 animé : {P3.FRAMES} images, image fixe {P3.STILL_FRAME} (berline en ({st['x']:.2f}, {st['y']:.2f}), "
        f"cap {st['heading']:.1f}°) ; {poses[1]['speed'] * 3.6:.0f} puis {poses[-2]['speed'] * 3.6:.0f} km/h, roulis "
        f"max {max(abs(p['roll']) for p in poses):.1f}°, tangage max {max(abs(p['pitch']) for p in poses):.1f}°, "
        f"braquage {min(p['steer'] for p in poses):.1f} à {max(p['steer'] for p in poses):.1f}° ; {n_bars} lueurs "
        f"de rampe ; tirs {P3.SHOTS}")


ANIMATE = {"P3": plan_P3}


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
    build_street_end(hidden)
    build_furniture(M, hidden)
    build_sidewalk(hidden)
    build_foreground(hidden, plan)
    build_barrage(scene, hidden, plan)
    road_gloss()
    hidden.hide_render = True
    hidden.hide_viewport = True
    for c in bpy.data.collections:
        if c.name == "sources" or c.name.startswith("sources."):
            c.hide_render = True
    make_world(scene)
    # la brume d'après la pluie, plus dense au barrage : les phares et les gyrophares y prennent corps
    # (les boîtes sont de vraies brumes depuis que leurs normales sortent : quelques millièmes suffisent, la caméra
    # est dedans ; le sol devant elle reste un mouillé sombre, la brume ne se lit que dans la profondeur)
    haze("haze", -14, 14, Y0, 128.0, -0.1, 30, 0.0006)
    haze("haze_end", -60, 60, 128.0, Y_FAR + 2, -0.1, 30, 0.001)
    # au-delà du bout de la rue, sur l'eau et le pont : une brume légère qui étage les plans (le pylône plus pâle
    # que le carrefour) ; le fond de la boîte au-dessus de l'eau (lieux.haze)
    haze("haze_quai", -200, 200, vw(0.0, 1000.0)[1], Y0 - 0.5, -1.2, 90, 0.0005)
    # (jusqu'au haut de la brume générale : un bord de boîte dans le cadre se lirait comme une ligne)
    # (au-delà des agents seulement : rien entre la caméra et eux)
    haze("haze_barrage", -6.5, 6.5, 9.0, 34.0, -0.05, 30.0, 0.0015, aniso=0.55)
    # devant la berline, au ras du sol, une nappe plus dense qui diffuse vers l'avant : le halo des phares
    hx, hy = plan["hero"][:2]
    # (devant la berline seulement, elle l'emporte : ses faisceaux y prennent corps vers le barrage ; 0,004 et non
    # 0,02 : plus dense, ce halo posait un voile blanc sur la caisse, et le bordeaux devenait rose)
    haze("haze_lamps", hx - 2.5, hx + 2.5, hy - 2.4 - 8.0, hy - 2.0, -0.05, 2.6, 0.004, aniso=0.65, soft=True)

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
    co.rotation_euler = (math.radians(90.0), 0, math.radians(plan.get("yaw", 0.0)))
    focus = bpy.data.objects.new("focus", None)
    scene.collection.objects.link(focus)
    focus.location = plan["focus"]
    cam.dof.focus_object = focus
    scene.camera = co
    to_world(scene)
    A.render_settings(scene)
    # le halo du compositing : un peu plus fort que sur l'avenue, mais seulement sur les vraies sources (seuil 3) ;
    # à 0,22 et 0,75 au seuil de 1,2, les phares de face et les éclairs voilaient tout le centre du cadre
    for ng in bpy.data.node_groups:
        for nd in ng.nodes:
            if nd.type == "GLARE":
                try:
                    nd.inputs["Threshold"].default_value = 3.0
                    nd.inputs["Strength"].default_value = 0.14
                    nd.inputs["Size"].default_value = 0.65
                except Exception as e:
                    log(f"halo : {e!r}")
    ANIMATE[PLAN](scene)
    __import__("fx").dress(PLAN, scene)                     # les interactions (fx.py ; FILM3D_FX=0 les retire)

    out = os.path.join(ASSETS, BLEND)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    log(f"écrit {out} (plan {PLAN}, caméra à s = {co.location.y:.1f}, berline à s = {hero.matrix_world.translation.y:.1f}, "
        f"{len(bpy.data.objects)} objets, {len([o for o in bpy.data.objects if o.type == 'LIGHT'])} lumières)")


if __name__ == "__main__":
    build()
