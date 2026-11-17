# Le parcours unique de la berline : un seul trajet roulé en entier, de l'avenue à la pointe, sans saut (SPEC §18.53,
# 17 novembre 2026 : « il y a des coupes de plan en plein milieu, c'est pas fluide »). La route est la vraie chaussée
# de la ville (docs/cinematique-plan-de-ville.md) : l'avenue, le rond-point, la rue des enseignes, le quai, le pont
# (sa montée, sa crête, sa descente), le port, la jetée, la pointe. Une seule caméra, le bras commun de poursuite, de
# dos, à 2,4 m. Le rendu le découpe en tronçons (SHOTS : une scène par lieu, ses voisins chargés par ville.py) ; à
# chaque raccord la berline et la caméra ont exactement le même état des deux côtés : ce ne sont pas des coupes. Les
# six étoiles sont des instants de la conduite (ETOILES), pas des coupes. Python pur.
import math

import motion as M

FPS = 24.0

# ---- la route (abscisses s en m depuis la première image du film)
# Deux longueurs reprises du découpage d'avant (le 13 novembre), que la ville fixe : AV_AVANT, l'avenue roulée avant
# l'ancienne ouverture (la berline part de plus loin, déjà lancée) ; MONTEE, la montée du pont, autrefois sautée
# (l'ellipse de 329,89 m de P3 à P4), que la berline roule maintenant. Les abscisses d'avant se lisent donc s − AV_AVANT
# côté ville (l'avenue, le rond-point, la rue) et s − AV_AVANT − MONTEE côté eau (le pont, le port, la jetée).
AV_AVANT = 90.0
MONTEE = 329.913205                         # réglée pour que la rue tombe sur le quai (B_VILLE, test à 1 cm)
LANE = 1.45                                 # m : de l'axe de la rue (x 0,35) à la voie intérieure du pont (x 1,80)
# le rond-point (à gauche) : début nominal, rayon, angle. 90° : ses branches sont à angle droit (plan de ville)
S_ARC2, R2, A2 = 65.0 + AV_AVANT, 30.0, 90.0
L_ARC2 = R2 * math.radians(A2)
# la droite du rond-point au port : la rue (71 m), le boulevard du quai, le pont (320 m) jusqu'à son pied, le
# terre-plein ; la voie change de LANE m sur le plat du pont, de son début (y −320) à 70 m plus loin (LANE_S, LANE_L)
L_MID = 83.49 + MONTEE
S_DECK = 181.156654 - 314.31 + AV_AVANT + MONTEE     # l'abscisse du début du tablier (y −320 du pont)
LANE_S, LANE_L = S_DECK + 3.0, 35.0                  # où la voie change, la longueur de chacun de ses deux arcs
S_ARC5, R5, A5 = S_ARC2 + L_ARC2 + L_MID, 22.0, 50.0   # le virage du port (à droite)
L_ARC5 = R5 * math.radians(A5)
# la jetée (cap −50° dans la ville) puis l'arrivée sur la pointe : la berline file dans sa voie jusqu'au bout de la
# jetée (y_D 402, 2 m sur la pointe), tourne de ARR_A degrés à gauche sur ARR_R m et s'arrête ARR_END m plus loin, au
# cap où la fin à six étoiles la cerne (fin6_orbite)
S_P6_ANCRE = 244.726551 + AV_AVANT + MONTEE          # la berline en (81,75 ; 344,42) de la jetée (scène D)
S_JETEE_FIN = S_P6_ANCRE + (402.0 - 344.42)
ARR_R, ARR_A, ARR_END = 40.0, 25.0, 3.0
L_ARR = ARR_R * math.radians(ARR_A)
S_ARRET = S_JETEE_FIN + L_ARR + ARR_END              # le bout de la route : l'arrêt

