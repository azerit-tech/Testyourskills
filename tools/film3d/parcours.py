# Le parcours unique de la berline : une seule conduite pour tout le film à six étoiles, découpée aux coupes.
# Chaque plan en lit une fenêtre de temps, posée dans sa scène par une rotation et une translation : la berline et
# la caméra quittent un plan dans l'état exact où elles entrent dans le suivant. Python pur.
import math

import motion as M

FPS = 24.0
SHOTS = (("OUV", 40), ("P1", 48), ("P2", 110), ("P3", 48), ("P4", 48), ("P5", 60), ("P6", 60))
START, _f = {}, 0                 # première image globale de chaque plan (0 = OUV/1)
for _n, _d in SHOTS:
    START[_n] = _f
    _f += _d
TOTAL = _f                        # 414

# ---- le profil (abscisses en m depuis OUV/1)
V_OUV, V1, V_FAR = 50 / 3.6, 16.4, 30.0     # l'avenue ; avant le rond-point ; jamais atteinte : elle accélère
S_GO = 31.0                                 # elle met les gaz
# le rond-point : début nominal, rayon, angle (à gauche). 90° : ses branches sont à angle droit, la rue des enseignes
# part plein nord quand l'avenue file vers l'est (plan de ville) ; 64° auparavant
S_ARC2, R2, A2 = 65.0, 30.0, 90.0
VA2, B2 = 12.4, 10.0                        # vitesse d'arc, où elle la demande (m après S_ARC2) : le plan B de la
                                            # feuille (§7), une glisse plus franche (−14 % de vitesse)
G2 = R2 * math.radians(A2) - 9.51           # où elle remet les gaz : 9,51 m avant la fin nominale de l'arc, comme à
                                            # 64° (24,0 m) ; 37,61 m à 90°
# le port (à droite) : 22 m de rayon au lieu de 15 (feuille §9.1). Le terre-plein est une dalle nue ; sur les 60
# images de P5 la berline reste à 4,1 m des poteaux de chaîne, 7,2 m des caisses, 8,6 m des conteneurs, 9,1 m des
# séparateurs, la caméra à 4,6 m des poteaux (mesuré avec le rond-point à 64°). Le rond-point à 90° la rend plus
# lente à sa sortie (13,13 m/s, sa longitudinale +0,5 au lieu de +2,3 : le quart de cercle de plus se roule à la
# latérale) : P3 sort à 17,23 m/s (18,17), P4 freine dès son image 40 (35), P5 entre à 18,86 (18,14) et sort à 10,06,
# P6 sort à 15,50 (15,96).
S_ARC5, R5, A5 = S_ARC2 + R2 * math.radians(A2) + 83.49, 22.0, 50.0  # 83,49 m de droite entre les deux arcs : 195,61
VA5 = math.sqrt(6.5 * 0.92 * R5)            # 11,47 m/s : la latérale visée par motion.drive sur ce rayon
B5, G5 = 5.0 * R5 / 15.0, 9.0 * R5 / 15.0   # le freinage traîné et la remise des gaz, à l'échelle du rayon
E5_GAIN = 1.15                              # l'entrée du port adoucie de 15 % : 105 °/s² de lacet de caisse (120)
TAIL = 80.0
LIM = dict(slip_per=16.0, slip_drag=0.14, slip_hold=0.4, slip_max=15.0)
# Dans l'anneau (P2), la glisse retombe encore à 4,4 m/s² de latérale, sous l'adhérence (5,5) : le petit retour de
# l'autre côté de motion.drive (2,5° visés, 2,95 atteints à P2/67) y croissait sans adhérence dépassée. Un retour
# qui naîtrait pendant P2 n'est pas joué par la caisse (motion.drive, slip_back_off) : la glisse s'y résorbe d'un
# seul tenant, sans repasser de l'autre côté (12,2° à P2/41, 1,2 à P2/61, 0,02 à P2/99) ; son freinage (0,4 m/s²
# au plus pendant 0,45 s) est gardé : la vitesse, la route au temps et les lieux ne bougent pas.
# Le retour du port (P5 → P6) reste joué.
LIM["slip_back_off"] = (START["P2"] / FPS, (START["P2"] + dict(SHOTS)["P2"]) / FPS)
JERK = 12.0 * 0.72


