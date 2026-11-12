# Le plan P5 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md, « P5 — L'hélicoptère fond sur le
# quai, elle glisse dessous », et sa section v3.1 qui prime) : la berline arrive par la voie du pont, freine en ligne,
# vire à droite en glissant de 16° et repart vers le quai ; la caméra de poursuite commune (24 mm, 2,4 m, 7,5 m
# derrière) la suit sur le cap de sa vitesse, un peu à l'extérieur du virage ; la patrouille 1, devant elle à
# gauche, freine, sous-vire tout droit et s'arrête devant les séparateurs ; l'hélicoptère arrive de l'est des
# conteneurs et plonge sur le quai devant elle, nez vers elle, faisceau sur elle. scene_e.py n'en lit que les
# fonctions du temps ; motion.py en tire roues, braquage et transfert de masse.
#
# Repère du port (celui de lieux.py) : la voie du pont sur l'axe x = 0, la berline sur sa voie de droite (x = 3,5)
# vers +y ; la voie du quai (axe y = 70, bords 63 et 77) vers +x ; la file de séparateurs qui ferme l'axe en
# y = 80,6. t = 0 à la première image ; 48 images, 24 par seconde (shared/film/cut.ts).
#
# Écarts à la fiche v3, assumés (v3.1) : la berline ne fait plus le quart de tour dans le plan. Sur le mouillé
# (latéral ≤ 6,5 m/s², lacet de caisse ≤ 120°/s², glisse installée et rendue sans à-coup), avec une caméra qui ne
# panoramique pas au-delà de 40°/s, elle tourne de 50° en 48 images et finit cap au nord-est, à l'entrée du quai, en
# (8,9 ; 64,7) à 36 km/h : la fin du virage est hors champ, P6 reprend sur la jetée.
import math

import motion as M

V3 = True
V31 = True                    # découpage v3.1 : cadre de poursuite commun, voiture vraie (motion.py mesure --v3)
FRAMES = 48
F0 = 1
T_END = (FRAMES - 1) / M.FPS

LANE_X = 3.5                  # la voie de droite du pont
Y_START = 46.0                # la berline à la première image

CAR_DIMS = (4.9, 1.8, 1.45)   # longueur, largeur, hauteur de la berline (à quelques centimètres)

# --- la berline (découpage v3.1, « la voiture roule vrai ») : une berline lourde sur le mouillé, réglée dans le
# temps par trois courbes adoucies (en images) : son accélération le long de sa route, la vitesse de lacet de sa route
# (sa vitesse tourne) et la glisse de sa caisse. Elle sort du pont à 51 km/h déjà sur les freins (5,8 m/s², le nez
# plonge, feux stop des images 1 à 24), braque en entrée progressive dès l'image 5 (la route tourne jusqu'à 36°/s :
# courbure continue, 6,4 m/s² de latéral au plus) en lâchant le frein ; l'arrière part vers l'extérieur du virage dès
# l'image 3, sous près de 6 m/s² d'adhérence demandée, et atteint 16° à l'image 29 (25°/s au plus), les roues avant
# contre-braquent, la vitesse tombe de 21 % ; la glisse se résorbe en 17 images (28°/s au plus) et elle remet les gaz
# (2,2 m/s²) vers le quai dès l'image 30. Toutes les transitions sont des rampes adoucies : à-coup ≤ 12 m/s³,
# accélération de lacet de la caisse ≤ 100°/s² (motion.py mesure --v3 P5).
V0 = 14.1                     # m/s à la première image (51 km/h)
# (début image, durée images, valeur visée) ; chaque courbe part de 0
ACC_STEPS = ((-19.0, 22.0, -5.8), (9.5, 18.0, -1.6), (30.0, 10.5, 2.2))      # m/s² le long de la route
YAW_STEPS = ((4.5, 20.0, 36.0),)                                              # °/s, vers la droite
SLIP_STEPS = ((3.3, 23.0, -16.0), (29.5, 24.0, 2.8), (50.0, 17.0, 0.0))       # ° (négative : l'arrière à gauche)


