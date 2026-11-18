# La conduite simulée de la berline (SPEC §18.61, 18 novembre 2026 : « les dérapages ne sont pas naturels encore, y a
# pas une façon sûre de le faire ? »). La façon sûre est la physique : plus aucune courbe de lacet, de glisse ou de
# roulis dessinée à la main. Une voiture simulée (modèle bicyclette, pneus de Pacejka, transferts de charge, ellipse
# d'adhérence, roues arrière motrices, caisse sur ses ressorts) et un conducteur simulé (volant, gaz, frein, frein à
# main) qui suit la route et l'horaire du parcours.
#
# Aux deux dérapages, le conducteur fait le geste d'un pilote, et la voiture en fait ce qu'elle peut :
#  - il arrive un peu sous l'horaire (il a freiné plus tôt), garde un filet de frein (le freinage traîné : l'avant
#    chargé mord) et bloque l'arrière d'un coup de frein à main : la berline pivote sur son avant ;
#  - le volant suit : les roues avant visent la vitesse de leur essieu, il contre-braque dès que l'arrière passe ;
#  - près de la crête il relâche le frein (l'arrière qui roule de nouveau arrête la rotation) et reprend les gaz :
#    le patinage des roues arrière tient la glisse, le volant tient le lacet ;
#  - il rend la main : la glisse revient, il relance une fois la voiture posée.
# Ses mains et ses pieds ne sont pas écrits : il poursuit une glisse visée (Geste : une consigne faisable, des
# trapèzes de vitesse de glisse) par la répartition d'efforts du contrôle de dérive de Goh et Gerdes (Stanford,
# 2016-2020, _repartit) : le couple de lacet d'abord, la force centripète ensuite, la vitesse s'il en reste. Le
# contre-braquage, la montée de la glisse, le lacet, le patinage, la trajectoire du centre, le roulis et le tangage
# sortent de la simulation.
#
# La route et l'horaire sont des ENTRÉES (simulate(plan, …)) : rien n'est écrit en dur ici. Une route qui slalome
# entre des voitures (branche film/trafic) se suit de la même façon, avec la glisse et le roulis que ses changements
# de voie demandent (lab/dynamique/voie.py : 3,5 m à 90 km/h).
#
# Python pur (3.10 et plus), déterministe : intégration semi-implicite d'Euler à SUB × 240 Hz, le conducteur à 240 Hz,
# la table rendue à 240 Hz (échantillonnée à 24 images/s par les scènes).
#
# Conventions (celles de motion.py) : x, y au sol ; cap ψ en degrés, 0 = +y, positif à gauche ; avant de la caisse
# (−sin ψ, cos ψ), sa gauche (−cos ψ, −sin ψ). Dans la caisse : u vers l'avant, v vers la gauche, r le lacet (positif à
# gauche). La glisse (motion.Drive.slip) = cap de la caisse − cap de la vitesse : positive, l'avant pointe à gauche
# de sa route (un dérapage à gauche). Roulis positif : la droite descend (à gauche dans le virage, la caisse penche à
# droite) ; tangage positif : l'avant monte.
import math

import motion as M

G = 9.81

# ---- la berline : une Mercedes W111 (280 SE 3.5, 1969-1971) sur route mouillée
CAR = dict(
    m=1550.0,               # kg, en ordre de marche, conducteur compris
    Iz=2650.0,              # kg·m², lacet (≈ m × 1,31², une berline de 4,9 m)
    a=1.33, b=1.42,         # m, du centre de gravité aux essieux avant et arrière (empattement 2,75 m, 52/48)
    h=0.56,                 # m, hauteur du centre de gravité
    track=1.48,             # m, voie
    R=0.335,                # m, rayon sous charge (7.35-14)
    Iw=2.4,                 # kg·m², l'essieu arrière : deux roues, freins, arbres et la transmission ramenée
    # le pneu, Formule magique de Pacejka (latéral et longitudinal, glissement combiné isotrope), sur le mouillé
    mu=0.70,                # adhérence de crête à la charge nominale
    B=10.0, C=1.6, E=0.2,   # crête à 9°, 80 % de la crête à 35° de dérive (la gomme mouillée qui glisse)
    kx=1.6,                 # raideur longitudinale / raideur de dérive (crête en glissement à κ ≈ 0,1)
    load_sens=0.10,         # l'adhérence baisse de 10 % quand la charge d'une roue double
    # le moteur (V8 3,5 l, 200 ch) et les freins
    P=130e3,                # W aux roues
    F_max=8000.0,           # N aux roues en première
    brake_max=17000.0,      # N au total (plus que l'adhérence : le conducteur dose)
    bias=0.65,              # part de l'avant au freinage
    CdA=0.95, rho=1.2, Crr=0.013,
    # la caisse sur ses ressorts : masse suspendue, bras de roulis et de tangage (raideurs, inerties et amortisseurs :
    # _caisse, depuis le réglage de la caisse rendue, motion.CHASSIS["hero"])
    ms=1350.0, h_roll=0.42, h_pitch=0.50, roll_front=0.62,
    # le volant et les pédales (les mains et les pieds du conducteur)
    steer_max=40.0,         # ° aux roues
    steer_rate=95.0,        # °/s aux roues (un contre-braquage vif : 1 600 °/s au volant, rapport 17)
    steer_tau=0.04,         # s, la direction assistée
    pedal_rate=4.0,         # course de pédale par seconde (gaz à fond en 0,25 s)
    hb_max=2600.0,          # N·m à l'essieu arrière : le frein à main (hydraulique, de cascade), de quoi le bloquer
    hb_rate=8.0,            # course du levier par seconde
)



def _caisse(c, ch):
    """Les ressorts de la simulation tirés du réglage de la caisse rendue (motion.CHASSIS : degrés par g, fréquence,
    amortissement) : la caisse simulée, qui fait les transferts de charge, et celle que motion.rebody refait sur la
    trajectoire sont la même (même gain statique, même fréquence propre, même amortissement)."""
    out = {}
    for ax, hk, deg, hz, z in (("roll", "h_roll", "roll_per_g", "roll_hz", "roll_zeta"),
                               ("pitch", "h_pitch", "pitch_per_g", "pitch_hz", "pitch_zeta")):
        k = math.radians(ch[deg]) / G                 # rad par m/s²
        w = 2.0 * math.pi * ch[hz]
        K_eff = c["ms"] * c[hk] / k                   # N·m/rad : la raideur nette (le poids qui penche, déduit)
        I = K_eff / (w * w)
        C = 2.0 * ch[z] * w * I
        if ax == "roll":
            out.update(K_roll=K_eff + c["ms"] * G * c[hk], Ix=I, C_roll=C)
        else:
            out.update(K_pitch=K_eff, Iy=I, C_pitch=C)
    return out


