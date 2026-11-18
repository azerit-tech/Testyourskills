# La police du film (SPEC §18.71, 18 novembre 2026). Le critique du brouillon éclairé v10 : « aucune police de 36 à
# 239 puis de 263 à 339, les gels 107, 214 et 317 sans patrouille », et des poursuivants qui ne sont pas les mêmes
# des deux côtés des coupes (la patrouille de 11 m qui surgit à 118 km/h à l'image 318, dix véhicules sur le pont et
# quatre au port).
#
# Une seule distribution pour tout le film, en ville et en temps du film (g, l'image du film, 0 = OUV/1) :
#   - la patrouille 1 : celle du choc de l'avenue (p1_avenue, contacts.py). Elle ne s'arrête plus à l'entrée du
#     rond-point. Dès l'image 60 elle décroche et se rabat derrière la caméra, sur la ligne de la berline
#     (suiveuse) ; elle la suit dans l'anneau, dans la rue des enseignes, passe la trouée du barrage derrière elle,
#     puis déboîte à gauche et accélère : c'est la patrol_0 du pont (p4_pont), la même voiture, une seule loi jusqu'au
#     port. Ses phares portent sur la route et le coffre de la berline, sa rampe sur les façades : la poursuite se
#     lit derrière la caméra de 60 à 340 ;
#   - la patrouille 2 (p2_arc, p3_enseignes) : venue de l'est par l'anneau, elle arrive à la bouche de la rue en même
#     temps que la berline, à sa droite (le gel 214), se fait distancer et pile devant le barrage ;
#   - les unités de cette couche (unites) : la patrouille de la rue transversale de l'avenue, qui débouche devant la
#     berline et se fait doubler (le gel 107) ; celle de l'entrée du pont, qui s'ébranle à son passage (le gel 317) ;
#   - la file du pont et du port (p4_pont, p5_virage, p6_jetee), le barrage, la garée de l'avenue : inchangés.
#
# La suiveuse est écrite depuis la berline : son avance le long du chemin de la berline (m, négative derrière) et son
# écart à gauche de ce chemin, deux lois lisses du temps du film. Elle prend donc ses virages, ses écarts et sa
# vitesse là où la berline les a pris : rien n'est une position absolue. À l'image RACCORD (340) elle rejoint, en
# place, en vitesse et en accélération, la loi du pont que contacts.py serre ensuite contre la berline.
#
#   python3 tools/film3d/police.py              # la suiveuse, les unités, les coupes et « police à l'image »
#   python3 tools/film3d/police.py --coupes     # les poursuivants des deux côtés de chaque coupe
#   python3 tools/film3d/police.py --image      # la part des images avec une patrouille dans le cadre, par tronçon
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import parcours as P  # noqa: E402

FPS = P.FPS
SUB = 4                      # le pas des tables : le quart d'image
PATROL = (0.975, 2.5)        # demi-largeur, demi-longueur d'une patrouille (m : contacts.PATROL)


# ---------------------------------------------------------------- le chemin de la berline, en ville

G_CHEMIN = (20, 380)         # les images du film que couvre la table (la suiveuse : 50 à 340, 13,5 m derrière)
_CH = None


def _chemin():
    """(points, abscisses) : la place de la berline en ville à chaque quart d'image de G_CHEMIN, et la longueur
    parcourue depuis la première."""
    global _CH
    if _CH is None:
        import ville as VL
        n = (G_CHEMIN[1] - G_CHEMIN[0]) * SUB
        pts = [VL.hero_city(1.0 + G_CHEMIN[0] + k / SUB)[:2] for k in range(n + 1)]
        cum = [0.0]
        for a, b in zip(pts, pts[1:]):
            cum.append(cum[-1] + math.dist(a, b))
        _CH = (pts, cum)
    return _CH


