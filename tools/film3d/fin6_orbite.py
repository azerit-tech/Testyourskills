# Le plan FIN6 écrit une fois, sans Blender (découpage v3.1) : la fin du film à six étoiles, qui suit P6 (FIN6
# remplace FIN, motion.FILM_SIX, shared/film/cut.ts). Il raconte lui-même l'arrivée et l'arrêt à la pointe, comme
# FIN, puis une orbite lente autour de la berline cernée.
#
# - La berline arrive comme dans FIN : la coupe depuis P6 est une ellipse, elle entre à 24 km/h en plein freinage
#   (6,4 m/s², sous les 7), feux stop allumés, et s'arrête à l'image 36 au point d'arrêt et au cap de FIN, mais sans
#   glisse (motion.drive, drift=0, les trois derniers mètres droits). La patrouille 1 est celle de FIN : elle double
#   par la gauche et s'arrête devant à gauche, en travers (image 38). Les mains sortent par la vitre (42 à 49).
# - La caméra part du cadre où P6 finit (mesuré : 3,6 m de haut, 8,0 m derrière, dans l'axe, 24 mm), la berline
#   au même point du cadre, et tourne déjà (24 °/s) : elle suit le cap de la berline et passe par sa gauche en
#   redescendant d'un même mouvement au cadre commun (2,4 m, 7,5 m), 60° en tout autour d'elle, 30 °/s et
#   40 °/s² au plus, et se pose immobile au trois quarts arrière gauche : le flanc du conducteur, ses mains
#   dehors, la patrouille 1, l'anneau et six agents qui la tiennent en joue.
# - L'anneau : trois patrouilles et le fourgon qui l'attendaient au bout de la pointe, à 14 m du point d'arrêt, là
#   où ni la berline, ni la patrouille 1, ni la caméra ne passent ; six agents, six modèles.
#
# Repère de l'eau (lieux.py) : la pointe centrée en (80, 430) ; la berline s'arrête en (fin_pointe.SX, SY), cap
# HERO_STOP (25°) ; les azimuts autour d'elle sont comptés depuis +x, dans le sens trigonométrique.
# 80 images à 24 par seconde (shared/film/cut.ts), 3,29 s.
import math

import motion as M
import fin_pointe as F
import p6_jetee as P6

FRAMES = 80
F0 = 1
V3 = True
V31 = True
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = FRAMES               # la dernière image, immobile
T_STILL = M.t_of(STILL_FRAME)

# --- la berline : l'arrivée de FIN (24 km/h en plein freinage, 6,4 m/s², arc de 40 m sur 15°, arrêt à l'image
# 36 au point d'arrêt de FIN, cap 25°), mais sans glisse (motion.drive, drift=0) : sa caisse reste dans l'axe de
# sa vitesse jusqu'à l'arrêt. Avec la glisse de FIN, figée à 10° à l'arrêt, l'axe de référence de la mesure
# (sa vitesse, puis sa caisse sous 2 m/s) sautait de 10° en dix images : 60 °/s d'orbite sur une caméra immobile.
CX, CY = F.SX, F.SY
F_STOP = F.F_STOP
HERO_V, HERO_R, HERO_ARC = F.HERO_V, F.HERO_R, F.HERO_ARC
HERO_CAP0 = F.HERO_STOP - HERO_ARC
HERO_END = 3.0                     # les derniers mètres en ligne droite


def _hero_route(start):
    return dict(start=start, pieces=[M.arc(HERO_R, HERO_ARC), M.line(HERO_END)])


def _hero_drive():
    d = M.drive(_hero_route((0.0, 0.0, HERO_CAP0)), HERO_V, stop=True, drift=0.0, t_span=(-1.0, 10.0))
    ex, ey = d.pos(d.t_stop + 1.0)
    t0 = M.t_of(F_STOP) - d.t_stop
    return M.drive(_hero_route((CX - ex, CY - ey, HERO_CAP0)), HERO_V, t0=t0, stop=True, drift=0.0,
                   t_span=(t0 - 1.0, t0 + 10.0))


HERO = _hero_drive()
T_STOP = HERO.t_stop
HERO_STOP = HERO.heading(T_STOP + 1.0)
HERO_BOX = (4.9, 1.9, 1.45)        # la berline : longueur, largeur, hauteur (m)
hero_pos, hero_heading, hero_slip, hero_steer = HERO.pos, HERO.heading, HERO.slip, HERO.steer
# la patrouille 1 : celle de FIN, image pour image
PATROL1 = F.PATROL1
P1_AT, P1_HEAD = F.P1_STOP, F.P1_HEAD
patrol1_pos, patrol1_heading, patrol1_slip, patrol1_steer = (F.patrol1_pos, F.patrol1_heading, F.patrol1_slip,
                                                             F.patrol1_steer)
