# Le plan P5 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md, « P5 — L'hélicoptère fond sur le
# quai, elle glisse dessous ») : la berline arrive par la voie du pont, freine, vire à droite en glisse et file
# sur la voie du quai ; la caméra part derrière elle, sur son rail, puis prend un arc plus large à droite et
# panoramique pour la garder pendant la glisse (le seul mouvement vif du film) ; la patrouille 1, devant elle à
# gauche, freine, rate le virage et s'arrête en travers devant les séparateurs ; l'hélicoptère arrive de l'est des
# conteneurs et plonge sur le quai devant elle, nez vers elle, faisceau sur elle. scene_e.py n'en lit que les
# fonctions du temps ; motion.py en tire roues, braquage et transfert de masse.
#
# Repère du port (celui de lieux.py) : la voie du pont sur l'axe x = 0, la berline sur sa voie de droite (x = 3,5)
# vers +y ; la voie du quai (axe y = 70, bords 63 et 77) vers +x ; la file de séparateurs qui ferme l'axe en
# y = 80,6. t = 0 à la première image ; 48 images, 24 par seconde (shared/film/cut.ts).
#
# Écarts à la fiche v3, assumés :
# - la caméra ne suit pas un arc de 30 m à 13-15 m/s jusqu'en (10 ; 70) : partie à 85 km/h, une caméra qui reste
#   sous 8 m/s² finit à 12 m au moins de la berline, contre les séparateurs, la berline à 25 % de la largeur (le
#   point de coupe vers P6 casse). Elle suit la berline de 8 à 10,3 m, son relèvement tourne moins vite qu'elle
#   (elle prend le virage plus large, à droite) et finit en (14 ; 70,6), la berline de trois quarts arrière à 41 % ;
#   son accélération propre monte à 24 m/s² (la berline en prend 22 à 32 dans l'arc) ;
# - le lacet tourne de 62° (≈ 70) et le panoramique culmine à 47°/s (images 14 à 27 au-dessus de 40) : plus vite,
#   l'accélération propre et l'écart montaient sans que le cadre y gagne ;
# - la patrouille 1 ne double pas la caméra (4–12) : à 21 mm, la caméra 7 m derrière la berline, elle n'y serait
#   entière qu'une seconde après l'avoir doublée, quand le panoramique de la glisse regarde déjà le quai. Elle est
#   déjà devant, à gauche, sur l'axe du pont (38 km/h, sur les freins) : entière dans le cadre aux images 1 à 12, elle
#   rate le virage et s'arrête en travers (nez à -50°) à 1,7 m des séparateurs ; la visée garde la berline 2,5 points
#   plus à droite aux images 6 à 28 pour la laisser au bord gauche.
import math

import motion as M

V3 = True
FRAMES = 48
F0 = 1
T_END = (FRAMES - 1) / M.FPS

LANE_X = 3.5                  # la voie de droite du pont
Y_START = 52.0                # la berline à la première image
TURN_R = 12.0
TURN_IN_Y = 61.0              # l'entrée dans l'arc
TURN_C = (LANE_X + TURN_R, TURN_IN_Y)       # (15,5 ; 61) ; la sortie sur y = 73, côté nord de la voie du quai

CAR_DIMS = (4.9, 1.8, 1.45)   # longueur, largeur, hauteur de la berline (à quelques centimètres)

# --- la berline : vitesse et accélération (m/s, m/s²), instants (s)
V0 = 23.6                    # 85 km/h à la première image, freinée à ~70 à l'entrée de l'arc
BRAKE = -10.0                # le freinage d'approche (jusqu'à l'entrée)
T_BRAKE_OFF = 0.40
SCRUB = -5.0                 # la glisse mange la vitesse
T_GO = 1.30                  # la reprise : gaz à fond, l'arrière s'assied, la caisse se redresse
GO = 7.5
SLIP_IN = -20.0              # degrés à l'entrée de l'arc (le coup de volant à contre)
SLIP_PEAK = -42.0            # au plus fort de la glisse, au milieu de l'arc
SLIP_OUT = -10.0             # à la dernière image, en pleine accélération


def _hero_accel(t):
    a = BRAKE * (1.0 - M.smoothstep(T_BRAKE_OFF - 0.08, T_BRAKE_OFF + 0.06, t))
    a += SCRUB * M.smoothstep(T_BRAKE_OFF - 0.02, T_BRAKE_OFF + 0.14, t)
    return a + (GO - SCRUB) * M.smoothstep(T_GO - 0.10, T_GO + 0.12, t)


