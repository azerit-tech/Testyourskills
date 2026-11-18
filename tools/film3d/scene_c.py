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
#   Dans la ville (FILM3D_VILLE, le défaut ; motion.pont_profil, 17 novembre au soir : 110 m au lieu de 315) :
#   y -328..-320   la tête de pont, contre le boulevard du quai de la rue
#   y -320..-263,5 la rampe à 7,5 % dès le quai, crête arrondie sur 48 m en -263,5, à 3,1 m
#   y -263,5..-210 la descente, le pied en -210 ; le terre-plein du port passe dessous dès son mur sud (-271,3)
#   Autonome (FILM3D_VILLE=0), le pont d'avant : plat de -320 à -255, rampe à 6 %, crête à 7,2 m en -130, pied en
#   -5, puis le plat jusqu'au mur du port (y -20) et le terre-plein (scene_e)
#
# Le profil en travers est celui de lieux.roadway : chaussée de 14 m bombée, trottoirs de 2 m, glissière en W,
# parapet en béton et garde-corps à 1,1 m, poutre de rive et caisson ; lampadaires des deux côtés tous les 20 m.
# Paliers : « socle » ; « haubans », le pylône en H à la crête et ses quatre éventails de câbles, sans rien
# changer au tablier (build_bridge(haubans=True), build_haubans).
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

# FILM3D_VILLE (« 1 » par défaut) : le pont rogné pour la ville unique (docs/cinematique-plan-de-ville.md §2.5, tête
# et pied de pont), son repère étant celui de la ville. « 0 » : le lieu autonome d'avant, inchangé (son avenue de
# 680 m, son sol, ses faux lointains, le tablier arrêté au mur du port d'avant en y -20).
VILLE = L.ville_on()

import motion as MO  # noqa: E402  (le profil en long : motion.pont_profil, la seule source, que _bridge_z intègre aussi)

# Le profil en long vient de motion.pont_profil : dans la ville (17 novembre au soir), le pont raccourci de
# motion.PONT_RACCOURCI m (110 m de tablier, crête de 3,1 m à 7,5 %, raccords de 22, 48 et 24 m) ; autonome
# (FILM3D_VILLE=0), le pont d'avant (crête de 7,2 m en -130, pied en -5).
_PROFIL = MO.pont_profil()
Y_START = MO.PONT_Y_START      # le tablier quitte le quai de la ville
Y_FOOT_CITY = _PROFIL["foot_city"]
Y_CREST = _PROFIL["crest"]
Y_FOOT = _PROFIL["foot"]       # pied de la rampe côté port
if VILLE:
    # la tête de pont : 8 m de chaussée sans enrobé entre le boulevard du quai de la rue (y -328, scene_b) et le
    # tablier ; l'ouverture du quai de la rue fait ±9,7 m, le bord extérieur du parapet
    Y_CITY_END = -328.0
    # le pied : parapets jusqu'au pied de la rampe (Y_FOOT) ; le port (sa pose dans parcours.py) passe dessous depuis
    # son mur sud et prend la suite : de ce mur au pied, des murs de soutènement sous les rives remplacent les piles.
    # La chaussée seule descend encore jusqu'à la fin du raccord (Y_TOE, z = 0)
    Y_PORT = Y_FOOT
    Y_TOE = Y_FOOT + 0.5 * _PROFIL["t_sag"]
    Y_PORT_WALL = L.PORT_YS[0] + L.pose_ville("port")[2]       # -271,3 : le mur sud du port, dans la ville
else:
    Y_CITY_END = -1000.0  # l'avenue continue dans la ville, dans l'axe du pont (le fond de P4)
    Y_PORT = -20.0        # le mur du quai du port : le tablier s'arrête là, le terre-plein prend la suite
    Y_TOE = Y_PORT_WALL = None
Y_END = Y_FOOT + 105.0
GRADE = _PROFIL["grade"]
T_SAG, T_CREST = _PROFIL["t_sag"], _PROFIL["t_crest"]     # longueurs des raccords (pied port, crête)

