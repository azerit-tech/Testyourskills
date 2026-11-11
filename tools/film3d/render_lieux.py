# Construit un plan d'un lieu au bord de l'eau et en rend l'image fixe d'essai.
#
#   FILM3D_HERO=w111 lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     --factory-startup -P tools/film3d/render_lieux.py -- --lieu pont|pointe --plan P4 [--palier socle] \
#     [--engine workbench|cycles] [--percent 50] [--samples 32] [--gpu] [--no-save] [--grain 7] [--no-render]
#
# Les lieux et leurs plans : pont (scene_c.py) P4 ; pointe, la jetée et la pointe (scene_d.py) P6, FIN, FIN6.
# Écrit Azerit/design/film/ref/lieux/<lieu>-<plan>-<palier>.png (et -raw.png sans grain ni vignette ; en Workbench
# <lieu>-<plan>-<palier>-cadrage.png), et la scène assets/scene-<c|d>-<plan>.blend (sauf --no-save).
#
# Sur le Mac de Jacques (règle du 11 novembre au soir) : le cadrage en Workbench (par défaut, 360 × 640, couleurs
# au hasard par objet, brume et fumée cachées), la lumière en Cycles sur le processeur, deux fils, 360 × 640,
# 32 échantillons, débruiteur : --engine cycles. Jamais la carte graphique.
# Sur la machine louée, la même scène telle quelle : --engine cycles --gpu --percent 100 --samples 256.
import argparse
import os
import shutil
import subprocess
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lieux as L  # noqa: E402

LIEUX = {"pont": ("scene_c", "c"), "pointe": ("scene_d", "d")}

ap = argparse.ArgumentParser()
ap.add_argument("--lieu", required=True, choices=sorted(LIEUX))
ap.add_argument("--plan", required=True)
ap.add_argument("--palier", default="socle")
ap.add_argument("--engine", default="workbench", choices=("workbench", "cycles"))
ap.add_argument("--color", default="RANDOM", help="Workbench : RANDOM, MATERIAL, OBJECT, TEXTURE")
ap.add_argument("--percent", type=int, default=50)
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--gpu", action="store_true", help="carte graphique (machine louée seulement)")
ap.add_argument("--threads", type=int, default=2)
ap.add_argument("--no-save", action="store_true")
ap.add_argument("--no-render", action="store_true")
ap.add_argument("--grain", type=float, default=7.0)
ap.add_argument("--out", default=None)
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

mod_name, letter = LIEUX[args.lieu]
mod = __import__(mod_name)
t0 = time.time()
scene = mod.build(args.plan, args.palier)
tri, nl = L.stats()
print(f"[lieux] {args.lieu} {args.plan} ({args.palier}) construit en {time.time() - t0:.0f} s : "
      f"{tri / 1e6:.2f} M triangles distincts, {nl} lumières", flush=True)

if not args.no_save:
    blend = os.path.join(L.ASSETS, f"scene-{letter}-{args.plan}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    print(f"[lieux] écrit {blend}", flush=True)

if args.no_render:
    sys.exit(0)

r, c = scene.render, scene.cycles
r.threads_mode = "FIXED"
r.threads = max(1, args.threads)
r.resolution_percentage = args.percent
suffix = ""
if args.engine == "workbench":
    # le cadrage : volumes cachés (en Workbench une boîte de brume serait un mur), pas de compositing
    for ob in scene.objects:
        if ob.type == "MESH" and ob.name.startswith(("haze", "fumee")):
            ob.hide_render = True
    r.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = args.color
    sh.background_type = "VIEWPORT"
    sh.background_color = (0.05, 0.06, 0.12)
    sh.show_shadows = False
    sh.show_cavity = False
    scene.display.render_aa = "8"
    scene.compositing_node_group = None
    r.use_motion_blur = False
    suffix = "-cadrage"
    args.grain = 0
else:
    c.device = "CPU"
    if args.gpu:
        L.use_gpu(scene)
    c.samples = args.samples
    c.use_denoising = True
out = args.out or os.path.join(L.FILM, "ref", "lieux", f"{args.lieu}-{args.plan}-{args.palier}{suffix}.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
raw = os.path.splitext(out)[0] + "-raw.png" if args.grain > 0 else out
r.filepath = raw
t1 = time.time()
bpy.ops.render.render(write_still=True)
print(f"[lieux] rendu {args.engine} {r.resolution_x * args.percent // 100}×{r.resolution_y * args.percent // 100}, "
      f"{c.samples if args.engine == 'cycles' else '-'} éch., {c.device if args.engine == 'cycles' else 'workbench'} : "
      f"{time.time() - t1:.0f} s", flush=True)
ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
if args.grain > 0 and os.path.exists(ffmpeg):
    vf = f"vignette=angle=0.42,noise=c0s={args.grain:.1f}:c0f=t:c1s={args.grain / 3:.1f}:c2s={args.grain / 3:.1f}"
    subprocess.run(["nice", "-n", "19", ffmpeg, "-loglevel", "error", "-y", "-threads", "2", "-i", raw, "-vf", vf, out], check=True)
elif raw != out:
    shutil.copy(raw, out)
print(f"[lieux] écrit {out}", flush=True)
