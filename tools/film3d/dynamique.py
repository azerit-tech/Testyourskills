# La conduite simulée de la berline (SPEC §18.61, 18 novembre 2026 : « les dérapages ne sont pas naturels encore, y a
# pas une façon sûre de le faire ? »). La façon sûre est la physique : plus aucune courbe de lacet, de glisse ou de
# roulis dessinée à la main. Une voiture simulée (modèle bicyclette, pneus de Pacejka, transferts de charge, ellipse
# d'adhérence, roues arrière motrices, caisse sur ses ressorts) et un conducteur simulé (volant, gaz, frein) qui suit
# la route et le profil de vitesse du parcours ; aux deux dérapages, il les provoque et les tient comme un pilote :
# appel (le coup de volant du balancier), transfert de charge au freinage, gaz pour faire sortir l'arrière et le tenir,
# contre-braquage, rattrapage. Le contre-braquage, la glisse, le lacet, la trajectoire du centre, le roulis, le
# tangage et le patinage sortent de la simulation.
#
# La route et le profil de vitesse sont des ENTRÉES (simulate(route, plan, …)) : rien n'est écrit en dur ici. Une
# route qui slalome entre des voitures (branche film/trafic) se suit de la même façon, avec la glisse et le roulis
# que ses changements de voie demandent.
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
    # le dérapage : gaz sur l'écart de glisse
    kp_b=0.01, kd_b=0.012, ki_b=0.01,   # par °, par °/s, par °·s
    thr_drift=0.75,         # les gaz au plus en glisse
    lead=0.3,               # s : en glisse, il anticipe la glisse à venir (le volant et les pneus ont du retard)
    tau_r=0.06,             # s : le lacet voulu, filtré (les mains)
    k_vd=0.3,              # par m/s : en glisse, les gaz baissent quand elle va plus vite que le plan
    fb_max=25.0,            # °/s : hors glisse, la correction de trajectoire bornée (il revient sans brusquer)
    tc_kap=0.05, tc_alpha=5.0,   # le patinage et la dérive arrière qu'il tolère hors glisse
    fb_drift=30.0,          # °/s : en glisse, la correction de trajectoire bornée
    wn_drift=1.8,           # la boucle de trajectoire, plus lâche en glisse (il laisse la voiture élargir un peu)
)

SUB = 4                     # pas de la physique par pas du conducteur (960 Hz)
DT = 1.0 / 240.0


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

    def forces(self, delta, T_drive, T_brake_r, F_brake_f, w=None):
        """(Fx, Fy, Mz dans la caisse, Fx arrière, détails) pour un braquage `delta` (rad), un couple moteur et de
        frein à l'essieu arrière (N·m), un effort de frein avant (N) ; w : la vitesse de l'essieu arrière."""
        c = self.c
        w = self.w if w is None else w
        u, v, r = self.u, self.v, self.r
        ue = max(abs(u), 1.0)
        fl, fr_, rl, rr = self.loads()
        # l'avant : dérive, effort latéral réduit par le freinage (ellipse)
        a_f = delta - math.atan2(v + c["a"] * r, ue)
        Fxf = Fyf = 0.0
        for fz in (fl, fr_):
            D = _mu_load(c, fz) * fz
            fx = -min(0.5 * F_brake_f, 0.98 * D) * (1.0 if u >= 0 else -1.0)
            fy = mf(a_f, D, c["B"], c["C"], c["E"]) * math.sqrt(max(0.0, 1.0 - (fx / D) ** 2))
            Fxf += fx
            Fyf += fy
        # l'arrière : glissement combiné (κ, α), l'effort sur le vecteur de glissement
        vr = v - c["b"] * r
        kap = (w * c["R"] - u) / ue
        a_r = -math.atan2(vr, ue)
        sx = kap / (1.0 + kap) if kap > -0.999 else -1e3
        sy = math.tan(max(-1.45, min(1.45, a_r))) / (1.0 + max(-0.999, kap))
        sg = math.hypot(c["kx"] * sx, sy)
        Fxr = Fyr = 0.0
        for fz in (rl, rr):
            D = _mu_load(c, fz) * fz
            if sg > 1e-9:
                F = mf(sg, D, c["B"], c["C"], c["E"])
                Fxr += F * c["kx"] * sx / sg
                Fyr += F * sy / sg
        cd, sd = math.cos(delta), math.sin(delta)
        drag = 0.5 * c["rho"] * c["CdA"] * u * abs(u) + c["Crr"] * c["m"] * G * math.tanh(u / 0.5)
        Fx = Fxf * cd - Fyf * sd + Fxr - drag
        Fy = Fxf * sd + Fyf * cd + Fyr
        Mz = c["a"] * (Fxf * sd + Fyf * cd) - c["b"] * Fyr
        det = dict(a_f=a_f, a_r=a_r, kap=kap, Fyf=Fyf, Fyr=Fyr, Fxf=Fxf, Fxr=Fxr, loads=(fl, fr_, rl, rr))
        return Fx, Fy, Mz, Fxr, det

    def front_force(self, alpha):
        """L'effort latéral de l'essieu avant (N) à la dérive alpha (sans frein)."""
        c = self.c
        fl, fr_, _, _ = self.loads()
        return sum(mf(alpha, _mu_load(c, fz) * fz, c["B"], c["C"], c["E"]) for fz in (fl, fr_))

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


