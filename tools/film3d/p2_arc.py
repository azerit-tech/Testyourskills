# Le plan P2 écrit une fois, indépendant du décor (docs/cinematique-decoupage-v3.md §4 P2, « le dérapage, sous le
# nez de la deuxième patrouille », repris au découpage v3.1 : « une voiture qui roule vrai ») : la trajectoire de la
# berline et des deux patrouilles, et la caméra de poursuite. Chaque décor (le carrefour de la scène A en socle,
# scene_carrefour.py ; le rond-point, scène F) ne donne qu'une pose : où tombe le repère de l'arc chez lui (origine
# et lacet). Rien ici ne lit Blender.
#
# Repère de l'arc : la berline arrive sur l'axe x = 0 en roulant vers +y (cap 0) et tourne à gauche de 90° vers la
# droite y = Y_EXIT, qu'elle suit vers -x (cap 90) : la voie de la rue des enseignes qui s'éloigne du rond-point.
# Le virage : une clothoïde d'entrée (la courbure monte de 0 à 1/R sur LC_IN m), l'arc de R m, une clothoïde de
# sortie (LC_OUT m) ; courbure continue, aucun raccord sec. Dans la scène F, l'îlot du rond-point est en
# (-5 ; 27,95) de ce repère, la bouche de l'avenue nord en y ≈ 43-47.
#
# Découpage v3.1 (route mouillée, berline lourde des années 60) : 6,5 m/s² de côté au plus, 7 de freinage, 3
# d'accélération, 7,5 les deux ensemble, 12 m/s³ d'à-coup, 120 °/s² d'accélération de lacet. La berline arrive
# en freinant (le nez plonge, les feux stop), relâche le frein en entrant dans le virage, l'arrière part vers
# l'extérieur quand l'adhérence passe 5,5 m/s², les roues avant contre-braquent, la glisse mange la vitesse, se
# résorbe avec un petit retour de l'autre côté, et la berline remet les gaz dans l'axe de la rue. Un quart de tour
# à 6 m/s² prend 3,5 s à 13,5 m/s : le plan dure ce que la physique demande (FRAMES).
import math

R = 30.0                    # rayon de l'arc
LC_IN, LC_OUT = 17.0, 14.0  # m : les clothoïdes d'entrée et de sortie
LA = R * math.pi / 2 - (LC_IN + LC_OUT) / 2     # m : l'arc entre les deux
S_EXIT = LC_IN + LA + LC_OUT                    # m : la fin de la clothoïde de sortie (cap 90°)
Y_EXIT = R                  # la droite de sortie (y = +2,05 dans la scène F : la voie qui s'éloigne de l'îlot)
FRAMES = 134
F0 = 1
FPS = 24.0
T_END = (FRAMES - 1) / FPS
V31 = True                  # le découpage v3.1 (cadre commun, voiture vraie) : vaut aussi V3
V3 = True                   # les plafonds v3 des tests (test_motion, motion.py mesure) s'appliquent à ce plan
STILL = 0.29  # l'instant de l'image fixe, de 0 (début du plan) à 1 (fin) : la glisse tenue

# la vitesse : V0 à la première image ; l'accélération le long de la route, clés (s, m/s²) reliées en droite (à-coup
# borné). Le freinage avant l'îlot, relâché dans la clothoïde d'entrée (le frein traîné : latéral et freinage ensemble
# sous 7,5) ; la glisse freine encore un peu ; les gaz dans la clothoïde de sortie.
V0 = 17.5                   # m/s (63 km/h)
S0 = -3.0                   # m : la berline à la première image, 3 m avant l'entrée du virage
ACC_KEYS = ((-0.5, 0.0), (0.0, -3.5), (0.4, -6.0), (0.55, -6.0), (1.0, -4.3), (1.35, -3.6), (1.8, -1.2), (2.3, -0.8), (2.8, 2.0), (6.0, 2.0))
# la glisse (degrés, positive : la caisse pointe plus à gauche que sa route), clés (t, angle) reliées en cosinus
DRIFT = 15.0
SLIP_KEYS = ((0.25, 0.0), (1.3, DRIFT), (1.75, DRIFT), (2.9, 0.0))


