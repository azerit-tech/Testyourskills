# Les contacts de la poursuite (SPEC §18.68, 18 novembre 2026 : « ça serait top si des voitures de police pouvaient
# taper la nôtre de temps en temps pendant la course poursuite »). Une patrouille qui existe déjà dans le plan serre
# la berline et la tape. Rien n'est dessiné sur la berline : le choc est une impulsion appliquée à sa caisse au point
# d'impact (une force brève, son moment de lacet, ses moments directs de roulis et de tangage), passée à la
# simulation (dynamique.simulate(..., chocs=efforts)) ; l'embardée, la dérive, le roulis, le contre-braquage et la
# reprise de la ligne sont ce que ses pneus et son conducteur en font. La patrouille, elle, est dessinée : elle reçoit
# la réaction opposée (la même impulsion, changée de signe, sur sa masse), rebondit, prend le lacet de sa trajectoire,
# perd un peu de terrain et revient (patrouille(), posée sur sa trajectoire d'avant sans la réécrire).
#
# Un choc de deux caisses : la vitesse d'approche v au point de contact, le long de la normale n ; les masses m et les
# inerties de lacet I des deux voitures ; r le bras du point de contact autour de chaque centre. L'impulsion
#   J = (1 + e) v / (1/m1 + 1/m2 + (r1 × n)²/I1 + (r2 × n)²/I2)
# (e, la restitution : 0,1 à 0,3, de la tôle qui se froisse à peine). Un coup porté loin des centres (une aile) est
# plus mou qu'un coup de flanc : les caisses tournent au lieu de se repousser, J est plus petit pour la même vitesse.
# La quantité de mouvement est conservée par construction : +J sur la berline (la simulation), −J sur la patrouille
# (sa vitesse dessinée saute de J/m2 pendant le choc).
#
# Pas de poussette dans le pare-chocs arrière : le bras de la caméra est à 6 à 7,5 m derrière la berline, à 1,65 à
# 2,4 m de haut ; une patrouille au pare-chocs serait à la place de l'objectif. Les contacts sont de côté, par la
# patrouille 1, la seule qui vienne à la hauteur de la berline : sur l'avenue (portière contre portière) et sur le
# pont (son flanc arrière sur l'aile avant de la berline). Dans la rue et sur la jetée, la meute est à 12 à 25 m
# derrière : personne à portée.
#
# Python pur (3.10 et plus). Ce module ne lit pas parcours à l'import (parcours le lit pour sa simulation) : ce qui a
# besoin de la berline simulée (la patrouille, les mesures, les effets) l'importe en retard.
import math

import dynamique as D

FPS = 24.0
HERO = (0.90, 2.45)          # demi-largeur, demi-longueur de la berline (m : trafic.DIMS)
PATROL = (0.975, 2.5)        # celles d'une patrouille
M_PATROL = 1900.0            # kg : une grosse berline de police, équipée, deux agents
I_PATROL = 3900.0            # kg·m², lacet
H_CHOC = 0.55                # m : la hauteur du contact (la ceinture de caisse, les ailes)
ENFONCE = 0.04               # m : les boîtes l'une dans l'autre au plus fort du choc (la tôle qui plie)
SUITE = 0.15                 # s : le plus fort du choc se cherche jusque-là après la force (les caisses frottent)

