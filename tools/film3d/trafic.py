# La circulation dans la voie de la poursuite, et le slalom de la berline au travers (SPEC §18.62).
#
# Jacques, le 18 novembre, sur le brouillon éclairé v9 : « les rues sont vides c'est pas naturel. J'aimerais d'autres
# voitures et un slalom… un référentiel (d'autres voitures donneraient une bonne impression de vitesse) et un peu des
# mouvements même dans la ligne droite pour esquiver ». Les garées et les passants des bords (vie.py, §18.58) ne
# suffisent pas : il faut des voitures qui roulent devant la berline, dans son sens, plus lentement qu'elle, qu'elle
# rattrape et double. Leur mouvement relatif est le repère de la vitesse.
#
# Ce module ne pose rien dans Blender : il décrit des véhicules au format de vie.vehicules() (nom, modèle, teinte,
# course, options), que vie.py pose avec les autres (mêmes maillages partagés, mêmes optiques émissives : phares, feux,
# stop quand la vitesse baisse, warnings, appels de phares). Coordonnées de ville (repère du pont), temps du film
# (image g, 0 = OUV/1). Les voies se comptent depuis la route de la berline (parcours.ROUTE, sans son slalom) : n en m,
# positif à gauche ; le slalom de la berline elle-même est dans parcours.SLALOM.
#
# Et il vérifie, sans Blender, qu'aucun véhicule n'en touche un autre (verifier : boîtes orientées avec marges, à
# chaque image du film, berline, patrouilles, circulation et garées) et que la circulation passe à distance de
# l'objectif (camera).
#
#   python3 tools/film3d/trafic.py           # l'inventaire, les doublés, les écarts au plus juste
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import parcours as P  # noqa: E402

FPS = P.FPS
_TO_CITY = P.placer("P4")[0]              # le repère du parcours vers la ville (celui de P4 est la ville)


def _v(kmh):
    return kmh / 3.6


def point(s, n=0.0):
    """Le point de la ville à l'abscisse s de la route de la berline (sans slalom) et n m à sa gauche."""
    x, y, h, _k = P.ROUTE.at(s)
    c = math.radians(h)
    return _TO_CITY(x - n * math.cos(c), y - n * math.sin(c))


def ligne(s0, s1, n=0.0, pas=1.0):
    """La voie à n m de la route, de l'abscisse s0 à s1 (une trajectoire de vie.Course)."""
    k = max(1, int(abs(s1 - s0) / pas))
    return [point(s0 + (s1 - s0) * i / k, n) for i in range(k + 1)]


def s_hero(g):
    """L'abscisse de la berline à l'image g du film."""
    return P.s_of_t(g / FPS)


def bascule_g(g0, g1, amp):
    """Un écart latéral (m) qui passe de 0 à amp de l'image g0 à g1 (la marche du slalom, parcours.bascule)."""
    def f(g):
        return amp * P.bascule((g - g0) / max(1e-6, g1 - g0))
    return f


def somme(*fs):
    return lambda g: sum(f(g) for f in fs)


