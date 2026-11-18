# Les hélicoptères de P5 et P6, une seule distribution (la coupe P5 → P6 est continue : P6/1 suit P5/60, au même
# point de la ville). Trois appareils, définis une fois dans le repère de ville et en temps du film (s depuis OUV/1,
# parcours.t_of) ; les deux plans les lisent (p5_virage.heli, p6_jetee.heli) et leurs scènes les posent (key) :
# même appareil, même place, même cap, même assiette, même vitesse des deux côtés de la coupe, rotors en phase.
#  - 0 : celui de P5 ; il arrive de l'est et freine devant la berline (p5_virage.heli_arrival), en stationnaire à
#    P5/60, puis rejoint en JOIN_A s sa place devant elle sur la jetée (p6_jetee.heli_slot(0)), en se retournant.
#  - 1 et 2 : ceux qui l'attendent sur la jetée (p6_jetee.heli_slot(1), (2)), haut et loin devant elle ; dans P5
#    ils arrivent de l'avant, plus haut encore (APPROACH), posés sur leur place à P6/1 (position, vitesse et
#    accélération continues partout).
# Ce module ne lit que les deux plans et le parcours, sans Blender (sauf film_rotors, appelé par les scènes).
import math

import motion as M
import parcours as PC
import p5_virage as P5
import p6_jetee as P6

# Un seul appareil dans toute la prise (17 novembre, rendus éclairés v5 : P5 en montrait deux l'un sur l'autre, P6
# deux ou trois) : le 0, de P5 à la fin de FIN6, sur une seule trajectoire en temps du film ; ses ailiers 1 et 2
# (APPROACH, p6_jetee.HELIS[1:]) restent décrits mais ne sont plus posés.
N = 1
FPS = PC.FPS
T5 = PC.t_of("P5", P5.F0)                      # P5/1, en temps du film
T5_END = PC.t_of("P5", P5.F0 + P5.FRAMES - 1)  # P5/60
T6 = PC.t_of("P6", P6.F0)                      # P6/1 = P5/60 + une image
JOIN_A = 2.0          # s : l'appareil de P5, du stationnaire de P5/60 à sa place sur la jetée
TURN_A = 1.6          # s : son demi-tour, du nez vers elle au cap de la jetée (dans JOIN_A)
BEAM_JOIN = 1.0       # s : son faisceau, de la visée de P5 (elle, en retard) à celle de P6 (2 m devant elle)
# l'arrivée des appareils 1 et 2 sur leur place : (début, fin) en s autour de P6/1, et d'où ils arrivent (le long de
# la jetée, vers sa gauche, en hauteur, m) ; un écart à leur place qui s'éteint en quintique (vitesse et accélération
# continues), freinage de 5,8 × l'écart / durée² au plus. Leurs places sont haut et loin (à deux hauteurs de
# lampadaire et plus, 70 et 140 m devant elle) : ils passent au-dessus du 0, qui plonge devant elle pendant P5.
APPROACH = [None, (-4.0, 0.0, (20.0, 8.0, 6.0)), (-4.0, 0.0, (20.0, -8.0, 6.0))]
SEEDS = (11.0, 23.0, 37.0)      # l'assiette de chaque appareil (motion.aircraft_attitude), la même dans les deux plans


# ---- les repères : la scène d'un plan <-> la ville (p_ville = R(rot) p_scène + t ; cap_ville = cap_scène + rot)

def _pose(shot):
    return PC.pose_ville(shot)


def to_ville(shot, s):
    rot, tx, ty = _pose(shot)
    c, n = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    x, y = s[0], s[1]
    return (c * x - n * y + tx, n * x + c * y + ty) + tuple(s[2:3]) + \
        ((s[3] + rot,) + tuple(s[4:]) if len(s) > 3 else ())