# ---- le profil de vitesse (SPEC §18.53) : lancée sur l'avenue, pointes vers 130 km/h en ligne droite, freinage
# franc avant le rond-point et le virage du port, l'arrêt sur la pointe. motion.drive tient les limites de la berline
# sur route mouillée (latérale 6,5, freinage 7, accélération 3, cercle 7,5 m/s², à-coup 12 m/s³) : là où la vitesse
# voulue dépasse l'adhérence, elle freine plus tôt et plus fort, jamais l'inverse.
V_LANCEE = 100.0 / 3.6                      # la première image : déjà lancée
V_MAX = 130.0 / 3.6                         # la vitesse voulue en ligne droite (atteinte seulement sur le pont)
# le rond-point : vitesse d'arc, où elle la demande et où elle remet les gaz (m après S_ARC2, sortie de l'anneau)
VA2, B2, G2 = 13.4556, 10.0, 56.2252
# le port (à droite) : 22 m de rayon (feuille §9.1)
VA5 = math.sqrt(6.5 * 0.92 * R5)            # 11,47 m/s : la latérale visée par motion.drive sur ce rayon
B5, G5 = 5.0 * R5 / 15.0, 9.0 * R5 / 15.0   # le freinage traîné et la remise des gaz, à l'échelle du rayon
E5_GAIN = 1.15                              # l'entrée du port adoucie de 15 % : 105 °/s² de lacet de caisse (120)
V_POINTE = 50.0 / 3.6                       # la vitesse voulue en arrivant sur la pointe, avant l'arrêt
# ---- les deux dérapages du film, dessinés (motion.drive, lim["derapages"]) : une berline lourde à propulsion sur le
# mouillé, vue de dos par le bras commun (« le dérapage est mou », 13 novembre). Le conducteur la provoque : un appel
# bref (pied levé et un léger coup de volant vers l'extérieur, la caisse part de 1 à 2° du mauvais côté), puis
# l'arrière déchargé décroche, de 5° à la crête en une demi-seconde (70 à 80 °/s au plus fort), tenu une seconde
# contre-braqué, rattrapé en trois quarts de seconde (au port : un seul petit retour de l'autre côté, sans pompage).
# Les nœuds : (s depuis le passage de l'abscisse, glisse °, vitesse °/s) ; entre deux, des quintiques
# (motion._hermite5). La route ne change pas : la caisse pivote autour de son centre, qui garde sa trajectoire. Les
# pneus arrière qui frottent en travers freinent la voiture (slip_drag m/s² par degré) ; au rond-point le pied reste
# levé tant qu'elle glisse, au port elle tient le grand dérapage au tiers des gaz (une propulsion se tient en glisse à
# l'accélérateur) contre un frottement plus fort (0,097 m/s² par degré). Les roues avant : contre-braquage de
# 0,78 × la glisse (motion.drive, counter), 22 à 28° au plus fort. L'appel du rond-point à 5,4 m après le début de
# l'arc, celui du port 10,6 m avant le sien (le coup de volant avant le virage) : les places d'avant, sur la route.
DERAP2 = dict(s=S_ARC2 + 5.4, side=1.0, keys=[(0.0, 0.0, 0.0), (0.15, -1.2, 0.0), (0.42, 7.0, 70.0),
                                               (0.60, 19.6, 70.0), (0.85, 29.0, 0.0, -90.0), (1.50, 25.5, -14.0),
                                               (1.92, 8.0, -40.0), (2.32, 2.0, -6.0), (2.70, 0.0, 0.0)])
DERAP5 = dict(s=S_ARC5 - 10.6138898, side=-1.0, keys=[(0.0, 0.0, 0.0), (0.17, -1.6, 0.0), (0.47, 8.0, 80.0),
                                                       (0.67, 24.0, 80.0), (0.95, 36.0, 0.0, -110.0),
                                                       (1.62, 30.0, -14.0), (2.24, 9.0, -48.0), (2.70, -4.0, 0.0),
                                                       (3.22, 0.0, 0.0)], drag=0.0967, gas=0.3333)
