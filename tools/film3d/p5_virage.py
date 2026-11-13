# Le plan P5 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md, « P5 — L'hélicoptère fond sur le
# quai, elle glisse dessous », sa section v3.1 qui prime, et la feuille de route du parcours, fiche P5) : la berline
# arrive du pont sur les freins, vire à droite sur un cercle de 22 m en glissant d'une quinzaine de degrés qui monte
# et se résorbe, et sort vers la jetée ; la caméra de poursuite commune (24 mm, 2,4 m, 7,5 m derrière, 0,3 m à
# gauche) la suit sur le cap de sa vitesse ; la patrouille 1, à sa portière gauche, file tout droit et s'arrête
# devant les séparateurs ; la meute la suit dans son virage, derrière la caméra ; l'hélicoptère arrive de l'est et
# plonge devant elle, faisceau sur elle. scene_e.py n'en lit que les fonctions du temps ; motion.py en tire roues,
# braquage et transfert de masse.
#
# La berline et le bras de la caméra se lisent dans le parcours unique (parcours.py), fenêtre « P5 », posée dans la
# scène E par son ancre (la droite du pont, 20 m avant le virage) : rien du chemin n'est écrit ici. Durée, vitesses,
# glisse, feux stop, centre du virage, traces, flaque et hélicoptère en découlent ; si la route change, le plan suit.
#
# Repère du port (celui de lieux.py) : la voie du pont sur l'axe x = 0, la berline sur x = 5,25 vers +y ; la voie du
# quai (axe y = 70, bords 63 et 77) vers +x ; la file de séparateurs qui ferme l'axe en y = 80,6. t = 0 à la première
# image, 24 par seconde.
import math

import motion as M
import parcours as PC

V3 = True
V31 = True                    # découpage v3.1 : cadre de poursuite commun, voiture vraie (motion.py mesure --v3)
FRAMES = dict(PC.SHOTS)["P5"]
F0 = 1
T_END = (FRAMES - 1) / M.FPS

CAR_DIMS = (4.9, 1.8, 1.45)   # longueur, largeur, hauteur de la berline (à quelques centimètres)
HERO = PC.hero("P5")          # la fenêtre du parcours, en image du plan (1 = la première), décimale admise


def _f(t):
    return F0 + t * M.FPS


def hero_pos(t):
    """La berline (scène E), t en s depuis la première image ; définie avant elle (les ressorts de M.sample)."""
    return HERO["pos"](_f(t))


def hero_heading(t):
    """Le cap de la caisse (convention de lieux.put)."""
    return HERO["heading"](_f(t))


def hero_steer(t):
    return HERO["steer"](_f(t))


def hero_speed(t):
    return HERO["speed"](_f(t))


def travel_bearing(t):
    """Le cap de la vitesse de la berline (degrés à droite de +y)."""
    return -HERO["travel"](_f(t))


def hero_slip(t):
    """La glisse de la caisse (degrés, négative : l'avant pointe à droite de sa route, l'arrière dehors)."""
    return HERO["slip"](_f(t))


def brake_windows():
    """Les fenêtres des feux stop (images du plan) : celles du parcours."""
    return PC.brake_windows("P5")


def _turn_center():
    """Le centre du cercle nominal du virage dans la scène : la droite du pont (l'ancre, 20 m avant le début de
    l'arc) prolongée jusqu'au début de l'arc, puis R5 à sa droite."""
    to_scene, _ = PC.placer("P5")
    x, y, cap, _ = PC.ROUTE.at(PC.S_ARC5 - 20.0)
    h = math.radians(cap)
    fx, fy = -math.sin(h), math.cos(h)
    return to_scene(x + 20.0 * fx + PC.R5 * fy, y + 20.0 * fy - PC.R5 * fx)


TURN_C = _turn_center()       # (27,25 ; 55,07) : la berline y tourne à 21,7 m de lui
TURN_R = PC.R5
_SLIPS = [(abs(hero_slip(M.t_of(f))), f) for f in range(F0, F0 + FRAMES)]
SLIP_PEAK = max(_SLIPS)[1]    # l'image du plus fort de la glisse
SKID_FRAMES = (min(f for s, f in _SLIPS if s > 8.0), max(f for s, f in _SLIPS if s > 8.0))   # la gomme marque


