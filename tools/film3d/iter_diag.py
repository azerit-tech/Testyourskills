# Le banc de diagnostic des plans au bord de l'eau, pour la machine louée : construit un plan (scene_c, scene_d),
# applique des retouches d'essai, rend quelques images en Cycles GPU, et écrit un inventaire si on le demande.
#
#   blender -b --factory-startup -P tools/film3d/iter_diag.py -- --plan P6 --frames 21 --out DIR [--tag nom]
#     [--samples 64] [--res 720x1280] [--hide préfixe,...] [--only-hide] [--exec "code python"] [--report]
#     [--camera nom] [--no-denoise]
#
# --hide : cache au rendu les objets dont le nom commence par l'un des préfixes ; --exec : du code exécuté après
# la construction (bpy, scene, L dans l'espace de noms) ; --report : la liste des objets visibles par la caméra au
# bas du cadre (lancers de rayons) et les matières émissives fortes. Les images : DIR/<plan>-<tag>-<image>.png.
import argparse
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lieux as L  # noqa: E402

SOURCES = {"OUV": "scene_a", "P1": "scene_a", "P4": "scene_c", "P5": "scene_e", "P6": "scene_d", "FIN": "scene_d",
           "FIN6": "scene_d"}

ap = argparse.ArgumentParser()
ap.add_argument("--plan", required=True)
ap.add_argument("--frames", default=None, help="1,14,28 ou 1-40:4 (images de la scène)")
ap.add_argument("--out", required=True)
ap.add_argument("--tag", default="essai")
ap.add_argument("--samples", type=int, default=64)
ap.add_argument("--res", default="720x1280")
ap.add_argument("--hide", default="")
ap.add_argument("--exec", default="")
ap.add_argument("--report", action="store_true")
ap.add_argument("--no-denoise", action="store_true")
ap.add_argument("--probe", default="", help="image@u,v;… : l'objet et la matière sous ces points du cadre")
a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:])

import debit  # noqa: E402

mod = __import__(SOURCES[a.plan])
# la scène en cache (debit.py) : reconstruite seulement si un fichier qu'elle a lu, ou une variable FILM3D_*, a changé
scene, how, t_build, _ = debit.cached_build(a.plan, a.plan, lambda: mod.build(a.plan), L.ASSETS)
print(f"[diag] {a.plan} {'repris du cache' if how == 'cache' else 'construit'} en {t_build:.0f} s", flush=True)
for pre in [p for p in a.hide.split(",") if p]:
    n = 0
    for ob in scene.objects:
        if ob.name.startswith(pre):
            ob.hide_render = True
            n += 1
    print(f"[diag] caché {pre}* : {n} objets", flush=True)
for code in [c for c in a.exec.split("|") if c]:
    # --exec : des noms de fichiers d'essai (tools/film3d/diag/<nom>.py), séparés par |
    path = os.path.join(HERE, "diag", code + ".py") if not code.endswith(".py") else code
    exec(open(path, encoding="utf-8").read(), {"bpy": bpy, "scene": scene, "L": L, "mod": mod})
    print(f"[diag] essai {code} appliqué", flush=True)

r, c = scene.render, scene.cycles
r.resolution_x, r.resolution_y = (int(v) for v in a.res.split("x"))
r.resolution_percentage = 100
r.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
c.device = "GPU"
c.samples = a.samples
c.use_denoising = not a.no_denoise
r.use_persistent_data = True
r.image_settings.file_format = "PNG"
r.image_settings.color_mode = "RGB"
draft = debit.draft(scene)               # FILM3D_DRAFT=1 ou 2 : le brouillon allégé (voir debit.py)
phases = debit.Phases()                  # FILM3D_PHASES=1 : les phases de Cycles par image

if a.report:
    from mathutils import Vector
    dg = bpy.context.evaluated_depsgraph_get()
    cam = scene.camera
    scene.frame_set(scene.frame_current)
    fr = cam.data.view_frame(scene=scene)
    mw = cam.matrix_world
    hits = {}
    for v in (0.02, 0.05, 0.08, 0.11):
        for u in [i / 10 for i in range(11)]:
            # le cadre de la caméra : fr[0] haut droite, fr[1] bas droite, fr[2] bas gauche, fr[3] haut gauche
            p = fr[2].lerp(fr[1], u).lerp(fr[3].lerp(fr[0], u), v)
            o = mw.translation
            d = (mw @ p - o).normalized()
            ok, loc, nor, idx, ob, _ = scene.ray_cast(dg, o, d)
            key = ob.name if ok else "(ciel)"
            hits.setdefault(key, []).append((round(u, 1), v, round((loc - o).length, 1) if ok else None))
    for k, v in hits.items():
        print(f"[diag] bas du cadre : {k} : {v[:4]}{' …' if len(v) > 4 else ''} ({len(v)} rayons)", flush=True)

def probe(u, v):
    """L'objet et la matière sous un point du cadre (u de 0 à gauche à 1 à droite, v de 0 en haut à 1 en bas)."""
    dg = bpy.context.evaluated_depsgraph_get()
    cam = scene.camera
    fr = cam.data.view_frame(scene=scene)
    mw = cam.matrix_world
    p = fr[2].lerp(fr[1], u).lerp(fr[3].lerp(fr[0], u), 1.0 - v)
    o = mw.translation
    d = (mw @ p - o).normalized()
    start = o
    for _ in range(8):
        # les boîtes de brume (volumes) ne cachent rien : le rayon les traverse
        ok, loc, nor, idx, ob, _ = scene.ray_cast(dg, start, d)
        if not ok or not ob.name.startswith("haze"):
            break
        start = loc + d * 0.01
    if not ok:
        return "(ciel)"
    ev = ob.evaluated_get(dg)
    me = ev.data if ev.type == "MESH" else None
    mat = None
    if me is not None and idx < len(me.polygons):
        mi = me.polygons[idx].material_index
        mat = me.materials[mi].name if mi < len(me.materials) and me.materials[mi] else None
    return f"{ob.name} / {mat} à {(loc - o).length:.1f} m, normale {tuple(round(x, 2) for x in nor)}"


for spec in [s for s in a.probe.split(";") if s]:
    f_, uv = spec.split("@") if "@" in spec else (None, spec)
    if f_:
        scene.frame_set(int(f_))
    u, v = (float(x) for x in uv.split(","))
    print(f"[diag] sonde {spec} : {probe(u, v)}", flush=True)

frames = []
if a.frames:
    for part in a.frames.split(","):
        if "-" in part:
            rng, _, step = part.partition(":")
            lo, hi = (int(x) for x in rng.split("-"))
            frames += list(range(lo, hi + 1, int(step or 1)))
        else:
            frames.append(int(part))
else:
    frames = [scene.frame_current]
os.makedirs(a.out, exist_ok=True)
for f in frames:
    scene.frame_set(f)
    r.filepath = os.path.join(a.out, f"{a.plan}-{a.tag}{'-brouillon' + str(draft) if draft else ''}-{f:04d}.png")
    t1 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"[diag] image {f} en {time.time() - t1:.1f} s -> {r.filepath}{phases.line()}", flush=True)