def _ease(radius):
    """La longueur d'adoucissement d'un arc : celle que motion.drive prendrait pour lui seul."""
    lat = LIM.get("lat", 6.5) * LIM.get("margin", 0.92)
    return max(2.0, lat * math.sqrt(lat * radius) / JERK)       # 9,27 m pour 30 m ; 6,55 m pour 15 m


def _route(pieces, ds=0.1):
    """pieces = [(longueur, courbure, adoucissement)] : chaque arc lissé par deux moyennes glissantes de SA longueur
    (motion.make_route n'en prend qu'une pour toute la route : l'arc de 15 m y perdait son rayon). La courbure d'un
    arc est corrigée de l'arrondi de sa longueur au pas : il tourne de son angle exact (90,00° et non 89,95)."""
    n = sum(max(1, int(round(L / ds))) for L, _, _ in pieces)
    kappa, i = [0.0] * n, 0
    for L, k, ease in pieces:
        m = max(1, int(round(L / ds)))
        if k:
            k *= L / (m * ds)
            w = max(1, int(round(ease / ds)) | 1)
            pad = 2 * w
            raw = [0.0] * (i + pad) + [k] * m + [0.0] * (n - i - m + pad)
            sm = M._box(M._box(raw, w), w)[pad:pad + n]
            kappa = [a + b for a, b in zip(kappa, sm)]
        i += m
    return M.Route(0.0, 0.0, 0.0, kappa, ds)


def _drive():
    """(la route abstraite, la conduite)."""
    l2, l5 = R2 * math.radians(A2), R5 * math.radians(A5)
    e2, e5 = _ease(R2), _ease(R5) * E5_GAIN
    route = _route([(S_ARC2, 0.0, 0.0), (l2, 1.0 / R2, e2), (S_ARC5 - S_ARC2 - l2, 0.0, 0.0), (l5, -1.0 / R5, e5),
                    (TAIL, 0.0, 0.0)])
    speed = [(0.0, V_OUV), (S_GO, V_OUV), (S_GO + 0.1, V1),
             (S_ARC2 + B2 - 0.1, V1), (S_ARC2 + B2, VA2), (S_ARC2 + G2, VA2), (S_ARC2 + G2 + 0.1, V_FAR),
             (S_ARC5 + B5 - 0.1, V_FAR), (S_ARC5 + B5, VA5), (S_ARC5 + G5, VA5), (S_ARC5 + G5 + 0.1, V_FAR)]
    return route, M.drive(route, speed, t0=0.0, kind="hero", lim=LIM, ease=max(e2, e5),
                          t_span=(-2.0, TOTAL / FPS + 2.5))


ROUTE, DRIVE = _drive()


def t_of(shot, frame):
    """L'instant du parcours (s depuis OUV/1) de l'image `frame` (1 = la première) du plan."""
    return (START[shot] + frame - 1) / FPS


CAP_B = A2                                     # la droite après le rond-point : +90° exacts (la route le tient)
CAP_D = A2 - A5                                # la droite après le port : +40°
# plan : (référence, où la berline s'y trouve dans la scène, cap de la droite de la scène qui monte vers +y) ; la
# référence est une image du plan (un entier : là où la berline passe à cette image) ou ("s", abscisse) : un point
# de la route, quelle que soit la vitesse. P2 et P5 s'ancrent sur la droite qui précède leur virage, 20 m avant son
# début nominal : le virage reste à sa place dans la scène quand le profil de vitesse change.
# La route est la vraie chaussée d'une seule ville (SPEC §18.36, docs/cinematique-plan-de-ville.md) : chaque lieu y
# est posé en inversant son ancre, et la berline passe d'un plan au suivant sans ellipse, sauf à P3 → P4 (la montée
# du pont, CONTINU plus bas).
#  - OUV : son image 41 (celle qui suivrait la dernière) est la première de P1 : même pose que P1 sur l'avenue, OUV
#    et P1 sont une seule prise (auparavant 20,85 m d'avenue sautés, OUV/1 en y 244,00).
#  - P2 : la berline arrive dans la voie de l'avenue (x 1,75, comme en OUV et P1) et sort du rond-point sur y = 0,35
#    de son repère (l'îlot en (0, 0)), la voie de P3 ; son arc passe à 5,1 m de la bordure de l'îlot (rayon 6 m).
#  - P4 : sa dernière image au pied de la rampe du pont (l'image suivante est P5/1), dans la voie du pont où le plan
#    de face cadre le tablier ouvert (x 1,80) ; le port, posé par la voie de P5 (x 5,25 dans son repère), s'y décale.
_Y_EXIT2 = ROUTE.at(S_ARC2 + R2 * math.radians(A2) + 15.0)[1]     # la droite de sortie du rond-point (route) : y
ANCHOR = {
    "OUV": (1 + 40, (1.75, 288.0), 0.0),
    "P1": (1, (1.75, 288.0), 0.0),
    "P2": (("s", S_ARC2 - 20.0), (1.75, 0.35 - (_Y_EXIT2 - (S_ARC2 - 20.0))), 0.0),          # (1,75 ; −49,81)
    "P3": (36, (0.35, 123.30), CAP_B),
    "P4": (48, (1.80, -5.69), CAP_B),
    "P5": (("s", S_ARC5 - 20.0), (5.25, 35.066), CAP_B),
    "P6": (60, (81.75, 344.42), CAP_D),
}