def t_of(frame):
    return (frame - F0) / FPS


def _smooth(a, b, x):
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)


def _cos_keys(keys, x):
    """Clés (x, valeur) reliées en demi-cosinus (vitesse nulle aux clés), tenues au-delà."""
    if x <= keys[0][0]:
        return keys[0][1]
    for (xa, a), (xb, b) in zip(keys, keys[1:]):
        if x <= xb:
            return a + (b - a) * 0.5 * (1.0 - math.cos(math.pi * (x - xa) / (xb - xa)))
    return keys[-1][1]


# ---------------------------------------------------------------- la route

def theta(s):
    """Le cap de la route (radians, positif vers la gauche) à l'abscisse s (0 : l'entrée de la clothoïde)."""
    if s <= 0.0:
        return 0.0
    if s <= LC_IN:
        return s * s / (2.0 * R * LC_IN)
    if s <= LC_IN + LA:
        return LC_IN / (2.0 * R) + (s - LC_IN) / R
    if s <= S_EXIT:
        u = s - LC_IN - LA
        return LC_IN / (2.0 * R) + LA / R + (u - u * u / (2.0 * LC_OUT)) / R
    return math.pi / 2


def curvature(s):
    if s <= 0.0 or s >= S_EXIT:
        return 0.0
    if s <= LC_IN:
        return s / (R * LC_IN)
    if s <= LC_IN + LA:
        return 1.0 / R
    return (S_EXIT - s) / (R * LC_OUT)


_GL = ((-0.9061798459386640, 0.2369268850561891), (-0.5384693101056831, 0.4786286704993665),
       (0.0, 0.5688888888888889), (0.5384693101056831, 0.4786286704993665), (0.9061798459386640, 0.2369268850561891))
_DS = 0.5


def _integ(a, b):
    """∫ (-sin θ, cos θ) ds de a à b (Gauss-Legendre à 5 points)."""
    h, m = (b - a) / 2.0, (a + b) / 2.0
    x = y = 0.0
    for u, w in _GL:
        th = theta(m + h * u)
        x -= w * math.sin(th)
        y += w * math.cos(th)
    return x * h, y * h


def _table():
    pts = [(0.0, 0.0)]
    n = int(math.ceil(S_EXIT / _DS))
    for i in range(n):
        dx, dy = _integ(i * _DS, min(S_EXIT, (i + 1) * _DS))
        pts.append((pts[-1][0] + dx, pts[-1][1] + dy))
    return pts


_TAB = _table()
Y_IN = Y_EXIT - _TAB[-1][1]     # l'entrée du virage sur la droite x = 0
X_OUT = _TAB[-1][0]             # la fin de la clothoïde de sortie sur la droite y = Y_EXIT


def point(s, r=R):
    """(x, y, cap en degrés) à l'abscisse s de la route de la berline ; r ≠ R : la route décalée de R - r vers
    l'intérieur du virage (les patrouilles), à la même abscisse."""
    if s <= 0.0:
        x, y = 0.0, Y_IN + s
    elif s >= S_EXIT:
        x, y = X_OUT - (s - S_EXIT), Y_EXIT
    else:
        i = min(int(s / _DS), len(_TAB) - 2)
        dx, dy = _integ(i * _DS, s)
        x, y = _TAB[i][0] + dx, Y_IN + _TAB[i][1] + dy
    th = theta(s)
    d = R - r
    if d:
        x, y = x - d * math.cos(th), y - d * math.sin(th)
    return x, y, math.degrees(th)


# ---------------------------------------------------------------- la vitesse

