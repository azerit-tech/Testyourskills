# Scène C, le pont : la lagune franchie par un pont routier de 320 m, de la ville au port (quatre voies, deux
# rampes droites à 6 %, crête arrondie à 7,2 m), puis 100 m plats sur le terre-plein du port ; et son plan P4,
# la meute (docs/cinematique-poursuite.md §2.4). P5 est au port (scene_e), P6 sur la jetée (scene_d).
#
# Construire et rendre un plan (une seule commande, sous le verrou commun) :
#
#   FILM3D_HERO=w111 lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     --factory-startup -P tools/film3d/render_lieux.py -- --lieu pont --plan P4 [--engine cycles --samples 32]
#
# écrit Azerit/design/film/ref/lieux/pont-P4-socle[-cadrage].png (render_lieux.py).
#
# Repère : le monde de l'eau de lieux.py. Axe du pont x = 0, la poursuite roule vers +y, de la ville vers le port.
#
#   y -420..-320   la rue de la ville, sur la promenade (lieux.distant_city laisse l'ouverture)
#   y -320..-255   le plat côté ville (60 m, le pied de la rampe en -255)
#   y -255..-130   la rampe à 6 %, crête arrondie sur 20 m en -130, à 7,2 m
#   y -130..  -5   la descente à 6 % (vue de P4), le pied en -5
#   y   -5.. 100   le plat : le tablier jusqu'au mur du port (y -20), puis le terre-plein (scene_e)
#
# Le profil en travers est celui de lieux.roadway : chaussée de 14 m bombée, trottoirs de 2 m, glissière en W,
# parapet en béton et garde-corps à 1,1 m, poutre de rive et caisson ; lampadaires des deux côtés tous les 30 m.
# Paliers : « socle » ; « haubans » ajoutera le pylône en H à la crête et ses deux nappes de câbles sans rien
# changer au tablier (build_bridge(haubans=True)).
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lieux as L  # noqa: E402

S, road = L.S, L.road

# ---------------------------------------------------------------- le tracé

Y_CITY_END = -420.0   # la rue continue un peu dans la ville
Y_START = -320.0      # le tablier quitte le quai de la ville
Y_FOOT_CITY = -255.0
Y_CREST = -130.0
Y_FOOT = -5.0         # pied de la rampe côté port
Y_PORT = -20.0        # le mur du quai du port : le tablier s'arrête là, le terre-plein prend la suite
Y_END = 100.0
GRADE = 0.06
T_SAG, T_CREST = 12.0, 20.0     # longueurs des raccords (pied, crête) : 6 % × (125 − 20/4) = 7,2 m

HALF = 7.0
WALK = 2.0
LAMP_YS = [Y_START + 10.0 + 30.0 * k for k in range(11)]     # -310 .. -10
PIERS = [Y_START + 20.0 + 35.0 * k for k in range(9)]        # -300 .. -20 : la dernière est la culée du port


def _grade(y):
    """La pente du tablier, raccords adoucis (linéaires en pente, donc paraboliques en hauteur)."""
    def ramp(y, a, t):
        return min(1.0, max(0.0, (y - (a - t / 2)) / t))
    return GRADE * (ramp(y, Y_FOOT_CITY, T_SAG) - 2 * ramp(y, Y_CREST, T_CREST) + ramp(y, Y_FOOT, T_SAG))


_Z = {}


def deck_z(y):
    """La hauteur de l'axe du tablier en y (intégrée par pas de 0,25 m, puis lue)."""
    if not _Z:
        z, yy, step = 0.0, Y_CITY_END - 10.0, 0.25
        while yy <= Y_END + 10.0:
            _Z[round(yy * 4)] = z
            z += _grade(yy + step / 2) * step
            yy += step
    k = y * 4
    k0 = math.floor(k)
    a, b = _Z.get(k0, 0.0), _Z.get(k0 + 1, _Z.get(k0, 0.0))
    return max(0.0, a + (b - a) * (k - k0))


def deck_slope(y):
    return deck_z(y + 0.5) - deck_z(y - 0.5)


def samples(y0, y1, fine=1.0, coarse=4.0):
    """Les stations du balayage : fines dans les raccords, plus lâches ailleurs."""
    out, y = [], y0
    while y < y1:
        out.append(y)
        curv = any(abs(y - c) < t * 0.7 for c, t in ((Y_FOOT_CITY, T_SAG), (Y_CREST, T_CREST), (Y_FOOT, T_SAG)))
        y += fine if curv else coarse
    out.append(y1)
    return out


# ---------------------------------------------------------------- le pont

