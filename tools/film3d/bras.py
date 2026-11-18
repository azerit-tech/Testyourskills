# Le bras de la caméra de poursuite, version 11 (18 novembre, Jacques sur le brouillon éclairé v10 : « ça paraît mou, en
# particulier les dérapages ») : une loi de l'état de la berline, pas des courbes dessinées. Trois réglages
# comparables : A le bras du film v10 (parcours.chase, tel quel), B « nerveux », C « poussé ».
#
# Mesuré sur A (diag/audit_bras.py) : ses leviers de vitesse (hauteur, distance, focale) ne lisent que la VITESSE. Dans
# les deux dérapages la berline roule à 40–46 km/h : le bras y revient au cadre de l'arrêt (7,9 m, 2,4 m, 24 mm), la
# chaussée y défile trois fois moins vite que sur l'avenue (92 px par image contre 270), et la berline, visée
# exactement, reste clouée au centre.
#
# La loi (un seul calcul sur le temps du film, dans le repère du parcours : la même pose des deux côtés de chaque
# raccord, par construction ; rien n'est écrit par image, tout se lit sur parcours.DRIVE) :
#  - l'élan E, de 0 à 1 : la vitesse (V) OU l'effort (le virage de la route v²κ, la glisse) ; lissé d'une gaussienne
#    centrée (il devance le virage). Le bras descend (Z), se rapproche (BACK) et s'ouvre (LENS) avec E : dans un
#    dérapage à 40 km/h il est aussi bas, aussi près et aussi large qu'à 100 km/h en ligne droite ;
#  - le cap du bras est une remorque attelée à la berline (LV m de timon : ψ' = v/LV · sin(cap de la vitesse − ψ)) :
#    dans un virage il traîne à l'extérieur (asin(LV·κ) : 15 à 19° pour 7 m), la caisse montre son flanc, et il
#    rattrape en sortie (le décor balaie) ; son retard se compte en mètres, pas en secondes : court à 100 km/h, long
#    dans un dérapage ;
#  - la visée pose la boîte de la berline au milieu de la largeur, son bas à V_BAS (au-dessus de la ligne de texte du
#    site, quelle que soit sa taille), puis son lacet passe par un opérateur (second ordre, AIM) : la berline
#    part du côté où elle tourne, il la rattrape ; borné (AIM_MAX, en largeur de cadre) ;
#  - le ressort entre la berline et le bras (SPRING) : elle s'échappe aux gaz, il la rattrape au freinage ;
#  - le recul dans le virage (TURN : la glisse élargit la berline), le roulis vers le virage (ROLL), le côté vers la
#    bordure dans les lignes droites (SIDE, la loi de parcours.rig), le flottement de la route (parcours.tremble) ;
#  - les chocs : autour de chaque contact de contacts.CHOCS (son image, son côté, son avance : rien en dur), le cadre
#    passe à deux voitures, la réunion des boîtes de la berline et de la patrouille au centre, le bras reculé s'il
#    le faut (_deux_voitures) ; l'à-coup de contacts.secousse ;
#  - la fin : le bras se fond dans celui du film v10 avant l'arrêt (FIN, s avant l'arrêt) : l'orbite de FIN6 part du
#    cadre de Jacques (2,4 m, 7,5 m, 24 mm), inchangée.
#
# Le réglage se choisit SANS toucher à la clé du cache des lieux (debit.env_key prend toute variable FILM3D_*) :
#   - au rendu : render_film.py --essai bras=B (la scène est reprise du cache, sa caméra seule est reposée) ;
#   - hors Blender (tests, mesures) : BRAS_FILM=B python3 test_motion.py ; diag/audit_bras.py --bras A,B,C.
# installer() remplace les fonctions de caméra de parcours (chase, rig, cam_cap, camera, visee, tremble, visee_u) par
# celles du réglage ;
# sans réglage (ou A) rien n'est touché. Python pur (3.10 et plus).
import math
import os

import contacts as C
import motion as M
import parcours as P

ENV = "BRAS_FILM"                 # pas FILM3D_… : cette variable n'entre pas dans la clé du cache
DEFAUT = "A"

