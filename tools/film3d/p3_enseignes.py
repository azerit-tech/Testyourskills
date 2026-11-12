# Le plan P3 écrit une fois, sans Blender (docs/cinematique-decoupage-v2.md, « P3 — Le barrage, de dos ») : la
# berline fonce dans la rue des enseignes vers le barrage, deux patrouilles nez à nez, les plots, deux agents qui
# tirent puis se mettent à couvert ; elle feinte à droite, revient viser le trou des plots, remet les gaz et passe
# de justesse. La caméra la suit de dos dans l'axe, au 21 mm : 7 m puis 5,8 m derrière elle, 1,9 m de haut, puis
# elle se tasse au sol (0,6 m) quand la berline accélère, freine et s'arrête avant les plots ; la berline passe
# seule. scene_b.plan_P3 n'en lit que les fonctions du temps et les positions ; motion.py en tire roues, braquage
# et transfert de masse.
#
# Repère : celui de scene-b.blend après scene_b.to_world (la berline roule vers +y, y = s, x positif à sa droite ;
# le barrage à y = 126). t = 0 à la première image ; 28 images, 24 par seconde (shared/film/cut.ts).
#
# L'émotion visée : le piège. Image 1 à 12 : la rue se resserre, le barrage grossit plein centre au-dessus du
# toit, la berline feinte vers la patrouille de droite. Images 12 à 20 : elle revient dans l'axe, les agents
# tirent, la caméra descend ; à l'image 20 (STILL_FRAME, l'image fixe du banc) elle est à 3 m des plots et rien ne
# dit encore qu'elle passe. Images 20 à 28 : elle remet les gaz, les agents plongent derrière leurs portières, le
# trou des plots se lit à ses deux flancs, la caméra s'arrête, elle passe : à la dernière image elle est entre les
# deux patrouilles, les plots derrière elle.
#
# Écarts à la fiche v2, assumés : la caméra suit la berline en x (à 80 %, avec 0,08 s de retard) au lieu d'une
# ligne droite, pour que la feinte se lise sans que la berline sorte du tiers central ; elle se tient 0,6 m à
# gauche de la berline et vise 0,9 m à droite de l'axe (CAM_SIDE, AIM_RIGHT) : dans l'axe pile, le toit cachait
# les deux agents de l'image 1 à 24 ; elle se rapproche à 5,8 m (et non 5,5 : à 5,5 la caisse sortait du cadre à
# droite, images 14-20) ; elle s'arrête à 6 m des plots (y 116,6) et non à 1,4 m : arrivée à 5,8 m derrière la
# berline qui accélère, elle ne peut pas être à la fois si près d'elle et des plots ; la berline finit plus loin
# (y 128,4 au lieu de 127,3) : son arrière a passé les plots.
import math

import motion as M

FRAMES = 28
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = 20
T_STILL = M.t_of(STILL_FRAME)

# --- la berline (caisse : 4,89 × 1,88 m, le centre au milieu, 1,45 m de haut)
HALF_L, HALF_W, HEIGHT = 2.44, 0.94, 1.45
V0 = 29.5                          # m/s à la première image (106 km/h)
ACCEL0, ACCEL1 = 1.6, 3.4          # m/s² : elle tient, puis remet les gaz (rétrogradage) en entrant dans la brèche
T_KICK = (M.t_of(14), M.t_of(21))  # la remise des gaz, progressive
Y_LAST = 128.4                     # le centre de la caisse à la dernière image : l'arrière a passé les plots
# la feinte : sa route en x selon y (trois paliers raccordés en S) ; elle part un peu à gauche de l'axe, va vers la
# patrouille de droite, puis revient viser le milieu du trou des plots
X_START, X_FEINT, X_GAP = -0.45, 0.3, -0.25
Y_FEINT = (92.0, 107.0)            # de X_START à X_FEINT
Y_AIM = (107.0, 119.5)             # de X_FEINT à X_GAP, droite avant les plots
OVERSTEER = 0.35                   # la caisse tourne un peu plus que sa route (le train arrière qui suit en retard)