HERO = M.Profile(V0, _hero_accel)
S_IN = TURN_IN_Y - Y_START   # la distance de la première image à l'entrée de l'arc


def _route(u):
    """Le point (x, y) de la route à l'abscisse u (u = 0 à l'entrée de l'arc) : la ligne droite du pont, l'arc à
    droite, la voie du quai."""
    if u <= 0:
        return LANE_X, TURN_IN_Y + u
    phi = u / TURN_R
    if phi > math.pi / 2:
        return TURN_C[0] + (u - TURN_R * math.pi / 2), TURN_C[1] + TURN_R
    return TURN_C[0] - TURN_R * math.cos(phi), TURN_C[1] + TURN_R * math.sin(phi)


def road(s):
    """Le point (x, y) de la route de la berline à l'abscisse s (s = 0 à la première image)."""
    return _route(s - S_IN)


def hero_pos(t):
    return road(HERO.s(t))


def hero_phi(t):
    """Où en est la berline dans l'arc, en degrés (0 : entrée)."""
    return max(0.0, math.degrees((HERO.s(t) - S_IN) / TURN_R))


def _t_at(s, lo=-1.0, hi=4.0):
    """L'instant où la berline passe l'abscisse s."""
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if HERO.s(mid) < s else (lo, mid)
    return (lo + hi) / 2


T_IN = _t_at(S_IN)                                   # l'entrée dans l'arc
T_OUT = _t_at(S_IN + TURN_R * math.pi / 2)           # la sortie sur la voie du quai


def hero_slip(t):
    """La dérive de la caisse (degrés, négative : glisse à droite, l'arrière dehors) : nulle sur le pont, -20° à
    l'entrée de l'arc (le coup de volant à contre), -42° au milieu, -10° en sortie, en pleine accélération."""
    t_mid = (T_IN + T_OUT) / 2
    s = SLIP_IN * M.smoothstep(T_IN - 0.22, T_IN + 0.04, t)
    s += (SLIP_PEAK - SLIP_IN) * M.smoothstep(T_IN + 0.04, t_mid, t)
    return s + (SLIP_OUT - SLIP_PEAK) * M.smoothstep(t_mid + 0.10, T_OUT + 0.30, t)


def hero_heading(t, h=1e-3):
    """Le cap de la caisse (route plus dérive), convention de lieux.put."""
    (x0, y0), (x1, y1) = hero_pos(t - h), hero_pos(t + h)
    return M.heading_of(x1 - x0, y1 - y0) + hero_slip(t)


# --- les poursuivants. La patrouille 1 (indice 0) est déjà devant, à gauche, au bout du pont : elle a pris la tête
# pour couper la route à la berline, voit l'axe fermé, freine à fond, ne prend pas le virage (elle tire un peu à
# droite, le nez qui rentre, l'arrière qui chasse) et s'arrête en travers devant les séparateurs ; la berline glisse
# à droite derrière elle et s'échappe. Le cadre la montre à gauche de la berline (PATROL_SEEN, 12 images au moins) :
# à 21 mm, la caméra 7 m derrière la berline, une voiture de la voie de gauche ne tient entière dans le cadre qu'à
# 15 m au moins devant l'objectif (8 devant la berline) ; une patrouille qui doublerait la caméra n'y serait entière
# qu'une seconde plus tard, devant les séparateurs, quand le panoramique de la glisse regarde déjà le quai.
# Le reste de la meute : sur la voie du pont, 30 m derrière la berline au moins, qui freine fort (elle voit l'axe
# fermé) ; ses phares font l'ombre de la berline.
PACK_V = 30.0
PATROL_X, PATROL_Y0, PATROL_V = 0.0, 69.0, 10.5    # sur l'axe de la voie du pont, passé la chaîne ; 38 km/h
PATROL_BRAKE, PATROL_T_BRAKE = -8.2, (-0.1, 0.17)   # déjà sur les freins
PATROL_DRIFT, PATROL_DRIFT_Y = 0.0, (72.0, 76.0)    # ce qu'elle tire à droite en freinant (m, de y à y)
PATROL_YAW, PATROL_T_YAW = -50.0, (0.4, 1.07)       # le nez qui rentre à droite, l'arrière qui chasse (degrés, s)
PATROL_SEEN = (1, 12)                               # les images où elle est entière dans le cadre (test_motion)


