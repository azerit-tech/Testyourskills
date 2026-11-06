# Le décor fixe de l'open space, modélisé et éclairé dans Blender (Cycles).
#
#   blender -b -P tools/bake/office.py -- [--size 2048] [--samples 256] [--preview] [--cpu]
#
# Construit, aux cotes de walkout.ts, tout ce qui ne bouge pas dans l'open
# space (sol, plafond, murs, baies, suspensions, îlots de bureaux et leurs
# fauteuils, lattes, tapis du dev), calcule sa lumière par groupe et écrit
# dans web/public/3d :
#   office.glb              la géométrie, un maillage par matière ; uv0 en
#                           mètres pour les matières, uv1 pour la lumière ;
#   office-lm-<groupe>.webp l'éclairement de chaque groupe, en niveaux de gris.
# Un groupe par lumière qui s'allume à son heure (les trois zones de néons, le
# poste du dev, la ville, le liseré du tier) : la scène les mélange en direct
# (web/src/three/baked.ts). Le poste du dev, le dev, sa chaise et les plantes
# restent en code (ils bougent ou changent par carte) ; ici des volumes
# invisibles, et les vraies plantes, leur font porter leurs ombres.
#
# Repère : on construit en coordonnées three.js (y en haut, l'ascenseur s'ouvre
# vers -z) puis on tourne le tout vers le z en haut de Blender ; l'export glTF
# retombe exactement sur les coordonnées three.js.
import argparse
import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--size", type=int, default=2048)
ap.add_argument("--samples", type=int, default=256)
ap.add_argument("--preview", action="store_true", help="petit calcul rapide pour la mise au point")
ap.add_argument("--out", default=None)
ap.add_argument("--cpu", action="store_true", help="calcul sur le processeur (si Metal est indisponible)")
args = ap.parse_args(argv)
if args.preview:
    args.size, args.samples = 512, 48

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "web", "public", "3d")
OUT = args.out or ASSETS

# ---------- les cotes de walkout.ts (mètres) ----------
ROOM_W = 22.0
WIN_Z = -14.0
CEIL = 3.3
DESK_Z = -7.8
DOOR_W = 1.0
DOOR_H = 2.1
ROWS = 8
ROW_Z = [-1.2 - r * 1.6 for r in range(ROWS)]
ROW_X = (-5.2, 5.2)
# les suspensions : profil alu de 2,5 m, diffuseur dessous, éclairage indirect dessus
PENDANT = {"w": 2.5, "h": 0.05, "d": 0.075, "y": CEIL - 0.32}
# les trois zones de néons qui s'allument l'une après l'autre (rangées 0-2, 3-5, 6-7)
ZONE_OF_ROW = [0, 0, 0, 1, 1, 1, 2, 2]
# les plantes de walkout.ts : (x, z, hauteur, rotation)
PLANTS = [(-2.25, DESK_Z - 1.3, 1.65, 0.35), (3.1, DESK_Z - 3.0, 1.3, 2.4)]


def rnd(i, s):
    x = math.sin(i * 127.1 + s * 311.7) * 43758.5453
    return x - math.floor(x)


# ---------- la scène ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "NONE" if args.cpu else "METAL"
prefs.get_devices()
for d in prefs.devices:
    d.use = True
scene.cycles.device = "CPU" if args.cpu else "GPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 5
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 1
scene.cycles.transmission_bounces = 2
scene.cycles.transparent_max_bounces = 8
scene.cycles.sample_clamp_indirect = 6.0
scene.world = bpy.data.worlds.new("nuit")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0

