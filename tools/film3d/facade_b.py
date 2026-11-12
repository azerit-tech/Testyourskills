# Les étages des huit immeubles du film, méthode B du banc de réalisme (« pbr ») : géométrie
# modeste, réalisme porté par les surfaces. Le rez-de-chaussée est celui de la méthode A
# (facade_mix.py fond les deux en un objet instancié par dessin).
#
#   import facade_b
#   M = facade_b.mats(S)                                   # une fois (en cache dans bpy.data)
#   objs, props, lights = facade_b.upper(S, key, M, spec, gf_h)
#
# Repère de scene_a : façade en x = 0 tournée vers +x, emprise y de 0 à W, profondeur vers −x.
# upper() rend tout ce qui est au-dessus de z = gf_h (mur à vrais tableaux, menuiseries, appuis,
# sourcils, balcons, tours d'angle arrondies, retraits, acrotère, corniche, pylône ou gradins,
# accessoires de toit, potence d'enseigne, coulures, chambres derrière les vitres), en objets
# maillage simples, à la teinte de l'instance (Object Info). Accessoires au format de place() :
# ("ac" | "tank", (x, y, z), rot_z, échelle) ; lumières : ("light", (x, y, z), dict(kind, direction,
# color, energy, size, spot)) et les sortes de place() (« wash » de l'enseigne de toit, « blade »).
#
# Matières (CC0) : enduit peint ambientCG PaintedPlaster017, reprises Plaster003, coulures
# Leaking004/007/008/009 ; pierre corallienne Poly Haven coral_fort_wall_01 (soubassement de A).
# Projection en boîte, coordonnées objet : aucun UV à fabriquer. Le nœud Bevel arrondit les
# arêtes ; il exige un maillage sans faces internes, d'où l'union booléenne exacte de la masse
# en stuc de chaque dessin (repli sans Bevel si l'opération échoue).
import math
import os
import random
import time
import zlib

import bmesh
import bpy
import numpy as np
from mathutils import Vector

S = None               # le module scene_a, passé par l'appelant
T = 0.3                # épaisseur du mur de façade : profondeur des tableaux
RD = 4.0               # profondeur des chambres

PP = "PaintedPlaster017/PaintedPlaster017_2K-JPG_"
PL = "Plaster003/Plaster003_2K-JPG_"
CORAL = "coral_fort_wall_01/"

# ce que chaque dessin ajoute à sa spec : néons, filets « vitesse », pylône, sourcils par fenêtre,
# et la règle des climatiseurs de façade (Jacques : « deux clims par étage c'est beaucoup ») ; pylon_tube et
# pylon_light : le néon et la lumière du pylône (lilas sinon ; la rue des enseignes les veut sans lilas)
STYLE = {
    "deco": dict(coping="coral", speed=True, tower_tube="lilac", ac=0.0),
    "hotel": dict(pylon=True, coping="coral", speed=True, brow="window", letters="HOTEL", ac=0.28),
    "shop": dict(ac=0.3),
    "liner": dict(coping="lilac", ac=0.0),
    "flats": dict(ac=0.2, ac_cluster=True),
    "motel": dict(gallery_tube="coral", ac=0.3),
    "tower": dict(setback_tube="cream", ac=0.12),
    "block": dict(coping="coral", speed=True, ac=0.0),
}
NEON = {"lilac": "#8d8cf0", "coral": "#ff6a3d", "cream": "#fff9cb"}
WARM = "#ffdcb4"


# ---------------------------------------------------------------- matières

def _p(rel):
    return os.path.join(S.ASSETS, rel)


_MEAN = {}


def mean_lum(rel):
    """Luminance moyenne (linéaire) d'une photo, pour la ramener autour de 1 (mémoire libérée après)."""
    if rel not in _MEAN:
        img = bpy.data.images.load(_p(rel), check_existing=True)
        a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
        img.pixels.foreach_get(a)
        a = a.reshape(-1, 4)[::61, :3]
        del img
        a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
        _MEAN[rel] = float((a @ np.array([0.2126, 0.7152, 0.0722], np.float32)).mean())
        bpy.data.images.load(_p(rel), check_existing=True).buffers_free()
    return _MEAN[rel]


