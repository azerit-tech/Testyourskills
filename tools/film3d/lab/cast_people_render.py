# Planches comparatives des gens du film 3D (laboratoire) : studio de face, contre-jour, conducteur dans le coupé,
# finalistes, policiers en situation derrière la patrouille.
#
#   FILM3D_ASSETS=…/design/film/assets nice -n 10 Blender -b -t 2 --factory-startup \
#       -P tools/film3d/lab/cast_people_render.py -- [--only front,back,interior,final,situation] [--samples 128]
#       [--cpu] [--wb --out DIR]
#
# Carte graphique (Metal) par défaut, --cpu pour s'en passer, --wb pour une vérification Workbench.
# Écrit ref/lab/cast-people-comparatif.png, …-contrejour.png, …-interieur.png, finalistes-personnes.png,
# personnes-en-situation.png et assets/cast/lab-people.blend.
# NON TESTÉ (11 nov.) : sheet_interior repris de cast.py et sheet_situation (écrits sans pouvoir lancer Blender).
# Ordre des candidats (de gauche à droite) : voir OFFICER_ORDER et DRIVER_ROW.
import math
import os
import subprocess
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cast_people as cp  # noqa: E402

REF = os.path.abspath(os.path.join(cp.ASSETS, "..", "ref", "lab"))
TMP = os.path.join(REF, "_tiles")
OFFICER_ORDER = ["spp", "tuzzy", "aayush", "mystery"]
DRIVER_ROW = [("hoodie", "wheel"), ("hoodie", "up"), ("hooded", "wheel"), ("hooded", "up")]
GAP = 1.35
CREAM, CORAL, LILAC = "#fff9cb", "#ff6a3d", "#8d8cf0"

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(name, default):
    return args[args.index(name) + 1] if name in args else default


ONLY = opt("--only", "front,back,interior,final,situation").split(",")
SAMPLES = int(opt("--samples", "128"))
CPU = "--cpu" in args   # par défaut la carte graphique (Metal)
WB = "--wb" in args   # contrôle rapide de la mise en place (Workbench), sans Cycles
if WB:
    REF = opt("--out", os.path.join(REF, "_wb"))
    TMP = os.path.join(REF, "_tiles")


def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cp._MATS.clear()
    sc = bpy.context.scene
    if WB:
        sc.render.engine = "BLENDER_WORKBENCH"
        sc.display.shading.light = "STUDIO"
        sc.display.shading.color_type = "MATERIAL"
        return sc
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    if not CPU:
        # la carte graphique (Metal) ; read_factory_settings remet les préférences à zéro, on les reprend
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == "METAL"]
        for d in prefs.devices:
            d.use = d.type == "METAL"
        if not gpus:
            raise RuntimeError("aucun périphérique Metal")
        sc.cycles.device = "GPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.render.threads_mode = "FIXED"
    sc.render.threads = 2
    sc.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            sc.view_settings.look = look
            break
        except TypeError:
            pass
    sc.render.film_transparent = False
    return sc


def world(color, strength):
    w = bpy.data.worlds.new("w")
    bpy.context.scene.world = w
    if hasattr(w, "use_nodes"):
        w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = color
    bg.inputs[1].default_value = strength


def camera(loc, target, lens, w, h, name="cam"):
    c = bpy.data.cameras.new(name)
    c.lens = lens
    c.sensor_fit = "AUTO"
    o = bpy.data.objects.new(name, c)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc = bpy.context.scene
    sc.camera = o
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    return o


def area(name, loc, target, color, energy, size):
    L = bpy.data.lights.new(name, "AREA")
    L.color = color[:3]
    L.energy = energy
    L.size = size
    o = bpy.data.objects.new(name, L)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


def spot(name, loc, target, color, energy, angle=55, blend=0.4, radius=0.08):
    L = bpy.data.lights.new(name, "SPOT")
    L.color = color[:3]
    L.energy = energy
    L.spot_size = math.radians(angle)
    L.spot_blend = blend
    L.shadow_soft_size = radius
    o = bpy.data.objects.new(name, L)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


