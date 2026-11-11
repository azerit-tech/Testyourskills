# Méthode D, la chaussée : l'avenue refaite en vraie rue mouillée.
#
# Ce que fait la méthode (tout se généralise à l'avenue de 930 m et aux rues transversales :
# coordonnées d'objet, aucun UV, des scans CC0 rééchantillonnés deux fois pour casser la répétition,
# du bruit procédural qui ne se répète jamais) :
#   - une chaussée bombée (3 cm de dévers vers les caniveaux), en enrobé scanné (Poly Haven
#     asphalt_02 pour le grain, aerial_asphalt_01 sur 30 m pour les variations d'ensemble) ;
#   - l'eau est une COUCHE (le vernis du Principled) posée sur l'enrobé, réglée par un masque de
#     hauteur : flaques nettes dans les creux et les ornières (rugosité ≈ 0,03), un liseré plus sombre
#     autour, et partout ailleurs un bitume humide (≈ 0,35-0,5) qui étire les reflets en traînées ;
#   - traces de pneus lustrées, bande d'huile au milieu des voies, rapiéçages rectangulaires plus
#     sombres aux joints colmatés, fissures pontées au bitume (noir brillant), joint longitudinal ;
#   - marquages usés : double ligne axiale, tirets de voie, lignes de rive ; bords ébréchés,
#     granulats qui percent, usure plus forte au passage des roues, blanc cassé sali ;
#   - caniveau en béton (cunette de 50 cm, joints tous les 3 m) avec un mince filet d'eau qui
#     ondule le long de la bordure, avaloirs à grille et gueule de bordure ;
#   - bordure en béton profilée (fruit, nez arrondi, joints, épaufrures, pied sali) ;
#   - trottoir en dalles de béton balayé (1,43 × 1,5 m), joints, teinte par dalle, taches, chewing-
#     gums, flaques dans les coins bas ; fosses d'arbre au pied des palmiers ;
#   - plaques d'égout (modèle Poly Haven) dans leur carré d'enrobé refait.
#
#   lockf -k <scratchpad>/blender.lock nice -n 19 taskpolicy -b \
#     /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/lab/D_road.py
#
# Variables d'environnement (essais) : D_WHICH=large,pres,drone (caméras), D_VARIANT=coat|single
# (l'eau en couche de vernis, ou en simple rugosité du bitume comme le film actuel), D_NAME.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench  # noqa: E402

import bpy  # noqa: E402
import bmesh  # noqa: E402

S = bench.S
A = S.ASSETS
VARIANT = os.environ.get("D_VARIANT", "coat")

HALF = S.ROAD_HALF        # 7 m : du nu de la bordure à l'axe
PAN = 0.5                 # la cunette en béton, comprise dans la chaussée
ASPH = HALF - PAN         # 6,5 m : le bord de l'enrobé
CROWN = 0.03              # le bord de l'enrobé est 3 cm sous l'axe
PAN_DROP = 0.015          # la cunette descend encore vers la bordure
KERB = 0.2
WALK_Z = 0.15
WALK_OUT = 11.5           # le trottoir va jusqu'à |x| = 11,5 (le nu des façades)
LANES = (1.83, 5.0)       # milieux des voies (|x|)
EDGE_X = 6.2              # ligne de rive (|x|), juste avant la cunette
SLAB = (1.4333, 1.5)      # dalles de trottoir : trois sur la largeur, 1,5 m de long


def road_z(x):
    """Le profil en travers : bombé au milieu, puis la cunette qui plonge vers la bordure."""
    ax = abs(x)
    if ax <= ASPH:
        return -CROWN * (ax / ASPH) ** 2
    return -CROWN - PAN_DROP * min(1.0, (ax - ASPH) / PAN)


# ---------------------------------------------------------------- petits outils de nœuds

def coords(N):
    """Coordonnées d'objet (alignées sur la rue, même tournée de 90°) + la position de l'objet :
    deux rues ne partagent jamais le même bruit. Renvoie (P, coordonnées d'objet seules)."""
    tc = N.new("ShaderNodeTexCoord")
    oi = N.new("ShaderNodeObjectInfo")
    v = N.new("ShaderNodeVectorMath", _operation="ADD")
    N.link(tc.outputs["Object"], v.inputs[0])
    N.link(oi.outputs["Location"], v.inputs[1])
    return v.outputs[0], tc.outputs["Object"]


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


