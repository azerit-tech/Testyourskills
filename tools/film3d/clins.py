# Les clins d'œil (SPEC §18.65) : ce qui, dans la ville du film, parle aux gens la semaine où sort le grand jeu de
# poursuite en Floride (19 novembre 2026), sans rien lui prendre.
#
# Jacques, le 18 novembre : « je veux pas recopier mais inclure des refs qui vont parler aux gens ». La référence
# commune est la Floride des années 80 et sa culture publique (Miami Beach, l'Art déco, les flamants en plastique, les
# alligators, les bateaux de course, les panneaux d'avocats et de cautions, l'homme du coin des faits divers, le
# badaud qui filme), jamais le jeu : ni nom, ni logo, ni police, ni personnage, ni interface. Chaque texte est une
# invention à nous.
#
# Une couche comme la vie (vie.py) : posée par-dessus les lieux, en coordonnées de ville (repère du pont) et en temps
# du film (g, 0 = OUV/1 … 719 = FIN6/101), la même dans chaque tronçon. render_film --ville la pose après la vie,
# ville.py --prise et diag/vue_route.py --vie aussi. FILM3D_CLINS=0 l'ôte.
#
# Ce qu'elle pose (modèles de bibliothèque, CREDITS.md, fetch.py, lieux/clins/ ; les néons sont les lettres de la
# bibliothèque A-neon-letters déjà dans les enseignes de la ville ; seuls le mouvement, les caissons et les textes des
# panneaux sont en code) :
#   l'avenue : l'hôtel FLAMINGA (néon sur le toit, flamant de néon), l'enseigne en drapeau THE CORAL (palmier de
#     néon), une glacière ambulante rose garée côté plage, un coupé blanc des années 80 devant l'hôtel, un poste de
#     secours pastel sur la plage ;
#   le rond-point : des flamants roses en plastique sur l'îlot ;
#   la rue : deux panneaux sur les toits des tours du bout, l'avocat (ACCIDENT ?) et les cautions (CAUTION EXPRESS) ;
#   le port : deux panneaux face au pont, le spectacle d'alligators (GATOR SHOW) et Azerit (« on recrute sur
#     preuves ») ; un alligator sur le quai, au bout de la route ; le journal du coin (L'ÉCHO DU QUAI) à l'entrée de la
#     jetée ;
#   la jetée : un hydroglisseur amarré à la marina, un bateau de course qui file le long de la jetée ;
#   la pointe : un badaud en chemise hawaïenne qui filme la fin au téléphone, lampe allumée.
# Lumières : des émissifs (néons 3 à 6, lampe du téléphone, feux de navigation) et des projecteurs de panneau, petits
# spots posés sur leurs consoles, liés à la seule face du panneau (aucune tache au sol).
#
#   python3 tools/film3d/clins.py            # l'inventaire, les écarts à la poursuite, quand chaque clin est vu
#   FILM3D_CLINS=0                           # rend sans la couche
import math
import os
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import parcours as P  # noqa: E402

FPS = P.FPS
G_FIN = P.START["FIN6"] + P.FIN6_FRAMES - 1          # la dernière image du film (719)
ENV = "FILM3D_CLINS"
WATER_Z = -1.5                                        # lieux.WATER_Z : le plan d'eau du port, de la jetée, de la marina
GELS = (107, 214, 317, 425, 485, 719)                 # les arrêts sur image (la dernière de chaque plan joué)


def active():
    return os.environ.get(ENV, "1") != "0"


def cap_vers(x, y, tx, ty):
    """Le cap (°, convention de la vie : l'avant d'un modèle vers +y local) qui tourne l'avant vers (tx, ty)."""
    return math.degrees(math.atan2(-(tx - x), ty - y))


def jetee(u, n):
    """Le point de la jetée à u m le long de son axe et n m à sa gauche (vie.jetee)."""
    import vie
    return vie.jetee(u, n)


# ---------------------------------------------------------------- les textes (nos inventions, rien d'existant)
#
# Un panneau : (fond, [(texte, hauteur relative, couleur, gras)], liseré). Hauteurs en fraction de la hauteur utile.
PANNEAUX = {
    # l'avocat des accidents (les panneaux bleu et jaune des autoroutes de Floride)
    "avocat": ("#f2c230", [("ACCIDENT ?", 0.34, "#14244a", True),
                           ("APPELEZ MAÎTRE CASH", 0.17, "#14244a", True),
                           ("1-800-PAS-MA-FAUTE", 0.2, "#b3202a", True)], "#14244a"),
    # les cautions (bail bonds), rouge et blanc, ouvert la nuit
    "caution": ("#b3202a", [("CAUTION EXPRESS", 0.3, "#fff6e6", True),
                            ("ON VOUS SORT DE LÀ", 0.2, "#ffd84a", True),
                            ("24 H / 24 · 7 J / 7", 0.15, "#fff6e6", False)], "#fff6e6"),
    # le spectacle d'alligators (gator wrestling), vert marais et jaune
    "gator": ("#1f5a3a", [("GATOR SHOW", 0.36, "#ffd84a", True),
                          ("LUTTE À MAINS NUES", 0.18, "#fff6e6", True),
                          ("TOUS LES SOIRS · 20 H", 0.15, "#ffd84a", False)], "#ffd84a"),
    # Azerit : sobre, marine et crème, une seule phrase
    "azerit": ("#141b2e", [("AZERIT", 0.4, "#efe6d2", True),
                           ("on recrute sur preuves", 0.17, "#c9a96a", False),
                           ("azerit.tech", 0.11, "#8f96a8", False)], "#c9a96a"),
    # l'homme du coin (Florida Man) : la une du journal du port
    "echo": ("#f1ede4", [("L'ÉCHO DU QUAI", 0.13, "#b3202a", True),
                         ("L'HOMME DU COIN", 0.27, "#111111", True),
                         ("A ENCORE FRAPPÉ", 0.27, "#111111", True),
                         ("il volait une glacière ambulante", 0.1, "#333333", False)], "#111111"),
}

# les néons (teinte, force d'émission : la gamme de facade_mix.NEON, celle des enseignes de la ville)
NEONS = {"rose": ("#ff5c8a", 5.0), "menthe": ("#3fe0b0", 4.0), "corail": ("#ff6a3d", 5.0), "creme": ("#fff3d6", 4.5),
         "ambre": ("#ffc36b", 5.0)}

# ---------------------------------------------------------------- les modèles (fetch.py, CREDITS.md)
#
# avant : où regarde l'avant du modèle tel que livré (après l'import glTF), ou « auto:… » pour le trouver ; il est
# tourné vers +y (la convention de la vie). long / haut : la taille voulue (le plus long côté au sol, ou la hauteur).
MODELES = {
    "flamant": dict(f="lieux/clins/flamingo-lawn/model.glb", haut=1.15, avant="+y"),   # un peu grands : lus à 360 px
    "flamant_neon": dict(f="lieux/clins/flamingo-neon/model.glb", haut=3.4, avant="+x"),
    "palmier_neon": dict(f="lieux/clins/palm-neon/model.glb", haut=1.7, avant="debout"),
    "alligator": dict(f="lieux/clins/alligator/model.glb", long=3.4, avant="auto:tete", garder="gros"),
    "aeroglisseur": dict(f="lieux/clins/airboat/model.glb", long=4.8, avant="auto:helice", sans=("Registration",)),
    "cigarette": dict(f="lieux/clins/speedboat/model.glb", long=10.5, avant="auto:moteur"),
    "glacier": dict(f="lieux/clins/icecream-truck/model.glb", long=6.0, avant="-y"),
    "poste": dict(f="lieux/clins/lifeguard/model.glb", haut=5.6, avant="+y"),
    "touriste": dict(f="lieux/clins/hawaiian/model.glb", haut=1.78, avant="-y"),
    "telephone": dict(f="lieux/clins/phone/model.glb", long=0.155, avant="+y"),
    "coupe": dict(f="coupe.glb", long=4.3, avant="+x"),
}

# ---------------------------------------------------------------- les cotes (ville, repère du pont, en m)

