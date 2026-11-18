# Le plan FIN6 écrit une fois, sans Blender : la fin du film à six étoiles. Depuis le 17 novembre (SPEC §18.55),
# il continue le trajet roulé sans coupe : la fenêtre « FIN6 » du parcours (parcours.py), qui suit P6 au même
# point de la jetée, à la même vitesse, sous le même bras de caméra.
#
# - La berline : la fin du parcours unique, son freinage jusqu'à l'arrêt sur la pointe (parcours.T_ARRET, image
#   F_STOP du plan), feux stop allumés, sans glisse. Le point d'arrêt (CX, CY) et son cap (HERO_STOP) sont ceux du
#   parcours ; tout ce que FIN posait autour du sien (l'anneau, les agents, le lampadaire, l'hélicoptère, la
#   patrouille 1) y est reporté, tourné de l'écart de cap, la patrouille 1 décalée dans le temps comme l'arrêt.
# - La caméra : LA caméra du film (parcours.chase, le bras commun) jusqu'à l'orbite, puis la même, tournée autour
#   de la berline de SWEEP par sa gauche (30 °/s et 40 °/s² au plus), posée immobile au trois quarts arrière gauche
#   à la fin : le flanc du conducteur, ses mains dehors, la patrouille 1, l'anneau et six agents qui la tiennent en
#   joue. Hauteur et distance restent celles du bras (2,4 m, 7,5 m) : rien ne saute à la jonction avec P6.
#
# Repère de l'eau (lieux.py) : la pointe centrée en (80, 430) ; les azimuts autour du point d'arrêt sont comptés
# depuis +x, dans le sens trigonométrique.
import math

import motion as M
import fin_pointe as F
import parcours as PC

FRAMES = PC.FIN6_FRAMES
F0 = 1
V3 = True
V31 = True
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = FRAMES               # la dernière image, immobile
T_STILL = M.t_of(STILL_FRAME)


def _f(t):
    return F0 + t * M.FPS


# --- la berline : la fenêtre « FIN6 » du parcours (t en s depuis FIN6/1)
_H = PC.hero("FIN6")


class _Hero:
    """La conduite de la berline dans FIN6, avec l'interface de motion.drive (t en s depuis FIN6/1)."""
    t_stop = PC.T_ARRET - PC.t_of("FIN6", F0)

    @staticmethod
    def pos(t):
        return _H["pos"](_f(t))

    @staticmethod
    def heading(t):
        return _H["heading"](_f(t))

    @staticmethod
    def travel(t):
        return _H["travel"](_f(t))

    @staticmethod
    def slip(t):
        return _H["slip"](_f(t))

    @staticmethod
    def steer(t):
        return _H["steer"](_f(t))

    @staticmethod
    def spin(t):
        return _H["spin"](_f(t))

    @staticmethod
    def speed(t):
        return _H["speed"](_f(t))

    @staticmethod
    def along(t):
        return _H["along"](_f(t))

    @staticmethod
    def brake_windows(frames=None):
        return PC.brake_windows("FIN6")


HERO = _Hero()
T_STOP = HERO.t_stop
F_STOP = int(round(_f(T_STOP)))
HERO_STOP = HERO.heading(T_STOP + 1.0)
CX, CY = HERO.pos(T_STOP + 1.0)
HERO_BOX = (4.9, 1.9, 1.45)        # la berline : longueur, largeur, hauteur (m)
hero_pos, hero_heading, hero_slip, hero_steer = HERO.pos, HERO.heading, HERO.slip, HERO.steer
hero_spin = HERO.spin

# --- ce que FIN posait autour de son point d'arrêt (fin_pointe.SX, SY, cap fin_pointe.HERO_STOP), reporté autour de
# celui du parcours : tourné de ROT, déplacé ; ses images décalées de SHIFT (l'arrêt à F_STOP au lieu de 36)
ROT = HERO_STOP - F.HERO_STOP
SHIFT = F_STOP - F.F_STOP
_DT = SHIFT / M.FPS


