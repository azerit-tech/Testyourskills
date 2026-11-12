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
#
# --split : des groupes plus fins (SPLIT : les phares de la berline à part de ses cœurs émissifs et du spray ;
# guirlandes, enseignes, appliques des façades séparées) et, pour toute l'image, les composantes de Cycles déjà
# multipliées par leur couleur : diffus direct et indirect, brillant direct et indirect, volume direct et indirect,
# émission, monde (<name>-passe-<composante>.png). Planche en grille, planche-<name>-brillant.png. Les mêmes images
# en linéaire dans <name>-split.exr, et la luminance moyenne de chacune sur deux bandes du sol (--bands, en
# fractions de hauteur depuis le bas) : un classement qui s'additionne, contrairement aux PNG.
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


def main_checkout():
    """Le dépôt principal, même depuis un worktree (.claude/worktrees/…) : les assets sont à côté de lui."""
    root = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
    try:
        common = subprocess.run(["git", "-C", root, "rev-parse", "--git-common-dir"], capture_output=True, text=True,
                                check=True).stdout.strip()
        return os.path.dirname(os.path.abspath(os.path.join(root, common)))
    except Exception:
        return root


ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(os.path.dirname(main_checkout()), "design", "film", "assets")
REF = os.path.join(os.path.dirname(ASSETS), "ref", "lieux")

GROUPS = {
    "berline": ["coupe", "hero_lamp_core", "spray"],
    "patrouilles": ["patrol", "bar_glow", "beam_", "pool_"],
    "lanternes": ["lantern_", "rue_lamp", "lamp_"],
    "appoint": ["rim_", "muzzle", "hero_fill"],
}
# (l'ordre compte : un objet prend le premier groupe qui l'attrape, lui d'abord, ses parents ensuite)
SPLIT = {
    "phares": ["hero_w"],
    "coeurs": ["hero_lamp_core", "coupe"],
    "spray": ["spray"],
    "patrouilles": ["patrol", "bar_glow", "beam_", "pool_", "hq_lightbar"],
    "lanternes": ["lantern_", "rue_lamp", "lamp_"],
    "appoint": ["rim_", "muzzle", "hero_fill"],
    "guirlandes": ["bulb_"],
    "enseignes": ["blade_", "cherry_", "motel_glow", "panel_"],
    "facades": ["fl_bld_", "mix_lamp_bld", "bld_"],
}
DEFAULT, SKY = "ville", "ciel"
# composante -> (passe de lumière, passe de couleur) ; noms affichés de Blender 5, puis anciens noms courts
PARTS = {
    "diffus_direct": (("Diffuse Direct", "DiffDir"), ("Diffuse Color", "DiffCol")),
    "diffus_indirect": (("Diffuse Indirect", "DiffInd"), ("Diffuse Color", "DiffCol")),
    "brillant_direct": (("Glossy Direct", "GlossDir"), ("Glossy Color", "GlossCol")),
    "brillant_indirect": (("Glossy Indirect", "GlossInd"), ("Glossy Color", "GlossCol")),
    "volume_direct": (("Volume Direct", "VolumeDir"), None),
    "volume_indirect": (("Volume Indirect", "VolumeInd"), None),
    "emission": (("Emission", "Emit"), None),
    "monde": (("Environment", "Env"), None),
}

ap = argparse.ArgumentParser()
ap.add_argument("--scene", default="scene-b.blend")
ap.add_argument("--name", default=None, help="préfixe des images (par défaut, le nom de la scène)")
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--percent", type=int, default=50)
ap.add_argument("--groups", default=None, help="JSON {groupe: [préfixes de noms]}")
ap.add_argument("--split", action="store_true", help="groupes fins et composantes diffus / brillant / volume")
ap.add_argument("--bands", default="0,0.15,0.15,0.3", help="bandes du sol mesurées (bas0,haut0,bas1,haut1)")
ap.add_argument("--from-exr", action="store_true", help="réécrire les PNG depuis le multicouche, sans rendu")
ap.add_argument("--measure", action="store_true", help="mesurer seulement <name>-split.exr, sans rien rendre")
ap.add_argument("--dry", action="store_true", help="tout préparer, vérifier les passes, ne pas rendre")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
name = args.name or os.path.splitext(args.scene)[0]
groups = json.loads(args.groups) if args.groups else (SPLIT if args.split else GROUPS)
order = list(groups) + [DEFAULT, SKY]
parts = list(PARTS) if args.split else []
exr = os.path.join(REF, f"{name}-groupes.exr")
tmp = os.path.join(REF, f".{name}-groupes")
lin_dir = os.path.join(REF, f".{name}-split")


def out_of(node, *names):
    """La sortie d'un nœud par son nom affiché (get() lit l'identifiant, qui diffère pour les passes de groupe)."""
    return next((o for n in names for o in node.outputs if o.name == n), None)


def log(*a):
    print("[groupes]", *a, flush=True)


def png_of(item):
    return os.path.join(REF, f"{name}-passe-{item[2:]}.png" if item.startswith("c_") else f"{name}-groupe-{item}.png")