def placer(shot):
    """(to_scene(x, y), cap) : la transformation du parcours vers la scène du plan, et le cap à retrancher."""
    ref, (tx, ty), cap = ANCHOR[shot]
    ax, ay = ROUTE.at(ref[1])[:2] if isinstance(ref, tuple) else DRIVE.pos(t_of(shot, ref))
    c, s = math.cos(math.radians(cap)), math.sin(math.radians(cap))

    def to_scene(x, y):
        dx, dy = x - ax, y - ay
        return tx + c * dx + s * dy, ty - s * dx + c * dy
    return to_scene, cap


# ---- la ville : chaque plan dans son lieu, chaque lieu posé sur la route ; les coupes continues ou en ellipse
LIEU = {"OUV": "A", "P1": "A", "P2": "F", "P3": "B", "P4": "C", "P5": "E", "P6": "D"}   # la scène de chaque plan
# CONTINU[(A, B)] : B reprend la conduite de A à l'image suivante, au même point de la ville (position, cap, vitesse
# de A prolongé d'une image = ceux de B/1). Seule ellipse : P3 → P4, la montée du pont (SAUT m de vraie route).
CONTINU = {(a, b): (a, b) != ("P3", "P4") for (a, _), (b, _) in zip(SHOTS, SHOTS[1:])}
# Le repère de ville est celui du pont (scène C, celle de P4) : la moitié de l'eau (P4, P5, P6) y est posée par la
# route elle-même. La moitié de la ville (OUV à P3) y est posée par la rue des enseignes (scène B, celle de P3) :
# son axe sur l'axe du pont, son mur de quai (s = 181) sur la rive du pont (y = −325) ; plan de ville, section (b).
B_VILLE = (0.0, -506.0)


def _to_route(shot):
    """L'inverse de placer : la scène du plan vers le parcours."""
    ref, (tx, ty), cap = ANCHOR[shot]
    ax, ay = ROUTE.at(ref[1])[:2] if isinstance(ref, tuple) else DRIVE.pos(t_of(shot, ref))
    c, s = math.cos(math.radians(cap)), math.sin(math.radians(cap))
    return lambda x, y: (ax + c * (x - tx) - s * (y - ty), ay + s * (x - tx) + c * (y - ty))


def vers_ville(shot):
    """(to_ville(x, y), rot) : la scène du plan vers le repère de ville ; rot (degrés, sens trigonométrique) : la
    rotation de la scène dans la ville (p_ville = R(rot) p_scène + t)."""
    back = _to_route(shot)
    if START[shot] < START["P4"]:
        fwd, cap = placer("P3")
        bx, by = B_VILLE
    else:
        (fwd, cap), bx, by = placer("P4"), 0.0, 0.0

    def to_ville(x, y):
        u, v = fwd(*back(x, y))
        return u + bx, v + by
    return to_ville, ANCHOR[shot][2] - cap


def pose_ville(shot):
    """(rot, tx, ty) : la pose du lieu du plan dans le repère de ville, p_ville = R(rot) p_lieu + (tx, ty)."""
    f, rot = vers_ville(shot)
    return (rot,) + f(0.0, 0.0)


