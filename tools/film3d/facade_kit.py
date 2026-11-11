# Les huit immeubles du film en pièces de bibliothèque (méthode A « kit » du banc de réalisme, en finale).
#
# Remplace scene_a.make_building quand FILM3D_FACADE=kit : make_building(S, key, M, spec) rend
# (objet, accessoires, lumières) dans le repère de scene_a (façade en x = 0 tournée vers +x,
# emprise y de 0 à W, profondeur vers −x). Un maillage par dessin, instancié le long de l'avenue ;
# la teinte vient de la couleur de chaque instance (Object Info).
#
# Le code ne fait que la coque (murs à vrais tableaux, trumeaux, sourcils, bandeaux, angles arrondis,
# marquises, coursive, retraits). Ce qui fait vrai vient de bibliothèques libres :
#   fenêtres à petits bois (Window Asset Pack), intérieurs de boutiques et hall (Simple Storefront
#   Interior Pack), portes vitrées (Glass Doors), climatiseurs de fenêtre (Air conditioner pack),
#   garde-corps (Railing Set), stores bannes (CC0 Awning), lettres néon (Neon Letters), néon OPEN,
#   descentes d'eau, coffrets, applique, rideau de fer, plantes, vasque (Poly Haven, CC0),
#   enduit peint et coulures (ambientCG PaintedPlaster017, Plaster003, Leaking004/007/008/009, CC0).
# Les pièces qui se déforment (fenêtres, intérieurs, lettres, gouttières) sont fondues dans le
# maillage du dessin ; les pièces posées telles quelles (vasques, plantes, climatiseurs, coffrets)
# sont des sources cachées dans la collection « sources », rendues en accessoires instanciés.
#
# S (le module scene_a) est passé par l'appelant : ce module ne l'importe pas.
import math
import os
import random
import time
import traceback

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

S = None
HALF_PI = math.pi / 2
SKIN = 0.32            # épaisseur du mur de façade (profondeur des tableaux)
RD = 3.6               # profondeur des chambres derrière la façade
_K = None              # le kit (matériaux et sources), chargé une fois

NEON = {"lilac": "#8d8cf0", "coral": "#ff6a3d", "cream": "#fff1d6", "amber": "#ffc36b", "mint": "#7fe0c4"}
LIGHT = {"lilac": "#a7a6ff", "coral": "#ff8a62", "cream": "#ffe6c6", "amber": "#ffd08a", "mint": "#a8f0da"}

# Ce qui fait chaque dessin lui-même (en plus de sa spec) : fenêtres, couleur d'accent, mots
STYLE = {
    "deco": dict(win="case12", accent="lilac", blade_word="HOTEL", shop_word=("BAR", 0), ring=True,
                 wash="#ffe6c6", planters=True),
    "hotel": dict(win="case12", accent="lilac", blade_word="OCEAN", canopy_word="HOTEL", wash="#ffe2c4",
                  planters=True),
    "shop": dict(win="sash", accent="coral", roof_word="CAFE", wash="#ffe2bf", service=True),
    "liner": dict(win="double", accent="mint", canopy_word="LIDO", ring=True, wash="#e8f2ff", planters=True),
    "flats": dict(win="sash", accent=None, wash="#ffe2bf"),
    "motel": dict(win="double", accent="coral", wash="#ffe2bf"),
    "tower": dict(win="case12", accent="amber", canopy_word="SUITES", wash="#ffe6c6", service=True),
    "block": dict(win="double", accent="coral", roof_word="OCEAN", shop_word=("BAR", 2), wash="#ffe2bf",
                  service=True),
}


def lin(h, a=1.0):
    return S.lin(h, a)


def log(*a):
    print("[kit]", *a, flush=True)


# ---------------------------------------------------------------- bibliothèque

def sources_col():
    c = bpy.data.collections.get("sources")
    if c is None:
        c = bpy.data.collections.new("sources")
        bpy.context.scene.collection.children.link(c)
    return c


