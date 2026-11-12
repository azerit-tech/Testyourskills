# Une scène en groupes de lumières : un seul rendu Cycles, une passe par groupe (ce que chaque famille de sources
# apporte à l'image), écrite en PNG avec la même transformée de vue que l'image, plus la planche côte à côte. Pour
# trouver quelle source blanchit un sol, voile un ciel ou brûle une carrosserie, sans rendre une image par essai.
#
#   lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup \
#     -P tools/film3d/lab/lightgroups.py -- --scene scene-b.blend --name enseignes-P3 [--samples 32] [--percent 50]
#
# Écrit Azerit/design/film/ref/lieux/<name>-groupe-<groupe>.png (et -groupe-total.png, l'image complète), la planche
# planche-<name>-groupes.png (ffmpeg hstack), et <name>-groupes.exr (le multicouche, toutes les passes : si la sortie
# fichier du compositing manquait une passe, --from-exr la réécrit en PNG sans rien rendre).
#
# Les groupes : chaque objet (lampe ou maillage émissif) va dans le premier groupe dont un préfixe de nom l'attrape,
# lui ou l'un de ses parents ; tout le reste dans « ville » ; le monde dans « ciel ». GROUPS est fait pour les scènes
# de la ville (scene_b, scene_carrefour, scene_f) ; --groups prend un JSON {groupe: [préfixes]} pour une autre.
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE)))), "design", "film", "assets")
REF = os.path.join(os.path.dirname(ASSETS), "ref", "lieux")

GROUPS = {
    "berline": ["coupe", "hero_lamp_core", "spray"],
    "patrouilles": ["patrol", "bar_glow", "beam_", "pool_"],
    "lanternes": ["lantern_", "rue_lamp", "lamp_"],
    "appoint": ["rim_", "muzzle", "hero_fill"],
}
DEFAULT, SKY = "ville", "ciel"

ap = argparse.ArgumentParser()
ap.add_argument("--scene", default="scene-b.blend")
ap.add_argument("--name", default=None, help="préfixe des images (par défaut, le nom de la scène)")
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--percent", type=int, default=50)
ap.add_argument("--groups", default=None, help="JSON {groupe: [préfixes de noms]}")
ap.add_argument("--from-exr", action="store_true", help="réécrire les PNG depuis le multicouche, sans rendu")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
name = args.name or os.path.splitext(args.scene)[0]
groups = json.loads(args.groups) if args.groups else GROUPS
order = list(groups) + [DEFAULT, SKY]
exr = os.path.join(REF, f"{name}-groupes.exr")
tmp = os.path.join(REF, f".{name}-groupes")


def log(*a):
    print("[groupes]", *a, flush=True)


def sheet():
    """La planche : les passes côte à côte, l'image complète en dernier (ffmpeg, aucune bibliothèque d'image)."""
    ims = [os.path.join(REF, f"{name}-groupe-{g}.png") for g in order + ["total"]]
    ims = [p for p in ims if os.path.exists(p)]
    ff = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    if len(ims) < 2 or not os.path.exists(ff):
        return
    out = os.path.join(REF, f"planche-{name}-groupes.png")
    cmd = ["nice", "-n", "19", ff, "-loglevel", "error", "-y", "-threads", "1"]
    for p in ims:
        cmd += ["-i", p]
    cmd += ["-filter_complex", "".join(f"[{i}:v]" for i in range(len(ims))) + f"hstack=inputs={len(ims)}", out]
    subprocess.run(cmd, check=True)
    log(f"planche {out} ({', '.join(os.path.basename(p) for p in ims)})")


if args.from_exr:
    # le multicouche relu : chaque passe Combined_<groupe> passe par la transformée de vue de la scène
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ASSETS, args.scene))
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new("relire", "CompositorNodeTree")
    img = bpy.data.images.load(exr)
    node = ng.nodes.new("CompositorNodeImage")
    node.image = img
    fo = ng.nodes.new("CompositorNodeOutputFile")
    fo.directory, fo.file_name, fo.save_as_render = tmp + "/", "", True
    fo.format.file_format = "PNG"
    for g in order:
        sock = node.outputs.get(f"Combined_{g}")
        if sock:
            fo.file_output_items.new("RGBA", g)
            ng.links.new(sock, fo.inputs[g])
    go = ng.nodes.new("NodeGroupOutput")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    ng.links.new(node.outputs["Image"], go.inputs[0])
    sc.compositing_node_group = ng
    sc.render.filepath = os.path.join(tmp, "relu.png")
    bpy.ops.render.render(write_still=True, use_viewport=False)
else:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ASSETS, args.scene))
    sc = bpy.context.scene
    vl = sc.view_layers[0]
    for g in order:
        vl.lightgroups.add(name=g)

    def group_of(o):
        x = o
        while x is not None:
            for g, prefixes in groups.items():
                if x.name.startswith(tuple(prefixes)):
                    return g
            x = x.parent
        return DEFAULT

    count = {g: 0 for g in order}
    for o in bpy.data.objects:
        o.lightgroup = group_of(o)
        if o.type == "LIGHT":
            count[o.lightgroup] += 1
    sc.world.lightgroup = SKY
    log("lumières par groupe : " + ", ".join(f"{g} {n}" for g, n in count.items() if g != SKY))

    # la sortie fichier du compositing, branchée sur chaque passe de groupe et sur l'image finale
    ng = sc.compositing_node_group
    rl = next(n for n in ng.nodes if n.type == "R_LAYERS")
    final = next(n for n in ng.nodes if n.bl_idname == "NodeGroupOutput")
    fo = ng.nodes.new("CompositorNodeOutputFile")
    os.makedirs(tmp, exist_ok=True)
    for f in glob.glob(os.path.join(tmp, "*")):
        os.remove(f)
    fo.directory, fo.file_name, fo.save_as_render = tmp + "/", "", True
    fo.format.file_format = "PNG"
    for g in order:
        sock = rl.outputs.get(f"Combined_{g}")
        if sock is None:
            log(f"passe absente : Combined_{g}")
            continue
        fo.file_output_items.new("RGBA", g)
        ng.links.new(sock, fo.inputs[g])
    if final.inputs[0].links:
        fo.file_output_items.new("RGBA", "total")
        ng.links.new(final.inputs[0].links[0].from_socket, fo.inputs["total"])

    r = sc.render
    r.engine = "CYCLES"
    r.resolution_percentage = args.percent
    r.threads_mode = "FIXED"
    r.threads = 2
    c = sc.cycles
    c.samples = args.samples
    c.use_denoising = True
    c.device = "CPU"
    # l'image écrite par le rendu : le multicouche, toutes les passes (le recours si la sortie PNG manque)
    r.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    r.image_settings.color_depth = "16"
    r.filepath = exr
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"rendu {r.resolution_x * args.percent // 100}×{r.resolution_y * args.percent // 100}, {args.samples} éch. : "
        f"{time.time() - t0:.0f} s")

for g in order + ["total"]:
    got = sorted(glob.glob(os.path.join(tmp, f"{g}*.png")))
    if got:
        shutil.copy(got[-1], os.path.join(REF, f"{name}-groupe-{g}.png"))
        log(f"écrit {name}-groupe-{g}.png")
    else:
        log(f"rien pour {g} (dans {tmp} : {sorted(os.listdir(tmp)) if os.path.isdir(tmp) else '-'})")
if all(glob.glob(os.path.join(tmp, f"{g}*.png")) for g in order):
    shutil.rmtree(tmp, ignore_errors=True)
sheet()
