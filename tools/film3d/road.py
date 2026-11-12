# La rue du film, refaite en vraie rue mouillée (méthode D du banc de réalisme, tools/film3d/lab/D_road.py).
#
# scene_a.build_city l'appelle quand FILM3D_ROUTE vaut « pluie » ou « sechage » :
#   road.build_street(scene_a, M, style)
# et elle remplace tout ce que construit scene_a.base_street, sur les mêmes emprises :
# la chaussée de l'avenue (−30..900, |x| < ROAD_HALF), les trottoirs, le sol des îlots, les rues
# transversales (passages piétons, lignes d'arrêt), les bordures, les caniveaux, les avaloirs et
# les plaques d'égout.
#
# Deux temps de la même rue :
#   « sechage » : la rue qui sèche. Bitume humide et mat, grain et usure lisibles, quelques petites
#                 flaques dans les ornières et le long de la bordure.
#   « pluie »   : juste après l'averse. Bitume sombre, larges flaques, une pellicule d'eau continue
#                 dans la moitié basse de chaque voie (vers le caniveau), reflets nets des phares,
#                 des néons et du ciel ; le grain de l'enrobé reste visible entre les flaques.
#
# Ce qui la fait tenir sur 930 m sans répétition : coordonnées d'objet (aucun UV), le scan d'enrobé
# lu deux fois (tourné, à une autre échelle) et fondu par un grand bruit, une photo aérienne de 30 m
# pour les variations d'ensemble, du bruit procédural pour l'eau, les rapiéçages et les fissures.
# L'eau est une couche de vernis (indice 1,33) posée sur l'enrobé, réglée par un champ de « creux ».
import math
import os
import random

import bmesh
import bpy

S = None                  # le module scene_a, passé par build_street

PAN = 0.5                 # la cunette en béton, comprise dans la chaussée
CROWN = 0.03              # le bord de l'enrobé est 3 cm sous l'axe
PAN_DROP = 0.015          # la cunette descend encore vers la bordure
KERB = 0.2
WALK_Z = 0.15
LANES = (1.83, 5.0)       # milieux des voies (|x|)
EDGE_X = 6.2              # ligne de rive (|x|), juste avant la cunette
SLAB = (1.4333, 1.5)      # dalles de trottoir : trois sur la largeur, 1,5 m de long

# Le plan des voies d'une chaussée droite (|x| depuis l'axe), lu par mat_asphalt : milieux des voies (ornières,
# bande d'huile), tirets entre voies de même sens, ligne de rive, joint longitudinal, double axe (None : absent).
# AVENUE est celui de l'avenue, par défaut ; lane_layout() en écrit un pour une autre largeur, un autre nombre de voies.
# Clé facultative grime (0 à 1) : la peinture salie, effacée par plaques, noyée sous les flaques.
AVENUE = dict(lanes=LANES, dashes=(3.5,), edge=EDGE_X, joint=3.74, centre=0.15, film_split=3.5)


def lane_layout(half_width, n_lanes=2, centre=True, edge=False):
    """Le plan des voies d'une chaussée droite de demi-largeur `half_width` (bordure à bordure) à `n_lanes` voies en
    tout, la moitié dans chaque sens : voies égales sur l'enrobé (cunette de PAN exclue), tirets entre voies de même
    sens, joint le long du premier tiret (ou au milieu de la voie extérieure s'il n'y en a pas). Exemple, une rue de
    8 m à deux voies : lane_layout(4.0, 2). Se passe à mat_asphalt(..., layout=...)."""
    a = half_width - PAN
    k = max(1, n_lanes // 2)
    w = a / k
    dashes = tuple(w * i for i in range(1, k))
    return dict(lanes=tuple(w * (i + 0.5) for i in range(k)), dashes=dashes, edge=(a - 0.3) if edge else None,
                joint=(dashes[0] + 0.24) if dashes else None, centre=0.15 if centre else None,
                film_split=dashes[0] if dashes else a / 2)

STYLES = {
    # la rue qui sèche : le réglage gagnant du banc, flaques adoucies
    "sechage": dict(dark=0.75, wet=(0.44, 0.27), D_off=0.0, rut=2.0, film=0.0, edge=0.9, puddle=(0.45, 1.0),
                    cr=(0.2, 0.34), track=0.06, stream=(0.07, 0.14), walk_D=0.0, walk_cr=0.28, film_grain=0.0),
    # juste après l'averse : beaucoup plus d'eau, une pellicule continue au bas de chaque voie
    "pluie": dict(dark=0.62, wet=(0.34, 0.2), D_off=0.6, rut=3.0, film=2.4, edge=1.8, puddle=(0.3, 0.85),
                  cr=(0.10, 0.18), track=0.04, stream=(0.16, 0.24), walk_D=0.9, walk_cr=0.16, film_grain=0.3),
}


def half():
    return S.ROAD_HALF


def asph():
    return S.ROAD_HALF - PAN


def road_z(x):
    """Le profil en travers : bombé au milieu, puis la cunette qui plonge vers la bordure."""
    ax, a = abs(x), asph()
    if ax <= a:
        return -CROWN * (ax / a) ** 2
    return -CROWN - PAN_DROP * min(1.0, (ax - a) / PAN)


# ---------------------------------------------------------------- petits outils de nœuds

def coords(N, uv=False):
    """Coordonnées d'objet (alignées sur la rue, même tournée de 90°) + la position de l'objet. uv : les
    coordonnées viennent de la carte UV, en mètres (u en travers de la chaussée, v le long) : une chaussée courbe,
    l'anneau d'un rond-point, garde ainsi ses voies, ses tirets et ses traces de roues."""
    tc = N.new("ShaderNodeTexCoord")
    oi = N.new("ShaderNodeObjectInfo")
    v = N.new("ShaderNodeVectorMath", _operation="ADD")
    N.link(tc.outputs["UV" if uv else "Object"], v.inputs[0])
    N.link(oi.outputs["Location"], v.inputs[1])
    return v.outputs[0], tc.outputs["UV" if uv else "Object"]


def smooth(N, v, a, b):
    m = N.new("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP")
    N.set(m.inputs["Value"], v)
    N.set(m.inputs["From Min"], a)
    N.set(m.inputs["From Max"], b)
    return m.outputs["Result"]


def inv(N, v):
    return N.math("SUBTRACT", 1.0, v)


def mapping(N, vec, scale=(1, 1, 1), rot=(0, 0, 0), loc=(0, 0, 0)):
    m = N.new("ShaderNodeMapping", Location=loc, Rotation=rot, Scale=scale)
    N.set(m.inputs["Vector"], vec)
    return m.outputs[0]


def noise(N, vec, scale, detail=2.0, rough=0.5, stretch=None, dist=0.0):
    if stretch:
        vec = mapping(N, vec, scale=stretch)
    n = N.new("ShaderNodeTexNoise", Scale=scale, Detail=detail, Roughness=rough, Distortion=dist)
    N.set(n.inputs["Vector"], vec)
    return n.outputs["Factor"]


def vmix(N, fac, a, b):
    m = N.new("ShaderNodeMix", _data_type="VECTOR")
    N.set(m.inputs[0], fac)
    N.set(m.inputs[4], a)
    N.set(m.inputs[5], b)
    return m.outputs[1]


def combine(N, x, y, z=0.0):
    c = N.new("ShaderNodeCombineXYZ")
    N.set(c.inputs[0], x)
    N.set(c.inputs[1], y)
    N.set(c.inputs[2], z)
    return c.outputs[0]


def grey(N, v):
    return combine(N, v, v, v)


def hash3(N, a, b, seed):
    w = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="3D")
    N.set(w.inputs["Vector"], combine(N, a, b, seed))
    rgb = N.new("ShaderNodeSeparateColor")
    N.link(w.outputs["Color"], rgb.inputs[0])
    return rgb.outputs[0], rgb.outputs[1], rgb.outputs[2], w.outputs["Value"]


