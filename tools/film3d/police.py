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

DEPART = 107                 # l'image où elle quitte la loi de l'avenue (p1_avenue : inchangée jusqu'à la coupe P1 | P2)
RACCORD = 358                # l'image où elle rejoint la loi du pont (p4_pont : de 340 à 385, le contact du pont)
# Sa ligne, à elle (la berline glisse, esquive et se déporte : elle ne la copie pas) : sa voie de l'avenue tenue tout
# droit, un seul virage à gauche à travers l'anneau, la droite qui passe la trouée du barrage, sa voie du pont.
VIRAGE = (56.0, 28.0)        # m : la longueur de son virage (courbure posée sur la longueur, nulle aux deux bouts) et
#                              celle de ses entrées et sorties de courbure (smoothstep : 28, un seul sommet au milieu,
#                              0,056 /m) ; où il commence s'en déduit : là d'où il finit sur la droite de la trouée
TROUEE = (255.4, 0.07)       # la droite de la trouée : la tangente du chemin de la berline là où elle est à cette
#                              image, tant de mètres à gauche (la patrouille de droite du barrage dépasse des plots)
REJOINT = (246, 290)         # la trouée passée, elle se range à ECART m à gauche du chemin de la berline (qui s'écarte
#                              à droite à la sortie du barrage, pour S) : entre là où la berline est passée à ces deux
#                              images. Elle passe S entre S et la berline, à gauche de la caméra (le bras B la tient
#                              à 0,6 m à droite du chemin, 7 m derrière la berline) : sur le chemin même, la suiveuse,
#                              qui revient de 13 m à 0,3 m, passerait dans l'objectif
ECART = 1.4
DEBOITE = 300                # puis elle déboîte vers sa voie du pont, de là où la berline est passée à cette image
#                              (S, qui descend la rue, est derrière elle) jusqu'à là où elle est passée à DEBOITE_FIN
DEBOITE_FIN = 348            # (elle y est dans sa voie du pont, à côté de la berline, et la tient jusqu'à RACCORD)
PAS_LIGNE = 0.05             # m : le pas de sa ligne
# Son allure : son freinage de l'avenue relâché, elle tient sa vitesse, se retient (B_FREIN) jusqu'à V_ANNEAU pour
# l'anneau, remet un filet de gaz (A_SUIT : la berline ressort de sa glisse et relance, elle la suit à sa distance),
# puis les gaz en grand (A_GAZ) jusqu'à sa place du pont. L'instant de sa retenue et celui des gaz en grand sont ceux
# qui la mettent à sa place du pont, à sa vitesse.
B_FREIN = 3.0                # m/s² : sa retenue pour l'anneau
V_ANNEAU = 12.0              # m/s : sa vitesse au plus haut au sommet de son virage (elle y arrive à 12,3, son
#                              freinage de l'avenue relâché : pas de retenue)
A_SUIT = 2.4                 # m/s² : le filet de gaz de la suite
A_GAZ = 3.9                  # m/s² : ses gaz (le plafond : 4, motion.DRIVE_KINDS)
J_FREIN, J_GAZ, J_PONT = 10.0, 10.0, 9.0   # m/s³ : les à-coups de son freinage, de ses gaz, de son lever de pied

_BASE_AVENUE = None          # la loi de l'avenue avant le contact, (t du plan P1) -> (x, y) de sa scène
_BASE_PONT = None            # la loi du pont avant le contact, (t du plan P4) -> (x, y) de sa scène
_CLES = None
_Q_VIRAGE = _Q_SORTIE = None


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


def _integre(prof, v0):
    """(chemin, vitesse) au bout d'un profil [(t, accélération)] linéaire par morceaux, exacts."""
    q, v = 0.0, v0
    for (ta, aa), (tb, ab) in zip(prof, prof[1:]):
        d = tb - ta
        q += v * d + d * d * (2.0 * aa + ab) / 6.0
        v += 0.5 * (aa + ab) * d
    return q, v


