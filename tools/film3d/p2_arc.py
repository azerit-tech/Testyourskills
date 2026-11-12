# Le plan P2 écrit une fois, indépendant du décor (docs/cinematique-decoupage-v3.md §4 P2, « le dérapage, sous le
# nez de la deuxième patrouille ») : la trajectoire de la berline et des deux patrouilles, et la caméra de
# poursuite. Chaque décor (le carrefour de la scène A en socle, scene_carrefour.py ; le rond-point, scène F) ne
# donne qu'une pose : où tombe le repère de l'arc chez lui (origine et lacet). Rien ici ne lit Blender.
#
# Repère de l'arc : la berline arrive sur l'axe x = 0 en roulant vers +y ; à l'origine, elle entre dans un grand
# virage à gauche de 30 m de rayon (centre en (-30, 0)). Un point de l'arc à l'angle θ : (-30 + 30 cos θ, 30 sin θ),
# cap (-sin θ, cos θ). Le plan v3 : 48 images à 70 km/h, de s = -4 m (4 m avant l'arc) à s = +34 m (65° d'arc).
# Dans la scène F, l'îlot du rond-point est en (-5 ; 27,95) de ce repère, la bouche de l'avenue nord en y ≈ 43-47.
import math

R = 30.0                    # rayon du virage
SPEED = 70 / 3.6            # m/s
FRAMES = 48
F0 = 1
FPS = 24.0
T_END = (FRAMES - 1) / FPS
V3 = True                   # les plafonds v3 des tests (test_motion, motion.py mesure) s'appliquent à ce plan
S_START = -4.0              # m : l'abscisse de la berline à la première image
S_END = S_START + SPEED * T_END     # 34,1 m, 65° d'arc
DRIFT = 25.0                # degrés : l'arrière glisse vers l'extérieur, la caisse pointe plus à gauche que sa route
STILL = 0.5                 # l'instant de l'image fixe, de 0 (début du plan) à 1 (fin) : la glisse tenue

# le profil de la glisse, aux images du découpage v3 : installée à 12° de 1 à 6 (depuis 4°, le coup de reins sur
# la droite d'arrivée), jetée à 25° de 6 à 10, tenue jusqu'à 34, rattrapée à 8° de 34 à 48 avec la remise des gaz
SLIP_KEYS = ((1, 4.0), (6, 12.0), (10, DRIFT), (34, DRIFT), (48, 8.0))

# l'ancien drone (scene_carrefour.drone, le socle de la scène A), gardé tel quel
CAM_THETA = 37.0            # la verticale du drone, sur l'arc
CAM_Z = 40.0                # m
CAM_LENS = 35.0             # mm
CAM_YAW0, CAM_TURN = 40.0, 10.0


def _smooth(a, b, x):
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * (3 - 2 * u)


def t_of(frame):
    return (frame - F0) / FPS


def point(s, r=R):
    """Position et cap (x, y, cap en degrés, 0 = +y, positif vers la gauche) à l'abscisse s le long d'une route
    concentrique de rayon r (la droite d'arrivée en x = r - R, puis l'arc, puis au-delà de 90° la sortie vers -x)."""
    off = r - R
    if s < 0:
        return off, s, 0.0
    th = s / r
    if th > math.pi / 2:
        return -R - (s - r * math.pi / 2), r, 90.0
    return -R + r * math.cos(th), r * math.sin(th), math.degrees(th)


def s_of(theta_deg):
    return R * math.radians(theta_deg)


def slip_of_frame(f):
    """La dérive de la caisse (degrés) à l'image (décimale) f : SLIP_KEYS reliées en S."""
    return _keys(SLIP_KEYS, f)


def s_hero(t):
    return S_START + SPEED * t


def frame_of_s(s):
    """L'image (décimale) où le centre de la berline passe à l'abscisse s."""
    return F0 + FPS * (s - S_START) / SPEED


def slip_of_s(s):
    """La dérive de la caisse (degrés) à l'abscisse s de la route."""
    return slip_of_frame(frame_of_s(s))


def hero_pos(t):
    return point(s_hero(t))[:2]


def hero_slip(t):
    """La dérive de la caisse (degrés, positive : la caisse pointe plus à gauche que sa route)."""
    return slip_of_frame(F0 + t * FPS)


# --- la patrouille 1 (celle d'OUV et de P1), toujours à gauche de la berline. Elle roule sur une route intérieure
# de P1_R (4,2 m à l'intérieur de la ligne de la berline : à 2 m, comme au découpage, sa caisse passait sur
# l'objectif, 1,5 m à gauche ; plus près, le nez de la berline, qui glisse vers la gauche, venait à moins de
# 1,5 m). Au bord gauche à l'image 1 (0–8 % du cadre), elle freine à l'entrée du virage et tient le bord (la caméra
# tourne avec la berline : elle ne sort pas du cadre), puis remet les gaz : elle grandit par la gauche de 38 à 48.
P1_R = 25.8
P1_S0 = -5.5                # m : son abscisse à la première image
P1_BRAKE = (t_of(2), 0.6, 9.0)      # début, durée (s), décélération (m/s²)
P1_PUSH = (t_of(22), 0.9, 10.0)     # la remise des gaz : début, durée, accélération