CAR.update(_caisse(CAR, M.CHASSIS["hero"]))

# ---- le conducteur
DRIVER = dict(
    wn=2.4, zeta=0.95,      # la boucle de trajectoire (écart latéral, cap de la vitesse)
    k_r=9.0,                # 1/s, la boucle de lacet
    preview=0.14,           # s : il lit la courbure un peu devant (la direction et les pneus ont du retard)
    k_v=1.6, k_s=1.1, k_i=0.25,   # la vitesse : écart de vitesse (1/s), d'abscisse (1/s²), intégrale (1/s³)
    tau_r=0.06,             # s : le lacet voulu, filtré (les mains)
    fb_max=25.0,            # °/s : hors glisse, la correction de trajectoire bornée (il revient sans brusquer)
    a_rappel=3.0,           # m/s² : la latérale qu'il se garde pour arrêter son retour vers la route
    alat_max=7.5,           # m/s² : le lacet qu'il demande au plus sur ses quatre roues, en latérale (le mouillé en
                            # tient 6,5 ; le lacet d'un changement de voie dépasse un instant celui de sa trajectoire)
    tc_kap=0.05, tc_alpha=5.0,   # le patinage et la dérive arrière qu'il tolère hors glisse
    v_avance=3.0, a_droit=3.0,   # m/s, m/s² : l'avance de vitesse qu'il se permet pour rattraper l'horaire, en ligne
                            # droite seulement (nulle dès que le plan vire à a_droit m/s² de latérale)
    es_max=1.5,             # m : le retard sur l'horaire qu'il cherche à rattraper d'un coup (au-delà, il patiente)
    grip=0.93,              # la part de l'adhérence des roues arrière qu'il ose demander en relançant dans un virage
    # le dérapage (_repartit)
    k_g=25.0,               # 1/s² : le rappel sur l'écart de glisse (avec k_r : 5 rad/s, amorti à 0,9)
    W=(60.0, 1.0, 0.05, 1.2e5), # les poids : lacet, force centripète, vitesse, et la douceur du pied (N² par unité)
    kap_max=0.7,            # le patinage au plus (les roues arrière à 1,7 fois la vitesse du sol)
    k_w=25.0,               # 1/s : le pied suit le régime des roues arrière (il l'entend)
    at_min=6.0, at_max=3.0,   # m/s² : ce que la vitesse peut demander en glisse (freiner, relancer)
    horizon=0.1,            # s : ce que le volant peut atteindre d'ici là borne ce qu'il attend de l'avant
    alat_drift=5.6,         # m/s² : en glisse, il ne demande pas à la voiture de tourner plus que ses pneus en
                            # travers ne le peuvent (sinon le rappel vers la route se battrait avec la glisse)
    vue=0.15,               # s : son lacet voulu a de l'avance sur la consigne de glisse (il sait ce qu'il va faire)
    lead=0.06,           # s : il braque vers où la roue avant ira (le volant a du retard)
    fb_drift=30.0,          # °/s : en glisse, la correction de trajectoire bornée
    wn_drift=2.0,          # la boucle de trajectoire en glisse
)

SUB = 4                     # pas de la physique par pas du conducteur (960 Hz)
DT = 1.0 / 240.0
V_ARRET = 0.08              # m/s : dessous, au bout de la route, elle est arrêtée (3 mm par image : rien ne se voit)


def mf(alpha, D, B, C, E):
    """La Formule magique : l'effort (N) pour une dérive ou un glissement `alpha` (rad ou σ), crête D."""
    x = B * alpha
    return D * math.sin(C * math.atan(x - E * (x - math.atan(x))))


def _mu_load(c, fz):
    fz0 = c["m"] * G / 4.0
    return c["mu"] * max(0.4, 1.0 - c["load_sens"] * (fz - fz0) / fz0)


def peak_alpha(c=CAR):
    """La dérive (rad) de la crête de l'effort latéral."""
    lo, hi = 0.01, 0.6
    for _ in range(60):
        m1, m2 = lo + (hi - lo) / 3, hi - (hi - lo) / 3
        if mf(m1, 1.0, c["B"], c["C"], c["E"]) < mf(m2, 1.0, c["B"], c["C"], c["E"]):
            lo = m1
        else:
            hi = m2
    return 0.5 * (lo + hi)


