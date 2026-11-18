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
    # v11 (SPEC §18.74) : la berline sur E1 (n 0). La patrouille 1 la remonte par la voie d'en face, la tape à
    # l'image 30 (contacts.CHOCS) et la jette d'une demi-voie à droite, vers le bus qui déboîte de son arrêt dans
    # la voie E2 (clignotants, 16 km/h) : elle revient à gauche devant lui au dernier moment et longe son flanc
    # jusqu'au gel de l'image 107. B roule au pas sur E2 loin devant, freine et s'arrête à l'entrée de l'anneau (le
    # « cédez le passage »), feux stop allumés : le bus s'arrête derrière elle. (La voiture A du v10, que la berline
    # doublait par la droite 26 m avant de la rejoindre, n'y est plus.)
    av_e1 = ligne(-40.0, 140.0, 0.0)
    av_e2 = ligne(-40.0, 140.0, -3.5)
    add("av_bus", "bus", None,
        Course(av_e2, AV_BUS_V, s0=40.0 + AV_BUS, g0=AV_BUS_G, ecart=bascule_g(*AV_BUS_SORT)), warning=0)
    add("av_b", "fairheaven", "ciel", Course(av_e2, AV_B_V, s0=40.0 + AV_B, g0=0))

    # ------------------------------------------------------------ le rond-point (P2)
    # v11 (SPEC §18.74) : le taxi qui attendait, arrêté, à l'entrée de l'avenue nord (vie.py) y arrive maintenant
    # en roulant, voie O2, et freine au « cédez le passage » pendant que la berline dérape devant lui : une voiture
    # qui roule dans le cadre pendant la glisse, un repère pour sa rotation. La patrouille 2 le longe dans la voie
    # O1. Rien d'autre ne tient entre l'anneau et le barrage : la meute de P4 y roule en deux files (p4_pont.RUE_X),
    # la patrouille 2 s'y arrête en travers, la berline y sort de sa glisse le nez à gauche.
    rc = V.courbe([(120.0, V.AV_O2 + 0.3), (0.0, V.AV_O2 + 0.3)], pas=1.0)
    add("rond_cede", "taxi", None, Course(rc, ROND_C_V, s0=120.0 - ROND_C_X, g0=ROND_C_G))

    # ------------------------------------------------------------ la rue des enseignes (P3) : s 164 à 226
    # B1, garée contre le trottoir de droite après le barrage, déboîte avant l'entrée de la poursuite dans la rue,
    # la remonte devant elle, traverse le boulevard et prend la voie de droite du pont (la suite au pont).
    # v11 : S tourne du boulevard dans la rue, en face de la poursuite, et la descend presque en son milieu
    # (RUE_S_X), appels de phares : sans écart, la berline la prendrait de face. La berline s'écarte à droite dès
    # le trou du barrage et la croise à 0,6 m ; S se jette contre le trottoir de gauche et s'y arrête, warnings,
    # avant la meute de P4, qui passe en deux files (p4_pont.RUE_X). (La voiture D du v10, qui sortait le nez de sa
    # place, n'y est plus : la berline la frôlait à 0,5 m sans s'écarter.)
    nord = V.courbe([(3.25, B1_DEPART), (3.25, -367.0), (3.2, -364.0), (2.6, -360.0), (2.15, -355.0), (2.1, -350.0), (2.1, -345.0),
                     (2.2, -340.0), (2.9, -330.0), (4.0, -318.0), (4.9, -306.0), (5.2, -298.0), (5.25, -292.0),
                     (5.25, -150.0)], pas=0.5, n_lisse=6)
    add("pont_b1", "riverside", "argent",
        Course(nord, _b1_cles(_s_at(nord, B1_Y)), s0=_s_at(nord, B1_Y), g0=B1_G,
               ecart=somme(bascule_g(*B1_SORT), bascule_g(*B1_RENTRE), bascule_g(*B1_RANGE))),
        warning=B1_WARN)
    sud = V.courbe([(-20.0, -340.4), (-9.0, -340.4), (-5.5, -340.9), (-2.9, -342.6), (RUE_S_X - 0.4, -345.2),
                    (RUE_S_X, -348.5), (RUE_S_X, -375.0)], pas=0.5, n_lisse=6)
    add("rue_sud", "chapman", "bordeaux",
        Course(sud, RUE_S_V, s0=_s_at(sud, RUE_S_Y), g0=RUE_S_G, ecart=bascule_g(*RUE_S_RANGE)),
        warning=RUE_S_WARN, appels=RUE_S_APPELS)

    # ------------------------------------------------------------ le pont (P4) : s 242 à 358
    # B1 (la voiture de la rue) entre sur le pont par la voie de droite, à 70 km/h. v11 : la berline tient la voie
    # intérieure et ne change plus de voie pour la doubler ; c'est B1 qui déboîte vers elle (clignotants), la
    # berline s'écarte d'un mètre à gauche, vers la patrouille 1, qui la tape (contacts.CHOCS) et la renvoie dans
    # sa voie pendant que B1 rentre, serre la glissière, freine et s'arrête derrière B2, warnings. B2 et B3, venues
    # de l'est sur le boulevard, tournent à droite sur le pont, voie de droite, à 40 et 35 km/h, et s'arrêtent
    # derrière le camion rangé (vie.py) : la berline les double avant le freinage du port. La meute ne double
    # qu'à gauche d'elles ; sa patrouille 5 suit B1 dans la voie de droite.
    for nom, mod, tnt, x, y_ref, g_ref, keys, ec, wn in PONT:
        pts = V.courbe([(300.0, -331.5), (x + 7.5, -331.5), (x + 2.2, -329.4), (x + 0.2, -325.5), (x, -321.0),
                        (x, -150.0)], pas=0.5, n_lisse=6)
        add(nom, mod, tnt, Course(pts, keys, s0=_s_at(pts, y_ref), g0=g_ref, ecart=bascule_g(*ec) if ec else None),
            warning=wn)

    # ------------------------------------------------------------ le pont, en face (P3 et P4, SPEC §18.69)
    # Le film gris de la fusion : de l'image 318 à la 353 la chaussée du pont est vide devant la berline (B1 est
    # cachée derrière elle, la file d'en face de vie.py ne part qu'à 330 du haut du pont). Quatre voitures de plus,
    # en tête de cette file : elles descendent le pont vers la ville dans la voie d'en face (x −5,25, à 7,5 à 9,5 m
    # de la berline : aucune esquive), contournent la voiture arrêtée de vie.py (y −262) par la voie du milieu, libre
    # tant que la poursuite n'est pas sur le pont, croisent la berline au pied du pont, freinent et tournent à droite
    # sur le boulevard (la rue est à la meute), vers l'ouest. Elles restent à l'ouest de x −4,3 : la patrouille 1 et
    # les deux files de la meute passent à 1,7 m au moins.
    face = _face_pont()
    for nom, mod, tnt, y0, g_t in FACE:
        add(nom, mod, tnt, Course(face, _face_cles(face, y0, g_t), s0=_s_at(face, y0), g0=0))

    # ------------------------------------------------------------ la jetée (P6) : s 390 à 476
    # J1 roule à 20 km/h dans la voie de la berline, sortie du terre-plein avant le virage : elle freine devant
    # elle (feux stop) et s'arrête, warnings ; la berline la double au dernier moment par la voie d'en face (à
    # droite la chaussée ne laisse que 1 m). J3 descend la jetée en face, croise la berline à l'entrée de la jetée,
    # avant son écart, et s'arrête contre sa bordure, warnings. Au bout, J2 revient en face dans la voie que la
    # berline a prise : appels de phares, elle freine et s'arrête nez à nez ; la berline se rabat devant J1 et la
    # croise à 0,8 m. La meute de P6 suit le chemin de la berline (p6_jetee.column_pos) : elle les passe comme elle.
    j1 = V.courbe([point(388.0, -7.5), point(392.0, -5.5)] + ligne(396.0, 480.0, 0.0), pas=0.5, n_lisse=6)
    add("jetee_j1", "sialia", "menthe",
        Course(j1, J1_V, s0=_s_pres(j1, point(J1_S)), g0=J1_G, ecart=bascule_g(*J1_SERRE)), warning=J1_WARN)
    j3 = ligne(496.0, J3_S, 4.2)
    add("jetee_j3", "taxi", None, Course(j3, J3_V, s0=496.0 - J3_S, g0=J3_V[-1][0]), warning=J3_V[-1][0])
    j2 = ligne(496.0, J2_S, J2_N)
    add("jetee_j2", "fairheaven", "rose", Course(j2, J2_V, s0=496.0 - J2_S, g0=J2_V[-1][0]), warning=J2_V[-1][0],
        appels=J2_APPELS)
    return out