LIM = dict(slip_drag=0.07, counter=0.78, derapages=[DERAP2, DERAP5])
JERK = 12.0 * 0.72
T_SPAN = (-2.0, 40.0)                       # s : la table de la conduite (au-delà de l'arrêt, elle reste arrêtée)


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
    """(la route, la conduite)."""
    e2, e5 = _ease(R2), _ease(R5) * E5_GAIN
    k_lane = LANE / LANE_L ** 2                       # deux arcs opposés de LANE_L m : LANE m vers la droite
    a_mid = LANE_S - (S_ARC2 + L_ARC2)
    route = _route([(S_ARC2, 0.0, 0.0), (L_ARC2, 1.0 / R2, e2), (a_mid, 0.0, 0.0), (LANE_L, -k_lane, 15.0),
                    (LANE_L, k_lane, 15.0), (L_MID - a_mid - 2 * LANE_L, 0.0, 0.0), (L_ARC5, -1.0 / R5, e5),
                    (S_JETEE_FIN - S_ARC5 - L_ARC5, 0.0, 0.0), (L_ARR, 1.0 / ARR_R, 8.0), (ARR_END, 0.0, 0.0)])
    speed = [(0.0, V_LANCEE), (0.1, V_MAX),
             (S_ARC2 + B2 - 0.1, V_MAX), (S_ARC2 + B2, VA2), (S_ARC2 + G2, VA2), (S_ARC2 + G2 + 0.1, V_MAX),
             (S_ARC5 + B5 - 0.1, V_MAX), (S_ARC5 + B5, VA5), (S_ARC5 + G5, VA5), (S_ARC5 + G5 + 0.1, V_MAX),
             (S_JETEE_FIN - 0.1, V_MAX), (S_JETEE_FIN, V_POINTE)]
    return route, M.drive(route, speed, t0=0.0, stop=True, kind="hero", drift=0.0, lim=LIM,
                          ease=max(e2, e5), t_span=T_SPAN)


ROUTE, DRIVE = _drive()
T_ARRET = DRIVE.t_stop                      # s : l'instant où elle s'arrête sur la pointe

# ---- les tronçons du rendu : une scène par lieu, sa fenêtre de la conduite (images). Leurs raccords tombent aux
# joints des lieux, là où la berline passe d'une scène à la suivante ; aucun n'est une coupe (même état des deux
# côtés, même monde : ville.py charge les voisins). Mesurés sur la conduite (python3 tools/film3d/parcours.py) ;
# test_motion.test_parcours vérifie qu'ils tombent où ils doivent.
SHOTS = (("OUV", 87), ("P1", 31), ("P2", 108), ("P3", 102), ("P4", 249), ("P5", 60), ("P6", 133))
START, _f = {}, 0                 # première image globale de chaque tronçon (0 = OUV/1)
for _n, _d in SHOTS:
    START[_n] = _f
    _f += _d
TOTAL = _f                        # la poursuite, jusqu'à l'entrée de la pointe
# la fin à six étoiles (fin6_orbite) prolonge la conduite sans coupe : le freinage, l'arrêt, puis l'orbite
START["FIN6"] = TOTAL
FIN6_FRAMES = 122

# ---- les six étoiles : des instants de la conduite (images globales, 0 = la première ; temps = image / 24). Le site
# les lit ici (une à cinq étoiles : l'image gelée sur place à l'instant de la dernière étoile gagnée ; six : la fin
# FIN6 prolonge la conduite). Chacune à un moment lisible de la route, test_motion.test_parcours les vérifie.
ETOILES = {
    1: 96,     # l'avenue, lancée (91 km/h), le rond-point en vue : 4,0 s
    2: 162,    # le rond-point, au plus fort du dérapage (29°) : 6,75 s
    3: 265,    # la rue des enseignes, la berline passe le barrage (s_B 126) : 11,0 s
    4: 478,    # le pont, la crête (130 km/h) : 19,9 s
    5: 604,    # le port, au plus fort du dérapage (36°) : 25,2 s
    6: 718,    # la jetée, l'eau des deux côtés (y_D 360) : 29,9 s
}
ETOILE_LIEUX = {1: "avenue", 2: "rond-point", 3: "barrage", 4: "pont", 5: "port", 6: "jetée"}


def t_of(shot, frame):
    """L'instant du parcours (s depuis OUV/1) de l'image `frame` (1 = la première) du tronçon."""
    return (START[shot] + frame - 1) / FPS


