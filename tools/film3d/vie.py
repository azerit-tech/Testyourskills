# La vie de la ville (SPEC §18.56) : ce qui roule, marche et bouge autour de la poursuite, sur tout le trajet.
#
# Jacques, le 17 novembre, sur le brouillon éclairé v7 : « il manque des éléments sur la route et des animations
# autour, la ville est super vide ». Hors de la berline, des patrouilles et de l'hélicoptère, rien ne bougeait.
#
# Une couche posée par-dessus les lieux, en coordonnées de ville (le repère du pont) et en temps du film (g, l'image
# du film, 0 = OUV/1, jusqu'à 719 = FIN6/101) : la même dans chaque tronçon. render_film la pose après ville.voisins,
# diag/vue_route.py et la prise de ville.py aussi. La continuité aux jonctions vient de là : une voiture, un passant,
# un palmier qui balance sont le même objet, au même endroit, dans le même état des deux côtés (pas de jumeaux à
# raccorder, pas de clés à décaler). Les lieux en cache n'ont pas à être reconstruits pour elle.
#
# Ce qu'elle pose (modèles de bibliothèque, CREDITS.md ; rien n'est modélisé ici, seul le mouvement est en code) :
#   - la circulation : des voitures d'en face qui serrent leur bordure en croisant la patrouille, d'autres qui se
#     rangent et s'arrêtent, warnings allumés ; aux entrées du rond-point et au bout de la rue, des voitures qui
#     attendent ; sur le pont, des voitures rangées des deux côtés ; tenues à distance de la berline et des patrouilles
#     (test_motion : vie.ecarts, M.min_gap) ;
#   - des voitures garées le long des bordures, un bus à l'arrêt, des camions et un chariot qui roule au port ;
#   - des passants : qui marchent sur les trottoirs et la promenade, attendent le bus, regardent le barrage, pêchent
#     sur la jetée, et des clients aux terrasses ; certains reculent et tournent la tête au passage de la poursuite ;
#   - la vie lente des lieux : palmiers qui balancent, bateaux de la marina qui tanguent, mouettes.
# Lumières : seulement des optiques émissives (phares, feux, warnings), aucune lampe ajoutée, aucune tache au sol.
#
#   python3 tools/film3d/vie.py              # l'inventaire par lieu et les distances à la poursuite, sans Blender
#   FILM3D_VIE=0                             # rend sans la couche (l'avant)
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import parcours as P  # noqa: E402

FPS = P.FPS
G_FIN = P.START["FIN6"] + P.FIN6_FRAMES - 1          # la dernière image du film (719)
ENV = "FILM3D_VIE"


def active():
    return os.environ.get(ENV, "1") != "0"


# ---------------------------------------------------------------- les cotes de la ville (repère du pont, en m)

AV_Y = -433.155            # l'axe de l'avenue (x_A = 0) ; la berline va vers +x, la mer est au sud (y plus bas)
AV_E1, AV_E2 = AV_Y - 1.75, AV_Y - 5.25         # les voies vers l'est (la berline sur E1)
AV_O1, AV_O2 = AV_Y + 1.75, AV_Y + 5.25         # les voies vers l'ouest (la patrouille sur O1, la circulation sur O2)
AV_GARE_MER, AV_GARE_VILLE = AV_Y - 5.9, AV_Y + 5.85
AV_PROMENADE, AV_TROTTOIR = -442.1, -423.6      # les axes de marche (promenade côté mer, trottoir côté ville)
BD_Y = -334.4              # l'axe du boulevard du quai ; voie vers l'est au sud, vers l'ouest au nord
BD_E, BD_O = BD_Y - 3.25, BD_Y + 3.25
RUE_VITRINE = 7.25         # |x| d'un passant adossé aux vitrines de la rue des enseignes (trottoirs 4,2 à 7,6)
JETEE_O = (47.3, -145.45)  # un point de l'axe de la jetée ; son cap -50°
JETEE_U = (math.sin(math.radians(50.0)), math.cos(math.radians(50.0)))      # le long de la jetée, vers la pointe
JETEE_N = (-JETEE_U[1], JETEE_U[0])                                          # vers sa gauche


def jetee(u, n):
    """Le point de la jetée à u m le long de son axe (depuis JETEE_O) et n m à sa gauche."""
    return (JETEE_O[0] + u * JETEE_U[0] + n * JETEE_N[0], JETEE_O[1] + u * JETEE_U[1] + n * JETEE_N[1])


def lieux_de(x, y):
    """Le lieu de la ville où se trouve le point (x, y) : celui dont la scène porte le sol à cet endroit."""
    if y < -415.0 or (y < -400.0 and abs(x) > 8.0):
        return "avenue" if x < -19.0 else "rond-point"
    if y < -344.0:
        return "rue"
    if y < -320.0:
        return "rue"
    if abs(x) <= 12.0 and y < -205.0:
        return "pont"
    if y < -151.0 and x < 15.0 or y < -175.0:
        return "port"
    return "jetee"


# ---------------------------------------------------------------- le mouvement, sans Blender

def droite(a, b, pas=1.0):
    n = max(1, int(math.dist(a, b) / pas))
    return [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n + 1)]


def courbe(pts, pas=0.5, n_lisse=6):
    """Une polyligne lissée (moyennes glissantes sur des points rééchantillonnés), sans angle : une trajectoire."""
    dense = []
    for a, b in zip(pts, pts[1:]):
        seg = droite(a, b, pas)
        dense += seg if not dense else seg[1:]
    for _ in range(n_lisse):
        dense = [dense[0]] + [((dense[i - 1][0] + 2 * dense[i][0] + dense[i + 1][0]) / 4,
                               (dense[i - 1][1] + 2 * dense[i][1] + dense[i + 1][1]) / 4)
                              for i in range(1, len(dense) - 1)] + [dense[-1]]
    return dense


class Course:
    """Un véhicule ou un passant qui se déplace : une trajectoire (points de ville), une vitesse donnée par des clés
    (image du film g, m/s) linéaires entre elles, constantes au-delà, partie de s0 m à l'image g0 ; un écart latéral
    (g -> m, positif à gauche) pour serrer une bordure. Le cap suit la trajectoire ; arrêtée, la course garde le
    dernier cap."""

    def __init__(self, pts, vitesses, s0=0.0, g0=0, ecart=None):
        self.pts = pts
        self.cum = [0.0]
        for a, b in zip(pts, pts[1:]):
            self.cum.append(self.cum[-1] + math.dist(a, b))
        self.L = self.cum[-1]
        self.v = sorted(vitesses)
        self.s0, self.g0 = s0, g0
        self.ecart = ecart or (lambda g: 0.0)

    def vit(self, g):
        v = self.v
        if g <= v[0][0]:
            return v[0][1]
        for (ga, va), (gb, vb) in zip(v, v[1:]):
            if g <= gb:
                return va + (vb - va) * (g - ga) / (gb - ga)
        return v[-1][1]

    def _prim(self, g):
        """L'intégrale de la vitesse (m) de la première clé à l'image g : exacte, les clés sont linéaires."""
        v = self.v
        if g <= v[0][0]:
            return v[0][1] * (g - v[0][0]) / FPS
        acc = 0.0
        for (ga, va), (gb, vb) in zip(v, v[1:]):
            if g <= gb:
                vg = va + (vb - va) * (g - ga) / (gb - ga)
                return acc + (va + vg) / 2 * (g - ga) / FPS
            acc += (va + vb) / 2 * (gb - ga) / FPS
        return acc + v[-1][1] * (g - v[-1][0]) / FPS

    def s(self, g):
        """L'abscisse sur la trajectoire à l'image g (s0 à l'image g0), bornée à la trajectoire."""
        return min(max(self.s0 + self._prim(g) - self._prim(self.g0), 0.0), self.L)

    def _at(self, s):
        cum, pts = self.cum, self.pts
        lo, hi = 0, len(cum) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if cum[m] <= s:
                lo = m
            else:
                hi = m
        a, b = pts[lo], pts[hi]
        d = cum[hi] - cum[lo] or 1e-9
        k = (s - cum[lo]) / d
        return (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)

    def tangente(self, s):
        a = self._at(max(0.0, s - 1.0))
        b = self._at(min(self.L, s + 1.0))
        if math.dist(a, b) < 1e-6:
            a, b = self.pts[-2], self.pts[-1]
        return math.degrees(math.atan2(-(b[0] - a[0]), b[1] - a[1]))         # cap : 0 vers +y, positif vers -x

    def pose(self, g):
        """(x, y, cap en degrés) à l'image g du film."""
        s = self.s(g)
        x, y = self._at(s)
        cap = self.tangente(s)
        e = self.ecart(g)
        if e:
            c = math.radians(cap)
            x, y = x - e * math.cos(c), y - e * math.sin(c)        # la gauche du cap : (-cos, -sin)
            # la pente de l'écart sur la course tourne la caisse (dérivée sur une demi-seconde)
            ds = self.s(g + 6) - self.s(g - 6)
            if ds > 0.3:
                cap += math.degrees(math.atan2(self.ecart(g + 6) - self.ecart(g - 6), ds))
        return x, y, cap

    def freine(self, g):
        """Les feux stop : la vitesse baisse, ou la voiture vient de s'arrêter (sans warning)."""
        return self.vit(g + 1) < self.vit(g) - 0.04 or (self.vit(g) < 0.05 and self.s(g) > self.s0 + 0.5)