def _face_pont():
    """La voie d'en face du pont, du port à la ville, puis le boulevard vers l'ouest : x −5,25, un écart de
    FACE_ECART vers le milieu autour de la voiture arrêtée de vie.py (−6,05, −262), puis le virage à droite au pied
    du pont : un arc de FACE_RAYON qui se pose dans la voie ouest du boulevard, à 0,25 m de son axe côté chaussée
    (1,1 m des garées du trottoir nord)."""
    import vie as V
    y_bd = V.BD_O - 0.25
    pts = []
    y = -150.0
    while y > FACE_Y_VIRAGE(y_bd) + 1e-9:
        e = FACE_ECART * (P.bascule((FACE_SORT[0] - y) / (FACE_SORT[0] - FACE_SORT[1]))
                          - P.bascule((FACE_RENTRE[0] - y) / (FACE_RENTRE[0] - FACE_RENTRE[1])))
        pts.append((-5.25 + e, y))
        y -= 0.5
    cx, cy = -5.25 - FACE_RAYON, y_bd + FACE_RAYON
    pts += [(cx + FACE_RAYON * math.cos(math.radians(a)), cy - FACE_RAYON * math.sin(math.radians(a)))
            for a in range(0, 91, 3)]
    pts.append((-300.0, y_bd))
    return V.courbe(pts, pas=0.5, n_lisse=2)


