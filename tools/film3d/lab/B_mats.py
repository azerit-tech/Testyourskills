# Méthode B (« pbr ») : les matières de la façade. Le réalisme vient des surfaces : enduits
# photographiques (projection en boîte, sans UV, donc valable pour n'importe quel dessin
# d'immeuble), reprises de peinture, crasse des creux (occlusion), pied de mur mouillé,
# arêtes arrondies par le nœud Bevel, pierre de soubassement en vrai déplacement, et des
# décalcomanies de coulures posées par-dessus (multiplicatives, la teinte du mur reste).
# La teinte pastel vient de la couleur de l'objet (Object Info), comme dans scene_a.
import os

import bpy
import numpy as np

import scene_a as S

A = S.ASSETS
PP = "PaintedPlaster017/PaintedPlaster017_2K-JPG_"     # enduit peint, photogrammétrie (ambientCG)
PL = "Plaster003/Plaster003_2K-JPG_"                   # enduit plus frais : les reprises
CORAL = "coral_fort_wall_01/"                          # pierre corallienne du soubassement (Poly Haven)
TERRAZZO = "Terrazzo019M/Terrazzo019M_1K-JPG_"
SHUTTER = "painted_metal_shutter/"


def _mean_lum(path):
    """Luminance moyenne (linéaire) d'une image, pour normaliser l'albédo autour de 1."""
    img = bpy.data.images.load(path, check_existing=True)
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(-1, 4)[::61, :3]
    a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return float((a @ np.array([0.2126, 0.7152, 0.0722], np.float32)).mean())


_MEAN = {}


def mean_lum(rel):
    if rel not in _MEAN:
        _MEAN[rel] = _mean_lum(os.path.join(A, rel))
    return _MEAN[rel]


def tex(N, rel, vec, color=True, blend=0.3):
    """Une image en projection boîte (coordonnées objet) : pas d'UV à fabriquer."""
    t = S.image(N, os.path.join(A, rel), vec, color)
    t.projection = "BOX"
    t.projection_blend = blend
    return t


def vmap(N, vec, s, loc=(0, 0, 0)):
    m = N.new("ShaderNodeMapping", Scale=s if isinstance(s, tuple) else (s, s, s), Location=loc)
    N.link(vec, m.inputs["Vector"])
    return m.outputs[0]


def vadd(N, a, b):
    v = N.new("ShaderNodeVectorMath", _operation="ADD")
    N.set(v.inputs[0], a)
    N.set(v.inputs[1], b)
    return v.outputs[0]


def smooth(N, x, a, b):
    """smoothstep(a, b, x)"""
    m = N.new("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP", **{"From Min": a, "From Max": b})
    N.set(m.inputs["Value"], x)
    return m.outputs[0]


def detail(N, color_out, rel, contrast):
    """La luminance de la photo, ramenée autour de 1 : on garde son grain, pas sa couleur."""
    bw = N.new("ShaderNodeRGBToBW")
    N.link(color_out, bw.inputs[0])
    d = N.math("DIVIDE", bw.outputs[0], mean_lum(rel))
    return N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", d, 1.0), contrast))


def bevel_bump(N, height, dist, radius=0.02, samples=4):
    bv = N.new("ShaderNodeBevel", Radius=radius)
    bv.samples = samples
    b = N.new("ShaderNodeBump", Strength=1.0, Distance=dist)
    N.set(b.inputs["Height"], height)
    N.link(bv.outputs[0], b.inputs["Normal"])
    return b.outputs["Normal"]