# V : m/s, de rien à tout l'élan de vitesse ; LAT : m/s² de virage de la route ; SLIP : ° de glisse ; SIGMA : s ;
# Z, BACK, LENS : (au pas, à plein élan) ; TURN : m de recul dans le virage ; BACK_MIN : m, jamais plus près ;
# LV : m de timon, VMIN : m/s (sous elle le bras tourne encore), TAU2 : s, second pôle ; AIM : (Hz, amortissement),
# AIM_MAX : largeur de cadre, MARGE : le cadre utile (la boîte de la berline n'en sort pas) ; SPRING : (rad/s, amortissement, m rattrapés à 7 m/s² de freinage, m lâchés à 3 m/s² de
# gaz) ; ROLL : ° par m/s², ROLL_MAX ° ; VOIE : la part d'un changement de voie dans le roulis ; SIDE : m vers la
# bordure (négatif) en ligne droite ; DEPORT : largeur de cadre par m/s de vitesse de côté dans le slalom ; FLOAT : le
# gain du flottement de parcours ; VIB : (° de roulis, ° de site) de vibration fine ajoutée à pleine vitesse ; FIN : s
# avant l'arrêt (début, fin du fondu vers le bras v10) ; OBTURATEUR : celui que render_film pose avec ce réglage
# (None : celui de la scène, 0,5).
REGLAGES = {
    "A": None,
    "B": dict(V=(8.0, 22.0), LAT=(1.2, 4.0), SLIP=(5.0, 15.0), GATE=(3.0, 9.0), SIGMA=0.40,
              Z=(2.4, 2.05), BACK=(7.5, 5.2), LENS=(24.0, 17.5), LENS_SIGMA=0.55, TURN=1.5, BACK_MIN=4.4,
              LV=7.0, VMIN=7.0, TAU2=0.10, AIM=(0.80, 0.75), AIM_MAX=0.09, MARGE=0.085,
              SPRING=(1.3, 0.65, 0.9, 1.6), SPRING_TAU=0.30,
              ROLL=0.85, ROLL_MAX=5.0, ROLL_TAU=0.35, VOIE=0.6, SIDE=-1.0, DEPORT=0.018, FLOAT=1.0, VIB=(0.0, 0.0),
              FIN=(4.6, 2.3), OBTURATEUR=None),
    "C": dict(V=(8.0, 22.0), LAT=(1.0, 3.5), SLIP=(4.0, 13.0), GATE=(3.0, 9.0), SIGMA=0.40,
              Z=(2.4, 1.58), BACK=(7.5, 4.5), LENS=(24.0, 15.0), LENS_SIGMA=0.80, TURN=1.4, BACK_MIN=4.1,
              LV=8.0, VMIN=7.0, TAU2=0.10, AIM=(0.70, 0.75), AIM_MAX=0.08, MARGE=0.105,
              SPRING=(1.5, 0.55, 0.8, 2.2), SPRING_TAU=0.30,
              ROLL=1.25, ROLL_MAX=7.5, ROLL_TAU=0.35, VOIE=0.7, SIDE=-0.6, DEPORT=0.018, FLOAT=1.3, VIB=(0.12, 0.03),
              FIN=(6.2, 2.3), OBTURATEUR=0.7),
}

_H, _T0 = P._H, P._T0             # la grille du bras de parcours : 1/240 s depuis −1,5 s
# les chocs : la fenêtre par défaut d'un contact sans entrée dans parcours.CADRE_CHOCS (images comptées de celle du
# choc : début du fondu, plein, fin du plein, fin du fondu), ce qu'on ajoute à la boîte de la patrouille (m : en
# longueur vers l'arrière, d'où elle arrive ; en largeur, le côté d'où elle serre), la largeur du cadre laissée aux
# deux voitures
CHOC_FENETRE = (-36.0, -14.0, 1.0, 20.0)
CHOC_BOITE = (1.0, 1.2)
CHOC_LARGE = 0.86
CHOC_GARDE = 0.085                # la berline reste à cette part de largeur du bord pendant un choc (slalom compris)
CHOC_SIGMA = 0.25                 # s : le lissage du cadre à deux voitures
CHOC_RECUL = 1.45                 # le bras recule au plus de ce facteur (une voiture à la hauteur de l'objectif ne se cadre pas)
SITE_SIGMA = 0.33                 # s : le lissage du site (plus près, le bras bascule plus pour la même bosse)
V_BAS = 0.70                      # le bas de la boîte de la berline dans le cadre : au-dessus de la ligne de texte (72 %)
_Q = 4                            # échantillons de visée par image
_K0 = -36 * _Q                    # la visée commence 36 images avant le film
_TAB = {}
_FORCE = [None]
_A = dict(chase=P.chase, rig=P.rig, cam_cap=P.cam_cap, camera=P.camera, visee=P.visee, tremble=P.tremble,
          visee_u=P.visee_u)
