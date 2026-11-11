# Banc A : plan fixe rapproché de l'hôtel (y 48 à 70) sur la scène mélange, sans flou de bougé,
# pour juger le détail des façades. Dans le même processus : A_BUILD=1 reconstruit d'abord la
# scène (scene_a, FILM3D_FACADE=mix), sinon ouvre le .blend déjà écrit.
#
#   FILM3D_FACADE=mix FILM3D_ROUTE=base FILM3D_BLEND=scene-a-facade-mix.blend A_BUILD=1 \
#     blender -b -t 2 --factory-startup -P tools/film3d/lab/A_pres.py -- --out …/immeubles-mix-pres.png
import argparse
import os
import runpy
import shutil
import subprocess
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--samples", type=int, default=128)
ap.add_argument("--percent", type=int, default=75)
ap.add_argument("--cpu", action="store_true")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

if os.environ.get("A_BUILD"):
    runpy.run_path(os.path.join(HERE, "scene_a.py"), run_name="__main__")
else:
    import scene_a
    bpy.ops.wm.open_mainfile(filepath=os.path.join(scene_a.ASSETS, os.environ.get("FILM3D_BLEND", "scene-a-facade-mix.blend")))

scene = bpy.context.scene
r, c = scene.render, scene.cycles
r.threads_mode = "FIXED"
r.threads = 2
r.use_motion_blur = False
c.device = "CPU"
if not args.cpu:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "METAL"
    if any(d.use for d in prefs.devices):
        c.device = "GPU"
print(f"[pres] appareil : {c.device}", flush=True)
c.samples = args.samples
r.resolution_percentage = args.percent

# la caméra : debout sur le trottoir d'en face (x ≈ +8), trois quarts sur l'hôtel (y 48 à 70) ;
# 55 mm à ~24 m : le rez-de-chaussée et deux étages remplissent le cadre vertical
FRONT_X = -11.5
cam_d = bpy.data.cameras.new("cam_pres_mix")
cam_d.lens = 55
cam_d.dof.use_dof = True
cam_d.dof.aperture_fstop = 8.0
cam = bpy.data.objects.new("cam_pres_mix", cam_d)
scene.collection.objects.link(cam)
cam.location = (8.0, 42.0, 1.7)
target = Vector((FRONT_X, 57.0, 5.4))
cam.rotation_mode = "XYZ"
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
foc = bpy.data.objects.new("cam_pres_focus", None)
scene.collection.objects.link(foc)
foc.location = (FRONT_X + 0.3, 57.0, 4.0)
cam_d.dof.focus_object = foc
scene.camera = cam
for name in ("coupe", "police"):
    ob = bpy.data.objects.get(name)
    if ob is not None:
        for o in [ob, *ob.children_recursive]:
            o.hide_render = True

out = args.out
raw = os.path.splitext(out)[0] + "-raw.png"
r.filepath = raw
t0 = time.time()
bpy.ops.render.render(write_still=True)
print(f"[pres] {r.resolution_x * r.resolution_percentage // 100}×{r.resolution_y * r.resolution_percentage // 100}, "
      f"{c.samples} éch., {c.device} : {time.time() - t0:.1f} s", flush=True)
ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
if os.path.exists(ffmpeg):
    subprocess.run(["nice", "-n", "19", ffmpeg, "-loglevel", "error", "-y", "-threads", "2", "-i", raw, "-vf",
                    "vignette=angle=0.42,noise=c0s=5:c0f=t:c1s=1.7:c2s=1.7", out], check=True)
else:
    shutil.copy(raw, out)
print(f"[pres] écrit {out}", flush=True)