CAP_B = A2                                     # la droite après le rond-point : +90° exacts (la route le tient)
CAP_D = A2 - A5                                # la droite après le port : +40°
# tronçon : (référence, où la berline s'y trouve dans la scène, cap de la droite de la scène qui monte vers +y) ; la
# référence est un point de la route ("s", abscisse) : chaque lieu reste à sa place dans la ville quel que soit le
# profil de vitesse. Ce sont les ancres du 13 novembre (plan de ville §2.1), reportées en abscisses.
#  - OUV, P1 (l'avenue) : la berline en (1,75 ; 288,0) de la scène A 23,15 m après l'ancienne ouverture ;
#  - P2 : la voie de l'avenue (x 1,75), 20 m avant le début nominal du rond-point ; sortie sur y = 0,35 de son repère
#    (l'îlot en (0, 0)), la voie de P3 ;
#  - P3 : (0,35 ; 123,30) de la rue ; P4 : (1,80 ; −5,69) du pont, au pied de la rampe ; P5 : (5,25 ; 35,07) du port,
#    20 m avant le virage ; P6 : (81,75 ; 344,42) de la jetée.
_Y_EXIT2 = ROUTE.at(S_ARC2 + L_ARC2 + 15.0)[1]     # la droite de sortie du rond-point (route) : y
ANCHOR = {
    "OUV": (("s", 23.148148 + AV_AVANT), (1.75, 288.0), 0.0),
    "P1": (("s", 23.148148 + AV_AVANT), (1.75, 288.0), 0.0),
    "P2": (("s", S_ARC2 - 20.0), (1.75, 0.35 - (_Y_EXIT2 - (S_ARC2 - 20.0))), 0.0),          # (1,75 ; −49,81)
    "P3": (("s", 134.040859 + AV_AVANT), (0.35, 123.30), CAP_B),
    "P4": (("s", 181.156654 + AV_AVANT + MONTEE), (1.80, -5.69), CAP_B),
    "P5": (("s", S_ARC5 - 20.0), (5.25, 35.066), CAP_B),
    "P6": (("s", S_P6_ANCRE), (81.75, 344.42), CAP_D),
}
ANCHOR["FIN6"] = ANCHOR["P6"]


def placer(shot):
    """(to_scene(x, y), cap) : la transformation du parcours vers la scène du tronçon, et le cap à retrancher."""
    ref, (tx, ty), cap = ANCHOR[shot]
    ax, ay = ROUTE.at(ref[1])[:2]
    c, s = math.cos(math.radians(cap)), math.sin(math.radians(cap))

    def to_scene(x, y):
        dx, dy = x - ax, y - ay
        return tx + c * dx + s * dy, ty - s * dx + c * dy
    return to_scene, cap


# ---- la ville : chaque tronçon dans son lieu, chaque lieu posé sur la route
LIEU = {"OUV": "A", "P1": "A", "P2": "F", "P3": "B", "P4": "C", "P5": "E", "P6": "D", "FIN6": "D"}
# CONTINU[(A, B)] : B reprend la conduite de A à l'image suivante, au même point de la ville. Tous les raccords le
# sont : plus d'ellipse (la montée du pont est roulée).
CONTINU = {(a, b): True for (a, _), (b, _) in zip(SHOTS, SHOTS[1:])}
# Le repère de ville est celui du pont (scène C, celle de P4). La rue des enseignes (scène B) y tombe par la route
# elle-même : son axe sur l'axe du pont, son mur de quai (s = 181) sur la rive du pont (y = −325) ; MONTEE et LANE
# sont réglés pour cela (plan de ville, section (b)) ; test_motion le vérifie à 1 cm.
B_VILLE = (0.0, -506.0)


def _to_route(shot):
    """L'inverse de placer : la scène du tronçon vers le parcours."""
    ref, (tx, ty), cap = ANCHOR[shot]
    ax, ay = ROUTE.at(ref[1])[:2]
    c, s = math.cos(math.radians(cap)), math.sin(math.radians(cap))
    return lambda x, y: (ax + c * (x - tx) - s * (y - ty), ay + s * (x - tx) + c * (y - ty))


def vers_ville(shot):
    """(to_ville(x, y), rot) : la scène du tronçon vers le repère de ville ; rot (degrés, sens trigonométrique) : la
    rotation de la scène dans la ville (p_ville = R(rot) p_scène + t)."""
    back = _to_route(shot)
    fwd, cap = placer("P4")

    def to_ville(x, y):
        return fwd(*back(x, y))
    return to_ville, ANCHOR[shot][2] - cap


def pose_ville(shot):
    """(rot, tx, ty) : la pose du lieu du tronçon dans le repère de ville, p_ville = R(rot) p_lieu + (tx, ty)."""
    f, rot = vers_ville(shot)
    return (rot,) + f(0.0, 0.0)


