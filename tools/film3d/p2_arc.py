# Le plan P2 écrit une fois, indépendant du décor (docs/cinematique-decoupage-v3.md §4 P2, « le dérapage, sous le
# nez de la deuxième patrouille ») : la trajectoire de la berline et des deux patrouilles, et la caméra de
# poursuite. Chaque décor (le carrefour de la scène A en socle, scene_carrefour.py ; le rond-point, scène F) ne
# donne qu'une pose : où tombe le repère de l'arc chez lui (origine et lacet). Rien ici ne lit Blender.
#
# Repère de l'arc : la berline arrive sur l'axe x = 0 en roulant vers +y ; à l'origine, elle entre dans un grand
# virage à gauche de 30 m de rayon (centre en (-30, 0)). Un point de l'arc à l'angle θ : (-30 + 30 cos θ, 30 sin θ),
# cap (-sin θ, cos θ). Au-delà de 90°, la sortie : la droite y = 30 vers -x, la voie de la rue des enseignes qui
# s'éloigne du rond-point. Le plan v3 : 48 images à 70 km/h, de s = +11,9 m (23° d'arc) à s = +50 m (2,9 m dans la
# rue) : la fin dans l'axe de la rue, pour le lien vers P3.
# Dans la scène F, l'îlot du rond-point est en (-5 ; 27,95) de ce repère, la bouche de l'avenue nord en y ≈ 43-47.
import math

R = 30.0                    # rayon du virage
SPEED = 70 / 3.6            # m/s
FRAMES = 48
F0 = 1
FPS = 24.0
T_END = (FRAMES - 1) / FPS
V3 = True                   # les plafonds v3 des tests (test_motion, motion.py mesure) s'appliquent à ce plan
S_END = 50.0                # m : l'abscisse de la berline à la dernière image, 2,9 m après la fin de l'arc
S_START = S_END - SPEED * T_END     # 11,9 m, 23° d'arc
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


# --- la patrouille 1 (celle d'OUV et de P1), à gauche de la berline. Elle roule sur une route intérieure de P1_R
# (4,2 m à l'intérieur de la ligne de la berline : plus près, le nez de la berline, qui glisse vers la gauche,
# venait à moins de 1,5 m), le nez un peu devant le sien, à la même vitesse : sur l'arc plus court, elle tient
# l'intérieur et reste entière au bord gauche du cadre (6–26 % à l'image 1, 0–15 % vers 34), puis remet un
# peu les gaz à la sortie de l'arc.
P1_R = 25.8
P1_S0 = 16.5                # m : son abscisse à la première image, sur sa route
P1_BRAKE = (0.0, 0.0, 0.0)          # début, durée (s), décélération (m/s²) : pas de freinage
P1_PUSH = (t_of(20), 0.4, 4.0)      # la remise des gaz : début, durée, accélération


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


# --- la patrouille 2 : elle descend l'avenue nord (x = P2_X) et, juste avant la première image, débouche de la
# bouche nord en glissant : sa route s'incurve vers le sud-ouest (une courbe de Bézier de P2_PATH, tangente à
# l'avenue), sa caisse se met en travers, elle s'arrête sur l'anneau, à l'ouest de l'îlot (hors de ses palmiers
# vus de la caméra), à 8,5 m de la route de la berline ; elle repart vers l'ouest à P2_T_GO. Sous la caméra haute, de l'image 1 à 14, elle glisse
# en travers devant à droite pendant que la berline arrive sur elle, puis sort du cadre par la droite : la berline
# passe à l'intérieur, la patrouille l'a ratée.
P2_X = -8.5
P2_PATH = ((P2_X, 48.0), (P2_X, 41.0), (-15.0, 35.5))     # le début de la glisse, le point de contrôle, l'arrêt
P2_DECEL = 8.0              # m/s² en glissant
P2_T_SKID = t_of(-8)        # le début de la glisse (avant le plan)
P2_TURN = (t_of(-4), t_of(12), 95.0)    # la caisse tourne de la descente (cap 180) à presque en travers (85)
P2_T_GO, P2_GO = t_of(44), 3.0              # le départ, vers l'ouest (-x)


def _bezier(u):
    (ax, ay), (bx, by), (cx, cy) = P2_PATH
    v = 1.0 - u
    return v * v * ax + 2 * u * v * bx + u * u * cx, v * v * ay + 2 * u * v * by + u * u * cy