def FACE_Y_VIRAGE(y_bd=None):
    """L'ordonnée où la file d'en face entre dans son virage."""
    import vie as V
    return (V.BD_O - 0.25 if y_bd is None else y_bd) + FACE_RAYON


def _face_cles(pts, y0, g_t):
    """Les clés de vitesse d'une voiture de la file d'en face : arrêtée en y0 (la file du port), elle part, roule à
    FACE_V, freine et entre dans le virage du boulevard à l'image g_t à FACE_V_VIRAGE, le tient, puis repart."""
    v, vt = FACE_V, FACE_V_VIRAGE
    d = _s_at(pts, FACE_Y_VIRAGE()) - _s_at(pts, y0)
    t_acc, t_dec = v / FACE_ACC, (v - vt) / FACE_DEC
    d_acc, d_dec = v * t_acc / 2.0, (v + vt) * t_dec / 2.0
    t_cr = (d - d_acc - d_dec) / v
    g_dec = g_t - t_dec * FPS
    g_cr = g_dec - t_cr * FPS
    g_dep = g_cr - t_acc * FPS
    if t_cr < 0.0 or g_dep < 0.0:
        raise ValueError(f"file d'en face : pas le temps d'arriver au virage à l'image {g_t} depuis y {y0}")
    g_fin = g_t + (math.pi / 2.0 * FACE_RAYON + 1.0) / vt * FPS
    return [(0, 0.0), (g_dep, 0.0), (g_cr, v), (g_dec, v), (g_t, vt), (g_fin, vt), (g_fin + 40, _v(36))]


def _s_pres(pts, p):
    """L'abscisse sur la polyligne pts de son sommet le plus proche du point p."""
    cum, best = 0.0, (1e18, 0.0)
    for a, b in zip(pts, pts[1:]):
        best = min(best, (math.dist(a, p), cum))
        cum += math.dist(a, b)
    return min(best, (math.dist(pts[-1], p), cum))[1]


def image_de(s):
    """L'image du film où la berline passe l'abscisse s de sa route."""
    return P.t_of_s(s) * FPS


