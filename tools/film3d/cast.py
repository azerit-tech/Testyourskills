# La distribution du film : personnes, véhicules du sommet, plots, habitacle du coupé.
#
#   lockf -k <verrou> nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     --factory-startup -P tools/film3d/cast.py
#
# Lit les assets de Azerit/design/film/assets (python3 tools/film3d/fetch.py), écrit
# Azerit/design/film/assets/cast.blend. Chaque famille est dans sa collection, posée à sa
# place sur un plateau (repère : z en haut, l'avant des véhicules vers -y) :
#   cast_interior  le coupé, son rétroviseur intérieur, le conducteur assis mains au volant,
#                  une patrouille gyrophare allumé à 22 m derrière (vue dans le rétroviseur)
#   cast_people    le conducteur mains levées, les agents (visée debout, accroupi derrière une
#                  portière ouverte, garde), arme de poing en main
#   cast_vehicles  la patrouille (échelle), le fourgon, l'hélicoptère, l'avion, les plots
# Les rendus des planches : cast_render.py. Les personnes et les véhicules viennent des modules
# du laboratoire (lab/cast_people.py, lab/cast_vehicles.py) ; leur assemblage ici n'a pas encore été
# rendu (rendus suspendus le 11 novembre, machine trop chargée) : à vérifier au premier passage.
import importlib
import math
import os
import subprocess
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(HERE, "lab"))


def main_checkout():
    try:
        common = subprocess.run(["git", "-C", ROOT, "rev-parse", "--git-common-dir"], capture_output=True, text=True, check=True).stdout.strip()
        return os.path.dirname(os.path.abspath(os.path.join(ROOT, common)))
    except Exception:
        return ROOT


ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(os.path.dirname(main_checkout()), "design", "film", "assets")
os.environ["FILM3D_ASSETS"] = ASSETS

CORAL = "#ff6a3d"
LILAC = "#8d8cf0"
CREAM = "#fff9cb"

# Le plateau : chaque famille à sa place
INTERIOR_AT = Vector((0.0, 0.0, 0.0))
PEOPLE_AT = Vector((-40.0, 0.0, 0.0))
VEHICLES_AT = Vector((60.0, 0.0, 0.0))

# Repères du coupé, dans le repère d'origine du modèle (avant vers -y, conduite à gauche, +x)
WHEEL_CENTER = Vector((0.44, 0.275, 0.83))   # centre de la jante du volant
MIRROR_AT = Vector((0.0, 0.33, 1.17))        # rétroviseur intérieur, sous le haut du pare-brise


def lin(hexcolor, a=1.0):
    h = hexcolor.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


# ---------------------------------------------------------------- outils

def collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def move_to(objs, col):
    for o in objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)


def import_glb(path):
    """Importe un glTF, aplatit la hiérarchie, applique les transformations ; rend les maillages."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return meshes


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    return ob


def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector(map(min, *pts)), Vector(map(max, *pts))


def material(name, color, rough=0.5, metal=0.0, emit=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    if emit:
        p.inputs["Emission Color"].default_value = color
        p.inputs["Emission Strength"].default_value = emit
    return m


def glass(name, tint=(1, 1, 1, 1), rough=0.02):
    m = material(name, tint, rough)
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Transmission Weight"].default_value = 1.0
    p.inputs["IOR"].default_value = 1.5
    return m


def add_light(name, kind, loc, color, energy, target=None, size=0.1, spot=60.0, col=None):
    L = bpy.data.lights.new(name, kind)
    L.energy = energy
    L.color = lin(color)[:3] if isinstance(color, str) else color
    L.shadow_soft_size = size
    if kind == "SPOT":
        L.spot_size = math.radians(spot)
        L.spot_blend = 0.5
    if kind == "AREA":
        L.size = size
    ob = bpy.data.objects.new(name, L)
    (col or bpy.context.scene.collection).objects.link(ob)
    ob.location = loc
    if target is not None:
        look_at(ob, target)
    return ob


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------- l'habitacle

def build_coupe(col):
    """Le coupé tel quel, carrosserie prune, habitacle d'origine assombri, sans sphère d'environnement."""
    parts = import_glb(os.path.join(ASSETS, "coupe-hd.glb"))
    paint = material("cast_coupe_paint", lin("#4b2f54"), 0.32, 0.85, coat=0.45)
    windscreen = glass("cast_windscreen", (0.85, 0.82, 0.88, 1))
    side = glass("cast_side_glass", (0.35, 0.33, 0.38, 1))
    # l'écran central d'origine montre des icônes d'applications réelles : écran éteint, à peine bleuté
    screen = material("cast_dead_screen", (0.004, 0.005, 0.008, 1), 0.08, emit=0.0)
    keep = []
    for o in parts:
        n = o.name
        if n.startswith("Icosphere"):
            bpy.data.objects.remove(o)
            continue
        if n.startswith("glass-windshield"):
            o.data.materials[0] = windscreen
        elif "Glass ext" in n:
            o.data.materials[0] = side
        elif "car-body" in n:
            o.data.materials[0] = paint
        elif n.endswith("_media_0"):
            o.data.materials[0] = screen
        keep.append(o)
    move_to(keep, col)
    return keep


def build_rearview_mirror(col):
    """Le rétroviseur intérieur (modèle de bibliothèque), mis à 26 cm, tourné vers le conducteur."""
    parts = import_glb(os.path.join(ASSETS, "cast", "rearview-mirror", "model.glb"))
    shell = material("cast_mirror_shell", (0.02, 0.02, 0.022, 1), 0.45)
    chrome = material("cast_mirror_glass", (0.9, 0.9, 0.92, 1), 0.0, 1.0)
    for o in parts:
        o.data.materials[0] = chrome if "Mirror" in o.name else shell
    ob = join(parts, "rearview_mirror")
    mn, mx = bbox([ob])
    # la glace regarde +x dans le modèle ; la tige monte au-dessus d'elle
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2))
    ob.data.transform(Matrix.Translation(-c))
    s = 0.26 / (mx.y - mn.y)
    ob.data.transform(Matrix.Scale(s, 4))
    # +x du modèle vers +y (l'arrière du coupé), un peu tourné vers le conducteur (à +x)
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = (math.radians(-6), 0, math.radians(90 + 14))
    ob.location = MIRROR_AT
    move_to([ob], col)
    return ob


def build_chaser(col, at, name="cast_patrol"):
    """Une patrouille, rampe allumée, pour la voir dans le rétroviseur ou servir d'échelle."""
    parts = import_glb(os.path.join(ASSETS, "police.glb"))
    navy = material("cast_police_navy", lin("#1d2747"), 0.3, 0.2, coat=1.0)
    keep = []
    lenses = []
    for o in parts:
        if "Badges" in o.name:
            bpy.data.objects.remove(o)
            continue
        if "Bodymat" in o.name:
            o.data.materials[0] = navy
        if "Lightbar_Glass" in o.name:
            lenses.append(o)
        keep.append(o)
    for o in lenses:
        mn, mx = bbox([o])
        cy = (mn.y + mx.y) / 2
        o.data.materials[0] = material(f"{name}_bar_{len(col.objects)}", lin(CORAL if cy > 0 else LILAC), 0.1, emit=14.0)
    ob = join(keep, name)
    mn, mx = bbox([ob])
    ob.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    ob.location = at
    move_to([ob], col)
    return ob