# Les contacts du film. image : l'image du film (0 = la première) où les caisses se touchent, le milieu de
# l'impulsion ; plan, patrouille : la voiture (sa clé dans tracks()), module : celui qui l'écrit ; cote : +1 elle est à
# gauche de la berline, −1 à droite ; avance : son centre devant celui de la berline au contact (m, le long de la
# berline) ; plat : flanc contre flanc (sinon un coin d'abord) ; v : la vitesse d'approche le long de la normale
# (m/s) ; e : la restitution ; frot : la part de l'impulsion le long des caisses (positif, la berline est poussée en
# avant) ; duree : s, la durée de la force ; serre : s, le temps que la patrouille met à venir sur elle ; retour :
# m/s², l'accélération de côté (au plus fort) avec laquelle elle reprend sa ligne ; depart : m/s², celle avec laquelle
# elle décroche d'abord (sinon retour) ; vmax : m/s, sa vitesse de côté au plus pendant le retour (sinon libre) ;
# rejoint : (début, fin) en s après l'impulsion du fondu de la berline dans sa conduite d'avant (Conduite).
CHOCS = (
    # l'avenue. v11 (SPEC §18.74) : le critique du brouillon éclairé v10 ne lisait pas le choc de l'image 14 (« le
    # film s'ouvre patrouille déjà au contact, les deux voitures restent soudées de 13 à 25, la berline ne dévie
    # pas »). Il est à l'image 30 : la patrouille 1 arrive de derrière par la voie d'en face (p1_avenue), roule une
    # demi-seconde détachée, 1,5 m d'air, se rabat en une seconde et tape, portière avant contre portière arrière ;
    # la berline, qui roulait droit, part d'une demi-voie à droite (parcours.SLALOM_SIMULE), la patrouille décroche
    # à 6 m/s² (depart). v 2,1 : au-delà la glisse du choc passe 4° (4,8° à 2,6 m/s)
    dict(nom="avenue", image=30.0, plan="OUV", module="p1_avenue", patrouille="patrol", cote=+1, plat=True, avance=-1.25, v=2.1, e=0.3,
         frot=0.0, duree=0.08, serre=1.0, depart=6.0, retour=5.0, rejoint=(1.0, 2.5)),
    # le pont, dix images avant la quatrième étoile. v11 : la berline, écartée d'un mètre à gauche par B1 qui
    # déboîte (trafic.py), est à 0,9 m de la patrouille 1, qui garde sa voie et la remonte : la patrouille ferme
    # la porte en 1,25 s, son flanc arrière contre l'aile avant de la berline, la renvoie dans sa voie et décroche
    # (depart) avant de freiner pour le port à 6,4 m/s² (dès l'image 387) : il ne lui reste alors que 3,7 m/s² de
    # côté dans l'adhérence du mouillé, et le retour s'y tient (vmax, retour). frot : elle va plus vite que la
    # berline, sa tôle l'entraîne un peu (5 % de l'impulsion). avance 2,3 : sa place sur sa ligne à 0,25 m près
    # (à 2,0 elle freinait de 0,6 m/s² de plus que sa ligne pour s'y mettre ; à 2,5 le choc, porté plus loin du
    # centre de la berline, tombait sous 1500 N·s)
    dict(nom="pont", image=365.0, plan="P4", module="p4_pont", patrouille="patrol_0", cote=+1, plat=True, avance=2.3, v=2.4, e=0.3,
         frot=0.05, duree=0.08, serre=1.25, depart=3.5, vmax=1.6, retour=2.5, rejoint=(1.0, 2.4)),
)


def instant(c):
    return c["image"] / FPS


def point(c):
    """(px, qx) : le point de contact le long de la berline (m devant son centre) et le long de la patrouille (m
    devant le sien). c["plat"] : les deux flancs se plaquent l'un contre l'autre, la résultante au milieu de la
    longueur qu'ils ont en commun ; sinon un coin d'abord : l'aile avant de la patrouille, venue en biais, sur le
    flanc de la berline (ou, la patrouille devant, l'aile avant de la berline sur son flanc)."""
    av = c["avance"]
    if c.get("plat"):
        px = 0.5 * (max(-HERO[1], av - PATROL[1]) + min(HERO[1], av + PATROL[1]))
    else:
        px = min(av + PATROL[1], HERO[1])
    return px, px - av


def impulsion(c):
    """(Jx, Jy) en N·s sur la berline, dans son repère (vers l'avant, vers la gauche) : la normale est celle des
    flancs (la patrouille la pousse de côté), plus le frottement le long des caisses."""
    px, qx = point(c)
    ny = -c["cote"]                                   # la normale, de la patrouille vers la berline
    car = D.CAR
    # (r × n)² autour de chaque centre, n = (0, ny) : le carré du bras le long de la caisse
    k = 1.0 / car["m"] + 1.0 / M_PATROL + px * px / car["Iz"] + qx * qx / I_PATROL
    jn = (1.0 + c["e"]) * c["v"] / k
    return c.get("frot", 0.0) * jn, ny * jn


def norme(c):
    return math.hypot(*impulsion(c))


def _cloche(c, t):
    """La force du choc, normée (1/s, d'intégrale 1) : une arche de cosinus de c["duree"] s centrée sur l'image."""
    d = c["duree"]
    u = (t - instant(c)) / d
    if abs(u) >= 0.5:
        return 0.0
    return (1.0 + math.cos(2.0 * math.pi * u)) / d