def to_scene(shot, s):
    rot, tx, ty = _pose(shot)
    c, n = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    x, y = s[0] - tx, s[1] - ty
    return (c * x + n * y, -n * x + c * y) + tuple(s[2:3]) + \
        ((s[3] - rot,) + tuple(s[4:]) if len(s) > 3 else ())


def local(shot, T):
    """Le temps du plan (s depuis sa première image) d'un temps du film."""
    return T - PC.t_of(shot, 1)


def car(T):
    """(x, y) de la berline dans la ville."""
    return PC.placer("P4")[0](*PC.DRIVE.pos(T))


# ---- les trajectoires dans la ville : (x, y, z, cap, tangage, roulis), z au-dessus de l'eau du monde de l'eau

def _quintic(u):
    u = min(1.0, max(0.0, u))
    return u * u * u * (10.0 - 15.0 * u + 6.0 * u * u)


def _slot(i, T):
    return to_ville("P6", P6.heli_slot(i)(local("P6", T)))


def _hold(T):
    """L'appareil 0 après P5/60, s'il restait où P5 le laisse : en stationnaire, le nez vers elle."""
    x, y, z, _, p, r = to_ville("P5", P5.heli_arrival(T5_END - T5))
    hx, hy = car(T)
    return x, y, z, M.heading_of(hx - x, hy - y), p, r


def _d(fn, T, k, h=1.0 / 96.0):
    """La dérivée d'ordre k (1 ou 2) de fn (tuple) en T, centrée."""
    a, b, c = fn(T - h), fn(T), fn(T + h)
    if k == 1:
        return [(c[j] - a[j]) / (2 * h) for j in range(3)]
    return [(c[j] - 2 * b[j] + a[j]) / (h * h) for j in range(3)]


_END = {}


def _end_state(i):
    """La place de l'appareil i à la fin de son raccord : position, vitesse et accélération (calculées une fois)."""
    if i not in _END:
        T1 = T5_END + JOIN_A
        fn = lambda T: _slot(i, T)                                   # noqa: E731
        _END[i] = (fn(T1)[:3], _d(fn, T1, 1), _d(fn, T1, 2))
    return _END[i]


def _hermite(p0, p1, v1, a1, D, u):
    """Quintique de Hermite : départ au repos en p0 (vitesse et accélération nulles), arrivée en p1 avec v1 et a1,
    sur D s ; u de 0 à 1."""
    h0 = 1 - 10 * u ** 3 + 15 * u ** 4 - 6 * u ** 5
    h1 = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5
    hv = -4 * u ** 3 + 7 * u ** 4 - 3 * u ** 5
    ha = 0.5 * (u ** 3 - 2 * u ** 4 + u ** 5)
    return [h0 * p0[j] + h1 * p1[j] + hv * D * v1[j] + ha * D * D * a1[j] for j in range(3)]