def _profil(am, tp, e0, e1):
    """[(t, accélération)] de DEPART à RACCORD (s depuis DEPART), linéaire entre les sommets : son freinage de
    l'avenue relâché, sa vitesse tenue (retenue à B_FREIN jusqu'à V_ANNEAU si elle va plus vite, la retenue finie là
    où son virage serre, _Q_VIRAGE), tenue jusqu'à la sortie de son virage (_Q_SORTIE), un filet de gaz (am) jusqu'à
    tp, les gaz en grand (A_GAZ), puis l'accélération de la loi du pont. None si les phases ne tiennent pas."""
    T = (RACCORD - DEPART) / FPS
    (v0, a0) = e0[2:]
    a1 = e1[3]
    b, a = B_FREIN, A_GAZ
    t0, tf, te = abs(a0) / J_GAZ, b / J_FREIN, abs(a - a1) / J_PONT
    vr = v0 + a0 * t0 / 2.0
    k = [(0.0, a0), (t0, 0.0)]
    q, v = _integre(k, v0)
    if vr - b * tf > V_ANNEAU:
        th = (vr - b * tf - V_ANNEAU) / b
        frein = [(0.0, 0.0), (tf, -b), (tf + th, -b), (2 * tf + th, 0.0)]
        qf, v = _integre(frein, vr)
        ts = t0 + (_Q_VIRAGE - q - qf) / vr
        if ts < t0:
            return None
        k += [(ts + x, y) for x, y in frein]
        q = _Q_VIRAGE
    t3 = k[-1][0] + (_Q_SORTIE - q) / v
    tr, tg = abs(am) / J_GAZ, abs(a - am) / J_GAZ
    k += [(t3, 0.0), (t3 + tr, am)]
    if tp < k[-1][0]:
        return None
    k += [(tp, am), (tp + tg, a), (T - te, a), (T, a1)]
    if any(y[0] < x[0] for x, y in zip(k, k[1:])):
        return None
    return k


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
    tenue tout droit (la droite de sa course à DEPART) jusqu'à x VIRAGE[0] ; un seul virage à gauche jusqu'à la droite
    de la trouée, rejointe à y VIRAGE[1] (quintique d'Hermite : place et cap raccordés, courbure nulle aux deux
    bouts) ; cette droite à travers le barrage ; puis, de G_DEBOITE[0] à G_DEBOITE[1], un seul fondu vers sa voie
    du pont (la droite de la loi du pont à RACCORD)."""
    o = _avenue_ville(DEPART)
    a, b = _avenue_ville(DEPART - 1.0), _avenue_ville(DEPART + 1.0)
    d = math.dist(a, b)
    ux, uy = (b[0] - a[0]) / d, (b[1] - a[1]) / d
    # la droite de la trouée
    D, (dx, dy) = _au_chemin(s_berline(TROUEE[0]))
    D = (D[0] - dy * TROUEE[1], D[1] + dx * TROUEE[1])
    # son virage, posé depuis son départ (courbure lissée aux deux bouts, tenue entre) ; la place d'où il part sur sa
    # voie est celle qui le fait finir sur la droite de la trouée (l'écart y est linéaire en elle)
    Lt, Lr = VIRAGE
    th = math.atan2(ux * dy - uy * dx, ux * dx + uy * dy)          # l'angle à tourner (à gauche)
    km = th / (Lt - Lr)
    n = int(Lt / PAS_LIGNE)

    def w(q):
        u = min(1.0, q / Lr, (Lt - q) / Lr)
        return u * u * (3.0 - 2.0 * u) if u < 1.0 else 1.0
    rel, h, x, y = [], math.atan2(uy, ux), 0.0, 0.0
    for k in range(n):
        q = (k + 0.5) * PAS_LIGNE
        rel.append((x, y))
        hm = h + 0.5 * km * w(q) * PAS_LIGNE
        x, y = x + math.cos(hm) * PAS_LIGNE, y + math.sin(hm) * PAS_LIGNE
        h += km * w(q) * PAS_LIGNE
    end = (x, y)
    # l'écart à la droite de la trouée de la fin du virage, partant de o + ux m : linéaire en m
    def ecart(m):
        return (o[0] + ux * m + end[0] - D[0]) * -dy + (o[1] + uy * m + end[1] - D[1]) * dx
    droit = -ecart(0.0) / (ecart(1.0) - ecart(0.0))
    pts = [(o[0] + ux * k * PAS_LIGNE, o[1] + uy * k * PAS_LIGNE) for k in range(int(droit / PAS_LIGNE))]
    A = (o[0] + ux * droit, o[1] + uy * droit)
    pts += [(A[0] + p[0], A[1] + p[1]) for p in rel]
    B = (A[0] + end[0], A[1] + end[1])
    global _Q_VIRAGE, _Q_SORTIE
    _Q_VIRAGE, _Q_SORTIE = droit + Lr, droit + Lt - Lr   # (sa courbure tenue : là où elle est au plus lent)
    # sa voie du pont : la droite de la loi du pont à RACCORD, prolongée vers l'arrière
    R = _pont_ville(RACCORD)
    ra, rb = _pont_ville(RACCORD - 1.0), _pont_ville(RACCORD + 1.0)
    d = math.dist(ra, rb)
    vx, vy = (rb[0] - ra[0]) / d, (rb[1] - ra[1]) / d
    cs = dx * vx + dy * vy

    def voie(q):
        return (q[0] - R[0]) * vx + (q[1] - R[1]) * vy
    # le chemin de la berline, relevé à la hauteur de la voie : (hauteur, x, y) croissants
    pts_b, cum_b = _chemin()
    s_a = s_berline(TROUEE[0])
    haut = [(voie(q), q) for q, c in zip(pts_b, cum_b) if c >= s_a - 30.0]

    def chemin(v):
        lo, hi = 0, len(haut) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if haut[m][0] <= v:
                lo = m
            else:
                hi = m
        (va_, qa), (vb_, qb) = haut[lo], haut[hi]
        u = min(1.0, max(0.0, (v - va_) / ((vb_ - va_) or 1e-9)))
        return qa[0] + (qb[0] - qa[0]) * u, qa[1] + (qb[1] - qa[1]) * u

    def lisse(a, b, v):
        u = min(1.0, max(0.0, (v - a) / (b - a)))
        return u * u * u * (10.0 - 15.0 * u + 6.0 * u * u)
    r0, r1 = (voie(_au_chemin(s_berline(g))[0]) for g in REJOINT)
    d0 = voie(_au_chemin(s_berline(DEBOITE))[0])
    d1 = min(0.0, voie(_au_chemin(s_berline(DEBOITE_FIN))[0]))
    v0, vD = voie(B), voie(D)
    n = int(math.ceil(-v0 / PAS_LIGNE))
    for k in range(n + 1):
        v = v0 * (1.0 - k / n)
        m = (v - vD) / cs                       # le point de la droite de la trouée à la hauteur v de la voie
        ax, ay = D[0] + dx * m, D[1] + dy * m
        w1 = lisse(r0, r1, v)
        if w1 > 0.0:                            # la trouée passée, elle se range à gauche du chemin de la berline
            cx, cy = chemin(v)
            (px, py), (qx, qy) = chemin(v - 0.5), chemin(v + 0.5)
            t = math.hypot(qx - px, qy - py) or 1.0
            cx, cy = cx - ECART * (qy - py) / t, cy + ECART * (qx - px) / t
            ax, ay = ax + (cx - ax) * w1, ay + (cy - ay) * w1
        w2 = lisse(d0, d1, v)                   # puis déboîte vers sa voie du pont
        pts.append((ax + (R[0] + v * vx - ax) * w2, ay + (R[1] + v * vy - ay) * w2))
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
        T = (RACCORD - DEPART) / FPS

        def fin(am, tp):
            prof = _profil(am, tp, e0, e1)
            return None if prof is None else _integre(prof, e0[2])

        def gaz(am):
            """L'instant des gaz en grand qui la met à la vitesse du pont (None : aucun)."""
            ok = [tp for tp in (k * 0.02 for k in range(int(T / 0.02))) if fin(am, tp) is not None]
            if not ok or fin(am, ok[0])[1] < e1[2] or fin(am, ok[-1])[1] > e1[2]:
                return None
            lo, hi = ok[0], ok[-1]
            for _ in range(40):
                tp = (lo + hi) / 2.0
                if fin(am, tp)[1] < e1[2]:
                    hi = tp                    # trop lente au pont : les gaz en grand plus tôt
                else:
                    lo = tp
            return (lo + hi) / 2.0
        # le filet de gaz : celui où son chemin est celui de sa ligne (bissection sur un changement de signe)
        ok = [(am, gaz(am)) for am in (-1.0 + 0.1 * k for k in range(50))]
        ok = [(am, tp) for am, tp in ok if tp is not None]
        assert ok, "la suiveuse ne rejoint pas sa vitesse du pont (aucun filet de gaz ne convient)"
        q = [fin(am, tp)[0] - but for am, tp in ok]
        pair = next(((ok[i][0], ok[i + 1][0], q[i]) for i in range(len(ok) - 1) if q[i] * q[i + 1] <= 0.0), None)
        assert pair is not None, "la suiveuse ne rejoint pas sa place du pont : %.2f à %.2f m d'écart" % (min(q), max(q))
        lo, hi, qlo = pair
        for _ in range(40):
            am = (lo + hi) / 2.0
            tp = gaz(am)
            if tp is not None and (fin(am, tp)[0] - but) * qlo > 0.0:
                lo = am
            else:
                hi = am
        am = lo
        tp = gaz(am)
        prof = _profil(am, tp, e0, e1)
        assert prof is not None, "la suiveuse ne rejoint pas sa place du pont (aucune retenue ne convient)"
        tab = _table(prof, e0[2])
        assert abs(tab[-1][0] - but) < 0.02 and min(v for _, v in tab) > 1.0, \
            "la suiveuse ne rejoint pas sa place du pont : %.2f m d'écart, %.1f m/s au plus bas" % (
                tab[-1][0] - but, min(v for _, v in tab))
        _CLES = dict(ligne=(pts, cum), table=tab, profil=prof, suit=am, manque=tab[-1][0] - but)
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


