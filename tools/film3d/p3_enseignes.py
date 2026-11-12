# Le plan P3 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md, « P3 — Le barrage, de dos ») : la
# berline fonce dans la rue des enseignes vers le barrage, deux patrouilles nez à nez, les plots, deux agents qui
# tirent puis se mettent à couvert ; elle feinte à droite, revient viser le trou des plots, remet les gaz et passe
# de justesse. La caméra la suit de dos, au 21 mm, 7 m derrière, de 1,9 m de haut à 0,7 m, et passe le barrage à
# sa suite entre les deux patrouilles, sans freiner. scene_b.plan_P3 n'en lit que les fonctions du temps et les
# positions ; motion.py en tire roues, braquage et transfert de masse.
#
# Repère : celui de scene-b.blend après scene_b.to_world (la berline roule vers +y, y = s, x positif à sa droite ;
# le barrage à y = 126). t = 0 à la première image ; 48 images, 24 par seconde (shared/film/cut.ts).
#
# L'émotion visée : le piège. Image 1 : le raccord de P2, la patrouille 1 au bord gauche, la berline au centre, le
# barrage au fond de la rue au-dessus du toit. Images 1 à 20 : la rue se resserre, la patrouille 1 lâche, la
# berline feinte vers la patrouille de droite, la caméra commence à descendre. Images 20 à 34 : elle revient dans
# l'axe, les agents tirent ; à l'image 34 (STILL_FRAME, l'image fixe du banc) elle est à 6 m des plots et rien ne
# dit encore qu'elle passe. Images 34 à 48 : elle remet les gaz, les agents plongent derrière leurs portières, elle
# passe le trou des plots, la caméra à 0,7 m derrière elle entre les deux patrouilles ; à la dernière image, le
# quai, le pont qui monte et son pylône devant elle.
#
# Écarts à la fiche v3, assumés : la grue descend des images 8 à 46 et non 16 à 38 (1,2 m en 22 images dépasse
# 1,5 m/s et 3 m/s²) ; l'écart caméra-berline varie de 2,2 m/s au plus et non 1 (la berline remet les gaz à
# 3,4 m/s² pendant que la caméra garde sa vitesse : à 1 m/s, la caméra devrait accélérer avec elle) ; le site
# n'est pas -1,5° puis +5° : il découle du cadre (centre de la berline à 48 puis 55 % depuis le haut) ; la patrouille 1 roule à x -3,05 et non -2,4 (voir plus bas).
import math

import motion as M

SENSOR_H, ASPECT = 36.0, 9.0 / 16.0   # capteur de 36 mm sur la hauteur, cadre 9:16

FRAMES = 48
V3 = True                          # découpage v3 : les plafonds de caméra des tests s'appliquent
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = 34                   # les deux agents tirent ensemble : l'image où l'on retient son souffle
T_STILL = M.t_of(STILL_FRAME)

# --- la berline (caisse : 4,89 × 1,88 m, le centre au milieu, 1,45 m de haut)
HALF_L, HALF_W, HEIGHT = 2.44, 0.94, 1.45
V0 = 29.5                          # m/s à la première image (106 km/h)
ACCEL0, ACCEL1 = 1.6, 3.4          # m/s² : elle tient, puis remet les gaz (rétrogradage) en entrant dans la brèche
T_KICK = (M.t_of(30), M.t_of(38))  # la remise des gaz, progressive
Y_LAST = 134.0                     # le centre de la caisse à la dernière image : 8 m au-delà des patrouilles
# la feinte : sa route en x selon y (trois paliers raccordés en S) ; elle part un peu à gauche de l'axe, va vers la
# patrouille de droite, puis revient viser le milieu du trou des plots
X_START, X_FEINT, X_GAP = -0.45, 0.3, -0.25
Y_FEINT = (80.0, 100.0)            # de X_START à X_FEINT
Y_AIM = (100.0, 119.5)             # de X_FEINT à X_GAP, droite avant les plots
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

# les caisses de livraison au bord du trottoir de droite, que la berline frôle dans sa feinte (scene_b les pose ;
# les voitures garées de gauche sont retirées de la voie de la patrouille 1)
CRATES = (2.05, 3.05, 104.5, 107.1)        # x0, x1, y0, y1 (piles de palettes et cageots)