# ---- la poursuite (17 novembre, 23 h : « les mouvements de l'hélicoptère ne sont pas bons ») : l'appareil 0 vole une
# seule courbe lisse en temps du film, de P5/1 à la fin de FIN6, tirée de la berline (parcours.DRIVE) : CHASE_Z m
# au-dessus de l'eau, CHASE_BACK m derrière elle et CHASE_SIDE m sur sa droite, sur sa route lissée (il coupe le
# virage du port, y prend du retard, le rattrape sur la jetée) ; quand elle freine vers le phare, il la dépasse,
# freine nez haut et se pose en stationnaire HOVER devant elle (en avant, à droite, hauteur), le faisceau sur elle.
# L'assiette vient de la physique de cette courbe, pas de clés : cap sur la vitesse ; tangage = le nez bas du vol
# d'avance (CRUISE_PITCH à CRUISE_V) plus atan(accélération avant / g) ; roulis = atan(accélération latérale / g)
# (penché dans le virage, à droite positif) ; dérivées par différences finies sur la courbe, lissées, bornées en
# douceur à ATT_LIM. ville.selftest_helico vérifie vitesses angulaires, angles, signes, hauteurs et distances.
# sa place par rapport à elle (m devant, m à droite, m au-dessus de l'eau), clés en temps du film, interpolées puis
# lissées : à P5/1 haut derrière la caméra (hors du cadre, P4 n'en a pas) ; quand elle freine pour le virage du port,
# il garde son élan et passe devant, entre par le haut du cadre ; puis il tient sa place haut devant elle, sur sa
# droite (au 24 mm, à 2,4 m de haut et 9° de site, le tiers haut du cadre 9:16 demande 60 à 100 m de recul pour 30 m)
# (brouillon éclairé v9, critique n° 5 : tenu à 82–84 m devant elle et 5 à 9 m de côté, il restait cinq secondes dans
# une boîte de 80 × 50 px en haut au centre du cadre, vu de dos et de dessous, un bâton sombre ; « collé à l'écran ».)
# Plus bas (20,5 m au-dessus de l'eau : selftest_helico garde 20, dix mètres au-dessus des lampadaires) et plus près (46
# à 68 m devant elle : 54 à 75 m de la caméra au lieu de 85 à 94, il paraît 1,4 fois plus grand ; le cadre final de P5
# le veut sous les 82 % de la hauteur, d'où le recul au port), il entre par la droite
# pendant le dérapage du port (vers P5/40), traverse le cadre vers la gauche, le dépasse à la sortie du port (l'élan
# du virage, au quart gauche vers P6/25–37), puis revient lentement vers la droite sur la jetée (aux trois cinquièmes à
# P6/109), avant le stationnaire de FIN6. Il garde le faisceau sur elle (beam).
CHASE_KEYS = ((16.0, 58.0, 43.0, 24.0), (19.2, 68.0, 26.0, 20.6), (20.5, 66.0, 6.0, 20.4), (22.0, 54.0, -16.0, 20.4),
              (24.3, 46.0, 16.0, 20.6), (25.5, 46.0, 8.0, 21.0))
# le crabe : en poursuite, son nez s'écarte de CHASE_CRAB° à droite de sa trajectoire, le flanc gauche (sa porte, son
# projecteur) tourné vers elle, comme un appareil de police qui garde la berline sous sa porte : on le voit de trois
# quarts arrière (rotor et cellule, 20 à 48° entre son cap et la visée sur la jetée) au lieu de dos (0 à 10° avant).
# Fondu à son arrivée (P5) et dans le stationnaire ; l'assiette passe dans le repère de la cellule : le disque penche
# vers sa trajectoire, pas vers son nez (selftest_helico contrôle la physique dans le repère de la trajectoire).
# CRAB_SIDE (m) : un crabe qui suit le côté où il est (tanh(côté / CRAB_SIDE)) ; None : toujours à droite (gardé :
# sur la gauche du cadre, le crabe suivant le côté ramenait le cap sur la visée).
CHASE_CRAB, CRAB_SIDE = 28.0, None
HOVER_D, HOVER_UP, HOVER_SIDE = 88.0, 24.0, -14.0  # le stationnaire de la fin, posé dans le cadre de FIN6/fin : m devant
#                                                  la caméra, ° au-dessus de son axe (tiers haut), ° sur le côté
HOVER_T = (25.5, 29.2)         # s du film : de la poursuite au stationnaire (elle s'arrête vers 28,5 s)
CAR_SIGMA, PATH_SIGMA, ACC_SIGMA = 0.8, 1.4, 0.3     # s : lissages (route de la berline, courbe, accélération)
CRUISE_PITCH, CRUISE_V = -7.0, 25.0                    # ° de nez bas à 25 m/s (90 km/h) et plus
ATT_LIM = 22.0                 # ° : tangage et roulis, repliés en douceur au-delà de 16°
G = 9.81
_DT = 1.0 / 96.0
_CHASE = {}