_DANS_A = [0]


def _ref(k, *a, **kw):
    """La fonction d'origine de parcours (le bras A). Ses appels internes passent par les noms du module, que
    installer a remplacés : le temps de l'appel, ces noms rendent les fonctions d'origine."""
    _DANS_A[0] += 1
    try:
        return _A[k](*a, **kw)
    finally:
        _DANS_A[0] -= 1


def _aiguille(k, f):
    """La fonction posée dans parcours à la place de `k` : celle du réglage, celle d'origine pendant un appel de
    _ref."""
    def g(*a, **kw):
        return _A[k](*a, **kw) if _DANS_A[0] else f(*a, **kw)
    g.__name__ = k
    return g
_VERS_VILLE = P.placer("P4")[0]   # le repère de ville est celui du pont (parcours.vers_ville)


def nom_regle(nom=None):
    """Le réglage en vigueur : celui donné, sinon celui installé, sinon BRAS_FILM, sinon DEFAUT."""
    n = nom or _FORCE[0] or os.environ.get(ENV, "").strip().upper() or DEFAUT
    if n not in REGLAGES:
        raise ValueError(f"bras : réglage {n!r} inconnu ({', '.join(sorted(REGLAGES))})")
    return n


def _sol(x, y):
    """La hauteur de la chaussée au point (x, y) du parcours."""
    return P.sol_ville(*_VERS_VILLE(x, y))


def _gauss(vals, sigma, pas):
    """vals (au pas `pas` s) lissé d'une gaussienne centrée d'écart sigma (s), bords tenus."""
    sg = sigma / pas
    m = int(3 * sg)
    w = [math.exp(-0.5 * (j / sg) ** 2) for j in range(-m, m + 1)]
    sw = sum(w)
    n = len(vals)
    return [sum(w[j + m] * vals[max(0, min(n - 1, i + j))] for j in range(-m, m + 1)) / sw for i in range(n)]


def _lisse(col, sigma, st=5):
    """Une colonne de la grille du bras lissée (gaussienne centrée), calculée au pas de st échantillons."""
    sm = _gauss(col[::st], sigma, _H * st)
    out = []
    for k in range(len(col)):
        u = k / st
        i = min(len(sm) - 2, int(u))
        out.append(sm[i] + (sm[i + 1] - sm[i]) * (u - i))
    return out


def _borne(x, lo, hi, d=0.015):
    """x borné entre lo et hi, sans coin (un minimum et un maximum doux, de largeur d) : une borne qui se ferme
    d'un seul côté (la boîte de la berline au bord du cadre) ne casse pas la pente au passage par zéro."""
    y = -d * math.log(math.exp(-x / d) + math.exp(-hi / d))
    return d * math.log(math.exp(y / d) + math.exp(lo / d))


def _reste(x, maxi, d=0.015):
    """La place qui reste (x, en largeur de cadre) entre 0 et maxi, sans coin : la borne de _borne bouge avec la
    boîte de la berline, ses propres coins passeraient dans la visée."""
    x = d * math.log1p(math.exp(max(-40.0, min(40.0, x / d))))
    return -d * math.log(math.exp(-x / d) + math.exp(-maxi / d))


def _poids_chocs(t):
    """[(contact, poids de 0 à 1)] à l'instant t : autour de chaque contact de contacts.CHOCS, la fenêtre de
    parcours.CADRE_CHOCS (en images comptées de celle du choc), sinon CHOC_FENETRE ; fondus quintiques."""
    g = t * P.FPS
    out = []
    for c in C.CHOCS:
        a, b, d, e = (c["image"] + x for x in P.CADRE_CHOCS.get(c["nom"], {}).get("images", CHOC_FENETRE))
        w = P._fondu5(a, b, g) * (1.0 - P._fondu5(d, e, g))
        if w > 0.0:
            out.append((c, w))
    return out


