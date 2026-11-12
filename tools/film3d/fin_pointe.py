# Le plan FIN écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3 et §2.4, « la pointe » ;
# docs/cinematique-decoupage-v2.md, FIN) : caméra à 20 cm du sol qui avance de 2,2 m et se pose à l'image 22 sur le
# cadre validé, puis tient. La berline finit sa glissade vers nous et s'immobilise au centre de la pointe, trois
# quarts face, à l'image 22 ; la patrouille, arrivée la première, est arrêtée à sa droite, l'avant vers nous,
# portière du conducteur déjà ouverte ; derrière la berline, trois poursuivants finissent leur freinage en arc et
# s'arrêtent l'un après l'autre (images 8, 14, 20) ; l'agent, accroupi derrière la portière, la pousse à fond, puis
# se redresse quand la berline s'arrête ; le faisceau de l'hélicoptère, en retard sur elle, se fixe sur elle. Puis
# un temps mort (images 22 à 27 : seules battent les rampes), et le conducteur lâche le volant et lève lentement
# ses mains gantées (27 à 35). Personne ne tire. Pas de gel ni de flash : le site les pose.
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


# --- la glissade : 4,5 m en 0,875 s, décélération constante (37 km/h, ~1,2 g en travers), arrêt à l'image 22.
# Avant l'image 1 (l'obturateur, la mise en route des ressorts de motion.sample), la même décélération remonte le
# temps : la berline arrive plus vite, elle n'est jamais immobile avant le plan (immobile puis lancée d'un coup,
# la caisse se cabrait à l'image 1)
SLIDE_D = 4.5
F_STOP = 22
T_STOP = M.t_of(F_STOP)
SLIDE_L = CY - JY1 + 6.0           # 36 m : y est linéaire en e = 1 - (1 - s)²


def slide_s(t):
    u = min(1.0, t / T_STOP)
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
# charnière ; il regarde la berline. Accroupi jusqu'à l'image 15, debout en joue à l'image 23, quand la berline
# vient de s'arrêter (clés d'os) : il a fini de bouger avant le temps mort.
_d80 = door_dir(80.0)
_bis = (_d80[0] - FWD[0], _d80[1] - FWD[1])
_n = math.hypot(*_bis)
OFFICER = (HINGE[0] + _bis[0] / _n * 0.75, HINGE[1] + _bis[1] / _n * 0.75)
OFFICER_LOOK = (CX - 0.3, CY + 0.6)
OFFICER_KEYS = [(15, "crouch"), (23, "aim")]
OFFICER_R = 0.3                    # son encombrement au sol (épaules, genou)

# le conducteur : les mains au volant jusqu'à l'image 27, après le temps mort (la voiture s'est arrêtée à 22, la
# caisse a fini de se poser), levées à l'image 35, lentement (les clés d'os s'interpolent en douceur)
DRIVER_KEYS = (27, 35)

# la fumée des pneus : elle continue sur sa lancée après l'arrêt et dépasse la berline vers l'objectif (+y)
SMOKE_DRIFT = 2.6


# --- la caméra : la pose validée (lacet 1°, site 14°, 24 mm) à l'image 22, atteinte par une avancée de 2,2 m au ras
# du sol dans l'axe de visée, lancée à ~23 km/h et freinée avec la berline (sans à-coup : vitesse et accélération
# nulles à l'arrivée) ; une vibration de chariot, proportionnelle à sa vitesse, s'éteint avec elle
CAM_YAW, CAM_PITCH, CAM_LENS = 1.0, 14.0, 24.0
CAM_PUSH = 2.2
F_LAND = 22
T_LAND = M.t_of(F_LAND)
_BACK = (math.sin(math.radians(CAM_YAW)), math.cos(math.radians(CAM_YAW)))   # l'opposé de la visée, au sol
CAM_EASE = 2.3
# la caméra se relève de 2,5° en avançant : sans cela, la berline lointaine des premières images montait vers
# l'horizon, son milieu à 64 % de la hauteur depuis le haut ; elle reste ainsi entre 61 et 63 % tout le plan
# (62,6 % sur la pose validée, qui ne change pas)
CAM_TILT = 2.5


