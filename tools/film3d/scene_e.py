# Scène E, le port : le terre-plein de béton au pied du pont, l'axe fermé par une file de séparateurs, le virage à
# angle droit sur la voie du quai, et son plan P5, le projecteur : la berline sort du pont, vire à droite au frein
# et balaie l'objectif, la meute dévale la rampe derrière elle, l'hélicoptère monte et son projecteur se pose sur
# elle (docs/cinematique-poursuite.md §2.4, « 5. Le port »). P4 est sur le pont (scene_c), P6 sur la jetée (scene_d).
#
# Construire et rendre le plan (une seule commande, sous le verrou commun) :
#
#   lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup \
#     -P tools/film3d/render_lieux.py -- --lieu port --plan P5 [--palier socle] [--engine cycles --samples 32]
#
# écrit Azerit/design/film/ref/lieux/port-P5-<palier>[-cadrage].png (render_lieux.py) et assets/scene-e-P5.blend.
# Sur le Mac de Jacques : cadrage en Workbench (défaut), lumière en Cycles processeur 360 × 640 à 32 échantillons ;
# sur la machine louée, telle quelle : --engine cycles --gpu --percent 100 --samples 256.
#
# Le port vu de loin (le panorama du pont, de la jetée et de la pointe) : lieux.panorama(port="loin") appelle
# build_port(hidden, lamp_src, far=True), qui ne garde que les grandes formes et les lumières.
#
# Repère : le monde de l'eau de lieux.py. s = y, s = 0 au pied de la rampe du pont ; la berline arrive vers +y,
# x positif à sa droite.
#
#   le terre-plein   x -60..100, y -20..100, dessus à z = 0, mur de quai jusque sous l'eau (-1,5 m)
#   la voie du pont  x -7..7, de y = -20 (fin du tablier) à la voie du quai ; l'axe fermé en y = 80
#   la voie du quai  axe y = 70, 14 m (y 63..77), de x = -7 à x = 87, puis le virage à gauche vers la jetée (x = 80)
#   le virage        à droite, rayon 15 m, entrée en y = 55 sur x = 3,5 : centre (18,5 ; 55)
#
# Pas de chaussée : des lignes ambre usées peintes sur le béton (dans la matière du terre-plein), un virage à angle
# droit, une zone hachurée devant les séparateurs.
#
# Paliers (le film reste montable à chaque palier) : « socle », le quai nu ; « conteneurs » ; « portique ».
# build_port(..., palier=None) prend le dernier palier écrit (PALIER_MAX).
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lieux as L  # noqa: E402

S, road = L.S, L.road

# ---------------------------------------------------------------- les cotes

(X0, X1), (Y0, Y1) = L.PORT_XS, L.PORT_YS          # -60..100, -20..100
QY = L.QUAY_Y                                       # 70 : l'axe de la voie du quai
LANE_HALF = 7.0                                     # les deux voies font 14 m
Q0, Q1 = QY - LANE_HALF, QY + LANE_HALF             # 63..77
JX = L.JETTY_X                                      # 80 : la voie du quai tourne vers la jetée
J_EDGE = 6.7                                        # demi-largeur de la jetée au couronnement (scene_d.J_EDGE)
BRIDGE_EDGE = 9.7                                   # le bord extérieur du parapet du pont, à la fin du tablier
BARRIER_Y = 80.6                                    # la file de séparateurs qui ferme l'axe
TURN_C = (15.5, 61.0)                               # le centre du virage à droite (celui de p5_virage : les arcs de
                                                    # gomme peints au sol sous la glisse de P5 ; P4 et P6 ne voient le
                                                    # terre-plein que de loin, sans ces arcs)
TURN_R = 15.0
COPING_W, COPING_H = 0.6, 0.22
MASTS = [(-52.0, -12.0), (94.0, -12.0), (-52.0, 92.0), (94.0, 92.0),   # les quatre angles (§2.4)
         (32.0, 90.0)]                                                   # le mât derrière la caméra de P5
KEY_MAST = (32.0, 90.0)
TURN_AIM = (6.8, 64.4)                      # là où le projecteur du mât de derrière la caméra est pointé
MAST_H = 25.0

PALIERS = ("socle", "conteneurs", "portique")
PALIER_MAX = "portique"


def _palier_at_least(palier, which):
    return PALIERS.index(palier) >= PALIERS.index(which)


# ---------------------------------------------------------------- la matière du terre-plein

def _line(N, px, py, axis, c, a, b, w=0.075):
    """Une ligne peinte de demi-largeur w : x = c pour y dans [a, b] (axis « x »), ou y = c pour x dans [a, b]."""
    u, v = (px, py) if axis == "x" else (py, px)
    across = road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", u, c)), w - 0.008, w + 0.004))
    along = N.math("MULTIPLY", N.math("GREATER_THAN", v, a), N.math("LESS_THAN", v, b))
    return N.math("MULTIPLY", across, along)


def _dashed(N, line, v, period=9.0, dash=3.0):
    m = N.math("FLOORED_MODULO", v, period)
    return N.math("MULTIPLY", line, N.math("LESS_THAN", m, dash))


DRY_P5 = ((0.3, 71.0), 4.5, 6.5)     # le premier plan de la caméra de P5 sans flaque : centre, rayons de fondu