class Fixe:
    """Un véhicule ou un passant immobile."""

    def __init__(self, x, y, cap):
        self.p = (x, y, cap)

    def pose(self, g):
        return self.p

    def freine(self, g):
        return False

    def vit(self, g):
        return 0.0


def bosse(g0, g1, amp, montee=8.0):
    """Un écart qui s'installe de g0 à g0 + montee, tient, et se défait de g1 - montee à g1 (une voiture qui serre)."""
    def f(g):
        if g <= g0 or g >= g1:
            return 0.0
        k = min(1.0, (g - g0) / montee, (g1 - g) / montee)
        return amp * (3 * k * k - 2 * k * k * k)
    return f


def arret(g_debut, v, decel=3.0):
    """Les clés de vitesse d'une voiture qui roule à v, freine à decel dès g_debut et s'arrête."""
    dur = v / decel * FPS
    return [(g_debut, v), (g_debut + dur, 0.0)]


def warning(g):
    """Les feux de détresse : 1,5 Hz, allumés la moitié du temps (en temps du film)."""
    return 1.0 if (g / FPS * 1.5) % 1.0 < 0.5 else 0.0


# ---------------------------------------------------------------- les modèles (dans les assets, fetch.py)

VOITURES_MODELES = {
    "fairheaven": "lieux/vie/car-fairheaven-lt80/model.glb",
    "negotiator": "lieux/vie/car-negotiator80/model.glb",
    "break84": "lieux/vie/car-fairheaven-sw84/model.glb",
    "riverside": "lieux/vie/car-riverside88/model.glb",
    "sialia": "lieux/vie/car-sialia-sw68/model.glb",
    "chapman": "lieux/vie/car-chapman73/model.glb",
    "taxi": "lieux/vie/taxi-canyon75/model.glb",
    "camion": "lieux/vie/truck-lct3000/model.glb",
    "pickup": "lieux/vie/pickup-doutrive78/model.glb",
    "bus": "lieux/vie/bus-town/model.glb",
}
# la longueur réelle de chaque modèle (le bus est livré en décimètres)
LONGUEUR = {"bus": 12.0}
GENS_MODELES = {
    "nathan": "lieux/vie/people-nathan-walk/model.glb",
    "sophia": "lieux/vie/people-sophia-anim/model.glb",
    "eric": "lieux/vie/people-eric-rigged/model.glb",
    "carla": "lieux/vie/people-carla-rigged/model.glb",
    "claudia": "lieux/vie/people-claudia-rigged/model.glb",
    "assis": "lieux/vie/people-man-sitting/model.glb",
}
MOUETTE = "lieux/vie/seagull/model.glb"
CHARIOT = "lieux/port/forklift/model.glb"

# les teintes des années 80, sourdes sous le crépuscule (la peinture d'origine reste pour le taxi, le bus, le camion)
TEINTES = {
    "creme": "#d9ccaa", "blanc": "#d6d3cb", "sarcelle": "#2d7178", "rose": "#c08893", "bordeaux": "#5a2633",
    "marine": "#27344d", "argent": "#8d9196", "menthe": "#86b5a0", "noir": "#1f2024", "sable": "#b49a72",
    "ciel": "#7c9cb8", "corail": "#c46a55",
}


# ---------------------------------------------------------------- la circulation (en coordonnées de ville)

def _v(kmh):
    return kmh / 3.6