def floor(color, rough, size=60):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    f = bpy.context.active_object
    f.name = "floor"
    f.data.materials.append(cp._principled(f"floor_{rough}", color, rough, spec=0.5))
    return f


def label(text, x, y=-0.75, glow=False):
    """Étiquette debout au pied du figurant, face à la caméra (crème lumineuse à contre-jour)."""
    cu = bpy.data.curves.new("lab", "FONT")
    cu.body = text
    cu.size = 0.12
    cu.align_x = "CENTER"
    o = bpy.data.objects.new("label_" + text, cu)
    bpy.context.scene.collection.objects.link(o)
    o.location = (x, y, 0.02)
    o.rotation_euler = (math.radians(90), 0, 0)
    if glow:
        m = cp._principled("label_glow", (0, 0, 0, 1), 1.0)
        p = m.node_tree.nodes["Principled BSDF"]
        p.inputs["Emission Color"].default_value = cp.lin(CREAM)
        p.inputs["Emission Strength"].default_value = 1.5
    else:
        m = cp._principled("label", (0.02, 0.02, 0.02, 1), 0.6)
    o.data.materials.append(m)
    return o


def render(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WROTE", path, flush=True)


def stack(paths, out):
    args_ = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in paths:
        args_ += ["-i", p]
    args_ += ["-filter_complex", "".join(f"[{i}:v]" for i in range(len(paths))) + f"vstack=inputs={len(paths)}[o]",
              "-map", "[o]", "-frames:v", "1", out]
    subprocess.run(args_, check=True)
    print("SHEET", out, flush=True)


# ---------------------------------------------------------------- figurants

def officers_row(pose, yaw_deg, entries=None, gap=GAP, styled=False):
    """Une rangée de policiers ; entries : liste de (variante, pose), sinon OFFICER_ORDER dans `pose`."""
    arms = []
    entries = entries or [(v, pose) for v in OFFICER_ORDER]
    n = len(entries)
    for i, (v, pose) in enumerate(entries):
        a = cp.load_officer(v)
        cp.pose_officer(a, pose, style=i % 3 if styled else 0)
        g = cp.load_handgun("service")
        cp.attach_handgun(a, g)
        x = (i - (n - 1) / 2) * gap
        a.matrix_world = Matrix.Translation((x, 0, 0)) @ Matrix.Rotation(math.radians(yaw_deg), 4, "Z")
        cp._upd()
        print("ROW", pose, cp.stats(a), flush=True)
        arms.append((v, a, x))
    return arms


def wheel_prop(center, radius, normal, name="wheel"):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.016, major_segments=64, minor_segments=12,
                                     location=center)
    t = bpy.context.active_object
    t.name = name
    t.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized()).to_euler()
    t.data.materials.append(cp._principled("wheel_rubber", (0.03, 0.03, 0.03, 1), 0.5))
    return t


def seat_prop(hip, yaw):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    s = bpy.context.active_object
    s.scale = (0.5, 0.5, hip.z - 0.12)
    s.matrix_world = Matrix.Translation((hip.x, hip.y, (hip.z - 0.12) / 2)) @ Matrix.Rotation(yaw, 4, "Z") @ \
        Matrix.Translation((0, 0.08, 0)) @ Matrix.Diagonal((0.48, 0.5, hip.z - 0.12, 1))
    s.data.materials.append(cp._principled("seat_grey", (0.12, 0.12, 0.12, 1), 0.7))
    return s