HOTEL_8 = (-95.8, -73.8, -424.1, -406.7, 10.6)        # le petit hôtel à marquise (bld_hotel_8) : son toit (sonde)
LINER_9 = (-57.4, -26.2, -424.1, -405.1, 14.8)        # le « paquebot » d'angle au rond-point (bld_liner_9)
ILOT = (0.0, -433.2, 5.8, 0.5)                        # l'îlot du rond-point : centre, rayon du sol, hauteur du sol
TOUR_D = (-19.0, -5.3, -356.0, -344.0, 20.2)          # les deux tours du bout de la rue (scene_b), leur toit (sonde)
TOUR_G = (5.3, 19.0, -356.0, -344.0, 20.2)
CAM_AVENUE = (-153.3, -434.6)                         # la caméra au début du film (OUV/1)
CAM_RUE = (0.1, -400.0)                               # la caméra au milieu de la rue (P3)
CAM_PONT = (1.0, -300.0)                              # la caméra sur le pont (P4)
PANNEAU_PORT_Z = 11.5                                 # le bas des panneaux du port (conteneurs : 13,8 m)
ECHO_P = (19.0, -176.5)                               # le journal du port, sur le terre-plein, à droite du virage


def remplace_vie(x, y):
    """La voiture garée de la vie la plus proche de (x, y) : (nom de l'objet de la vie, x, y, cap). Un clin qui
    prend sa place la cache : même place, même écart déjà tenu à la poursuite (test_vie)."""
    import vie
    best = None
    for nom, m, _t, c, _kw in vie.vehicules():
        if not isinstance(c, vie.Fixe):
            continue
        px, py, cap = c.p
        d = math.dist((px, py), (x, y))
        if best is None or d < best[0]:
            best = (d, nom, m, px, py, cap)
    _d, nom, m, px, py, cap = best
    return "vie_" + nom, m, px, py, cap


# ---------------------------------------------------------------- le mouvement, sans Blender

def tangue(g, x, y, amp=1.0):
    """(dz, roulis, tangage) d'un bateau amarré : la houle de la marina (vie.tangue)."""
    ph = (x * 0.53 + y * 0.29) % (2 * math.pi)
    t = g / FPS
    return (0.045 * amp * math.sin(2 * math.pi * t / 5.1 + ph), 1.4 * amp * math.sin(2 * math.pi * t / 6.3 + ph * 1.3),
            0.5 * amp * math.sin(2 * math.pi * t / 4.4 + ph * 0.7))


