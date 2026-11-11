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
TURN_C = (18.5, 55.0)                               # le centre du virage à droite
TURN_R = 15.0
COPING_W, COPING_H = 0.6, 0.22
MASTS = [(-52.0, -12.0), (94.0, -12.0), (-52.0, 92.0), (94.0, 92.0),   # les quatre angles (§2.4)
         (32.0, 90.0)]                                                   # le mât derrière la caméra de P5
KEY_MAST = (32.0, 90.0)
TURN_AIM = (11.0, 67.0)                             # là où le projecteur du mât de derrière la caméra est pointé
MAST_H = 25.0

PALIERS = ("socle", "conteneurs", "portique")
PALIER_MAX = "socle"


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
    joint = road.inv(N, road.smooth(N, N.math("ADD", jd, jwob), 0.006, 0.014))
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
    w = road.smooth(N, D, 0.7, 1.3)                       # 0 : humide, 1 : flaque
    deep = road.smooth(N, D, 1.3, 2.4)
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
    cr = N.mixf(road.smooth(N, sc["disp"], 0.45, 0.75), 0.26, 0.46)
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
    head = bpy.data.materials.get("mat_port_tete") or L.emit_mat("mat_port_tete", L.lin("#ffb257"), 60.0)
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
        Ld.energy = 60000.0 if key else 45000.0
        Ld.color = L.lin(L.AMBER)[:3]
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
    print(f"[port] terre-plein {X1 - X0:.0f} × {Y1 - Y0:.0f} m, voie du quai en y {QY:.0f}, axe fermé en y "
          f"{BARRIER_Y:.1f}, {len(MASTS)} mâts, palier {palier}, {'vu de loin' if far else 'complet'}"
          f"{f', chaussée du pont retirée ({n} objets)' if n else ''}", flush=True)


# ---------------------------------------------------------------- le plan

CAM = Vector((18.0, 79.0, 0.4))      # 2 m derrière le bord nord de la voie du quai (le §2.4 : x = 10, y = 77)
CAM_YAW = 25.0                       # degrés, de -y vers -x (vers la droite du cadre)
CAM_PITCH = 10.0                     # le panoramique vers le haut, à l'instant de l'image fixe (25° à la fin)
PHI = 65.0                           # où en est la berline dans le virage, en degrés (0 : entrée, 90 : sortie)
DRIFT = 18.0                         # le travers : la caisse tournée de plus que sa trajectoire
TURN_SPEED = 14.0                    # m/s au milieu du virage (60 km/h à l'entrée)


def arc_point(phi):
    a = math.radians(phi)
    return Vector((TURN_C[0] - TURN_R * math.cos(a), TURN_C[1] + TURN_R * math.sin(a), 0.0))


def drift_keys(root, vel_heading, speed, yaw_rate, wheels=(), wheel_r=0.33):
    """Le flou de bougé d'une voiture en travers : elle avance selon sa trajectoire (`vel_heading`, pas son
    avant), sa caisse tourne de `yaw_rate` rad/s, ses roues roulent (images 1 et 3 autour de l'image 2)."""
    h = math.radians(vel_heading)
    d = Vector((-math.sin(h), math.cos(h), 0.0)) * speed / 24.0
    p, rz = root.location.copy(), root.rotation_euler.z
    for f, s in ((1, -1), (3, 1)):
        root.location = p + d * s
        root.rotation_euler.z = rz - s * yaw_rate / 24.0       # virage à droite : le cap décroît
        root.keyframe_insert("location", frame=f)
        root.keyframe_insert("rotation_euler", index=2, frame=f)
    root.location, root.rotation_euler.z = p, rz
    S.linear_keys(root)
    a = speed / wheel_r / 24.0
    for w in wheels:
        for f, s in ((1, -1), (3, 1)):
            w.rotation_euler.x = a * s
            w.keyframe_insert("rotation_euler", index=0, frame=f)
        w.rotation_euler.x = 0
        S.linear_keys(w)