def vehicules():
    """[(nom, modèle, teinte, course, options)] : options phares (allumés), warning (image du film d'où ils
    clignotent), lieux (forcés)."""
    out = []

    def add(nom, modele, teinte, course, **kw):
        out.append((nom, modele, teinte, course, kw))

    # -- l'avenue (OUV, P1) : en face, la patrouille roule sur la voie O1 ; la circulation d'en face tient O2
    o2 = courbe([(40.0, AV_O2), (-330.0, AV_O2)])
    o2b = courbe([(40.0, AV_O2), (-300.0, AV_O2)])
    # deux voitures qui croisent la berline et serrent leur bordure (à droite : écart négatif) devant la patrouille
    add("avenue_face_0", "riverside", "blanc",
        Course(o2, [(0, _v(45))], s0=40.0 + 127.5, g0=0, ecart=bosse(-30, 40, -0.45, 10)), phares=True)
    add("avenue_face_1", "sialia", "sarcelle",
        Course(o2b, [(0, _v(43))], s0=40.0 + 90.0, g0=0, ecart=bosse(10, 75, -0.5, 10)), phares=True)
    # une qui sort du rond-point, voit la poursuite, se range contre la bordure derrière une autre et s'arrête
    rangee = courbe([(40.0, AV_O2), (-24.0, AV_O2), (-34.0, AV_GARE_VILLE + 0.15), (-400.0, AV_GARE_VILLE + 0.15)])
    add("avenue_face_rangee", "negotiator", "rose",
        Course(rangee, [(0, _v(40))] + arret(24, _v(40), 3.2), s0=48.0, g0=0), phares=True, warning=100)
    # déjà rangées : warnings allumés, et une garée devant
    add("avenue_face_arretee", "break84", "creme", Fixe(-48.5, AV_GARE_VILLE + 0.15, 90.0), phares=True, warning=0)
    add("avenue_garee_ville_0", "chapman", "rose", Fixe(-55.0, AV_GARE_VILLE, 90.0))
    # les voitures garées côté mer (la voie de droite est la file de stationnement) : x de leur centre
    teintes = ["bordeaux", "ciel", "argent", "menthe", "noir", "sable", "corail", "marine"]
    modeles = ["fairheaven", "chapman", "taxi", "break84", "pickup", "riverside", "sialia", "negotiator"]
    for k, x in enumerate((-134.0, -126.5, -112.5, -99.0, -88.0, -64.5, -27.5)):
        add(f"avenue_garee_mer_{k}", modeles[k % len(modeles)], teintes[k % len(teintes)],
            Fixe(x, AV_GARE_MER, -90.0 if k % 3 else -89.0))
    # le bus à l'arrêt, feux allumés, côté mer
    add("avenue_bus", "bus", None, Fixe(-46.0, AV_Y - 5.45, -90.0), phares=True, warning=None)

    # -- le rond-point (P2) : on attend aux entrées, on se range
    add("rond_plage_attend", "fairheaven", "menthe", Fixe(1.75, -457.5, 0.0), phares=True)
    add("rond_nord_attend", "chapman", "argent", Fixe(26.0, AV_O2 + 0.3, 90.0), phares=True)
    add("rond_nord_rangee", "riverside", "bordeaux", Fixe(36.0, AV_GARE_MER, -90.0), phares=True, warning=0)
    add("rond_nord_garee_0", "sialia", "ciel", Fixe(52.0, AV_GARE_MER, -90.0))
    add("rond_nord_garee_1", "negotiator", "blanc", Fixe(60.5, AV_GARE_MER, -90.0))

    # -- le boulevard du quai, au bout de la rue (P3) : deux qui traversent, deux qui attendent
    bd_e = courbe([(-400.0, BD_E), (400.0, BD_E)])          # l'abscisse du point x : x + 400
    bd_o = courbe([(400.0, BD_O), (-400.0, BD_O)])          # l'abscisse du point x : 400 - x
    add("quai_traverse_e", "taxi", None, Course(bd_e, [(0, _v(38))], s0=400.0, g0=245), phares=True)
    add("quai_traverse_o", "break84", "sable", Course(bd_o, [(0, _v(36))], s0=400.0, g0=268), phares=True)
    # elles s'arrêtent à 12 m de la rue, freinage de 2,6 m/s² depuis 30 km/h (13,4 m)
    add("quai_attend_e", "fairheaven", "marine",
        Course(bd_e, [(0, _v(30))] + arret(268, _v(30), 2.6), s0=388.0 - 13.4, g0=268), phares=True)
    add("quai_attend_o", "pickup", "corail",
        Course(bd_o, [(0, _v(30))] + arret(262, _v(30), 2.6), s0=387.5 - 13.4, g0=262), phares=True)

    # -- le pont (P4) : la meute tient les quatre voies du côté ville ; les voitures sont rangées au-delà de la
    # crête, contre la bordure, warnings allumés (celle d'en face s'arrête en voyant arriver la poursuite)
    # une voiture quitte le port par le pont, en face : elle démarre à la fin de P3, voit arriver la meute, se range
    # derrière une autre déjà arrêtée et allume ses warnings
    face = courbe([(-5.25, -170.0), (-5.25, -228.0), (-6.05, -240.0), (-6.05, -300.0)])
    add("pont_face_rangee", "negotiator", "argent",
        Course(face, [(0, 0.0), (290, 0.0), (320, _v(45)), (388, _v(45)), (476, 0.0)], s0=0.0, g0=0),
        phares=True, warning=440)
    add("pont_face_arretee", "sialia", "rose", Fixe(-6.05, -246.5, 180.0), phares=True, warning=0)
    add("pont_meme_rangee", "camion", None, Fixe(6.0, -219.5, 0.0), phares=True, warning=0)

    # -- le port (P5) : des camions garés au nord du virage, à l'extérieur, là où regarde la caméra pendant la
    # descente du pont et le dérapage ; phares éteints
    add("port_camion_0", "camion", None, Fixe(2.5, -160.5, -90.0))
    add("port_camion_1", "camion", None, Fixe(9.5, -158.0, -95.0))
    add("port_pickup", "pickup", "blanc", Fixe(-3.5, -163.5, 20.0))
    return out


def chariots():
    """Le chariot élévateur qui fait la navette sur le terre-plein, à 20 m du virage du port : (nom, course).
    Il va et vient de x 0 à 12 (y -167), devant les camions, 2,2 m/s, s'arrête deux secondes à chaque bout."""
    a, b = (0.0, -167.0), (12.0, -167.0)
    aller = droite(a, b, 0.5)
    retour = droite(b, a, 0.5)
    pts = aller + retour[1:] + aller[1:] + retour[1:] + aller[1:] + retour[1:] + aller[1:]
    v = 2.2
    t_bras = math.dist(a, b) / v * FPS
    keys = []
    g = -200.0
    while g < G_FIN + 100:
        keys += [(g, 0.0), (g + 10, v), (g + t_bras - 10, v), (g + t_bras, 0.0), (g + t_bras + 48, 0.0)]
        g += t_bras + 48
    return [("port_chariot", Course(pts, keys, s0=0.0, g0=-200.0))]


# ---------------------------------------------------------------- les passants

MARCHE = 1.3      # m/s : le pas de la marche de Nathan (relevé sur le cycle) ; les autres le reprennent


def gens():
    """[(nom, modèle, anim, course ou fixe, options)] : anim « marche », « attente » (debout, en place), « assis ».
    options : phase (images, décale le cycle), recule (g, dx, dy, dcap) : à l'image g, un pas en arrière et un
    regard vers la poursuite."""
    out = []

    def marche(nom, modele, a, b, g_a, v=MARCHE, **kw):
        out.append((nom, modele, "marche", Course(droite(a, b, 0.5), [(0, v)], s0=0.0, g0=g_a), kw))

    def debout(nom, modele, x, y, cap, **kw):
        out.append((nom, modele, "attente", Fixe(x, y, cap), kw))

    def assis(nom, x, y, cap, **kw):
        out.append((nom, "assis", "assis", Fixe(x, y, cap), kw))

    # -- l'avenue : la promenade côté mer, le trottoir côté ville, l'arrêt du bus, les terrasses, le passage piéton
    marche("av_prom_0", "nathan", (-140.0, AV_PROMENADE), (-20.0, AV_PROMENADE), -10)
    marche("av_prom_1", "carla", (-60.0, AV_PROMENADE + 0.6), (-200.0, AV_PROMENADE + 0.6), -30, v=1.15)
    marche("av_prom_2", "eric", (-25.0, AV_PROMENADE - 0.5), (-200.0, AV_PROMENADE - 0.5), -20, v=1.35)
    marche("av_prom_3", "claudia", (-110.0, AV_PROMENADE + 0.4), (-20.0, AV_PROMENADE + 0.4), -60, v=1.2)
    debout("av_bus_0", "sophia", -48.5, -442.3, 0.0, phase=40)
    debout("av_bus_1", "eric", -44.0, -442.6, 10.0, phase=0)
    assis("av_banc_0", -79.7, -443.6, 0.0)
    assis("av_banc_1", -27.7, -443.6, 0.0, phase=60)
    marche("av_ville_0", "eric", (-150.0, AV_TROTTOIR), (-80.0, AV_TROTTOIR), -20, v=1.3)
    marche("av_ville_1", "claudia", (-95.0, AV_TROTTOIR - 0.5), (-200.0, AV_TROTTOIR - 0.5), -10, v=1.2)
    marche("av_ville_2", "nathan", (-40.0, AV_TROTTOIR), (-200.0, AV_TROTTOIR), 0, v=1.4)
    debout("av_passage_0", "sophia", -78.0, -425.4, 180.0, phase=200, recule=(64, 0.0, 0.75, -35.0))
    debout("av_passage_1", "carla", -72.0, -441.2, 0.0, recule=(70, 0.0, -0.6, 30.0))
    for k, x in enumerate((-128.7, -123.7, -118.7)):
        assis(f"av_terrasse_{k}a", x - 0.75, -423.3, -90.0, phase=20 * k)
        if k != 1:
            assis(f"av_terrasse_{k}b", x + 0.75, -423.3, 90.0, phase=33 * k + 11)

    # -- la rue des enseignes : on regarde le barrage, adossé aux vitrines (la meute de P4 roule jusqu'à |x| 5,4 m,
    # sur les trottoirs) ; deux tournent la tête au passage de la berline
    debout("rue_badaud_0", "eric", RUE_VITRINE, -371.5, 110.0, recule=(258, 0.0, 0.0, 30.0))
    debout("rue_badaud_1", "claudia", RUE_VITRINE, -367.5, 100.0, phase=90)
    debout("rue_badaud_2", "sophia", -RUE_VITRINE, -370.0, -100.0, phase=300, recule=(256, 0.0, 0.0, -35.0))
    debout("rue_badaud_3", "carla", -RUE_VITRINE, -366.0, -115.0)
    debout("rue_badaud_4", "nathan", -RUE_VITRINE, -394.0, -150.0)
    debout("quai_badaud_0", "sophia", RUE_VITRINE, -347.5, 150.0, phase=120)
    debout("quai_badaud_1", "eric", -RUE_VITRINE, -348.0, -150.0)

    # -- le port : un docker près des camions
    debout("port_docker", "eric", 6.0, -163.0, 160.0)
    debout("port_docker_1", "nathan", 13.0, -161.5, -150.0)

    # -- la jetée : des pêcheurs à la rambarde, des promeneurs
    x, y = jetee(-12.0, 5.6)
    debout("jetee_peche_0", "eric", x, y, 40.0)
    x, y = jetee(8.0, -5.6)
    debout("jetee_peche_1", "nathan", x, y, -140.0)
    x, y = jetee(22.0, 5.5)
    debout("jetee_peche_2", "sophia", x, y, 30.0, phase=250)
    marche("jetee_marche_0", "carla", jetee(40.0, -5.0), jetee(-60.0, -5.0), 470, v=1.1)
    marche("jetee_marche_1", "claudia", jetee(-30.0, 5.0), jetee(60.0, 5.0), 420, v=1.15)
    return out


