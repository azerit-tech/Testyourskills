# Méthode A (« kit ») : les volumes et les matériaux simples de l'hôtel Art déco de la parcelle.
# Le code ne fait que la coque (stuc, trumeaux, sourcils, pylône, marquise, pièces derrière les
# vitres) ; le réalisme vient des pièces de bibliothèque posées dessus (A_parts.py).
#
# Repère : façade dans le plan x = X0 tournée vers +x (l'avenue), de y = 14 à y = 34.
import math
import random

import bmesh
import bpy

import bench

S = bench.S
lin = S.lin

X0 = bench.LOT["x"]          # -11.5 : le nu de la façade
Y0, Y1 = bench.LOT["y0"], bench.LOT["y1"]
GF = bench.LOT["gf_h"]       # 4.2
FH = S.FH                    # 3.2
NF = bench.LOT["floors"]     # 3
TOP = GF + NF * FH           # 13.8 : le haut de la dalle du dernier étage
DEPTH = bench.LOT["depth"]
SKIN = 0.32                  # épaisseur du mur de façade (profondeur des tableaux)
RD = 3.6                     # profondeur des chambres derrière la façade

# Les travées des étages : (y0, y1, saillie en x, couleur)
E1 = (14.0, 17.6)            # bloc d'extrémité côté caméra
E2 = (30.4, 34.0)
PYL = (23.35, 24.65)         # le pylône central
SILL, WH = 0.9, 1.55         # allège, hauteur de fenêtre

# Les fenêtres des étages : (y0, y1, saillie du nu, bloc)
WINDOWS = [(15.2, 16.4, 0.3, "end"), (18.2, 20.2, 0.0, "mid"), (20.8, 22.8, 0.0, "mid"),
           (25.2, 27.2, 0.0, "mid"), (27.8, 29.8, 0.0, "mid"), (31.6, 32.8, 0.3, "end")]

COL_MID = "#f4c7bd"          # rose saumon pâle
COL_END = "#f2e3c4"          # crème
COL_PYL = "#f5f0e8"          # blanc cassé