def _ramp_int(t, t0, d):
    """∫0^t clamp(τ - t0, 0, d) dτ."""
    if t <= t0:
        return 0.0
    if t <= t0 + d:
        return (t - t0) ** 2 / 2
    return d * d / 2 + d * (t - t0 - d)


def p1_s(t):
    b0, bd, ba = P1_BRAKE
    p0, pd, pa = P1_PUSH
    return P1_S0 + SPEED * t - ba * _ramp_int(t, b0, bd) + pa * _ramp_int(t, p0, pd)


# --- la patrouille 2 : elle descend l'avenue nord, débouche derrière les palmiers de l'îlot, freine en travers et
# s'arrête dans la bouche nord, puis repart vers l'ouest. Repère de l'arc (la bouche nord de la scène F en
# x -12 à 2, y ≥ 43) ; la voie qui descend : x = P2_X. La caméra tourne avec la berline : la bouche nord passe
# derrière la berline à l'écran de l'image 14 à 26 et n'est à sa droite que de 26 à 40 ; la glisse en travers y
# est donc mise (l'arrêt à 36), et non de 14 à 22 comme à la fiche, où la berline la cachait.
P2_X = -8.5
P2_STOP = (-8.5, 45.5)      # l'arrêt, dans la bouche nord
P2_V0 = 7.0                 # m/s quand la caisse commence à se mettre en travers (image 17)
P2_DECEL = 9.0              # m/s² : elle glisse jusqu'à l'arrêt (47 km/h à l'image 1)
P2_T_STOP = t_of(36)        # l'arrêt
P2_T_GO, P2_GO = t_of(44), 3.0              # le départ, vers l'ouest (-x)
P2_TURN = 95.0              # degrés : la caisse tourne de la descente (cap 180) à presque en travers (cap 85)


def _p2_dist(t):
    """La distance qui reste à faire jusqu'à l'arrêt (m), négative au-delà (le départ)."""
    if t < P2_T_STOP:
        tr = P2_T_STOP - t
        return P2_DECEL * tr * tr / 2
    return 0.0


def patrol2_pos(t):
    x, y = P2_STOP
    if t < P2_T_STOP:
        return x, y + _p2_dist(t)
    if t > P2_T_GO:
        return x - P2_GO * (t - P2_T_GO) ** 2 / 2, y
    return x, y


def patrol2_heading(t):
    """Le cap de sa caisse : la descente (180°) tournée vers l'ouest en freinant, en travers à l'arrêt."""
    u = 1.0 - min(1.0, max(0.0, _p2_dist(t) / (P2_V0 * P2_V0 / (2 * P2_DECEL))))
    return 180.0 - P2_TURN * u * u * (3 - 2 * u)


def patrol_pos(i):
    if i == 0:
        return lambda t: point(p1_s(t), P1_R)[:2]
    return patrol2_pos


def patrol_slip(i):
    """La patrouille 1 glisse à peine (4°) dans le virage ; la patrouille 2 a son cap propre (patrol_heading)."""
    def f(t):
        u = min(1.0, max(0.0, (p1_s(t) + 2.0) / 6.0))
        return 4.0 * u * u * (3 - 2 * u)
    return f if i == 0 else None


def patrol_heading(i):
    return patrol2_heading if i == 1 else None


def tracks():
    """{nom: pos(t)} des trois véhicules en repère de l'arc (pour vérifier les distances)."""
    return {"hero": hero_pos, "patrol_1": patrol_pos(0), "patrol_2": patrol_pos(1)}


def patrol1_heading(t):
    return point(p1_s(t), P1_R)[2] + patrol_slip(0)(t)


def tracks_heading():
    """{nom: cap(t)} des caisses des patrouilles (la 2 s'arrête de l'image 33 à 44)."""
    return {"patrol_1": patrol1_heading, "patrol_2": patrol2_heading}


def cars(t=STILL):
    """Les trois véhicules à l'instant t du plan (0 à 1) : {nom: (x, y, cap de la route, lacet de la caisse)} en
    repère de l'arc."""
    tt = t * T_END
    out = {}
    x, y, h = point(s_hero(tt))
    out["hero"] = (x, y, h, h + hero_slip(tt))
    x, y, h = point(p1_s(tt), P1_R)
    out["patrol_1"] = (x, y, h, h + patrol_slip(0)(tt))
    x, y = patrol2_pos(tt)
    out["patrol_2"] = (x, y, patrol2_heading(tt), patrol2_heading(tt))
    return out