# --- la patrouille 1 (indice 0) arrive du pont à la portière gauche de la berline, dans l'état où P4 la laisse
# (PATROL_IN) ; déjà sur les freins, elle voit l'axe fermé, ne prend pas le virage : elle file tout droit, le nez
# rentré de quelques degrés (elle sous-vire, les roues braquées, la caisse qui pivote à peine), et s'arrête en douceur
# devant les séparateurs (le freinage relâché à la fin, à-coup borné). Le cadre la montre entière à gauche de la
# berline (PATROL_SEEN).
# PATROL_IN : l'état de sortie de P4 (P4/48 prolongé d'une image = P5/1), à confirmer par le portage de P4 : à gauche
# de la berline (m), son avance (m, centre contre centre, le long de la voie), son freinage (m/s²). Sa vitesse s'en
# déduit : celle qui l'arrête, freinage tenu, le nez PATROL_STOP m avant les séparateurs.
PATROL_IN = dict(left=3.1, lead=7.0, decel=6.4)
PATROL_STOP = 5.0
PATROL_RELEASE = 0.9          # s : le freinage relâché jusqu'à l'arrêt (à-coup 7 m/s³)
BARRIER_Y, BARRIER_X = 80.6, (-7.6, 7.6)    # la file de séparateurs (scene_e.build_barrier)
PATROL_X = hero_pos(0.0)[0] - PATROL_IN["left"]
PATROL_Y0 = hero_pos(0.0)[1] + PATROL_IN["lead"]


def _patrol_profile(v0):
    d = PATROL_IN["decel"]
    t1 = v0 / d - PATROL_RELEASE / 2

    def acc(t):
        return -d if t < t1 else -d * max(0.0, 1.0 - (t - t1) / PATROL_RELEASE)
    return M.Profile(v0, acc, t0=-2.0, t1=T_END + 3.0)


def _patrol_v0():
    """La vitesse d'entrée qui l'arrête le nez à PATROL_STOP m des séparateurs (bissection)."""
    want = BARRIER_Y - 0.35 - PATROL_STOP - M.CAR_DIMS["patrol"][0] / 2 - PATROL_Y0
    lo, hi = 5.0, 30.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if _patrol_profile(mid).s(T_END + 3.0) > want else (mid, hi)
    return (lo + hi) / 2


PATROL_V0 = _patrol_v0()      # 17,58 m/s : elle a pris la tête et freine plus fort que la berline
_PATROL = _patrol_profile(PATROL_V0)


class PATROL:
    """La patrouille 1 : pos(t), speed(t), heading(t) (sa route : tout droit vers +y)."""

    @staticmethod
    def pos(t):
        return PATROL_X, PATROL_Y0 + _PATROL.s(t)

    @staticmethod
    def speed(t):
        return _PATROL.v(t)

    @staticmethod
    def heading(t):
        return 0.0


PATROL_YAW, PATROL_YAW_F = -9.0, (24.0, 48.0)       # le nez qui rentre à droite (degrés, de l'image à l'image)
PATROL_SEEN = (1, 23)                               # les images où elle est entière dans le cadre (test_motion)


def patrol_heading(t):
    """Le cap de la patrouille 1 : tout droit, plus le nez rentré du sous-virage."""
    return PATROL.heading(t) + PATROL_YAW * M.smoothstep(*PATROL_YAW_F, _f(t))


def tracks_heading():
    """{nom: cap(t)} des véhicules dont le cap ne suit pas la vitesse (la patrouille 1 sous-vire)."""
    return {"patrol_0": patrol_heading}


# --- la meute : elle descend la rampe et suit la berline dans son virage, à la file, derrière la caméra (ses phares
# font l'ombre de la berline). Chacune roule sur la route de la berline avec un retard fixe (`delay`, s), décalée de
# `left` m à sa gauche : les vitesses et les accélérations de la berline, sous les plafonds des patrouilles.
# PACK_IN : l'état de sortie de P4, à confirmer par son portage ; elles entrent dans P6 comme elles sortent d'ici
# (pack_state).
PACK_IN = [("patrol", 1.6, 0.0), ("van", 2.5, 0.0), ("patrol", 3.4, 0.0)]
PACK_START = [("patrol", PATROL_X, PATROL_Y0)] + [(k, *hero_pos(-d)) for k, d, _ in PACK_IN]