# les flaques (x, y monde, demi-largeur en x, allongement en y) : sur la ligne de la berline (la gerbe de la
# feinte, celle d'avant les plots) et sous la caméra quand elle rase le sol ; jamais une large dans l'axe de la
# caméra devant la berline (en miroir sous le ciel noir, elle ouvrait un trou au bas du cadre) : près de l'axe,
# 35 cm au plus ; celle de la brèche sous les roues droites, celle de l'arrêt à gauche de l'objectif ;
# scene_b les pose, wheel_hits() dit quand une roue y passe
PUDDLES = [("flaque_entree", -1.05, 97.5, 0.55, 2.4), ("flaque_feinte", 1.15, 103.6, 0.55, 2.2),
           ("flaque_axe", -0.75, 109.5, 0.35, 2.0), ("flaque_basse_0", -1.05, 112.8, 0.35, 1.9),
           ("flaque_basse_1", 0.35, 115.4, 0.35, 1.7), ("flaque_breche", 0.6, 121.0, 0.45, 1.6),
           ("flaque_arret", -2.3, 118.9, 0.4, 1.4), ("flaque_trottoir", 3.2, 117.0, 0.5, 2.6)]

# --- les rampes du barrage, vues de loin (55 m à l'image 1) : leur émission × BAR_GAIN jusqu'à l'image 22,
# ramenée à la normale à l'image 38, quand la berline arrive aux plots (scene_b.bar_boost_keyed) ; de loin elles ne
# font que quelques pixels au-dessus du toit. Leurs flaques de couleur sur la chaussée (lieux.bar_pools, 2000 W)
# gardent leur force jusqu'à l'image 28 (leur reflet court vers la caméra le long de la berline) puis tombent à
# POOL_LOW à l'image 38 : de près, elles noyaient la rue de corail
BAR_GAIN, BAR_GAIN_FADE = 10.0, (22, 38)
POOL_LOW, POOL_FADE = 0.25, (28, 38)
# les faisceaux des deux patrouilles du barrage sur les façades devant lui : × BEAM_GAIN jusqu'à l'image 22,
# normaux à l'image 36 (la berline cache le barrage au début : ce sont les murs qui battent)
BEAM_GAIN, BEAM_FADE = 2.5, (22, 36)

# --- la patrouille 1 (celle de P2) : son avant au bord gauche du cadre à l'image 1, 6,3 m derrière la berline,
# presque à la vitesse de la caméra, dans la voie de gauche (x -3,05, la roue gauche au ras de la bordure) ; elle
# lâche à partir de l'image 10 (freine à 7 m/s²), sort du cadre par la gauche et reste dans sa voie : à la dernière
# image, son avant est à 3 m du panneau du barrage. Pas à -2,4 (la fiche) : son flanc passait à 0,4 m de
# l'objectif et à 0,2 m de la berline (1,5 m au moins entre deux caisses) ; pas de rabattement dans l'axe : elle
# n'est jamais assez loin derrière la caméra avant le barrage. Les voitures garées de sa voie, devant elle, sont
# retirées (scene_b.PARKED)
CHASE_X, CHASE_BACK = -3.05, 6.3   # x ; m derrière le centre de la berline à l'image 1
CHASE_BRAKE, CHASE_LET = 7.0, (M.t_of(10), M.t_of(16))
CHASE_V = V0 + 0.6 - 0.8           # m/s à l'image 1 : 0,8 m/s de moins que la caméra
CHASE = (CHASE_X, -CHASE_BACK, 0.0)    # (x, retard sur la berline, cap) à l'image 1, pour scene_b
_CHASE = M.Profile(CHASE_V, lambda t: -CHASE_BRAKE * M.smoothstep(CHASE_LET[0], CHASE_LET[1], t))


def chase_pos(t):
    return CHASE_X, Y_START - CHASE_BACK + _CHASE.s(t)


def _centroid(poly):
    return sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)


def parked(name):
    x, y = _centroid(OBSTACLES[name])      # le milieu de la caisse (PATROLS donne l'origine du modèle)
    return lambda t: (x, y)


def tracks():
    """{nom: pos(t)} de tous les véhicules du plan (pour vérifier les distances)."""
    return {"hero": hero_pos, "patrol_a": parked("patrol_a"), "patrol_b": parked("patrol_b"), "patrol_c": chase_pos}


def tracks_heading():
    """{nom: cap(t)} des véhicules arrêtés ou sans vitesse lisible : les deux patrouilles du barrage, nez à nez,
    leur grand axe à 24° de la rue (relevé sur _PATROL), et la patrouille 1, droite dans sa voie."""
    return {"patrol_a": lambda t: -24.0, "patrol_b": lambda t: 24.0, "patrol_c": lambda t: CHASE[2]}


# les plots et les panneaux du barrage, pour motion.py mesure --v3 : (x, y, rayon)
POSTS = [(x, y, CONE_R) for x, y in CONES] + [(2.8, 122.3, 0.5), (-2.8, 122.3, 0.5)]


