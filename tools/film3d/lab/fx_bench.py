# Le banc des interactions (fx.py) : la berline qui roule en ligne à 60 km/h, traverse une flaque, puis prend une
# courbe à gauche de 22 m de rayon en glisse (jusqu'à 22°) sur un enrobé mouillé ; une patrouille 14 m derrière,
# phares allumés (le contre-jour) ; trois lampadaires ambre. Deux caméras à 0,45 m :
#   rase   fixe, 3 m à gauche de la trace, devant la flaque : la berline vient vers elle et passe (gerbe, embruns,
#          papiers, rides)
#   suite  derrière la berline, 7 m en arrière et 1,2 m à gauche, qui la suit dans la courbe (fumée, embruns)
#   arriere  trois quarts arrière à 7,5 m, 1,4 m de haut, 28 mm (le découpage v3) : le sillage dans l'axe
#
# Sur la machine louée seulement (OptiX) :
#   FILM3D_ASSETS=~/film/assets ~/blender-5.2.2-linux-x64/blender -b --factory-startup -P tools/film3d/lab/fx_bench.py -- \
#       --cam rase --frames 14,18,22,26 --samples 64 --out ~/film/iter-fx/banc --tag apres
# Le banc active les effets (FILM3D_FX=1 par défaut ici) ; FILM3D_FX=0 donne l'« avant » ; FILM3D_FX_ONLY=eau|gomme|vol
# isole une famille.
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in (HERE, os.path.join(HERE, "lab")):
    if p not in sys.path:
        sys.path.insert(0, p)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

os.environ.setdefault("FILM3D_FX", "1")
import fx  # noqa: E402
import lieux as L  # noqa: E402
import motion as M  # noqa: E402
import road  # noqa: E402

FRAMES = 48
V = 60 / 3.6
X0 = 1.8
S1 = 22.0                    # la fin de la ligne droite (m)
R = 22.0                     # le rayon de la courbe à gauche
PUDDLE_T = 0.85              # la roue avant gauche entre dans la flaque vers cet instant


def path(t):
    s = V * t
    if s <= S1:
        return X0, s
    a = (s - S1) / R
    return X0 - R * (1 - math.cos(a)), S1 + R * math.sin(a)


def slip(t):
    s = V * t
    return 22.0 * M.smoothstep(S1 + 1.0, S1 + 7.0, s)


def look(cam, eye, target):
    cam.location = eye
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y")


def build(cam_kind):
    scene, hidden = L.new_scene()
    L.sky(scene, yaw=0.0)
    asphalt = road.mat_asphalt(L.ST, "rue_asphalt_banc")
    road.plane("banc_sol", 0.0, 30.0, 0.0, 90.0, 140.0, asphalt)
    src = L.lamp_source(hidden)
    for k, (x, y) in enumerate(((-5.0, 4.0), (-5.0, 26.0), (8.0, 38.0))):
        L.lamp(src, (x, y, 0.0), arm=(1.0 if x < 0 else -1.0, 0.0), energy=2600.0, name=f"lamp_banc_{k}")
    # la berline et sa trajectoire
    hero = L.hero()
    frames = range(0, FRAMES + 2)
    poses = M.sample(path, frames, slip=slip, wheel_r=hero["wheel_r"], wheelbase=2.75)
    M.key_vehicle(hero, poses, wheels=L.hero_wheels(hero))
    # la patrouille, 0,85 s derrière, sans glisse
    pat = L.patrol("patrol_banc")
    ppos = lambda t: path(t - 0.85) if t >= 0.85 else (X0, V * (t - 0.85))
    M.key_vehicle(pat, M.sample(ppos, frames, wheel_r=0.36, seed=2.0), pivot=(0.0, 0.0, 0.36))
    # la caméra
    cd = bpy.data.cameras.new("cam")
    cd.lens = 24.0
    cd.sensor_fit = "AUTO"
    cd.sensor_width = 36
    cd.clip_start = 0.05
    cd.clip_end = 3000
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = 4.0
    cam = bpy.data.objects.new("cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    if cam_kind == "rase":
        yp = V * PUDDLE_T
        look(cam, (X0 - 2.6, yp + 4.5, 0.45), (X0 - 0.3, yp - 6.0, 0.6))
        cd.dof.focus_distance = 5.0
    else:
        # suite : 7 m derrière, 1,2 m à gauche, à 0,45 m ; arriere (le découpage v3) : trois quarts arrière gauche,
        # 7,5 m derrière, 2,2 m à gauche, à 1,4 m, 28 mm, la berline vers 35 % de la largeur ; le sillage est dans
        # l'axe, entre elle et l'objectif
        back, side, high, aim = (7.0, 1.2, 0.45, 0.7) if cam_kind == "suite" else (7.5, 2.2, 1.4, 0.55)
        if cam_kind == "arriere":
            cd.lens = 28.0
        cam.rotation_mode = "QUATERNION"
        for f in frames:
            p = poses[f - frames[0]]
            h = math.radians(p["travel"])
            fwd = Vector((-math.sin(h), math.cos(h), 0.0))
            left = Vector((-fwd.y, fwd.x, 0.0))
            c = Vector((p["x"], p["y"], 0.0))
            eye = c - fwd * back + left * side + Vector((0, 0, high))
            look(cam, eye, c + fwd * (2.0 if cam_kind == "suite" else 0.6) + Vector((0, 0, aim)))
            cam.keyframe_insert("location", frame=f)
            cam.keyframe_insert("rotation_quaternion", frame=f)
        cd.dof.focus_distance = math.hypot(back, side)
    scene.frame_start, scene.frame_end = 1, FRAMES
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    return scene


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--cam", default="arriere", choices=("rase", "suite", "arriere"))
    ap.add_argument("--frames", default="18,22")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--res", default="360x640")
    ap.add_argument("--out", default=os.path.expanduser("~/film/iter-fx/banc"))
    ap.add_argument("--tag", default="apres")
    ap.add_argument("--kmh", type=float, default=60.0, help="la vitesse de la berline (la patrouille la suit)")
    a = ap.parse_args(argv)
    global V
    V = a.kmh / 3.6
    t0 = time.time()
    scene = build(a.cam)
    fx.dress("BANC", scene, puddle_t=PUDDLE_T)
    print(f"[banc] construit en {time.time() - t0:.1f} s", flush=True)
    L.use_gpu(scene)
    r = scene.render
    r.resolution_x, r.resolution_y = map(int, a.res.split("x"))
    r.resolution_percentage = 100
    scene.cycles.samples = a.samples
    r.image_settings.file_format = "PNG"
    r.use_persistent_data = True
    os.makedirs(a.out, exist_ok=True)
    for f in [int(x) for x in a.frames.split(",")]:
        scene.frame_set(f)
        r.filepath = os.path.join(a.out, f"{a.cam}-{a.tag}-{f:02d}.png")
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"[banc] {r.filepath} en {time.time() - t:.1f} s", flush=True)


main()
