# Rend une image fixe d'une scène du film, puis pose le grain et la vignette.
#
#   nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     -P tools/film3d/render.py -- [--preview] [--samples N] [--threads 2] [--gpu] [--scene scene-a.blend] [--out test-a.png]
#
# --shot    : a (ouverture), b (drone), c (trois quarts arrière), d (profil) ; b à d ont le flou de bougé.
# --blur    : flou de bougé (obturateur 180°) sur l'image 2 de la scène animée.
# --preview : demi-taille (360 × 640), 64 échantillons, pour itérer.
# --threads : 2 par défaut (le Mac reste utilisable) ; 0 = tous les cœurs.
# --gpu     : Metal (ou CUDA/OptiX sur une machine louée) ; CPU par défaut.
# La sortie va dans Azerit/design/film/ref/ ; le grain est posé par ffmpeg
# (même plafond de threads), dans l'espace d'affichage, comme un vrai grain.
import argparse
import os
import shutil
import subprocess
import sys
import time

import bpy
from mathutils import Vector

# Les plans du storyboard tirés de la même scène (docs/cinematique-poursuite.md §2.3).
# a : l'ouverture (la scène telle qu'enregistrée). b : vue de drone, deux patrouilles,
# gyrophares allumés. c : trois quarts arrière bas, une patrouille collée, flou de bougé.
# d : travelling latéral à hauteur de roue, le décor file en flou de bougé.
SHOT_NAMES = {"a": "test-a", "b": "test-b-drone", "c": "test-c-arriere", "d": "test-d-profil"}
LANE_X = -1.75
CORAL, LILAC = (1.0, 0.144, 0.047), (0.266, 0.262, 0.871)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def main_checkout():
    try:
        common = subprocess.run(["git", "-C", ROOT, "rev-parse", "--git-common-dir"], capture_output=True, text=True, check=True).stdout.strip()
        return os.path.dirname(os.path.abspath(os.path.join(ROOT, common)))
    except Exception:
        return ROOT


FILM = os.path.join(os.path.dirname(main_checkout()), "design", "film")
ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(FILM, "assets")

ap = argparse.ArgumentParser()
ap.add_argument("--scene", default="scene-a.blend")
ap.add_argument("--out", default=None)
ap.add_argument("--preview", action="store_true")
ap.add_argument("--samples", type=int, default=None)
ap.add_argument("--threads", type=int, default=2)
ap.add_argument("--gpu", action="store_true")
ap.add_argument("--blur", action="store_true", help="flou de bougé, obturateur à 180°, écrit test-?-blur.png")
ap.add_argument("--shot", default="a", choices="abcd", help="a ouverture, b drone, c arrière, d profil")
ap.add_argument("--grain", type=float, default=7.0, help="intensité du grain ffmpeg (0 = aucun)")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

bpy.ops.wm.open_mainfile(filepath=os.path.join(ASSETS, args.scene))
scene = bpy.context.scene
r = scene.render
c = scene.cycles

if args.threads > 0:
    r.threads_mode = "FIXED"
    r.threads = args.threads
else:
    r.threads_mode = "AUTO"

c.device = "CPU"
if args.gpu:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type == kind]
        if devs:
            for d in prefs.devices:
                d.use = d.type == kind
            c.device = "GPU"
            print(f"[render] GPU {kind} : {', '.join(d.name for d in devs)}", flush=True)
            break
    else:
        print("[render] aucun GPU trouvé, rendu sur CPU", flush=True)

def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def keys(ob, path, values):
    """values : {image: valeur} sur un seul axe ; interpolation linéaire."""
    for f, (idx, v) in values.items():
        getattr(ob, path)[idx] = v
        ob.keyframe_insert(path, index=idx, frame=f)
    act = ob.animation_data.action
    curves = list(getattr(act, "fcurves", []) or [])
    if not curves:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def drive(objs, speed, wheels=()):
    """Tout avance vers +y à `speed` m/s autour de l'image 2 ; les roues roulent."""
    for ob in objs:
        y = ob.location.y
        keys(ob, "location", {1: (1, y - speed / 24), 3: (1, y + speed / 24)})
        ob.location.y = y
    for w in wheels:
        a = speed / 0.38 / 24
        keys(w, "rotation_euler", {1: (0, -a), 3: (0, a)})
        w.rotation_euler.x = 0


