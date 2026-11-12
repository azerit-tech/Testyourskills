# Le plan FIN écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3 et §2.4, « la pointe ») : caméra
# fixe à 20 cm du sol, la berline finit sa glissade vers nous et s'immobilise au centre de la pointe, trois quarts
# face ; la patrouille, arrivée la première, est arrêtée à sa droite, l'avant vers nous, portière du conducteur
# déjà ouverte ; l'agent, accroupi derrière, la pousse à fond, puis se redresse et vise ; le conducteur lâche
# le volant et lève ses mains gantées. Personne ne tire. Pas de gel ni de flash : le site les pose.
# scene_d.py n'en lit que les fonctions du temps et les images clés.
#
# Repère de l'eau (lieux.py) : la pointe centrée en (80, 430), la jetée vers -y. La glissade suit
# scene_d.slide_pose(s) (s de 0, sortie de la jetée, à 1, arrêt au centre, cap 25°) ; le plan n'en montre que les
# 4,5 derniers mètres. 36 images à 24 par seconde (shared/film/cut.ts), 1,46 s. La dernière image est la pose
# validée (STILL_FRAME).
import math

import motion as M

FRAMES = 36
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = FRAMES
T_STILL = M.t_of(STILL_FRAME)

JX, JY1 = 80.0, 400.0              # lieux.JETTY_X, lieux.JETTY_YS[1]
CX, CY = 80.0, 430.0               # lieux.POINTE
HERO_STOP = 25.0                   # scene_d.HERO_STOP
HERO_BOX = (4.9, 1.9)              # la berline au sol : longueur, largeur (m)
PATROL_BOX = (5.1, 2.0)
CAM = (CX + 0.7, CY + 8.97, 0.2)   # la caméra fixe de la pose validée


def slide_pose(s):
    """scene_d.slide_pose, recopiée (sans Blender) : (x, y, cap) de la glissade, s de 0 à 1."""
    e = 1.0 - (1.0 - s) ** 2
    x = JX + 1.75 - 1.75 * (3 * s * s - 2 * s * s * s)
    y = JY1 - 6.0 + (CY - JY1 + 6.0) * e
    return x, y, HERO_STOP * s ** 1.6


# --- la glissade : 4,5 m en 0,9 s, décélération constante (36 km/h, ~1,1 g en travers), puis arrêt
SLIDE_D = 4.5
T_STOP = 0.9
SLIDE_L = CY - JY1 + 6.0           # 36 m : y est linéaire en e = 1 - (1 - s)²


def slide_s(t):
    u = min(1.0, max(0.0, t / T_STOP))
    e = 1.0 - (SLIDE_D / SLIDE_L) * (1.0 - u) ** 2
    return 1.0 - math.sqrt(max(0.0, 1.0 - e))


def hero_pos(t):
    x, y, _ = slide_pose(slide_s(t))
    return x, y


def hero_heading(t):
    return slide_pose(slide_s(t))[2]


# --- la patrouille, arrêtée (les cotes de scene_d.plan_FIN) : parallèle à la berline, à sa droite et un peu en
# avant ; la portière du conducteur (à gauche) tourne autour de la charnière
_h = math.radians(HERO_STOP)
FWD = (-math.sin(_h), math.cos(_h))
RIGHT = (FWD[1], -FWD[0])
PATROL = (CX + RIGHT[0] * 4.0 + FWD[0] * 1.5, CY + RIGHT[1] * 4.0 + FWD[1] * 1.5)
HINGE = (PATROL[0] + FWD[0] * 0.96 - RIGHT[0] * 0.92, PATROL[1] + FWD[1] * 0.96 - RIGHT[1] * 0.92)
DOOR_LEN = 1.31                    # lieux.open_door : door_x de -0,32 à 0,99


def door_dir(deg):
    """La direction de la charnière vers le bord libre de la portière, ouverte de `deg` degrés."""
    a = math.radians(deg)
    return (-FWD[0] * math.cos(a) - RIGHT[0] * math.sin(a), -FWD[1] * math.cos(a) - RIGHT[1] * math.sin(a))