def _gauss(vals, sigma):
    """Lissage gaussien d'une liste, bords prolongés."""
    k = max(1, int(3 * sigma / _DT))
    w = [math.exp(-0.5 * (j * _DT / sigma) ** 2) for j in range(-k, k + 1)]
    sw = sum(w)
    n = len(vals)
    return [sum(w[j + k] * vals[min(n - 1, max(0, i + j))] for j in range(-k, k + 1)) / sw for i in range(n)]


def _soft_lim(a, knee=16.0, lim=ATT_LIM):
    m = abs(a)
    if m <= knee:
        return a
    return math.copysign(knee + (lim - knee) * math.tanh((m - knee) / (lim - knee)), a)


def _hover():
    """Le stationnaire de la fin, dans la ville : HOVER_D m devant la caméra de la dernière image de FIN6, HOVER_UP°
    au-dessus de son axe, HOVER_SIDE° sur le côté (le tiers haut du cadre, à l'écart de la berline)."""
    import fin6_orbite as F6
    x, y, z, yaw, pitch = F6.camera((PC.FIN6_FRAMES - 1) / FPS)[:5]
    a, e = math.radians(yaw + HOVER_SIDE), math.radians(pitch + HOVER_UP)
    p = (x - HOVER_D * math.sin(a) * math.cos(e), y - HOVER_D * math.cos(a) * math.cos(e), z + HOVER_D * math.sin(e))
    return to_ville("FIN6", p)


