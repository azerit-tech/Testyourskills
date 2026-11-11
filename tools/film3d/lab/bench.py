# Le banc d'essai du réalisme : un même bout de rue, une même lumière, deux caméras fixes,
# pour comparer des méthodes (immeuble, chaussée, palmiers) à armes égales.
#
# Une méthode est un script tools/film3d/lab/<methode>.py qui fait :
#
#   import os, sys
#   sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
#   import bench
#   bench.setup()                    # ciel, chaussée, trottoirs, voisins, lampadaires, palmiers, caméras
#   ... construit la façade dans bench.LOT (ou remplace la chaussée, les palmiers) ...
#   bench.render("<methode>")        # écrit ref/lab/<methode>-large.png et <methode>-pres.png
#
# et se lance, comme tout Blender sur le Mac de Jacques, derrière le verrou commun :
#
#   lockf -k <scratchpad>/blender.lock nice -n 19 taskpolicy -b \
#     /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/lab/<methode>.py
#
# Repère du film : z en haut, l'avenue file vers +y, le côté ville est x < 0, la façade de
# la parcelle d'essai est le plan x = LOT["x"], tournée vers +x (la rue).
import math
import os
import sys
import time

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import scene_a as S  # noqa: E402  (ses fonctions : matériaux, import glb, ciel, rendu)

ASSETS = S.ASSETS
LAB = os.path.join(os.path.dirname(ASSETS), "ref", "lab")

# La parcelle d'essai : 20 m de façade, rez-de-chaussée et trois étages (≈ 14 m), profondeur 14 m.
LOT = dict(x=S.FRONT_X, y0=14.0, y1=34.0, depth=14.0, gf_h=4.2, fh=S.FH, floors=3)
ROAD_HALF = S.ROAD_HALF
KERB_X = -ROAD_HALF - 0.2          # le nu de la bordure côté ville
RES = (360, 640)                   # 9:16, la même pour tout le monde
SAMPLES = 64


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def camera(name, loc, target, lens, focus):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.sensor_fit = "AUTO"
    cam.sensor_width = 36
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = 4.0
    cam.clip_end = 3000
    ob = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    look_at(ob, target)
    f = bpy.data.objects.new(name + "_focus", None)
    bpy.context.scene.collection.objects.link(f)
    f.location = focus
    cam.dof.focus_object = f
    return ob


def hidden_collection():
    c = bpy.data.collections.get("sources")
    if c is None:
        c = bpy.data.collections.new("sources")
        bpy.context.scene.collection.children.link(c)
        c.hide_render = True
        c.hide_viewport = True
    return c


def streetlamps(positions):
    """Le lampadaire du film (une crosse, tête ambre) avec son spot, comme dans scene_a."""
    hidden = hidden_collection()
    parts = S.import_glb("streetlights.glb")
    mine = [o for o in parts if o.name.startswith("polySurface102")]
    for o in [o for o in parts if o not in mine]:
        bpy.data.objects.remove(o)
    lamp = S.join(mine, "lamp_src")
    metal, head = S.mat_plain("lamp_metal", (0.05, 0.05, 0.055, 1), 0.35, 0.8), S.mat_emit("lamp_head", S.lin(S.AMBER), 40.0)
    for i, m in enumerate(lamp.data.materials):
        lamp.data.materials[i] = head if m.name.startswith("light") else metal
    S.recentre(lamp)
    for c in list(lamp.users_collection):
        c.objects.unlink(lamp)
    hidden.objects.link(lamp)
    sc = 1.75
    for k, (x, y) in enumerate(positions):
        rot = math.pi / 2 if x < 0 else -math.pi / 2
        S.instance(lamp, f"lamp_{k}", (x, y, 0.15), rot, sc)
        h = Vector((0, -1.68 * sc, 4.68 * sc))
        h.rotate(__import__("mathutils").Euler((0, 0, rot)))
        L = bpy.data.lights.new(f"lamp_{k}", "SPOT")
        L.energy = 2600
        L.color = S.lin(S.AMBER)[:3]
        L.spot_size = math.radians(130)
        L.spot_blend = 0.5
        L.shadow_soft_size = 0.25
        lo = bpy.data.objects.new(f"lamp_light_{k}", L)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = Vector((x, y, 0.15)) + h - Vector((0, 0, 0.12))