def mat_terre_plein(name="terre_plein_port", far=False):
    """Le terre-plein : béton balayé (Brushed Concrete 04, lu deux fois et fondu), dalles de 7,5 m aux joints
    sciés et rejointoyés au bitume (rares, parfois vides), une teinte par dalle, quelques dalles refaites, fissures,
    taches d'huile, traces de pneus le long des voies et arcs de pneus dans le virage, flaques irrégulières dans les
    creux, le long des joints et dans les ornières ; les lignes de voie ambre, usées ; une zone hachurée devant les
    séparateurs. Tout en coordonnées monde (le terre-plein est posé à l'origine) : aucune UV.
    `far` : la version vue de loin (une seule lecture de la photo, sans relief)."""
    m, N, out = S.material(name)
    P, _ = road.coords(N)
    px, py, _ = N.sep(P)
    if far:
        uv = road.mapping(N, P, scale=(1 / 2.2,) * 3)
        f = os.path.join(L.ASSETS, "brushed_concrete_04")
        sc = dict(diff=road.tex(N, os.path.join(f, "diff_2k.jpg"), uv),
                  rough=road.tex(N, os.path.join(f, "rough_2k.jpg"), uv, color=False),
                  disp=road.tex(N, os.path.join(f, "disp_2k.png"), uv, color=False))
    else:
        sc = road.scan2(N, P, "brushed_concrete_04", 2.2, rot=0.41)
    # --- les dalles : 7,5 m, joints sciés
    slab = 7.5
    sx, sy = N.math("DIVIDE", px, slab), N.math("DIVIDE", py, slab)
    ix, iy = N.math("FLOOR", sx), N.math("FLOOR", sy)
    fx, fy = N.math("FRACT", sx), N.math("FRACT", sy)
    r, g, b, v = road.hash3(N, ix, iy, 4.3)
    jd = N.math("MULTIPLY", N.math("MINIMUM", N.math("MINIMUM", fx, N.math("SUBTRACT", 1.0, fx)),
                                   N.math("MINIMUM", fy, N.math("SUBTRACT", 1.0, fy))), slab)
    jwob = N.math("MULTIPLY", N.math("SUBTRACT", road.noise(N, P, 3.0, 2.0), 0.5), 0.006)
    joint = road.inv(N, road.smooth(N, N.math("ADD", jd, jwob), 0.012, 0.022))    # 3 à 4 cm : lisible à 360 px
    spall = N.math("MULTIPLY", road.inv(N, road.smooth(N, jd, 0.01, 0.06)),
                   road.smooth(N, road.noise(N, P, 6.0, 3.0, 0.7), 0.6, 0.7))
    redone = N.math("LESS_THAN", r, 0.12)                     # une dalle sur huit refaite, plus claire
    # --- fissures : des courbes de niveau d'un bruit déformé, éparses
    n1 = road.noise(N, P, 0.16, 2.0, 0.5, stretch=(1.0, 0.7, 1.0), dist=0.45)
    n2 = road.noise(N, P, 0.42, 2.0, 0.5, stretch=(0.6, 1.0, 1.0), dist=0.3)
    crack = N.math("MAXIMUM",
                   N.math("MULTIPLY", road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", n1, 0.5)), 0.002, 0.006)),
                          road.smooth(N, road.noise(N, P, 0.05, 2.0), 0.55, 0.62)),
                   N.math("MULTIPLY", road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", n2, 0.5)), 0.0015, 0.004)),
                          road.smooth(N, road.noise(N, P, 0.07, 2.0, dist=1.0), 0.58, 0.64)))
    # --- traces de pneus : le long des voies (en y sur la voie du pont, en x sur la voie du quai)
    on_bridge = road.in_rect(N, px, py, -7.0, 7.0, Y0, Q1, 0.0)
    on_quay = road.in_rect(N, px, py, -7.0, JX + 7.0, Q0, Q1, 0.0)
    ax = N.math("ABSOLUTE", px)
    dyq = N.math("ABSOLUTE", N.math("SUBTRACT", py, QY))
    tb = N.math("MINIMUM", N.math("ABSOLUTE", N.math("SUBTRACT", N.math("FLOORED_MODULO", N.math("ADD", ax, 0.8), 3.5), 1.6)),
                N.math("ABSOLUTE", N.math("SUBTRACT", N.math("FLOORED_MODULO", N.math("SUBTRACT", ax, 0.8), 3.5), 1.6)))
    tq = N.math("MINIMUM", N.math("ABSOLUTE", N.math("SUBTRACT", N.math("FLOORED_MODULO", N.math("ADD", dyq, 0.8), 3.5), 1.6)),
                N.math("ABSOLUTE", N.math("SUBTRACT", N.math("FLOORED_MODULO", N.math("SUBTRACT", dyq, 0.8), 3.5), 1.6)))
    trk_b = N.math("MULTIPLY", road.inv(N, road.smooth(N, tb, 0.05, 0.4)),
                   road.smooth(N, road.noise(N, P, 0.5, 2.0, stretch=(1.0, 0.08, 1.0)), 0.4, 0.62))
    trk_q = N.math("MULTIPLY", road.inv(N, road.smooth(N, tq, 0.05, 0.4)),
                   road.smooth(N, road.noise(N, P, 0.5, 2.0, stretch=(0.08, 1.0, 1.0)), 0.4, 0.62))
    track = N.math("MAXIMUM", N.math("MULTIPLY", trk_b, on_bridge), N.math("MULTIPLY", trk_q, on_quay))
    # les arcs de gomme dans le virage (les tracteurs et les poursuites d'avant), au rayon de 11 à 19 m
    dxc, dyc = N.math("SUBTRACT", px, TURN_C[0]), N.math("SUBTRACT", py, TURN_C[1])
    rad = N.new("ShaderNodeVectorMath", _operation="LENGTH")
    N.link(road.combine(N, dxc, dyc), rad.inputs[0])
    rr = N.math("ADD", rad.outputs["Value"], N.math("MULTIPLY", N.math("SUBTRACT", road.noise(N, P, 0.3, 2.0), 0.5), 1.6))
    quad = N.math("MULTIPLY", N.math("LESS_THAN", dxc, 2.0), N.math("GREATER_THAN", dyc, -6.0))
    arc = N.math("MULTIPLY", road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", N.math("FLOORED_MODULO", rr, 1.7), 0.85)), 0.1, 0.3)),
                 N.math("MULTIPLY", road.smooth(N, rr, 10.5, 12.0), road.inv(N, road.smooth(N, rr, 18.0, 20.0))))
    arc = N.math("MULTIPLY", N.math("MULTIPLY", arc, quad), road.smooth(N, road.noise(N, P, 0.9, 2.0), 0.42, 0.62))
    rubber = N.math("MAXIMUM", N.math("MULTIPLY", track, 0.55), N.math("MULTIPLY", arc, 0.8))
    # --- huile : des taches, plus nombreuses au milieu des voies et devant les séparateurs
    oil = N.math("MULTIPLY", road.smooth(N, road.noise(N, P, 0.9, 3.0, 0.6), 0.66, 0.74),
                 N.math("ADD", 0.25, N.math("MULTIPLY", N.math("MAXIMUM", on_bridge, on_quay), 0.75)))
    # --- les lignes de voie, ambre, et la zone hachurée devant les séparateurs
    W = 0.075
    lines = [
        _line(N, px, py, "x", 6.85, Y0, Q0 + 0.1, W), _line(N, px, py, "x", -6.85, Y0, Q1 - 0.05, W),
        _line(N, px, py, "x", 0.12, Y0 + 1.0, Q0 - 5.0, 0.06), _line(N, px, py, "x", -0.12, Y0 + 1.0, Q0 - 5.0, 0.06),
        _line(N, px, py, "y", Q0 + 0.15, 6.85, JX + 6.85, W), _line(N, px, py, "y", Q1 - 0.15, -6.85, JX - 6.85, W),
        _line(N, px, py, "x", JX + 6.85, Q0 + 0.1, Y1, W), _line(N, px, py, "x", JX - 6.85, Q1 - 0.1, Y1, W),
        _line(N, px, py, "y", QY + 0.12, 12.0, JX - 10.0, 0.06), _line(N, px, py, "y", QY - 0.12, 12.0, JX - 10.0, 0.06),
    ]
    dashes = [_dashed(N, _line(N, px, py, "x", s * 3.5, Y0 + 1.0, Q0 - 5.0, 0.06), py) for s in (-1, 1)]
    dashes += [_dashed(N, _line(N, px, py, "y", QY + s * 3.5, 10.0, JX - 10.0, 0.06), px) for s in (-1, 1)]
    paint = lines[0]
    for l in lines[1:] + dashes:
        paint = N.math("MAXIMUM", paint, l)
    hz = road.in_rect(N, px, py, -6.85, 6.85, Q1 + 0.25, BARRIER_Y - 0.35, 0.0)
    hatch = N.math("LESS_THAN", N.math("FLOORED_MODULO", N.math("ADD", px, py), 1.4), 0.45)
    box = N.math("SUBTRACT", hz, road.in_rect(N, px, py, -6.85, 6.85, Q1 + 0.25, BARRIER_Y - 0.35, -0.1))
    paint = N.math("MAXIMUM", paint, N.math("MAXIMUM", N.math("MULTIPLY", hz, hatch), box))
    paint = N.math("MULTIPLY", paint, road.paint_wear(N, P, sc["disp"], track, None))
    # --- le champ des creux, d'où l'eau (flaques irrégulières : grandes cuvettes, joints, ornières, fissures)
    D = N.math("MULTIPLY", N.math("SUBTRACT", 0.5, road.noise(N, P, 0.045, 3.0, 0.55, dist=0.4)), 11.0)
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", 0.5, road.noise(N, P, 0.35, 3.0, 0.6)), 5.0))
    d4 = road.tex(N, os.path.join(L.ASSETS, "asphalt_04", "disp_2k.png"),
                  road.mapping(N, P, scale=(1 / 4.04,) * 3, rot=(0, 0, 0.3)), color=False)
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", 0.40, d4), 3.0))
    D = N.math("ADD", D, N.math("MULTIPLY", road.inv(N, road.smooth(N, jd, 0.0, 0.35)), 1.2))
    D = N.math("ADD", D, N.math("MULTIPLY", track, 1.6))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", r, 0.5), 1.4))   # chaque dalle a un peu basculé
    if not far:
        # devant l'objectif de P5, de 1 à 10 m, pas de flaque : à 45 cm du sol elles ne renvoyaient que le ciel
        # nocturne, deux trous noirs dans l'axe aux premières images ; le béton y reste mouillé (la pellicule), et
        # la flaque posée sur la ligne des roues (flaque_p5) est un objet à part
        (dcx, dcy), d0, d1 = DRY_P5
        dd = N.new("ShaderNodeVectorMath", _operation="LENGTH")
        N.link(road.combine(N, N.math("SUBTRACT", px, dcx), N.math("SUBTRACT", py, dcy)), dd.inputs[0])
        D = N.math("SUBTRACT", D, N.math("MULTIPLY", road.inv(N, road.smooth(N, dd.outputs["Value"], d0, d1)), 5.0))
    w = road.smooth(N, D, 0.5, 1.05)                      # 0 : humide, 1 : flaque
    deep = road.smooth(N, D, 1.1, 2.2)
    # --- couleur
    col = N.mix(1.0, sc["diff"], (0.5, 0.49, 0.48, 1), "MULTIPLY")
    tint = N.math("ADD", 0.82, N.math("MULTIPLY", v, 0.32))
    col = N.mix(1.0, col, road.combine(N, tint, tint, N.math("ADD", tint, N.math("MULTIPLY", N.math("SUBTRACT", b, 0.5), 0.05))),
                "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", redone, 0.8), col, N.mix(1.0, col, (1.22, 1.2, 1.16, 1), "MULTIPLY"))
    stain = road.smooth(N, road.noise(N, P, 0.12, 4.0, 0.6), 0.45, 0.72)
    col = N.mix(N.math("MULTIPLY", stain, 0.75), col, N.mix(1.0, col, (0.45, 0.43, 0.4, 1), "MULTIPLY"))
    grime = road.smooth(N, road.noise(N, P, 1.1, 5.0, 0.7), 0.5, 0.68)          # salissures plus fines
    col = N.mix(N.math("MULTIPLY", grime, 0.5), col, N.mix(1.0, col, (0.55, 0.53, 0.5, 1), "MULTIPLY"))
    col = N.mix(rubber, col, N.mix(1.0, col, (0.18, 0.18, 0.19, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", oil, 0.85), col, N.mix(1.0, col, (0.28, 0.27, 0.27, 1), "MULTIPLY"))
    col = N.mix(1.0, col, road.grey(N, N.mixf(w, 0.44, 0.26)), "MULTIPLY")
    amber = N.mix(1.0, (0.62, 0.36, 0.09, 1), road.grey(N, N.mixf(road.smooth(N, road.noise(N, P, 1.3, 4.0), 0.35, 0.7), 0.7, 1.0)),
                  "MULTIPLY")
    col = N.mix(paint, col, amber)
    sealant = N.math("MAXIMUM", N.math("MULTIPLY", joint, road.smooth(N, road.noise(N, P, 0.8, 2.0), 0.3, 0.4)), crack)
    col = N.mix(sealant, col, (0.012, 0.012, 0.013, 1))
    col = N.mix(N.math("MULTIPLY", N.math("MAXIMUM", joint, spall), 0.8), col, N.mix(1.0, col, (0.35, 0.35, 0.35, 1), "MULTIPLY"))
    # --- rugosité, normales
    br = N.math("MULTIPLY", sc["rough"], 0.9)
    br = N.mixf(N.math("MULTIPLY", rubber, 0.7), br, 0.45)
    br = N.mixf(oil, br, 0.18)
    br = N.mixf(paint, br, 0.55)
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    if far:
        base_n = road.bump(N, sc["disp"], geo, 0.3, 0.02)
    else:
        base_n = road.finish_normal(N, sc["nor_gl"], 1.0)
    base_n = road.bump(N, N.math("ADD", N.math("MULTIPLY", N.math("MAXIMUM", joint, crack), -1.0),
                                 N.math("MULTIPLY", spall, -0.6)), base_n, 1.0, 0.008)
    base_n = road.bump(N, N.math("MULTIPLY", paint, 0.6), base_n, 1.0, 0.0012)
    # --- la pellicule d'eau
    # hors des flaques la pellicule est mince et cassée par le grain (sinon tout le béton devient miroir)
    cr = N.mixf(road.smooth(N, sc["disp"], 0.45, 0.75), 0.38, 0.6)   # mat hors des flaques : elles tranchent
    cr = N.mixf(N.math("MULTIPLY", road.smooth(N, road.noise(N, P, 0.2, 3.0), 0.4, 0.6), 0.6), cr, 0.6)
    cr = N.mixf(oil, cr, 0.06)
    cr = N.mixf(N.math("POWER", w, 1.4), cr, 0.03)
    rip = road.ripples(N, P)
    pud_n = road.vmix(N, deep, road.vmix(N, 0.3, rip, base_n), rip)
    coat_n = road.vmix(N, road.smooth(N, w, 0.25, 1.0), base_n, pud_n)
    road.wet_shader(N, out, col, br, base_n, cr, coat_n)
    return m


def mat_chevrons(name="chevrons_balise"):
    """Le panneau à chevrons ambre et noirs, sans texte : film rétroréfléchissant usé (un peu d'émission pour
    tenir la place du rétroréfléchissement, que Cycles ne fait pas), coins salis."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    ox, _, oz = N.sep(co)
    ch = N.math("LESS_THAN", N.math("FLOORED_MODULO", N.math("ADD", N.math("MULTIPLY", N.math("ABSOLUTE", ox), 1.0), oz), 0.32), 0.16)
    col = N.mix(ch, (0.012, 0.012, 0.012, 1), (0.95, 0.52, 0.12, 1))
    dirt = road.smooth(N, road.noise(N, co, 4.0, 4.0, 0.6), 0.5, 0.75)
    col = N.mix(N.math("MULTIPLY", dirt, 0.6), col, N.mix(1.0, col, (0.4, 0.38, 0.35, 1), "MULTIPLY"))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.35
    N.link(col, p.inputs["Emission Color"])
    N.link(N.math("MULTIPLY", ch, 0.6), p.inputs["Emission Strength"])
    N.link(p.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------- les pièces de bibliothèque

def _source(rel, name, hidden, scale=1.0, mat=None, rot_z=0.0):
    """Un modèle de bibliothèque ($FILM3D_ASSETS/rel), joint en un objet, remis à l'échelle (`scale` appliqué au
    maillage), origine au centre de l'emprise au sol, rangé dans la collection cachée des sources."""
    parts = S.import_glb(rel)
    ob = S.join(parts, name)
    if scale != 1.0 or rot_z:
        ob.data.transform(Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Scale(scale, 4))
    size = S.recentre(ob)
    if mat is not None:
        ob.data.materials.clear()
        ob.data.materials.append(mat)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    hidden.objects.link(ob)
    print(f"[port] source {name} : {size.x:.2f} × {size.y:.2f} × {size.z:.2f} m", flush=True)
    return ob, size


# ---------------------------------------------------------------- le quai nu

def _edges():
    """Les tronçons de bord de quai (a, b, normale vers l'eau), coupés à la fin du pont et au départ de la jetée."""
    return [
        ((X0, Y0), (-BRIDGE_EDGE, Y0), (0, -1)), ((BRIDGE_EDGE, Y0), (X1, Y0), (0, -1)),
        ((X1, Y0), (X1, Y1), (1, 0)),
        ((X1, Y1), (JX + J_EDGE, Y1), (0, 1)), ((JX - J_EDGE, Y1), (X0, Y1), (0, 1)),
        ((X0, Y1), (X0, Y0), (-1, 0)),
    ]


def _remove_bridge_flat():
    """Le pont pose sa chaussée jusqu'en y = 100 sur le terre-plein (scene_c, « pont_port ») : le port dessine
    lui-même ses voies sur le béton (le virage, l'axe fermé), il l'enlève s'il la trouve."""
    gone = [o for o in bpy.data.objects if o.name.startswith("pont_port_")]
    for o in gone:
        bpy.data.objects.remove(o, do_unlink=True)
    return len(gone)


def build_quay(hidden, far=False):
    """Le terre-plein, son mur de quai et son couronnement ; près : bittes d'amarrage et pneus de défense."""
    top = -0.06 if far else 0.0           # de loin, sous la chaussée du pont que les plans P4 posent par-dessus
    tp = bpy.data.materials.get("terre_plein_port_loin" if far else "terre_plein_port") or \
        mat_terre_plein("terre_plein_port_loin" if far else "terre_plein_port", far=far)
    bm = L.bmesh.new()
    vs = [bm.verts.new((x, y, top)) for x, y in ((X0, Y0), (X1, Y0), (X1, Y1), (X0, Y1))]
    bm.faces.new(vs)
    slab = L.mesh_object("port_terre_plein", bm, [tp])
    wall = bpy.data.materials.get("quai_pierre") or L.mat_quay("quai_pierre")
    cop = bpy.data.materials.get("couronnement") or L.mat_coping("couronnement")
    bw, bc = L.bmesh.new(), L.bmesh.new()
    for (a, b, n) in [((X0, Y0), (X1, Y0), (0, -1)), ((X1, Y0), (X1, Y1), (1, 0)), ((X1, Y1), (X0, Y1), (0, 1)),
                      ((X0, Y1), (X0, Y0), (-1, 0))]:
        v = [bw.verts.new((a[0], a[1], COPING_H)), bw.verts.new((b[0], b[1], COPING_H)),
             bw.verts.new((b[0], b[1], L.WATER_Z - 1.5)), bw.verts.new((a[0], a[1], L.WATER_Z - 1.5))]
        f = bw.faces.new(v)
        f.normal_update()
        if f.normal.dot(Vector((n[0], n[1], 0))) < 0:
            f.normal_flip()
    for (a, b, n) in _edges():                     # le couronnement : une bande de 0,6 m côté terre
        x0, x1 = sorted((a[0], b[0]))
        y0, y1 = sorted((a[1], b[1]))
        if n[1]:                                   # bord nord ou sud : la bande court en x
            y0, y1 = sorted((y0, y0 - n[1] * COPING_W))
        else:
            x0, x1 = sorted((x0, x0 - n[0] * COPING_W))
        L.box_bm(bc, (x0, y0, top), (x1, y1, COPING_H))
    L.mesh_object("port_mur", bw, [wall]).visible_shadow = not far
    L.mesh_object("port_couronnement", bc, [cop])
    slab.visible_shadow = False
    return slab


def build_props(hidden):
    """Les bittes d'amarrage doubles sur le couronnement (une tous les 15 m) et les pneus de défense pendus au mur
    (un tous les 7,5 m), modèles de bibliothèque instanciés."""
    iron = bpy.data.materials.get("fonte_bornes") or L.mat_steel("fonte_bornes", color=(0.05, 0.05, 0.055), rough=0.45,
                                                                  rust=0.45, paint=True)
    bol, _ = _source(os.path.join("lieux", "port", "bollard-double", "model.glb"), "src_bitte", hidden, scale=1.8, mat=iron)
    tyre, _ = _source(os.path.join("lieux", "port", "old-tyre", "old_tyre.gltf"), "src_pneu", hidden, scale=1.7)
    nb = nt = 0
    for (a, b, n) in _edges():
        a, b = Vector((*a, 0)), Vector((*b, 0))
        d = b - a
        length = d.length
        d.normalize()
        nn = Vector((n[0], n[1], 0))
        rot = math.atan2(d.y, d.x)
        k = 6.0
        while k < length - 4.0:
            p = a + d * k - nn * (COPING_W * 0.5)
            S.instance(bol, f"bitte_{nb}", (p.x, p.y, COPING_H), rot)
            nb += 1
            k += 15.0
        k = 3.0
        while k < length - 2.0:
            p = a + d * k + nn * 0.2
            S.instance(tyre, f"pneu_{nt}", (p.x, p.y, -1.15), rot)
            nt += 1
            k += 7.5
    print(f"[port] {nb} bittes d'amarrage, {nt} pneus de défense", flush=True)


def build_masts(far=False):
    """Les mâts d'éclairage de 25 m : fût conique, couronne de six projecteurs ambre, un spot large par mât."""
    steel = bpy.data.materials.get("mat_port_acier") or L.mat_steel("mat_port_acier", color=(0.42, 0.44, 0.45),
                                                                     rough=0.4, rust=0.2)
    head = bpy.data.materials.get("mat_port_tete") or L.emit_mat("mat_port_tete", L.lin(L.S.LAMPE), L.S.LAMPE_TETE)
    plinth = bpy.data.materials.get("parapet") or L.mat_concrete("parapet", tint=(0.66, 0.64, 0.6), streaks=1.4, scale=0.6)
    bm, hb, pb = L.bmesh.new(), L.bmesh.new(), L.bmesh.new()
    for i, (x, y) in enumerate(MASTS):
        L.box_bm(pb, (x - 0.7, y - 0.7, 0.0), (x + 0.7, y + 0.7, 0.55))
        L.bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.34, radius2=0.17, depth=MAST_H - 0.55,
                                matrix=Matrix.Translation((x, y, 0.55 + (MAST_H - 0.55) / 2)))
        if not far:
            for t in range(4):                          # l'anneau de la couronne
                a0, a1 = t * math.tau / 4 + math.pi / 4, (t + 1) * math.tau / 4 + math.pi / 4
                L.tube_bm(bm, (x + 1.5 * math.cos(a0), y + 1.5 * math.sin(a0), MAST_H),
                          (x + 1.5 * math.cos(a1), y + 1.5 * math.sin(a1), MAST_H), 0.06, seg=6)
        for k in range(6):                              # six projecteurs inclinés vers le sol, glace vers le bas
            a = k * math.tau / 6
            c = Vector((x + 1.6 * math.cos(a), y + 1.6 * math.sin(a), MAST_H - 0.25))
            L.box_bm(bm, (c.x - 0.32, c.y - 0.32, c.z), (c.x + 0.32, c.y + 0.32, c.z + 0.3))
            L.box_bm(hb, (c.x - 0.27, c.y - 0.27, c.z - 0.03), (c.x + 0.27, c.y + 0.27, c.z + 0.005))
        # les projecteurs d'un mât sont pointés : vers le milieu du terre-plein, et celui de derrière la caméra de
        # P5 sur le virage (la lumière de face de la berline, sinon à contre-jour du projecteur de l'hélicoptère)
        key = (x, y) == KEY_MAST
        Ld = bpy.data.lights.new(f"mat_port_{i}", "SPOT")
        Ld.energy = L.S.lampe_w(MAST_H)                 # un lampadaire de 25 m (lumière v3.1, règle E)
        Ld.color = L.lin(L.S.LAMPE)[:3]
        Ld.spot_size = math.radians(50 if key else 125)
        Ld.spot_blend = 0.45 if key else 0.7
        Ld.shadow_soft_size = 1.2
        lo = bpy.data.objects.new(Ld.name, Ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = (x, y, MAST_H - 0.5)
        tgt = Vector((*TURN_AIM, 0.0)) if key else Vector((20.0, 40.0, 0.0))
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = (tgt - Vector(lo.location)).to_track_quat("-Z", "Y")
    L.mesh_object("port_mats", bm, [steel])
    o = L.mesh_object("port_mats_tetes", hb, [head])
    o.visible_shadow = False
    L.mesh_object("port_mats_socles", pb, [plinth])


def build_barrier(hidden, far=False):
    """L'axe fermé en y = 80,6 : une file de séparateurs en béton (Poly Haven) de bord à bord de la voie du pont,
    des panneaux à chevrons ambre sans texte sur des potelets, et des feux à éclats ambre (figés allumés)."""
    xs = (-7.6, 7.6)
    lamp = bpy.data.materials.get("balise_feu") or L.emit_mat("balise_feu", L.lin("#ffb03a"), 80.0)
    if far:
        conc = bpy.data.materials.get("parapet") or L.mat_concrete("parapet", tint=(0.66, 0.64, 0.6), streaks=1.4, scale=0.6)
        bm = L.bmesh.new()
        L.box_bm(bm, (xs[0], BARRIER_Y - 0.3, 0.0), (xs[1], BARRIER_Y + 0.3, 0.82))
        L.mesh_object("port_separateurs", bm, [conc])
        bm = L.bmesh.new()
        for x in (-6.0, -2.0, 2.0, 6.0):
            L.bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=0.12,
                                        matrix=Matrix.Translation((x, BARRIER_Y, 1.75)))
        L.mesh_object("port_balises_feux", bm, [lamp]).visible_shadow = False
        return
    src, size = _source(os.path.join("cast", "barrier-ph01", "concrete_road_barrier.gltf"), "src_separateur", hidden)
    rot = 0.0 if size.x >= size.y else math.pi / 2       # le long côté en travers de l'axe (x)
    seg = max(size.x, size.y)
    n = int(math.ceil((xs[1] - xs[0]) / (seg + 0.05)))
    for i in range(n):
        x = xs[0] + (i + 0.5) * (xs[1] - xs[0]) / n
        S.instance(src, f"separateur_{i}", (x, BARRIER_Y + (0.08 if i % 2 else -0.05), 0.0), rot + (0.02 if i % 3 else -0.015))
    h = min(size.z, 1.2)
    chev = bpy.data.materials.get("chevrons_balise") or mat_chevrons()
    post = bpy.data.materials.get("mat_port_acier") or L.mat_steel("mat_port_acier", color=(0.42, 0.44, 0.45), rough=0.4, rust=0.2)
    pb, fb, lb = L.bmesh.new(), L.bmesh.new(), L.bmesh.new()
    for x in (-6.0, -2.0, 2.0, 6.0):
        for dx in (-0.45, 0.45):
            L.tube_bm(pb, (x + dx, BARRIER_Y - 0.12, h - 0.05), (x + dx, BARRIER_Y - 0.12, h + 0.95), 0.025, seg=8)
        L.bmesh.ops.create_uvsphere(lb, u_segments=10, v_segments=6, radius=0.09,
                                    matrix=Matrix.Translation((x, BARRIER_Y - 0.12, h + 1.08)))
        Ld = bpy.data.lights.new(f"balise_{x:.0f}", "POINT")
        Ld.energy = 60.0
        Ld.color = L.lin("#ffb03a")[:3]
        Ld.shadow_soft_size = 0.09
        lo = bpy.data.objects.new(Ld.name, Ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = (x, BARRIER_Y - 0.3, h + 1.08)
    L.mesh_object("port_potelets", pb, [post])
    L.mesh_object("port_balises_feux", lb, [lamp]).visible_shadow = False
    # les panneaux : chacun son objet, pour que les chevrons pointent depuis son milieu (coordonnées objet)
    for i, x in enumerate((-6.0, -2.0, 2.0, 6.0)):
        bm = L.bmesh.new()
        L.box_bm(bm, (-0.6, -0.015, -0.25), (0.6, 0.015, 0.25))
        o = L.mesh_object(f"port_chevrons_{i}", bm, [chev])
        o.location = (x, BARRIER_Y - 0.16, h + 0.62)


# ---------------------------------------------------------------- les conteneurs (palier « conteneurs »)

# les six aplats du film, un peu rabattus (une tôle peinte au soleil et au sel n'a pas la saturation d'un écran)
BOX_COLORS = {"corail": "#e35e38", "prune": "#4b2f54", "ambre": "#e8b25f", "indigo": "#4b4fb8",
              "marine": "#243152", "creme": "#ece4b8"}
BOX_MIX = ["marine"] * 4 + ["prune"] * 3 + ["corail"] * 3 + ["indigo"] * 2 + ["ambre"] * 2 + ["creme"]
# vus de près (P5, la caméra au sol au pied des piles), les mêmes teintes rabattues vers le gris et assombries :
# des couleurs sourdes, la berline reste la seule couleur franche du cadre
BOX_MUTED = {"corail": "#8a4a3a", "prune": "#3e2f45", "ambre": "#8c7650", "indigo": "#3d4166",
             "marine": "#263040", "creme": "#9a957e"}
BOX_GAP = 0.12                     # le jeu entre deux conteneurs posés bout à bout ou côte à côte
BOX_TYPES = {"40": "40 Standard", "20": "20 Standard", "40hc": "40 High Cube"}


def mat_container(name="conteneur_tole", frame=False):
    """La tôle ondulée peinte des conteneurs : la teinte vient de la couleur de l'objet (une instance, un aplat),
    passée au soleil vers le haut, coulures de rouille et de crasse plus fortes sous le toit, rouille en plaques et
    au ras du sol, voile de sel, humide (vernis mince, plus net et perlé de gouttes sur le toit). `frame` : les
    cornières et les longerons, de la même peinture, plus sombres et plus rouillés. Chaque instance a ses taches
    (le hasard de l'objet décale les bruits)."""
    m, N, out = S.material(name)
    oi = N.new("ShaderNodeObjectInfo")
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    rnd = oi.outputs["Random"]
    off = road.combine(N, N.math("MULTIPLY", rnd, 71.0), N.math("MULTIPLY", rnd, 37.0), 0.0)
    av = N.new("ShaderNodeVectorMath", _operation="ADD")
    N.link(co, av.inputs[0])
    N.link(off, av.inputs[1])
    P = av.outputs[0]
    _, _, oz = N.sep(co)
    geo = N.new("ShaderNodeNewGeometry")
    _, _, nz = N.sep(geo.outputs["Normal"])
    col = N.mix(1.0, oi.outputs["Color"], (0.82, 0.82, 0.82, 1), "MULTIPLY")
    # passé au soleil : plus clair et plus gris vers le toit
    sun = N.math("MULTIPLY", road.smooth(N, oz, 0.6, 2.7), N.math("ADD", 0.12, N.math("MULTIPLY", rnd, 0.18)))
    col = N.mix(sun, col, N.mix(0.5, col, (0.55, 0.53, 0.5, 1)))
    # coulures : un bruit très étiré en z, plus fort sous le toit
    st = road.smooth(N, road.noise(N, P, 2.2, 3.0, 0.6, stretch=(1.0, 1.0, 0.05)), 0.55, 0.72)
    st = N.math("MULTIPLY", st, N.math("ADD", 0.35, N.math("MULTIPLY", road.smooth(N, oz, 1.2, 2.6), 0.65)))
    col = N.mix(N.math("MULTIPLY", st, 0.7), col, N.mix(1.0, col, (0.42, 0.33, 0.27, 1), "MULTIPLY"))
    # rouille : des plaques, et une bande au ras du sol
    amt = 0.42 if frame else 0.22
    rn = road.smooth(N, road.noise(N, P, 1.4, 6.0, 0.7), 0.64, 0.7)
    rb = road.inv(N, road.smooth(N, oz, 0.0, 0.35))
    rust = N.math("MINIMUM", N.math("ADD", N.math("MULTIPLY", rn, amt * 2.4), N.math("MULTIPLY", rb, amt)), 1.0)
    rust_col = N.mix(road.noise(N, P, 9.0, 3.0), (0.09, 0.03, 0.012, 1), (0.2, 0.075, 0.025, 1))
    col = N.mix(rust, col, rust_col)
    # voile de sel et de poussière, plus clair, en larges nuages
    salt = road.smooth(N, road.noise(N, P, 0.35, 4.0), 0.5, 0.75)
    col = N.mix(N.math("MULTIPLY", salt, 0.25), col, (0.5, 0.49, 0.46, 1))
    if frame:
        col = N.mix(1.0, col, (0.7, 0.7, 0.7, 1), "MULTIPLY")
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.mixf(rust, N.mixf(road.noise(N, P, 4.0, 3.0), 0.4, 0.62), 0.85), p.inputs["Roughness"])
    top = road.smooth(N, nz, 0.6, 0.9)
    dn, _ = S.droplets(N, P, 18.0, size=0.4, strength=0.6)
    p.inputs["Coat Weight"].default_value = 0.55
    p.inputs["Coat IOR"].default_value = 1.33
    N.link(N.mixf(top, 0.32, 0.08), p.inputs["Coat Roughness"])
    N.link(road.vmix(N, top, geo.outputs["Normal"], dn), p.inputs["Coat Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def container_sources(hidden):
    """Les conteneurs de bibliothèque (container-sizes : vraie tôle ondulée, sans texture, à l'échelle), un par
    type : la coque et le cadre joints, l'intérieur retiré (portes fermées, il ne se voit pas) ; longueur selon y,
    origine au sol au centre, rangés dans la collection cachée. Renvoie {type: (source, longueur, largeur,
    hauteur)}."""
    import cast_vehicles as cv
    parts = cv.import_model(os.path.join(L.ASSETS, "lieux", "port", "container-sizes", "model.glb"))
    shell = bpy.data.materials.get("conteneur_tole") or mat_container()
    frame = bpy.data.materials.get("conteneur_cadre") or mat_container("conteneur_cadre", frame=True)
    names = [o.name for o in parts]                  # par nom : la jointure et les retraits invalident les objets
    out = {}
    for key, tag in BOX_TYPES.items():
        keep = []
        for nm in [nm for nm in names if nm.startswith(tag + "_")]:
            o = bpy.data.objects[nm]
            names.remove(nm)
            mats = [m.name.split(".")[0] for m in o.data.materials if m]
            if "Blue" in mats:
                bpy.data.objects.remove(o, do_unlink=True)
                continue
            o.data.materials.clear()
            o.data.materials.append(frame if "Black" in mats else shell)
            keep.append(o)
        ob = cv.join(keep, f"src_conteneur_{key}")
        dims = S.recentre(ob)
        if dims.x > dims.y:                          # la longueur selon y
            ob.data.transform(Matrix.Rotation(math.pi / 2, 4, "Z"))
            dims = S.recentre(ob)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        hidden.objects.link(ob)
        out[key] = (ob, dims.y, dims.x, dims.z)
        print(f"[port] conteneur {key} : {dims.y:.2f} × {dims.x:.2f} × {dims.z:.2f} m, {len(ob.data.polygons)} faces",
              flush=True)
    for nm in names:                                 # les longueurs non retenues (10', 45')
        bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
    return out


def mat_stencil(name="pochoir"):
    """Le numéro au pochoir : peinture crème usée, mangée par plaques (détourée là où elle manque)."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    keep = road.smooth(N, road.noise(N, co, 14.0, 4.0, 0.7), 0.3, 0.36)
    p = S.principled(N, **{"Base Color": (0.62, 0.6, 0.5, 1), "Roughness": 0.55})
    N.link(keep, p.inputs["Alpha"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def stencil_number(text, name, size=0.32):
    """Un numéro neutre de cinq chiffres en maillage (la police par défaut de Blender), debout, face vers -y,
    son coin bas droit à l'origine."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "RIGHT"
    cu.space_character = 1.1
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    me.materials.append(bpy.data.materials.get("pochoir") or mat_stencil())
    mo = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(mo)
    mo.visible_shadow = False
    return mo


class Yard:
    """Pose les conteneurs (instances liées des sources : un seul maillage par type), un aplat de la palette par
    conteneur, et un numéro sur ceux qui sont près de la caméra (`numbers_near` : (point, rayon))."""

    def __init__(self, srcs, seed=11, numbers_near=None, colors=None):
        import random
        self.srcs, self.rng, self.near = srcs, random.Random(seed), numbers_near
        self.colors = colors or BOX_COLORS
        self.n = self.nums = 0

    def box(self, key, x, y, z, along_x=False):
        src, length, width, height = self.srcs[key]
        rot = (math.pi / 2 if along_x else 0.0) + math.radians(self.rng.uniform(-0.6, 0.6))
        ob = S.instance(src, f"conteneur_{self.n}", (x + self.rng.uniform(-0.04, 0.04), y + self.rng.uniform(-0.04, 0.04),
                                                      z), rot)
        ob.color = (*L.lin(self.colors[self.rng.choice(BOX_MIX)])[:3], 1.0)
        self.n += 1
        if self.near and (Vector((x, y)) - Vector(self.near[0])).length < self.near[1] and self.rng.random() < 0.75:
            self.number(ob, length, width, height)
        return height

    def number(self, ob, length, width, height):
        """Le même numéro en haut à droite des deux longs côtés."""
        txt = f"{self.rng.randint(10000, 99999)}"
        for side in (-1, 1):
            t = stencil_number(txt, f"numero_{self.nums}")
            self.nums += 1
            t.parent = ob
            # repère du conteneur : longueur selon y, long côté en x = side × largeur / 2, face vers l'extérieur
            t.location = (side * (width / 2 + 0.015), -side * (length / 2 - 0.45), height - 0.62)
            t.rotation_euler = (0.0, 0.0, -side * math.pi / 2)

    def row(self, x, y, keys, tiers, along_x=False, top_gaps=0.2):
        """Une file de baies le long de y (ou de x), chacune empilée sur `tiers` niveaux (un couple : au hasard
        entre les deux), le dernier niveau parfois absent (`top_gaps`). Un 40 pieds sur trois est un haut."""
        pos = x if along_x else y
        for k in keys:
            length = self.srcs[k][1]
            c = pos + length / 2
            lo, hi = tiers if isinstance(tiers, tuple) else (tiers, tiers)
            n = self.rng.randint(lo, hi)
            if n > 1 and self.rng.random() < top_gaps:
                n -= 1
            z = 0.0
            for _ in range(n):
                kk = "40hc" if (k == "40" and self.rng.random() < 0.3) else k
                z += self.box(kk, c, y, z, along_x=True) if along_x else self.box(kk, x, c, z)
            pos += length + BOX_GAP


def build_containers(hidden, far=False, numbers_near=None):
    """Les piles du §2.4 : deux murs de part et d'autre de la voie du pont, en retrait de 3 m (le droit de s = 10
    à 53 ; le gauche raccourci à s = 10..34, sinon il cache la meute depuis la caméra de P5), un mur qui ferme
    l'axe derrière les séparateurs (60 m), et des piles de deux à trois de haut ailleurs, pour la vue de P6. Les
    deux murs montent à quatre et cinq (14 m) : vus à 35-60 m par la caméra de P5, trois niveaux n'atteignaient
    que 13° au-dessus de l'horizon et laissaient le haut du cadre vide."""
    srcs = container_sources(hidden)
    yd = Yard(srcs, numbers_near=None if far else numbers_near, colors=BOX_COLORS if far else BOX_MUTED)
    W = srcs["40"][2] + BOX_GAP
    for i in range(2):                               # le mur droit (x < 0, à gauche de la voiture qui arrive)
        yd.row(-10.0 - W / 2 - i * W, 10.0, ["40", "20", "40", "40"], (4, 5) if i == 0 else 4, top_gaps=0.12)
    for i in range(2):                               # le mur droit prolongé au nord jusqu'à la file qui ferme l'axe :
        # dans l'axe du panoramique de P5, il tient le haut du cadre et l'hélicoptère en sort
        yd.row(-10.0 - W / 2 - i * W, 54.0, ["40", "40"], (4, 5), top_gaps=0.1)
    for i in range(2):                               # le mur gauche (x > 0), raccourci
        yd.row(10.0 + W / 2 + i * W, 10.0, ["40", "40"], (4, 5), top_gaps=0.15)
    yd.row(-30.0, BARRIER_Y + 3.6, ["40", "40", "20", "40", "40"], 3, along_x=True, top_gaps=0.15)
    for i in range(4):                               # à l'ouest de la voie du pont, derrière le portique
        yd.row(-24.0 - i * (W + 1.2), 10.0, ["40", "40", "20", "40"], (2, 3), top_gaps=0.3)
    for i in range(3):                               # à l'est
        yd.row(30.0 + i * (W + 1.5), -10.0, ["40", "40", "20", "40", "40"], (2, 3), top_gaps=0.3)
    for i in range(2):                               # au nord-est, derrière la voie du quai
        yd.row(38.0, 88.0 + i * W, ["40", "40"], 2, along_x=True, top_gaps=0.3)
    print(f"[port] {yd.n} conteneurs (instances liées de {len(srcs)} sources), {yd.nums // 2} numéros", flush=True)
    return yd.n


# ---------------------------------------------------------------- le portique (palier « portique »)

GANTRY_X = (-24.4, -11.0)          # les deux cadres de jambes (§2.4 : x de -25 à -7 ; le cadre côté voie recule
                                   # à -11, sinon sa jambe côté eau tombe sur le trottoir de la rampe)
GANTRY_Y = (-7.0, 7.0)             # la jambe côté eau, la jambe côté terre (s de -7 à 7)
GIRDER_Z = 24.0                    # le dessus des jambes, la poutre de roulement du chariot
BOOM_L, BOOM_A = 20.5, 74.0        # la flèche relevée sur l'eau : longueur, angle sur l'horizontale (pointe à 45 m)
# (12 novembre, nuit) le portique est glissé au bord nord du terre-plein, tourné d'un demi-tour (la flèche sur l'eau
# du nord) : jambes en x -24 et -10,6, en y 81 et 95, à cheval sur la file de conteneurs qui ferme l'axe. La fin du
# panoramique de P5 cadre ses jambes et sa poutre, le faisceau entre elles. Dessiné au sud, puis posé par ce demi-tour.
GANTRY_POSE = (-35.0, 88.0, 180.0)


def _gantry_light(name, kind, loc, color, energy, size=0.2, aim=None, spot=70.0):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = L.lin(color)[:3]
    d.shadow_soft_size = size
    if kind == "SPOT":
        d.spot_size = math.radians(spot)
        d.spot_blend = 0.6
    lo = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(lo)
    lo.location = loc
    if aim is not None:
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y")
    return lo


def build_gantry(far=False):
    """Le portique de quai à conteneurs, écrit faute de modèle libre au niveau (§2.4 : 45 m, flèche relevée, à
    gauche de la voie du pont, au bord sud du terre-plein) : deux cadres de jambes sur bogies, reliés par les
    poutres de portail ; la poutre de roulement et son arrière-bec côté terre, la salle des machines dessus ; la
    flèche relevée sur l'eau, en deux membrures entretoisées ; le chevalement au-dessus des jambes côté eau, ses
    tirants vers la flèche et vers l'arrière-bec ; la cabine sous la poutre, sa vitre allumée. Feux de balisage
    ambre aux extrémités, le feu corail fixe en tête de flèche, deux projecteurs crème sous la poutre (le pied de
    la rampe et la brume). À 80 m et à contre-jour, la silhouette suffit : aucun mot ni logo, une seule matière."""
    steel = bpy.data.materials.get("portique_acier") or L.mat_steel("portique_acier", color=(0.30, 0.32, 0.34),
                                                                    rough=0.45, rust=0.3, paint=True)
    amber = bpy.data.materials.get("portique_feu_ambre") or L.emit_mat("portique_feu_ambre", L.lin(L.AMBER), 30.0)
    coral = bpy.data.materials.get("portique_feu_corail") or L.emit_mat("portique_feu_corail", L.lin(L.CORAL), 40.0)
    glass = bpy.data.materials.get("portique_vitre") or L.emit_mat("portique_vitre", L.lin("#ffe2b0"), 2.5)
    bm, fb = L.bmesh.new(), L.bmesh.new()
    xa, xb = GANTRY_X
    yw, yl = GANTRY_Y
    zg, leg = GIRDER_Z, 0.7
    top = zg + 2.2                                  # le dessus des poutres de roulement
    back = yl + 12.0                                # le bout de l'arrière-bec
    for x in (xa, xb):
        for y in (yw, yl):
            L.box_bm(bm, (x - leg, y - leg, 0.0), (x + leg, y + leg, zg))          # les jambes
            L.box_bm(bm, (x - 1.0, y - 1.8, 0.0), (x + 1.0, y + 1.8, 1.3))        # les bogies sur rail
        L.box_bm(bm, (x - 0.55, yw, 12.0), (x + 0.55, yl, 13.3))                   # la traverse basse
        L.tube_bm(bm, (x, yw + leg, 13.3), (x, yl - leg, zg - 0.3), 0.28, seg=6)   # la croix du cadre
        L.tube_bm(bm, (x, yl - leg, 13.3), (x, yw + leg, zg - 0.3), 0.28, seg=6)
        L.box_bm(bm, (x - 0.8, yw - 2.5, zg), (x + 0.8, back, top))                 # la poutre et l'arrière-bec
        # le chevalement : un A au-dessus de la jambe côté eau
        apex = (x, yw + 1.5, zg + 11.0)
        L.tube_bm(bm, (x, yw - 1.5, top), apex, 0.4, seg=6)
        L.tube_bm(bm, (x, yw + 4.5, top), apex, 0.4, seg=6)
        # la flèche relevée : une membrure par cadre, de la charnière à la pointe
        hinge = Vector((x, yw - 2.5, zg + 1.0))
        a = math.radians(BOOM_A)
        tip = hinge + Vector((0.0, -math.cos(a) * BOOM_L, math.sin(a) * BOOM_L))
        L.tube_bm(bm, hinge, tip, 0.5, seg=4)
        for f in (0.55, 1.0):                                                        # les tirants avant
            L.tube_bm(bm, apex, hinge.lerp(tip, f), 0.12, seg=4)
        L.tube_bm(bm, apex, (x, back - 0.5, top), 0.14, seg=4)                       # le tirant arrière
        for z, y in ((zg + 11.3, yw + 1.5), (tip.z + 0.4, tip.y)):                  # les feux ambre en tête
            L.box_bm(fb, (x - 0.22, y - 0.22, z - 0.22), (x + 0.22, y + 0.22, z + 0.22))
        L.box_bm(fb, (x - 0.22, back - 0.22, top), (x + 0.22, back + 0.22, top + 0.44))
    for y in (yw, yl):                                                               # les poutres de portail
        L.box_bm(bm, (xa - leg, y - 0.7, zg - 1.6), (xb + leg, y + 0.7, zg))
    L.tube_bm(bm, (xa, yw + 1.5, zg + 11.0), (xb, yw + 1.5, zg + 11.0), 0.3, seg=6)  # le haut du chevalement
    # l'entretoisement de la flèche : traverses et croix entre les deux membrures
    a = math.radians(BOOM_A)
    fs = (0.1, 0.32, 0.54, 0.76, 0.98)
    pts = [Vector((0.0, yw - 2.5 - math.cos(a) * BOOM_L * f, zg + 1.0 + math.sin(a) * BOOM_L * f)) for f in fs]
    for i, p in enumerate(pts):
        L.tube_bm(bm, (xa, p.y, p.z), (xb, p.y, p.z), 0.25, seg=4)
        if i:
            q = pts[i - 1]
            L.tube_bm(bm, (xa, q.y, q.z), (xb, p.y, p.z), 0.14, seg=4)
            L.tube_bm(bm, (xb, q.y, q.z), (xa, p.y, p.z), 0.14, seg=4)
    L.box_bm(bm, (xa - 0.4, yl + 3.0, top), (xb + 0.4, yl + 11.0, top + 3.6))        # la salle des machines
    L.box_bm(bm, (xa + 0.9, -1.5, top), (xb - 0.9, 2.5, top + 1.1))                   # le chariot
    cab = (xb - 4.2, xb - 1.2, -0.5, 2.3, zg - 3.4, zg - 0.4)                          # la cabine pendue
    L.box_bm(bm, (cab[0], cab[2], cab[4]), (cab[1], cab[3], cab[5]))
    L.box_bm(fb, (cab[0] + 0.2, cab[2] - 0.03, cab[4] + 0.8), (cab[1] - 0.2, cab[2], cab[5] - 0.4), mat=2)
    L.mesh_object("portique", bm, [steel])
    lamps = L.mesh_object("portique_feux", fb, [amber, coral, glass])
    lamps.visible_shadow = False
    # le feu corail fixe en tête de flèche, au milieu de la traverse de pointe
    p = pts[-1]
    tb = L.bmesh.new()
    L.box_bm(tb, ((xa + xb) / 2 - 0.3, p.y - 0.3, p.z + 0.3), ((xa + xb) / 2 + 0.3, p.y + 0.3, p.z + 0.9))
    L.mesh_object("portique_feu_tete", tb, [coral]).visible_shadow = False
    _gantry_light("portique_tete", "POINT", ((xa + xb) / 2, p.y, p.z + 1.2), L.CORAL, 600.0)
    if not far:
        for x in (xa, xb):
            _gantry_light(f"portique_balise_{x:.0f}", "POINT", (x, yw + 1.5, zg + 11.6), L.AMBER, 150.0)
        for x in (xa + 3.0, xb - 3.0):                # les projecteurs sous la poutre, vers le pied de la rampe
            # discrets : à 25 kW ils remplissaient le portique de brume blanche et sa silhouette disparaissait
            _gantry_light(f"portique_projecteur_{x:.0f}", "SPOT", (x, 0.0, zg - 0.6), "#fff2d6", 6000.0,
                          size=0.5, aim=(x * 0.4, -2.0, 0.0), spot=60.0)
    pose = bpy.data.objects.new("portique_pose", None)
    bpy.context.scene.collection.objects.link(pose)
    pose.location = (GANTRY_POSE[0], GANTRY_POSE[1], 0.0)
    pose.rotation_euler = (0.0, 0.0, math.radians(GANTRY_POSE[2]))
    for ob in list(bpy.data.objects):
        if ob is not pose and ob.parent is None and ob.name.startswith("portique"):
            ob.parent = pose
    print(f"[port] portique : jambes dessinées en x {xa:.0f} et {xb:.0f}, posées en ({GANTRY_POSE[0]:.0f}, "
          f"{GANTRY_POSE[1]:.0f}) tournées de {GANTRY_POSE[2]:.0f}°, poutre à {zg:.0f} m, pointe de flèche à "
          f"{p.z:.0f} m", flush=True)


# ---------------------------------------------------------------- le côté est (ce que regarde la caméra de P5)

# Le découpage v2 pose la caméra de P5 au sol en (0, 76) : elle commence face au sud (la voie du pont, la rampe, le
# pylône) et finit vers l'est-sud-est, au-dessus de la berline qui s'éloigne, sur l'hélicoptère. Là, le terre-plein
# était vide. Trois plans de profondeur, à hauteur de voiture : près, le mobilier du virage (la chaîne de l'axe, la
# flaque, les caisses de la sortie ; fûts et palettes au pied des piles) ; à 25-75 m, deux blocs de piles de
# conteneurs en couleurs sourdes ; à 90-130 m, deux grues à portail sur le quai est et un
# cargo à quai, en silhouette, leurs feux ; au loin, l'eau et une rive basse semée de feux. Rien n'y est écrit :
# toutes les matières livrées des modèles sont remplacées. Seulement pour P5 (build_port près) : la vue de loin du
# port (lieux.port_far, pour P4 et P6) ne change pas.

EAST_ROWS = [                      # (y de la file, x de départ, baies, niveaux) : files le long de x, au sud de la voie
    (56.6, 25.0, ["40", "20", "40", "40"], (3, 5)),
    (54.0, 25.0, ["40", "40", "20", "40"], (4, 5)),
    (49.6, 31.0, ["40", "40", "40", "20"], (2, 4)),
    (47.0, 31.0, ["20", "40", "40", "40"], (2, 3)),
]
# les grues à portail du quai est (64 m, rails selon y, flèche au repos le long du quai) : la première à droite
# de l'hélicoptère dans le cadre final, la seconde traverse le cadre pendant le panoramique. Pas plus au nord :
# leurs rails entreraient dans la voie du quai (y 63), et une grue derrière l'hélicoptère le noierait.
PORTAL_CRANES = [(91.5, 40.0), (91.5, 8.0)]
PORTAL_YAW = (0.0, 180.0)
SHIP_AT = (114.0, -4.0)            # le cargo à quai, le long du quai est (127 m)
SHIP_ROT = 90.0                    # livré la longueur selon x
SHIP_DRAFT = 7.0                   # la quille sous l'eau (la coque fait 13,7 m)
# la chaîne de l'axe, la flaque et les caisses de la sortie : leurs places viennent de la trajectoire (p5_virage)
DRUMS = [(24.4, 59.4), (25.1, 59.7), (24.7, 60.3), (37.8, 59.2), (38.4, 59.8), (52.0, 59.4), (52.7, 59.2),
         (53.2, 59.9), (61.5, 59.1)]
PALLETS = [(28.5, 59.8, 0.2), (44.0, 59.6, 1.4), (58.0, 59.8, 0.6)]


def mat_wood(name="caisse_bois"):
    """Le bois des caisses : des planches de 14 cm (une teinte par planche), le fil, les joints sombres, mouillé."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    rnd = N.new("ShaderNodeObjectInfo").outputs["Random"]
    _, _, oz = N.sep(co)
    plank = N.math("FLOOR", N.math("DIVIDE", oz, 0.14))
    _, _, _, v = road.hash3(N, plank, N.math("MULTIPLY", rnd, 17.0), 2.7)
    seam = road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", N.math("FRACT", N.math("DIVIDE", oz, 0.14)), 0.5)), 0.44, 0.5)
    grain = road.noise(N, co, 3.0, 6.0, 0.6, stretch=(0.08, 0.08, 1.0))
    # bois de caisse vieilli, en linéaire (à 0,33 il sortait rose pâle sous le faisceau, essai d)
    col = N.mix(v, (0.055, 0.032, 0.016, 1), (0.11, 0.068, 0.035, 1))
    col = N.mix(N.math("MULTIPLY", grain, 0.5), col, N.mix(1.0, col, (0.6, 0.55, 0.5, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", seam, 0.85), col, (0.03, 0.025, 0.02, 1))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.7
    p.inputs["Coat Weight"].default_value = 0.3
    p.inputs["Coat IOR"].default_value = 1.33
    p.inputs["Coat Roughness"].default_value = 0.3
    N.link(road.bump(N, N.math("MULTIPLY", seam, -1.0), N.new("ShaderNodeNewGeometry").outputs["Normal"], 0.6, 0.004),
           p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_painted(name, rust=0.35):
    """Une tôle peinte dont la teinte vient de la couleur de l'objet (fûts, poteaux) : salie, rouillée en plaques
    et au pied, vernis mouillé."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    oi = N.new("ShaderNodeObjectInfo")
    _, _, oz = N.sep(co)
    col = N.mix(1.0, oi.outputs["Color"], (0.85, 0.85, 0.85, 1), "MULTIPLY")
    dirt = road.smooth(N, road.noise(N, co, 2.0, 4.0, 0.6, stretch=(1.0, 1.0, 0.2)), 0.45, 0.75)
    col = N.mix(N.math("MULTIPLY", dirt, 0.6), col, N.mix(1.0, col, (0.4, 0.37, 0.33, 1), "MULTIPLY"))
    spots = N.math("MULTIPLY", road.smooth(N, road.noise(N, co, 5.0, 6.0, 0.7), 0.62, 0.7), rust * 2.0)
    foot = N.math("MULTIPLY", road.inv(N, road.smooth(N, oz, 0.0, 0.12)), rust)
    rs = N.math("MINIMUM", N.math("ADD", spots, foot), 1.0)
    col = N.mix(rs, col, (0.16, 0.06, 0.02, 1))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.mixf(rs, 0.42, 0.85), p.inputs["Roughness"])
    p.inputs["Coat Weight"].default_value = 0.45
    p.inputs["Coat IOR"].default_value = 1.33
    p.inputs["Coat Roughness"].default_value = 0.15
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_puddle(name="flaque_p5"):
    """Une vraie flaque posée sur le béton : un film d'eau presque miroir (la ride fine des gouttes), son bord
    fondu dans le mouillé du terre-plein (transparence lue sur une ellipse déformée par un bruit)."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    P, _ = road.coords(N)
    ox, oy, _ = N.sep(co)
    r = N.new("ShaderNodeVectorMath", _operation="LENGTH")
    N.link(road.combine(N, N.math("DIVIDE", ox, P5.PUDDLE_SIZE[0] / 2), N.math("DIVIDE", oy, P5.PUDDLE_SIZE[1] / 2)), r.inputs[0])
    edge = N.math("ADD", r.outputs["Value"], N.math("MULTIPLY", N.math("SUBTRACT", road.noise(N, P, 0.9, 3.0, 0.6), 0.5), 0.7))
    alpha = road.inv(N, road.smooth(N, edge, 0.72, 0.95))
    road.puddle_shader(N, out, alpha=alpha, scale=26.0, strength=0.04)     # la flaque commune (road.HUMIDITE)
    return m


def _lib(rel, name, hidden, mat, height=None, scale=1.0, rot_z=0.0):
    """Un modèle de bibliothèque joint en un objet, toutes ses matières remplacées par `mat` (aucune texture livrée
    ne passe : ni lettres de coque ni marque), tourné de `rot_z`, mis à la hauteur `height` (sinon à l'échelle
    `scale`), origine au sol au centre ; rangé dans les sources. Renvoie (source, emprise)."""
    import cast_vehicles as cv
    parts = [o for o in cv.import_model(os.path.join(L.ASSETS, rel)) if o.type == "MESH"]
    ob = cv.join(parts, name)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.material_index = 0
    def recentre():
        # l'emprise lue sur les sommets : ob.bound_box n'est pas remis à jour après data.transform
        import numpy as np
        co = np.empty(len(ob.data.vertices) * 3)
        ob.data.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        mn, mx = co.min(axis=0), co.max(axis=0)
        ob.data.transform(Matrix.Translation((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2])))
        ob.location = (0.0, 0.0, 0.0)
        return Vector(mx - mn)
    size = recentre()
    k = (height / size.z) if height else scale
    ob.data.transform(Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Scale(k, 4))
    size = recentre()
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    hidden.objects.link(ob)
    print(f"[port] {name} : {size.x:.1f} × {size.y:.1f} × {size.z:.1f} m, {len(ob.data.polygons)} faces", flush=True)
    return ob, size


def _lamps(name, pts, color, strength, radius=0.25):
    """Des feux : de petites sphères émissives, sans lumière (une source ponctuelle dans la brume fait du grain)."""
    bm = L.bmesh.new()
    for p in pts:
        L.bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=radius, matrix=Matrix.Translation(p))
    o = L.mesh_object(name, bm, [bpy.data.materials.get(name) or L.emit_mat(name, L.lin(color), strength)])
    o.visible_shadow = False
    return o


def _chain(name, posts, mat, sag=0.24, top=0.74, pitch=0.085):
    """Une chaîne pendue entre des poteaux : des maillons ovales alternés d'un quart de tour, le long d'une
    parabole de flèche `sag`. Renvoie (objet, nombre de maillons)."""
    bm = L.bmesh.new()
    links = 0
    for (xa, ya), (xb, yb) in zip(posts, posts[1:]):
        n = max(2, int(math.hypot(xb - xa, yb - ya) / pitch))

        def at(u):
            return Vector((xa + (xb - xa) * u, ya + (yb - ya) * u, top - sag * 4 * u * (1 - u)))
        for k in range(n):
            u = (k + 0.5) / n
            p = at(u)
            d = (at(u + 1e-3) - p).normalized()
            res = L.bmesh.ops.create_circle(bm, cap_ends=True, segments=8, radius=1.0)
            for v in res["verts"]:
                v.co = Vector((0.0, v.co.y * 0.05, v.co.x * 0.026))       # l'ovale dans le plan y-z, long selon y
            rot = d.to_track_quat("Y", "Z").to_matrix().to_4x4() @ Matrix.Rotation(math.pi / 2 * (k % 2), 4, "Y")
            L.bmesh.ops.transform(bm, verts=res["verts"], matrix=Matrix.Translation(p) @ rot)
            links += 1
    ob = L.mesh_object(name, bm, [mat])
    w = ob.modifiers.new("fil", "WIREFRAME")
    w.thickness = 0.012
    w.use_even_offset = False
    return ob, links


def build_east(hidden):
    """Le côté est du terre-plein, vu par la caméra de P5 (voir l'en-tête de la section)."""
    if "src_conteneur_40" in bpy.data.objects:
        srcs = {}
        for k in BOX_TYPES:
            o = bpy.data.objects[f"src_conteneur_{k}"]
            pts = [Vector(c) for c in o.bound_box]
            d = Vector(map(max, *pts)) - Vector(map(min, *pts))
            srcs[k] = (o, d.y, d.x, d.z)
    else:
        srcs = container_sources(hidden)
    yd = Yard(srcs, seed=29, colors=BOX_MUTED)
    yd.n = 1000                                    # les noms suivent ceux de build_containers
    for y, x, keys, tiers in EAST_ROWS:
        yd.row(x, y, keys, tiers, along_x=True, top_gaps=0.25)
    n_boxes = yd.n - 1000
    steel = bpy.data.materials.get("est_acier_sombre") or L.mat_steel("est_acier_sombre", color=(0.16, 0.17, 0.18),
                                                                       rough=0.5, rust=0.35, paint=True)
    # --- les grues à portail du quai est, en silhouette ; feu corail en tête, feux ambre au portail
    crane, cs = _lib(os.path.join("lieux", "port", "crane-portal", "model.glb"), "src_grue_portail", hidden, steel)
    for i, (x, y) in enumerate(PORTAL_CRANES):
        S.instance(crane, f"grue_portail_{i}", (x, y, 0.0), math.radians(PORTAL_YAW[i]))
    _lamps("grues_feux_tete", [(x, y, cs.z + 0.6) for x, y in PORTAL_CRANES], L.CORAL, 60.0, 0.5)
    _lamps("grues_feux_portail", [(x + dx, y + dy, 12.0) for x, y in PORTAL_CRANES for dx in (-4.5, 4.5)
                                  for dy in (-6.0, 6.0)], L.AMBER, 25.0, 0.3)
    # --- le cargo à quai : une seule peinture sombre, des feux de pont
    hull = bpy.data.materials.get("cargo_coque") or L.mat_steel("cargo_coque", color=(0.07, 0.075, 0.085), rough=0.5,
                                                                 rust=0.5, paint=True)
    ship, ss = _lib(os.path.join("lieux", "port", "ship-cargo", "model.glb"), "src_cargo", hidden, hull,
                    rot_z=math.radians(SHIP_ROT))
    S.instance(ship, "cargo", (*SHIP_AT, L.WATER_Z - SHIP_DRAFT), 0.0)
    import random
    rng = random.Random(4)
    deck = L.WATER_Z - SHIP_DRAFT + ss.z * 0.33
    _lamps("cargo_feux", [(SHIP_AT[0] + rng.uniform(-ss.x / 3, ss.x / 3), SHIP_AT[1] + rng.uniform(-ss.y / 2 + 8, ss.y / 2 - 8),
                           deck + rng.uniform(0.5, 6.0)) for _ in range(26)], "#ffd9a0", 30.0, 0.35)
    # --- au loin, une rive basse à l'est (celle de lieux.far_shore, tournée d'un quart de tour vers +x)
    L.far_shore(y=1300.0, xs=(-1500.0, 1500.0), n=70, seed=21, name="rive_est")
    for nm in ("rive_est_relief", "rive_est_lampes"):
        bpy.data.objects[nm].data.transform(Matrix.Rotation(-math.pi / 2, 4, "Z"))
    # --- près : la chaîne de l'axe, poteaux et maillons
    paint = bpy.data.materials.get("tole_peinte_p5") or mat_painted("tole_peinte_p5")
    pb = L.bmesh.new()
    for x, y in P5.CHAIN_POSTS:
        L.tube_bm(pb, (x, y, 0.0), (x, y, 0.82), 0.045, seg=12)
        L.box_bm(pb, (x - 0.13, y - 0.13, 0.0), (x + 0.13, y + 0.13, 0.03))
    posts = L.mesh_object("chaine_poteaux", pb, [paint], smooth=True)
    posts.color = (*L.lin("#7a6430")[:3], 1.0)
    iron = bpy.data.materials.get("chaine_fer") or L.mat_steel("chaine_fer", color=(0.18, 0.17, 0.16), rough=0.45, rust=0.7)
    _, links = _chain("chaine", P5.CHAIN_POSTS, iron)
    # --- la flaque sur la ligne des roues arrière
    bm = L.bmesh.new()
    hx, hy = P5.PUDDLE_SIZE[0] / 2 + 0.4, P5.PUDDLE_SIZE[1] / 2 + 0.4
    bm.faces.new([bm.verts.new((x, y, 0.0)) for x, y in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))])
    pud = L.mesh_object("flaque_p5", bm, [bpy.data.materials.get("flaque_p5") or mat_puddle()])
    pud.location = (*P5.PUDDLE_AT, 0.004)
    pud.rotation_euler = (0.0, 0.0, math.radians(P5.PUDDLE_YAW))
    pud.visible_shadow = False
    # --- les caisses de la sortie : une pile de palettes, quatre caisses dont une de travers sur le dessus
    wood = bpy.data.materials.get("caisse_bois") or mat_wood()
    pallet, _ = _lib(os.path.join("lieux", "port", "pallets", "model.glb"), "src_palettes", hidden, wood, height=0.9)
    cx, cy = P5.CRATES_AT
    S.instance(pallet, "palettes_sortie", (cx + 1.7, cy - 0.5, 0.0), 0.5)
    for i, (dx, dy, dz, w, d, h, a) in enumerate([(-0.3, 0.0, 0.0, 1.1, 0.9, 0.75, 0.05),
                                                 (0.85, -0.1, 0.0, 1.0, 0.9, 0.7, -0.08),
                                                 (0.2, 0.05, 0.75, 1.0, 0.85, 0.65, 0.42),
                                                 (-0.9, -0.6, 0.0, 0.7, 0.6, 0.55, 0.3)]):
        bm = L.bmesh.new()
        L.box_bm(bm, (-w / 2, -d / 2, 0.0), (w / 2, d / 2, h))
        o = L.mesh_object(f"caisse_{i}", bm, [wood])
        o.location = (cx + dx, cy + dy, dz)
        o.rotation_euler = (0.0, 0.0, a)
    # --- fûts et palettes au pied des piles
    db = L.bmesh.new()
    for x, y in DRUMS:
        L.bmesh.ops.create_cone(db, cap_ends=True, segments=20, radius1=0.29, radius2=0.29, depth=0.88,
                                matrix=Matrix.Translation((x, y, 0.44)))
        for z in (0.29, 0.59):                     # les deux cercles de roulement
            L.bmesh.ops.create_cone(db, cap_ends=False, segments=20, radius1=0.305, radius2=0.305, depth=0.03,
                                    matrix=Matrix.Translation((x, y, z)))
    drums = L.mesh_object("futs", db, [paint], smooth=True)
    drums.color = (*L.lin("#3a4656")[:3], 1.0)
    for i, (x, y, a) in enumerate(PALLETS):
        S.instance(pallet, f"palettes_{i}", (x, y, 0.0), a)
    print(f"[port] côté est : {n_boxes} conteneurs, {len(PORTAL_CRANES)} grues à portail, cargo, "
          f"chaîne ({links} maillons), flaque, caisses, {len(DRUMS)} fûts", flush=True)


def build_port(hidden, lamp_src, far=False, palier=None):
    """Le port au pied du pont. `far` : la version vue du pont, de la jetée et de la pointe (grandes formes et
    lumières). `palier` : « socle », « conteneurs », « portique » (le dernier écrit par défaut). Enlève la chaussée
    plate que le pont pose sur le terre-plein s'il la trouve."""
    palier = palier or PALIER_MAX
    n = _remove_bridge_flat()
    build_quay(hidden, far=far)
    build_masts(far=far)
    build_barrier(hidden, far=far)
    if not far:
        build_props(hidden)
    if _palier_at_least(palier, "conteneurs"):
        # aucun numéro ni aucune inscription sur les conteneurs (règle du film)
        build_containers(hidden, far=far)
        if not far:
            build_east(hidden)
    if _palier_at_least(palier, "portique"):
        build_gantry(far=far)
    print(f"[port] terre-plein {X1 - X0:.0f} × {Y1 - Y0:.0f} m, voie du quai en y {QY:.0f}, axe fermé en y "
          f"{BARRIER_Y:.1f}, {len(MASTS)} mâts, palier {palier}, {'vu de loin' if far else 'complet'}"
          f"{f', chaussée du pont retirée ({n} objets)' if n else ''}", flush=True)


# ---------------------------------------------------------------- le plan

import motion as M          # noqa: E402  (le mouvement calculé, pur Python)
import p5_virage as P5      # noqa: E402  (la trajectoire de P5, écrite une fois)

CAM = Vector(P5.CAM)                 # la caméra à la première image, 7,6 m derrière la berline (découpage v3.1)
STILL_FRAME = 29                     # l'image fixe d'essai (rendu d'une seule image) : au plus fort de la glisse
FRAMES = range(P5.F0 - 1, P5.F0 + P5.FRAMES + 1)   # une image de part et d'autre : l'obturateur du flou


def wheelbase(wheels, fwd=Vector((0.0, -1.0, 0.0))):
    """L'empattement d'un véhicule à roues séparées (positions de repos dans la caisse, avant vers `fwd`)."""
    d = [Vector(w.location).dot(fwd) for w in wheels]
    return (max(d) - min(d)) if d else 2.9


def deck_ground(x, y):
    """Le sol sous un véhicule de la meute : le tablier et sa pente sur la rampe, le terre-plein plat ensuite."""
    import scene_c
    z = scene_c.deck_z(y) + (road.road_z(x) if y < -20.0 else 0.0)
    return z, math.degrees(math.atan(scene_c.deck_slope(y)))


def light_tower(at, target, energy=50000.0, along_x=False):
    """La tour d'éclairage mobile de chantier, derrière la caméra de P5 (hors champ) : mât télescopique de 7 m sur
    sa remorque, quatre projecteurs crème pointés sur le virage. C'est la lumière de face de la berline : le
    projecteur de l'hélicoptère, dans le cadre, l'éclaire forcément de derrière."""
    x, y = at
    steel = bpy.data.materials.get("mat_port_acier") or L.mat_steel("mat_port_acier", color=(0.42, 0.44, 0.45),
                                                                     rough=0.4, rust=0.2)
    glass = bpy.data.materials.get("tour_glace") or L.emit_mat("tour_glace", L.lin(L.CREAM), 40.0)
    bm, gb = L.bmesh.new(), L.bmesh.new()
    hx, hy = (1.8, 1.0) if along_x else (1.0, 1.8)
    L.box_bm(bm, (x - hx, y - hy, 0.35), (x + hx, y + hy, 1.25))               # la remorque
    L.tube_bm(bm, (x, y, 1.25), (x, y, 7.0), 0.07, seg=10)
    L.box_bm(bm, (x - 1.0, y - 0.05, 7.0), (x + 1.0, y + 0.05, 7.08))
    for dx in (-0.75, -0.25, 0.25, 0.75):
        L.box_bm(bm, (x + dx - 0.22, y - 0.12, 7.1), (x + dx + 0.22, y + 0.12, 7.5))
        L.box_bm(gb, (x + dx - 0.19, y - 0.13, 7.13), (x + dx + 0.19, y - 0.12, 7.47))
    L.mesh_object("tour_eclairage", bm, [steel])
    gl = L.mesh_object("tour_eclairage_glaces", gb, [glass])
    gl.visible_shadow = False
    # un émissif fort a sa liaison de lumière : les glaces ne s'éclairent qu'elles-mêmes, le projecteur fait la
    # lumière (à 40 de force, elles allumaient le terre-plein en plus de lui)
    own = bpy.data.collections.new("tour_glaces_seules")
    own.objects.link(gl)
    gl.light_linking.receiver_collection = own
    d = bpy.data.lights.new("tour_eclairage_spot", "SPOT")
    d.energy = energy
    d.color = L.lin("#fff2d6")[:3]
    d.spot_size = math.radians(38)
    d.spot_blend = 0.5
    d.shadow_soft_size = 0.6
    lo = bpy.data.objects.new(d.name, d)
    bpy.context.scene.collection.objects.link(lo)
    lo.location = (x, y - 0.4, 7.3)
    lo.rotation_mode = "QUATERNION"
    lo.rotation_quaternion = (target - Vector(lo.location)).to_track_quat("-Z", "Y")
    return lo


def _twin(main, name, energy, color, receivers):
    """Une jumelle coaxiale d'une lampe (même parent, même pose, mêmes clés de visée par son parent), invisible à
    la caméra et à la brume, qui n'éclaire que `receivers`."""
    d = main.data.copy()
    d.name = name
    d.energy = energy
    d.color = L.lin(color)[:3]
    c = bpy.data.objects.new(d.name, d)
    for coll_u in main.users_collection:
        coll_u.objects.link(c)
    c.parent = main.parent
    c.matrix_parent_inverse = main.matrix_parent_inverse.copy()
    c.rotation_mode = main.rotation_mode
    c.location, c.rotation_euler = main.location.copy(), main.rotation_euler.copy()
    c.rotation_quaternion = main.rotation_quaternion.copy()
    c.visible_camera = False
    c.visible_volume_scatter = False
    col = bpy.data.collections.new(name + "_recoit")
    for o in receivers:
        col.objects.link(o)
    c.light_linking.receiver_collection = col
    return c


def beam_lights(main, hero, ground, ground_w, car_w):
    """Le faisceau de l'hélicoptère : la lampe principale (1,6 MW) garde toutes ses visibilités (le cône dans la
    brume) mais exclut, par liaison de lumière, le sol, le décor qu'elle balaie et la berline (à pleine puissance,
    son empreinte brûlait le sol en blanc et sortait la caisse framboise). Deux jumelles coaxiales, invisibles à la
    caméra et à la brume : une crème pour le sol et le décor (`ground_w` : ~2,5 W/m² à 56 m, 4π d² × 2,5), une
    blanc chaud pour la seule berline (`car_w`), pour que la tache se pose sur elle quand le faisceau la rattrape
    (sans elle, la caisse ne changeait pas sous le faisceau). Blanc chaud et pas xénon : sous un bleuté le
    bordeaux tourne au lilas."""
    body = L.car_parts(hero, glass=True)
    sans = bpy.data.collections.new("faisceau_sans_sol_berline")
    for o in body + list(ground):
        sans.objects.link(o)
    for co in sans.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
    main.light_linking.receiver_collection = sans
    _twin(main, "faisceau_sol", ground_w, "#fff2d6", ground)
    return _twin(main, "faisceau_berline", car_w, "#fff1e2", body)


def car_side(hero, at=(-10.0, 62.0, 4.5), aim=(6.0, 67.0, 0.8), energy=2600.0, size=3.0, color=None):
    """L'ambre de côté sur la berline : la lumière d'une lampe au sodium du bord de la voie du pont, à gauche de
    la caméra, qui prend son flanc gauche en écharpe par l'arrière et pose un liseré chaud sur le pavillon et les
    ailes (le faisceau, froid, vient d'en face et d'en haut). Un disque doux lié à la seule berline (aucune autre
    surface ne le voit, ni la brume ni la caméra : pas de grain). Avant, l'ambre des mâts tombait de haut et de
    face et rosissait le capot sans dessiner la caisse."""
    d = bpy.data.lights.new("berline_ambre_cote", "AREA")
    d.shape = "DISK"
    d.size = size
    d.energy = energy
    d.color = L.lin(color or L.AMBER)[:3]
    lo = bpy.data.objects.new(d.name, d)
    bpy.context.scene.collection.objects.link(lo)
    lo.location = at
    lo.rotation_mode = "QUATERNION"
    lo.rotation_quaternion = (Vector(aim) - Vector(at)).to_track_quat("-Z", "Y")
    lo.visible_camera = lo.visible_volume_scatter = False
    col = bpy.data.collections.new("berline_ambre_seule")
    for o in L.car_parts(hero):
        col.objects.link(o)
    lo.light_linking.receiver_collection = col
    return lo


def skid_p5(scene, width=0.24):
    """Les deux traces de gomme des roues arrière dans la glisse (p5_virage.wheel_track), posées sur la dalle et
    dévoilées sous les roues (modificateur Construction, une face par pas de temps). La matière est celle de P2 :
    gomme mate et sombre sur la pellicule d'eau, fondue à son départ (claire, elle renvoyait les lampadaires)."""
    from scene_carrefour import mat_wake
    mat = bpy.data.materials.get("tyre_wake") or mat_wake()
    dg = bpy.context.evaluated_depsgraph_get()

    def ground(x, y):
        hit, loc, *_ = scene.ray_cast(dg, Vector((x, y, 0.3)), Vector((0, 0, -1)), distance=1.0)
        return (loc.z if hit else 0.0) + 0.005

    f0, f1 = P5.SKID_FRAMES
    for side, tag in ((-1, "g"), (1, "d")):
        pts = P5.wheel_track(side)
        n = len(pts)
        verts, faces = [], []
        for i, (_, x, y) in enumerate(pts):
            ax = pts[min(i + 1, n - 1)][1] - pts[max(i - 1, 0)][1]
            ay = pts[min(i + 1, n - 1)][2] - pts[max(i - 1, 0)][2]
            ln = math.hypot(ax, ay) or 1.0
            nx, ny = -ay / ln * width / 2, ax / ln * width / 2
            verts += [(x - nx, y - ny, ground(x - nx, y - ny)), (x + nx, y + ny, ground(x + nx, y + ny))]
            if i:
                faces.append((2 * i - 2, 2 * i, 2 * i + 1, 2 * i - 1))
        me = bpy.data.meshes.new(f"trace_p5_{tag}")
        me.from_pydata(verts, [], faces)
        uv = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uv.data[li].uv = ((vi // 2) / (n - 1), vi % 2)
        me.materials.append(mat)
        ob = bpy.data.objects.new(me.name, me)
        scene.collection.objects.link(ob)
        ob.visible_shadow = False
        b = ob.modifiers.new("devoile", "BUILD")
        b.frame_start = f0
        b.frame_duration = max(1, f1 - f0)
    return f0, f1


def car_fill(cam, hero, energy=1400.0, size=4.0):
    """La lumière de la berline, comme sur le pont : un disque doux et crème de face, porté par la caméra (1,5 m
    au-dessus de l'objectif, dans l'axe), qui n'éclaire qu'elle (~4 W/m² à 10 m : P ≈ π d²). Invisible à la
    caméra et à la brume ; son reflet doux sur le vernis dessine la caisse. À 350 W la caisse sortait lilas
    (moyenne 93, 52, 79 : bleu sur rouge 0,85 quand le bordeaux seul en donne 0,5) : le vernis renvoie le ciel
    et la brume derrière la caméra, une couche bleutée qui s'ajoute ; le diffus crème doit la dominer."""
    d = bpy.data.lights.new("berline_face", "AREA")
    d.shape = "DISK"
    d.size = size
    d.energy = energy
    d.color = L.lin("#fff0d8")[:3]
    lo = bpy.data.objects.new(d.name, d)
    bpy.context.scene.collection.objects.link(lo)
    lo.parent = cam
    lo.location = (0.0, 1.5, 0.0)                 # repère de la caméra : -z vers l'avant, y vers le haut
    lo.visible_camera = lo.visible_volume_scatter = False
    col = bpy.data.collections.new("berline_face_seule")
    for o in L.car_parts(hero):
        col.objects.link(o)
    lo.light_linking.receiver_collection = col
    return lo


def plan_P5(scene, hidden, palier="conteneurs"):
    """P5, l'hélicoptère fond sur le quai (découpage v3.1), animé (48 images, p5_virage.py) : la caméra de
    poursuite commune (24 mm, 2,4 m, 7,5 m derrière, un peu à l'extérieur du virage) suit le cap de la vitesse de
    la berline. La berline freine en ligne au bout du pont (feux stop), vire à droite en glissant de 16°
    (contre-braquage, roulis vers l'extérieur) et repart vers le quai ; la patrouille 1, devant à gauche, sous-vire
    tout droit et s'arrête devant les séparateurs ; la meute reste sur la voie du pont, derrière ; l'hélicoptère
    plonge sur le quai devant elle, faisceau sur elle. Toutes les clés viennent des trajectoires (motion.py) ; le
    flou de mouvement les suit."""
    import scene_c
    lamp_src = L.panorama(scene, hidden, bridge=None, port=None)
    # le pont avec son pylône et ses haubans (P4 les montre : au début de P5 ils sont dans l'axe, au fond)
    scene_c.build_bridge(hidden, lamp_src, haubans=True)
    build_port(hidden, lamp_src, far=False, palier=palier)
    scene.frame_start, scene.frame_end = P5.F0, P5.F0 + P5.FRAMES - 1
    # --- la berline : déjà en travers, la glisse, la reprise
    hero = L.hero()
    wheels = L.hero_wheels(hero)
    wb = wheelbase(wheels)
    poses = M.sample(P5.hero_pos, FRAMES, slip=P5.hero_slip, wheel_r=hero["wheel_r"], wheelbase=wb)
    M.key_vehicle(hero, poses, wheels=wheels)
    M.wheel_marks(wheels, hero["wheel_r"])                # le repère de rotation, en Workbench seulement
    # les feux stop sur chaque fenêtre de freinage à plus de 2 m/s², après la mise en clés (découpage v3.1)
    import hero_cars
    for a, b in P5.brake_windows():
        hero_cars.stop_lamps(bpy.data.objects[hero["body"]], a, b)
    print(f"[P5] feux stop, images {P5.brake_windows()}", flush=True)
    f0, f1 = skid_p5(scene)
    print(f"[P5] traces de gomme des roues arrière, images {f0} à {f1}", flush=True)
    # plus de fumée des pneus dessinée par la scène (règle F du découpage v3.1 : ces bouffées se lisaient comme des
    # taches de lumière) ; elle reviendra par fx, aux bouffées que p5_virage.smoke_keep garde loin de l'objectif
    # --- la meute : elle descend la voie du pont et freine, sans rattraper la berline
    rigs = scene_c.pack([(k, x, y, 0.0) for k, x, y in P5.PACK_START], speed=P5.PACK_V)
    for i, r in enumerate(rigs):
        body = M.body_of(r)
        wh, wr = M.wheels_of(body), body.get("wheel_r", 0.36)
        ps = M.sample(P5.pack_pos(i), FRAMES, wheel_r=wr, seed=float(i),
                      heading=P5.patrol_heading if i == 0 else None,
                      wheelbase=body.get("wheelbase", 2.9), front=body.get("front_axle"))
        M.key_vehicle(r, ps, wheels=wh, ground=deck_ground, pivot=(0.0, 0.0, 0.36))
        M.wheel_marks(wh, wr, axis="Y")
    n = M.flash_bars(rigs, FRAMES)
    print(f"[P5] {n} lueurs de rampe clignotantes", flush=True)
    # la tour devant le mur qui ferme l'axe, derrière la caméra, pointée sur le milieu de la glisse
    tour = light_tower((24.0, 81.4), Vector((6.0, 66.5, 0.6)), energy=50000.0, along_x=True)
    # la tour n'éclaire que le sol et le mobilier du virage. Exclus : les caisses de la sortie (à 10 m sous elle,
    # saumon et plates), la berline (~25 W/m² de crème à 16 m, six fois car_fill : elle rosissait aux images 9 à 17,
    # le bordeaux de l'image 1 est celui de car_fill et de l'ambre de côté) et les conteneurs, qui ont leur jumelle
    # à 10 % (dorés et vifs à droite en fin de plan, ils concurrençaient le faisceau). 50 kW au lieu de 80 : le sol
    # du virage, très éclairé, se reflétait dans le vernis du flanc et le rosissait
    boxes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("conteneur_")]
    exclus = bpy.data.collections.new("tour_exclus")
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.startswith(("caisse_", "palettes_sortie")):
            exclus.objects.link(o)
    for o in L.car_parts(hero, glass=True):
        exclus.objects.link(o)
    for o in boxes:
        exclus.objects.link(o)
    for co in exclus.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
    tour.light_linking.receiver_collection = exclus
    _twin(tour, "tour_conteneurs", 0.10 * tour.data.energy, "#fff2d6", boxes)
    # --- l'hélicoptère : il arrive de l'est au ras des piles, vire sur la berline ; son faisceau court sur la voie
    # du pont derrière elle et la rattrape (p5_virage.beam_target)
    heli, h = L.helicopter("heli")
    M.key_object(heli, FRAMES, P5.heli)
    sl = h["searchlight"].data
    sl.spot_blend = 0.25
    import scene_d
    scene_d.aim_helis([heli], P5.beam_target(M.t_of(20)), energy=1.6e6, cone=5.0)
    # ce que balaie la tache : le terre-plein, le mobilier du virage, les conteneurs (la lampe principale y aurait
    # posé des taches brûlées)
    swept = [o for o in bpy.data.objects if o.type == "MESH" and (o.name == "port_terre_plein" or o.name.startswith((
        "conteneur_", "flaque_p5", "chaine", "caisse_", "palettes_", "futs", "separateur_", "port_couronnement",
        "trace_p5")))]
    beam_lights(h["searchlight"], hero, swept, ground_w=1.0e5, car_w=P5_BEAM_CAR_W)
    M.key_searchlight(h, FRAMES, P5.beam_target)
    for i, (dz, col, e) in enumerate(((0.2, L.CORAL, 0.4), (-1.2, L.CREAM, 0.25))):
        Ld = bpy.data.lights.new(f"heli_feu_{i}", "POINT")      # feu anticollision corail, feu blanc sous la cellule
        Ld.energy = 40.0 * e * 10
        Ld.color = L.lin(col)[:3]
        Ld.shadow_soft_size = 0.05
        lo = bpy.data.objects.new(Ld.name, Ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.parent = heli
        lo.location = (0.0, -0.5, 2.6 + dz)
        lo.visible_volume_scatter = False                  # une source ponctuelle dans la brume : du grain
    # la brume ne prend corps que dans le faisceau : toute autre lampe (rampes à 20 kW, tour, feux, lampadaires)
    # y posait des taches de grain lilas qui couvraient le ciel (essai c, 64 échantillons)
    for ob in bpy.data.objects:
        if ob.type == "LIGHT" and ob != h["searchlight"]:
            ob.visible_volume_scatter = False
    L.haze((-140, 160), (-280, 115), (L.WATER_Z, 70), 0.0016)    # lieux.haze tourne ses normales vers l'extérieur
    # --- la caméra qui suit la berline (de 8 à 10,3 m), 21 mm, mise au point sur elle
    cam = L.camera("cam_P5", tuple(CAM), (CAM.x + 1.0, CAM.y + 8.0, 0.7), lens=P5.LENS, fstop=4.0)
    M.key_camera(cam, FRAMES, P5.camera)
    cam.data.dof.focus_object = hero
    car_fill(cam, hero)
    # l'ambre rase le flanc gauche (celui que voit la caméra) depuis l'arrière-gauche, au ras du capot : un
    # liseré le long de la ceinture chromée ; posé plus loin à l'ouest (-10 ; 62), il n'éclairait que l'arrière
    car_side(hero, at=(-9.0, 71.0, 2.2), aim=(6.0, 67.5, 0.7), energy=3000.0, size=2.5)
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    last = poses[-2]
    print(f"[P5] {len(FRAMES)} images de clés ; berline de ({poses[1]['x']:.1f}, {poses[1]['y']:.1f}) à "
          f"({last['x']:.1f}, {last['y']:.1f}), {poses[1]['speed'] * 3.6:.0f} puis {last['speed'] * 3.6:.0f} km/h ; "
          f"tangage mini {min(q['pitch'] for q in poses):.1f}°, roulis mini {min(q['roll'] for q in poses):.1f}°, "
          f"braquage maxi {max(q['steer'] for q in poses):.1f}°", flush=True)
    return cam


PLANS = {"P5": plan_P5}


PLAN_PALIER = {"P5": "conteneurs"}  # le palier de décor de chaque plan (render_film.py n'en passe pas)
P5_BEAM_CAR_W = 5.0e4               # la jumelle du faisceau sur la berline (à 1,2e5 puis 7e4 elle sortait rose et brûlée)


def build(plan, palier=None):
    scene, hidden = L.new_scene()
    cam = PLANS[plan](scene, hidden, palier=palier or PLAN_PALIER[plan])
    scene.camera = cam
    __import__("fx").dress(plan, scene)                 # les interactions (fx.py ; FILM3D_FX=0 les retire)
    scene.frame_set(STILL_FRAME)
    return scene