def _chase():
    """La courbe et son assiette sur une grille de _DT s : {T0, x, y, z, cap, tangage, roulis, v, al, at}."""
    if _CHASE:
        return _CHASE
    T0, T1 = T5 - 4.0, PC.t_of("FIN6", PC.FIN6_FRAMES) + 4.0
    n = int((T1 - T0) / _DT) + 1
    Ts = [T0 + i * _DT for i in range(n)]
    cx, cy = zip(*[car(T) for T in Ts])
    cx, cy = _gauss(list(cx), CAR_SIGMA), _gauss(list(cy), CAR_SIGMA)
    # son cap lissé (gardé quand elle est arrêtée)
    hd, last = [], None
    for i in range(n):
        a, b = max(0, i - 12), min(n - 1, i + 12)
        vx, vy = cx[b] - cx[a], cy[b] - cy[a]
        if math.hypot(vx, vy) / ((b - a) * _DT) > 1.0 or last is None:
            last = M.heading_of(vx, vy) if last is None else M._unwrap(last, M.heading_of(vx, vy))
        hd.append(last)
    hd = _gauss(hd, 0.8)
    hv = _hover()
    px, py, pz, crab = [], [], [], []
    for i, T in enumerate(Ts):
        k = CHASE_KEYS
        if T <= k[0][0]:
            fwd, side, z = k[0][1:]
        elif T >= k[-1][0]:
            fwd, side, z = k[-1][1:]
        else:
            j = max(m for m in range(len(k) - 1) if k[m][0] <= T)
            u = M.smoothstep(k[j][0], k[j + 1][0], T)
            fwd, side, z = (a + (b - a) * u for a, b in zip(k[j][1:], k[j + 1][1:]))
        a = math.radians(hd[i])
        fx, fy, rx, ry = -math.sin(a), math.cos(a), math.cos(a), math.sin(a)
        q = (cx[i] + fwd * fx + side * rx, cy[i] + fwd * fy + side * ry, z)
        w = _quintic((T - HOVER_T[0]) / (HOVER_T[1] - HOVER_T[0]))
        crab.append(-CHASE_CRAB * (math.tanh(side / CRAB_SIDE) if CRAB_SIDE else 1.0) * M.smoothstep(T5, T5 + 1.5, T) * (1.0 - w))
        px.append(q[0] + (hv[0] - q[0]) * w)
        py.append(q[1] + (hv[1] - q[1]) * w)
        pz.append(q[2] + (hv[2] - q[2]) * w)
    px, py, pz = _gauss(px, PATH_SIGMA), _gauss(py, PATH_SIGMA), _gauss(pz, PATH_SIGMA)

    def der(v):
        return [(v[min(n - 1, i + 1)] - v[max(0, i - 1)]) / ((min(n - 1, i + 1) - max(0, i - 1)) * _DT)
                for i in range(n)]
    vx, vy = der(px), der(py)
    ax, ay = _gauss(der(vx), ACC_SIGMA), _gauss(der(vy), ACC_SIGMA)
    # le cap : sur la vitesse en vol ; au pas (sous 6 m/s), il le garde (pas de demi-tour en stationnaire)
    cap, last = [], None
    for i in range(n):
        v = math.hypot(vx[i], vy[i])
        hv_ = M.heading_of(vx[i], vy[i]) if v > 0.5 else (last if last is not None else 0.0)
        base = hv_ if last is None else M._unwrap(last, hv_)
        h = base if last is None else last + (base - last) * M.smoothstep(1.0, 6.0, v)
        last = h if last is None else M._unwrap(last, h)
        cap.append(last)
    cap = _gauss(cap, 0.5)
    pit, rol, al, at, sp = [], [], [], [], []
    for i in range(n):
        a = math.radians(cap[i])
        fx, fy, rx, ry = -math.sin(a), math.cos(a), math.cos(a), math.sin(a)
        a_long = ax[i] * fx + ay[i] * fy
        a_lat = ax[i] * rx + ay[i] * ry
        v = math.hypot(vx[i], vy[i])
        pit.append(CRUISE_PITCH * min(1.0, v / CRUISE_V) - math.degrees(math.atan(a_long / G)))
        rol.append(math.degrees(math.atan(a_lat / G)))
        al.append(a_long)
        at.append(a_lat)
        sp.append(v)
    pit = [_soft_lim(p) for p in _gauss(pit, 0.3)]
    rol = [_soft_lim(r) for r in _gauss(rol, 0.3)]
    # le crabe : le cap de la cellule s'écarte de celui de la trajectoire ; le disque garde son inclinaison dans le
    # monde (vers l'avant de la trajectoire, Tf, et sa droite, Tr), lue dans le repère de la cellule tournée de c
    crab = _gauss(crab, 0.5)
    body_cap, body_p, body_r = [], [], []
    for i in range(n):
        c = math.radians(crab[i])
        tf, tr = -pit[i], rol[i]
        body_cap.append(cap[i] + crab[i])
        body_p.append(_soft_lim(-(tf * math.cos(c) - tr * math.sin(c))))
        body_r.append(_soft_lim(tf * math.sin(c) + tr * math.cos(c)))
    _CHASE.update(T0=T0, n=n, x=px, y=py, z=pz, cap=body_cap, tangage=body_p, roulis=body_r, v=sp, al=al, at=at,
                  cap_trajet=cap, tangage_trajet=pit, roulis_trajet=rol, crabe=crab)
    return _CHASE


def chase(T):
    """(x, y, z, cap, tangage, roulis) de l'appareil 0 au temps du film T, dans la ville (assiette comprise)."""
    c = _chase()
    u = (T - c["T0"]) / _DT
    i = min(c["n"] - 2, max(0, int(math.floor(u))))
    f = min(1.0, max(0.0, u - i))
    return tuple(c[k][i] + (c[k][i + 1] - c[k][i]) * f for k in ("x", "y", "z", "cap", "tangage", "roulis"))


def chase_trajet(T):
    """(cap, tangage, roulis) de l'appareil 0 au temps T dans le repère de sa trajectoire (sans le crabe) : la
    physique que contrôle ville.selftest_helico (penché du côté où il tourne, nez bas quand il accélère)."""
    c = _chase()
    u = (T - c["T0"]) / _DT
    i = min(c["n"] - 2, max(0, int(math.floor(u))))
    f = min(1.0, max(0.0, u - i))
    return tuple(c[k][i] + (c[k][i + 1] - c[k][i]) * f for k in ("cap_trajet", "tangage_trajet", "roulis_trajet"))