def drivers_row(back_for_wheel=True, entries=None):
    arms = []
    entries = entries or DRIVER_ROW
    n = len(entries)
    for i, (v, pose) in enumerate(entries):
        a = cp.load_driver(v)
        x = (i - (n - 1) / 2) * GAP * 1.15
        yaw = math.pi if (pose == "wheel" and back_for_wheel) else 0.0
        yaw += math.radians(25)
        fwd = Matrix.Rotation(yaw, 3, "Z") @ Vector((0, -1, 0))
        hip = Vector((x, 0, 0.62))
        cp.place_driver(a, hip, fwd)
        seat_prop(hip, yaw)
        if pose == "wheel":
            # même écart bassin → volant que dans le coupé (mesuré : 32 cm devant, 36 cm plus haut)
            c = hip + fwd * 0.32 + Vector((0, 0, 0.36))
            nrm = (-fwd * 0.912 + Vector((0, 0, 0.411))).normalized()
            wheel_prop(c, 0.21, nrm)
            miss = cp.pose_driver_wheel(a, c, 0.21, nrm)
            print("DRV", v, pose, "miss", miss, cp.stats(a), flush=True)
        else:
            cp.pose_driver_hands_up(a)
            print("DRV", v, pose, cp.stats(a), flush=True)
        arms.append((v, a, x))
    return arms


# ---------------------------------------------------------------- planches

def sheet_front():
    tiles = []
    for pose in ("aim", "crouch", "guard"):
        new_scene()
        world((0.18, 0.18, 0.19, 1), 0.35)
        floor((0.2, 0.2, 0.21, 1), 0.8)
        officers_row(pose, -28)
        for i, v in enumerate(OFFICER_ORDER):
            label(f"{i + 1} {v}", (i - (len(OFFICER_ORDER) - 1) / 2) * GAP)
        area("key", (-3, -7, 4.5), (0, 0, 1.0), (1, 1, 1, 1), 1100, 5)
        area("fill", (6, -5, 2), (0, 0, 1.0), (1, 1, 1, 1), 250, 4)
        camera((0, -10.5, 1.15), (0, 0, 0.82), 50, 1800, 640)
        p = os.path.join(TMP, f"front_{pose}.png")
        render(p)
        tiles.append(p)
    new_scene()
    world((0.18, 0.18, 0.19, 1), 0.35)
    floor((0.2, 0.2, 0.21, 1), 0.8)
    drivers_row()
    for i, (v, pose) in enumerate(DRIVER_ROW):
        label(f"{i + 1} {v} {pose}", (i - 1.5) * GAP * 1.15, -0.95)
    area("key", (-3, -7, 4.5), (0, 0, 1.0), (1, 1, 1, 1), 1100, 5)
    area("fill", (6, -5, 2), (0, 0, 1.0), (1, 1, 1, 1), 250, 4)
    area("back", (0, 6, 3), (0, 0, 1.0), (1, 1, 1, 1), 400, 5)
    camera((0, -10.5, 1.15), (0, 0, 0.82), 50, 1800, 640)
    p = os.path.join(TMP, "front_drivers.png")
    render(p)
    tiles.append(p)
    stack(tiles, os.path.join(REF, "cast-people-comparatif.png"))


def backlit_rig(cam_z=0.8, lights_y=9.0):
    world(cp.lin("#0b1230"), 0.35)
    floor(cp.lin("#0b0c10"), 0.22)
    for x in (-0.75, 0.75):
        spot(f"headlight_{x}", (x, lights_y, 0.7), (x * 0.2, -6, 0.5), cp.lin(CREAM), 9000, angle=70, blend=0.5)
        bpy.ops.mesh.primitive_circle_add(vertices=24, radius=0.11, fill_type="NGON", location=(x, lights_y + 0.02, 0.7),
                                          rotation=(math.radians(90), 0, 0))
        e = bpy.context.active_object
        m = cp._principled("lamp_disc", (0, 0, 0, 1), 1.0)
        nt = m.node_tree
        p = nt.nodes["Principled BSDF"]
        p.inputs["Emission Color"].default_value = cp.lin(CREAM)
        p.inputs["Emission Strength"].default_value = 60.0
        e.data.materials.append(m)
    area("rim_coral", (-6, 4, 2.4), (0, 0, 1.0), cp.lin(CORAL), 500, 2)
    area("rim_violet", (6, 4, 2.4), (0, 0, 1.0), cp.lin(LILAC), 500, 2)
    area("sky", (0, -4, 8), (0, 0, 0), cp.lin("#4b4fb8"), 120, 10)
    return cam_z