def _deux_voitures(R, t, hx, hy, head, psi, back, left, zr, lens):
    """(déport de la visée en largeur de cadre, recul du bras en m) qui gardent dans le cadre la patrouille d'un
    contact : la boîte où elle se tient autour du choc (contre le flanc `cote` de la berline, `avance` m devant son
    centre : contacts.CHOCS ; élargie de CHOC_BOITE) est cadrée avec celle de la berline, leur réunion au centre et
    sous CHOC_LARGE de la largeur. Calculé sur la place des deux voitures, rien n'est dosé par contact."""
    du = recul = 0.0
    for c, w in _poids_chocs(t):
        a = math.radians(psi)
        fx, fy = -math.sin(a), math.cos(a)
        x, y = hx - back * fx - left * fy, hy - back * fy + left * fx
        hz = _sol(hx, hy)
        z = zr + _sol(x, y)
        cam = (x, y, z, math.degrees(math.atan2(-(hx - x), -(hy - y))),
               math.degrees(math.atan2(hz + 0.7 - z, math.hypot(hx - x, hy - y))), 0.0, lens)
        h = math.radians(head)
        ax, ay = -math.sin(h), math.cos(h)
        dl, dw = CHOC_BOITE
        lat = c["cote"] * (C.HERO[0] + C.PATROL[0] + 0.5 * dw)
        lon = c.get("avance", 0.0) - 0.5 * dl
        px, py = hx + lon * ax - lat * ay, hy + lon * ay + lat * ax
        b0 = M.hero_screen(cam, hx, hy, hz, head)
        b1 = M.hero_screen(cam, px, py, hz, head, box=(2.0 * C.PATROL[1] + dl, 2.0 * C.PATROL[0] + dw, 1.5))
        if not b0 or not b1:
            continue
        u0, u1 = min(b0["u0"], b1["u0"]), max(b0["u1"], b1["u1"])
        k = min(R.get("CHOC_RECUL", CHOC_RECUL), max(1.0, (u1 - u0) / CHOC_LARGE))        # le bras recule de ce facteur
        # la réunion au centre, la berline d'abord : sa boîte reste dans le cadre utile (une patrouille à la
        # hauteur de l'objectif ne se cadre pas entière)
        hw = 0.5 * (b0["u1"] - b0["u0"]) / k
        lim = max(0.0, 0.5 - CHOC_GARDE - hw)
        d = -(0.5 * (u0 + u1) - 0.5) / k
        d = lim * math.tanh(d / lim) if lim > 1e-3 else 0.0          # (borne douce : pas de coin dans la visée)
        du += w * d
        recul += w * back * (k - 1.0)
    return du, recul