# ---------------------------------------------------------------- la vie lente (objets des lieux)

# Les familles des lieux qui balancent (palmiers) ou tanguent (bateaux) : motif du nom de l'objet de tête
PALMIERS = r"^(palm_\d+|av_royal|prom_royal|island_coco)(_\d+)?(\.\d+)?$"
BATEAUX = r"^marina_(voile|vedette)_\d+(\.\d+)?$"


def balance(g, x, y, amp=0.9, periode=4.2):
    """(roulis, tangage) en degrés d'un palmier au point (x, y) à l'image g : deux sinus de périodes voisines,
    phase tirée de sa place (le même arbre a la même phase dans tous les tronçons)."""
    ph = (x * 0.37 + y * 0.61) % (2 * math.pi)
    t = g / FPS
    a = amp * (0.7 * math.sin(2 * math.pi * t / periode + ph) + 0.3 * math.sin(2 * math.pi * t / (periode * 0.63) + 2 * ph))
    b = amp * 0.45 * math.sin(2 * math.pi * t / (periode * 1.31) + ph * 1.7)
    return a, b


def tangue(g, x, y):
    """(dz en m, roulis, tangage en degrés) d'un bateau au point (x, y) à l'image g."""
    ph = (x * 0.53 + y * 0.29) % (2 * math.pi)
    t = g / FPS
    dz = 0.045 * math.sin(2 * math.pi * t / 5.1 + ph)
    roll = 1.4 * math.sin(2 * math.pi * t / 6.3 + ph * 1.3)
    pitch = 0.5 * math.sin(2 * math.pi * t / 4.4 + ph * 0.7)
    return dz, roll, pitch


def mouettes():
    """[(nom, centre, rayon, hauteur, période en s, phase)] : des cercles lents au-dessus du port et de la marina."""
    return [
        ("mouette_0", (62.0, -150.0), 22.0, 16.0, 11.0, 0.0),
        ("mouette_1", (58.0, -146.0), 17.0, 13.0, 9.0, 2.1),
        ("mouette_2", (70.0, -140.0), 28.0, 19.0, 13.0, 4.0),
        ("mouette_3", (25.0, -205.0), 18.0, 14.0, 10.0, 1.0),
        ("mouette_4", (30.0, -200.0), 24.0, 18.0, 12.0, 3.3),
        ("mouette_5", (95.0, -118.0), 20.0, 15.0, 10.5, 5.2),
    ]


def mouette_pose(m, g):
    _n, (cx, cy), r, h, per, ph = m
    a = 2 * math.pi * (g / FPS) / per + ph
    x, y = cx + r * math.cos(a), cy + r * math.sin(a)
    cap = math.degrees(a) + 180.0                     # tangent au cercle, sens trigonométrique
    z = h + 0.8 * math.sin(a * 2.0 + ph)
    return x, y, z, cap


# ---------------------------------------------------------------- les distances (test_motion), sans Blender

def poursuite():
    """[(plan, g0, g1, {nom: pos(g) -> (x, y)})] : la berline et les patrouilles de chaque tronçon, en ville, sur sa
    fenêtre d'images du film (les trajectoires des modules de chaque plan, render_film.TRAJ)."""
    import importlib

    import render_film as RF
    import ville as V
    out = []
    plans = [s for s, _ in P.SHOTS] + ["FIN6"]
    for shot in plans:
        mod = importlib.import_module(RF.TRAJ[shot])
        n = dict(P.SHOTS).get(shot, P.FIN6_FRAMES)
        tr = mod.tracks()
        g0 = P.START[shot]

        def mk(fn, shot=shot, g0=g0):
            return lambda g: V.to_city(shot, *fn((g - g0) / FPS)[:2])
        out.append((shot, g0, g0 + n - 1, {k: mk(fn) for k, fn in tr.items()}))
    return out


def pistes():
    """{nom: pos(g) -> (x, y)} de tout ce que pose la vie (véhicules, chariot, passants)."""
    out = {}
    for nom, _m, _t, c, _kw in vehicules():
        out[nom] = (lambda c: lambda g: c.pose(g)[:2])(c)
    for nom, c in chariots():
        out[nom] = (lambda c: lambda g: c.pose(g)[:2])(c)
    for nom, _m, _a, c, _kw in gens():
        out["gens:" + nom] = (lambda c: lambda g: c.pose(g)[:2])(c)
    return out


ECART_VEHICULE = 3.4      # m de centre à centre entre un véhicule de la vie et un de la poursuite (1,5 m d'air)
ECART_PASSANT = 1.75      # m entre un passant et le centre d'un véhicule de la poursuite (0,5 m d'air au flanc)


def ecarts():
    """{plan: (distance, image du film, nom de la vie, nom de la poursuite)} : au plus près sur la fenêtre de chaque
    tronçon, véhicules et passants à part. Rend (véhicules, passants)."""
    vie = pistes()
    veh, pas = {}, {}
    for shot, g0, g1, tr in poursuite():
        for g in range(g0, g1 + 1):
            ps = {k: f(g) for k, f in tr.items()}
            for nom, f in vie.items():
                q = f(g)
                for k, p in ps.items():
                    d = math.dist(p, q)
                    tab = pas if nom.startswith("gens:") else veh
                    if shot not in tab or d < tab[shot][0]:
                        tab[shot] = (d, g, nom, k)
    return veh, pas


def ecarts_entre():
    """La plus petite distance entre deux véhicules de la vie qui roulent l'un vers l'autre ou se rangent (hors
    garées côte à côte) : (distance, image, a, b)."""
    tr = {}
    for nom, _m, _t, c, _kw in vehicules():
        tr[nom] = c
    best = (float("inf"), None, None, None)
    noms = sorted(tr)
    for g in range(0, G_FIN + 1, 2):
        ps = {n: tr[n].pose(g)[:2] for n in noms}
        for i, a in enumerate(noms):
            for b in noms[i + 1:]:
                if isinstance(tr[a], Fixe) and isinstance(tr[b], Fixe):
                    continue
                d = math.dist(ps[a], ps[b])
                if d < best[0]:
                    best = (d, g, a, b)
    return best


# ---------------------------------------------------------------- dans Blender

def _log(msg):
    print(f"[vie] {msg}", flush=True)


def _hex(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def _assets():
    import render_film
    return os.path.realpath(render_film.assets_dir())


def _import(rel):
    """Importe un glb des assets ; rend les nouveaux objets."""
    import bpy
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(_assets(), rel))
    return [o for o in bpy.data.objects if o not in before]