def from_fin(x, y):
    """Un point du repère de FIN, reporté autour du point d'arrêt de FIN6."""
    a = math.radians(ROT)
    dx, dy = x - F.SX, y - F.SY
    return CX + dx * math.cos(a) - dy * math.sin(a), CY + dx * math.sin(a) + dy * math.cos(a)


P1_LEAD_IN = 20.0                  # m de ligne droite avant son arc (dans FIN, l'arc commençait hors du plan)


def _route(start):
    r = F._p1_route(start)
    return dict(r, pieces=[M.line(P1_LEAD_IN)] + list(r["pieces"]))


def _p1_drive():
    """La conduite de la patrouille 1 de FIN (fin_pointe._p1_drive), sa table tenue 4 s plus tôt : décalée de SHIFT
    images, elle roule déjà pendant les premières images de FIN6 (au bord de la table de FIN, son cap sautait)."""
    lim = dict(slip_per=F.P1_SLIP_PER)
    d = M.drive(_route((0.0, 0.0, F.P1_CAP0)), F.P1_V, stop=True, kind="patrol", lim=lim, t_span=(-4.0, 10.0))
    ex, ey = d.pos(d.t_stop + 1.0)
    t0 = M.t_of(F.F_P1_STOP) - d.t_stop
    return M.drive(_route((F.P1_STOP[0] - ex, F.P1_STOP[1] - ey, F.P1_CAP0)), F.P1_V, t0=t0, stop=True,
                   kind="patrol", lim=lim, t_span=(t0 - 4.0, t0 + 10.0))


P1_DRIVE = _p1_drive()


def patrol1_pos(t):
    return from_fin(*P1_DRIVE.pos(t - _DT))


def patrol1_heading(t):
    return P1_DRIVE.heading(t - _DT) + ROT


def patrol1_slip(t):
    return P1_DRIVE.slip(t - _DT)


def patrol1_steer(t):
    return P1_DRIVE.steer(t - _DT)


PATROL1 = F.PATROL1
P1_AT, P1_HEAD = from_fin(*F.P1_STOP), F.P1_HEAD + ROT
DRIVER_KEYS, DRIVER_OUT = (F.DRIVER_KEYS[0] + SHIFT, F.DRIVER_KEYS[1] + SHIFT), F.DRIVER_OUT
# l'hélicoptère de FIN, en stationnaire devant elle, à la hauteur où P6 le laisse (helicos.py : l'appareil 0 le
# rejoint pendant la fin de P6) : une hauteur et demie de lampadaire de la jetée au moins
HELI_Z = 12.4
HELI_RIGHT = 5.0                   # m plus à droite que dans FIN : il ne passe pas devant le phare
HELI = from_fin(F.HELI[0] + HELI_RIGHT, F.HELI[1]) + (HELI_Z,)
HELI_HEADING = F.HELI_HEADING + ROT
# le lampadaire de la pointe, rangé comme dans FIN, un mètre plus en arrière : sa tête et son reflet sur l'enrobé
# mouillé restent hors du cadre à toutes les images de l'orbite
LAMP_AT = from_fin(F.SX + 11.0, F.SY - 10.0)
LAMP_HEAD = from_fin(F.SX + 11.0 + F.LAMP_HEAD[0] - F.LAMP_FIN[0],
                     F.SY - 10.0 + F.LAMP_HEAD[1] - F.LAMP_FIN[1]) + (F.LAMP_HEAD[2],)


def beam_target(t):
    """Le projecteur de l'hélicoptère : il continue la visée de la fin de P6 (2 m devant elle, le long de sa route :
    p6_jetee.beam_target) et glisse sur elle pendant le freinage, posé sur elle à l'arrêt. (Brouillon éclairé v9,
    critique n° 9 : il battait de 1,1 m à 1,3 Hz en partant de 3,5 m devant elle ; sa tache au sol, désormais
    bornée et visible, ne doit ni sauter à la jonction ni trembler sur la récompense.)"""
    x, y = hero_pos(t)
    w = 1.0 - M.smoothstep(T_STOP - 1.5, T_STOP, t)
    h = math.radians(hero_heading(t))
    return x - 2.0 * w * math.sin(h), y + 2.0 * w * math.cos(h), 0.6 + 0.2 * (1.0 - w)