def _lisse(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


# le bateau de course : il double la berline le long de la jetée, côté large (à gauche), de P5 à la pointe
POINTE_VILLE = (97.2, -103.6, 45.0)   # le centre de la pointe en ville et le rayon (quai compris) à tenir
CIG_G0 = 486                    # il paraît avec P6, devant la berline, et la distance
CIG_G1 = 600                    # sorti du cadre vers le large : ôté
CIG_N = 10.0                    # m à gauche de l'axe de la jetée (5 m de son mur)
CIG_U0, CIG_V = -25.0, 20.0     # m le long de la jetée à CIG_G0 ; m/s (72 km/h : la berline roule à 55) : à gauche du cadre de 486 à 545


def _cig_xy(u):
    n = CIG_N + 0.04 * max(0.0, u - 8.0) ** 2          # il s'écarte vers le large avant la pointe (POINTE_VILLE)
    return jetee(u, n)


def cigarette(g):
    """(x, y, z, cap, tangage, roulis) du bateau de course à l'image g : il file vers la pointe, nez levé."""
    gg = max(g, CIG_G0)
    u = CIG_U0 + CIG_V * (gg - CIG_G0) / FPS
    x, y = _cig_xy(u)
    cap = cap_vers(x, y, *_cig_xy(u + 1.0))
    t = g / FPS
    return (x, y, WATER_Z + 0.05 + 0.06 * math.sin(t * 7.1), cap + 0.8 * math.sin(t * 1.7),
            4.5 + 0.8 * math.sin(t * 5.3), 1.2 * math.sin(t * 3.1))


# l'alligator : il se chauffe sur le quai au bout de la route du port, puis rampe vers l'eau quand la poursuite arrive
GATOR_P0 = (11.0, -184.0)       # sur le terre-plein, à droite de la descente du pont, dans le virage (pas derrière la berline)
GATOR_CAP0 = 160.0              # la tête vers la poursuite qui descend du pont
GATOR_G = (436, 476)            # il se tourne et rampe vers le quai
GATOR_V = 0.55                  # m/s
GATOR_CAP1 = 205.0              # il se détourne et rampe vers le sud, loin du virage


def alligator(g):
    k = _lisse((g - GATOR_G[0]) / (GATOR_G[1] - GATOR_G[0]))
    cap = GATOR_CAP0 + (GATOR_CAP1 - GATOR_CAP0) * k
    t = max(0.0, (g - GATOR_G[0]) / FPS)
    s = GATOR_V * max(0.0, t - 0.6)
    c = math.radians(cap)
    x, y = GATOR_P0[0] - math.sin(c) * s, GATOR_P0[1] + math.cos(c) * s
    return x, y, 0.0, cap + 3.0 * math.sin(g / FPS * 2.4) * (1 if s > 0 else 0)


# le badaud de la pointe : il tourne pour garder la berline dans son téléphone
FILMEUR_P = (72.7, -94.5)       # au garde-corps de la pointe, à gauche du cadre final (FIN6, orbite comprise)


def filmeur_cap(g):
    import ville as V
    hx, hy = V.hero_city(min(max(g + 1, 1), P.TOTAL + P.FIN6_FRAMES))[:2]
    return cap_vers(*FILMEUR_P, hx, hy)


# ---------------------------------------------------------------- l'inventaire

def clins():
    """[dict] : chaque clin d'œil. Clés : nom, quoi (enseigne_toit, drapeau, panneau, modele, remplace, course,
    filmeur), lieu (de vie.lieux_de, ou forcé), pose (g -> (x, y, z, cap[, tangage, roulis])), classe (« vehicule »,
    « passant » : l'écart tenu à la poursuite ; None : en hauteur ou sur l'eau loin de la route), rayon (m, pour
    savoir quand il est dans le cadre), et ce que son type demande."""
    out = []

    def fixe(x, y, z, cap):
        return lambda g: (x, y, z, cap)

    # -- l'avenue : l'hôtel FLAMINGA, néon sur le toit, face à la poursuite qui arrive
    x0, x1, y0, y1, zt = HOTEL_8
    out.append(dict(nom="hotel_flaminga", quoi="enseigne_toit", lieu="avenue", rayon=7.0,
                    pose=fixe(x1 - 4.0, (y0 + y1) / 2 + 0.5, zt, cap_vers(x1 - 4.0, (y0 + y1) / 2, *CAM_AVENUE)),
                    mot="FLAMINGA", haut=1.75, neon="rose", petit="HOTEL", petit_neon="menthe", flamant=True))
    # -- l'enseigne en drapeau du paquebot d'angle : THE CORAL, lettres empilées, palmier de néon en tête
    x0, x1, y0, y1, zt = LINER_9
    out.append(dict(nom="the_coral", quoi="drapeau", lieu="avenue", rayon=5.0,
                    pose=fixe(-51.0, y0, 7.0, 90.0), mot="CORAL", haut=1.05, neon="menthe", petit="THE",
                    petit_neon="corail", saillie=1.6, palmier=True))
    # -- le coupé blanc des années 80 devant l'hôtel (à la place d'une garée de la vie)
    nom_v, _m, x, y, cap = remplace_vie(-88.0, -427.3)
    out.append(dict(nom="coupe_blanc", quoi="remplace", lieu="avenue", rayon=2.5, classe="vehicule", cache=nom_v,
                    modele="coupe", pose=fixe(x, y, 0.0, cap), teinte="#eeeae2"))
    # -- la glacière ambulante rose garée côté plage, en face de la rue transversale (à la place du camion)
    nom_v, _m, x, y, cap = remplace_vie(-63.0, -439.1)
    out.append(dict(nom="glaciere", quoi="remplace", lieu="avenue", rayon=3.5, classe="vehicule", cache=nom_v,
                    modele="glacier", pose=fixe(x, y, 0.0, cap)))
    # -- le poste de secours pastel sur la plage, tourné vers la mer
    out.append(dict(nom="poste_secours", quoi="modele", lieu="avenue", rayon=4.0, classe="passant",
                    modele="poste", pose=fixe(-44.0, -452.5, -1.5, 180.0 - 15.0)))
    # -- l'îlot du rond-point : sept flamants roses en plastique sur la terre, tournés vers l'avenue
    cx, cy, r, zs = ILOT
    for k, (a, rr) in enumerate(((188, 4.4), (199, 3.1), (207, 4.7), (219, 3.6), (229, 4.8), (196, 5.0), (247, 4.5))):
        x, y = cx + rr * math.cos(math.radians(a)), cy + rr * math.sin(math.radians(a))
        cap = cap_vers(x, y, -40.0, -434.6) + (zlib.crc32(f"flamant{k}".encode()) % 70 - 35)
        out.append(dict(nom=f"flamant_{k}", quoi="modele", lieu="rond-point", rayon=0.6, classe="passant",
                        modele="flamant", pose=fixe(x, y, zs, cap), echelle=0.9 + 0.04 * (k % 4)))
    # -- la rue : les deux panneaux sur les toits des tours du bout, tournés vers la rue
    for nom, (x0, x1, y0, y1, zt), cle in (("panneau_caution", TOUR_D, "caution"), ("panneau_avocat", TOUR_G, "avocat")):
        x, y = (x0 + x1) / 2, (y0 + y1) / 2
        out.append(dict(nom=nom, quoi="panneau", lieu="rue", rayon=6.0, texte=cle, largeur=10.0, hauteur=4.2,
                        pose=fixe(x, y, zt + 1.2, cap_vers(x, y, *CAM_RUE)), sol=zt))
    # -- le port, face au pont, sur le terre-plein (le quai nord est à y -173,75 à l'est de x 5 : sonde du sol,
    # diag/clins_gris.py --carte) : Azerit à gauche, GATOR SHOW à droite au bout du virage, au-dessus des conteneurs
    for nom, (x, y), cle in (("panneau_azerit", (-27.0, -176.0), "azerit"), ("panneau_gator", (31.0, -176.0), "gator")):
        out.append(dict(nom=nom, quoi="panneau", lieu="port", rayon=6.0, texte=cle, largeur=11.0, hauteur=4.6,
                        pose=fixe(x, y, PANNEAU_PORT_Z, cap_vers(x, y, *CAM_PONT)), sol=0.0))
    # -- l'alligator du quai
    out.append(dict(nom="alligator", quoi="course", lieu="port", rayon=1.8, classe="vehicule", modele="alligator",
                    pose=alligator))
    # -- le journal du coin, au coin du quai, à l'entrée de la jetée, tourné vers le virage du port
    x, y = ECHO_P
    out.append(dict(nom="panneau_echo", quoi="panneau", lieu="port", rayon=4.0, texte="echo", largeur=7.0,
                    hauteur=3.6, pose=fixe(x, y, 6.0, cap_vers(x, y, 1.6, -200.0)), sol=0.0))
    # -- la marina : l'hydroglisseur amarré contre le mur droit de la jetée, entre deux lampadaires, l'hélice vers
    #    la pointe (la file des voiliers commence à 7 m de là, plus au large)
    x, y = jetee(21.0, -7.4)
    out.append(dict(nom="hydroglisseur", quoi="course", lieu="jetee", rayon=2.5, classe="vehicule",
                    modele="aeroglisseur",
                    pose=(lambda x, y: lambda g: (x, y, WATER_Z + 0.12 + tangue(g, x, y)[0], 130.0,
                                                  tangue(g, x, y)[2], tangue(g, x, y)[1]))(x, y)))
    # -- le bateau de course qui double la berline le long de la jetée
    out.append(dict(nom="cigarette", quoi="course", lieu="jetee", rayon=5.5, classe=None, modele="cigarette",
                    pose=cigarette, feux=True, sillage=True, fenetre=(CIG_G0, CIG_G1)))
    # -- le badaud de la pointe, chemise hawaïenne, téléphone levé, lampe allumée
    out.append(dict(nom="filmeur", quoi="filmeur", lieu="jetee", rayon=1.0, classe="passant",
                    pose=lambda g: (*FILMEUR_P, 0.0, filmeur_cap(g))))
    for c in out:
        c.setdefault("classe", None)
    return out


# ---------------------------------------------------------------- sans Blender : écarts et cadre

def present(c, g):
    """Le clin est-il là à l'image g (sa fenêtre, s'il en a une) ?"""
    a, b = c.get("fenetre") or (None, None)
    return (a is None or g >= a) and (b is None or g <= b)


ECART_VEHICULE = 3.4      # vie.ECART_VEHICULE : centre à centre avec la berline ou une patrouille
ECART_PASSANT = 1.75      # vie.ECART_PASSANT


def pistes():
    """{nom: (classe, pos(g) -> (x, y))} des clins qui ont un écart à tenir."""
    return {c["nom"]: (c["classe"], (lambda f: lambda g: f(g)[:2])(c["pose"])) for c in clins() if c["classe"]}


def ecarts():
    """{plan: (distance, image, clin, poursuivant)} au plus près, véhicules et passants à part (comme vie.ecarts)."""
    import vie
    pist = pistes()
    veh, pas = {}, {}
    for shot, g0, g1, tr in vie.poursuite():
        for g in range(g0, g1 + 1):
            ps = {k: f(g) for k, f in tr.items()}
            for nom, (classe, f) in pist.items():
                q = f(g)
                tab = veh if classe == "vehicule" else pas
                for k, p in ps.items():
                    d = math.dist(p, q)
                    if shot not in tab or d < tab[shot][0]:
                        tab[shot] = (d, g, nom, k)
    return veh, pas


def ecarts_vie():
    """Le plus petit écart (m, centres) entre un clin au sol et ce que pose la vie (véhicules, passants, mobilier),
    hors des voitures de la vie que les clins remplacent : (distance, image, clin, vie)."""
    import vie
    cs = clins()
    caches = {c["cache"][4:] for c in cs if c.get("cache")}
    remplacants = {c["nom"] for c in cs if c.get("cache")}      # à la place même d'une garée : ses écarts sont les siens
    vp = {k: f for k, f in vie.pistes().items() if k not in caches}
    best = (float("inf"), None, None, None)
    for nom, (classe, f) in pistes().items():
        if nom in remplacants:
            continue
        for g in range(0, G_FIN + 1, 4):
            q = f(g)
            for k, h in vp.items():
                d = math.dist(q, h(g))
                if d < best[0]:
                    best = (d, g, nom, k)
    return best


def camera(g):
    """La caméra du film à l'image g en ville : (x, y, z, lacet, site, roulis, focale) (ville.cam_plan / cam_city)."""
    import ville as V
    if g >= P.START["FIN6"]:
        # FIN6 : l'orbite autour de la berline arrêtée (fin6_orbite), dans son repère, posée en ville
        import fin6_orbite
        to_v, rot = P.vers_ville("FIN6")
        c = fin6_orbite.camera((g - P.START["FIN6"]) / FPS)
        return (*to_v(c[0], c[1]), c[2], c[3] + rot) + tuple(c[4:])
    f = min(max(g + 1, 1), P.TOTAL + P.FIN6_FRAMES)
    c = V.cam_plan(f)
    if c is not None:
        return c
    h = V.hero_city(f)
    return V.cam_city(f, P.sol_ville(*h[:2]))


def projete(cam, p):
    """(u, v, profondeur) du point p dans l'image 360 × 640 de la caméra cam (u vers la droite, v vers le bas, en
    pixels), None derrière elle (capteur de 36 mm sur la hauteur, comme ville._angle_cadre)."""
    x, y, z, yaw, pitch, _roll, lens = cam[:7]
    a, b = math.radians(yaw), math.radians(pitch)
    d = (-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
    nr = math.hypot(d[0], d[1])
    r = (d[1] / nr, -d[0] / nr, 0.0)                                  # la droite de l'image (d × z)
    u = (r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0])   # le haut (r × d)
    v = (p[0] - x, p[1] - y, p[2] - z)
    fwd = sum(i * j for i, j in zip(v, d))
    if fwd <= 0.1:
        return None
    k = lens / 36.0 * 640.0
    return (180.0 + k * sum(i * j for i, j in zip(v, r)) / fwd, 320.0 - k * sum(i * j for i, j in zip(v, u)) / fwd, fwd)


def vu(c, g):
    """(dans le cadre ?, taille apparente en pixels) du clin c à l'image g (son centre, son rayon)."""
    if not present(c, g):
        return False, 0.0
    x, y, z = c["pose"](g)[:3]
    zc = z + (c.get("hauteur", 0) / 2 + 0.5 if c["quoi"] == "panneau" else c["rayon"] * 0.5)
    q = projete(camera(g), (x, y, zc))
    if q is None:
        return False, 0.0
    u, v, dep = q
    px = 2 * c["rayon"] / dep * (camera(g)[6] / 36.0 * 640.0)
    m = px / 2
    return (-m < u < 360 + m and -m < v < 640 + m), px


def visibilite():
    """{nom: [(g0, g1, taille max en px)]} : les fenêtres où chaque clin est dans le cadre (centre et rayon ; les
    masques du décor ne sont pas comptés : les rendus gris le disent)."""
    out = {}
    for c in clins():
        spans, cur = [], None
        for g in range(0, G_FIN + 1):
            ok, px = vu(c, g)
            if ok and px >= 6.0:
                if cur is None:
                    cur = [g, g, px]
                cur[1], cur[2] = g, max(cur[2], px)
            elif cur is not None:
                spans.append(tuple(cur))
                cur = None
        if cur is not None:
            spans.append(tuple(cur))
        out[c["nom"]] = spans
    return out


# ---------------------------------------------------------------- dans Blender

def _log(msg):
    print(f"[clins] {msg}", flush=True)


def _lin(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def _assets():
    import render_film
    return os.path.realpath(render_film.assets_dir())


_SCENE = None


def _sources():
    import bpy
    c = bpy.data.collections.get("clins_sources")
    if c is None:
        c = bpy.data.collections.new("clins_sources")
        (_SCENE or bpy.context.scene).collection.children.link(c)
        c.hide_render = True
        c.hide_viewport = True
    return c


def _coll():
    import bpy
    c = bpy.data.collections.get("clins")
    if c is None:
        c = bpy.data.collections.new("clins")
        (_SCENE or bpy.context.scene).collection.children.link(c)
    return c


def _ranger(ob, coll):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)


def _import(rel):
    """Les objets d'un glb des assets (nouveaux objets)."""
    import bpy
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(_assets(), rel))
    return [o for o in bpy.data.objects if o not in before]