def _emit(nom, couleur, termes):
    """Une optique émissive : sa force est la somme des termes (force, attribut d'objet) ; l'attribut est une
    propriété de l'instance (vie_phares, vie_frein, vie_warning : clés par image), None pour une force fixe."""
    import bpy
    m = bpy.data.materials.get(nom)
    if m is not None:
        return m
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes.get("Principled BSDF")
    c = _hex(couleur)
    bs.inputs["Base Color"].default_value = (*[v * 0.3 for v in c], 1.0)
    bs.inputs["Roughness"].default_value = 0.25
    bs.inputs["Emission Color"].default_value = (*c, 1.0)
    out = None
    fixe = 0.0
    for force, attr in termes:
        if attr is None:
            fixe += force
            continue
        at = nt.nodes.new("ShaderNodeAttribute")
        at.attribute_type = "OBJECT"
        at.attribute_name = attr
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY_ADD"
        mul.inputs[1].default_value = force
        mul.inputs[2].default_value = 0.0
        nt.links.new(at.outputs["Fac"], mul.inputs[0])
        if out is not None:
            nt.links.new(out, mul.inputs[2])
        out = mul.outputs[0]
    if out is None:
        bs.inputs["Emission Strength"].default_value = fixe
    else:
        if fixe:
            add = nt.nodes.new("ShaderNodeMath")
            add.operation = "ADD"
            add.inputs[1].default_value = fixe
            nt.links.new(out, add.inputs[0])
            out = add.outputs[0]
        nt.links.new(out, bs.inputs["Emission Strength"])
    m.diffuse_color = (*c, 1.0)
    return m


def _repeint(mat):
    """La caisse prend la teinte de l'instance (Object Info), sur le grain de sa texture (sa luminance)."""
    nt = mat.node_tree
    bs = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bs is None or mat.get("vie_repeint"):
        return
    sock = bs.inputs["Base Color"]
    src = sock.links[0].from_socket if sock.is_linked else None
    info = nt.nodes.new("ShaderNodeObjectInfo")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(info.outputs["Color"], mix.inputs["A"])
    if src is not None:
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        gain = nt.nodes.new("ShaderNodeMath")
        gain.operation = "MULTIPLY"
        gain.use_clamp = True
        gain.inputs[1].default_value = 1.6
        nt.links.new(src, bw.inputs["Color"])
        nt.links.new(bw.outputs["Val"], gain.inputs[0])
        nt.links.new(gain.outputs[0], mix.inputs["B"])
    else:
        mix.inputs["B"].default_value = (1, 1, 1, 1)
    nt.links.new(mix.outputs["Result"], sock)
    mat["vie_repeint"] = 1


def _sommets(objs):
    """Les coins de la boîte des sommets des maillages (leur repère local) : bound_box n'est recalculé qu'à la mise à
    jour du depsgraph, il reste faux juste après un data.transform."""
    from mathutils import Vector
    xs, ys, zs = [], [], []
    for o in objs:
        for v in o.data.vertices:
            xs.append(v.co.x)
            ys.append(v.co.y)
            zs.append(v.co.z)
    return [Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))]


ROUES = r"Wheel\w*_(FL|FR|RL|RR)"


def source_voiture(cle, cache):
    """La source d'un modèle de voiture : la caisse (un maillage, l'avant vers +y, origine au sol entre les essieux)
    et ses quatre roues (origine à leur centre), dans la collection cachée des sources. Badges ôtés, plaques
    vierges, optiques remplacées par des émissifs pilotés par l'instance (vie_phares, vie_frein, vie_warning)."""
    import re

    import bpy
    from mathutils import Matrix, Vector
    if cle in cache:
        return cache[cle]
    objs = _import(VOITURES_MODELES[cle])
    meshes = [o for o in objs if o.type == "MESH" and o.name != "Icosphere" and not o.name.startswith("Icosphere")]
    for o in objs:
        if o.type == "MESH" and o.name.startswith("Icosphere"):
            meshes = [m for m in meshes if m is not o]
    # tout à plat, transformations appliquées
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in objs:
        if o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        o.data = o.data.copy() if o.data.users > 1 else o.data
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    # l'échelle et l'axe long sur +y (les modèles de Zhabotinsky regardent vers +x)
    pts = _sommets(meshes)
    mn = Vector(map(min, *pts))
    mx = Vector(map(max, *pts))
    size = mx - mn
    k = LONGUEUR.get(cle, max(size.x, size.y)) / max(size.x, size.y)
    rot = Matrix.Rotation(math.pi / 2, 4, "Z") if size.x > size.y else Matrix.Identity(4)
    centre = Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)))
    T = rot @ Matrix.Scale(k, 4) @ centre
    for o in meshes:
        o.data.transform(T)
    # des optiques, pas des lampes : phares 6, feux arrière 1,5 (stop 5 de plus), warnings 5 (SPEC §18.56)
    phare = _emit("vie_phare", "#fff2cf", [(6.0, "vie_phares")])
    feu = _emit("vie_feu_ar", "#ff2a14", [(1.5, "vie_phares"), (5.0, "vie_frein")])
    clig = _emit("vie_clignotant", "#ffa018", [(5.0, "vie_warning")])
    plaque = bpy.data.materials.get("vie_plaque") or bpy.data.materials.new("vie_plaque")
    plaque.diffuse_color = (*_hex("#d8d4c8"), 1.0)
    roues, corps = {}, []
    for o in meshes:
        n = o.name
        m = re.search(ROUES, n)
        if m:
            roues.setdefault(m.group(1), []).append(o)
            continue
        if "Badges" in n or "badges" in n:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        if "Numberplate" in n or "Plate_Badges" in n:
            o.data.materials.clear()
            o.data.materials.append(plaque)
        elif re.search(r"Headlights(?!_Glass)", n):
            o.data.materials.clear()
            o.data.materials.append(phare)
        elif re.search(r"(Taillights|Brakelights)", n):
            o.data.materials.clear()
            o.data.materials.append(feu)
        elif "Blinkers" in n:
            o.data.materials.clear()
            o.data.materials.append(clig)
        corps.append(o)
    for o in corps:
        for mat in o.data.materials:
            if mat is not None and mat.use_nodes and ("Body" in mat.name or "Bodymat" in mat.name):
                if cle not in ("taxi", "camion", "bus"):
                    _repeint(mat)
    if cle == "bus":
        for o in corps:
            for i, mat in enumerate(o.data.materials):
                if mat is not None and mat.name == "light":
                    o.data.materials[i] = _emit("vie_bus_plafonnier", "#ffd9a0", [(2.0, None)])
    for o in corps:
        o.select_set(False)
    ctx = bpy.context
    bpy.ops.object.select_all(action="DESELECT")
    for o in corps:
        o.select_set(True)
    ctx.view_layer.objects.active = corps[0]
    if len(corps) > 1:
        bpy.ops.object.join()
    caisse = ctx.view_layer.objects.active
    caisse.name = caisse.data.name = f"vie_src_{cle}"
    wheels = {}
    for pos, parts in roues.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in parts:
            o.select_set(True)
        ctx.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        w = ctx.view_layer.objects.active
        pts = _sommets([w])
        c = (Vector(map(min, *pts)) + Vector(map(max, *pts))) / 2
        w.data.transform(Matrix.Translation(-c))
        w.location = c
        w.name = w.data.name = f"vie_src_{cle}_roue_{pos}"
        dim = pts[1] - pts[0]
        r = dim.z / 2
        # deux roues réunies sous un même nom (une sur l'axe) : elles restent fixes plutôt que de tourner en orbite
        wheels[pos] = (w, tuple(c), r if max(dim.x, dim.y) < 2.6 * r else 0.0)
    for o in [caisse] + [w for w, _c, _r in wheels.values()]:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        _sources().objects.link(o)
    cache[cle] = (caisse, wheels)
    return cache[cle]


_SCENE = None          # la scène où poser() travaille (les collections de la vie y sont liées)