def _table(nom):
    """Les tables du réglage : `bras` sur la grille (_T0, _H) : (x, y de la berline, ψ, recul, côté, hauteur, focale,
    roulis, élan, vitesse lissée, accélération retardée, latérale retardée, ressort) ; `visee` à _Q par image depuis
    _K0 : (cap de la visée, site) dans le repère du parcours."""
    if nom in _TAB:
        return _TAB[nom]
    R = REGLAGES[nom]
    D = P.DRIVE
    n = len(P._CAM)
    ts = [_T0 + k * _H for k in range(n)]
    # --- l'état de la berline, et ce que le bras en lit
    psi = psi2 = D.travel(_T0)
    v1 = v2 = D.speed(_T0)
    a1 = a2 = D.along(_T0)
    l1 = l2 = D.alat(_T0)
    w_s, z_s, g_fr, g_gz = R["SPRING"]
    gain = lambda a: (g_gz / 3.0 if a > 0 else g_fr / 7.0) * w_s * w_s * a          # noqa: E731
    d = gain(a1) / (w_s * w_s)
    dv = 0.0
    hx, hy, psis, vs, als, lats, ds, eff, qv, gates = [], [], [], [], [], [], [], [], [], []
    for t in ts:
        x, y = D.pos(t)
        v, a, l, th = D.speed(t), D.along(t), D.alat(t), D.travel(t)
        # la remorque : ψ tourne vers le cap de la vitesse à v / LV (sous VMIN elle tourne encore un peu : elle se
        # range derrière la berline qui s'arrête), puis un second pôle (pas d'à-coup de lacet à un choc)
        psi += max(v, R["VMIN"]) / R["LV"] * math.sin(math.radians(th - psi)) * _H * 180.0 / math.pi
        psi2 += (psi - psi2) * _H / R["TAU2"]
        c = _H / (0.6 / 2.0)
        v1 += (v - v1) * c
        v2 += (v1 - v2) * c
        c = _H / (R["SPRING_TAU"] / 2.0)
        a1 += (a - a1) * c
        a2 += (a1 - a2) * c
        # le roulis lit le virage de la route, et VOIE de ce que la berline y ajoute (ses changements de voie)
        l_route = v * v * P.ROUTE.at(P.s_of_t(t))[3]
        lm = l_route + R["VOIE"] * (l - l_route)
        c = _H / (R["ROLL_TAU"] / 2.0)
        l1 += (lm - l1) * c
        l2 += (l1 - l2) * c
        dv += (gain(a1) - 2.0 * z_s * w_s * dv - w_s * w_s * d) * _H
        d += dv * _H
        gate = M.smoothstep(R["GATE"][0], R["GATE"][1], v)
        hx.append(x)
        hy.append(y)
        psis.append(psi2)
        vs.append(v2)
        als.append(a2)
        lats.append(l2)
        ds.append(d)
        gates.append(gate)
        qv.append(M.smoothstep(R["V"][0], R["V"][1], v2))
        eff.append(gate * max(M.smoothstep(R["LAT"][0], R["LAT"][1], abs(l_route)),
                              M.smoothstep(R["SLIP"][0], R["SLIP"][1], abs(D.slip(t)))))
    eff = _lisse(eff, R["SIGMA"])
    elan = [1.0 - (1.0 - q) * (1.0 - e) for q, e in zip(_lisse(qv, R["SIGMA"]), eff)]
    elan_l = _lisse(elan, R["LENS_SIGMA"])
    bras = []
    heads = [D.heading(t) for t in ts]
    rows, dus, reculs = [], [], []
    for k, t in enumerate(ts):
        st = P._rig_at(t, 2)                           # la ligne droite de parcours.rig : le côté vers la bordure
        E = elan[k]
        back = R["BACK"][0] + (R["BACK"][1] - R["BACK"][0]) * E + R["TURN"] * eff[k] + ds[k] * gates[k]
        # jamais plus près que BACK_MIN (un genou doux, 0,6 m avant)
        over = R["BACK_MIN"] + 0.6 - back
        if over > 0.0:
            back = R["BACK_MIN"] + 0.6 - 0.6 * math.tanh(over / 0.6)
        left = P.CAM_LEFT + R["SIDE"] * qv[k] * st[4]
        zr = R["Z"][0] + (R["Z"][1] - R["Z"][0]) * E
        lens = R["LENS"][0] + (R["LENS"][1] - R["LENS"][0]) * elan_l[k]
        du, recul = _deux_voitures(R, t, hx[k], hy[k], heads[k], psis[k], back, left, zr, lens)
        roll = R["ROLL_MAX"] * math.tanh(R["ROLL"] * lats[k] * gates[k] / R["ROLL_MAX"])
        rows.append((back, left, zr, lens, roll))
        dus.append(du)
        reculs.append(recul)
    # le cadre à deux voitures, lissé (ses bornes font des coins : ni le bras ni la visée ne les prennent)
    dus, reculs = _lisse(dus, CHOC_SIGMA), _lisse(reculs, CHOC_SIGMA)
    for k, (back, left, zr, lens, roll) in enumerate(rows):
        bras.append((hx[k], hy[k], psis[k], back + reculs[k], left, zr, lens, roll, elan[k], vs[k], als[k], lats[k],
                     ds[k] * gates[k], dus[k]))
    tab = _TAB[nom] = dict(bras=bras, visee=None)
    # --- la visée : la boîte de la berline à (u, VISEE_V), puis l'opérateur
    n_v = (P.TOTAL + P.FIN6_FRAMES + 72) * _Q
    exact, prev = [], None
    for k in range(_K0, _K0 + n_v + 1):
        e = _visee_exacte(nom, k / (_Q * P.FPS))
        cap = e[0] if prev is None else prev + (e[0] - prev + 180.0) % 360.0 - 180.0
        prev = cap
        exact.append((cap,) + e[1:])
    # le site : le bas de la boîte à V_BAS, lissé d'une gaussienne centrée (les coins de la boîte changent pendant une
    # glisse) ; le lacet : l'opérateur
    sites = _gauss([e[1] for e in exact], SITE_SIGMA, 1.0 / (_Q * P.FPS))
    # (le lacet exact aussi, de la même gaussienne que la visée du bras A : au bord du cadre l'opérateur est borné
    # à zéro et rend le lacet exact, avec ses coins — fenêtre du slalom, coins de la boîte)
    caps = _gauss([e[0] for e in exact], P.VISEE_SIGMA, 1.0 / (_Q * P.FPS))
    exact = [(c,) + e[1:] for c, e in zip(caps, exact)]
    dt = 1.0 / (_Q * P.FPS)
    w = 2.0 * math.pi * R["AIM"][0]
    z = R["AIM"][1]
    y, yv = exact[0][0], 0.0
    out = []
    for (cap, _, u0, u1, lens), site in zip(exact, sites):
        for _ in range(2):                              # deux demi-pas : l'opérateur à 192 Hz
            yv += (w * w * (cap - y) - 2.0 * z * w * yv) * dt / 2.0
            y += yv * dt / 2.0
        # le retard de l'opérateur, en largeur de cadre (négatif : la berline part à gauche), borné par AIM_MAX et
        # par ce qui reste entre la boîte de la berline et le cadre utile (MARGE) : il ne la laisse jamais sortir
        k_u = lens / 20.25
        du = math.tan(math.radians(max(-60.0, min(60.0, y - cap)))) * k_u
        du = _borne(du, -_reste(u0 - R["MARGE"], R["AIM_MAX"]), _reste(1.0 - R["MARGE"] - u1, R["AIM_MAX"]))
        out.append((cap + math.degrees(math.atan(du / k_u)), site))
    tab["visee"] = out
    return tab