def _follow(delay, left):
    def pos(t):
        x, y = hero_pos(t - delay)
        if not left:
            return x, y
        a = math.radians(HERO["travel"](_f(t - delay)))
        return x - left * math.cos(a), y - left * math.sin(a)
    return pos


def pack_pos(i):
    if i == 0:
        return PATROL.pos
    _, d, left = PACK_IN[i - 1]
    return _follow(d, left)


def pack_state(i, t=T_END):
    """(x, y, cap, vitesse) d'un véhicule de la meute (scène E) à l'instant t : l'état qu'il porte dans P6."""
    pos = pack_pos(i)
    (vx, vy), _ = M.kinematics(pos, t)
    x, y = pos(t)
    return x, y, M.heading_of(vx, vy), math.hypot(vx, vy)


# --- ce que la berline longe (posé par scene_e.build_east, contrôlé par test_motion) : la chaîne pendue sur l'axe
# de la voie du pont, que la patrouille 1 frôle ; les caisses, rangées au bord sud du quai. La berline reste à 3 m au
# moins de tout objet posé. Plus de flaque sur la ligne des roues : la caméra, sur le bras commun, suit la route de la
# berline et la passait au bas du cadre à la fin du plan (et la lumière ne veut aucune flaque dans sa voie).
CHAIN_POSTS = [(0.0, 52.0), (0.0, 54.7), (0.0, 57.4), (0.0, 60.1)]
REAR_AXLE, TRACK = -1.45, 0.75          # l'essieu arrière (m devant le centre) et la demi-voie de la berline
SMOKE_CLEAR = 2.0             # m : une bouffée que la caméra frôlerait de plus près (elle suit la route) est omise
SMOKE_DRIFT = -0.8            # m : la fumée dérive vers l'intérieur du virage (le vent) ; dehors, la caméra la traversait


def wheel_at(t, side, axle=REAR_AXLE):
    """Le point de contact d'une roue (side : -1 gauche, +1 droite) à l'instant t."""
    x, y = hero_pos(t)
    h = math.radians(hero_heading(t))
    fx, fy = -math.sin(h), math.cos(h)
    return x + fx * axle + fy * TRACK * side, y + fy * axle - fx * TRACK * side


def smoke_keep(puffs, drift=SMOKE_DRIFT, grow=10):
    """Les bouffées de motion.smoke_puffs que la caméra ne traverse pas : elle suit la route de la berline (le bras
    commun la traverse presque toute) ; à moins de SMOKE_CLEAR m, la bouffée voilait le bas du cadre."""
    out = []
    for f, x, y, s in puffs:
        ox, oy = x - TURN_C[0], y - TURN_C[1]
        n = math.hypot(ox, oy) or 1.0
        near = float("inf")
        for g in range(f, F0 + FRAMES):
            e = 1 - (1 - min(1.0, (g - f) / grow)) ** 2
            cx, cy, _ = cam_pos(M.t_of(g))
            near = min(near, math.hypot(x + ox / n * drift * e - cx, y + oy / n * drift * e - cy))
        if near >= SMOKE_CLEAR:
            out.append((f, x, y, s))
    return out


CRATES_AT = (19.5, 64.8)
CRATES_BOX = (18.45, 20.6, 63.8, 65.45)     # l'emprise des caisses et des palettes (x0, x1, y0, y1)
# ce que la caméra ne doit pas toucher (motion.plan_checks) : (x, y, rayon) des poteaux de la chaîne, des coins des
# caisses et des séparateurs, un tous les mètres
POSTS = ([(x, y, 0.13) for x, y in CHAIN_POSTS]
         + [(x, y, 0.1) for x in CRATES_BOX[:2] for y in CRATES_BOX[2:]]
         + [(BARRIER_X[0] + i, BARRIER_Y, 0.35) for i in range(int(BARRIER_X[1] - BARRIER_X[0]) + 1)])


