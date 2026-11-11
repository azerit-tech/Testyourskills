# Les huit immeubles du film, en mélange : les étages de la méthode B (enduit photographique,
# facade_b.upper) sur les rez-de-chaussée de boutiques de la méthode A, rendus plus vrais.
#
# Remplace scene_a.make_building quand FILM3D_FACADE=mix : make_building(S, key, M, spec) rend
# (objet, accessoires, lumières) dans le repère de scene_a (façade en x = 0 tournée vers +x,
# emprise y de 0 à W, profondeur vers −x). Un maillage par dessin, instancié ; la teinte de l'enduit
# vient de la couleur de chaque instance (Object Info).
#
# Le rez-de-chaussée (z de 0 à gf_h) : piles d'enduit sur soubassement de pierre corallienne tachée,
# devantures à profils de 12 cm (bronze, vitrolite, seuils de pierre, poignées, ferme-portes),
# vraies salles derrière les vitres (mur du fond, comptoir, étagères, bouteilles, tables, suspensions,
# chaque salle sa chaleur de lumière), stores bannes à toile détendue, lambrequin festonné, rayures
# passées et bords salis, sur bras et consoles ; enseignes en tubes néon (lettres de bibliothèque)
# sur leur rail, avec pattes, transformateur et câble, d'éclat inégal ; la lumière des salles qui
# déborde sur le trottoir mouillé (lumières de surface, invisibles à la caméra).
# FILM3D_RDC=terrasse (par défaut : stores, guirlandes) ou sobre (devantures nues, moins d'objets).
#
# S (le module scene_a) est passé par l'appelant : ce module ne l'importe pas.
import math
import os
import random
import time
import traceback

import bpy
from mathutils import Matrix, Vector

import facade_kit as KIT
import facade_proc as C

S = None
FB = None              # facade_b, si présent (les étages de B)
_FB_TRIED = [False]
SW = 0.15              # le dessus du trottoir
RD = 3.6
HALF_PI = math.pi / 2
RDC = os.environ.get("FILM3D_RDC", "terrasse")
SOBRE = RDC == "sobre"
_L = None

# Ce que chaque dessin met à son rez-de-chaussée : une salle par travée, et ses enseignes.
# Deux voisins de l'avenue n'ont jamais la même boutique au même endroit, ni la même enseigne.
PLAN = {
    "deco": dict(bays=["cocktails", "cafe", "store", "surf"], words={0: ("COCKTAILS", "rose"), 3: ("SURF SHOP", "mint")},
                 open=1, awn={1: 0}, wash="#ffe6c6"),
    "hotel": dict(bays=["cafe", "lobby", "bar"], words={2: ("BAR", "amber")}, open=0,
                  awn={0: 3}, vacancy=True, wash="#ffe2c4"),
    "shop": dict(bays=["surf", "store", "cafe"], words={0: ("SURF SHOP", "mint")}, open=2, awn={2: 4}, wash="#ffe2bf",
                 service=True),
    "liner": dict(bays=["store", "bar", "lobby", "cafe", "surf"], words={2: ("OCEAN", "mint"), 1: ("BAR", "amber")},
                  open=3, awn={3: 1}, wash="#eef0ff"),
    "flats": dict(wash="#ffe2bf"),
    "motel": dict(vacancy=True, wash="#ffe2bf"),
    "tower": dict(bays=["cafe", "lobby", "store", "cocktails"], words={1: ("HOTEL", "coral"), 3: ("COCKTAILS", "lilac")},
                  open=0, awn={0: 2}, wash="#ffe6c6", service=True),
    "block": dict(bays=["bar", "store", "surf", "cafe", "store", "cafe"], words={0: ("BAR", "amber"), 2: ("SURF SHOP", "mint")},
                  open=3, awn={3: 0, 5: 1}, wash="#ffe2bf", service=True),
}
AWN = ["#c8553a", "#2f6f6a", "#3a4a8a", "#b84a62", "#c79a3a"]
TEMP = {"bar": "#ffb36e", "cocktails": "#ff9f9a", "cafe": "#ffd09a", "store": "#fff0dc", "surf": "#eef3ff", "lobby": "#ffd9a8"}
NEON = {"coral": ("#ff6a3d", 6.0), "lilac": ("#7a5cff", 3.2), "amber": ("#ffc36b", 7.0), "cream": ("#fff3d6", 6.0),
        "mint": ("#3fe0b0", 4.0), "rose": ("#ff5c8a", 5.0)}


def lin(h, a=1.0):
    return S.lin(h, a)


def log(*a):
    print("[mix]", *a, flush=True)


def safe(what, fn, *a, **k):
    try:
        return fn(*a, **k)
    except Exception:
        log(f"« {what} » a échoué")
        traceback.print_exc()
        return None


# ---------------------------------------------------------------- maillage (le constructeur de C, plus la salissure)

class MB2(C.MB):
    """Le maillage de C, avec un attribut de face « mdirt » (salissure des toiles)."""

    def __init__(self, name, bevel=0.0, seg=2):
        super().__init__(name, bevel, seg)
        self.ld = self.bm.faces.layers.float.new("mdirt")

    def polyd(self, vs, mat, want, dirt, smooth=True):
        f = self.poly(vs, mat, want, smooth)
        f[self.ld] = dirt
        return f


class Decals2:
    """Décalcomanies (UV + force « dstr ») : verticales sur le mur (plan x) ou couchées au sol (plan z)."""

    def __init__(self, L):
        import bmesh
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.st = self.bm.loops.layers.float_color.new("dstr")
        self.mats, self.L, self.n = [], L, 0

    def _face(self, pts, mat, strength, flip=False):
        if mat not in self.mats:
            self.mats.append(mat)
        ua, ub = (1.0, 0.0) if flip else (0.0, 1.0)
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f.material_index = self.mats.index(mat)
        for loop, t in zip(f.loops, [(ua, 0), (ub, 0), (ub, 1), (ua, 1)]):
            loop[self.uv].uv = t
            loop[self.st] = (strength, strength, strength, 1.0)
        self.n += 1

    def wall(self, kind, x, a0, a1, z0, z1, strength, flip=False):
        if z1 - z0 > 0.05 and a1 - a0 > 0.05:
            self._face([(x, a0, z0), (x, a1, z0), (x, a1, z1), (x, a0, z1)], self.L[kind], strength, flip)

    def ground(self, x, y, r, strength=1.0):
        z = SW + 0.003
        self._face([(x - r, y - r, z), (x + r, y - r, z), (x + r, y + r, z), (x - r, y + r, z)], self.L["contact"], strength)

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


# ---------------------------------------------------------------- matières