def tex(N, path, vec, color=True, box=False):
    t = S.image(N, path, vec, color)
    if box:
        t.projection = "BOX"
        t.projection_blend = 0.25
    return t.outputs["Color"]


def decode_normal(N, col, rot=0.0):
    """Carte de normales OpenGL lue à plat dans le repère de l'objet (surface horizontale : pas d'UV)."""
    v = N.new("ShaderNodeVectorMath", _operation="MULTIPLY_ADD")
    N.set(v.inputs[0], col)
    v.inputs[1].default_value = (2.0, 2.0, 2.0)
    v.inputs[2].default_value = (-1.0, -1.0, -1.0)
    out = v.outputs[0]
    if rot:
        r = N.new("ShaderNodeVectorRotate", _rotation_type="Z_AXIS")
        N.link(out, r.inputs["Vector"])
        r.inputs["Angle"].default_value = rot
        out = r.outputs[0]
    return out


def finish_normal(N, n, strength):
    s = N.new("ShaderNodeVectorMath", _operation="MULTIPLY")
    N.set(s.inputs[0], n)
    s.inputs[1].default_value = (strength, strength, 1.0)
    nn = N.new("ShaderNodeVectorMath", _operation="NORMALIZE")
    N.link(s.outputs[0], nn.inputs[0])
    t = N.new("ShaderNodeVectorTransform", _vector_type="NORMAL", _convert_from="OBJECT", _convert_to="WORLD")
    N.link(nn.outputs[0], t.inputs[0])
    return t.outputs[0]


def bump(N, height, normal, strength, distance):
    b = N.new("ShaderNodeBump", Strength=strength, Distance=distance)
    N.set(b.inputs["Height"], height)
    if normal is not None:
        N.set(b.inputs["Normal"], normal)
    return b.outputs["Normal"]


def scan2(N, P, folder, size, rot=0.63, res="2k", maps=("diff", "rough", "nor_gl", "disp")):
    """Le même scan lu deux fois (l'une tournée, à une autre échelle), fondu par un grand bruit."""
    uva = mapping(N, P, scale=(1 / size,) * 3)
    uvb = mapping(N, P, scale=(1 / (size * 0.77),) * 3, rot=(0, 0, rot), loc=(0.37, 0.71, 0))
    f = smooth(N, noise(N, P, 0.18, 3.0), 0.44, 0.56)
    out = {}
    for m in maps:
        path = os.path.join(S.ASSETS, folder, f"{m}_{res}." + ("png" if m == "disp" else "jpg"))
        a = tex(N, path, uva, color=(m == "diff"))
        b = tex(N, path, uvb, color=(m == "diff"))
        if m == "nor_gl":
            out[m] = vmix(N, f, decode_normal(N, a), decode_normal(N, b, -rot))
        elif m == "diff":
            out[m] = N.mix(f, a, b)
        else:
            out[m] = N.mixf(f, a, b)
    return out


def wet_shader(N, out, col, base_rough, base_n, coat_r, coat_n, alpha=None):
    """L'eau : une couche de vernis d'indice 1,33 sur la matière."""
    p = S.principled(N)
    N.set(p.inputs["Base Color"], col)
    N.set(p.inputs["Roughness"], base_rough)
    N.set(p.inputs["Normal"], base_n)
    p.inputs["Coat Weight"].default_value = 1.0
    p.inputs["Coat IOR"].default_value = 1.33
    N.set(p.inputs["Coat Roughness"], coat_r)
    N.set(p.inputs["Coat Normal"], coat_n)
    if alpha is not None:
        N.set(p.inputs["Alpha"], alpha)
    N.link(p.outputs[0], out.inputs[0])
    return p