def _profile(keys, v0, s0):
    """Les nœuds (t, a, pente, v, s) d'une accélération par morceaux droits, v0 et s0 à t = 0."""
    ks = [(-10.0, keys[0][1])] + list(keys) + [(100.0, keys[-1][1])]
    nodes = [(ks[0][0], ks[0][1], 0.0, 0.0, 0.0)]
    for (ta, a), (tb, b) in zip(ks, ks[1:]):
        _, _, _, v, s = nodes[-1]
        d = tb - ta
        k = (b - a) / d if d > 0 else 0.0
        nodes[-1] = (ta, a, k, v, s)
        nodes.append((tb, b, 0.0, v + a * d + k * d * d / 2, s + v * d + a * d * d / 2 + k * d ** 3 / 6))
    out = _eval(nodes, 0.0)
    dv = v0 - out[1]
    ds = s0 - out[2] - dv * (0.0 - ks[0][0])
    return [(t, a, k, v + dv, s + ds + dv * (t - ks[0][0])) for (t, a, k, v, s) in nodes]


def _eval(nodes, t):
    i = 0
    while i + 1 < len(nodes) - 1 and nodes[i + 1][0] <= t:
        i += 1
    ta, a, k, v, s = nodes[i]
    d = t - ta
    return a + k * d, v + a * d + k * d * d / 2, s + v * d + a * d * d / 2 + k * d ** 3 / 6


_HERO = _profile(ACC_KEYS, V0, S0)


def s_hero(t):
    return _eval(_HERO, t)[2]


def hero_speed(t):
    return _eval(_HERO, t)[1]


def hero_accel(t):
    return _eval(_HERO, t)[0]


S_START = s_hero(0.0)


def frame_of_s(s):
    """L'image (décimale) où le centre de la berline passe à l'abscisse s (la vitesse reste positive)."""
    lo, hi = -2.0, T_END + 2.0
    for _ in range(50):
        mid = (lo + hi) / 2
        if s_hero(mid) < s:
            lo = mid
        else:
            hi = mid
    return F0 + FPS * lo


def hero_pos(t):
    return point(s_hero(t))[:2]


def hero_slip(t):
    """La glisse de la caisse (degrés, positive : la caisse pointe plus à gauche que sa route)."""
    return _cos_keys(SLIP_KEYS, t)


def slip_of_s(s):
    return hero_slip((frame_of_s(s) - F0) / FPS)


def slip_of_frame(f):
    return hero_slip((f - F0) / FPS)


def hero_heading(t):
    return point(s_hero(t))[2] + hero_slip(t)


def stop_frames():
    """Les fenêtres (première, dernière image) où la berline freine à plus de 2 m/s² (les feux stop)."""
    out, cur = [], None
    for f in range(F0, F0 + FRAMES):
        on = hero_accel(t_of(f)) < -2.0
        if on and cur is None:
            cur = f
        if not on and cur is not None:
            out.append((cur, f - 1))
            cur = None
    if cur is not None:
        out.append((cur, F0 + FRAMES - 1))
    return out


# ---------------------------------------------------------------- les patrouilles

# la patrouille 1 (celle d'OUV et de P1), à gauche de la berline : sur la route décalée de P1_IN m vers l'intérieur
# du virage, avec son propre profil de vitesse le long de cette route (P1_ACC_KEYS) ; elle ne glisse pas.
P1_IN = 3.4
P1_R = R - P1_IN
P1_V0 = 15.0  # m/s à la première image
P1_S0 = 8.0  # m : son abscisse (route de la berline) à la première image
P1_ACC_KEYS = ((-0.9, 0.0), (-0.4, -5.0), (0.2, -5.0), (0.6, -3.0), (2.6, -1.2), (3.2, 2.5), (6.0, 2.5))


def _p1_sigma_table(n=2000):
    """L'abscisse σ le long de la route décalée, en fonction de celle de la berline : dσ = (1 - κ d) ds."""
    out = [(0.0, 0.0)]
    ds = S_EXIT / n
    for i in range(n):
        s = (i + 0.5) * ds
        out.append(((i + 1) * ds, out[-1][1] + (1.0 - curvature(s) * P1_IN) * ds))
    return out


_P1_SIG = _p1_sigma_table()
_P1 = _profile(P1_ACC_KEYS, P1_V0, P1_S0)