def _accel(t):
    return ACCEL0 + (ACCEL1 - ACCEL0) * M.smoothstep(T_KICK[0], T_KICK[1], t)


HERO = M.Profile(V0, _accel)
Y_START = Y_LAST - HERO.s(T_END)


def lateral(y):
    return (X_START + (X_FEINT - X_START) * M.smoothstep(Y_FEINT[0], Y_FEINT[1], y)
            + (X_GAP - X_FEINT) * M.smoothstep(Y_AIM[0], Y_AIM[1], y))


def hero_pos(t):
    y = Y_START + HERO.s(t)
    return lateral(y), y


def _travel(t, h=1e-3):
    a, b = hero_pos(t + h), hero_pos(t - h)
    return M.heading_of(a[0] - b[0], a[1] - b[1])


def hero_heading(t):
    """Le cap de la caisse : celui de sa route, amplifié de 35 % avec 0,05 s de retard (le train arrière qui
    décroche un peu dans la feinte) ; nul dans la brèche, où la route est droite."""
    return _travel(t) + OVERSTEER * _travel(t - 0.05)


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
# (les agents passent de la visée debout à l'accroupi derrière leur portière : l'emprise des deux poses, élargie)
_AGENT = [(1.62, 126.4), (1.74, 125.8), (1.9, 125.7), (2.1, 125.85), (2.3, 126.4), (2.28, 126.6),
          (2.0, 127.1), (1.85, 127.12), (1.62, 126.6)]


def _mirror(poly):
    return [(-x, y) for x, y in reversed(poly)]


OBSTACLES = {
    "patrol_a": _PATROL,
    "patrol_b": _mirror(_PATROL),
    "agent_0": _AGENT,
    "agent_1": _mirror(_AGENT),
    "panneau_0": [(2.39, 121.98), (3.21, 121.98), (3.21, 122.62), (2.39, 122.62)],
    "panneau_1": [(-3.21, 121.98), (-2.39, 121.98), (-2.39, 122.62), (-3.21, 122.62)],
}
CONE_R = 0.27
# les plots (x, y monde) : trois de chaque côté du trou, le trou devant la route de la berline
CONES = [(2.35, 123.1), (1.85, 123.3), (1.35, 123.4), (-1.85, 123.4), (-2.35, 123.3), (-2.85, 123.1)]
GAP = (-0.25, 123.3)               # le milieu du trou des plots
CONE_LINE = min(y for _, y in CONES) - CONE_R

# les voitures garées du côté gauche (x < 0 : la scène les pose à x = -2,95, caisse de 1,8 m) et les caisses de
# livraison au bord du trottoir de droite, que la berline frôle dans sa feinte (scene_b les pose)
PARKED_X = (-3.85, -2.05)
CRATES = (2.05, 3.05, 104.5, 107.1)        # x0, x1, y0, y1 (piles de palettes et cageots)

# les flaques (x, y monde, demi-largeur en x, allongement en y) : sur la ligne de la berline (la gerbe de la
# feinte, celle d'avant les plots), sous la caméra quand elle rase le sol, et devant elle à l'arrêt (le barrage s'y
# reflète) ; scene_b les pose, wheel_hits() dit quand une roue y passe
PUDDLES = [("flaque_entree", -1.05, 97.5, 0.55, 2.4), ("flaque_feinte", 1.15, 103.6, 0.55, 2.2),
           ("flaque_axe", -0.55, 109.5, 0.45, 2.0), ("flaque_basse_0", -1.0, 112.8, 0.5, 1.9),
           ("flaque_basse_1", 0.15, 115.4, 0.4, 1.7), ("flaque_breche", -0.15, 120.6, 1.0, 1.5),
           ("flaque_arret", -0.95, 118.7, 0.55, 1.4), ("flaque_trottoir", 3.2, 117.0, 0.5, 2.6)]