def _a_plat(objs, garder=None):
    """Les maillages des objets importés, déformations et transformations appliquées, à plat dans le monde ; le
    reste supprimé. garder(o) choisit les maillages."""
    import bpy
    from mathutils import Matrix
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    meshes = [o for o in objs if o.type == "MESH" and not o.name.startswith("Icosphere") and (garder is None or garder(o))]
    out = []
    for o in meshes:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        me.transform(o.matrix_world)
        n = bpy.data.objects.new(o.name + "_plat", me)
        bpy.context.scene.collection.objects.link(n)
        n.matrix_world = Matrix.Identity(4)
        out.append(n)
    for o in objs:
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except ReferenceError:
            pass
    return out


def _joindre(objs, nom):
    import bpy
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = nom
    return ob


def _boite(ob):
    from mathutils import Vector
    vs = [v.co for v in ob.data.vertices]
    return Vector(map(min, *vs)), Vector(map(max, *vs))


def _vers_y(ob, avant):
    """Tourne le maillage pour que son avant regarde +y. avant : '+x', '-x', '+y', '-y', 'debout' (un néon livré à
    plat : sa face vers +y, debout), 'auto:…' (trouvé sur le maillage)."""
    from mathutils import Matrix, Vector
    if avant == "debout":
        mn, mx = _boite(ob)
        size = mx - mn
        thin = min(range(3), key=lambda i: size[i])
        if thin == 2:
            ob.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
        elif thin == 0:
            ob.data.transform(Matrix.Rotation(math.pi / 2, 4, "Z"))
        mn, mx = _boite(ob)
        if (mx - mn).z < max((mx - mn).x, (mx - mn).y) * 0.4:
            ob.data.transform(Matrix.Rotation(math.pi / 2, 4, "Y"))
        return
    if avant.startswith("auto"):
        mn, mx = _boite(ob)
        size = mx - mn
        axe = 0 if size.x > size.y else 1
        c = (mn[axe] + mx[axe]) / 2
        L = size[axe]
        vs = [v.co for v in ob.data.vertices]
        kind = avant.split(":")[1]
        if kind == "helice":
            # l'hélice (la cage) est à l'arrière : le côté où le maillage monte le plus haut
            haut = [v for v in vs if v.z > mn.z + 0.7 * size.z]
            arr = sum(v[axe] for v in haut) / max(len(haut), 1) - c
            sign = -1 if arr > 0 else 1
        elif kind == "moteur":
            # le moteur hors-bord est à l'arrière : le côté où le maillage descend le plus bas
            bas = [v for v in vs if v.z < mn.z + 0.15 * size.z]
            arr = sum(v[axe] for v in bas) / max(len(bas), 1) - c
            sign = -1 if arr > 0 else 1
        else:
            # la queue s'effile : le bout le plus étroit est l'arrière (« tete » : la tête est l'autre bout)
            other = 1 - axe

            def large(lo, hi):
                xs = [v[other] for v in vs if lo <= v[axe] <= hi]
                return (max(xs) - min(xs)) if xs else 0.0
            a = large(mn[axe], mn[axe] + 0.12 * L)
            b = large(mx[axe] - 0.12 * L, mx[axe])
            sign = 1 if b > a else -1
            if kind == "tete":
                sign = -sign
        d = Vector((0, 0, 0))
        d[axe] = sign
    else:
        d = Vector({"+x": (1, 0, 0), "-x": (-1, 0, 0), "+y": (0, 1, 0), "-y": (0, -1, 0)}[avant])
    ang = math.atan2(-d.x, d.y)                       # l'angle qui envoie +y sur d ; on tourne de -ang
    ob.data.transform(Matrix.Rotation(-ang, 4, "Z"))


def _matieres(objs, emission):
    """Les matières d'un modèle importé : leur émission (les cartes d'émission livrées allument des vitres, des
    affiches, une peau) ramenée à `emission` fois la sienne, la force d'origine notée (`clins_emission`) ; la
    texture de couleur rendue active (ce que montre Workbench, les rendus gris)."""
    vues = set()
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if m is None or m in vues or not m.use_nodes:
                continue
            vues.add(m)
            bs = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bs is None:
                continue
            em = bs.inputs["Emission Strength"]
            m["clins_emission"] = em.default_value
            em.default_value *= emission
            bc = bs.inputs["Base Color"]
            if bc.is_linked and bc.links[0].from_node.type == "TEX_IMAGE":
                m.node_tree.nodes.active = bc.links[0].from_node


def source_modele(cle, cache):
    """Un modèle de bibliothèque en un maillage : avant vers +y, posé au sol en son centre, à sa taille."""
    from mathutils import Matrix, Vector
    if cle in cache:
        return cache[cle]
    spec = MODELES[cle]
    objs = _import(spec["f"])
    garder = None
    if spec.get("garder") == "gros":
        garder = (lambda o: len(o.data.polygons) > 30000)
    elif spec.get("sans"):
        garder = (lambda o: not any(k in o.name for k in spec["sans"]))     # la plaque d'immatriculation : ôtée
    _matieres(objs, spec.get("emission", 0.0))
    meshes = _a_plat(objs, garder)
    if not meshes:
        raise RuntimeError(f"rien dans {spec['f']}")
    ob = _joindre(meshes, f"clins_src_{cle}")
    _vers_y(ob, spec["avant"])
    mn, mx = _boite(ob)
    size = mx - mn
    k = spec["haut"] / size.z if "haut" in spec else spec["long"] / max(size.x, size.y)
    ob.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    ob.matrix_world = Matrix.Identity(4)
    _ranger(ob, _sources())
    cache[cle] = ob
    return ob


def _mat(nom, couleur, rough=0.5, metal=0.0, emit=None, force=0.0):
    import bpy
    m = bpy.data.materials.get(nom)
    if m is not None:
        return m
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    c = _lin(couleur)
    bs.inputs["Base Color"].default_value = (*c, 1.0)
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if emit:
        e = _lin(emit)
        bs.inputs["Emission Color"].default_value = (*e, 1.0)
        bs.inputs["Emission Strength"].default_value = force
    m.diffuse_color = (*(_lin(emit) if emit else c), 1.0)
    return m


def _neon(col):
    teinte, force = NEONS[col]
    return _mat(f"clins_neon_{col}", "#2a2a2a", 0.3, emit=teinte, force=force)