def _s_of_sigma(sig):
    if sig <= 0.0:
        return sig
    last = _P1_SIG[-1]
    if sig >= last[1]:
        return last[0] + sig - last[1]
    lo, hi = 0, len(_P1_SIG) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if _P1_SIG[m][1] < sig:
            lo = m
        else:
            hi = m
    (sa, ga), (sb, gb) = _P1_SIG[lo], _P1_SIG[hi]
    # entre deux nœuds, dσ/ds = 1 - κ d varie en droite : l'inverse d'un trinôme
    k0 = 1.0 - curvature(sa) * P1_IN
    k1 = 1.0 - curvature(sb) * P1_IN
    h = sb - sa
    c = (k1 - k0) / h
    g = sig - ga
    if abs(c) < 1e-12:
        return sa + g / k0
    return sa + (-k0 + math.sqrt(max(0.0, k0 * k0 + 2 * c * g))) / c


def p1_s(t):
    """L'abscisse de la patrouille 1, comptée sur la route de la berline."""
    return _s_of_sigma(_eval(_P1, t)[2])


def patrol1_heading(t):
    return point(p1_s(t), P1_R)[2]


# la patrouille 2 : elle descend l'avenue nord (x = P2_X, cap 180), freine, tourne à sa droite en glissant et
# s'arrête en travers de la bouche nord, à l'ouest de l'îlot : la berline lui est passée devant. Sa conduite est
# celle de l'outil commun (motion.drive : freinage avant le virage, glisse installée et résorbée, contre-braquage) ;
# vue de la caméra, elle glisse devant, au-dessus du toit de la berline, des images 25 à 50.
P2_X = -8.5
P2_ROUTE = dict(start=(P2_X, 58.0, 180.0), pieces=[(10.0, 0.0), (12.0 * math.radians(55.0), -1.0 / 12.0), (0.5, 0.0)])
P2_SPEED = 14.0             # m/s voulus dans l'avenue (50 km/h)
_P2D = None


def _p2():
    global _P2D
    if _P2D is None:
        import motion as M
        _P2D = M.drive(P2_ROUTE, P2_SPEED, t0=0.0, stop=True, kind="patrol")
    return _P2D


def patrol2_pos(t):
    return tuple(_p2().pos(t))[:2]


def patrol2_heading(t):
    """Le cap de sa caisse (glisse comprise)."""
    return _p2().heading(t)


def patrol_pos(i):
    if i == 0:
        return lambda t: point(p1_s(t), P1_R)[:2]
    return patrol2_pos


def patrol_slip(i):
    """La patrouille 1 ne glisse pas ; la patrouille 2 a son cap propre (patrol_heading)."""
    return (lambda t: 0.0) if i == 0 else None


def patrol_heading(i):
    return patrol2_heading if i == 1 else None


def tracks():
    """{nom: pos(t)} des trois véhicules en repère de l'arc (pour vérifier les distances)."""
    return {"hero": hero_pos, "patrol_1": patrol_pos(0), "patrol_2": patrol_pos(1)}


def tracks_heading():
    """{nom: cap(t)} des caisses des patrouilles."""
    return {"patrol_1": patrol1_heading, "patrol_2": patrol2_heading}


def cars(t=STILL):
    """Les trois véhicules à l'instant t du plan (0 à 1) : {nom: (x, y, cap de la route, lacet de la caisse)} en
    repère de l'arc."""
    tt = t * T_END
    out = {}
    x, y, h = point(s_hero(tt))
    out["hero"] = (x, y, h, h + hero_slip(tt))
    x, y, h = point(p1_s(tt), P1_R)
    out["patrol_1"] = (x, y, h, h)
    x, y = patrol2_pos(tt)
    out["patrol_2"] = (x, y, patrol2_heading(tt), patrol2_heading(tt))
    return out