# --- la troisième patrouille : derrière la caméra, hors champ ; ses rampes battent dans la rue (elle suit)
CHASE = (0.9, -34.0, 0.0)          # x, retard sur la berline à t = 0 (m), cap
CHASE_V = 29.0


def chase_pos(t):
    return CHASE[0], Y_START + CHASE[1] + CHASE_V * t


def parked(name):
    x, y, _ = PATROLS[name]
    return lambda t: (x, y)


def tracks():
    """{nom: pos(t)} de tous les véhicules du plan (pour vérifier les distances)."""
    return {"hero": hero_pos, "patrol_a": parked("patrol_a"), "patrol_b": parked("patrol_b"), "patrol_c": chase_pos}


# --- les tirs : un éclair d'une image ; chaque agent tire en visée debout, puis tous deux ensemble à l'image 20
# (l'image où l'on retient son souffle), puis ils plongent derrière leur portière
SHOTS = {0: (13, STILL_FRAME), 1: (9, 16, STILL_FRAME)}
# les poses des agents (lieux.officer_rig) : (image, pose) ; la visée debout, puis à couvert
COVER = {0: ((1, "aim"), (STILL_FRAME + 1, "aim"), (STILL_FRAME + 4, "crouch")),
         1: ((1, "aim"), (STILL_FRAME + 2, "aim"), (STILL_FRAME + 5, "crouch"))}


def firing(k, frame):
    return frame in SHOTS[k]


# --- la caméra : travelling suiveur qui se rapproche (7 → 5,8 m), grue qui descend sans palier (1,9 → 0,6 m),
# puis freinage jusqu'à l'arrêt, amorti, avant les plots ; la berline continue
LENS = 21.0
CAM_SIDE = -0.6                    # à gauche de l'axe de la berline : l'agent de gauche se lit à côté du toit
FOLLOW, FOLLOW_LAG = 0.8, 0.08    # la part de l'écart latéral de la berline que la caméra reprend, et son retard
D0, D1 = 7.0, 5.8                  # derrière le centre de la berline
AIM_RIGHT = 0.9                    # la visée décalée à droite : la berline (à droite de la caméra) reste entière
T_CLOSE = M.t_of(19)               # fin du rapprochement : début du freinage
T_STOP = M.t_of(28)                # arrêt
Z0, Z1 = 1.9, 0.6
T_LOW = M.t_of(26)                 # au sol
PITCH0, PITCH1 = -1.5, 5.0         # site : un peu plongé au début (la berline et le barrage), relevé au sol
_DT = 1.0 / 960.0


def _track_y(t):
    d = D0 - (D0 - D1) * M.smoothstep(0.0, T_CLOSE, t)
    return Y_START + HERO.s(t) - d


def _build_cam():
    """La caméra en y par intégration : la vitesse du suiveur, puis la même multipliée par (1 - smoothstep) du
    freinage (vitesse nulle à T_STOP, sans à-coup) ; et la plongée de la caméra au freinage (un ressort)."""
    n = int(round((T_END + 0.2) / _DT)) + 2
    ys, nod = [_track_y(0.0)], [0.0]
    spring = M._Spring(2.2, 0.45)
    v_prev = None
    for k in range(1, n):
        t = k * _DT
        v = (_track_y(t) - _track_y(t - _DT)) / _DT
        v *= 1.0 - M.smoothstep(T_CLOSE, T_STOP, t)
        ys.append(ys[-1] + v * _DT)
        a = 0.0 if v_prev is None else (v - v_prev) / _DT
        v_prev = v
        # la décélération (m/s², positive au freinage) fait piquer la caméra : -1,6° au plus fort, puis rebond
        spring.step(-1.6 * min(1.0, max(0.0, -a) / 70.0), _DT)
        nod.append(spring.x)
    return ys, nod


_CAM_Y, _CAM_NOD = _build_cam()


def _lerp(arr, t):
    u = max(0.0, t) / _DT
    k = min(len(arr) - 2, int(u))
    f = min(1.0, u - k)
    return arr[k] * (1 - f) + arr[k + 1] * f