def sheet(items):
    """La planche (ffmpeg, aucune bibliothèque d'image) : côte à côte, ou en grille de dix colonnes avec --split."""
    ims = [p for p in (png_of(i) for i in items) if os.path.exists(p)]
    ff = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    if len(ims) < 2 or not os.path.exists(ff):
        return
    out = os.path.join(REF, f"planche-{name}-{'brillant' if args.split else 'groupes'}.png")
    cmd = ["nice", "-n", "19", ff, "-loglevel", "error", "-y", "-threads", "1"]
    for p in ims:
        cmd += ["-i", p]
    ins = "".join(f"[{i}:v]" for i in range(len(ims)))
    if args.split:
        cols = 10
        w, h = sc.render.resolution_x * args.percent // 100, sc.render.resolution_y * args.percent // 100
        lay = "|".join(f"{(i % cols) * w}_{(i // cols) * h}" for i in range(len(ims)))
        flt = f"{ins}xstack=inputs={len(ims)}:layout={lay}:fill=black"
    else:
        flt = f"{ins}hstack=inputs={len(ims)}"
    subprocess.run(cmd + ["-filter_complex", flt, out], check=True)
    log(f"planche {out} ({', '.join(os.path.basename(p) for p in ims)})")


def file_output(ng, directory, multilayer):
    fo = ng.nodes.new("CompositorNodeOutputFile")
    fo.directory, fo.file_name = directory + "/", ("lin" if multilayer else "")
    if multilayer:
        # (le linéaire, pour mesurer : un seul multicouche, sans transformée de vue)
        fo.save_as_render = False
        fo.format.media_type = "MULTI_LAYER_IMAGE"
        fo.format.file_format = "OPEN_EXR_MULTILAYER"
        fo.format.color_depth = "32"
    else:
        fo.save_as_render = True
        fo.format.media_type = "IMAGE"     # (Blender 5 : une image par entrée, pas le multicouche)
        fo.format.file_format = "PNG"
    return fo


def multiply(ng, a, b):
    """a × b, couleur par couleur (le nœud Mix de Blender 5 dans le compositing, l'ancien MixRGB sinon)."""
    try:
        n = ng.nodes.new("ShaderNodeMix")
        n.data_type, n.blend_type, n.clamp_result = "RGBA", "MULTIPLY", False
        cols = [s for s in n.inputs if s.type == "RGBA" and s.enabled]
        n.inputs[0].default_value = 1.0
        out = next(s for s in n.outputs if s.type == "RGBA" and s.enabled)
    except Exception:
        n = ng.nodes.new("CompositorNodeMixRGB")
        n.blend_type = "MULTIPLY"
        cols = [n.inputs[1], n.inputs[2]]
        n.inputs[0].default_value = 1.0
        out = n.outputs[0]
    ng.links.new(a, cols[0])
    ng.links.new(b, cols[1])
    return out


def measure(path):
    """Luminance moyenne linéaire de chaque image du multicouche sur les bandes du sol (OpenImageIO de Blender)."""
    try:
        import OpenImageIO as oiio
        import numpy as np
    except ImportError as e:
        log(f"mesure impossible : {e}")
        return
    b = [float(x) for x in args.bands.split(",")]
    bands = [(b[i], b[i + 1]) for i in range(0, len(b) - 1, 2)]
    rows = []
    # (le multicouche de la sortie fichier range chaque entrée dans sa propre sous-image)
    inp = oiio.ImageInput.open(path)
    k = 0
    while True:
        chans = list(inp.spec().channelnames)
        px = inp.read_image(oiio.FLOAT)
        h = px.shape[0]
        for item in dict.fromkeys(c.rsplit(".", 1)[0] for c in chans):
            idx = [chans.index(f"{item}.{c}") for c in "RGB" if f"{item}.{c}" in chans]
            if len(idx) < 3:
                continue
            y = 0.2126 * px[..., idx[0]] + 0.7152 * px[..., idx[1]] + 0.0722 * px[..., idx[2]]
            vals = [float(np.mean(y[int(h * (1 - hi)):int(h * (1 - lo)) or h])) for lo, hi in bands]
            rows.append((vals, item))
        k += 1
        if not inp.seek_subimage(k, 0):
            break
    inp.close()
    for k, (lo, hi) in enumerate(bands):
        tot = next((v[k] for v, i in rows if i.endswith("total")), None)
        log(f"sol, bande {lo:.2f}–{hi:.2f} depuis le bas (luminance linéaire moyenne"
            f"{f', total {tot:.4f}' if tot else ''}) :")
        for v, i in sorted(rows, key=lambda r: -r[0][k]):
            if not i.endswith("total"):
                log(f"   {v[k]:8.4f}  {i}{f'  ({100 * v[k] / tot:.0f} %)' if tot else ''}")


sc = None
if args.measure:
    measure(os.path.join(REF, f"{name}-split.exr"))
    sys.exit(0)