HALF = 7.0
WALK = 2.0
CITY_SHORE = L.CITY_SHORE_Y   # -325 : le mur du quai de la ville (scene_b, s 181 posé en y -325)
# les lampadaires tous les 20 m du quai au pied (comme la jetée, scene_d.J_LAMPS ; 30 m laissaient l'enrobé noir devant
# la berline au haut de la rampe, brouillon v6 images 306–330) ; les piles tous les 35 m (la dernière, la culée, n'est pas posée)
LAMP_YS = [Y_START + 10.0 + 20.0 * k for k in range(int((Y_FOOT - Y_START - 10.0) / 20.0) + 1)]
# la paire de la tête de pont (ville) : sur ses trottoirs, côté pont du mur du quai de la rue (y -325)
HEAD_LAMP_Y = Y_START - 4.0
PIERS = [Y_START + 20.0 + 35.0 * k for k in range(int((Y_FOOT - Y_START - 20.0) / 35.0) + 2)]


def _grade(y):
    """La pente du tablier, raccords adoucis (linéaires en pente, donc paraboliques en hauteur) : motion.pont_pente."""
    return MO.pont_pente(y, _PROFIL)


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
        curv = any(abs(y - c) < t * 0.7 for c, t in ((Y_FOOT_CITY, _PROFIL["t_sag_city"]), (Y_CREST, T_CREST), (Y_FOOT, T_SAG)))
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
                    lamp_src=lamp_src, lamp_ys=LAMP_YS, far=far, lamp_quinconce=LAMP_QUINCONCE if VILLE else 0.0)
    M = out["M"]
    edge = out["edge"]
    # (le tablier a l'humidité de tout le film, road.HUMIDITE : plus de vernis propre au pont, lumière v3.1 règle B)
    # la rue de la ville et le plat du port : la même chaussée, sans bord (posée sur la promenade, sur le terre-plein)
    # l'avenue de la ville éclairée tous les 30 m (au 200 mm, la file de lampadaires au fond de la crête) ; le plat
    # du port suit le tablier : la rampe ne touche le niveau du terre-plein qu'en y = 1 (en y = -20 elle est encore à
    # 0,7 m ; plate, la chaussée du port y montrait la tranche du tablier en travers de P4)
    ave = [Y_START - 15.0 - 30.0 * k for k in range(int((Y_START - Y_CITY_END) / 30.0))]
    # dans la ville, la tête de pont (y -328 à -320) porte le parapet du tablier, bord extérieur ±9,7 : il vient mourir
    # contre le mur du quai de la rue (de |x| 9,7, jusqu'en y -324,5), sans bande vide entre les deux
    # Dans la ville, la tête de pont suit le profil du tablier (deck_z) : le raccord du pied côté ville commence en
    # y -328, 8 m avant le tablier ; posée à plat, elle laissait en y -320 une marche de 11 cm sur toute la largeur
    # (chaussée, cunettes, trottoirs), dont la tranche barrait le cadre d'un trait (brouillon éclairé v8, images
    # 306–330), et la berline, qui suit motion._bridge_z, y flottait de quelques centimètres. Elle porte sa paire de
    # lampadaires (HEAD_LAMP_Y) : entre ceux du quai (x ±16) et le premier du tablier (y -310), la chaussée au bas du
    # cadre restait noire à l'entrée du pont.
    L.roadway("pont_ville", samples(Y_CITY_END, Y_START) if VILLE else [Y_CITY_END, Y_START],
              deck_z if VILLE else None, half=HALF, walk=WALK, rail="parapet" if VILLE else None,
              under="caisson" if VILLE else None, M=M, far=far,
              lamp_src=lamp_src if VILLE else (None if far else lamp_src), lamp_ys=[HEAD_LAMP_Y] if VILLE else ave)
    bm = L.bmesh.new()
    if VILLE:
        # la fin du raccord du pied, sans bord, jusqu'à z = 0 (le nom ne commence pas par « pont_port_ » :
        # scene_e._remove_bridge_flat la laisse) ; la culée de la ville, de son mur de quai au tablier
        L.roadway("pont_pied", samples(Y_PORT, Y_TOE), deck_z, half=HALF, walk=WALK, rail=None, M=M, far=far)
        L.box_bm(bm, (-12.5, CITY_SHORE, L.WATER_Z - 1.5), (12.5, Y_START, -0.08))   # sous les cunettes (-0,05)
    else:
        L.roadway("pont_port", samples(Y_PORT, Y_END), deck_z, half=HALF, walk=WALK, rail=None, M=M, far=far)
        L.box_bm(bm, (-12.5, Y_START - 45.0, L.WATER_Z - 1.5), (12.5, Y_START, -0.01))  # la culée de la ville
        L.box_bm(bm, (-40.0, Y_CITY_END, -0.4), (40.0, Y_START - 45.0, -0.02))         # le sol de l'avenue
    L.mesh_object("pont_culee_ville", bm, [M["concrete"]])
    if VILLE:
        build_retaining(edge, M["concrete"])
    # les piles tous les 35 m : un chevêtre sous le caisson, deux fûts dans l'eau (dans la ville, pas sur le
    # terre-plein du port : les murs de soutènement y portent la rampe)
    bm = L.bmesh.new()
    for y in PIERS[:-1]:
        if VILLE and y > Y_PORT_WALL:
            continue
        zt = deck_z(y) - 1.9
        L.box_bm(bm, (-6.2, y - 1.0, zt - 1.3), (6.2, y + 1.0, zt))
        for x in (-4.2, 4.2):
            L.tube_bm(bm, (x, y, L.WATER_Z - 4.0), (x, y, zt - 1.2), 0.85, seg=20)
    L.mesh_object("pont_piles", bm, [M["concrete"]])
    if not far:
        # les joints : une bande d'acier mouillé qui épouse le bombé de la chaussée, 3 mm au-dessus. En boîte plate
        # à la hauteur de l'axe, le joint passait sous l'enrobé bombé et barrait tout le cadre de P4 d'un trait
        # noir au 200 mm (une fente dans l'image)
        # (acier mouillé et sale, sombre : à 0,42 de clair, le joint de la tête de pont, à un mètre de la marche,
        # doublait le trait clair en travers du cadre à l'entrée du pont, brouillon éclairé v8)
        # (brouillon éclairé v9, images 332–333 : deux taches crème au bas du cadre, puis une bande sur toute la
        # largeur, puis rien. C'était ce joint, en acier (métal 1, rugosité 0,3) : un miroir de 24 cm qui renvoyait à
        # la caméra la paire de lampadaires du tablier (y −310) pendant les deux images où le point de reflet passe
        # sur lui, 2 m devant l'objectif ; déjà là en v8. Le joint est maintenant du caoutchouc et de la crasse sur
        # l'acier : diélectrique, mat, sombre ; il ne renvoie plus que ce que renvoie l'enrobé mouillé autour.)
        joint = S.mat_plain("joint_dilatation", (0.05, 0.05, 0.055, 1), 0.78, 0.0)
        bm = L.bmesh.new()
        xs = [-HALF + 0.5 + (2 * HALF - 1.0) * k / 40 for k in range(41)]
        old = [y for y in (-282.5, -177.5, -72.5) if Y_START + 5.0 < y < Y_PORT - 5.0]
        for yj in [Y_START + 1.0] + old + [Y_PORT + 0.5]:
            row = [(bm.verts.new((x, yj - 0.12, deck_z(yj - 0.12) + road.road_z(x) + 0.003)),
                    bm.verts.new((x, yj + 0.12, deck_z(yj + 0.12) + road.road_z(x) + 0.003))) for x in xs]
            for (a0, a1), (b0, b1) in zip(row, row[1:]):
                bm.faces.new((a0, b0, b1, a1))
        L.mesh_object("pont_joints", bm, [joint])
        if VILLE:
            build_joint_rhythm(xs, old)
    if haubans:
        build_haubans(out)
    print(f"[pont] tablier {Y_START:.0f}..{Y_PORT:.0f} m, crête {deck_z(Y_CREST):.2f} m en y {Y_CREST:.0f}, "
          f"{len(out['lamps'])} lampadaires, {'vu de loin' if far else 'complet'}", flush=True)
    return out