def s_berline(g):
    """L'abscisse de la berline sur son chemin à l'image g du film (m)."""
    pts, cum = _chemin()
    u = min(max((g - G_CHEMIN[0]) * SUB, 0.0), len(cum) - 1.0)
    k = min(int(u), len(cum) - 2)
    return cum[k] + (cum[k + 1] - cum[k]) * (u - k)


def _au_chemin(s):
    """((x, y), (tx, ty)) : le point d'abscisse s du chemin et sa tangente unitaire (lissée sur 1 m)."""
    pts, cum = _chemin()

    def at(q):
        q = min(max(q, 0.0), cum[-1])
        lo, hi = 0, len(cum) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if cum[m] <= q:
                lo = m
            else:
                hi = m
        k = (q - cum[lo]) / ((cum[hi] - cum[lo]) or 1e-9)
        return pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k
    a, b = at(s - 0.5), at(s + 0.5)
    d = math.dist(a, b) or 1e-9
    return at(s), ((b[0] - a[0]) / d, (b[1] - a[1]) / d)


def _sur_chemin(x, y, s0):
    """(abscisse, écart à gauche) du point (x, y) rapporté au chemin, cherché autour de l'abscisse s0."""
    s = s0
    for pas in (2.0, 0.5, 0.1, 0.02, 0.004, 0.0008, 0.00016):
        s = min((s + k * pas for k in range(-6, 7)), key=lambda q: math.dist(_au_chemin(q)[0], (x, y)))
    (px, py), (tx, ty) = _au_chemin(s)
    return s, (x - px) * -ty + (y - py) * tx


# ---------------------------------------------------------------- la suiveuse (la patrouille 1, de 60 à 340)

DEPART = 60                  # l'image où elle quitte la loi de l'avenue (p1_avenue : inchangée de 0 à 60)
RACCORD = 340                # l'image où elle rejoint la loi du pont (p4_pont : de 340 à 385, le contact du pont)
# Sa ligne se dessine le long du chemin de la berline, par les places où la berline est passée aux images :
VIRAGE = (69.3, 176)         # m de sa voie tenus tout droit après DEPART ; l'image où la berline est passée là
#                              où elle rejoint son chemin : entre les deux, un seul virage à gauche dans l'anneau
TROUEE = (232, 250, 255.4, 0.07)   # la trouée du barrage : de là où la berline est aux images 232 à 250 elle quitte
#                              son chemin pour la droite qui passe la trouée (la berline y est à l'image 255,4),
#                              0,07 m à gauche (la patrouille de droite du barrage dépasse des plots)
G_DEBOITE = (268, 331)       # là où elle déboîte à gauche, la trouée passée (la berline y est à l'image 268), et là
#                              où elle est dans sa voie du pont : elle double la caméra à 1 m au moins
PAS_LIGNE = 0.05             # m : le pas de sa ligne
# Son allure : elle tient d'abord sa vitesse de l'avenue (la berline freine pour le rond-point : elle remonte à sa
# hauteur, à gauche dans le cadre), freine à son tour, plus fort et plus tard, jusqu'à l'entrée de l'anneau, puis
# remet les gaz et les tient jusqu'au pont. L'instant où elle freine est celui qui la met à sa place du pont.
B_FREIN = 6.6                # m/s² : son freinage (le plafond des patrouilles : 7,2)
A_GAZ = 3.85                 # m/s² : ses gaz (le plafond : 4, motion.DRIVE_KINDS)
J_FREIN, J_GAZ, J_PONT = 10.0, 10.0, 9.0   # m/s³ : les à-coups de son freinage, de ses gaz, de son lever de pied

_BASE_AVENUE = None          # la loi de l'avenue avant le contact, (t du plan P1) -> (x, y) de sa scène
_BASE_PONT = None            # la loi du pont avant le contact, (t du plan P4) -> (x, y) de sa scène
_CLES = None


def avant_pont(base):
    """p4_pont : rend la loi de la patrouille 1 sur le pont, la suiveuse avant l'image RACCORD, `base` ensuite."""
    global _BASE_PONT, _CLES
    _BASE_PONT, _CLES = base, None
    t_racc = (RACCORD - P.START["P4"]) / FPS

    def ligne(t):
        return suiveuse_scene("P4", t) if t < t_racc else base(t)
    return ligne