def tracks():
    """{nom: pos(t)} de tous les véhicules du plan (pour vérifier les distances) ; la patrouille 1 en tête."""
    out = {"hero": hero_pos}
    for i, (kind, _, _) in enumerate(PACK_START):
        out[f"{kind}_{i}"] = pack_pos(i)
    return out


def aircraft():
    """{nom: pos(t) -> (x, y, z)} : l'hélicoptère, au milieu de sa cellule."""
    return {"heli": lambda t: (*heli(t)[:2], heli(t)[2] + HELI_BODY)}


# --- l'hélicoptère : il arrive de l'est au-dessus des piles de conteneurs (hors champ à droite), en vol d'avance
# (nez bas), vire sur la gauche et plonge devant la berline ; il finit en ralentissant, nez vers elle, HELI_END[1] m
# au-dessus du sol, HELI_END[0] m devant elle sur le cap de sa vitesse à la dernière image : le faisceau tombe sur
# elle et relie les deux dans le cadre final.
HELI_END = (24.0, 9.6)        # m devant elle, hauteur
HELI_BODY = 1.5               # le milieu de la cellule au-dessus de l'origine du modèle (mesuré à l'image)


def _heli_path():
    x, y = hero_pos(T_END)
    a = math.radians(travel_bearing(T_END))
    ex, ey = x + HELI_END[0] * math.sin(a), y + HELI_END[0] * math.cos(a)
    # l'arrivée : de l'est, la dernière tangente le long du quai, vers l'ouest
    return ((70.0, 40.0, 22.0), (64.0, 56.0, 21.0), (ex + 15.0, ey - 2.0, 14.0), (ex, ey, HELI_END[1]))


HELI_PATH = _heli_path()