# La vitesse sur le pont (brouillon éclairé v9, SPEC §18.63) : à 107 km/h, le bas du cadre n'était qu'un enrobé sombre
# et lisse, les images successives presque identiques. Des joints de chaussée à lèvres d'acier galvanisé tous les
# JOINT_PAS m (un tiers de la portée des piles) rythment le sol au bas du cadre : 2,6 par seconde en pointe ; les
# lèvres, claires et métalliques, prennent la lumière des lampadaires sans s'éclairer elles-mêmes. Et la file de
# lampadaires de gauche en quinconce (LAMP_QUINCONCE) : une tête tous les 10 m au lieu de 20, alternée, dont la lumière
# passe sur le toit de la berline (les mêmes lampadaires, motivés, sans tache ajoutée).
JOINT_PAS = 35.0 / 3.0
JOINT_LEVRE = 0.05          # m, la largeur de chaque lèvre d'acier
JOINT_JOINT = 0.07          # m, le joint d'élastomère noir entre elles
LAMP_QUINCONCE = 10.0


def joint_rhythm_ys(old=()):
    """Les y des joints rythmés : tous les JOINT_PAS m du tablier, à plus de 3 m de ses bouts et des joints d'origine."""
    out, y = [], Y_START + JOINT_PAS
    while y < Y_PORT - 3.0:
        if all(abs(y - o) > 3.0 for o in old):
            out.append(y)
        y += JOINT_PAS
    return out