def apres_avenue(base):
    """p1_avenue : rend la loi de la patrouille 1 dans l'avenue, `base` jusqu'à l'image DEPART, la suiveuse ensuite."""
    global _BASE_AVENUE, _CLES
    _BASE_AVENUE, _CLES = base, None
    t_dep = (DEPART - P.START["P1"]) / FPS

    def ligne(t):
        return base(t) if t <= t_dep else suiveuse_scene("P1", t)
    return ligne


def _quintique(a, b, t):
    """La quintique d'Hermite entre deux nœuds (t, valeur, vitesse, accélération) ; tenue avant et après."""
    if t <= a[0]:
        return a[1]
    if t >= b[0]:
        return b[1]
    T = b[0] - a[0]
    u = (t - a[0]) / T
    u2, u3 = u * u, u * u * u
    u4, u5 = u3 * u, u3 * u2
    return ((1 - 10 * u3 + 15 * u4 - 6 * u5) * a[1] + (u - 6 * u3 + 8 * u4 - 3 * u5) * T * a[2]
            + (0.5 * u2 - 1.5 * u3 + 1.5 * u4 - 0.5 * u5) * T * T * a[3] + (10 * u3 - 15 * u4 + 6 * u5) * b[1]
            + (-4 * u3 + 7 * u4 - 3 * u5) * T * b[2] + (0.5 * u3 - u4 + 0.5 * u5) * T * T * b[3])


def _pont_ville(g):
    """La place en ville de la patrouille 1 du pont (sa loi d'avant le contact) à l'image g du film."""
    if _BASE_PONT is None:
        import p4_pont  # noqa: F401  (il s'inscrit par avant_pont)
    return P.vers_ville("P4")[0](*_BASE_PONT((g - P.START["P4"]) / FPS))


def _vitesse_berline(g):
    return (s_berline(g + 1.0) - s_berline(g - 1.0)) * FPS / 2.0


def _avenue_ville(g):
    """La place en ville de la patrouille 1 de l'avenue (sa loi d'avant le contact) à l'image g du film."""
    if _BASE_AVENUE is None:
        import p1_avenue  # noqa: F401  (il s'inscrit par apres_avenue)
    return P.vers_ville("P1")[0](*_BASE_AVENUE((g - P.START["P1"]) / FPS))


def _etat(pos, g):
    """(abscisse sur le chemin, écart à gauche, vitesse, accélération) d'une loi pos(g) -> (x, y) à l'image g."""
    s, n = _sur_chemin(*pos(g), s_berline(g) - 5.0)
    v = [math.dist(pos(k - 0.5), pos(k + 0.5)) * FPS for k in (g - 2.0, g, g + 2.0)]
    return s, n, v[1], (v[2] - v[0]) * FPS / 4.0


def _profil(ts, e0, e1):
    """[(t, accélération)] de DEPART à RACCORD (s depuis DEPART), linéaire entre les sommets : son accélération de
    l'avenue ramenée à zéro, sa vitesse tenue jusqu'à ts, son freinage (B_FREIN) tenu, ses gaz (A_GAZ) tenus, puis
    l'accélération de la loi du pont. La durée de son freinage est celle qui lui donne la vitesse du pont à RACCORD ;
    None s'il n'y en a pas."""
    T = (RACCORD - DEPART) / FPS
    (v0, a0), (v1, a1) = e0[2:], e1[2:]
    a, b = A_GAZ, B_FREIN
    t0, tf, tr, te = abs(a0) / J_GAZ, b / J_FREIN, (a + b) / J_GAZ, (a - a1) / J_PONT
    # v1 = v0 + a0 t0 / 2 - b tf / 2 - b th + (a - b) tr / 2 + a (T - te - ts - tf - th - tr) + (a + a1) te / 2
    th = (v0 + a0 * t0 / 2.0 - b * tf / 2.0 + (a - b) * tr / 2.0 + a * (T - te - ts - tf - tr) + (a + a1) * te / 2.0
          - v1) / (a + b)
    if ts < t0 or th < 0.0 or ts + tf + th + tr > T - te:
        return None
    return [(0.0, a0), (t0, 0.0), (ts, 0.0), (ts + tf, -b), (ts + tf + th, -b), (ts + tf + th + tr, a), (T - te, a),
            (T, a1)]


