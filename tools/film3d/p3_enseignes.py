# Le plan P3 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md, « P3 — Le barrage, de dos », et le
# découpage v3.1) : la berline fonce dans la rue des enseignes vers le barrage, deux patrouilles nez à nez, les
# plots, un agent qui tire, l'autre qui fait « stop » ; elle lève le pied, vise le trou des plots, remet les gaz et
# passe. La caméra de poursuite commune (v3.1) la suit de dos : 2,4 m de haut, 7,5 m derrière, au 24 mm, tout le
# plan ; elle passe le barrage à sa suite, au-dessus des plots et des capots. scene_b.plan_P3 n'en lit que les
# fonctions du temps et les positions ; motion.py en tire roues, braquage et transfert de masse.
#
# Repère : celui de scene-b.blend après scene_b.to_world (la berline roule vers +y, y = s, x positif à sa droite ;
# le barrage à y = 126). t = 0 à la première image ; 48 images, 24 par seconde (shared/film/cut.ts).
#
# L'émotion visée : le piège. Image 1 : le raccord de P2, la patrouille 1 devant à gauche, rampe allumée, qui
# freine déjà (elle sait que le piège est devant) ; le barrage au fond de la rue au-dessus du toit. Images 1 à 30 :
# la berline la dépasse, elle recule dans le cadre et sort par le bas à gauche ; la berline lève le pied puis freine
# un peu (feux stop, images 21 à 31), les agents tirent et font « stop ». Images 30 à 48 : elle remet les gaz en
# entrant dans la trouée, les agents plongent derrière leurs portières, elle passe, la caméra à sa suite entre les
# deux patrouilles ; à la dernière image, le quai, le pont qui monte et son pylône devant elle.
#
# Écarts assumés : le trou des plots est à x +0,35 et non dans l'axe (la berline, qui ne peut changer de file
# qu'en 1,3 s au moins à 12 m/s³, reste ainsi à 1,5 m de la patrouille 1 quand elle la dépasse) ; la patrouille 1
# est devant la berline à l'image 1 et non à côté (au 24 mm, à côté, sa rampe sortait du cadre par la gauche).
import math

import motion as M

SENSOR_H, ASPECT = 36.0, 9.0 / 16.0   # capteur de 36 mm sur la hauteur, cadre 9:16

FRAMES = 48
V3 = True                          # découpage v3 : les plafonds de caméra des tests s'appliquent
V31 = True                         # découpage v3.1 : cadre de poursuite commun, conduite sur route mouillée
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = 34                   # les deux agents tirent ensemble : l'image où l'on retient son souffle
T_STILL = M.t_of(STILL_FRAME)

# --- la berline (caisse : 4,89 × 1,88 m, le centre au milieu, 1,45 m de haut). Une berline lourde sur le mouillé
# (découpage v3.1, B) : elle tient sa vitesse, lève le pied puis freine un peu avant la trouée (A_LIFT, feux stop),
# remet les gaz en y entrant (A_GAS, 3 m/s² au plus) ; chaque accélération s'installe en smoothstep sur 12 à 20
# images (à-coup ≤ 12 m/s³, la crête d'un smoothstep fait 1,5 fois sa moyenne). Aucune glisse : le cap de la caisse
# est celui de sa route.
HALF_L, HALF_W, HEIGHT = 2.44, 0.94, 1.45
V0 = 29.5                          # m/s à la première image (106 km/h)
A_LIFT, T_LIFT = -2.5, (M.t_of(12), M.t_of(24))
A_GAS, T_GAS = 3.0, (M.t_of(28), M.t_of(48))
Y_LAST = 134.0                     # le centre de la caisse à la dernière image : 8 m au-delà des patrouilles
# sa route en x selon y : un seul changement de file, de X_START (à droite, la patrouille 1 roule à sa gauche, et
# vers la patrouille de droite : la feinte) à X_GAP (le milieu du trou des plots), en « smootherstep » (accélération
# latérale nulle aux deux bouts, courbure continue) sur Y_AIM : un aller-retour (la feinte v3) dépassait 12 m/s³
X_START, X_GAP = 0.6, 0.35
Y_AIM = (76.0, 120.0)


def smoother(a, b, x):
    """0 avant a, 1 après b, et entre les deux 6u⁵ − 15u⁴ + 10u³ : vitesse et accélération nulles aux deux bouts."""
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * u * (10.0 + u * (-15.0 + 6.0 * u))


def _accel(t):
    return A_LIFT * M.smoothstep(T_LIFT[0], T_LIFT[1], t) + (A_GAS - A_LIFT) * M.smoothstep(T_GAS[0], T_GAS[1], t)