def vehicules():
    """[(nom, modèle, teinte, course, options)] : la circulation de la poursuite (vie.vehicules l'ajoute à la
    sienne)."""
    import vie as V
    Course = V.Course
    out = []

    def add(nom, modele, teinte, course, **kw):
        kw.setdefault("phares", True)
        out.append(("trafic_" + nom, modele, teinte, course, kw))

    # ------------------------------------------------------------ l'avenue (OUV, P1) : s 0 à 105
    # La berline sur E1 (n 0), la patrouille 1 à sa gauche sur la voie d'en face (n +3,5). A roule à 35 km/h sur E1,
    # 36 m devant : la berline déboîte sur E2 (SLALOM : 2,7 m), la double par la droite pendant
    # qu'A, aux sirènes, serre vers la ligne du milieu (+0,6 m en 1,25 s), freine et s'arrête, warnings ; la berline
    # revient sur E1 avant le freinage du rond-point. vie.py ne gare plus rien sur E2 le long de la course (le bus est derrière
    # l'ouverture). B roule au pas sur E2 loin devant, freine et s'arrête à l'entrée de l'anneau (le « cédez le
    # passage »), feux stop allumés : la voiture arrêtée à l'entrée du rond-point pendant le premier dérapage.
    av_e1 = ligne(-40.0, 140.0, 0.0)
    av_e2 = ligne(-40.0, 140.0, -3.5)
    add("av_a", "riverside", "creme", Course(av_e1, AV_A_V, s0=40.0 + AV_A, g0=0, ecart=bascule_g(*AV_A_SERRE, 0.6)),
        warning=AV_A_WARN)
    add("av_b", "fairheaven", "ciel", Course(av_e2, AV_B_V, s0=40.0 + AV_B, g0=0))

    # ------------------------------------------------------------ la rue des enseignes (P3) : s 164 à 226
    # B1, garée contre le trottoir de droite après le barrage, déboîte avant l'entrée de la poursuite dans la rue
    # (3,5 m/s² : elle roule déjà quand la caméra y entre), la remonte devant elle, traverse le boulevard et prend
    # la voie de droite du pont (la suite au pont). S, garée sur le boulevard à l'ouest de la rue, déboîte et tourne
    # dans la rue en face de la poursuite, voit les gyrophares, se range contre le trottoir de gauche et s'arrête,
    # warnings. D, garée à gauche derrière elle, déboîte le nez dans la voie de la berline (2,4 m de course : sans
    # écart, la berline la frôlerait à 0,2 m) : elle s'en écarte à droite (SLALOM : 1,2 m, 1,2 m d'air) puis, la
    # poursuite passée, D recule dans sa place. La meute de P4 passe ensuite en deux files (p4_pont.RUE_X) : rien
    # ne reste dans la chaussée.
    nord = V.courbe([(3.25, -367.0), (3.2, -364.0), (2.6, -360.0), (2.15, -355.0), (2.1, -350.0), (2.1, -345.0),
                     (2.2, -340.0), (2.9, -330.0), (4.0, -318.0), (4.9, -306.0), (5.2, -298.0), (5.25, -292.0),
                     (5.25, -150.0)], pas=0.5, n_lisse=6)
    add("pont_b1", "riverside", "argent",
        Course(nord, B1_V, s0=0.0, g0=0, ecart=bascule_g(*B1_RANGE, -0.35)),
        warning=B1_WARN)
    sud = V.courbe([(-20.0, -340.4), (-8.0, -340.4), (-5.2, -340.7), (-3.0, -342.3), (-2.6, -344.5),
                    (-3.3, -348.0), (-3.3, -352.0), (-3.3, -360.0)], pas=0.5, n_lisse=6)
    add("rue_sud", "chapman", "bordeaux", Course(sud, RUE_S_V, s0=_s_at(sud, RUE_S_Y), g0=RUE_S_V[-1][0]),
        warning=RUE_S_V[-1][0] - 6)
    sort = V.courbe([(-3.25, -353.8), (-3.25, -355.8), (-3.2, -357.0), (-2.75, -358.4), (-2.1, -359.6),
                     (-1.5, -360.8), (-1.2, -361.8), (-1.1, -363.0)], pas=0.2, n_lisse=4)
    add("rue_sort", "negotiator", "sable", Course(sort, RUE_D_V, s0=2.0, g0=0), warning=RUE_D_WARN)

    # ------------------------------------------------------------ le pont (P4) : s 242 à 358
    # B1 (la voiture de la rue) entre sur le pont par la voie de droite (sa trajectoire y mène, sans changement de
    # voie sec), à 70 km/h ; aux sirènes elle serre la glissière (0,35 m), freine (4,5 m/s²) et s'arrête derrière B2,
    # warnings. B2 et B3, venues de l'est sur le boulevard, tournent à droite sur le pont, voie de droite, à 40 et
    # 35 km/h, et s'arrêtent derrière le camion rangé (vie.py). La berline (SLALOM) entre sur le pont par la voie de
    # droite elle aussi, derrière B1 : elle la rattrape, déboîte à gauche et la double (1,3 m d'air), puis B2 et B3,
    # avant le freinage du port. La patrouille 1 la remonte par la gauche (p4_pont.P1_VOIE). La meute ne double
    # qu'à gauche d'elles.
    for nom, mod, tnt, x, y_ref, g_ref, keys, ec, wn in PONT:
        pts = V.courbe([(300.0, -331.5), (x + 7.5, -331.5), (x + 2.2, -329.4), (x + 0.2, -325.5), (x, -321.0),
                        (x, -150.0)], pas=0.5, n_lisse=6)
        add(nom, mod, tnt, Course(pts, keys, s0=_s_at(pts, y_ref), g0=g_ref, ecart=bascule_g(*ec) if ec else None),
            warning=wn)

    # ------------------------------------------------------------ la jetée (P6) : s 390 à 476
    # J1 roule à 20 km/h dans la voie de la berline, sortie du terre-plein avant le virage : aux sirènes elle serre
    # sa bordure (0,6 m à droite), freine et s'arrête, warnings ; la berline la double par la voie d'en face (SLALOM :
    # 2,8 m ; à droite la chaussée ne laisse que 1 m, la berline y montait sur le trottoir). J3 descend la jetée en
    # face, croise la berline à l'entrée de la jetée, avant son écart, et s'arrête contre sa bordure, warnings (à
    # 4,0 m de la route, 0,85 m de sa bordure : la berline simulée sort du dérapage du port 0,8 m plus large que
    # la dessinée, elle la passe à 1,0 m, 0,6 m quand J3 roulait à 3,6 m). Au
    # bout, J2 revient en face dans la voie que la berline a prise : appels de phares, elle freine et se range ; la
    # berline se rabat devant J1 et la croise à 3 m de l'objectif. La meute de P6 suit le chemin de la berline
    # (p6_jetee.column_pos) : elle les passe comme elle.
    j1 = [point(388.0, -7.5), point(392.0, -5.5)] + ligne(396.0, 480.0, 0.0)
    add("jetee_j1", "sialia", "menthe",
        Course(V.courbe(j1, pas=0.5, n_lisse=6), J1_V, s0=0.0, g0=0, ecart=bascule_g(*J1_SERRE, -0.6)),
        warning=J1_WARN)
    j3 = ligne(496.0, J3_S, 4.0)
    add("jetee_j3", "taxi", None, Course(j3, J3_V, s0=496.0 - J3_S, g0=J3_V[-1][0]), warning=J3_V[-1][0])
    j2 = ligne(496.0, J2_S, 3.4)
    add("jetee_j2", "fairheaven", "rose", Course(j2, J2_V, s0=496.0 - J2_S, g0=J2_V[-1][0]), warning=J2_V[-1][0],
        appels=J2_APPELS)
    return out