def hash3(N, a, b, seed):
    """Trois nombres au hasard par case (a, b) : la couleur d'un bruit blanc."""
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
    """Une carte de normales OpenGL lue à plat : (r, g, b)·2 − 1 dans le repère de l'objet (pour
    une surface horizontale, le repère tangent est celui de l'objet : pas besoin d'UV)."""
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
    """Force du relief, normalisation, et passage du repère de l'objet au monde."""
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
    """Le même scan lu deux fois (l'une tournée et à une autre échelle), fondu par un grand bruit :
    la répétition d'une dalle de 3 m disparaît sur des centaines de mètres."""
    uva = mapping(N, P, scale=(1 / size,) * 3)
    uvb = mapping(N, P, scale=(1 / (size * 0.77),) * 3, rot=(0, 0, rot), loc=(0.37, 0.71, 0))
    f = smooth(N, noise(N, P, 0.18, 3.0), 0.44, 0.56)
    out = {"f": f}
    for m in maps:
        path = os.path.join(A, folder, f"{m}_{res}." + ("png" if m == "disp" else "jpg"))
        a = tex(N, path, uva, color=(m == "diff"))
        b = tex(N, path, uvb, color=(m == "diff"))
        if m == "nor_gl":
            out[m] = vmix(N, f, decode_normal(N, a), decode_normal(N, b, -rot))
        elif m == "diff":
            out[m] = N.mix(f, a, b)
        else:
            out[m] = N.mixf(f, a, b)
    return out


def wet_shader(N, out, col, base_rough, base_n, coat_r, coat_n, spec=0.5):
    """L'eau : une couche de vernis d'indice 1,33 sur la matière (VARIANT coat), ou, pour comparer,
    la rugosité de la matière elle-même (VARIANT single, ce que fait le film aujourd'hui)."""
    p = S.principled(N)
    N.set(p.inputs["Base Color"], col)
    p.inputs["Specular IOR Level"].default_value = spec
    if VARIANT == "single":
        N.set(p.inputs["Roughness"], coat_r)
        N.set(p.inputs["Normal"], coat_n)
    else:
        N.set(p.inputs["Roughness"], base_rough)
        N.set(p.inputs["Normal"], base_n)
        p.inputs["Coat Weight"].default_value = 1.0
        p.inputs["Coat IOR"].default_value = 1.33
        N.set(p.inputs["Coat Roughness"], coat_r)
        N.set(p.inputs["Coat Normal"], coat_n)
    N.link(p.outputs[0], out.inputs[0])
    return p


def ripples(N, P, scale=38.0, strength=0.06):
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    return bump(N, noise(N, P, scale, 3.0), geo, strength, 0.004), geo


# ---------------------------------------------------------------- la chaussée

def in_rect(N, x, y, x0, x1, y0, y1, m):
    """1 dans le rectangle agrandi de m (sockets ou nombres)."""
    a = N.math("GREATER_THAN", x, N.math("SUBTRACT", x0, m))
    b = N.math("LESS_THAN", x, N.math("ADD", x1, m))
    c = N.math("GREATER_THAN", y, N.math("SUBTRACT", y0, m))
    d = N.math("LESS_THAN", y, N.math("ADD", y1, m))
    return N.math("MULTIPLY", N.math("MULTIPLY", a, b), N.math("MULTIPLY", c, d))