DRIVER_KEYS, DRIVER_OUT = F.DRIVER_KEYS, F.DRIVER_OUT
HELI, HELI_HEADING = F.HELI, F.HELI_HEADING
# le lampadaire de la pointe, rangé comme dans FIN, un mètre plus en arrière : sa tête et son reflet sur l'enrobé
# mouillé restent hors du cadre à toutes les images de l'orbite (à la place de FIN, le reflet entrait par le bas
# à droite vers l'image 62, sans sa tête : règle E)
LAMP_AT = (CX + 9.0, CY - 4.0)
LAMP_HEAD = (LAMP_AT[0] + F.LAMP_HEAD[0] - F.LAMP_FIN[0], LAMP_AT[1] + F.LAMP_HEAD[1] - F.LAMP_FIN[1], F.LAMP_HEAD[2])


def beam_target(t):
    """Le projecteur de l'hélicoptère : il la cherche pendant le freinage et se pose sur elle à l'arrêt (comme dans
    FIN, fin_pointe.beam_target, sur la trajectoire de FIN6)."""
    x, y = hero_pos(t)
    w = 1.0 - M.smoothstep(0.0, M.t_of(F.F_BEAM), t)
    sway = 1.1 * w * math.sin(2.0 * math.pi * 1.3 * t + 0.4)
    return x + sway, y + 3.5 * w, 0.8


def tracks():
    return {"hero": hero_pos, "patrol_1": patrol1_pos}


def tracks_heading():
    return {"patrol_1": patrol1_heading}


def polar(a, r, c=(CX, CY)):
    t = math.radians(a)
    return c[0] + r * math.cos(t), c[1] + r * math.sin(t)


# --- l'anneau et les agents
# des patrouilles et le fourgon à 14 m du point d'arrêt, tournés vers lui, qui l'attendaient : seulement là où ni
# la berline ni la patrouille 1 ne passent (à 1,5 m au moins de leurs caisses, depuis 3 s avant la coupe) ni la
# caméra : à droite (azimuts 8°, 41° et 74°) et le fourgon derrière à gauche (205°) ; la patrouille 1 s'arrête à
# la place du huitième (106°)
RING_R = 14.0
RING = [-122.7 + 360.0 / 11 * i for i in range(11)]
RING_KEEP = [4, 5, 6, 10]
RING_VAN = 10
# six agents (azimut, rayon depuis le point d'arrêt, pose, style de lieux.officer), face à elle, à 1 m au moins
# des caisses ; tous dans l'image posée
COPS = ((22.0, 10.5, "guard", 0), (32.0, 9.0, "crouch", 1), (42.0, 10.0, "aim", 0),
        (54.0, 9.0, "aim", 2), (64.0, 10.0, "stop", 1), (84.0, 9.5, "guard", 2))

# --- la caméra
LENS = 24.0
AIM_Z = HERO_BOX[2] / 2.0
_HALF_W = 18.0 / LENS              # la demi-largeur du capteur (36 mm) sur la focale : tan du demi-champ


def _p6_end():
    """La dernière caméra de P6 et sa berline : hauteur, distance, décalage, point de la berline à l'écran."""
    t = M.t_of(P6.F0 + P6.FRAMES - 1)
    c = P6.camera_rail(t) if hasattr(P6, "camera_rail") else P6.camera(t)
    h = P6.hero_pos(t)
    return c, h, M.screen_point(c, (h[0], h[1], AIM_Z))


_P6C, _P6H, Q0 = _p6_end()
R0 = math.dist(_P6C[:2], _P6H[:2])      # 8,0 m
Z0 = _P6C[2]                            # 3,6 m
R1, Z1 = 7.5, 2.4                       # le cadre commun, à l'image posée
Q1 = (0.50, 0.58)


def chase_heading(t):
    """Le cap que suit la caméra (caps des véhicules : 0 vers +y, positif vers -x) : celui de la vitesse de la
    berline, puis celui de sa caisse quand elle s'arrête (sous 2 m/s), comme l'axe de référence de la mesure
    (motion._ref_heading), calculé de la même façon pour que l'orbite s'y compte sans écart."""
    (vx, vy), _ = M.kinematics(hero_pos, t)
    sp = math.hypot(vx, vy)
    travel = M.heading_of(vx, vy) if sp > 1e-3 else None
    return M._ref_heading(dict(heading=hero_heading(t), travel=travel, speed=sp))