def tracks():
    return {"hero": hero_pos, "patrol_1": patrol1_pos}


def tracks_heading():
    return {"patrol_1": patrol1_heading}


def polar(a, r, c=None):
    c = (CX, CY) if c is None else c
    t = math.radians(a)
    return c[0] + r * math.cos(t), c[1] + r * math.sin(t)


# --- l'anneau et les agents (ceux de FIN6 d'avant, tournés de ROT autour du nouveau point d'arrêt) : des patrouilles
# et le fourgon à 14 m du point d'arrêt, tournés vers lui, qui l'attendaient, seulement là où ni la berline ni la
# patrouille 1 ne passent ni la caméra ; la patrouille 1 s'arrête à la place du huitième
RING_R = 14.0
RING = [-122.7 + ROT + 360.0 / 11 * i for i in range(11)]
RING_KEEP = [4, 5, 6, 10]
RING_VAN = 10
RING_JITTER = 28.0                 # ° : l'écart de chaque véhicule à la visée du point d'arrêt (tiré, graine 6)


def ring_poses():
    """[(i, x, y, cap)] des véhicules de l'anneau (RING_KEEP) : à RING_R du point d'arrêt, tournés vers lui à
    ± RING_JITTER près (le tirage de scene_d.fin6_pointe, graine 6, dans le même ordre)."""
    import random
    rnd = random.Random(6)
    out = []
    for i in RING_KEEP:
        x, y = polar(RING[i], RING_R)
        out.append((i, x, y, M.heading_of(CX - x, CY - y) + rnd.uniform(-RING_JITTER, RING_JITTER)))
    return out


def ring_point(i, lon, lat):
    """(x, y) d'un point du repère du véhicule i de l'anneau : `lon` m vers son avant, `lat` m vers sa droite."""
    _, x, y, h = next(r for r in ring_poses() if r[0] == i)
    a = math.radians(h)
    return x - math.sin(a) * lon + math.cos(a) * lat, y + math.cos(a) * lon + math.sin(a) * lat


# six agents, face à elle (brouillon éclairé v9, critique n° 9 : six silhouettes en rang à 9–10 m d'elle, également
# espacées, à la même distance, la même attitude). Maintenant ils sont sortis de leurs voitures : les patrouilles de
# l'anneau ont leurs deux portières avant ouvertes (scene_d.fin6_pointe, lieux.open_door, 75°) et quatre agents sont
# derrière elles (deux en visée par-dessus la portière, un accroupi derrière, un en garde un pas en retrait de la
# portière arrière) ; un cinquième, en avant, fait « halte » de la main entre les deux voitures ; le sixième, en garde,
# couvre depuis l'arrière de la voiture de droite. Des distances de 8 à 16 m, des écarts inégaux. Le repère d'une
# portière : côté (+1, la portière du conducteur, à gauche ; -1, à droite), m vers l'avant, m dehors (la portière
# ouverte va de 0,63 à 0,96 m vers l'avant, de 0,92 à 2,16 m dehors).
DOOR_COPS = (               # (véhicule, côté, m vers l'avant, m dehors, pose, style) ; véhicule None : (azimut, rayon)
    (5, 1, -0.05, 1.5, "aim", 0),
    (5, -1, 0.1, 1.35, "crouch", 1),
    (6, 1, -0.15, 1.55, "aim", 2),
    (6, -1, -1.9, 1.75, "guard", 2),
    (None, 57.0, 8.2, "stop", 1),
    (5, -1, -3.4, 1.9, "guard", 0),
)


def _cop_polar(c):
    if c[0] is None:
        return c[1] + ROT, c[2]
    i, side, lon, out = c[:4]
    x, y = ring_point(i, lon, -side * out)
    return math.degrees(math.atan2(y - CY, x - CX)), math.hypot(x - CX, y - CY)