def _part(c, t):
    """La part de l'impulsion déjà donnée à l'instant t (0 avant le choc, 1 après)."""
    u = (t - instant(c)) / c["duree"]
    if u <= -0.5:
        return 0.0
    if u >= 0.5:
        return 1.0
    return u + 0.5 + math.sin(2.0 * math.pi * u) / (2.0 * math.pi)


def efforts_de(chocs):
    """La fonction que lit dynamique.simulate (chocs=) pour une table de contacts : t -> None hors des chocs, sinon
    (Fx, Fy en N dans le repère de la caisse, Mz de lacet, moment direct de roulis, de tangage, en N·m)."""
    car = D.CAR
    bras_r = H_CHOC - (car["h"] - car["h_roll"])       # la hauteur du choc au-dessus de l'axe de roulis
    bras_t = H_CHOC - (car["h"] - car["h_pitch"])
    rows = [(instant(c) - 0.5 * c["duree"], instant(c) + 0.5 * c["duree"], c, impulsion(c),
             (point(c)[0], c["cote"] * HERO[0])) for c in chocs]

    def f(t):
        for t0, t1, c, (jx, jy), (px, py) in rows:
            if t0 < t < t1:
                w = _cloche(c, t)
                fx, fy = jx * w, jy * w
                # roulis positif : la droite descend ; une poussée vers la gauche au-dessus de l'axe couche la
                # caisse à gauche. Tangage positif : l'avant monte ; une poussée vers l'avant le fait plonger
                return fx, fy, px * fy - py * fx, -fy * bras_r, -fx * bras_t
        return None
    return f


def efforts(t):
    """Les contacts du film (CHOCS), pour dynamique.simulate."""
    return _EFFORTS(t)


_EFFORTS = efforts_de(CHOCS)


# ---------------------------------------------------------------- la conduite du film
REJOINT = (1.0, 2.2)      # s après l'impulsion : la berline, revenue sur sa ligne, rejoint sa conduite d'avant


class Conduite:
    """La conduite du film avec ses contacts. Hors des contacts c'est celle d'avant (`sans`), à l'image près : les
    dérapages, l'arrêt, les marges à la circulation ne bougent pas. Autour de chaque contact c'est la simulation qui
    le reçoit (une par contact : elle est celle d'avant jusqu'à l'impulsion) ; une fois la berline revenue sur sa
    ligne, elle est fondue dans la conduite d'avant (c["rejoint"], sinon REJOINT : début et fin du fondu, s après
    l'impulsion ; il reste alors entre les deux conduites une ou deux dizaines de centimètres, l'embardée coûte un
    peu de temps). `simuler(efforts)` rend une conduite (dynamique.simulate)."""
    TEMPS = ("pos", "heading", "travel", "slip", "steer", "speed", "along", "alat", "roll", "pitch", "yaw_rate",
             "throttle", "brake", "handbrake", "wheelspin", "s", "lat_err", "voie_err", "rear_slip", "slip_ref")
    ANGLES = ("heading", "travel", "slip", "steer", "slip_ref")

    def __init__(self, sans, simuler, chocs=None):
        self.sans, self.fen = sans, []
        for c in (CHOCS if chocs is None else chocs):
            a, b = c.get("rejoint", REJOINT)
            self.fen.append((instant(c) - c["duree"], instant(c) + a, instant(c) + b, simuler(efforts_de([c]))))

    def __getattr__(self, nom):
        if nom in ("sans", "fen"):
            raise AttributeError(nom)
        v = getattr(self.sans, nom)
        if nom not in self.TEMPS:
            return v
        angle = nom in self.ANGLES

        def f(t, *a, **kw):
            for t0, ta, tb, d in self.fen:
                if t0 < t < tb:
                    x = getattr(d, nom)(t, *a, **kw)
                    if t <= ta:
                        return x
                    y = v(t, *a, **kw)
                    u = (t - ta) / (tb - ta)
                    w = u * u * u * (10.0 + u * (6.0 * u - 15.0))
                    if isinstance(x, tuple):
                        return tuple(p + (q - p) * w for p, q in zip(x, y))
                    return x + ((((y - x + 180.0) % 360.0) - 180.0) if angle else (y - x)) * w
            return v(t, *a, **kw)
        return f


