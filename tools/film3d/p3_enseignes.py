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
# Le plan P3 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md, « P3 — Le barrage, de dos », et le
# découpage v3.1) : la berline sort du rond-point dans la rue des enseignes, fonce vers le barrage, deux patrouilles
# nez à nez, les plots, un agent qui tire, l'autre qui fait « stop » ; elle passe le trou des plots en accélérant.
# La caméra de poursuite commune (v3.1) la suit de dos : 2,4 m de haut, 7,5 m derrière, au 24 mm, tout le plan ; elle
# passe le barrage à sa suite, au-dessus des plots et des capots. scene_b.plan_P3 n'en lit que les fonctions du temps
# et les positions ; motion.py en tire roues, braquage et transfert de masse.
#
# La berline et le bras de caméra se lisent dans le parcours unique (parcours.py), fenêtre « P3 » : P2 → P3 n'est pas
# une coupe d'espace mais l'image suivante de la même conduite. Elle entre avec un reste de virage (cap ≈ −2° qui
# revient à 0, la caisse en roulis, le bras en panoramique), accélère sans feux stop et passe le milieu du trou des
# plots à l'image ancre du module (PC.ANCHOR) ; rien du chemin, de la durée ni de la vitesse n'est écrit ici.
#
# Repère : celui de scene-b.blend après scene_b.to_world (la berline roule vers +y, y = s, x positif à sa droite ;
# le barrage à y = 126). t = 0 à la première image ; FRAMES images, 24 par seconde.
#
# L'émotion visée : le piège. Image 1 : le raccord de P2, la patrouille 1 au bord gauche, rampe allumée, qui freine
# (elle sait que le piège est devant) et lâche ; le barrage au fond de la rue au-dessus du toit. La berline remet les
# gaz, les agents tirent et font « stop », plongent derrière leurs portières ; elle passe, la caméra à sa suite entre
# les deux patrouilles ; à la dernière image, lancée, le quai, le pont qui monte et son pylône devant elle.
import math

import motion as M
import ouv_avenue as OUV
import parcours as PC

SENSOR_H, ASPECT = 36.0, 9.0 / 16.0   # capteur de 36 mm sur la hauteur, cadre 9:16

FRAMES = dict(PC.SHOTS)["P3"]
V3 = True                          # découpage v3 : les plafonds de caméra des tests s'appliquent
V31 = True                         # découpage v3.1 : cadre de poursuite commun, conduite sur route mouillée
F0 = 1
T_END = (FRAMES - 1) / M.FPS
HERO = PC.hero("P3")               # la fenêtre du parcours, en image du plan (1 = la première)


def _f(t):
    return F0 + t * M.FPS


# --- la berline (caisse : 4,89 × 1,88 m, le centre au milieu, 1,45 m de haut) : celle du parcours, définie avant la
# première image (les ressorts de M.sample) et après la dernière
HALF_L, HALF_W, HEIGHT = 2.44, 0.94, 1.45


def hero_pos(t):
    return HERO["pos"](_f(t))


def hero_heading(t):
    """Le cap de la caisse (degrés, 0 = +y, positif à gauche) : celui du parcours."""
    return HERO["heading"](_f(t))


def hero_steer(t):
    return HERO["steer"](_f(t))


def hero_speed(t):
    return HERO["speed"](_f(t))


def _accel(t):
    """L'accélération longitudinale du parcours (m/s²)."""
    return HERO["along"](_f(t))


def brake_windows():
    """Les fenêtres (première, dernière image) des feux stop : celles du parcours (aucune ici)."""
    return PC.brake_windows("P3")