# (azimut, rayon depuis le point d'arrêt, pose, style de lieux.officer), comme avant : lu par scene_d, les tests
COPS = tuple(_cop_polar(c) + tuple(c[-2:]) for c in DOOR_COPS)

# les agents vivants (audit des mouvements, 18 novembre) : l'arme basse (« guard ») tant que la berline arrive, puis
# chacun prend sa pose de COPS quand elle freine sur la pointe, une seconde environ avant l'arrêt, l'un après l'autre
# (COP_ORDER, COP_STAGGER images d'écart), en COP_RISE images (la visée, le bras tendu ; l'accroupi en prend plus) ;
# en images du film (image f d'un plan = START[plan] + f), que P6 et FIN6 clent pareil (scene_d.fin6_pointe)
COP_REACT = PC.START["FIN6"] + F_STOP - 26            # la première réaction, 26 images avant l'arrêt
COP_FROM = PC.START["P6"] - 30                         # le départ de leurs clés et de leur ressort
COP_ORDER = (2, 4, 0, 3, 1, 5)                         # le rang de réaction de chaque agent
COP_STAGGER = 3
COP_RISE = {"aim": 8, "stop": 7, "crouch": 12, "guard": 8}


def cop_keys(k):
    """[(image du film, pose)] de l'agent k : la garde, tenue, puis sa pose de COPS."""
    pose = COPS[k][2]
    g0 = COP_REACT + COP_ORDER[k] * COP_STAGGER
    return [(COP_FROM, "guard"), (g0, "guard"), (g0 + COP_RISE[pose], pose)]


def cop_aiming(k, g):
    """L'agent k tient-il l'arme en joue à l'image g du film (sa pose prise, en visée ou accroupi) ?"""
    g1 = cop_keys(k)[-1][0]
    return g >= g1 and COPS[k][2] in ("aim", "crouch")


def hero_film(g):
    """(x, y) de la berline à l'image g du film (fractionnaire) sur la jetée et la pointe : la trajectoire de P6
    jusqu'à la jonction, celle de FIN6 après (elles coïncident à la jonction) ; la cible des agents, la même dans les
    deux tronçons."""
    import p6_jetee as P6
    if g > PC.START["FIN6"]:
        return tuple(hero_pos(M.t_of(g - PC.START["FIN6"])))[:2]
    return tuple(P6.hero_pos(M.t_of(g - PC.START["P6"])))[:2]


# --- la caméra : le bras commun, puis l'orbite
LENS = PC.VISEE_LENS
AIM_Z = HERO_BOX[2] / 2.0
R1, Z1 = 7.5, 2.4                       # le cadre commun
Q1 = (PC.VISEE_U, PC.VISEE_V)


def chase_heading(t):
    """Le cap de référence de la berline (sa vitesse, puis sa caisse à l'arrêt : motion._ref_heading)."""
    (vx, vy), _ = M.kinematics(hero_pos, t)
    sp = math.hypot(vx, vy)
    travel = M.heading_of(vx, vy) if sp > 1e-3 else None
    return M._ref_heading(dict(heading=hero_heading(t), travel=travel, speed=sp))


# l'orbite : la caméra du bras commun, tournée autour du centre de la berline de SWEEP × w(t) (vers sa gauche), de
# l'image ORBIT[0] (elle freine encore) à ORBIT[1], où elle se pose ; vitesse en cloche (RAMP_IN, RAMP_OUT s)
# (17 novembre au soir, le film sous 30 s : FIN6 ne tient plus que 27 images après l'arrêt ; l'orbite part plus tôt,
# pendant le freinage (image 23 au lieu de 34), sur 54° ; sa rampe d'entrée, longue, pendant le freinage)
SWEEP = -54.0
ORBIT = (23, FRAMES - 3)
RAMP_IN, RAMP_OUT = 1.45, 1.1
_DTP = 1.0 / 2400.0
_TO0, _TO1 = M.t_of(ORBIT[0]), M.t_of(ORBIT[1])