def hero(shot):
    """Les fonctions de l'image du tronçon (décimale admise) : pos (scène), heading et travel (degrés, 0 = +y de la
    scène, positif à gauche), slip, steer, speed, along, alat."""
    to_scene, cap = placer(shot)
    t = lambda f: t_of(shot, f)                                    # noqa: E731
    return dict(pos=lambda f: to_scene(*DRIVE.pos(t(f))), heading=lambda f: DRIVE.heading(t(f)) - cap,
                travel=lambda f: DRIVE.travel(t(f)) - cap, slip=lambda f: DRIVE.slip(t(f)),
                steer=lambda f: DRIVE.steer(t(f)), speed=lambda f: DRIVE.speed(t(f)),
                along=lambda f: DRIVE.along(t(f)), alat=lambda f: DRIVE.alat(t(f)))


def frames(shot):
    """Le nombre d'images du tronçon (FIN6 compris)."""
    return FIN6_FRAMES if shot == "FIN6" else dict(SHOTS)[shot]


def s_of_t(t, _tab={}):
    """L'abscisse de la berline sur la route à l'instant t (s), au 1/240 de seconde (intégrale de sa vitesse)."""
    if not _tab:
        h, k0 = 1.0 / 240.0, int(T_SPAN[0] * 240.0)
        s, out = 0.0, {0: 0.0}
        for k in range(1, int(T_SPAN[1] * 240.0)):
            s += 0.5 * (DRIVE.speed((k - 1) * h) + DRIVE.speed(k * h)) * h
            out[k] = s
        s = 0.0
        for k in range(-1, k0 - 1, -1):
            s -= 0.5 * (DRIVE.speed((k + 1) * h) + DRIVE.speed(k * h)) * h
            out[k] = s
        _tab.update(out)
    u = t * 240.0
    k = int(math.floor(u))
    a, b = _tab.get(k), _tab.get(k + 1)
    if a is None or b is None:
        return _tab[max(_tab) if u > 0 else min(_tab)]
    return a + (b - a) * (u - k)


def t_of_s(s):
    """L'instant (s) où la berline passe l'abscisse s (dichotomie sur s_of_t)."""
    lo, hi = T_SPAN[0], T_ARRET
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if s_of_t(mid) < s:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


# ---- le bras commun de la caméra : deux pôles (tau 0,12 s) sur le cap de la vitesse, filtrés sur tout le parcours
CAM_TAU, CAM_BACK, CAM_LEFT, CAM_Z = 0.12, 7.5, 0.3, 2.4
_H, _T0 = 1.0 / 240.0, -1.5
# À l'entrée de l'anneau, le cap de la vitesse prend 24°/s en une seconde : le bras à deux pôles y tournait à
# 35°/s², 4,67 m/s² par rapport à la berline au bout de ses 7,5 m (plafond 4). Là seulement, le bras filtré est
# lissé une seconde fois par une gaussienne centrée : elle n'ajoute aucun retard (une rotation régulière passe telle
# quelle) et ne rabote que l'accélération du bras. Son écart monte de 0 à CAM_SMOOTH_S sur la droite avant l'anneau
# (abscisses CAM_SMOOTH_ON, où le bras ne tourne pas), puis redescend à 0 pendant la sortie de glisse (CAM_SMOOTH_OFF)
# : le bras devance le virage de quelques images ; ailleurs, il est celui de tout le parcours.
CAM_SMOOTH_ON = (36.802 + AV_AVANT, 47.261 + AV_AVANT)
CAM_SMOOTH_OFF = (77.704 + AV_AVANT, 92.895 + AV_AVANT)
CAM_SMOOTH_S = 0.22


def _smooth_sigma(t):
    """L'écart (s) de la gaussienne du bras à l'instant t du parcours."""
    s = s_of_t(t)
    (a, b), (c, d) = CAM_SMOOTH_ON, CAM_SMOOTH_OFF
    return CAM_SMOOTH_S * M.smoothstep(a, b, s) * (1.0 - M.smoothstep(c, d, s))


def _cam_table():
    a1 = a2 = DRIVE.travel(_T0)
    out = []
    t_end = (TOTAL + FIN6_FRAMES) / FPS + 1.0
    for k in range(int((t_end - _T0) / _H)):
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
    """Le cap du bras (degrés, repère de la scène du tronçon) ; image décimale admise (interpolé à 1/240 s)."""
    u = (t_of(shot, frame) - _T0) / _H
    k = max(0, min(len(_CAM) - 2, int(math.floor(u))))
    f = max(0.0, min(1.0, u - k))
    return _CAM[k] + (_CAM[k + 1] - _CAM[k]) * f - placer(shot)[1]