HERO = M.Profile(V0, _accel)
Y_START = Y_LAST - HERO.s(T_END)


def lateral(y):
    return X_START + (X_GAP - X_START) * smoother(Y_AIM[0], Y_AIM[1], y)


def hero_pos(t):
    y = Y_START + HERO.s(t)
    return lateral(y), y


def _travel(t, h=1e-3):
    a, b = hero_pos(t + h), hero_pos(t - h)
    return M.heading_of(a[0] - b[0], a[1] - b[1])


def hero_heading(t):
    """Le cap de la caisse : celui de sa route (pas de glisse dans ce plan)."""
    return _travel(t)


def brake_windows():
    """Les fenêtres (première, dernière image) où la berline freine à plus de 2 m/s² : feux stop (scene_b)."""
    out, cur = [], None
    for f in range(F0, F0 + FRAMES):
        on = _accel(M.t_of(f)) < -2.0
        if on and cur is None:
            cur = [f, f]
        elif on:
            cur[1] = f
        elif cur is not None:
            out.append(tuple(cur))
            cur = None
    if cur is not None:
        out.append(tuple(cur))
    return out


def hero_box(t):
    """Les quatre coins de la caisse au sol à l'instant t."""
    x, y = hero_pos(t)
    h = math.radians(hero_heading(t))
    fx, fy = -math.sin(h), math.cos(h)       # l'avant (cap 0 : +y, positif vers -x)
    rx, ry = fy, -fx                         # la droite de la voiture
    return [(x + fx * a * HALF_L + rx * b * HALF_W, y + fy * a * HALF_L + ry * b * HALF_W)
            for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


# --- le décor fixe : l'enveloppe convexe au sol (sous 1,5 m) de chaque obstacle, relevée sur les maillages de
# scene-b.blend en repère monde (portières ouvertes comprises), un sommet sur deux ou trois gardé, à x 3,4 ; le
# barrage est écarté de BAR_SHIFT de chaque côté (la berline à 0,35 m au moins des boîtes des patrouilles, et non
# 0,10 : la trouée se lisait comme un choc), scene_b pose patrouilles et panneaux à PATROLS et PANELS
BAR_SHIFT = 0.3
BAR_X = 3.4 + BAR_SHIFT
PATROLS = {"patrol_a": (BAR_X, 126.0, 25.0), "patrol_b": (-BAR_X, 126.0, -25.0)}   # x, y, et lacet vers l'axe
_PATROL = [(x + BAR_SHIFT, y) for x, y in
           [(1.52, 126.52), (1.68, 124.17), (1.88, 123.72), (2.57, 123.39), (3.07, 123.53), (4.9, 125.06),
            (5.18, 127.9), (4.86, 128.26), (3.77, 128.66), (3.66, 128.61), (1.69, 126.72)]]
# (les agents passent de la visée debout à l'accroupi derrière leur portière : l'emprise des deux poses, élargie)
_AGENT = [(x + BAR_SHIFT, y) for x, y in
          [(1.62, 126.4), (1.74, 125.8), (1.9, 125.7), (2.1, 125.85), (2.3, 126.4), (2.28, 126.6),
           (2.0, 127.1), (1.85, 127.12), (1.62, 126.6)]]
PANELS = [(2.8 + BAR_SHIFT, 122.3), (-2.8 - BAR_SHIFT, 122.3)]    # les panneaux rayés (x, y monde)


def _mirror(poly):
    return [(-x, y) for x, y in reversed(poly)]


OBSTACLES = {
    "patrol_a": _PATROL,
    "patrol_b": _mirror(_PATROL),
    "agent_0": _AGENT,
    "agent_1": _mirror(_AGENT),
    "panneau_0": [(x + PANELS[0][0], y + PANELS[0][1]) for x, y in ((-0.41, -0.32), (0.41, -0.32), (0.41, 0.32), (-0.41, 0.32))],
    "panneau_1": [(x + PANELS[1][0], y + PANELS[1][1]) for x, y in ((-0.41, -0.32), (0.41, -0.32), (0.41, 0.32), (-0.41, 0.32))],
}
CONE_R = 0.27
# les plots (x, y monde) : trois de chaque côté du trou, le trou devant la route de la berline
CONES = [(X_GAP + dx, y) for dx, y in ((2.6, 123.1), (2.1, 123.3), (1.6, 123.4), (-1.6, 123.4), (-2.1, 123.3), (-2.6, 123.1))]
GAP = (X_GAP, 123.3)               # le milieu du trou des plots
CONE_LINE = min(y for _, y in CONES) - CONE_R

# les caisses de livraison au bord du trottoir de droite, que la berline frôle dans sa feinte (scene_b les pose ;
# les voitures garées de gauche sont retirées de la voie de la patrouille 1)
CRATES = (2.05, 3.05, 104.5, 107.1)        # x0, x1, y0, y1 (piles de palettes et cageots)

# les flaques (x, y monde, demi-largeur en x, allongement en y) : sur la ligne de la berline (la gerbe de la
# feinte, celle d'avant les plots) et sous la caméra quand elle rase le sol ; jamais une large dans l'axe de la
# caméra devant la berline (en miroir sous le ciel noir, elle ouvrait un trou au bas du cadre) : près de l'axe,
# 35 cm au plus ; aucune entre y PUDDLE_FREE à moins de 1 m de la route de la caméra (au ras du sol, elle y
# reflétait rampes et phares en taches blanches sous la berline) : celle de l'arrêt à gauche de l'objectif, celle
# du trottoir à droite ; scene_b les pose, wheel_hits() dit quand une roue y passe
PUDDLE_FREE = (116.0, 130.0)
PUDDLES = [("flaque_entree", -1.05, 97.5, 0.55, 2.4), ("flaque_feinte", 1.15, 103.6, 0.55, 2.2),
           ("flaque_axe", -0.75, 109.5, 0.35, 2.0), ("flaque_basse_0", -1.05, 112.8, 0.35, 1.9),
           ("flaque_basse_1", 0.35, 114.9, 0.35, 1.7),
           ("flaque_arret", -2.3, 118.9, 0.4, 1.4), ("flaque_trottoir", 3.2, 117.0, 0.5, 2.6)]

# les faisceaux des deux patrouilles du barrage sur les façades devant lui : × BEAM_GAIN jusqu'à l'image 22,
# normaux à l'image 36 (la berline cache le barrage au début : ce sont les murs qui battent)
BEAM_GAIN, BEAM_FADE = 2.5, (22, 36)

# --- la patrouille 1 (celle de P2) : dans la voie de gauche (CHASE_X), son centre CHASE_AHEAD devant celui de la
# berline à l'image 1, CHASE_DV moins vite qu'elle : elle a déjà levé le pied à la fin de P2. Elle freine ensuite
# (CHASE_BRAKE m/s² au plus, amené en smoothstep sur CHASE_LET : à-coup ≤ 12 m/s³) : elle sait que le piège est
# devant ; elle recule dans le cadre, sa rampe allumée à gauche, puis sort par le bas à gauche ; elle reste dans sa
# voie et l'avant de sa caisse reste avant les panneaux du barrage. 1,5 m au moins entre sa caisse et celle de la
# berline. Les voitures garées de sa voie sont retirées (scene_b.PARKED)
CHASE_X, CHASE_AHEAD, CHASE_DV = -3.05, 7.0, 6.0
CHASE_HALF = (2.6, 0.96)           # demi-longueur et demi-largeur de sa caisse (relevées sur scene-b.blend)
CHASE_BRAKE, CHASE_LET = 7.0, (M.t_of(-21), M.t_of(1))
CHASE = (CHASE_X, CHASE_AHEAD, 0.0)    # (x, avance sur la berline, cap) à l'image 1, pour scene_b
_CHASE = M.Profile(V0 - CHASE_DV, lambda t: -CHASE_BRAKE * M.smoothstep(CHASE_LET[0], CHASE_LET[1], t), vmin=0.0)


def chase_pos(t):
    return CHASE_X, Y_START + CHASE_AHEAD + _CHASE.s(t)


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


# --- le phare, loin au-delà du pont, à droite du pylône (lieux.phare_lointain, pas encore posé par scene_b : ses
# arguments viendront avec le nouveau phare) : à 600 m de l'image 1, PHARE_ECART à droite de l'axe de la rue (le
# pylône, dans l'axe, couvre 2° de part et d'autre), PHARE_DEG de haut, son pied à PHARE_Z ; PHARE_AT, le milieu de
# sa lanterne, pour motion.py mesure --v3 (lieux.PHARE_H 17,9 m du pied au chapeau, lieux.PHARE_FEU 16,8 m)
PHARE_ORIGINE, PHARE_ECART, PHARE_DEG, PHARE_DIST, PHARE_Z = (0.0, 65.0, 0.0), 3.3, 1.8, 600.0, 4.0
_PH_S = PHARE_DIST * math.tan(math.radians(PHARE_DEG)) / 17.9
PHARE_AT = (PHARE_ORIGINE[0] + math.sin(math.radians(PHARE_ECART)) * PHARE_DIST,
            PHARE_ORIGINE[1] + math.cos(math.radians(PHARE_ECART)) * PHARE_DIST, PHARE_Z + 16.8 * _PH_S)


# les plots et les panneaux du barrage, pour motion.py mesure --v3 : (x, y, rayon)
POSTS = [(x, y, CONE_R) for x, y in CONES] + [(x, y, 0.5) for x, y in PANELS]


# --- les agents : deux attitudes, pour qu'ils ne soient plus deux copies, et aucun ne vise l'objectif. L'agent 0
# (à droite de la berline, du côté de sa feinte) vise debout et tire (un éclair d'une image), la dernière fois à
# l'image 34 (l'image où l'on retient son souffle) ; l'agent 1 (à gauche) fait « stop », le bras tendu paume
# ouverte, l'arme basse, et ne tire pas. Puis tous deux plongent derrière leur portière
SHOTS = {0: (16, 22, 28, STILL_FRAME)}
# les poses des agents (lieux.officer_rig, lab/cast_people.pose_officer) : (image, pose), puis à couvert
COVER = {0: ((1, "aim"), (STILL_FRAME + 1, "aim"), (STILL_FRAME + 4, "crouch")),
         1: ((1, "stop"), (STILL_FRAME + 2, "stop"), (STILL_FRAME + 5, "crouch"))}


def firing(k, frame):
    return frame in SHOTS[k]


# --- la caméra (découpage v3.1, A : le cadre de poursuite commun) : à CAM_Z de haut tout le plan, CAM_D derrière
# le centre de la berline, au 24 mm. Elle roule CAM_SIDE à gauche de sa route au début (la patrouille 1 dans le
# cadre) et rejoint sa trace sur T_AXIS (smootherstep), avant les plots : elle passe le barrage au-dessus des plots
# et des capots, entre les deux patrouilles. Elle reprend l'écart latéral de la berline avec CAM_LAG de retard (dans
# le changement de file, elle passe un peu à l'extérieur). Le lacet vise la berline, décalé de BIAS0 au début ; le
# site est fixe : le centre de la berline à CENTER_Y depuis le haut. Pas de tremblé écrit (celui de l'opérateur
# est réglé par motion.py). À la dernière image, devant, le quai, le pont qui monte et le pylône.
LENS = 24.0
CAM_Z, CAM_D = 2.4, 7.5
CAM_SIDE, T_AXIS = -1.45, (M.t_of(2), M.t_of(42))
CAM_LAG = 0.12
BIAS0 = 0.5                        # degrés : le lacet un peu à gauche au début (rien à la fin)
CENTER_Y = 0.58


def cam_y(t):
    return hero_pos(t)[1] - CAM_D


def cam_z(t):
    return CAM_Z


def cam_x(t):
    """Derrière la berline : sa route avec CAM_LAG de retard, CAM_SIDE à sa gauche au début, dans sa trace ensuite."""
    lat = lateral(Y_START + HERO.s(max(0.0, t - CAM_LAG)))
    return lat + CAM_SIDE * (1.0 - smoother(T_AXIS[0], T_AXIS[1], t))


def _yaw(t, x, y):
    hx, hy = hero_pos(t)
    return 180.0 + math.degrees(math.atan2(hx - x, hy - y)) + BIAS0 * (1.0 - smoother(T_AXIS[0], T_AXIS[1], t))


def _solve_pitch():
    """Le site qui met le milieu de la boîte de la berline à CENTER_Y depuis le haut à la première image."""
    x, y = cam_x(0.0), cam_y(0.0)
    hx, hy = hero_pos(0.0)
    lo, hi = -30.0, 10.0
    for _ in range(50):
        mid = (lo + hi) / 2
        m = M.hero_screen((x, y, CAM_Z, _yaw(0.0, x, y), mid, 0.0, LENS), hx, hy, 0.0, hero_heading(0.0))
        if m["v"] > CENTER_Y:      # trop bas dans le cadre : relever... baisser le site
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


PITCH = _solve_pitch()


def camera_rail(t):
    """La caméra : (x, y, z, lacet, site, roulis, focale)."""
    x, y = cam_x(t), cam_y(t)
    return (x, y, CAM_Z, _yaw(t, x, y), PITCH, 0.0, LENS)


def camera(t):
    return camera_rail(t)


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
            polys["patrouille_1"] = _car_box(*chase_pos(t), CHASE[2], *CHASE_HALF)
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