def _speed_shape(t):
    return M.smoothstep(_TO0, _TO0 + RAMP_IN, t) * (1.0 - M.smoothstep(_TO1 - RAMP_OUT, _TO1, t))


def _progress_table():
    n = int(round((_TO1 - _TO0) / _DTP))
    acc, out = 0.0, [0.0]
    for i in range(n):
        acc += _speed_shape(_TO0 + (i + 0.5) * _DTP) * _DTP
        out.append(acc)
    return [v / acc for v in out]


_PROG = _progress_table()


def _w(t):
    """La part de l'orbite faite à t (0 à 1)."""
    if t <= _TO0:
        return 0.0
    if t >= _TO1:
        return 1.0
    x = (t - _TO0) / _DTP
    i = min(len(_PROG) - 2, int(x))
    return _PROG[i] + (_PROG[i + 1] - _PROG[i]) * (x - i)


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale) : parcours.chase (le bras commun et sa visée), tourné autour du centre
    de la berline de SWEEP × w(t) ; le lacet tourne d'autant (il compte de −y vers −x, à l'inverse des azimuts)."""
    x, y, z, yaw, pitch, roll, lens = PC.chase("FIN6", _f(t))
    phi = SWEEP * _w(t)
    if phi:
        hx, hy = hero_pos(t)
        a = math.radians(phi)
        dx, dy = x - hx, y - hy
        x, y = hx + dx * math.cos(a) - dy * math.sin(a), hy + dx * math.sin(a) + dy * math.cos(a)
        yaw -= phi
    return x, y, z, yaw, pitch, roll, lens


def camera(t):
    return camera_rail(t)


# --- ce que la caméra voit (sans Blender)
def hero_corners(t=T_STILL):
    h = math.radians(hero_heading(t))
    cx, cy = hero_pos(t)
    fx, fy = -math.sin(h), math.cos(h)
    l, w, ht = HERO_BOX
    out = []
    for a in (-0.5, 0.5):
        for b in (-0.5, 0.5):
            for z in (0.0, ht):
                out.append((cx + fx * l * a + fy * w * b, cy + fy * l * a - fx * w * b, z))
    return out


def rect_dist(p, c, heading, l, w):
    """La distance d'un point (x, y) à un rectangle posé au sol (centre, cap, longueur, largeur)."""
    h = math.radians(heading)
    fx, fy = -math.sin(h), math.cos(h)
    dx, dy = p[0] - c[0], p[1] - c[1]
    a, b = dx * fx + dy * fy, dx * fy - dy * fx
    ea, eb = max(0.0, abs(a) - l / 2), max(0.0, abs(b) - w / 2)
    return math.hypot(ea, eb)


def obstacles(t):
    """(nom, distance(x, y)) à l'instant t : la berline et la patrouille 1 (rectangles), les véhicules de l'anneau
    (un disque de 3 m, quel que soit leur cap), les agents (un disque de 0,4 m), le mât du lampadaire."""
    out = [("berline", lambda p: rect_dist(p, hero_pos(t), hero_heading(t), HERO_BOX[0], HERO_BOX[1])),
           ("patrouille_1", lambda p: rect_dist(p, patrol1_pos(t), patrol1_heading(t), 5.0, 2.0))]
    for i, x, y, h in ring_poses():
        # (le fourgon, ou une patrouille portières avant ouvertes : 2,2 m dehors de chaque côté)
        w = 2.2 if i == RING_VAN else 4.4
        out.append((f"anneau_{i}", lambda p, c=(x, y), h=h, w=w: rect_dist(p, c, h, 5.2, w)))
    for i, (a, r, _, _) in enumerate(COPS):
        c = polar(a, r)
        out.append((f"agent_{i}", lambda p, c=c: math.dist(p, c) - 0.4))
    out.append(("lampadaire", lambda p: math.dist(p, LAMP_AT) - 0.3))
    return out