def _steps(steps, u, start=0.0):
    out = start
    prev = start
    for u0, du, val in steps:
        out += (val - prev) * M.smoothstep(u0, u0 + du, u)
        prev = val
    return out


TAB_DT = 1.0 / 240.0
TAB_T = (-2.0, T_END + 1.0)
_HERO = None


def _hero_table():
    """(x, y, vitesse, cap de la vitesse en degrés à droite de +y) tous les TAB_DT s, de TAB_T[0] à TAB_T[1] :
    intégrés depuis l'image 1 (LANE_X, Y_START, V0, plein nord), en ligne droite avant."""
    global _HERO
    if _HERO is None:
        k0 = int(round(-TAB_T[0] / TAB_DT))
        n = int(round((TAB_T[1] - TAB_T[0]) / TAB_DT))
        x, y, v, th = LANE_X, Y_START, V0, 0.0
        fwd = [(x, y, v, th)]
        for k in range(1, n - k0 + 1):
            f = (k - 0.5) * TAB_DT * M.FPS + F0
            a, r = _steps(ACC_STEPS, f), _steps(YAW_STEPS, f)
            vm = v + a * TAB_DT / 2
            rr = math.radians(th + r * TAB_DT / 2)
            th += r * TAB_DT
            x, y, v = x + math.sin(rr) * vm * TAB_DT, y + math.cos(rr) * vm * TAB_DT, v + a * TAB_DT
            fwd.append((x, y, v, th))
        back = []
        x, y, v = LANE_X, Y_START, V0
        for k in range(1, k0 + 1):
            f = -(k - 0.5) * TAB_DT * M.FPS + F0
            a = _steps(ACC_STEPS, f)
            vm = v - a * TAB_DT / 2
            y, v = y - vm * TAB_DT, v - a * TAB_DT
            back.append((x, y, v, 0.0))
        _HERO = back[::-1] + fwd
    return _HERO


def _hero_at(t):
    tab = _hero_table()
    u = (t - TAB_T[0]) / TAB_DT
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = u - k
    a, b = tab[k], tab[k + 1]
    return tuple(a[i] * (1 - f) + b[i] * f for i in range(4))


def hero_pos(t):
    return _hero_at(t)[:2]


def hero_speed(t):
    return _hero_at(t)[2]


def travel_bearing(t):
    """Le cap de la vitesse de la berline (degrés à droite de +y)."""
    return _hero_at(t)[3]


def hero_slip(t):
    """La glisse de la caisse (degrés, négative : l'avant pointe à droite de sa route, l'arrière dehors)."""
    return _steps(SLIP_STEPS, t * M.FPS + F0)


def hero_heading(t, h=1e-3):
    """Le cap de la caisse (cap de la vitesse plus glisse), convention de lieux.put."""
    return -travel_bearing(t) + hero_slip(t)


def brake_windows(thr=2.0, frames=None):
    """Les fenêtres [(première, dernière image)] où la berline freine à plus de thr m/s², pour
    hero_cars.stop_lamps (une image de part et d'autre du plan comprise)."""
    frames = list(frames or range(F0 - 1, F0 + FRAMES + 1))
    on = [f for f in frames if -_steps(ACC_STEPS, f) > thr]
    out = []
    for f in on:
        if out and f == out[-1][1] + 1:
            out[-1] = (out[-1][0], f)
        else:
            out.append((f, f))
    return out


def _turn_center(f=30):
    """Le centre de courbure de la route à l'image f (pour la dérive de la fumée, vers l'extérieur)."""
    t = M.t_of(f)
    x, y, v, th = _hero_at(t)
    r = v / math.radians(_steps(YAW_STEPS, f))
    a = math.radians(th)
    return x + r * math.cos(a), y - r * math.sin(a)


TURN_C = _turn_center()