class Car:
    """L'état de la berline et ses équations. État : X, Y (m), psi (rad), u, v (m/s, dans la caisse), r (rad/s),
    w (rad/s, l'essieu arrière), roulis phi et tangage th (rad) avec leurs vitesses."""

    def __init__(self, c=CAR):
        self.c = c
        self.apk = peak_alpha(c)
        self.X = self.Y = self.psi = 0.0
        self.u, self.v, self.r, self.w = 10.0, 0.0, 0.0, 10.0 / c["R"]
        self.phi = self.dphi = self.th = self.dth = 0.0
        self.ax = self.ay = 0.0                       # accélérations du centre dans la caisse (m/s²), pas d'avant
        self.out = {}

    # -- les efforts
    def loads(self):
        """Les charges des quatre roues (N) : avant gauche, avant droite, arrière gauche, arrière droite."""
        c = self.c
        m, L, t = c["m"], c["a"] + c["b"], c["track"]
        fzf, fzr = m * G * c["b"] / L, m * G * c["a"] / L
        # longitudinal : par les ressorts (tangage) et, directement, par les bras (la part non suspendue)
        dl = -(c["K_pitch"] * self.th + c["C_pitch"] * self.dth) / L - (m * c["h"] - c["ms"] * c["h_pitch"]) * self.ax / L
        fzf, fzr = fzf + dl, fzr - dl
        # latéral : vers la droite quand la caisse est poussée à gauche (ay > 0)
        spring = (c["K_roll"] * self.phi + c["C_roll"] * self.dphi) / t
        direct = (m * c["h"] - c["ms"] * c["h_roll"]) * self.ay / t
        dff = spring * c["roll_front"] + direct * c["b"] / L
        dfr = spring * (1.0 - c["roll_front"]) + direct * c["a"] / L
        q = 0.5
        return (max(50.0, q * fzf - 0.5 * dff), max(50.0, q * fzf + 0.5 * dff),
                max(50.0, q * fzr - 0.5 * dfr), max(50.0, q * fzr + 0.5 * dfr))

    def front(self, a_f, F_brake_f, loads):
        """L'essieu avant dans le repère de ses roues : (effort longitudinal, latéral) (N) à la dérive a_f (rad), sous
        un effort de frein avant F_brake_f (N) : le latéral réduit par le freinage (ellipse)."""
        c = self.c
        Fx = Fy = 0.0
        sgn = 1.0 if self.u >= 0 else -1.0
        for fz in loads[:2]:
            D = _mu_load(c, fz) * fz
            fx = -min(0.5 * F_brake_f, 0.98 * D) * sgn
            Fx += fx
            Fy += mf(a_f, D, c["B"], c["C"], c["E"]) * math.sqrt(max(0.0, 1.0 - (fx / D) ** 2))
        return Fx, Fy

    def rear(self, kap, a_r, loads):
        """L'essieu arrière : (effort longitudinal, latéral) (N) au glissement kap et à la dérive a_r (rad) :
        glissement combiné, l'effort porté par le vecteur de glissement."""
        c = self.c
        sx = kap / (1.0 + kap) if kap > -0.999 else -1e3
        sy = math.tan(max(-1.45, min(1.45, a_r))) / (1.0 + max(-0.999, kap))
        sg = math.hypot(c["kx"] * sx, sy)
        Fx = Fy = 0.0
        if sg > 1e-9:
            for fz in loads[2:]:
                F = mf(sg, _mu_load(c, fz) * fz, c["B"], c["C"], c["E"])
                Fx += F * c["kx"] * sx / sg
                Fy += F * sy / sg
        return Fx, Fy

    def drag(self):
        c = self.c
        return 0.5 * c["rho"] * c["CdA"] * self.u * abs(self.u) + c["Crr"] * c["m"] * G * math.tanh(self.u / 0.5)

    def forces(self, delta, T_drive, T_brake_r, F_brake_f, w=None):
        """(Fx, Fy, Mz dans la caisse, Fx arrière, détails) pour un braquage `delta` (rad), un couple moteur et de
        frein à l'essieu arrière (N·m), un effort de frein avant (N) ; w : la vitesse de l'essieu arrière."""
        c = self.c
        w = self.w if w is None else w
        u, v, r = self.u, self.v, self.r
        ue = max(abs(u), 1.0)
        loads = self.loads()
        a_f = delta - math.atan2(v + c["a"] * r, ue)
        Fxf, Fyf = self.front(a_f, F_brake_f, loads)
        kap = (w * c["R"] - u) / ue
        a_r = -math.atan2(v - c["b"] * r, ue)
        Fxr, Fyr = self.rear(kap, a_r, loads)
        cd, sd = math.cos(delta), math.sin(delta)
        Fx = Fxf * cd - Fyf * sd + Fxr - self.drag()
        Fy = Fxf * sd + Fyf * cd + Fyr
        Mz = c["a"] * (Fxf * sd + Fyf * cd) - c["b"] * Fyr
        det = dict(a_f=a_f, a_r=a_r, kap=kap, Fyf=Fyf, Fyr=Fyr, Fxf=Fxf, Fxr=Fxr, loads=loads)
        return Fx, Fy, Mz, Fxr, det

    def front_force(self, alpha):
        """L'effort latéral de l'essieu avant (N) à la dérive alpha (sans frein)."""
        return self.front(alpha, 0.0, self.loads())[1]

    def step(self, h, delta, T_drive, T_brake_r, F_brake_f):
        """Un pas semi-implicite : les vitesses d'abord (l'essieu arrière implicite, linéarisé), puis les places."""
        c = self.c
        Fx, Fy, Mz, Fxr, det = self.forces(delta, T_drive, T_brake_r, F_brake_f)
        # l'essieu arrière : I ω' = T − Tb − R Fx(ω), Euler implicite sur la pente locale de Fx(ω) (raide à basse vitesse)
        dw = 0.2
        Fxr2 = self.forces(delta, T_drive, T_brake_r, F_brake_f, w=self.w + dw)[3]
        slope = max(0.0, (Fxr2 - Fxr) / dw)
        Tb = T_brake_r if self.w > 0.0 else 0.0
        w_new = self.w + h * (T_drive - Tb - c["R"] * Fxr) / (c["Iw"] + h * c["R"] * slope)
        self.w = max(0.0, w_new)
        m = c["m"]
        self.ax, self.ay = Fx / m, Fy / m
        self.u += h * (Fx / m + self.v * self.r)
        self.v += h * (Fy / m - self.u * self.r)
        self.r += h * Mz / c["Iz"]
        # la caisse : roulis et tangage sur leurs ressorts, menés par l'accélération du centre
        ddphi = (c["ms"] * c["h_roll"] * (self.ay + G * self.phi) - c["K_roll"] * self.phi - c["C_roll"] * self.dphi) / c["Ix"]
        ddth = (c["ms"] * c["h_pitch"] * self.ax - c["K_pitch"] * self.th - c["C_pitch"] * self.dth) / c["Iy"]
        self.dphi += h * ddphi
        self.dth += h * ddth
        self.phi += h * self.dphi
        self.th += h * self.dth
        cp, sp = math.cos(self.psi), math.sin(self.psi)
        self.X += h * (-sp * self.u - cp * self.v)
        self.Y += h * (cp * self.u - sp * self.v)
        self.psi += h * self.r
        self.out = det

    def T_avail(self):
        c = self.c
        return min(c["F_max"] * c["R"], c["P"] / max(self.w, 1.0))


# ---- le conducteur et la conduite entière