def mat_plaster(name, trim=False):
    """L'enduit peint. trim=True : la même matière, presque blanche (bandeaux, sourcils, corniches),
    dérivée de la même teinte d'objet, donc toujours accordée à l'immeuble."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    info = N.new("ShaderNodeObjectInfo")
    xyz = N.sep(co)
    z = xyz[2]
    # décalage de texture par instance : deux immeubles du même dessin n'ont pas le même mur
    off = N.new("ShaderNodeCombineXYZ")
    N.link(N.math("MULTIPLY", info.outputs["Random"], 37.0), off.inputs[0])
    N.link(N.math("MULTIPLY", info.outputs["Random"], 53.0), off.inputs[1])
    N.link(N.math("MULTIPLY", info.outputs["Random"], 11.0), off.inputs[2])
    vt = vadd(N, co, off.outputs[0])
    v1 = vmap(N, vt, 0.42)          # ≈ 2,4 m par tuile
    v2 = vmap(N, vt, 0.6)
    c1 = tex(N, PP + "Color.jpg", v1)
    r1 = tex(N, PP + "Roughness.jpg", v1, False)
    h1 = tex(N, PP + "Displacement.jpg", v1, False)
    c2 = tex(N, PL + "Color.jpg", v2)
    r2 = tex(N, PL + "Roughness.jpg", v2, False)
    h2 = tex(N, PL + "Displacement.jpg", v2, False)
    d1 = detail(N, c1.outputs["Color"], PP + "Color.jpg", 1.1)
    d2 = detail(N, c2.outputs["Color"], PL + "Color.jpg", 0.7)
    # reprises de peinture : des plaques rectangulaires (Voronoi de Tchebychev, bords repris au
    # rouleau par un bruit fin), d'une teinte voisine, sur un enduit plus frais
    jn = N.new("ShaderNodeTexNoise", Scale=7.0, Detail=6.0, Roughness=0.7)
    N.link(co, jn.inputs["Vector"])
    jit = N.new("ShaderNodeVectorMath", _operation="SCALE")
    jit_in = N.new("ShaderNodeVectorMath", _operation="SUBTRACT")
    N.link(jn.outputs["Color"], jit_in.inputs[0])
    N.set(jit_in.inputs[1], (0.5, 0.5, 0.5))
    N.link(jit_in.outputs[0], jit.inputs[0])
    jit.inputs["Scale"].default_value = 0.06
    pc = vadd(N, vmap(N, vadd(N, co, off.outputs[0]), (0.42, 0.42, 0.55)), jit.outputs[0])
    vor = N.new("ShaderNodeTexVoronoi", _voronoi_dimensions="3D", _distance="CHEBYCHEV", Scale=1.0, Randomness=0.85)
    N.link(pc, vor.inputs["Vector"])
    cell = N.sep(vor.outputs["Color"])
    patch = N.math("GREATER_THAN", cell[0], 0.5)
    pval = N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", cell[1], 0.5), 0.26))
    pval = N.mixf(patch, 1.0, pval)
    # teinte : celle de l'objet ; les reprises tirent un peu plus chaud ou plus froid
    base = info.outputs["Color"]
    if trim:
        base = N.mix(0.8, base, S.lin("#f4efe4"))
    warm = N.mix(1.0, base, (1.07, 1.0, 0.9, 1), "MULTIPLY")
    cool = N.mix(1.0, base, (0.92, 0.97, 1.06, 1), "MULTIPLY")
    ptint = N.mix(cell[2], warm, cool)
    tint = N.mix(patch, base, ptint)
    det = N.mixf(patch, d1, d2)
    # grande échelle : l'enduit a passé au soleil par endroits, la pluie a lavé en traînées
    big = N.new("ShaderNodeTexNoise", Scale=0.18, Detail=3.0)
    N.link(vt, big.inputs["Vector"])
    fade = N.math("ADD", 0.88, N.math("MULTIPLY", big.outputs["Factor"], 0.24))
    wash = N.new("ShaderNodeTexNoise", Scale=1.0, Detail=5.0, Roughness=0.6)
    N.link(vmap(N, vt, (3.5, 3.5, 0.22)), wash.inputs["Vector"])
    washf = N.math("ADD", 0.88, N.math("MULTIPLY", smooth(N, wash.outputs["Factor"], 0.35, 0.7), 0.16))
    k = N.math("MULTIPLY", N.math("MULTIPLY", N.math("MULTIPLY", det, pval), fade), washf)
    kc = N.new("ShaderNodeCombineColor")
    for i in range(3):
        N.link(k, kc.inputs[i])
    col = N.mix(1.0, tint, kc.outputs[0], "MULTIPLY")
    # crasse des creux : occlusion locale (tableaux de fenêtres, dessous de sourcils, angles)
    ao = N.new("ShaderNodeAmbientOcclusion", Distance=0.45)
    ao.samples = 4
    ao.only_local = True
    dirt = N.math("MULTIPLY", N.math("POWER", N.math("SUBTRACT", 1.0, ao.outputs["AO"]), 1.3), 0.7)
    col = N.mix(dirt, col, N.mix(1.0, col, S.lin("#6f6052"), "MULTIPLY"))
    # pied de mur : la pluie rejaillit et l'enduit a bu sur 0,6 à 1,2 m, lisière irrégulière
    en = N.new("ShaderNodeTexNoise", Scale=1.6, Detail=5.0, Roughness=0.65)
    N.link(vt, en.inputs["Vector"])
    lim = N.math("ADD", 0.75, N.math("MULTIPLY", en.outputs["Factor"], 0.6))
    wet = N.math("SUBTRACT", 1.0, smooth(N, z, N.math("SUBTRACT", lim, 0.35), lim))
    col = N.mix(N.math("MULTIPLY", wet, 0.75), col, N.mix(1.0, col, S.lin("#7d7168"), "MULTIPLY"))
    rough = N.math("ADD", 0.12, N.math("MULTIPLY", N.mixf(patch, r1.outputs["Color"], r2.outputs["Color"]), 0.85))
    rough = N.mixf(N.math("MULTIPLY", wet, 0.8), rough, 0.32)
    # relief : le grain de la photo, et la petite lèvre de peinture au bord des reprises
    h = N.math("ADD", N.mixf(patch, h1.outputs["Color"], h2.outputs["Color"]), N.math("MULTIPLY", patch, 0.25))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(rough, p.inputs["Roughness"])
    N.link(bevel_bump(N, h, 0.007, 0.022 if not trim else 0.018), p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def set_displacement(m, method="BOTH"):
    for owner in (m, getattr(m, "cycles", None)):
        if owner is not None and hasattr(owner, "displacement_method"):
            owner.displacement_method = method
            return True
    return False


def mat_coral():
    """Pierre corallienne du soubassement : vrai déplacement (subdivision adaptative), mouillée en pied."""
    m, N, out = S.material("coral_stone")
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    z = N.sep(co)[2]
    v = vmap(N, co, 0.55)
    c = tex(N, CORAL + "diff_2k.jpg", v)
    r = tex(N, CORAL + "rough_2k.jpg", v, False)
    h = tex(N, CORAL + "disp_2k.png", v, False)
    col = N.mix(1.0, c.outputs["Color"], S.lin("#f3e4c8"), "MULTIPLY")
    col = N.mix(1.0, col, (1.25, 1.2, 1.15, 1), "MULTIPLY")
    wet = N.math("SUBTRACT", 1.0, smooth(N, z, 0.2, 0.45))
    col = N.mix(N.math("MULTIPLY", wet, 0.7), col, N.mix(1.0, col, (0.5, 0.48, 0.46, 1), "MULTIPLY"))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.mixf(wet, r.outputs["Color"], 0.3), p.inputs["Roughness"])
    bv = N.new("ShaderNodeBevel", Radius=0.015)
    bv.samples = 4
    N.link(bv.outputs[0], p.inputs["Normal"])
    d = N.new("ShaderNodeDisplacement", Midlevel=0.5, Scale=0.022)
    N.link(h.outputs["Color"], d.inputs["Height"])
    N.link(d.outputs[0], out.inputs["Displacement"])
    N.link(p.outputs[0], out.inputs[0])
    set_displacement(m, "BOTH")
    if hasattr(m, "max_vertex_displacement"):
        m.max_vertex_displacement = 0.03
    return m


def mat_terrazzo():
    m, N, out = S.material("terrazzo")
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    v = vmap(N, co, 1 / 0.65)
    c = tex(N, TERRAZZO + "Color.jpg", v)
    r = tex(N, TERRAZZO + "Roughness.jpg", v, False)
    h = tex(N, TERRAZZO + "Displacement.jpg", v, False)
    p = S.principled(N)
    N.link(N.mix(1.0, c.outputs["Color"], (0.85, 0.8, 0.78, 1), "MULTIPLY"), p.inputs["Base Color"])
    N.link(N.math("MULTIPLY", r.outputs["Color"], 0.45), p.inputs["Roughness"])
    N.link(bevel_bump(N, h.outputs["Color"], 0.001, 0.008), p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_shutter():
    m, N, out = S.material("roller_shutter")
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    v = vmap(N, co, 0.7)
    c = tex(N, SHUTTER + "diff_2k.jpg", v)
    r = tex(N, SHUTTER + "rough_2k.jpg", v, False)
    h = tex(N, SHUTTER + "disp_2k.png", v, False)
    p = S.principled(N, Metallic=0.4)
    N.link(N.mix(1.0, c.outputs["Color"], S.lin("#b9b4ae"), "MULTIPLY"), p.inputs["Base Color"])
    N.link(r.outputs["Color"], p.inputs["Roughness"])
    b = N.new("ShaderNodeBump", Strength=1.0, Distance=0.01)
    N.link(h.outputs["Color"], b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_metal_paint(name, hexcolor, rough=0.38):
    """Menuiseries et garde-corps : métal laqué, la laque a un peu vécu (rugosité tachée)."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    n = N.new("ShaderNodeTexNoise", Scale=14.0, Detail=8.0)
    N.link(co, n.inputs["Vector"])
    p = S.principled(N, **{"Base Color": S.lin(hexcolor), "Metallic": 0.15})
    N.link(N.math("ADD", rough - 0.1, N.math("MULTIPLY", n.outputs["Factor"], 0.25)), p.inputs["Roughness"])
    bv = N.new("ShaderNodeBevel", Radius=0.006)
    bv.samples = 3
    N.link(bv.outputs[0], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_glass():
    """Vitre : transparente de face, miroir du ciel en incidence rasante ; gouttes de pluie,
    traces (rugosité tachée) et un verre épais à peine vert."""
    m, N, out = S.material("pbr_glass")
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    dn, _ = S.droplets(N, co, 70.0, size=0.38, strength=0.35)
    sm = N.new("ShaderNodeTexNoise", Scale=3.0, Detail=6.0)
    N.link(co, sm.inputs["Vector"])
    lw = N.new("ShaderNodeLayerWeight", Blend=0.15)
    N.link(dn, lw.inputs["Normal"])
    g = N.new("ShaderNodeBsdfGlossy", Color=(0.92, 0.94, 0.95, 1))
    N.link(N.math("ADD", 0.01, N.math("MULTIPLY", smooth(N, sm.outputs["Factor"], 0.5, 0.8), 0.08)), g.inputs["Roughness"])
    N.link(dn, g.inputs["Normal"])
    t = N.new("ShaderNodeBsdfTransparent", Color=(0.9, 0.95, 0.93, 1))
    mx = N.new("ShaderNodeMixShader")
    N.link(N.math("ADD", N.math("MULTIPLY", lw.outputs["Fresnel"], 0.55), 0.02), mx.inputs[0])
    N.link(t.outputs[0], mx.inputs[1])
    N.link(g.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_decal(name, folder, dirt="#3a3029", gloss=0.1):
    """Coulure posée sur le mur : un voile transparent teinté (multiplie ce qui est derrière,
    donc garde la teinte et le grain du mur), plus humide, donc un peu brillant.
    Force par décalcomanie dans l'attribut de coin « dstr »."""
    m, N, out = S.material(name)
    uv = N.new("ShaderNodeUVMap").outputs[0]
    op = S.image(N, os.path.join(A, folder, f"{folder}_2K-JPG_Opacity.jpg"), uv, False)
    cl = S.image(N, os.path.join(A, folder, f"{folder}_2K-JPG_Color.jpg"), uv)
    at = N.new("ShaderNodeAttribute", _attribute_name="dstr")
    a = N.math("MULTIPLY", op.outputs["Color"], at.outputs["Fac"], clamp=True)
    bw = N.new("ShaderNodeRGBToBW")
    N.link(cl.outputs["Color"], bw.inputs[0])
    dcol = N.mix(N.math("MULTIPLY", bw.outputs[0], 0.6), S.lin(dirt), S.lin("#8a7a66"))
    t = N.new("ShaderNodeBsdfTransparent")
    N.link(N.mix(a, (1, 1, 1, 1), dcol), t.inputs["Color"])
    g = N.new("ShaderNodeBsdfGlossy", Roughness=0.3, Color=(0.6, 0.6, 0.6, 1))
    mx = N.new("ShaderNodeMixShader")
    N.link(N.math("MULTIPLY", a, gloss), mx.inputs[0])
    N.link(t.outputs[0], mx.inputs[1])
    N.link(g.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_blinds(ys, cw, zbase, gf_h):
    """Stores vénitiens à lames, baissés à une hauteur différente dans chaque fenêtre (ou pas
    de store) : translucides, la lampe de la chambre les fait luire."""
    m, N, out = S.material("blinds")
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    y, z = xyz[1], xyz[2]
    r1, rgb, fy, fz = S._cells(N, y, z, ys, cw, zbase, S.FH, 7.0)
    has = N.math("MULTIPLY", N.math("GREATER_THAN", r1, 0.12), N.math("LESS_THAN", r1, 0.62))
    # le store descend du linteau (fz ≈ 0,78) jusqu'à une hauteur au hasard
    bottom = N.math("SUBTRACT", 0.8, N.math("MULTIPLY", N.math("ADD", 0.15, N.math("MULTIPLY", rgb[1], 0.85)), 0.52))
    down = N.math("GREATER_THAN", fz, bottom)
    slat = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", z, 0.05)), N.math("ADD", 0.55, N.math("MULTIPLY", rgb[2], 0.4)))
    mask = N.math("MULTIPLY", N.math("MULTIPLY", has, down), slat)
    mask = N.math("MULTIPLY", mask, N.math("GREATER_THAN", z, gf_h))
    tr = N.new("ShaderNodeBsdfTransparent")
    tl = N.new("ShaderNodeBsdfTranslucent", Color=S.lin("#efe4cf"))
    df = N.new("ShaderNodeBsdfDiffuse", Color=S.lin("#e6dccb"))
    cloth = N.new("ShaderNodeMixShader")
    N.set(cloth.inputs[0], 0.45)
    N.link(tl.outputs[0], cloth.inputs[1])
    N.link(df.outputs[0], cloth.inputs[2])
    # la lampe de la chambre fait luire le store (dans les chambres allumées seulement)
    lit = N.math("GREATER_THAN", rgb[0], 0.3)
    glow = N.new("ShaderNodeEmission", Color=S.lin("#ffd9a6"))
    N.link(N.math("MULTIPLY", lit, N.math("ADD", 1.2, N.math("MULTIPLY", rgb[1], 2.5))), glow.inputs["Strength"])
    lamp = N.new("ShaderNodeAddShader")
    N.link(cloth.outputs[0], lamp.inputs[0])
    N.link(glow.outputs[0], lamp.inputs[1])
    mx = N.new("ShaderNodeMixShader")
    N.link(mask, mx.inputs[0])
    N.link(tr.outputs[0], mx.inputs[1])
    N.link(lamp.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mats(key="B"):
    M = {
        "stucco": mat_plaster("pbr_stucco"),
        "trim": mat_plaster("pbr_trim", trim=True),
        "coral": mat_coral(),
        "terrazzo": mat_terrazzo(),
        "shutter": mat_shutter(),
        "frame": mat_metal_paint("frame_cream", "#ece6da", 0.35),
        "bronze": mat_metal_paint("frame_bronze", "#3a2f2a", 0.3),
        "rail": mat_metal_paint("rail_cream", "#efe9de", 0.4),
        "pipe": mat_metal_paint("downpipe", "#d9cfc4", 0.45),
        "dark": S.mat_plain("dark_metal", (0.03, 0.03, 0.035, 1), 0.4, 0.7),
        "glass": mat_glass(),
        "inside": S.mat_plain("pbr_inside", S.lin("#5a4c44"), 0.9),
        "ceiling": S.mat_plain("pbr_ceiling", S.lin("#d8d0c4"), 0.8),
        "roof": S.mat_roof(),
        "rooms": S.mat_rooms(key, 0.0, 4.0, 1.0, 4.2, False, 0.0, 4.0),
        "curtain": S.mat_curtain(key, 0.0, 4.0, 1.0, 4.2),
        "blinds": mat_blinds(0.0, 4.0, 1.0, 4.2),
        "decal_hang": mat_decal("decal_leak004", "Leaking004"),
        "decal_rise": mat_decal("decal_leak008", "Leaking008", dirt="#4a3f35", gloss=0.05),
        "decal_rise2": mat_decal("decal_leak007", "Leaking007", dirt="#4a3f35", gloss=0.05),
        "decal_thin": mat_decal("decal_leak009", "Leaking009", gloss=0.12),
    }
    return M