def _table(prof, v0):
    """[(s, v)] à chaque quart d'image de DEPART à RACCORD : la distance parcourue et la vitesse (accélération
    linéaire par morceaux, intégrée au 1/960 s)."""
    n, k = (RACCORD - DEPART) * SUB, 10
    dt = 1.0 / (FPS * SUB * k)

    def acc(t):
        for (ta, aa), (tb, ab) in zip(prof, prof[1:]):
            if t <= tb:
                return aa + (ab - aa) * (t - ta) / max(1e-9, tb - ta)
        return prof[-1][1]
    s, v, out = 0.0, v0, [(0.0, v0)]
    for i in range(n * k):
        v1 = v + 0.5 * (acc(i * dt) + acc((i + 1) * dt)) * dt
        s += 0.5 * (v + v1) * dt
        v = v1
        if (i + 1) % k == 0:
            out.append((s, v))
    return out


def _ligne(e0, e1):
    """(points, longueurs) de sa ligne en ville, de sa place de DEPART à celle de RACCORD : sa voie de l'avenue
    tenue tout droit (la droite de sa course à DEPART) sur VIRAGE[0] m ; un seul virage à gauche jusqu'au chemin de
    la berline, rejoint là où elle est passée à l'image VIRAGE[1] (quintique d'Hermite : la place, le cap et la
    courbure raccordés aux deux bouts) ; le chemin de la berline ensuite, quitté à G_DEBOITE[0] pour sa voie du
    pont (la droite de la loi du pont à RACCORD), où elle est à G_DEBOITE[1]."""
    o = _avenue_ville(DEPART)
    a, b = _avenue_ville(DEPART - 1.0), _avenue_ville(DEPART + 1.0)
    d = math.dist(a, b)
    ux, uy = (b[0] - a[0]) / d, (b[1] - a[1]) / d
    pts = [(o[0] + ux * k * PAS_LIGNE, o[1] + uy * k * PAS_LIGNE) for k in range(int(VIRAGE[0] / PAS_LIGNE))]
    A = (o[0] + ux * VIRAGE[0], o[1] + uy * VIRAGE[0])
    sb = s_berline(VIRAGE[1])
    B, (tx, ty) = _au_chemin(sb)
    (_, (t0x, t0y)), (_, (t1x, t1y)) = _au_chemin(sb - 0.5), _au_chemin(sb + 0.5)
    kap = (tx * (t1y - t0y) - ty * (t1x - t0x))        # sa courbure à l'arrivée (1/m, positive à gauche)
    L = math.dist(A, B) * 1.08                         # la longueur du virage, à peu près : la vitesse du paramètre
    n = int(L / PAS_LIGNE)
    for k in range(n):
        u = k / n
        u2, u3, u4, u5 = u * u, u ** 3, u ** 4, u ** 5
        h0, h1 = 1 - 10 * u3 + 15 * u4 - 6 * u5, 10 * u3 - 15 * u4 + 6 * u5
        g0, g1 = u - 6 * u3 + 8 * u4 - 3 * u5, -4 * u3 + 7 * u4 - 3 * u5
        c1 = 0.5 * u3 - u4 + 0.5 * u5
        pts.append((h0 * A[0] + h1 * B[0] + L * (g0 * ux + g1 * tx) + L * L * c1 * kap * -ty,
                    h0 * A[1] + h1 * B[1] + L * (g0 * uy + g1 * ty) + L * L * c1 * kap * tx))
    # la droite qui passe la trouée du barrage : la tangente du chemin de la berline dans la trouée, TROUEE[3] m à
    # gauche ; elle quitte le chemin pour cette droite avant le barrage (la berline, elle, se déporte à droite après)
    s1, s2 = s_berline(TROUEE[0]), s_berline(TROUEE[1])
    D, (dx, dy) = _au_chemin(s_berline(TROUEE[2]))
    D = (D[0] - dy * TROUEE[3], D[1] + dx * TROUEE[3])
    n = int(math.ceil((s2 - sb) / PAS_LIGNE))
    for k in range(n):
        q = sb + (s2 - sb) * k / n
        x, y = _au_chemin(q)[0]
        u = min(1.0, max(0.0, (q - s1) / (s2 - s1)))
        w = u * u * u * (10.0 - 15.0 * u + 6.0 * u * u)
        m = (x - D[0]) * dx + (y - D[1]) * dy
        pts.append((x + (D[0] + dx * m - x) * w, y + (D[1] + dy * m - y) * w))
    # sa voie du pont : la droite de la loi du pont à RACCORD, prolongée vers l'arrière ; de la droite de la trouée
    # à cette voie, un seul fondu le long de la voie, de G_DEBOITE[0] à G_DEBOITE[1]
    R = _pont_ville(RACCORD)
    ra, rb = _pont_ville(RACCORD - 1.0), _pont_ville(RACCORD + 1.0)
    d = math.dist(ra, rb)
    vx, vy = (rb[0] - ra[0]) / d, (rb[1] - ra[1]) / d
    cs = dx * vx + dy * vy

    def voie(p):
        return (p[0] - R[0]) * vx + (p[1] - R[1]) * vy
    v0, va, vc = (voie(_au_chemin(q)[0]) for q in (s2, s_berline(G_DEBOITE[0]), s_berline(G_DEBOITE[1])))
    vD = voie(D)
    n = int(math.ceil(-v0 / PAS_LIGNE))
    for k in range(n + 1):
        v = v0 * (1.0 - k / n)
        u = min(1.0, max(0.0, (v - va) / (vc - va)))
        w = u * u * u * (10.0 - 15.0 * u + 6.0 * u * u)
        m = (v - vD) / cs                       # le point de la droite de la trouée à la hauteur v de la voie
        ax, ay = D[0] + dx * m, D[1] + dy * m
        pts.append((ax + (R[0] + v * vx - ax) * w, ay + (R[1] + v * vy - ay) * w))
    # ses deux bouts posés sur les lois qu'elle raccorde, au millimètre (le report au chemin en laisse deux) : le
    # reste effacé sur les 5 premiers et les 5 derniers mètres
    r0 = [a - b for a, b in zip(_avenue_ville(DEPART), pts[0])]
    r1 = [a - b for a, b in zip(_pont_ville(RACCORD), pts[-1])]
    m = int(5.0 / PAS_LIGNE)
    for k in range(m):
        w = 1.0 - k / m
        pts[k] = (pts[k][0] + r0[0] * w, pts[k][1] + r0[1] * w)
        pts[-1 - k] = (pts[-1 - k][0] + r1[0] * w, pts[-1 - k][1] + r1[1] * w)
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    return pts, cum