def mat_coral(name="mix_coral_stone"):
    """Soubassement en pierre corallienne (Poly Haven coral_fort_wall_01) : relief en bosselage (pas de
    déplacement : le maillage reste léger), pied mouillé, crasse de trottoir."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    z = N.sep(co)[2]
    v = KIT.vmap(N, co, 0.55)
    c = KIT.tex(N, "coral_fort_wall_01/diff_2k.jpg", v)
    r = KIT.tex(N, "coral_fort_wall_01/rough_2k.jpg", v, False)
    h = KIT.tex(N, "coral_fort_wall_01/disp_2k.png", v, False)
    col = N.mix(1.0, c.outputs["Color"], lin("#efe0c4"), "MULTIPLY")
    col = N.mix(1.0, col, (1.2, 1.15, 1.1, 1), "MULTIPLY")
    wet = N.math("SUBTRACT", 1.0, KIT.smooth(N, z, 0.18, 0.5))
    col = N.mix(N.math("MULTIPLY", wet, 0.75), col, N.mix(1.0, col, (0.42, 0.4, 0.38, 1), "MULTIPLY"))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.mixf(wet, r.outputs["Color"], 0.28), p.inputs["Roughness"])
    b = N.new("ShaderNodeBump", Strength=0.8, Distance=0.02)
    N.link(h.outputs["Color"], b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_contact(name="mix_contact"):
    """Le pied d'un objet posé : une ombre de crasse ronde, un peu humide (multiplie le trottoir)."""
    m, N, out = S.material(name)
    uvn = N.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    uv = N.sep(uvn.outputs[0])
    du, dv = N.math("SUBTRACT", uv[0], 0.5), N.math("SUBTRACT", uv[1], 0.5)
    r = N.math("MULTIPLY", N.math("SQRT", N.math("ADD", N.math("MULTIPLY", du, du), N.math("MULTIPLY", dv, dv))), 2.0)
    n = C.noise(N, N.new("ShaderNodeTexCoord").outputs["Object"], 6.0, 5.0)
    edge = N.math("ADD", 0.55, N.math("MULTIPLY", n, 0.5))
    a = N.math("SUBTRACT", 1.0, KIT.smooth(N, r, 0.12, edge))
    at = N.new("ShaderNodeAttribute", _attribute_name="dstr")
    a = N.math("MULTIPLY", N.math("MULTIPLY", N.math("POWER", a, 1.4), at.outputs["Fac"]), 0.75)
    t = N.new("ShaderNodeBsdfTransparent")
    N.link(N.mix(a, (1, 1, 1, 1), lin("#2c241e")), t.inputs["Color"])
    g = N.new("ShaderNodeBsdfGlossy", Roughness=0.25, Color=(0.5, 0.5, 0.5, 1))
    mx = N.new("ShaderNodeMixShader")
    N.link(N.math("MULTIPLY", a, 0.12), mx.inputs[0])
    N.link(t.outputs[0], mx.inputs[1])
    N.link(g.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_awning(name, c1, c2="#ece3d0", period=0.5):
    """Toile de store : rayures passées (le soleil a mangé le dessus), bords et lambrequin salis
    (attribut « mdirt »), traînées de pluie, trame ; un peu translucide (la salle passe au travers)."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    y = N.sep(P)[1]
    st = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", y, period)), 0.5)
    col = N.mix(st, lin(c1), lin(c2))
    geo = N.new("ShaderNodeNewGeometry")
    nz = N.sep(geo.outputs["Normal"])[2]
    n = C.noise(N, P, 0.9, 4.0)
    fade = N.math("ADD", N.math("ADD", 0.18, N.math("MULTIPLY", N.math("MAXIMUM", nz, 0.0), 0.3)),
                  N.math("MULTIPLY", N.math("SUBTRACT", n, 0.5), 0.4), clamp=True)
    col = N.mix(fade, col, lin("#d6cbb8"))
    dirt = C.attr(N, "mdirt").outputs["Fac"]
    streak = C.noise(N, P, 2.5, 6.0, mapping=(1.0, 7.0, 0.5))
    d = N.math("MULTIPLY", dirt, N.math("ADD", 0.55, N.math("MULTIPLY", streak, 0.6)), clamp=True)
    col = N.mix(N.math("MULTIPLY", d, 0.8), col, N.mix(1.0, col, lin("#4f4236"), "MULTIPLY"))
    p = S.principled(N, **{"Roughness": 0.85, "Sheen Weight": 0.35})
    N.link(col, p.inputs["Base Color"])
    weave = C.noise(N, P, 140.0, 2.0)
    b = N.new("ShaderNodeBump", Strength=0.15, Distance=0.002)
    N.link(weave, b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    tl = N.new("ShaderNodeBsdfTranslucent")
    N.link(col, tl.inputs["Color"])
    mx = N.new("ShaderNodeMixShader")
    N.set(mx.inputs[0], 0.3)
    N.link(p.outputs[0], mx.inputs[1])
    N.link(tl.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def plaster():
    """L'enduit des piles et du soubassement : celui de B (facade_b.mats), sinon la même recette sans AO."""
    if FB is not None and hasattr(FB, "mats"):
        try:
            mm = FB.mats(S)
            st = mm.get("stucco_nb") or mm.get("stucco")
            tr = mm.get("trim_nb") or mm.get("trim") or st
            if st is not None:
                return st, tr
        except Exception:
            traceback.print_exc()
    return KIT.mat_plaster("mix_plaster", ao=False), KIT.mat_plaster("mix_trim", trim=True, ao=False)


def make_mats(M):
    f = safe
    P = C.mat_pbr
    G = {}
    G["stucco"], G["trim"] = plaster()
    FBM = {}
    if FB is not None and hasattr(FB, "mats"):
        FBM = safe("matières de B", FB.mats, S) or {}
    G["coral"] = FBM.get("coral") or f("pierre", mat_coral)
    G["bronze"] = P("mix_bronze", "#4a3526", 0.32, 0.85, noise_amt=0.15)
    G["brass"] = P("mix_brass", "#c79a52", 0.28, 1.0, noise_amt=0.12)
    G["alu"] = P("mix_alu", "#b9b7b2", 0.32, 0.9, noise_amt=0.12)
    G["frame"] = KIT.mat_metal_paint("mix_frame_cream", "#e9e2d4", 0.35)
    G["metal"] = P("mix_metal", "#2a2a2e", 0.45, 0.8, noise_amt=0.2)
    G["vitro"] = C.mat_vitrolite("mix_vitrolite")
    G["shopglass"] = C.mat_shop_glass("mix_shop_glass")
    G["case"] = C.mat_glass("mix_case_glass", "#eef2ec", 0.02)
    G["stone"] = C.mat_terrazzo("mix_threshold", "#cbc2b2", "#cbc2b2")
    G["checker"] = C.mat_terrazzo("mix_floor_checker", "#1d1b1e", "#e8dfcc", checker=0.45)
    G["tile"] = C.mat_terrazzo("mix_floor_tile", "#e9e1d0", "#3d6b62", checker=0.3)
    G["terrazzo"] = C.mat_terrazzo("mix_floor_terrazzo", "#d9cbb3", "#d9cbb3")
    G["oak"] = C.mat_wood("mix_oak", "#8a5a36", 1, 0.5)
    G["walnut"] = C.mat_wood("mix_walnut", "#4a2c1c", 1, 0.06)
    for k, c in (("cream", "#e9dcc4"), ("rose", "#e3ada2"), ("mint", "#bfe0cf"), ("blue", "#a9bcdc"), ("plum", "#74405a"),
                 ("sand", "#d8c3a0")):
        G["wall_" + k] = P(f"mix_wall_{k}", c, 0.8, noise_amt=0.12)
    G["ceiling"] = P("mix_ceiling", "#e6ddcf", 0.85, noise_amt=0.08)
    G["marble"] = P("mix_marble", "#ece4d6", 0.15, noise_amt=0.15, coat=0.5)
    G["mirror"] = P("mix_mirror", "#b89a7a", 0.06, 1.0)
    G["chair"] = P("mix_chair", "#1c1c20", 0.35, 0.9)
    G["leather"] = P("mix_leather", "#7a2e3a", 0.45, coat=0.3)
    G["goods"] = [P(f"mix_goods_{i}", c, 0.7, noise_amt=0.1) for i, c in
                  enumerate(("#e7d3b0", "#9fd8c8", "#f2a07a", "#7c86c9", "#efefe8", "#2f3a55", "#d8746a"))]
    G["bottles"] = [C.mat_glass(f"mix_bottle_{i}", c) for i, c in enumerate(("#c47a2a", "#3f7a4a", "#e8efe6", "#8a2f3a", "#d9b44a"))]
    G["boards"] = [P(f"mix_board_{i}", c, 0.2, coat=1.0) for i, c in enumerate(("#ff6a3d", "#8d8cf0", "#f3e7c9", "#9fd8c8", "#f2b8c6"))]
    G["pastry"] = [P(f"mix_pastry_{i}", c, 0.6) for i, c in enumerate(("#c98a4a", "#f2d7a0", "#e8a0a8"))]
    G["doors"] = [P(f"mix_door_{i}", c, 0.4, coat=0.4, noise_amt=0.1) for i, c in enumerate(("#2f6f6a", "#d0603f", "#e8d9a8", "#3a4a8a", "#8fc8b8"))]
    G["raceway"] = P("mix_raceway", "#2b2a30", 0.45, 0.5, noise_amt=0.2)
    G["transfo"] = P("mix_transfo", "#8f8c86", 0.5, 0.6, noise_amt=0.3)
    G["cable"] = P("mix_cable", "#111113", 0.5)
    G["globe"] = C.mat_neon("mix_globe", "#ffc58a", 12.0)
    G["down"] = C.mat_neon("mix_downlight", "#fff1d6", 18.0)
    G["cove"] = C.mat_neon("mix_cove", "#ffb860", 7.0)
    G["menu"] = C.mat_neon("mix_menu", "#f3e7c9", 1.2)
    G["bulb"] = C.mat_neon("mix_bulb", "#ffd08a", 25.0)
    G["glow"] = C.mat_neon("mix_canopy_glow", "#ffe2b0", 14.0)
    # néons d'éclat inégal : quatre forces par couleur, un tube fatigué
    G["neon"] = {}
    for k, (h, s) in NEON.items():
        G["neon"][k] = [C.mat_neon(f"mix_neon_{k}_{i}", h, s * f) for i, f in enumerate((0.55, 0.85, 1.0, 1.12))]
    G["awn"] = [mat_awning(f"mix_awning_{i}", c) for i, c in enumerate(AWN)]
    G["contact"] = mat_contact()
    G["decal_rise"] = FBM.get("decal_rise") or KIT.mat_decal("mix_decal_leak008", "Leaking008", dirt="#4a3f35", gloss=0.05)
    G["decal_rise2"] = FBM.get("decal_rise2") or KIT.mat_decal("mix_decal_leak007", "Leaking007", dirt="#4a3f35", gloss=0.05)
    G["decal_hang"] = FBM.get("decal_hang") or KIT.mat_decal("mix_decal_leak004", "Leaking004")
    G["glass"] = M["glass"]
    return G


# ---------------------------------------------------------------- bibliothèque

def lib(M):
    global _L
    if _L is not None:
        return _L
    t0 = time.time()
    L = make_mats(M)

    def door():
        gd = KIT.load("A-glass-doors.glb")
        keep = [o for o in gd if o.name.startswith("Glass Door.001_")]
        KIT.remove([o for o in gd if o not in keep])
        for o in keep:
            KIT.set_mat(o, L["shopglass"], lambda m: "Glass" in m.name)
        L["door"] = KIT.source(keep, "mix_door", HALF_PI)

    def letters():
        objs = KIT.load("A-neon-letters.glb")
        back = [o for o in objs if len(o.data.polygons) < 50]
        KIT.remove(back)
        objs = [o for o in objs if o not in back]
        info = []
        for o in objs:
            mn, mx = KIT.bounds([o])
            info.append((mn.z, mn.x, o))
        info.sort(key=lambda t: -t[0])
        rows, cur = [], [info[0]]
        for t in info[1:]:
            if cur[-1][0] - t[0] > 0.1:
                rows.append(cur)
                cur = []
            cur.append(t)
        rows.append(cur)
        abc, seq = {}, iter("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        for row in rows:
            for _, _, o in sorted(row, key=lambda t: t[1]):
                ch = next(seq)
                abc[ch] = KIT.source([o], f"mix_letter_{ch}")
        L["abc"] = abc

    def small():
        L["open"] = KIT.source(KIT.load("A-neon-open.glb"), "mix_open", HALF_PI)
        L["plant"] = KIT.source(KIT.load("potted_plant_02/potted_plant_02.gltf"), "mix_plant")
        L["ubox"] = KIT.source(KIT.load("utility_box_01/utility_box_01.gltf"), "mix_ubox", HALF_PI)
        L["stool"] = KIT.source(KIT.load("metal_stool_02/metal_stool_02.gltf"), "mix_stool")
        L["barchair"] = KIT.source(KIT.load("bar_chair_round_01/bar_chair_round_01.gltf"), "mix_barchair")

    def shelf():
        objs = KIT.load("steel_frame_shelves_03/steel_frame_shelves_03.gltf")
        mn, mx = KIT.bounds(objs)
        rot = HALF_PI if (mx.x - mn.x) > (mx.y - mn.y) else 0.0     # le long côté suit y (contre le mur du fond)
        L["shelf"] = KIT.source(objs, "mix_shelf", rot)

    def lamp():
        objs = KIT.load("modern_ceiling_lamp_01/modern_ceiling_lamp_01.gltf")
        names = []
        for o in objs:
            for i, m in enumerate(o.data.materials):
                if m is None:
                    continue
                names.append(m.name)
                glassy = any(k in m.name.lower() for k in ("glass", "shade", "globe", "diffus", "opal"))
                if not glassy and m.node_tree:
                    for n in m.node_tree.nodes:
                        if n.type == "BSDF_PRINCIPLED" and n.inputs["Transmission Weight"].default_value > 0.4:
                            glassy = True
                if glassy:
                    o.data.materials[i] = L["globe"]
        log("suspension, matières :", names)
        L["lamp"] = KIT.source(objs, "mix_lamp")

    def planter():
        vase = KIT.load("ceramic_vase_03/ceramic_vase_03.gltf")
        mn, mx = KIT.bounds(vase)
        k = 0.85 / (mx.z - mn.z)
        c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
        for o in vase:
            o.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-c))
        top_w = max(mx.x - mn.x, mx.y - mn.y) * k
        sh = KIT.load("shrub_01/shrub_01.gltf")
        smn, smx = KIT.bounds(sh)
        ks = top_w * 1.35 / max(smx.x - smn.x, smx.y - smn.y, 0.01)
        sc = Vector(((smn.x + smx.x) / 2, (smn.y + smx.y) / 2, smn.z))
        for o in sh:
            o.data.transform(Matrix.Translation((0, 0, 0.73)) @ Matrix.Scale(ks, 4) @ Matrix.Translation(-sc))
        L["planter"] = KIT.source(vase + sh, "mix_planter")

    for what, fn in (("porte", door), ("lettres", letters), ("petites pièces", small), ("étagère", shelf),
                     ("suspension", lamp), ("vasque", planter)):
        safe(what, fn)
    for k, v in L.items():
        if isinstance(v, tuple) and len(v) == 2 and isinstance(v[1], Vector):
            log(f"pièce {k} : {v[1].x:.2f} × {v[1].y:.2f} × {v[1].z:.2f}")
    log(f"bibliothèque chargée en {time.time() - t0:.0f} s")
    _L = L
    return L