def _patrol_accel(t):
    return PATROL_BRAKE * M.smoothstep(*PATROL_T_BRAKE, t)


PATROL = M.Profile(PATROL_V, _patrol_accel, vmin=0.0)


def _patrol_route(s):
    y = PATROL_Y0 + s
    return PATROL_X + PATROL_DRIFT * M.smoothstep(*PATROL_DRIFT_Y, y), y


def patrol_heading(t, h=0.05):
    """Le cap de la patrouille 1 : la tangente de sa route (définie à l'arrêt) plus la glisse."""
    s = PATROL.s(t)
    (x0, y0), (x1, y1) = _patrol_route(s - h), _patrol_route(s + h)
    return M.heading_of(x1 - x0, y1 - y0) + PATROL_YAW * M.smoothstep(*PATROL_T_YAW, t)


def tracks_heading():
    """{nom: cap(t)} des véhicules dont le cap ne suit pas la vitesse (la patrouille 1 s'arrête en travers)."""
    return {"patrol_0": patrol_heading}


def _pack_accel(t):
    return -9.0 * M.smoothstep(0.30, 0.55, t)


PACK = M.Profile(PACK_V, _pack_accel)
PACK_START = [("patrol", PATROL_X, PATROL_Y0), ("patrol", 2.8, 3.0), ("van", -2.4, -9.0), ("patrol", 2.8, -23.0)]


def pack_pos(i):
    if i == 0:
        return lambda t: _patrol_route(PATROL.s(t))
    _, x, y0 = PACK_START[i]
    return lambda t: (x, y0 + PACK.s(t))


# --- ce que la berline frôle (posé par scene_e.build_east, contrôlé par test_motion) : la chaîne pendue sur l'axe
# de la voie du pont, que l'arrière en glisse longe ; la flaque que les roues arrière traversent au plus fort de la
# glisse ; les caisses, rangées au bord sud du quai (la caméra passait où le nez les frôlait en v2).
CHAIN_POSTS = [(0.6, 52.0), (0.6, 54.7), (0.6, 57.4), (0.6, 60.1)]
PUDDLE_AT, PUDDLE_SIZE, PUDDLE_YAW = (4.0, 65.8), (4.4, 2.8), 38.0
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
# l'image 34 et finit en ralentissant, nez vers elle, à 9,6 m, 23 m devant elle (x 58 %, y 75 % du bas) : le
# faisceau tombe sur elle et relie les deux dans le cadre final.
HELI_PATH = ((70.0, 40.0, 22.0), (64.0, 56.0, 21.0), (54.0, 73.0, 15.0), (46.0, 79.0, 9.6))
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