def _sources():
    import bpy
    c = bpy.data.collections.get("vie_sources")
    if c is None:
        c = bpy.data.collections.new("vie_sources")
        (_SCENE or bpy.context.scene).collection.children.link(c)
        c.hide_render = True
        c.hide_viewport = True
    return c


def _coll():
    import bpy
    c = bpy.data.collections.get("vie")
    if c is None:
        c = bpy.data.collections.new("vie")
        (_SCENE or bpy.context.scene).collection.children.link(c)
    return c


def _poser_cle(ob, frame, loc=None, rot=None):
    if loc is not None:
        ob.location = loc
        ob.keyframe_insert("location", frame=frame)
    if rot is not None:
        ob.rotation_euler = rot
        ob.keyframe_insert("rotation_euler", frame=frame)


def _lineaire(ob):
    import motion as M
    for fc in M.fcurves(ob):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def _sol(x, y):
    return P.sol_ville(x, y)


def poser_voitures(root, images, g_of, cache, presents):
    """Les véhicules de la vie dont un lieu est présent : une caisse et quatre roues par instance (les maillages des
    sources partagés), clés à chaque image du tronçon (position, cap, tangage de la pente, roues qui tournent ;
    vie_frein et vie_warning)."""
    import bpy
    n = 0
    for nom, cle, teinte, course, kw in vehicules():
        lx = {lieux_de(*course.pose(g)[:2]) for g in range(0, G_FIN + 1, 24)}
        if presents is not None and not (lx & presents):
            continue
        try:
            caisse, roues = source_voiture(cle, cache)
        except Exception as e:                                  # un modèle manquant : signalé, la vie continue
            _log(f"! {nom} : modèle {cle} non chargé ({e!r})")
            continue
        body = bpy.data.objects.new(f"vie_{nom}", caisse.data)
        _coll().objects.link(body)
        body.parent = root
        body.color = (*_hex(TEINTES[teinte]), 1.0) if teinte else (1, 1, 1, 1)
        body["vie_phares"] = 1.0 if kw.get("phares") else 0.0
        body["vie_frein"] = 0.0
        body["vie_warning"] = 0.0
        ws = []
        for pos, (src, c, r) in roues.items():
            w = bpy.data.objects.new(f"vie_{nom}_roue_{pos}", src.data)
            _coll().objects.link(w)
            w.parent = body
            w.location = c
            ws.append((w, r))
        wn = kw.get("warning")
        for f in images:
            g = g_of(f)
            x, y, cap = course.pose(g)
            z = _sol(x, y)
            c = math.radians(cap)
            fx, fy = -math.sin(c), math.cos(c)
            pente = math.atan2(_sol(x + 1.5 * fx, y + 1.5 * fy) - _sol(x - 1.5 * fx, y - 1.5 * fy), 3.0)
            _poser_cle(body, f, loc=(x, y, z), rot=(pente, 0.0, c))
            s = course.s(g) if isinstance(course, Course) else 0.0
            for w, r in ws:
                if r > 0.0:
                    _poser_cle(w, f, rot=(-s / r, 0.0, 0.0))
            body["vie_frein"] = 1.0 if course.freine(g) else 0.0
            body.keyframe_insert('["vie_frein"]', frame=f)
            body["vie_warning"] = warning(g) if (wn is not None and g >= wn) else 0.0
            body.keyframe_insert('["vie_warning"]', frame=f)
        for o in [body] + [w for w, _r in ws]:
            _lineaire(o)
        _constantes(body, ('["vie_frein"]', '["vie_warning"]'))
        n += 1
    return n


def _constantes(ob, paths):
    import motion as M
    for fc in M.fcurves(ob):
        if fc.data_path in paths:
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"


def poser_chariot(root, images, g_of, presents):
    """Le chariot élévateur du port, la navette (le modèle du quai nord, fetch.py)."""
    import bpy
    from mathutils import Matrix, Vector
    if presents is not None and not ({"port", "jetee"} & presents):
        return 0
    try:
        objs = _import(CHARIOT)
    except Exception as e:
        _log(f"! chariot non chargé ({e!r})")
        return 0
    meshes = [o for o in objs if o.type == "MESH" and not o.name.startswith("Icosphere")]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in objs:
        if o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    ch = bpy.context.view_layer.objects.active
    pts = _sommets([ch])
    mn, mx = Vector(map(min, *pts)), Vector(map(max, *pts))
    size = mx - mn
    k = 3.3 / max(size.x, size.y)                     # un chariot de 2,5 t : 3,3 m fourches comprises
    rot = Matrix.Rotation(math.pi / 2, 4, "Z") if size.x > size.y else Matrix.Identity(4)
    ch.data.transform(rot @ Matrix.Scale(k, 4) @ Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2,
                                                                                mn.z))))
    for c in list(ch.users_collection):
        c.objects.unlink(ch)
    _coll().objects.link(ch)
    n = 0
    for nom, course in chariots():
        ob = ch if n == 0 else bpy.data.objects.new(f"vie_{nom}", ch.data)
        ob.name = f"vie_{nom}"
        if n:
            _coll().objects.link(ob)
        ob.parent = root
        for f in images:
            g = g_of(f)
            x, y, cap = course.pose(g)
            _poser_cle(ob, f, loc=(x, y, 0.0), rot=(0.0, 0.0, math.radians(cap)))
        _lineaire(ob)
        n += 1
    return n


# -- les passants : un squelette par instance (ses données partagées), le maillage partagé, les cycles en NLA

PREFIXES = ("rp_nathan_animated_003_walking_", "rp_sophia_animated_003_idling_")


def _actions_de(objs):
    import bpy
    acts = set()
    for o in objs:
        ad = o.animation_data
        if ad and ad.action:
            acts.add(ad.action)
    return [a for a in acts if a.name in bpy.data.actions]


def _renommer_action(act, prefixe, nom):
    """Une copie de l'action dont les os perdent le préfixe du modèle animé : elle anime les autres Renderpeople."""
    import motion as M  # noqa: F401
    a = act.copy()
    a.name = nom
    curves = list(getattr(a, "fcurves", []) or [])
    if not curves:
        for layer in a.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    for fc in curves:
        if prefixe in fc.data_path:
            fc.data_path = fc.data_path.replace(prefixe, "")
    return a


def source_gens(cle, cache):
    """(armature, maillages, échelle) d'un modèle de passant, dans les sources : la hiérarchie du glb aplatie sous une
    racine à l'échelle du mètre. Et les actions : cache['anims'] = {« marche », « attente », « assis »: (action,
    préfixe des os ou '')}."""
    import bpy
    from mathutils import Matrix, Vector
    if cle in cache:
        return cache[cle]
    objs = _import(GENS_MODELES[cle])
    arm = next(o for o in objs if o.type == "ARMATURE")
    meshes = [o for o in objs if o.type == "MESH" and not o.name.startswith("Icosphere")]
    acts = _actions_de(objs)
    for o in [o for o in objs if o.type == "MESH" and o.name.startswith("Icosphere")]:
        objs.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    # la taille réelle : la hauteur des maillages évalués au repos, ramenée à 1,74 m (un adulte), et l'avant
    mw = arm.matrix_world.copy()
    for o in [arm] + meshes:
        w = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = w
    for o in objs:
        if o.name in bpy.data.objects and o not in meshes and o is not arm and o.type != "ARMATURE":
            bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        o.parent = arm
        o.matrix_parent_inverse = arm.matrix_world.inverted()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    h = max(p.z for p in pts) - min(p.z for p in pts)
    taille = {"assis": 1.32}.get(cle, 1.74 if cle in ("nathan", "eric") else 1.66)
    k = taille / h
    zmin = min(p.z for p in pts)
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    racine = bpy.data.objects.new(f"vie_src_gens_{cle}", None)
    _sources().objects.link(racine)
    arm.parent = racine
    arm.matrix_parent_inverse = Matrix.Identity(4)
    arm.matrix_world = Matrix.Scale(k, 4) @ Matrix.Translation(Vector((-cx, -cy, -zmin))) @ mw
    for o in [arm] + meshes:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        _sources().objects.link(o)
    cache[cle] = (racine, arm, meshes, acts)
    anims = cache.setdefault("anims", {})
    if cle == "nathan" and acts:
        anims["marche"] = (acts[0], PREFIXES[0], tuple(acts[0].frame_range))
    if cle == "sophia" and acts:
        anims["attente"] = (acts[0], PREFIXES[1], boucle(acts[0], 96, 200))
    if cle == "assis" and acts:
        anims["assis"] = (acts[0], "", boucle(acts[0], 72, 168))
    return cache[cle]