def mat_asphalt(name="D_asphalt", force_patch=False):
    """L'enrobé mouillé. force_patch : le carré refait autour d'une plaque (bords colmatés au
    bitume le long du bord de l'objet, ±0,7 m)."""
    m, N, out = S.material(name)
    P, O = coords(N)
    ox, oy, _ = N.sep(O)
    # les voies et les marquages se lisent dans le repère de la rue ; le carré refait (non tourné)
    # les lit dans le monde, comme la chaussée qu'il recouvre
    lx, ly, _ = N.sep(P) if force_patch else (ox, oy, None)
    ax = N.math("ABSOLUTE", lx)
    sc = scan2(N, P, "asphalt_02", 3.0)
    d2 = sc["disp"]                                       # pores bas (≈0,5), pointes hautes (≈0,8)
    # --- les macro-variations : la photo aérienne sur 30 m, plus deux bruits
    aer = tex(N, os.path.join(A, "aerial_asphalt_01", "diff_2k.jpg"), mapping(N, P, scale=(1 / 30.0,) * 3))
    aer_bw = N.new("ShaderNodeRGBToBW")
    N.link(aer, aer_bw.inputs[0])
    macro = N.math("DIVIDE", aer_bw.outputs[0], 0.125)
    region = noise(N, P, 0.03, 2.0)                       # des tronçons plus ou moins trempés (≈ 30 m)
    # --- les voies : traces de roues (lustrées, en ornière) et bande d'huile au milieu
    dl1 = N.math("ABSOLUTE", N.math("SUBTRACT", ax, LANES[0]))
    dl2 = N.math("ABSOLUTE", N.math("SUBTRACT", ax, LANES[1]))
    dw = N.math("MINIMUM", N.math("ABSOLUTE", N.math("SUBTRACT", dl1, 0.8)), N.math("ABSOLUTE", N.math("SUBTRACT", dl2, 0.8)))
    dc = N.math("MINIMUM", dl1, dl2)
    rutvar = smooth(N, noise(N, P, 0.6, 2.0, stretch=(1.0, 0.12, 1.0)), 0.38, 0.62)
    rut = N.math("MULTIPLY", inv(N, smooth(N, dw, 0.06, 0.42)), rutvar)
    track = inv(N, smooth(N, dw, 0.1, 0.32))
    oil = N.math("MULTIPLY", inv(N, smooth(N, dc, 0.12, 0.42)), smooth(N, noise(N, P, 1.1, 3.0, stretch=(1.0, 0.3, 1.0)), 0.47, 0.66))
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
    # --- fissures pontées au bitume (« serpents » noirs) et joint longitudinal le long des tirets
    n1 = noise(N, P, 0.22, 2.0, 0.5, stretch=(1.0, 0.45, 1.0), dist=0.35)
    snake = N.math("MULTIPLY", inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", n1, 0.5)), 0.004, 0.011)),
                   smooth(N, noise(N, P, 0.045, 2.0), 0.53, 0.6))
    jw = N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 1.0, 2.0, stretch=(0.0, 0.35, 0.0)), 0.5), 0.12)
    joint = N.math("MULTIPLY", inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", ax, N.math("ADD", 3.74, jw))), 0.01, 0.02)),
                   smooth(N, noise(N, P, 0.5, 2.0, stretch=(0.2, 1.0, 0.2)), 0.36, 0.44))
    seal = N.math("MAXIMUM", N.math("MAXIMUM", snake, joint), seal_p)
    # le joint entre l'enrobé et la cunette
    seal = N.math("MAXIMUM", seal, smooth(N, ax, 6.47, 6.495))
    # --- les marquages : bords ébréchés, granulats qui percent, usés au passage des roues
    xw = N.math("ADD", ax, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 7.0, 3.0), 0.5), 0.018))
    yj = N.math("ADD", ly, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 5.0, 2.0), 0.5), 0.05))
    centre = inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", xw, 0.17)), 0.052, 0.062))
    dm = N.math("FLOORED_MODULO", N.math("ADD", yj, 1.3), 12.0)
    dash = N.math("MULTIPLY", smooth(N, dm, 0.0, 0.03), inv(N, smooth(N, dm, 3.0, 3.03)))
    lane = N.math("MULTIPLY", inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", xw, 3.5)), 0.055, 0.065)), dash)
    edge = inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", xw, EDGE_X)), 0.068, 0.078))
    paint = N.math("MAXIMUM", N.math("MAXIMUM", centre, lane), edge)
    wn = noise(N, P, 3.2, 6.0, 0.65)
    thr = N.math("ADD", N.math("ADD", 0.30, N.math("MULTIPLY", track, 0.14)), N.math("MULTIPLY", smooth(N, noise(N, P, 0.06, 1.0), 0.35, 0.65), 0.1))
    keep = smooth(N, N.math("SUBTRACT", wn, thr), 0.0, 0.05)
    paint = N.math("MULTIPLY", N.math("MULTIPLY", paint, keep), smooth(N, d2, 0.46, 0.56))
    # --- le masque d'eau : un champ de « creux » (écarts-types), seuillé
    meso = noise(N, P, 0.42, 3.0, 0.55, stretch=(1.0, 0.5, 1.0))
    d4 = tex(N, os.path.join(A, "asphalt_04", "disp_2k.png"), mapping(N, P, scale=(1 / 4.04,) * 3, rot=(0, 0, 0.3)), color=False)
    D = N.math("MULTIPLY", N.math("SUBTRACT", 0.5, meso), 14.0)
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", 0.40, d4), 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", rut, 2.0))
    D = N.math("ADD", D, N.math("MULTIPLY", smooth(N, ax, 5.4, 6.45), 0.9))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", region, 0.55), 4.0))
    D = N.math("ADD", D, N.math("MULTIPLY", patch, 0.5))
    puddle = smooth(N, D, 0.65, 0.85)
    ringw = smooth(N, D, -0.1, 0.65)                       # le liseré plus sombre autour des flaques
    tipdry = smooth(N, d2, 0.62, 0.85)                    # les pointes de granulats, moins mouillées
    # --- couleur
    col = N.mix(1.0, sc["diff"], (0.75, 0.75, 0.78, 1), "MULTIPLY")
    mf = N.mixf(0.55, 1.0, macro)
    col = N.mix(1.0, col, combine(N, mf, mf, mf), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", track, 0.6), col, N.mix(1.0, col, (0.72, 0.72, 0.72, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", oil, 0.8), col, N.mix(1.0, col, (0.45, 0.44, 0.43, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", patch, 0.85), col, N.mix(1.0, col, (0.62, 0.62, 0.64, 1), "MULTIPLY"))
    wet = N.mixf(ringw, 0.42, 0.32)
    wet = N.mixf(puddle, wet, 0.25)
    col = N.mix(1.0, col, combine(N, wet, wet, wet), "MULTIPLY")
    dirt = N.mixf(smooth(N, noise(N, P, 1.3, 4.0), 0.35, 0.7), 0.78, 1.0)
    pcol = N.mix(1.0, (0.50, 0.49, 0.45, 1), combine(N, dirt, dirt, dirt), "MULTIPLY")
    col = N.mix(paint, col, pcol)
    col = N.mix(seal, col, (0.010, 0.010, 0.011, 1))
    # --- rugosité de la matière, normales
    br = N.math("MULTIPLY", sc["rough"], 0.95)
    br = N.mixf(N.math("MULTIPLY", track, 0.7), br, N.math("MULTIPLY", br, 0.72))
    br = N.mixf(paint, br, 0.5)
    br = N.mixf(seal, br, 0.22)
    base_n = finish_normal(N, sc["nor_gl"], 1.0)
    # le relief s'adoucit sur l'enrobé refait : on rapproche la normale de la verticale
    base_n = vmix(N, N.math("MULTIPLY", patch, 0.4), base_n, N.new("ShaderNodeNewGeometry").outputs["Normal"])
    und = noise(N, P, 0.28, 3.0, stretch=(1.0, 0.6, 1.0))
    base_n = bump(N, und, base_n, 1.0, 0.05)              # ondulations de la chaussée sur quelques mètres
    base_n = bump(N, N.math("ADD", N.math("MULTIPLY", paint, 0.8), N.math("MULTIPLY", seal, 1.0)), base_n, 1.0, 0.0015)
    # --- l'eau : rugosité et normale de la pellicule
    cr = N.mixf(tipdry, 0.2, 0.34)
    cr = N.math("SUBTRACT", cr, N.math("MULTIPLY", track, 0.06))
    cr = N.mixf(ringw, cr, 0.12)
    cr = N.mixf(seal, cr, N.math("MULTIPLY", cr, 0.6))
    cr = N.mixf(puddle, cr, 0.03)
    rip, geo = ripples(N, P)
    damp_n = vmix(N, N.math("MULTIPLY", ringw, 0.5), base_n, rip)
    coat_n = vmix(N, puddle, damp_n, rip)
    wet_shader(N, out, col, br, base_n, cr, coat_n)
    return m


# ---------------------------------------------------------------- cunette, bordure, trottoir

def mat_gutter_pan(name="D_gutter_pan"):
    """La cunette en béton : joints tous les 3 m, un mince filet d'eau le long de la bordure, son
    liseré de dépôts, quelques débris."""
    m, N, out = S.material(name)
    P, O = coords(N)
    ox, oy, _ = N.sep(O)
    ax = N.math("ABSOLUTE", ox)
    uv = mapping(N, P, scale=(0.5, 0.5, 0.5))
    f = os.path.join(A, "concrete_floor_01")
    diff = tex(N, os.path.join(f, "diff_1k.jpg"), uv)
    rough = tex(N, os.path.join(f, "rough_1k.jpg"), uv, color=False)
    nor = tex(N, os.path.join(f, "nor_gl_1k.jpg"), uv, color=False)
    hs = N.new("ShaderNodeHueSaturation", Saturation=0.35, Value=1.15)
    N.link(diff, hs.inputs["Color"])
    xk = N.math("SUBTRACT", HALF, ax)                     # distance au nu de la bordure
    w = N.math("ADD", 0.07, N.math("MULTIPLY", noise(N, P, 0.35, 3.0, stretch=(0.0, 1.0, 0.0)), 0.14))
    stream = inv(N, smooth(N, xk, w, N.math("ADD", w, 0.02)))
    silt = N.math("MULTIPLY", inv(N, smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", xk, N.math("ADD", w, 0.03))), 0.0, 0.045)),
                  smooth(N, noise(N, P, 2.0, 3.0), 0.4, 0.6))
    jm = N.math("FLOORED_MODULO", oy, 3.0)
    jt = N.math("MINIMUM", jm, N.math("SUBTRACT", 3.0, jm))
    joint = inv(N, smooth(N, jt, 0.004, 0.011))
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
    flow = noise(N, P, 6.0, 3.0, stretch=(2.5, 0.5, 1.0))
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    flow_n = bump(N, flow, geo, 0.18, 0.004)
    cr = N.mixf(joint, 0.26, 0.15)
    cr = N.mixf(stream, cr, 0.02)
    coat_n = vmix(N, stream, base_n, flow_n)
    wet_shader(N, out, col, N.math("MULTIPLY", rough, 0.9), base_n, cr, coat_n)
    return m


def mat_kerb(name="D_kerb"):
    """La bordure en béton : pied sali par l'eau, nez épaufré, joints tous les 3 m."""
    m, N, out = S.material(name)
    P, O = coords(N)
    _, oy, oz = N.sep(O)
    uv = mapping(N, P, scale=(0.6, 0.6, 0.6))
    f = os.path.join(A, "concrete_floor_01")
    diff = tex(N, os.path.join(f, "diff_1k.jpg"), uv, box=True)
    hs = N.new("ShaderNodeHueSaturation", Saturation=0.25, Value=1.7)
    N.link(diff, hs.inputs["Color"])
    bw = N.new("ShaderNodeRGBToBW")
    N.link(diff, bw.inputs[0])
    foot = inv(N, smooth(N, oz, -0.04, 0.07))
    chip = N.math("MULTIPLY", smooth(N, noise(N, P, 9.0, 4.0, 0.6), 0.66, 0.72), smooth(N, oz, 0.1, 0.13))
    jm = N.math("FLOORED_MODULO", N.math("ADD", oy, 0.7), 3.0)
    joint = inv(N, smooth(N, N.math("MINIMUM", jm, N.math("SUBTRACT", 3.0, jm)), 0.004, 0.009))
    stain = smooth(N, noise(N, P, 1.6, 4.0), 0.45, 0.75)
    col = N.mix(1.0, hs.outputs[0], (0.8, 0.8, 0.8, 1), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", stain, 0.5), col, N.mix(1.0, col, (0.6, 0.58, 0.55, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", foot, 0.85), col, N.mix(1.0, col, (0.32, 0.3, 0.27, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", chip, 0.7), col, N.mix(1.0, col, (0.5, 0.5, 0.5, 1), "MULTIPLY"))
    col = N.mix(joint, col, (0.02, 0.02, 0.02, 1))
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    h = N.math("ADD", N.math("MULTIPLY", bw.outputs[0], 1.0), N.math("MULTIPLY", N.math("ADD", chip, joint), -2.5))
    base_n = bump(N, h, geo, 0.3, 0.003)
    cr = N.mixf(foot, 0.32, 0.15)
    wet_shader(N, out, col, 0.75, base_n, cr, base_n)
    return m


def mat_pavement(name="D_pavement"):
    """Le trottoir : dalles de béton balayé (scan Poly Haven brushed_concrete_04, dont les joints
    tombent sur ceux des dalles), une variante et une teinte par dalle, taches, chewing-gums,
    flaques dans les coins bas des dalles."""
    m, N, out = S.material(name)
    P, O = coords(N)
    ox, oy, _ = N.sep(O)
    ax = N.math("ABSOLUTE", ox)
    sx = N.math("DIVIDE", N.math("SUBTRACT", ax, HALF + KERB), SLAB[0])
    sy = N.math("DIVIDE", oy, SLAB[1])
    ix, iy = N.math("FLOOR", sx), N.math("FLOOR", sy)
    fx, fy = N.math("FRACT", sx), N.math("FRACT", sy)
    r, g, b, v = hash3(N, ix, iy, 3.1)
    r2, g2, _, _ = hash3(N, ix, iy, 7.7)
    u = N.math("MULTIPLY", N.math("ADD", fx, N.math("GREATER_THAN", r, 0.5)), 0.5)
    w = N.math("MULTIPLY", N.math("ADD", fy, N.math("GREATER_THAN", g, 0.5)), 0.5)
    uv = combine(N, u, w)
    f = os.path.join(A, "brushed_concrete_04")
    diff = tex(N, os.path.join(f, "diff_2k.jpg"), uv)
    rough = tex(N, os.path.join(f, "rough_2k.jpg"), uv, color=False)
    nor = tex(N, os.path.join(f, "nor_gl_2k.jpg"), uv, color=False)
    hs = N.new("ShaderNodeHueSaturation", Saturation=0.3, Value=1.55)
    N.link(diff, hs.inputs["Color"])
    jx = N.math("MULTIPLY", N.math("MINIMUM", fx, N.math("SUBTRACT", 1.0, fx)), SLAB[0])
    jy = N.math("MULTIPLY", N.math("MINIMUM", fy, N.math("SUBTRACT", 1.0, fy)), SLAB[1])
    jd = N.math("MINIMUM", jx, jy)
    joint = inv(N, smooth(N, jd, 0.006, 0.016))
    # flaques : creux du bruit + une pente par dalle + le bas des joints
    tilt = N.math("ADD", N.math("MULTIPLY", N.math("SUBTRACT", fx, 0.5), N.math("SUBTRACT", r2, 0.5)),
                  N.math("MULTIPLY", N.math("SUBTRACT", fy, 0.5), N.math("SUBTRACT", g2, 0.5)))
    D = N.math("MULTIPLY", N.math("SUBTRACT", 0.5, noise(N, P, 0.7, 3.0)), 8.0)
    D = N.math("ADD", D, N.math("MULTIPLY", tilt, 4.0))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 3.0, 3.0), 0.5), 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", inv(N, smooth(N, jd, 0.0, 0.3)), 0.7))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", noise(N, P, 0.05, 2.0), 0.5), 3.0))
    puddle = smooth(N, D, 1.4, 1.6)
    ringw = smooth(N, D, 0.5, 1.4)
    # taches, chewing-gums, salissures au pied de la bordure et des façades
    stain = smooth(N, noise(N, P, 0.9, 4.0, 0.6), 0.48, 0.68)
    vor = N.new("ShaderNodeTexVoronoi", Scale=7.0)
    N.link(P, vor.inputs["Vector"])
    vr = N.new("ShaderNodeSeparateColor")
    N.link(vor.outputs["Color"], vr.inputs[0])
    gum = N.math("MULTIPLY", inv(N, smooth(N, vor.outputs["Distance"], 0.012, 0.02)), N.math("LESS_THAN", vr.outputs[0], 0.35))
    grime = N.math("MAXIMUM", inv(N, smooth(N, ax, HALF + KERB, HALF + KERB + 0.4)), smooth(N, ax, WALK_OUT - 0.5, WALK_OUT))
    tint = N.math("ADD", 0.8, N.math("MULTIPLY", v, 0.4))
    col = N.mix(1.0, hs.outputs[0], combine(N, tint, tint, N.math("ADD", tint, N.math("MULTIPLY", N.math("SUBTRACT", b, 0.5), 0.05))), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", stain, 0.55), col, N.mix(1.0, col, (0.55, 0.52, 0.48, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", grime, 0.6), col, N.mix(1.0, col, (0.55, 0.53, 0.5, 1), "MULTIPLY"))
    wet = N.mixf(ringw, 0.62, 0.5)
    wet = N.mixf(puddle, wet, 0.45)
    col = N.mix(1.0, col, combine(N, wet, wet, wet), "MULTIPLY")
    col = N.mix(gum, col, (0.035, 0.034, 0.033, 1))
    col = N.mix(joint, col, (0.018, 0.018, 0.018, 1))
    base_n = finish_normal(N, decode_normal(N, nor), 1.0)
    base_n = bump(N, N.math("MULTIPLY", joint, -1.0), base_n, 1.0, 0.006)
    cr = N.mixf(joint, 0.28, 0.15)
    cr = N.mixf(ringw, cr, 0.16)
    cr = N.mixf(puddle, cr, 0.03)
    rip, _ = ripples(N, P)
    coat_n = vmix(N, puddle, vmix(N, N.math("MULTIPLY", ringw, 0.5), base_n, rip), rip)
    wet_shader(N, out, col, N.math("MULTIPLY", rough, 0.9), base_n, cr, coat_n)
    return m