def sheet_back():
    tiles = []
    for pose, cz in (("aim", 0.9), ("crouch", 0.35), ("guard", 1.3)):
        new_scene()
        backlit_rig()
        # de dos, tournés de 20° pour que le bras et l'arme se découpent
        officers_row(pose, 180 - 20)
        for i, v in enumerate(OFFICER_ORDER):
            label(f"{i + 1} {v}", (i - (len(OFFICER_ORDER) - 1) / 2) * GAP, -0.9, glow=True)
        camera((0, -7.5, cz), (0, 0, 0.75 if pose != "crouch" else 0.55), 35, 1800, 640)
        p = os.path.join(TMP, f"back_{pose}.png")
        render(p)
        tiles.append(p)
    new_scene()
    backlit_rig()
    drivers_row(back_for_wheel=True)
    for i, (v, pose) in enumerate(DRIVER_ROW):
        label(f"{i + 1} {v} {pose}", (i - 1.5) * GAP * 1.15, -0.95, glow=True)
    camera((0, -7.5, 1.0), (0, 0, 0.8), 35, 1800, 640)
    p = os.path.join(TMP, "back_drivers.png")
    render(p)
    tiles.append(p)
    stack(tiles, os.path.join(REF, "cast-people-comparatif-contrejour.png"))


FINAL_OFFICERS = [("spp", "aim"), ("tuzzy", "aim"), ("spp", "crouch"), ("tuzzy", "crouch"), ("spp", "guard"),
                  ("tuzzy", "guard")]
FINAL_DRIVERS = [("hooded", "wheel"), ("hoodie", "wheel"), ("hooded", "up"), ("hoodie", "up")]


def sheet_finalists():
    """Les finalistes, à la lumière du film : contre-jour bleu, phares derrière, liserés corail et violet,
    caméra basse ; puis le conducteur assis dans le coupé (tuiles de sheet_interior)."""
    tiles = []
    new_scene()
    backlit_rig()
    gap = 1.12
    officers_row(None, 180 - 20, FINAL_OFFICERS, gap, styled=True)
    for i, (v, pose) in enumerate(FINAL_OFFICERS):
        label(f"{v} {pose}", (i - (len(FINAL_OFFICERS) - 1) / 2) * gap, -0.9, glow=True)
    camera((0, -7.5, 0.6), (0, 0, 0.7), 35, 1800, 640)
    p = os.path.join(TMP, "final_officers.png")
    render(p)
    tiles.append(p)
    new_scene()
    backlit_rig()
    drivers_row(back_for_wheel=True, entries=FINAL_DRIVERS)
    for i, (v, pose) in enumerate(FINAL_DRIVERS):
        label(f"{v} {pose}", (i - 1.5) * GAP * 1.15, -0.95, glow=True)
    camera((0, -7.5, 0.9), (0, 0, 0.8), 35, 1800, 640)
    p = os.path.join(TMP, "final_drivers.png")
    render(p)
    tiles.append(p)
    inside = [os.path.join(TMP, f"interior_{v}.png") for v in ("hooded", "hoodie")]
    inside = [q for q in inside if os.path.exists(q)]
    if inside:
        row = os.path.join(TMP, "final_interior.png")
        a_ = ["ffmpeg", "-y", "-loglevel", "error"]
        for q in inside:
            a_ += ["-i", q]
        a_ += ["-filter_complex", "".join(f"[{i}:v]" for i in range(len(inside))) +
               f"hstack=inputs={len(inside)},pad=1800:ih:(ow-iw)/2:0:color=0x0c0d1b[o]" if len(inside) > 1 else
               "[0:v]pad=1800:ih:(ow-iw)/2:0:color=0x0c0d1b[o]", "-map", "[o]", "-frames:v", "1", row]
        subprocess.run(a_, check=True)
        tiles.append(row)
    stack(tiles, os.path.join(REF, "finalistes-personnes.png"))


# ---------------------------------------------------------------- coupé

COUPE = {}