if args.from_exr:
    # le multicouche relu : chaque passe Combined_<groupe> passe par la transformée de vue de la scène
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ASSETS, args.scene))
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new("relire", "CompositorNodeTree")
    img = bpy.data.images.load(exr)
    node = ng.nodes.new("CompositorNodeImage")
    node.image = img
    fo = file_output(ng, tmp, False)
    for g in order:
        sock = out_of(node, f"Combined_{g}")
        if sock:
            fo.file_output_items.new("RGBA", g)
            ng.links.new(sock, fo.inputs[g])
    go = ng.nodes.new("NodeGroupOutput")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    log("passes du multicouche : " + ", ".join(o.name for o in node.outputs))
    ng.links.new(node.outputs[0], go.inputs[0])
    sc.compositing_node_group = ng
    # (le compositing ne tourne qu'après un rendu : un Workbench sans aucun objet, une seconde, rien de Cycles)
    sc.render.engine = "BLENDER_WORKBENCH"
    for o in bpy.data.objects:
        o.hide_render = True
    sc.render.resolution_percentage = args.percent
    sc.render.filepath = os.path.join(tmp, "relu.png")
    bpy.ops.render.render(write_still=True)
else:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ASSETS, args.scene))
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"          # (avant les groupes : le nœud des couches n'offre leurs passes qu'en Cycles)
    vl = sc.view_layers[0]
    for g in order:
        vl.lightgroups.add(name=g)
    if args.split:
        for p in ("diffuse_direct", "diffuse_indirect", "diffuse_color", "glossy_direct", "glossy_indirect",
                  "glossy_color", "emit", "environment"):
            setattr(vl, f"use_pass_{p}", True)
        vl.cycles.use_pass_volume_direct = True
        vl.cycles.use_pass_volume_indirect = True

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
    os.makedirs(tmp, exist_ok=True)
    for f in glob.glob(os.path.join(tmp, "*")):
        os.remove(f)
    outs = [file_output(ng, tmp, False)]
    if args.split:
        os.makedirs(lin_dir, exist_ok=True)
        for f in glob.glob(os.path.join(lin_dir, "*")):
            os.remove(f)
        outs.append(file_output(ng, lin_dir, True))
    items = [f"c_{p}" for p in parts] + order + ["total"]
    # (les entrées et le lien de l'image finale d'abord : un lien remet l'arbre à jour, et c'est alors seulement
    # que le nœud des couches montre les sorties des groupes et des composantes ajoutés plus haut)
    for fo in outs:
        for i in items:
            fo.file_output_items.new("RGBA", i)
        if final.inputs[0].links:
            ng.links.new(final.inputs[0].links[0].from_socket, fo.inputs["total"])
    srcs, missing = {}, []
    for g in order:
        s = out_of(rl, f"Combined_{g}")
        if s is None:
            missing.append(g)
        else:
            srcs[g] = s
    for p in parts:
        light, colour = PARTS[p]
        s = out_of(rl, *light)
        c = out_of(rl, *colour) if colour else None
        if s is None or (colour and c is None):
            missing.append(f"c_{p}")
            continue
        srcs[f"c_{p}"] = multiply(ng, s, c) if c is not None else s
    for i, s in srcs.items():
        for fo in outs:
            ng.links.new(s, fo.inputs[i])
    if missing:
        # sans les passes au compositing, le multicouche les garde toutes si le compositing est coupé (sinon il
        # n'écrit que l'image composée) : --from-exr les relira
        sc.render.use_compositing = False
        log(f"passes absentes du compositing ({', '.join(missing)}) : compositing coupé, tout part dans le multicouche")
    if args.dry:
        log("sorties des couches : " + ", ".join(o.name for o in rl.outputs if o.enabled))
        log(f"branché : {', '.join(srcs)}" + (f" ; absent : {', '.join(missing)}" if missing else ""))
        sys.exit(0)

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
    try:
        r.image_settings.media_type = "MULTI_LAYER_IMAGE"
    except TypeError as e:
        log(f"media_type : {e}")
    r.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    r.image_settings.color_depth = "16"
    r.filepath = exr
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"rendu {r.resolution_x * args.percent // 100}×{r.resolution_y * args.percent // 100}, {args.samples} éch. : "
        f"{time.time() - t0:.0f} s")

items = [f"c_{p}" for p in parts] + order + ["total"]
for i in items:
    got = sorted(glob.glob(os.path.join(tmp, f"{i}*.png")))
    if got:
        shutil.copy(got[-1], png_of(i))
        log(f"écrit {os.path.basename(png_of(i))}")
    else:
        log(f"rien pour {i} (dans {tmp} : {sorted(os.listdir(tmp)) if os.path.isdir(tmp) else '-'})")
if all(glob.glob(os.path.join(tmp, f"{i}*.png")) for i in items):
    shutil.rmtree(tmp, ignore_errors=True)
if args.split:
    got = sorted(glob.glob(os.path.join(lin_dir, "*.exr")))
    if got:
        lin = os.path.join(REF, f"{name}-split.exr")
        shutil.move(got[-1], lin)
        shutil.rmtree(lin_dir, ignore_errors=True)
        log(f"écrit {os.path.basename(lin)}")
        measure(lin)
    else:
        log(f"pas de multicouche linéaire dans {lin_dir}")
sheet(items)