def _p2_table(n=200):
    pts = [_bezier(i / n) for i in range(n + 1)]
    acc = [0.0]
    for a, b in zip(pts, pts[1:]):
        acc.append(acc[-1] + math.dist(a, b))
    return acc


_P2_ACC = _p2_table()
P2_LEN = _P2_ACC[-1]                            # 14,4 m de glisse
P2_V0 = math.sqrt(2 * P2_DECEL * P2_LEN)        # 15,2 m/s (55 km/h) dans l'avenue
P2_T_STOP = P2_T_SKID + P2_V0 / P2_DECEL        # l'arrêt, à l'image 37
P2_STOP = P2_PATH[2]


def _p2_d(t):
    """La distance faite depuis le début de la glisse (m), négative avant (dans l'avenue)."""
    if t <= P2_T_SKID:
        return P2_V0 * (t - P2_T_SKID)
    tt = min(t, P2_T_STOP) - P2_T_SKID
    return P2_V0 * tt - P2_DECEL * tt * tt / 2


def patrol2_pos(t):
    d = _p2_d(t)
    if d <= 0:
        return P2_X, P2_PATH[0][1] - d
    n = len(_P2_ACC) - 1
    d = min(d, P2_LEN)
    i = min(n - 1, max(0, next((k for k in range(n) if _P2_ACC[k + 1] >= d), n - 1)))
    u = (i + (d - _P2_ACC[i]) / max(1e-9, _P2_ACC[i + 1] - _P2_ACC[i])) / n
    x, y = _bezier(u)
    if t > P2_T_GO:
        x -= P2_GO * (t - P2_T_GO) ** 2 / 2
    return x, y


def patrol2_heading(t):
    """Le cap de sa caisse : la descente (180°), mise en travers en glissant (85°)."""
    t0, t1, turn = P2_TURN
    return 180.0 - turn * _smooth(t0, t1, t)


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
    """{nom: cap(t)} des caisses des patrouilles (la 2 s'arrête de l'image 34 à 44)."""
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
# d'écart CHASE_TAU. À CHASE_Z, en plongée légère (site -13 à -14°, calculé pour le centre à y 55 %) : le toit et le capot donnent l'angle de glisse,
# la trace des pneus se lit en arc, les patrouilles passent par-dessus la berline. À la dernière image, le bras
# est dans l'axe de la rue des enseignes (cap 90°, à 0 m de côté) : la bouche de la rue au centre.
CHASE_BACK = (7.0, 7.0)     # m derrière le centre de la berline, à la première et à la dernière image
CHASE_LEFT = (-1.5, 0.0)    # m à sa gauche : 1,5 m à droite au début (la patrouille 1, à gauche, entre dans
                            # le cadre), dans l'axe de la berline à la fin
CHASE_PHI = (18.0, 90.0)    # degrés : le cap du bras (0 = +y ; positif vers la gauche ; 90 : l'axe de la rue)
CHASE_Z = 2.6               # m : à l'essai de 1,8, 2,2 et 2,6 (image 24), c'est d'ici que la glisse se lit le
                            # mieux à 390 px (le toit, l'angle de la caisse, la trace des pneus)
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


CHASE_U = ((1, 0.51), (24, 0.51), (48, 0.52))   # le centre de la boîte de la berline, depuis la gauche


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


_YAW_ENDS = {}
CHASE_YAW_MIX = 0.5         # la part de la visée image par image ajoutée au panoramique constant


def chase_yaw(t):
    """Le lacet : un panoramique à vitesse constante, de la visée de la première image à celle de la dernière (le
    centre de la berline flotte de quelques % entre les deux ; la visée image par image, elle, accélérait de 39 à
    47°/s quand la glisse se rattrape)."""
    key = (CHASE_PHI, CHASE_BACK, CHASE_LEFT, CHASE_Z, S_START)
    if key not in _YAW_ENDS:
        _YAW_ENDS.clear()
        _YAW_ENDS[key] = (_aim(0.0)[0], _aim(T_END)[0])
    a, b = _YAW_ENDS[key]
    return a + ((b - a + 180.0) % 360.0 - 180.0) * t / T_END


def camera_rail(t):
    """La caméra sans tremblé : (x, y, z, lacet, site, roulis, focale), en repère de l'arc (motion.key_camera)."""
    x, y, z = chase_pos(t)
    ya, pitch = chase_aim(t)
    yl = chase_yaw(t)
    yaw = yl + CHASE_YAW_MIX * ((ya - yl + 180.0) % 360.0 - 180.0)
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