def build_joint_rhythm(xs, old=()):
    """Les joints rythmés : deux lèvres d'acier galvanisé et un joint noir, qui épousent le bombé (3 mm au-dessus)."""
    acier = L.mat_steel("joint_levre", color=(0.32, 0.32, 0.33), rough=0.35, rust=0.1)
    noir = S.mat_plain("joint_elastomere", (0.025, 0.025, 0.027, 1), 0.6, 0.0)
    bl, bj = L.bmesh.new(), L.bmesh.new()

    def band(bm, y0, y1):
        row = [(bm.verts.new((x, y0, deck_z(y0) + road.road_z(x) + 0.003)),
                bm.verts.new((x, y1, deck_z(y1) + road.road_z(x) + 0.003))) for x in xs]
        for (a0, a1), (b0, b1) in zip(row, row[1:]):
            bm.faces.new((a0, b0, b1, a1))
    ys = joint_rhythm_ys(old)
    h = JOINT_JOINT / 2
    for y in ys:
        band(bl, y - h - JOINT_LEVRE, y - h)
        band(bj, y - h, y + h)
        band(bl, y + h, y + h + JOINT_LEVRE)
    L.mesh_object("pont_joints_levres", bl, [acier])
    L.mesh_object("pont_joints_elastomere", bj, [noir])
    print(f"[pont] {len(ys)} joints rythmés tous les {JOINT_PAS:.1f} m", flush=True)
    return ys


def build_retaining(edge, conc):
    """Dans la ville, la rampe au-dessus du terre-plein du port, de son mur sud (Y_PORT_WALL) au pied : deux murs
    de soutènement de 0,5 m sous les rives (jusqu'au bord extérieur du parapet), du béton du port au-dessous du
    caisson, et le mur de tête au droit du quai, de l'eau au tablier. Le vide sous la rampe est fermé : on n'y voit
    plus le caisson s'enfoncer dans le béton."""
    bm = L.bmesh.new()
    ys = [y for y in samples(Y_PORT_WALL, Y_PORT, fine=1.0, coarse=2.0)]
    for side in (-1, 1):
        x0, x1 = sorted((side * (edge - 0.5), side * edge))
        prev = None
        for y in ys:
            top = deck_z(y) - 1.5
            if top <= 0.02:
                break
            ring = [bm.verts.new((x, y, z)) for x, z in ((x0, -0.3), (x1, -0.3), (x1, top), (x0, top))]
            if prev:
                for k in range(4):
                    bm.faces.new((prev[k], prev[(k + 1) % 4], ring[(k + 1) % 4], ring[k]))
            prev = ring
    yw = Y_PORT_WALL
    L.box_bm(bm, (-edge, yw - 0.6, L.WATER_Z - 1.5), (edge, yw, deck_z(yw) - 1.5))
    L.mesh_object("pont_soutenement", bm, [conc])


