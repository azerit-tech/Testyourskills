# Rend une image fixe des lieux de la ville (scene-b.blend, la rue des enseignes, et les scènes du carrefour),
# avec la qualité en argument : la même scène sort en cadrage rapide sur le Mac et en qualité finale ailleurs.
#
#   lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     -P tools/film3d/render_b.py -- [--scene scene-b.blend] [--engine workbench|cycles] [--percent 50] \
#     [--samples 32] [--gpu] [--threads 2] [--out chemin.png] [--grain 0]
#
# --engine workbench (par défaut) : le cadrage, l'échelle et la composition. Couleurs des objets (la teinte des
#   immeubles) et des matières (couleur de base ou d'émission recopiée dans leur couleur d'affichage), lumière de
#   studio, brumes masquées ; 360 × 640 en quelques secondes, sans compilation de noyaux.
# --engine cycles : la lumière et le look. Processeur par défaut, 2 fils, débruiteur ; --gpu sur une machine louée.
# --percent : taille en % de 720 × 1280 (50 : 360 × 640 ; 100 : la qualité finale).
# Sortie : Azerit/design/film/ref/lieux/<scène>-<moteur>.png par défaut.
import argparse
import os
import shutil
import subprocess
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def main_checkout():
    try:
        common = subprocess.run(["git", "-C", ROOT, "rev-parse", "--git-common-dir"], capture_output=True, text=True,
                                check=True).stdout.strip()
        return os.path.dirname(os.path.abspath(os.path.join(ROOT, common)))
    except Exception:
        return ROOT


FILM = os.path.join(os.path.dirname(main_checkout()), "design", "film")
ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(FILM, "assets")

ap = argparse.ArgumentParser()
ap.add_argument("--scene", default="scene-b.blend")
ap.add_argument("--engine", default="workbench", choices=("workbench", "cycles"))
ap.add_argument("--percent", type=int, default=50)
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--threads", type=int, default=2)
ap.add_argument("--gpu", action="store_true")
ap.add_argument("--out", default=None)
ap.add_argument("--grain", type=float, default=0.0, help="grain ffmpeg (0 = aucun)")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

bpy.ops.wm.open_mainfile(filepath=os.path.join(ASSETS, args.scene))
scene = bpy.context.scene
r = scene.render
r.resolution_percentage = args.percent
r.threads_mode = "FIXED"
r.threads = max(1, args.threads)


def display_colours():
    """Workbench lit la couleur d'affichage des matières : on y recopie la couleur de base (ou d'émission) quand
    elle n'est pas branchée, pour que le cadrage se lise (néons clairs, carrosseries, enduits)."""
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        for n in m.node_tree.nodes:
            if n.type == "EMISSION" and not n.inputs["Color"].links:
                m.diffuse_color = n.inputs["Color"].default_value
                break
            if n.type == "BSDF_PRINCIPLED":
                if n.inputs["Emission Strength"].default_value > 0.5 and not n.inputs["Emission Color"].links:
                    m.diffuse_color = n.inputs["Emission Color"].default_value
                elif not n.inputs["Base Color"].links:
                    m.diffuse_color = n.inputs["Base Color"].default_value
                break


if args.engine == "workbench":
    r.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_cavity = True
    sh.show_shadows = False
    display_colours()
    for o in bpy.data.objects:
        # les brumes sont des volumes : en Workbench elles feraient des boîtes pleines
        if o.name.startswith("haze") or o.name.startswith("spray_"):
            o.hide_render = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.use_nodes = False
    try:
        scene.compositing_node_group = None
    except Exception:
        pass
else:
    r.engine = "CYCLES"
    c = scene.cycles
    c.samples = args.samples
    c.use_denoising = True
    c.device = "CPU"
    if args.gpu:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "METAL", "HIP", "ONEAPI"):
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
                print(f"[render_b] GPU {kind}", flush=True)
                break

base = os.path.splitext(args.scene)[0]
out = args.out or os.path.join(FILM, "ref", "lieux", f"{base}-{args.engine}.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
raw = os.path.splitext(out)[0] + "-raw.png" if args.grain > 0 else out
r.filepath = raw
r.image_settings.file_format = "PNG"
t0 = time.time()
bpy.ops.render.render(write_still=True)
print(f"[render_b] {args.engine}, {r.resolution_x * args.percent // 100}×{r.resolution_y * args.percent // 100}, "
      f"{args.samples if args.engine == 'cycles' else '-'} éch. : {time.time() - t0:.1f} s", flush=True)
ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
if args.grain > 0 and os.path.exists(ffmpeg):
    vf = f"vignette=angle=0.42,noise=c0s={args.grain:.1f}:c0f=t:c1s={args.grain / 3:.1f}:c2s={args.grain / 3:.1f}"
    subprocess.run(["nice", "-n", "19", ffmpeg, "-loglevel", "error", "-y", "-threads", "1", "-i", raw, "-vf", vf, out],
                   check=True)
print(f"[render_b] écrit {out}", flush=True)
