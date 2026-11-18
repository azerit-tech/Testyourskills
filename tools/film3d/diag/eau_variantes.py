# Diagnostic de l'eau des pneus (SPEC §18.60) : construit un plan comme render_film (cache, voisins de la ville, vie),
# le règle en brouillon, puis rend quelques images sous des variantes qui isolent ce qui éclaire ou blanchit l'eau.
#
#   blender -b --factory-startup -P tools/film3d/diag/eau_variantes.py -- --plan P5 --frames 27,40 \
#       --ville /root/ville-v9 --out /root/diag-eau [--variantes base,sans_gouttes,sans_brume,sans_brume_ciel,...] [--gpu]
#
# Variantes : base ; sans_gouttes (sphères cachées) ; sans_brume (sprites cachés) ; sans_eau ; sans_brume_ciel (la
# brume de la scène, « haze », cachée) ; sans_faisceau (la lampe principale de l'hélicoptère éteinte) ; verre_v9 (les
# gouttes en verre de v9, 45 % de verre) ; sans_traces (les traces des pneus cachées) ; reflet (les gouttes en reflet seul, sans réfraction) ; sans_debruit ;
# ech256 (256 échantillons). Écrit <out>/<PLAN>-<image>-<variante>.png et un tableau des luminances (luma.tsv) :
# moyenne de l'image, et celles d'une boîte autour de la berline (le bas du cadre).
import argparse
import os
import sys

import bpy

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import debit  # noqa: E402
import fx  # noqa: E402
import render_film as RF  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--plan", default="P5")
ap.add_argument("--frames", default="27,40")
ap.add_argument("--ville", default=None)
ap.add_argument("--out", required=True)
ap.add_argument("--variantes", default="base,sans_gouttes,sans_brume,sans_eau,sans_brume_ciel,sans_faisceau,verre_v9")
ap.add_argument("--gpu", action="store_true")
a = ap.parse_args(argv)
os.makedirs(a.out, exist_ok=True)
mod_name, arg = RF.SOURCES[a.plan]
import importlib  # noqa: E402
mod = importlib.import_module(mod_name)
os.environ["FILM3D_BLEND"] = os.path.join(a.out, "scene.blend")
assets = os.path.realpath(RF.assets_dir())
scene, how, t, _ = debit.cached_build(a.plan, arg, lambda: mod.build(arg) if arg else mod.build(), assets,
                                      blend_out=os.environ["FILM3D_BLEND"])
if a.ville:
    import ville
    import vie
    ville.voisins(scene, a.plan, os.path.abspath(a.ville))
    vie.poser_plan(scene, a.plan)
ns = argparse.Namespace(draft=True, dry=False, res=None, threads=0, cpu=not a.gpu, samples=None, adaptive=None,
                        no_persistent=False)
res, engine, device, samples = RF.setup_render(bpy, scene, ns)
debit.draft(scene)
print(f"[diag] {a.plan} {how} ; {engine} {device} {samples} éch.", flush=True)
water = [o for o in bpy.data.collections["fx"].objects] if bpy.data.collections.get("fx") else []
drops = [o for o in water if o.name.startswith(("fx_gouttes", "fx_lame", "fx_gerbe"))]
mist = [o for o in water if o not in drops]
haze = [o for o in scene.objects if o.type == "MESH" and o.name.startswith("haze")]
beam = [o for o in scene.objects if o.type == "LIGHT" and o.name.endswith("searchlight_spot")]


def mat_verre_v9():
    m = bpy.data.materials.new("diag_verre_v9")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    gl = nt.nodes.new("ShaderNodeBsdfPrincipled")
    gl.inputs["Base Color"].default_value = (0.92, 0.94, 0.96, 1.0)
    gl.inputs["Roughness"].default_value = 0.05
    gl.inputs["IOR"].default_value = 1.33
    gl.inputs["Transmission Weight"].default_value = 1.0
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mx = nt.nodes.new("ShaderNodeMixShader")
    mx.inputs["Fac"].default_value = 0.55
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(gl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def mat_reflet():
    m = bpy.data.materials.new("diag_reflet")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    fr = nt.nodes.new("ShaderNodeFresnel")
    fr.inputs["IOR"].default_value = 1.33
    gl = nt.nodes.new("ShaderNodeBsdfGlossy")
    gl.inputs["Roughness"].default_value = 0.1
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mx = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(fr.outputs[0], mx.inputs["Fac"])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(gl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def set_drop_mat(m):
    old = []
    for o in drops:
        ng = o.modifiers["fx"].node_group
        for n in ng.nodes:
            if n.bl_idname == "GeometryNodeSetMaterial":
                old.append((n, n.inputs["Material"].default_value))
                n.inputs["Material"].default_value = m
    return lambda: [setattr(n.inputs["Material"], "default_value", v) for n, v in old]


def hide(objs):
    st = [(o, o.hide_render) for o in objs]
    for o in objs:
        o.hide_render = True
    return lambda: [setattr(o, "hide_render", v) for o, v in st]


def variant(name):
    c = scene.cycles
    if name == "base":
        return lambda: None
    if name == "sans_gouttes":
        return hide(drops)
    if name == "sans_brume":
        return hide(mist)
    if name == "sans_eau":
        return hide(water)
    if name == "sans_brume_ciel":
        return hide(haze)
    if name == "sans_traces":
        return hide([o for o in scene.objects if __import__("re").match(r"^(wake|traces?)([_.:]|$)", o.name)])
    if name == "sans_faisceau":
        return hide(beam)
    if name == "verre_v9":
        return set_drop_mat(mat_verre_v9())
    if name == "reflet":
        return set_drop_mat(mat_reflet())
    if name == "sans_debruit":
        v = c.use_denoising
        c.use_denoising = False
        return lambda: setattr(c, "use_denoising", v)
    if name == "ech256":
        v = c.samples
        c.samples = 256
        return lambda: setattr(c, "samples", v)
    raise SystemExit(f"variante inconnue : {name}")


rows = []
for f in [int(x) for x in a.frames.split(",")]:
    scene.frame_set(scene.frame_start + f - 1)
    for v in a.variantes.split(","):
        undo = variant(v)
        path = os.path.join(a.out, f"{a.plan}-{f:03d}-{v}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        undo()
        img = bpy.data.images.load(path)
        W, H = img.size
        px = list(img.pixels)
        bpy.data.images.remove(img)

        def luma(x0, x1, y0, y1):
            s = n = 0
            for y in range(int(y0 * H), int(y1 * H)):
                for x in range(int(x0 * W), int(x1 * W)):
                    i = 4 * (y * W + x)
                    s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
                    n += 1
            return 255.0 * s / max(1, n)
        # (y depuis le bas) : l'image, le tiers bas (l'eau derrière la berline), le bas droit (les paquets de v9)
        rows.append((a.plan, f, v, luma(0, 1, 0, 1), luma(0, 1, 0.08, 0.42), luma(0.5, 1.0, 0.08, 0.42)))
        print(f"[diag] {a.plan}/{f} {v:16s} image {rows[-1][3]:6.1f}  bas {rows[-1][4]:6.1f}  bas droit {rows[-1][5]:6.1f}",
              flush=True)
with open(os.path.join(a.out, "luma.tsv"), "a", encoding="utf-8") as fh:
    for r in rows:
        fh.write("\t".join(str(round(x, 2)) if isinstance(x, float) else str(x) for x in r) + "\n")