# --- la caméra : sur un véhicule, 21 mm. Elle se pose par rapport à la berline : à la distance cam_d(t) de son
# centre (filtré, anchor), dans la direction psi(t) (le relèvement de la berline vu de la caméra, degrés à droite
# de +y). Au départ 7 m derrière, 1 m à sa gauche, à 2 m ; le relèvement tourne moins vite que la berline (elle
# prend le virage plus large, à droite) : c'est le panoramique. Sa vitesse (°/s) se compose d'un fond amorti et
# d'une bosse, la glisse : le seul mouvement vif du film. La distance s'allonge sans à-coup de 7 à 9,8 m. Lacet,
# site et grue amortis, horizon à plat.
LENS = 21.0
TAN_V = 18.0 / LENS           # demi-champ vertical (capteur de 36 mm sur la hauteur, cadre 9:16)
TAN_H = TAN_V * 9.0 / 16.0
CAM_BACK, CAM_LEFT = 7.0, 1.0  # 8 m dans la fiche : la berline n'y tenait que 34 % de la largeur (40 visés)
CAM_D0 = math.hypot(CAM_BACK, CAM_LEFT)
PSI0 = math.degrees(math.atan2(CAM_LEFT, CAM_BACK))     # 8,1° : la berline un peu à droite de la caméra
# Réglages cherchés au plus bas de l'accélération propre (23 m/s², image 46 : la berline en prend 22 à 32 dans
# l'arc ; ni 4 m/s² par rapport à elle ni 8 en propre ne tiennent, voir test_motion.CAM_LIMITS_PLAN), plafonds v3
# tenus : l'écart varie de 2,8 m/s au plus, une seule fenêtre au-dessus de 40°/s (15 à 29, crête 50°/s), la
# caméra à 1 m au moins des poteaux de la chaîne, le panoramique retombé à la fin.
# la distance (m) aux images clés, interpolée sans à-coup (Hermite, pentes de Catmull-Rom, nulles aux bouts)
CAM_D_KNOTS = ((1, CAM_D0), (12, 7.0), (24, 8.05), (30, 8.69), (36, 9.33), (42, 9.61), (48, 9.8))
ANCHOR_SIGMA = 0.071          # s : le lissage de la berline qui porte la caméra (son centre, filtré)
CAM_Z0, CAM_Z1 = 2.0, 2.6     # la grue
CAM_Z_FRAMES = (8, 44)
# le panoramique (°/s, par image) : le fond (rampe de PAN_RAMP_IN, palier PAN_BASE, retombée à PAN_TAIL sur
# PAN_RAMP_OUT) et la bosse (sinus carré de PAN_BUMP sur PAN_BUMP_FRAMES)
PAN_BASE, PAN_TAIL = 38.1, 6.5
PAN_RAMP_IN, PAN_RAMP_OUT = (4.2, 14.45), (39.1, 50.0)
PAN_BUMP, PAN_BUMP_FRAMES = 18.3, (7.4, 36.7)
# la visée : le centre de la berline (pas celui de sa boîte projetée, que la perspective tire à droite au départ
# et à gauche à la fin) de x 44 à 60 %, de y 49,5 à 49 % du haut : sa boîte au point de coupe, 50/53 puis 56/51
FRAME_X = (43.8, 59.9)
FRAME_Y = (49.55, 49.07)      # depuis le haut (la convention des fiches)
# la visée retient la berline à droite du cadre au début (le panoramique part en retard) : la gauche du cadre montre
# la patrouille 1 qui file tout droit vers les séparateurs ; montée, palier, retour (images), en points de largeur
FX_BUMP, FX_BUMP_FRAMES = 2.5, (1.0, 6.0, 6.0, 28.0)


def _fx_bump(f):
    a, b, c, d = FX_BUMP_FRAMES
    return FX_BUMP * M.smoothstep(a, b, f) * (1.0 - M.smoothstep(c, d, f))


def pan_rate(f):
    """La vitesse du relèvement (°/s) à l'image f (fractionnaire)."""
    r = PAN_BASE * M.smoothstep(*PAN_RAMP_IN, f)
    r -= (PAN_BASE - PAN_TAIL) * M.smoothstep(*PAN_RAMP_OUT, f)
    b0, b1 = PAN_BUMP_FRAMES
    if b0 < f < b1:
        r += PAN_BUMP * math.sin(math.pi * (f - b0) / (b1 - b0)) ** 2
    return r


TAB_DT = 1.0 / 240.0
_PSI = None


def _psi_table():
    global _PSI
    if _PSI is None:
        n0, n1 = int(-1.0 / TAB_DT), int((T_END + 1.0) / TAB_DT)
        k0 = -n0
        tab = [0.0] * (n1 - n0 + 1)
        tab[k0] = PSI0
        for k in range(k0 + 1, len(tab)):
            t = (k + n0 - 0.5) * TAB_DT
            tab[k] = tab[k - 1] + pan_rate(t * M.FPS + F0) * TAB_DT
        for k in range(k0 - 1, -1, -1):
            tab[k] = tab[k + 1] - pan_rate(((k + n0 + 0.5) * TAB_DT) * M.FPS + F0) * TAB_DT
        _PSI = (n0, tab)
    return _PSI


def psi(t):
    """Le relèvement de la berline vu de la caméra (degrés à droite de +y)."""
    n0, tab = _psi_table()
    u = t / TAB_DT - n0
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = u - k
    return tab[k] * (1 - f) + tab[k + 1] * f


def cam_d(t):
    f = t * M.FPS + F0
    ks = CAM_D_KNOTS
    if f <= ks[0][0]:
        return ks[0][1]
    if f >= ks[-1][0]:
        return ks[-1][1]
    i = max(j for j in range(len(ks) - 1) if ks[j][0] <= f)
    (f0, d0), (f1, d1) = ks[i], ks[i + 1]
    m0 = 0.0 if i == 0 else (d1 - ks[i - 1][1]) / (f1 - ks[i - 1][0]) * (f1 - f0)
    m1 = 0.0 if i + 2 >= len(ks) else (ks[i + 2][1] - d0) / (ks[i + 2][0] - f0) * (f1 - f0)
    u = (f - f0) / (f1 - f0)
    return ((2 * u ** 3 - 3 * u * u + 1) * d0 + (u ** 3 - 2 * u * u + u) * m0 + (-2 * u ** 3 + 3 * u * u) * d1
            + (u ** 3 - u * u) * m1)