def _s_at(pts, y):
    """L'abscisse sur la polyligne pts du premier point d'ordonnée y (le long d'un segment montant ou descendant)."""
    cum = 0.0
    for a, b in zip(pts, pts[1:]):
        d = math.dist(a, b)
        if (a[1] - y) * (b[1] - y) <= 0.0 and a[1] != b[1]:
            return cum + d * (y - a[1]) / (b[1] - a[1])
        cum += d
    raise ValueError(f"y {y} hors de la trajectoire")


# ---- les réglages (images du film g, m/s ; places en m)
# l'avenue : A et B, leur avance sur la berline à l'image 0 (m) et leurs vitesses
AV_A, AV_A_V = 36.0, [(0, _v(35)), (40, _v(35)), (56, 6.0), (120, 4.0), (150, 0.0)]
AV_A_SERRE, AV_A_WARN = (4, 34), 60
AV_B, AV_B_V = 106.0, [(0, 4.0), (40, 4.0), (90, 0.0)]
# la rue et le pont : B1 (vitesses depuis sa place, serre la glissière de, à, warnings dès) ; S (y où elle s'arrête,
# vitesses jusqu'à l'arrêt) ; D (vitesses : déboîte, s'arrête, recule ; warnings). Départs et arrêts à 3,5 à 5 m/s²
# (18 novembre, l'audit : 10 à 17 m/s² avant, et un changement de voie de B1 à 22 m/s² de latérale)
B1_V = [(0, 0.0), (173, 0.0), (306, 19.4), (356, 19.4), (459, 0.0)]
B1_RANGE, B1_WARN = (346, 376), 400
RUE_S_Y, RUE_S_V = -349.5, [(0, 0.0), (224, 0.0), (254, 5.0), (268, 5.0), (290, 0.0)]
RUE_D_V = [(0, 0.0), (228, 0.0), (246, 3.0), (247, 3.0), (265, 0.0), (292, 0.0), (307, -2.5), (315, -2.5),
           (330, 0.0)]
