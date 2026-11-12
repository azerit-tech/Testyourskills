# Construit un plan d'un lieu au bord de l'eau et en rend l'image fixe d'essai ; ou rend une scène déjà écrite
# (--scene, les lieux de la ville : scene-b.blend, scene-carrefour.blend, scene-f.blend ; render_b.py y renvoie).
#
#   FILM3D_HERO=w111 lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     --factory-startup -P tools/film3d/render_lieux.py -- --lieu pont|pointe|port --plan P4 [--palier socle] \
#     [--engine workbench|cycles] [--percent 50] [--samples 32] [--gpu] [--no-save] [--grain 7] [--no-render]
#   lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     -P tools/film3d/render_lieux.py -- --scene scene-b.blend [--engine ...] [--percent ...] [--out chemin.png]
#   --anim (avec l'une ou l'autre forme) : le plan animé, toutes ses images dans ref/anim/<nom>/, puis
#     ref/anim/<nom>-anim.mp4 et -anim-ralenti.mp4 (<nom> : <lieu>-<plan>, ou la scène sans .blend ; --out
#     donne le chemin du mp4). En Workbench, les repères de roue (objets « repere_* », cachés en Cycles) s'allument.
#
# --scene : ouvre assets/<scene> sans rien construire ; Workbench en couleurs des matières (--color MATERIAL par
# défaut, la couleur de base ou d'émission recopiée dans la couleur d'affichage), transformée de vue « Standard » ;
# sortie ref/lieux/<scene>-<moteur>.png par défaut.
# Grain ffmpeg (et vignette) : 7 par défaut pour un lieu construit (--lieu), 0 pour une scène ouverte (--scene),
# comme render_b.py l'a toujours fait ; --grain N fixe la valeur dans les deux cas. Jamais de grain en Workbench.
#
# Les lieux et leurs plans : pont (scene_c.py) P4 ; pointe, la jetée et la pointe (scene_d.py) P6, FIN, FIN6 ;
# port (scene_e.py) P5 ; rond-point (scene_f.py) P2 ; avenue (scene_a.py) OUV, l'ouverture.
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

LIEUX = {"pont": ("scene_c", "c"), "pointe": ("scene_d", "d"), "port": ("scene_e", "e"), "rond-point": ("scene_f", "f"),
         "avenue": ("scene_a", "a")}

ap = argparse.ArgumentParser()
ap.add_argument("--lieu", choices=sorted(LIEUX))
ap.add_argument("--plan")
ap.add_argument("--scene", default=None, help="une scène déjà écrite dans assets/, rendue sans rien construire")
ap.add_argument("--palier", default="socle")
ap.add_argument("--engine", default="workbench", choices=("workbench", "cycles"))
ap.add_argument("--color", default=None, help="Workbench : RANDOM (lieu), MATERIAL (scène), OBJECT, TEXTURE")
ap.add_argument("--percent", type=int, default=50)
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--gpu", action="store_true", help="carte graphique (machine louée seulement)")
ap.add_argument("--threads", type=int, default=2)
ap.add_argument("--no-save", action="store_true")
ap.add_argument("--no-render", action="store_true")
ap.add_argument("--grain", type=float, default=None, help="7 pour un lieu, 0 pour une scène")
ap.add_argument("--out", default=None)
ap.add_argument("--anim", action="store_true",
                help="toutes les images du plan (frame_start..frame_end) dans ref/anim/, assemblées en mp4 à 24 i/s "
                     "et en ralenti ×4 (une seule session Blender)")
ap.add_argument("--frame", type=int, default=None, help="l'image du plan animé à rendre (sinon celle de l'image fixe)")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
if not args.scene and not (args.lieu and args.plan):
    ap.error("--scene, ou --lieu et --plan")
if args.color is None:
    args.color = "MATERIAL" if args.scene else "RANDOM"
if args.grain is None:
    args.grain = 0.0 if args.scene else 7.0


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


if args.scene:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(L.ASSETS, args.scene))
    scene = bpy.context.scene
    args.no_save = True
else:
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
if args.frame is not None:
    scene.frame_set(args.frame)