def ripples(N, P, scale=38.0, strength=0.06):
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    return bump(N, noise(N, P, scale, 3.0), geo, strength, 0.004)


# ---------------------------------------------------------------- la chaussée

def in_rect(N, x, y, x0, x1, y0, y1, m):
    a = N.math("GREATER_THAN", x, N.math("SUBTRACT", x0, m))
    b = N.math("LESS_THAN", x, N.math("ADD", x1, m))
    c = N.math("GREATER_THAN", y, N.math("SUBTRACT", y0, m))
    d = N.math("LESS_THAN", y, N.math("ADD", y1, m))
    return N.math("MULTIPLY", N.math("MULTIPLY", a, b), N.math("MULTIPLY", c, d))


def paint_wear(N, P, d2, track, ax):
    """Ce qui reste de la peinture : usée par plaques, plus au passage des roues, granulats à nu."""
    wn = noise(N, P, 3.2, 6.0, 0.65)
    thr = N.math("ADD", N.math("ADD", 0.28, N.math("MULTIPLY", track, 0.14)), N.math("MULTIPLY", smooth(N, noise(N, P, 0.06, 1.0), 0.35, 0.65), 0.1))
    keep = smooth(N, N.math("SUBTRACT", wn, thr), 0.0, 0.05)
    return N.math("MULTIPLY", keep, smooth(N, d2, 0.46, 0.56))


def paint_colour(N, P):
    dirt = N.mixf(smooth(N, noise(N, P, 1.3, 4.0), 0.35, 0.7), 0.76, 1.0)
    return N.mix(1.0, (0.50, 0.49, 0.45, 1), grey(N, dirt), "MULTIPLY")