# ---------------------------------------------------------------- la patrouille (dessinée)
def _hermite(u, p0, v0, p1, v1):
    """Quintique d'Hermite sur u ∈ [0, 1], accélérations nulles aux deux bouts (v0, v1 : vitesses × durée)."""
    u2, u3 = u * u, u * u * u
    u4, u5 = u3 * u, u3 * u2
    return ((1 - 10 * u3 + 15 * u4 - 6 * u5) * p0 + (u - 6 * u3 + 8 * u4 - 3 * u5) * v0
            + (10 * u3 - 15 * u4 + 6 * u5) * p1 + (-4 * u3 + 7 * u4 - 3 * u5) * v1)


def _recul(c, t):
    """Le chemin qu'un saut de vitesse de 1 m/s, donné par la cloche du choc, a fait parcourir à l'instant t du
    film (m) : 0 avant le choc, la moitié de sa durée à sa fin, puis 1 m par seconde."""
    d = c["duree"]
    x = (t - instant(c)) / d
    if x <= -0.5:
        return 0.0
    if x >= 0.5:
        return d * x
    return d * (0.5 * x * x + 0.5 * x + 0.125 - (math.cos(2.0 * math.pi * x) + 1.0) / (4.0 * math.pi * math.pi))


def _boite(x, y, cap, dims):
    a = math.radians(cap)
    fx, fy = -math.sin(a), math.cos(a)
    lx, ly = -fy, fx
    w, l = dims
    return [(x + p * l * fx + q * w * lx, y + p * l * fy + q * w * ly) for p, q in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


def ecart(A, B):
    """L'écart de deux boîtes (coins) : positif, l'air entre elles (axes séparateurs) ; négatif, l'enfoncement."""
    best = -1e9
    for P in (A, B):
        for i in range(2):
            ex, ey = P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]
            n = math.hypot(ex, ey)
            ax, ay = -ey / n, ex / n
            pa = [q[0] * ax + q[1] * ay for q in A]
            pb = [q[0] * ax + q[1] * ay for q in B]
            best = max(best, min(pb) - max(pa), min(pa) - max(pb))
    return best


PATROUILLES = {}             # (plan, patrouille) -> sa Patrouille, posée par le module de son plan


def patrouille_de(c):
    """La Patrouille d'un contact (son module la crée à l'import)."""
    import importlib
    importlib.import_module(c["module"])
    return PATROUILLES[(c["plan"], c["patrouille"])]


