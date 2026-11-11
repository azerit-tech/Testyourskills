# Rend les planches de la distribution depuis cast.blend (cast.py).
#
#   lockf -k <verrou> nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     -P tools/film3d/cast_render.py -- --sheet interieur|personnes|contrejour|vehicules [--samples 96]
#
# Écrit Azerit/design/film/ref/cast-interieur.png, cast-personnes.png,
# cast-personnes-contrejour.png, cast-vehicules.png. CPU, 2 fils par défaut.
import argparse
import math
import os
import subprocess
import sys

import bpy
from mathutils import Vector

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
REF = os.path.join(os.path.dirname(ASSETS), "ref")

SHEETS = {
    # nom : (collection montrée, caméra, fichier, résolution)
    "interieur": ("cast_interior", "cam_interior", "cast-interieur.png", (540, 960)),
    "personnes": ("cast_people", "cam_people_front", "cast-personnes.png", (1600, 900)),
    "contrejour": ("cast_people", "cam_people_back", "cast-personnes-contrejour.png", (1600, 900)),
    "vehicules": ("cast_vehicles", "cam_vehicles", "cast-vehicules.png", (1600, 900)),
}

ap = argparse.ArgumentParser()
ap.add_argument("--sheet", default="interieur", choices=sorted(SHEETS))
ap.add_argument("--samples", type=int, default=96)
ap.add_argument("--threads", type=int, default=2)
ap.add_argument("--scale", type=int, default=100, help="pourcentage de la résolution")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

bpy.ops.wm.open_mainfile(filepath=os.path.join(ASSETS, "cast.blend"))
scene = bpy.context.scene
show, cam, out, res = SHEETS[args.sheet]
for col in scene.collection.children:
    col.hide_render = col.name != show
scene.camera = bpy.data.objects[cam]
light_prefix = {"personnes": "front_", "contrejour": "back_"}.get(args.sheet)
if light_prefix:
    for o in bpy.data.collections[show].all_objects:
        if o.type == "LIGHT" and o.name.startswith(("front_", "back_")):
            o.hide_render = not o.name.startswith(light_prefix)
    world = bpy.data.worlds.get(f"world_{args.sheet}")
    if world:
        scene.world = world
elif bpy.data.worlds.get(f"world_{args.sheet}"):
    scene.world = bpy.data.worlds[f"world_{args.sheet}"]

r = scene.render
r.engine = "CYCLES"
c = scene.cycles
c.device = "CPU"
r.threads_mode = "FIXED"
r.threads = args.threads
c.samples = args.samples
c.use_denoising = True
c.use_adaptive_sampling = True
r.resolution_x, r.resolution_y = res
r.resolution_percentage = args.scale
r.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
os.makedirs(REF, exist_ok=True)
r.filepath = os.path.join(REF, out)
bpy.ops.render.render(write_still=True)
print(f"[cast_render] écrit {r.filepath}", flush=True)