def mat_stucco_kit(name, hexcol):
    """Stuc peint : texture d'enduit réelle (beige_wall_001), grandes reprises de peinture d'une
    teinte voisine, pied de mur plus sombre et mouillé."""
    m, N, out = S.material(name)
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    vec = N.new("ShaderNodeCombineXYZ")
    N.link(N.math("ADD", xyz[0], xyz[1]), vec.inputs[0])
    N.link(xyz[2], vec.inputs[1])
    import os
    folder = os.path.join(S.ASSETS, "beige_wall_001")
    uvm = N.new("ShaderNodeMapping", Scale=(0.45, 0.45, 0.45))
    N.link(vec.outputs[0], uvm.inputs[0])
    diff = S.image(N, os.path.join(folder, "diff_1k.jpg"), uvm.outputs[0])
    nor = S.image(N, os.path.join(folder, "nor_gl_1k.jpg"), uvm.outputs[0], color=False)
    rough = S.image(N, os.path.join(folder, "rough_1k.jpg"), uvm.outputs[0], color=False)
    nmap = N.new("ShaderNodeNormalMap", Strength=0.7)
    N.link(nor.outputs["Color"], nmap.inputs["Color"])
    bw = N.new("ShaderNodeRGBToBW")
    N.link(diff.outputs["Color"], bw.inputs[0])
    base = lin(hexcol)
    col = N.mix(1.0, base, N.math("ADD", 0.25, N.math("MULTIPLY", bw.outputs[0], 1.1)), "MULTIPLY")
    # reprises de peinture : de grandes plaques, un peu plus chaudes ou plus grises
    pn = N.new("ShaderNodeTexNoise", Scale=0.18, Detail=2.0, Roughness=0.4)
    N.link(vec.outputs[0], pn.inputs["Vector"])
    patch = N.ramp(pn.outputs["Factor"], [(0.45, (0, 0, 0)), (0.47, (1, 1, 1))])
    alt = N.mix(1.0, col, (0.93, 0.9, 0.9, 1), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", patch, 0.8), col, alt)
    # salissures en traînées verticales, très douces
    streak = N.new("ShaderNodeTexNoise", Scale=1.4, Detail=5.0)
    sm = N.new("ShaderNodeMapping", Scale=(4.0, 0.15, 1.0))
    N.link(vec.outputs[0], sm.inputs[0])
    N.link(sm.outputs[0], streak.inputs["Vector"])
    dirt = N.math("MULTIPLY", N.ramp(streak.outputs["Factor"], [(0.5, (0, 0, 0)), (0.75, (1, 1, 1))]), 0.35)
    col = N.mix(dirt, col, N.mix(1.0, col, (0.6, 0.58, 0.62, 1), "MULTIPLY"))
    # soubassement : le pied du mur a bu la pluie, lisière irrégulière
    edge = N.new("ShaderNodeTexNoise", Scale=2.5, Detail=3.0)
    N.link(vec.outputs[0], edge.inputs["Vector"])
    lim = N.math("ADD", 0.35, N.math("MULTIPLY", edge.outputs["Factor"], 0.55))
    wet = N.math("SUBTRACT", 1.0, N.math("DIVIDE", N.math("SUBTRACT", xyz[2], lim), 0.2), clamp=True)
    col = N.mix(N.math("MULTIPLY", wet, 0.85), col, N.mix(1.0, col, (0.45, 0.42, 0.46, 1), "MULTIPLY"))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    r = N.math("ADD", 0.45, N.math("MULTIPLY", rough.outputs["Color"], 0.45))
    N.link(N.mixf(wet, r, 0.25), p.inputs["Roughness"])
    N.link(nmap.outputs[0], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_streak():
    """Coulure sous un appui : du sombre qui s'effiloche vers le bas, transparent ailleurs (UV 0..1)."""
    m, N, out = S.material("A_streak")
    uv = N.sep(N.new("ShaderNodeTexCoord").outputs["UV"])
    u, v = uv[0], uv[1]
    n = N.new("ShaderNodeTexNoise", Scale=1.0, Detail=6.0, Roughness=0.6)
    vm = N.new("ShaderNodeCombineXYZ")
    N.link(N.math("MULTIPLY", u, 9.0), vm.inputs[0])
    N.link(N.math("MULTIPLY", v, 0.6), vm.inputs[1])
    info = N.new("ShaderNodeObjectInfo")
    N.link(N.math("MULTIPLY", info.outputs["Random"], 50.0), vm.inputs[2])
    N.link(vm.outputs[0], n.inputs["Vector"])
    # v = 1 en haut (sous l'appui), 0 en bas
    fade = N.math("POWER", v, 1.6)
    side = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, N.math("POWER", N.math("ABSOLUTE", N.math("SUBTRACT", N.math("MULTIPLY", u, 2.0), 1.0)), 3.0)), 1.0)
    a = N.math("MULTIPLY", N.math("MULTIPLY", fade, side), N.ramp(n.outputs["Factor"], [(0.35, (0, 0, 0)), (0.7, (1, 1, 1))]))
    a = N.math("MULTIPLY", a, 0.8)
    d = S.principled(N, **{"Base Color": (0.06, 0.05, 0.055, 1), "Roughness": 0.6})
    t = N.new("ShaderNodeBsdfTransparent")
    mx = N.new("ShaderNodeMixShader")
    N.link(a, mx.inputs[0])
    N.link(t.outputs[0], mx.inputs[1])
    N.link(d.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_blind():
    """Store vénitien : lames claires, un peu translucides (la lampe de la chambre passe)."""
    m, N, out = S.material("A_blind")
    z = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])[2]
    w = N.new("ShaderNodeTexWave", _wave_type="BANDS", _bands_direction="Z", Scale=1.0, Distortion=0.0)
    zz = N.new("ShaderNodeCombineXYZ")
    N.link(N.math("MULTIPLY", z, 18.0), zz.inputs[2])
    N.link(zz.outputs[0], w.inputs["Vector"])
    gap = N.math("GREATER_THAN", w.outputs["Fac"], 0.9)
    tl = N.new("ShaderNodeBsdfTranslucent", Color=lin("#f3e7cf"))
    df = N.new("ShaderNodeBsdfDiffuse", Color=lin("#e8dcc4"))
    cloth = N.new("ShaderNodeMixShader")
    N.set(cloth.inputs[0], 0.5)
    N.link(tl.outputs[0], cloth.inputs[1])
    N.link(df.outputs[0], cloth.inputs[2])
    t = N.new("ShaderNodeBsdfTransparent")
    mx = N.new("ShaderNodeMixShader")
    N.link(gap, mx.inputs[0])
    N.link(cloth.outputs[0], mx.inputs[1])
    N.link(t.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_neon(name, hexcol, strength=18.0):
    """Tube néon : émission dans la couleur, un cœur un peu plus clair."""
    return S.mat_emit(name, lin(hexcol), strength)


def mats():
    M = {
        "mid": mat_stucco_kit("A_stucco_mid", COL_MID),
        "end": mat_stucco_kit("A_stucco_end", COL_END),
        "pyl": mat_stucco_kit("A_stucco_pyl", COL_PYL),
        "trim": mat_stucco_kit("A_trim", "#f6f2ea"),
        "inside": S.mat_plain("A_room_inside", lin("#6a5a50"), 0.85),
        "ceiling": S.mat_plain("A_ceiling", lin("#d8cdbd"), 0.8),
        "glass": S.mat_window_glass(),
        "roof": S.mat_roof(),
        "metal": S.mat_plain("A_metal", (0.035, 0.035, 0.04, 1), 0.4, 0.8),
        "riser": S.mat_plain("A_riser", lin("#2b2a30"), 0.35, 0.3),
        "terrazzo": S.mat_plain("A_terrazzo", lin("#b9b0a6"), 0.25),
        "frame": S.mat_plain("A_frame_alu", lin("#c9c6c0"), 0.3, 0.9),
        "streak": mat_streak(),
        "blind": mat_blind(),
        "lilac": mat_neon("A_neon_lilac", S.LILAC, 7.0),
        "coral": mat_neon("A_neon_coral", S.CORAL, 8.0),
        "amber": mat_neon("A_neon_amber", S.AMBER, 14.0),
        "cream": mat_neon("A_neon_cream", "#fff1d6", 16.0),
        "glow": S.mat_emit("A_canopy_glow", lin("#ffe2b0"), 30.0),
    }
    return M


def bevel(ob, w=0.025):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = w
    mod.segments = 2
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40)
    mod.harden_normals = False
    return ob