class Patrouille:
    """La trajectoire d'une patrouille avec ses contacts : pos(t) (les coordonnées et le temps de son plan), posée
    sur sa trajectoire d'avant `base` sans la réécrire. Avant le choc elle serre la berline (une quintique, de sa
    ligne jusqu'à la tôle, à la vitesse d'approche du contact) ; pendant, sa vitesse de côté saute de J/m2 (la
    réaction de l'impulsion donnée à la berline) ; après, elle s'écarte sur son élan et reprend sa ligne. Le cap
    que les scènes lui donnent est celui de sa course : elle pointe vers la berline en serrant, s'en détourne au
    rebond. `plan` : le tronçon dont t est le temps (t = 0 à sa première image) ; `cles` : les (plan, patrouille)
    de CHOCS qui la désignent. `suit` : sa trajectoire d'avant est écrite depuis la place de la berline (le pont) :
    l'écart que le choc donne à la berline lui est retiré (elle ne suit pas la berline qu'elle vient de pousser),
    puis rendu pendant qu'elle reprend sa ligne."""

    def __init__(self, base, plan, cles, suit=False):
        self.brut, self.plan, self.cles, self.suit = base, plan, tuple(cles), suit
        self.rows = None
        for k in self.cles:
            PATROUILLES[k] = self

    def base(self, t):
        x, y = self.brut(t)
        if self.suit:
            for row in self.rows:
                if row["t1"] < t < row["tb"]:
                    u = max(0.0, (t - row["t2"]) / (row["tb"] - row["t2"]))
                    w = 1.0 - u * u * u * (10.0 - 15.0 * u + 6.0 * u * u)
                    (hx, hy, _), (bx, by) = self.hero(t), self.hero0(t)
                    x, y = x - w * (hx - bx), y - w * (hy - by)
        return x, y

    def _pret(self):
        if self.rows is not None:
            return
        import parcours as PC
        self.rows = []
        hero = PC.hero(self.plan)
        t0 = PC.START[self.plan] / FPS
        self.hero = lambda t: hero["pos"](1.0 + t * FPS) + (hero["heading"](1.0 + t * FPS),)
        if self.suit:
            to_scene, d0 = PC.placer(self.plan)[0], PC.sans_chocs()
            self.hero0 = lambda t: to_scene(*d0.pos(t + t0))
        for c in CHOCS:
            if (c["plan"], c["patrouille"]) not in self.cles:
                continue
            tc = instant(c) - t0
            d = c["duree"]
            t1 = tc - 0.5 * d
            # son saut de vitesse de côté : dessinée sans lacet (son cap est celui de sa route), elle prend celui
            # de son point de contact, là où les caisses se touchent (son centre : J/m ; le point, à qx de lui :
            # J/m + qx² J/I, son arrière ou son avant chassé par le choc). Sans lui les boîtes restent appuyées
            dv = abs(impulsion(c)[1]) * (1.0 / M_PATROL + point(c)[1] ** 2 / I_PATROL)
            row = dict(c=c, tc=tc, t1=t1, t2=tc + 0.5 * d, ta=t1 - c["serre"], tb=tc + 0.5 * d + 1.0, dv=dv,
                       t0=t0, a1=0.0, va=0.0, b=0.0)
            self.rows.append(row)
            # l'avance voulue au contact : ce qui manque à sa trajectoire d'avant, rendu doucement
            hx, hy, hc = self.hero(tc)
            a = math.radians(hc)
            px, py = self.base(tc)
            row["b"] = c["avance"] - ((px - hx) * -math.sin(a) + (py - hy) * math.cos(a))
            # la vitesse à laquelle elle doit venir de côté : celle du contact, moins ce que les deux voitures
            # font déjà l'une vers l'autre (la berline qui change de voie, la route de la patrouille)
            h = 1.0 / 48.0
            g0, g1 = self._cote(row, t1 - h), self._cote(row, t1)
            row["va"] = c["v"] - (g0 - g1) / h
            lo, hi = -1.0, g1 + 2.0
            for _ in range(40):
                row["a1"] = 0.5 * (lo + hi)
                self._retour(row)
                if min(self.ecart(t1 + k / 96.0) for k in range(int((d + SUITE) * 96.0) + 2)) > -ENFONCE:
                    lo = row["a1"]
                else:
                    hi = row["a1"]
            row["point"] = self._point(row)

    @staticmethod
    def _retour(row):
        """Le retour à sa ligne : de l'écart et de la vitesse de côté que le choc lui laisse (x0, v2), à
        accélération bornée : sa vitesse passe de v2 à −vm (elle décroche : c["depart"] m/s² au plus fort, sinon
        c["retour"]), tient −vm si c["vmax"] la plafonne, puis revient de −vm à 0 (c["retour"]), en demi-cosinus.
        Fixe tb, la fin du retour."""
        c = row["c"]
        a2 = c["retour"]
        a1 = c.get("depart", a2)
        x0 = row["a1"] + row["va"] * c["duree"] - row["dv"] * 0.5 * c["duree"]
        v2 = row["va"] - row["dv"]
        vm = math.sqrt(max((4.0 * max(x0, 0.0) / math.pi + v2 * v2 / a1) / (1.0 / a1 + 1.0 / a2),
                           (abs(v2) + 0.05) ** 2))
        vm = min(vm, c.get("vmax", vm))
        T1, T2 = (v2 + vm) * math.pi / (2.0 * a1), vm * math.pi / (2.0 * a2)
        # (vm relevé au-dessus de |v2| : l'écart ne s'annule plus exactement ; x1 le dit, la fin le rattrape)
        x1 = x0 + v2 * T1 - 0.5 * (v2 + vm) * T1
        Tc = max(0.0, (x1 - 0.5 * vm * T2) / vm)                   # (le palier, à −vm)
        row.update(x0=x0, v2=v2, vm=vm, T1=T1, T2=T2, Tc=Tc, x1=x1, reste=x1 - vm * Tc - 0.5 * vm * T2,
                   tb=row["t2"] + T1 + Tc + T2)

    def _axes(self, t):
        h = 1.0 / 96.0
        (x0, y0), (x1, y1) = self.base(t - h), self.base(t + h)
        n = math.hypot(x1 - x0, y1 - y0) or 1.0
        return (x1 - x0) / n, (y1 - y0) / n

    def _cote(self, row, t):
        """La distance de côté de la berline à la patrouille d'avant (m, le long de la gauche de la patrouille)."""
        tx, ty = self._axes(t)
        (px, py), (hx, hy, _) = self.base(t), self.hero(t)
        return row["c"]["cote"] * ((px - hx) * -ty + (py - hy) * tx)

    @staticmethod
    def _lat(row, t):
        """Son écart vers la berline (m) à l'instant t."""
        c = row["c"]
        if t <= row["ta"] or t >= row["tb"]:
            return 0.0
        if t < row["t1"]:
            T = row["t1"] - row["ta"]
            return _hermite((t - row["ta"]) / T, 0.0, 0.0, row["a1"], row["va"] * T)
        if t <= row["t2"]:
            return row["a1"] + row["va"] * (t - row["t1"]) - row["dv"] * _recul(c, t + row["t0"])
        u = t - row["t2"]
        T1, T2, Tc, v2, vm = row["T1"], row["T2"], row["Tc"], row["v2"], row["vm"]
        if u <= T1:
            x = row["x0"] + v2 * u - 0.5 * (v2 + vm) * (u - T1 / math.pi * math.sin(math.pi * u / T1))
        elif u <= T1 + Tc:
            x = row["x1"] - vm * (u - T1)
        else:
            w = u - T1 - Tc
            x = row["x1"] - vm * Tc - 0.5 * vm * (w + T2 / math.pi * math.sin(math.pi * w / T2))
        return x - row["reste"] * (u / (T1 + Tc + T2)) ** 3

    @staticmethod
    def _lon(row, t):
        if t <= row["ta"] or t >= row["tb"]:
            return 0.0
        if t < row["tc"]:
            return row["b"] * _hermite((t - row["ta"]) / (row["tc"] - row["ta"]), 0.0, 0.0, 1.0, 0.0)
        return row["b"] * _hermite((t - row["tc"]) / (row["tb"] - row["tc"]), 1.0, 0.0, 0.0, 0.0)

    def __call__(self, t):
        self._pret()
        x, y = self.base(t)
        for row in self.rows:
            if row["ta"] < t < row["tb"]:
                tx, ty = self._axes(t)
                o, l = -row["c"]["cote"] * self._lat(row, t), self._lon(row, t)
                x, y = x + o * -ty + l * tx, y + o * tx + l * ty
        return x, y

    def cap(self, t):
        h = 1.0 / 96.0
        (x0, y0), (x1, y1) = self(t - h), self(t + h)
        return math.degrees(math.atan2(-(x1 - x0), y1 - y0))

    def choc(self, t):
        """Le déplacement que les impulsions seules lui ont donné (x, y) : motion.sample le retire avant de lire
        l'accélération qui couche la caisse (une poussée à la hauteur du centre de gravité ne la couche pas ; c'est
        la réaction de ses pneus, après, qui le fait)."""
        self._pret()
        x = y = 0.0
        for row in self.rows:
            if t > row["t1"]:
                tx, ty = self._axes(row["tc"])
                o = row["c"]["cote"] * row["dv"] * _recul(row["c"], t + row["t0"])
                x, y = x + o * -ty, y + o * tx
        return x, y

    def touche(self, c, pas=4):
        """(première, dernière image du film) où les deux boîtes se touchent autour du contact c (au quart
        d'image), ou None."""
        self._pret()
        row = next(r for r in self.rows if r["c"] is c)
        gs = [c["image"] + k / pas for k in range(-3 * pas, 16 * pas + 1)]
        on = [g for g in gs if self.ecart(g / FPS - row["t0"]) <= 0.0]
        return (on[0], on[-1]) if on else None

    def boites(self, t):
        """(les coins de la berline, ceux de la patrouille) à l'instant t."""
        self._pret()
        hx, hy, hc = self.hero(t)
        return _boite(hx, hy, hc, HERO), _boite(*self(t), self.cap(t), PATROL)

    def ecart(self, t):
        return ecart(*self.boites(t))

    def _point(self, row):
        """Le point de contact dans le repère de la berline (m devant son centre, à sa gauche) : le coin de la
        patrouille le plus enfoncé dans son flanc ; sinon (la patrouille dépasse devant ou derrière) le coin de la
        berline qui touche le flanc de la patrouille."""
        c, t = row["c"], row["tc"]
        _, B = self.boites(t)
        hx, hy, hc = self.hero(t)
        a = math.radians(hc)
        fx, fy = -math.sin(a), math.cos(a)
        y = c["cote"] * HERO[0]
        loc = [((q[0] - hx) * fx + (q[1] - hy) * fy, (q[0] - hx) * -fy + (q[1] - hy) * fx) for q in B]
        near = [q for q in loc if abs(q[0]) <= HERO[1] and c["cote"] * q[1] < HERO[0] + 0.03]
        if near:
            return min(near, key=lambda q: c["cote"] * q[1])[0], y
        return (HERO[1] if max(q[0] for q in loc) > HERO[1] else -HERO[1]), y

    def point(self, c):
        self._pret()
        return next(r["point"] for r in self.rows if r["c"] is c)