def _at(rows, t):
    u = (t - _T0) / _H
    k = max(0, min(len(rows) - 2, int(math.floor(u))))
    f = max(0.0, min(1.0, u - k))
    return tuple(rows[k][j] + (rows[k + 1][j] - rows[k][j]) * f for j in range(len(rows[k])))


def _waves(R, t, v, E):
    """Le flottement lent de parcours.tremble (dlacet, dsite, droulis en °, dcôté, dz en m), au gain du réglage, et
    la vibration fine ajoutée (roulis, site)."""
    F = P.RIG_LEVELS[2]["FLOAT"]
    flo = R["FLOAT"] * M.smoothstep(0.0, P.RIG_GATE, v) * (0.5 + 0.5 * E)
    out = [P._waves(t, P.RIG_FLOAT_HZ, P.RIG_LEVELS[2]["FLOAT_SEED"] + i, F[i] * flo) for i in range(5)]
    s2 = min(1.3, v / M.OPERATOR["vib_bras_v"]) ** 2
    hz = M.OPERATOR["vib_bras_hz"]
    out[2] += R["VIB"][0] * s2 * P._waves(t, hz, 71.0)
    out[1] += R["VIB"][1] * s2 * P._waves(t, hz, 73.0)
    return out


def _place(nom, t):
    """(x, y, z, focale) de la caméra dans le repère du parcours, z compté du niveau 0 de la ville ; et la ligne du
    bras."""
    R = REGLAGES[nom]
    b = _at(_table(nom)["bras"], t)
    hx, hy, psi, back, left, zr = b[:6]
    w = _waves(R, t, b[9], b[8])
    a = math.radians(psi)
    fx, fy = -math.sin(a), math.cos(a)
    x = hx - back * fx - (left + w[3]) * fy
    y = hy - back * fy + (left + w[3]) * fx
    return x, y, zr + w[4] + _sol(x, y), b[6], b