def chase_kin(T):
    """(vitesse m/s, accélération avant, latérale m/s²) de l'appareil 0 au temps T (pour les contrôles)."""
    c = _chase()
    i = min(c["n"] - 1, max(0, int(round((T - c["T0"]) / _DT))))
    return c["v"][i], c["al"][i], c["at"][i]


def state(i, T):
    """L'appareil i à l'instant T du film, dans la ville : (x, y, z, cap, tangage, roulis), sans l'assiette de
    l'accélération (motion.aircraft_attitude l'ajoute : attitude)."""
    if i == 0:
        return chase(T)
    if i == -1:                                    # l'ancienne arrivée de P5 (plus posée)
        if T <= T5_END:
            return to_ville("P5", P5.heli_arrival(T - T5))
        u = (T - T5_END) / JOIN_A
        if u >= 1.0:
            return _slot(0, T)
        hold, slot = _hold(T), _slot(0, T)
        p1, v1, a1 = _end_state(0)
        pos = _hermite(hold[:3], p1, v1, a1, JOIN_A, u)
        w = _quintic((T - T5_END) / TURN_A)
        head = hold[3] + (M._unwrap(hold[3], slot[3]) - hold[3]) * w
        k = _quintic(u)
        return (*pos, head, hold[4] + (slot[4] - hold[4]) * k, hold[5] + (slot[5] - hold[5]) * k)
    s = _slot(i, T)
    t0, t1, (a, l, up) = APPROACH[i]
    g = 1.0 - _quintic((T - (T6 + t0)) / (t1 - t0))
    if g <= 0.0:
        return s
    rot = math.radians(_pose("P6")[0])
    # le long de la jetée (+y de la scène D) et vers sa gauche (−x de la scène D), dans la ville
    fx, fy = -math.sin(rot), math.cos(rot)
    lx, ly = -math.cos(rot), -math.sin(rot)
    return (s[0] + g * (a * fx + l * lx), s[1] + g * (a * fy + l * ly), s[2] + g * up) + tuple(s[3:])


# ---- l'assiette, calculée une fois sur les deux plans en temps du film : la même aux deux bords de la coupe

F_FIRST = PC.START["P5"] + P5.F0 - 1          # image du film (1 = OUV/1) une image avant P5/1
# une image après la dernière de FIN6 : FIN6 continue P6 sans coupe et garde le même appareil (fin6_orbite.HELI,
# où p6_jetee.heli_slot(0) le pose), ses clés lues ici comme celles de P5 et P6
F_LAST = PC.START["FIN6"] + PC.FIN6_FRAMES + 1
_ATT = {}


ATT_MAX, ATT_KNEE = 15.0, 10.0   # ° : tangage et roulis bornés à 15° (vol de police, pas de voltige), sans cassure


def _soft(a):
    """L'angle a tel quel jusqu'à ATT_KNEE, puis replié en douceur vers ATT_MAX (dérivée continue)."""
    m = abs(a)
    if m <= ATT_KNEE:
        return a
    w = ATT_MAX - ATT_KNEE
    return math.copysign(ATT_KNEE + w * math.tanh((m - ATT_KNEE) / w), a)


def attitude(i):
    """{image du film: (x, y, z, cap, tangage, roulis)} dans la ville, l'assiette de l'accélération comprise,
    tangage et roulis sous ATT_MAX."""
    if i == 0 and i not in _ATT:                   # la poursuite porte déjà son assiette physique
        _ATT[0] = {f: chase((f - 1) / FPS) for f in range(F_FIRST, F_LAST + 1)}
    if i not in _ATT:
        raw = M.aircraft_attitude(lambda T: state(i, T), range(F_FIRST, F_LAST + 1), "heli", f0=1, fps=FPS,
                                  seed=SEEDS[i])
        _ATT[i] = {f: tuple(s[:4]) + (_soft(s[4]), _soft(s[5])) + tuple(s[6:]) for f, s in raw.items()}
    return _ATT[i]