def _saut(a, b):
    """(le long, en travers) : ce qui sépare la place de A prolongé d'une image de celle de B/1, dans la ville (m,
    le long du cap de B et à sa droite)."""
    na = dict(SHOTS)[a]
    (fa, _), (fb, rb) = vers_ville(a), vers_ville(b)
    (xa, ya), (xb, yb) = fa(*hero(a)["pos"](na + 1)), fb(*hero(b)["pos"](1))
    h = math.radians(hero(b)["travel"](1) + rb)
    dx, dy = xb - xa, yb - ya
    return -math.sin(h) * dx + math.cos(h) * dy, math.cos(h) * dx + math.sin(h) * dy


def hero(shot):
    """Les fonctions de l'image du plan (décimale admise) : pos (scène), heading et travel (degrés, 0 = +y de la
    scène, positif à gauche), slip, steer, speed, along, alat."""
    to_scene, cap = placer(shot)
    t = lambda f: t_of(shot, f)                                    # noqa: E731
    return dict(pos=lambda f: to_scene(*DRIVE.pos(t(f))), heading=lambda f: DRIVE.heading(t(f)) - cap,
                travel=lambda f: DRIVE.travel(t(f)) - cap, slip=lambda f: DRIVE.slip(t(f)),
                steer=lambda f: DRIVE.steer(t(f)), speed=lambda f: DRIVE.speed(t(f)),
                along=lambda f: DRIVE.along(t(f)), alat=lambda f: DRIVE.alat(t(f)))


SAUT = {k: _saut(*k) for k, v in CONTINU.items() if not v}   # {(A, B): (m sautés le long, m en travers, à droite)}


# ---- le bras commun de la caméra : deux pôles (tau 0,12 s) sur le cap de la vitesse, filtrés sur tout le parcours
CAM_TAU, CAM_BACK, CAM_LEFT, CAM_Z = 0.12, 7.5, 0.3, 2.4
_H, _T0 = 1.0 / 240.0, -1.5


# À l'entrée de l'anneau (P2), le cap de la vitesse prend 24°/s en une seconde : le bras à deux pôles y tournait à
# 35°/s², 4,67 m/s² par rapport à la berline au bout de ses 7,5 m (plafond 4). Là seulement, le bras filtré est
# lissé une seconde fois par une gaussienne centrée : elle n'ajoute aucun retard (une rotation régulière passe telle
# quelle) et ne rabote que l'accélération du bras (3,68 m/s² à P2/22). Son écart monte de 0 à CAM_SMOOTH_S sur la
# droite de la fin de P1 (images ON de P2, négatives : P1/25 à P1/41), où le bras ne tourne pas, puis redescend à 0
# pendant la sortie de glisse (images OFF) : le bras devance le virage de quelques images (0,1°/s à P1/48, 0,6 à
# P2/1) ; avant P1/25 et après P2/70 (la coupe P2 → P3 comprise), il est celui de tout le parcours.
CAM_SMOOTH_SHOT, CAM_SMOOTH_ON, CAM_SMOOTH_OFF, CAM_SMOOTH_S = "P2", (-24.0, -8.0), (40.0, 70.0), 0.22


def _smooth_sigma(t):
    """L'écart (s) de la gaussienne du bras à l'instant t du parcours."""
    f = t * FPS - START[CAM_SMOOTH_SHOT] + 1                      # l'image (décimale) de P2
    (a, b), (c, d) = CAM_SMOOTH_ON, CAM_SMOOTH_OFF
    return CAM_SMOOTH_S * M.smoothstep(a, b, f) * (1.0 - M.smoothstep(c, d, f))


def _cam_table():
    a1 = a2 = DRIVE.travel(_T0)
    out = []
    for k in range(int((TOTAL / FPS + 0.5 - _T0) / _H)):
        a = DRIVE.travel(_T0 + k * _H)
        a1 += (a - a1) * _H / CAM_TAU
        a2 += (a1 - a2) * _H / CAM_TAU
        out.append(a2)
    sm = list(out)
    for k in range(len(out)):
        sg = _smooth_sigma(_T0 + k * _H)
        if sg <= 1e-4:
            continue
        n = int(3.0 * sg / _H)
        num = den = 0.0
        for j in range(-n, n + 1):
            w = math.exp(-0.5 * (j * _H / sg) ** 2)
            num += w * out[max(0, min(len(out) - 1, k + j))]
            den += w
        sm[k] = num / den
    return sm


_CAM = _cam_table()