def _visee_exacte(nom, t):
    """(cap de la visée, site) qui posent la boîte de la berline à (u voulu, VISEE_V) depuis le bras, dans le repère
    du parcours (cap : 0 = +y, positif à gauche)."""
    R = REGLAGES[nom]
    x, y, z, lens, b = _place(nom, t)
    hx, hy = P.DRIVE.pos(t)
    hz = _sol(hx, hy)
    head = P.DRIVE.heading(t)
    u_cible = P.VISEE_U - R["DEPORT"] * P.vitesse_voie(t) + b[13]
    yaw = math.degrees(math.atan2(-(hx - x), -(hy - y)))
    pitch = math.degrees(math.atan2(hz + M.HERO_BOX[2] / 2.0 - z, math.hypot(hx - x, hy - y)))
    for _ in range(8):
        b0 = M.hero_screen((x, y, z, yaw, pitch, 0.0, lens), hx, hy, hz, head)
        if not b0:
            break
        eu, ev = u_cible - b0["u"], V_BAS - b0["v1"]
        if abs(eu) < 1e-6 and abs(ev) < 1e-6:
            break
        bu = M.hero_screen((x, y, z, yaw + 0.05, pitch, 0.0, lens), hx, hy, hz, head)
        bv = M.hero_screen((x, y, z, yaw, pitch + 0.05, 0.0, lens), hx, hy, hz, head)
        yaw += 0.05 * eu / (bu["u"] - b0["u"])
        pitch += 0.05 * ev / (bv["v1"] - b0["v1"])
    b0 = M.hero_screen((x, y, z, yaw, pitch, 0.0, lens), hx, hy, hz, head)
    return 180.0 - yaw, pitch, b0["u0"] if b0 else 0.5, b0["u1"] if b0 else 0.5, lens


def _visee(nom, t):
    tab = _table(nom)["visee"]
    u = t * P.FPS * _Q - _K0
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = min(1.0, max(0.0, u - k))
    return tuple(tab[k][j] + (tab[k + 1][j] - tab[k][j]) * f for j in range(2))


def _fin(nom, t):
    """La part du bras v10 dans la pose (0 : ce réglage, 1 : le bras v10) : le fondu avant l'arrêt de la pointe."""
    a, b = REGLAGES[nom]["FIN"]
    return P._fondu5(P.T_ARRET - a, P.T_ARRET - b, t)


def _mix(a, b, k):
    return a + (b - a) * k


def chase(shot, frame, nom=None):
    """(x, y, z, lacet, site, roulis, focale) : la caméra du film à l'image `frame` du tronçon (décimale admise),
    pour le réglage `nom` (sinon celui en vigueur). A : parcours.chase tel qu'il était avant installer()."""
    nom = nom_regle(nom)
    if REGLAGES[nom] is None:
        return _ref("chase", shot, frame)
    t = P.t_of(shot, frame)
    k = _fin(nom, t)
    if k >= 1.0:
        return _ref("chase", shot, frame)
    R = REGLAGES[nom]
    x, y, z, lens, b = _place(nom, t)
    cap, site = _visee(nom, t)
    w = _waves(R, t, b[9], b[8])
    to_scene, rot = P.placer(shot)
    sx, sy = to_scene(x, y)
    cz, cyaw, cpitch, croll = C.secousse(t)
    out = (sx, sy, z + cz, 180.0 - (cap - rot) + w[0] + cyaw, site + w[1] + cpitch, b[7] + w[2] + croll, lens)
    if k <= 0.0:
        return out
    ref = _ref("chase", shot, frame)
    return tuple(_mix(out[i], ref[i], k) for i in range(3)) + (
        out[3] + k * ((ref[3] - out[3] + 180.0) % 360.0 - 180.0), _mix(out[4], ref[4], k), _mix(out[5], ref[5], k),
        _mix(out[6], ref[6], k))


def rig(shot, frame, nom=None):
    """Le bras à l'image `frame` du tronçon, aux clés de parcours.rig : back, left, z (au-dessus de la chaussée),
    lens, roll, q (l'élan), speed, along, alat, spring, t ; fondu vers le bras v10 avant l'arrêt."""
    nom = nom_regle(nom)
    ref = _ref("rig", shot, frame)
    if REGLAGES[nom] is None:
        return ref
    t = P.t_of(shot, frame)
    b = _at(_table(nom)["bras"], t)
    out = dict(back=b[3], left=b[4], z=b[5], lens=b[6], roll=b[7], q=b[8], speed=b[9], along=b[10], alat=b[11],
               spring=b[12], t=t)
    k = _fin(nom, t)
    return {key: (_mix(out[key], ref[key], k) if key != "t" else t) for key in out}