# --- les tirs : un éclair d'une image ; chaque agent tire en visée debout, puis tous deux ensemble à l'image 34
# (l'image où l'on retient son souffle), puis ils plongent derrière leur portière
SHOTS = {0: (22, STILL_FRAME), 1: (16, 28, STILL_FRAME)}
# les poses des agents (lieux.officer_rig) : (image, pose) ; la visée debout, puis à couvert
COVER = {0: ((1, "aim"), (STILL_FRAME + 1, "aim"), (STILL_FRAME + 4, "crouch")),
         1: ((1, "aim"), (STILL_FRAME + 2, "aim"), (STILL_FRAME + 5, "crouch"))}


def firing(k, frame):
    return frame in SHOTS[k]


# --- la caméra (découpage v3) : elle suit la berline de dos, 7 m derrière, au 21 mm, et ne freine plus. Elle part
# un peu plus vite qu'elle (0,6 m/s) et la rattrape jusqu'à 6,3 m ; à partir des images 20-27 elle garde sa vitesse
# pendant que la berline remet les gaz : l'écart remonte à 7 m, la caméra passe le barrage à sa suite, entre les
# deux patrouilles, à 0,7 m du sol, dans l'axe du trou des plots. Elle descend de 1,9 à 0,7 m des images 8 à 46
# (grue au plus 1,4 m/s, amortie sur 16 images : la grue plafonnée à 1,5 m/s et 3 m/s² ne fait pas 1,2 m en moins
# de 38 images) et son site suit sa hauteur, de -5,5° à +1,5° : le barrage au fond de la rue à mi-hauteur au
# début, la berline un peu sous le milieu du cadre tout du long. Le lacet vise la berline (décalé de BIAS0 vers le
# barrage au début) ; elle rejoint l'axe du trou des plots des images 26 à 42 (la fiche : 30 à 36, mais 0,35 m
# en 6 images, c'est 30 m/s² de côté) ; à la dernière image, devant, le quai, le pont qui monte et le pylône.
LENS = 21.0
D0, R0 = 7.0, 0.6                  # derrière le centre de la berline à l'image 1 ; vitesse de rapprochement (m/s)
T_HOLD = (M.t_of(20), M.t_of(27))  # la caméra cesse presque d'accélérer : la berline s'éloigne
HOLD_KEEP = 0.3                    # la part de l'accélération de la berline qu'elle garde (écart relatif ≤ 4 m/s²)
CAM_SIDE = -0.6                    # à gauche de la route de la berline, jusqu'à l'image 26
FOLLOW, FOLLOW_LAG = 0.85, 0.0    # la part de l'écart latéral de la berline que la caméra reprend, et son retard
T_AXIS = (M.t_of(14), M.t_of(46))  # elle rejoint l'axe du trou des plots (x -0,25) et y reste
Z0, Z1 = 1.9, 0.7
T_DOWN, T_RAMP = (M.t_of(8), M.t_of(46)), 16.0 / M.FPS
PITCH0, PITCH1 = -5.5, 1.5         # le site à 1,9 m et à 0,7 m (entre les deux, selon la hauteur)
BIAS0 = -1.5                       # degrés : le lacet un peu vers le barrage au début (rien à la fin)
_DT = 1.0 / 960.0


def _cam_accel(t):
    return _accel(t) * (1.0 - (1.0 - HOLD_KEEP) * M.smoothstep(T_HOLD[0], T_HOLD[1], t))


_CAM = M.Profile(V0 + R0, _cam_accel)


def cam_y(t):
    return Y_START - D0 + _CAM.s(t)


def _z_rate(t):
    a, b = T_DOWN
    return min(M.smoothstep(a, a + T_RAMP, t), 1.0 - M.smoothstep(b - T_RAMP, b, t))


def _build_z():
    n = int(round((T_DOWN[1] + 0.05) / _DT)) + 2
    acc = [0.0]
    for k in range(1, n):
        acc.append(acc[-1] + _z_rate((k - 0.5) * _DT) * _DT)
    return acc


_Z = _build_z()


def cam_z(t):
    u = min(len(_Z) - 1.0, max(0.0, t / _DT))
    k = min(len(_Z) - 2, int(u))
    w = _Z[k] + (_Z[k + 1] - _Z[k]) * (u - k)
    return Z0 - (Z0 - Z1) * w / _Z[-1]