def boost_bars(strength=8.0, glow=8000.0):
    """Les rampes vues à 90 m et plus : lentilles plus fortes (la lueur de BAR_GLOW se perd à cette distance) et,
    au-dessus de chaque rampe, deux lueurs corail et lilas qui allument la brume et la rampe mouillée."""
    for m in bpy.data.materials:
        if m.name.startswith("hq_lightbar_lenses") and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Emission Strength"].default_value = strength
    k = 0
    for ob in list(bpy.data.objects):
        base = ob.name.split(":")[-1]
        if ob.type != "MESH" or not base.startswith("hq_lightbar") or "lenses" in base:
            continue
        for side, col in ((1, L.CORAL), (-1, L.LILAC)):
            d = bpy.data.lights.new(f"rampe_lueur_{k}", "POINT")
            d.energy = glow
            d.color = L.lin(col)[:3]
            d.shadow_soft_size = 0.3
            lo = bpy.data.objects.new(d.name, d)
            bpy.context.scene.collection.objects.link(lo)
            lo.parent = ob
            lo.location = (0.0, side * 0.5, 0.55)
            k += 1
    print(f"[port] rampes renforcées : {k // 2}", flush=True)


def light_tower(at, target, energy=50000.0):
    """La tour d'éclairage mobile de chantier, derrière la caméra de P5 (hors champ) : mât télescopique de 7 m sur
    sa remorque, quatre projecteurs crème pointés sur le virage. C'est la lumière de face de la berline : le
    projecteur de l'hélicoptère, dans le cadre, l'éclaire forcément de derrière."""
    x, y = at
    steel = bpy.data.materials.get("mat_port_acier") or L.mat_steel("mat_port_acier", color=(0.42, 0.44, 0.45),
                                                                     rough=0.4, rust=0.2)
    glass = bpy.data.materials.get("tour_glace") or L.emit_mat("tour_glace", L.lin(L.CREAM), 40.0)
    bm, gb = L.bmesh.new(), L.bmesh.new()
    L.box_bm(bm, (x - 1.0, y - 1.8, 0.35), (x + 1.0, y + 1.8, 1.25))           # la remorque
    L.tube_bm(bm, (x, y, 1.25), (x, y, 7.0), 0.07, seg=10)
    L.box_bm(bm, (x - 1.0, y - 0.05, 7.0), (x + 1.0, y + 0.05, 7.08))
    for dx in (-0.75, -0.25, 0.25, 0.75):
        L.box_bm(bm, (x + dx - 0.22, y - 0.12, 7.1), (x + dx + 0.22, y + 0.12, 7.5))
        L.box_bm(gb, (x + dx - 0.19, y - 0.13, 7.13), (x + dx + 0.19, y - 0.12, 7.47))
    L.mesh_object("tour_eclairage", bm, [steel])
    L.mesh_object("tour_eclairage_glaces", gb, [glass]).visible_shadow = False
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