# three.js (x, y, z) -> Blender (x, -z, y)
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def srgb(hex_):
    c = [((hex_ >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def material(name, rgb, rough=0.8):
    # pas de métal ici : le précalcul ne garde que la lumière diffuse
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m


# Albédos de la lumière renvoyée ; ce sont aussi les couleurs que la scène
# donne à ses matières (walkout.ts), à reporter si on les change.
COLORS = {
    "floor": 0x3A3F45,  # moquette en dalles, gris bleu
    "ceiling": 0xC9C5BE,  # plafond blanc cassé
    "wall": 0x8C877F,  # murs gris chaud
    "fixture": 0x23262A,  # profils des suspensions, aluminium anodisé noir
    "steel": 0x9AA1A8,
    "mullion": 0x2A2E33,
    "deskTop": 0xB89A78,  # plateaux en chêne clair
    "metal": 0x1C1F23,  # piètements et vérins, métal noir mat
    "fabric": 0x2E3436,  # assises et dossiers, tissu anthracite
    "panel": 0x51625E,  # cloisons acoustiques, feutre vert de gris
    "screen": 0x15181C,  # coques des écrans, claviers
    "paper": 0xD9D6CF,
    "oak": 0x79563C,
    "rug": 0x3B4140,
    "chairs": 0x1E2124,  # cuir noir et alu
}
MATS = {k: material(k, srgb(v), 0.8) for k, v in COLORS.items()}
PROXY = material("proxy", (0.08, 0.08, 0.08), 0.8)

# ---------- la géométrie, par matière ----------
FACES = {"px": Vector((1, 0, 0)), "nx": Vector((-1, 0, 0)), "py": Vector((0, 1, 0)), "ny": Vector((0, -1, 0)), "pz": Vector((0, 0, 1)), "nz": Vector((0, 0, -1))}
meshes = {}


def three_matrix(x, y, z, rx=0.0, ry=0.0, rz=0.0):
    return Matrix.Translation((x, y, z)) @ Euler((rx, ry, rz), "XYZ").to_matrix().to_4x4()


def put(name, tmp, matrix):
    tmp.transform(matrix)
    me = bpy.data.meshes.new("tmp")
    tmp.to_mesh(me)
    tmp.free()
    meshes.setdefault(name, bmesh.new()).from_mesh(me)
    bpy.data.meshes.remove(me)


def load_model(path, faces=None):
    """Un modèle glTF de web/public/3d, en bmesh dans le repère three.js ; `faces` : allégé à ce nombre de faces."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    ob = next(o for o in new if o.type == "MESH")
    if faces and len(ob.data.polygons) > faces:
        mod = ob.modifiers.new("decimate", "DECIMATE")
        mod.ratio = faces / len(ob.data.polygons)
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    bm.from_object(ob, dg)
    bm.transform(TO_BLENDER.inverted() @ ob.matrix_world)
    for o in new:
        bpy.data.objects.remove(o)
    return bm


def instance(name, src, matrix):
    tmp = src.copy()
    put(name, tmp, matrix)


def box(name, w, h, d, x=0.0, y=0.0, z=0.0, ry=0.0, rx=0.0, rz=0.0, drop=(), bevel=0.0, frame=None):
    """Une boîte de w × h × d (repère three.js) ; `drop` : faces jamais vues
    (px, nx, py, ...) ; `bevel` : arêtes arrondies (m) ; `frame` : repère parent."""
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    if drop:
        dead = [f for f in tmp.faces if any(f.normal.dot(FACES[k]) > 0.9 for k in drop)]
        bmesh.ops.delete(tmp, geom=dead, context="FACES")
    tmp.transform(Matrix.Diagonal((w, h, d, 1)))
    if bevel > 0:
        bmesh.ops.bevel(tmp, geom=tmp.edges[:], offset=min(bevel, w / 2.2, h / 2.2, d / 2.2), segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    m = three_matrix(x, y, z, rx, ry, rz)
    put(name, tmp, frame @ m if frame is not None else m)


def cylinder(name, r_top, r_bot, h, x=0.0, y=0.0, z=0.0, seg=16, rx=0.0, ry=0.0, rz=0.0, frame=None):
    """Un cylindre (ou tronc de cône) le long de y."""
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=seg, radius1=r_bot, radius2=r_top, depth=h)
    tmp.transform(Matrix.Rotation(-math.pi / 2, 4, "X"))
    m = three_matrix(x, y, z, rx, ry, rz)
    put(name, tmp, frame @ m if frame is not None else m)


def ellipsoid(name, sx, sy, sz, m):
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=14, v_segments=9, radius=1.0)
    put(name, tmp, m @ Matrix.Diagonal((sx, sy, sz, 1)))


def plane(name, w, d, x, y, z, up=True):
    """Un plan horizontal w (x) × d (z), tourné vers le haut ou vers le bas."""
    tmp = bmesh.new()
    vs = [tmp.verts.new((x + a * w / 2, y, z + b * d / 2)) for a, b in ((-1, 1), (1, 1), (1, -1), (-1, -1))]
    tmp.faces.new(vs if up else vs[::-1])
    put(name, tmp, Matrix())


# ---------- l'architecture ----------
plane("floor", ROOM_W, -WIN_Z, 0, 0, WIN_Z / 2, up=True)
plane("ceiling", ROOM_W, -WIN_Z, 0, CEIL, WIN_Z / 2, up=False)
for sx in (-1, 1):
    box("wall", 0.1, CEIL, -WIN_Z, sx * ROOM_W / 2, CEIL / 2, WIN_Z / 2, drop=("px" if sx > 0 else "nx", "py", "ny"))
# le mur de l'ascenseur, percé à la taille des portes (sa face côté cabine ne se voit pas)
side_w = (ROOM_W - DOOR_W) / 2
box("wall", side_w, CEIL, 0.1, -(ROOM_W + DOOR_W) / 4, CEIL / 2, -0.25, drop=("pz", "py", "ny", "nx"))
box("wall", side_w, CEIL, 0.1, (ROOM_W + DOOR_W) / 4, CEIL / 2, -0.25, drop=("pz", "py", "ny", "px"))
box("wall", DOOR_W, CEIL - DOOR_H, 0.1, 0, (CEIL + DOOR_H) / 2, -0.25, drop=("pz", "py"))
for sx in (-1, 1):
    box("steel", 0.03, DOOR_H, 0.2, sx * (DOOR_W / 2 + 0.015), DOOR_H / 2, -0.2, drop=("ny",))
box("steel", DOOR_W + 0.06, 0.03, 0.2, 0, DOOR_H + 0.015, -0.2)
# plinthes
for sx in (-1, 1):
    box("metal", 0.012, 0.08, -WIN_Z, sx * (ROOM_W / 2 - 0.056), 0.04, WIN_Z / 2, drop=("ny",))
# les baies : montants, allège, imposte (le verre et la ville restent en code)
x = -ROOM_W / 2
while x <= ROOM_W / 2 + 0.01:
    box("mullion", 0.06, CEIL, 0.12, x, CEIL / 2, WIN_Z, drop=("nz",), bevel=0.004)
    x += 2.2
box("mullion", ROOM_W, 0.35, 0.14, 0, 0.175, WIN_Z, drop=("nz", "ny"))
box("mullion", ROOM_W, 0.05, 0.1, 0, 0.375, WIN_Z + 0.02, drop=("nz",))
box("wall", ROOM_W, 0.25, 0.3, 0, CEIL - 0.125, WIN_Z + 0.1, drop=("py", "nz"))

# ---------- les suspensions ----------
P = PENDANT


def pendant(x, z, w=P["w"], d=P["d"], y=P["y"]):
    box("fixture", w, P["h"], d, x, y, z, bevel=0.006)
    for e in (-1, 1):
        box("fixture", 0.004, P["h"] + 0.002, d + 0.002, x + e * (w / 2 - 0.002), y, z)
        box("metal", 0.003, CEIL - y - P["h"] / 2, 0.003, x + e * (w / 2 - 0.25), (CEIL + y + P["h"] / 2) / 2, z, drop=("py", "ny"))
    cylinder("fixture", 0.03, 0.03, 0.008, x - w / 2 + 0.25, CEIL - 0.004, z, seg=12)
    cylinder("fixture", 0.03, 0.03, 0.008, x + w / 2 - 0.25, CEIL - 0.004, z, seg=12)


for z in ROW_Z:
    for lx in ROW_X:
        pendant(lx, z)
pendant(0, DESK_Z - 0.5, w=2.8, d=0.12, y=2.75)

# ---------- les îlots de bureaux (mêmes tirages que walkout.ts) ----------
desk_spots = []
for zc, row in ((-4.4, 1), (-11.2, 5)):
    for dx in (-7.2, -5.3, -3.4, 3.4, 5.3, 7.2):
        desk_spots.append((dx, zc + 0.42, 1, row, zc))
        desk_spots.append((dx, zc - 0.42, -1, row + 1, zc))


# le fauteuil de travail (Sketchfab, CC BY ; tools/bake/prepare.py), allégé pour les postes du fond
CHAIR = os.path.join(ASSETS, "chair.glb")
chair_lo = load_model(CHAIR, faces=2500)

for i, (dx, dz, face, _row, zc) in enumerate(desk_spots):
    # le plateau, son piètement en T et le chant
    box("deskTop", 1.5, 0.028, 0.8, dx, 0.746, dz, bevel=0.004)
    for lx in (-0.68, 0.68):
        box("metal", 0.05, 0.69, 0.05, dx + lx, 0.375, dz, bevel=0.004)
        box("metal", 0.06, 0.025, 0.72, dx + lx, 0.0125, dz, bevel=0.006, drop=("ny",))
        box("metal", 0.05, 0.03, 0.66, dx + lx, 0.715, dz)
    box("metal", 1.3, 0.05, 0.025, dx, 0.7, dz - face * 0.3)
    # l'écran sur pied, le clavier, la souris
    sz = dz - face * 0.25
    box("screen", 0.62, 0.37, 0.022, dx, 1.12, sz, bevel=0.004)
    box("screen", 0.2, 0.12, 0.03, dx, 1.12, sz - face * 0.02, bevel=0.01)
    box("metal", 0.035, 0.27, 0.02, dx, 0.9, sz - face * 0.035, bevel=0.004)
    box("metal", 0.22, 0.012, 0.16, dx, 0.766, sz - face * 0.04, bevel=0.004)
    kx = dx + (rnd(i, 7) - 0.5) * 0.12
    box("screen", 0.42, 0.014, 0.13, kx, 0.767, dz + face * 0.15, ry=(rnd(i, 8) - 0.5) * 0.08, bevel=0.004)
    box("screen", 0.06, 0.022, 0.1, kx + 0.3, 0.771, dz + face * 0.16, bevel=0.01)
    # de quoi faire vivre les postes : papiers, une tasse ici et là
    if rnd(i, 9) > 0.45:
        box("paper", 0.21, 0.012 + rnd(i, 10) * 0.02, 0.297, dx - 0.5, 0.767, dz + face * 0.05, ry=(rnd(i, 11) - 0.5) * 0.5)
    if rnd(i, 12) > 0.55:
        cylinder("paper", 0.04, 0.036, 0.1, dx + 0.55, 0.81, dz + face * 0.1, seg=14)
    # le fauteuil, tiré plus ou moins loin, un peu tourné
    jx = (rnd(i, 3) - 0.5) * 0.2
    jr = (rnd(i, 4) - 0.5) * 0.5
    instance("chairs", chair_lo, three_matrix(dx + jx, 0, dz + face * 0.7, ry=jr + (0 if face > 0 else math.pi)))
# les cloisons acoustiques entre les postes face à face
for zc in (-4.4, -11.2):
    for dx in (-7.2, -5.3, -3.4, 3.4, 5.3, 7.2):
        box("panel", 1.48, 0.42, 0.025, dx, 0.97, zc, bevel=0.01)
        for e in (-0.6, 0.6):
            box("metal", 0.02, 0.06, 0.03, dx + e, 0.76, zc)

# l'alcôve en lattes de bois devant les baies
for sx in (-1, 1):
    for i in range(12):
        box("oak", 0.045, CEIL - 0.25, 0.1, sx * (2.75 + i * 0.1), (CEIL - 0.25) / 2, WIN_Z + 0.18, drop=("py", "ny"))

# le tapis du poste du dev (workstation.ts, groupe tourné de 180° en DESK_Z)
box("rug", 3.5, 0.018, 2.65, 0, 0.012, DESK_Z - 0.24, drop=("ny",), bevel=0.005)

# ---------- volumes invisibles : ce qui reste en code mais porte une ombre ----------
# (repère du poste : local (x, y, z) -> monde (-x, y, DESK_Z - z))
Y0 = 0.02


def ws(x, y, z):
    return -x, y, DESK_Z - z


def pbox(w, h, d, lx, ly, lz, rx=0.0):
    box("proxy", w, h, d, *ws(lx, ly, lz), rx=-rx)


# le plateau est réglé à hauteur debout : 1,06 m au lieu de 77 cm (workstation.ts, LIFT)
LIFT = 1.06 - 0.7725
pbox(2.45, 0.065, 0.9, 0, Y0 + 0.74 + LIFT, 0.75)  # plateau
for lx in (-1.04, 1.04):
    pbox(0.055, 0.7 + LIFT, 0.055, lx, Y0 + (0.7 + LIFT) / 2, 0.46)
    pbox(0.055, 0.7 + LIFT, 0.055, lx, Y0 + (0.7 + LIFT) / 2, 1.04)
    pbox(0.065, 0.045, 0.68, lx, Y0 + 0.045, 0.75)
pbox(2.08, 0.065, 0.045, 0, Y0 + 0.65 + LIFT, 1.04)
for mx, mz, w, h in ((0, 1.0, 0.79, 0.445), (-0.71, 0.88, 0.57, 0.34), (0.71, 0.88, 0.57, 0.34)):
    pbox(w + 0.025, h + 0.025, 0.025, mx, Y0 + 1.14 + LIFT, mz)
    pbox(0.04, 0.24, 0.03, mx, Y0 + 0.88 + LIFT, mz + 0.03)
    pbox(0.22, 0.012, 0.14, mx, Y0 + 0.765 + LIFT, mz + 0.02)
pbox(0.44, 0.018, 0.15, 0.02, Y0 + 0.791 + LIFT, 0.5)  # clavier
pbox(0.17, 0.018, 0.17, 1.03, Y0 + 0.79 + LIFT, 0.88)  # lampe
pbox(0.018, 0.52, 0.018, 1.03, Y0 + 1.05 + LIFT, 0.88)
pbox(0.32, 0.03, 0.09, 0.9, Y0 + 1.31 + LIFT, 0.88)
cylinder("proxy", 0.04, 0.036, 0.1, *ws(-0.76, Y0 + 0.823 + LIFT, 0.5), seg=12)  # tasse
# le fauteuil (le même modèle, complet), repoussé sur la droite du dev, et le dev debout, de dos
put("proxy", load_model(CHAIR), three_matrix(*ws(-1.05, Y0, -0.3), ry=-0.7))
pbox(0.4, 0.6, 0.26, 0, Y0 + 1.2, 0.1)  # buste
ellipsoid("proxy", 0.09, 0.12, 0.1, Matrix.Translation(ws(0, Y0 + 1.66, 0.12)))  # tête
for sx in (-1, 1):
    pbox(0.15, 0.9, 0.16, sx * 0.11, Y0 + 0.47, 0.12)  # jambes
    pbox(0.08, 0.08, 0.3, sx * 0.22, Y0 + 1.12, 0.3)  # bras vers le clavier

# ---------- objets Blender ----------
objects = {}
for name, bm in meshes.items():
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.clear()
    me.materials.append(PROXY if name == "proxy" else MATS[name])
    ob.matrix_world = TO_BLENDER
    objects[name] = ob
bpy.ops.object.select_all(action="DESELECT")
for ob in objects.values():
    ob.select_set(True)
bpy.context.view_layer.objects.active = objects["floor"]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
for ob in objects.values():
    # boîtes à facettes ; le fauteuil, lissé (sinon chaque coin de face devient un sommet)
    for poly in ob.data.polygons:
        poly.use_smooth = ob.name in ("chairs", "proxy")

# les vraies plantes (Poly Haven), pour leurs ombres feuille à feuille
plant_path = os.path.join(ASSETS, "plant-v2.glb")
if os.path.exists(plant_path):
    for px, pz, height, rot in PLANTS:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=plant_path)
        new = [o for o in bpy.data.objects if o not in before]
        roots = [o for o in new if o.parent is None]
        bpy.context.view_layer.update()
        zs = [(o.matrix_world @ Vector(c)).z for o in new if o.type == "MESH" for c in o.bound_box]
        s = height / (max(zs) - min(zs))
        for r in roots:
            r.matrix_world = Matrix.Translation(TO_BLENDER @ Vector((px, -min(zs) * s, pz))) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Scale(s, 4) @ r.matrix_world
        for o in new:
            o.select_set(False)
else:
    print("[bake] plant-v2.glb absent : les plantes ne portent pas d'ombre", flush=True)

# les fauteuils gardent leurs uv (texture) et reçoivent leur lumière par sommet :
# en îles d'atlas, leurs centaines de petites faces gaspilleraient la texture
VERTEX_LIT = [objects["chairs"]]
exported = [ob for n, ob in objects.items() if n != "proxy"]
atlas = [ob for ob in exported if ob not in VERTEX_LIT]

# uv0 : coordonnées en mètres (projection par face), pour les matières en tuile de la scène
for ob in atlas:
    me = ob.data
    uv0 = me.uv_layers.new(name="uv")
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv0.data[li].uv = (co.x, co.y) if ax == 2 else (co.y, co.z) if ax == 0 else (co.x, co.z)

# uv1 : l'atlas de lumière, une seule texture pour tout le décor. Dépliage
# automatique (les arêtes arrondies suivent leur face), puis chaque île est
# remise à sa taille réelle en mètres, pondérée par matière (le plafond, vu de
# loin, en a moins ; le tapis et les bureaux, vus de près, plus), et tout est
# rangé ensemble.
DENSITY = {"floor": 1.0, "ceiling": 0.5, "wall": 0.6, "fixture": 0.6, "steel": 0.6, "mullion": 0.5, "deskTop": 1.4, "metal": 0.8, "fabric": 1.1, "panel": 1.0, "screen": 0.9, "paper": 0.8, "oak": 0.7, "rug": 1.8}
for ob in atlas:
    ob.data.uv_layers.new(name="lightmap")
    ob.data.uv_layers.active = ob.data.uv_layers["lightmap"]
bpy.ops.object.select_all(action="DESELECT")
for ob in atlas:
    ob.select_set(True)
bpy.context.view_layer.objects.active = atlas[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode="OBJECT")


def island_scale(ob, k):
    """Remet chaque île de l'atlas à l'échelle de sa surface réelle (m), × k."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.loops.layers.uv["lightmap"]
    bm.faces.ensure_lookup_table()
    parent = list(range(len(bm.faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def same_uv(e):
        # l'arête est continue dans l'atlas : mêmes coordonnées des deux côtés
        f0, f1 = e.link_faces
        uv = {}
        for f in (f0, f1):
            for loop in f.loops:
                if loop.vert in e.verts:
                    uv.setdefault(f.index, {})[loop.vert.index] = loop[layer].uv.copy()
        a, b = uv[f0.index], uv[f1.index]
        return all((a[v] - b[v]).length < 1e-6 for v in a)

    for e in bm.edges:
        if len(e.link_faces) == 2 and same_uv(e):
            parent[find(e.link_faces[0].index)] = find(e.link_faces[1].index)
    groups = {}
    for f in bm.faces:
        groups.setdefault(find(f.index), []).append(f)
    for faces in groups.values():
        area3 = sum(f.calc_area() for f in faces)
        areauv = 0.0
        cen = Vector((0, 0))
        n = 0
        for f in faces:
            uvs = [l[layer].uv for l in f.loops]
            for j in range(1, len(uvs) - 1):
                areauv += abs((uvs[j] - uvs[0]).cross(uvs[j + 1] - uvs[0])) / 2
            for u in uvs:
                cen += u
                n += 1
        if areauv < 1e-12 or area3 < 1e-12:
            continue
        cen /= n
        s = math.sqrt(area3 / areauv) * k
        for f in faces:
            for l in f.loops:
                l[layer].uv = cen + (l[layer].uv - cen) * s
    bm.to_mesh(me)
    bm.free()


for ob in atlas:
    island_scale(ob, DENSITY[ob.name])
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, scale=True, margin_method="FRACTION", margin=3 / args.size, shape_method="CONCAVE")
bpy.ops.object.mode_set(mode="OBJECT")

# ---------- les lumières, par groupe ----------
GROUPS = ["z0", "z1", "z2", "hero", "city", "accent"]
lights = {g: [] for g in GROUPS}
BASIS = TO_BLENDER.to_3x3()


def add_light(group, kind, pos, aim, power, size=(0.1, 0.1), spot=None, length_axis=None, color=(1, 1, 1)):
    """Une lumière dans le repère three.js : `aim` est la direction d'émission ;
    `length_axis` (three.js) oriente le côté `size[1]` d'une lumière rectangulaire."""
    data = bpy.data.lights.new(f"{group}-{len(lights[group])}", kind)
    data.energy = power
    data.color = color
    if kind == "AREA":
        data.shape = "RECTANGLE"
        data.size, data.size_y = size
    elif kind == "SPOT":
        data.spot_size, data.spot_blend = spot
        data.shadow_soft_size = 0.06
    else:
        data.shadow_soft_size = size[0]
    ob = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(ob)
    ob.location = TO_BLENDER @ Vector(pos)
    z = -(BASIS @ Vector(aim)).normalized()  # une lumière Blender émet le long de son -z local
    if length_axis is None:
        ob.rotation_euler = z.to_track_quat("Z", "Y").to_euler()
    else:
        y = (BASIS @ Vector(length_axis)).normalized()
        ob.rotation_euler = Matrix((y.cross(z), y, z)).transposed().to_euler()
    lights[group].append(ob)
    return ob


def pendant_light(group, x, z, w, d, y, down, up):
    """Diffuseur vers le bas et éclairage indirect vers le plafond, en deux sources."""
    add_light(group, "AREA", (x, y - P["h"] / 2 - 0.002, z), (0, -1, 0), down, (w - 0.1, d * 0.7), length_axis=(0, 0, 1))
    add_light(group, "AREA", (x, y + P["h"] / 2 + 0.002, z), (0, 1, 0), up, (w - 0.1, d * 0.7), length_axis=(0, 0, 1))


# les néons : chaque suspension dans la zone de sa rangée
for r, z in enumerate(ROW_Z):
    for lx in ROW_X:
        pendant_light(f"z{ZONE_OF_ROW[r]}", lx, z, P["w"], P["d"], P["y"], 120, 28)
# les écrans en veille des autres postes, dans la zone de leur rangée
for dx, dz, face, row, _zc in desk_spots:
    if face == 1:
        add_light(f"z{ZONE_OF_ROW[row]}", "AREA", (dx, 1.12, dz - 0.25 + 0.016), (0, -0.2, 1), 2.0, (0.58, 0.33), color=(0.75, 0.85, 1.0))

# le poste du dev : la suspension au-dessus, le projecteur chaud, la lampe de bureau,
# et la lumière de la cabine qui sort par les portes ouvertes
pendant_light("hero", 0, DESK_Z - 0.5, 2.8, 0.12, 2.75, 110, 40)
spot_pos = Vector((-1.8, CEIL - 0.1, DESK_Z + 1.8))
add_light("hero", "SPOT", spot_pos, Vector((0, 0.6, DESK_Z)) - spot_pos, 220, spot=(2 * 0.72, 0.85))
add_light("hero", "POINT", ws(0.87, Y0 + 1.24 + LIFT, 0.78), (0, -1, 0), 8, (0.04, 0.04))
add_light("hero", "AREA", (0, 1.1, -0.04), (0, 0, -1), 60, (0.95, 2.0))

# la ville : la nuit qui entre par les baies, le contre-jour bleuté sur le
# poste, et les trois écrans du dev
add_light("city", "AREA", (0, (CEIL - 0.25) / 2, WIN_Z + 0.06), (0, -0.1, 1), 220, (ROOM_W, CEIL - 0.3))
win_pos = Vector((2.5, 2.8, DESK_Z - 2.4))
add_light("city", "SPOT", win_pos, Vector((0, 0.9, DESK_Z)) - win_pos, 90, spot=(2 * 0.85, 0.9))
for mx, mz, w, h in ((0, 1.0, 0.79, 0.445), (-0.71, 0.88, 0.57, 0.34), (0.71, 0.88, 0.57, 0.34)):
    add_light("city", "AREA", ws(mx, Y0 + 1.14 + LIFT, mz - 0.03), (0, 0, 1), 4, (w, h))

# le liseré du tier au pied des murs et les plots de l'allée
for sx in (-1, 1):
    add_light("accent", "AREA", (sx * (ROOM_W / 2 - 0.07), 0.06, WIN_Z / 2), (-sx, 0, 0), 25, (0.025, -WIN_Z), length_axis=(0, 0, 1))
PATH_N = 12
for i in range(PATH_N):
    for sx in (-1, 1):
        add_light("accent", "AREA", (sx * 1.38, 0.014, -0.5 - i / (PATH_N - 1) * (-DESK_Z - 2.3)), (0, 1, 0), 0.5, (0.025, 0.12), length_axis=(0, 0, 1))

# ---------- le précalcul ----------
SIZE = args.size
img = bpy.data.images.new("lm", SIZE, SIZE, alpha=False, float_buffer=True)
img.colorspace_settings.name = "Non-Color"
for m in [MATS[ob.name] for ob in atlas]:
    node = m.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    m.node_tree.nodes.active = node

for ob in VERTEX_LIT:
    # les couleurs de sommet d'origine du modèle prendraient la place de COLOR_0
    for a in list(ob.data.color_attributes):
        ob.data.color_attributes.remove(a)
    ob.data.color_attributes.new("bake", "FLOAT_COLOR", "POINT")
    ob.data.color_attributes.active_color = ob.data.color_attributes["bake"]
vertex_light = {ob.name: {} for ob in VERTEX_LIT}


def select(obs):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]


bake = scene.render.bake
bake.margin = 6
bake.margin_type = "EXTEND"
bake.use_pass_direct = True
bake.use_pass_indirect = True
bake.use_pass_color = False

os.makedirs(OUT, exist_ok=True)
meta = {"size": SIZE, "groups": {}}
for g in GROUPS:
    for gg, obs in lights.items():
        for ob in obs:
            ob.hide_render = gg != g
    t = time.time()
    select(atlas)
    bake.target = "IMAGE_TEXTURES"
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=6)
    px = np.empty(SIZE * SIZE * 4, np.float32)
    img.pixels.foreach_get(px)
    lum = px.reshape(SIZE, SIZE, 4)[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # Cycles donne la lumière diffuse sortante pour un albédo de 1 : E / π.
    # Échelle par groupe : le 99,8e centile tient sur 8 bits, les points chauds saturent.
    lit = lum[lum > 0]
    scale = float(np.percentile(lit, 99.8)) if lit.size else 1.0
    enc = np.clip(lum / scale, 0, 1)
    enc = np.where(enc <= 0.0031308, enc * 12.92, 1.055 * np.power(enc, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(f"lm-{g}", SIZE, SIZE, alpha=False, float_buffer=False)
    out.colorspace_settings.name = "Non-Color"
    rgba = np.ones((SIZE, SIZE, 4), np.float32)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = enc
    out.pixels.foreach_set(rgba.ravel())
    out.file_format = "WEBP"
    # l'éclairement est très lisse : 75 suffit sans bandes ni blocs (4 fois plus léger que 90)
    out.save(filepath=os.path.join(OUT, f"office-lm-{g}.webp"), quality=75)
    # three.js : lumière diffuse = irradiance × albédo / π, et on stocke E / π
    meta["groups"][g] = {"scale": scale * math.pi}
    # les objets éclairés par sommet, à la même échelle
    select(VERTEX_LIT)
    bake.target = "VERTEX_COLORS"
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True)
    for ob in VERTEX_LIT:
        col = np.empty(len(ob.data.vertices) * 4, np.float32)
        ob.data.color_attributes["bake"].data.foreach_get("color", col)
        vertex_light[ob.name][g] = (col.reshape(-1, 4)[:, :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)) / scale
    print(f"[bake] {g}: {time.time() - t:.1f} s, échelle {scale:.4g}", flush=True)

# ---------- l'export ----------
for ob in atlas:
    ob.data.uv_layers.active = ob.data.uv_layers["uv"]
    ob.data.uv_layers["uv"].active_render = True
# la lumière par sommet, en attributs standard que gltfpack garde : COLOR_0 =
# z0 z1 z2 hero (8 bits, stockée à moitié pour garder de la marge au-dessus de
# 1, ×2 dans la scène), TEXCOORD_1 = city accent (flottants). L'export glTF de
# Blender n'écrit juste qu'un seul jeu de couleurs, désigné par son nom.
for ob in VERTEX_LIT:
    me = ob.data
    me.color_attributes.remove(me.color_attributes["bake"])
    a = me.color_attributes.new("lm_a", "FLOAT_COLOR", "POINT")
    a.data.foreach_set("color", np.clip(np.stack([vertex_light[ob.name][g] * 0.5 for g in GROUPS[:4]], 1), 0, 1).astype(np.float32).ravel())
    uv = me.uv_layers.new(name="lm_b")
    per_vertex = np.stack([vertex_light[ob.name]["city"], vertex_light[ob.name]["accent"]], 1)
    loops = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", loops)
    vals = per_vertex[loops].copy()
    vals[:, 1] = 1 - vals[:, 1]  # l'export retourne v
    uv.data.foreach_set("uv", vals.astype(np.float32).ravel())
scene["lightmap"] = json.dumps(meta)
bpy.ops.object.select_all(action="DESELECT")
for ob in exported:
    ob.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "office.glb"),
    export_format="GLB",
    use_selection=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="PLACEHOLDER",
    export_extras=True,
    export_yup=True,
    export_apply=True,
    export_vertex_color="NAME",
    export_vertex_color_name="lm_a",
    export_all_vertex_colors=False,
    export_active_vertex_color_when_no_material=True,
    export_lights=False,
    export_cameras=False,
)
# quantification et compression meshopt (gltfpack, en devDependency) ; uv en
# flottants : la scène remplace les matières, qui porteraient leur déquantification
GLTFPACK = os.path.join(ROOT, "node_modules", ".bin", "gltfpack")
if os.path.exists(GLTFPACK):
    import subprocess

    src = os.path.join(OUT, "office.glb")
    subprocess.run([GLTFPACK, "-i", src, "-o", src, "-cc", "-kn", "-km", "-ke", "-kv", "-vtf"], check=True)
else:
    print("[bake] gltfpack absent (npm i -D gltfpack) : office.glb non compressé", flush=True)
if args.out:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "office-bake.blend"))
print("[bake] terminé :", json.dumps(meta), flush=True)