def cam_x(t):
    """Derrière la berline, avec FOLLOW_LAG de retard : à CAM_SIDE à sa gauche, et ne reprenant que FOLLOW de son
    écart latéral au début ; dans sa trace (celle du trou des plots) à la fin."""
    lat = lateral(Y_START + HERO.s(max(0.0, t - FOLLOW_LAG)))
    return lat + (1.0 - M.smoothstep(T_AXIS[0], T_AXIS[1], t)) * (CAM_SIDE + (1.0 - FOLLOW) * (X_START - lat))


def camera_rail(t):
    """La caméra sans tremblé : (x, y, z, lacet, site, roulis, focale)."""
    x, y, z = cam_x(t), cam_y(t), cam_z(t)
    hx, hy = hero_pos(t)
    yaw = 180.0 + math.degrees(math.atan2(hx - x, hy - y)) + BIAS0 * (1.0 - M.smoothstep(T_AXIS[0], T_AXIS[1], t))
    pitch = PITCH1 + (PITCH0 - PITCH1) * (z - Z1) / (Z0 - Z1)
    return (x, y, z, yaw, pitch, 0.0, LENS)


def camera(t):
    x, y, z, yaw, pitch, roll, lens = camera_rail(t)
    # la caméra roule : une vibration de route (0,12° à 24 mm, × 24/focale)
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.12 * 24.0 / LENS, rotor=0.03, seed=3.1)
    return (x + dx, y, z + dz * 0.5, yaw + dyaw, pitch + dpitch, droll, lens)


# --- le cadre, sans Blender : la projection d'un point (repère de render : capteur de 36 mm sur la hauteur, le
# format 9:16), pour les contrôles de cadrage (SENSOR_H, ASPECT : plus haut, la caméra s'en sert)


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


def _car_box(x, y, h_deg, half_l=HALF_L, half_w=HALF_W):
    h = math.radians(h_deg)
    fx, fy = -math.sin(h), math.cos(h)
    return [(x + fx * a * half_l + fy * b * half_w, y + fy * a * half_l - fx * b * half_w)
            for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


def cam_clearances(frames=None, sub=4):
    """La plus petite distance au sol (m) entre la caméra et chaque véhicule ou obstacle (la caisse de la
    berline, la patrouille 1, le décor du barrage, les plots) : {nom: (distance, image)}."""
    frames = frames or range(F0, F0 + FRAMES)
    fixed = dict(OBSTACLES)
    fixed["caisses"] = _rect(*CRATES)
    out = {}
    for f in frames:
        for k in range(sub):
            t = M.t_of(f + k / sub)
            c = camera(t)[:2]
            polys = dict(fixed)
            polys["berline"] = hero_box(t)
            polys["patrouille_1"] = _car_box(*chase_pos(t), CHASE[2], 2.5, 1.0)
            items = [(n, 0.0 if _inside(c, P) else min(_seg_dist(c, P[j], P[(j + 1) % len(P)]) for j in range(len(P))))
                     for n, P in polys.items()]
            items += [(f"plot_{i}", max(0.0, math.hypot(c[0] - q[0], c[1] - q[1]) - CONE_R)) for i, q in enumerate(CONES)]
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
    for f in (1, 8, 12, 16, 20, 24, 28, 30, 34, 38, 42, 46, 48):
        t = M.t_of(f)
        x, y = hero_pos(t)
        c = camera(t)
        (u0, u1, v0, v1), (uc, vc) = hero_frame(t, c)
        g = project(c, (GAP[0], GAP[1], 0.9)) or (float("nan"), float("nan"))
        print(f"image {f:2d} : berline ({x:5.2f}, {y:6.1f}) {HERO.v(t) * 3.6:4.0f} km/h cap {hero_heading(t):5.1f}° | "
              f"caméra ({c[0]:5.2f}, {c[1]:6.1f}, {c[2]:4.2f}) lacet {c[3]:6.1f} site {c[4]:4.1f} à {y - c[1]:4.1f} m | "
              f"cadre x {50 * (u0 + 1):3.0f}–{50 * (u1 + 1):3.0f} % y {100 * v0:3.0f}–{100 * v1:3.0f} % centre "
              f"({50 * (uc + 1):3.0f}, {100 * vc:3.0f}) | trou ({50 * (g[0] + 1):3.0f}, {100 * g[1]:3.0f})")
    for n, (d, f) in sorted(clearances().items(), key=lambda kv: kv[1][0]):
        print(f"  {n:10s} {d:5.2f} m (image {f:.2f})")
    for n, (d, f) in sorted(cam_clearances().items(), key=lambda kv: kv[1][0])[:4]:
        print(f"  caméra–{n:10s} {d:5.2f} m (image {f:.2f})")
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