def cam_cap(shot, frame, nom=None):
    """Le cap du bras (degrés, repère de la scène du tronçon)."""
    nom = nom_regle(nom)
    ref = _ref("cam_cap", shot, frame)
    if REGLAGES[nom] is None:
        return ref
    t = P.t_of(shot, frame)
    out = _at(_table(nom)["bras"], t)[2] - P.placer(shot)[1]
    return out + _fin(nom, t) * ((ref - out + 180.0) % 360.0 - 180.0)


def camera(shot, frame, back=None, left=None, z=None, nom=None):
    """La position de la caméra dans la scène, z au-dessus de la chaussée (parcours.camera) ; back, left, z donnés :
    ceux-là, le long du cap du bras."""
    nom = nom_regle(nom)
    if REGLAGES[nom] is None:
        return _ref("camera", shot, frame, back=back, left=left, z=z)
    if back is None or left is None or z is None:
        c = chase(shot, frame, nom)
        sec = C.secousse(P.t_of(shot, frame))[0]
        return c[0], c[1], c[2] - P.sol(shot, c[0], c[1]) - sec
    x, y = P.hero(shot)["pos"](frame)
    a = math.radians(cam_cap(shot, frame, nom))
    fx, fy = -math.sin(a), math.cos(a)
    return x - back * fx - left * fy, y - back * fy + left * fx, z


def visee(shot, frame, nom=None):
    """(lacet, site) de la visée, sans flottement ni à-coup (parcours.visee)."""
    nom = nom_regle(nom)
    if REGLAGES[nom] is None:
        return _ref("visee", shot, frame)
    t = P.t_of(shot, frame)
    cap, site = _visee(nom, t)
    out = (180.0 - (cap - P.placer(shot)[1]), site)
    k = _fin(nom, t)
    if k <= 0.0:
        return out
    ref = _ref("visee", shot, frame)
    return out[0] + k * ((ref[0] - out[0] + 180.0) % 360.0 - 180.0), _mix(out[1], ref[1], k)


def tremble(shot, frame, nom=None):
    nom = nom_regle(nom)
    if REGLAGES[nom] is None:
        return _ref("tremble", shot, frame)
    t = P.t_of(shot, frame)
    b = _at(_table(nom)["bras"], t)
    k = _fin(nom, t)
    ref = _ref("tremble", shot, frame)
    return tuple(_mix(a, r, k) for a, r in zip(_waves(REGLAGES[nom], t, b[9], b[8]), ref))


def visee_u(t, nom=None):
    """La place voulue du centre de la boîte de la berline (fraction de la largeur) avant l'opérateur."""
    nom = nom_regle(nom)
    if REGLAGES[nom] is None:
        return _ref("visee_u", t)
    R = REGLAGES[nom]
    out = P.VISEE_U - R["DEPORT"] * P.vitesse_voie(t) + _at(_table(nom)["bras"], t)[13]
    return _mix(out, _ref("visee_u", t), _fin(nom, t))


def installe():
    """Le réglage installé dans parcours (None : aucun, le bras v10)."""
    return _FORCE[0]


def installer(nom=None):
    """Remplace la caméra de parcours (chase, rig, cam_cap, camera, visee, tremble, visee_u) par celle du réglage
    `nom` (sinon celui déjà posé, sinon BRAS_FILM, sinon DEFAUT) ; A : la remet telle qu'elle était. Rend le nom du réglage en vigueur."""
    nom = nom_regle(nom)             # (sans nom : le réglage déjà posé, sinon BRAS_FILM, sinon DEFAUT)
    if REGLAGES[nom] is None:
        _FORCE[0] = None
        for k, f in _A.items():
            setattr(P, k, f)
        return nom
    _FORCE[0] = nom
    for k, f in (("chase", chase), ("rig", rig), ("cam_cap", cam_cap), ("camera", camera), ("visee", visee),
                 ("tremble", tremble), ("visee_u", visee_u)):
        setattr(P, k, _aiguille(k, f))
    return nom


def obturateur(nom=None):
    """L'obturateur que render_film pose avec ce réglage (None : celui de la scène)."""
    R = REGLAGES[nom_regle(nom)]
    return R["OBTURATEUR"] if R else None