def make_world(name, strength=1.0, flat=None):
    """L'heure bleue (HDRI du film) ou un fond uni pour les planches de studio."""
    w = bpy.data.worlds.new(name)
    if hasattr(w, "use_nodes"):
        w.use_nodes = True
    nt = w.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    bg.inputs["Strength"].default_value = strength
    if flat is not None:
        bg.inputs["Color"].default_value = flat
    else:
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(os.path.join(ASSETS, "qwantani_dusk_2_puresky_2k.exr"), check_existing=True)
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    w.use_fake_user = True
    return w


def grab(fn, col, name, at=(0, 0, 0), yaw=0.0):
    """Appelle un chargeur des modules du laboratoire et range tout ce qu'il crée sous un vide `name`,
    posé en `at` et tourné de `yaw` degrés (les chargeurs posent le nez des véhicules vers +x)."""
    before = set(bpy.data.objects)
    fn()
    new = [o for o in bpy.data.objects if o not in before]
    move_to(new, col)
    root = bpy.data.objects.new(name, None)
    col.objects.link(root)
    for o in new:
        if o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = root
            o.matrix_world = mw
    root.location = at
    root.rotation_euler = (0, 0, math.radians(yaw))
    return root


def build_interior(people, vehicles=None):
    col = collection("cast_interior")
    bpy.context.scene.world = make_world("world_interieur", 0.6)
    build_coupe(col)
    build_rearview_mirror(col)
    # la patrouille derrière, dans l'axe du rétroviseur ; son avant vers -y comme le coupé
    if vehicles is not None and hasattr(vehicles, "load_patrol"):
        grab(lambda: vehicles.load_patrol(lights_on=True), col, "interior_chaser", (0.6, 24.0, 0.0), -90)
    else:
        chaser = build_chaser(col, Vector((0.6, 24.0, 0.0)))
        chaser.rotation_euler = (0, 0, -math.pi / 2)
    # la route, mouillée
    bpy.ops.mesh.primitive_plane_add(size=1)
    road = bpy.context.active_object
    road.name = "cast_interior_road"
    road.scale = (14, 400, 1)
    road.data.materials.append(material("cast_wet_road", (0.02, 0.02, 0.024, 1), 0.12))
    move_to([road], col)
    if people is not None and hasattr(people, "cast_driver_seated"):
        # ses propres repères du coupé (volant, bassin, pédale), en coordonnées glTF brutes comme ici
        move_to(people.cast_driver_seated(), col)
    # caméra : depuis l'arrière de l'habitacle, par-dessus l'épaule droite, 24 mm (à 28 mm le volant sort du cadre)
    cam = bpy.data.cameras.new("cam_interior")
    cam.lens = 24
    cam.sensor_fit = "VERTICAL"
    cam.sensor_height = 24
    co = bpy.data.objects.new("cam_interior", cam)
    col.objects.link(co)
    cam.clip_start = 0.05
    co.location = (0.18, 1.50, 1.20)
    look_at(co, (0.15, -3.0, 0.92))
    # un peu de lumière de la rue sur le volant et la capuche
    add_light("interior_street", "AREA", (1.6, 0.6, 2.6), "#ffc36b", 120, target=WHEEL_CENTER, size=1.5, col=col)
    add_light("interior_bounce", "AREA", (0.0, 0.9, 1.25), "#8d8cf0", 3, target=(0.4, 0.3, 0.8), size=0.6, col=col)
    return col