def wheel_track(lx, ly, t=STILL, step=0.5):
    """La trace d'une roue de la berline, du début du plan jusqu'à l'instant t (0 à 1) : la liste des points (x, y)
    en repère de l'arc. (lx, ly) : la roue dans le repère de la caisse (avant vers -y, comme les modèles posés dans
    la rue). Les roues arrière s'écartent de la trace des roues avant, vers l'extérieur."""
    s0, s1 = S_START - 6.0, s_hero(t * T_END)
    out = []
    n = max(2, int((s1 - s0) / step))
    for i in range(n + 1):
        s = s0 + (s1 - s0) * i / n
        x, y, h = point(s)
        a = math.radians(h + slip_of_s(s) + 180.0)
        out.append((x + lx * math.cos(a) - ly * math.sin(a), y + lx * math.sin(a) + ly * math.cos(a)))
    return out


# ---------------------------------------------------------------- la caméra de poursuite (cadre commun v3.1)
#
# À CHASE_Z au-dessus de la chaussée, CHASE_BACK derrière le centre de la berline, CHASE_LEFT à sa gauche, le long du
# cap de sa VITESSE pris avec un retard doux (un second ordre amorti d'écart CHASE_LAG) : dans le virage, elle passe
# un peu à l'extérieur. Elle prend aussi une part (CHASE_SLIP) de la glisse de la caisse : vue d'une caméra qui ne
# suit que la vitesse, la berline en travers de 16° s'élargit de 40 % à l'écran (le cadre commun en tolère 15). Lacet
# et site posent le centre de la boîte de la berline à CHASE_U (depuis la gauche) et CHASE_FRAME_Y (depuis le haut),
# lissés par une gaussienne d'écart CHASE_TAU. 24 mm. Aucun tremblé écrit : celui de l'opérateur vient de motion.py.
CHASE_BACK = 7.5
CHASE_BACK_SLIP, CHASE_BACK_SIG = 0.9, 0.55    # m de recul en pleine glisse ; le lissage de ce recul (s)
CHASE_LEFT = 0.3                # m : le centre du bras un peu à gauche (la patrouille 1)
CHASE_Z = 2.4
CHASE_LENS = 24.0
CHASE_LAG = 0.05            # s : le retard du cap
CHASE_SIG = 0.4             # s : le lissage du cap (gaussienne)
CHASE_SLIP = 0.3            # la part de la glisse que la caméra suit
CHASE_TAU = 0.25            # s
CHASE_FRAME_Y = 0.58
CHASE_U = ((0.0, 0.50), (4.0, 0.50), (5.5, 0.535))   # (t, centre depuis la gauche) : à la fin, vers la coupe de P3
HERO_MID_Z = 0.725          # m : le milieu de la boîte de la berline (motion.HERO_BOX)


def _travel(t):
    return theta(s_hero(t)) + CHASE_SLIP * math.radians(hero_slip(t))


def chase_heading(t, n=24):
    """Le cap de la caméra (radians) : celui de la vitesse de la berline (plus CHASE_SLIP de sa glisse), pris
    CHASE_LAG s plus tôt et lissé par une gaussienne d'écart CHASE_SIG : le bras tourne sans à-coup (son
    accélération angulaire, × 7,5 m, reste sous les 4 m/s² de l'écart à la berline)."""
    sig = CHASE_SIG
    acc = wsum = 0.0
    for k in range(-n, n + 1):
        u = 3.0 * sig * k / n
        w = math.exp(-0.5 * (u / sig) ** 2)
        acc += w * _travel(t - CHASE_LAG + u)
        wsum += w
    return acc / wsum


def chase_pos(t):
    """La caméra de poursuite, sans tremblé : (x, y, z) en repère de l'arc."""
    ph = chase_heading(t)
    fx, fy = -math.sin(ph), math.cos(ph)
    hx, hy = hero_pos(t)
    back = chase_back(t)
    return hx - back * fx - CHASE_LEFT * fy, hy - back * fy + CHASE_LEFT * fx, CHASE_Z


def chase_back(t):
    """La distance derrière la berline : CHASE_BACK, plus CHASE_BACK_SLIP m quand la caisse est en travers (vue de
    trois quarts, elle s'élargit à l'écran ; la caméra recule d'autant, en douceur)."""
    sig, n = CHASE_BACK_SIG, 16
    acc = wsum = 0.0
    for k in range(-n, n + 1):
        u = 3.0 * sig * k / n
        w = math.exp(-0.5 * (u / sig) ** 2)
        acc += w * abs(hero_slip(t + u))
        wsum += w
    return CHASE_BACK + CHASE_BACK_SLIP * acc / wsum / DRIFT


