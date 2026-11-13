# La rue des enseignes rognée pour la ville, vue de dessus (pour la machine louée) : la scène de P3 (cache de
# debit.py), sa boîte englobante dans le repère de la rue (y = s) et dans celui de la ville (y − 506), les objets
# qui passent les joints (s 91 et le quai), deux vues de dessus en gris (Workbench).
#   blender -b --factory-startup -P tools/film3d/diag/rue_ville.py -- --out DIR [--tag nom] [--p3] [--far]
# --p3 : aussi P3/1, 24 et 48 en gris depuis le bras commun de parcours.py ; --far : construit à la place la rue vue
# de loin (scene_b.build_far) dans une scène vide, vue de dessus, du bras de P1/1 et du 200 mm du pont.
# FILM3D_VILLE choisit la rue (1 : rognée pour la ville, 0 : autonome).
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--tag", default="ville")
ap.add_argument("--far", action="store_true")
ap.add_argument("--p3", action="store_true", help="aussi P3/1, 24, 48 depuis le bras de parcours.py (P3 porté)")
a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:])
os.makedirs(a.out, exist_ok=True)
os.environ["FILM3D_PLAN"] = "P3"
os.environ.setdefault("FILM3D_BLEND", os.path.join(a.out, "scene.blend"))

import debit  # noqa: E402
import scene_b as B  # noqa: E402

MOVING = ("coupe", "rig_", "patrol", "agent_", "wheel", "cam", "focus", "haze", "muzzle", "cone_", "panel_",
          "crowd_", "repere", "hero_", "spray", "fumee", "ciel", "sky", "trace")
if a.far:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    B.build_far()
    B.build_far(kind="quai")
else:
    scene, how, t, _ = debit.cached_build("P3", None, B.build, B.ASSETS)
    print(f"[rue] scène {how} en {t:.0f} s", flush=True)
bpy.context.view_layer.update()


def hidden(o):
    return any(c.hide_render for c in o.users_collection) or o.hide_render


lo, hi, out = Vector((1e9,) * 3), Vector((-1e9,) * 3), []
n = 0
for o in scene.objects:
    if o.type not in ("MESH", "CURVE") or hidden(o) or o.name.startswith(MOVING):
        continue
    if o.parent and o.parent.name.startswith(MOVING):
        continue
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    if a.far:
        pts = [Vector((p.x, p.y + 506.0, p.z)) for p in pts]       # (la rue de loin est posée dans la ville)
    n += 1
    for p in pts:
        lo = Vector(map(min, lo, p))
        hi = Vector(map(max, hi, p))
    smin, smax = min(p.y for p in pts), max(p.y for p in pts)
    if smin < 90.95 or smax > 181.6:
        out.append((o.name, smin, smax, min(p.x for p in pts), max(p.x for p in pts)))
print(f"[rue] {n} objets de décor ; boîte (repère de la rue, y = s) : x {lo.x:.2f} .. {hi.x:.2f}, s {lo.y:.2f} .. "
      f"{hi.y:.2f}, z {lo.z:.2f} .. {hi.z:.2f}", flush=True)
print(f"[rue] boîte dans la ville : x {lo.x:.2f} .. {hi.x:.2f}, y {lo.y - 506:.2f} .. {hi.y - 506:.2f}", flush=True)
for name, s0, s1, x0, x1 in sorted(out, key=lambda r: r[1])[:60]:
    print(f"[rue] hors des joints : {name:40s} s {s0:8.2f} .. {s1:8.2f}  x {x0:8.2f} .. {x1:8.2f}", flush=True)
print(f"[rue] {len(out)} objets hors de s 91 .. 181,6", flush=True)
tall = sorted(((o.name, (o.matrix_world @ Vector(c)).z) for o in scene.objects if o.type == "MESH" and not hidden(o)
               and o.name.startswith(("bld_rue_tour", "quai_")) for c in o.bound_box), key=lambda r: -r[1])
seen = set()
for name, z in tall:
    if name not in seen:
        seen.add(name)
        print(f"[rue] haut de {name} : {z:.2f} m", flush=True)

# les vues de dessus, en gris
r = scene.render
r.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light, sh.color_type, sh.show_shadows, sh.show_cavity = "STUDIO", "RANDOM", False, False
scene.compositing_node_group = None
r.use_motion_blur = False
for ob in scene.objects:
    if ob.type == "MESH" and ob.name.startswith(("haze", "fumee", "spray_")):
        ob.hide_render = True
if a.p3 and not a.far:
    # la caméra du plan, au bras commun de la conduite unique (P3 porté : P3/1 caméra en s 95), en gris
    import parcours as PC
    pc = scene.camera
    pc.animation_data_clear()
    r.resolution_x, r.resolution_y, r.resolution_percentage = 360, 640, 100
    for f in (1, 24, 48):
        scene.frame_set(f)
        x, y, z = PC.camera("P3", f)
        pc.location = (x, y, z)
        pc.rotation_euler = (math.radians(90.0 - 8.71), 0.0, math.radians(PC.cam_cap("P3", f)))
        r.filepath = os.path.join(a.out, f"{a.tag}-p3-{f:04d}.png")
        bpy.ops.render.render(write_still=True)
cam = bpy.data.cameras.new("dessus")
cam.type = "ORTHO"
cam.clip_end = 5000
co = bpy.data.objects.new("dessus", cam)
scene.collection.objects.link(co)
scene.camera = co
views = [("dessus", (0.0, 136.0), 120.0, (1080, 1440)), ("joint", (0.0, 91.0), 40.0, (1080, 1080)),
         ("quai", (0.0, 170.0), 60.0, (1080, 1080))]
if a.far:
    views = [("dessus", (0.0, -506 + 136.0), 120.0, (1080, 1440))]
for tag, (x, y), size, (rx, ry) in views:
    cam.ortho_scale = size
    co.location = (x, y, 120.0)
    co.rotation_euler = (0, 0, 0)
    r.resolution_x, r.resolution_y, r.resolution_percentage = rx, ry, 100
    r.filepath = os.path.join(a.out, f"{a.tag}-{tag}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[rue] écrit {r.filepath}", flush=True)
if a.far:
    # depuis l'avenue (P1/1 : 53 m de la bouche de la rue), à 2,4 m, vers la rue
    cam.type = "PERSP"
    cam.lens = 24
    co.location = (-79.17, -434.60, 2.4)          # le bras de P1/1 dans la ville (parcours.vers_ville)
    co.rotation_euler = (math.radians(90 - 8.71), 0, math.radians(-90))
    r.resolution_x, r.resolution_y = 720, 1280
    r.filepath = os.path.join(a.out, f"{a.tag}-avenue.png")
    bpy.ops.render.render(write_still=True)
    co.location = (0.0, -60.0, 8.0)
    co.rotation_euler = (math.radians(89), 0, math.radians(180))
    cam.lens = 200
    r.filepath = os.path.join(a.out, f"{a.tag}-pont.png")
    bpy.ops.render.render(write_still=True)