# ---------------------------------------------------------------- le pylône et les haubans

PY_X = 11.0           # les deux jambes de part et d'autre du tablier (entraxe 22 m), 3 × 2 m
PY_H = 45.0           # hauteur au-dessus de la chaussée de crête
PY_BEAMS = (28.0, PY_H)                                   # les traverses
# les ancrages sur le tablier : de 16 à 100 m du pylône ; dans la ville, le pont de 110 m n'a que 53 m de chaque côté
# de sa crête : de 10 à 49 m
STAY_D = [16.0 + 12.0 * k for k in range(8)] if not VILLE else \
    [10.0 + (min(Y_CREST - Y_START, Y_FOOT - Y_CREST) - 4.5 - 10.0) * k / 7.0 for k in range(8)]
STAY_R = 0.1


def build_haubans(out):
    """Le palier « haubans » : le pylône en H à la crête (deux jambes de 3 × 2 m qui montent de l'eau à 45 m
    au-dessus de la chaussée, une traverse sous le caisson, une à 28 m, une au sommet), deux nappes de huit
    haubans de chaque côté (Ø 0,2 m, ancrés tous les 12 m de 16 à 100 m du pylône, en éventail serré en tête de
    jambe), quatre projecteurs ambre au pied qui lèchent les jambes, un feu corail fixe au sommet. Le tablier
    ne change pas : les haubans tiennent la poutre de rive, juste au-dehors du parapet."""
    z0 = deck_z(Y_CREST)
    z_top = z0 + PY_H
    concrete = L.mat_concrete("pylone", tint=(0.66, 0.64, 0.61), streaks=1.4, scale=0.3)
    bm = L.bmesh.new()
    for sx in (-1, 1):
        x = sx * PY_X
        L.box_bm(bm, (x - 1.5, Y_CREST - 1.0, L.WATER_Z - 4.0), (x + 1.5, Y_CREST + 1.0, z_top))
        # le chapiteau : la tête de jambe un peu plus large, où s'ancrent les haubans
        L.box_bm(bm, (x - 1.7, Y_CREST - 1.2, z_top - 14.0), (x + 1.7, Y_CREST + 1.2, z_top + 0.6))
    # la traverse basse porte le caisson ; les deux autres raidissent le portique
    L.box_bm(bm, (-PY_X - 1.5, Y_CREST - 1.4, z0 - 4.2), (PY_X + 1.5, Y_CREST + 1.4, z0 - 1.9))
    for h in PY_BEAMS:
        L.box_bm(bm, (-PY_X + 1.5, Y_CREST - 0.9, z0 + h - 2.2), (PY_X - 1.5, Y_CREST + 0.9, z0 + h))
    L.mesh_object("pont_pylone", bm, [concrete])
    # les haubans : quatre éventails de huit, le plus long ancré le plus haut
    steel = L.mat_steel("hauban", color=(0.8, 0.81, 0.82), rough=0.28, rust=0.04, paint=True)
    xd = out["edge"] + 0.2
    bm = L.bmesh.new()
    n = len(STAY_D)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k, d in enumerate(STAY_D):
                zt = z_top - 1.6 - 1.5 * (n - 1 - k)
                y = Y_CREST + sy * d
                L.tube_bm(bm, (sx * PY_X, Y_CREST + sy * 1.25, zt), (sx * xd, y, deck_z(y) + 0.05), STAY_R, seg=8)
                # le culot d'ancrage sur la poutre de rive
                L.box_bm(bm, (sx * xd - 0.25, y - 0.4, deck_z(y) - 0.5), (sx * xd + 0.25, y + 0.4, deck_z(y) + 0.15))
    L.mesh_object("pont_haubans", bm, [steel], smooth=True)
    # quatre projecteurs ambre au pied, de part et d'autre de chaque jambe, le faisceau rasant la face
    housing = S.mat_plain("projecteur_boitier", (0.05, 0.05, 0.055, 1), 0.4, 0.6)
    bm = L.bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector((sx * PY_X, Y_CREST + sy * 1.9, z0 + 0.25))
            L.box_bm(bm, (p.x - 0.35, p.y - 0.3, p.z - 0.25), (p.x + 0.35, p.y + 0.3, p.z + 0.15))
            Ld = bpy.data.lights.new(f"pylone_projecteur_{sx}_{sy}", "SPOT")
            Ld.color = L.lin(L.AMBER)[:3]
            Ld.energy = 25000.0
            Ld.spot_size = math.radians(22.0)
            Ld.spot_blend = 0.35
            Ld.shadow_soft_size = 0.2
            o = bpy.data.objects.new(Ld.name, Ld)
            bpy.context.scene.collection.objects.link(o)
            o.location = p + Vector((0, 0, 0.2))
            up = Vector((sx * PY_X, Y_CREST + sy * 1.0, z_top)) - o.location
            o.rotation_euler = up.to_track_quat("-Z", "Y").to_euler()
            o.visible_camera = False
    L.mesh_object("pont_projecteurs", bm, [housing])
    # le feu corail fixe au sommet, au milieu de la traverse haute
    bm = L.bmesh.new()
    L.bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.35,
                                matrix=L.Matrix.Translation((0.0, Y_CREST, z_top + 0.35)))
    L.mesh_object("pont_feu_sommet", bm, [L.emit_mat("feu_sommet", L.lin(L.CORAL), 60.0)]).visible_shadow = False
    Ld = bpy.data.lights.new("pont_feu_sommet_light", "POINT")
    Ld.color = L.lin(L.CORAL)[:3]
    Ld.energy = 400.0
    Ld.shadow_soft_size = 0.35
    o = bpy.data.objects.new(Ld.name, Ld)
    bpy.context.scene.collection.objects.link(o)
    o.location = (0.0, Y_CREST, z_top + 1.0)
    o.visible_camera = False
    print(f"[pont] haubans : pylône en H à {z_top:.1f} m, {4 * n} haubans de {STAY_D[0]:.0f} à {STAY_D[-1]:.0f} m",
          flush=True)