# l'orbite se compte depuis l'arrière de la berline (l'axe de sa vitesse, puis de sa caisse) : la caméra suit son
# cap comme une caméra de poursuite et tourne en plus de SWEEP, vers sa gauche ; A0 et A1 : les azimuts (depuis +x)
# de la caméra à l'image 1 et à l'image posée
SWEEP = -60.0                                     # trois quarts arrière gauche : 60° de l'arrière vers sa gauche
A0 = (270.0 + chase_heading(0.0)) % 360.0
A1 = (270.0 + HERO_STOP + SWEEP) % 360.0
# l'allure : la caméra tourne déjà à la coupe (le mouvement commence T_PRE s avant l'image 1), accélère, ralentit
# et se pose HOLD s avant la fin, vitesse et accélération nulles
T_PRE, RAMP_IN, RAMP_OUT, HOLD = 1.2, 1.0, 1.4, 0.12
_DT = 1.0 / 2400.0


def _speed_shape(t):
    t_end = T_END - HOLD
    return M.smoothstep(-T_PRE, -T_PRE + RAMP_IN, t) * (1.0 - M.smoothstep(t_end - RAMP_OUT, t_end, t))


def _progress_table():
    n = int(round((T_END + T_PRE) / _DT))
    acc, out = 0.0, [0.0]
    for i in range(n):
        acc += _speed_shape(-T_PRE + (i + 0.5) * _DT) * _DT
        out.append(acc)
    return [v / acc for v in out]


_PROG = _progress_table()


def progress(t):
    """L'avancement de l'orbite, de 0 (T_PRE s avant l'image 1) à 1 (posée)."""
    if t <= -T_PRE:
        return 0.0
    if t >= T_END:
        return 1.0
    x = (t + T_PRE) / _DT
    i = min(len(_PROG) - 2, int(x))
    return _PROG[i] + (_PROG[i + 1] - _PROG[i]) * (x - i)


U0 = progress(0.0)                 # où en est l'orbite à l'image 1


def _w(t):
    """La part du chemin de l'image 1 à l'image posée (0 à 1)."""
    return (progress(t) - U0) / (1.0 - U0)


def azimuth(t):
    return 270.0 + chase_heading(t) + SWEEP * _w(t)


def _aim(x, y, z, p, u, v):
    yaw = math.degrees(math.atan2(-(p[0] - x), -(p[1] - y))) % 360.0     # continu : elle regarde vers +y
    pitch = math.degrees(math.atan2(p[2] - z, math.hypot(p[0] - x, p[1] - y)))
    return F._aim_point(x, y, z, yaw, pitch, p, u, v)


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale) : autour du centre de la berline (qui roule, puis s'arrête), à
    l'azimut, la distance et la hauteur de l'orbite ; tournée pour mettre le centre de la caisse où P6 le laisse,
    puis au milieu du cadre ; sans tremblé (découpage v3.1)."""
    w = _w(t)
    hx, hy = hero_pos(t)
    x, y = polar(azimuth(t), R0 + (R1 - R0) * w, (hx, hy))
    z = Z0 + (Z1 - Z0) * w
    return _aim(x, y, z, (hx, hy, AIM_Z), Q0[0] + (Q1[0] - Q0[0]) * w, Q0[1] + (Q1[1] - Q0[1]) * w)


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
    print(f"fin de P6 : caméra {Z0:.2f} m, {R0:.2f} m derrière, berline à l'écran x {100 * Q0[0]:.0f} y {100 * Q0[1]:.0f}")
    print(f"orbite : de {A0:.1f}° à {A1:.1f}° ({SWEEP:.1f}°), déjà à {100 * U0:.0f} % à l'image 1 ; anneau {RING_KEEP}")
    for f in (1, 2, 20, 36, 50, 65, 79, 80):
        t = M.t_of(f)
        c = camera(t)
        hx, hy = hero_pos(t)
        q = M.screen_point(c, (hx, hy, AIM_Z))
        print(f"image {f:2d} : azimut {azimuth(t):.1f}°, {math.dist(c[:2], (hx, hy)):.2f} m, {c[2]:.2f} m, "
              f"lacet {c[3]:.1f}° site {c[4]:.1f}°, berline x {100 * q[0]:.0f} y {100 * q[1]:.0f}")
    near = min((d(camera(M.t_of(f))[:2]), n, f) for f in range(F0, F0 + FRAMES) for n, d in obstacles(M.t_of(f)))
    print(f"au plus près : {near[0]:.2f} m de {near[1]} à l'image {near[2]}")