def palms(positions):
    """Les palmiers actuels du film (Palm Tree Pack LOWPOLY) : la référence à battre."""
    hidden = hidden_collection()
    parts = S.import_glb("palms.glb")
    srcs = []
    groups = {tag: [o for o in parts if o.name.startswith(tag)] for tag in ("PALMLOW_", "PALMLOW2_", "PALMLOW3_")}
    for tag, grp in groups.items():
        p = S.join(grp, f"palm_src_{len(srcs)}")
        S.recentre(p)
        for c in list(p.users_collection):
            c.objects.unlink(p)
        hidden.objects.link(p)
        srcs.append(p)
    for k, (x, y, rot, sc) in enumerate(positions):
        S.instance(srcs[k % 3], f"palm_{k}", (x, y, 0.15), rot, sc)


PALM_SPOTS = [(-ROAD_HALF - 1.6, 9.0, 0.6, 1.3), (-ROAD_HALF - 1.6, 37.5, 2.4, 1.4)]


def default_road():
    """La chaussée, la bordure, le caniveau et les trottoirs de scene_a, tels quels."""
    S.box("road", -ROAD_HALF, ROAD_HALF, -20, 120, -0.05, 0.0, S.mat_road())
    conc, kerb = S.mat_concrete(), S.mat_plain("kerb", S.lin("#9a948c"), 0.45)
    S.box("walk_left", S.FRONT_X, -ROAD_HALF - 0.2, -20, 120, -0.05, 0.15, conc)
    S.box("kerb_left", -ROAD_HALF - 0.2, -ROAD_HALF, -20, 120, -0.05, 0.16, kerb)
    S.box("walk_right", ROAD_HALF + 0.2, ROAD_HALF + 4.5, -20, 120, -0.05, 0.15, conc)
    S.box("kerb_right", ROAD_HALF, ROAD_HALF + 0.2, -20, 120, -0.05, 0.16, kerb)
    gw = S.mat_gutter()
    S.box("gutter_left", -ROAD_HALF, -ROAD_HALF + 0.5, -20, 120, -0.05, 0.003, gw)
    S.box("gutter_right", ROAD_HALF - 0.5, ROAD_HALF, -20, 120, -0.05, 0.003, gw)


def default_frontage():
    """La façade actuelle du film (le petit hôtel de scene_a, 22 m) : la référence à battre."""
    M = S.city_mats()
    ob, props, lights, spec = S.prototypes_one(M, "hotel")
    x, y0 = LOT["x"], LOT["y0"] - 1.0
    inst = S.instance(ob, "lot_hotel", (x, y0, 0))
    inst.color = (*S.lin("#f6d2b0")[:3], 1)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    hidden_collection().objects.link(ob)
    # ses climatiseurs et ses lumières, comme place() dans scene_a
    ac = [S.source([o], f"ac_src_{i}", hidden_collection()) for i, o in enumerate(S.import_glb("exterior_aircon_unit/exterior_aircon_unit.gltf"))]
    for j, (pk, (px, py, pz), rot, s) in enumerate(props):
        if pk == "ac":
            S.instance(ac[j % len(ac)], f"ac_{j}", (x + px, y0 + py, pz), rot, s)
    warm = S.lin("#ffd9a8")
    for j, (lk, (lx, ly, lz), w) in enumerate(lights):
        loc = (x + lx, y0 + ly, lz)
        if lk == "shop":
            S.add_light(f"shop_{j}", "AREA", loc, (1, 0, -0.35), S.lin("#ffcf96"), 90.0 * w / 3, (w, 2.2))
        elif lk == "canopy":
            S.add_light(f"canopy_{j}", "AREA", loc, (0.2, 0, -1), warm, 260.0, (w, 2.2))
        elif lk == "blade":
            S.add_light(f"blade_{j}", "SPOT", loc, (-0.35, 0, 1), warm, 900.0, spot=28)
    yy = 1.5
    while yy < spec["W"] - 1:
        S.add_light(f"up_{int(yy)}", "SPOT", (x + 0.45, y0 + yy, spec.get("gf_h", 4.2) + 0.1), (-0.16, 0, 1), S.lin("#ffe2bf"), 700.0, spot=60)
        yy += 4.0
    return inst