def load_coupe():
    """Le coupé tel qu'importé (repère du glTF, avant vers -Y), sans sa sphère d'environnement ; repère les
    pièces utiles de l'habitacle."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(cp.ASSETS, "coupe-hd.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == "MESH" and o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o)
    return [o for o in bpy.data.objects if o not in before]


def _cast_module():
    """Le décor de la session principale (tools/film3d/cast.py, importable : build() ne tourne que sous
    __main__)."""
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")))
    import cast
    return cast


def sheet_interior(variants):
    """Le conducteur vu de la banquette arrière, dans l'habitacle de cast.py : écran central éteint,
    rétroviseur intérieur avec la patrouille et sa rampe dedans, route mouillée ; caméra de cast.py
    (24 mm, capteur vertical 24 mm, (0.18, 1.50, 1.20) → (0.15, -3.0, 0.92)). Lueur des cadrans et
    passage d'un lampadaire ambre sur le côté. NON TESTÉ."""
    cast = _cast_module()
    tiles = []
    for v in variants:
        new_scene()
        col = cast.collection("cast_interior")
        bpy.context.scene.world = cast.make_world("world_interieur", 0.6)
        objs = cast.build_coupe(col)
        cast.build_rearview_mirror(col)
        chaser = cast.build_chaser(col, Vector((0.6, 24.0, 0.0)))
        chaser.rotation_euler = (0, 0, -math.pi / 2)
        bpy.ops.mesh.primitive_plane_add(size=1)
        road = bpy.context.active_object
        road.scale = (14, 400, 1)
        road.data.materials.append(cp._principled("wet_road", (0.02, 0.02, 0.024, 1), 0.12))
        info = coupe_cabin(objs)
        objs_d = cp.cast_driver_seated(info.get("wheel_center", cp.COUPE_WHEEL_CENTER),
                                       info.get("hip", cp.COUPE_HIP), variant=v,
                                       wheel_normal=info.get("wheel_normal", cp.COUPE_WHEEL_NORMAL),
                                       wheel_radius=info.get("wheel_radius", cp.COUPE_WHEEL_RADIUS),
                                       pedal=info.get("pedal", cp.COUPE_PEDAL))
        print("INTERIOR", v, "miss", objs_d[0].get("wheel_miss"), flush=True)
        wc = Vector(info.get("wheel_center", cp.COUPE_WHEEL_CENTER))
        # cadrans : une lueur froide sous la casquette du tableau de bord, vers le volant et les gants
        area("gauge_glow", wc + Vector((0.0, -0.32, 0.12)), wc + Vector((0, 0.25, -0.05)), cp.lin("#9fb4ff"), 6, 0.25)
        # lampadaire qui passe : ambre, de côté, par la vitre conducteur
        area("street_pass", wc + Vector((1.9, 0.2, 1.6)), wc, cp.lin("#ffc36b"), 260, 1.2)
        # lueur de la rampe par la lunette arrière, sur la capuche
        area("rear_rim", Vector((0.4, 3.0, 1.4)), Vector((0.44, 0.6, 1.2)), cp.lin(CORAL), 180, 1.0)
        c = bpy.data.cameras.new("cam_interior")
        c.lens = 24
        c.sensor_fit = "VERTICAL"
        c.sensor_height = 24
        c.clip_start = 0.05
        co = bpy.data.objects.new("cam_interior", c)
        bpy.context.scene.collection.objects.link(co)
        co.location = (0.18, 1.50, 1.20)
        co.rotation_euler = (Vector((0.15, -3.0, 0.92)) - co.location).to_track_quat("-Z", "Y").to_euler()
        sc = bpy.context.scene
        sc.camera = co
        sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 540, 960, 100
        sc.view_settings.exposure = 0.7
        p = os.path.join(TMP, f"interior_{v}.png")
        render(p)
        tiles.append(p)
        if not WB:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(cp.CAST, f"lab-people-interior-{v}.blend"))
    out = os.path.join(REF, "cast-people-comparatif-interieur.png")
    if len(tiles) > 1:
        a_ = ["ffmpeg", "-y", "-loglevel", "error"]
        for p in tiles:
            a_ += ["-i", p]
        a_ += ["-filter_complex", "".join(f"[{i}:v]" for i in range(len(tiles))) + f"hstack=inputs={len(tiles)}[o]",
               "-map", "[o]", "-frames:v", "1", out]
        subprocess.run(a_, check=True)
    else:
        import shutil
        shutil.copy(tiles[0], out)