def film_frame(shot, frame):
    return PC.START[shot] + frame


def in_scene(shot, i, dyn=None):
    """fn(t) -> (x, y, z, cap, tangage, roulis) de l'appareil i dans la scène du plan, t en s depuis sa première
    image ; avec l'assiette de l'accélération si la dynamique est active (motion.dyn_on), aux images entières."""
    dyn = M.dyn_on() if dyn is None else dyn

    def fn(t):
        T = PC.t_of(shot, 1) + t
        if dyn:
            f = t * FPS + 1
            if abs(f - round(f)) < 1e-6 and F_FIRST <= film_frame(shot, round(f)) <= F_LAST:
                return to_scene(shot, attitude(i)[film_frame(shot, round(f))])
        return to_scene(shot, state(i, T))
    return fn


# ---- les faisceaux : la cible de chaque appareil, dans la ville

def beam(i, T):
    """(x, y, z) : la tache du faisceau de l'appareil i. L'appareil 0 garde la visée de P5 jusqu'à P5/60 (elle, en
    retard, p5_virage.beam_target) et prend celle de P6 (2 m devant elle) en BEAM_JOIN s ; 1 et 2, celle de P6."""
    p6 = to_ville("P6", P6.beam_target(local("P6", T)))
    if i != 0:
        return p6
    p5 = to_ville("P5", P5.beam_target(local("P5", T)))
    w = _quintic((T - T5_END) / BEAM_JOIN)
    return tuple(a + (b - a) * w for a, b in zip(p5, p6))


# ---- la lampe de l'appareil 0 (lumière v3.1) : une seule définition en temps du film, lue par P5, P6 et FIN6. Le
# pinceau visible est la puissance de la lampe de brume fois la densité de la brume du plan : le même produit des deux
# côtés de chaque coupe.
# Brouillon éclairé v9 (critique n° 2) : le pinceau, bleu froid, s'arrêtait en l'air sans toucher le sol, ne posait
# aucune tache (8 kW à 85 m : 0,09 W/m², rien), puis s'éteignait en 1,75 s dès P6 (BEAM0_FONDU) ; FIN6 n'en avait
# qu'une lampe de 8 kW, invisible. Maintenant :
# - le pinceau est gardé plein de P5 à la fin de FIN6 (plus de fondu), d'une seule couleur (BEAM0_COULEUR, blanc
#   neutre un peu chaud : ni le bleuté qui tourne le bordeaux au lilas, ni le crème des lampadaires) ;
# - il descend jusqu'au sol : un cône étroit (BEAM0_CONE) sur une source large (BEAM0_SOURCE) fait un faisceau presque
#   parallèle. Sa clarté dans la brume va comme 1 / sa largeur : de 0,24 m de source et 5°, elle tombait de 11 fois de
#   l'appareil au sol ; de 0,9 m et 3,5°, de 3,5 fois (l'appareil est aussi plus près, 50 à 60 m au lieu de 85) ;
# - sa tache au sol (TACHE_*, scene_d.projo_tache) : bornée, 12 m de diamètre au bord, bord doux, centrée sur sa
#   cible (sur elle), à TACHE_E W/m² quelle que soit la distance de l'appareil (puissance ∝ d², ouverture recalée à
#   chaque image) ; elle éclaire tout sauf la berline, voisins compris ; la berline reçoit sa propre jumelle
#   (BERLINE_E W/m², la même règle) ; le reste du terre-plein reste au crépuscule (scene_e.MATS_CREPUSCULE).
BEAM0_PINCEAU = 1.6e6 * 0.0016      # W × densité : le pinceau de P5
BEAM0_COULEUR = "#f4f1ea"
BEAM0_SOL, BEAM0_BERLINE = 8000.0, 5.0e4    # (les jumelles d'avant, gardées pour les appareils 1 et 2 de la jetée)
BEAM0_FIN = 8000.0                  # la lampe propre des appareils de la jetée (helis_P6_light) ; le reste en jumelle
BEAM0_CONE = (3.5, 3.5)
BEAM0_SOURCE = (0.45, 0.4)          # la lampe de brume : rayon de la source (m), bord du cône
TACHE_E, TACHE_R, TACHE_BLEND, TACHE_SOURCE = 2.5, 6.0, 0.7, 0.45   # W/m², m (rayon au bord), bord, m
BERLINE_E = 0.6                     # W/m² sur la berline (50 kW à 85 m : ce que P5 lui donnait, ni rose ni brûlée)