def neighbours():
    """Deux voisins sombres et simples de part et d'autre de la parcelle, et le fond de l'îlot :
    la parcelle ne flotte pas dans le ciel, sans voler la vedette."""
    st = S.mat_plain("neighbour", S.lin("#5d5560"), 0.8)
    win = S.mat_emit("neighbour_win", S.lin("#ffc98a"), 1.5)
    x = LOT["x"]
    for name, y0, y1, h in (("nb_near", -20.0, LOT["y0"] - 0.05, 7.5), ("nb_far", LOT["y1"] + 0.05, 70.0, 16.0)):
        S.box(name, x - 16, x, y0, y1, 0, h, st)
        # quelques fenêtres allumées, pour que le voisin vive un peu
        for k in range(int((y1 - y0) / 4)):
            for f in range(1, int(h / 3.2)):
                if (k * 7 + f * 3) % 5 == 0:
                    yy = y0 + 1.2 + k * 4
                    S.box(f"{name}_w{k}_{f}", x, x + 0.02, yy, yy + 1.4, f * 3.2 + 0.9, f * 3.2 + 2.3, win)
    S.box("block_back", x - 60, x - 16, -20, 120, 0, 18, st)


def setup(road=True, frontage=False, palms_on=True, lamps=True):
    """Construit le banc. road=False : la chaussée et les trottoirs sont à la méthode ;
    frontage=True : la façade actuelle du film est posée sur la parcelle (la référence) ;
    palms_on=False : les palmiers sont à la méthode."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    hidden_collection()
    S.make_world(scene)
    S.render_settings(scene)
    if road:
        default_road()
    neighbours()
    if frontage:
        default_frontage()
    if lamps:
        streetlamps([(-ROAD_HALF - 0.6, 6.0), (-ROAD_HALF - 0.6, 36.0), (ROAD_HALF + 0.6, 22.0)])
    if palms_on:
        palms(PALM_SPOTS)
    # la lumière de cinéma de scene_a : un grand réflecteur doux au-dessus de l'avenue, tourné
    # vers les façades, invisible à la caméra et dans les reflets
    f = S.add_light("fill", "AREA", (0.5, 24.0, 9.0), (-1, 0, -0.18), S.lin("#ffd2c0"), 2200.0, (32.0, 9.0))
    f.visible_camera = f.visible_glossy = f.visible_transmission = False
    # les deux caméras du banc
    camera("cam_large", (-2.4, 3.0, 1.35), (-11.0, 26.0, 5.0), 24, (-10.5, 24.0, 3.0))
    camera("cam_pres", (-4.2, 15.0, 1.55), (-11.5, 25.5, 3.6), 30, (-11.5, 24.0, 3.0))
    scene.camera = bpy.data.objects["cam_large"]
    return scene


def render(name, which=("large", "pres"), save_blend=False):
    """Rend les deux caméras à la même définition et au même nombre d'échantillons pour tous."""
    scene = bpy.context.scene
    r, c = scene.render, scene.cycles
    r.resolution_x, r.resolution_y = RES
    r.resolution_percentage = 100
    r.threads_mode = "FIXED"
    r.threads = 2
    c.device = "CPU"
    if os.environ.get("BENCH_GPU"):
        # BENCH_GPU=1 : Metal, toutes les cartes de la machine
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "METAL"
        c.device = "GPU"
    c.samples = SAMPLES
    c.use_denoising = True
    os.makedirs(LAB, exist_ok=True)
    if save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(LAB, f"{name}.blend"), compress=True)
    for w in which:
        scene.camera = bpy.data.objects[f"cam_{w}"]
        r.filepath = os.path.join(LAB, f"{name}-{w}.png")
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"[bench] {name}-{w} : {RES[0]}×{RES[1]}, {SAMPLES} éch., {time.time() - t0:.0f} s -> {r.filepath}", flush=True)