def _courbes(act):
    out = list(getattr(act, "fcurves", []) or [])
    if not out:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out += list(bag.fcurves)
    return out


def boucle(act, lmin, lmax):
    """La fenêtre (a, b) de l'action, longue de lmin à lmax images, dont les poses des deux bouts se ressemblent le
    plus (rotations des os du tronc, de la tête et des bras) : l'attente répétée sans saut visible."""
    cs = [fc for fc in _courbes(act) if "rotation" in fc.data_path and any(
        k in fc.data_path.lower() for k in ("hip", "spine", "neck", "head", "arm", "shoulder", "leg"))]
    lo, hi = act.frame_range
    pas = 2
    fr = list(range(int(lo), int(hi) + 1, pas))
    tab = {f: [fc.evaluate(f) for fc in cs] for f in fr}
    best = (float("inf"), lo, min(hi, lo + lmax))
    for i, a in enumerate(fr):
        for b in fr[i + 1:]:
            if b - a < lmin or b - a > lmax:
                continue
            d = sum((x - y) ** 2 for x, y in zip(tab[a], tab[b]))
            if d < best[0]:
                best = (d, a, b)
    _log(f"boucle de {act.name} : {best[1]:.0f} à {best[2]:.0f} (écart {best[0]:.4f}, {len(cs)} courbes)")
    return best[1], best[2]


def _action_pour(cache, anim, cle):
    """L'action d'une animation pour un modèle : l'originale pour son modèle, sinon la copie aux os sans préfixe."""
    act, prefixe, _fen = cache["anims"][anim]
    if (anim == "marche" and cle == "nathan") or (anim == "attente" and cle == "sophia") or anim == "assis":
        return act
    key = f"{anim}:{cle}"
    if key not in cache:
        cache[key] = _renommer_action(act, prefixe, f"vie_{anim}_{cle}")
    return cache[key]


def sol_scene(scene, base):
    """sol(x, y) en ville : le dessus le plus haut sous 0,35 m au-dessus de la chaussée (une bordure, un trottoir ;
    pas une chaise ni un banc), hors objets de la vie ; la chaussée (parcours.sol_ville) à défaut."""
    import bpy
    from mathutils import Matrix, Vector
    B = Matrix(base) if base is not None else Matrix.Identity(4)
    Bi = B.inverted()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    down = (B.to_3x3() @ Vector((0, 0, -1))).normalized()

    def sol(x, y):
        g = _sol(x, y)
        o = B @ Vector((x, y, g + 0.35))
        left = 0.8
        for _ in range(8):
            ok, loc, nor, _i, ob, _m = scene.ray_cast(dg, o, down, distance=left)
            if not ok:
                return g
            ob = ob.original if ob else ob
            if nor.dot(-down) > 0.5 and not (ob and ob.name.startswith("vie_")) and not (ob and ob.hide_render):
                return (Bi @ loc).z
            step = (loc - o).length + 0.002
            o = loc + down * 0.002
            left -= step
            if left <= 0:
                return g
        return g
    return sol


def poser_gens(root, images, g_of, f_of, cache, presents, sol=None):
    import bpy
    sol = sol or _sol
    # les animations d'abord (les sources qui les portent)
    for cle in ("nathan", "sophia", "assis"):
        try:
            source_gens(cle, cache)
        except Exception as e:
            _log(f"! passant {cle} non chargé ({e!r})")
    if "anims" not in cache:
        return 0
    n = 0
    f0, f1 = images[0], images[-1]
    for nom, cle, anim, course, kw in gens():
        lx = {lieux_de(*course.pose(g)[:2]) for g in range(0, G_FIN + 1, 24)}
        if presents is not None and not (lx & presents):
            continue
        if anim not in cache["anims"]:
            continue
        try:
            racine_src, arm_src, meshes_src, _a = source_gens(cle, cache)
        except Exception as e:
            _log(f"! {nom} : {cle} non chargé ({e!r})")
            continue
        pivot = bpy.data.objects.new(f"vie_{nom}", None)
        _coll().objects.link(pivot)
        pivot.parent = root
        arm = arm_src.copy()
        arm.animation_data_clear()
        _coll().objects.link(arm)
        arm.parent = pivot
        arm.matrix_parent_inverse = racine_src.matrix_world.inverted() if False else arm_src.matrix_parent_inverse
        arm.matrix_basis = arm_src.matrix_basis.copy()
        for ms in meshes_src:
            m = ms.copy()
            _coll().objects.link(m)
            m.parent = arm
            m.matrix_parent_inverse = ms.matrix_parent_inverse.copy()
            for md in m.modifiers:
                if md.type == "ARMATURE":
                    md.object = arm
        # le cycle : une bande NLA répétée, partie à une image du film fixe (la même phase dans tous les tronçons)
        act = _action_pour(cache, anim, cle)
        ad = arm.animation_data_create()
        tr = ad.nla_tracks.new()
        lo, hi = cache["anims"][anim][2]
        duree = hi - lo
        g_dep = -400 - kw.get("phase", 0) + (hash(nom) % 37)
        start = f_of(g_dep)
        st = tr.strips.new(nom, int(start), act)
        st.action_frame_start, st.action_frame_end = lo, hi
        reps = math.ceil((f1 - start + 2) / max(duree, 1.0)) + 1
        st.repeat = max(1, reps)
        if hasattr(st, "action_slot") and act.slots:
            try:
                st.action_slot = act.slots[0]
            except Exception:
                pass
        st.extrapolation = "HOLD"
        rec = kw.get("recule")
        for f in images:
            g = g_of(f)
            x, y, cap = course.pose(g)
            if rec:
                k = min(1.0, max(0.0, (g - rec[0]) / 12.0))
                k = 3 * k * k - 2 * k * k * k
                x, y, cap = x + rec[1] * k, y + rec[2] * k, cap + rec[3] * k
            _poser_cle(pivot, f, loc=(x, y, sol(x, y)), rot=(0.0, 0.0, math.radians(cap)))
        _lineaire(pivot)
        n += 1
    return n