def _repeindre(ob, teintes, defaut=None):
    """Repeint les matières dont le nom contient une clé (couleur ou None : garde), ou toutes (defaut) ; la texture
    garde son grain (sa luminance multiplie la teinte), comme vie._repeint."""
    import bpy
    for i, m in enumerate(ob.data.materials):
        if m is None:
            continue
        col = defaut
        for k, v in (teintes or {}).items():
            if k in m.name:
                col = v
        if not col:
            continue
        m2 = m.copy()
        m2.name = f"{m.name}_clins_{col.lstrip('#')}"
        ob.data.materials[i] = m2
        nt = m2.node_tree
        bs = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bs is None:
            continue
        sock = bs.inputs["Base Color"]
        src = sock.links[0].from_socket if sock.is_linked else None
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = (*_lin(col), 1.0)
        if src is not None:
            bw = nt.nodes.new("ShaderNodeRGBToBW")
            gain = nt.nodes.new("ShaderNodeMath")
            gain.operation = "MULTIPLY"
            gain.use_clamp = True
            gain.inputs[1].default_value = 1.7
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            nt.links.new(src, bw.inputs["Color"])
            nt.links.new(bw.outputs["Val"], gain.inputs[0])
            nt.links.new(rgb.outputs[0], mix.inputs["A"])
            nt.links.new(gain.outputs[0], mix.inputs["B"])
            nt.links.new(mix.outputs["Result"], sock)
        else:
            nt.links.new(rgb.outputs[0], sock)
        m2.diffuse_color = (*_lin(col), 1.0)


def _instance(src, nom, parent, loc=(0, 0, 0), rot=(0, 0, 0), echelle=1.0, copie=False):
    import bpy
    ob = bpy.data.objects.new(nom, src.data.copy() if copie else src.data)
    _coll().objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = (echelle, echelle, echelle)
    return ob


def _groupe(nom, parent, pose):
    """Un vide en (x, y, z), tourné de cap : le repère d'un clin (son avant, sa face, vers +y)."""
    import bpy
    e = bpy.data.objects.new(f"clin_{nom}", None)
    _coll().objects.link(e)
    e.parent = parent
    x, y, z, cap = pose[:4]
    e.location = (x, y, z)
    e.rotation_euler = (0.0, 0.0, math.radians(cap))
    return e


# -- les lettres néon de la bibliothèque (A-neon-letters, la même source que les enseignes de la ville)