# ---------------------------------------------------------------- le rez-de-chaussée

class GF:
    def __init__(self, key, M, spec, L, corners=True):
        sp = dict(pier=0.55, sill=0.9, wh=1.6, gf_h=4.2, gf="shops", nshops=4, floors=4, r=3.0, ct=4.5,
                  round_near=False, round_far=False)
        sp.update(spec)
        self.sp, self.key, self.M, self.L = sp, key, M, L
        self.plan = PLAN.get(key, {})
        self.R = random.Random(f"mix-{key}-{RDC}")
        self.W, self.D, self.gf_h = sp["W"], sp["D"], sp["gf_h"]
        self.FH = S.FH
        self.ya = sp["ct"] if sp["round_near"] else 0.3
        self.yb = self.W - sp["ct"] if sp["round_far"] else self.W - 0.3
        self.corners_on = corners
        self.zs = self.gf_h - 0.27          # le dessous du bandeau
        self.zc = self.gf_h - 0.32          # le plafond des salles
        self.G = dict(wall=MB2(f"mix_{key}_wall", 0.02, 2), fine=MB2(f"mix_{key}_fine", 0.005, 1),
                      plain=MB2(f"mix_{key}_plain"))
        self.Dc = Decals2(L)
        self.props, self.lights = [], []
        self.n = 0
        self.lit = 0                         # lumières intérieures posées (au plus 4)

    # ---- outils
    def nm(self, tag):
        self.n += 1
        return f"mix_{self.key}_{tag}_{self.n}"

    def put(self, src, loc, rot=0.0, scale=(1, 1, 1), mats=None):
        me = src.data
        if mats is not None:
            me = me.copy()
            me.materials.clear()
            me.materials.append(mats)
        ob = bpy.data.objects.new(self.nm("p"), me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (0, 0, rot)
        ob.scale = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
        return ob

    def prop(self, key, loc, rot=0.0, s=1.0, contact=0.0):
        if key in self.L:
            self.props.append((self.L[key][0].name, tuple(loc), rot, s))
            if contact > 0:
                self.Dc.ground(loc[0], loc[1], contact, 1.0)

    def light(self, loc, kind, direction, color, energy, size=(0.2, 0.2), spot=60.0, hide=False):
        d = dict(kind=kind, direction=tuple(direction), color=color, energy=float(energy), size=tuple(size), spot=float(spot))
        if hide:
            d["hide"] = True
        self.lights.append(("light", tuple(loc), d))

    def neon(self, col):
        return self.L["neon"][col]

    # ---- enseignes : lettres néon sur leur rail, pattes, transformateur, câble
    def word(self, text, col, x_face, yc, zb, height, spacing=0.16, rail=True):
        abc = self.L.get("abc")
        if not abc:
            return
        fm, R = self.G["fine"], self.R
        sc = height / abc["H"][1].z
        widths = [abc[ch][1].x * sc if ch in abc else height * 0.55 for ch in text]
        total = sum(widths) + spacing * height * (len(text) - 1)
        thick = abc["H"][1].y * sc
        xr = x_face + (0.07 if rail else 0.0)
        mats = self.neon(col)
        tired = R.randrange(len(text)) if R.random() < 0.35 else -1
        s = -total / 2
        for i, ch in enumerate(text):
            c = s + widths[i] / 2
            if ch in abc:
                m = mats[0] if i == tired else R.choice(mats[1:])
                self.put(abc[ch][0], (xr + thick / 2 + 0.005, yc + c, zb), HALF_PI, sc, mats=m)
            s += widths[i] + spacing * height
        if not rail:
            return
        y0, y1 = yc - total / 2 - 0.12, yc + total / 2 + 0.12
        zm = zb + height * 0.45
        fm.box(x_face, x_face + 0.07, y0, y1, zm - 0.055, zm + 0.055, self.L["raceway"])
        for y in (y0 + 0.2, y1 - 0.2):
            fm.box(x_face - 0.01, x_face + 0.05, y - 0.025, y + 0.025, zm - 0.1, zm + 0.1, self.L["metal"])
        # le transformateur au bout du rail, son câble qui rentre dans le mur
        ty = y1 + 0.12
        fm.box(x_face, x_face + 0.12, ty, ty + 0.26, zm - 0.42, zm - 0.12, self.L["transfo"])
        fm.box(x_face + 0.115, x_face + 0.125, ty + 0.04, ty + 0.22, zm - 0.4, zm - 0.14, self.L["metal"])
        C.tube([[(x_face + 0.06, ty + 0.13, zm - 0.12), (x_face + 0.07, ty + 0.05, zm - 0.06), (x_face + 0.05, y1 - 0.05, zm)],
                [(x_face + 0.06, ty + 0.13, zm - 0.42), (x_face + 0.08, ty + 0.16, zm - 0.6), (x_face + 0.01, ty + 0.2, zm - 0.68)]],
               0.006, self.L["cable"], self.nm("cable"))

    # ---- la coque du rez-de-chaussée
    def shell(self):
        G, L, sp = self.G, self.L, self.sp
        wall, fine, pl = G["wall"], G["fine"], G["plain"]
        W, D, gf_h, ya, yb = self.W, self.D, self.gf_h, self.ya, self.yb
        st, tr = L["stucco"], L["trim"]
        pl.box(-D, -5.6, 0.3, W - 0.3, 0, gf_h, st)
        if not sp["round_near"]:
            wall.box(-D, 0, 0, 0.3, 0, gf_h, st)
        if not sp["round_far"]:
            wall.box(-D, 0, W - 0.3, W, 0, gf_h, st)
        # le bandeau qui sépare le rez-de-chaussée des étages
        wall.box(0, 0.32, ya, yb, self.zs, gf_h, tr)
        if self.corners_on:
            for near in ([True] if sp["round_near"] else []) + ([False] if sp["round_far"] else []):
                yy0, yy1 = (0, ya) if near else (yb, W)
                fp = S.rounded_footprint(-D, 0, yy0, yy1, sp["r"], near=near, far=not near)
                wall.prism(fp, 0, gf_h, st)
                wall.prism(S.rounded_footprint(-D, 0, yy0, yy1, sp["r"], grow=0.32, near=near, far=not near), self.zs, gf_h, tr)
                fine.prism(S.rounded_footprint(-D, 0, yy0, yy1, sp["r"], grow=0.05, near=near, far=not near), 0, 0.55, L["coral"])

    def pier(self, y0, y1, z1=None):
        """Une pile d'enduit sur son soubassement de pierre corallienne, taché au pied."""
        G, L, R = self.G, self.L, self.R
        z1 = self.zs if z1 is None else z1
        G["wall"].box(-0.35, 0.04, y0, y1, 0, z1, L["stucco"])
        G["fine"].box(0.04, 0.085, y0 - 0.005, y1 + 0.005, 0, 0.58, L["coral"])
        G["fine"].box(0.04, 0.1, y0 - 0.01, y1 + 0.01, 0.58, 0.62, L["trim"])
        self.Dc.wall("decal_rise" if R.random() < 0.6 else "decal_rise2", 0.088, y0, y1, 0.0, R.uniform(0.35, 0.6),
                     R.uniform(0.6, 1.0), flip=R.random() < 0.5)
        self.Dc.wall("decal_rise", 0.044, y0, y1, 0.62, R.uniform(1.0, 1.6), R.uniform(0.35, 0.65), flip=R.random() < 0.5)

    # ---- boutiques
    def shops(self):
        sp, L, R = self.sp, self.L, self.R
        n = sp["nshops"]
        sw = (self.yb - self.ya) / n
        bays = list(self.plan.get("bays", []))
        lobby = sp.get("lobby_bay")
        pool = ["cafe", "store", "bar", "surf"]
        while len(bays) < n:
            bays.append(pool[len(bays) % 4])
        bays = bays[:n]
        if lobby is not None and bays[lobby] != "lobby":
            bays[lobby] = "lobby"
        for k, kind in enumerate(bays):
            if kind == "lobby" and k != lobby:
                bays[k] = "store"
        words = self.plan.get("words", {})
        for k in range(n + 1):
            yk = self.ya + k * sw
            self.pier(max(self.ya, yk - 0.3), min(self.yb, yk + 0.3))
        for k, kind in enumerate(bays):
            a, b = self.ya + k * sw + 0.3, self.ya + (k + 1) * sw - 0.3
            if kind == "lobby":
                safe("hall", self.lobby, a, b, words.get(k))
                continue
            safe(f"boutique {k}", self.shop, k, kind, a, b, words.get(k))
        if self.plan.get("service") and "ubox" in L:
            d = L["ubox"][1]
            y = self.ya + 0.02
            self.prop("ubox", (0.09 + d.x / 2, y, SW), 0.0, 0.85, contact=0.4)
            C.tube([[(0.09 + d.x * 0.42, y, SW + d.z * 0.85), (0.1, y, SW + d.z * 0.85 + 0.25), (0.06, y, self.zs - 0.1)]],
                   0.02, L["alu"], self.nm("conduit"))

    def shop(self, k, kind, a, b, word):
        L, R, G = self.L, self.R, self.G
        ztop = 3.45
        G["wall"].box(-0.35, 0.0, a, b, ztop, self.zs, L["stucco"])
        self.shopfront(a, b, k, ztop)
        getattr(self, "in_" + ("bar" if kind == "cocktails" else kind))(a, b, kind)
        yc = (a + b) / 2
        awn = self.plan.get("awn", {})
        if k in awn and not SOBRE:
            self.awning(a + 0.05, b - 0.05, L["awn"][awn[k] % len(L["awn"])], bulbs=kind in ("cafe", "bar", "cocktails"))
        elif SOBRE and k in awn and k == min(awn):
            self.awning(a + 0.05, b - 0.05, L["awn"][awn[k] % len(L["awn"])], bulbs=False)
        if word:
            text, col = word
            h = min(0.34, 0.9 * (b - a) / (len(text) * 0.78 + 0.5))
            self.word(text, col, 0.0, yc, (ztop + self.zs) / 2 - h * 0.5, h)
        if self.plan.get("open") == k and "open" in L:
            src, d = L["open"]
            yo = b - 0.75 if k % 2 == 0 else a + 0.75
            self.put(src, (-0.36, yo, 1.75), 0.0, 1.7)
            for dy in (-0.3, 0.3):
                G["plain"].cyl((-0.36, yo + dy, 1.75 + 0.33), (-0.36, yo + dy, 2.55), 0.002, L["metal"], seg=4)
        # la salle déborde sur le trottoir : une surface de lumière sous l'imposte, tournée vers la rue
        w = b - a
        temp = TEMP.get(kind, "#ffd9a8")
        self.light((0.4, yc, 3.0), "AREA", (1, 0, -1.15), temp, 38.0 * w, (max(0.8, w - 0.3), 0.6), hide=True)
        if self.lit < 4:
            self.lit += 1
            self.light((-2.9, yc, self.zc - 0.05), "AREA", (0, 0, -1), temp, 55.0 * w, (2.6, max(0.8, w - 0.5)), hide=True)

    def shopfront(self, a, b, k, ztop=3.45):
        """Devanture à profils de bronze de 12 cm : soubassement de vitrolite à couvre-joint, glaces,
        imposte, porte à plinthe de laiton, barre de poussée, poignée, ferme-porte, seuil de pierre."""
        G, L = self.G, self.L
        fm, pl = G["fine"], G["plain"]
        br, bs = L["bronze"], L["brass"]
        x0, x1, xg = -0.33, -0.21, -0.27
        zt = 2.55
        left = (k + len(self.key)) % 2 == 0
        da, db = (a + 0.05, a + 1.05) if left else (b - 1.05, b - 0.05)
        disp = [(a, da), (db, b)]
        for (p, q) in disp:
            if q - p < 0.08:
                continue
            fm.box(x0 - 0.02, x1, p, q, 0.0, 0.62, L["vitro"])
            fm.box(x0 - 0.03, x1 + 0.05, p, q, 0.62, 0.68, br)
            pl.quad([(xg, p, 0.68), (xg, q, 0.68), (xg, q, zt), (xg, p, zt)], L["shopglass"], (1, 0, 0))
            nm = max(1, int(round((q - p) / 1.7)))
            for i in range(1, nm):
                y = p + (q - p) * i / nm
                fm.box(x0, x1, y - 0.03, y + 0.03, 0.62, ztop, br)
        pl.quad([(xg, a, zt + 0.06), (xg, b, zt + 0.06), (xg, b, ztop - 0.06), (xg, a, ztop - 0.06)], L["shopglass"], (1, 0, 0))
        # la porte
        pl.quad([(xg - 0.03, da + 0.07, SW + 0.24), (xg - 0.03, db - 0.07, SW + 0.24), (xg - 0.03, db - 0.07, zt - 0.08),
                 (xg - 0.03, da + 0.07, zt - 0.08)], L["shopglass"], (1, 0, 0))
        for (p, q) in ((da, da + 0.07), (db - 0.07, db)):
            fm.box(x0 - 0.03, x1 - 0.03, p, q, SW, zt, br)
        fm.box(x0 - 0.03, x1 - 0.03, da, db, SW, SW + 0.24, br)
        fm.box(x1 - 0.031, x1 - 0.02, da + 0.07, db - 0.07, SW + 0.02, SW + 0.22, bs)
        fm.box(x0 - 0.03, x1 - 0.03, da, db, zt - 0.08, zt, br)
        fm.cyl((x1 + 0.03, da + 0.16, 1.05), (x1 + 0.03, db - 0.16, 1.05), 0.016, bs, seg=8)
        for y in (da + 0.16, db - 0.16):
            fm.cyl((x1 - 0.03, y, 1.05), (x1 + 0.03, y, 1.05), 0.01, bs, seg=6)
        yh = db - 0.2 if left else da + 0.2
        fm.cyl((x1 + 0.045, yh, 0.85), (x1 + 0.045, yh, 1.45), 0.014, bs, seg=8)
        yq = da + 0.12 if left else db - 0.46
        fm.box(x1 - 0.03, x1 + 0.03, yq, yq + 0.34, zt - 0.2, zt - 0.09, L["alu"])
        fm.cyl((x1 + 0.01, yq + 0.3, zt - 0.14), (x1 + 0.01, yq + 0.62, zt - 0.17), 0.01, L["alu"], seg=6)
        # dormant, traverse d'imposte, montants d'about
        fm.box(x0, x1, a, b, zt, zt + 0.06, br)
        fm.box(x0, x1, a, b, ztop - 0.06, ztop, br)
        for y in (a + 0.035, b - 0.035):
            fm.box(x0, x1, y - 0.035, y + 0.035, 0.0, ztop, br)
        nm = max(1, int(round((b - a) / 1.7)))
        for i in range(1, nm):
            y = a + (b - a) * i / nm
            fm.box(x0, x1, y - 0.025, y + 0.025, zt, ztop, br)
        # le seuil de pierre, en saillie, usé au milieu
        fm.box(x0 - 0.02, 0.14, da - 0.05, db + 0.05, 0.0, SW + 0.035, L["stone"])
        self.Dc.ground(0.02, (da + db) / 2, 0.45, 0.5)

    # ---- les salles
    def room(self, a, b, floor, wallm, xb=-5.4):
        pl = self.G["plain"]
        zc = self.zc
        a0, b0 = a - 0.22, b + 0.22
        pl.box(xb, -0.33, a0, b0, 0.05, SW, floor, faces=("+z",))
        pl.box(xb, -0.33, a0, b0, zc, zc + 0.1, self.L["ceiling"], faces=("-z",))
        pl.box(xb, -0.33, a0 - 0.1, a0, SW, zc, wallm, faces=("+y",))
        pl.box(xb, -0.33, b0, b0 + 0.1, SW, zc, wallm, faces=("-y",))
        pl.box(xb - 0.1, xb, a0, b0, SW, zc, wallm, faces=("+x",))
        # une cimaise et une plinthe : le mur n'est pas un aplat
        self.G["fine"].box(xb, xb + 0.02, a0, b0, SW, SW + 0.12, self.L["walnut"])
        return xb

    def pendants(self, x, ys, key="lamp"):
        if key not in self.L:
            return
        d = self.L[key][1]
        for y in ys:
            self.prop(key, (x, y, self.zc - d.z), self.R.uniform(0, 6), 1.0)

    def table(self, B, x, y):
        L = self.L
        B.cyl((x, y, SW), (x, y, SW + 0.03), 0.22, L["chair"], seg=14)
        B.cyl((x, y, SW), (x, y, 0.74), 0.03, L["chair"], seg=8)
        B.cyl((x, y, 0.74), (x, y, 0.77), 0.34, L["marble"], seg=20)

    def chair(self, B, x, y, s):
        L = self.L
        B.box(x - 0.2, x + 0.2, y - 0.2, y + 0.2, 0.44, 0.47, L["chair"])
        for dx in (-0.17, 0.17):
            for dy in (-0.17, 0.17):
                B.cyl((x + dx, y + dy, SW), (x + dx, y + dy, 0.44), 0.013, L["chair"], seg=6)
        yb = y + s * 0.19
        for dx in (-0.17, -0.06, 0.06, 0.17):
            B.box(x + dx - 0.015, x + dx + 0.015, yb - 0.012, yb + 0.012, 0.47, 0.86, L["chair"])
        B.box(x - 0.2, x + 0.2, yb - 0.015, yb + 0.015, 0.8, 0.88, L["chair"])

    def in_bar(self, a, b, kind="bar"):
        G, L, R = self.G, self.L, self.R
        pl, fm = G["plain"], G["fine"]
        xb = self.room(a, b, L["checker"], L["wall_plum"] if kind == "cocktails" else L["wall_sand"])
        m0, m1 = a + 0.3, b - 0.3
        pl.box(xb, xb + 0.02, m0, m1, 1.1, 2.75, L["mirror"], faces=("+x",))
        for zs in (1.35, 1.8, 2.25):
            fm.box(xb, xb + 0.3, m0, m1, zs, zs + 0.035, L["walnut"])
            pl.box(xb + 0.26, xb + 0.29, m0, m1, zs - 0.025, zs, L["cove"])
            y = m0 + 0.1
            while y < m1 - 0.1:
                r, hgt = R.uniform(0.03, 0.045), R.uniform(0.2, 0.32)
                mat = R.choice(L["bottles"])
                z0 = zs + 0.035
                pl.cyl((xb + 0.15, y, z0), (xb + 0.15, y, z0 + hgt * 0.68), r, mat, seg=8)
                pl.cyl((xb + 0.15, y, z0 + hgt * 0.68), (xb + 0.15, y, z0 + hgt), r * 0.9, mat, r1=r * 0.3, seg=6)
                y += R.uniform(0.08, 0.17)
        fm.box(xb, xb + 0.6, a, b, SW, 1.0, L["walnut"])
        fm.box(xb, xb + 0.65, a, b, 1.0, 1.04, L["marble"])
        # le comptoir, son dessus de marbre, sa barre de pied en laiton, les tabourets
        cx0, cx1 = -3.7, -3.1
        fm.box(cx0, cx1, a + 0.4, b - 0.4, SW, 1.05, L["walnut"])
        fm.box(cx0 - 0.05, cx1 + 0.08, a + 0.35, b - 0.35, 1.05, 1.1, L["marble"])
        pl.cyl((cx1 + 0.12, a + 0.45, 0.32), (cx1 + 0.12, b - 0.45, 0.32), 0.02, L["brass"], seg=8)
        ns = max(2, int((b - a - 1.0) / 0.75))
        seat = "barchair" if kind == "cocktails" else "stool"
        for i in range(ns):
            y = a + 0.75 + i * (b - a - 1.5) / max(1, ns - 1)
            self.prop(seat, (cx1 + 0.45, y, SW), R.uniform(0, 6), 1.0)
        self.pendants(-3.4, [a + (b - a) * f for f in ((0.3, 0.7) if b - a > 3.0 else (0.5,))])
        if kind == "cocktails":
            for y in (a + 0.6, b - 0.6):
                pl.ellipsoid((-1.1, y, 0.55), (0.28, 0.28, 0.2), L["leather"], nu=12, nv=8)
            self.table(pl, -1.1, (a + b) / 2)

    def in_cafe(self, a, b, kind="cafe"):
        G, L, R = self.G, self.L, self.R
        pl, fm = G["plain"], G["fine"]
        xb = self.room(a, b, L["tile"], R.choice((L["wall_rose"], L["wall_blue"], L["wall_mint"])))
        fm.box(xb + 0.9, xb + 1.5, a + 0.4, b - 0.4, SW, 1.0, L["oak"])
        fm.box(xb + 0.85, xb + 1.55, a + 0.35, b - 0.35, 1.0, 1.04, L["marble"])
        cl = min(1.6, (b - a) * 0.35)
        pl.box(xb + 0.95, xb + 1.45, a + 0.5, a + 0.5 + cl, 1.04, 1.4, L["case"])
        for i in range(int(cl / 0.22)):
            pl.ellipsoid((xb + 1.2, a + 0.62 + i * 0.22, 1.1), (0.08, 0.08, 0.05), R.choice(L["pastry"]), nu=10, nv=6)
        fm.box(xb, xb + 0.5, a + 0.2, b - 0.2, SW, 0.95, L["walnut"])
        fm.box(xb + 0.05, xb + 0.5, (a + b) / 2 - 0.35, (a + b) / 2 + 0.35, 0.95, 1.45, L["alu"])
        pl.box(xb, xb + 0.03, a + 0.6, b - 0.6, 1.9, 2.75, L["raceway"], faces=("+x",))
        for rr in range(5):
            pl.box(xb + 0.03, xb + 0.035, a + 0.8, a + 0.8 + R.uniform(0.6, max(0.7, b - a - 2.0)), 2.55 - rr * 0.13,
                   2.57 - rr * 0.13, L["menu"])
        nt = max(1, int((b - a - 0.8) / 1.6))
        for i in range(nt):
            y = a + 0.7 + (i + 0.5) * (b - a - 1.4) / nt
            self.table(pl, -1.25, y)
            self.chair(pl, -1.25, y - 0.55, -1)
            self.chair(pl, -1.25, y + 0.55, 1)
        self.pendants(-2.3, [a + (b - a) * f for f in (0.25, 0.75)])
        self.prop("plant", (-0.8, b - 0.45, SW), R.uniform(0, 6), 1.2)

    def in_store(self, a, b, kind="store"):
        G, L, R = self.G, self.L, self.R
        pl, fm = G["plain"], G["fine"]
        xb = self.room(a, b, L["oak"], R.choice((L["wall_cream"], L["wall_blue"])))
        for y in (a + 0.1, b - 0.1):
            fm.box(xb, xb + 0.45, y - 0.02, y + 0.02, SW, 2.5, L["walnut"])
        for zs in (0.5, 1.0, 1.5, 2.0):
            fm.box(xb, xb + 0.45, a + 0.1, b - 0.1, zs, zs + 0.03, L["walnut"])
            y = a + 0.15
            while y < b - 0.4:
                w = R.uniform(0.15, 0.4)
                pl.box(xb + 0.06, xb + R.uniform(0.25, 0.4), y, y + w, zs + 0.03, zs + 0.03 + R.uniform(0.15, 0.4), R.choice(L["goods"]))
                y += w + R.uniform(0.02, 0.1)
        c = (a + b) / 2
        hw = min(1.2, (b - a) * 0.22)
        fm.box(-3.2, -2.3, c - hw, c + hw, SW, 0.8, L["walnut"])
        for i in range(9):
            u, v = R.uniform(-3.1, -2.6), R.uniform(c - hw + 0.1, c + hw - 0.35)
            pl.box(u, u + 0.3, v, v + 0.25, 0.8, 0.8 + R.uniform(0.03, 0.25), R.choice(L["goods"]))
        # rail de spots au plafond
        fm.box(-3.6, -1.0, c - 0.02, c + 0.02, self.zc - 0.04, self.zc, L["metal"])
        for x in (-3.3, -2.5, -1.7):
            fm.cyl((x, c, self.zc - 0.04), (x + 0.08, c, self.zc - 0.2), 0.045, L["metal"], seg=10)
            pl.disc((x + 0.085, c, self.zc - 0.205), (0.45, 0, -1), 0.035, L["down"], seg=10)
        if "shelf" in L:
            d = L["shelf"][1]
            self.prop("shelf", (-1.6, a + 0.1 + d.y / 2, SW), 0.0, 1.0)

    def in_surf(self, a, b, kind="surf"):
        G, L, R = self.G, self.L, self.R
        pl, fm = G["plain"], G["fine"]
        xb = self.room(a, b, L["oak"], L["wall_mint"])
        n = max(2, int((b - a - 0.6) / 0.62))
        for i in range(n):
            y = a + 0.5 + i * (b - a - 1.0) / max(1, n - 1)
            rot = Matrix.Rotation(R.uniform(-0.07, 0.07), 3, "X") @ Matrix.Rotation(-0.13, 3, "Y")
            pl.ellipsoid((xb + 0.3, y, 1.32), (0.05, 0.27, 1.08 - 0.1 * (i % 3)), L["boards"][i % 5], rot=rot, nu=16, nv=10)
        for zs in (0.9, 1.5, 2.1):
            fm.box(-4.6, -1.2, a + 0.0, a + 0.42, zs, zs + 0.03, L["oak"])
            x = -4.5
            while x < -1.5:
                w = R.uniform(0.25, 0.45)
                pl.box(x, x + w, a + 0.04, a + 0.38, zs + 0.03, zs + 0.03 + R.uniform(0.08, 0.3), R.choice(L["goods"]))
                x += w + R.uniform(0.03, 0.12)
        c = (a + b) / 2
        hw = min(1.0, (b - a) * 0.2)
        fm.box(-3.4, -2.2, c - hw, c + hw, SW, 0.82, L["oak"])
        for i in range(7):
            u, v = R.uniform(-3.3, -2.5), R.uniform(c - hw + 0.1, c + hw - 0.4)
            pl.box(u, u + 0.38, v, v + 0.3, 0.82, 0.82 + R.uniform(0.03, 0.12), R.choice(L["goods"]))
        if "shelf" in L:
            d = L["shelf"][1]
            self.prop("shelf", (-1.5, b - 0.1 - d.y / 2, SW), 0.0, 1.0)
        self.pendants(-2.8, [c])
        self.prop("plant", (-0.85, b - 0.5, SW), R.uniform(0, 6), 1.3)

    # ---- le hall d'hôtel et sa marquise
    def lobby(self, a, b, word):
        G, L, R = self.G, self.L, self.R
        pl, fm, wall = G["plain"], G["fine"], G["wall"]
        br, bs = L["bronze"], L["brass"]
        ztop = 3.5
        wall.box(-0.35, 0.0, a, b, ztop, self.zs, L["stucco"])
        x0, x1, xg = -0.36, -0.24, -0.3
        zt = 2.6
        c = (a + b) / 2
        dw = 1.8
        da, db = c - dw / 2, c + dw / 2
        for (p, q) in ((a, da), (db, b)):
            if q - p < 0.1:
                continue
            fm.box(x0 - 0.02, x1, p, q, 0.0, 0.5, L["vitro"])
            fm.box(x0 - 0.03, x1 + 0.05, p, q, 0.5, 0.56, br)
            pl.quad([(xg, p, 0.56), (xg, q, 0.56), (xg, q, zt), (xg, p, zt)], L["shopglass"], (1, 0, 0))
            nm = max(1, int(round((q - p) / 1.3)))
            for i in range(1, nm):
                y = p + (q - p) * i / nm
                fm.box(x0, x1, y - 0.03, y + 0.03, 0.0, ztop, br)
        if "door" in L:
            src, dd = L["door"]
            for (p, q) in ((da, c), (c, db)):
                self.put(src, (xg - 0.02, (p + q) / 2, SW), 0.0, (1.0, (q - p - 0.02) / dd.y, (zt - SW) / dd.z))
                yh = q - 0.14 if p < c else p + 0.14
                fm.cyl((x1 + 0.05, yh, 0.8), (x1 + 0.05, yh, 1.6), 0.016, bs, seg=8)
                for z in (0.85, 1.55):
                    fm.cyl((x1 - 0.02, yh, z), (x1 + 0.05, yh, z), 0.009, bs, seg=6)
        pl.quad([(xg, a, zt + 0.05), (xg, b, zt + 0.05), (xg, b, ztop - 0.05), (xg, a, ztop - 0.05)], L["shopglass"], (1, 0, 0))
        for y in (a + 0.03, da, c, db, b - 0.03):
            fm.box(x0, x1, y - 0.03, y + 0.03, 0.0 if y not in (da, c, db) else zt, ztop, br)
        for z in (zt, ztop - 0.05):
            fm.box(x0, x1, a, b, z, z + 0.05, br)
        # l'imposte en éventail
        cz = zt + 0.05
        for i in range(9):
            ang = math.pi * (i + 1) / 10
            co, si = math.cos(ang), math.sin(ang)
            t = min((ztop - 0.05 - cz) / si, 0.85 / max(1e-3, abs(co)))
            fm.cyl((x0 + 0.04, c, cz), (x0 + 0.04, c + co * t, cz + si * t), 0.011, br, seg=6)
        fm.box(x0 - 0.04, 0.2, da - 0.15, db + 0.15, 0.0, SW + 0.04, L["stone"])
        fm.box(0.2, 0.55, da - 0.05, db + 0.05, 0.0, SW + 0.02, L["stone"])
        # la salle : sol de terrazzo, banque de bois et marbre, panneau de laiton, lustre en couronne
        xb = self.room(a, b, L["terrazzo"], L["wall_cream"], xb=-6.0)
        pl.box(xb, xb + 0.02, c - 1.0, c + 1.0, 1.4, 3.4, bs, faces=("+x",))
        fm.box(-5.4, -4.7, c - 1.0, c + 1.0, SW, 1.1, L["walnut"])
        fm.box(-5.45, -4.65, c - 1.05, c + 1.05, 1.1, 1.14, L["marble"])
        pl.cyl((-5.05, c - 0.6, 1.14), (-5.05, c - 0.6, 1.45), 0.012, bs, seg=6)
        pl.cyl((-5.05, c - 0.6, 1.42), (-5.05, c - 0.6, 1.62), 0.15, L["globe"], r1=0.09, seg=14)
        pl.torus((-2.9, c, self.zc - 0.45), (0, 0, 1), 0.45, 0.035, L["down"], seg=24, rseg=6)
        for i in range(3):
            ang = 2 * math.pi * i / 3
            pl.cyl((-2.9 + 0.45 * math.cos(ang), c + 0.45 * math.sin(ang), self.zc - 0.45), (-2.9, c, self.zc), 0.005, L["chair"], seg=4)
        for y in (a + 0.6, b - 0.6):
            pl.ellipsoid((-1.6, y, 0.5), (0.35, 0.35, 0.22), L["leather"], nu=12, nv=8)
        self.prop("plant", (-1.0, b - 0.45, SW), R.uniform(0, 6), 1.5)
        self.prop("plant", (-1.0, a + 0.45, SW), R.uniform(0, 6), 1.3)
        self.light((-3.0, c, self.zc - 0.05), "AREA", (0, 0, -1), TEMP["lobby"], 60.0 * (b - a), (3.0, b - a - 0.5), hide=True)
        self.lit += 1
        # vasques au pied des pilastres
        for y in (a - 0.3, b + 0.3):
            self.prop("planter", (0.5, y, SW), 0.0, 1.0, contact=0.42)
        self.canopy(a, b, word)

    def canopy(self, a, b, word):
        G, L = self.G, self.L
        pl, fm, wall = G["plain"], G["fine"], G["wall"]
        c = (a + b) / 2
        half = min(2.0, (b - a) / 2 + 0.35)
        # le dessus reste sous gf_h − 0.4 : les projecteurs du pylône de B s'y posent (gf_h − 0.35)
        zt = min(3.85, self.gf_h - 0.45)
        zb = zt - 0.3
        wall.prism(S.rounded_footprint(0.0, 2.4, c - half, c + half, 0.5), zb, zt, L["trim"])
        fm.prism(S.rounded_footprint(0.0, 2.44, c - half - 0.04, c + half + 0.04, 0.54), zb + 0.15, zb + 0.19, L["bronze"])
        for yy in (c - half + 0.6, c, c + half - 0.6):
            for xx in (0.8, 1.7):
                pl.cyl((xx, yy, zb - 0.02), (xx, yy, zb + 0.001), 0.07, L["down"], seg=12, smooth=False)
        for yy in (c - half + 0.35, c + half - 0.35):
            fm.cyl((2.1, yy, zt), (0.0, yy, 5.5), 0.018, L["metal"], seg=8)
            fm.box(-0.02, 0.04, yy - 0.06, yy + 0.06, 5.4, 5.6, L["metal"])
        if word:
            text, col = word
            h = min(0.5, 0.9 * 2 * half / (len(text) * 0.8 + 0.4))
            fm.box(1.7, 1.85, c - half + 0.3, c + half - 0.3, zt, zt + 0.05, L["raceway"])
            self.word(text, col, 1.85, c, zt + 0.05, h, rail=False)
        if self.plan.get("vacancy"):
            vy = c + half - 0.9
            fm.box(2.15, 2.2, vy - 0.55, vy + 0.55, zb - 0.5, zb - 0.15, L["raceway"])
            for yy in (vy - 0.45, vy + 0.45):
                pl.cyl((2.17, yy, zb - 0.15), (2.17, yy, zb), 0.006, L["metal"], seg=4)
            self.word("VACANCY", "rose", 2.2, vy, zb - 0.41, 0.15, spacing=0.1, rail=False)
        self.light((1.2, c, zb - 0.05), "AREA", (0.1, 0, -1), "#ffe2bf", 300.0, (2.0, 2 * half - 0.4), hide=True)

    # ---- store banne
    def awning(self, ya, yb, mat, bulbs=False, x1=1.7, zw=3.4, zl=2.78):
        G, L, R = self.G, self.L, self.R
        pl, fm = G["plain"], G["fine"]
        Lw = yb - ya
        narm = max(2, int(round(Lw / 1.6)) + 1)
        arms = [ya + 0.06 + (Lw - 0.12) * i / (narm - 1) for i in range(narm)]
        half_span = (Lw - 0.12) / (narm - 1) / 2

        def sagz(y, v):
            t = min(1.0, min(abs(y - q) for q in arms) / half_span)
            return (0.025 + 0.05 * t) * math.sin(math.pi * v) + 0.012 * t * math.sin(v * 9.0 + y * 2.3)

        nu, nv = max(12, int(Lw * 8)), 8
        V = [[pl.v((x1 * (j / nv), ya + Lw * (i / nu), zw + (zl - zw) * (j / nv) - sagz(ya + Lw * (i / nu), j / nv)))
              for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                u, v = (i + 0.5) / nu, (j + 0.5) / nv
                eu = max(0.0, 1 - min(u, 1 - u) * Lw / 0.35)
                ev = max(0.0, (v - 0.7) / 0.3)
                d = min(1.0, 0.15 + 0.85 * max(eu, ev)) * R.uniform(0.85, 1.0)
                pl.polyd([V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]], mat, (0.45, 0, 1), d)
        # le lambrequin festonné
        n = max(2, int(round(Lw / 0.42)))
        k8 = 8
        top = [pl.v((x1 + 0.004, ya + Lw * i / (n * k8), zl)) for i in range(n * k8 + 1)]
        bot = []
        for i in range(n * k8 + 1):
            t = (i % k8) / k8 if i < n * k8 else 0.0
            depth = 0.15 + 0.07 * math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2))
            bot.append(pl.v((x1 + 0.004, ya + Lw * i / (n * k8), zl - depth)))
        for i in range(n * k8):
            pl.polyd([top[i], top[i + 1], bot[i + 1], bot[i]], mat, (1, 0, 0), 0.75)
        # le coffre au mur, les bras, les consoles, la barre de charge
        fm.box(0.0, 0.16, ya - 0.06, yb + 0.06, zw - 0.06, zw + 0.12, L["metal"])
        for y in arms:
            fm.box(0.0, 0.06, y - 0.06, y + 0.06, zw - 0.62, zw - 0.38, L["metal"])
            fm.cyl((0.05, y, zw - 0.5), (x1 - 0.06, y, zl + 0.04), 0.017, L["metal"], seg=8)
        fm.cyl((x1, ya, zl - 0.01), (x1, yb, zl - 0.01), 0.022, L["metal"], seg=8)
        if bulbs and not SOBRE:
            wire = C.sag((x1 - 0.12, ya + 0.08, zl - 0.06), (x1 - 0.12, yb - 0.08, zl - 0.06), 0.12, 24)
            C.tube([wire], 0.004, L["cable"], self.nm("wire"))
            for k in range(1, 24, 2):
                q = wire[k]
                pl.ellipsoid((q[0], q[1], q[2] - 0.05), (0.03, 0.03, 0.04), L["bulb"], nu=8, nv=6)

    # ---- rez-de-chaussée d'habitation (appartements, motel)
    def rooms(self):
        sp, G, L, R = self.sp, self.G, self.L, self.R
        wall, fm, pl = G["wall"], G["fine"], G["plain"]
        zf = self.gf_h - self.FH
        ya, yb = self.ya, self.yb
        ncol = sp.get("ncol") or max(2, round((yb - ya) / sp.get("bay", 3.0)))
        cw = (yb - ya) / ncol
        p = sp["pier"]
        motel = bool(sp.get("gallery"))
        doors = set(sp.get("doors", ())) if motel else set()
        entrance = None if motel else ncol // 2
        if zf > 0.05:
            wall.box(-0.35, 0.02, ya, yb, 0, zf, L["stucco"])
            wall.box(0.0, 0.12, ya, yb, zf - 0.12, zf, L["trim"])
        fm.box(0.02, 0.065, ya, yb, 0, 0.5, L["coral"])
        fm.box(0.02, 0.08, ya, yb, 0.5, 0.54, L["trim"])
        for i in range(int((yb - ya) / 1.4)):
            y = ya + R.uniform(0, yb - ya - 0.8)
            self.Dc.wall("decal_rise", 0.068, y, y + R.uniform(0.4, 1.0), 0.0, R.uniform(0.3, 0.5), R.uniform(0.5, 0.9))
        rooms = S.mat_rooms(f"mix_{self.key}", ya, cw, zf, 99.0, False, ya, 1.0)
        cur = S.mat_curtain(f"mix_{self.key}", ya, cw, zf, -1.0)
        pl.box(-RD - 0.02, -RD, ya, yb, zf, self.zs, rooms, faces=("+x",))
        pl.box(-0.56, -0.555, ya, yb, zf + 0.2, self.zs, cur)
        pl.box(-RD, -0.35, ya, yb, zf, zf + 0.05, L["wall_sand"])
        top_lim = self.zs if not motel else self.gf_h - 0.22
        for k in range(ncol + 1):
            yk = ya + k * cw
            wall.box(-0.35, 0.0, max(ya, yk - p / 2), min(yb, yk + p / 2), zf, top_lim, L["stucco"])
            pl.box(-RD, -0.35, max(ya, yk - 0.06), min(yb, yk + 0.06), zf, top_lim, L["wall_sand"])
        sill = sp["sill"] + 0.25
        for k in range(ncol):
            y0, y1 = ya + k * cw + p / 2, ya + (k + 1) * cw - p / 2
            zs, zt = zf + sill, zf + sill + sp["wh"]
            if k in doors:
                safe("porte de motel", self.motel_door, y0, y1, zf, zs, zt, top_lim, k)
            elif k == entrance:
                safe("entrée", self.entrance, y0, y1, zf, top_lim)
            else:
                wall.box(-0.35, 0.0, y0, y1, zf, zs, L["stucco"])
                wall.box(-0.35, 0.0, y0, y1, zt, top_lim, L["stucco"])
                self.res_window(y0, y1, zs, zt)
        if motel and self.plan.get("vacancy"):
            yv = ya + 1.5 * cw
            fm.box(-0.42, -0.4, yv - 0.6, yv + 0.6, zf + 1.45, zf + 1.95, L["raceway"])
            self.word("VACANCY", "rose", -0.4, yv, zf + 1.6, 0.18, spacing=0.1, rail=False)
        # appliques au-dessus des portes / de part et d'autre de l'entrée
        for k in range(ncol):
            if k in doors or k == entrance:
                y = ya + k * cw + p / 2 + 0.68
                fm.box(0.0, 0.05, y - 0.08, y + 0.08, zf + 2.25, zf + 2.55, L["bronze"])
                pl.cyl((0.05, y, zf + 2.28), (0.05, y, zf + 2.52), 0.06, L["globe"], seg=12)

    def res_window(self, y0, y1, z0, z1):
        G, L, R = self.G, self.L, self.R
        fm, pl = G["fine"], G["plain"]
        fr = L["frame"]
        fm.box(-0.05, 0.08, y0 - 0.06, y1 + 0.06, z0 - 0.07, z0, L["stone"])
        xc0, xc1 = -0.31, -0.19
        for (a, b, za, zb) in ((y0, y1, z0, z0 + 0.06), (y0, y1, z1 - 0.06, z1), (y0, y0 + 0.06, z0, z1), (y1 - 0.06, y1, z0, z1)):
            fm.box(xc0, xc1, a, b, za, zb, fr)
        n = max(1, int(round((y1 - y0) / 0.85)))
        for i in range(1, n):
            y = y0 + (y1 - y0) * i / n
            fm.box(xc0 + 0.01, xc1 - 0.01, y - 0.025, y + 0.025, z0, z1, fr)
        fm.box(xc0 + 0.01, xc1 - 0.01, y0, y1, z1 - 0.45, z1 - 0.41, fr)
        for i in range(n):
            a, b = y0 + (y1 - y0) * i / n + 0.03, y0 + (y1 - y0) * (i + 1) / n - 0.03
            for (za, zb) in ((z0 + 0.06, z1 - 0.45), (z1 - 0.41, z1 - 0.06)):
                fm.box(xc0 + 0.02, xc1 - 0.02, a, b, za, za + 0.04, fr)
                fm.box(xc0 + 0.02, xc1 - 0.02, a, b, zb - 0.04, zb, fr)
                fm.box(xc0 + 0.02, xc1 - 0.02, a, a + 0.04, za, zb, fr)
                fm.box(xc0 + 0.02, xc1 - 0.02, b - 0.04, b, za, zb, fr)
        pl.quad([(-0.25, y0, z0), (-0.25, y1, z0), (-0.25, y1, z1), (-0.25, y0, z1)], L["glass"], (1, 0, 0))
        w = (y1 - y0) * R.uniform(0.5, 0.85)
        yc = (y0 + y1) / 2 + R.uniform(-0.12, 0.12)
        self.Dc.wall("decal_hang", 0.004, yc - w / 2, yc + w / 2, z0 - 0.07 - R.uniform(0.5, 1.0), z0 - 0.07, R.uniform(0.45, 0.8))

    def motel_door(self, y0, y1, zf, zs, zt, top, k):
        G, L, R = self.G, self.L, self.R
        wall, fm, pl = G["wall"], G["fine"], G["plain"]
        st = L["stucco"]
        dz = zf + 2.15
        da, db = y0 + 0.2, y0 + 1.15
        wa, wb = y0 + 1.45, y1 - 0.1
        for (a, b, za, zb) in ((y0, da, zf, top), (db, wa, zf, top), (wb, y1, zf, top), (da, db, dz, top), (wa, wb, zf, zs), (wa, wb, zt, top)):
            if b - a > 0.01 and zb - za > 0.01:
                wall.box(-0.35, 0.0, a, b, za, zb, st)
        fr = L["frame"]
        for (a, b, za, zb) in ((da - 0.06, da, zf, dz), (db, db + 0.06, zf, dz), (da - 0.06, db + 0.06, dz - 0.06, dz)):
            fm.box(-0.32, -0.18, a, b, za, zb, fr)
        dm = L["doors"][(k // 2) % len(L["doors"])]
        fm.box(-0.26, -0.21, da, db, zf + SW + 0.01, dz - 0.06, dm)
        for z in (0.55, 1.3, 1.85):
            fm.box(-0.212, -0.205, da + 0.1, db - 0.1, zf + z, zf + z + 0.02, dm)
        fm.box(-0.208, -0.2, da + 0.05, db - 0.05, zf + SW + 0.02, zf + SW + 0.25, L["brass"])
        yk = db - 0.12 if k % 4 == 0 else da + 0.12
        pl.ellipsoid((-0.18, yk, zf + 1.0), (0.03, 0.03, 0.03), L["brass"], nu=8, nv=6)
        fm.box(-0.35, 0.12, da - 0.04, db + 0.04, 0.0, SW + 0.03, L["stone"])
        if wb - wa > 0.4:
            self.res_window(wa, wb, zs, zt)

    def entrance(self, y0, y1, zf, top):
        G, L = self.G, self.L
        wall, fm, pl = G["wall"], G["fine"], G["plain"]
        c = (y0 + y1) / 2
        da, db = c - 0.75, c + 0.75
        zt = 2.55
        wall.box(-0.35, 0.0, y0, da - 0.1, 0, top, L["stucco"])
        wall.box(-0.35, 0.0, db + 0.1, y1, 0, top, L["stucco"])
        wall.box(-0.35, 0.0, da - 0.1, db + 0.1, 3.3, top, L["stucco"])
        xg = -0.3
        if "door" in L:
            src, dd = L["door"]
            self.put(src, (xg, c, SW), 0.0, (1.0, (db - da) / dd.y, (zt - SW) / dd.z))
        br = L["bronze"]
        for (a, b, za, zb) in ((da - 0.1, da, 0, 3.3), (db, db + 0.1, 0, 3.3), (da, db, zt, zt + 0.08), (da, db, 3.22, 3.3)):
            fm.box(-0.36, -0.22, a, b, za, zb, br)
        pl.quad([(xg, da, zt + 0.08), (xg, db, zt + 0.08), (xg, db, 3.22), (xg, da, 3.22)], L["shopglass"], (1, 0, 0))
        fm.cyl((-0.17, db - 0.15, 0.85), (-0.17, db - 0.15, 1.45), 0.014, L["brass"], seg=8)
        # trois marches de pierre (le rez-de-chaussée est surélevé) et une petite marquise
        for i in range(3):
            fm.box(-0.35 + i * 0.0, 0.6 - i * 0.28, da - 0.3, db + 0.3, 0.0, SW + 0.06 * (i + 1), L["stone"])
        wall.box(0.0, 1.2, da - 0.5, db + 0.5, 3.4, 3.6, L["trim"])
        for yy in (da - 0.2, db + 0.2):
            pl.cyl((0.75, yy, 3.39), (0.75, yy, 3.4), 0.06, L["down"], seg=10, smooth=False)
        self.light((0.7, c, 3.3), "AREA", (0.1, 0, -1), "#ffd9a8", 120.0, (0.9, 1.8), hide=True)

    # ---- les lavages du pied et la lumière des appliques
    def washes(self):
        if self.sp.get("gallery"):
            self.light((0.8, self.W * 0.3, 2.7), "POINT", (0, 0, -1), "#ffd29a", 60.0)
            self.light((0.8, self.W * 0.7, 2.7), "POINT", (0, 0, -1), "#ffd29a", 60.0)
            return
        shops = self.sp["gf"] == "shops"
        if shops and FB is not None:
            return                       # les lavages du larmier sont ceux de B (facade_b.upper)
        n = 3 if self.W > 20 else 2
        for i in range(n):
            y = self.ya + (i + 0.5) * (self.yb - self.ya) / n
            if shops:
                self.G["fine"].box(0.17, 0.31, y - 0.09, y + 0.09, self.gf_h, self.gf_h + 0.1, self.L["metal"])
                self.light((0.26, y, self.gf_h + 0.13), "SPOT", (-0.2, 0, 1), self.plan.get("wash", "#ffd9a8"), 520.0, spot=60)
            else:
                self.G["fine"].box(0.38, 0.52, y - 0.09, y + 0.09, SW, SW + 0.12, self.L["metal"])
                self.light((0.45, y, SW + 0.16), "SPOT", (-0.16, 0, 1), self.plan.get("wash", "#ffe2bf"), 420.0, spot=58)

    def build(self):
        safe("coque", self.shell)
        if self.sp["gf"] == "shops":
            safe("boutiques", self.shops)
        else:
            safe("logements", self.rooms)
        safe("lavages", self.washes)

    def done(self):
        objs = [g.done() for g in self.G.values()]
        d = self.Dc.done(f"mix_{self.key}_decals")
        return objs + ([d] if d is not None else [])


# ---------------------------------------------------------------- les étages : ceux de B, sinon un repli (le kit)

class UpperStub(KIT.Bld):
    """Repli tant que facade_b n'est pas là : les étages du kit, la coque commence au-dessus du rez-de-chaussée."""

    def shell(self):
        B, st, sp = self.B, self.st, self.sp
        D, W, ya, yb, g = self.D, self.W, self.ya, self.yb, self.gf_h
        shops = sp["gf"] == "shops"
        z0 = g if shops else 0.0
        rooms = S.mat_rooms(f"kit_{self.key}", ya, self.cw, self.zbase, g, False, ya, 1.0)
        B.add(-D, -RD, ya, yb, max(z0, g), self.main_top, st, front_mat=rooms)
        if self.sb_n:
            B.add(-D, -self.sb - RD, ya, yb, self.main_top, self.tops, st, front_mat=rooms)
            for y0, y1 in ((0.0, 0.3), (W - 0.3, W)):
                B.add(-D, -self.sb, y0, y1, self.main_top, self.tops + 0.9, st)
        if not sp["round_near"]:
            B.add(-D, 0, 0, 0.3, g, self.main_top + 0.9, st)
        if not sp["round_far"]:
            B.add(-D, 0, W - 0.3, W, g, self.main_top + 0.9, st)
        cur = S.mat_curtain(f"kit_{self.key}", ya, self.cw, self.zbase, g)
        bl = KIT.mat_blinds(f"kit_blinds_{self.key}", ya, self.cw, self.zbase, g)
        spans = [(0.0, g, self.main_top)]
        if self.sb_n:
            spans.append((-self.sb, self.main_top, self.tops))
        for xo, za, zb in spans:
            B.add(xo - 0.37, xo - 0.365, ya, yb, za, zb, bl)
            B.add(xo - 0.56, xo - 0.555, ya, yb, za, zb, cur)

    def build(self):
        sp = self.sp
        self.stage("coque", self.shell)
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
        self.stage("descentes d'eau", self.downpipes)


def upper(key, M, spec, gf_h):
    """Les étages : (objets créés à fondre, accessoires, lumières, matériaux à remplacer)."""
    if FB is not None and hasattr(FB, "upper"):
        try:
            res = FB.upper(S, key, M, spec, gf_h)
            ob, props, lights = res[0], list(res[1]), list(res[2])
            return props, lights, {}
        except Exception:
            log(f"{key} : facade_b.upper a échoué, repli sur le kit")
            traceback.print_exc()
    K = KIT.kit(M)
    b = UpperStub(key, M, spec, K)
    b.build()
    b.B.done()
    b.Dc.done(f"kit_{key}_decals")
    return b.props, b.lights, {K["win_ph"]: b.frame, K["rail_ph"]: b.railm}


def make_building(S_mod, key, M, spec):
    """Un immeuble dans son repère (façade x = 0 vers +x, y de 0 à W) : (objet, accessoires, lumières)."""
    global S, FB
    S = S_mod
    KIT.S = S
    C.S = S
    if not _FB_TRIED[0]:
        _FB_TRIED[0] = True
        try:
            import importlib
            FB = importlib.import_module("facade_b")
            log("étages : facade_b")
        except Exception as e:
            FB = None
            log("étages : facade_b absent, repli sur le kit —", e)
    t0 = time.time()
    L = lib(M)
    gf_h = spec.get("gf_h", 4.2)
    before = set(bpy.data.objects)
    up_props, up_lights, remap = upper(key, M, spec, gf_h)
    g = GF(key, M, spec, L, corners=FB is not None)
    g.build()
    first = g.done()
    src_col = KIT.sources_col()
    parts = [o for o in bpy.data.objects
             if o not in before and o.type == "MESH" and src_col not in o.users_collection and o not in first]
    objs = [o for o in first if o is not None] + parts
    ob = S.join(objs, f"bld_{key}")
    me = ob.data
    for i, m in enumerate(me.materials):
        if m in remap:
            me.materials[i] = remap[m]
    if "UVMap" in me.uv_layers:
        me.uv_layers["UVMap"].active_render = True
        me.uv_layers.active = me.uv_layers["UVMap"]
    spec["own_uplights"] = True
    props = up_props + g.props
    lights = up_lights + g.lights
    log(f"{key} : {len(objs)} pièces, {len(me.polygons)} faces, {len(props)} accessoires ({len(g.props)} du rez-de-chaussée), "
        f"{len(lights)} lumières ({len(g.lights)} du rez-de-chaussée), {time.time() - t0:.1f} s")
    return ob, props, lights