# --- les poursuivants. La patrouille 1 (indice 0) est déjà devant, à gauche, au bout du pont : elle a pris la tête
# pour couper la route à la berline, voit l'axe fermé et freine (6,5 m/s² au plus, installés en 0,9 s) ; elle braque
# à droite pour prendre le virage mais la route mouillée ne la tient pas : elle sous-vire, file tout droit, le nez
# rentré de 9° seulement (les roues braquées, la caisse qui pivote à peine), et s'arrête en douceur devant les
# séparateurs (le freinage relâché à la fin). Le cadre la montre entière à gauche de la berline (PATROL_SEEN).
# Le reste de la meute : sur la voie du pont, 30 m derrière la berline au moins, qui freine (4 m/s²) en voyant l'axe
# fermé ; ses phares font l'ombre de la berline.
PATROL_X, PATROL_Y0 = 0.0, 69.0                   # sur l'axe de la voie du pont, passé la chaîne, à l'image 1
# la conduite commune (motion.drive) : une route qui file tout droit depuis (0 ; 60) et s'arrête 16 m plus loin,
# abordée à 36 km/h voulus ; l'outil la rabote (34 km/h à l'image 1, déjà sur les freins) et l'arrête en douceur
PATROL = M.drive(dict(start=(PATROL_X, 60.0, 0.0), pieces=[M.line(16.0)]), 10.0, t0=-0.9, stop=True,
                 kind="patrol")
PATROL_YAW, PATROL_YAW_F = -9.0, (4.0, 30.0)        # le nez qui rentre à droite (degrés, de l'image à l'image)
PATROL_SEEN = (1, 22)                               # les images où elle est entière dans le cadre (test_motion)


def patrol_heading(t):
    """Le cap de la patrouille 1 : celui de sa conduite (tout droit) plus le nez rentré du sous-virage."""
    return PATROL.heading(t) + PATROL_YAW * M.smoothstep(*PATROL_YAW_F, t * M.FPS + F0)


def tracks_heading():
    """{nom: cap(t)} des véhicules dont le cap ne suit pas la vitesse (la patrouille 1 sous-vire)."""
    return {"patrol_0": patrol_heading}


PACK_V = 17.0
PACK_ACC = ((-12.0, 24.0, -4.0),)                   # (début image, durée images, m/s²)


def _pack_accel(t):
    return _steps(PACK_ACC, t * M.FPS + F0)


PACK = M.Profile(PACK_V, _pack_accel)
PACK_START = [("patrol", PATROL_X, PATROL_Y0), ("patrol", 2.8, 3.0), ("van", -2.4, -9.0), ("patrol", 2.8, -23.0)]


def pack_pos(i):
    if i == 0:
        return PATROL.pos
    _, x, y0 = PACK_START[i]
    return lambda t: (x, y0 + PACK.s(t))


# --- ce que la berline frôle (posé par scene_e.build_east, contrôlé par test_motion) : la chaîne pendue sur l'axe
# de la voie du pont, que l'arrière en glisse longe (la caméra, à l'extérieur du virage, y passe à 1,2 m) ; la
# flaque que la roue arrière gauche traverse en sortie de glisse (images 44 à 46), assez tard pour que la caméra ne
# la voie jamais dans les 15 % du bas (sous l'objectif, elle renvoyait le ciel noir et un lampadaire : un disque
# sombre et une boule claire au premier plan) ; les caisses, rangées au bord sud du quai.
CHAIN_POSTS = [(0.0, 52.0), (0.0, 54.7), (0.0, 57.4), (0.0, 60.1)]
PUDDLE_AT, PUDDLE_SIZE, PUDDLE_YAW = (6.8, 63.8), (3.0, 1.8), -49.0
PUDDLE_MARGIN = 0.4           # le fondu du bord (scene_e.build_east : la plaque déborde de 0,4 m)
FLOOR_BAND = 15.0             # le bas du cadre (%) où rien ne doit se poser au sol
SMOKE_CLEAR = 2.0             # m : une bouffée que la caméra frôlerait de plus près (elle suit la route) est omise
SMOKE_DRIFT = -0.8            # m : la fumée dérive vers l'intérieur du virage (le vent) ; dehors, la caméra la traversait