# ---------------------------------------------------------------- les personnes et les véhicules

def lab(name):
    if os.environ.get("CAST_NO_LAB"):
        return None
    try:
        return importlib.import_module(name)
    except Exception as e:  # le module n'existe pas encore : la planche se passe de cette famille
        print(f"[cast] {name} indisponible : {e}", flush=True)
        return None


def camera(col, name, loc, target, lens):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    ob = bpy.data.objects.new(name, cam)
    col.objects.link(ob)
    ob.location = loc
    look_at(ob, target)
    return ob


def build_people(people):
    """Le conducteur mains levées et un policier dans chacune des trois poses, arme en main ;
    éclairés de face (lumières front_) ou à contre-jour (back_), cast_render.py choisit."""
    col = collection("cast_people")
    grab(people.cast_lineup, col, "people_lineup", PEOPLE_AT)
    c = PEOPLE_AT
    camera(col, "cam_people_front", c + Vector((0, -9.0, 1.1)), c + Vector((0, 0, 0.95)), 50)
    camera(col, "cam_people_back", c + Vector((0, -11.0, 0.45)), c + Vector((0, 0, 1.0)), 50)
    add_light("front_key", "AREA", c + Vector((-3.0, -6.0, 4.0)), (1, 1, 1), 2500, target=c + Vector((0, 0, 1)), size=4.0, col=col)
    add_light("front_fill", "AREA", c + Vector((4.0, -5.0, 2.0)), (1, 1, 1), 600, target=c + Vector((0, 0, 1)), size=4.0, col=col)
    # les phares du suspect derrière eux, bas, et un liseré corail / violet des rampes
    add_light("back_headlights", "AREA", c + Vector((0, 7.0, 0.7)), CREAM, 9000, target=c + Vector((0, -6, 1)), size=2.0, col=col)
    add_light("back_rim_coral", "AREA", c + Vector((-6.0, 5.0, 2.0)), CORAL, 1500, target=c + Vector((0, 0, 1.2)), size=1.0, col=col)
    add_light("back_rim_lilac", "AREA", c + Vector((6.0, 5.0, 2.0)), LILAC, 1500, target=c + Vector((0, 0, 1.2)), size=1.0, col=col)
    bpy.ops.mesh.primitive_plane_add(size=1, location=c)
    floor = bpy.context.active_object
    floor.name = "people_floor"
    floor.scale = (40, 40, 1)
    floor.data.materials.append(material("cast_floor", (0.03, 0.03, 0.035, 1), 0.2))
    move_to([floor], col)
    make_world("world_personnes", 1.0, flat=(0.18, 0.18, 0.19, 1))
    make_world("world_contrejour", 0.08)


def build_vehicles(vehicles):
    """La patrouille, le fourgon, l'hélicoptère, l'avion et les plots, côte à côte, nez vers -y."""
    col = collection("cast_vehicles")
    v = VEHICLES_AT
    grab(lambda: vehicles.load_patrol(lights_on=True), col, "lineup_patrol", v + Vector((-9.0, 0, 0)), -90)
    grab(lambda: vehicles.load_van(lights_on=True), col, "lineup_van", v + Vector((-3.0, 0, 0)), -90)
    grab(lambda: vehicles.load_helicopter(searchlight_on=False), col, "lineup_helicopter", v + Vector((6.0, 2.0, 0)), -90)
    grab(lambda: vehicles.load_jet(), col, "lineup_jet", v + Vector((22.0, 4.0, 0)), -90)
    grab(lambda: vehicles.load_props(), col, "lineup_props", v + Vector((-3.0, -9.0, 0)), 0)
    camera(col, "cam_vehicles", v + Vector((4.0, -42.0, 9.0)), v + Vector((5.0, 0, 1.5)), 35)
    add_light("vehicles_key", "SUN", v + Vector((0, -20, 30)), (1, 1, 1), 3.0, target=v, col=col)
    make_world("world_vehicules", 0.6)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    people = lab("cast_people")
    vehicles = lab("cast_vehicles")
    build_interior(people, vehicles)
    if people is not None and hasattr(people, "cast_lineup"):
        build_people(people)
    if vehicles is not None and hasattr(vehicles, "load_patrol"):
        build_vehicles(vehicles)
    scene.world = bpy.data.worlds["world_interieur"]
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    out = os.path.join(ASSETS, "cast.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print(f"[cast] écrit {out}", flush=True)


if __name__ == "__main__":
    build()
