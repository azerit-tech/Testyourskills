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
    """Le projecteur de l'hélicoptère : il la cherche pendant le freinage et se pose sur elle à l'arrêt."""
    x, y = hero_pos(t)
    w = 1.0 - M.smoothstep(T_STOP - 1.5, T_STOP, t)
    sway = 1.1 * w * math.sin(2.0 * math.pi * 1.3 * t + 0.4)
    return x + sway, y + 3.5 * w, 0.8


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
# six agents (azimut, rayon depuis le point d'arrêt, pose, style de lieux.officer), face à elle, à 1 m au moins
# des caisses ; tous dans l'image posée
COPS = tuple((a + ROT, r, pose, k) for a, r, pose, k in
             ((22.0, 10.5, "guard", 0), (32.0, 9.0, "crouch", 1), (42.0, 10.0, "aim", 0),
              (54.0, 9.0, "aim", 2), (64.0, 10.0, "stop", 1), (84.0, 9.5, "guard", 2)))

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
    for i in RING_KEEP:
        c = polar(RING[i], RING_R)
        out.append((f"anneau_{i}", lambda p, c=c: math.dist(p, c) - 3.0))
    for i, (a, r, _, _) in enumerate(COPS):
        c = polar(a, r)
        out.append((f"agent_{i}", lambda p, c=c: math.dist(p, c) - 0.4))
    out.append(("lampadaire", lambda p: math.dist(p, LAMP_AT) - 0.3))
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