# ---------------------------------------------------------------- en situation

def _patrol():
    """La patrouille retenue (« Police car », jeandiz) : load_patrol() de cast_vehicles s'il existe, sinon le
    glTF brut, carrosserie sombre. Tournée avant vers -Y, centre au sol à l'origine. Renvoie
    (objets, demi-largeur, y de l'avant). NON TESTÉ."""
    import cast_vehicles as cv
    if hasattr(cv, "load_patrol"):
        d = cv.load_patrol()
        objs = [d["body"]] + [o for o in (d.get("lightbar"), d.get("lenses")) if o] + list(d.get("lights", []))
    else:
        objs = cv.import_model(os.path.join(cp.CAST, "patrol-jeandiz", "model.glb"))
        dark = cp._principled("patrol_dark", cp.lin("#14161c"), 0.3, coat=1.0)
        for o in objs:
            if o.type != "MESH":
                continue
            n = o.name.lower()
            if "light" in n and ("bar" in n or "roof" in n):
                continue
            if "glass" in n or "window" in n:
                continue
            o.data.materials.clear()
            o.data.materials.append(dark)
        cv.normalise([o for o in objs if o.type == "MESH"], length=5.0)
    roots = [o for o in objs if o.parent is None]
    # avant +x (repère des véhicules) → avant -Y (repère du film)
    for o in roots:
        o.matrix_world = Matrix.Rotation(-math.pi / 2, 4, "Z") @ o.matrix_world
    bpy.context.view_layer.update()
    mn, mx = cv.bbox([o for o in objs if o.type == "MESH"])
    return objs, (mx.x - mn.x) / 2, mn.y