def camera(t):
    """(x, y, z, lacet, site, roulis, focale) de motion.key_camera."""
    u = min(1.0, t / T_LAND)
    k = CAM_PUSH * (1.0 - u) ** CAM_EASE                 # ce qu'il reste à parcourir
    s = (1.0 - u) ** (CAM_EASE - 1.0)                     # la vitesse, rapportée à celle du départ
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.10, rotor=0.0, seed=2.2)
    return (CAM[0] + _BACK[0] * k + dx * 0.3 * s, CAM[1] + _BACK[1] * k, CAM[2] + dz * 0.4 * s,
            CAM_YAW + dyaw * s, CAM_PITCH - CAM_TILT * (1.0 - u) ** CAM_EASE + dpitch * s, droll * s, CAM_LENS)


def focus_point(t):
    """La mise au point suit l'avant de la berline (la pose validée : 1 m devant son centre, à 1 m)."""
    x, y = hero_pos(t)
    return x, y + 1.0, 1.0


# --- le faisceau de l'hélicoptère : en retard sur la berline pendant la glissade (il la cherche, un peu de
# balancement), il la rattrape et se fixe sur elle à l'image 26 ; immobile ensuite
HELI = (CX - 10.0, CY - 34.0, 34.0)
F_BEAM = 26


def beam_target(t):
    x, y = hero_pos(t)
    w = 1.0 - M.smoothstep(0.0, M.t_of(F_BEAM), t)
    lx, ly = hero_pos(t - 0.3)
    sway = 1.1 * w * math.sin(2.0 * math.pi * 1.3 * t + 0.4)
    return x + (lx - x) * w + sway, y + (ly - y) * w, 0.8


# --- les poursuivants : trois patrouilles sorties de la jetée derrière la berline finissent leur freinage en arc,
# côté gauche de la berline (la droite de l'image, la seule part du fond que la berline et la patrouille du premier
# plan ne cachent pas), le nez vers elle ; elles s'arrêtent l'une après l'autre. Freinage constant à 0,9 g : la
# dernière arrive à 33 km/h et parcourt 4,6 m, la première ne fait plus que s'asseoir.
ARC_DECEL = 9.0
# (arrêt (x, y), image d'arrêt, cap d'arrivée en degrés : elles sortent de la jetée, vers +y, en s'écartant)
ARC = [((76.0, 401.0), 6, 2.0), ((72.5, 410.0), 13, 6.0), ((70.5, 419.0), 20, 12.0)]


def _dir(h):
    r = math.radians(h)
    return -math.sin(r), math.cos(r)


def arc_end_heading(i):
    (x, y), _, _ = ARC[i]
    return M.heading_of(CX - x, CY - y)


def arc_len(i):
    T = M.t_of(ARC[i][1])
    return ARC_DECEL * T * T / 2.0


def arc_pos(i):
    """La trajectoire du poursuivant i : une courbe de Bézier du second degré de son arrivée (cap ARC[i][2]) à son
    arrêt (nez vers la berline), parcourue à décélération constante ; avant l'image 1, la même décélération remonte
    le temps (la courbe prolongée)."""
    (ex, ey), f_stop, h0 = ARC[i]
    T, Lc = M.t_of(f_stop), arc_len(i)
    d1, d0 = _dir(arc_end_heading(i)), _dir(h0)
    p1 = (ex - d1[0] * Lc / 2, ey - d1[1] * Lc / 2)
    p0 = (p1[0] - d0[0] * Lc / 2, p1[1] - d0[1] * Lc / 2)

    def pos(t):
        u = 1.0 if t >= T else 1.0 - (1.0 - t / T) ** 2
        a, b, c = (1 - u) ** 2, 2 * u * (1 - u), u * u
        return a * p0[0] + b * p1[0] + c * ex, a * p0[1] + b * p1[1] + c * ey
    return pos


def arc_heading(i):
    """Le cap du poursuivant i, lu sur sa trajectoire (le cap d'arrêt une fois arrêté)."""
    pos, T = arc_pos(i), M.t_of(ARC[i][1])

    def head(t):
        if t >= T - 1e-3:
            return arc_end_heading(i)
        a, b = pos(t - 1e-3), pos(t + 1e-3)
        return M.heading_of(b[0] - a[0], b[1] - a[1])
    return head


def tracks():
    out = {"hero": hero_pos, "patrol": lambda t: PATROL}
    out.update({f"arc_{i}": arc_pos(i) for i in range(len(ARC))})
    return out


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
    for i in range(len(ARC)):
        print(f"poursuivant {i} : {arc_len(i):.1f} m, arrêt à l'image {ARC[i][1]}, cap {arc_end_heading(i):.0f}°")
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