def mat_soil(name="D_soil"):
    m, N, out = S.material(name)
    P, _ = coords(N)
    vor = N.new("ShaderNodeTexVoronoi", Scale=45.0)
    N.link(P, vor.inputs["Vector"])
    col = N.ramp(vor.outputs["Distance"], [(0.0, (0.012, 0.008, 0.005)), (0.7, (0.06, 0.035, 0.02))])
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    n = bump(N, vor.outputs["Distance"], geo, 0.8, 0.01)
    wet_shader(N, out, col, 0.8, n, 0.45, n)
    return m


def mat_grate(name="D_grate"):
    """Grille d'avaloir (décalcomanie ambientCG Grate002, détourée par sa carte d'opacité)."""
    m, N, out = S.material(name)
    uv = N.new("ShaderNodeTexCoord").outputs["UV"]
    f = os.path.join(A, "Grate002")
    col = tex(N, os.path.join(f, "Grate002_1K-JPG_Color.jpg"), uv)
    rough = tex(N, os.path.join(f, "Grate002_1K-JPG_Roughness.jpg"), uv, color=False)
    met = tex(N, os.path.join(f, "Grate002_1K-JPG_Metalness.jpg"), uv, color=False)
    nor = tex(N, os.path.join(f, "Grate002_1K-JPG_NormalGL.jpg"), uv, color=False)
    op = tex(N, os.path.join(f, "Grate002_1K-JPG_Opacity.jpg"), uv, color=False)
    hs = N.new("ShaderNodeHueSaturation", Saturation=0.35, Value=0.55)
    N.link(col, hs.inputs["Color"])
    n = finish_normal(N, decode_normal(N, nor), 1.0)
    p = wet_shader(N, out, hs.outputs[0], rough, n, 0.12, n)
    N.link(met, p.inputs["Metallic"])
    N.link(op, p.inputs["Alpha"])
    return m