def build_bridge(hidden, lamp_src, far=False, haubans=False):
    """Le pont entier : tablier, rampes, crête, glissières, parapets, garde-corps, caisson, piles, joints,
    lampadaires ; la rue de la ville en amont, le plat du port en aval. `far` : la version vue de loin (scènes D
    et E) sans les petites pièces. Rien ne change quand on ajoute le pylône (`haubans`, palier suivant)."""
    ys = samples(Y_START, Y_PORT)
    out = L.roadway("pont", ys, deck_z, half=HALF, walk=WALK, rail="parapet", glissiere=True, under="caisson",
                    lamp_src=lamp_src, lamp_ys=LAMP_YS, far=far)
    M = out["M"]
    edge = out["edge"]
    # la rue de la ville et le plat du port : la même chaussée, sans bord (posée sur la promenade, sur le terre-plein)
    L.roadway("pont_ville", [Y_CITY_END, Y_START], half=HALF, walk=WALK, rail=None, M=M, far=far)
    L.roadway("pont_port", [Y_PORT, Y_END], half=HALF, walk=WALK, rail=None, M=M, far=far)
    bm = L.bmesh.new()
    L.box_bm(bm, (-12.5, Y_CITY_END, L.WATER_Z - 1.5), (12.5, Y_START, -0.01))      # la culée de la ville
    L.mesh_object("pont_culee_ville", bm, [M["concrete"]])
    # les piles tous les 35 m : un chevêtre sous le caisson, deux fûts dans l'eau
    bm = L.bmesh.new()
    for y in PIERS[:-1]:
        zt = deck_z(y) - 1.9
        L.box_bm(bm, (-6.2, y - 1.0, zt - 1.3), (6.2, y + 1.0, zt))
        for x in (-4.2, 4.2):
            L.tube_bm(bm, (x, y, L.WATER_Z - 4.0), (x, y, zt - 1.2), 0.85, seg=20)
    L.mesh_object("pont_piles", bm, [M["concrete"]])
    if not far:
        joint = S.mat_plain("joint_dilatation", (0.04, 0.04, 0.042, 1), 0.3, 1.0)
        bm = L.bmesh.new()
        for yj in (Y_START + 1.0, -282.5, -177.5, -72.5, Y_PORT + 0.5):
            z = deck_z(yj)
            L.box_bm(bm, (-HALF + 0.5, yj - 0.12, z + road.road_z(0) - 0.005), (HALF - 0.5, yj + 0.12, z + 0.004))
        L.mesh_object("pont_joints", bm, [joint])
    if haubans:
        print("[pont] haubans : palier pas encore écrit", flush=True)
    print(f"[pont] tablier {Y_START:.0f}..{Y_PORT:.0f} m, crête {deck_z(Y_CREST):.2f} m en y {Y_CREST:.0f}, "
          f"{len(out['lamps'])} lampadaires, {'vu de loin' if far else 'complet'}", flush=True)
    return out


def road_point(x, y, lift=0.0):
    """Un point sur la chaussée (bombé compris)."""
    return Vector((x, y, deck_z(y) + road.road_z(x) + lift))


def place_on_deck(rig, x, y, heading=0.0):
    """Pose un véhicule sur le tablier : la hauteur et la pente du tablier sous lui."""
    pitch = math.degrees(math.atan(deck_slope(y)))
    return L.put(rig, x, y, deck_z(y) + road.road_z(x), heading, pitch)


# ---------------------------------------------------------------- le plan

SPEED = 30.0          # m/s, pleine vitesse (108 km/h)


def pack(entries, speed=SPEED, beams=True, on=None):
    """La meute : une patrouille chargée, les autres en copies liées ; (genre, x, y, cap) par véhicule ; `on`,
    la pose (place_on_deck par défaut). Renvoie la liste des rigs."""
    on = on or place_on_deck
    out, src = [], {}
    for i, (kind, x, y, heading) in enumerate(entries):
        if kind not in src:
            src[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
            r = src[kind]
            L.bar_pools(r, energy=1500.0)      # les flaques corail et lilas sur la chaussée mouillée
        else:
            r = L.clone(src[kind], f"{kind}_{i}")
        on(r, x, y, heading)
        if beams:
            yaw = 25 + 70 * ((i * 37) % 5) / 4
            L.bar_beams(r, f"{kind}_{i}", yaws=((yaw, L.CORAL), (yaw - 180 + 25 * (i % 3), L.LILAC)))
        L.drive(r, speed)
        out.append(r)
    return out


def plan_P4(scene, hidden, haubans=False):
    """P4, la meute : 200 mm, sur le plat 50 m après le pied de la rampe, à 1,5 m, horizontale, face à la ville.
    La berline descend vers nous (à 70 m de l'objectif à l'instant fort ; la décentration de 0,1 la pose au tiers
    bas sans pencher la caméra) ; derrière elle trois patrouilles en V, le fourgon qui passe la crête."""
    lamp_src = L.panorama(scene, hidden, bridge=None, port="loin")
    build_bridge(hidden, lamp_src, haubans=haubans)
    cam_y = Y_FOOT + 50.0
    hero = L.hero()
    y_hero = cam_y - 70.0
    place_on_deck(hero, 1.8, y_hero)
    L.drive(hero, SPEED, L.hero_wheels(hero), hero["wheel_r"])
    pack([("patrol", -1.8, y_hero - 25.0, 0.0), ("patrol", 5.2, y_hero - 38.0, 1.0), ("patrol", -5.2, y_hero - 60.0, -1.0),
          ("van", 1.8, Y_CREST + 6.0, 0.0)])
    L.haze((-260, 260), (-420, 120), (L.WATER_Z, 70), 0.0006)
    cam = L.camera("cam_P4", (-1.2, cam_y, 1.5), (-1.2, cam_y - 100.0, 1.5), lens=200, fstop=4.0,
                   focus=road_point(1.8, y_hero, 0.8), shift=(0.0, 0.1))
    scene.render.use_motion_blur = True
    return cam


PLANS = {"P4": plan_P4}


def build(plan, palier="socle"):
    scene, hidden = L.new_scene()
    cam = PLANS[plan](scene, hidden, haubans=(palier == "haubans"))
    scene.camera = cam
    scene.frame_set(2)
    return scene