def lights_on(police):
    """Rampe allumée, corail d'un côté, violette de l'autre, et la lumière qu'elle jette."""
    for i, m in enumerate(police.data.materials):
        if m and m.name.startswith("lightbar_lenses") and "lightbar_on" not in bpy.data.materials:
            on = m.copy()
            on.name = "lightbar_on"
            nt = on.node_tree
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            nt.links.new(bsdf.inputs["Base Color"].links[0].from_socket, bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = 14.0  # au-delà, AgX le blanchit
        if m and m.name.startswith("lightbar_lenses"):
            police.data.materials[i] = bpy.data.materials["lightbar_on"]


def bar_lights(police, tag, strong=False):
    """La rampe allumée : des faisceaux figés en plein balayage. Par défaut deux, vers l'avant et
    de biais ; `strong` (le drone) : quatre, deux qui fauchent la chaussée, deux qui lèchent les
    couronnes des palmiers, dans une brume locale qui les rend visibles."""
    if strong:
        beams = [(CORAL, (0.55, 0.55, -0.55), 30000, 34), (LILAC, (-0.6, 0.45, -0.55), 30000, 34),
                 (CORAL, (1.0, 0.15, 0.8), 45000, 20), (LILAC, (-1.0, 0.25, 0.8), 45000, 20)]
    else:
        beams = None
    if beams is None:
        for side, col in ((1, CORAL), (-1, LILAC)):
            L = bpy.data.lights.new(f"bar_{tag}_{side}", "SPOT")
            L.color = col
            L.energy = 9000
            L.shadow_soft_size = 0.08
            L.spot_size = 1.2
            L.spot_blend = 0.7
            lo = bpy.data.objects.new(L.name, L)
            scene.collection.objects.link(lo)
            lo.parent = police
            lo.location = (-0.26, side * 0.3, 2.2)
            # l'axe du spot (−z) basculé de 72° vers l'horizontale, puis tourné vers l'avant (+x) de biais
            lo.rotation_euler = (math.radians(72), 0, math.radians(-90 + side * 40))
        return
    bpy.context.view_layer.update()
    top = police.matrix_world @ Vector((-0.26, 0, 1.6))
    for k, (col, d, energy, size) in enumerate(beams):
        L = bpy.data.lights.new(f"bar_{tag}_{k}", "SPOT")
        L.color = col
        L.energy = energy
        L.shadow_soft_size = 0.05
        L.spot_size = math.radians(size)
        L.spot_blend = 0.35
        lo = bpy.data.objects.new(L.name, L)
        scene.collection.objects.link(lo)
        lo.location = top + Vector((0.3 if d[0] > 0 else -0.3, 0, 0))
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = Vector(d).normalized().to_track_quat("-Z", "Y")
        bpy.context.view_layer.update()
        mw = lo.matrix_world.copy()
        lo.parent = police
        lo.matrix_world = mw


def local_haze(c, half, density):
    """Une brume plus dense autour de la poursuite : les faisceaux y prennent corps."""
    m = bpy.data.materials.new("haze_local")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (0.75, 0.72, 0.85, 1)
    vol.inputs["Density"].default_value = density
    vol.inputs["Anisotropy"].default_value = 0.3
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    bpy.ops.mesh.primitive_cube_add(location=c)
    ob = bpy.context.active_object
    ob.name = "haze_local"
    ob.scale = half
    ob.data.materials.append(m)
    ob.visible_shadow = False


def patrol_copy(police, name):
    ob = bpy.data.objects.new(name, police.data)
    scene.collection.objects.link(ob)
    ob.rotation_mode = "XYZ"
    return ob


if args.shot != "a":
    import math
    coupe = bpy.data.objects["coupe"]
    police = bpy.data.objects["police"]
    cam = scene.camera
    focus = bpy.data.objects["focus"]
    wheels = [o for o in coupe.children if o.name.startswith("wheel_")]
    for ob in [coupe, police, cam, focus, *wheels]:
        ob.animation_data_clear()
    coupe.rotation_euler = (0, 0, math.pi)
    for w in wheels:
        w.rotation_euler = (0, 0, 0)
    police.rotation_euler = (0, 0, math.pi / 2)
    cam.data.shift_y = 0
    r.use_motion_blur = True
    r.motion_blur_shutter = 0.5
    if args.shot == "b":
        Y0 = 70.0
        coupe.location = (LANE_X, Y0, 0)
        police.location = (-5.0, Y0 - 9, 0)
        p2 = patrol_copy(police, "police_2")
        p2.rotation_euler = police.rotation_euler
        p2.location = (LANE_X + 0.2, Y0 - 16, 0)
        lights_on(police)
        bar_lights(police, "1", strong=True)
        bar_lights(p2, "2", strong=True)
        local_haze((0, Y0 - 8, 8), (16, 26, 8), 0.006)
        cam.data.lens = 26
        cam.data.dof.aperture_fstop = 8.0
        cam.location = (-3.0, Y0 - 30, 17)
        look_at(cam, (-2.4, Y0 + 13, 0))
        focus.location = (LANE_X, Y0, 0.5)
        drive([coupe, police, p2, cam, focus], 70 / 3.6, wheels)
    elif args.shot == "c":
        Y0 = 40.0
        coupe.rotation_euler = (0, 0, math.pi + math.radians(7))
        coupe.location = (LANE_X, Y0, 0)
        police.location = (LANE_X - 1.0, Y0 - 6.0, 0)
        lights_on(police)
        bar_lights(police, "1")
        for sp in [o for o in coupe.children if o.name.startswith("spray_")]:
            sp.scale = (0.6, 2.0, 0.5)
            sp.location.y = 3.4
        cam.data.lens = 40
        cam.data.dof.aperture_fstop = 2.8
        cam.location = (LANE_X + 3.0, Y0 - 12.5, 0.5)
        look_at(cam, (LANE_X - 0.4, Y0 - 2.5, 0.95))
        focus.location = (LANE_X + 0.6, Y0 - 2.2, 0.7)
        drive([coupe, police, cam, focus], 90 / 3.6, wheels)
    else:
        Y0 = 60.0
        coupe.location = (LANE_X, Y0, 0)
        cam.data.lens = 24
        cam.data.dof.aperture_fstop = 2.8
        cam.location = (LANE_X + 8.0, Y0, 0.45)  # sur la chaussée, voie d'en face
        cam.rotation_mode = "XYZ"
        cam.rotation_euler = (math.radians(90), 0, math.radians(90))
        cam.data.shift_y = 0.03
        focus.location = (LANE_X + 1.0, Y0, 0.6)
        drive([coupe, cam, focus], 90 / 3.6, wheels)
    scene.frame_set(2)

if args.blur:
    r.use_motion_blur = True
    r.motion_blur_shutter = 0.5
if args.preview:
    r.resolution_percentage = 50
    c.samples = 64
if args.samples:
    c.samples = args.samples

base = SHOT_NAMES[args.shot] if args.scene == "scene-a.blend" else os.path.splitext(args.scene)[0].replace("scene-", "test-")
out = args.out or os.path.join(FILM, "ref", base + ("-blur" if args.blur else "") + ("-preview" if args.preview else "") + ".png")
raw = os.path.splitext(out)[0] + "-raw.png"
r.filepath = raw
t0 = time.time()
bpy.ops.render.render(write_still=True)
dt = time.time() - t0
print(f"[render] {r.resolution_x * r.resolution_percentage // 100}×{r.resolution_y * r.resolution_percentage // 100}, "
      f"{c.samples} éch., {c.device}, {r.threads if r.threads_mode == 'FIXED' else 'tous les'} threads : {dt:.1f} s", flush=True)

ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
if args.grain > 0 and os.path.exists(ffmpeg):
    vf = f"vignette=angle=0.42,noise=c0s={args.grain:.1f}:c0f=t:c1s={args.grain / 3:.1f}:c2s={args.grain / 3:.1f}"
    cmd = ["nice", "-n", "19", ffmpeg, "-loglevel", "error", "-y", "-threads", str(max(args.threads, 1) if args.threads else 0), "-i", raw, "-vf", vf, out]
    subprocess.run(cmd, check=True)
else:
    shutil.copy(raw, out)
print(f"[render] écrit {out}", flush=True)