# ---------------------------------------------------------------- géométrie

def strip(name, prof, y0, y1, mat, smooth_faces=False):
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
    # les faces doivent regarder vers le haut / vers la rue
    me.update()
    up = sum(p.normal.z for p in me.polygons)
    if up < 0:
        me.flip_normals()
    ob.data.materials.append(mat)
    return ob


def kerb_profile(side):
    """Bordure : face avec un léger fruit, nez arrondi de 2,5 cm, dos au niveau du trottoir."""
    z0 = road_z(HALF)
    pts = [(HALF, z0), (HALF + 0.012, WALK_Z - 0.025)]
    cx, cz, r = HALF + 0.012 + 0.025, WALK_Z - 0.025, 0.025
    for i in range(1, 6):
        t = math.pi - (math.pi / 2) * i / 5
        pts.append((cx + r * math.cos(t), cz + r * math.sin(t)))
    pts.append((HALF + KERB, WALK_Z))
    return [(side * x, z) for x, z in pts]


def build_carriageway(y0, y1, tag="av"):
    """La chaussée, les cunettes, les bordures et les trottoirs entre y0 et y1 (objets à l'origine,
    dans le repère de l'avenue ; une rue transversale = les mêmes objets tournés de 90°)."""
    asph = mat_asphalt()
    pan, kerb, walk = mat_gutter_pan(), mat_kerb(), mat_pavement()
    xs = [ASPH * (i / 26.0) for i in range(-26, 27)]
    road = strip(f"{tag}_road", [(x, road_z(x)) for x in xs], y0, y1, asph)
    obs = [road]
    for side in (-1, 1):
        prof = [(side * (ASPH + PAN * t), road_z(ASPH + PAN * t)) for t in (0.0, 0.5, 1.0)]
        if side < 0:
            prof = prof[::-1]
        obs.append(strip(f"{tag}_pan_{side}", prof, y0, y1, pan))
        kp = kerb_profile(side)
        if side < 0:
            kp = kp[::-1]
        obs.append(strip(f"{tag}_kerb_{side}", kp, y0, y1, kerb, smooth_faces=True))
        xa, xb = sorted((side * (HALF + KERB), side * WALK_OUT))
        obs.append(S.box(f"{tag}_walk_{side}", xa, xb, y0, y1, -0.05, WALK_Z, walk))
    return obs, asph


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
        p.inputs["Coat Roughness"].default_value = 0.12
        src = p.inputs["Base Color"].links[0].from_socket if p.inputs["Base Color"].links else None
        if src is not None:
            hs = nt.nodes.new("ShaderNodeHueSaturation")
            hs.inputs["Saturation"].default_value = 0.4
            hs.inputs["Value"].default_value = 0.5
            nt.links.new(src, hs.inputs["Color"])
            nt.links.new(hs.outputs[0], p.inputs["Base Color"])
    print(f"[D] plaque d'égout : {dims.x:.2f} × {dims.y:.2f} × {dims.z:.3f} m", flush=True)
    return ob, dims


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