RUE_D_WARN = 280
# le pont : (nom, modèle, teinte, x de sa voie, y à l'image g, g, vitesses, (serre de, à, m) ou None, warnings dès)
PONT = [
    ("pont_b2", "chapman", "sarcelle", 5.25, -255.4, 318,
     [(0, 9.0), (150, 9.0), (165, 6.0), (185, 6.0), (215, _v(40)), (370, _v(40)), (420, 0.0)], (372, 396, -0.35), 418),
    ("pont_b3", "break84", "blanc", 5.25, -237.0, 318,
     [(0, 6.0), (110, 6.0), (150, _v(35)), (350, _v(35)), (400, 0.0)], None, 396),
]
# la jetée : J1 (vitesses depuis le terre-plein, serre, warnings) ; J2 (abscisse de route où elle s'arrête, vitesses,
# appel de phares)
J1_V = [(0, 0.0), (340, 0.0), (370, _v(20)), (524, _v(20)), (566, 0.0)]
J1_SERRE, J1_WARN = (500, 540), 560
J3_S, J3_V = 400.0, [(0, 0.0), (280, 0.0), (330, _v(30)), (470, _v(30)), (516, 0.0)]
J2_S, J2_V, J2_APPELS = 462.0, [(0, 0.0), (410, 0.0), (470, _v(30)), (552, _v(30)), (596, 0.0)], (556, 572)


# ---------------------------------------------------------------- les véhicules de la poursuite, en ville

DIMS = {"hero": (0.90, 2.45), "patrol": (0.975, 2.5), "van": (1.0, 2.7)}


def _poursuite():
    """{(plan, nom): (g0, g1, pos(g) -> (x, y), cap(g) -> degrés)} : la berline et les patrouilles de chaque tronçon,
    en ville, sur sa fenêtre (vie.poursuite) ; le cap tiré de la course (immobile : tracks_heading du module)."""
    import importlib

    import render_film as RF
    import vie as V
    out = {}
    for shot, g0, g1, tr in V.poursuite():
        mod = importlib.import_module(RF.TRAJ[shot])
        heads = getattr(mod, "tracks_heading", lambda: {})()
        rot = P.vers_ville(shot)[1]
        for nom, fn in tr.items():
            if nom == "hero" or (shot == "P3" and nom in ("patrol_a", "patrol_b")):
                continue                # (le barrage : ses enveloppes relevées, GAREES_SCENES)
            hd = heads.get(nom)

            def cap(g, fn=fn, hd=hd, g0=g0):
                a, b = fn(g - 3), fn(g + 3)
                if math.dist(a, b) > 0.15:
                    return math.degrees(math.atan2(-(b[0] - a[0]), b[1] - a[1]))
                if hd is not None:
                    return hd((g - g0) / FPS) + rot
                return None
            out[(shot, nom)] = (g0, g1, fn, cap)
    return out


def _hero(g):
    """(x, y, cap) de la berline à l'image g du film, en ville."""
    import ville as VL
    x, y, head = VL.hero_city(g + 1)[:3]
    return x, y, head