def _b1_cles(s_c):
    """Les vitesses de B1, qui est à l'abscisse s_c de sa course à l'image B1_G : elle part de sa place (l'abscisse
    0) à l'image qu'il faut pour y être, monte à B1_VC en B1_LANCE images, la tient, freine après la berline."""
    d_lance = B1_VC / 2.0 * B1_LANCE / FPS
    g_dep = B1_G - B1_LANCE - (s_c - d_lance) / B1_VC * FPS
    return [(0, 0.0), (g_dep, 0.0), (g_dep + B1_LANCE, B1_VC), (B1_G + B1_FREINE[0], B1_VC), (B1_G + B1_FREINE[1], 0.0)]


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
# v11 (SPEC §18.74) : chaque obstacle d'une esquive se place depuis la berline. *_G : l'image du film où le nez de
# la berline serait sur lui si elle gardait sa ligne, comptée depuis le départ de son écart (parcours.SLALOM_SIMULE)
# plus le temps avant contact voulu (0,8 à 1,3 s) ; sa place à cette image s'en déduit. Un horaire qui change
# (l'adhérence, les virages) déplace donc les obstacles avec la berline.
HERO_L = 2.45                                            # la demi-longueur de la berline (DIMS)
_ESQ = P.SLALOM_SIMULE
# l'avenue : le bus (demi-longueur 6 m) déboîte de son arrêt dans la voie E2, de AV_BUS_SORT[2] m vers E1 ; la
# berline, jetée à droite par la patrouille, revient devant lui
AV_BUS_G = image_de(_ESQ[P.ESQ_AVENUE[1]][0]) + 1.0 * FPS
AV_BUS = s_hero(AV_BUS_G) + HERO_L + 6.0
AV_BUS_V = [(0, 1.5), (AV_BUS_G - 20, 4.5), (AV_BUS_G - 6, 4.5), (AV_BUS_G + 30, 0.0)]
AV_BUS_SORT = (AV_BUS_G - 74, AV_BUS_G - 2, 0.33)
AV_B, AV_B_V = 106.0, [(0, 4.0), (40, 4.0), (90, 0.0)]
# le rond-point (v11) : le taxi qui cède, où (x) et quand il s'arrête à l'entrée de l'avenue nord, ses vitesses
# (25 km/h, freinage de 2,5 m/s²)
ROND_C_X, ROND_C_G = 18.5, 172.0
ROND_C_V = [(0, 7.0), (ROND_C_G - 67, 7.0), (ROND_C_G, 0.0)]
# la rue et le pont : B1 (vitesses depuis sa place, serre la glissière de, à, warnings dès) ; S (y où elle s'arrête,
# vitesses jusqu'à l'arrêt) ; D (vitesses : déboîte, s'arrête, recule ; warnings). Départs et arrêts à 3,5 à 5 m/s²
# (18 novembre, l'audit : 10 à 17 m/s² avant, et un changement de voie de B1 à 22 m/s² de latérale)
# B1 (v11) : à 70 km/h dans la voie de droite du pont ; elle déboîte de B1_SORT[2] m vers la berline (sa voie
# est à 3,45 m : il reste 0,75 m quand la berline s'est écartée d'un mètre), rentre (B1_RENTRE) pendant que la
# patrouille 1 tape la berline, serre la glissière (B1_RANGE) et s'arrête derrière B2. B1_FREINE : (début, fin) de
# son freinage en images après B1_G : la patrouille 5 de la meute la suit dans sa voie, à 8 m au moins à la fin
# du tronçon (elle freinait à B1_G + 9 : rattrapée à l'image 410)
B1_G = image_de(_ESQ[P.ESQ_PONT[0]][0]) + 1.0 * FPS
B1_Y = point(s_hero(B1_G) + HERO_L + 2.5)[1]
B1_VC, B1_LANCE, B1_FREINE = _v(70), 133, (29.0, 121.5)
# (v11 : sa place, 2 m derrière la voiture du barrage au lieu de 8,7 : elle roule devant la berline 6,5 m plus près
# et se lit à l'image une seconde plus tôt, dès la sortie du rond-point)
B1_DEPART = -373.5
B1_SORT, B1_RENTRE, B1_RANGE = (B1_G - 47, B1_G - 9, 1.7), (B1_G - 4, B1_G + 32, -1.7), (B1_G + 39, B1_G + 70, -0.35)
B1_WARN = int(B1_G - 47)
# S (v11) : l'axe où elle descend la rue (x), sa place (y) à l'image RUE_S_G (son nez au nez de la berline si
# celle-ci gardait sa ligne), ses vitesses, (de, à, m) sa rentrée contre le trottoir (négatif : à sa droite),
# ses warnings, ses appels de phares
RUE_S_X = -1.22
RUE_S_G = image_de(_ESQ[P.ESQ_RUE[0]][0]) + 1.0 * FPS
RUE_S_Y = point(s_hero(RUE_S_G) + HERO_L + 2.5)[1]
RUE_S_V = [(0, 0.0), (RUE_S_G - 100, 0.0), (RUE_S_G - 70, 4.5), (RUE_S_G + 14, 4.5), (RUE_S_G + 58, 0.0)]
RUE_S_RANGE = (RUE_S_G - 16, RUE_S_G + 46, -2.3)
RUE_S_WARN, RUE_S_APPELS = int(RUE_S_G + 14), (int(RUE_S_G - 60), int(RUE_S_G - 20))
# le pont : (nom, modèle, teinte, x de sa voie, y à l'image g, g, vitesses, (serre de, à, m) ou None, warnings dès)
PONT = [
    ("pont_b2", "chapman", "sarcelle", 5.25, -255.4, 318,
     [(0, 9.0), (150, 9.0), (165, 6.0), (185, 6.0), (215, _v(40)), (370, _v(40)), (420, 0.0)], (372, 396, -0.35), 418),
    ("pont_b3", "break84", "blanc", 5.25, -237.0, 318,
     [(0, 6.0), (110, 6.0), (150, _v(35)), (350, _v(35)), (400, 0.0)], None, 396),
]
# le pont, en face : (nom, modèle, teinte, y de sa place dans la file du port, image où elle entre dans le virage du
# boulevard). Croisière, départ et freinage (m/s²), vitesse dans le virage et son rayon (4,5 m/s sur 5 m : 4,1 m/s²
# de latérale, le coin du trottoir à 0,8 m du flanc) ; l'écart autour de la voiture arrêtée : m vers le milieu
# (1,0 m entre les caisses), (y où il commence, y où il est plein), (y où il se rend, y où il est nul) : 30 m
# chacun, 3,5 m/s² de latérale à 55 km/h
FACE = [
    ("pont_f1", "sialia", "creme", -223.5, 302),
    ("pont_f2", "pickup", "sable", -216.0, 342),
    ("pont_f3", "fairheaven", "marine", -208.5, 383),
    ("pont_f4", "riverside", "blanc", -201.0, 426),
]
FACE_V, FACE_ACC, FACE_DEC, FACE_V_VIRAGE, FACE_RAYON = _v(55), 3.0, 4.5, 4.5, 5.0
FACE_ECART, FACE_SORT, FACE_RENTRE = 2.15, (-226.0, -256.0), (-268.0, -298.0)
# la jetée : J1 (vitesses depuis le terre-plein, serre, warnings) ; J2 (abscisse de route où elle s'arrête, vitesses,
# appel de phares)
# (v11) J1 freine devant la berline 1,5 s avant le contact (feux stop), s'arrête une demi-seconde après ; J2 est
# arrêtée à J2_G, nez à nez, dans la voie que la berline a prise (J2_N m à gauche de la route)
J1_G = image_de(_ESQ[P.ESQ_JETEE[0]][0]) + 1.3 * FPS
J1_S = s_hero(J1_G) + HERO_L + 2.5
J1_V = [(0, 0.0), (J1_G - 170, 0.0), (J1_G - 140, _v(20)), (J1_G - 36, _v(20)), (J1_G + 12, 0.0)]
J1_SERRE, J1_WARN = (J1_G - 36, J1_G, -0.7), int(J1_G)
J3_S, J3_V = 400.0, [(0, 0.0), (280, 0.0), (330, _v(30)), (470, _v(30)), (516, 0.0)]
J2_G = image_de(_ESQ[P.ESQ_JETEE[1]][0]) + 1.15 * FPS
J2_S, J2_N = s_hero(J2_G) + HERO_L + 2.5, 2.66
J2_V = [(0, 0.0), (J2_G - 186, 0.0), (J2_G - 126, _v(30)), (J2_G - 44, _v(30)), (J2_G, 0.0)]
J2_APPELS = (int(J2_G - 64), int(J2_G - 24))


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
                # (v11 : deux voitures qui se croisent ne sont pas à la file non plus : S, dans la rue, arrive en
                # face de la berline et la croise à 0,6 m de flanc ; la marge de flanc tout autour)
                if marge and abs((a[4] - b[4] + 180.0) % 360.0 - 180.0) > 120.0:
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