def cam_y(t):
    if t < 0.0:                    # (l'image d'avant le plan, pour l'obturateur : la caméra roule déjà)
        return _CAM_Y[0] + t * (_CAM_Y[1] - _CAM_Y[0]) / _DT
    return _lerp(_CAM_Y, t)


def cam_z(t):
    """1,9 m → 0,6 m sans palier : la descente commence dès la première image (lente), s'accélère quand la
    berline remet les gaz, finit à vitesse nulle à l'image 26."""
    # (une part linéaire, pour qu'elle bouge dès la première image, et une courbe lente au début : tant que la
    # caméra est au-dessus du toit, le barrage se lit par-dessus ; à hauteur du toit, le toit le cacherait au loin)
    u = min(1.0, max(0.0, t / T_LOW))
    s = 0.1 * (2.0 * u - u * u) + 0.9 * M.smoothstep(0.0, 1.0, u ** 1.8)
    return Z0 - (Z0 - Z1) * s


def cam_x(t):
    return CAM_SIDE + X_START + FOLLOW * (lateral(Y_START + HERO.s(max(0.0, t - FOLLOW_LAG))) - X_START)


def cam_aim(t):
    """Le point visé : entre la berline et le trou des plots (le barrage reste plein centre, la berline dans le
    tiers central)."""
    x, y = hero_pos(t)
    return 0.6 * x + 0.4 * GAP[0] + AIM_RIGHT, max(y, GAP[1]) + 20.0


def camera(t):
    x, y, z = cam_x(t), cam_y(t), cam_z(t)
    ax, ay = cam_aim(t)
    yaw = 180.0 + math.degrees(math.atan2(ax - x, ay - y))
    pitch = PITCH0 + (PITCH1 - PITCH0) * M.smoothstep(0.0, T_LOW, t)
    # la caméra roule : une vibration de route qui s'éteint avec sa vitesse ; la plongée du freinage
    v = (cam_y(t + 0.01) - cam_y(t - 0.01)) / 0.02
    k = min(1.0, v / 30.0)
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.14, rotor=0.05, seed=3.1)
    return (x + k * dx, y, z + k * dz * 0.5, yaw + k * dyaw, pitch + k * dpitch + _lerp(_CAM_NOD, t),
            k * droll, LENS)


# --- le cadre, sans Blender : la projection d'un point (repère de render : capteur de 36 mm sur la hauteur, le
# format 9:16), pour les contrôles de cadrage
SENSOR_H, ASPECT = 36.0, 9.0 / 16.0


def project(cam, p):
    """(u, v) d'un point monde p (x, y, z) : u de -1 (bord gauche) à 1 (bord droit), v de 0 (bas) à 1 (haut) ;
    None derrière la caméra."""
    x, y, z, yaw, pitch, roll, lens = cam
    a, b = math.radians(yaw), math.radians(pitch)
    d = (-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
    r = (d[1], -d[0], 0.0)
    n = math.hypot(r[0], r[1])
    r = (r[0] / n, r[1] / n, 0.0)
    up = (r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0])
    q = (p[0] - x, p[1] - y, p[2] - z)
    depth = sum(q[i] * d[i] for i in range(3))
    if depth <= 0.05:
        return None
    half_h = SENSOR_H / 2 / lens
    half_w = half_h * ASPECT
    return (sum(q[i] * r[i] for i in range(3)) / depth / half_w,
            0.5 + sum(q[i] * up[i] for i in range(3)) / depth / half_h / 2)


def hero_frame(t, cam=None):
    """La boîte de la berline dans le cadre : (u0, u1, v0, v1) et son centre (u, v)."""
    cam = cam or camera(t)
    pts = [project(cam, (x, y, z)) for x, y in hero_box(t) for z in (0.12, HEIGHT)]
    pts = [p for p in pts if p is not None]
    x, y = hero_pos(t)
    c = project(cam, (x, y, HEIGHT * 0.5))
    return (min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts)), c


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


