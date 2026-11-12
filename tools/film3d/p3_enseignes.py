# Le plan P3 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3, « le barrage ») : la berline qui
# arrive à pleine vitesse dans la rue des enseignes, passe la brèche du barrage entre les deux patrouilles garées en
# biais et les deux agents accroupis, traverse la ligne de plots par son trou et frôle l'objectif ; les agents
# tirent (éclairs d'une image) ; la troisième patrouille suit loin derrière ; la caméra est fixe jusqu'au passage
# de la berline, qui lui donne la première secousse du film. scene_b.plan_P3 n'en lit que les fonctions du temps et
# les positions ; motion.py en tire roues, braquage et transfert de masse.
#
# Repère : celui de scene-b.blend après scene_b.to_world (la berline roule vers +y, y = s ; la caméra en
# (-1,3, 130), à 55 cm, regarde vers -y). t = 0 à la première image ; 28 images, 24 par seconde
# (shared/film/cut.ts).
#
# L'image fixe (STILL_FRAME = 17) est le cadre validé : la berline en (-0,35, 119,6), son nez tourné de 4° vers la
# caméra, les deux éclairs. Ce nez tourné ne peut pas être son cap de route (tenu, il la mènerait dans l'objectif) :
# c'est un coup de volant, la caisse qui se tortille en passant la brèche (une dérive de 6° au plus, qui revient
# à zéro avant les plots) ; la route, elle, est une droite qui passe entre les deux agents et à 40 cm de la caméra.
#
# Écarts au cadre validé, assumés : la ligne de plots a un trou de 2,7 m (aucun choc avec les plots), trois plots
# de chaque côté ; avant, six plots fermaient la brèche. Les rampes clignotent (2 Hz) : à l'image fixe, chaque
# voiture n'a qu'une de ses deux couleurs. La berline accélère un peu : 0,5° de cabré à l'image fixe. Les
# étincelles sur le capot du §2.3 ne sont pas faites (rien n'atteint la berline).
import math

import motion as M

FRAMES = 28
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = 17
T_STILL = M.t_of(STILL_FRAME)

# --- la berline (caisse : 4,89 × 1,88 m, le centre au milieu)
HALF_L, HALF_W = 2.44, 0.94
STILL = (-0.35, 119.6, 4.0)        # x, y, cap de la caisse (degrés, positif : le nez vers -x) à l'image fixe
V0 = 29.5                          # m/s à la première image (106 km/h)
ACCEL = 1.6                        # m/s² : elle ne lève pas le pied, elle remet un peu de gaz
SLOPE = 0.0385                     # dx/dy de sa route : de (-1,1, 99) à (0,05, 130)
WIGGLE_IN, WIGGLE_OUT = 0.32, 0.16 # s : le coup de volant monte jusqu'à l'image fixe, puis revient


def _accel(t):
    return ACCEL


HERO = M.Profile(V0, _accel)
Y_START = STILL[1] - HERO.s(T_STILL)
TRAVEL = -math.degrees(math.atan(SLOPE))      # le cap de la route (-2,2° : elle file un peu vers +x)


def hero_pos(t):
    y = Y_START + HERO.s(t)
    return STILL[0] + SLOPE * (y - STILL[1]), y


def hero_heading(t):
    """Le cap de la caisse : celui de la route, plus le coup de volant (nul au début, 6,2° à l'image fixe, revenu
    à zéro 0,16 s plus tard, avant les plots)."""
    a = STILL[2] - TRAVEL
    if t <= T_STILL:
        return TRAVEL + a * M.smoothstep(T_STILL - WIGGLE_IN, T_STILL, t)
    return TRAVEL + a * (1.0 - M.smoothstep(T_STILL, T_STILL + WIGGLE_OUT, t))