def poser_mouettes(root, images, g_of, f_of, cache, presents):
    import bpy
    from mathutils import Matrix, Vector
    if presents is not None and not ({"port", "jetee"} & presents):
        return 0
    try:
        objs = _import(MOUETTE)
    except Exception as e:
        _log(f"! mouette non chargée ({e!r})")
        return 0
    arm = next(o for o in objs if o.type == "ARMATURE")
    meshes = [o for o in objs if o.type == "MESH" and not o.name.startswith("Icosphere")]
    acts = _actions_de(objs)
    bpy.context.view_layer.update()
    mw = arm.matrix_world.copy()
    for o in [arm] + meshes:
        w = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = w
    for o in objs:
        if o.name in bpy.data.objects and o not in meshes and o is not arm:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        o.parent = arm
        o.matrix_parent_inverse = arm.matrix_world.inverted()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    span = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
    k = 1.25 / span                                   # un goéland : 1,25 m d'envergure
    src = bpy.data.objects.new("vie_src_mouette", None)
    _sources().objects.link(src)
    arm.parent = src
    arm.matrix_world = Matrix.Scale(k, 4) @ mw
    for o in [arm] + meshes:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        _sources().objects.link(o)
    act = acts[0] if acts else None
    n = 0
    for m in mouettes():
        piv = bpy.data.objects.new(f"vie_{m[0]}", None)
        _coll().objects.link(piv)
        piv.parent = root
        a2 = arm.copy()
        a2.animation_data_clear()
        _coll().objects.link(a2)
        a2.parent = piv
        a2.matrix_parent_inverse = arm.matrix_parent_inverse.copy()
        a2.matrix_basis = arm.matrix_basis.copy()
        for ms in meshes:
            mm = ms.copy()
            _coll().objects.link(mm)
            mm.parent = a2
            mm.matrix_parent_inverse = ms.matrix_parent_inverse.copy()
            for md in mm.modifiers:
                if md.type == "ARMATURE":
                    md.object = a2
        if act is not None:
            ad = a2.animation_data_create()
            tr = ad.nla_tracks.new()
            lo, hi = act.frame_range
            start = f_of(-300 - int(m[5] * 10))
            st = tr.strips.new(m[0], int(start), act)
            st.repeat = max(1, math.ceil((images[-1] - start + 2) / max(hi - lo, 1.0)) + 1)
            if hasattr(st, "action_slot") and act.slots:
                try:
                    st.action_slot = act.slots[0]
                except Exception:
                    pass
        for f in images:
            x, y, z, cap = mouette_pose(m, g_of(f))
            _poser_cle(piv, f, loc=(x, y, z), rot=(0.0, math.radians(-12.0), math.radians(cap)))
        _lineaire(piv)
        n += 1
    return n


def animer_lieux(scene, base, images, g_of):
    """La vie lente des objets des lieux présents : palmiers qui balancent (autour de leur pied), bateaux de la marina
    qui tanguent. Leur place dans la ville (base⁻¹ · monde) donne leur phase : la même dans tous les tronçons."""
    import re

    from mathutils import Euler, Matrix
    inv = Matrix(base).inverted() if base is not None else Matrix.Identity(4)   # scène -> ville : base⁻¹
    city_of = (lambda p: inv @ p) if base is not None else (lambda p: p)
    npal = nbat = 0
    for ob in list(scene.objects):
        if ob.hide_render or ob.type not in ("MESH", "EMPTY"):
            continue
        nom = ob.name
        pal = re.match(PALMIERS, nom)
        bat = re.match(BATEAUX, nom)
        if not (pal or bat):
            continue
        if ob.animation_data and ob.animation_data.action:
            continue                                   # déjà animé par son lieu : on n'y touche pas
        if ob.type == "MESH" and max(ob.dimensions) > (30.0 if pal else 25.0):
            continue                                   # une rangée jointe : la balancer d'un bloc la déplacerait
        p = city_of(ob.matrix_world.translation)
        loc0 = ob.location.copy()
        rot0 = ob.rotation_euler.copy()
        mode = ob.rotation_mode
        if mode != "XYZ":
            continue
        for f in images[::2] + [images[-1]]:
            g = g_of(f)
            if pal:
                a, b = balance(g, p.x, p.y)
                d = Euler((math.radians(a), math.radians(b), 0.0), "XYZ").to_matrix()
                r = (rot0.to_matrix() @ d).to_euler("XYZ", rot0)
                ob.rotation_euler = r
                ob.keyframe_insert("rotation_euler", frame=f)
            else:
                dz, roll, pitch = tangue(g, p.x, p.y)
                ob.location = (loc0.x, loc0.y, loc0.z + dz)
                ob.keyframe_insert("location", frame=f)
                d = Euler((math.radians(pitch), math.radians(roll), 0.0), "XYZ").to_matrix()
                ob.rotation_euler = (rot0.to_matrix() @ d).to_euler("XYZ", rot0)
                ob.keyframe_insert("rotation_euler", frame=f)
        ob["vie_anime"] = 1
        if pal:
            npal += 1
        else:
            nbat += 1
    return npal, nbat


def poser(scene, plan=None, presents=None, base=None, g_of=None, images=None):
    """Pose la vie dans la scène. `base` (4 × 4, lignes) : ville -> scène (None : la scène est la ville) ; `g_of`
    (image de la scène -> image du film) ; `images` : les images de la scène à clé (défaut : toute sa plage, une de
    plus de chaque côté pour l'obturateur) ; `presents` : les lieux posés (None : tous). Rend un résumé."""
    import time

    import bpy
    from mathutils import Matrix
    if not active():
        _log(f"{ENV}=0 : pas de vie")
        return {}
    t0 = time.time()
    if images is None:
        images = list(range(scene.frame_start - 1, scene.frame_end + 2))
    if g_of is None:
        g_of = (lambda f: f - 1)
    f_of = (lambda g: g + (images[1] - g_of(images[1])))
    global _SCENE
    _SCENE = scene
    if bpy.context.window is not None and bpy.context.window.scene != scene:
        bpy.context.window.scene = scene
    avant = set(bpy.data.objects)
    root = bpy.data.objects.new("vie_racine", None)
    _coll().objects.link(root)
    root.matrix_world = Matrix(base) if base is not None else Matrix.Identity(4)
    cache = {}
    nv = poser_voitures(root, images, g_of, cache, presents)
    nc = poser_chariot(root, images, g_of, presents)
    ng = poser_gens(root, images, g_of, f_of, cache, presents, sol=sol_scene(scene, base))
    nm = poser_mouettes(root, images, g_of, f_of, cache, presents)
    # ce qu'un import raté a laissé hors des collections de la vie (à l'échelle de son fichier) ne reste pas
    gardes = set(_coll().all_objects) | set(_sources().all_objects)
    for o in [o for o in bpy.data.objects if o not in avant and o not in gardes]:
        bpy.data.objects.remove(o, do_unlink=True)
    npal, nbat = animer_lieux(scene, base, images, g_of)
    for o in _coll().all_objects:
        o["vie"] = 1
    out = dict(vehicules=nv, chariots=nc, passants=ng, mouettes=nm, palmiers=npal, bateaux=nbat,
               secondes=round(time.time() - t0, 1))
    _log(f"{plan or 'ville'} : {nv} véhicules, {nc} chariot, {ng} passants, {nm} mouettes, {npal} palmiers et {nbat} "
         f"bateaux animés ({', '.join(sorted(presents)) if presents else 'tous les lieux'}) en {out['secondes']} s")
    return out


def poser_plan(scene, plan):
    """render_film : la vie autour du tronçon `plan`, dans le repère de sa scène (son lieu), en temps du film ; les
    lieux présents : le sien et les voisins que ville.voisins a posés."""
    import ville as V
    own = V.lieu_of_shot(plan)[0]
    presents = {own} | {o.get("ville_lieu") for o in scene.objects if o.get("ville_lieu")}
    from mathutils import Matrix
    base = Matrix(V.matrice(V.lieu(own)["plan"])).inverted()
    fs = scene.frame_start
    g0 = P.START[plan]
    return poser(scene, plan=plan, presents=presents, base=[list(r) for r in base],
                 g_of=lambda f: g0 + (f - fs))


# ---------------------------------------------------------------- sans Blender : l'inventaire

def main():
    import collections
    par = collections.Counter()
    for nom, _m, _t, c, _kw in vehicules():
        par[("véhicules", lieux_de(*c.pose(200)[:2]))] += 1
    for nom, _m, _a, c, _kw in gens():
        par[("passants", lieux_de(*c.pose(200)[:2]))] += 1
    for (k, l), n in sorted(par.items()):
        print(f"{k:10} {l:12} {n}")
    veh, pas = ecarts()
    for shot in veh:
        d, g, a, b = veh[shot]
        print(f"{shot:5} véhicules : {d:5.1f} m ({a} / {b}, image {g})", end="")
        if shot in pas:
            d, g, a, b = pas[shot]
            print(f" ; passants : {d:5.1f} m ({a} / {b}, image {g})")
        else:
            print()
    print("entre véhicules de la vie : %.1f m (image %s, %s / %s)" % ecarts_entre())


if __name__ == "__main__":
    main()