def _bez(pts, u):
    w = ((1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3)
    return tuple(sum(wk * p[i] for wk, p in zip(w, pts)) for i in range(3))


def _heli_u(t):
    """L'avancement sur la trajectoire : vite au début, plus lent à la fin (il freine devant elle)."""
    u = min(1.0, max(0.0, t / T_END))
    return 1.0 - (1.0 - u) ** 1.6


def heli(t):
    """(x, y, z, cap, tangage, roulis) : le cap suit la route puis se tourne vers la berline, le nez bas tant
    qu'il avance vite, le roulis à gauche dans le virage."""
    u = _heli_u(t)
    x, y, z = _bez(HELI_PATH, u)
    x2, y2, _ = _bez(HELI_PATH, min(1.0, max(0.0, u + 0.02)))
    x1, y1, _ = _bez(HELI_PATH, min(1.0, max(0.0, u - 0.02)))
    head = M.heading_of(x2 - x1, y2 - y1) if (x2 - x1) or (y2 - y1) else 60.0
    hx, hy = hero_pos(t)
    want = M.heading_of(hx - x, hy - y)
    head = head + (M._unwrap(head, want) - head) * M.smoothstep(0.45, 0.95, t / T_END)
    pitch = -11.0 + 9.0 * M.smoothstep(0.45, 1.0, t / T_END)
    roll = -12.0 - 6.0 * M.smoothstep(0.1, 0.5, t / T_END) + 16.0 * M.smoothstep(0.55, 0.95, t / T_END)
    return x, y, z, head, pitch, roll


# --- la caméra : le bras commun du parcours (parcours.camera : 7,5 m derrière le centre de la berline sur le cap
# filtré de sa vitesse, 0,3 m à gauche, 2,4 m), 24 mm ; dans le virage à droite elle passe un peu à l'extérieur et la
# caisse en travers s'y lit de trois quarts arrière. Visée : le centre de la boîte de la berline à l'écran en x 50 %,
# y 58 % depuis le haut (la correction de visée lissée, _aim_table). Ni grue ni tremblé écrit.
LENS = 24.0
TAN_V = 18.0 / LENS           # demi-champ vertical (capteur de 36 mm sur la hauteur, cadre 9:16)
TAN_H = TAN_V * 9.0 / 16.0
CAM_BACK, CAM_Z, CAM_LEFT = PC.CAM_BACK, PC.CAM_Z, PC.CAM_LEFT
FRAME_X = 50.0                # % depuis la gauche : le centre de la boîte de la berline à l'écran
FRAME_Y = 58.0                # % depuis le haut (la convention des fiches)
TAB_DT = 1.0 / 240.0


def psi(t):
    """Le cap du bras (degrés à droite de +y)."""
    return -PC.cam_cap("P5", _f(t))


def cam_left(t):
    return CAM_LEFT


def cam_d(t):
    return math.hypot(CAM_BACK, cam_left(t))


# le sol sous la caméra, (x, y) -> (z, pente), posé par la scène (scene_e en ville unique : la rampe du pont, où la
# caméra de P5/1 roule encore) ; None : le terre-plein plat. Après l'avoir changé, appeler reset()
GROUND = None


def cam_pos(t):
    """(x, y, z) de la caméra : le bras du parcours, à sa hauteur au-dessus du sol (GROUND)."""
    x, y, z = PC.camera("P5", _f(t))
    return (x, y, z + GROUND(x, y)[0]) if GROUND else (x, y, z)


CAM = cam_pos(0.0)            # la caméra à la première image


def reset():
    """À appeler après avoir changé un réglage de la caméra (la table de visée est calculée une fois)."""
    global _AIM
    _AIM = None


def _aim_at(cx, cy, cz, x, y, fxp, fyp):
    """(lacet, site) qui mettent le point (x, y, mi-hauteur de la berline) à fxp % depuis la gauche, fyp % depuis le
    bas."""
    bearing = math.degrees(math.atan2(x - cx, y - cy))
    yaw = bearing - 180.0 - math.degrees(math.atan((fxp - 50.0) / 50.0 * TAN_H))
    elev = math.degrees(math.atan2(CAR_DIMS[2] / 2 - cz, math.hypot(x - cx, y - cy)))
    return yaw, elev - math.degrees(math.atan((fyp - 50.0) / 50.0 * TAN_V))


AIM_SMOOTH = 0.5              # s : la demi-largeur du lissage de la correction de visée
_AIM = None


def _aim_table():
    """La correction de visée (dx, dy en %) qui ramène le centre de la boîte de la berline à l'écran sur sa visée :
    la caisse vue de trois quarts ou en travers déborde de son centre. Calculée tous les TAB_DT s, puis lissée
    (moyenne glissante de ±AIM_SMOOTH s) : les coins extrêmes de la boîte changent d'une image à l'autre, la
    correction brute ferait des à-coups de visée."""
    global _AIM
    if _AIM is None:
        n0, n1 = int(-0.6 / TAB_DT), int((T_END + 0.6) / TAB_DT)
        raw = []
        for k in range(n0, n1 + 1):
            t = k * TAB_DT
            cx, cy, cz = cam_pos(t)
            x, y = hero_pos(t)
            want_x, want_y = _aim_want(t)
            yaw, pitch = _aim_at(cx, cy, cz, x, y, want_x, want_y)
            b = M.frame_box((cx, cy, cz, yaw, pitch, 0.0, LENS), {"x": x, "y": y, "heading": hero_heading(t)},
                            CAR_DIMS)
            raw.append((want_x - (b[0] + b[1]) / 2, want_y - (b[2] + b[3]) / 2))
        w = int(round(AIM_SMOOTH / TAB_DT))
        tab = []
        for i in range(len(raw)):
            lo, hi = max(0, i - w), min(len(raw), i + w + 1)
            tab.append(tuple(sum(r[j] for r in raw[lo:hi]) / (hi - lo) for j in range(2)))
        _AIM = (n0, tab)
    return _AIM


def _aim_fix(t):
    n0, tab = _aim_table()
    u = t / TAB_DT - n0
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = u - k
    return tuple(tab[k][j] * (1 - f) + tab[k + 1][j] * f for j in range(2))


def _aim_want(t):
    """La visée du centre de la boîte : (x % depuis la gauche, y % depuis le bas)."""
    return FRAME_X, 100.0 - FRAME_Y


def camera_aim(t):
    """(lacet, site) sans le tremblé : le centre de la boîte de la berline à l'écran (ce que mesure motion.py) à
    FRAME_X, FRAME_Y, à la correction lissée près."""
    cx, cy, cz = cam_pos(t)
    x, y = hero_pos(t)
    want_x, want_y = _aim_want(t)
    dx, dy = _aim_fix(t)
    return _aim_at(cx, cy, cz, x, y, want_x + dx, want_y + dy)


def camera_rail(t):
    """La caméra sans tremblé : (x, y, z, lacet, site, roulis, focale)."""
    x, y, z = cam_pos(t)
    yaw, pitch = camera_aim(t)
    return x, y, z, yaw, pitch, 0.0, LENS


def camera(t):
    """La caméra du plan : le rail, sans tremblé écrit (l'opérateur de motion.key_camera ajoute vibration et
    secousses de passage selon le type de caméra)."""
    return camera_rail(t)


def project(p, t):
    """Le point monde p (x, y, z) dans le cadre de la caméra à l'instant t, sans le tremblé : (x %, y %, distance)
    comptés depuis la gauche et depuis le bas ; None s'il est derrière l'objectif."""
    cx, cy, cz, yaw, pitch, _, _ = camera_rail(t)
    a, b = math.radians(yaw), math.radians(pitch)
    f = (-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
    r = (f[1], -f[0], 0.0)                         # f × z
    n = math.hypot(r[0], r[1])
    r = (r[0] / n, r[1] / n, 0.0)
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    v = (p[0] - cx, p[1] - cy, p[2] - cz)
    zc = sum(v[i] * f[i] for i in range(3))
    if zc <= 0.05:
        return None
    xc, yc = sum(v[i] * r[i] for i in range(3)), sum(v[i] * u[i] for i in range(3))
    return 50.0 + 50.0 * xc / zc / TAN_H, 50.0 + 50.0 * yc / zc / TAN_V, math.sqrt(sum(c * c for c in v))


def car_box(pose, dims=CAR_DIMS):
    """Les huit coins de la caisse d'une pose de motion.sample."""
    h = math.radians(pose["heading"])
    fx, fy = -math.sin(h), math.cos(h)
    rx, ry = fy, -fx
    L2, W2, H = dims[0] / 2, dims[1] / 2, dims[2]
    return [(pose["x"] + fx * a + rx * b, pose["y"] + fy * a + ry * b, z)
            for a in (-L2, L2) for b in (-W2, W2) for z in (0.1, H)]


def frame_box(pose):
    """La boîte de la berline dans le cadre : (x0, x1, y0, y1) en %, et la distance au plus près de l'objectif."""
    pts = [project(p, pose["t"]) for p in car_box(pose)]
    pts = [q for q in pts if q]
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    return min(xs), max(xs), min(ys), max(ys), min(q[2] for q in pts)


PATROL_DIMS = (5.0, 1.95, 1.75)          # longueur, largeur, hauteur rampe comprise


def patrol_box(t):
    """La boîte de la patrouille 1 dans le cadre (x0, x1, y0, y1 en %, y depuis le bas) ; None si un coin est
    derrière l'objectif."""
    x, y = pack_pos(0)(t)
    pts = [project(p, t) for p in car_box({"x": x, "y": y, "heading": patrol_heading(t), "t": t}, PATROL_DIMS)]
    if not all(pts):
        return None
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    return min(xs), max(xs), min(ys), max(ys)


def patrol_seen(f):
    """Vrai si la patrouille 1 est entière dans le cadre à l'image f : dans x 1–99 %, y 15–88 % du bas (la zone
    utile), à gauche de la berline (moins de 8 % de sa boîte sous celle de la berline, plus proche)."""
    t = M.t_of(f)
    b = patrol_box(t)
    if b is None or b[0] < 1.0 or b[1] > 99.0 or b[2] < 15.0 or b[3] > 88.0:
        return False
    hx, hy = hero_pos(t)
    hb = frame_box({"x": hx, "y": hy, "heading": hero_heading(t), "t": t})
    ox = max(0.0, min(b[1], hb[1]) - max(b[0], hb[0]))
    oy = max(0.0, min(b[3], hb[3]) - max(b[2], hb[2]))
    return (b[0] + b[1]) / 2 < (hb[0] + hb[1]) / 2 and ox * oy <= 0.08 * (b[1] - b[0]) * (b[3] - b[2])


def behind_angle(t):
    """L'angle (degrés) entre (berline → caméra) et l'opposé de la vitesse de la berline (section 2.2)."""
    (vx, vy), _ = M.kinematics(hero_pos, t)
    x, y = hero_pos(t)
    cx, cy, _ = cam_pos(t)
    dx, dy = cx - x, cy - y
    c = -(dx * vx + dy * vy) / (math.hypot(dx, dy) * math.hypot(vx, vy))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def wheel_track(side, axle=REAR_AXLE, frames=SKID_FRAMES, n=96):
    """La trace d'une roue (side : -1 gauche, +1 droite) au sol entre deux images : [(t, x, y)]."""
    t0, t1 = M.t_of(frames[0]), M.t_of(frames[1])
    return [(t, *wheel_at(t, side, axle)) for t in (t0 + (t1 - t0) * i / n for i in range(n + 1))]


# --- le faisceau : sa tache court vers la berline le long de sa route à venir, la trouve à BEAM_FIND, puis la tient
# avec un léger retard (l'opérateur du projecteur la suit à 0,06 s).
BEAM_FIND = 30
BEAM_LAG = 0.06
SWEEP = ((*hero_pos(T_END + 1.0), 0.0), (*hero_pos(M.t_of(BEAM_FIND + 12)), 0.0))   # devant elle, vers elle


def beam_target(t):
    f = _f(t)
    hx, hy = hero_pos(t - BEAM_LAG)
    car = (hx, hy, 0.6)
    if f <= BEAM_FIND:
        u = M.smoothstep(F0, BEAM_FIND, f)
        sweep = tuple(a + (b - a) * u for a, b in zip(*SWEEP))
        k = M.smoothstep(BEAM_FIND - 8, BEAM_FIND, f)
        return tuple(s + (c - s) * k for s, c in zip(sweep, car))
    return car


if __name__ == "__main__":
    poses = M.sample(hero_pos, range(F0, F0 + FRAMES), heading=hero_heading, steer=hero_steer)
    prev = None
    for p in poses:
        f, t = p["frame"], p["t"]
        x0, x1, y0, y1, d = frame_box(p)
        cx, cy, cz, yaw, pitch, _, _ = camera_rail(t)
        rate = 0.0 if prev is None else (yaw - prev) * M.FPS
        prev = yaw
        hx = heli(t)
        hp = project((hx[0], hx[1], hx[2] + HELI_BODY), t)
        pb = patrol_box(t)
        pk = ((pb[0] + pb[1]) / 2, 0.0) if pb else None
        print(f"{f:2d} berline ({p['x']:5.1f},{p['y']:5.1f}) {hero_speed(t) * 3.6:3.0f} km/h glisse {hero_slip(t):5.1f} | "
              f"cam ({cx:5.1f},{cy:5.1f},{cz:3.1f}) lacet {yaw:6.1f} ({rate:5.1f}°/s) site "
              f"{pitch:5.1f} | x {(x0 + x1) / 2:3.0f} y {(y0 + y1) / 2:3.0f} l {x1 - x0:3.0f} à {d:4.1f} m, "
              f"derr. {behind_angle(t):3.0f}° | hélico "
              + (f"{hp[0]:3.0f},{hp[1]:3.0f}" if hp else "--") + " | pat. " + (f"{pk[0]:4.0f}" if pk else "--")
              + (" entière" if patrol_seen(f) else ""))
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
    print(f"centre du virage ({TURN_C[0]:.2f}, {TURN_C[1]:.2f}), glisse au plus fort à l'image {SLIP_PEAK}, gomme "
          f"{SKID_FRAMES}, patrouille 1 à {PATROL_V0:.2f} m/s")
    for i in range(1, len(PACK_START)):
        x, y, h, v = pack_state(i)
        print(f"meute {i} ({PACK_START[i][0]}) à la dernière image : ({x:.2f}, {y:.2f}), cap {h:+.1f}°, {v:.2f} m/s")