def _cles():
    """La conduite de la suiveuse de DEPART à RACCORD : l'état de la loi de l'avenue à DEPART et celui de la loi du
    pont à RACCORD, rapportés au chemin de la berline ; entre les deux, sa ligne (_ligne), et sur elle un freinage
    et une remise des gaz (_profil) dont l'accélération est celle qui la met à sa place du pont (bissection)."""
    global _CLES
    if _CLES is None:
        e0, e1 = _etat(_avenue_ville, DEPART), _etat(_pont_ville, RACCORD)
        pts, cum = _ligne(e0, e1)
        but = cum[-1]
        # plus elle freine tard, plus elle fait de chemin : l'instant de son freinage par bissection
        t0 = abs(e0[3]) / J_GAZ
        lo, hi = t0, (RACCORD - DEPART) / FPS
        for _ in range(60):
            ts = (lo + hi) / 2.0
            prof = _profil(ts, e0, e1)
            if prof is None or _table(prof, e0[2])[-1][0] > but:
                hi = ts
            else:
                lo = ts
        prof = _profil(lo, e0, e1)
        assert prof is not None, "la suiveuse ne rejoint pas sa place du pont (aucun freinage ne convient)"
        tab = _table(prof, e0[2])
        assert abs(tab[-1][0] - but) < 0.02 and min(v for _, v in tab) > 1.0, \
            "la suiveuse ne rejoint pas sa place du pont : %.2f m d'écart, %.1f m/s au plus bas" % (
                tab[-1][0] - but, min(v for _, v in tab))
        _CLES = dict(ligne=(pts, cum), table=tab, profil=prof, manque=tab[-1][0] - but)
    return _CLES