def intention(ev, t):
    """Ce que le conducteur veut de la glisse au dérapage `ev` à l'instant t (temps du film) : (glisse visée °, signe
    appliqué ; poids du mode dérapage 0..1). Ce n'est pas la glisse rendue : c'est le but de ses mains et de son pied,
    qu'il poursuit avec une vitesse de glisse bornée (simulate) ; la voiture y répond avec ses pneus, son inertie et
    ses retards. ev : side (+1 : à gauche), t_init (s, l'instant où il jette la voiture), flick (° d'appel du mauvais
    côté, le balancier) pendant flick_t s avant t_init, peak (°), t_catch (s, l'instant où il la rattrape), sag (° que
    la glisse visée perd pendant la tenue)."""
    tf = ev["t_init"] - ev["flick_t"]
    t2 = ev["t_catch"] + ev.get("settle", 1.2)
    w = _smooth01((t - (tf - 0.3)) / 0.3) * (1.0 - _smooth01((t - t2) / 0.6))
    if w <= 0.0:
        return 0.0, 0.0
    if t < tf:
        g = 0.0
    elif t < ev["t_init"]:
        g = -ev["flick"]
    elif t < ev["t_catch"]:
        g = ev["peak"] - ev.get("sag", 0.0) * _smooth01((t - ev["t_init"]) / (ev["t_catch"] - ev["t_init"]))
    else:
        g = 0.0
    return ev["side"] * g, w


def inside(ev, t):
    """La ligne du pilote (m, à gauche de la route) : avant de jeter la voiture, il prend l'intérieur du virage
    (ev["inside"] m), parce que la glisse l'emmène dehors ; il le rend pendant la tenue."""
    b = ev.get("inside", 0.0)
    if not b:
        return 0.0
    ta = ev["t_init"] - ev["flick_t"] - ev.get("inside_t", 0.8)
    up = _smooth01((t - ta) / ev.get("inside_t", 0.8))
    down = 1.0 - _smooth01((t - ev["t_init"] - 0.2) / max(0.3, ev["t_catch"] + 0.4 - ev["t_init"]))
    return ev["side"] * b * up * down


def slip_rate(ev, goal, slip):
    """La vitesse de glisse (°/s) que le conducteur demande pour aller de `slip` à `goal` et s'y poser : bornée
    (rate_on en ouvrant, rate_off en refermant) et freinée à l'approche (une décélération de lacet `acc` °/s²)."""
    e = goal - slip
    opening = abs(goal) > abs(slip) and goal * slip >= 0.0
    cap = ev.get("rate_on", 55.0) if opening else ev.get("rate_off", 45.0)
    return math.copysign(min(cap, math.sqrt(2.0 * ev.get("acc", 90.0) * abs(e))), e)