# la portière : déjà ouverte à 72° au début (l'agent est sorti avant le plan), poussée à 80° des images 3 à 11.
# Plus fermée, elle passerait dans l'agent accroupi derrière elle (à 62°, 2 cm d'interpénétration)
DOOR_KEYS = [(3, 72.0), (11, 80.0)]


def door_deg(t):
    (f0, a0), (f1, a1) = DOOR_KEYS
    return a0 + (a1 - a0) * M.smoothstep(M.t_of(f0), M.t_of(f1), t)


# l'agent, derrière la portière ouverte (à 80°), sur la bissectrice de la portière et de l'arrière, à 0,75 m de la
# charnière ; il regarde la berline. Accroupi jusqu'à l'image 18, en joue à l'image 28 (clés d'os).
_d80 = door_dir(80.0)
_bis = (_d80[0] - FWD[0], _d80[1] - FWD[1])
_n = math.hypot(*_bis)
OFFICER = (HINGE[0] + _bis[0] / _n * 0.75, HINGE[1] + _bis[1] / _n * 0.75)
OFFICER_LOOK = (CX - 0.3, CY + 0.6)
OFFICER_KEYS = [(18, "crouch"), (28, "aim")]
OFFICER_R = 0.3                    # son encombrement au sol (épaules, genou)

# le conducteur : les mains au volant jusqu'à l'image 22 (la voiture vient de s'arrêter), levées à l'image 31
DRIVER_KEYS = (22, 31)

# la fumée des pneus : elle continue sur sa lancée après l'arrêt et dépasse la berline vers l'objectif (+y)
SMOKE_DRIFT = 2.6


def tracks():
    return {"hero": hero_pos, "patrol": lambda t: PATROL}


def _corners(c, heading, box):
    h = math.radians(heading)
    f, r = (-math.sin(h), math.cos(h)), (math.cos(h), math.sin(h))
    return [(c[0] + f[0] * box[0] / 2 * a + r[0] * box[1] / 2 * b, c[1] + f[1] * box[0] / 2 * a + r[1] * box[1] / 2 * b)
            for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


def rect_gap(c1, h1, b1, c2, h2, b2):
    """L'écart entre deux rectangles au sol (axes séparateurs) : > 0, ils ne se touchent pas (m)."""
    p, q = _corners(c1, h1, b1), _corners(c2, h2, b2)
    best = -1e9
    for poly in (p, q):
        for i in range(4):
            ex, ey = poly[(i + 1) % 4][0] - poly[i][0], poly[(i + 1) % 4][1] - poly[i][1]
            n = math.hypot(ex, ey)
            ax = (-ey / n, ex / n)
            pp = [a[0] * ax[0] + a[1] * ax[1] for a in p]
            qq = [a[0] * ax[0] + a[1] * ax[1] for a in q]
            best = max(best, max(min(qq) - max(pp), min(pp) - max(qq)))
    return best


def seg_point(a, b, p):
    """La distance d'un point au segment [a, b]."""
    ab = (b[0] - a[0], b[1] - a[1])
    u = max(0.0, min(1.0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)))
    return math.dist(p, (a[0] + ab[0] * u, a[1] + ab[1] * u))


if __name__ == "__main__":
    for f in (1, 8, 16, 22, 28, 36):
        t = M.t_of(f)
        x, y = hero_pos(t)
        print(f"image {f:2d} : berline ({x:.2f}, {y:.2f}) cap {hero_heading(t):.1f}°, portière {door_deg(t):.0f}°")
    g = min(rect_gap(hero_pos(M.t_of(f)), hero_heading(M.t_of(f)), HERO_BOX, PATROL, HERO_STOP, PATROL_BOX)
            for f in range(F0, F0 + FRAMES))
    print(f"berline et patrouille : {g:.2f} m au plus près")
    d = min(seg_point(HINGE, (HINGE[0] + door_dir(door_deg(M.t_of(f)))[0] * DOOR_LEN,
                              HINGE[1] + door_dir(door_deg(M.t_of(f)))[1] * DOOR_LEN), OFFICER)
            for f in range(F0, F0 + FRAMES))
    print(f"portière et agent : {d - OFFICER_R:.2f} m au plus près")
