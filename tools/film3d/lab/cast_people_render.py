# Planches comparatives des gens du film 3D (laboratoire) : studio de face, contre-jour, conducteur dans le coupé.
#
#   FILM3D_ASSETS=…/design/film/assets nice -n 19 taskpolicy -b Blender -b -t 2 --factory-startup \
#       -P tools/film3d/lab/cast_people_render.py -- [--only front,back,interior] [--samples 64]
#
# Écrit ref/lab/cast-people-comparatif.png, …-contrejour.png, …-interieur.png et assets/cast/lab-people.blend.
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


ONLY = opt("--only", "front,back,interior,final").split(",")
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

def officers_row(pose, yaw_deg, entries=None, gap=GAP):
    """Une rangée de policiers ; entries : liste de (variante, pose), sinon OFFICER_ORDER dans `pose`."""
    arms = []
    entries = entries or [(v, pose) for v in OFFICER_ORDER]
    n = len(entries)
    for i, (v, pose) in enumerate(entries):
        a = cp.load_officer(v)
        cp.pose_officer(a, pose)
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
    officers_row(None, 180 - 20, FINAL_OFFICERS, gap)
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


def sheet_interior(variants):
    tiles = []
    for v in variants:
        new_scene()
        objs = load_coupe()
        info = coupe_cabin(objs)
        coupe_glass(objs)
        sky = os.path.join(cp.ASSETS, "qwantani_dusk_2_puresky_2k.exr")
        w = bpy.data.worlds.new("w")
        bpy.context.scene.world = w
        if hasattr(w, "use_nodes"):
            w.use_nodes = True
        nt = w.node_tree
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(sky)
        bg = nt.nodes["Background"]
        nt.links.new(env.outputs[0], bg.inputs[0])
        bg.inputs[1].default_value = 0.5
        floor(cp.lin("#0b0c10"), 0.25)
        a = cp.load_driver(v)
        cp.place_driver(a, info["hip"], (0, -1, 0))
        miss = cp.pose_driver_wheel(a, info["wheel_center"], info["wheel_radius"], info["wheel_normal"],
                                    pedal=info.get("pedal"))
        print("INTERIOR", v, "miss", miss, {k: tuple(round(x, 3) for x in val) if hasattr(val, "__len__") else val
                                            for k, val in info.items()}, flush=True)
        # un peu de lumière d'ambiance : lampadaire ambre au loin, lueur bleue par le pare-brise
        area("street", (info["hip"].x + 2.5, info["hip"].y - 4, 4), info["wheel_center"], cp.lin("#ffc36b"), 1200, 2)
        area("dash_glow", (info["wheel_center"].x, info["wheel_center"].y - 0.25, info["wheel_center"].z + 0.05),
             (info["hip"].x, info["hip"].y, info["hip"].z + 0.4), cp.lin("#8d8cf0"), 1.5, 0.3)
        # gyrophares de la poursuite par la lunette arrière : liseré corail sur la capuche et les épaules
        area("rear_rim", info["hip"] + Vector((0.3, 3.2, 0.9)), info["hip"] + Vector((0, 0, 0.75)), cp.lin(CORAL), 500, 1.0)
        # depuis l'arrière, au-dessus de l'épaule droite du conducteur (28 mm)
        cam_loc = info["hip"] + Vector((-0.36, 0.62, 0.70))
        look = info["wheel_center"] + Vector((-0.10, -0.6, 0.02))
        camera(cam_loc, look, 28, 540, 960)
        bpy.context.scene.camera.data.clip_start = 0.02
        p = os.path.join(TMP, f"interior_{v}.png")
        render(p)
        tiles.append(p)
        if not WB:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(cp.CAST, f"lab-people-interior-{v}.blend"))
    if len(tiles) > 1:
        a_ = ["ffmpeg", "-y", "-loglevel", "error"]
        for p in tiles:
            a_ += ["-i", p]
        a_ += ["-filter_complex", "".join(f"[{i}:v]" for i in range(len(tiles))) + f"hstack=inputs={len(tiles)}[o]",
               "-map", "[o]", "-frames:v", "1", os.path.join(REF, "cast-people-comparatif-interieur.png")]
        subprocess.run(a_, check=True)
    else:
        import shutil
        shutil.copy(tiles[0], os.path.join(REF, "cast-people-comparatif-interieur.png"))


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