def quad(name, pts, mat, uv=True):
    """Un quadrilatère (quatre coins dans l'ordre), UV 0..1 : bas-gauche, bas-droit, haut-droit, haut-gauche."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    if uv:
        lay = bm.loops.layers.uv.new("UVMap")
        for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[lay].uv = c
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def build(M):
    """La coque. Rend la liste des ouvertures à garnir : [(kind, y0, y1, z0, z1, xface)]."""
    random.seed(11)
    openings = []
    B = {k: S.Boxes(f"A_{k}") for k in ("mid", "end", "pyl", "trim", "inside", "misc")}
    xb = X0 - DEPTH
    # le corps derrière les chambres (sa face avant est le fond des chambres, rendu par A_rooms)
    B["mid"].add(xb, X0 - 6.15, Y0, Y1, 0, GF, M["mid"])
    B["mid"].add(xb, X0 - RD - 0.02, Y0, Y1, GF, TOP + 0.9, M["mid"])

    # ---- étages
    for f in range(NF):
        zf = GF + f * FH
        z_s, z_t = zf + SILL, zf + SILL + WH
        # dalle et plafond des chambres, cloisons aux trumeaux
        B["inside"].add(X0 - RD, X0 - SKIN, Y0, Y1, zf, zf + 0.05, M["inside"])
        B["inside"].add(X0 - RD, X0 - SKIN, Y0, Y1, zf + FH - 0.12, zf + FH, M["ceiling"])
        # le mur de façade, bloc par bloc, percé de ses fenêtres
        for (ya, yb, key, proj) in ((E1[0], E1[1], "end", 0.3), (E1[1], PYL[0], "mid", 0.0),
                                    (PYL[1], E2[0], "mid", 0.0), (E2[0], E2[1], "end", 0.3)):
            xf = X0 + proj
            wins = [w for w in WINDOWS if ya <= w[0] and w[1] <= yb]
            edges = [ya] + [v for w in wins for v in (w[0], w[1])] + [yb]
            # trumeaux pleine hauteur
            for k in range(0, len(edges), 2):
                if edges[k + 1] - edges[k] > 1e-3:
                    B[key].add(xf - SKIN - proj, xf, edges[k], edges[k + 1], zf, zf + FH, M[key])
            for (wa, wb, _, _) in wins:
                B[key].add(xf - SKIN - proj, xf, wa, wb, zf, z_s, M[key])          # allège
                B[key].add(xf - SKIN - proj, xf, wa, wb, z_t, zf + FH, M[key])     # linteau
                # appui saillant
                B["trim"].add(xf - 0.05, xf + 0.07, wa - 0.08, wb + 0.08, z_s - 0.07, z_s, M["trim"])
                openings.append(("win", wa, wb, z_s, z_t, xf, f, key))
                # cloisons de la chambre de part et d'autre
                for yy in (wa - 0.05, wb + 0.05):
                    B["inside"].add(X0 - RD, xf - SKIN, yy - 0.04, yy + 0.04, zf, zf + FH, M["inside"])
        # sourcils Art déco filants sur la partie centrale, au-dessus des fenêtres
        for (ya, yb) in ((E1[1], PYL[0]), (PYL[1], E2[0])):
            B["trim"].add(X0, X0 + 0.5, ya, yb, z_t + 0.1, z_t + 0.2, M["trim"])
        # sur les blocs d'extrémité, un sourcil court par fenêtre
        for (wa, wb, proj, kind) in WINDOWS:
            if kind == "end":
                B["trim"].add(X0 + proj, X0 + proj + 0.4, wa - 0.35, wb + 0.35, z_t + 0.1, z_t + 0.18, M["trim"])

    # ---- les blocs d'extrémité : filets verticaux cannelés sur leurs arêtes extérieures
    for (ya, yb) in (E1, E2):
        for yy in (ya + 0.25, yb - 0.25):
            for d in (-0.12, 0.12):
                B["trim"].add(X0 + 0.3, X0 + 0.36, yy + d - 0.03, yy + d + 0.03, GF + 0.2, TOP + 0.6, M["trim"])

    # ---- le pylône : saillie, cannelures, il monte au-dessus du toit en gradins
    pa, pb = PYL
    B["pyl"].add(X0 - SKIN, X0 + 0.6, pa, pb, GF, TOP + 3.6, M["pyl"])
    B["pyl"].add(X0 - SKIN, X0 + 0.45, pa + 0.15, pb - 0.15, TOP + 3.6, TOP + 4.8, M["pyl"])
    B["pyl"].add(X0 - SKIN, X0 + 0.3, pa + 0.32, pb - 0.32, TOP + 4.8, TOP + 5.6, M["pyl"])
    for d in (-0.22, 0.0, 0.22):
        yc = (pa + pb) / 2 + d
        B["trim"].add(X0 + 0.6, X0 + 0.66, yc - 0.04, yc + 0.04, GF + 0.5, TOP + 3.3, M["trim"])

    # ---- acrotère : gradins sur les blocs d'extrémité, corniche filante au centre
    B["mid"].add(X0 - SKIN, X0, E1[1], E2[0], TOP, TOP + 0.9, M["mid"])
    B["trim"].add(X0, X0 + 0.25, E1[1], PYL[0], TOP + 0.75, TOP + 0.9, M["trim"])
    B["trim"].add(X0, X0 + 0.25, PYL[1], E2[0], TOP + 0.75, TOP + 0.9, M["trim"])
    for (ya, yb) in (E1, E2):
        B["end"].add(X0 - SKIN, X0 + 0.3, ya, yb, TOP, TOP + 1.3, M["end"])
        B["end"].add(X0 - SKIN, X0 + 0.22, ya + 0.6, yb - 0.6, TOP + 1.3, TOP + 2.0, M["end"])
        B["end"].add(X0 - SKIN, X0 + 0.14, ya + 1.2, yb - 1.2, TOP + 2.0, TOP + 2.5, M["end"])
        B["trim"].add(X0 + 0.3, X0 + 0.42, ya, yb, TOP + 1.15, TOP + 1.3, M["trim"])
    # le toit (dalle) et l'acrotère arrière
    B["misc"].add(xb, X0 - SKIN, Y0, Y1, TOP + 0.0, TOP + 0.15, M["roof"])
    for (ya, yb) in ((Y0, Y0 + 0.3), (Y1 - 0.3, Y1)):
        B["mid"].add(xb, X0 - SKIN, ya, yb, TOP, TOP + 0.9, M["mid"])
    B["mid"].add(xb, xb + 0.3, Y0, Y1, TOP, TOP + 0.9, M["mid"])
    # un bandeau entre le rez-de-chaussée et le premier étage
    B["trim"].add(X0, X0 + 0.32, Y0, Y1, GF - 0.25, GF, M["trim"])

    # ---- rez-de-chaussée : piles, bandeau d'enseigne, ouvertures de vitrines
    gf_bays = [("service", 16.0, 17.2), ("shopL", E1[1] + 0.35, 21.6),
               ("lobby", 22.0, 26.0), ("shopR", 26.4, E2[0] - 0.35), ("bar", E2[0] + 0.45, E2[1] - 0.45)]
    edges = [Y0] + [v for b in gf_bays for v in (b[1], b[2])] + [Y1]
    cuts = (E1[1], E2[0])
    for k in range(0, len(edges), 2):
        a, b = edges[k], edges[k + 1]
        pts = [a] + [c for c in cuts if a < c < b] + [b]
        for p0, p1 in zip(pts, pts[1:]):
            m = (p0 + p1) / 2
            key = "end" if (m < E1[1] or m > E2[0]) else "mid"
            B[key].add(X0 - SKIN, X0 + (0.3 if key == "end" else 0.0), p0, p1, 0, GF - 0.25, M[key])
    for (kind, ya, yb) in gf_bays:
        key = "end" if kind in ("service", "bar") else "mid"
        proj = 0.3 if key == "end" else 0.0
        top = {"lobby": 3.4, "service": 2.6}.get(kind, 3.0)
        B[key].add(X0 - SKIN, X0 + proj, ya, yb, top, GF - 0.25, M[key])
        openings.append((kind, ya, yb, 0.0, top, X0 + proj, -1, key))
    # le sol et le plafond du rez-de-chaussée, cloisons
    B["inside"].add(X0 - 6.0, X0 - SKIN, Y0, Y1, 0.0, 0.15, M["terrazzo"])
    B["inside"].add(X0 - 6.0, X0 - SKIN, Y0, Y1, GF - 0.3, GF, M["ceiling"])
    for yy in (E1[1], 21.8, 26.2, E2[0] - 0.2):
        B["inside"].add(X0 - 6.0, X0 - SKIN, yy - 0.1, yy + 0.1, 0, GF, M["inside"])
    B["inside"].add(X0 - 6.1, X0 - 6.0, Y0, Y1, 0, GF, M["inside"])

    obs = {}
    for k, b in B.items():
        ob = b.done()
        if k in ("mid", "end", "pyl", "trim"):
            bevel(ob, 0.02)
        obs[k] = ob
    return obs, openings


def canopy(M):
    """La marquise de l'entrée, à gradins, avec sa sous-face lumineuse."""
    B = S.Boxes("A_canopy")
    ya, yb = 21.6, 26.4
    B.add(X0, X0 + 2.7, ya, yb, 3.35, 3.6, M["trim"])
    B.add(X0, X0 + 2.45, ya + 0.15, yb - 0.15, 3.6, 3.72, M["trim"])
    B.add(X0 + 2.6, X0 + 2.72, ya, yb, 3.2, 3.6, M["trim"])
    ob = bevel(B.done(), 0.015)
    # trois bandes lumineuses sous la marquise
    for k in range(3):
        yk = ya + (yb - ya) * (k + 0.5) / 3
        S.box(f"A_canopy_glow_{k}", X0 + 0.5, X0 + 2.3, yk - 0.05, yk + 0.05, 3.33, 3.35, M["glow"])
    S.add_light("A_canopy_down", "AREA", (X0 + 1.4, 24.0, 3.3), (0.15, 0, -1), lin("#ffe2bf"), 320.0, (2.2, 3.6))
    return ob


def rooms_back(M):
    """Le fond des chambres : une lampe par chambre, chaleurs différentes, certaines éteintes ;
    des rideaux tirés d'un côté ou des deux (les matériaux de scene_a)."""
    for i, (wa, wb, proj, kind) in enumerate(WINDOWS):
        ya, yb = wa - 0.05, wb + 0.05
        rooms = S.mat_rooms(f"A{i}", ya, yb - ya, GF, GF, False, ya, 1.0)
        S.box(f"A_rooms_back_{i}", X0 - RD - 0.02, X0 - RD, ya - 0.05, yb + 0.05, GF, TOP, rooms)
        cur = S.mat_curtain(f"A{i}", ya, yb - ya, GF, GF)
        S.box(f"A_curtains_{i}", X0 - SKIN - 0.2, X0 - SKIN - 0.19, ya, yb, GF + 0.2, TOP, cur)