def lettres(cache):
    """{lettre: (maillage, largeur, hauteur)} : chaque lettre de A-neon-letters, face vers +y, posée en bas à gauche."""
    from mathutils import Matrix, Vector
    if "abc" in cache:
        return cache["abc"]
    objs = _a_plat(_import("A-neon-letters.glb"))
    import bpy
    back = [o for o in objs if len(o.data.polygons) < 50]
    for o in back:
        bpy.data.objects.remove(o, do_unlink=True)
    objs = [o for o in objs if o not in back]
    info = []
    for o in objs:
        mn, mx = _boite(o)
        info.append((mn.z, mn.x, o))
    info.sort(key=lambda t: -t[0])
    rows, cur = [], [info[0]]
    for t in info[1:]:
        if cur[-1][0] - t[0] > 0.1:
            rows.append(cur)
            cur = []
        cur.append(t)
    rows.append(cur)
    abc, seq = {}, iter("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    for row in rows:
        for _, _, o in sorted(row, key=lambda t: t[1]):
            ch = next(seq, None)
            if ch is None:
                bpy.data.objects.remove(o, do_unlink=True)
                continue
            # face avant vers -y dans la bibliothèque : on la tourne vers +y
            o.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
            mn, mx = _boite(o)
            o.data.transform(Matrix.Translation(-Vector((mn.x, (mn.y + mx.y) / 2, mn.z))))
            o.name = o.data.name = f"clins_lettre_{ch}"
            _ranger(o, _sources())
            mn, mx = _boite(o)
            abc[ch] = (o, mx.x - mn.x, mx.z - mn.z)
    cache["abc"] = abc
    return abc


def mot_neon(cache, mot, parent, haut, col, x0=None, z0=0.0, y=0.0, vertical=False, pas=1.25):
    """Pose un mot en lettres néon sous parent (repère : la face vers +y ; vu de face, le mot avance vers -x
    local, centré sur x0). Rend la largeur ou la hauteur posée."""
    abc = lettres(cache)
    sc = haut / abc["H"][2]
    mat = _neon(col)
    lettres_ = [ch for ch in mot.upper() if ch in abc or ch == " "]
    larg = [(abc[ch][1] * sc if ch != " " else 0.5 * haut) for ch in lettres_]
    gap = 0.14 * haut
    tot = sum(larg) + gap * (len(larg) - 1)
    if vertical:
        for i, ch in enumerate(lettres_):
            if ch == " ":
                continue
            ob = _instance(abc[ch][0], f"{parent.name}_{ch}{i}", parent, echelle=sc, copie=True)
            ob.data.materials.clear()
            ob.data.materials.append(mat)
            # centrée sur x = x0 (vu de face, la droite du spectateur est -x)
            ob.location = ((x0 or 0.0) - larg[i] / 2, y, z0 - (i + 1) * haut * pas)
            ob.rotation_euler = (0, 0, 0)
        return len(lettres_) * haut * pas
    cur = -(x0 if x0 is not None else tot / 2)
    for i, ch in enumerate(lettres_):
        if ch != " ":
            ob = _instance(abc[ch][0], f"{parent.name}_{ch}{i}", parent, echelle=sc, copie=True)
            ob.data.materials.clear()
            ob.data.materials.append(mat)
            # la lettre (de x 0 à sa largeur, à l'endroit vue de la face, dont la droite est -x local) : les
            # mots avancent vers -x
            ob.location = (-cur - larg[i], y, z0)
        cur += larg[i] + gap
    return tot


def _boite_mesh(nom, parent, x0, x1, y0, y1, z0, z1, mat):
    import bmesh
    import bpy
    me = bpy.data.meshes.new(nom)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([vs[i] for i in f])
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(nom, me)
    _coll().objects.link(ob)
    ob.parent = parent
    return ob


def poser_enseigne_toit(c, root, cache):
    """Un néon de toit : le mot en grandes lettres sur un cadre de cornières, le petit mot au-dessus, le flamant."""
    g = _groupe(c["nom"], root, c["pose"](0))
    fer = _mat("clins_fer", "#1d1c20", 0.55, 0.6)
    h = c["haut"]
    tot = mot_neon(cache, c["mot"], g, h, c["neon"], z0=1.6, y=0.15)
    # le cadre : deux lisses et des montants derrière les lettres
    w = tot / 2 + 0.6
    _boite_mesh(f"{g.name}_lisse_b", g, -w, w, -0.05, 0.05, 1.45, 1.55, fer)
    _boite_mesh(f"{g.name}_lisse_h", g, -w, w, -0.05, 0.05, 1.6 + h + 0.05, 1.6 + h + 0.15, fer)
    for k in range(int(tot // 2.5) + 2):
        x = -w + k * (2 * w) / (int(tot // 2.5) + 1)
        _boite_mesh(f"{g.name}_montant_{k}", g, x - 0.05, x + 0.05, -0.05, 0.05, 0.0, 1.6 + h + 0.15, fer)
    if c.get("petit"):
        mot_neon(cache, c["petit"], g, h * 0.45, c["petit_neon"], z0=1.6 + h + 0.35, y=0.15)
    if c.get("flamant"):
        src = source_modele("flamant_neon", cache)
        f = _instance(src, f"{g.name}_flamant", g, loc=(-(w + 1.2), 0.1, 0.2), echelle=1.0)
        f.data = src.data
        _neon_modele(f, "rose")
    return 1


def _neon_modele(ob, col):
    """Les tubes d'un néon de bibliothèque prennent la matière néon de la ville (le reste garde la sienne : socle,
    câbles) : les matières dont la base est vive ou déjà émissive."""
    mat = _neon(col)
    me = ob.data.copy()
    ob.data = me
    for i, m in enumerate(me.materials):
        if m is None or not m.use_nodes:
            continue
        bs = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bs is None:
            continue
        em = bs.inputs["Emission Strength"].default_value
        ec = bs.inputs["Emission Color"]
        lit = m.get("clins_emission", em) > 0 and (ec.is_linked or max(ec.default_value[:3]) > 0.05)
        if lit:
            me.materials[i] = mat


def poser_drapeau(c, root, cache):
    """Une enseigne en drapeau : un caisson émaillé perpendiculaire à la façade, les lettres néon empilées sur ses
    deux faces, le petit mot en tête, le palmier de néon au-dessus."""
    g = _groupe(c["nom"], root, c["pose"](0))
    email = _mat("clins_email", "#1f1d24", 0.35, 0.2)
    fer = _mat("clins_fer", "#1d1c20", 0.55, 0.6)
    h = c["haut"]
    pas = 1.22
    n = len(c["mot"])
    sail = c["saillie"]
    hp, pas_p = 0.55 * h, 1.15                    # le petit mot, en tête
    haut_tot = 0.2 + len(c["petit"]) * hp * pas_p + 0.25 + n * h * pas + 0.25
    # le caisson : x de 0,25 à 0,25 + saillie (vers la rue, -x local après le cap : on le met côté -x)
    xa, xb = -(0.25 + sail), -0.25
    _boite_mesh(f"{g.name}_caisson", g, xa, xb, -0.12, 0.12, 0.0, haut_tot, email)
    for zz in (0.3, haut_tot - 0.3):
        _boite_mesh(f"{g.name}_potence_{zz:.0f}", g, -0.25, 0.0, -0.03, 0.03, zz - 0.03, zz + 0.03, fer)
    xc = (xa + xb) / 2
    for face, rot in ((1, 0.0), (-1, math.pi)):
        sub = _groupe(f"{c['nom']}_face{face}", g, (0.0, 0.0, 0.0, math.degrees(rot)))
        xs = xc if face == 1 else -xc
        mot_neon(cache, c["petit"], sub, hp, c["petit_neon"], x0=xs, z0=haut_tot - 0.2 + hp * (pas_p - 1),
                 y=0.16, vertical=True, pas=pas_p)
        mot_neon(cache, c["mot"], sub, h, c["neon"], x0=xs,
                 z0=haut_tot - 0.2 - len(c["petit"]) * hp * pas_p - 0.25 + h * (pas - 1), y=0.16, vertical=True,
                 pas=pas)
    if c.get("palmier"):
        src = source_modele("palmier_neon", cache)
        p = _instance(src, f"{g.name}_palmier", g, loc=(xc, 0.0, haut_tot + 0.05))
        _neon_modele(p, "menthe")
    return 1


# -- les panneaux : la tête du modèle de bibliothèque (caisson, passerelle, consoles), son mât, notre affiche

def source_panneau(cache):
    """(tête, mât, cotes) du panneau de bibliothèque : la tête face vers +y, le bas de la face à z = 0, centrée en x ;
    le mât d'un mètre de haut, à allonger. cotes : largeur et hauteur de la face, y de la face, z du haut du mât."""
    from mathutils import Matrix, Vector
    if "panneau" in cache:
        return cache["panneau"]
    objs = _import("lieux/clins/billboard/model.glb")
    parents = {o.name: (o.parent.name if o.parent else "") for o in objs}
    _matieres(objs, 0.0)                         # l'affiche livrée (émissive) est sous la nôtre : éteinte
    meshes = _a_plat(objs)
    # les morceaux : Post (le mât), Billboard (la face), Platform (passerelle et consoles), Alpha (les grilles)
    by = {}
    for m in meshes:
        nom = parents.get(m.name[:-5], "")
        key = "post" if "Post" in nom else "board" if "Billboard" in nom else "platform" if "Platform" in nom else "alpha"
        by.setdefault(key, []).append(m)
    board = _joindre(by["board"], "clins_src_panneau_face_tmp")
    bmn, bmx = _boite(board)
    size = bmx - bmn
    thin = 0 if size.x < size.y else 1
    plat = _joindre(by["platform"], "clins_src_panneau_passerelle_tmp")
    pmn, pmx = _boite(plat)
    # la passerelle, l'échelle et la poutre du mât sont derrière l'affiche : la face est de l'autre côté
    front = -1 if (pmn[thin] + pmx[thin]) / 2 > (bmn[thin] + bmx[thin]) / 2 else 1
    # le repère : la face vers +y
    d = Vector((0, 0, 0))
    d[thin] = front
    ang = math.atan2(-d.x, d.y)
    R = Matrix.Rotation(-ang, 4, "Z")
    tete = _joindre([board, plat] + by.get("alpha", []), "clins_src_panneau_tete")
    tete.data.transform(R)
    post = _joindre(by["post"], "clins_src_panneau_mat")
    post.data.transform(R)
    tmn, tmx = _boite(tete)
    fmn, fmx = bmn, bmx
    # la face (seule) dans le nouveau repère
    corners = [R @ Vector((x, y, z)) for x in (fmn.x, fmx.x) for y in (fmn.y, fmx.y) for z in (fmn.z, fmx.z)]
    fx0, fx1 = min(v.x for v in corners), max(v.x for v in corners)
    fy1 = max(v.y for v in corners)
    fz0, fz1 = min(v.z for v in corners), max(v.z for v in corners)
    cx = (fx0 + fx1) / 2
    T = Matrix.Translation(Vector((-cx, 0.0, -fz0)))
    tete.data.transform(T)
    pmn2, pmx2 = _boite(post)
    pcx, pcy = (pmn2.x + pmx2.x) / 2, (pmn2.y + pmx2.y) / 2
    hp = pmx2.z - pmn2.z
    # le mât : de son pied à sa tête, ramené à 1 m, pied à l'origine ; sa place sous la face notée
    post.data.transform(Matrix.Scale(1.0 / hp, 4, Vector((0, 0, 1))) @ Matrix.Translation(Vector((-pcx, -pcy, -pmn2.z))))
    top_rel = pmx2.z - fz0                          # le haut du mât au-dessus du bas de la face (souvent > 0)
    for o in (tete, post):
        o.matrix_world = Matrix.Identity(4)
        _ranger(o, _sources())
    cotes = dict(larg=fx1 - fx0, haut=fz1 - fz0, yface=fy1, mat_x=pcx - cx, mat_y=pcy, mat_top=top_rel)
    cache["panneau"] = (tete, post, cotes)
    return cache["panneau"]


def _texte(nom, parent, corps, h, col, gras, largeur_max, loc):
    """Un texte peint (police de Blender) dans le plan de la face (face +y, lu par qui regarde vers -y)."""
    import bpy
    cu = bpy.data.curves.new(nom, "FONT")
    cu.body = corps
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.size = h
    cu.offset = 0.012 * h * (3.0 if gras else 1.0)
    cu.extrude = 0.004
    ob = bpy.data.objects.new(nom, cu)
    _coll().objects.link(ob)
    ob.parent = parent
    ob.rotation_euler = (math.pi / 2, 0.0, math.pi)
    ob.location = loc
    m = _mat(f"clins_encre_{col.lstrip('#')}", col, 0.55)
    cu.materials.append(m)
    bpy.context.view_layer.update()
    w = ob.dimensions.x
    if w > largeur_max:
        k = largeur_max / w
        cu.size = h * k
        cu.offset *= k
    return ob


def poser_panneau(c, root, cache):
    """Un panneau sur mât : la tête de bibliothèque à sa hauteur, le mât allongé jusqu'au sol (ou au toit), notre
    affiche sur la face, trois projecteurs sur les consoles, liés à la seule affiche."""
    import bpy
    tete, mat_src, k = source_panneau(cache)
    x, y, z, cap = c["pose"](0)[:4]
    g = _groupe(c["nom"], root, (x, y, z, cap))
    sx = c["largeur"] / k["larg"]
    sz = c["hauteur"] / k["haut"]
    t = _instance(tete, f"{g.name}_tete", g)
    t.scale = (sx, 1.0, sz)
    # le mât, du sol (ou du toit) au bas de la tête
    pied = c.get("sol", 0.0) - z
    haut_mat = k["mat_top"] * sz - pied
    m = _instance(mat_src, f"{g.name}_mat", g, loc=(k["mat_x"] * sx, k["mat_y"], pied))
    m.scale = (1.0, 1.0, max(haut_mat, 0.5))
    # l'affiche : un fond et ses lignes, juste devant la face
    fond, lignes, lis = PANNEAUX[c["texte"]]
    W, H = c["largeur"] * 0.96, c["hauteur"] * 0.92
    yf = k["yface"] + 0.03
    face = _boite_mesh(f"{g.name}_affiche", g, -W / 2, W / 2, yf - 0.01, yf, (c["hauteur"] - H) / 2,
                       (c["hauteur"] + H) / 2, _mat(f"clins_fond_{c['texte']}", fond, 0.6))
    _boite_mesh(f"{g.name}_liseré_b", g, -W / 2 + 0.15, W / 2 - 0.15, yf, yf + 0.004, (c["hauteur"] - H) / 2 + 0.12,
                (c["hauteur"] - H) / 2 + 0.2, _mat(f"clins_lis_{lis.lstrip('#')}", lis, 0.55))
    recus = [face]
    tot = sum(hh for _t, hh, _c, _g in lignes)
    marge = (1.0 - tot) / (len(lignes) + 1)
    zc = (c["hauteur"] + H) / 2
    for i, (txt, hh, col, gras) in enumerate(lignes):
        zc -= H * (marge + hh / 2)
        ob = _texte(f"{g.name}_l{i}", g, txt, H * hh * 0.82, col, gras, W * 0.9, (0.0, yf + 0.006, zc))
        recus.append(ob)
        zc -= H * hh / 2
    # les projecteurs : sous la face, sur les consoles, vers le haut de l'affiche, liés à l'affiche seule
    rc = bpy.data.collections.new(f"clins_{c['nom']}_recoit")
    for o in recus:
        rc.objects.link(o)
    for j, fx in enumerate((-W / 3, 0.0, W / 3)):
        ld = bpy.data.lights.new(f"{g.name}_projecteur_{j}", "SPOT")
        ld.energy = 140.0 * c["largeur"] / 10.0
        ld.color = _lin("#ffe3b8")
        ld.spot_size = math.radians(75)
        ld.spot_blend = 0.6
        ld.shadow_soft_size = 0.15
        lo = bpy.data.objects.new(f"{g.name}_projecteur_{j}", ld)
        _coll().objects.link(lo)
        lo.parent = g
        lo.location = (fx, yf + 1.3, -0.15)
        # vise le milieu de l'affiche, au-dessus et en arrière
        from mathutils import Vector
        d = Vector((fx * 0.6, yf, c["hauteur"] * 0.6)) - Vector(lo.location)
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        lo.light_linking.receiver_collection = rc
        lo.visible_camera = lo.visible_glossy = False
    return 1


# -- les modèles posés ou qui bougent

def _poser_cles(ob, images, g_of, pose, base_rot=0.0):
    for f in images:
        p = pose(g_of(f))
        x, y, z, cap = p[:4]
        tang, roul = (p[4], p[5]) if len(p) > 5 else (0.0, 0.0)
        ob.location = (x, y, z)
        ob.rotation_euler = (math.radians(tang), math.radians(roul), math.radians(cap + base_rot))
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_euler", frame=f)


def poser_modele(c, root, cache, images, g_of):
    src = source_modele(c["modele"], cache)
    ob = _instance(src, f"clin_{c['nom']}", root, echelle=c.get("echelle", 1.0))
    if c.get("teintes") or c.get("teinte"):
        ob.data = src.data.copy()
        _repeindre(ob, c.get("teintes"), c.get("teinte"))
    if c["quoi"] == "course":
        _poser_cles(ob, images, g_of, c["pose"])
    else:
        x, y, z, cap = c["pose"](0)[:4]
        ob.location = (x, y, z)
        ob.rotation_euler = (0.0, 0.0, math.radians(cap))
    return ob


def _fenetre(objs, images, g_of, c):
    """Cache les objets hors de la fenêtre du clin (clés constantes de hide_render)."""
    import motion as M
    for o in objs:
        for f in images:
            o.hide_render = o.hide_viewport = not present(c, g_of(f))
            o.keyframe_insert("hide_render", frame=f)
            o.keyframe_insert("hide_viewport", frame=f)
        for fc in M.fcurves(o):
            if fc.data_path in ("hide_render", "hide_viewport"):
                for kp in fc.keyframe_points:
                    kp.interpolation = "CONSTANT"


def poser_feux_bateau(c, ob):
    """Les feux de navigation : rouge à bâbord, vert à tribord, blanc en tête de mât (des petites sphères
    émissives, aucune lampe)."""
    import bpy
    import bmesh
    mn, mx = _boite(ob)
    out = []
    for nom, col, p in (("babord", "#ff2a14", (mn.x * 0.8, mx.y * 0.55, mx.z * 0.55)),
                        ("tribord", "#22ff66", (mx.x * 0.8, mx.y * 0.55, mx.z * 0.55)),
                        ("poupe", "#fff4dc", (0.0, mn.y * 0.95, mx.z * 0.95))):
        me = bpy.data.meshes.new(f"{ob.name}_feu_{nom}")
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.09)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(_mat(f"clins_feu_{nom}", "#111111", 0.3, emit=col, force=12.0))
        f = bpy.data.objects.new(me.name, me)
        _coll().objects.link(f)
        f.parent = ob
        f.location = p
        out.append(f)
    return out


def poser_sillage(c, ob, images, g_of):
    """Le sillage du bateau de course : une nappe d'écume en V derrière lui, posée sur l'eau, qui s'efface vers
    l'arrière (un maillage à attribut d'opacité ; rien de simulé)."""
    import bmesh
    import bpy
    mn, mx = _boite(ob)
    L, W = 26.0, 9.0
    me = bpy.data.meshes.new(f"{ob.name}_sillage")
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    n = 12
    rows = []
    for i in range(n + 1):
        t = i / n
        y = mn.y - t * L
        hw = 0.6 + t * W / 2
        rows.append([bm.verts.new((s * hw, y, 0.0)) for s in (-1, -0.35, 0.35, 1)])
    for i in range(n):
        for j in range(3):
            f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
            for lp, (a, b) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                lp[uv].uv = (b / 3.0, a / n)
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.get("clins_ecume")
    if m is None:
        m = bpy.data.materials.new("clins_ecume")
        m.use_nodes = True
        nt = m.node_tree
        bs = nt.nodes.get("Principled BSDF")
        bs.inputs["Base Color"].default_value = (*_lin("#c9ced6"), 1.0)
        bs.inputs["Roughness"].default_value = 0.6
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 9.0
        nt.links.new(tc.outputs["UV"], sep.inputs[0])
        nt.links.new(tc.outputs["UV"], nz.inputs["Vector"])
        # l'opacité : forte au bout du bateau, nulle au fond, plus dense sur les bords du V (les deux vagues)
        fade = nt.nodes.new("ShaderNodeMath")
        fade.operation = "SUBTRACT"
        fade.inputs[0].default_value = 1.0
        nt.links.new(sep.outputs["Y"], fade.inputs[1])
        edge = nt.nodes.new("ShaderNodeMath")
        edge.operation = "PINGPONG"
        edge.inputs[1].default_value = 0.5
        nt.links.new(sep.outputs["X"], edge.inputs[0])
        e2 = nt.nodes.new("ShaderNodeMath")
        e2.operation = "MULTIPLY_ADD"
        e2.inputs[1].default_value = -1.2
        e2.inputs[2].default_value = 0.85
        nt.links.new(edge.outputs[0], e2.inputs[0])
        a = nt.nodes.new("ShaderNodeMath")
        a.operation = "MULTIPLY"
        nt.links.new(fade.outputs[0], a.inputs[0])
        nt.links.new(e2.outputs[0], a.inputs[1])
        b = nt.nodes.new("ShaderNodeMath")
        b.operation = "MULTIPLY"
        b.use_clamp = True
        nt.links.new(a.outputs[0], b.inputs[0])
        nt.links.new(nz.outputs["Fac"], b.inputs[1])
        cc = nt.nodes.new("ShaderNodeMath")
        cc.operation = "MULTIPLY"
        cc.use_clamp = True
        cc.inputs[1].default_value = 1.6
        nt.links.new(b.outputs[0], cc.inputs[0])
        nt.links.new(cc.outputs[0], bs.inputs["Alpha"])
        m.diffuse_color = (*_lin("#c9ced6"), 0.6)
    me.materials.append(m)
    s = bpy.data.objects.new(me.name, me)
    _coll().objects.link(s)
    s.parent = ob.parent
    # posé sur l'eau, il suit le bateau sans tanguer
    for f in images:
        p = c["pose"](g_of(f))
        s.location = (p[0], p[1], WATER_Z + 0.03)
        s.rotation_euler = (0.0, 0.0, math.radians(p[3]))
        s.keyframe_insert("location", frame=f)
        s.keyframe_insert("rotation_euler", frame=f)
    s.visible_shadow = False
    return s


def source_filmeur(cache):
    """Le touriste en chemise hawaïenne (livré bras le long du corps) : son bras droit levé devant lui, téléphone au
    bout, tenu droit (le format vertical), la lampe de l'appareil allumée vers ce qu'il filme. Le bras est tourné
    autour de l'épaule (poids lissés près de l'aisselle) : à 30 m, c'est la silhouette qui compte."""
    from mathutils import Matrix, Vector
    if "filmeur" in cache:
        return cache["filmeur"]
    src = source_modele("touriste", cache)
    me = src.data.copy()
    me.name = "clins_src_filmeur"
    mn, mx = _boite(src)
    H = mx.z - mn.z
    # (modèle face +y) : son bras droit est du côté -x quand il regarde +y ? il regarde +y : sa droite est +x
    side = 1.0
    sh = Vector((side * 0.17 * H / 1.78, 0.0, 0.815 * H))        # l'épaule
    R = Matrix.Rotation(math.radians(-78.0), 3, "X")            # le bras tendu devant lui, à hauteur des yeux
    R = Matrix.Rotation(math.radians(side * 12.0), 3, "Y") @ R  # un peu ramené vers l'axe du corps
    hand = None
    for v in me.vertices:
        co = v.co
        if side * co.x < 0.115 * H / 1.78 or not (0.38 * H < co.z < 0.86 * H):
            continue
        dx = side * co.x - 0.115 * H / 1.78
        w = _lisse(dx / (0.07 * H / 1.78))
        q = sh + R @ (co - sh)
        v.co = co.lerp(q, w)
        if w > 0.99 and (hand is None or v.co.y > hand.y):
            hand = v.co.copy()
    me.update()
    ob = src.copy()
    ob.data = me
    ob.name = "clins_src_filmeur"
    _ranger(ob, _sources())
    cache["filmeur"] = (ob, hand or Vector((side * 0.2, 0.55, 1.45)))
    return cache["filmeur"]


def poser_filmeur(c, root, cache, images, g_of):
    import bpy
    src, hand = source_filmeur(cache)
    ob = _instance(src, f"clin_{c['nom']}", root)
    _repeindre(ob, {}, None)
    _poser_cles(ob, images, g_of, c["pose"])
    tel = source_modele("telephone", cache)
    t = _instance(tel, f"{ob.name}_telephone", ob, loc=(hand.x, hand.y + 0.03, hand.z + 0.02))
    t.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    # la lampe de l'appareil, côté de ce qu'il filme (l'avant, +y) : une pastille émissive, pas une lampe
    import bmesh
    me = bpy.data.meshes.new(f"{ob.name}_lampe")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.012)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(_mat("clins_lampe_tel", "#ffffff", 0.2, emit="#f4f6ff", force=40.0))
    lp = bpy.data.objects.new(me.name, me)
    _coll().objects.link(lp)
    lp.parent = ob
    lp.location = (hand.x + 0.02, hand.y + 0.06, hand.z + 0.09)
    # l'écran, vers lui : à peine lumineux
    me2 = bpy.data.meshes.new(f"{ob.name}_ecran")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bm.to_mesh(me2)
    bm.free()
    me2.materials.append(_mat("clins_ecran_tel", "#000000", 0.2, emit="#cfe3ff", force=3.0))
    sc = bpy.data.objects.new(me2.name, me2)
    _coll().objects.link(sc)
    sc.parent = ob
    sc.location = (hand.x, hand.y + 0.015, hand.z + 0.05)
    sc.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    sc.scale = (0.068, 0.14, 1.0)
    return ob


def poser(scene, plan=None, presents=None, base=None, g_of=None, images=None):
    """Pose les clins dans la scène (mêmes arguments que vie.poser). Rend un résumé."""
    import time

    import bpy
    from mathutils import Matrix
    if not active():
        _log(f"{ENV}=0 : pas de clins d'œil")
        return {}
    t0 = time.time()
    if images is None:
        images = list(range(scene.frame_start - 1, scene.frame_end + 2))
    if g_of is None:
        g_of = (lambda f: f - 1)
    global _SCENE
    _SCENE = scene
    if bpy.context.window is not None and bpy.context.window.scene != scene:
        bpy.context.window.scene = scene
    avant = set(bpy.data.objects)
    root = bpy.data.objects.new("clins_racine", None)
    _coll().objects.link(root)
    root.matrix_world = Matrix(base) if base is not None else Matrix.Identity(4)
    cache = {}
    n, rates = 0, []
    for c in clins():
        if presents is not None and c["lieu"] not in presents:
            continue
        try:
            q = c["quoi"]
            if q == "enseigne_toit":
                poser_enseigne_toit(c, root, cache)
            elif q == "drapeau":
                poser_drapeau(c, root, cache)
            elif q == "panneau":
                poser_panneau(c, root, cache)
            elif q == "filmeur":
                poser_filmeur(c, root, cache, images, g_of)
            else:
                ob = poser_modele(c, root, cache, images, g_of)
                objs = [ob] + (poser_feux_bateau(c, ob) if c.get("feux") else [])
                if c.get("sillage"):
                    objs.append(poser_sillage(c, ob, images, g_of))
                if c.get("fenetre"):
                    _fenetre(objs, images, g_of, c)
                if c.get("cache"):
                    v = bpy.data.objects.get(c["cache"])
                    if v is not None:
                        for o in [v] + list(v.children_recursive):
                            o.hide_render = o.hide_viewport = True
            n += 1
        except Exception as e:                       # un modèle manquant : signalé, le reste continue
            import traceback
            traceback.print_exc()
            rates.append(c["nom"])
            _log(f"! {c['nom']} : {e!r}")
    gardes = set(_coll().all_objects) | set(_sources().all_objects)
    for o in [o for o in bpy.data.objects if o not in avant and o not in gardes]:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in _coll().all_objects:
        o["clins"] = 1
    out = dict(clins=n, rates=rates, secondes=round(time.time() - t0, 1))
    _log(f"{plan or 'ville'} : {n} clins d'œil posés ({', '.join(sorted(presents)) if presents else 'tous les lieux'})"
         + (f", ratés : {', '.join(rates)}" if rates else "") + f" en {out['secondes']} s")
    return out


def poser_plan(scene, plan):
    """render_film --ville : les clins autour du tronçon `plan`, dans le repère de sa scène, en temps du film."""
    import ville as V
    from mathutils import Matrix
    own = V.lieu_of_shot(plan)[0]
    presents = {own} | {o.get("ville_lieu") for o in scene.objects if o.get("ville_lieu")}
    base = Matrix(V.matrice(V.lieu(own)["plan"])).inverted()
    fs = scene.frame_start
    g0 = P.START[plan]
    return poser(scene, plan=plan, presents=presents, base=[list(r) for r in base], g_of=lambda f: g0 + (f - fs))


# ---------------------------------------------------------------- sans Blender : l'inventaire

def main():
    print("les clins d'œil, quand ils sont dans le cadre (images du film ; * : un arrêt sur image) :")
    vis = visibilite()
    for c in clins():
        spans = vis[c["nom"]]
        txt = ", ".join(f"{a}–{b} ({px:.0f} px)" + ("*" if any(a <= gg <= b for gg in GELS) else "")
                        for a, b, px in spans) or "jamais"
        print(f"  {c['nom']:16} {c['lieu']:10} {txt}")
    veh, pas = ecarts()
    for shot in sorted(set(veh) | set(pas), key=lambda s: P.START[s]):
        line = f"  {shot:5}"
        if shot in veh:
            d, g, a, b = veh[shot]
            line += f" véhicules {d:5.1f} m ({a} / {b}, image {g})"
        if shot in pas:
            d, g, a, b = pas[shot]
            line += f" ; passants {d:5.1f} m ({a} / {b}, image {g})"
        print(line)
    print("  avec la vie : %.2f m au plus près (image %s, %s / %s)" % ecarts_vie())


if __name__ == "__main__":
    main()