def cam_cap(shot, frame):
    """Le cap du bras (degrés, repère de la scène du plan) ; image décimale admise (interpolé à 1/240 s)."""
    u = (t_of(shot, frame) - _T0) / _H
    k = max(0, min(len(_CAM) - 2, int(math.floor(u))))
    f = max(0.0, min(1.0, u - k))
    return _CAM[k] + (_CAM[k + 1] - _CAM[k]) * f - placer(shot)[1]


def camera(shot, frame, back=CAM_BACK, left=CAM_LEFT, z=CAM_Z):
    """La position de la caméra dans la scène : `back` derrière le centre de la berline le long du bras, `left` à sa
    gauche. Le plan la vise comme aujourd'hui (la boîte de la berline en x 50 %, y 58 %)."""
    x, y = hero(shot)["pos"](frame)
    a = math.radians(cam_cap(shot, frame))
    fx, fy = -math.sin(a), math.cos(a)             # l'avant du bras ; sa gauche : (-fy, fx)
    return x - back * fx - left * fy, y - back * fy + left * fx, z


# ---- la visée commune : définie une fois, sur le temps du film, pour tous les plans du bras commun (OUV, P1, P2,
# P3, P5, P6). À sa première image et à l'image qui suivrait sa dernière, un plan pose la caméra du bras visée par
# visee() : la boîte de la berline (glisse comprise, motion.hero_screen) au centre VISEE_U depuis la gauche,
# VISEE_V depuis le haut, au 24 mm. Ce qu'un plan vise en propre (la berline décalée, un panoramique d'intention, une
# visée lissée) s'y ajoute par raccord() : son écart à la visée commune multiplié par fenetre(), nulle, de dérivée et
# de dérivée seconde nulles aux deux bouts du plan. Les deux côtés d'une coupe ont ainsi la même pose (le bras y est
# déjà le même) : avant, P1/48 → P2/1 sautait de 2,3° de lacet (la berline de 55 % à 50 %), P5 → P6 de 0,7° de
# lacet et 0,5° de site.
VISEE_U, VISEE_V, VISEE_LENS = 0.50, 0.58, 24.0
RACCORD_IMAGES = 18.0             # la longueur des fondus d'écart, en images, à chaque bout


VISEE_SIGMA = 0.25                # s : la visée exacte lissée (les coins de la boîte changent pendant une glisse)
_VQ = 4                           # échantillons par image
_VISEE = {}


def _visee_exacte(shot, frame):
    """(lacet, site) qui posent exactement la boîte de la berline à (VISEE_U, VISEE_V), depuis le bras commun."""
    h = hero(shot)
    x, y, z = camera(shot, frame)
    hx, hy = h["pos"](frame)
    head = h["heading"](frame)
    yaw = math.degrees(math.atan2(-(hx - x), -(hy - y)))
    pitch = math.degrees(math.atan2(M.HERO_BOX[2] / 2.0 - z, math.hypot(hx - x, hy - y)))
    for _ in range(8):
        cam = (x, y, z, yaw, pitch, 0.0, VISEE_LENS)
        b0 = M.hero_screen(cam, hx, hy, 0.0, head)
        if not b0:
            break
        bu = M.hero_screen((x, y, z, yaw + 0.05, pitch, 0.0, VISEE_LENS), hx, hy, 0.0, head)
        bv = M.hero_screen((x, y, z, yaw, pitch + 0.05, 0.0, VISEE_LENS), hx, hy, 0.0, head)
        eu, ev = VISEE_U - b0["u"], VISEE_V - b0["v"]
        if abs(eu) < 1e-7 and abs(ev) < 1e-7:
            break
        yaw += 0.05 * eu / (bu["u"] - b0["u"])
        pitch += 0.05 * ev / (bv["v"] - b0["v"])
    return yaw, pitch