def load(name):
    """Importe un fichier d'assets ; rend ses maillages, transformations appliquées (même partagées)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(S.ASSETS, name))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    return meshes


def bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return Vector(map(min, *pts)), Vector(map(max, *pts))


def recentre(ob, base=True):
    """Origine au centre de l'emprise, au sol, d'après les sommets (pas la boîte en cache)."""
    vs = [v.co for v in ob.data.vertices]
    mn = Vector(map(min, *vs))
    mx = Vector(map(max, *vs))
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z if base else (mn.z + mx.z) / 2))
    ob.data.transform(Matrix.Translation(-c))
    ob.data.update()
    ob.location = (0, 0, 0)
    return mx - mn


def source(objs, name, rot_z=0.0, base=True):
    """Joint les morceaux en une source cachée tournée de rot_z (pour regarder +x), origine au
    centre de l'emprise, au sol. Rend (source, dimensions)."""
    objs = [o for o in objs if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    if rot_z:
        ob.data.transform(Matrix.Rotation(rot_z, 4, "Z"))
    dims = recentre(ob, base)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    sources_col().objects.link(ob)
    return ob, dims


def alive(o):
    try:
        return o.name in bpy.data.objects
    except ReferenceError:
        return False


def remove(objs):
    for o in objs:
        if alive(o):
            bpy.data.objects.remove(o)


def any_image(mat):
    if mat is None or not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image is not None:
            return n.image
    return None


def set_mat(ob, mat, match=None):
    for i, m in enumerate(ob.data.materials):
        if match is None or (m is not None and match(m)):
            ob.data.materials[i] = mat


def crop(objs, name, xr, zr, rot=0.0, yr=None):
    """Découpe d'un pack « planche » la pièce dont les faces tombent dans la boîte xr × zr."""
    parts = []
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        dels = []
        for f in bm.faces:
            c = f.calc_center_median()
            inside = xr[0] <= c.x <= xr[1] and zr[0] <= c.z <= zr[1] and (yr is None or yr[0] <= c.y <= yr[1])
            if not inside:
                dels.append(f)
        bmesh.ops.delete(bm, geom=dels, context="FACES")
        if len(bm.faces):
            me = bpy.data.meshes.new(name + "_part")
            bm.to_mesh(me)
            for m in o.data.materials:
                me.materials.append(m)
            ob = bpy.data.objects.new(name + "_part", me)
            bpy.context.scene.collection.objects.link(ob)
            parts.append(ob)
        bm.free()
    if not parts:
        raise ValueError(f"découpe vide : {name}")
    return source(parts, name, rot)


# ---------------------------------------------------------------- matières (enduit de la méthode B)

_MEAN = {}


def mean_lum(rel):
    """Luminance moyenne (linéaire) d'une image, pour ramener l'albédo autour de 1."""
    if rel not in _MEAN:
        img = bpy.data.images.load(os.path.join(S.ASSETS, rel), check_existing=True)
        a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
        img.pixels.foreach_get(a)
        a = a.reshape(-1, 4)[::61, :3]
        a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
        _MEAN[rel] = float((a @ np.array([0.2126, 0.7152, 0.0722], np.float32)).mean())
    return _MEAN[rel]


def tex(N, rel, vec, color=True, blend=0.3):
    t = S.image(N, os.path.join(S.ASSETS, rel), vec, color)
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
    m = N.new("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP", **{"From Min": a, "From Max": b})
    N.set(m.inputs["Value"], x)
    return m.outputs[0]


def detail(N, color_out, rel, contrast):
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


PP = "PaintedPlaster017/PaintedPlaster017_2K-JPG_"
PL = "Plaster003/Plaster003_2K-JPG_"


def mat_plaster(name, trim=False, ao=True):
    """L'enduit peint photographique (projection boîte), teinte de l'instance ; reprises de peinture,
    passé au soleil, lavé en traînées, crasse des creux, pied de mur mouillé, arêtes arrondies."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    info = N.new("ShaderNodeObjectInfo")
    z = N.sep(co)[2]
    off = N.new("ShaderNodeCombineXYZ")
    N.link(N.math("MULTIPLY", info.outputs["Random"], 37.0), off.inputs[0])
    N.link(N.math("MULTIPLY", info.outputs["Random"], 53.0), off.inputs[1])
    N.link(N.math("MULTIPLY", info.outputs["Random"], 11.0), off.inputs[2])
    vt = vadd(N, co, off.outputs[0])
    v1 = vmap(N, vt, 0.42)
    v2 = vmap(N, vt, 0.6)
    c1 = tex(N, PP + "Color.jpg", v1)
    r1 = tex(N, PP + "Roughness.jpg", v1, False)
    h1 = tex(N, PP + "Displacement.jpg", v1, False)
    c2 = tex(N, PL + "Color.jpg", v2)
    r2 = tex(N, PL + "Roughness.jpg", v2, False)
    h2 = tex(N, PL + "Displacement.jpg", v2, False)
    d1 = detail(N, c1.outputs["Color"], PP + "Color.jpg", 1.1)
    d2 = detail(N, c2.outputs["Color"], PL + "Color.jpg", 0.7)
    jn = N.new("ShaderNodeTexNoise", Scale=7.0, Detail=6.0, Roughness=0.7)
    N.link(co, jn.inputs["Vector"])
    jit_in = N.new("ShaderNodeVectorMath", _operation="SUBTRACT")
    N.link(jn.outputs["Color"], jit_in.inputs[0])
    N.set(jit_in.inputs[1], (0.5, 0.5, 0.5))
    jit = N.new("ShaderNodeVectorMath", _operation="SCALE")
    N.link(jit_in.outputs[0], jit.inputs[0])
    jit.inputs["Scale"].default_value = 0.06
    pc = vadd(N, vmap(N, vt, (0.42, 0.42, 0.55)), jit.outputs[0])
    vor = N.new("ShaderNodeTexVoronoi", _voronoi_dimensions="3D", _distance="CHEBYCHEV", Scale=1.0, Randomness=0.85)
    N.link(pc, vor.inputs["Vector"])
    cell = N.sep(vor.outputs["Color"])
    patch = N.math("GREATER_THAN", cell[0], 0.5)
    pval = N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", cell[1], 0.5), 0.26))
    pval = N.mixf(patch, 1.0, pval)
    base = info.outputs["Color"]
    if trim:
        base = N.mix(0.8, base, lin("#f4efe4"))
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
    if ao:
        aon = N.new("ShaderNodeAmbientOcclusion", Distance=0.45)
        aon.samples = 4
        aon.only_local = True
        dirt = N.math("MULTIPLY", N.math("POWER", N.math("SUBTRACT", 1.0, aon.outputs["AO"]), 1.3), 0.7)
        col = N.mix(dirt, col, N.mix(1.0, col, lin("#6f6052"), "MULTIPLY"))
    en = N.new("ShaderNodeTexNoise", Scale=1.6, Detail=5.0, Roughness=0.65)
    N.link(vt, en.inputs["Vector"])
    lim = N.math("ADD", 0.75, N.math("MULTIPLY", en.outputs["Factor"], 0.6))
    wet = N.math("SUBTRACT", 1.0, smooth(N, z, N.math("SUBTRACT", lim, 0.35), lim))
    col = N.mix(N.math("MULTIPLY", wet, 0.75), col, N.mix(1.0, col, lin("#7d7168"), "MULTIPLY"))
    rough = N.math("ADD", 0.12, N.math("MULTIPLY", N.mixf(patch, r1.outputs["Color"], r2.outputs["Color"]), 0.85))
    rough = N.mixf(N.math("MULTIPLY", wet, 0.8), rough, 0.32)
    h = N.math("ADD", N.mixf(patch, h1.outputs["Color"], h2.outputs["Color"]), N.math("MULTIPLY", patch, 0.25))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(rough, p.inputs["Roughness"])
    N.link(bevel_bump(N, h, 0.007, 0.018 if trim else 0.022), p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_metal_paint(name, hexcolor, rough=0.38):
    """Menuiseries, garde-corps, portes : métal laqué qui a vécu (rugosité tachée), arêtes adoucies."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    n = N.new("ShaderNodeTexNoise", Scale=14.0, Detail=8.0)
    N.link(co, n.inputs["Vector"])
    p = S.principled(N, **{"Base Color": lin(hexcolor), "Metallic": 0.15})
    N.link(N.math("ADD", rough - 0.1, N.math("MULTIPLY", n.outputs["Factor"], 0.25)), p.inputs["Roughness"])
    bv = N.new("ShaderNodeBevel", Radius=0.006)
    bv.samples = 3
    N.link(bv.outputs[0], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_decal(name, folder, dirt="#3a3029", gloss=0.1):
    """Coulure posée sur le mur : voile transparent teinté (multiplie le mur), un peu humide.
    Force par décalcomanie dans l'attribut de coin « dstr »."""
    m, N, out = S.material(name)
    uvn = N.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    uv = uvn.outputs[0]
    op = S.image(N, os.path.join(S.ASSETS, folder, f"{folder}_2K-JPG_Opacity.jpg"), uv, False)
    cl = S.image(N, os.path.join(S.ASSETS, folder, f"{folder}_2K-JPG_Color.jpg"), uv)
    at = N.new("ShaderNodeAttribute", _attribute_name="dstr")
    a = N.math("MULTIPLY", op.outputs["Color"], at.outputs["Fac"], clamp=True)
    bw = N.new("ShaderNodeRGBToBW")
    N.link(cl.outputs["Color"], bw.inputs[0])
    dcol = N.mix(N.math("MULTIPLY", bw.outputs[0], 0.6), lin(dirt), lin("#8a7a66"))
    t = N.new("ShaderNodeBsdfTransparent")
    N.link(N.mix(a, (1, 1, 1, 1), dcol), t.inputs["Color"])
    g = N.new("ShaderNodeBsdfGlossy", Roughness=0.3, Color=(0.6, 0.6, 0.6, 1))
    mx = N.new("ShaderNodeMixShader")
    N.link(N.math("MULTIPLY", a, gloss), mx.inputs[0])
    N.link(t.outputs[0], mx.inputs[1])
    N.link(g.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_blinds(name, ys, cw, zbase, gf_h):
    """Stores vénitiens, baissés à une hauteur différente dans chaque fenêtre (ou absents),
    translucides ; la lampe de la chambre les fait luire."""
    m, N, out = S.material(name)
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    y, z = xyz[1], xyz[2]
    r1, rgb, fy, fz = S._cells(N, y, z, ys, cw, zbase, S.FH, 7.0)
    has = N.math("MULTIPLY", N.math("GREATER_THAN", r1, 0.12), N.math("LESS_THAN", r1, 0.62))
    bottom = N.math("SUBTRACT", 0.8, N.math("MULTIPLY", N.math("ADD", 0.15, N.math("MULTIPLY", rgb[1], 0.85)), 0.52))
    down = N.math("GREATER_THAN", fz, bottom)
    slat = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", z, 0.05)), N.math("ADD", 0.55, N.math("MULTIPLY", rgb[2], 0.4)))
    mask = N.math("MULTIPLY", N.math("MULTIPLY", has, down), slat)
    mask = N.math("MULTIPLY", mask, N.math("GREATER_THAN", z, gf_h))
    tr = N.new("ShaderNodeBsdfTransparent")
    tl = N.new("ShaderNodeBsdfTranslucent", Color=lin("#efe4cf"))
    df = N.new("ShaderNodeBsdfDiffuse", Color=lin("#e6dccb"))
    cloth = N.new("ShaderNodeMixShader")
    N.set(cloth.inputs[0], 0.45)
    N.link(tl.outputs[0], cloth.inputs[1])
    N.link(df.outputs[0], cloth.inputs[2])
    lit = N.math("GREATER_THAN", rgb[0], 0.3)
    glow = N.new("ShaderNodeEmission", Color=lin("#ffd9a6"))
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


def mat_baked(img, strength=2.4):
    """Les intérieurs du pack sont en lumière cuite : émission de la texture et un peu de diffus."""
    mm, N, out = S.material("kit_interior_baked")
    t = N.new("ShaderNodeTexImage")
    t.image = img
    uvn = N.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    N.link(uvn.outputs[0], t.inputs[0])
    e = N.new("ShaderNodeEmission", Strength=strength)
    N.link(t.outputs["Color"], e.inputs["Color"])
    dfs = N.new("ShaderNodeBsdfDiffuse")
    N.link(t.outputs["Color"], dfs.inputs["Color"])
    add = N.new("ShaderNodeAddShader")
    N.link(e.outputs[0], add.inputs[0])
    N.link(dfs.outputs[0], add.inputs[1])
    N.link(add.outputs[0], out.inputs[0])
    return mm


# ---------------------------------------------------------------- le kit, chargé une fois

def _try(K, what, fn):
    try:
        fn()
    except Exception:
        log(f"pièce « {what} » indisponible")
        traceback.print_exc()


def kit(M):
    global _K
    if _K is not None:
        return _K
    t0 = time.time()
    K = {}
    K["plaster"] = mat_plaster("kit_plaster")
    K["trim"] = mat_plaster("kit_trim", trim=True)
    K["frame_w"] = mat_metal_paint("kit_frame_cream", "#ece6da", 0.35)
    K["frame_b"] = mat_metal_paint("kit_frame_bronze", "#3a2f2a", 0.3)
    K["alu"] = S.mat_plain("kit_alu", lin("#c9c6c0"), 0.3, 0.9)
    K["door_a"] = mat_metal_paint("kit_door_teal", "#2f6f6a", 0.4)
    K["door_b"] = mat_metal_paint("kit_door_coral", "#c9604a", 0.4)
    K["sign_back"] = mat_metal_paint("kit_sign_back", "#25232b", 0.45)
    K["inside"] = S.mat_plain("kit_inside", lin("#6a5a50"), 0.85)
    K["ceiling"] = S.mat_plain("kit_ceiling", lin("#d8cdbd"), 0.8)
    K["terrazzo"] = S.mat_plain("kit_terrazzo", lin("#b9b0a6"), 0.25)
    K["riser"] = S.mat_plain("kit_riser", lin("#2b2a30"), 0.35, 0.3)
    K["win_ph"] = S.mat_plain("kit_win_frame_ph", lin("#efebe2"), 0.32)
    K["rail_ph"] = S.mat_plain("kit_rail_ph", lin("#efebe2"), 0.32)
    K["glow"] = S.mat_emit("kit_canopy_glow", lin("#ffe2b0"), 30.0)
    for k, h in NEON.items():
        K["neon_" + k] = S.mat_emit(f"kit_neon_{k}", lin(h), 4.5 if k != "cream" else 6.0)
    K["decal_hang"] = mat_decal("kit_decal_leak004", "Leaking004")
    K["decal_rise"] = mat_decal("kit_decal_leak008", "Leaking008", dirt="#4a3f35", gloss=0.05)
    K["decal_rise2"] = mat_decal("kit_decal_leak007", "Leaking007", dirt="#4a3f35", gloss=0.05)
    K["decal_thin"] = mat_decal("kit_decal_leak009", "Leaking009", gloss=0.12)

    def windows():
        objs = load("A-window-pack.glb")
        for o in objs:
            for i, m in enumerate(o.data.materials):
                col = None
                if m is not None and m.node_tree:
                    for n in m.node_tree.nodes:
                        if n.type == "BSDF_PRINCIPLED":
                            col = n.inputs["Base Color"].default_value
                is_glass = col is not None and col[2] > col[0] + 0.05
                o.data.materials[i] = M["glass"] if is_glass else K["win_ph"]
            if not o.data.materials:
                o.data.materials.append(K["win_ph"])
        K["win"] = {
            "case12": crop(objs, "kit_win_case12", (-2.25, -1.42), (0.93, 2.25), HALF_PI),
            "sash": crop(objs, "kit_win_sash", (-0.27, 0.55), (4.08, 5.5), HALF_PI),
            "double": crop(objs, "kit_win_double", (1.05, 2.55), (0.93, 2.25), HALF_PI),
        }
        remove(objs)

    def interiors():
        objs = load("A-storefront-interiors.glb")
        drop = [o for o in objs if "Background" in o.name or "HUMAN" in o.name]
        objs = [o for o in objs if o not in drop]
        remove(drop)
        baked = {}
        for o in objs:
            for i, m in enumerate(o.data.materials):
                img = (S.find_image(m) or any_image(m)) if m else None
                if img not in baked:
                    baked[img] = mat_baked(img)
                o.data.materials[i] = baked[img]
        # les cases de l'atlas (x, z du pack ; l'ouverture regarde −y), toutes en lumière chaude
        cells = {
            "reception": ((6.4, 13.2), (17.0, 22.1)),
            "cafe": ((-23.9, -16.9), (16.9, 20.7)),
            "grocer": ((-23.9, -16.8), (22.3, 26.0)),
            "rack": ((-15.3, -5.6), (16.9, 20.7)),
            "jewel": ((15.4, 22.5), (22.3, 26.0)),
            "bar": ((-11.4, -4.9), (10.1, 13.7)),
            "small": ((-21.3, -17.0), (10.0, 13.3)),
        }
        K["int"] = {}
        for k, (xr, zr) in cells.items():
            try:
                K["int"][k] = crop(objs, f"kit_int_{k}", xr, zr, HALF_PI)
            except Exception:
                log("intérieur manquant", k)
        remove(objs)

    def doors():
        gd = load("A-glass-doors.glb")
        keep = [o for o in gd if o.name.startswith("Glass Door.001_")]
        remove([o for o in gd if o not in keep])
        for o in keep:
            set_mat(o, M["glass"], lambda m: "Glass" in m.name)
        K["door"] = source(keep, "kit_door", HALF_PI)

    def ac():
        objs = load("A-ac-pack.glb")
        K["wac"] = crop(objs, "kit_wac", (-5.6, -4.4), (5.75, 7.0), HALF_PI)
        K["louvre"] = crop(objs, "kit_louvre", (-1.0, -0.2), (4.45, 5.0), HALF_PI)
        remove(objs)

    def rail():
        objs = load("A-railing-set.glb")
        src, d = crop(objs, "kit_rail", (-1.16, -0.56), (-1.0, 1.0), 0.0)
        remove(objs)
        src.data.materials.clear()
        src.data.materials.append(K["rail_ph"])
        K["rail"] = (src, d)

    def awning():
        src, d = source(load("A-awning-cc0.glb"), "kit_awning_src")
        me = src.data
        ztop = max(v.co.z for v in me.vertices)
        top = [v.co for v in me.vertices if v.co.z > ztop - 0.05]
        axis = 1 if d.x > d.y else 0
        s = sum(c[axis] for c in top) / len(top)
        rot = (math.pi if s > 0 else 0.0) if axis == 0 else (HALF_PI if s > 0 else -HALF_PI)
        me.transform(Matrix.Rotation(rot, 4, "Z"))
        K["awning"] = (src, recentre(src))

    def letters():
        objs = load("A-neon-letters.glb")
        back = [o for o in objs if len(o.data.polygons) < 50]
        remove(back)
        objs = [o for o in objs if o not in back]
        info = []
        for o in objs:
            mn, mx = bounds([o])
            info.append((mn.z, mn.x, o))
        info.sort(key=lambda t: -t[0])
        rows, cur = [], [info[0]]
        for t in info[1:]:
            if cur[-1][0] - t[0] > 0.1:
                rows.append(cur)
                cur = []
            cur.append(t)
        rows.append(cur)
        abc = {}
        seq = iter("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        for row in rows:
            for _, _, o in sorted(row, key=lambda t: t[1]):
                ch = next(seq)
                abc[ch] = source([o], f"kit_letter_{ch}")
        K["abc"] = abc

    def gutter():
        g = load("modular_metal_gutter/modular_metal_gutter.gltf")
        for key in ("section", "outlet", "bracing", "funnel"):
            K["gut_" + key] = source([o for o in g if o.name == f"modular_metal_gutter_{key}"], f"kit_gut_{key}")
        remove([o for o in g if alive(o) and not o.name.startswith("kit_")])

    def shutter():
        rs = load("rollershutter_door/rollershutter_door.gltf")
        K["shutter"] = source([o for o in rs if o.name == "rollershutter_door"], "kit_shutter", HALF_PI)
        remove([o for o in rs if alive(o) and not o.name.startswith("kit_")])

    def small():
        for key, f, rot in (("ubox1", "utility_box_01/utility_box_01.gltf", HALF_PI),
                            ("seclight", "security_light/security_light.gltf", HALF_PI),
                            ("plant", "potted_plant_02/potted_plant_02.gltf", 0.0)):
            K[key] = source(load(f), f"kit_{key}", rot)
        K["open"] = source(load("A-neon-open.glb"), "kit_open", HALF_PI)

    def planter():
        # la vasque Art déco : un fût carré évasé de céramique blanche, un arbuste dedans
        vase = load("ceramic_vase_03/ceramic_vase_03.gltf")
        mn, mx = bounds(vase)
        k = 0.85 / (mx.z - mn.z)
        c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
        for o in vase:
            o.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-c))
        top_w = (max(mx.x - mn.x, mx.y - mn.y)) * k
        sh = load("shrub_01/shrub_01.gltf")
        smn, smx = bounds(sh)
        ks = top_w * 1.35 / max(smx.x - smn.x, smx.y - smn.y, 0.01)
        sc = Vector(((smn.x + smx.x) / 2, (smn.y + smx.y) / 2, smn.z))
        for o in sh:
            o.data.transform(Matrix.Translation((0, 0, 0.85 - 0.12)) @ Matrix.Scale(ks, 4) @ Matrix.Translation(-sc))
        K["planter"] = source(vase + sh, "kit_planter")

    for what, fn in (("fenêtres", windows), ("intérieurs", interiors), ("portes", doors), ("climatiseurs", ac),
                     ("garde-corps", rail), ("store", awning), ("lettres", letters), ("gouttière", gutter),
                     ("rideau de fer", shutter), ("petites pièces", small), ("vasque", planter)):
        _try(K, what, fn)
    for k, v in K.items():
        if isinstance(v, tuple) and len(v) == 2 and isinstance(v[1], Vector):
            log(f"pièce {k} : {v[1].x:.2f} × {v[1].y:.2f} × {v[1].z:.2f}")
    log(f"kit chargé en {time.time() - t0:.0f} s")
    _K = K
    return K


# ---------------------------------------------------------------- coulures

class Decals:
    """Des quads de décalcomanie, avec leurs UV et leur force (attribut de coin « dstr »)."""

    def __init__(self, K):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.st = self.bm.loops.layers.float_color.new("dstr")
        self.mats = []
        self.K = K
        self.n = 0

    def add(self, kind, x, a0, a1, z0, z1, strength, flip=False):
        """Un quad dans le plan x (face +x), de a0 à a1 en y, de z0 à z1."""
        if z1 - z0 < 0.05 or a1 - a0 < 0.05:
            return
        mat = self.K[kind]
        if mat not in self.mats:
            self.mats.append(mat)
        pts = [(x, a0, z0), (x, a1, z0), (x, a1, z1), (x, a0, z1)]
        ua, ub = (1.0, 0.0) if flip else (0.0, 1.0)
        uvs = [(ua, 0), (ub, 0), (ub, 1), (ua, 1)]
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f.material_index = self.mats.index(mat)
        for loop, t in zip(f.loops, uvs):
            loop[self.uv].uv = t
            loop[self.st] = (strength, strength, strength, 1.0)
        self.n += 1

    def done(self, name):
        if not self.n:
            self.bm.free()
            return None
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


# ---------------------------------------------------------------- un immeuble

class Bld:
    def __init__(self, key, M, spec, K):
        self.key, self.M, self.K = key, M, K
        sp = dict(pier=0.55, sill=0.9, wh=1.6, frame="frame_w", rail="trim", balc_d=1.3, gf_h=4.2, gf="shops",
                  nshops=4, floors=4, r=3.0, ct=4.5, round_near=False, round_far=False)
        sp.update(spec)
        self.sp = sp
        self.style = STYLE.get(key, STYLE["flats"])
        self.R = random.Random(f"kit-{key}")
        self.props, self.lights = [], []
        self.W, self.D, self.gf_h, self.nfl = sp["W"], sp["D"], sp["gf_h"], sp["floors"]
        self.FH = S.FH
        self.tops = self.gf_h + (self.nfl - 1) * self.FH
        self.sb_n, self.sb = sp.get("setback", (0, 0.0))
        self.main_top = self.gf_h + (self.nfl - 1 - self.sb_n) * self.FH
        self.ya = sp["ct"] if sp["round_near"] else 0.3
        self.yb = self.W - sp["ct"] if sp["round_far"] else self.W - 0.3
        self.ncol = sp.get("ncol") or max(2, round((self.yb - self.ya) / sp.get("bay", 3.0)))
        self.cw = (self.yb - self.ya) / self.ncol
        self.zbase = self.gf_h - self.FH
        self.st, self.tr = K["plaster"], K["trim"]
        self.frame = K["frame_b"] if sp["frame"] == "frame_b" else K["frame_w"]
        self.railm = K["frame_b"] if sp["rail"] == "frame_b" else K["frame_w"]
        acc = self.style.get("accent")
        self.neon = K["neon_" + acc] if acc else None
        self.acc_light = LIGHT[acc] if acc else "#ffe2bf"
        self.B = S.Boxes(f"kit_{key}_shell")
        self.Dc = Decals(K)
        self.row_tops = []
        self.n = 0

    # ---- outils
    def nm(self, tag):
        self.n += 1
        return f"kit_{self.key}_{tag}_{self.n}"

    def put(self, src, tag, loc, rot=0.0, scale=(1, 1, 1), mats=None):
        """Une pièce de bibliothèque, fondue plus tard dans le maillage du dessin."""
        me = src.data
        if mats is not None:
            me = me.copy()
            me.materials.clear()
            for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
                me.materials.append(m)
        ob = bpy.data.objects.new(self.nm(tag), me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (0, 0, rot)
        ob.scale = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
        return ob

    def tube(self, p0, p1, mat=None, r=0.011):
        return S.cyl(self.nm("tube"), p0, p1, r, mat or self.neon, seg=8)

    def light(self, loc, kind, direction, color, energy, size=(0.2, 0.2), spot=60.0):
        self.lights.append(("light", tuple(loc), dict(kind=kind, direction=tuple(direction), color=color,
                                                      energy=float(energy), size=tuple(size), spot=float(spot))))

    def letter(self, ch, mat, loc, rot, sc):
        if ch not in self.K.get("abc", {}):
            return None
        src, d = self.K["abc"][ch]
        return self.put(src, "neon", loc, rot, sc, mats=mat)

    def word(self, text, mat, origin, height, facing="x", spacing=0.16):
        abc = self.K.get("abc")
        if not abc:
            return
        sc = height / abc["H"][1].z
        widths = [abc[ch][1].x * sc if ch in abc else height * 0.5 for ch in text]
        total = sum(widths) + spacing * height * (len(text) - 1)
        s = -total / 2
        ox, oy, oz = origin
        for i, ch in enumerate(text):
            c = s + widths[i] / 2
            if facing == "x":
                self.letter(ch, mat, (ox, oy + c, oz), HALF_PI, sc)
            elif facing == "-y":
                self.letter(ch, mat, (ox + c, oy, oz), 0.0, sc)
            else:
                self.letter(ch, mat, (ox - c, oy, oz), math.pi, sc)
            s += widths[i] + spacing * height

    def vword(self, text, mat, x, y_face, ztop, height, facing):
        """Lettres empilées (enseigne en drapeau), la première en haut, sur une face ±y."""
        abc = self.K.get("abc")
        if not abc:
            return
        sc = height / abc["H"][1].z
        z = ztop
        for ch in text:
            z -= height
            if ch in abc:
                t = abc[ch][1].y * sc
                y = y_face - t / 2 - 0.004 if facing == "-y" else y_face + t / 2 + 0.004
                self.letter(ch, mat, (x, y, z), 0.0 if facing == "-y" else math.pi, sc)
            z -= height * 0.32

    def sharp(self, ob):
        for mod in list(ob.modifiers):
            ob.modifiers.remove(mod)
        try:
            ob.data.set_sharp_from_angle(angle=math.radians(35))
        except Exception:
            pass

    def stage(self, name, fn, *a):
        try:
            fn(*a)
        except Exception:
            log(f"{self.key} : « {name} » a échoué, l'immeuble est fait sans")
            traceback.print_exc()

    # ---- la coque
    def shell(self):
        B, st, sp = self.B, self.st, self.sp
        D, W, ya, yb = self.D, self.W, self.ya, self.yb
        shops = sp["gf"] == "shops"
        rooms = S.mat_rooms(f"kit_{self.key}", ya, self.cw, self.zbase, self.gf_h, shops, ya, (yb - ya) / sp["nshops"])
        B.add(-D, -RD, ya, yb, 0, self.main_top, st, front_mat=rooms)
        if self.sb_n:
            B.add(-D, -self.sb - RD, ya, yb, self.main_top, self.tops, st, front_mat=rooms)
            for y0, y1 in ((0.0, 0.3), (W - 0.3, W)):
                B.add(-D, -self.sb, y0, y1, self.main_top, self.tops + 0.9, st)
        if not sp["round_near"]:
            B.add(-D, 0, 0, 0.3, 0, self.main_top + 0.9, st)
        if not sp["round_far"]:
            B.add(-D, 0, W - 0.3, W, 0, self.main_top + 0.9, st)
        # rideaux et stores derrière les vitres des étages (un plan par retrait)
        gfz = self.gf_h if shops else 0.0
        cur = S.mat_curtain(f"kit_{self.key}", ya, self.cw, self.zbase, gfz)
        bl = mat_blinds(f"kit_blinds_{self.key}", ya, self.cw, self.zbase, gfz)
        z_lo = self.gf_h if shops else 0.2
        spans = [(0.0, z_lo, self.main_top)]
        if self.sb_n:
            spans.append((-self.sb, self.main_top, self.tops))
        for xo, z0, z1 in spans:
            B.add(xo - 0.37, xo - 0.365, ya, yb, z0, z1, bl)
            B.add(xo - 0.56, xo - 0.555, ya, yb, z0, z1, cur)

    def roof(self):
        B, st, tr, sp = self.B, self.st, self.tr, self.sp
        D, W, ya, yb, mt = self.D, self.W, self.ya, self.yb, self.main_top
        B.add(-D, 0, 0, W, mt - 0.2, mt, self.M["roof"], front_mat=st)
        B.add(-0.3, 0, ya, yb, mt, mt + 0.9, st)
        B.add(-D, -D + 0.3, 0, W, mt, mt + 0.9, st)
        B.add(0, 0.22, ya, yb, mt + 0.7, mt + 0.9, tr)
        if self.sb_n:
            sb, tp = self.sb, self.tops
            B.add(-D + 0.3, -sb, 0.3, W - 0.3, tp - 0.2, tp, self.M["roof"], front_mat=st)
            B.add(-sb - 0.3, -sb, ya, yb, tp, tp + 0.9, st)
            B.add(-sb, -sb + 0.2, ya, yb, tp + 0.7, tp + 0.9, tr)
            B.add(-D, -D + 0.3, 0, W, tp, tp + 0.9, st)
        if sp.get("step"):
            yc = W / 2
            B.add(-0.4, 0, yc - 3.2, yc + 3.2, mt + 0.9, mt + 2.0, st)
            B.add(-0.4, 0, yc - 1.6, yc + 1.6, mt + 2.0, mt + 3.0, st)
            B.add(0, 0.2, yc - 3.2, yc + 3.2, mt + 1.85, mt + 2.0, tr)
            for d in (-0.9, 0.0, 0.9):
                B.add(0, 0.12, yc + d - 0.05, yc + d + 0.05, mt + 2.0, mt + 2.9, tr)
            if self.neon is not None:
                for y in (yc - 1.6, yc + 1.6):
                    self.tube((0.05, y, mt + 2.0), (0.05, y, mt + 3.0))
                self.tube((0.05, yc - 1.6, mt + 3.0), (0.05, yc + 1.6, mt + 3.0))
        # tube néon sous la corniche des dessins qui en ont un accent
        if self.neon is not None and self.key in ("deco", "hotel", "block", "liner"):
            self.tube((0.24, ya + 0.1, mt + 0.69), (0.24, yb - 0.1, mt + 0.69), r=0.009)
        # citerne, climatiseurs, cage d'escalier, bouches (ceux de scene_a : accessoires ac / tank)
        Sd = dict(sp)
        Sd["roof_sign"] = None
        Sd["props"], Sd["lights"] = self.props, self.lights
        M2 = dict(self.M)
        M2["stucco"], M2["trim"] = st, tr
        S.roof_props(B, M2, Sd, -D, -self.sb if self.sb_n else 0.0, 0.3, W - 0.3, self.tops if self.sb_n else mt)
        # coulures sous la corniche, là où il n'y a que du mur
        top_row = self.row_tops[-1] if self.row_tops else mt - 0.8
        zone = mt + 0.7 - top_row - 0.08
        for k in range(int((yb - ya) / 3) + 2):
            y = self.R.uniform(ya + 0.2, yb - 0.8)
            w = self.R.uniform(0.3, 0.8)
            h = min(self.R.uniform(0.35, 1.0), zone)
            self.Dc.add("decal_thin", 0.004, y, y + w, mt + 0.7 - h, mt + 0.7, self.R.uniform(0.4, 0.8))

    # ---- une rangée de fenêtres
    def row(self, xo, zf, balc, doors, sill, wh, door_kind="panel"):
        B, st, tr, K, R = self.B, self.st, self.tr, self.K, self.R
        ya, yb, cw, FH = self.ya, self.yb, self.cw, self.FH
        p = self.sp["pier"]
        top = zf + sill + wh
        if xo == 0.0:
            self.row_tops.append(top)
        xi0, xi1 = xo - RD, xo - SKIN
        B.add(xi0, xi1, ya, yb, zf, zf + 0.05, K["inside"])
        B.add(xi0, xi1, ya, yb, zf + FH - 0.12, zf + FH, K["ceiling"])
        for k in range(self.ncol + 1):
            yk = ya + k * cw
            B.add(xi0, xi1, max(ya, yk - 0.06), min(yb, yk + 0.06), zf, zf + FH, K["inside"])
            B.add(xo - SKIN, xo, max(ya, yk - p / 2), min(yb, yk + p / 2), zf, zf + FH, st)
        for k in range(self.ncol):
            y0, y1 = ya + k * cw + p / 2, ya + (k + 1) * cw - p / 2
            B.add(xo - SKIN, xo, y0, y1, top, zf + FH, st)
            if k in doors and door_kind == "panel":
                self.door_bay(xo, y0, y1, zf, zf + sill, top, k)
                continue
            french = k in balc
            z0 = zf + (0.06 if french else sill)
            if not french:
                B.add(xo - SKIN, xo, y0, y1, zf, z0, st)
                B.add(xo - 0.05, xo + 0.07, y0 - 0.06, y1 + 0.06, z0 - 0.07, z0, tr)
            self.window(xo, y0, y1, z0, top)
            if french:
                S.balcony(B, {"trim": tr}, xo, y0 - p / 2 + 0.1, y1 + p / 2 - 0.1, zf, self.sp["balc_d"], self.railm)
            else:
                if self.sp.get("ac") and R.random() < self.sp["ac"] and "wac" in K:
                    src, d = K["wac"]
                    sc = 0.7 / d.y
                    yc = R.uniform(y0 + 0.45, y1 - 0.45) if y1 - y0 > 1.0 else (y0 + y1) / 2
                    self.props.append(("kit_wac", (xo - 0.06, yc, z0), 0.0, sc))
                elif R.random() < 0.08:
                    self.props.append(("ac", (xo + 0.25, (y0 + y1) / 2, zf + 0.15), HALF_PI, 1.0))
                if R.random() < 0.8:
                    w = (y1 - y0) * R.uniform(0.5, 0.85)
                    yc = (y0 + y1) / 2 + R.uniform(-0.15, 0.15)
                    h = min(R.uniform(0.6, 1.3), FH - wh - 0.15)
                    self.Dc.add("decal_hang", xo + 0.004, yc - w / 2, yc + w / 2, z0 - 0.07 - h, z0 - 0.07,
                                R.uniform(0.45, 0.85), flip=R.random() < 0.5)
        if self.sp.get("eyebrow"):
            B.add(xo, xo + 0.55, ya, yb, top + 0.1, top + 0.2, tr)
        if self.sp.get("bands"):
            B.add(xo, xo + 0.12, ya, yb, zf - 0.12, zf, tr)

    def window(self, xo, y0, y1, z0, z1):
        """Une baie : dormant de métal laqué de 12 cm dans le tableau, vantaux du pack (épaissis),
        meneaux, imposte au-dessus des hautes baies ; quelques vantaux entrouverts."""
        B, K, R = self.B, self.K, self.R
        fr = self.frame
        xc0, xc1 = xo - 0.30, xo - 0.18
        w6 = 0.06
        B.add(xc0, xc1, y0, y1, z0, z0 + w6, fr)
        B.add(xc0, xc1, y0, y1, z1 - w6, z1, fr)
        B.add(xc0, xc1, y0, y0 + w6, z0, z1, fr)
        B.add(xc0, xc1, y1 - w6, y1, z0, z1, fr)
        if "win" not in K:
            B.add(xo - 0.245, xo - 0.235, y0, y1, z0, z1, self.M["glass"])
            return
        src, d = K["win"][self.style["win"]]
        ia, ib, iz0, iz1 = y0 + w6, y1 - w6, z0 + w6, z1 - w6
        n = max(1, round((ib - ia) / (d.y * 1.05)))
        mull = 0.05
        lw = (ib - ia - mull * (n - 1)) / n
        hz = iz1
        if iz1 - iz0 > 1.9:
            hz = iz1 - 0.45
            B.add(xc0 + 0.01, xc1 - 0.01, ia, ib, hz, hz + 0.05, fr)
        for i in range(n):
            a = ia + i * (lw + mull)
            b = a + lw
            if i < n - 1:
                B.add(xc0 + 0.01, xc1 - 0.01, b, b + mull, iz0, iz1, fr)
            deg = R.uniform(22, 40) if (R.random() < 0.08 and hz - iz0 < 2.2) else 0.0
            self.leaf(src, d, xo - 0.24, a, b, iz0, hz, deg, "a" if i % 2 == 0 else "b")
            if hz < iz1:
                self.leaf(src, d, xo - 0.24, a, b, hz + 0.05, iz1, 0.0)

    def leaf(self, src, d, x, ya, yb, z0, z1, open_deg=0.0, hinge="a"):
        w = yb - ya
        sy, sz = w / d.y, (z1 - z0) / d.z
        a = math.radians(open_deg)
        if hinge == "a":
            c, rot = (x - w / 2 * math.sin(a), ya + w / 2 * math.cos(a)), a
        else:
            c, rot = (x - w / 2 * math.sin(a), yb - w / 2 * math.cos(a)), -a
        # le pack a des cadres de 3 cm : épaissis à 9 cm (vrais vantaux)
        self.put(src, "leaf", (c[0], c[1], z0), rot, (3.0, sy, sz))

    def door_bay(self, xo, y0, y1, zf, zs, top, k):
        """Une travée de motel : porte peinte, et une fenêtre à côté."""
        B, st, tr = self.B, self.st, self.tr
        dz = zf + 2.15
        da, db = y0 + 0.2, y0 + 1.15
        wa, wb = y0 + 1.45, y1 - 0.1
        B.add(xo - SKIN, xo, y0, da, zf, top, st)
        B.add(xo - SKIN, xo, db, wa, zf, top, st)
        B.add(xo - SKIN, xo, wb, y1, zf, top, st)
        B.add(xo - SKIN, xo, da, db, dz, top, st)
        B.add(xo - SKIN, xo, wa, wb, zf, zs, st)
        B.add(xo - 0.05, xo + 0.07, wa - 0.06, wb + 0.06, zs - 0.07, zs, tr)
        fr = self.frame
        for a, b, z0, z1 in ((da - 0.05, da, zf, dz), (db, db + 0.05, zf, dz)):
            B.add(xo - 0.3, xo - 0.16, a, b, z0, z1, fr)
        B.add(xo - 0.3, xo - 0.16, da - 0.05, db + 0.05, dz - 0.05, dz, fr)
        B.add(xo - 0.24, xo - 0.19, da, db, zf + 0.02, dz - 0.05, self.K["door_a"] if k % 4 == 0 else self.K["door_b"])
        if "louvre" in self.K:
            src, d = self.K["louvre"]
            self.put(src, "louvre", (xo - 0.18, (da + db) / 2, zf + 0.25), 0.0, 0.55 / d.y)
        if wb - wa > 0.4:
            self.window(xo, wa, wb, zs, top)

    # ---- rez-de-chaussée
    def ground(self):
        sp = self.sp
        if sp["gf"] == "shops":
            self.ground_shops()
        else:
            zf = self.gf_h - self.FH
            if zf > 0.05:
                self.B.add(-SKIN, 0, self.ya, self.yb, 0, zf, self.st)
            self.row(0.0, zf, (), sp.get("doors", ()), sp["sill"] + 0.25, sp["wh"])
            for k in range(self.ncol + 1):
                yk = self.ya + k * self.cw
                pw = self.sp["pier"] / 2
                self.Dc.add("decal_rise", 0.004, max(self.ya, yk - pw), min(self.yb, yk + pw), 0.0, self.R.uniform(0.5, 1.0),
                            self.R.uniform(0.5, 0.9))

    def ground_shops(self):
        B, st, tr, K, R, sp = self.B, self.st, self.tr, self.K, self.R, self.sp
        ya, yb, gf_h = self.ya, self.yb, self.gf_h
        n = sp["nshops"]
        sw = (yb - ya) / n
        lobby = sp.get("lobby_bay")
        B.add(-RD, -SKIN, ya, yb, 0, 0.15, K["terrazzo"])
        B.add(-RD, -SKIN, ya, yb, gf_h - 0.3, gf_h, K["ceiling"])
        B.add(0, 0.3, ya, yb, gf_h - 0.25, gf_h, tr)
        for k in range(n + 1):
            yk = ya + k * sw
            B.add(-SKIN, 0.04, max(ya, yk - 0.3), min(yb, yk + 0.3), 0, gf_h - 0.25, st)
            B.add(-RD, -SKIN, max(ya, yk - 0.08), min(yb, yk + 0.08), 0, gf_h, K["inside"])
            self.Dc.add("decal_rise", 0.044, max(ya, yk - 0.3), min(yb, yk + 0.3), 0.0, R.uniform(0.6, 1.2),
                        R.uniform(0.5, 0.9), flip=k % 2 == 1)
            if self.style.get("planters") and "planter" in K and 0 < k < n and k not in (lobby, (lobby or -9) + 1) and k % 2 == 1:
                self.props.append(("kit_planter", (0.45, yk, 0.15), 0.0, 1.0))
        pool = [p for p in ("cafe", "grocer", "rack", "jewel", "bar", "small") if p in K.get("int", {})]
        R.shuffle(pool)
        word = self.style.get("shop_word")
        shop_lights = []
        for k in range(n):
            y0, y1 = ya + k * sw + 0.3, ya + (k + 1) * sw - 0.3
            if k == lobby:
                self.stage("hall", self.lobby, y0, y1)
                continue
            top = 3.2
            B.add(-SKIN, 0, y0, y1, top, gf_h - 0.25, st)
            if "shutter" in K and k != 0 and R.random() < 0.12 and not (word and word[1] == k):
                src, d = K["shutter"]
                B.add(-0.06, -0.02, y0, y1, 0.0, 0.15, K["riser"])
                self.put(src, "shutter", (-0.15, (y0 + y1) / 2, 0.0), 0.0, (0.5, (y1 - y0) / d.y, top / d.z))
                continue
            kind = "bar" if (word and word[1] == k and "bar" in pool) else (pool[k % len(pool)] if pool else None)
            if kind:
                self.interior(kind, y0, y1, 2.95)
            self.glazing(-0.22, y0, y1, top)
            if word and word[1] == k and self.neon is not None:
                self.word(word[0], K["neon_coral"], (-0.34, (y0 + y1) / 2, 2.0), 0.36, "x")
            elif "open" in K and R.random() < 0.35:
                src, d = K["open"]
                self.put(src, "open", (-0.3, y1 - 0.55, 1.55), 0.0, 1.8)
            if sp.get("awning") and "awning" in K and R.random() < 0.7:
                self.awning(y0, y1, sp["awning"][k % len(sp["awning"])])
            shop_lights.append((y0, y1))
        # une lumière par vitrine, au plus quatre (les voisines se partagent la leur)
        while len(shop_lights) > 4:
            a, b = shop_lights.pop(0), shop_lights.pop(0)
            shop_lights.append((a[0], b[1]))
        for y0, y1 in shop_lights:
            self.light((0.5, (y0 + y1) / 2, 2.2), "AREA", (1, 0, -0.45), "#ffcf96", 45.0 * (y1 - y0), (min(y1 - y0, 6.0), 2.0))
        if self.style.get("service") and "ubox1" in K:
            self.props.append(("kit_ubox1", (0.04 + K["ubox1"][1].x / 2, ya + 0.05, 0.15), 0.0, 1.0))
            if "seclight" in K:
                self.props.append(("kit_seclight", (0.22, ya, 3.0), 0.0, 1.0))

    def interior(self, kind, y0, y1, height, x_front=-0.4):
        src, d = self.K["int"][kind]
        sy = (y1 - y0 + 0.1) / d.y
        sz = height / d.z
        sx = min(sy, sz)
        self.put(src, "int", (x_front - d.x * sx / 2, (y0 + y1) / 2, 0.15), 0.0, (sx, sy, sz))

    def glazing(self, xg, y0, y1, top):
        B, K = self.B, self.K
        al = K["alu"]
        B.add(xg - 0.06, xg + 0.06, y0, y1, 0.15, 0.6, K["riser"])
        B.add(xg - 0.005, xg + 0.005, y0, y1, 0.6, top, self.M["glass"])
        for z in (0.6, 2.55, top - 0.06):
            B.add(xg - 0.04, xg + 0.04, y0, y1, z, z + 0.06, al)
        n = max(1, int((y1 - y0) / 1.25))
        for k in range(n + 1):
            y = y0 + (y1 - y0) * k / n
            B.add(xg - 0.05, xg + 0.05, max(y0, y - 0.03), min(y1, y + 0.03), 0.6, top, al)

    def awning(self, y0, y1, mat):
        src, d = self.K["awning"]
        self.put(src, "awning", (0.75, (y0 + y1) / 2, 3.25 - 0.8), 0.0,
                 (1.5 / d.x, (y1 - y0 + 0.2) / d.y, 0.8 / d.z), mats=mat)

    def lobby(self, y0, y1):
        B, st, tr, K = self.B, self.st, self.tr, self.K
        gf_h = self.gf_h
        yc = (y0 + y1) / 2
        top = min(gf_h - 0.45, 3.75)
        xg = -0.22
        B.add(-SKIN, 0, y0, y1, top, gf_h - 0.25, st)
        if "reception" in K.get("int", {}):
            self.interior("reception", y0, y1, top - 0.15)
        dw = 2.1
        if "door" in K:
            src, dd = K["door"]
            self.put(src, "door", (xg, yc, 0.15), 0.0, (1.0, dw / dd.y, 2.55 / dd.z))
        al = K["alu"]
        for a, b in ((y0, yc - dw / 2), (yc + dw / 2, y1)):
            if b - a > 0.15:
                B.add(xg - 0.005, xg + 0.005, a, b, 0.15, top, self.M["glass"])
                B.add(xg - 0.05, xg + 0.05, a - 0.03, a + 0.03, 0.15, top, al)
                B.add(xg - 0.05, xg + 0.05, b - 0.03, b + 0.03, 0.15, top, al)
        B.add(xg - 0.005, xg + 0.005, yc - dw / 2, yc + dw / 2, 2.7, top, self.M["glass"])
        B.add(xg - 0.05, xg + 0.05, y0, y1, 2.68, 2.74, al)
        B.add(xg - 0.05, xg + 0.05, y0, y1, top - 0.06, top, al)
        # pilastres cannelés de part et d'autre
        for ys in (y0 - 0.45, y1):
            B.add(0, 0.22, ys, ys + 0.45, 0.15, gf_h - 0.25, tr)
            for d in (0.1, 0.22, 0.34):
                B.add(0.22, 0.27, ys + d - 0.025, ys + d + 0.025, 0.4, gf_h - 0.45, tr)
        # la marquise à gradins, sa sous-face lumineuse, le tube corail du nez, le mot dessus
        cy0, cy1 = y0 - 0.2, y1 + 0.2
        B.add(0, 2.7, cy0, cy1, 3.35, 3.6, tr)
        B.add(0, 2.45, cy0 + 0.15, cy1 - 0.15, 3.6, 3.72, tr)
        B.add(2.6, 2.72, cy0, cy1, 3.2, 3.6, tr)
        for k in range(3):
            yk = y0 + (y1 - y0) * (k + 0.5) / 3
            B.add(0.5, 2.3, yk - 0.05, yk + 0.05, 3.33, 3.35, K["glow"])
        self.tube((2.75, cy0, 3.22), (2.75, cy1, 3.22), K["neon_coral"])
        cw = self.style.get("canopy_word")
        if cw and self.neon is not None:
            h = min(0.55, (y1 - y0) / (len(cw) * 1.05))
            self.word(cw, self.neon, (2.05, yc, 3.72), h, "x")
        self.light((1.4, yc, 3.28), "AREA", (0.15, 0, -1), "#ffe2bf", 320.0, (2.2, y1 - y0))
        self.light((0.3, yc, 2.6), "AREA", (1, 0, -0.5), "#ffcf96", 200.0, (y1 - y0, 2.4))
        if "plant" in K:
            for y in (y0 - 0.25, y1 + 0.25):
                self.props.append(("kit_plant", (0.5, y, 0.15), self.R.uniform(0, 6), 1.5))
        if "planter" in K:
            for y in (cy0 - 0.6, cy1 + 0.6):
                self.props.append(("kit_planter", (0.5, y, 0.15), 0.0, 1.0))

    # ---- étages, angles, enseignes
    def floors(self):
        sp = self.sp
        for f in range(1, self.nfl):
            zf = self.gf_h + (f - 1) * self.FH
            xo = -self.sb if f >= self.nfl - self.sb_n else 0.0
            bal = sp.get("balc", "none")
            if bal == "all":
                bays = set(range(self.ncol))
            elif bal == "alt":
                bays = set(range(f % 2, self.ncol, 2))
            elif bal == "ends":
                bays = {0, self.ncol - 1}
            else:
                bays = set()
            if sp.get("gallery"):
                bays = set()
            self.row(xo, zf, bays, sp.get("doors", ()) if sp.get("gallery") else (), sp["sill"], sp["wh"])

    def corners(self):
        sp, D, W, st, tr = self.sp, self.D, self.W, self.st, self.tr
        for near in ([True] if sp["round_near"] else []) + ([False] if sp["round_far"] else []):
            yy0, yy1 = (0, self.ya) if near else (self.yb, W)
            fp = S.rounded_footprint(-D, 0, yy0, yy1, sp["r"], near=near, far=not near)
            self.sharp(S.prism(self.nm("tower"), fp, 0, self.main_top + 0.9, st))
            g = 0.6 if sp.get("eyebrow") else 0.14
            levels = [self.gf_h + (f - 1) * self.FH + sp["sill"] + sp["wh"] + 0.1 for f in range(1, self.nfl - self.sb_n)]
            levels = [z for z in levels if z < self.main_top] + [3.25, self.main_top + 0.7]
            for zz in levels:
                fpb = S.rounded_footprint(-D, 0, yy0, yy1, sp["r"], grow=g if zz < self.main_top else 0.22,
                                          near=near, far=not near)
                self.sharp(S.prism(self.nm("band"), fpb, zz, zz + 0.1, tr))
            if self.style.get("ring") and self.neon is not None:
                arc = S.rounded_footprint(-D, 0, yy0, yy1, sp["r"], grow=0.24, near=near, far=not near)
                arc = arc[1:12] if near else arc[2:13]
                z = self.main_top + 0.69
                for a, b in zip(arc, arc[1:]):
                    self.tube((a[0], a[1], z), (b[0], b[1], z), r=0.009)
            yc = (yy0 + yy1) / 2
            self.light((1.6, yc, 0.4), "SPOT", (-0.3, 0, 1), self.acc_light, 1300.0, spot=32)

    def blade(self):
        sp, B, tr, K = self.sp, self.B, self.tr, self.K
        yc = sp["blade"] * self.W
        z0, z1 = self.gf_h + 0.6, self.main_top + 2.5
        B.add(0, 1.2, yc - 0.14, yc + 0.14, z0, z1, tr)
        B.add(0.15, 1.05, yc - 0.16, yc + 0.16, z0 + 0.35, z1 - 0.35, K["sign_back"])
        B.add(0, 0.5, yc - 0.1, yc + 0.1, z1, z1 + 1.2, tr)
        w = self.style.get("blade_word")
        if w and self.neon is not None:
            h = min(0.85, (z1 - z0 - 1.0) / (len(w) * 1.32))
            ztop = z1 - 0.5 - (z1 - z0 - 1.0 - h * len(w) * 1.32) / 2
            for facing, yf in (("-y", yc - 0.16), ("+y", yc + 0.16)):
                self.vword(w, self.neon, 0.6, yf, ztop, h, facing)
            for dy in (-0.15, 0.15):
                self.tube((1.215, yc + dy, z0 + 0.05), (1.215, yc + dy, z1 - 0.05), r=0.009)
        self.light((1.5, yc, z0 - 0.4), "SPOT", (-0.3, 0, 1), self.acc_light, 700.0, spot=26)

    def roof_sign(self):
        sp, B, K = self.sp, self.B, self.K
        top = self.tops if self.sb_n else self.main_top
        L = min(10.0, (self.yb - self.ya) * 0.6)
        yc = (self.ya + self.yb) / 2
        sy0, sy1 = yc - L / 2, yc + L / 2
        xs = -2.4
        h = sp["roof_sign"]
        z0, z1 = top + 1.6, top + 1.6 + h
        met = self.M["metal"]
        B.add(xs, xs + 0.12, sy0, sy1, z0, z1, K["sign_back"])
        for zz in (z0 - 0.1, z1):
            B.add(xs - 0.05, xs + 0.17, sy0 - 0.1, sy1 + 0.1, zz, zz + 0.1, met)
        for ye in (sy0 - 0.1, sy1):
            B.add(xs - 0.05, xs + 0.17, ye, ye + 0.1, z0, z1, met)
        nposts = int(L / 2.0) + 1
        for k in range(nposts):
            yk = sy0 + (L - 0.12) * k / max(1, nposts - 1)
            B.add(xs - 0.9, xs - 0.78, yk, yk + 0.12, top, z1, met)
            B.add(xs - 0.9, xs, yk, yk + 0.08, top + 0.8, top + 0.88, met)
        w = self.style.get("roof_word")
        if w and self.neon is not None:
            hh = min(h * 0.62, L / (len(w) * 0.95))
            self.word(w, self.neon, (xs + 0.2, yc, z0 + (h - hh) / 2), hh, "x", spacing=0.2)
        self.light((xs + 2.2, yc, top + 0.3), "SPOT", (-0.5, 0, 1), self.acc_light, 600.0, spot=50)

    def gallery(self):
        """La coursive du motel : dalle, garde-corps du pack, poteaux, avancée du toit, escalier, néons."""
        B, tr, K, R = self.B, self.tr, self.K, self.R
        ya, yb, zf, tops = self.ya, self.yb, self.gf_h, self.tops
        B.add(0, 2.0, ya, yb, zf - 0.22, zf, tr)
        if "rail" in K:
            src, d = K["rail"]
            L = yb - ya
            n = max(1, round(L / (d.x / d.z)))
            seg = L / n
            for i in range(n):
                self.put(src, "rail", (1.93, ya + (i + 0.5) * seg, zf), HALF_PI, (seg / d.x, 1.0 / d.z, 1.0 / d.z))
        else:
            for zr in (0.45, 0.95):
                B.add(1.92, 1.97, ya, yb, zf + zr - 0.03, zf + zr + 0.03, self.railm)
        for k in range(int((yb - ya) / 4.0) + 1):
            yk = ya + k * 4.0
            B.add(1.82, 1.98, yk, yk + 0.16, 0, tops + 0.1, self.railm)
        B.add(0, 2.4, ya - 0.2, yb + 0.2, tops, tops + 0.35, tr)
        S.add_hex(B, [(1.2, yb + 0.1, 0.15), (2.4, yb + 0.1, 0.15), (1.2, yb + 1.3, 0.15), (2.4, yb + 1.3, 0.15),
                      (1.2, yb - 3.6, zf), (2.4, yb - 3.6, zf), (1.2, yb - 2.4, zf), (2.4, yb - 2.4, zf)], tr)
        for k, f in enumerate((0.2, 0.5, 0.8)):
            y = ya + (yb - ya) * f
            self.light((1.0, y, zf - 0.3), "POINT", (0, 0, -1), "#ffd29a", 45.0, (0.1, 0.1))
            self.light((1.0, y, tops - 0.15), "POINT", (0, 0, -1), "#ffd29a", 45.0, (0.1, 0.1))
        self.tube((2.42, ya - 0.2, tops + 0.02), (2.42, yb + 0.2, tops + 0.02), K["neon_coral"], r=0.01)
        if K.get("abc"):
            self.word("MOTEL", K["neon_coral"], (2.0, ya + (yb - ya) * 0.3, tops + 0.36), 0.85, "x", spacing=0.22)
            self.word("VACANCY", K["neon_cream"], (-0.32, ya + 1.5 * self.cw, 1.9), 0.2, "x")
        self.light((3.0, ya + (yb - ya) * 0.3, 0.5), "SPOT", (-0.25, 0, 1), LIGHT["coral"], 900.0, spot=24)

    def washes(self):
        """Les lavages du pied : des projecteurs sur le bandeau, sur toute la longueur (les bouts aussi)."""
        if self.sp.get("gallery"):
            return
        shops = self.sp["gf"] == "shops"
        n = min(5, max(3, round(self.W / 6)))
        z = self.gf_h + 0.05 if shops else 0.3
        x = 0.55 if shops else 0.7
        for i in range(n):
            y = self.ya + (i + 0.5) * (self.yb - self.ya) / n
            self.light((x, y, z), "SPOT", (-0.13, 0, 1), self.style.get("wash", "#ffe2bf"),
                       850.0 if shops else 650.0, spot=55)

    def downpipes(self):
        K = self.K
        if "gut_section" not in K:
            return
        sec, d = K["gut_section"]
        ztop = self.main_top + 0.8
        ys = [self.ya + 0.12 if self.sp["round_near"] else 0.42, self.yb - 0.12 if self.sp["round_far"] else self.W - 0.42]
        for j, y in enumerate(ys):
            n = int(ztop - 0.4) + 1
            h = (ztop - 0.4) / n
            for k in range(n):
                self.put(sec, "gutter", (0.12, y, 0.4 + k * h), 0.0, (1, 1, h / d.z))
                if k % 2 == 1 and "gut_bracing" in K:
                    self.put(K["gut_bracing"][0], "gutter", (0.07, y, 0.4 + k * h), -HALF_PI)
            if "gut_outlet" in K:
                self.put(K["gut_outlet"][0], "gutter", (0.12, y, 0.0), -HALF_PI)
            if "gut_funnel" in K:
                self.put(K["gut_funnel"][0], "gutter", (0.12, y, ztop - 0.1), 0.0)

    # ---- tout
    def build(self):
        sp = self.sp
        self.stage("coque", self.shell)
        self.stage("rez-de-chaussée", self.ground)
        self.stage("étages", self.floors)
        self.stage("toit", self.roof)
        if sp["round_near"] or sp["round_far"]:
            self.stage("angles", self.corners)
        if sp.get("blade"):
            self.stage("drapeau", self.blade)
        if sp.get("roof_sign"):
            self.stage("enseigne de toit", self.roof_sign)
        if sp.get("gallery"):
            self.stage("coursive", self.gallery)
        self.stage("lavages", self.washes)
        self.stage("descentes d'eau", self.downpipes)


def make_building(S_mod, key, M, spec):
    """Un immeuble dans son repère (façade x = 0 vers +x, y de 0 à W) : (objet, accessoires, lumières)."""
    global S
    S = S_mod
    t0 = time.time()
    K = kit(M)
    before = set(bpy.data.objects)
    b = Bld(key, M, spec, K)
    b.build()
    shell = b.B.done()
    dec = b.Dc.done(f"kit_{key}_decals")
    src_col = sources_col()
    parts = [o for o in bpy.data.objects
             if o not in before and o.type == "MESH" and o is not shell and src_col not in o.users_collection]
    objs = [shell] + ([dec] if dec is not None and dec in parts else []) + [o for o in parts if o is not dec]
    ob = S.join(objs, f"bld_{key}")
    me = ob.data
    for i, m in enumerate(me.materials):
        if m == K["win_ph"]:
            me.materials[i] = b.frame
        elif m == K["rail_ph"]:
            me.materials[i] = b.railm
    if "UVMap" in me.uv_layers:
        me.uv_layers["UVMap"].active_render = True
        me.uv_layers.active = me.uv_layers["UVMap"]
    spec["own_uplights"] = True
    log(f"{key} : {len(objs)} pièces, {len(me.polygons)} faces, {len(b.props)} accessoires, "
        f"{len(b.lights)} lumières, {time.time() - t0:.1f} s")
    return ob, b.props, b.lights