def _rect(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def clearances(frames=None, sub=4):
    """La plus petite distance au sol (m) entre la caisse de la berline et chaque obstacle sur le plan, image par
    image et entre les images (`sub` pas par image), et entre la caméra et la caisse : {obstacle: (distance,
    image)}."""
    frames = frames or range(F0 - 1, F0 + FRAMES + 1)
    fixed = dict(OBSTACLES)
    fixed["caisses"] = _rect(*CRATES)
    fixed["garees"] = _rect(PARKED_X[0], PARKED_X[1], 90.0, 126.0)
    out = {}
    for f in frames:
        for k in range(sub):
            t = M.t_of(f + k / sub)
            car = hero_box(t)
            items = [(n, _poly_dist(car, poly)) for n, poly in fixed.items()]
            items += [(f"plot_{i}", max(0.0, min(_seg_dist(c, car[j], car[(j + 1) % 4]) for j in range(4)) - CONE_R)
                       if not _inside(c, car) else 0.0) for i, c in enumerate(CONES)]
            cam = camera(t)[:2]
            items.append(("camera", 0.0 if _inside(cam, car) else
                          min(_seg_dist(cam, car[j], car[(j + 1) % 4]) for j in range(4))))
            for n, d in items:
                if n not in out or d < out[n][0]:
                    out[n] = (d, f + k / sub)
    return out


def wheel_hits(spots=None, frames=None, sub=8):
    """Les images où une roue de la berline passe sur une des taches `spots` [(nom, x, y, rx, allongement)] (les
    flaques, PUDDLES par défaut) : {nom: [(image, roue)]}, la première image de chaque passage."""
    spots = PUDDLES if spots is None else spots
    frames = frames or range(F0, F0 + FRAMES)
    out = {}
    for f in frames:
        for k in range(sub):
            t = M.t_of(f + k / sub)
            x, y = hero_pos(t)
            h = math.radians(hero_heading(t))
            fx, fy = -math.sin(h), math.cos(h)
            for wn, a, b in (("AVD", 1.38, 0.76), ("AVG", 1.38, -0.76), ("ARD", -1.39, 0.76), ("ARG", -1.39, -0.76)):
                wx, wy = x + fx * a + fy * b, y + fy * a - fx * b
                for n, px, py, r, sy in spots:
                    if (((wx - px) / r) ** 2 + ((wy - py) / (r * sy)) ** 2 < 1.0
                            and not any(w == wn for _, w in out.get(n, []))):
                        out.setdefault(n, []).append((round(f + k / sub, 2), wn))
    return out


if __name__ == "__main__":
    for f in (1, 5, 9, 13, 17, 20, 22, 24, 26, 28):
        t = M.t_of(f)
        x, y = hero_pos(t)
        c = camera(t)
        (u0, u1, v0, v1), (uc, vc) = hero_frame(t, c)
        g = project(c, (GAP[0], GAP[1], 0.9))
        print(f"image {f:2d} : berline ({x:5.2f}, {y:6.1f}) {HERO.v(t) * 3.6:4.0f} km/h cap {hero_heading(t):5.1f}° | "
              f"caméra ({c[0]:5.2f}, {c[1]:6.1f}, {c[2]:4.2f}) lacet {c[3]:6.1f} site {c[4]:4.1f} à {y - c[1]:4.1f} m | "
              f"cadre x {50 * (u0 + 1):3.0f}–{50 * (u1 + 1):3.0f} % y {100 * v0:3.0f}–{100 * v1:3.0f} % centre "
              f"({50 * (uc + 1):3.0f}, {100 * vc:3.0f}) | trou ({50 * (g[0] + 1):3.0f}, {100 * g[1]:3.0f})")
    for n, (d, f) in sorted(clearances().items(), key=lambda kv: kv[1][0]):
        print(f"  {n:10s} {d:5.2f} m (image {f:.2f})")
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