# ---------------------------------------------------------------- la police à l'image

GELS = (107, 214, 317, 425, 485, 719)    # les images où le film gèle sur place (la fin des tronçons, le site)
TRONCONS = ("OUV", "P1", "P2", "P3", "P4", "P5", "P6")
VUE = dict(part=0.5, libre=0.4, haut=0.03)   # « à l'image » : la moitié de sa silhouette dans le cadre, la moitié de
#                              ce qui y tombe hors de la berline (quand elle est derrière elle), 3 % de la hauteur
BANDES = (0.06, 0.25, 0.72)  # les bandes de l'incrustation du site (hauteur depuis le haut) : étoiles, étoile qui
#                              tombe, texte


def a_l_image(g):
    """[(nom, part de sa silhouette dans le cadre, part libre, hauteur, aire du cadre, (v0, v1), à l'image ?)] des
    patrouilles du tronçon de l'image g, vues par la caméra du film (le bras en vigueur, bras.installer)."""
    import diag.audit_cadre as AC
    sh, f = AC.T._plan(g)
    cam = P.chase(sh, f)
    hr, (hx, hy), _ = AC.hero_rect(cam, sh, f)
    d_hero = math.hypot(hx - cam[0], hy - cam[1])
    out = []
    for (shot, nom) in AC._POURS:
        if shot != sh:
            continue
        p = AC.patrouille(shot, nom, g)
        if not p or AC.profondeur(cam, sh, p[0], p[1]) <= 0.5:
            continue
        r = AC.rect(cam, sh, *p, AC.PATROL)
        if not r or AC.aire(r) <= 0:
            continue
        part = AC.silhouette(cam, sh, *p, AC.PATROL)
        dans = AC.aire(AC.coupe(r))
        vis = dans
        if AC.profondeur(cam, sh, p[0], p[1]) > d_hero:
            vis -= AC.aire(AC.coupe(AC.coupe(r), hr))
        libre = vis / dans if dans > 0 else 0.0
        haut = min(1.0, r[3]) - max(0.0, r[2])
        ok = part >= VUE["part"] and libre >= VUE["libre"] and haut >= VUE["haut"]
        out.append((nom, part, libre, haut, dans, (r[2], r[3]), ok))
    return out