r, c = scene.render, scene.cycles
r.threads_mode = "FIXED"
r.threads = max(1, args.threads)
r.resolution_percentage = args.percent
suffix = ""
if args.engine == "workbench":
    # le cadrage : volumes cachés (en Workbench une boîte de brume serait un mur), pas de compositing
    for ob in scene.objects:
        if ob.type == "MESH" and ob.name.startswith(("haze", "fumee", "spray_")):
            ob.hide_render = True
        if ob.name.startswith("repere_"):
            ob.hide_render = False      # le repère des roues : il ne sert qu'à juger la rotation dans l'aperçu
    r.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = args.color
    sh.show_shadows = False
    if args.color == "MATERIAL":
        display_colours()
    if args.scene:
        # (les réglages du cadrage de la ville, ceux de l'ancien render_b.py : ombres de cavité, vue « Standard »)
        sh.show_cavity = True
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    else:
        sh.background_type = "VIEWPORT"
        sh.background_color = (0.05, 0.06, 0.12)
        sh.show_cavity = False
        scene.display.render_aa = "8"
        suffix = "-cadrage"
    scene.compositing_node_group = None
    r.use_motion_blur = False
    args.grain = 0
else:
    c.device = "CPU"
    if args.gpu:
        L.use_gpu(scene)
    c.samples = args.samples
    c.use_denoising = True
ffmpeg = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
if args.anim:
    # la séquence : une image par fichier, puis deux mp4 (24 i/s, et chaque image tenue quatre fois)
    name = os.path.splitext(args.scene)[0] if args.scene else f"{args.lieu}-{args.plan}"
    anim = os.path.join(L.FILM, "ref", "anim")
    seq = os.path.join(anim, f"{name}-{args.palier if not args.scene else args.engine}{suffix}")
    os.makedirs(seq, exist_ok=True)
    r.image_settings.file_format = "PNG"
    r.filepath = seq + os.sep
    t1 = time.time()
    bpy.ops.render.render(animation=True)
    print(f"[lieux] {scene.frame_end - scene.frame_start + 1} images {args.engine} en {time.time() - t1:.0f} s, "
          f"dans {seq}", flush=True)
    mp4 = args.out or os.path.join(anim, f"{name}-anim.mp4")
    for path, vf in ((mp4, "null"), (os.path.splitext(mp4)[0] + "-ralenti.mp4", "setpts=4*PTS")):
        subprocess.run(["nice", "-n", "19", ffmpeg, "-loglevel", "error", "-y", "-threads", "2", "-framerate", "24",
                        "-start_number", str(scene.frame_start), "-i", os.path.join(seq, "%04d.png"), "-vf", vf,
                        "-r", "24", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", path], check=True)
        print(f"[lieux] écrit {path}", flush=True)
    sys.exit(0)
if args.scene:
    out = args.out or os.path.join(L.FILM, "ref", "lieux", f"{os.path.splitext(args.scene)[0]}-{args.engine}.png")
else:
    out = args.out or os.path.join(L.FILM, "ref", "lieux", f"{args.lieu}-{args.plan}-{args.palier}{suffix}.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
raw = os.path.splitext(out)[0] + "-raw.png" if args.grain > 0 else out
r.filepath = raw
t1 = time.time()
bpy.ops.render.render(write_still=True)
print(f"[lieux] rendu {args.engine} {r.resolution_x * args.percent // 100}×{r.resolution_y * args.percent // 100}, "
      f"{c.samples if args.engine == 'cycles' else '-'} éch., {c.device if args.engine == 'cycles' else 'workbench'} : "
      f"{time.time() - t1:.0f} s", flush=True)
if args.grain > 0 and os.path.exists(ffmpeg):
    vf = f"vignette=angle=0.42,noise=c0s={args.grain:.1f}:c0f=t:c1s={args.grain / 3:.1f}:c2s={args.grain / 3:.1f}"
    subprocess.run(["nice", "-n", "19", ffmpeg, "-loglevel", "error", "-y", "-threads", "2", "-i", raw, "-vf", vf, out], check=True)
elif raw != out:
    shutil.copy(raw, out)
print(f"[lieux] écrit {out}", flush=True)