def _aim(t):
    """Le lacet et le site qui posent la boîte de la berline (motion.hero_screen) à (CHASE_U, CHASE_FRAME_Y)."""
    import motion as M
    x, y, z = chase_pos(t)
    hx, hy = hero_pos(t)
    yaw = math.degrees(math.atan2(-(hx - x), -(hy - y)))   # motion.key_camera : 0 regarde -y, positif vers -x
    pitch = math.degrees(math.atan2(HERO_MID_Z - z, math.hypot(hx - x, hy - y)))
    head = hero_heading(t)
    for _ in range(3):
        box = M.hero_screen((x, y, z, yaw, pitch, 0.0, CHASE_LENS), hx, hy, 0.0, head)
        if not box:
            break
        yaw += math.degrees(math.atan(2.0 * (box["u"] - _cos_keys(CHASE_U, t)) * 10.125 / CHASE_LENS))
        pitch -= math.degrees(math.atan(2.0 * (box["v"] - CHASE_FRAME_Y) * 18.0 / CHASE_LENS))
    return yaw, pitch


def chase_aim(t, n=12):
    """Le lacet et le site de la caméra : la visée _aim lissée par une gaussienne d'écart CHASE_TAU (± 2 écarts,
    2n + 1 points)."""
    y0, p0 = _aim(t)
    ay = ap = wsum = 0.0
    for k in range(-n, n + 1):
        dt = 2.0 * CHASE_TAU * k / n
        w = math.exp(-0.5 * (dt / CHASE_TAU) ** 2)
        yy, pp = _aim(t + dt)
        ay += w * ((yy - y0 + 180.0) % 360.0 - 180.0)
        ap += w * (pp - p0)
        wsum += w
    return y0 + ay / wsum, p0 + ap / wsum


def camera_rail(t):
    """La caméra sans tremblé : (x, y, z, lacet, site, roulis, focale), en repère de l'arc (motion.key_camera)."""
    x, y, z = chase_pos(t)
    yaw, pitch = chase_aim(t)
    return x, y, z, yaw, pitch, 0.0, CHASE_LENS


def camera(t):
    """La caméra de P2 : camera_rail telle quelle (v3.1 : le tremblé est celui de l'opérateur, motion.py)."""
    return camera_rail(t)


# ---------------------------------------------------------------- l'ancien drone (scene_carrefour.drone, la scène A)
CAM_THETA = 37.0            # la verticale du drone, sur l'arc
CAM_Z = 40.0                # m
CAM_LENS = 35.0             # mm
CAM_YAW0, CAM_TURN = 40.0, 10.0


def s_of(theta_deg):
    """L'abscisse où la route atteint le cap theta_deg (degrés)."""
    lo, hi = 0.0, S_EXIT
    for _ in range(50):
        mid = (lo + hi) / 2
        if math.degrees(theta(mid)) < theta_deg:
            lo = mid
        else:
            hi = mid
    return lo


def drone_camera(t=STILL):
    """(x, y, z, lacet en degrés, focale) : l'ancien drone à la verticale (scene_carrefour.drone)."""
    x, y, _ = point(s_of(CAM_THETA))
    return x, y, CAM_Z, CAM_YAW0 + CAM_TURN * t, CAM_LENS


def drone_yaw(t):
    return CAM_YAW0 + CAM_TURN * t / T_END


def to_scene(pose, x, y, heading=0.0):
    """Passe un point (et un cap, en degrés) du repère de l'arc au repère d'une scène : pose = (ox, oy, lacet)."""
    ox, oy, yaw = pose
    a = math.radians(yaw)
    return (ox + x * math.cos(a) - y * math.sin(a), oy + x * math.sin(a) + y * math.cos(a), heading + yaw)