def puddle_pts(n=4):
    """Des points de la plaque de la flaque, bord fondu compris (x, y, 0)."""
    c, s = math.cos(math.radians(PUDDLE_YAW)), math.sin(math.radians(PUDDLE_YAW))
    hx, hy = PUDDLE_SIZE[0] / 2 + PUDDLE_MARGIN, PUDDLE_SIZE[1] / 2 + PUDDLE_MARGIN
    return [(PUDDLE_AT[0] + u * c - v * s, PUDDLE_AT[1] + u * s + v * c, 0.0)
            for u in (hx * (2 * i / n - 1) for i in range(n + 1)) for v in (hy * (2 * j / n - 1) for j in range(n + 1))]


def smoke_keep(puffs, drift=SMOKE_DRIFT, grow=10):
    """Les bouffées de motion.smoke_puffs que la caméra ne traverse pas : elle suit la route de la berline, jusqu'à
    1 m plus à gauche ; à moins de SMOKE_CLEAR m, la bouffée voilait le bas du cadre."""
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
BARRIER_Y, BARRIER_X = 80.6, (-7.6, 7.6)    # la file de séparateurs (scene_e.build_barrier)
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
# (nez bas), vire sur la gauche et plonge sur le quai devant la berline ; il entre dans le cadre par la droite vers
# l'image 34 et finit en ralentissant, nez vers elle, à 9,6 m, 24 m devant elle dans l'axe du quai (x 53 %, y 79 %
# du bas) : le faisceau tombe sur elle et relie les deux dans le cadre final.
HELI_PATH = ((70.0, 40.0, 22.0), (64.0, 56.0, 21.0), (44.0, 76.0, 14.0), (28.9, 78.1, 9.6))
HELI_BODY = 1.5               # le milieu de la cellule au-dessus de l'origine du modèle (mesuré à l'image)


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


# --- la caméra (cadre de poursuite commun du découpage v3.1) : sur un véhicule, 24 mm, à 2,4 m, 7,5 m derrière le
# centre de la berline, dans l'axe du cap de sa vitesse pris avec un retard doux (CAM_LAG), 1,45 m à gauche : dans
# le virage à droite elle reste à l'extérieur (0,35 à 1,45 m mesurés depuis la route, le retard la ramenant vers
# l'intérieur) et la caisse en travers s'y lit de trois quarts arrière sans se présenter de flanc (largeur à l'écran
# à ±15 %). Distance et hauteur fixes, ni grue ni tremblé écrit ; le centre de la boîte de la berline à l'écran à
# x 50 %, y 58 % depuis le haut (la correction de visée lissée, _aim_table).
LENS = 24.0
TAN_V = 18.0 / LENS           # demi-champ vertical (capteur de 36 mm sur la hauteur, cadre 9:16)
TAN_H = TAN_V * 9.0 / 16.0
CAM_BACK, CAM_Z = 7.5, 2.4
CAM_LEFT = 1.45               # m à gauche de l'axe de la caméra (le décalage mesuré tient de 0 à 1,5 m)
CAM_LAG = 0.12                # s : la constante du retard (filtre du second ordre, amorti critique)
FRAME_X = 50.0                # % depuis la gauche : le centre de la boîte de la berline à l'écran
FRAME_Y = 58.0                # % depuis le haut (la convention des fiches)
FRAME_Y_STEPS = ((34.0, 14.0, -1.5),)       # (image, durée, écart) : 56,5 % à la coupe vers P6 (encore en v3, à 52)

_PSI = None


def _psi_table():
    """Le cap suivi par la caméra : celui de la vitesse de la berline, filtré (deux pôles à 1/CAM_LAG), en régime
    établi avant la première image."""
    global _PSI
    if _PSI is None:
        n0, n1 = int(-1.0 / TAB_DT), int((T_END + 1.0) / TAB_DT)
        y1 = y2 = travel_bearing(n0 * TAB_DT)
        tab = []
        a = TAB_DT / CAM_LAG
        for k in range(n0, n1 + 1):
            u = travel_bearing(k * TAB_DT)
            y1 += a * (u - y1)
            y2 += a * (y1 - y2)
            tab.append(y2)
        _PSI = (n0, tab)
    return _PSI


def psi(t):
    """Le cap de la caméra (degrés à droite de +y)."""
    n0, tab = _psi_table()
    u = t / TAB_DT - n0
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = u - k
    return tab[k] * (1 - f) + tab[k + 1] * f