def _wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def _smooth01(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (10.0 - 15.0 * x + 6.0 * x * x)


def _trapeze(delta, acc, rate, dec):
    """Aller de 0 à delta (> 0) : accélérer à `acc` jusqu'à la vitesse `rate` au plus, tenir, freiner à `dec` et
    s'arrêter pile. Rend (durée, f) où f(τ) est la place à l'instant τ depuis le départ."""
    w = min(rate, math.sqrt(2.0 * delta / (1.0 / acc + 1.0 / dec)))
    ta, td = w / acc, w / dec
    tc = max(0.0, (delta - 0.5 * w * (ta + td)) / w)
    T = ta + tc + td

    def f(tau):
        if tau <= 0.0:
            return 0.0
        if tau < ta:
            return 0.5 * acc * tau * tau
        if tau < ta + tc:
            return 0.5 * w * ta + w * (tau - ta)
        if tau < T:
            return delta - 0.5 * dec * (T - tau) ** 2
        return delta
    return T, f


class Geste:
    """Le dérapage voulu par le conducteur : la glisse qu'il vise au fil du temps (°, signée), sa vitesse et son
    accélération. Ce n'est pas une courbe posée sur la voiture : c'est la consigne de ses mains et de ses pieds, que la
    simulation poursuit avec ses pneus, ses masses et les retards du volant et des pédales. Elle est faisable par
    construction : chaque phase est un trapèze de vitesse de glisse borné par ce que la berline peut donner en lacet
    (montee, sortie : accélération °/s², vitesse °/s, freinage °/s²), lissé (lisse s).

    ev : side (+1 : la voiture tourne à gauche, l'arrière part à droite), t (s, l'instant de la crête : l'étoile),
    peak (°), tenue (s de la crête au rattrapage), sag (° que la glisse visée perd pendant la tenue), appel (° du
    mauvais côté avant de la jeter, le balancier ; 0 : sans), appel_t (s), retour (° de l'autre côté au rattrapage, le
    petit retour ; 0 : sans), retour_t (s pour en revenir), avance (s : toute la consigne avancée, le retard de la
    voiture sur elle)."""

    def __init__(self, ev):
        self.ev = ev
        sd, pk = ev["side"], ev["peak"]
        fl = ev.get("appel", 0.0)
        sag = ev.get("sag", 0.0)
        back = ev.get("retour", 0.0)
        Tm, fm = _trapeze(pk + fl, *ev.get("montee", (120.0, 55.0, 70.0)))
        Ts, fs = _trapeze(pk - sag + back, *ev.get("sortie", (80.0, 40.0, 60.0)))
        Tf = ev.get("appel_t", 0.35) if fl else 0.0
        Tb = ev.get("retour_t", 0.5) if back else 0.0
        av = ev.get("avance", 0.0)
        self.t_crete = ev["t"] - av
        self.t_jet = self.t_crete - Tm                    # il jette la voiture
        self.t_debut = self.t_jet - Tf                    # le début de l'appel
        self.t_rattrape = self.t_crete + ev.get("tenue", 1.0)
        self.t_gaz = self.t_crete - ev.get("gaz_avant", 0.5)    # il lâche les freins et reprend les gaz
        self.t_pose = self.t_rattrape + Ts + Tb           # la glisse visée revenue à zéro
        self.t_fin = self.t_pose + ev.get("pose", 0.5)    # il a repris sa conduite

        def brut(t):
            if t <= self.t_debut:
                return 0.0
            if t < self.t_jet:
                x = (t - self.t_debut) / Tf
                return -fl * math.sin(0.5 * math.pi * x) ** 2
            if t < self.t_crete:
                return -fl + fm(t - self.t_jet)
            if t < self.t_rattrape:
                return pk - sag * _smooth01((t - self.t_crete) / (self.t_rattrape - self.t_crete))
            if t < self.t_rattrape + Ts:
                return pk - sag - fs(t - self.t_rattrape)
            if t < self.t_pose:
                x = (t - self.t_rattrape - Ts) / Tb
                return -back * math.cos(0.5 * math.pi * x) ** 2
            return 0.0
        # la table, lissée par deux moyennes glissantes (l'à-coup borné), puis ses dérivées
        lis = ev.get("lisse", 0.12)
        w = max(1, int(round(lis / DT)) | 1)
        self.t0 = self.t_debut - 2.0 * lis - 0.5
        n = int(round((self.t_fin + 2.0 * lis + 0.5 - self.t0) / DT)) + 1
        raw = [sd * brut(self.t0 + k * DT) for k in range(n)]
        pad = 2 * w
        g = M._box(M._box([0.0] * pad + raw + [0.0] * pad, w), w)[pad:pad + n]
        self.g = g
        self.dg = [0.0] + [(g[k + 1] - g[k - 1]) / (2 * DT) for k in range(1, n - 1)] + [0.0]
        self.ddg = [0.0] + [(g[k + 1] - 2 * g[k] + g[k - 1]) / (DT * DT) for k in range(1, n - 1)] + [0.0]

    def at(self, t):
        """(glisse visée °, sa vitesse °/s, son accélération °/s²) à l'instant t."""
        u = (t - self.t0) / DT
        k = int(math.floor(u))
        if k < 0 or k >= len(self.g) - 1:
            return 0.0, 0.0, 0.0
        f = u - k
        return (self.g[k] + (self.g[k + 1] - self.g[k]) * f, self.dg[k] + (self.dg[k + 1] - self.dg[k]) * f,
                self.ddg[k] + (self.ddg[k + 1] - self.ddg[k]) * f)

    def poids(self, t):
        """Le poids du mode dérapage (0..1) : il s'y met juste avant de la jeter, le quitte une fois posée."""
        e = self.ev
        return (_smooth01((t - (self.t_debut - e.get("fondu_in", 0.2))) / e.get("fondu_in", 0.2))
                * (1.0 - _smooth01((t - self.t_pose) / max(1e-3, self.t_fin - self.t_pose))))

    def frein(self, t):
        """Le plus de frein au pied qu'il garde (0..1 de la pédale) : il arrive sur les freins ; pour la jeter il
        les relâche jusqu'à ev["frein_jet"] (le freinage traîné : l'avant reste chargé, mais ses pneus doivent
        pouvoir tourner la voiture), puis les lâche quand il reprend les gaz."""
        e = self.ev
        fj = e.get("frein_jet", 0.25)
        cap = 1.0 + (fj - 1.0) * _smooth01((t - (self.t_jet - 0.1)) / 0.2)
        return cap * (1.0 - _smooth01((t - (self.t_gaz - 0.2)) / 0.2))

    def phase(self, t):
        """Ce que ses pieds et sa main peuvent faire à l'instant t : « frein » (de l'appel à la reprise des gaz : le
        frein à main s'il le faut, pas de gaz), « gaz » (ensuite : les gaz seuls)."""
        return "frein" if t < self.t_gaz else "gaz"

    def main(self, t):
        """Peut-il tirer le frein à main ? En la jetant seulement (main_t s au plus)."""
        e = self.ev
        return e.get("frein_main", True) and self.t_jet <= t < min(self.t_gaz, self.t_jet + e.get("main_t", 9.0))

    def lent(self, t):
        """Ce qu'il retranche à la vitesse du plan (m/s) pour entrer en glisse (ev["dv"], pris en dv_t s avant de la
        jeter : il freine plus tôt) : une berline en travers tient moins de vitesse dans le virage que sur ses quatre
        roues. Rendu une fois la voiture posée (en dv_rendu s) : il ne relance pas avant d'avoir repris sa ligne."""
        e = self.ev
        dv = e.get("dv", 0.0)
        if not dv:
            return 0.0
        return dv * (_smooth01((t - (self.t_jet - e.get("dv_t", 1.0))) / e.get("dv_t", 1.0))
                     * (1.0 - _smooth01((t - self.t_pose) / e.get("dv_rendu", 1.2))))

    def actif(self, t):
        """Le geste pèse-t-il encore sur la vitesse (de la levée de pied d'avant à la relance d'après) ?"""
        e = self.ev
        return self.t_jet - e.get("dv_t", 1.0) < t < self.t_pose + e.get("dv_rendu", 1.2)


def fenetre(ev):
    """(début, fin) en s du geste d'un dérapage : du début de l'appel à la reprise de la conduite."""
    g = Geste(ev)
    return g.t_debut, g.t_fin


class PhysDrive(M.Drive):
    """Le résultat de simulate() : la même interface que motion.Drive (pos, heading, travel, slip, steer, speed,
    along, alat, brake_windows, t_stop), plus ce que la simulation sait : roll, pitch (°, la caisse sur ses ressorts),
    yaw_rate (°/s), throttle, brake, handbrake (0..1), wheelspin (rapport de la vitesse des roues arrière à celle du
    sol sous elles : 0 bloquées, 1 qui roulent, plus : qui patinent), s (abscisse de la projection sur la route),
    lat_err (m, à gauche de la route), slip_ref (la glisse que le conducteur vise, °)."""

    def roll(self, t):
        return self._at("roll", t)

    def pitch(self, t):
        return self._at("pitch", t)

    def yaw_rate(self, t):
        return self._at("r", t)

    def throttle(self, t):
        return self._at("throttle", t)

    def brake(self, t):
        return self._at("brake", t)

    def handbrake(self, t):
        return self._at("hb", t)

    def wheelspin(self, t):
        return self._at("spin", t)

    def s(self, t):
        return self._at("s", t)

    def lat_err(self, t):
        return self._at("e", t)

    def slip_ref(self, t):
        return self._at("slip_ref", t)

    def brake_windows(self, f0=M.F0, fps=M.FPS, thr=0.06, frames=None):
        """[(première, dernière image)] où le pied est sur le frein (les feux stop : la pédale, pas la décélération ;
        une berline en travers ralentit sans que ses feux s'allument)."""
        if frames is None:
            frames = range(int(math.ceil(self.t0 * fps)) + f0, int(self.tab["t"][-1] * fps) + f0 + 1)
        over = [f for f in frames if self.brake(M.t_of(f, f0, fps)) > thr]
        return [(w[0], w[-1]) for w in M._windows(over)]


class Plan:
    """Le plan du conducteur : la route (motion.Route) et le profil de vitesse au temps : s_ref(t), v_ref(t),
    a_ref(t) (m, m/s, m/s²), et l'abscisse de l'arrêt (None : il roule)."""

    def __init__(self, route, s_ref, v_ref, a_ref, s_stop=None):
        self.route, self.s_ref, self.v_ref, self.a_ref, self.s_stop = route, s_ref, v_ref, a_ref, s_stop


def _project(route, s, x, y):
    """L'abscisse de la projection de (x, y) sur la route, partant de s (Newton) ; (s, écart à gauche, cap rad, κ)."""
    for _ in range(4):
        rx, ry, rh, _k = route.at(s)
        h = math.radians(rh)
        tx, ty = -math.sin(h), math.cos(h)
        ds = (x - rx) * tx + (y - ry) * ty
        s += ds
        if abs(ds) < 1e-6:
            break
    rx, ry, rh, k = route.at(s)
    h = math.radians(rh)
    e = (x - rx) * -math.cos(h) + (y - ry) * -math.sin(h)
    return s, e, h, k


KAP_GRID = (-1.0, -0.6, -0.35, -0.2, -0.12, -0.07, -0.035, 0.0, 0.035, 0.07, 0.12, 0.18, 0.26, 0.36, 0.5, 0.7, 1.0)


class _Avant:
    """L'essieu avant vu de la caisse, pour un pas du conducteur : la table (dérive → effort longitudinal et latéral
    dans la caisse) entre −crête et +crête, et son inverse (l'effort latéral voulu → la dérive)."""

    def __init__(self, car, theta, F_brake_f, loads, n=17):
        apk = car.apk
        self.a = [apk * (2.0 * i / (n - 1) - 1.0) for i in range(n)]
        self.X, self.Y = [], []
        for af in self.a:
            fx, fy = car.front(af, F_brake_f, loads)
            cd, sd = math.cos(theta + af), math.sin(theta + af)
            self.X.append(fx * cd - fy * sd)
            self.Y.append(fx * sd + fy * cd)
        # la part monotone (braquée loin, la roue pousse moins en travers de la caisse : on ne va pas au-delà)
        self.i0 = min(range(n), key=lambda i: self.Y[i])
        self.i1 = max(range(n), key=lambda i: self.Y[i])
        if self.i0 > self.i1:
            self.i0, self.i1 = 0, n - 1

    def en(self, af):
        """(effort longitudinal, effort latéral dans la caisse) à la dérive af."""
        a = self.a
        u = (af - a[0]) / (a[1] - a[0])
        k = max(0, min(len(a) - 2, int(math.floor(u))))
        f = max(0.0, min(1.0, u - k))
        return self.X[k] + (self.X[k + 1] - self.X[k]) * f, self.Y[k] + (self.Y[k + 1] - self.Y[k]) * f

    def pour(self, Y, lo=None, hi=None):
        """(dérive, effort longitudinal, effort latéral dans la caisse) pour l'effort latéral voulu Y, borné par la
        crête du pneu et, s'ils sont donnés, par les dérives lo et hi que le volant peut atteindre."""
        a, Xs, Ys, i0, i1 = self.a, self.X, self.Y, self.i0, self.i1
        if lo is not None:
            af = self.pour(Y)[0]
            lo, hi = max(a[i0], min(lo, a[i1])), min(a[i1], max(hi, a[i0]))
            af = lo if af < lo else hi if af > hi else af
            return (af,) + self.en(af)
        if Y <= Ys[i0]:
            return a[i0], Xs[i0], Ys[i0]
        if Y >= Ys[i1]:
            return a[i1], Xs[i1], Ys[i1]
        lo, hi = i0, i1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if Ys[mid] <= Y:
                lo = mid
            else:
                hi = mid
        f = (Y - Ys[lo]) / max(1e-9, Ys[hi] - Ys[lo])
        return a[lo] + (a[hi] - a[lo]) * f, Xs[lo] + (Xs[hi] - Xs[lo]) * f, Y


def _repartit(car, av, af_lo, af_hi, loads, a_r, beta, V, dr_des, dchi_des, at_des, kap_prev, kap_lo, kap_hi, W):
    """En glisse, le conducteur n'a que deux efforts pour trois envies : l'avant (le volant) et l'arrière (le pied
    droit, ou le frein à main : le glissement des roues arrière, qui partage leur adhérence entre pousser et tenir en
    travers). Il les répartit comme le contrôle de dérive de Goh et Gerdes (Stanford, 2016-2020) : le couple de lacet
    d'abord (tenir la glisse : W[0]), la force centripète ensuite (tenir la route : W[1]), la vitesse s'il en reste
    (W[2]). Rend le glissement des roues arrière voulu (kap) : celui qui, avec le volant qui tient le lacet, sert le
    mieux les trois. dr_des : accélération de lacet (rad/s²) ; dchi_des : vitesse du cap de la vitesse (rad/s) ;
    at_des : accélération le long de la vitesse (m/s²) ; af_lo, af_hi : les dérives avant que le volant peut
    atteindre bientôt (sa vitesse est bornée : quand il ne suit pas, c'est l'arrière qui doit tenir le lacet)."""
    c = car.c
    m, Iz, a, b = c["m"], c["Iz"], c["a"], c["b"]
    L = a + b
    drag = car.drag()
    cb, sb = math.cos(beta), math.sin(beta)
    w1, w2, w3, w4 = W

    def cout(kap):
        Fxr, Fyr = car.rear(kap, a_r, loads)
        _af, Xf, Yf = av.pour((Iz * dr_des + b * Fyr) / a, af_lo, af_hi)
        r1 = (a * Yf - b * Fyr - Iz * dr_des) / L
        Fx, Fy = Xf + Fxr - drag, Yf + Fyr
        r2 = -Fx * sb + Fy * cb - m * V * dchi_des
        r3 = Fx * cb + Fy * sb - m * at_des
        dk = kap - kap_prev
        return w1 * r1 * r1 + w2 * r2 * r2 + w3 * r3 * r3 + w4 * dk * dk

    grid = [k for k in KAP_GRID if kap_lo <= k <= kap_hi]
    if kap_lo <= kap_prev <= kap_hi:
        grid.append(kap_prev)
        grid.sort()
    js = [cout(k) for k in grid]
    i = min(range(len(grid)), key=lambda q: js[q])
    lo, hi = grid[max(0, i - 1)], grid[min(len(grid) - 1, i + 1)]
    if hi - lo < 1e-9:
        return grid[i]
    # section dorée entre les voisins du meilleur point
    g = 0.6180339887
    x1, x2 = hi - g * (hi - lo), lo + g * (hi - lo)
    j1, j2 = cout(x1), cout(x2)
    for _ in range(9):
        if j1 < j2:
            hi, x2, j2 = x2, x1, j1
            x1 = hi - g * (hi - lo)
            j1 = cout(x1)
        else:
            lo, x1, j1 = x1, x2, j2
            x2 = lo + g * (hi - lo)
            j2 = cout(x2)
    k = 0.5 * (lo + hi)
    return k if cout(k) <= js[i] else grid[i]


def simulate(plan, events=(), t_span=(-2.0, 40.0), car=None, driver=None):
    """Simule la berline et son conducteur sur la route du plan, de t_span[0] à t_span[1] (s). events : les
    dérapages (voir Geste). Rend un PhysDrive (table à 240 Hz)."""
    c = dict(CAR, **(car or {}))
    d = dict(DRIVER, **(driver or {}))
    R = plan.route
    car_ = Car(c)
    t = t_span[0]
    s = plan.s_ref(t)
    x, y, hd, _ = R.at(s)
    car_.X, car_.Y, car_.psi = x, y, math.radians(hd)
    v0 = plan.v_ref(t)
    car_.u, car_.w = v0, v0 / c["R"] * 1.004
    gestes = [Geste(dict(ev)) for ev in events]
    delta = 0.0
    thr = brk = hb = 0.0
    integ_s = 0.0
    kap_cmd = 0.0
    r_f = None
    th_prev, dth_f = None, 0.0
    rdes_prev = None
    keys = ("t", "x", "y", "vx", "vy", "v", "travel", "slip", "head", "steer", "along", "alat", "roll", "pitch", "r",
            "throttle", "brake", "hb", "spin", "s", "e", "alpha_f", "alpha_r", "Fyf", "Fyr", "Fxr", "fz_fl", "fz_fr",
            "fz_rl", "fz_rr", "kap", "steer_cmd", "r_des", "slip_ref", "drift_w", "kap_cmd")
    tab = {k: [] for k in keys}
    n = int(round((t_span[1] - t_span[0]) / DT)) + 1
    stopped = False
    m, Iz, a, b = c["m"], c["Iz"], c["a"], c["b"]
    a_pousse = c["mu"] * G * a / (a + b - c["mu"] * c["h"])    # m/s² : la relance au plus, en ligne (propulsion)
    ay_f = 0.0
    for i in range(n):
        t = t_span[0] + i * DT
        u, v, r = car_.u, car_.v, car_.r
        V = math.hypot(u, v)
        beta = math.atan2(v, u) if V > 0.3 else 0.0
        chi = car_.psi + beta
        s, e, hp, kp = _project(R, s, car_.X, car_.Y)
        out_ = car_.out or {}
        # ---- le dérapage en cours : la glisse visée (°), sa vitesse, son accélération, le poids du mode
        wd, ge = 0.0, None
        for g_ in gestes:
            w_ = g_.poids(t)
            if w_ > wd:
                wd, ge = w_, g_
        g_ref = dg_ref = 0.0
        if ge is not None:
            g_ref = ge.at(t)[0]
            # ses mains ont de l'avance sur la consigne : il sait ce qu'il va faire (le volant a une vitesse)
            dg_ref = ge.at(t + ge.ev.get("vue", d["vue"]))[1]
        evd = ge.ev if ge is not None else {}
        slip_now = -math.degrees(beta)
        # ---- la trajectoire : écart, cap de la vitesse → la vitesse de cap voulue
        Vc = max(V, 3.0)
        kpre = R.at(s + Vc * d["preview"])[3]
        wn = d["wn"] + (evd.get("wn_drift", d["wn_drift"]) - d["wn"]) * wd
        chi_err = _wrap(chi - hp)
        # il revient vers la route à une vitesse en travers qu'il saura arrêter en y arrivant (√(2 a |e|) : loin
        # d'elle, il ne fonce pas dessus ; près d'elle, c'est un rappel amorti ordinaire), et ne demande jamais à la
        # voiture de virer plus que ses pneus ne tiennent (sur ses roues : alat_max ; en travers : alat_drift)
        v_e = min(0.5 * wn / d["zeta"] * abs(e), math.sqrt(2.0 * d["a_rappel"] * abs(e)))
        chi_des = -math.copysign(v_e, e) / Vc
        fb = 2.0 * d["zeta"] * wn * (chi_des - chi_err)
        cap = math.radians(evd.get("fb_drift", d["fb_drift"]) * wd + d["fb_max"] * (1.0 - wd))
        dchi = Vc * kpre + max(-cap, min(cap, fb))
        lim = (d["alat_max"] + (evd.get("alat", d["alat_drift"]) - d["alat_max"]) * wd) / Vc
        dchi = max(-lim, min(lim, dchi))
        # ---- le lacet voulu : celui de la route, plus la vitesse de glisse du geste ; l'accélération de lacet : sa
        # dérivée, le rappel sur le lacet, et en glisse le rappel sur l'écart de glisse
        r_raw = dchi + wd * math.radians(dg_ref)
        r_f = r_raw if r_f is None else r_f + (r_raw - r_f) * min(1.0, DT / d["tau_r"])
        dr_ff = 0.0 if rdes_prev is None else (r_f - rdes_prev) / DT
        rdes_prev = r_f
        dr_ff = max(-6.0, min(6.0, dr_ff))
        dr_des = dr_ff + d["k_r"] * (r_f - r) + wd * d["k_g"] * math.radians(g_ref - slip_now)
        # ---- le volant : le couple de lacet voulu → l'effort latéral avant (l'arrière tel qu'il est) → la dérive →
        # le braquage. Les roues avant visent d'abord la vitesse de leur essieu : en glisse, c'est le contre-braquage.
        loads = car_.loads()
        theta_vf = math.atan2(v + a * r, max(abs(u), 1.0))
        dth = 0.0 if th_prev is None else (theta_vf - th_prev) / DT
        th_prev = theta_vf
        dth_f += (dth - dth_f) * min(1.0, DT / 0.05)
        av = _Avant(car_, theta_vf, brk * c["brake_max"] * c["bias"], loads)
        Fyr_now = out_.get("Fyr", 0.0)
        # sur ses quatre roues, l'avant prend sa part de la force centripète voulue sans attendre que la caisse ait
        # tourné (la bicyclette inversée) ; en glisse, l'arrière donne ce qu'il donne : l'avant équilibre le lacet
        Yf_route = (b * m * Vc * dchi + Iz * dr_des) / (a + b)
        Yf_glisse = (Iz * dr_des + b * Fyr_now) / a
        a_f_des = av.pour(Yf_route + wd * (Yf_glisse - Yf_route))[0]
        d_cmd = theta_vf + dth_f * d["lead"] + a_f_des
        d_cmd = max(-math.radians(c["steer_max"]), min(math.radians(c["steer_max"]), d_cmd))
        # ---- la vitesse : suivre l'abscisse et la vitesse du plan
        s_r, v_r, a_r_ = plan.s_ref(t), plan.v_ref(t), plan.a_ref(t)
        lent = any(g_.actif(t) for g_ in gestes)
        v_r0 = v_r
        v_r -= sum(g_.lent(t) for g_ in gestes)
        v_along = V * math.cos(chi - hp) / max(0.2, 1.0 - kp * e)
        es = s_r - s
        integ_s += max(-d["es_max"], min(d["es_max"], es)) * DT * (1.0 - wd) * (0.0 if lent else 1.0)
        integ_s = max(-3.0, min(3.0, integ_s))
        es_c = max(-d["es_max"], min(d["es_max"], es))
        a_cmd = a_r_ + d["k_v"] * (v_r - v_along) + (d["k_s"] * es_c + d["k_i"] * integ_s) * (0.0 if lent else 1.0)
        # en retard sur l'horaire, il ne le rattrape pas dans un virage : il y roule à la vitesse que le plan a à cet
        # endroit (pas à celle de l'heure qu'il est), et ne prend de l'avance sur elle qu'en ligne droite
        if es > 0.05:
            lo_t, hi_t = t - 2.0, t
            for _ in range(14):
                mid = 0.5 * (lo_t + hi_t)
                if plan.s_ref(mid) < s:
                    lo_t = mid
                else:
                    hi_t = mid
            v_ici, a_ici = plan.v_ref(hi_t), plan.a_ref(hi_t)
            k_ici = max(abs(R.at(s + q * Vc)[3]) for q in (0.0, 0.3, 0.6))
            v_cap = v_ici - (v_r0 - v_r) + d["v_avance"] * max(0.0, 1.0 - v_ici * v_ici * k_ici / d["a_droit"])
            a_cmd = min(a_cmd, a_ici + d["k_v"] * (v_cap - v_along))
        # il ne relance pas plus fort que ses roues arrière ne tiennent : ce qu'elles donnent déjà en travers (le
        # virage qu'il sent) est pris sur ce qu'elles peuvent pousser (l'ellipse d'adhérence, le report de charge)
        ay_f += (abs(car_.ay) - ay_f) * min(1.0, DT / 0.1)
        a_grip = d["grip"] * a_pousse * math.sqrt(max(0.02, 1.0 - (ay_f / (c["mu"] * G)) ** 2))
        a_cmd = min(a_cmd, a_grip)
        F_cmd = m * a_cmd + 0.5 * c["rho"] * c["CdA"] * u * abs(u) + c["Crr"] * m * G
        Tav = car_.T_avail()
        if F_cmd >= 0.0:
            thr_s, brk_s = min(1.0, F_cmd * c["R"] / Tav), 0.0
        else:
            thr_s, brk_s = 0.0, min(1.0, -F_cmd / c["brake_max"])
        # hors des dérapages, le pied droit sent l'arrière : dès que les roues arrière patinent ou que l'essieu
        # arrière dérive au-delà de ce que le pneu tient, il lève (sinon la propulsion part en tête-à-queue)
        tc = (max(0.0, (out_.get("kap", 0.0) - d["tc_kap"]) / d["tc_kap"])
              + max(0.0, (abs(math.degrees(out_.get("a_r", 0.0))) - d["tc_alpha"]) / d["tc_alpha"]))
        thr_s *= max(0.0, 1.0 - tc)
        hb_s = 0.0
        # ---- au dérapage, les pieds et le frein à main : le glissement des roues arrière qui sert le mieux le lacet,
        # la route et la vitesse (_repartit). Pendant qu'il la jette, il peut bloquer l'arrière (le frein à main : la
        # berline pivote sur son avant en ralentissant) ; ensuite les gaz seuls tiennent la glisse.
        if wd > 0.0:
            ue = max(abs(u), 1.0)
            a_rear = -math.atan2(v - b * r, ue)
            frein = ge.phase(t) == "frein"
            at_des = max(-d["at_min"], min(d["at_max"], a_cmd))
            af_now = delta - theta_vf
            sr_, hz = math.radians(c["steer_rate"]), d["horizon"]
            kap_cmd = _repartit(car_, av, af_now - (sr_ + dth_f) * hz, af_now + (sr_ - dth_f) * hz, loads, a_rear,
                                beta, max(V, 1.0), dr_des, dchi, at_des, kap_cmd, -1.0 if ge.main(t) else 0.0,
                                0.0 if frein else evd.get("kap_max", d["kap_max"]), d["W"])
            w_des = ue * (1.0 + kap_cmd) / c["R"]
            T_des = c["R"] * car_.rear(kap_cmd, a_rear, loads)[0] + c["Iw"] * d["k_w"] * (w_des - car_.w)
            brk_d = min(brk_s, ge.frein(t))
            if frein:
                # le pied droit est sur le frein : il n'en garde que ce que l'arrière doit freiner (le frein au pied
                # freine aussi l'arrière : quand il veut que l'arrière roule et tienne, il le relâche), le levier
                # fait le reste
                Tb_want = max(0.0, -T_des)
                k_ar = c["brake_max"] * (1.0 - c["bias"]) * c["R"]
                if t >= ge.t_jet:
                    brk_d = min(brk_d, Tb_want / k_ar)
                thr_d, hb_d = 0.0, min(1.0, max(0.0, Tb_want - brk_d * k_ar) / c["hb_max"])
            elif T_des >= 0.0:
                thr_d, hb_d = min(1.0, T_des / Tav), 0.0
            else:
                thr_d, hb_d = 0.0, min(1.0, -T_des / c["hb_max"])
            thr_s = (1.0 - wd) * thr_s + wd * thr_d
            brk_s = (1.0 - wd) * brk_s + wd * brk_d
            hb_s = wd * hb_d
        else:
            kap_cmd = out_.get("kap", 0.0)
        # les pédales et le levier ont une course
        pr = c["pedal_rate"] * DT
        thr += max(-pr, min(pr, thr_s - thr))
        brk += max(-pr, min(pr, brk_s - brk))
        hr = c["hb_rate"] * DT
        hb += max(-hr, min(hr, hb_s - hb))
        if plan.s_stop is not None and s > plan.s_stop - 0.5 and V < V_ARRET and v_r < V_ARRET:
            stopped = True
        # ---- la physique, SUB pas
        h = DT / SUB
        for _ in range(SUB):
            sr = math.radians(c["steer_rate"]) * h
            dd = (d_cmd - delta) * min(1.0, h / c["steer_tau"])
            delta += max(-sr, min(sr, dd))
            if stopped:
                car_.u = car_.v = car_.r = car_.w = 0.0
                car_.ax = car_.ay = 0.0
                # la caisse finit de se poser
                ddphi = (c["ms"] * c["h_roll"] * G * car_.phi - c["K_roll"] * car_.phi - c["C_roll"] * car_.dphi) / c["Ix"]
                ddth = (-c["K_pitch"] * car_.th - c["C_pitch"] * car_.dth) / c["Iy"]
                car_.dphi += h * ddphi
                car_.dth += h * ddth
                car_.phi += h * car_.dphi
                car_.th += h * car_.dth
                continue
            T = thr * car_.T_avail()
            Tb = brk * c["brake_max"] * (1.0 - c["bias"]) * c["R"] + hb * c["hb_max"]
            Ff = brk * c["brake_max"] * c["bias"]
            car_.step(h, delta, T, Tb, Ff)
        # ---- la table
        u, v, r = car_.u, car_.v, car_.r
        V = math.hypot(u, v)
        # (au pas, la vitesse en travers n'est plus que du bruit de pneu : la glisse rendue s'éteint sous 1 m/s)
        beta = math.atan2(v, u) * _smooth01(V / 1.0) if V > 0.05 else 0.0
        psi_d = math.degrees(car_.psi)
        trav = psi_d + math.degrees(beta)
        cp, sp = math.cos(car_.psi), math.sin(car_.psi)
        vx, vy = -sp * u - cp * v, cp * u - sp * v
        cb, sb = math.cos(beta), math.sin(beta)
        out = car_.out or {}
        fz = out.get("loads", (0, 0, 0, 0))
        spin = car_.w * c["R"] / max(0.5, u) if V > 0.5 else 1.0
        row = dict(t=t + DT, x=car_.X, y=car_.Y, vx=vx, vy=vy, v=V, travel=trav, slip=psi_d - trav, head=psi_d,
                   steer=math.degrees(delta), along=car_.ax * cb + car_.ay * sb,
                   alat=-car_.ax * sb + car_.ay * cb, roll=math.degrees(car_.phi), pitch=math.degrees(car_.th),
                   r=math.degrees(r), throttle=thr, brake=brk, hb=hb, spin=spin, s=s, e=e,
                   alpha_f=math.degrees(out.get("a_f", 0.0)), alpha_r=math.degrees(out.get("a_r", 0.0)),
                   Fyf=out.get("Fyf", 0.0), Fyr=out.get("Fyr", 0.0), Fxr=out.get("Fxr", 0.0),
                   fz_fl=fz[0], fz_fr=fz[1], fz_rl=fz[2], fz_rr=fz[3], kap=out.get("kap", 0.0),
                   steer_cmd=math.degrees(d_cmd), r_des=math.degrees(r_f), slip_ref=g_ref, drift_w=wd,
                   kap_cmd=kap_cmd)
        if stopped:
            row.update(along=0.0, alat=0.0, slip=0.0, travel=psi_d)
        for k in keys:
            tab[k].append(row[k])
    # la table commence à t_span[0] + DT : on la recale sur la grille (première ligne = t_span[0])
    tab["t"] = [t_span[0] + k * DT for k in range(len(tab["t"]))]
    t_stop = None
    if plan.s_stop is not None:
        t_stop = next((tab["t"][k] for k in range(len(tab["t"])) if tab["t"][k] > 0 and tab["v"][k] < V_ARRET), None)
    return PhysDrive(tab, DT, t_stop)