# --- le reflet du lampadaire de la pointe dans les flaques (brouillon éclairé v8, images 632–638 du film, FIN6/14–20 :
# une tache blanc-jaune au bas à droite, sa traînée orange sur l'enrobé, sa tête déjà sortie du cadre). La caméra de
# poursuite le passe avant l'orbite : déplacer le lampadaire ne fait que déplacer ce passage. Là où la caméra voit
# son reflet sans sa tête (± LAMP_DRY_MARGE images), le sol de la pointe n'a pas de flaque (scene_d.mat_sol) : la
# pellicule d'eau y reste, satinée, son reflet n'est plus qu'une lueur diffuse.
LAMP_DRY_R = (1.5, 2.5)            # m : sans flaque, puis fondu
LAMP_DRY_STEP = 0.75               # m entre deux centres
LAMP_DRY_MARGE = 3                 # images


def _in(q, lo, hi, vlo=-0.05, vhi=1.05):
    return q is not None and lo <= q[0] <= hi and vlo <= q[1] <= vhi


def lamp_reflets(frames=None):
    """Les images où la caméra voit le reflet du lampadaire (son image miroir sous le sol) sans sa tête, et les
    points du sol où ce reflet se forme (la droite objectif → image miroir, à z = 0), sur ces images et
    LAMP_DRY_MARGE autour. Renvoie (images seules, [(x, y)])."""
    hx, hy, hz = LAMP_HEAD
    frames = list(frames or range(F0, FRAMES + 1))
    cams = {f: camera(M.t_of(f)) for f in frames}
    # (le reflet court de l'image miroir de la tête au pied du mât : l'un ou l'autre dans le cadre, comme la règle E
    # de test_motion)
    lone = [f for f in frames if any(_in(M.screen_point(cams[f], p), -0.15, 1.15) for p in ((hx, hy, -hz), (hx, hy, 0.0)))
            and not _in(M.screen_point(cams[f], (hx, hy, hz)), 0.02, 0.98)]
    near = sorted({g for f in lone for g in range(f - LAMP_DRY_MARGE, f + LAMP_DRY_MARGE + 1) if g in cams})
    pts = []
    for f in near:
        x, y, z = cams[f][:3]
        k = z / (z + hz)
        pts.append((x + (hx - x) * k, y + (hy - y) * k))
    return lone, pts


def lamp_dry_spots(step=LAMP_DRY_STEP):
    """Les centres sans flaque (x, y, r0, r1) le long des points de reflet de lamp_reflets, tous les `step` m."""
    out, last = [], None
    pts = lamp_reflets()[1]
    for k, (x, y) in enumerate(pts):
        if last is None or math.hypot(x - last[0], y - last[1]) >= step or k == len(pts) - 1:
            out.append((x, y) + LAMP_DRY_R)
            last = (x, y)
    return out


if __name__ == "__main__":
    print(f"arrêt à l'image {F_STOP} ({_f(T_STOP):.1f}) en ({CX:.2f}, {CY:.2f}), cap {HERO_STOP:.1f}° ; "
          f"FIN reportée de {ROT:+.2f}°, {SHIFT:+d} images")
    for f in (1, 20, ORBIT[0], 60, F_STOP, 90, 110, FRAMES):
        t = M.t_of(f)
        c = camera(t)
        hx, hy = hero_pos(t)
        q = M.screen_point(c, (hx, hy, AIM_Z))
        az = math.degrees(math.atan2(c[1] - hy, c[0] - hx))
        print(f"image {f:3d} : {HERO.speed(t) * 3.6:5.1f} km/h, azimut {az:6.1f}°, {math.dist(c[:2], (hx, hy)):.2f} m, "
              f"{c[2]:.2f} m, lacet {c[3]:.1f}° site {c[4]:.1f}°, berline x {100 * q[0]:.0f} y {100 * q[1]:.0f}")
    near = min((d(camera(M.t_of(f))[:2]), n, f) for f in range(F0, F0 + FRAMES) for n, d in obstacles(M.t_of(f)))
    print(f"au plus près : {near[0]:.2f} m de {near[1]} à l'image {near[2]}")