def contacts_de(plan):
    """Les contacts de CHOCS qui se jouent dans un plan : [(contact, image du plan (1 = la première))]."""
    import parcours as PC
    return [(c, c["image"] - PC.START[plan] + 1.0) for c in CHOCS if c["plan"] == plan]


def images_choc(plan, avant=2, apres=3):
    """Les images du plan (1 = la première) autour de ses chocs : de `avant` images avant l'impulsion à `apres`
    après. Ce que les contrôles de conduite (accélération, à-coup, lacet) et de caméra laissent de côté : un choc
    n'est pas une manœuvre."""
    out = set()
    for c, f in contacts_de(plan):
        out.update(range(int(math.floor(f)) - avant, int(math.ceil(f)) + apres + 1))
    return out


def images_manoeuvre(plan):
    """Les images du plan (1 = la première) où la patrouille d'un de ses contacts a quitté sa ligne : du début de
    son rabattement à la fin de son retour. Ce que les contrôles d'écart entre caisses laissent de côté, pour cette
    patrouille et la berline seulement (paire)."""
    import parcours as PC
    out = set()
    for c, f in contacts_de(plan):
        pat = patrouille_de(c)
        pat._pret()
        for row in pat.rows:
            if row["c"] is c:
                d = (PC.START[pat.plan] - PC.START[plan])       # (la patrouille de l'ouverture est écrite dans P1)
                out.update(range(int(math.floor(row["ta"] * FPS + 1 + d)), int(math.ceil(row["tb"] * FPS + 1 + d)) + 1))
    return out