def _fake_door(name, hinge, side, length=1.15, height=0.95, sill=0.32, open_deg=62):
    """Une portière ouverte (le modèle n'a pas de portières séparées) : panneau sombre de 6 cm, charnière
    au bord avant, ouverte de `open_deg` vers l'extérieur ; seul le bas plein (vitre baissée)."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    d = bpy.context.active_object
    d.name = name
    d.data.transform(Matrix.Translation((0, 0.5, 0.5)))
    d.data.transform(Matrix.Diagonal((0.06, length, height * 0.62, 1)))
    d.data.materials.append(cp._principled("door_dark", cp.lin("#14161c"), 0.3, coat=1.0))
    d.location = Vector((hinge.x, hinge.y, sill))
    d.rotation_euler = (0, 0, math.radians(open_deg) * (-1 if side > 0 else 1))
    return d


def sheet_situation():
    """Les policiers là où ils seront : derrière les portières ouvertes de la patrouille, rampe allumée
    derrière eux, chaussée mouillée, caméra basse à 20 m (85 mm, 9:16). NON TESTÉ."""
    new_scene()
    backlit_rig(lights_y=14.0)
    objs, half_w, front_y = _patrol()
    hy = front_y + 1.25   # montant avant, ≈ 1,25 m derrière le pare-chocs
    for side in (1, -1):
        _fake_door(f"door_{side}", Vector((side * (half_w - 0.02), hy, 0)), side)
    # côté conducteur (+X) : un genou au sol derrière la portière, un debout qui vise par-dessus ;
    # côté passager : un debout qui vise ; à l'arrière de la voiture : un en garde
    cast = [("spp", "crouch", Vector((half_w + 0.55, hy + 0.85, 0)), 0),
            ("spp", "aim", Vector((half_w + 0.15, hy + 1.35, 0)), 1),
            ("spp", "aim", Vector((-half_w - 0.45, hy + 1.0, 0)), 2),
            ("tuzzy", "guard", Vector((-half_w - 0.9, hy + 3.2, 0)), 1)]
    for v, pose, at, style in cast:
        a = cp.load_officer(v)
        cp.pose_officer(a, pose, style=style)
        cp.attach_handgun(a, cp.load_handgun("service"))
        a.location = at
    # la rampe : corail côté conducteur, violet côté passager, au-dessus du toit
    area("bar_coral", (0.4, front_y + 2.2, 1.75), (0.4, front_y - 6, 0.0), cp.lin(CORAL), 900, 0.5)
    area("bar_violet", (-0.4, front_y + 2.2, 1.75), (-0.4, front_y - 6, 0.0), cp.lin(LILAC), 900, 0.5)
    # les phares de la patrouille vers la caméra
    for x in (0.62, -0.62):
        spot(f"head_{x}", (x, front_y - 0.05, 0.75), (x * 2, front_y - 20, 0.4), cp.lin(CREAM), 1500, angle=50)
    camera((2.0, front_y - 20.0, 1.0), (0.3, hy + 1.0, 1.0), 85, 1080, 1920)
    p = os.path.join(REF, "personnes-en-situation.png")
    render(p)
    print("SHEET", p, flush=True)
    if not WB:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(cp.CAST, "lab-people-situation.blend"))


def coupe_cabin(objs):
    """Centre et rayon du volant, normale vers le conducteur, point de bassin sur le siège conducteur."""
    meshes = [o for o in objs if o.type == "MESH"]

    def bb(o):
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return Vector(map(min, *pts)), Vector(map(max, *pts))

    wheel = [o for o in meshes if "steering-wheel-rim" in o.name.lower()]
    seat = [o for o in meshes if "seat" in o.name.lower()]
    info = {}
    if wheel:
        # le volant est un disque : sa normale est l'axe le plus mince ; on prend la normale du plan
        # moyen des sommets (ACP)
        import numpy as np
        P = []
        for o in wheel:
            P += [tuple(o.matrix_world @ v.co) for v in o.data.vertices]
        P = np.array(P)
        cc = P.mean(axis=0)
        _, _, vt = np.linalg.svd(P - cc, full_matrices=False)
        n = Vector(vt[2])
        if n.y < 0:
            n = -n
        info["wheel_normal"] = n
        # rayon de l'âme du jante : médiane des distances dans le plan
        r = float(np.median(np.linalg.norm((P - cc) - np.outer((P - cc) @ vt[2], vt[2]), axis=1)))
        info["wheel_radius"] = r
        info["wheel_center"] = Vector(cc)
    # siège conducteur (côté +X, conduite à gauche) : bassin 12 cm devant le dossier, 8 cm sous le haut
    # des bourrelets de l'assise
    bottom = [o for o in seat if "bottom" in o.name.lower() and bb(o)[0].x > 0]
    back = [o for o in seat if "back" in o.name.lower() and bb(o)[0].x > 0]
    if bottom and back:
        bmn, bmx = bb(bottom[0])
        kmn, _ = bb(back[0])
        info["hip"] = Vector(((bmn.x + bmx.x) / 2, kmn.y - 0.07, bmx.z - 0.085))
        floor_ = [o for o in meshes if o.name.startswith("interior-floor")]
        fz = bb(floor_[0])[1].z if floor_ else 0.36
        info["pedal"] = Vector((info["hip"].x, info["wheel_center"].y - 0.42, fz + 0.06))
    return info


def coupe_glass(objs):
    """Vitres transparentes (le reste garde ses matières d'origine)."""
    g = bpy.data.materials.new("lab_glass")
    if hasattr(g, "use_nodes"):
        g.use_nodes = True
    p = g.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.8, 0.85, 0.9, 1)
    p.inputs["Transmission Weight"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.02
    for o in objs:
        if o.type == "MESH" and "glass" in o.name.lower():
            o.data.materials.clear()
            o.data.materials.append(g)


if __name__ == "__main__":
    os.makedirs(TMP, exist_ok=True)
    if "front" in ONLY:
        sheet_front()
    if "back" in ONLY:
        sheet_back()
        if not WB:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(cp.CAST, "lab-people.blend"))
    if "interior" in ONLY:
        sheet_interior(opt("--drivers", "hooded,hoodie").split(","))
    if "final" in ONLY:
        sheet_finalists()
    if "situation" in ONLY:
        sheet_situation()