def camera(shot, frame, back=CAM_BACK, left=CAM_LEFT, z=CAM_Z):
    """La position de la caméra dans la scène : `back` derrière le centre de la berline le long du bras, `left` à sa
    gauche, `z` au-dessus de la chaussée (le tronçon y ajoute la hauteur de son sol)."""
    x, y = hero(shot)["pos"](frame)
    a = math.radians(cam_cap(shot, frame))
    fx, fy = -math.sin(a), math.cos(a)             # l'avant du bras ; sa gauche : (-fy, fx)
    return x - back * fx - left * fy, y - back * fy + left * fx, z


# ---- la visée commune : définie une fois, sur le temps du film, pour tous les tronçons. Elle pose la boîte de la
# berline (glisse comprise, motion.hero_screen) au centre VISEE_U depuis la gauche, VISEE_V depuis le haut, au 24 mm,
# depuis le bras commun. Depuis le 17 novembre, la caméra de chaque tronçon EST ce bras et cette visée, de la
# première à la dernière image : plus d'écart propre à un plan (fenetre() vaut 0 partout), donc la même pose des
# deux côtés de chaque raccord, par construction.
VISEE_U, VISEE_V, VISEE_LENS = 0.50, 0.58, 24.0
RACCORD_IMAGES = 18.0             # (gardé pour les modules qui le citent : plus d'écart propre à fondre)
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
    à l'image `frame` du tronçon (décimale admise) : la visée exacte depuis le bras commun, lissée par une gaussienne
    centrée de VISEE_SIGMA sur le temps du film. Elle ne dépend que du bras et de la berline (tous deux posés par une
    rotation et une translation du parcours) et sa grille tombe sur les images : la même pose, au lacet de la
    rotation du lieu près, des deux côtés d'un raccord."""
    if shot not in _VISEE:
        n = frames(shot)
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


def chase(shot, frame, ground=0.0):
    """(x, y, z, lacet, site, roulis, focale) : LA caméra du film à l'image `frame` du tronçon, le bras commun visé
    par la visée commune ; `ground` : la hauteur du sol sous la caméra (le pont)."""
    x, y, z = camera(shot, frame)
    yaw, pitch = visee(shot, frame)
    return x, y, z + ground, yaw, pitch, 0.0, VISEE_LENS


RACCORDS = tuple((a, b) for (a, _), (b, _) in zip(SHOTS, SHOTS[1:])) + (("P6", "FIN6"),)


def fenetre(shot, frame):
    """La part de l'écart propre d'un tronçon à la visée commune : nulle partout depuis le 17 novembre (une seule
    caméra, le bras commun, de la première à la dernière image)."""
    return 0.0


def raccord(shot, frame, cam):
    """La caméra `cam` (x, y, z, lacet, site, roulis, focale) d'un tronçon, ramenée à la visée commune : lacet et site
    de visee(), roulis nul. La position reste celle du tronçon (le bras commun), la focale doit être VISEE_LENS."""
    x, y, z, _yaw, _pitch, _roll, lens = cam
    vy, vp = visee(shot, frame)
    return x, y, z, vy, vp, 0.0, lens


def brake_windows(shot):
    """Les fenêtres des feux stop du tronçon, en images du tronçon : [(première, dernière)]."""
    return DRIVE.brake_windows(f0=1 - START[shot], frames=range(1, frames(shot) + 1))


# ---- les états aux raccords, au niveau du module (indépendamment des scènes) : les dérivées de motion.motion_state
# sur la fenêtre de chaque tronçon, prises vers l'intérieur ; roulis et tangage de M.sample sur tout le parcours
_BODY = {}


def body():
    """{image globale: pose de M.sample} sur tout le parcours (roulis, tangage) : ressorts chauffés avant OUV/1."""
    if not _BODY:
        ps = M.sample(DRIVE.pos, range(-12, TOTAL + FIN6_FRAMES + 12), heading=DRIVE.heading, steer=DRIVE.steer,
                      f0=0)
        _BODY.update({p["frame"]: p for p in ps})
    return _BODY


def state(shot, frame, side):
    """L'état de la berline et du bras à l'image `frame` du tronçon, dérivées d'ordre 2 décentrées prises dans le
    tronçon (side = -1 : en sortie, +1 : en entrée), comme motion.motion_state les prend sur les poses du plan."""
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
    st["pan"] = M._d1([cam_cap(shot, f) for f in fr], side, dt)
    return st