def paire(plan):
    """Les clés (tracks()) des deux voitures des contacts du plan : la berline et la patrouille."""
    out = set()
    for c, _ in contacts_de(plan):
        out.update(("hero", c["patrouille"]))
    return out


def choc_berline(plan):
    """t (s du plan) -> le déplacement (x, y, scène du plan) que les impulsions seules ont donné à la berline :
    motion.sample le retire avant de lire l'accélération qui couche la caisse (voir Patrouille.choc)."""
    etat = {}

    def dep(t):
        if not etat:
            import parcours as PC
            hero, t0 = PC.hero(plan), PC.START[plan] / FPS
            etat["t0"], etat["rows"] = t0, []
            for c, f in contacts_de(plan):
                a = math.radians(hero["heading"](f - 0.5 * c["duree"] * FPS))
                jx, jy = impulsion(c)
                m = D.CAR["m"]
                # (vers l'avant, vers la gauche) de la caisse -> la scène : l'avant (−sin, cos), la gauche (−cos, −sin)
                etat["rows"].append((c, (-math.sin(a) * jx - math.cos(a) * jy) / m,
                                     (math.cos(a) * jx - math.sin(a) * jy) / m))
        x = y = 0.0
        for c, vx, vy in etat["rows"]:
            k = _recul(c, t + etat["t0"])
            x, y = x + vx * k, y + vy * k
        return x, y
    return dep


# ---------------------------------------------------------------- la gerbe (fx : la famille « choc »)
GERBE = dict(n=150, par_image=45, images=7.0, vie=(0.10, 0.38), taille=(0.004, 0.008))