def visee(shot, frame):
    """(lacet, site) en degrés (convention de motion.key_camera : 0 regarde -y, positif vers -x) de la visée commune
    à l'image `frame` du plan (décimale admise) : la visée exacte depuis le bras commun, lissée par une gaussienne
    centrée de VISEE_SIGMA sur le temps du film. Elle ne dépend que du bras et de la berline (tous deux posés par une
    rotation et une translation du parcours) et sa grille tombe sur les images : la même pose, au lacet de la
    rotation du lieu près, des deux côtés d'une coupe."""
    if shot not in _VISEE:
        n = dict(SHOTS)[shot]
        k0 = -40 * _VQ
        raw, prev = [], None
        for k in range(k0, (n + 40) * _VQ + 1):
            yaw, pitch = _visee_exacte(shot, 1.0 + k / _VQ)
            yaw = yaw if prev is None else prev + (yaw - prev + 180.0) % 360.0 - 180.0
            prev = yaw
            raw.append((yaw, pitch))
        sg = VISEE_SIGMA * FPS * _VQ
        m = int(3 * sg)
        wts = [math.exp(-0.5 * (j / sg) ** 2) for j in range(-m, m + 1)]
        tab = []
        for i in range(len(raw)):
            sy = sp = sw = 0.0
            for j, w in zip(range(-m, m + 1), wts):
                r = raw[max(0, min(len(raw) - 1, i + j))]
                sy, sp, sw = sy + w * r[0], sp + w * r[1], sw + w
            tab.append((sy / sw, sp / sw))
        _VISEE[shot] = (k0, tab)
    k0, tab = _VISEE[shot]
    u = (frame - 1.0) * _VQ - k0
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = min(1.0, max(0.0, u - k))
    return tuple(tab[k][j] + (tab[k + 1][j] - tab[k][j]) * f for j in range(2))


def _s5(u):
    u = min(1.0, max(0.0, u))
    return u * u * u * (10.0 - 15.0 * u + 6.0 * u * u)


RACCORDS = (("OUV", "P1"), ("P1", "P2"), ("P2", "P3"), ("P5", "P6"))   # les coupes continues du bras commun
_DEBUT, _FIN = {b for _, b in RACCORDS}, {a for a, _ in RACCORDS}


def fenetre(shot, frame):
    """0 à l'image 1 du plan si une coupe du bras commun y arrive, à l'image n + 1 s'il en part une (et au-delà), 1
    ailleurs ; montée et descente quintiques sur RACCORD_IMAGES : valeur, dérivée et dérivée seconde nulles à ces
    bouts. Les autres bouts (le début du film, P3 → P4 et P4 → P5 qui changent de caméra, la fin de P6 que la fin
    reprend) gardent la visée du plan."""
    n = dict(SHOTS)[shot]
    a = _s5((frame - 1.0) / RACCORD_IMAGES) if shot in _DEBUT else 1.0
    b = _s5((n + 1.0 - frame) / RACCORD_IMAGES) if shot in _FIN else 1.0
    return a * b


def raccord(shot, frame, cam):
    """La caméra `cam` (x, y, z, lacet, site, roulis, focale) d'un plan du bras commun, ramenée à la visée commune
    aux deux bouts : lacet, site et roulis = visée commune + écart propre × fenetre. La position reste celle du
    plan (le bras commun aux bouts), la focale doit être VISEE_LENS."""
    w = fenetre(shot, frame)
    if w >= 1.0:
        return tuple(cam)
    x, y, z, yaw, pitch, roll, lens = cam
    vy, vp = visee(shot, frame)
    dy = (yaw - vy + 180.0) % 360.0 - 180.0
    return x, y, z, vy + dy * w, vp + (pitch - vp) * w, roll * w, lens


def brake_windows(shot):
    """Les fenêtres des feux stop du plan, en images du plan : [(première, dernière)]."""
    return DRIVE.brake_windows(f0=1 - START[shot], frames=range(1, dict(SHOTS)[shot] + 1))


# ---- les états aux coupes, au niveau du module (indépendamment des plans) : les dérivées de motion.motion_state
# sur la fenêtre de chaque plan, prises vers l'intérieur du plan ; roulis et tangage de M.sample sur tout le parcours
FIXED_CAM = ("P4",)                # le plan de face, caméra fixe : pas de panoramique comparé
_BODY = {}


def body():
    """{image globale: pose de M.sample} sur tout le parcours (roulis, tangage) : ressorts chauffés avant OUV/1."""
    if not _BODY:
        ps = M.sample(DRIVE.pos, range(-12, TOTAL + 12), heading=DRIVE.heading, steer=DRIVE.steer, f0=0)
        _BODY.update({p["frame"]: p for p in ps})
    return _BODY