def cut_states():
    """[(A, B, état de sortie de A, état d'entrée de B)] pour les raccords de la poursuite et celui de FIN6."""
    return [(a, b, state(a, frames(a), -1), state(b, 1, +1)) for a, b in RACCORDS]


def mesures():
    """Les nombres du trajet : longueur (m), durées, vitesses (moyenne, pointe, minimum de chaque virage), glisses."""
    n = TOTAL
    sp = [DRIVE.speed(f / FPS) for f in range(n)]
    out = dict(longueur=s_of_t(T_ARRET), longueur_poursuite=s_of_t(n / FPS), images=n, secondes=n / FPS,
               arret=T_ARRET, moyenne=s_of_t(n / FPS) / (n / FPS), pointe=max(sp))
    for nom, s0, s1 in (("rond-point", S_ARC2 - 10.0, S_ARC2 + L_ARC2 + 10.0),
                        ("port", S_ARC5 - 10.0, S_ARC5 + L_ARC5 + 10.0)):
        ta, tb = t_of_s(s0), t_of_s(s1)
        ks = range(int(ta * FPS), int(tb * FPS) + 1)
        out["min_" + nom] = min(DRIVE.speed(k / FPS) for k in ks)
        out["glisse_" + nom] = max(abs(DRIVE.slip(k / FPS)) for k in ks)
    return out


if __name__ == "__main__":         # python3 tools/film3d/parcours.py : les tronçons, les étoiles, les raccords
    m = mesures()
    print(f"trajet {m['longueur']:.1f} m jusqu'à l'arrêt ({m['arret']:.2f} s), poursuite {m['longueur_poursuite']:.1f} m "
          f"en {m['images']} images ({m['secondes']:.2f} s) ; moyenne {m['moyenne'] * 3.6:.1f} km/h, pointe "
          f"{m['pointe'] * 3.6:.1f} km/h ; rond-point {m['min_rond-point'] * 3.6:.1f} km/h au plus lent, glisse "
          f"{m['glisse_rond-point']:.1f}° ; port {m['min_port'] * 3.6:.1f} km/h, glisse {m['glisse_port']:.1f}°")
    for name, n in SHOTS + (("FIN6", FIN6_FRAMES),):
        hh = hero(name)
        (x0, y0), (x1, y1) = hh["pos"](1), hh["pos"](n)
        print(f"{name:4s} {START[name]:4d}+{n:3d} s {s_of_t(t_of(name, 1)):6.1f} → {s_of_t(t_of(name, n)):6.1f} m, v "
              f"{hh['speed'](1) * 3.6:5.1f} → {hh['speed'](n) * 3.6:5.1f} km/h, ({x0:7.2f}, {y0:7.2f}) → "
              f"({x1:7.2f}, {y1:7.2f}), feux stop {brake_windows(name)}")
    print("\nétoiles :")
    for k, f in ETOILES.items():
        t = f / FPS
        print(f"  {k} {ETOILE_LIEUX[k]:10s} image {f:4d} ({t:5.2f} s), s {s_of_t(t):6.1f} m, "
              f"{DRIVE.speed(t) * 3.6:5.1f} km/h, glisse {DRIVE.slip(t):+5.1f}°")
    print("\nraccord       v              long           lat            lacet          glisse         braquage"
          "       roulis         tangage        feux  pano °/s")
    for a, b, sa, sb in cut_states():
        print(f"{a:4s} → {b:4s} " + "  ".join(f"{sa[k]:+6.2f}/{sb[k]:+6.2f}" for k in
                                              ("speed", "along", "alat", "yaw", "slip", "steer", "roll", "pitch"))
              + f"  {'X' if sa['lamps'] else '.'}/{'X' if sb['lamps'] else '.'}  {sa['pan']:+5.1f}/{sb['pan']:+5.1f}")
    print("\nla ville (repère du pont, scène C) : la pose de chaque lieu, p_ville = R(rot) p_lieu + t")
    for lieu in dict.fromkeys(LIEU.values()):
        shots = [n for n in LIEU if LIEU[n] == lieu]
        rot, tx, ty = pose_ville(shots[0])
        print(f"  {lieu} ({', '.join(shots)}) : rot {rot:+7.2f}°, t = ({tx:8.3f}, {ty:8.3f})")