def plan_P5(scene, hidden, palier="socle"):
    """P5, le projecteur : la caméra à 40 cm derrière le bord nord de la voie du quai, 28 mm, tournée vers le pied
    de la rampe, en contre-plongée ; l'image fixe est l'instant fort, la berline aux deux tiers du virage, en
    travers vers la droite, trois quarts avant gauche, roues en contre-braquage, caisse en roulis vers l'extérieur,
    à une douzaine de mètres, son arrière qui balaie vers l'objectif ; deux patrouilles au pied de la rampe, le
    fourgon et une troisième sur la rampe ; l'hélicoptère au-dessus de l'eau derrière la fin du tablier, de profil,
    son projecteur posé sur elle.

    Écart au §2.4 : la caméra est en (18, 79) et non (10, 77). Le 28 mm vertical ne fait que 40° de large ; la
    berline à une dizaine de mètres en couvre plus de 20°, et depuis (10, 77) elle se trouve juste devant le pied
    de la rampe et cache toute la meute. Depuis (18, 79), elle tient les deux tiers droits du cadre, de trois
    quarts avant, et la rampe le tiers gauche (cotes cherchées par le calcul des angles, vérifiées en Workbench)."""
    import scene_c
    lamp_src = L.panorama(scene, hidden, bridge=None, port=None)
    scene_c.build_bridge(hidden, lamp_src)
    build_port(hidden, lamp_src, far=False, palier=palier)
    # --- la berline au milieu du virage
    hero = L.hero()
    p = arc_point(PHI)
    vel = -PHI                                         # le cap de la trajectoire (convention de lieux.put)
    L.put(hero, p.x, p.y, 0.0, heading=vel - DRIFT, pitch=-1.2, roll=-3.5)
    wheels = L.hero_wheels(hero)
    drift_keys(hero, vel, TURN_SPEED, TURN_SPEED / TURN_R, wheels, hero["wheel_r"])
    for w in wheels:                                   # contre-braquage : les roues avant vers la gauche
        if w.name.endswith(("FL", "FR")):
            w.rotation_euler.z = math.radians(16.0)
    # la fumée des pneus arrière, qui traîne sur l'extérieur du virage
    hd = math.radians(vel - DRIFT)
    fwd, left = Vector((-math.sin(hd), math.cos(hd), 0)), Vector((-math.cos(hd), -math.sin(hd), 0))
    rear = p - fwd * 1.6 + left * 0.5
    L.smoke("fumee_pneus", (rear.x, rear.y, 0.5), (2.4, 2.0, 0.6), density=0.14, seed=3.0)
    # --- la meute : deux patrouilles au pied de la rampe, une troisième et le fourgon sur la rampe
    scene_c.pack([("patrol", -1.9, -4.0, 0.0), ("patrol", -5.2, -16.0, 1.5), ("van", -1.9, -36.0, 0.0),
                  ("patrol", 1.9, -55.0, -1.0)], speed=31.0)
    boost_bars()
    light_tower((3.0, 87.0), Vector((*TURN_AIM, 0.6)))
    # --- l'hélicoptère au-dessus de l'eau, derrière la fin du tablier, projecteur sur la berline
    heli, h = L.helicopter("heli")
    # à droite du cadre, à 79 m, le nez tourné à gauche de la berline : le projecteur (sous le nez, à droite) la voit
    # sans que la cellule le masque, et vient de côté (de derrière elle, sa tache s'étirait jusqu'à l'objectif)
    L.put(heli, -26.0, 14.0, 36.0, heading=0.0, pitch=-6.0, roll=-5.0)
    sl = h["searchlight"].data
    sl.energy = 3.0e6
    sl.spot_size = math.radians(5.0)
    sl.spot_blend = 0.25
    L.aim(h, p + Vector((0.0, 0.0, 0.7)))
    for i, (dz, col, e) in enumerate(((0.2, L.CORAL, 0.4), (-1.2, L.CREAM, 0.25))):
        Ld = bpy.data.lights.new(f"heli_feu_{i}", "POINT")      # feu anticollision corail, feu blanc sous la cellule
        Ld.energy = 40.0 * e * 10
        Ld.color = L.lin(col)[:3]
        Ld.shadow_soft_size = 0.05
        lo = bpy.data.objects.new(Ld.name, Ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.parent = heli
        lo.location = (0.0, -0.5, 2.6 + dz)
    L.haze((-140, 160), (-280, 115), (L.WATER_Z, 70), 0.0022)    # lieux.haze tourne ses normales vers l'extérieur
    # --- la caméra
    a, t = math.radians(CAM_YAW), math.radians(CAM_PITCH)
    d = Vector((-math.sin(a) * math.cos(t), -math.cos(a) * math.cos(t), math.sin(t)))
    cam = L.camera("cam_P5", tuple(CAM), tuple(CAM + d * 50.0), lens=28, fstop=2.8, focus=p + Vector((0, 0, 0.7)),
                   roll=-2.0)
    scene.render.use_motion_blur = True
    print(f"[P5] berline en ({p.x:.1f}, {p.y:.1f}), à {(p - Vector((CAM.x, CAM.y, 0))).length:.1f} m de l'objectif, "
          f"cap {vel - DRIFT:.0f}° (trajectoire {vel:.0f}°)", flush=True)
    return cam


PLANS = {"P5": plan_P5}


def build(plan, palier="socle"):
    scene, hidden = L.new_scene()
    cam = PLANS[plan](scene, hidden, palier=palier)
    scene.camera = cam
    scene.frame_set(2)
    return scene
