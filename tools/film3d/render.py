# Rend une image fixe d'une scène du film, puis pose le grain et la vignette.
#
#   nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     -P tools/film3d/render.py -- [--preview] [--samples N] [--threads 2] [--gpu] [--scene scene-a.blend] [--out test-a.png]
#
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

if args.blur:
    r.use_motion_blur = True
    r.motion_blur_shutter = 0.5
if args.preview:
    r.resolution_percentage = 50
    c.samples = 64
if args.samples:
    c.samples = args.samples

base = os.path.splitext(args.scene)[0].replace("scene-", "test-")
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