class PhysDrive(M.Drive):
    """Le résultat de simulate() : la même interface que motion.Drive (pos, heading, travel, slip, steer, speed,
    along, alat, brake_windows, t_stop), plus ce que la simulation sait : roll, pitch (°, la caisse sur ses ressorts),
    yaw_rate (°/s), throttle, brake (0..1), wheelspin (rapport de la vitesse des roues arrière à celle du sol sous
    elles), s (abscisse de la projection sur la route), lat_err (m, à gauche de la route), alpha_f, alpha_r (°)."""

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

    def wheelspin(self, t):
        return self._at("spin", t)

    def s(self, t):
        return self._at("s", t)

    def lat_err(self, t):
        return self._at("e", t)


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


def simulate(plan, events=(), t_span=(-2.0, 40.0), car=None, driver=None):
    """Simule la berline et son conducteur sur la route du plan, de t_span[0] à t_span[1] (s). events : les
    dérapages (voir intention). Rend un PhysDrive (table à 240 Hz)."""
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
    # régime établi de la caisse et des charges (aucune accélération)
    delta = 0.0
    thr = brk = 0.0
    integ_s = 0.0
    integ_b = {}
    phase = {}
    rdes_prev = None
    keys = ("t", "x", "y", "vx", "vy", "v", "travel", "slip", "head", "steer", "along", "alat", "roll", "pitch", "r",
            "throttle", "brake", "spin", "s", "e", "alpha_f", "alpha_r", "Fyf", "Fyr", "Fxr", "fz_fl", "fz_fr",
            "fz_rl", "fz_rr", "kap", "steer_cmd", "r_des",
            "slip_goal", "drift_w")
    tab = {k: [] for k in keys}
    n = int(round((t_span[1] - t_span[0]) / DT)) + 1
    stopped = False
    m, Iz, a, b = c["m"], c["Iz"], c["a"], c["b"]
    apk = car_.apk
    prev_head = None
    for i in range(n):
        t = t_span[0] + i * DT
        u, v, r = car_.u, car_.v, car_.r
        V = math.hypot(u, v)
        beta = math.atan2(v, u) if V > 0.3 else 0.0
        chi = car_.psi + beta
        s, e, hp, kp = _project(R, s, car_.X, car_.Y)
        # ---- la volonté de glisse (dérapages)
        slip_t = dslip_t = 0.0
        wd = 0.0
        ev_on = None
        slip_now = -math.degrees(beta)
        for k_ev, ev in enumerate(events):
            st_, w_ = intention(ev, t)
            if w_ > wd:
                slip_t, wd, ev_on = st_, w_, k_ev
        if ev_on is not None:
            # il anticipe : la glisse qu'elle aura dans `lead` s, à la vitesse de glisse d'à présent (lacet moins
            # vitesse du cap de la vitesse)
            alat_now = -car_.ax * math.sin(beta) + car_.ay * math.cos(beta)
            rate_now = math.degrees(r - alat_now / max(V, 1.0))
            dslip_t = slip_rate(events[ev_on], slip_t, slip_now + events[ev_on].get("lead", d["lead"]) * rate_now)
        # ---- le volant : trajectoire (écart, cap de la vitesse) → lacet voulu → effort avant → braquage
        Vc = max(V, 3.0)
        kpre = R.at(s + Vc * d["preview"])[3]
        evd = events[ev_on] if ev_on is not None else {}
        wn = d["wn"] + (evd.get("wn_drift", d["wn_drift"]) - d["wn"]) * wd
        chi_err = _wrap(chi - hp)
        e_line = e - sum(inside(ev, t) for ev in events)
        fb = -(wn * wn / Vc) * e_line - 2.0 * d["zeta"] * wn * chi_err
        cap = math.radians(evd.get("fb_drift", d["fb_drift"]) * wd + d["fb_max"] * (1.0 - wd))
        dchi = Vc * kpre + max(-cap, min(cap, fb))
        r_raw = dchi + wd * math.radians(dslip_t)
        r_f = r_raw if rdes_prev is None else r_f + (r_raw - r_f) * min(1.0, DT / d["tau_r"])
        r_des = r_f
        dr_ff = 0.0 if rdes_prev is None else (r_des - rdes_prev) / DT
        rdes_prev = r_des
        dr_ff = max(-6.0, min(6.0, dr_ff))
        Mz_des = Iz * (dr_ff + d["k_r"] * (r_des - r))
        Fyr_now = car_.out.get("Fyr", 0.0) if car_.out else 0.0
        Fyf_des = (Mz_des + b * Fyr_now) / (a * max(0.5, math.cos(delta)))
        # l'inverse du pneu avant (bissection jusqu'à la crête)
        Fpk = car_.front_force(apk)
        target = max(-0.995 * Fpk, min(0.995 * Fpk, Fyf_des))
        lo, hi = -apk, apk
        for _ in range(28):
            mid = 0.5 * (lo + hi)
            if car_.front_force(mid) < target:
                lo = mid
            else:
                hi = mid
        a_f_des = 0.5 * (lo + hi)
        theta_vf = math.atan2(v + a * r, max(abs(u), 1.0))
        d_cmd = theta_vf + a_f_des
        d_cmd = max(-math.radians(c["steer_max"]), min(math.radians(c["steer_max"]), d_cmd))
        # ---- la vitesse : suivre l'abscisse et la vitesse du plan
        s_r, v_r, a_r_ = plan.s_ref(t), plan.v_ref(t), plan.a_ref(t)
        v_along = V * math.cos(chi - hp) / max(0.2, 1.0 - kp * e)
        es = s_r - s
        integ_s += es * DT * (1.0 - wd)
        integ_s = max(-3.0, min(3.0, integ_s))
        a_cmd = a_r_ + d["k_v"] * (v_r - v_along) + d["k_s"] * es + d["k_i"] * integ_s
        F_cmd = m * a_cmd + 0.5 * c["rho"] * c["CdA"] * u * abs(u) + c["Crr"] * m * G
        Tav = car_.T_avail()
        if F_cmd >= 0.0:
            thr_s, brk_s = min(1.0, F_cmd * c["R"] / Tav), 0.0
        else:
            thr_s, brk_s = 0.0, min(1.0, -F_cmd / c["brake_max"])
        # ---- au dérapage, les pieds : l'entrée au frein (le freinage traîné charge l'avant et déleste l'arrière, qui
        # décroche sous le coup de volant), puis, l'arrière parti (glisse au-delà de gas_at × crête), les gaz tiennent
        # la glisse (une propulsion se tient en glisse à l'accélérateur), dosés sur l'écart de glisse et la vitesse ;
        # au rattrapage, le pied se lève et le plan reprend
        if wd > 0.0:
            ev = events[ev_on]
            sd = ev["side"]
            st = phase.setdefault(ev_on, {"power": False})
            if not st["power"] and t > ev["t_init"] and sd * slip_now > ev.get("gas_at", 0.0) * ev["peak"]:
                st["power"] = True
            eb = sd * (slip_t - slip_now)
            if st["power"]:
                ib = integ_b.get(ev_on, ev.get("gas0", 0.3) / d["ki_b"])
                ib += eb * DT
                integ_b[ev_on] = ib
                thr_b = d["kp_b"] * eb + d["ki_b"] * ib
                # la dérivée : vitesse de glisse voulue moins vraie (°/s) ; la vraie : lacet moins vitesse du cap de
                # la vitesse (latérale / vitesse)
                alat_now = -car_.ax * math.sin(beta) + car_.ay * math.cos(beta)
                dslip_now = math.degrees(r - alat_now / max(V, 1.0))
                thr_b += d["kd_b"] * sd * (dslip_t - dslip_now)
                # et la vitesse : plus vite que le plan, moins de gaz (la glisse se tient alors au volant)
                thr_b -= ev.get("k_vd", d["k_vd"]) * max(0.0, v_along - v_r + ev.get("dv", 0.0))
                thr_b = max(0.0, min(ev.get("thr", d["thr_drift"]), thr_b))
                thr_s = (1.0 - wd) * thr_s + wd * thr_b
                brk_s = brk_s * (1.0 - wd)
            elif t > ev["t_init"] - ev["flick_t"]:
                thr_s = thr_s * (1.0 - wd)
                brk_s = max(brk_s, wd * ev.get("brake_in", 0.3))
        # hors des dérapages, le pied droit sent l'arrière : dès que les roues arrière patinent ou que l'essieu
        # arrière dérive au-delà de ce que le pneu tient, il lève (sinon la propulsion part en tête-à-queue)
        out_ = car_.out or {}
        tc = (max(0.0, (out_.get("kap", 0.0) - d["tc_kap"]) / d["tc_kap"])
              + max(0.0, (abs(math.degrees(out_.get("a_r", 0.0))) - d["tc_alpha"]) / d["tc_alpha"]))
        thr_s *= max(0.0, 1.0 - tc * (1.0 - wd))
        # les pédales ont une course
        pr = c["pedal_rate"] * DT
        thr += max(-pr, min(pr, thr_s - thr))
        brk += max(-pr, min(pr, brk_s - brk))
        if plan.s_stop is not None and s > plan.s_stop - 0.5 and V < 0.4:
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
                c_ = c
                ddphi = (c_["ms"] * c_["h_roll"] * G * car_.phi - c_["K_roll"] * car_.phi - c_["C_roll"] * car_.dphi) / c_["Ix"]
                ddth = (-c_["K_pitch"] * car_.th - c_["C_pitch"] * car_.dth) / c_["Iy"]
                car_.dphi += h * ddphi
                car_.dth += h * ddth
                car_.phi += h * car_.dphi
                car_.th += h * car_.dth
                continue
            T = thr * car_.T_avail()
            Tb = brk * c["brake_max"] * (1.0 - c["bias"]) * c["R"]
            Ff = brk * c["brake_max"] * c["bias"]
            car_.step(h, delta, T, Tb, Ff)
        # ---- la table
        u, v, r = car_.u, car_.v, car_.r
        V = math.hypot(u, v)
        beta = math.atan2(v, u) if V > 0.05 else (math.atan2(tab["vy"][-1], 1.0) * 0.0 if tab["t"] else 0.0)
        psi_d = math.degrees(car_.psi)
        trav = psi_d + math.degrees(beta) if V > 0.05 else (tab["travel"][-1] if tab["t"] else psi_d)
        cp, sp = math.cos(car_.psi), math.sin(car_.psi)
        vx, vy = -sp * u - cp * v, cp * u - sp * v
        cb, sb = math.cos(beta), math.sin(beta)
        out = car_.out or {}
        fz = out.get("loads", (0, 0, 0, 0))
        spin = car_.w * c["R"] / max(0.5, u) if V > 0.5 else 1.0
        row = dict(t=t + DT, x=car_.X, y=car_.Y, vx=vx, vy=vy, v=V, travel=trav, slip=psi_d - trav, head=psi_d,
                   steer=math.degrees(delta), along=car_.ax * cb + car_.ay * sb,
                   alat=-car_.ax * sb + car_.ay * cb, roll=math.degrees(car_.phi), pitch=math.degrees(car_.th),
                   r=math.degrees(r), throttle=thr, brake=brk, spin=spin, s=s, e=e,
                   alpha_f=math.degrees(out.get("a_f", 0.0)), alpha_r=math.degrees(out.get("a_r", 0.0)),
                   Fyf=out.get("Fyf", 0.0), Fyr=out.get("Fyr", 0.0), Fxr=out.get("Fxr", 0.0),
                   fz_fl=fz[0], fz_fr=fz[1], fz_rl=fz[2], fz_rr=fz[3], kap=out.get("kap", 0.0),
                   steer_cmd=math.degrees(d_cmd), r_des=math.degrees(r_des), slip_goal=slip_t, drift_w=wd)
        if stopped:
            row.update(along=0.0, alat=0.0, slip=tab["slip"][-1] if tab["t"] else 0.0)
        for k in keys:
            tab[k].append(row[k])
    # la table commence à t_span[0] + DT : on la recale sur la grille (première ligne = t_span[0])
    tab["t"] = [t_span[0] + k * DT for k in range(len(tab["t"]))]
    t_stop = None
    if plan.s_stop is not None:
        t_stop = next((tab["t"][k] for k in range(len(tab["t"])) if tab["t"][k] > 0 and tab["v"][k] < 0.05), None)
    return PhysDrive(tab, DT, t_stop)