def releve_image(gs=None):
    """{g: nombre de patrouilles à l'image} sur les images de la poursuite (0 à 618 : FIN6 n'est pas mesurée)."""
    gs = range(0, P.START["FIN6"]) if gs is None else gs
    return {g: sum(1 for r in a_l_image(g) if r[-1]) for g in gs}


def main_image():
    import bras
    print("la police à l'image, bras", bras.installer(bras.nom_regle() if os.environ.get(bras.ENV) else "B"))
    n = releve_image()
    for sh in TRONCONS:
        g0, g1 = P.START[sh], P.START[sh] + dict(P.SHOTS)[sh] - 1
        vus = [g for g in range(g0, g1 + 1) if n[g]]
        trous, a = [], None
        for g in range(g0, g1 + 2):
            if g <= g1 and not n[g]:
                a = g if a is None else a
            elif a is not None:
                trous.append((a, g - 1))
                a = None
        print(f"  {sh:4} {g0:3d}–{g1:3d} : {100 * len(vus) / (g1 - g0 + 1):3.0f} % des images ; sans police : "
              + (", ".join(f"{x}–{y}" for x, y in trous if y - x >= 5) or "—"))
    for g in GELS[:-1]:
        rows = a_l_image(g)
        print(f"  gel {g} : " + ("; ".join(f"{nom} {100 * part:.0f} % dans le cadre, {100 * libre:.0f} % libre, "
                                          f"{100 * h:.1f} % de haut, {100 * aire:.2f} % du cadre, v {v[0]:.2f}–{v[1]:.2f}"
                                          + (" À L'IMAGE" if ok else "")
                                          for nom, part, libre, h, aire, v, ok in rows) or "aucune"))


# ---------------------------------------------------------------- le relevé

def main():
    import trafic as T
    print("la suiveuse (la patrouille 1) : image, avance, écart à gauche, vitesse, accélération ; la berline")
    c = _cles()
    pr = [DEPART + t * FPS for t, _ in c["profil"]]
    print("  son profil (image : accélération) : " + ", ".join(f"{g:.1f} : {a:+.2f}" for g, (_, a) in zip(pr, c["profil"]))
          + f" ; filet de gaz {c['suit']:.2f} m/s² ; {min(v for _, v in c['table']):.1f} m/s au plus bas ; écart au but "
          f"{c['manque'] * 1000:.1f} mm")
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
    if "--image" in sys.argv:
        police.main_image()
    elif "--coupes" in sys.argv:
        police.main_coupes()
    else:
        police.main()