def _sur_ligne(g):
    """(x, y) de la suiveuse sur sa ligne à l'image g (DEPART à RACCORD)."""
    c = _cles()
    tab = c["table"]
    u = min(max((g - DEPART) * SUB, 0.0), len(tab) - 1.0)
    k = min(int(u), len(tab) - 2)
    q = tab[k][0] + (tab[k + 1][0] - tab[k][0]) * (u - k)
    pts, cum = c["ligne"]
    lo, hi = 0, len(cum) - 1
    q = min(max(q, 0.0), cum[-1])
    while hi - lo > 1:
        m = (lo + hi) // 2
        if cum[m] <= q:
            lo = m
        else:
            hi = m
    w = (q - cum[lo]) / ((cum[hi] - cum[lo]) or 1e-9)
    return pts[lo][0] + (pts[hi][0] - pts[lo][0]) * w, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * w


def releve(g):
    """(avance sur la berline le long de son chemin, écart à gauche de ce chemin) de la patrouille 1 à l'image g."""
    s, n = _sur_chemin(*suiveuse(g), s_berline(g) - 10.0)
    return s - s_berline(g), n


def suiveuse(g):
    """(x, y) de la patrouille 1 en ville à l'image g du film : la loi de l'avenue jusqu'à DEPART, la suiveuse
    jusqu'à RACCORD, la loi du pont ensuite."""
    if g <= DEPART:
        return _avenue_ville(g)
    if g >= RACCORD:
        return _pont_ville(g)
    return _sur_ligne(g)


def suiveuse_cap(g, h=0.25):
    """Le cap de sa caisse en ville (degrés, 0 vers +y, positif vers -x) : celui de sa course."""
    (x0, y0), (x1, y1) = suiveuse(g - h), suiveuse(g + h)
    return math.degrees(math.atan2(-(x1 - x0), y1 - y0))


def suiveuse_vitesse(g, h=0.25):
    return math.dist(suiveuse(g - h), suiveuse(g + h)) * FPS / (2 * h)


def suiveuse_accel(g, h=0.5):
    """Son accélération le long de sa course (m/s²)."""
    return (suiveuse_vitesse(g + h) - suiveuse_vitesse(g - h)) * FPS / (2 * h)


_INV = {}


def vers_scene(plan):
    """(ville -> scène du tronçon, l'angle à retrancher aux caps) : l'inverse de parcours.vers_ville."""
    if plan not in _INV:
        fn, rot = P.vers_ville(plan)
        t = fn(0.0, 0.0)
        e1 = (fn(1.0, 0.0)[0] - t[0], fn(1.0, 0.0)[1] - t[1])
        e2 = (fn(0.0, 1.0)[0] - t[0], fn(0.0, 1.0)[1] - t[1])
        det = e1[0] * e2[1] - e1[1] * e2[0]

        def inv(x, y):
            dx, dy = x - t[0], y - t[1]
            return (dx * e2[1] - dy * e2[0]) / det, (e1[0] * dy - e1[1] * dx) / det
        _INV[plan] = (inv, rot)
    return _INV[plan]