def _coins(x, y, cap, w, l):
    c = math.radians(cap)
    fx, fy = -math.sin(c), math.cos(c)
    lx, ly = -fy, fx
    return [(x + a * l * fx + b * w * lx, y + a * l * fy + b * w * ly) for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


def separation(A, B):
    """Le plus grand écart (m) entre les projections de deux polygones convexes sur les normales de leurs côtés :
    positif, ils sont disjoints d'au moins autant ; négatif, ils se chevauchent."""
    best = -1e9
    for poly in (A, B):
        for i in range(len(poly)):
            (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
            ax, ay = y2 - y1, -(x2 - x1)
            n = math.hypot(ax, ay)
            if n < 1e-9:
                continue
            ax, ay = ax / n, ay / n
            pa = [px * ax + py * ay for px, py in A]
            pb = [px * ax + py * ay for px, py in B]
            best = max(best, max(min(pb) - max(pa), min(pa) - max(pb)))
    return best


GLISSE_FRANCHE = 10.0                   # ° : au-delà, la berline dérape (verifier : marge de flanc tout autour)
MARGE_COTE, MARGE_LONG = 0.6, 3.0       # m : de flanc à flanc en passant, de pare-chocs à pare-chocs à la file
VU = 160.0                              # m : au-delà de la berline, rien ne compte (vie.VU)


def boites(g, poursuite=None, vie_veh=None):
    """[(nom, genre, x, y, cap, demi-largeur, demi-longueur, roule)] : tous les véhicules à l'image g (la berline, les
    patrouilles du tronçon en cours, la vie et sa circulation, les garées des scènes)."""
    import vie as V
    out = []
    x, y, cap = _hero(g)
    out.append(("hero", "hero", x, y, cap, *DIMS["hero"], True, None))
    for (shot, nom), (g0, g1, fn, capf) in (poursuite or {}).items():
        if not g0 <= g <= g1:
            continue
        px, py = fn(g)
        c = capf(g)
        genre = "van" if nom.startswith("van") else "patrol"
        out.append((f"{shot}:{nom}", genre, px, py, c, *DIMS[genre],
                    c is not None and math.dist(fn(g - 1), fn(g + 1)) > 0.02, None))
    for nom, modele, _t, course, _kw in (vie_veh if vie_veh is not None else V.vehicules()):
        px, py, c = course.pose(g)
        w, l = V.DEMI.get(modele, V.DEMI_DEFAUT)
        out.append((nom, "vie", px, py, c, w, l, course.vit(g) > 0.3 or course.vit(g + 1) > 0.3, None))
    for nom, (px, py, c, w, l, poly, fen) in GAREES_SCENES.items():
        if fen is None or fen[0] <= g <= fen[1]:
            out.append((nom, "garee", px, py, c, w, l, False, poly))
    return out


def _hull(pts):
    """L'enveloppe convexe (sens trigonométrique) d'un nuage de points."""
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def _garees_scenes():
    """Les voitures garées posées par les scènes elles-mêmes (pas par vie.py) le long de la route : la rue (scene_b,
    p3_enseignes.OBSTACLES « garee_* »), l'avenue (scene_a.parked_cars, côté mer, x_A 5,85)."""
    import p3_enseignes as P3
    out = {}
    for k, poly in P3.OBSTACLES.items():
        if not k.startswith("garee_") or P3.PARKED_Y[int(k[6:])] < 134.0 - 43.0:
            continue                    # (scene_b n'en pose en ville que là où la rue existe : y de vue ≤ 43)
        pts = [P.vers_ville("P3")[0](*p) for p in poly]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        out["rue_" + k] = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 0.0, (max(xs) - min(xs)) / 2,
                           (max(ys) - min(ys)) / 2, None, None)
    # les deux patrouilles du barrage (scene_b, le temps de P3) : leurs enveloppes relevées, pas une boîte
    g0, g1 = P.START["P3"], P.START["P4"] - 1
    for k in ("patrol_a", "patrol_b"):
        pts = [P.vers_ville("P3")[0](*p) for p in P3.OBSTACLES[k]]
        cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        out["barrage_" + k] = (cx, cy, 0.0, 2.5, 2.5, _hull(pts), (g0, g1))
    to = P.vers_ville("OUV")[0]
    for k, ys in enumerate((33.0, 104.0, 131.0, 210.0)):
        x, y = to(5.85, ys)
        out[f"avenue_scene_{k}"] = (x, y, -90.0, 0.95, 2.45, None, None)
    return out


GAREES_SCENES = _garees_scenes()


def _contacts_voulus():
    """{(patrouille, image du film)} : les contacts déclarés (contacts.py, SPEC §18.68), la patrouille du contact
    (sa clé dans boites : « plan:nom ») sur les images de sa manœuvre, où elle serre et touche la berline exprès."""
    import contacts as CT
    out = set()
    for plan in {c["plan"] for c in CT.CHOCS}:
        for nom in CT.paire(plan) - {"hero"}:
            out.update((f"{plan}:{nom}", P.START[plan] + f - 1) for f in CT.images_manoeuvre(plan))
    return out


def verifier(g0=0, g1=None, pas=1, poursuite=None):
    """Les contacts sur le film : [(écart, image, a, b, exigé)] au plus juste par paire, triés. Une paire dont l'un
    au moins est de la vie qui roule doit tenir MARGE_COTE de flanc et MARGE_LONG à la file (boîtes grandies de la
    moitié de chaque marge) ; berline et patrouilles entre elles, et tout le reste : aucun chevauchement. Seule
    exception, les contacts déclarés (contacts.py, SPEC §18.68) : la berline et la patrouille du contact, sur les
    images de sa manœuvre (toutes les autres paires, et celle-ci hors de sa manœuvre, gardent leurs marges)."""
    import vie as V
    g1 = V.G_FIN if g1 is None else g1
    pours = _poursuite() if poursuite is None else poursuite
    veh = V.vehicules()
    voulus = _contacts_voulus()
    pires = {}
    for g in range(g0, g1 + 1, pas):
        bs = boites(g, pours, veh)
        hx, hy = bs[0][2], bs[0][3]
        bs = [b for b in bs if math.hypot(b[2] - hx, b[3] - hy) < VU]
        glisse = abs(P.DRIVE.slip(g / P.FPS)) > GLISSE_FRANCHE
        for i, a in enumerate(bs):
            for b in bs[i + 1:]:
                if not (a[7] or b[7]):
                    continue
                if math.hypot(a[2] - b[2], a[3] - b[3]) > a[6] + b[6] + 4.0:
                    continue
                if a[4] is None or b[4] is None:
                    continue
                if (a[0] == "hero" and (b[0], g) in voulus) or (b[0] == "hero" and (a[0], g) in voulus):
                    continue
                # les marges : entre la poursuite et la vie (circulation, garées de vie.py) ; entre deux voitures de
                # la vie, ou avec les garées des scènes : aucun chevauchement
                poursuite_ = a[1] in ("hero", "patrol", "van") or b[1] in ("hero", "patrol", "van")
                vie_ = (a[1] == "vie", b[1] == "vie")
                marge = poursuite_ and any(vie_)
                mw, ml = (MARGE_COTE / 2, MARGE_LONG / 2) if marge else (0.0, 0.0)
                # (la berline en dérapage, fusion v10 : sa caisse est en travers de sa route, elle n'est « à la file »
                # de rien ; la paire garde la marge de flanc tout autour, 0,6 m entre les caisses. Au port elle passe
                # l'angle arrière du camion rangé du pont à 0,69 m, glisse de 22°.)
                if marge and glisse and "hero" in (a[1], b[1]):
                    ml = mw
                A = a[8] or _coins(a[2], a[3], a[4], a[5] + mw, a[6] + ml)
                B = b[8] or _coins(b[2], b[3], b[4], b[5] + mw, b[6] + ml)
                d = separation(A, B)
                key = (a[0], b[0])
                if key not in pires or d < pires[key][0]:
                    pires[key] = (d, g, a[0], b[0], marge)
    return sorted(pires.values())


# ---------------------------------------------------------------- l'objectif et le cadre

def _plan(g):
    """(tronçon, image du tronçon) de l'image g du film (la poursuite, avant FIN6)."""
    for nom, n in P.SHOTS:
        if P.START[nom] <= g < P.START[nom] + n:
            return nom, g - P.START[nom] + 1
    nom, n = P.SHOTS[-1]
    return nom, g - P.START[nom] + 1


_INV = {}


def _vers_scene(shot):
    """La ville vers la scène du tronçon (l'inverse de parcours.vers_ville) et l'angle à retrancher aux caps."""
    if shot not in _INV:
        fn, rot = P.vers_ville(shot)
        t = fn(0.0, 0.0)
        e1 = (fn(1.0, 0.0)[0] - t[0], fn(1.0, 0.0)[1] - t[1])
        e2 = (fn(0.0, 1.0)[0] - t[0], fn(0.0, 1.0)[1] - t[1])
        det = e1[0] * e2[1] - e1[1] * e2[0]

        def inv(x, y):
            dx, dy = x - t[0], y - t[1]
            return (dx * e2[1] - dy * e2[0]) / det, (e1[0] * dy - e1[1] * dx) / det
        _INV[shot] = (inv, rot)
    return _INV[shot]


def _vie_boites(g, veh):
    import vie as V
    for nom, modele, _t, course, _kw in veh:
        x, y, c = course.pose(g)
        w, l = V.DEMI.get(modele, V.DEMI_DEFAUT)
        yield nom, x, y, c, w, l, course.vit(g) > 0.3 or course.vit(g + 1) > 0.3


def objectif(g0=0, g1=None, toit=1.5):
    """(distance, image, nom) : au plus près, la lentille de la caméra du film et la caisse (boîte au sol jusqu'à
    `toit` m) d'un véhicule de la vie, sur la poursuite."""
    import vie as V
    veh = V.vehicules()
    best = (1e9, None, None)
    for g in range(g0, P.TOTAL if g1 is None else g1):
        shot, f = _plan(g)
        cx, cy, cz = P.chase(shot, f)[:3]
        lx, ly = P.vers_ville(shot)[0](cx, cy)
        hz = cz - P.sol(shot, cx, cy)
        for nom, x, y, c, w, l, _m in _vie_boites(g, veh):
            if math.hypot(x - lx, y - ly) > l + 6.0:
                continue
            a = math.radians(c)
            fx, fy = -math.sin(a), math.cos(a)
            u, v = (lx - x) * fx + (ly - y) * fy, (lx - x) * -fy + (ly - y) * fx
            d = math.hypot(math.hypot(max(abs(u) - l, 0.0), max(abs(v) - w, 0.0)), max(hz - toit, 0.0))
            if d < best[0]:
                best = (d, g, nom)
    return best


_VEH = []


def dans_le_cadre(g, portee=120.0):
    """Le nombre de voitures de la vie qui roulent et dont la caisse est dans le cadre de la caméra du film à
    l'image g (à moins de `portee` m de la berline)."""
    import motion as M
    import vie as V
    if not _VEH:
        _VEH.extend(V.vehicules())
    shot, f = _plan(g)
    cam = P.chase(shot, f)
    inv, rot = _vers_scene(shot)
    hx, hy, _ = _hero(g)
    n = 0
    for nom, x, y, c, w, l, roule in _vie_boites(g, _VEH):
        if not roule or math.hypot(x - hx, y - hy) > portee:
            continue
        sx, sy = inv(x, y)
        b = M.hero_screen(cam, sx, sy, P.sol(shot, sx, sy), c - rot, box=(2 * l, 2 * w, 1.5))
        if b and b["u1"] > 0.0 and b["u0"] < 1.0 and b["v1"] > 0.0 and b["v0"] < 1.0:
            n += 1
    return n


if __name__ == "__main__":
    for nom, m, t, c, kw in vehicules():
        print(nom, m, [tuple(round(v, 1) for v in c.pose(g)) for g in (0, 60, 120)])
    res = verifier()
    for d, g, a, b, m in res[:25]:
        print(f"{'!' if d < 0 else ' '} {d:6.2f} m  image {g:3d}  {a} / {b}{'  (marges)' if m else ''}")