def _img(rel, color, far):
    img = bpy.data.images.load(_p(rel), check_existing=True)
    if not color:
        img.colorspace_settings.name = "Non-Color"
    if far:
        name = os.path.basename(rel) + "_1k"
        small = bpy.data.images.get(name)
        if small is None:
            small = img.copy()
            small.name = name
            small.scale(1024, max(1, img.size[1] * 1024 // max(1, img.size[0])))
            small.pack()
            img.buffers_free()
        img = small
    return img


def tex(N, rel, vec, color=True, blend=0.3, far=False, box=True):
    t = N.new("ShaderNodeTexImage")
    t.image = _img(rel, color, far)
    if box:
        t.projection = "BOX"
        t.projection_blend = blend
    N.set(t.inputs["Vector"], vec)
    return t


def vmap(N, vec, s):
    m = N.new("ShaderNodeMapping", Scale=s if isinstance(s, tuple) else (s, s, s))
    N.link(vec, m.inputs["Vector"])
    return m.outputs[0]


def vadd(N, a, b):
    v = N.new("ShaderNodeVectorMath", _operation="ADD")
    N.set(v.inputs[0], a)
    N.set(v.inputs[1], b)
    return v.outputs[0]


def smooth(N, x, a, b):
    m = N.new("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP", **{"From Min": a, "From Max": b})
    N.set(m.inputs["Value"], x)
    return m.outputs[0]


def detail(N, color_out, rel, contrast):
    bw = N.new("ShaderNodeRGBToBW")
    N.link(color_out, bw.inputs[0])
    d = N.math("DIVIDE", bw.outputs[0], mean_lum(rel))
    return N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", d, 1.0), contrast))


def mat_plaster(name, trim=False, bevel=True, far=False):
    """Enduit peint teinté par l'objet : grain photographique, reprises de peinture (plaques de
    Tchebychev, teinte voisine, enduit plus frais, petite lèvre), passé au soleil, lavé en
    traînées, crasse des creux (occlusion locale), pied de mur mouillé, arêtes arrondies."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    info = N.new("ShaderNodeObjectInfo")
    z = N.sep(co)[2]
    off = N.new("ShaderNodeCombineXYZ")
    for i, k in enumerate((37.0, 53.0, 11.0)):
        N.link(N.math("MULTIPLY", info.outputs["Random"], k), off.inputs[i])
    vt = vadd(N, co, off.outputs[0])
    v1, v2 = vmap(N, vt, 0.42), vmap(N, vt, 0.6)
    c1 = tex(N, PP + "Color.jpg", v1, far=far)
    r1 = tex(N, PP + "Roughness.jpg", v1, False, far=far)
    h1 = tex(N, PP + "Displacement.jpg", v1, False, far=far)
    c2 = tex(N, PL + "Color.jpg", v2, far=far)
    r2 = tex(N, PL + "Roughness.jpg", v2, False, far=far)
    h2 = tex(N, PL + "Displacement.jpg", v2, False, far=far)
    d1 = detail(N, c1.outputs["Color"], PP + "Color.jpg", 1.1)
    d2 = detail(N, c2.outputs["Color"], PL + "Color.jpg", 0.7)
    jn = N.new("ShaderNodeTexNoise", Scale=7.0, Detail=6.0, Roughness=0.7)
    N.link(co, jn.inputs["Vector"])
    jin = N.new("ShaderNodeVectorMath", _operation="SUBTRACT")
    N.link(jn.outputs["Color"], jin.inputs[0])
    N.set(jin.inputs[1], (0.5, 0.5, 0.5))
    jit = N.new("ShaderNodeVectorMath", _operation="SCALE")
    N.link(jin.outputs[0], jit.inputs[0])
    jit.inputs["Scale"].default_value = 0.06
    pc = vadd(N, vmap(N, vt, (0.42, 0.42, 0.55)), jit.outputs[0])
    vor = N.new("ShaderNodeTexVoronoi", _voronoi_dimensions="3D", _distance="CHEBYCHEV", Scale=1.0, Randomness=0.85)
    N.link(pc, vor.inputs["Vector"])
    cell = N.sep(vor.outputs["Color"])
    patch = N.math("GREATER_THAN", cell[0], 0.5)
    pval = N.mixf(patch, 1.0, N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", cell[1], 0.5), 0.26)))
    base = info.outputs["Color"]
    if trim:
        base = N.mix(0.8, base, S.lin("#f4efe4"))
    warm = N.mix(1.0, base, (1.07, 1.0, 0.9, 1), "MULTIPLY")
    cool = N.mix(1.0, base, (0.92, 0.97, 1.06, 1), "MULTIPLY")
    tint = N.mix(patch, base, N.mix(cell[2], warm, cool))
    det = N.mixf(patch, d1, d2)
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
    if bevel:
        ao = N.new("ShaderNodeAmbientOcclusion", Distance=0.45)
        ao.samples = 4
        ao.only_local = True
        dirt = N.math("MULTIPLY", N.math("POWER", N.math("SUBTRACT", 1.0, ao.outputs["AO"]), 1.3), 0.7)
        col = N.mix(dirt, col, N.mix(1.0, col, S.lin("#6f6052"), "MULTIPLY"))
    en = N.new("ShaderNodeTexNoise", Scale=1.6, Detail=5.0, Roughness=0.65)
    N.link(vt, en.inputs["Vector"])
    lim = N.math("ADD", 0.75, N.math("MULTIPLY", en.outputs["Factor"], 0.6))
    wet = N.math("SUBTRACT", 1.0, smooth(N, z, N.math("SUBTRACT", lim, 0.35), lim))
    col = N.mix(N.math("MULTIPLY", wet, 0.75), col, N.mix(1.0, col, S.lin("#7d7168"), "MULTIPLY"))
    rough = N.math("ADD", 0.12, N.math("MULTIPLY", N.mixf(patch, r1.outputs["Color"], r2.outputs["Color"]), 0.85))
    rough = N.mixf(N.math("MULTIPLY", wet, 0.8), rough, 0.32)
    h = N.math("ADD", N.mixf(patch, h1.outputs["Color"], h2.outputs["Color"]), N.math("MULTIPLY", patch, 0.25))
    b = N.new("ShaderNodeBump", Strength=1.0, Distance=0.007)
    N.set(b.inputs["Height"], h)
    if bevel:
        bv = N.new("ShaderNodeBevel", Radius=0.022 if not trim else 0.018)
        bv.samples = 4
        N.link(bv.outputs[0], b.inputs["Normal"])
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(rough, p.inputs["Roughness"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_coral(far=False):
    """Pierre corallienne (soubassement) : vrai déplacement si l'objet a une subdivision adaptative."""
    m, N, out = S.material("fb_coral_stone" + ("_far" if far else ""))
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    z = N.sep(co)[2]
    v = vmap(N, co, 0.55)
    c = tex(N, CORAL + "diff_2k.jpg", v, far=far)
    r = tex(N, CORAL + "rough_2k.jpg", v, False, far=far)
    h = tex(N, CORAL + "disp_2k.png", v, False, far=far)
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
    if hasattr(m, "displacement_method"):
        m.displacement_method = "BOTH"
    if hasattr(m, "max_vertex_displacement"):
        m.max_vertex_displacement = 0.03
    return m


def mat_metal_paint(name, hexcolor, rough=0.38):
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
    """Vitre : transparente de face, miroir du ciel en incidence rasante ; gouttes, traces."""
    m, N, out = S.material("fb_glass")
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


def mat_decal(name, folder, dirt="#3a3029", gloss=0.1, far=False):
    """Coulure : voile transparent teinté (multiplie le mur, garde sa teinte et son grain), un peu
    brillant. Force par décalcomanie dans l'attribut de coin « dstr »."""
    m, N, out = S.material(name)
    uv = N.new("ShaderNodeUVMap").outputs[0]
    op = tex(N, f"{folder}/{folder}_2K-JPG_Opacity.jpg", uv, False, far=far, box=False)
    cl = tex(N, f"{folder}/{folder}_2K-JPG_Color.jpg", uv, far=far, box=False)
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


def mat_blinds(key, ys, cw, zbase, gf_h):
    """Stores vénitiens baissés à une hauteur différente par fenêtre (ou absents), translucides,
    qui luisent quand la chambre est allumée."""
    m, N, out = S.material(f"fb_blinds_{key}")
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    y, z = xyz[1], xyz[2]
    r1, rgb, fy, fz = S._cells(N, y, z, ys, cw, zbase, S.FH, 7.0)
    has = N.math("MULTIPLY", N.math("GREATER_THAN", r1, 0.12), N.math("LESS_THAN", r1, 0.62))
    bottom = N.math("SUBTRACT", 0.8, N.math("MULTIPLY", N.math("ADD", 0.15, N.math("MULTIPLY", rgb[1], 0.85)), 0.52))
    slat = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", z, 0.05)), N.math("ADD", 0.55, N.math("MULTIPLY", rgb[2], 0.4)))
    mask = N.math("MULTIPLY", N.math("MULTIPLY", has, N.math("GREATER_THAN", fz, bottom)), slat)
    mask = N.math("MULTIPLY", mask, N.math("GREATER_THAN", z, gf_h))
    tr = N.new("ShaderNodeBsdfTransparent")
    tl = N.new("ShaderNodeBsdfTranslucent", Color=S.lin("#efe4cf"))
    df = N.new("ShaderNodeBsdfDiffuse", Color=S.lin("#e6dccb"))
    cloth = N.new("ShaderNodeMixShader")
    N.set(cloth.inputs[0], 0.45)
    N.link(tl.outputs[0], cloth.inputs[1])
    N.link(df.outputs[0], cloth.inputs[2])
    glow = N.new("ShaderNodeEmission", Color=S.lin("#ffd9a6"))
    N.link(N.math("MULTIPLY", N.math("GREATER_THAN", rgb[0], 0.3), N.math("ADD", 1.2, N.math("MULTIPLY", rgb[1], 2.5))), glow.inputs["Strength"])
    lamp = N.new("ShaderNodeAddShader")
    N.link(cloth.outputs[0], lamp.inputs[0])
    N.link(glow.outputs[0], lamp.inputs[1])
    mx = N.new("ShaderNodeMixShader")
    N.link(mask, mx.inputs[0])
    N.link(tr.outputs[0], mx.inputs[1])
    N.link(lamp.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mats(S_module, far=False):
    """Les matières de la méthode B, créées une fois (en cache dans bpy.data). far=True : les mêmes
    avec des photos ramenées à 1k (immeubles lointains). Clés : stucco, trim (Bevel), stucco_nb,
    trim_nb (sans Bevel ni occlusion), coral, decal_hang, decal_rise, decal_rise2, decal_thin,
    glass, frame_w, frame_b, rail_w, rail_b, pipe, dark, inside, ceiling, door, neon_<couleur>."""
    global S
    S = S_module
    sfx = "_far" if far else ""
    cache = bpy.data.materials.get("fb_stucco" + sfx)

    def get(name, make):
        m = bpy.data.materials.get(name)
        return m if (m is not None and cache is not None) else make()

    M = {
        "stucco": get("fb_stucco" + sfx, lambda: mat_plaster("fb_stucco" + sfx, far=far)),
        "trim": get("fb_trim" + sfx, lambda: mat_plaster("fb_trim" + sfx, trim=True, far=far)),
        "stucco_nb": get("fb_stucco_nb" + sfx, lambda: mat_plaster("fb_stucco_nb" + sfx, bevel=False, far=far)),
        "trim_nb": get("fb_trim_nb" + sfx, lambda: mat_plaster("fb_trim_nb" + sfx, trim=True, bevel=False, far=far)),
        "coral": get("fb_coral_stone" + sfx, lambda: mat_coral(far)),
        "decal_hang": get("fb_decal_leak004" + sfx, lambda: mat_decal("fb_decal_leak004" + sfx, "Leaking004", far=far)),
        "decal_rise": get("fb_decal_leak008" + sfx, lambda: mat_decal("fb_decal_leak008" + sfx, "Leaking008", "#4a3f35", 0.05, far)),
        "decal_rise2": get("fb_decal_leak007" + sfx, lambda: mat_decal("fb_decal_leak007" + sfx, "Leaking007", "#4a3f35", 0.05, far)),
        "decal_thin": get("fb_decal_leak009" + sfx, lambda: mat_decal("fb_decal_leak009" + sfx, "Leaking009", gloss=0.12, far=far)),
        "glass": get("fb_glass", mat_glass),
        "frame_w": get("fb_frame_cream", lambda: mat_metal_paint("fb_frame_cream", "#ece6da", 0.35)),
        "frame_b": get("fb_frame_bronze", lambda: mat_metal_paint("fb_frame_bronze", "#3a2f2a", 0.3)),
        "rail_w": get("fb_rail_cream", lambda: mat_metal_paint("fb_rail_cream", "#efe9de", 0.4)),
        "rail_b": get("fb_rail_bronze", lambda: mat_metal_paint("fb_rail_bronze", "#33302e", 0.35)),
        "pipe": get("fb_pipe", lambda: mat_metal_paint("fb_pipe", "#d9cfc4", 0.45)),
        "door": get("fb_door", lambda: mat_metal_paint("fb_door", "#3d4a6b", 0.4)),
        "dark": get("fb_dark", lambda: S.mat_plain("fb_dark", (0.03, 0.03, 0.035, 1), 0.4, 0.7)),
        "inside": get("fb_inside", lambda: S.mat_plain("fb_inside", S.lin("#5a4c44"), 0.9)),
        "ceiling": get("fb_ceiling", lambda: S.mat_plain("fb_ceiling", S.lin("#d8d0c4"), 0.8)),
        "roof": get("fb_roof", S.mat_roof),
        "sign": get("fb_sign", lambda: S.mat_plain("fb_sign", S.lin("#e7e1d3"), 0.55)),
    }
    if cache is None:
        # renommer les matières faites par les fonctions de scene_a (noms génériques)
        M["roof"].name = "fb_roof"
    for c, hx in NEON.items():
        M[f"neon_{c}"] = get(f"fb_neon_{c}", lambda hx=hx, c=c: S.mat_emit(f"fb_neon_{c}", S.lin(hx), 22.0 if c != "cream" else 12.0))
    return M


# ---------------------------------------------------------------- géométrie

def _seed(key):
    return zlib.crc32(key.encode()) & 0xFFFFFFFF


def add_prism(B, pts, z0, z1, mat):
    """Un prisme (angle arrondi) dans un Boxes."""
    idx = B._mi(mat)
    bm = B.bm
    lo = [bm.verts.new((x, y, z0)) for x, y in pts]
    hi = [bm.verts.new((x, y, z1)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i])).material_index = idx
    bm.faces.new(list(reversed(lo))).material_index = idx
    bm.faces.new(hi).material_index = idx


class Decals:
    """Quads de décalcomanie avec UV et force par coin (« dstr »)."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.st = self.bm.loops.layers.float_color.new("dstr")
        self.mats = []

    def add(self, mat, plane, a0, a1, z0, z1, strength, u=(0.0, 1.0), flip=False):
        if z1 - z0 < 0.05 or a1 - a0 < 0.05:
            return
        if mat not in self.mats:
            self.mats.append(mat)
        axis, c = plane
        if axis == "x":
            pts = [(c, a0, z0), (c, a1, z0), (c, a1, z1), (c, a0, z1)]
        else:
            pts = [(a1, c, z0), (a0, c, z0), (a0, c, z1), (a1, c, z1)]
        ua, ub = (u[1], u[0]) if flip else u
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f.material_index = self.mats.index(mat)
        for loop, t in zip(f.loops, [(ua, 0), (ub, 0), (ub, 1), (ua, 1)]):
            loop[self.uv].uv = t
            loop[self.st] = (strength, strength, strength, 1.0)

    def done(self):
        if not self.bm.faces:
            self.bm.free()
            return None
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        return ob


def union_clean(ob, cutter, M):
    """Union de la masse (pavés qui se recouvrent) et différence des ouvertures, en une passe
    booléenne exacte : un maillage sans faces internes. Repli sans Bevel si ça échoue."""
    t0 = time.time()
    ok = True
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    backup = ob.data.copy()
    npoly = len(ob.data.polygons)
    for solver in ("EXACT", "FLOAT"):
        try:
            md = ob.modifiers.new("open", "BOOLEAN")
            md.operation = "DIFFERENCE"
            md.solver = solver
            md.object = cutter
            if solver == "EXACT":
                md.use_self = True
                md.use_hole_tolerant = True
            bpy.ops.object.modifier_apply(modifier=md.name)
            if len(ob.data.polygons) < npoly * 0.3:
                raise RuntimeError(f"booléen suspect ({npoly} -> {len(ob.data.polygons)} faces)")
            break
        except Exception as e:
            print(f"[facade_b] {ob.name} : booléen {solver} raté ({e})", flush=True)
            ob.modifiers.clear()
            old = ob.data
            ob.data = backup.copy()
            bpy.data.meshes.remove(old)
            ok = False
    if not ok:
        # pas d'union exacte : des faces internes restent, le Bevel y ferait des coutures
        swap = {M["stucco"]: M["stucco_nb"], M["trim"]: M["trim_nb"]}
        for i, m in enumerate(ob.data.materials):
            if m in swap:
                ob.data.materials[i] = swap[m]
    bpy.data.meshes.remove(backup)
    bpy.data.objects.remove(cutter)
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(32))
    except Exception:
        for p in me.polygons:
            p.use_smooth = False
    print(f"[facade_b] {ob.name} : masse {len(me.polygons)} faces, {time.time() - t0:.1f} s, bevel={ok}", flush=True)
    return ok


def text_mesh(name, ch, loc, size, mat, depth=0.035):
    """Une lettre-boîtier tournée vers +x, convertie en maillage (pour être fondue)."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = ch
    cu.size = size
    cu.extrude = depth
    cu.bevel_depth = 0.005
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.collection.objects.link(tmp)
    tmp.data.materials.append(mat)
    tmp.location = loc
    tmp.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    me.transform(tmp.matrix_world)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    return ob


def tube(name, p0, p1, mat, r=0.016):
    return S.cyl(name, p0, p1, r, mat, seg=8)


def upper(S_module, key, M, spec, gf_h):
    """Les étages d'un dessin (au-dessus de gf_h) : (objets, accessoires, lumières)."""
    global S
    S = S_module
    if M is None or "stucco_nb" not in M:
        M = dict(M or {}, **mats(S))
    st_ = dict(STYLE.get(key, {}))
    P = dict(pier=0.5, sill=0.9, wh=1.6, frame="frame_w", rail="trim", balc_d=1.3, floors=4, r=3.0, ct=4.5,
             round_near=False, round_far=False)
    P.update(spec)
    FH = S.FH
    W, Dp, nfl = P["W"], P["D"], P["floors"]
    sill, wh, pier = P["sill"], P["wh"], P["pier"]
    tops = gf_h + (nfl - 1) * FH
    ya = P["ct"] if P["round_near"] else 0.3
    yb = W - P["ct"] if P["round_far"] else W - 0.3
    ncol = P.get("ncol") or max(2, round((yb - ya) / P.get("bay", 3.0)))
    cw = (yb - ya) / ncol
    zbase = gf_h - FH
    sb_n, sb = P.get("setback", (0, 0.0))
    main_top = gf_h + (nfl - 1 - sb_n) * FH
    R = random.Random(_seed(key))
    st, tr = M["stucco"], M["trim"]
    fm = M["frame_b" if P["frame"] == "frame_b" else "frame_w"]
    rail = M["rail_b" if P["rail"] == "frame_b" else "rail_w"]
    rooms_m = S.mat_rooms(f"fb_{key}", ya, cw, zbase, gf_h, False, ya, cw)
    curtain = S.mat_curtain(f"fb_{key}", ya, cw, zbase, gf_h)
    blinds = mat_blinds(key, ya, cw, zbase, gf_h)
    props, lights = [], []
    pylon = (W / 2 - 1.6, W / 2 + 1.6) if st_.get("pylon") else None
    PYX = 0.45

    # -- les ouvertures, étage par étage
    openings = []          # (f, k, xo, y0, y1, z0, z1, door, balcony)
    for f in range(1, nfl):
        zf = gf_h + (f - 1) * FH
        xo = -sb if f >= nfl - sb_n else 0.0
        bal = P.get("balc", "none")
        bays = {"all": set(range(ncol)), "alt": set(range(f % 2, ncol, 2)), "ends": {0, ncol - 1}}.get(bal, set())
        if P.get("gallery") and f == 1:
            bays = set()
        doors = P.get("doors", ()) if P.get("gallery") else ()
        for k in range(ncol):
            y0, y1 = ya + k * cw + pier / 2, ya + (k + 1) * cw - pier / 2
            if pylon and y1 > pylon[0] - 0.3 and y0 < pylon[1] + 0.3:
                continue
            door = k in bays or k in doors
            z0 = zf + (0.06 if door else sill)
            openings.append((f, k, xo, y0, y1, z0, zf + sill + wh, door, k in bays))

    # -- la masse en stuc (union booléenne)
    B = S.Boxes(f"fb_{key}_mass")
    top_par = main_top + 0.9
    B.add(-T, 0, ya, yb, gf_h, top_par, st)
    if not P["round_near"]:
        B.add(-Dp, 0, 0, T, gf_h, top_par, st)
    if not P["round_far"]:
        B.add(-Dp, 0, W - T, W, gf_h, top_par, st)
    B.add(-Dp, -Dp + T, 0, W, gf_h, top_par, st)
    B.add(-Dp, 0, 0, W, main_top - 0.2, main_top, M["roof"])
    # larmier qui couvre le joint avec le rez-de-chaussée
    B.add(0, 0.26, ya, yb, gf_h - 0.12, gf_h + 0.02, tr)
    if sb_n:
        B.add(-sb - T, -sb, ya, yb, main_top, tops + 0.9, st)
        B.add(-Dp, -sb, 0.3, T + 0.3, main_top, tops + 0.9, st)
        B.add(-Dp, -sb, W - T - 0.3, W - 0.3, main_top, tops + 0.9, st)
        B.add(-Dp, -sb, 0.3, W - 0.3, tops - 0.2, tops, M["roof"])
        B.add(-sb, -sb + 0.2, ya, yb, tops + 0.7, tops + 0.9, tr)
    # tours d'angle arrondies, filets qui en font le tour
    for near in ([True] if P["round_near"] else []) + ([False] if P["round_far"] else []):
        yy0, yy1 = (0, ya) if near else (yb, W)
        add_prism(B, S.rounded_footprint(-Dp, 0, yy0, yy1, P["r"], near=near, far=not near), gf_h - 0.12, main_top + 0.9, st)
        g = 0.6 if P.get("eyebrow") else 0.14
        for f in range(1, nfl - sb_n):
            zz = gf_h + (f - 1) * FH + sill + wh + 0.06
            add_prism(B, S.rounded_footprint(-Dp, 0, yy0, yy1, P["r"], grow=g, near=near, far=not near), zz, zz + 0.1, tr)
        add_prism(B, S.rounded_footprint(-Dp, 0, yy0, yy1, P["r"], grow=0.12, near=near, far=not near), main_top + 0.7, main_top + 0.9, tr)
    # sourcils : filants (par défaut) ou un par fenêtre (l'hôtel)
    if P.get("eyebrow"):
        for f in range(1, nfl):
            zf = gf_h + (f - 1) * FH
            xo = -sb if f >= nfl - sb_n else 0.0
            zt = zf + sill + wh
            if st_.get("brow") == "window":
                for (ff, k, xx, y0, y1, z0, z1, door, bal) in openings:
                    if ff == f:
                        B.add(xo, xo + 0.58, y0 - 0.3, y1 + 0.3, zt + 0.16, zt + 0.27, tr)
            else:
                B.add(xo, xo + 0.6, ya, yb, zt + 0.06, zt + 0.16, tr)
    if P.get("bands"):
        for f in range(1, nfl):
            xo = -sb if f >= nfl - sb_n else 0.0
            zf = gf_h + (f - 1) * FH
            B.add(xo, xo + 0.12, ya, yb, zf - 0.12, zf, tr)
    # balcons : la dalle (dans la masse, arrondie au Bevel) ; garde-corps plus bas
    for (f, k, xo, y0, y1, z0, z1, door, bal) in openings:
        if bal:
            zf = gf_h + (f - 1) * FH
            B.add(xo, xo + P["balc_d"], y0 - pier / 2 + 0.05, y1 + pier / 2 - 0.05, zf - 0.18, zf + 0.02, tr)
    # acrotère : corniche, couvertine, filets « vitesse »
    B.add(0, 0.22, ya, yb, main_top + 0.7, main_top + 0.9, tr)
    B.add(-T - 0.03, 0.06, ya, yb, top_par, top_par + 0.07, tr)
    if st_.get("speed"):
        for k in range(3):
            zz = main_top + 0.12 + k * 0.17
            B.add(0, 0.04, ya, yb, zz, zz + 0.06, tr)
    # gradins au faîte, ou le pylône de l'hôtel
    if pylon:
        p0, p1 = pylon
        B.add(-T, PYX, p0, p1, gf_h - 0.12, top_par + 0.6, st)
        B.add(-T, PYX - 0.12, p0 + 0.4, p1 - 0.4, top_par + 0.6, top_par + 1.6, st)
        B.add(-T, PYX - 0.24, p0 + 0.8, p1 - 0.8, top_par + 1.6, top_par + 2.6, st)
        B.add(-T, PYX - 0.36, p0 + 1.2, p1 - 1.2, top_par + 2.6, top_par + 3.4, st)
        for zz, w in ((top_par + 0.6, 0.0), (top_par + 1.6, 0.4), (top_par + 2.6, 0.8)):
            B.add(-T, PYX + 0.06 - w * 0.3, p0 - 0.05 + w, p1 + 0.05 - w, zz - 0.1, zz, tr)
        for yy in (p0 + 0.15, p1 - 0.45):
            B.add(PYX, PYX + 0.16, yy, yy + 0.3, gf_h, top_par + 0.3, tr)
        for k in range(3):
            yy = W / 2 - 0.55 + k * 0.45
            B.add(PYX, PYX + 0.05, yy, yy + 0.2, main_top - 0.4, top_par + 0.5, st)
    elif P.get("step"):
        yc = W / 2
        B.add(-0.4, 0, yc - 3.2, yc + 3.2, top_par, main_top + 2.0, st)
        B.add(-0.4, 0, yc - 1.6, yc + 1.6, main_top + 2.0, main_top + 3.0, st)
        B.add(0, 0.2, yc - 3.2, yc + 3.2, main_top + 1.85, main_top + 2.0, tr)
        B.add(0, 0.16, yc - 1.6, yc + 1.6, main_top + 2.85, main_top + 3.0, tr)
    # coursive de motel : la dalle et l'avancée du toit (les poteaux et lisses plus bas)
    if P.get("gallery"):
        B.add(0, 2.0, ya, yb, gf_h - 0.22, gf_h, tr)
        B.add(0, 2.4, ya - 0.2, yb + 0.2, tops, tops + 0.35, tr)
    mass = B.done()
    C = S.Boxes(f"fb_{key}_cut")
    for (f, k, xo, y0, y1, z0, z1, door, bal) in openings:
        C.add(xo - T - 0.1, xo + 0.1, y0, y1, z0, z1, st)
    bevel_ok = union_clean(mass, C.done(), M)
    objs = [mass]

    # -- menuiseries, appuis, garde-corps, chambres, toit, potence (un maillage, sans union)
    D = S.Boxes(f"fb_{key}_details")
    trd = tr if bevel_ok else M["trim_nb"]
    std = M["stucco_nb"]
    for (f, k, xo, y0, y1, z0, z1, door, bal) in openings:
        xa, xb = xo - 0.22, xo - 0.16
        if not door:
            D.add(xo - 0.2, xo + 0.07, y0 - 0.06, y1 + 0.06, z0 - 0.05, z0 + 0.01, trd)
        for a, b, c, d in ((y0, y1, z0, z0 + 0.06), (y0, y1, z1 - 0.06, z1), (y0, y0 + 0.06, z0, z1), (y1 - 0.06, y1, z0, z1)):
            D.add(xa, xb, a, b, c, d, fm)
        w = y1 - y0
        nm = 2 if w > 2.2 else 1 if w > 1.3 else 0
        for j in range(1, nm + 1):
            ym = y0 + w * j / (nm + 1)
            D.add(xa - 0.01, xb, ym - 0.03, ym + 0.03, z0, z1, fm)
        D.add(xa, xb + 0.005, y0, y1, z1 - 0.47, z1 - 0.43, fm)
        if door and P.get("gallery"):
            D.add(xo - 0.2, xo - 0.15, y0 + 0.06, y1 - 0.06, z0, z1 - 0.5, M["door"])
        D.add(xo - 0.195, xo - 0.19, y0, y1, z0, z1, M["glass"])
        D.add(xo - 0.27, xo - 0.265, y0, y1, z0, z1, blinds)
        D.add(xo - 0.55, xo - 0.545, y0, y1, z0 + 0.1, z1, curtain)
        if bal:
            zf = gf_h + (f - 1) * FH
            xr = xo + P["balc_d"] - 0.07
            ya_, yb_ = y0 - pier / 2 + 0.1, y1 + pier / 2 - 0.1
            for zr in (0.38, 0.68, 1.0):
                D.add(xr - 0.025, xr + 0.025, ya_, yb_, zf + zr - 0.025, zf + zr + 0.025, rail)
                for ye in (ya_, yb_):
                    D.add(xo, xr, ye - 0.02, ye + 0.02, zf + zr - 0.02, zf + zr + 0.02, rail)
            n = max(1, int((yb_ - ya_) / 1.1))
            for j in range(n + 1):
                yk = ya_ + (yb_ - ya_) * j / n
                D.add(xr - 0.03, xr + 0.03, yk - 0.03, yk + 0.03, zf + 0.02, zf + 1.02, rail)
    # les chambres : fond lumineux (scene_a), dalles, plafonds, cloisons
    for f in range(1, nfl):
        zf = gf_h + (f - 1) * FH
        xo = -sb if f >= nfl - sb_n else 0.0
        D.add(xo - RD, xo - T, ya, yb, zf, zf + 0.12, M["inside"])
        D.add(xo - RD, xo - T, ya, yb, zf + FH - 0.22, zf + FH, M["ceiling"])
        for k in range(ncol + 1):
            yk = ya + k * cw
            D.add(xo - RD, xo - T, max(ya, yk - 0.06), min(yb, yk + 0.06), zf, zf + FH, M["inside"])
    D.add(-Dp + T, -RD, ya, yb, gf_h, main_top - 0.2, M["inside"], front_mat=rooms_m)
    if sb_n:
        D.add(-Dp + T, -sb - RD, ya, yb, main_top, tops - 0.2, M["inside"], front_mat=rooms_m)
    # coursive : poteaux, lisses, escalier
    if P.get("gallery"):
        zf = gf_h
        for zr in (0.45, 0.95):
            D.add(1.92, 1.97, ya, yb, zf + zr - 0.03, zf + zr + 0.03, rail)
        for k in range(int((yb - ya) / 1.2) + 1):
            yk = ya + k * 1.2
            D.add(1.92, 1.97, yk, yk + 0.04, zf, zf + 0.98, rail)
        for k in range(int((yb - ya) / 4.0) + 1):
            yk = ya + k * 4.0
            D.add(1.82, 1.98, yk, yk + 0.16, 0, tops + 0.1, rail)
        S.add_hex(D, [(1.2, yb + 0.1, 0.15), (2.4, yb + 0.1, 0.15), (1.2, yb + 1.3, 0.15), (2.4, yb + 1.3, 0.15),
                      (1.2, yb - 3.6, zf), (2.4, yb - 3.6, zf), (1.2, yb - 2.4, zf), (2.4, yb - 2.4, zf)], trd)
    # garde-corps de la terrasse du retrait
    if sb_n:
        for zr in (0.5, 1.0):
            D.add(-0.12, -0.06, ya, yb, main_top + 0.9 + zr - 0.03, main_top + 0.9 + zr + 0.03, rail)
    # le toit : édicule, bouches, réservoir, climatiseurs de toit, cadre d'enseigne (scene_a)
    Mr = {"stucco": std, "trim": M["trim_nb"], "riser": M["dark"], "metal": M["dark"], "sign": M["sign"]}
    P["props"], P["lights"] = props, lights
    random.seed(_seed(key) + 1)
    S.roof_props(D, Mr, P, -Dp, -sb if sb_n else 0.0, 0.3, W - 0.3, tops if sb_n else main_top)
    if P.get("blade"):
        S.blade(D, {"trim": M["trim_nb"], "sign": M["sign"]}, P, P["blade"] * W, gf_h + 0.6, main_top + 2.5)
    # descente d'eau au bout de la façade, colliers
    yp = 0.15 if not P["round_near"] else ya + 0.12
    objs.append(tube(f"fb_{key}_downpipe", (0.09, yp, gf_h - 0.1), (0.09, yp, top_par - 0.2), M["pipe"], r=0.05))
    for zz in np.arange(gf_h + 1.0, top_par - 0.5, 2.0):
        D.add(0.0, 0.15, yp - 0.06, yp + 0.06, zz, zz + 0.04, M["pipe"])

    # -- climatiseurs : peu, irréguliers, déterministes par dessin ; console, câble, coulure
    ac_spots = []
    rate = st_.get("ac", 0.0)
    wins = [o for o in openings if not o[7]]
    if not wins:
        # tout en portes-fenêtres (balcons filants) : les climatiseurs vont sur les balcons
        wins = [o for o in openings if o[8]]
    if st_.get("ac_cluster"):
        # une petite grappe sur la travée du bout, trois étages de suite
        kk = ncol - 1
        for f in range(1, min(nfl, 4)):
            for o in wins:
                if o[0] == f and o[1] == kk:
                    ac_spots.append(o)
        rate *= 0.5
    n_ac = int(round(len(wins) * rate * R.uniform(0.7, 1.15)))
    pool = [o for o in wins if o not in ac_spots]
    R.shuffle(pool)
    used_cols = set()
    for o in pool:
        if n_ac <= 0:
            break
        if (o[1], o[0] - 1) in used_cols or (o[1], o[0] + 1) in used_cols:
            continue      # jamais deux l'un sur l'autre (sauf la grappe)
        ac_spots.append(o)
        used_cols.add((o[1], o[0]))
        n_ac -= 1
    Dc = Decals(f"fb_{key}_decals")
    for (f, k, xo, y0, y1, z0, z1, door, bal) in ac_spots:
        zf = gf_h + (f - 1) * FH
        if bal:
            # posé sur le balcon, contre le trumeau, câble au mur, écoulement par la dalle
            yy = y0 - pier / 2 + 0.5 if R.random() < 0.5 else y1 + pier / 2 - 0.5
            props.append(("ac", (xo + 0.45, yy, zf + 0.02), math.pi / 2, 0.8))
            objs.append(S.cyl(f"fb_{key}_acc_{f}_{k}", (xo + 0.02, yy, zf + 0.6), (xo + 0.02, yy, zf + 2.3), 0.008, M["dark"], seg=6))
            continue
        yy = (y0 + y1) / 2 + R.choice((-1, 1)) * R.uniform(0.2, 0.45) * (y1 - y0)
        zz = zf + 0.14
        props.append(("ac", (xo + 0.3, yy, zz), math.pi / 2, 0.85))
        for e in (-0.28, 0.28):          # consoles en équerre
            D.add(xo, xo + 0.5, yy + e - 0.02, yy + e + 0.02, zz - 0.06, zz - 0.02, M["dark"])
            D.add(xo, xo + 0.04, yy + e - 0.02, yy + e + 0.02, zz - 0.4, zz - 0.02, M["dark"])
        # le câble qui remonte au tableau de la fenêtre, le tuyau d'écoulement qui descend
        side = y0 + 0.05 if yy < (y0 + y1) / 2 else y1 - 0.05
        objs.append(S.cyl(f"fb_{key}_acc_{f}_{k}", (xo + 0.03, yy, zz + 0.55), (xo + 0.03, side, z0 + 0.1), 0.008, M["dark"], seg=6))
        objs.append(S.cyl(f"fb_{key}_acd_{f}_{k}", (xo + 0.06, yy + 0.2, zz), (xo + 0.06, yy + 0.2, zz - R.uniform(0.5, 1.2)), 0.01, M["pipe"], seg=6))
        Dc.add(M["decal_thin"], ("x", xo + 0.004), yy - 0.3, yy + 0.4, max(gf_h, zz - R.uniform(1.2, 2.0)), zz + 0.02, 1.0, (lambda u0: (u0, u0 + 0.12))(R.uniform(0, 0.8)))

    # -- coulures : sous les appuis, aux bouts des sourcils, sous la corniche, sous les balcons
    eps = 0.004

    def sub(wf):
        u0 = R.uniform(0, 1 - wf)
        return (u0, u0 + wf)

    tops_below = {}
    for (f, k, xo, y0, y1, z0, z1, door, bal) in openings:
        tops_below[(f, k)] = z1
    for (f, k, xo, y0, y1, z0, z1, door, bal) in openings:
        floor = tops_below.get((f - 1, k), gf_h) + 0.08
        if not door and R.random() < 0.85:
            w = (y1 - y0) * R.uniform(0.55, 0.85)
            yy = (y0 + y1) / 2 + R.uniform(-0.2, 0.2) * (y1 - y0)
            Dc.add(M["decal_hang"], ("x", xo + eps), yy - w / 2, yy + w / 2, max(floor, z0 - 0.05 - R.uniform(0.7, 1.25)), z0 - 0.05,
                   R.uniform(0.45, 0.85), sub(0.45), R.random() < 0.5)
        if st_.get("brow") == "window":
            for e in (-1, 1):
                ye = (y1 + 0.42) if e > 0 else (y0 - 0.42)
                if R.random() < 0.8:
                    Dc.add(M["decal_thin"], ("x", xo + eps), ye - 0.12, ye + 0.12, z1 + 0.16 - R.uniform(0.5, 1.0), z1 + 0.16,
                           R.uniform(0.6, 1.0), sub(0.15), R.random() < 0.5)
        if bal:
            zf = gf_h + (f - 1) * FH
            Dc.add(M["decal_hang"], ("x", xo + eps), y0 - pier / 2 + 0.1, y1 + pier / 2 - 0.1, max(gf_h, zf - 0.18 - R.uniform(0.4, 0.9)),
                   zf - 0.18, R.uniform(0.35, 0.65), sub(0.6))
    if P.get("eyebrow") and st_.get("brow") != "window":
        for f in range(1, nfl):
            xo = -sb if f >= nfl - sb_n else 0.0
            zb = gf_h + (f - 1) * FH + sill + wh + 0.06
            y = ya + R.uniform(0.2, 1.5)
            while y < yb - 0.5:
                Dc.add(M["decal_thin"], ("x", xo + eps), y, y + 0.3, zb - R.uniform(0.3, 0.6), zb, R.uniform(0.5, 0.9), sub(0.15))
                y += R.uniform(1.4, 3.2)
    y = ya
    while y < yb - 0.3:
        w = R.uniform(1.2, 2.6)
        b = min(y + w, yb)
        if not (pylon and b > pylon[0] and y < pylon[1]):
            Dc.add(M["decal_hang"], ("x", eps), y, b, main_top + 0.7 - R.uniform(0.9, 1.7), main_top + 0.7,
                   R.uniform(0.45, 0.85), sub(min(0.95, (b - y) / 3.0)), R.random() < 0.5)
        y = b - R.uniform(0.1, 0.4)
    # pignons (vus au-dessus des voisins) : sous la couvertine
    for yw, sgn in ((0.0, -1), (W, 1)):
        if (yw == 0.0 and P["round_near"]) or (yw == W and P["round_far"]):
            continue
        x = -Dp
        while x < -0.2:
            w = R.uniform(1.5, 3.0)
            b = min(x + w, 0.0)
            Dc.add(M["decal_hang"], ("y", yw + sgn * eps), x, b, top_par - R.uniform(1.2, 3.0), top_par, R.uniform(0.4, 0.8), sub(0.5), R.random() < 0.5)
            x = b - 0.2
    # la descente d'eau
    Dc.add(M["decal_hang"], ("x", eps), yp - 0.18, yp + 0.2, gf_h + 0.3, top_par - 0.3, 0.6, sub(0.12))
    if pylon:
        p0, p1 = pylon
        for zz, w in ((top_par + 0.5, 0.0), (top_par + 1.5, 0.4), (top_par + 2.5, 0.8)):
            Dc.add(M["decal_hang"], ("x", PYX - w * 0.3 + eps), p0 + w + 0.05, p1 - w - 0.05, zz - R.uniform(1.0, 1.8), zz, R.uniform(0.6, 0.9), sub(0.5))
    dec = Dc.done()
    if dec:
        objs.append(dec)

    # -- néons et enseigne
    if st_.get("coping"):
        objs.append(tube(f"fb_{key}_neon_coping", (0.1, ya, top_par + 0.1), (0.1, yb, top_par + 0.1), M["neon_" + st_["coping"]], r=0.014))
    if pylon:
        p0, p1 = pylon
        for yy in (p0 + 0.15, p1 - 0.15):
            objs.append(tube(f"fb_{key}_neon_fin_{yy:.1f}", (PYX + 0.18, yy, gf_h + 0.1), (PYX + 0.18, yy, top_par + 0.3),
                             M["neon_" + st_.get("pylon_tube", "lilac")]))
        word = st_.get("letters", "")
        if word:
            # les lettres tiennent toutes entre le larmier et le haut du pylône : pas et taille ajustés
            z_hi, z_lo = main_top - 0.8, gf_h + 0.7
            pitch = min(1.25, (z_hi - z_lo) / len(word))
            size = pitch * 0.88
            D.add(PYX, PYX + 0.08, W / 2 - 0.55, W / 2 + 0.55, z_hi - len(word) * pitch - 0.15, z_hi + 0.15, M["dark"])
            # lettres-boîtiers : un retour sombre (le caisson) et une face lumineuse saturée, peu
            # intense (l'AgX brûle en blanc au-delà de ~6)
            face = bpy.data.materials.get("fb_letter_face") or S.mat_emit("fb_letter_face", S.lin("#ffe3a8"), 5.0)
            for i, ch in enumerate(word):
                zc = z_hi - (i + 0.5) * pitch
                objs.append(text_mesh(f"fb_{key}_sign_ret_{i}", ch, (PYX + 0.125, W / 2, zc), size, M["dark"], depth=0.04))
                objs.append(text_mesh(f"fb_{key}_sign_{i}", ch, (PYX + 0.172, W / 2, zc), size * 0.97, face, depth=0.006))
    if st_.get("tower_tube"):
        for near in ([True] if P["round_near"] else []) + ([False] if P["round_far"] else []):
            yj = ya if near else yb
            objs.append(tube(f"fb_{key}_neon_tower_{int(near)}", (0.05, yj, gf_h + 0.1), (0.05, yj, main_top + 0.9), M["neon_" + st_["tower_tube"]]))
    if st_.get("gallery_tube") and P.get("gallery"):
        objs.append(tube(f"fb_{key}_neon_gallery", (2.42, ya, tops + 0.02), (2.42, yb, tops + 0.02), M["neon_" + st_["gallery_tube"]], r=0.014))
    if st_.get("setback_tube") and sb_n:
        objs.append(tube(f"fb_{key}_neon_setback", (-sb + 0.22, ya, tops + 0.92), (-sb + 0.22, yb, tops + 0.92), M["neon_" + st_["setback_tube"]], r=0.014))
    objs.append(D.done())

    # -- lumières : lavages depuis le larmier (forts en bas, s'éteignent en montant), pylône lilas
    n_w = 4 if W < 24 else 5
    for j in range(n_w):
        yy = ya + (yb - ya) * (j + 0.5) / n_w
        if pylon and pylon[0] - 0.4 < yy < pylon[1] + 0.4:
            continue
        lights.append(("light", (0.32, yy, gf_h + 0.1), dict(kind="SPOT", direction=(-0.13, 0, 1), color=WARM, energy=420.0, spot=62.0)))
    if pylon:
        for yy in (W / 2 - 0.8, W / 2 + 0.8):
            lights.append(("light", (1.4, yy, gf_h - 0.35), dict(kind="SPOT", direction=(-0.17, 0, 1),
                                                                 color=st_.get("pylon_light", NEON["lilac"]), energy=2600.0, spot=22.0)))
        lights.append(("light", (PYX + 0.6, W / 2, main_top - 3.9), dict(kind="AREA", direction=(-1, 0, 0), color=NEON["cream"], energy=60.0, size=(0.8, 6.0))))
    for near in ([True] if P["round_near"] else []) + ([False] if P["round_far"] else []):
        yy = ya * 0.45 if near else W - (W - yb) * 0.45
        lights.append(("light", (1.2, yy, gf_h + 0.1), dict(kind="SPOT", direction=(-0.2, 0, 1), color=WARM, energy=650.0, spot=40.0)))
    if st_.get("gallery_tube") and P.get("gallery"):
        lights.append(("light", (2.2, (ya + yb) / 2, tops - 0.05), dict(kind="AREA", direction=(0, 0, -1), color="#ffd9b0", energy=180.0, size=(0.6, yb - ya))))
    for o in objs:
        o.data.name = o.name
    return objs, props, lights