def state(shot, frame, side):
    """L'état de la berline et du bras à l'image `frame` du plan, dérivées d'ordre 2 décentrées prises dans le plan
    (side = -1 : en sortie, +1 : en entrée), comme motion.motion_state les prend sur les poses du plan."""
    h = hero(shot)
    fr = [frame + side * k for k in range(4)]
    dt = 1.0 / FPS
    xs, ys = zip(*(h["pos"](f) for f in fr))
    vx, vy = M._d1(xs, side, dt), M._d1(ys, side, dt)
    ax, ay = M._d2(xs, dt), M._d2(ys, dt)
    sp = math.hypot(vx, vy)
    ux, uy = vx / sp, vy / sp
    st = dict(speed=sp, along=ax * ux + ay * uy, alat=ux * ay - uy * ax, travel=M.heading_of(vx, vy))
    st["yaw"] = math.degrees(st["alat"] / sp)
    st["slip"] = M._unwrap(0.0, h["heading"](frame) - st["travel"])
    st["steer"] = h["steer"](frame)
    b = body()[START[shot] + frame - 1]
    st["roll"], st["pitch"] = b["roll"], b["pitch"]
    st["lamps"] = any(a <= frame <= z for a, z in brake_windows(shot))
    st["pan"] = None if shot in FIXED_CAM else M._d1([cam_cap(shot, f) for f in fr], side, dt)
    return st


def cut_states():
    """[(A, B, état de sortie de A, état d'entrée de B)] pour les six coupes de la poursuite."""
    return [(a, b, state(a, na, -1), state(b, 1, +1)) for (a, na), (b, _) in zip(SHOTS, SHOTS[1:])]


if __name__ == "__main__":         # python3 tools/film3d/parcours.py : les fenêtres et les états aux coupes
    for name, n in SHOTS:
        hh = hero(name)
        (x0, y0), (x1, y1) = hh["pos"](1), hh["pos"](n)
        print(f"{name:3s} v {hh['speed'](1):5.2f} → {hh['speed'](n):5.2f} m/s, cap {hh['travel'](1):+6.2f} → "
              f"{hh['travel'](n):+6.2f}°, ({x0:6.2f}, {y0:7.2f}) → ({x1:6.2f}, {y1:7.2f}), caméra "
              f"{tuple(round(v, 2) for v in camera(name, 1))} → {tuple(round(v, 2) for v in camera(name, n))}, "
              f"feux stop {brake_windows(name)}")
    print("\ncoupe         v              long           lat            lacet          glisse         braquage"
          "       roulis         tangage        feux  pano °/s")
    for a, b, sa, sb in cut_states():
        pan = lambda s: "fixe" if s["pan"] is None else f"{s['pan']:+5.1f}"          # noqa: E731
        print(f"{a:3s} → {b:3s}  " + "  ".join(f"{sa[k]:+6.2f}/{sb[k]:+6.2f}" for k in
                                              ("speed", "along", "alat", "yaw", "slip", "steer", "roll", "pitch"))
              + f"  {'X' if sa['lamps'] else '.'}/{'X' if sb['lamps'] else '.'}  {pan(sa)}/{pan(sb)}")
    print(f"\nla ville (repère du pont, scène C ; la rue des enseignes B en {B_VILLE}) : la pose de chaque lieu, "
          "p_ville = R(rot) p_lieu + t")
    for lieu in dict.fromkeys(LIEU.values()):
        shots = [n for n, _ in SHOTS if LIEU[n] == lieu]
        rot, tx, ty = pose_ville(shots[0])
        print(f"  {lieu} ({', '.join(shots)}) : rot {rot:+7.2f}°, t = ({tx:8.2f}, {ty:8.2f})")
    print("\nles coupes dans la ville : A prolongé d'une image contre B/1")
    for (a, na), (b, _) in zip(SHOTS, SHOTS[1:]):
        if CONTINU[(a, b)]:
            (fa, ra), (fb, rb) = vers_ville(a), vers_ville(b)
            pa, pb = fa(*hero(a)["pos"](na + 1)), fb(*hero(b)["pos"](1))
            dh = hero(a)["travel"](na + 1) + ra - hero(b)["travel"](1) - rb
            dv = hero(a)["speed"](na + 1) - hero(b)["speed"](1)
            print(f"  {a:3s} → {b:3s} continue : écart {math.dist(pa, pb):.1e} m, cap {dh:+.1e}°, vitesse {dv:+.1e} m/s, "
                  f"B/1 en ({pb[0]:.2f}, {pb[1]:.2f}) de la ville")
        else:
            print(f"  {a:3s} → {b:3s} ellipse : {SAUT[(a, b)][0]:.1f} m de route sautés, {SAUT[(a, b)][1]:+.2f} m "
                  "en travers (à droite)")