def hero_box(t):
    """Les quatre coins de la caisse au sol à l'instant t."""
    x, y = hero_pos(t)
    h = math.radians(hero_heading(t))
    fx, fy = -math.sin(h), math.cos(h)       # l'avant (cap 0 : +y, positif vers -x)
    rx, ry = fy, -fx                         # la droite de la voiture
    return [(x + fx * a * HALF_L + rx * b * HALF_W, y + fy * a * HALF_L + ry * b * HALF_W)
            for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


def _frame_at_y(y, lo=F0 - 24.0, hi=F0 + FRAMES + 24.0):
    """L'image (décimale) où le centre de la berline passe l'ordonnée y."""
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if HERO["pos"](mid)[1] < y else (lo, mid)
    return (lo + hi) / 2


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
X_GAP = 0.35                       # le milieu du trou des plots (décor : la berline y passe, PC.ANCHOR)
CONES = [(X_GAP + dx, y) for dx, y in ((2.6, 123.1), (2.1, 123.3), (1.6, 123.4), (-1.6, 123.4), (-2.1, 123.3), (-2.6, 123.1))]
GAP = (X_GAP, 123.3)               # le milieu du trou des plots
CONE_LINE = min(y for _, y in CONES) - CONE_R

# les caisses de livraison au bord du trottoir de droite, que la berline frôle en sortant du rond-point (scene_b les
# pose ; les voitures garées de gauche sont retirées de la voie de la patrouille 1)
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


# --- la patrouille 1 (celle de P2) : elle entre comme elle sort de P2, à gauche de la berline, sur une route
# parallèle à la sienne (la même sortie de rond-point, CHASE_SIDE plus à gauche), son centre CHASE_AHEAD devant
# celui de la berline, CHASE_DV plus vite qu'elle, en freinant déjà à CHASE_A0 (elle sait que le piège est devant).
# Hypothèse en attendant la sortie de P2 portée : en fin de P1 elle est 3,45 m à gauche et 3,0 m devant, à la vitesse
# de la berline. La rue de 8 m ne laisse que CHASE_SIDE (sa caisse à 0,2 m de la bordure, 1,27 m d'air avec la
# berline). 3 m devant à 13,2 m/s, elle ne s'arrête avant les panneaux du barrage avec CHASE_AIR d'air que si elle
# freine déjà à fond à la coupe (à l'accélération de la berline, il lui faudrait 17,2 m : elle n'en a que 12,6) :
# P2 installe le freinage (à-coup CHASE_JERK jusqu'à CHASE_BRAKE, 0,68 s avant la coupe), P3 le tient, puis le
# relâche pour finir arrêtée. Rampe dans le cadre à gauche jusqu'à l'image 19, elle sort par la gauche à mi-hauteur
# et s'arrête dans sa voie avant les panneaux. Les voitures garées de sa voie sont retirées (scene_b.PARKED)
CHASE_SIDE, CHASE_AHEAD, CHASE_DV = 3.2, 3.0, 0.0
CHASE_BRAKE, CHASE_JERK = 6.95, 11.0
CHASE_A0 = -CHASE_BRAKE            # son accélération à l'image 1 (_accel(0) : elle n'a pas encore freiné)
CHASE_AIR = 1.2                    # m d'air au moins entre l'avant de sa caisse arrêtée et les panneaux
CHASE_HALF = (2.6, 0.96)           # demi-longueur et demi-largeur de sa caisse (relevées sur scene-b.blend)
_TB = M.t_of(F0)


def _chase_profile():
    """Les sommets (t, accélération) de son freinage, linéaire entre eux (à-coup CHASE_JERK) : l'accélération de la
    berline jusqu'à ce qu'elle se mette à freiner (avant l'image 1 si CHASE_A0 l'exige), CHASE_A0 à l'image 1,
    CHASE_BRAKE, tenu, relâché pour finir à vitesse nulle."""
    ah, v0 = _accel(_TB), hero_speed(_TB) + CHASE_DV
    ts = _TB - (ah - CHASE_A0) / CHASE_JERK                      # elle se met à freiner
    tf = ts + (ah + CHASE_BRAKE) / CHASE_JERK                    # le freinage plein
    t3 = CHASE_BRAKE / CHASE_JERK
    # la vitesse à tf, puis la tenue qui la ramène à zéro à la fin du relâchement
    vf = v0 + ((CHASE_A0 - CHASE_BRAKE) / 2 * (tf - _TB) if tf >= _TB else CHASE_BRAKE * (_TB - tf))
    hold = (vf - 0.5 * CHASE_BRAKE * t3) / CHASE_BRAKE
    return [(ts, ah), (tf, -CHASE_BRAKE), (tf + hold, -CHASE_BRAKE), (tf + hold + t3, 0.0)]


_CP = _chase_profile()
CHASE_STOP = _CP[-1][0]            # l'instant où elle s'arrête


def chase_accel(t):
    """Son accélération (m/s²) : celle de la berline avant de freiner, son freinage ensuite."""
    if t <= _CP[0][0]:
        return _accel(t)
    for (ta, aa), (tb, ab) in zip(_CP, _CP[1:]):
        if t <= tb:
            return aa + (ab - aa) * (t - ta) / (tb - ta)
    return 0.0


# sa route : celle de la berline décalée de CHASE_SIDE à gauche, lue par ordonnée sur la fenêtre du parcours
_PATH = [HERO["pos"](F0 + k / 4.0) for k in range(-4 * 72, 4 * (FRAMES + 24))]


def _path_x(y):
    if y <= _PATH[0][1]:
        return _PATH[0][0]
    if y >= _PATH[-1][1]:
        return _PATH[-1][0]
    lo, hi = 0, len(_PATH) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        lo, hi = (mid, hi) if _PATH[mid][1] <= y else (lo, mid)
    (x0, y0), (x1, y1) = _PATH[lo], _PATH[hi]
    return x0 + (x1 - x0) * (y - y0) / (y1 - y0)


def _path_cos(y, h=0.05):
    dx = _path_x(y + h) - _path_x(y - h)
    return 2 * h / math.hypot(dx, 2 * h)


_CT0, _CDT = min(-1.0, _CP[0][0] - 0.75), 1.0 / 480.0


def _chase_table():
    """[(y, vitesse)] au 1/480 s depuis _CT0 : la vitesse intégrée de chase_accel, recalée pour valoir celle de la
    berline plus CHASE_DV à _TB ; y le long de sa route (dy = v cos du cap de la route), recalé pour qu'elle soit
    CHASE_AHEAD devant la berline à _TB."""
    k = int(round((_TB - _CT0) / _CDT))
    v = hero_speed(_CT0)
    for _ in range(2):                     # la vitesse de départ qui donne la bonne vitesse à _TB
        w = v
        for i in range(k):
            t = _CT0 + i * _CDT
            w += 0.5 * (chase_accel(t) + chase_accel(t + _CDT)) * _CDT
        v += hero_speed(_TB) + CHASE_DV - w
    y, out, t = hero_pos(_CT0)[1] + CHASE_AHEAD, [], _CT0
    while t < max(T_END, CHASE_STOP) + 1.5:
        out.append((y, v))
        v1 = 0.0 if t + _CDT >= CHASE_STOP else max(0.0, v + 0.5 * (chase_accel(t) + chase_accel(t + _CDT)) * _CDT)
        y += 0.5 * (v + v1) * _CDT * _path_cos(y)
        v, t = v1, t + _CDT
    dy = hero_pos(_TB)[1] + CHASE_AHEAD - out[k][0]
    return [(y + dy, v) for y, v in out]


_CT = _chase_table()


def _chase_at(t):
    u = max(0.0, (t - _CT0) / _CDT)
    k = min(len(_CT) - 2, int(u))
    w = min(1.0, u - k)
    return tuple(a + (b - a) * w for a, b in zip(_CT[k], _CT[k + 1]))


def chase_speed(t):
    return _chase_at(t)[1]


def chase_pos(t):
    y = _chase_at(t)[0]
    return _path_x(y) - CHASE_SIDE, y


def chase_heading(t, h=0.05):
    """Le cap de sa route là où elle est (degrés, 0 = +y, positif à gauche)."""
    y = chase_pos(t)[1]
    return M.heading_of(_path_x(y + h) - _path_x(y - h), 2 * h)


CHASE = (chase_pos(0.0)[0], CHASE_AHEAD, chase_heading(0.0))   # (x, avance sur la berline, cap) à l'image 1
CHASE_FRONT_STOP = chase_pos(CHASE_STOP + 1.0)[1] + CHASE_HALF[0]   # l'avant de sa caisse, arrêtée


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
    leur grand axe à 24° de la rue (relevé sur _PATROL), et la patrouille 1 (arrêtée en fin de plan)."""
    return {"patrol_a": lambda t: -24.0, "patrol_b": lambda t: 24.0, "patrol_c": chase_heading}


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
# (à droite de la berline) vise debout et tire (un éclair d'une image, toutes les SHOT_EVERY images), la dernière
# fois à STILL_FRAME (l'image où l'on retient son souffle) ; l'agent 1 (à gauche) fait « stop », le bras tendu paume
# ouverte, l'arme basse, et ne tire pas. Puis tous deux plongent derrière leur portière. Tout se compte depuis F_GAP,
# l'image où le centre de la berline passe le milieu du trou des plots (l'ancre du parcours) : la dernière balle
# STILL_BEFORE images avant, les agents à couvert avant que l'avant de la berline n'arrive à leur hauteur
F_GAP = _frame_at_y(123.3)
STILL_BEFORE, SHOT_EVERY = 5, 6
STILL_FRAME = int(round(F_GAP)) - STILL_BEFORE
T_STILL = M.t_of(STILL_FRAME)
SHOTS = {0: tuple(STILL_FRAME - SHOT_EVERY * k for k in (3, 2, 1, 0))}
# les poses des agents (lieux.officer_rig, lab/cast_people.pose_officer) : (image, pose), puis à couvert
COVER = {0: ((1, "aim"), (STILL_FRAME + 1, "aim"), (STILL_FRAME + 4, "crouch")),
         1: ((1, "stop"), (STILL_FRAME + 2, "stop"), (STILL_FRAME + 5, "crouch"))}


def firing(k, frame):
    return frame in SHOTS[k]


# --- la caméra (découpage v3.1, A : le cadre de poursuite commun) : le bras du parcours (parcours.camera : 7,5 m
# derrière le centre de la berline le long du cap filtré du bras, 0,3 m à gauche, 2,4 m de haut), au 24 mm, visé
# comme les autres plans de dos (ouv_avenue.aim : le centre de la boîte de la berline à CAM_U, CAM_V depuis le haut).
# Il sort du rond-point en panoramique et se cale dans l'axe de la rue ; il passe le barrage au-dessus des plots et
# des capots, entre les deux patrouilles. Pas de tremblé écrit (celui de l'opérateur est réglé par motion.py). À la
# dernière image, devant, le quai, le pont qui monte et le pylône.
LENS = OUV.LENS
CAM_Z, CAM_D = PC.CAM_Z, PC.CAM_BACK
CAM_U, CAM_V = OUV.CAM_U, OUV.CAM_V
CENTER_Y = CAM_V


def cam_x(t):
    return PC.camera("P3", _f(t))[0]


def cam_y(t):
    return PC.camera("P3", _f(t))[1]


def cam_z(t):
    return CAM_Z


def aim(x, y, z, hx, hy, heading, u=CAM_U, v=CAM_V):
    """ouv_avenue.aim, la boîte de la berline prise à son cap (elle sort du rond-point de biais : visée à cap nul,
    le centre de sa boîte glissait de 49 à 50 % sur les dix premières images)."""
    cam = list(OUV.aim(x, y, z, hx, hy, u, v))
    for _ in range(3):
        b0 = M.hero_screen(tuple(cam), hx, hy, 0.0, heading)
        bu = M.hero_screen((x, y, z, cam[3] + 0.1, cam[4], 0.0, LENS), hx, hy, 0.0, heading)
        bv = M.hero_screen((x, y, z, cam[3], cam[4] + 0.1, 0.0, LENS), hx, hy, 0.0, heading)
        cam[3] += 0.1 * (u - b0["u"]) / (bu["u"] - b0["u"])
        cam[4] += 0.1 * (v - b0["v"]) / (bv["v"] - b0["v"])
    return tuple(cam)


def camera_rail(t):
    """La caméra : (x, y, z, lacet, site, roulis, focale)."""
    x, y = hero_pos(t)
    return aim(*PC.camera("P3", _f(t)), x, y, hero_heading(t))


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
            polys["patrouille_1"] = _car_box(*chase_pos(t), chase_heading(t), *CHASE_HALF)
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
        kx, ky = chase_pos(t)
        r = project(c, (kx, ky, 1.62)) or (float("nan"), float("nan"))
        print(f"image {f:2d} : berline ({x:5.2f}, {y:6.1f}) {hero_speed(t) * 3.6:4.0f} km/h cap {hero_heading(t):5.1f}° | "
              f"caméra ({c[0]:5.2f}, {c[1]:6.1f}, {c[2]:4.2f}) lacet {c[3]:6.1f} site {c[4]:4.1f} à {y - c[1]:4.1f} m | "
              f"cadre x {50 * (u0 + 1):3.0f}–{50 * (u1 + 1):3.0f} % y {100 * v0:3.0f}–{100 * v1:3.0f} % centre "
              f"({50 * (uc + 1):3.0f}, {100 * (1 - vc):3.0f} du haut) | trou ({50 * (g[0] + 1):3.0f}, {100 * g[1]:3.0f}) | "
              f"patrouille 1 ({kx:5.2f}, {ky:6.1f}) {chase_speed(t) * 3.6:3.0f} km/h {chase_accel(t):+5.1f} m/s², "
              f"rampe ({50 * (r[0] + 1):3.0f}, {100 * (1 - r[1]):3.0f} du haut)")
    print(f"agents : F_GAP {F_GAP:.2f}, tirs {SHOTS}, à couvert {COVER} ; patrouille 1 arrêtée à "
          f"{CHASE_STOP * M.FPS + F0:.1f}, avant à y {CHASE_FRONT_STOP:.2f} (panneaux à "
          f"{min(y for _, y in PANELS) - 0.32:.2f})")
    for n, (d, f) in sorted(clearances().items(), key=lambda kv: kv[1][0]):
        print(f"  {n:10s} {d:5.2f} m (image {f:.2f})")
    for n, (d, f) in sorted(cam_clearances().items(), key=lambda kv: kv[1][0])[:4]:
        print(f"  caméra–{n:10s} {d:5.2f} m (image {f:.2f})")
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