def wheel_track(lx, ly, t=STILL, step=0.5):
    """Le sillage d'une roue de la berline dans l'eau, du début du plan jusqu'à l'instant t (0 à 1) : la liste des
    points (x, y) en repère de l'arc. (lx, ly) : la roue dans le repère de la caisse (avant vers -y, comme les
    modèles posés dans la rue). Les roues arrière s'écartent de la trace des roues avant, vers l'extérieur."""
    s0, s1 = S_START - 6.0, s_hero(t * T_END)
    out = []
    n = max(2, int((s1 - s0) / step))
    for i in range(n + 1):
        s = s0 + (s1 - s0) * i / n
        x, y, h = point(s)
        a = math.radians(h + slip_of_s(s) + 180.0)
        out.append((x + lx * math.cos(a) - ly * math.sin(a), y + lx * math.sin(a) + ly * math.cos(a)))
    return out


# --- la caméra de poursuite (découpage v3 : de dos, à l'intérieur du virage), à CHASE_Z. Elle tient au bout d'un
# bras accroché au centre de la berline : CHASE_BACK derrière, CHASE_LEFT à gauche (vers l'intérieur du virage),
# le bras tournant à vitesse constante de CHASE_PHI[0] à CHASE_PHI[1] (de la droite d'arrivée vers la sortie ouest)
# et ses longueurs variant à vitesse constante. Une caméra sur la route de la berline, quelques mètres derrière,
# prenait le virage 0,5 s après elle : 13 m/s² d'accélération par rapport à la berline à l'entrée de l'arc ; le bras
# n'en garde que la rotation lente (L ω², 3 m/s²). Lacet et site posent le centre de la boîte de la berline à
# CHASE_U (depuis la gauche) et CHASE_FRAME_Y (depuis le haut, comme les fiches), lissés par une gaussienne
# d'écart CHASE_TAU.
CHASE_BACK = (8.3, 8.3)     # m derrière le centre de la berline, à la première et à la dernière image
CHASE_LEFT = (1.5, 1.2)     # m à sa gauche
CHASE_PHI = (0.0, 62.0)     # degrés : le cap du bras (0 = la droite d'arrivée, +y ; positif vers la gauche)
CHASE_Z = 0.5
CHASE_LENS = 21.0
CHASE_TAU = 0.25            # s
CHASE_FRAME_Y = 0.55
HERO_MID_Z = 0.725          # m : le milieu de la boîte de la berline (motion.HERO_BOX)
SHAKE = 0.12 * 24.0 / CHASE_LENS    # degrés : le tremblé v3 à cette focale


def keyed(keys, t):
    """La valeur de clés (image, valeur) à l'instant t, reliées en S, tenues au-delà."""
    return _keys(keys, F0 + t * FPS)


def _keys(keys, f):
    if f <= keys[0][0]:
        return keys[0][1]
    for (fa, a), (fb, b) in zip(keys, keys[1:]):
        if f <= fb:
            return a + (b - a) * _smooth(fa, fb, f)
    return keys[-1][1]


def _lin(pair, t):
    return pair[0] + (pair[1] - pair[0]) * t / T_END


def chase_pos(t):
    """La caméra de poursuite, sans tremblé : (x, y, z) en repère de l'arc (le bout du bras)."""
    back, left = _lin(CHASE_BACK, t), _lin(CHASE_LEFT, t)
    ph = math.radians(_lin(CHASE_PHI, t))
    fx, fy = -math.sin(ph), math.cos(ph)
    hx, hy = hero_pos(t)
    return hx - back * fx - left * fy, hy - back * fy + left * fx, CHASE_Z


CHASE_U = ((1, 0.50), (24, 0.52), (48, 0.52))   # le centre de la boîte de la berline, depuis la gauche


def _u_target(t):
    return keyed(CHASE_U, t)


def hero_heading(t):
    return point(s_hero(t))[2] + hero_slip(t)


def _aim(t):
    """Le lacet et le site qui posent la boîte de la berline (motion.hero_screen) à (_u_target, CHASE_FRAME_Y)."""
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
        yaw += math.degrees(math.atan(2.0 * (box["u"] - _u_target(t)) * 10.125 / CHASE_LENS))
        pitch -= math.degrees(math.atan(2.0 * (box["v"] - CHASE_FRAME_Y) * 18.0 / CHASE_LENS))
    return yaw, pitch


def chase_aim(t, n=12):
    """Le lacet et le site de la caméra : la visée _aim lissée par une gaussienne d'écart CHASE_TAU (± 2 écarts,
    2n + 1 points) ; la rotation démarre et s'arrête amortie."""
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
    """La caméra de P2 : camera_rail plus le tremblé v3 (motion.handheld, 0,12° à 24 mm)."""
    import motion as M
    x, y, z, yaw, pitch, roll, lens = camera_rail(t)
    dyaw, dpitch, droll, ddx, ddy, ddz = M.handheld(t, amp=SHAKE, rotor=0.04, seed=2.7)
    return x + ddx, y + ddy, z + ddz, yaw + dyaw, pitch + dpitch, roll + droll, lens


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