def street_furniture(manholes, grates, pits):
    """Plaques d'égout dans leur carré refait, avaloirs (grille + gueule dans la bordure), fosses
    d'arbre au pied des palmiers."""
    hidden = bench.hidden_collection()
    src, dims = manhole_source(hidden)
    patch = mat_asphalt("D_asphalt_patch", force_patch=True)
    for k, (x, y) in enumerate(manholes):
        z = road_z(x)
        plane(f"mh_patch_{k}", x, y, z + 0.0015, 1.4, 1.4, patch)
        S.instance(src, f"manhole_{k}", (x, y, z + 0.003 - dims.z), k * 1.3)
    gm = mat_grate()
    throat = S.mat_plain("D_throat", (0.004, 0.004, 0.004, 1), 0.9)
    lip = S.mat_plain("D_lip", (0.03, 0.03, 0.032, 1), 0.35, 0.9)
    for k, (side, y) in enumerate(grates):
        xc = side * (HALF - 0.26)
        plane(f"grate_{k}", xc, y, road_z(HALF - 0.26) + 0.002, 0.72, 0.56, gm, math.pi / 2)
        xf = side * HALF
        xa, xb = sorted((xf, xf + side * 0.013))
        S.box(f"throat_{k}", xa - 0.002, xb + 0.002, y - 0.6, y + 0.6, road_z(HALF) + 0.005, 0.075, throat)
        S.box(f"throat_lip_{k}", xa - 0.004, xb + 0.004, y - 0.62, y + 0.62, 0.075, 0.09, lip)
    soil = mat_soil()
    frame = S.mat_plain("D_pit_frame", (0.035, 0.035, 0.038, 1), 0.4, 0.8)
    for k, (x, y) in enumerate(pits):
        h = 0.65
        plane(f"pit_soil_{k}", x, y, WALK_Z + 0.002, 2 * h, 2 * h, soil)
        for j, (a, b, c, d) in enumerate(((-h, h, -h, -h + 0.05), (-h, h, h - 0.05, h), (-h, -h + 0.05, -h, h), (h - 0.05, h, -h, h))):
            S.box(f"pit_frame_{k}_{j}", x + a, x + b, y + c, y + d, WALK_Z - 0.01, WALK_Z + 0.006, frame)


def main():
    t0 = __import__("time").time()
    bench.setup(road=False, frontage=True)
    build_carriageway(-20.0, 120.0)
    street_furniture(
        manholes=[(-1.9, 13.2), (3.4, 47.0), (-5.0, 78.0)],
        grates=[(-1, 18.5), (1, 31.0), (-1, 66.0)],
        pits=[(x, y) for x, y, _, _ in bench.PALM_SPOTS],
    )
    bench.camera("cam_drone", (-3.0, -10.0, 17.0), (-2.4, 33.0, 0.0), 26, (-2.4, 20.0, 0.0))
    which = tuple(os.environ.get("D_WHICH", "large,pres,drone").split(","))
    name = os.environ.get("D_NAME", "D-road")
    print(f"[D] scène prête en {__import__('time').time() - t0:.0f} s, variante {VARIANT}", flush=True)
    border = os.environ.get("D_BORDER")
    if border:
        r = bpy.context.scene.render
        r.use_border, r.use_crop_to_border = True, False
        r.border_min_x, r.border_max_x, r.border_min_y, r.border_max_y = map(float, border.split(","))
    bench.render(name, which=which)


main()