def mat_asphalt(st, name, force_patch=False, layout=None, uv=False):
    """L'enrobé mouillé. force_patch : le carré refait autour d'une plaque, lu dans le monde. layout : le plan des
    voies (AVENUE par défaut, sinon lane_layout()). uv : coordonnées de la carte UV en mètres (voir coords)."""
    lay = dict(AVENUE, **(layout or {}))
    m, N, out = S.material(name)
    P, O = coords(N, uv)
    ox, oy, _ = N.sep(O)
    lx, ly, _ = N.sep(P) if force_patch else (ox, oy, None)
    ax = N.math("ABSOLUTE", lx)
    sc = scan2(N, P, "asphalt_02", 3.0)
    d2 = sc["disp"]
    aer = tex(N, os.path.join(S.ASSETS, "aerial_asphalt_01", "diff_2k.jpg"), mapping(N, P, scale=(1 / 30.0,) * 3))
    aer_bw = N.new("ShaderNodeRGBToBW")
    N.link(aer, aer_bw.inputs[0])
    macro = N.math("DIVIDE", aer_bw.outputs[0], 0.125)
    region = noise(N, P, 0.03, 2.0)
    # --- les voies : traces de roues (lustrées, en ornière), bande d'huile au milieu
    dls = [N.math("ABSOLUTE", N.math("SUBTRACT", ax, c)) for c in lay["lanes"]]
    dw, dc = None, None
    for dl in dls:
        t = N.math("ABSOLUTE", N.math("SUBTRACT", dl, 0.8))
        dw = t if dw is None else N.math("MINIMUM", dw, t)
        dc = dl if dc is None else N.math("MINIMUM", dc, dl)
    rutvar = smooth(N, noise(N, P, 0.6, 2.0, stretch=(1.0, 0.12, 1.0)), 0.38, 0.62)
    rut = N.math("MULTIPLY", inv(N, smooth(N, dw, 0.06, 0.45)), rutvar)
    track = inv(N, smooth(N, dw, 0.1, 0.32))
    oil = N.math("MULTIPLY", inv(N, smooth(N, dc, 0.12, 0.42)), smooth(N, noise(N, P, 1.1, 3.0, stretch=(1.0, 0.3, 1.0)), 0.47, 0.66))
    # la moitié basse de chaque voie (côté caniveau) : 0 en haut de la voie, 1 en bas
    fs = lay["film_split"]
    lane_lo = N.math("GREATER_THAN", ax, fs)
    lp = N.mixf(lane_lo, N.math("DIVIDE", N.math("SUBTRACT", ax, 0.2), fs - 0.2),
                N.math("DIVIDE", N.math("SUBTRACT", ax, fs), max(0.5, asph() - fs)))
    lowhalf = smooth(N, N.math("ADD", lp, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 0.5, 3.0, stretch=(1.0, 0.25, 1.0)), 0.5), 0.6)), 0.42, 0.62)
    # --- rapiéçages : une case de 14 m sur deux porte un rectangle d'enrobé refait
    if force_patch:
        e = N.math("MAXIMUM", N.math("ABSOLUTE", ox), N.math("ABSOLUTE", oy))
        patch = 1.0
        seal_p = N.math("MULTIPLY", smooth(N, e, 0.63, 0.655), inv(N, smooth(N, e, 0.685, 0.7)))
    else:
        cid = N.math("FLOOR", N.math("DIVIDE", N.math("ADD", ly, 5.0), 14.0))
        r1, g1, b1, _ = hash3(N, cid, 0.17, 1.3)
        r2, g2, _, _ = hash3(N, cid, 0.71, 2.9)
        exists = N.math("LESS_THAN", r1, 0.5)
        px0 = N.math("ADD", N.math("MULTIPLY", g1, 9.0), -6.2)
        px1 = N.math("MINIMUM", N.math("ADD", px0, N.math("ADD", N.math("MULTIPLY", b1, 2.8), 1.0)), 6.4)
        py0 = N.math("ADD", N.math("MULTIPLY", cid, 14.0), N.math("ADD", N.math("MULTIPLY", r2, 6.0), -4.0))
        py1 = N.math("ADD", py0, N.math("ADD", N.math("MULTIPLY", g2, 4.5), 1.2))
        wob = N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 2.0, 2.0), 0.5), 0.04)
        xx, yy = N.math("ADD", lx, wob), N.math("ADD", ly, wob)
        patch = N.math("MULTIPLY", in_rect(N, xx, yy, px0, px1, py0, py1, 0.0), exists)
        ring = N.math("SUBTRACT", in_rect(N, xx, yy, px0, px1, py0, py1, 0.03), in_rect(N, xx, yy, px0, px1, py0, py1, -0.015))
        seal_p = N.math("MULTIPLY", ring, exists)
    # --- fissures pontées au bitume et joint longitudinal le long des tirets
    n1 = noise(N, P, 0.22, 2.0, 0.5, stretch=(1.0, 0.45, 1.0), dist=0.35)
    snake = N.math("MULTIPLY", inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", n1, 0.5)), 0.004, 0.011)),
                   smooth(N, noise(N, P, 0.045, 2.0), 0.53, 0.6))
    jw = N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 1.0, 2.0, stretch=(0.0, 0.35, 0.0)), 0.5), 0.12)
    if lay["joint"] is not None:
        joint = N.math("MULTIPLY", inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", ax, N.math("ADD", lay["joint"], jw))), 0.01, 0.02)),
                       smooth(N, noise(N, P, 0.5, 2.0, stretch=(0.2, 1.0, 0.2)), 0.36, 0.44))
        seal = N.math("MAXIMUM", N.math("MAXIMUM", snake, joint), seal_p)
    else:
        seal = N.math("MAXIMUM", snake, seal_p)
    seal = N.math("MAXIMUM", seal, smooth(N, ax, asph() - 0.03, asph() - 0.005))
    # --- marquages : double axe de 15 cm (écart 15 cm), tirets, rives ; ébréchés et usés
    xw = N.math("ADD", ax, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 7.0, 3.0), 0.5), 0.018))
    yj = N.math("ADD", ly, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 5.0, 2.0), 0.5), 0.05))
    dm = N.math("FLOORED_MODULO", N.math("ADD", yj, 1.3), 12.0)
    dash = N.math("MULTIPLY", smooth(N, dm, 0.0, 0.03), inv(N, smooth(N, dm, 3.0, 3.03)))
    marks = []
    if lay["centre"] is not None:
        marks.append(inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", xw, lay["centre"])), 0.07, 0.08)))
    for dx in lay["dashes"]:
        marks.append(N.math("MULTIPLY", inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", xw, dx)), 0.058, 0.068)), dash))
    if lay["edge"] is not None:
        marks.append(inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", xw, lay["edge"])), 0.07, 0.08)))
    paint = marks[0] if marks else 0.0
    for mk in marks[1:]:
        paint = N.math("MAXIMUM", paint, mk)
    paint = N.math("MULTIPLY", paint, paint_wear(N, P, d2, track, ax))
    # --- le champ de « creux » (en écarts-types), d'où l'eau
    meso = noise(N, P, 0.42, 3.0, 0.55, stretch=(1.0, 0.5, 1.0))
    d4 = tex(N, os.path.join(S.ASSETS, "asphalt_04", "disp_2k.png"), mapping(N, P, scale=(1 / 4.04,) * 3, rot=(0, 0, 0.3)), color=False)
    D = N.math("MULTIPLY", N.math("SUBTRACT", 0.5, meso), 14.0)
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", 0.40, d4), 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", rut, st["rut"]))
    D = N.math("ADD", D, N.math("MULTIPLY", smooth(N, ax, 5.4, asph() - 0.05), st["edge"]))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", region, 0.55), 4.0))
    D = N.math("ADD", D, N.math("MULTIPLY", patch, 0.5))
    D = N.math("ADD", D, st["D_off"])
    if st["film"]:
        D = N.math("ADD", D, N.math("MULTIPLY", lowhalf, st["film"]))
    p0, p1 = st["puddle"]
    w = smooth(N, D, p0, p1)                              # 0 : humide, 1 : flaque ; bord adouci
    deep = smooth(N, D, p1, p1 + 0.9)                     # les flaques profondes : miroir plat
    tipdry = smooth(N, d2, 0.62, 0.85)
    # --- la peinture salie, si le plan des voies le demande (layout["grime"], de 0 à 1 ; absent, comme pour
    # l'avenue : rien ne change) : des plaques effacées, noyée sous les flaques, plus terne
    gr = lay.get("grime")
    if gr:
        gone = inv(N, smooth(N, noise(N, P, 0.8, 3.0, stretch=(1.0, 0.3, 1.0)), 0.40, 0.56))
        paint = N.math("MULTIPLY", paint, N.math("SUBTRACT", 1.0, N.math("MULTIPLY", gone, gr)))
        paint = N.math("MULTIPLY", paint, N.math("SUBTRACT", 1.0, N.math("MULTIPLY", w, min(1.0, 1.2 * gr))))
        paint = N.math("MULTIPLY", paint, 1.0 - 0.45 * gr)
    # --- couleur
    dk = st["dark"]
    col = N.mix(1.0, sc["diff"], (dk, dk, dk * 1.03, 1), "MULTIPLY")
    mf = N.mixf(0.55, 1.0, macro)
    col = N.mix(1.0, col, grey(N, mf), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", track, 0.6), col, N.mix(1.0, col, (0.72, 0.72, 0.72, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", oil, 0.8), col, N.mix(1.0, col, (0.45, 0.44, 0.43, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", patch, 0.85), col, N.mix(1.0, col, (0.62, 0.62, 0.64, 1), "MULTIPLY"))
    wet = N.mixf(w, st["wet"][0], st["wet"][1])
    col = N.mix(1.0, col, grey(N, wet), "MULTIPLY")
    col = N.mix(paint, col, paint_colour(N, P))
    col = N.mix(seal, col, (0.010, 0.010, 0.011, 1))
    # --- rugosité de la matière, normales
    br = N.math("MULTIPLY", sc["rough"], 0.95)
    br = N.mixf(N.math("MULTIPLY", track, 0.7), br, N.math("MULTIPLY", br, 0.72))
    br = N.mixf(paint, br, 0.5)
    br = N.mixf(seal, br, 0.22)
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    base_n = finish_normal(N, sc["nor_gl"], 1.0)
    base_n = vmix(N, N.math("MULTIPLY", patch, 0.4), base_n, geo)
    und = noise(N, P, 0.28, 3.0, stretch=(1.0, 0.6, 1.0))
    base_n = bump(N, und, base_n, 1.0, 0.05)
    base_n = bump(N, N.math("ADD", N.math("MULTIPLY", paint, 0.8), seal), base_n, 1.0, 0.0015)
    # --- la pellicule d'eau : rugosité continue de l'humide à la flaque, sans arête
    cr = N.mixf(tipdry, st["cr"][0], st["cr"][1])
    cr = N.math("SUBTRACT", cr, N.math("MULTIPLY", track, st["track"]))
    cr = N.mixf(seal, cr, N.math("MULTIPLY", cr, 0.6))
    cr = N.mixf(N.math("POWER", w, 1.4), cr, 0.035)
    rip = ripples(N, P)
    thin = vmix(N, st["film_grain"] + 0.3, rip, base_n)    # pellicule mince : le grain perce encore
    pud_n = vmix(N, deep, thin, rip)
    coat_n = vmix(N, smooth(N, w, 0.25, 1.0), base_n, pud_n)
    wet_shader(N, out, col, br, base_n, cr, coat_n)
    return m


def mat_paint_decal(st, name="road_paint"):
    """La peinture des passages piétons et des lignes d'arrêt : usée (détourée là où elle manque)."""
    m, N, out = S.material(name)
    P, _ = coords(N)
    d2 = tex(N, os.path.join(S.ASSETS, "asphalt_02", "disp_2k.png"), mapping(N, P, scale=(1 / 3.0,) * 3), color=False)
    keep = paint_wear(N, P, d2, 0.0, None)
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    n = bump(N, noise(N, P, 30.0, 3.0), geo, 0.15, 0.002)
    wet_shader(N, out, paint_colour(N, P), 0.5, n, st["cr"][0] + 0.02, n, alpha=keep)
    return m


# ---------------------------------------------------------------- cunette, bordure, trottoir

def mat_gutter_pan(st, name="gutter_pan", uv=False):
    # uv : coordonnées de la carte UV en mètres (voir coords), pour une cunette courbe
    m, N, out = S.material(name)
    P, O = coords(N, uv)
    ox, oy, _ = N.sep(O)
    ax = N.math("ABSOLUTE", ox)
    uv = mapping(N, P, scale=(0.5, 0.5, 0.5))
    f = os.path.join(S.ASSETS, "concrete_floor_01")
    diff = tex(N, os.path.join(f, "diff_1k.jpg"), uv)
    rough = tex(N, os.path.join(f, "rough_1k.jpg"), uv, color=False)
    nor = tex(N, os.path.join(f, "nor_gl_1k.jpg"), uv, color=False)
    hs = N.new("ShaderNodeHueSaturation", Saturation=0.35, Value=1.15)
    N.link(diff, hs.inputs["Color"])
    xk = N.math("SUBTRACT", half(), ax)
    s0, s1 = st["stream"]
    w = N.math("ADD", s0, N.math("MULTIPLY", noise(N, P, 0.35, 3.0, stretch=(0.0, 1.0, 0.0)), s1))
    stream = inv(N, smooth(N, xk, w, N.math("ADD", w, 0.03)))
    silt = N.math("MULTIPLY", inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", xk, N.math("ADD", w, 0.03))), 0.0, 0.045)),
                  smooth(N, noise(N, P, 2.0, 3.0), 0.4, 0.6))
    jm = N.math("FLOORED_MODULO", oy, 3.0)
    joint = inv(N, smooth(N, N.math("MINIMUM", jm, N.math("SUBTRACT", 3.0, jm)), 0.004, 0.011))
    vor = N.new("ShaderNodeTexVoronoi", Scale=9.0)
    N.link(P, vor.inputs["Vector"])
    rr = N.new("ShaderNodeSeparateColor")
    N.link(vor.outputs["Color"], rr.inputs[0])
    leaf = N.math("MULTIPLY", N.math("MULTIPLY", inv(N, smooth(N, vor.outputs["Distance"], 0.06, 0.1)), N.math("LESS_THAN", rr.outputs[0], 0.12)),
                  inv(N, smooth(N, xk, 0.15, 0.3)))
    col = N.mix(1.0, hs.outputs[0], (0.62, 0.62, 0.62, 1), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", silt, 0.8), col, (0.035, 0.03, 0.025, 1))
    col = N.mix(stream, col, N.mix(1.0, col, (0.5, 0.5, 0.5, 1), "MULTIPLY"))
    col = N.mix(joint, col, (0.02, 0.02, 0.02, 1))
    col = N.mix(N.math("MULTIPLY", leaf, 0.9), col, (0.05, 0.03, 0.015, 1))
    base_n = finish_normal(N, decode_normal(N, nor), 1.0)
    base_n = bump(N, N.math("MULTIPLY", joint, -1.0), base_n, 1.0, 0.004)
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    flow_n = bump(N, noise(N, P, 6.0, 3.0, stretch=(2.5, 0.5, 1.0)), geo, 0.18, 0.004)
    cr = N.mixf(joint, st["cr"][1] - 0.08, 0.15)
    cr = N.mixf(stream, cr, 0.02)
    wet_shader(N, out, col, N.math("MULTIPLY", rough, 0.9), base_n, cr, vmix(N, stream, base_n, flow_n))
    return m


def mat_kerb(st, name="kerb_concrete"):
    """La bordure en béton clair : pied sali sur quelques centimètres, nez épaufré, joints tous les 3 m."""
    m, N, out = S.material(name)
    P, O = coords(N)
    _, oy, oz = N.sep(O)
    uv = mapping(N, P, scale=(0.6, 0.6, 0.6))
    diff = tex(N, os.path.join(S.ASSETS, "concrete_floor_01", "diff_1k.jpg"), uv, box=True)
    bw = N.new("ShaderNodeRGBToBW")
    N.link(diff, bw.inputs[0])
    # un béton gris clair, la photo ne donne que ses variations
    var = N.mixf(0.6, 1.0, N.math("DIVIDE", bw.outputs[0], 0.15))
    foot = inv(N, smooth(N, oz, -0.06, 0.01))
    chip = N.math("MULTIPLY", smooth(N, noise(N, P, 9.0, 4.0, 0.6), 0.68, 0.73), smooth(N, oz, 0.1, 0.13))
    jm = N.math("FLOORED_MODULO", N.math("ADD", oy, 0.7), 3.0)
    joint = inv(N, smooth(N, N.math("MINIMUM", jm, N.math("SUBTRACT", 3.0, jm)), 0.004, 0.009))
    stain = smooth(N, noise(N, P, 1.6, 4.0), 0.45, 0.75)
    col = N.mix(1.0, (0.30, 0.29, 0.27, 1), grey(N, var), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", stain, 0.45), col, N.mix(1.0, col, (0.7, 0.68, 0.64, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", foot, 0.7), col, N.mix(1.0, col, (0.5, 0.47, 0.43, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", chip, 0.6), col, N.mix(1.0, col, (0.7, 0.7, 0.7, 1), "MULTIPLY"))
    col = N.mix(joint, col, (0.03, 0.03, 0.03, 1))
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    h = N.math("ADD", N.math("MULTIPLY", bw.outputs[0], 0.3), N.math("MULTIPLY", N.math("ADD", chip, joint), -2.0))
    base_n = bump(N, h, geo, 0.15, 0.003)
    wet_shader(N, out, col, 0.8, base_n, N.mixf(foot, 0.36, 0.15), base_n)
    return m


def mat_pavement(st, name="pavement_slabs"):
    """Dalles de béton balayé (scan brushed_concrete_04 dont les joints tombent sur ceux des dalles)."""
    m, N, out = S.material(name)
    P, O = coords(N)
    ox, oy, _ = N.sep(O)
    ax = N.math("ABSOLUTE", ox)
    x0 = half() + KERB
    sx = N.math("DIVIDE", N.math("SUBTRACT", ax, x0), SLAB[0])
    sy = N.math("DIVIDE", oy, SLAB[1])
    ix, iy = N.math("FLOOR", sx), N.math("FLOOR", sy)
    fx, fy = N.math("FRACT", sx), N.math("FRACT", sy)
    r, g, b, v = hash3(N, ix, iy, 3.1)
    r2, g2, _, _ = hash3(N, ix, iy, 7.7)
    u = N.math("MULTIPLY", N.math("ADD", fx, N.math("GREATER_THAN", r, 0.5)), 0.5)
    w_ = N.math("MULTIPLY", N.math("ADD", fy, N.math("GREATER_THAN", g, 0.5)), 0.5)
    uv = combine(N, u, w_)
    f = os.path.join(S.ASSETS, "brushed_concrete_04")
    diff = tex(N, os.path.join(f, "diff_2k.jpg"), uv)
    rough = tex(N, os.path.join(f, "rough_2k.jpg"), uv, color=False)
    nor = tex(N, os.path.join(f, "nor_gl_2k.jpg"), uv, color=False)
    hs = N.new("ShaderNodeHueSaturation", Saturation=0.3, Value=1.55)
    N.link(diff, hs.inputs["Color"])
    jx = N.math("MULTIPLY", N.math("MINIMUM", fx, N.math("SUBTRACT", 1.0, fx)), SLAB[0])
    jy = N.math("MULTIPLY", N.math("MINIMUM", fy, N.math("SUBTRACT", 1.0, fy)), SLAB[1])
    jd = N.math("MINIMUM", jx, jy)
    joint = inv(N, smooth(N, jd, 0.006, 0.016))
    tilt = N.math("ADD", N.math("MULTIPLY", N.math("SUBTRACT", fx, 0.5), N.math("SUBTRACT", r2, 0.5)),
                  N.math("MULTIPLY", N.math("SUBTRACT", fy, 0.5), N.math("SUBTRACT", g2, 0.5)))
    D = N.math("MULTIPLY", N.math("SUBTRACT", 0.5, noise(N, P, 0.7, 3.0)), 8.0)
    D = N.math("ADD", D, N.math("MULTIPLY", tilt, 4.0))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 3.0, 3.0), 0.5), 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", inv(N, smooth(N, jd, 0.0, 0.3)), 0.7))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 0.05, 2.0), 0.5), 3.0))
    D = N.math("ADD", D, st["walk_D"])
    w = smooth(N, D, 1.0, 1.6)
    stain = smooth(N, noise(N, P, 0.9, 4.0, 0.6), 0.48, 0.68)
    vor = N.new("ShaderNodeTexVoronoi", Scale=7.0)
    N.link(P, vor.inputs["Vector"])
    vr = N.new("ShaderNodeSeparateColor")
    N.link(vor.outputs["Color"], vr.inputs[0])
    gum = N.math("MULTIPLY", inv(N, smooth(N, vor.outputs["Distance"], 0.012, 0.02)), N.math("LESS_THAN", vr.outputs[0], 0.35))
    grime = N.math("MAXIMUM", inv(N, smooth(N, ax, x0, x0 + 0.4)), smooth(N, ax, -S.FRONT_X - 0.5, -S.FRONT_X))
    tint = N.math("ADD", 0.8, N.math("MULTIPLY", v, 0.4))
    col = N.mix(1.0, hs.outputs[0], combine(N, tint, tint, N.math("ADD", tint, N.math("MULTIPLY", N.math("SUBTRACT", b, 0.5), 0.05))), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", stain, 0.55), col, N.mix(1.0, col, (0.55, 0.52, 0.48, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", grime, 0.6), col, N.mix(1.0, col, (0.55, 0.53, 0.5, 1), "MULTIPLY"))
    col = N.mix(1.0, col, grey(N, N.mixf(w, 0.62, 0.45)), "MULTIPLY")
    col = N.mix(gum, col, (0.035, 0.034, 0.033, 1))
    col = N.mix(joint, col, (0.018, 0.018, 0.018, 1))
    base_n = finish_normal(N, decode_normal(N, nor), 1.0)
    base_n = bump(N, N.math("MULTIPLY", joint, -1.0), base_n, 1.0, 0.006)
    cr = N.mixf(joint, st["walk_cr"], 0.15)
    cr = N.mixf(N.math("POWER", w, 1.4), cr, 0.035)
    rip = ripples(N, P)
    coat_n = vmix(N, smooth(N, w, 0.3, 1.0), base_n, rip)
    wet_shader(N, out, col, N.math("MULTIPLY", rough, 0.9), base_n, cr, coat_n)
    return m


def mat_grate(name="drain_grate"):
    """Grille d'avaloir (décalcomanie ambientCG Grate002, détourée par sa carte d'opacité)."""
    m, N, out = S.material(name)
    uv = N.new("ShaderNodeTexCoord").outputs["UV"]
    f = os.path.join(S.ASSETS, "Grate002")
    col = tex(N, os.path.join(f, "Grate002_1K-JPG_Color.jpg"), uv)
    rough = tex(N, os.path.join(f, "Grate002_1K-JPG_Roughness.jpg"), uv, color=False)
    met = tex(N, os.path.join(f, "Grate002_1K-JPG_Metalness.jpg"), uv, color=False)
    nor = tex(N, os.path.join(f, "Grate002_1K-JPG_NormalGL.jpg"), uv, color=False)
    op = tex(N, os.path.join(f, "Grate002_1K-JPG_Opacity.jpg"), uv, color=False)
    hs = N.new("ShaderNodeHueSaturation", Saturation=0.35, Value=0.55)
    N.link(col, hs.inputs["Color"])
    n = finish_normal(N, decode_normal(N, nor), 1.0)
    p = wet_shader(N, out, hs.outputs[0], rough, n, 0.12, n, alpha=op)
    N.link(met, p.inputs["Metallic"])
    return m


# ---------------------------------------------------------------- géométrie

def strip(name, prof, y0, y1, mat, smooth_faces=False, loc=(0, 0, 0), rot=0.0):
    """Un profil (x, z) extrudé le long de y : surface ouverte, vue de dessus."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in prof]
    b = [bm.verts.new((x, y1, z)) for x, z in prof]
    for i in range(len(prof) - 1):
        f = bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
        f.smooth = smooth_faces
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if sum(p.normal.z for p in me.polygons) < 0:
        me.flip_normals()
    ob.location = loc
    ob.rotation_euler = (0, 0, rot)
    ob.data.materials.append(mat)
    return ob


def road_profile(dz=0.0):
    a = asph()
    return [(a * i / 26.0, road_z(a * i / 26.0) + dz) for i in range(-26, 27)]


def pan_profile(side, dz=0.0):
    a = asph()
    p = [(side * (a + PAN * t), road_z(a + PAN * t) + dz) for t in (0.0, 0.5, 1.0)]
    return p[::-1] if side < 0 else p


def kerb_profile(side, dz=0.0):
    """Bordure : face avec un léger fruit, nez arrondi de 2,5 cm, dos au niveau du trottoir."""
    h = half()
    pts = [(h, road_z(h) + dz), (h + 0.012, WALK_Z - 0.025)]
    cx, cz, r = h + 0.037, WALK_Z - 0.025, 0.025
    for i in range(1, 6):
        t = math.pi - (math.pi / 2) * i / 5
        pts.append((cx + r * math.cos(t), cz + r * math.sin(t)))
    pts.append((h + KERB, WALK_Z))
    pts = [(side * x, z) for x, z in pts]
    return pts[::-1] if side < 0 else pts


def plane(name, cx, cy, z, sx, sy, mat, rot=0.0):
    me = bpy.data.meshes.new(name)
    hx, hy = sx / 2, sy / 2
    me.from_pydata([(-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    for i, (u, v) in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[i].uv = (u, v)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = (cx, cy, z)
    ob.rotation_euler = (0, 0, rot)
    ob.data.materials.append(mat)
    return ob


def decal_strip(name, x0, x1, y0, y1, mat, dz=0.002):
    """Une bande de peinture qui épouse le bombé de la chaussée."""
    n = max(2, int(abs(x1 - x0) / 0.25) + 1)
    prof = [(x0 + (x1 - x0) * i / (n - 1), road_z(x0 + (x1 - x0) * i / (n - 1)) + dz) for i in range(n)]
    return strip(name, prof, y0, y1, mat)


def manhole_source(hidden):
    parts = S.import_glb("water_manhole_cover/water_manhole_cover.gltf")
    ob = S.join(parts, "manhole_src")
    dims = S.recentre(ob)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    hidden.objects.link(ob)
    # fonte mouillée : moins de rouille, plus sombre, une pellicule d'eau
    for mat in ob.data.materials:
        nt = mat.node_tree
        p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Coat Weight"].default_value = 1.0
        p.inputs["Coat IOR"].default_value = 1.33
        p.inputs["Coat Roughness"].default_value = 0.1
        if p.inputs["Base Color"].links:
            src = p.inputs["Base Color"].links[0].from_socket
            hs = nt.nodes.new("ShaderNodeHueSaturation")
            hs.inputs["Saturation"].default_value = 0.4
            hs.inputs["Value"].default_value = 0.5
            nt.links.new(src, hs.inputs["Color"])
            nt.links.new(hs.outputs[0], p.inputs["Base Color"])
    return ob, dims


def hidden_collection():
    c = bpy.data.collections.get("sources")
    if c is None:
        c = bpy.data.collections.new("sources")
        bpy.context.scene.collection.children.link(c)
    return c


# ---------------------------------------------------------------- la rue entière

def build_street(scene_a, M, style, grime=None):
    """grime (0 à 1, facultatif) : la peinture des voies de l'avenue salie et écaillée (layout["grime"])."""
    global S
    S = scene_a
    st = STYLES[style]
    rng = random.Random(23)
    H = half()
    Y0, Y1 = -30.0, 900.0
    asphalt = mat_asphalt(st, f"asphalt_{style}", layout=dict(grime=grime) if grime else None)
    pan, kerb, walk = mat_gutter_pan(st), mat_kerb(st), mat_pavement(st)
    paint = mat_paint_decal(st)

    # --- l'avenue : chaussée bombée d'un seul tenant, cunettes, bordures, trottoirs
    strip("road", road_profile(), Y0, Y1, asphalt)
    segs = S.segments(Y0, Y1)
    starts, ends = {sa for sa, _ in S.SIDE_STREETS}, {sb for _, sb in S.SIDE_STREETS}
    for i, (a, b) in enumerate(segs):
        strip(f"gutter_left_{i}", pan_profile(-1), a, b, pan)
        strip(f"kerb_left_{i}", kerb_profile(-1), a, b, kerb, smooth_faces=True)
        # le sol s'arrête où commencent les bordures des rues transversales
        wa, wb = a + (KERB if a in ends else 0.0), b - (KERB if b in starts else 0.0)
        S.box(f"walk_left_{i}", S.FRONT_X, -H - KERB, wa, wb, -0.05, WALK_Z, walk)
        S.box(f"block_left_{i}", -200, S.FRONT_X, wa, wb, -0.05, WALK_Z, walk)
    strip("gutter_right", pan_profile(1), Y0, Y1, pan)
    strip("kerb_right", kerb_profile(1), Y0, Y1, kerb, smooth_faces=True)
    S.box("walk_right", H + KERB, H + S.WALK, Y0, Y1, -0.05, WALK_Z, walk)

    # --- les rues transversales : les mêmes pièces, tournées de 90° (leur y local file vers −x),
    # posées 3 cm plus bas pour que leur axe rejoigne le bord de l'enrobé de l'avenue
    dz = -CROWN
    for i, (a, b) in enumerate(S.SIDE_STREETS):
        c, L = (a + b) / 2, 200.0 - asph()
        loc, rot = (-asph(), c, 0.0), math.pi / 2
        strip(f"side_street_{i}", road_profile(dz), 0.0, L, asphalt, loc=loc, rot=rot)
        for side in (-1, 1):
            strip(f"side_gutter_{i}_{side}", pan_profile(side, dz), 0.0, L, pan, loc=loc, rot=rot)
            strip(f"side_kerb_{i}_{side}", kerb_profile(side, dz), KERB + PAN + 0.0, L, kerb, smooth_faces=True, loc=loc, rot=rot)
        # le passage piéton en travers de l'avenue, la ligne d'arrêt (peinture usée)
        for k in range(14):
            x = -H + 0.6 + k * 0.98
            decal_strip(f"zebra_{i}_{k}", x, x + 0.5, a - 4.0, a - 0.8, paint)
        decal_strip(f"stop_{i}", -H + PAN, -0.25, b + 0.5, b + 0.9, paint)

    # --- plaques d'égout dans leur carré refait, tous les 40 à 60 m, en quinconce dans les voies
    hidden = hidden_collection()
    src, dims = manhole_source(hidden)
    patch = mat_asphalt(st, f"asphalt_patch_{style}", force_patch=True)
    xs = [-0.9, 3.4, -5.0, 1.7, -2.9, 5.2]
    y, k = 9.0, 0
    while y < 640:
        if not S.in_street(y, 4.0):
            x = xs[k % len(xs)]
            z = road_z(x)
            plane(f"mh_patch_{k}", x, y, z + 0.0015, 1.4, 1.4, patch)
            S.instance(src, f"manhole_{k}", (x, y, z + 0.003 - dims.z), rng.uniform(0, math.tau))
            k += 1
        y += rng.uniform(40.0, 60.0)

    # --- avaloirs : grille dans la cunette, gueule dans la bordure, tous les ~48 m de chaque côté
    gm = mat_grate()
    throat = S.mat_plain("drain_throat", (0.004, 0.004, 0.004, 1), 0.9)
    lip = S.mat_plain("drain_lip", (0.03, 0.03, 0.032, 1), 0.35, 0.9)
    k = 0
    for side, start in ((-1, 18.5), (1, 42.0)):
        y = start
        while y < 640:
            if not S.in_street(y, 3.0):
                plane(f"grate_{k}", side * (H - 0.26), y, road_z(H - 0.26) + 0.002, 0.72, 0.56, gm, math.pi / 2)
                xa, xb = sorted((side * H, side * (H + 0.013)))
                S.box(f"throat_{k}", xa - 0.002, xb + 0.002, y - 0.6, y + 0.6, road_z(H) + 0.005, 0.075, throat)
                S.box(f"throat_lip_{k}", xa - 0.004, xb + 0.004, y - 0.62, y + 0.62, 0.075, 0.09, lip)
                k += 1
            y += 48.0
    print(f"[road] rue « {style} » : avenue {Y0:.0f}..{Y1:.0f} m, {len(S.SIDE_STREETS)} rues transversales", flush=True)