def beam0(T, density):
    """(W, degrés) : la lampe de brume de l'appareil 0 au temps du film T, dans une brume de densité `density` ;
    la même de P5 à la fin de FIN6 (l'allumage de P5 à part : beam0_allume)."""
    return BEAM0_PINCEAU / density, BEAM0_CONE[0]


def tache(dist):
    """(W, degrés, W) : la jumelle du sol (puissance, ouverture) et celle de la berline pour un projecteur à `dist` m
    de sa cible : TACHE_E et BERLINE_E W/m² (un spot de P W fait P / 4π d² W/m²), TACHE_R m de rayon au bord."""
    k = 4.0 * math.pi * dist * dist
    return TACHE_E * k, 2.0 * math.degrees(math.atan(TACHE_R / dist)), BERLINE_E * k


# le projecteur s'allume quand l'appareil arrive sur le port (brouillon éclairé v8 : à la coupe P4 → P5, images 425 |
# 426, son pinceau entrait d'un coup par le haut du cadre, l'appareil encore hors champ, alors que P4 n'en a pas) :
# éteint à P5/1, la même image que la dernière de P4 sans lui, il monte en BEAM0_ALLUMAGE s (quintique : ni marche ni
# à-coup), pinceau, tache au sol et lampe de la berline ensemble ; plein bien avant l'étoile 5 (P5/28)
BEAM0_ALLUMAGE = 0.75


def beam0_allume(T):
    """La part allumée du projecteur de l'appareil 0 au temps du film T : 0 jusqu'à P5/1, 1 après BEAM0_ALLUMAGE s."""
    return _quintic((T - T5) / BEAM0_ALLUMAGE)


def beam_in_scene(shot, i):
    def fn(t):
        return to_scene(shot, beam(i, PC.t_of(shot, 1) + t))
    return fn


# ---- dans Blender : les rotors sur l'image du film (cast_vehicles.spin_rotors les pilote sur l'image du plan)

def film_rotors(rig, shot):
    """Les pilotes des rotors de `rig` lus sur l'image du film : « frame » devient « (frame + START) ». Renvoie le
    nombre de pilotes repris."""
    off = PC.START[shot]
    n = 0
    for ob in [rig] + list(rig.children_recursive):
        ad = ob.animation_data
        if ad is None:
            continue
        for fc in ad.drivers:
            e = fc.driver.expression
            if "frame" in e and "(frame +" not in e:
                fc.driver.expression = e.replace("frame", f"(frame + {off})")
                n += 1
    return n


def key(ob, shot, i, frames):
    """Les clés de l'appareil i dans la scène du plan (position et orientation, assiette comprise), sur ses images,
    et ses rotors sur l'image du film."""
    fn = in_scene(shot, i)
    M._clear(ob)
    ob.rotation_mode = "XYZ"
    for f in frames:
        x, y, z, h, p, r = fn(M.t_of(f))
        ob.location = (x, y, z)
        ob.rotation_euler = (math.radians(p), math.radians(r), math.radians(h))
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_euler", frame=f)
    return film_rotors(ob, shot)


if __name__ == "__main__":
    for T in (T5, T5_END - 1.0, T5_END, T6, T6 + 1.0, T6 + 2.5):
        print(f"T {T:6.3f} : " + " | ".join(
            "%d (%.1f, %.1f, %.1f) cap %.0f" % ((i,) + tuple(state(i, T)[:4])) for i in range(N)))