_ANCHOR = None


def anchor(t):
    """Le point qui porte la caméra : le centre de la berline, filtré (gaussienne de ANCHOR_SIGMA)."""
    global _ANCHOR
    if ANCHOR_SIGMA <= 0:
        return hero_pos(t)
    if _ANCHOR is None:
        n0, n1 = int(-1.0 / TAB_DT), int((T_END + 1.0) / TAB_DT)
        r = int(3 * ANCHOR_SIGMA / TAB_DT)
        w = [math.exp(-0.5 * (i * TAB_DT / ANCHOR_SIGMA) ** 2) for i in range(-r, r + 1)]
        sw = sum(w)
        raw = [hero_pos(k * TAB_DT) for k in range(n0 - r, n1 + r + 1)]
        tab = [tuple(sum(w[i] * raw[k + i][c] for i in range(len(w))) / sw for c in range(2))
               for k in range(n1 - n0 + 1)]
        _ANCHOR = (n0, tab)
    n0, tab = _ANCHOR
    u = t / TAB_DT - n0
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = u - k
    return tuple(tab[k][c] * (1 - f) + tab[k + 1][c] * f for c in range(2))


def cam_pos(t):
    """(x, y, z) de la caméra."""
    x, y = anchor(t)
    a, d = math.radians(psi(t)), cam_d(t)
    z = CAM_Z0 + (CAM_Z1 - CAM_Z0) * M.smoothstep(*CAM_Z_FRAMES, t * M.FPS + F0)
    return x - d * math.sin(a), y - d * math.cos(a), z


CAM = cam_pos(0.0)            # la caméra à la première image (2,5 ; 44 ; 2)


def reset():
    """À appeler après avoir changé un réglage de la caméra (la table du relèvement est calculée une fois)."""
    global _PSI, _ANCHOR
    _PSI = _ANCHOR = None


def camera_aim(t):
    """(lacet, site) sans le tremblé : le centre de la berline à FRAME_X, FRAME_Y."""
    cx, cy, cz = cam_pos(t)
    x, y = hero_pos(t)
    k = M.smoothstep(0.0, T_END, t)
    fxp = FRAME_X[0] + (FRAME_X[1] - FRAME_X[0]) * k + _fx_bump(t * M.FPS + F0)
    fyp = 100.0 - (FRAME_Y[0] + (FRAME_Y[1] - FRAME_Y[0]) * k)
    yaw = psi(t) - 180.0 - math.degrees(math.atan((fxp - 50.0) / 50.0 * TAN_H))
    elev = math.degrees(math.atan2(CAR_DIMS[2] / 2 - cz, math.hypot(x - cx, y - cy)))
    pitch = elev - math.degrees(math.atan((fyp - 50.0) / 50.0 * TAN_V))
    return yaw, pitch


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
SKID_FRAMES = (12, 40)                  # la gomme marque tant que la dérive dépasse ~20° (images de scène)


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
        print(f"{f:2d} berline ({p['x']:5.1f},{p['y']:5.1f}) {HERO.v(t) * 3.6:3.0f} km/h dérive {hero_slip(t):5.1f} | "
              f"cam ({cx:5.1f},{cy:5.1f},{cz:3.1f}) {cam_d(t):4.1f} m lacet {yaw:6.1f} ({rate:5.1f}°/s) site "
              f"{pitch:5.1f} | x {(x0 + x1) / 2:3.0f} y {(y0 + y1) / 2:3.0f} l {x1 - x0:3.0f} à {d:4.1f} m, "
              f"derr. {behind_angle(t):3.0f}° | hélico "
              + (f"{hp[0]:3.0f},{hp[1]:3.0f}" if hp else "--") + " | pat. " + (f"{pk[0]:4.0f}" if pk else "--")
              + (" entière" if patrol_seen(f) else ""))
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
    print(f"entrée de l'arc {T_IN * M.FPS + F0:.1f}, sortie {T_OUT * M.FPS + F0:.1f}")