def gerbe(c, track, wheel_r, point, touche, seed=41):
    """Les étincelles d'un contact : [fx.Particle]. Tôle contre tôle, au point de contact (`point` : m devant le
    centre de la berline, à sa gauche), à la hauteur des ailes ; une gerbe courte à l'impact (GERBE["n"] points en
    deux images), puis quelques-unes tant que les caisses frottent (`touche` : première et dernière image du plan,
    GERBE["images"] au plus). Lancées à la vitesse des voitures, moins ce que le frottement leur prend ; elles
    partent en arrière dans le repère des caisses, s'écartent peu, retombent, s'éteignent en 0,1 à 0,4 s."""
    import random

    import fx
    rng = random.Random(seed + int(c["image"]))
    f0, f1 = touche
    f1 = min(f1, f0 + GERBE["images"])
    births = [f0 + 2.0 * rng.random() ** 1.6 for _ in range(GERBE["n"])]
    births += [f0 + 2.0 + (f1 - f0 - 2.0) * rng.random() for _ in range(int(GERBE["par_image"] * max(0.0, f1 - f0 - 2.0)))]
    out = []
    for f in births:
        pos, fwd, vel, wh, wv, slip, speed = fx.pose_at(track, f)
        left = (-fwd[1], fwd[0], 0.0)
        ground = min(q[2] for q in wh.values()) - wheel_r
        u = point[0] + rng.uniform(-0.45, 0.45)
        p = (pos[0] + fwd[0] * u + left[0] * point[1], pos[1] + fwd[1] * u + left[1] * point[1],
             ground + H_CHOC + rng.uniform(-0.14, 0.10))
        carry = rng.uniform(0.55, 0.96)
        lat = rng.uniform(-1.0, 1.0)
        v = (vel[0] * carry + left[0] * lat, vel[1] * carry + left[1] * lat, rng.uniform(-1.6, 2.2))
        life = rng.uniform(*GERBE["vie"])
        drag = rng.uniform(0.8, 1.6)
        sz = rng.uniform(*GERBE["taille"])
        tl = fx.land_time(p, v, drag, ground, life)
        out.append(fx.Particle(f, p, v, min(life, tl), drag, 1.0, sz, sz * 0.6, 1.0, rng.random()))
        if tl < life - 0.05:                       # un rebond sur la chaussée, moins vif
            q, w = fx.ballistic(p, v, tl, drag), fx.ballistic_vel(v, tl, drag)
            out.append(fx.Particle(f + tl * FPS, (q[0], q[1], ground + 0.005), (w[0] * 0.6, w[1] * 0.6, abs(w[2]) * 0.3 + 0.2),
                                   life - tl, drag, 1.0, sz * 0.8, sz * 0.5, 0.7, rng.random()))
    return out


def habiller(ctx):
    """fx.dress (famille « choc ») : la gerbe de chaque contact du plan, posée dans la collection des effets (un
    objet fx_choc_<nom> : ville.fx_voisin l'écarte des lieux voisins, fx.beam_links des projecteurs)."""
    import fx
    import parcours as PC
    obs = []
    for c, f in contacts_de(ctx.plan):
        pat = patrouille_de(c)
        t = pat.touche(c)
        if t is None:
            continue
        d = 1.0 - PC.START[ctx.plan]
        parts = gerbe(c, ctx.track, ctx.wheel_r, pat.point(c), (t[0] + d, t[1] + d))
        ob = fx.emit(ctx, f"fx_choc_{c['nom']}", parts, "drops", fx.mat_spark(), glossy=True)
        if ob:
            ob.visible_transmission = True
            obs.append(ob)
        fx.log(f"choc « {c['nom']} » : {len(parts)} étincelles, images {t[0] + d:.1f} à {t[1] + d:.1f} du plan")
    return obs


# ---------------------------------------------------------------- la caméra
SECOUSSE = dict(dz=0.045, lacet=0.22, site=0.16, roulis=0.6, hz=7.5, tau=0.085)
SECOUSSE_S = 0.33           # s : au-delà, plus rien (8 images ; les contrôles de la caméra laissent ces images de côté)


def secousse(t):
    """L'à-coup du bras de la caméra à un contact, à l'instant t du film : (dz en m, dlacet, dsite, droulis en °).
    Une oscillation amortie (SECOUSSE : quelques centimètres, éteinte en SECOUSSE_S), nulle avant le choc."""
    dz = dyaw = dpitch = droll = 0.0
    for c in CHOCS:
        u = t - instant(c) + 0.25 * c["duree"]
        if 0.0 < u < SECOUSSE_S:
            k = math.exp(-u / SECOUSSE["tau"]) * math.sin(2.0 * math.pi * SECOUSSE["hz"] * u) * norme(c) / 2000.0
            k *= min(1.0, u / 0.02) * min(1.0, (SECOUSSE_S - u) / 0.08)
            dz += SECOUSSE["dz"] * k
            dyaw += -c["cote"] * SECOUSSE["lacet"] * k
            dpitch += -SECOUSSE["site"] * k
            droll += -c["cote"] * SECOUSSE["roulis"] * k
    return dz, dyaw, dpitch, droll