def road_point(x, y, lift=0.0):
    """Un point sur la chaussée (bombé compris)."""
    return Vector((x, y, deck_z(y) + road.road_z(x) + lift))


def place_on_deck(rig, x, y, heading=0.0):
    """Pose un véhicule sur le tablier : la hauteur et la pente du tablier sous lui."""
    pitch = math.degrees(math.atan(deck_slope(y)))
    return L.put(rig, x, y, deck_z(y) + road.road_z(x), heading, pitch)


# ---------------------------------------------------------------- le plan

SPEED = 30.0          # m/s, pleine vitesse (108 km/h)
P4_FACE_W = 2000.0    # W, l'appoint de face de la berline (lieux.car_fill, lié à elle seule)
P4_PORT_W = 900.0     # W, la lumière ambre du port sur sa calandre en fin de plan (port_glow)


def port_glow(hero, frames):
    """La lumière ambre du port (ses mâts, derrière la caméra) qui lèche la calandre de la berline quand elle
    approche du pied du pont (plan de lumière v3.1, P4, images 36 à 48) : une source douce ambre liée à elle seule
    (lieux.car_fill : invisible, sans reflet, le tablier ne la reçoit pas), devant elle, haute et sur sa droite,
    qui monte de 0 à P4_PORT_W entre les deux images de `frames`. Renvoie la lumière."""
    f0, f1 = frames
    lo = L.car_fill(hero, loc=(-3.0, 9.0, 5.0), energy=P4_PORT_W, color=L.AMBER, size=6.0)
    lo.name = lo.data.name = "hero_port"
    for f, e in ((f0, 0.0), (f1, P4_PORT_W)):
        lo.data.energy = e
        lo.data.keyframe_insert("energy", frame=f)
    return lo