def g_de(plan, t):
    """L'image du film à l'instant t du tronçon (t = 0 à sa première image)."""
    return P.START[plan] + t * FPS


def suiveuse_scene(plan, t):
    """(x, y) de la suiveuse dans la scène du tronçon `plan`, à son instant t."""
    return vers_scene(plan)[0](*suiveuse(g_de(plan, t)))


def suiveuse_cap_scene(plan, t):
    return suiveuse_cap(g_de(plan, t)) - vers_scene(plan)[1]


# ---------------------------------------------------------------- le relevé

def main():
    import trafic as T
    print("la suiveuse (la patrouille 1) : image, avance, écart à gauche, vitesse, accélération ; la berline")
    c = _cles()
    pr = [DEPART + t * FPS for t, _ in c["profil"]]
    print(f"  vitesse tenue jusqu'à l'image {pr[2]:.1f}, freinage de {B_FREIN} m/s² tenu de {pr[3]:.1f} à {pr[4]:.1f}, gaz "
          f"de {A_GAZ} m/s² tenus de {pr[5]:.1f} à {pr[6]:.1f} ; {min(v for _, v in c['table']):.1f} m/s au plus bas ; "
          f"écart au but {c['manque'] * 1000:.1f} mm")
    for g in list(range(48, RACCORD + 12, 12)):
        hx, hy, _ = T._hero(g)
        x, y = suiveuse(g)
        sh, f = T._plan(g)
        av, ec = releve(g)
        print(f"  {g:3d} {sh:3}/{f:3d}  avance {av:6.2f}  écart {ec:5.2f}"
              f"  ({x:7.2f}, {y:8.2f})  {suiveuse_vitesse(g):5.1f} m/s  {suiveuse_accel(g):+5.2f} m/s²"
              f"   berline ({hx:7.2f}, {hy:8.2f}) {P.hero(sh)['speed'](f):5.1f} m/s")
    acc = [(suiveuse_accel(g / 2.0), g / 2.0) for g in range(2 * DEPART - 20, 2 * RACCORD + 20)]
    print("  accélération de %.2f (image %.1f) à %.2f m/s² (image %.1f)" % (min(acc) + max(acc)))
    import motion as M
    cs = M.car_series(lambda t: suiveuse(t * FPS), range(DEPART - 6, RACCORD + 8), 0, FPS, lambda t: suiveuse_cap(t * FPS))
    pk = lambda d: max((abs(v), f) for f, v in d.items())  # noqa: E731
    circ = {f: math.hypot(cs["alat"][f], cs["along"][f]) for f in cs["alat"]}
    print("  conduite (motion.car_series ; plafonds des patrouilles : latérale 7, freinage 7,2, accélération 4, cercle "
          "7,5 m/s², à-coup 40 m/s³, lacet 120 °/s²) :\n    latérale %.2f (%d), freinage %.2f (%d), accélération %.2f (%d), "
          "cercle %.2f (%d), à-coup %.1f (%d), lacet %.1f (%d)" % (
              pk(cs["alat"]) + max((-v, f) for f, v in cs["along"].items()) + max((v, f) for f, v in cs["along"].items())
              + pk(circ) + pk(cs["jerk"]) + pk(cs["yaw_acc"])))
    for g in (DEPART, RACCORD):
        e = 1e-3
        print(f"  raccord à l'image {g} : {math.dist(suiveuse(g - e), suiveuse(g + e)) * 1000:.2f} mm sur {2 * e} image, "
              f"vitesse {suiveuse_vitesse(g - 0.5):.2f} puis {suiveuse_vitesse(g + 0.5):.2f} m/s")


if __name__ == "__main__":
    import police          # (les modules des plans lisent « police », pas « __main__ » : une seule instance)
    police.main()