def cam_left(t):
    return CAM_LEFT


def cam_d(t):
    return math.hypot(CAM_BACK, cam_left(t))


def cam_pos(t):
    """(x, y, z) de la caméra : CAM_BACK m derrière la berline dans l'axe du cap filtré, cam_left(t) m à gauche."""
    x, y = hero_pos(t)
    a = math.radians(psi(t))
    left = cam_left(t)
    return (x - CAM_BACK * math.sin(a) - left * math.cos(a), y - CAM_BACK * math.cos(a) + left * math.sin(a), CAM_Z)


CAM = cam_pos(0.0)            # la caméra à la première image


def reset():
    """À appeler après avoir changé un réglage de la route ou de la caméra (les tables sont calculées une fois)."""
    global _PSI, _HERO, _AIM
    _PSI = _HERO = _AIM = None


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
    return FRAME_X, 100.0 - FRAME_Y - _steps(FRAME_Y_STEPS, t * M.FPS + F0)


def camera_aim(t):
    """(lacet, site) sans le tremblé : le centre de la boîte de la berline à l'écran (ce que mesure motion.py) à
    FRAME_X, FRAME_Y (plus FRAME_Y_STEPS), à la correction lissée près."""
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


REAR_AXLE, TRACK = -1.45, 0.75          # l'essieu arrière (m devant le centre) et la demi-voie de la berline
SKID_FRAMES = (15, 40)                  # la gomme marque tant que la glisse dépasse 8° (images de scène)


def wheel_track(side, axle=REAR_AXLE, frames=SKID_FRAMES, n=96):
    """La trace d'une roue (side : -1 gauche, +1 droite) au sol entre deux images : [(t, x, y)]."""
    t0, t1 = M.t_of(frames[0]), M.t_of(frames[1])
    out = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        x, y = hero_pos(t)
        h = math.radians(hero_heading(t))
        fx, fy = -math.sin(h), math.cos(h)
        out.append((t, x + fx * axle + fy * TRACK * side, y + fy * axle - fx * TRACK * side))
    return out


# --- le faisceau : sa tache court sur la voie du quai vers la berline, la trouve à l'image 24, puis la tient avec
# un léger retard (l'opérateur du projecteur la suit à 0,06 s).
SWEEP = ((30.0, 66.0, 0.0), (9.0, 70.0, 0.0))     # sur le quai, devant elle, vers elle
BEAM_FIND = 24
BEAM_LAG = 0.06


def beam_target(t):
    f = t * M.FPS + F0
    hx, hy = hero_pos(t - BEAM_LAG)
    car = (hx, hy, 0.6)
    if f <= BEAM_FIND:
        u = M.smoothstep(F0, BEAM_FIND, f)
        sweep = tuple(a + (b - a) * u for a, b in zip(*SWEEP))
        k = M.smoothstep(BEAM_FIND - 8, BEAM_FIND, f)
        return tuple(s + (c - s) * k for s, c in zip(sweep, car))
    return car


if __name__ == "__main__":
    poses = M.sample(hero_pos, range(F0, F0 + FRAMES), slip=hero_slip)
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
        print(f"{f:2d} berline ({p['x']:5.1f},{p['y']:5.1f}) {hero_speed(t) * 3.6:3.0f} km/h dérive {hero_slip(t):5.1f} | "
              f"cam ({cx:5.1f},{cy:5.1f},{cz:3.1f}) {cam_d(t):4.1f} m lacet {yaw:6.1f} ({rate:5.1f}°/s) site "
              f"{pitch:5.1f} | x {(x0 + x1) / 2:3.0f} y {(y0 + y1) / 2:3.0f} l {x1 - x0:3.0f} à {d:4.1f} m, "
              f"derr. {behind_angle(t):3.0f}° | hélico "
              + (f"{hp[0]:3.0f},{hp[1]:3.0f}" if hp else "--") + " | pat. " + (f"{pk[0]:4.0f}" if pk else "--")
              + (" entière" if patrol_seen(f) else ""))
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
    print(f"centre de l'arc ({TURN_C[0]:.1f}, {TURN_C[1]:.1f})")