def pack(entries, speed=SPEED, beams=True, on=None):
    """La meute : une patrouille chargée, les autres en copies liées ; (genre, x, y, cap) par véhicule ; `on`,
    la pose (place_on_deck par défaut). Renvoie la liste des rigs."""
    on = on or place_on_deck
    out, src = [], {}
    for i, (kind, x, y, heading) in enumerate(entries):
        if kind not in src:
            src[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
            r = src[kind]
        else:
            r = L.clone(src[kind], f"{kind}_{i}")
        on(r, x, y, heading)
        L.drive(r, speed)
        out.append(r)
    return out


def plan_P4(scene, hidden, haubans=False):
    """P4, la meute (découpage v3) : fixe en (1,2 ; 10 ; 1,2), face à la ville, 200 mm puis 212 mm, un léger suivi
    qui garde la berline au centre, à 54 % de la hauteur depuis le haut. Elle descend vers nous de 111 à 46 m (de 16
    à 44 % de large) ; derrière elle la meute empilée par la longue focale, quatre patrouilles de plus qui passent la
    crête (y -130) aux images 8, 18, 28 et 38 : six rampes au début, dix à la fin. Le tablier court jusqu'à y -320,
    l'avenue de la ville au-delà. Dans la ville (p4_pont) : la conduite unique, la caméra en (1,2 ; 31,6 ; 1,2) devant
    les séparateurs du port, 163 puis 173 mm ; la berline de 75 à 37 m, feux stop à partir de l'image 40."""
    # le ciel commun (lieux.ciel) : la bande corail du côté de la mer, derrière la caméra qui regarde la ville
    if VILLE:
        # dans la ville, plus de port ni de jetée : ils viennent de la ville, à leur pose ; le panorama y ramène la
        # ville lointaine au vrai (100 m derrière le quai, la fente de la rue de ±8 m) et pose le phare à sa place
        lamp_src = L.panorama(scene, hidden, yaw=L.mer_lieu("pont"), bridge=None, port=None, lieu="pont")
    else:
        lamp_src = L.panorama(scene, hidden, bridge=None, port="loin")
    build_bridge(hidden, lamp_src, haubans=haubans)
    # (plus de voile ni de lueur propres à P4 : le ciel commun, lieux.ciel ; la lueur que le voile envoyait aux
    # rayons réfléchis jusqu'à 15° faisait du tablier une nappe mauve et beige, lumière v3.1 règles A et B)
    # --- animé (48 images, p4_pont.py, clés de motion.py)
    import motion as M
    import p4_pont as P4
    frames = range(P4.F0 - 1, P4.F0 + P4.FRAMES + 1)
    scene.frame_start, scene.frame_end = P4.F0, P4.F0 + P4.FRAMES - 1
    cam_y = P4.CAM[1]

    def ground(x, y):
        return deck_z(y) + road.road_z(x), math.degrees(math.atan(deck_slope(y)))

    hero = L.hero()
    wheels = L.hero_wheels(hero)
    d = [Vector(w.location).y for w in wheels]
    poses = M.sample(P4.hero_pos, frames, heading=P4.hero_heading, steer=getattr(P4, "hero_steer", None),
                     spin=getattr(P4, "hero_spin", None),
                     wheel_r=hero["wheel_r"], wheelbase=(max(d) - min(d)) if d else 2.9)
    M.key_vehicle(hero, poses, wheels=wheels, ground=ground)
    M.wheel_marks(wheels, hero["wheel_r"])
    if P4.brake_windows():
        import hero_cars          # les feux stop du parcours : elle freine pour le virage du port
        for a, b in P4.brake_windows():
            hero_cars.stop_lamps(bpy.data.objects[hero["body"]], a, b)
    # à contre-jour des lampadaires et des patrouilles, la berline n'était qu'une silhouette noire : une source
    # douce de face, à 8 m devant elle, accrochée à son rig (elle suit les clés), qui n'éclaire qu'elle (le sol
    # mouillé ne la reçoit pas). C'est la bande corail du ciel, derrière la caméra, sur sa calandre : à 500 W la
    # caisse restait à 10 % (lumière v3.1, P4 : 12 à 16 %, dans la suite de P3 et P5)
    # Ville (le trajet roulé) : la caméra la suit de dos au bras commun, l'appoint de face n'éclairait plus qu'une
    # calandre hors champ et la caisse passait au noir à la jonction P3 → P4 (fixes éclairés v5) : l'appoint de
    # poursuite commun, le même qu'en P3 et P5 (lieux.chase_fill)
    if VILLE:
        L.chase_fill(hero)
    else:
        L.car_fill(hero, loc=(0.4, 8.0, 2.2), energy=P4_FACE_W)
    # l'habitacle allumé, comme dans tous les tronçons (lieux.hero_cabin) : sans lui, la lunette passait au noir à
    # la coupe P3 → P4 (317 | 318, brouillon éclairé v9)
    L.hero_cabin(hero)
    port_glow(hero, P4.PORT_FRAMES)
    y_hero = P4.hero_pos(P4.T_STILL)[1]
    entries = [(e[0], *P4.pack_pos(i)(P4.T_STILL), 0.0) for i, e in enumerate(P4.PACK)] + \
        [("van", *P4.van_pos(P4.T_STILL), 0.0)]
    rigs = pack(entries)
    fns = [P4.pack_pos(i) for i in range(len(P4.PACK))] + [P4.van_pos]
    for i, (r, fn) in enumerate(zip(rigs, fns)):
        # (roues séparées, cast_vehicles.split_wheels : elles tournent, l'avant braque ; trajectoire inchangée)
        body = M.body_of(r)
        wh, wr = M.wheels_of(body), body.get("wheel_r", 0.36)
        ps = M.sample(fn, frames, wheel_r=wr, seed=float(i + 1), wheelbase=body.get("wheelbase", 2.9),
                      front=body.get("front_axle"))
        M.key_vehicle(r, ps, wheels=wh, ground=ground, pivot=(0.0, 0.0, 0.36))
        M.wheel_marks(wh, wr, axis="Y")
    n = M.flash_bars(rigs, frames)
    # une brume légère et basse : au 200 mm, l'objectif regarde à travers 300 m d'air (à 0,0006 sur 70 m de haut,
    # les patrouilles du fond se voilaient)
    L.haze((-260, 260), (-420, 120), (L.WATER_Z, 30), 0.0002)
    cam = L.camera("cam_P4", P4.CAM, (P4.CAM[0], cam_y - 100.0, P4.CAM[2]), lens=P4.LENS, fstop=4.0,
                   focus=road_point(P4.HERO_X, y_hero, 0.8))     # sans décentrement : le site cadre la berline
    M.key_camera(cam, frames, P4.camera)
    cam.data.dof.focus_object = hero
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    print(f"[P4] {len(frames)} images de clés ; berline de {cam_y - poses[1]['y']:.0f} à {cam_y - poses[-2]['y']:.0f} m "
          f"à {poses[1]['speed'] * 3.6:.0f} km/h, tangage {poses[1]['pitch']:.1f}° ; {n} lumières de rampe "
          f"clignotantes", flush=True)
    return cam


PLANS = {"P4": plan_P4}


def build(plan, palier="complet"):
    """« complet » (par défaut, celui du film : render_film.py n'en passe pas) prend tous les paliers validés, ici
    le pylône et ses haubans ; « socle » le pont nu (render_lieux.py --palier)."""
    scene, hidden = L.new_scene()
    cam = PLANS[plan](scene, hidden, haubans=(palier in ("haubans", "complet")))
    scene.camera = cam
    __import__("fx").dress(plan, scene)                 # les interactions (fx.py ; FILM3D_FX=0 les retire)
    import p4_pont as P4
    scene.frame_set(P4.STILL_FRAME if plan == "P4" else 2)
    return scene