def hero_box(t):
    """Les quatre coins de la caisse au sol à l'instant t."""
    x, y = hero_pos(t)
    h = math.radians(hero_heading(t))
    fx, fy = -math.sin(h), math.cos(h)       # l'avant (cap 0 : +y, positif vers -x)
    rx, ry = fy, -fx                         # la droite de la voiture
    return [(x + fx * a * HALF_L + rx * b * HALF_W, y + fy * a * HALF_L + ry * b * HALF_W)
            for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


# --- le décor fixe : l'enveloppe convexe au sol (sous 1,5 m) de chaque obstacle, relevée sur les maillages de
# scene-b.blend en repère monde (portières ouvertes comprises), un sommet sur deux ou trois gardé
PATROLS = {"patrol_a": (3.4, 126.0, 25.0), "patrol_b": (-3.4, 126.0, -25.0)}   # x, y, et lacet vers l'axe
_PATROL = [(1.52, 126.52), (1.68, 124.17), (1.88, 123.72), (2.57, 123.39), (3.07, 123.53), (4.9, 125.06),
           (5.18, 127.9), (4.86, 128.26), (3.77, 128.66), (3.66, 128.61), (1.69, 126.72)]
_AGENT = [(1.68, 126.48), (1.79, 126.01), (1.88, 125.85), (2.04, 125.97), (2.21, 126.46), (2.2, 126.54),
          (1.96, 126.98), (1.88, 127.0), (1.68, 126.57)]


def _mirror(poly):
    return [(-x, y) for x, y in reversed(poly)]


OBSTACLES = {
    "patrol_a": _PATROL,
    "patrol_b": _mirror(_PATROL),
    "agent_0": _AGENT,
    "agent_1": [(-2.17, 126.47), (-1.92, 125.92), (-1.82, 125.85), (-1.69, 126.01), (-1.62, 126.4), (-1.62, 126.52),
                (-1.66, 126.59), (-2.01, 126.98), (-2.11, 126.94)],
    "panneau_0": [(2.39, 121.98), (3.21, 121.98), (3.21, 122.62), (2.39, 122.62)],
    "panneau_1": [(-3.21, 121.98), (-2.39, 121.98), (-2.39, 122.62), (-3.21, 122.62)],
}
CONE_R = 0.27
# les plots (x, y monde) : trois de chaque côté du trou, le trou devant la route de la berline
CONES = [(2.35, 123.1), (1.85, 123.3), (1.35, 123.4), (-1.85, 123.4), (-2.35, 123.3), (-2.85, 123.1)]
CAM = (-1.3, 130.0, 0.55)
CAM_R = 0.12                      # le corps de la caméra
CAM_YAW, LENS = -4.0, 26.0        # lacet (motion.key_camera : 0 regarde -y) ; la focale du cadre validé

# --- la troisième patrouille : 60 m derrière la berline à l'image fixe, elle suit moins vite
CHASE = (1.2, 59.6, 3.4)          # x, y, cap à l'image fixe
CHASE_V = 26.0


def chase_pos(t):
    return CHASE[0], CHASE[1] + CHASE_V * (t - T_STILL)


def parked(name):
    x, y, _ = PATROLS[name]
    return lambda t: (x, y)


def tracks():
    """{nom: pos(t)} de tous les véhicules du plan (pour vérifier les distances)."""
    return {"hero": hero_pos, "patrol_a": parked("patrol_a"), "patrol_b": parked("patrol_b"), "patrol_c": chase_pos}


# --- les tirs : chaque agent tire deux fois, un éclair d'une image (le second, ensemble, sur l'image fixe) ;
# rien après : la berline passe entre eux
SHOTS = {0: (9, STILL_FRAME), 1: (13, STILL_FRAME)}


def firing(k, frame):
    return frame in SHOTS[k]


# --- la caméra : fixe ; au passage de la berline (son avant à la hauteur de l'objectif), le souffle la secoue,
# une secousse brève qui s'amortit en 0,3 s
def _pass_time():
    lo, hi = 0.0, T_END + 0.5
    for _ in range(50):
        mid = (lo + hi) / 2
        if hero_pos(mid)[1] + HALF_L < CAM[1]:
            lo = mid
        else:
            hi = mid
    return lo


T_PASS = _pass_time()


def shake(t):
    """L'enveloppe de la secousse : 0 avant le passage, 1 au plus fort (40 ms après), décroissante ensuite."""
    if t < T_PASS:
        return 0.0
    return M.smoothstep(T_PASS, T_PASS + 0.04, t) * math.exp(-max(0.0, t - T_PASS - 0.04) / 0.18)


def camera(t):
    e = shake(t)
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.9, rotor=0.7, seed=1.9)
    # (le souffle pousse la caméra vers l'extérieur de la route, -x, et la fait rouler vers la voiture)
    return (CAM[0] + e * (dx - 0.02), CAM[1] + e * dy, CAM[2] + e * dz, CAM_YAW + e * (dyaw + 0.8),
            e * dpitch, e * (droll - 1.2), LENS)


# --- les vérifications (sans Blender) : distances au sol entre la caisse et le décor
def _seg_dist(p, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]
    L2 = ax * ax + ay * ay
    u = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / L2))
    return math.hypot(p[0] - a[0] - u * ax, p[1] - a[1] - u * ay)


def _inside(p, poly):
    s = None
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        if s is None:
            s = c > 0
        elif (c > 0) != s:
            return False
    return True


def _poly_dist(P, Q):
    """La distance entre deux polygones convexes (0 s'ils se touchent)."""
    if any(_inside(p, Q) for p in P) or any(_inside(q, P) for q in Q):
        return 0.0
    d = float("inf")
    for A, B in ((P, Q), (Q, P)):
        for p in A:
            for i in range(len(B)):
                d = min(d, _seg_dist(p, B[i], B[(i + 1) % len(B)]))
    return d


def clearances(frames=None, sub=4):
    """La plus petite distance au sol (m) entre la caisse de la berline et chaque obstacle sur le plan, image par
    image et entre les images (`sub` pas par image) : {obstacle: (distance, image)}."""
    frames = frames or range(F0 - 1, F0 + FRAMES + 1)
    out = {}
    for f in frames:
        for k in range(sub):
            t = M.t_of(f + k / sub)
            car = hero_box(t)
            items = [(n, _poly_dist(car, poly)) for n, poly in OBSTACLES.items()]
            items += [(f"plot_{i}", max(0.0, min(_seg_dist(c, car[j], car[(j + 1) % 4]) for j in range(4)) - CONE_R)
                       if not _inside(c, car) else 0.0) for i, c in enumerate(CONES)]
            cam = CAM[:2]
            items.append(("camera", 0.0 if _inside(cam, car) else
                          max(0.0, min(_seg_dist(cam, car[j], car[(j + 1) % 4]) for j in range(4)) - CAM_R)))
            for n, d in items:
                if n not in out or d < out[n][0]:
                    out[n] = (d, f + k / sub)
    return out


if __name__ == "__main__":
    for f in (1, 9, 13, STILL_FRAME, 20, 23, 25, 28):
        t = M.t_of(f)
        x, y = hero_pos(t)
        print(f"image {f:2d} t {t:.3f} s : berline ({x:5.2f}, {y:6.1f}) à {HERO.v(t) * 3.6:4.0f} km/h, caisse "
              f"{hero_heading(t):5.1f}°, secousse {shake(t):.2f}")
    print(f"passage de l'avant à l'objectif : t {T_PASS:.3f} s (image {T_PASS * M.FPS + F0:.1f})")
    for n, (d, f) in sorted(clearances().items(), key=lambda kv: kv[1][0]):
        print(f"  {n:10s} {d:5.2f} m (image {f:.2f})")
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
