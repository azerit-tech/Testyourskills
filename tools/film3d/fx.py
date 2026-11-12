# Les interactions du film : tout ce qui réagit au passage de la berline. L'eau (gerbes de flaque, voile d'embruns
# derrière les roues, rides), la gomme (fumée de glisse), ce qui vole (papiers, feuilles, gobelets, plots, souffle
# des rotors), ce qui tremble (enseignes, guirlandes, câbles, palmes, bittes et pneus pendus), les étincelles (une
# fois dans le film) et l'arrêt de FIN (la fumée qui rattrape la voiture, les gouttes qui tombent).
#
# Rien n'est simulé ni cuit : tout se calcule ici, en Python pur, depuis le mouvement de la scène lu au moment du
# rendu (la caisse « coupe », ses roues « wheel_* », la caméra, les hélicoptères), puis se pose en clés (objets) ou
# en attributs de naissance (particules) que des nœuds de géométrie évaluent à l'image (position balistique avec
# traînée, taille, opacité). Le flou de bougé vient des sous-images, comme pour le reste du film.
#
#   import fx
#   fx.dress("P3")                       # en fin de construction du plan, après les clés de motion.py
#
# Inactif par défaut (le plan sort comme avant) : FILM3D_FX=1 active les effets, plan par plan à mesure que chaque
# bande est validée ; FILM3D_FX_ONLY=eau,gomme,vol,tremble,etincelles,arret ne garde que ces familles (le banc).
# Les sprites et gouttes ne sont vus que par la caméra (ni ombre, ni rebond
# diffus, ni reflet sur la caisse) et n'émettent rien : aucune lumière ajoutée, la berline ne change pas de teinte.
# Les étincelles émettent, sans échantillonnage d'émission (elles n'éclairent rien).
#
# Repère : celui des scènes (z en haut). Le temps en images Blender ; FPS = 24.
import math
import os
import random

FPS = 24.0
G = 9.81
FAMILIES = ("eau", "gomme", "vol", "tremble", "etincelles", "arret")


def log(msg):
    print(f"[fx] {msg}", flush=True)


def enabled(family=None):
    if os.environ.get("FILM3D_FX", "0").strip().lower() not in ("1", "oui", "on", "true"):
        return False
    only = os.environ.get("FILM3D_FX_ONLY", "").strip()
    if family and only:
        return family in [s.strip() for s in only.split(",")]
    return True


# ================================================================ le calcul, sans Blender

def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _mul(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _len(a):
    return math.sqrt(_dot(a, a))


def _norm(a):
    n = _len(a)
    return _mul(a, 1.0 / n) if n > 1e-9 else (0.0, 0.0, 0.0)


def _lerp(a, b, u):
    return tuple(x + (y - x) * u for x, y in zip(a, b))


def smoothstep(a, b, x):
    if b == a:
        return 1.0 if x >= b else 0.0
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * (3.0 - 2.0 * u)


def ballistic(p0, v0, t, drag, grav=1.0):
    """Position à t secondes d'un point lancé de p0 à v0 (m/s), traînée linéaire `drag` (1/s), pesanteur × grav
    (négative : il monte, la fumée chaude). La même formule que les nœuds de géométrie (_gn_particles)."""
    k = max(drag, 0.01)
    e = (1.0 - math.exp(-k * t)) / k
    gk = G * grav / k
    return (p0[0] + v0[0] * e, p0[1] + v0[1] * e, p0[2] + v0[2] * e - gk * (t - e))


def ballistic_vel(v0, t, drag, grav=1.0):
    k = max(drag, 0.01)
    x = math.exp(-k * t)
    gk = G * grav / k
    return (v0[0] * x, v0[1] * x, v0[2] * x - gk * (1.0 - x))


def land_time(p0, v0, drag, ground, t_max, grav=1.0):
    """Le premier instant où le point redescend à `ground` (après son sommet), sinon t_max."""
    if grav <= 0:
        return t_max
    steps = 48
    prev = 0.0
    for i in range(1, steps + 1):
        t = t_max * i / steps
        if ballistic(p0, v0, t, drag, grav)[2] <= ground and ballistic_vel(v0, t, drag, grav)[2] < 0:
            lo, hi = prev, t
            for _ in range(20):
                mid = (lo + hi) / 2
                if ballistic(p0, v0, mid, drag, grav)[2] <= ground:
                    hi = mid
                else:
                    lo = mid
            return hi
        prev = t
    return t_max


class Particle:
    """Une particule : née à l'image `birth` (fractionnaire) en p (m), lancée à v (m/s), vivante `life` s ;
    traînée, pesanteur relative, taille de size0 à size1 (rayon d'une goutte, ou côté d'un sprite), opacité alpha,
    graine 0..1."""
    __slots__ = ("birth", "p", "v", "life", "drag", "grav", "size0", "size1", "alpha", "seed")

    def __init__(self, birth, p, v, life, drag=1.0, grav=1.0, size0=0.005, size1=None, alpha=1.0, seed=0.0):
        self.birth, self.p, self.v, self.life = float(birth), tuple(p), tuple(v), max(0.02, float(life))
        self.drag, self.grav, self.size0 = float(drag), float(grav), float(size0)
        self.size1 = float(size0 if size1 is None else size1)
        self.alpha, self.seed = float(alpha), float(seed)

    def at(self, frame):
        """(position, âge 0..1) à l'image `frame`, ou None hors de sa vie."""
        age = (frame - self.birth) / FPS
        if age < 0 or age > self.life:
            return None
        return ballistic(self.p, self.v, age, self.drag, self.grav), age / self.life


# ---------------------------------------------------------------- la trajectoire lue dans la scène

class Pose:
    """La berline à une image : centre (au sol), avant (unitaire, horizontal), vitesse (m/s), roues {nom: centre}."""
    __slots__ = ("frame", "pos", "fwd", "vel", "wheels", "speed", "slip", "a_long", "wvel")

    def __init__(self, frame, pos, fwd, wheels):
        self.frame, self.pos, self.fwd, self.wheels = frame, tuple(pos), _norm((fwd[0], fwd[1], 0.0)), dict(wheels)
        self.vel, self.speed, self.slip, self.a_long, self.wvel = (0.0, 0.0, 0.0), 0.0, 0.0, 0.0, {}

    @property
    def right(self):
        return (self.fwd[1], -self.fwd[0], 0.0)


def build_track(samples):
    """samples : [(image, centre, avant, {roue: centre})] dans l'ordre des images -> [Pose] avec vitesses
    (différences centrées), glisse (degrés entre l'avant et la vitesse, positive : la vitesse à gauche de l'avant)
    et accélération longitudinale."""
    poses = [Pose(*s) for s in samples]
    n = len(poses)
    for i, p in enumerate(poses):
        a, b = poses[max(0, i - 1)], poses[min(n - 1, i + 1)]
        df = (b.frame - a.frame) or 1
        p.vel = _mul(_sub(b.pos, a.pos), FPS / df)
        p.vel = (p.vel[0], p.vel[1], 0.0)
        p.speed = _len(p.vel)
        p.wvel = {k: _mul(_sub(b.wheels[k], a.wheels[k]), FPS / df) for k in p.wheels}
        if p.speed > 0.5:
            u = _norm(p.vel)
            cross = p.fwd[0] * u[1] - p.fwd[1] * u[0]
            p.slip = math.degrees(math.atan2(cross, _dot(p.fwd, u)))
    for i, p in enumerate(poses):
        a, b = poses[max(0, i - 1)], poses[min(n - 1, i + 1)]
        df = (b.frame - a.frame) or 1
        p.a_long = (b.speed - a.speed) * FPS / df
    return poses


def pose_at(track, frame):
    """La pose interpolée à une image fractionnaire : (centre, avant, vitesse, {roue: centre}, {roue: vitesse},
    glisse, vitesse scalaire)."""
    if frame <= track[0].frame:
        i, u = 0, 0.0
    elif frame >= track[-1].frame:
        i, u = len(track) - 2, 1.0
    else:
        i = next(k for k in range(len(track) - 1) if track[k + 1].frame >= frame)
        u = (frame - track[i].frame) / ((track[i + 1].frame - track[i].frame) or 1)
    a, b = track[i], track[i + 1]
    wh = {k: _lerp(a.wheels[k], b.wheels[k], u) for k in a.wheels}
    wv = {k: _lerp(a.wvel[k], b.wvel[k], u) for k in a.wvel}
    return (_lerp(a.pos, b.pos, u), _norm(_lerp(a.fwd, b.fwd, u)), _lerp(a.vel, b.vel, u), wh, wv,
            a.slip + (b.slip - a.slip) * u, a.speed + (b.speed - a.speed) * u)


def nearest_pass(track, point):
    """L'image (fractionnaire) où la berline passe au plus près de `point` (au sol), et la distance."""
    best = (track[0].frame, 1e9)
    for i in range(len(track) - 1):
        a, b = track[i].pos, track[i + 1].pos
        ab = (b[0] - a[0], b[1] - a[1])
        L2 = ab[0] ** 2 + ab[1] ** 2
        u = 0.0 if L2 < 1e-9 else max(0.0, min(1.0, ((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1]) / L2))
        q = (a[0] + ab[0] * u, a[1] + ab[1] * u)
        d = math.hypot(point[0] - q[0], point[1] - q[1])
        if d < best[1]:
            best = (track[i].frame + u * (track[i + 1].frame - track[i].frame), d)
    return best


# ---------------------------------------------------------------- l'eau

def _poisson(rng, lam):
    n, x = 0, rng.random()
    p = s = math.exp(-min(lam, 60.0))
    if lam > 30:
        return max(0, int(round(rng.gauss(lam, math.sqrt(lam)))))
    while x > s:
        n += 1
        p *= lam / n
        s += p
    return n


def wheel_spray(track, wheels, wheel_r, rate_drops=2400.0, rate_mist=190.0, wet=1.0, slip_gain=1.6, seed=1,
                substeps=4, wet_fn=None, mist_size=1.0, mist_alpha=0.8, frames=None, veil="bas"):
    """Le voile d'embruns derrière les roues : à chaque sous-image, pour chaque roue, des gouttes (Poisson de
    moyenne rate × vitesse/30 m/s × mouillé × (1 + glisse)) lancées de l'arrière du pneu, emportées à une fraction
    de la vitesse de la roue, un peu vers le haut ; et des sprites de brume, plus lents, qui gonflent et restent
    derrière. veil « bas » (la caméra derrière, le découpage v3) : des gerbes fines sous le pare-chocs qui s'ouvrent
    en V derrière les roues et retombent avant l'objectif ; « haut » (de côté ou de face) : un voile de 0,6 à 1 m.
    Renvoie (gouttes, brume) : deux listes de Particle."""
    bas = veil == "bas"
    rng = random.Random(seed)
    drops, mist = [], []
    f0, f1 = track[0].frame, track[-1].frame
    lo, hi = frames if frames else (f0, f1)
    for i in range(len(track) - 1):
        for s in range(substeps):
            f = track[i].frame + (s + rng.random()) / substeps * (track[i + 1].frame - track[i].frame)
            if f < lo - 1 or f > hi:
                continue
            _, fwd, vel, wh, wv, slip, speed = pose_at(track, f)
            if speed < 2.0:
                continue
            right = (fwd[1], -fwd[0], 0.0)
            gs = 1.0 + slip_gain * smoothstep(4.0, 25.0, abs(slip))
            for name, c in wh.items():
                rear = name.endswith(("BL", "BR"))
                side = 1.0 if name.endswith(("R",)) else -1.0
                w = wet * (wet_fn(c[0], c[1]) if wet_fn else 1.0) * (1.0 if rear else 0.45)
                if w <= 0:
                    continue
                k = speed / 30.0 * w / (FPS * substeps)
                V = wv.get(name, vel)
                ground = c[2] - wheel_r
                for _ in range(_poisson(rng, rate_drops * k * gs)):
                    a = rng.uniform(0.25, 1.0) * math.pi * 0.5          # sur l'arrière du pneu, du sol au moyeu
                    p = (c[0] - fwd[0] * wheel_r * math.sin(a) * 1.02 + right[0] * side * rng.uniform(-0.05, 0.12),
                         c[1] - fwd[1] * wheel_r * math.sin(a) * 1.02 + right[1] * side * rng.uniform(-0.05, 0.12),
                         ground + wheel_r * (1 - math.cos(a)) * rng.uniform(0.3, 1.0) + 0.02)
                    carry = rng.uniform(0.35, 0.65) if bas else rng.uniform(0.15, 0.55)
                    if bas:                                             # le V, sous le pare-chocs
                        up = min(1.8, speed * rng.uniform(0.03, 0.1))
                        lat = speed * rng.uniform(0.02, 0.16) * side
                    else:
                        up = speed * rng.uniform(0.04, 0.16)
                        lat = speed * rng.uniform(-0.04, 0.10) * side
                    v = (V[0] * carry + right[0] * lat, V[1] * carry + right[1] * lat, up)
                    drag = rng.uniform(0.8, 2.2)
                    life = land_time(p, v, drag, ground, 0.42 if bas else 0.9)
                    drops.append(Particle(f, p, v, life, drag, 1.0,
                                          rng.uniform(0.006, 0.014) if bas else rng.uniform(0.003, 0.007),
                                          seed=rng.random()))
                # le voile : continu au-delà de 50 km/h (le débit suit la vitesse), haut de 0,6 à 1 m, long de 4 à
                # 6 m derrière la roue (vie × vitesse relative), né à l'arrière du pneu sans fondu d'entrée
                hi_speed = 0.35 + 0.65 * smoothstep(8.0, 14.0, speed)
                for _ in range(_poisson(rng, rate_mist * k * gs * hi_speed * (2.2 if bas else 1.0))):
                    p = (c[0] - fwd[0] * wheel_r * 1.1 + right[0] * side * rng.uniform(-0.1, 0.25),
                         c[1] - fwd[1] * wheel_r * 1.1 + right[1] * side * rng.uniform(-0.1, 0.25),
                         ground + (rng.uniform(0.06, 0.2) if bas else rng.uniform(0.15, 0.4)))
                    carry = rng.uniform(0.4, 0.65) if bas else rng.uniform(0.25, 0.5)
                    if bas:
                        # deux traînées qui s'ouvrent en V sur 3 à 5 m : de petits sprites vifs (de la pulvérisation,
                        # pas une bouffée), écartés vers l'extérieur, le haut sous le bas du coffre
                        out, up = speed * rng.uniform(0.05, 0.14), rng.uniform(0.2, 0.8)
                        sz = mist_size * (0.16 + 0.2 * min(1.0, speed / 28.0))
                        s0, s1, life = sz * rng.uniform(0.5, 0.8), sz * rng.uniform(1.5, 2.1), rng.uniform(0.26, 0.42)
                        al = 1.0
                    else:
                        out, up = rng.uniform(0.0, 1.2), rng.uniform(0.5, 1.5)
                        sz = mist_size * (0.35 + 0.6 * min(1.0, speed / 25.0))
                        s0, s1, life = sz * rng.uniform(0.6, 0.9), sz * rng.uniform(1.5, 2.1), rng.uniform(0.55, 0.9)
                        al = 1.0
                    v = (V[0] * carry + right[0] * side * out, V[1] * carry + right[1] * side * out, up)
                    mist.append(Particle(f, p, v, life, rng.uniform(2.0, 3.2), 0.03, s0, s1,
                                         al * mist_alpha * min(1.0, w) * rng.uniform(0.7, 1.0) * min(1.25, gs),
                                         rng.random()))
    return drops, mist


def in_ellipse(x, y, e):
    """e = (cx, cy, rx, ry, angle) : le point est-il dans l'ellipse ?"""
    cx, cy, rx, ry, ang = e
    c, s = math.cos(ang), math.sin(ang)
    dx, dy = x - cx, y - cy
    u, v = dx * c + dy * s, -dx * s + dy * c
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1.0


def puddle_crossings(track, puddles, wheels=None, substeps=6):
    """Les traversées de flaque : [(image d'entrée, image de sortie, roue, indice de flaque)], au sous-pas près.
    Une flaque est une ellipse (cx, cy, rx, ry, angle) ou une fonction (x, y) -> dedans."""
    out = []
    names = wheels or list(track[0].wheels)
    for name in names:
        for j, e in enumerate(puddles):
            inside, f_in = False, None
            for i in range(len(track) - 1):
                for s in range(substeps + 1):
                    f = track[i].frame + s / substeps * (track[i + 1].frame - track[i].frame)
                    c = pose_at(track, f)[3][name]
                    now = e(c[0], c[1]) if callable(e) else in_ellipse(c[0], c[1], e)
                    if now and not inside:
                        f_in = f
                    elif inside and not now:
                        out.append((f_in, f, name, j))
                    inside = now
            if inside:
                out.append((f_in, track[-1].frame, name, j))
    # une même traversée lue deux fois (sous-pas recoupés) : on garde la première
    out.sort()
    keep = []
    for c in out:
        if not any(k[2] == c[2] and k[3] == c[3] and abs(k[0] - c[0]) < 0.5 for k in keep):
            keep.append(c)
    return keep


def puddle_splash(track, crossing, wheel_r, depth=1.0, seed=3, n_burst=900, n_sheet=40, veil="bas"):
    """La gerbe d'une roue qui entre dans une flaque : un éventail latéral bref (des deux côtés du pneu, surtout
    vers l'extérieur), qui monte de 20 à 50° et retombe ; plus une nappe de sprites, l'eau en lame, très brève ;
    et, tant que la roue est dans l'eau, une projection continue derrière elle. Renvoie (gouttes, nappe)."""
    rng = random.Random(seed)
    f_in, f_out, name, _ = crossing
    drops, sheet = [], []
    span = max(0.3, f_out - f_in)
    for k in range(int(n_burst * depth)):
        f = f_in + span * (rng.random() ** 1.6)                    # la plupart à l'entrée
        _, fwd, vel, wh, wv, slip, speed = pose_at(track, f)
        if speed < 1.0:
            continue
        c = wh[name]
        V = wv.get(name, vel)
        right = (fwd[1], -fwd[0], 0.0)
        out_side = 1.0 if name.endswith("R") else -1.0
        side = out_side if rng.random() < 0.72 else -out_side
        ground = c[2] - wheel_r
        p = (c[0] + fwd[0] * rng.uniform(-0.15, 0.2) + right[0] * side * 0.12,
             c[1] + fwd[1] * rng.uniform(-0.15, 0.2) + right[1] * side * 0.12, ground + 0.015)
        az = math.radians(rng.uniform(-40.0, 25.0))               # autour du flanc, plutôt vers l'avant
        el = math.radians(rng.uniform(12.0, 52.0))
        sp = speed * rng.uniform(0.18, 0.48) * (1.0 if side == out_side else 0.7)
        d = (right[0] * side * math.cos(az) + fwd[0] * math.sin(az), right[1] * side * math.cos(az) + fwd[1] * math.sin(az))
        carry = rng.uniform(0.05, 0.35)
        v = (d[0] * sp * math.cos(el) + V[0] * carry, d[1] * sp * math.cos(el) + V[1] * carry, sp * math.sin(el))
        drag = rng.uniform(0.4, 1.2)
        life = land_time(p, v, drag, ground, 1.2)
        drops.append(Particle(f, p, v, life, drag, 1.0, rng.uniform(0.005, 0.012), seed=rng.random()))
    # la lame : des sprites lancés vers l'extérieur et vers le haut, qui montent à hauteur de vitre (0,8 à 1,1 m au
    # centre, le haut du sprite plus haut) en 0,2 s et se lisent cinq à six images
    for k in range(int(n_sheet * depth)):
        f = f_in + span * 0.8 * rng.random()
        _, fwd, vel, wh, wv, slip, speed = pose_at(track, f)
        if speed < 1.0:
            continue
        c = wh[name]
        right = (fwd[1], -fwd[0], 0.0)
        side = 1.0 if name.endswith("R") else -1.0
        p = (c[0] + right[0] * side * 0.3 - fwd[0] * rng.uniform(0.0, 0.3),
             c[1] + right[1] * side * 0.3 - fwd[1] * rng.uniform(0.0, 0.3), c[2] - wheel_r + 0.1)
        if veil == "bas":
            # de dos : une lame qui s'ouvre vers l'extérieur et monte à 0,4-0,5 m (le haut du sprite sous le bas
            # du coffre), 20 à 30 cm au-dessus de la traînée ordinaire
            out = speed * rng.uniform(0.15, 0.32)
            vz = min(3.0, max(2.2, speed * 0.13)) * rng.uniform(0.9, 1.05)
            sz0, sz1, al = rng.uniform(0.2, 0.3), rng.uniform(0.4, 0.6), 0.9
        else:
            out = speed * rng.uniform(0.12, 0.28)
            vz = min(6.0, max(3.5, speed * 0.3)) * rng.uniform(0.85, 1.1)
            sz0, sz1, al = rng.uniform(0.3, 0.5), rng.uniform(0.8, 1.2), 0.7
        v = (right[0] * side * out + vel[0] * 0.2, right[1] * side * out + vel[1] * 0.2, vz)
        sheet.append(Particle(f, p, v, rng.uniform(0.3, 0.45), 2.5, 0.6, sz0, sz1, al * depth, rng.random()))
    return drops, sheet


# ---------------------------------------------------------------- la gomme

def tyre_smoke(track, wheel_r, slip_min=6.0, rate=100.0, brake=0.0, seed=5, substeps=3, size=1.0, alpha=0.65,
               carry=0.18, drag=1.3, life=(1.2, 1.8)):
    """La fumée des pneus arrière : une intensité qui monte avec la glisse (de slip_min à 25°) et, si `brake`, avec
    la décélération (au-delà de 4 m/s²) ; des sprites nés au contact, emportés à `carry` de la vitesse de la roue
    (ils restent derrière), qui montent doucement et gonflent de 0,5 à 2,5 m, puis se dissipent."""
    rng = random.Random(seed)
    out = []
    for i in range(len(track) - 1):
        for s in range(substeps):
            f = track[i].frame + (s + rng.random()) / substeps * (track[i + 1].frame - track[i].frame)
            _, fwd, vel, wh, wv, slip, speed = pose_at(track, f)
            a = track[i].a_long
            g = smoothstep(slip_min, 25.0, abs(slip)) * min(1.0, speed / 12.0)
            if brake:
                g = max(g, brake * smoothstep(4.0, 9.0, -a) * min(1.0, speed / 4.0))
            if g <= 0.01:
                continue
            right = (fwd[1], -fwd[0], 0.0)
            vl = _dot(vel, right)
            slide = _mul(right, 1.0 if vl >= 0 else -1.0) if abs(vl) > 0.3 else (0.0, 0.0, 0.0)
            for name, c in wh.items():
                if not name.endswith(("BL", "BR")):
                    continue
                side = 1.0 if name.endswith("R") else -1.0
                V = wv.get(name, vel)
                for _ in range(_poisson(rng, rate * g / (FPS * substeps))):
                    p = (c[0] - fwd[0] * 0.25 + right[0] * side * 0.1, c[1] - fwd[1] * 0.25 + right[1] * side * 0.1,
                         c[2] - wheel_r + rng.uniform(0.1, 0.3))
                    lat = rng.uniform(0.1, 0.6) * side
                    k = carry * rng.uniform(0.7, 1.3)
                    # chassée vers l'extérieur du virage : le sens où glisse l'arrière (la part de la vitesse
                    # perpendiculaire au cap)
                    push = rng.uniform(1.6, 3.6)
                    # elle monte à hauteur de toit (0,7 à 1,3 m au centre en une seconde), gonfle à 2-3 m
                    v = (V[0] * k + right[0] * lat + slide[0] * push, V[1] * k + right[1] * lat + slide[1] * push,
                         rng.uniform(0.6, 1.5))
                    s0 = size * rng.uniform(0.45, 0.8)
                    out.append(Particle(f, p, v, rng.uniform(*life), drag * rng.uniform(0.8, 1.2), -0.012,
                                        s0, size * rng.uniform(2.2, 3.2), alpha * (0.5 + 0.5 * g) * rng.uniform(0.7, 1.0),
                                        rng.random()))
    return out


# ---------------------------------------------------------------- ce qui vole

def debris_keys(rest, frames, pass_frame, dist, car_vel, seed=7, kind="papier", ground=None):
    """Un papier, une feuille ou un gobelet posé en `rest` (x, y, z) et levé par le sillage de la berline qui passe
    à `dist` m à l'image `pass_frame` : rien avant, puis un envol (vers le haut, emporté dans le sens de la voiture
    et aspiré vers sa trace), une chute freinée qui flotte, des tours sur lui-même, et il se repose.
    Renvoie {image: (x, y, z, rx, ry, rz)}."""
    rng = random.Random(seed)
    ground = rest[2] if ground is None else ground
    speed = _len(car_vel)
    u = _norm(car_vel) if speed > 0.1 else (0.0, 1.0, 0.0)
    s = max(0.0, 1.0 - dist / 3.2) * min(1.4, speed / 20.0)
    props = {"papier": (2.6, 0.22, 1.0), "feuille": (3.2, 0.16, 0.8), "gobelet": (1.4, 0.45, 0.6)}
    drag, grav, spin_k = props.get(kind, props["papier"])
    lead = 0.12 * FPS                    # la bouffée arrive un peu avant le nez
    t0 = pass_frame - lead
    v0 = (u[0] * speed * 0.45 * s + rng.uniform(-0.6, 0.6), u[1] * speed * 0.45 * s + rng.uniform(-0.6, 0.6),
          (2.0 + 2.5 * rng.random()) * s)
    spin = [rng.uniform(-14, 14) * spin_k * s for _ in range(3)]
    phase = rng.uniform(0, math.tau)
    rot0 = [0.0, 0.0, rng.uniform(0, math.tau)]
    out = {}
    landed = None
    for f in frames:
        if f <= t0 or s <= 0.02:
            out[f] = (*rest, *rot0)
            continue
        t = (f - t0) / FPS
        if landed is None:
            p = ballistic(rest, v0, t, drag, grav)
            wob = 0.18 * s * math.sin(6.0 * t + phase) * math.exp(-0.4 * t)
            p = (p[0] + u[1] * wob, p[1] - u[0] * wob, p[2])
            if p[2] <= ground and t > 0.15:
                landed = (p[0], p[1], ground, t)
                p = landed[:3]
            decay = (1.0 - math.exp(-1.5 * t)) / 1.5
            rot = [rot0[k] + spin[k] * decay for k in range(3)]
            if landed is not None:
                rot[0], rot[1] = 0.0, 0.0
                rest_rot = rot
            out[f] = (*p, *rot)
        else:
            out[f] = (landed[0], landed[1], landed[2], 0.0, 0.0, rest_rot[2])
    return out


def topple_keys(frames, pass_frame, push, height=0.75, seed=11):
    """Un plot soufflé : s'il reçoit assez (`push` 0..1), il bascule autour de son bord (pendule inversé lancé),
    tombe à 90° avec un petit rebond et glisse un peu ; sinon il vacille, amorti. Renvoie {image: (angle de
    bascule en radians, glissement en m)}."""
    rng = random.Random(seed)
    out = {}
    dt = 1.0 / (FPS * 8)
    t_hit = pass_frame - 0.04 * FPS
    if push > 0.55:
        th, om, slide, vs = 0.0, 1.6 + 2.6 * push, 0.0, 0.8 * push * rng.uniform(0.7, 1.2)
        bounced = False
        t, state = 0.0, {}
        while t < 4.0:
            if th < math.pi / 2:
                om += (G / (height * 0.6)) * math.sin(th + 0.25) * dt
                th += om * dt
            else:
                if not bounced:
                    om, bounced = -om * 0.18, True
                    th = math.pi / 2 - 1e-4
                else:
                    om += (G / (height * 0.6)) * dt
                    th = min(math.pi / 2, th + om * dt)
            vs *= math.exp(-3.0 * dt)
            slide += vs * dt
            state[round(t * FPS * 8)] = (min(th, math.pi / 2), slide)
            t += dt
        for f in frames:
            t = (f - t_hit) / FPS
            out[f] = (0.0, 0.0) if t <= 0 else state.get(min(round(t * FPS * 8), max(state)), (math.pi / 2, slide))
    else:
        amp = math.radians(3.0 + 14.0 * push)
        for f in frames:
            t = (f - t_hit) / FPS
            out[f] = (0.0, 0.0) if t <= 0 else (amp * math.exp(-3.5 * t) * math.sin(math.tau * 2.6 * t), 0.0)
    return out


# ---------------------------------------------------------------- ce qui tremble

def sway(t, t_pass, amp, freq=1.4, zeta=0.12, gust=0.08):
    """Le balancement d'une chose suspendue ou souple au passage (t, t_pass en s) : une poussée douce qui arrive
    avec la voiture, puis une oscillation amortie. Renvoie un angle (même unité que amp)."""
    x = t - t_pass
    if x < -gust * 2:
        return 0.0
    w = math.tau * freq
    push = smoothstep(-gust * 2, gust, x)
    if x <= 0:
        return amp * 0.35 * push
    return amp * (0.35 * math.exp(-1.2 * x) + math.exp(-zeta * w * x) * math.sin(w * x + 0.35))


def flutter(t, amp, freq=3.0, seed=0.0):
    """Le battement continu sous un rotor : deux sinus désaccordés."""
    return amp * (0.6 * math.sin(math.tau * freq * t + seed * 7.1) + 0.4 * math.sin(math.tau * freq * 1.73 * t + seed * 3.3))


# ---------------------------------------------------------------- les rotors

def downwash(heli_track, ground_z, frames, seed=13, rate=40.0, reach=34.0, alpha=0.12, size=1.0):
    """Le souffle d'un rotor bas sur l'eau ou le quai : heli_track {image: (x, y, z)} ; sous `reach` m de hauteur,
    des sprites naissent en anneau sous lui (1 à 5 m du centre de l'empreinte) et filent vers l'extérieur au ras de
    la surface, d'autant plus nombreux qu'il est bas. Renvoie [Particle]."""
    rng = random.Random(seed)
    out = []
    fr = sorted(heli_track)
    for f in fr:
        if f not in frames:
            continue
        x, y, z = heli_track[f]
        h = z - ground_z
        g = 1.0 - smoothstep(reach * 0.45, reach, h)
        if g <= 0.01:
            continue
        for _ in range(_poisson(rng, rate * g / FPS)):
            a = rng.uniform(0, math.tau)
            r = rng.uniform(1.0, 5.0)
            d = (math.cos(a), math.sin(a), 0.0)
            p = (x + d[0] * r, y + d[1] * r, ground_z + rng.uniform(0.05, 0.4))
            sp = rng.uniform(5.0, 10.0) * g
            v = (d[0] * sp, d[1] * sp, rng.uniform(0.2, 1.0))
            s0 = size * rng.uniform(0.8, 1.4)
            out.append(Particle(f + rng.random(), p, v, rng.uniform(1.2, 2.0), 1.1, 0.02, s0, s0 * 3.0,
                                alpha * g * rng.uniform(0.6, 1.0), rng.random()))
    return out


# ---------------------------------------------------------------- les étincelles

def sparks(track, frame, wheel_r, n=260, dur=3.0, seed=17, front=1.25):
    """La gerbe sous la caisse : le bas du bouclier avant qui touche (à `front` m devant le centre), de `frame` à
    frame + dur images ; des points lancés à 30-85 % de la vitesse de la voiture, écartés de ±4 m/s, qui montent
    peu, retombent, rebondissent une fois (moins vite), et s'éteignent en 0,15 à 0,5 s. Renvoie [Particle]."""
    rng = random.Random(seed)
    out = []
    for k in range(n):
        f = frame + dur * rng.random() ** 1.4
        pos, fwd, vel, wh, wv, slip, speed = pose_at(track, f)
        right = (fwd[1], -fwd[0], 0.0)
        ground = min(c[2] for c in wh.values()) - wheel_r
        p = (pos[0] + fwd[0] * front + right[0] * rng.uniform(-0.6, 0.6),
             pos[1] + fwd[1] * front + right[1] * rng.uniform(-0.6, 0.6), ground + 0.01)
        carry = rng.uniform(0.3, 0.85)
        lat = rng.uniform(-4.0, 4.0)
        v = (vel[0] * carry + right[0] * lat, vel[1] * carry + right[1] * lat, rng.uniform(0.3, 2.6))
        life = rng.uniform(0.15, 0.5)
        drag = rng.uniform(0.6, 1.4)
        tl = land_time(p, v, drag, ground, life)
        sz = rng.uniform(0.004, 0.009)
        if tl < life - 0.04:
            out.append(Particle(f, p, v, tl, drag, 1.0, sz, sz, 1.0, rng.random()))
            q = ballistic(p, v, tl, drag)
            w = ballistic_vel(v, tl, drag)
            v2 = (w[0] * 0.6, w[1] * 0.6, abs(w[2]) * 0.35 + 0.2)
            q2 = (q[0], q[1], ground + 0.005)
            l2 = min(life - tl, land_time(q2, v2, drag, ground, life - tl))
            out.append(Particle(f + tl * FPS, q2, v2, l2, drag, 1.0, sz * 0.8, sz * 0.6, 0.7, rng.random()))
        else:
            out.append(Particle(f, p, v, min(life, tl), drag, 1.0, sz, sz * 0.7, 1.0, rng.random()))
    return out


# ---------------------------------------------------------------- l'arrêt

def drips(points, frames, ground, seed=19, every=0.6):
    """Les gouttes qui tombent de la caisse arrêtée : `points` [(x, y, z)] (bas de caisse, pare-chocs), une goutte
    toutes les `every` s environ par point, qui tombe sans vitesse initiale. Renvoie [Particle]."""
    rng = random.Random(seed)
    out = []
    lo, hi = frames
    for p in points:
        f = lo + rng.uniform(0, every * FPS)
        while f < hi:
            v = (0.0, 0.0, -0.05)
            life = land_time(p, v, 0.1, ground, 1.5)
            out.append(Particle(f, p, v, life, 0.1, 1.0, rng.uniform(0.0025, 0.004), seed=rng.random()))
            f += every * FPS * rng.uniform(0.6, 1.5)
    return out


# ================================================================ la couche Blender

def _bpy():
    import bpy
    return bpy


def _V(t):
    from mathutils import Vector
    return Vector(t)


class Ctx:
    """Ce que les effets lisent dans la scène : la berline (caisse « coupe », roues « wheel_* »), sa trajectoire
    image par image (lue en évaluant la scène : les clés de motion.py telles qu'elles sont au moment du rendu), la
    caméra, la collection « fx » où tout se range."""

    def __init__(self, plan, scene=None):
        bpy = _bpy()
        self.plan = plan
        self.scene = scene or bpy.context.scene
        self.cam = self.scene.camera
        self.body = bpy.data.objects.get("coupe")
        self.frames = (self.scene.frame_start, self.scene.frame_end)
        self.coll = bpy.data.collections.get("fx") or bpy.data.collections.new("fx")
        if self.coll.name not in self.scene.collection.children:
            self.scene.collection.children.link(self.coll)
        self.wheel_r = float(self.body.get("wheel_r", 0.31)) if self.body else 0.31
        self.wheels = sorted([c for c in self.body.children if c.name.startswith("wheel_")],
                             key=lambda o: o.name) if self.body else []
        self.track = self._sample() if self.body and len(self.wheels) == 4 else []
        self.cam_track = {}

    def _sample(self):
        sc = self.scene
        keep = sc.frame_current
        samples = []
        self.cam_pos = {}
        for f in range(self.frames[0] - 1, self.frames[1] + 2):
            sc.frame_set(f)
            M = self.body.matrix_world
            loc = M.translation
            fwd = -(M.to_3x3() @ _V((0.0, 1.0, 0.0)))         # street_hero : l'avant vers -y local
            wh = {w.name.split(":")[-1][len("wheel_"):]: tuple(w.matrix_world.translation) for w in self.wheels}
            samples.append((f, tuple(loc), tuple(fwd), wh))
            if self.cam:
                self.cam_pos[f] = (tuple(self.cam.matrix_world.translation), self.cam.matrix_world.copy(),
                                   self.cam.data.lens)
        sc.frame_set(keep)
        tr = build_track(samples)
        sp = [p.speed for p in tr]
        sl = [abs(p.slip) for p in tr]
        log(f"{self.plan} : berline lue sur {len(tr)} images, {min(sp) * 3.6:.0f} à {max(sp) * 3.6:.0f} km/h, glisse "
            f"max {max(sl):.0f}°")
        return tr

    # ------------------------------------------------------------ vu de la caméra

    def view(self, p, frame=None):
        """(x, y, profondeur) de p dans le cadre à l'image `frame` (0..1, y depuis le bas), depuis les matrices de
        caméra relevées par _sample (sans réévaluer la scène)."""
        f = int(round(frame if frame is not None else self.scene.frame_current))
        f = min(max(f, min(self.cam_pos)), max(self.cam_pos))
        _, Mw, lens = self.cam_pos[f]
        r = self.scene.render
        W, H = r.resolution_x * r.pixel_aspect_x, r.resolution_y * r.pixel_aspect_y
        cd = self.cam.data
        q = Mw.inverted() @ _V(p)
        if q.z >= -1e-6:
            return 0.5, 0.5, -1.0
        big = max(W, H)
        sx, sy = -q.x / q.z * lens / cd.sensor_width, -q.y / q.z * lens / cd.sensor_width
        x = 0.5 + (sx - cd.shift_x) * big / W
        y = 0.5 + (sy - cd.shift_y) * big / H
        return x, y, -q.z

    def link(self, ob):
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        self.coll.objects.link(ob)
        return ob


def camera_only(ob, glossy=False, transmission=True):
    """Vu par la caméra (et, au choix, dans les reflets) ; ni ombre, ni rebond diffus, ni brume."""
    ob.visible_shadow = False
    ob.visible_diffuse = False
    ob.visible_glossy = glossy
    ob.visible_transmission = transmission
    ob.visible_volume_scatter = False
    return ob


# ---------------------------------------------------------------- les matières

def _nodes(m):
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return nt, nt.nodes, out


def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            nt.links.new(x, n.inputs[i])
    return n.outputs[0]


def _attr(nt, name, kind="GEOMETRY"):
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_type = kind
    a.attribute_name = name
    return a


def _lin(hexs):
    h = hexs.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def mat_sprite(name, color="#cfd3de", noise_scale=1.6, lo=0.32, hi=0.78, translucent=0.65, occlude=0.3, detail=5.0,
               power=1.6, glow=0.0):
    """Un sprite de brume ou de fumée : disque fondu (attribut fx_uv) découpé par un bruit 4D pris en coordonnées
    monde (les sprites voisins lisent le même champ : ça se lit comme un volume), opacité fx_a, mélange de
    translucide (le contre-jour) et de diffus (les lampes de face)."""
    bpy = _bpy()
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, N, out = _nodes(m)
    uv = _attr(nt, "fx_uv").outputs["Vector"]
    sub = N.new("ShaderNodeVectorMath")
    sub.operation = "SUBTRACT"
    nt.links.new(uv, sub.inputs[0])
    sub.inputs[1].default_value = (0.5, 0.5, 0.0)
    ln = N.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    nt.links.new(sub.outputs[0], ln.inputs[0])
    d = _math(nt, "MULTIPLY", ln.outputs["Value"], 2.0)
    fall = _math(nt, "POWER", _math(nt, "SUBTRACT", 1.0, _math(nt, "MULTIPLY", d, d), clamp=True), power)
    geo = N.new("ShaderNodeNewGeometry")
    nz = N.new("ShaderNodeTexNoise")
    nz.noise_dimensions = "4D"
    nz.inputs["Scale"].default_value = noise_scale
    nz.inputs["Detail"].default_value = detail
    nz.inputs["Roughness"].default_value = 0.6
    nt.links.new(geo.outputs["Position"], nz.inputs["Vector"])
    w = _math(nt, "ADD", _math(nt, "MULTIPLY", _attr(nt, "fx_r").outputs["Fac"], 7.0),
              _math(nt, "MULTIPLY", _attr(nt, "fx_u").outputs["Fac"], 1.2))
    nt.links.new(w, nz.inputs["W"])
    mr = N.new("ShaderNodeMapRange")
    mr.interpolation_type = "SMOOTHSTEP"
    nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
    mr.inputs["From Min"].default_value = lo
    mr.inputs["From Max"].default_value = hi
    alpha = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", fall, mr.outputs["Result"]), _attr(nt, "fx_a").outputs["Fac"],
                  clamp=True)
    # l'eau pulvérisée et la fumée diffusent beaucoup et absorbent peu : le fond passe presque entier (le
    # transparent ne perd que `occlude` × alpha), la lumière diffusée s'y ajoute. Un mélange opaque à alpha, sur
    # une chaussée qui brille, posait des taches plus sombres que ce qu'elles cachent.
    col = _lin(color)
    occ = _math(nt, "SUBTRACT", 1.0, _math(nt, "MULTIPLY", alpha, occlude), clamp=True)
    trc = N.new("ShaderNodeCombineColor")
    for k in ("Red", "Green", "Blue"):
        nt.links.new(occ, trc.inputs[k])
    tr = N.new("ShaderNodeBsdfTransparent")
    nt.links.new(trc.outputs[0], tr.inputs["Color"])
    def tint(fac):
        cc = N.new("ShaderNodeCombineColor")
        for i, k in enumerate(("Red", "Green", "Blue")):
            nt.links.new(_math(nt, "MULTIPLY", alpha, col[i] * fac), cc.inputs[k])
        return cc.outputs[0]
    tl = N.new("ShaderNodeBsdfTranslucent")
    nt.links.new(tint(translucent), tl.inputs["Color"])
    df = N.new("ShaderNodeBsdfDiffuse")
    nt.links.new(tint(1.0 - translucent), df.inputs["Color"])
    add1 = N.new("ShaderNodeAddShader")
    nt.links.new(tl.outputs[0], add1.inputs[0])
    nt.links.new(df.outputs[0], add1.inputs[1])
    if glow > 0:
        # la diffusion multiple d'une fumée épaisse (elle reste claire dans la nuit) : une émission faible, à
        # l'opacité ; l'objet n'est vu que de la caméra et l'émission n'est pas échantillonnée, elle n'éclaire et ne
        # teinte rien
        em = N.new("ShaderNodeEmission")
        nt.links.new(tint(1.0), em.inputs["Color"])
        em.inputs["Strength"].default_value = glow
        add0 = N.new("ShaderNodeAddShader")
        nt.links.new(add1.outputs[0], add0.inputs[0])
        nt.links.new(em.outputs[0], add0.inputs[1])
        add1 = add0
        try:
            m.emission_sampling = "NONE"
        except (AttributeError, TypeError):
            pass
    add2 = N.new("ShaderNodeAddShader")
    nt.links.new(tr.outputs[0], add2.inputs[0])
    nt.links.new(add1.outputs[0], add2.inputs[1])
    nt.links.new(add2.outputs[0], out.inputs["Surface"])
    return m


def mat_spray(veil="bas"):
    """L'eau pulvérisée : de dos (« bas »), une matière vive et très translucide, peu découpée par le bruit (la
    traînée se lit en ruban qui prend le rouge des feux, l'ambre des lampes, le corail et le lilas des rampes) ;
    de côté (« haut »), le voile de brume."""
    if veil == "bas":
        return mat_sprite("fx_gerbe", "#e2e6ee", 3.2, 0.08, 0.62, translucent=0.8, occlude=0.12, detail=2.0, power=1.4)
    return mat_sprite("fx_brume_eau", "#c8cedc", 1.8, 0.2, 0.75, detail=3.0, power=2.0)


def mat_smoke(color="#d6d4da"):
    """La fumée de gomme : un bruit large et peu détaillé, un bord très fondu (aucune silhouette de sprite), une
    absorption faible (empilée sur vingt couches, elle ne devient pas un mur gris)."""
    return mat_sprite("fx_fumee", color, 0.7, 0.16, 0.85, 0.55, occlude=0.12, detail=2.0, power=2.6, glow=0.12)


def mat_drop(name="fx_goutte"):
    """Une goutte : verre d'eau et un peu de translucide (elle s'allume à contre-jour d'un phare)."""
    bpy = _bpy()
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, N, out = _nodes(m)
    gl = N.new("ShaderNodeBsdfPrincipled")
    gl.inputs["Base Color"].default_value = (0.9, 0.92, 0.95, 1.0)
    gl.inputs["Roughness"].default_value = 0.08
    gl.inputs["IOR"].default_value = 1.33
    gl.inputs["Transmission Weight"].default_value = 1.0
    tl = N.new("ShaderNodeBsdfTranslucent")
    tl.inputs["Color"].default_value = (0.85, 0.87, 0.92, 1.0)
    mx = N.new("ShaderNodeMixShader")
    mx.inputs["Fac"].default_value = 0.4
    nt.links.new(gl.outputs[0], mx.inputs[1])
    nt.links.new(tl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def mat_spark(name="fx_etincelle"):
    """Une étincelle : émission blanc-jaune qui vire à l'orange et s'éteint avec l'âge (fx_u) ; elle n'éclaire
    rien (échantillonnage d'émission coupé)."""
    bpy = _bpy()
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, N, out = _nodes(m)
    u = _attr(nt, "fx_u").outputs["Fac"]
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(u, mix.inputs["Factor"])
    mix.inputs["A"].default_value = _lin("#fff0c8")
    mix.inputs["B"].default_value = _lin("#ff6a1a")
    em = N.new("ShaderNodeEmission")
    nt.links.new(mix.outputs["Result"], em.inputs["Color"])
    nt.links.new(_math(nt, "MULTIPLY", _math(nt, "POWER", _math(nt, "SUBTRACT", 1.0, u, clamp=True), 0.7), 70.0),
                 em.inputs["Strength"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    try:
        m.emission_sampling = "NONE"
    except (AttributeError, TypeError):
        try:
            m.cycles.emission_sampling = "NONE"
        except Exception:
            pass
    return m


# ---------------------------------------------------------------- les particules en nœuds de géométrie

def _gn_math(ng, op, a, b=None, c=None):
    n = ng.nodes.new("ShaderNodeMath")
    n.operation = op
    for i, x in enumerate((a, b, c)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            ng.links.new(x, n.inputs[i])
    return n.outputs[0]


def _gn_vec(ng, op, a, b=None, scale=None):
    n = ng.nodes.new("ShaderNodeVectorMath")
    n.operation = op
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, tuple):
            n.inputs[i].default_value = x
        else:
            ng.links.new(x, n.inputs[i])
    if scale is not None:
        if isinstance(scale, (int, float)):
            n.inputs[3].default_value = scale
        else:
            ng.links.new(scale, n.inputs[3])
    return n.outputs["Value"] if op in ("LENGTH", "DOT_PRODUCT", "DISTANCE") else n.outputs["Vector"]


def _gn_attr(ng, name, vec=False):
    n = ng.nodes.new("GeometryNodeInputNamedAttribute")
    n.data_type = "FLOAT_VECTOR" if vec else "FLOAT"
    n.inputs["Name"].default_value = name
    return n.outputs["Attribute"]


def _gn_store(ng, geo, name, value, domain="POINT", vec=False):
    n = ng.nodes.new("GeometryNodeStoreNamedAttribute")
    n.data_type = "FLOAT_VECTOR" if vec else "FLOAT"
    n.domain = domain
    ng.links.new(geo, n.inputs["Geometry"])
    n.inputs["Name"].default_value = name
    ng.links.new(value, n.inputs["Value"])
    return n.outputs["Geometry"]


def _gn_maprange(ng, v, a, b, lo=0.0, hi=1.0):
    n = ng.nodes.new("ShaderNodeMapRange")
    n.interpolation_type = "SMOOTHSTEP"
    n.clamp = True
    for key, x in (("Value", v), ("From Min", a), ("From Max", b), ("To Min", lo), ("To Max", hi)):
        if isinstance(x, (int, float)):
            n.inputs[key].default_value = x
        else:
            ng.links.new(x, n.inputs[key])
    return n.outputs["Result"]


def _gn_particles(name, kind, mat, cam=None, hero=None, mask=0.0, near=0.0, edge=0.4):
    """Le groupe de nœuds qui évalue les particules à l'image (temps de la scène, sous-images comprises : le flou
    de bougé est juste). Chaque point du maillage porte b (naissance), l (vie), p, v, k (traînée), g (pesanteur),
    s0, s1 (taille), a (opacité), r (graine). kind « drops » : un nuage de points (sphères) ; « sprites » : un carré
    tourné vers la caméra par point, taille et opacité selon l'âge ; mask (0..1) creuse l'opacité dans le cône de la
    caméra à la berline (la caisse jamais voilée) ; near (m) efface les sprites trop près de l'objectif."""
    bpy = _bpy()
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    try:
        ng.is_modifier = True
    except AttributeError:
        pass
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, Lk = ng.nodes, ng.links.new
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    pts = N.new("GeometryNodeMeshToPoints")
    Lk(gi.outputs[0], pts.inputs["Mesh"])
    st = N.new("GeometryNodeInputSceneTime")
    age = _gn_math(ng, "DIVIDE", _gn_math(ng, "SUBTRACT", st.outputs["Frame"], _gn_attr(ng, "b")), FPS)
    life = _gn_attr(ng, "l")
    ta = _gn_math(ng, "MAXIMUM", age, 0.0)
    alive = _gn_math(ng, "MULTIPLY", _gn_math(ng, "GREATER_THAN", age, -1e-4), _gn_math(ng, "LESS_THAN", age, life))
    u = _gn_math(ng, "MINIMUM", _gn_math(ng, "DIVIDE", ta, life), 1.0)
    k = _gn_math(ng, "MAXIMUM", _gn_attr(ng, "k"), 0.01)
    e = _gn_math(ng, "DIVIDE", _gn_math(ng, "SUBTRACT", 1.0, _gn_math(ng, "EXPONENT", _gn_math(ng, "MULTIPLY", k, _gn_math(ng, "MULTIPLY", ta, -1.0)))), k)
    gk = _gn_math(ng, "DIVIDE", _gn_math(ng, "MULTIPLY", _gn_attr(ng, "g"), G), k)
    dz = _gn_math(ng, "MULTIPLY", gk, _gn_math(ng, "SUBTRACT", e, ta))           # -gk (t - e)
    cz = N.new("ShaderNodeCombineXYZ")
    Lk(dz, cz.inputs["Z"])
    pos = _gn_vec(ng, "ADD", _gn_vec(ng, "ADD", _gn_attr(ng, "p", True), _gn_vec(ng, "SCALE", _gn_attr(ng, "v", True), scale=e)),
                  cz.outputs[0])
    sp = N.new("GeometryNodeSetPosition")
    Lk(pts.outputs["Points"], sp.inputs["Geometry"])
    Lk(pos, sp.inputs["Position"])
    s0, s1 = _gn_attr(ng, "s0"), _gn_attr(ng, "s1")
    grow = _gn_math(ng, "SUBTRACT", 1.0, _gn_math(ng, "POWER", _gn_math(ng, "SUBTRACT", 1.0, u), 2.0))
    size = _gn_math(ng, "MULTIPLY", _gn_math(ng, "ADD", s0, _gn_math(ng, "MULTIPLY", _gn_math(ng, "SUBTRACT", s1, s0), grow)), alive)
    geo = _gn_store(ng, sp.outputs["Geometry"], "fx_u", u)
    geo = _gn_store(ng, geo, "fx_r", _gn_attr(ng, "r"))
    if kind == "drops":
        rad = N.new("GeometryNodeSetPointRadius")
        Lk(geo, rad.inputs["Points"])
        Lk(size, rad.inputs["Radius"])
        final = rad.outputs["Points"]
    else:
        # un fondu d'entrée de 50 ms (en temps, pas en fraction de vie : le voile naît au pneu, sans trou)
        fade = _gn_math(ng, "MULTIPLY", _gn_maprange(ng, ta, 0.0, 0.05),
                        _gn_math(ng, "POWER", _gn_math(ng, "SUBTRACT", 1.0, u), 1.4))
        alpha = _gn_math(ng, "MULTIPLY", _gn_math(ng, "MULTIPLY", _gn_attr(ng, "a"), fade), alive)
        P = N.new("GeometryNodeInputPosition").outputs[0]
        if cam is not None:
            ci = N.new("GeometryNodeObjectInfo")
            ci.transform_space = "ORIGINAL"
            ci.inputs["Object"].default_value = cam
            C = ci.outputs["Location"]
            to_cam = _gn_vec(ng, "SUBTRACT", C, P)
            dcam = _gn_vec(ng, "LENGTH", to_cam)
            if near > 0:
                alpha = _gn_math(ng, "MULTIPLY", alpha, _gn_maprange(ng, dcam, near * 0.5, near))
            if hero is not None and mask > 0:
                hi = N.new("GeometryNodeObjectInfo")
                hi.transform_space = "ORIGINAL"
                hi.inputs["Object"].default_value = hero
                H = _gn_vec(ng, "ADD", hi.outputs["Location"], (0.0, 0.0, 0.7))
                ax = _gn_vec(ng, "SUBTRACT", H, C)
                dist = _gn_vec(ng, "LENGTH", ax)
                axn = _gn_vec(ng, "NORMALIZE", ax)
                rel = _gn_vec(ng, "SUBTRACT", P, C)
                along = _gn_vec(ng, "DOT_PRODUCT", rel, axn)
                lat = _gn_vec(ng, "LENGTH", _gn_vec(ng, "SUBTRACT", rel, _gn_vec(ng, "SCALE", axn, scale=along)))
                # un vrai cône de vue : la berline (2,4 m de demi-longueur au plus) vue à `dist` couvre, à la
                # distance `along` de l'objectif, un rayon de 2,4 × along / dist ; le sprite y entre dès que son
                # bord (la moitié de sa taille) y touche. Les gros sprites proches de l'objectif, qui masquaient la
                # caisse sans être sur l'axe, sont pris.
                # la demi-largeur apparente de la caisse suit l'angle de vue : 2,4 m de profil, 1 m de dos ou de
                # face (le cap de la caisse : son -y local) ; de trois quarts arrière la fumée qui sort sur le côté
                # n'est plus prise pour de la caisse
                rv = N.new("FunctionNodeRotateVector")
                rv.inputs["Vector"].default_value = (0.0, -1.0, 0.0)
                Lk(hi.outputs["Rotation"], rv.inputs["Rotation"])
                cth = _gn_math(ng, "ABSOLUTE", _gn_vec(ng, "DOT_PRODUCT", rv.outputs[0], axn))
                sth = _gn_math(ng, "SQRT", _gn_math(ng, "MAXIMUM", _gn_math(ng, "SUBTRACT", 1.0, _gn_math(ng, "MULTIPLY", cth, cth)), 0.0))
                half = _gn_math(ng, "ADD", _gn_math(ng, "MULTIPLY", sth, 2.4), _gn_math(ng, "MULTIPLY", cth, 1.0))
                persp = _gn_math(ng, "DIVIDE", _gn_math(ng, "MAXIMUM", along, 0.0), _gn_math(ng, "MAXIMUM", dist, 0.5))
                r_in = _gn_math(ng, "ADD", _gn_math(ng, "MULTIPLY", persp, half), _gn_math(ng, "MULTIPLY", size, edge))
                r_out = _gn_math(ng, "ADD", _gn_math(ng, "MULTIPLY", persp, _gn_math(ng, "ADD", half, 0.8)),
                                 _gn_math(ng, "ADD", _gn_math(ng, "MULTIPLY", size, edge * 1.5), 0.2))
                # en profondeur : dès le milieu de la caisse (vue de dos, les roues arrière et leur gerbe sont
                # devant elle)
                inside = _gn_math(ng, "MULTIPLY", _gn_maprange(ng, lat, r_in, r_out, 1.0, 0.0),
                                  _gn_maprange(ng, along, _gn_math(ng, "ADD", dist, 0.3),
                                               _gn_math(ng, "SUBTRACT", dist, 1.2), 0.0, 1.0))
                # au ras du sol (sous le bas de caisse) le voile reste à moitié : c'est l'eau derrière les roues ;
                # plus haut, devant la caisse, il se creuse
                hz = N.new("ShaderNodeSeparateXYZ")
                Lk(_gn_vec(ng, "SUBTRACT", P, hi.outputs["Location"]), hz.inputs[0])
                inside = _gn_math(ng, "MULTIPLY", inside,
                                  _gn_math(ng, "ADD", 0.45, _gn_math(ng, "MULTIPLY", _gn_maprange(ng, hz.outputs["Z"], 0.1, 0.45), 0.55)))
                alpha = _gn_math(ng, "MULTIPLY", alpha, _gn_math(ng, "SUBTRACT", 1.0, _gn_math(ng, "MULTIPLY", inside, mask)))
            rot = N.new("FunctionNodeAlignRotationToVector")
            rot.axis = "Z"
            Lk(to_cam, rot.inputs["Vector"])
            rot_out = rot.outputs["Rotation"]
        else:
            rot_out = None
        geo = _gn_store(ng, geo, "fx_a", alpha)
        grid = N.new("GeometryNodeMeshGrid")
        grid.inputs["Size X"].default_value = 1.0
        grid.inputs["Size Y"].default_value = 1.0
        grid.inputs["Vertices X"].default_value = 2
        grid.inputs["Vertices Y"].default_value = 2
        guv = _gn_store(ng, grid.outputs["Mesh"], "fx_uv", grid.outputs["UV Map"], domain="CORNER", vec=True)
        inst = N.new("GeometryNodeInstanceOnPoints")
        Lk(geo, inst.inputs["Points"])
        Lk(guv, inst.inputs["Instance"])
        if rot_out is not None:
            Lk(rot_out, inst.inputs["Rotation"])
        # un sprite éteint (masqué, trop près, en fin de vie) est ramené à zéro : un carré transparent compte quand
        # même un rebond de transparence, et au-delà du plafond Cycles rend du noir (les grands pavés noirs du banc,
        # vus dans l'axe de la traîne)
        Lk(_gn_math(ng, "MULTIPLY", size, _gn_math(ng, "GREATER_THAN", alpha, 0.006)), inst.inputs["Scale"])
        real = N.new("GeometryNodeRealizeInstances")
        Lk(inst.outputs["Instances"], real.inputs["Geometry"])
        final = real.outputs["Geometry"]
    sm = N.new("GeometryNodeSetMaterial")
    Lk(final, sm.inputs["Geometry"])
    sm.inputs["Material"].default_value = mat
    Lk(sm.outputs["Geometry"], go.inputs[0])
    return ng


def emit(ctx, name, parts, kind, mat, mask=0.0, near=0.0, glossy=False, edge=0.4):
    """Pose une liste de Particle dans la scène : un maillage de points (un par particule, ses attributs de
    naissance) et le groupe de nœuds qui les fait vivre. Renvoie l'objet (ou None si la liste est vide)."""
    if not parts:
        return None
    bpy = _bpy()
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(parts))
    me.vertices.foreach_set("co", [0.0] * (3 * len(parts)))
    def put(key, vals, vec=False):
        a = me.attributes.new(key, "FLOAT_VECTOR" if vec else "FLOAT", "POINT")
        a.data.foreach_set("vector" if vec else "value", vals)
    put("b", [q.birth for q in parts])
    put("l", [q.life for q in parts])
    put("p", [c for q in parts for c in q.p], True)
    put("v", [c for q in parts for c in q.v], True)
    put("k", [q.drag for q in parts])
    put("g", [q.grav for q in parts])
    put("s0", [q.size0 for q in parts])
    put("s1", [q.size1 for q in parts])
    put("a", [q.alpha for q in parts])
    put("r", [q.seed for q in parts])
    ob = bpy.data.objects.new(name, me)
    ctx.coll.objects.link(ob)
    mod = ob.modifiers.new("fx", "NODES")
    mod.node_group = _gn_particles(name + "_nodes", kind, mat, cam=ctx.cam, hero=ctx.body, mask=mask, near=near,
                                   edge=edge)
    camera_only(ob, glossy=glossy)
    try:
        ob.cycles.use_motion_blur = True
        ob.cycles.use_deform_motion = True
    except AttributeError:
        pass
    return ob


# ---------------------------------------------------------------- les flaques et leurs rides

def _puddle_mesh(name, cx, cy, z, rx, ry, ang, seed, zfn=None):
    import bmesh
    bpy = _bpy()
    R = random.Random(seed)
    ph = [R.uniform(0, math.tau) for _ in range(4)]
    seg, rings = 40, 4
    bm = bmesh.new()
    c, s = math.cos(ang), math.sin(ang)

    def vert(u, v):
        x, y = cx + u * c - v * s, cy + u * s + v * c
        return bm.verts.new((x, y, (zfn(x, y) if zfn else z) + 0.003))
    centre = vert(0, 0)
    ring = []
    for j in range(1, rings + 1):
        t = j / rings
        row = []
        for i in range(seg):
            a = i * math.tau / seg
            k = 1.0 + 0.12 * math.sin(2 * a + ph[0]) + 0.1 * math.sin(3 * a + ph[1]) + 0.06 * math.sin(5 * a + ph[2])
            row.append(vert(t * rx * k * math.cos(a), t * ry * k * math.sin(a)))
        ring.append(row)
    for i in range(seg):
        bm.faces.new((centre, ring[0][i], ring[0][(i + 1) % seg]))
    for j in range(rings - 1):
        for i in range(seg):
            bm.faces.new((ring[j][i], ring[j + 1][i], ring[j + 1][(i + 1) % seg], ring[j][(i + 1) % seg]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    # le bord (0 au centre, 1 au pourtour) : la matière y fond l'eau dans l'enrobé
    a = me.attributes.new("fx_edge", "FLOAT", "POINT")
    a.data.foreach_set("value", [0.0] + [j / rings for j in range(1, rings + 1) for _ in range(seg)])
    ob = bpy.data.objects.new(name, me)
    return ob


def mat_puddle(name="fx_flaque"):
    """L'eau d'une flaque posée par fx : miroir sombre, rugosité 0,04 (celle des flaques de la rue), et les rides
    du passage (voir mat_ripple) dans sa normale."""
    bpy = _bpy()
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, N, out = _nodes(m)
    p = N.new("ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = _lin("#141416")
    p.inputs["Roughness"].default_value = 0.04
    p.inputs["IOR"].default_value = 1.33
    nt.links.new(_ripple_normal(nt), p.inputs["Normal"])
    # le pourtour déchiqueté et fondu : un disque net se lisait comme un trou noir
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.0
    nz.inputs["Detail"].default_value = 4.0
    nt.links.new(N.new("ShaderNodeTexCoord").outputs["Object"], nz.inputs["Vector"])
    e = _math(nt, "ADD", _attr(nt, "fx_edge").outputs["Fac"], _math(nt, "MULTIPLY", _math(nt, "SUBTRACT", nz.outputs["Fac"], 0.5), 0.7))
    mr = N.new("ShaderNodeMapRange")
    mr.interpolation_type = "SMOOTHSTEP"
    nt.links.new(e, mr.inputs["Value"])
    mr.inputs["From Min"].default_value = 0.95
    mr.inputs["From Max"].default_value = 0.45
    tr = N.new("ShaderNodeBsdfTransparent")
    mx = N.new("ShaderNodeMixShader")
    nt.links.new(mr.outputs["Result"], mx.inputs["Fac"])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(p.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def _ripple_normal(nt):
    """Les rides d'un passage : des ondes qui partent de la ligne de la roue (attributs d'objet fx_lx, fx_ly : un
    point de la ligne, fx_dx, fx_dy : sa direction, en repère local) et de l'âge fx_age (s, en clés), amorties ;
    nulles avant le passage. Renvoie la normale perturbée."""
    N = nt.nodes
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    sep = N.new("ShaderNodeSeparateXYZ")
    nt.links.new(co, sep.inputs[0])
    lx, ly = _attr(nt, "fx_lx", "OBJECT").outputs["Fac"], _attr(nt, "fx_ly", "OBJECT").outputs["Fac"]
    dx, dy = _attr(nt, "fx_dx", "OBJECT").outputs["Fac"], _attr(nt, "fx_dy", "OBJECT").outputs["Fac"]
    age = _attr(nt, "fx_age", "OBJECT").outputs["Fac"]
    rx, ry = _math(nt, "SUBTRACT", sep.outputs["X"], lx), _math(nt, "SUBTRACT", sep.outputs["Y"], ly)
    d = _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", _math(nt, "MULTIPLY", rx, dy), _math(nt, "MULTIPLY", ry, dx)))
    on = _math(nt, "GREATER_THAN", age, 0.0)
    front = _math(nt, "SUBTRACT", 1.0, _math(nt, "MINIMUM", 1.0,
                                             _math(nt, "MAXIMUM", 0.0, _math(nt, "MULTIPLY", _math(nt, "SUBTRACT", d, _math(nt, "MULTIPLY", age, 0.9)), 8.0))))
    env = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", on, front),
                _math(nt, "MULTIPLY", _math(nt, "EXPONENT", _math(nt, "MULTIPLY", age, -1.6)),
                      _math(nt, "EXPONENT", _math(nt, "MULTIPLY", d, -1.2))))
    wave = _math(nt, "SINE", _math(nt, "SUBTRACT", _math(nt, "MULTIPLY", d, 34.0), _math(nt, "MULTIPLY", age, 30.0)))
    h = _math(nt, "MULTIPLY", wave, env)
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.004
    nt.links.new(h, bump.inputs["Height"])
    return bump.outputs["Normal"]


def mat_ripple(name="fx_rides"):
    """La couche des rides posée sur une flaque existante : transparente sauf là où les ondes passent, un miroir
    d'eau à la normale perturbée (le reflet de la flaque se tord)."""
    bpy = _bpy()
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, N, out = _nodes(m)
    g = N.new("ShaderNodeBsdfGlossy")
    g.inputs["Roughness"].default_value = 0.02
    g.inputs["Color"].default_value = (0.95, 0.95, 0.97, 1.0)
    nt.links.new(_ripple_normal(nt), g.inputs["Normal"])
    age = _attr(nt, "fx_age", "OBJECT").outputs["Fac"]
    on = _math(nt, "MULTIPLY", _math(nt, "GREATER_THAN", age, 0.0), _math(nt, "EXPONENT", _math(nt, "MULTIPLY", age, -0.9)))
    fres = N.new("ShaderNodeFresnel")
    fres.inputs["IOR"].default_value = 1.33
    tr = N.new("ShaderNodeBsdfTransparent")
    mx = N.new("ShaderNodeMixShader")
    nt.links.new(_math(nt, "MULTIPLY", on, fres.outputs[0], clamp=True), mx.inputs["Fac"])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(g.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def key_ripples(ob, crossing_frame, line_pt, line_dir, frames):
    """Les attributs d'objet des rides : la ligne de la roue (repère local de l'objet) et l'âge en clés."""
    inv = ob.matrix_world.inverted()
    lp = inv @ _V(line_pt)
    ld = (inv.to_3x3() @ _V((line_dir[0], line_dir[1], 0.0))).normalized()
    ob["fx_lx"], ob["fx_ly"], ob["fx_dx"], ob["fx_dy"] = lp.x, lp.y, ld.x, ld.y
    for f in (frames[0] - 1, frames[1] + 1):
        ob["fx_age"] = (f - crossing_frame) / FPS
        ob.keyframe_insert('["fx_age"]', frame=f)
    _linear(ob)


def _linear(ob):
    ad = ob.animation_data
    if not ad or not ad.action:
        return
    try:
        from motion import fcurves
        curves = fcurves(ad.action)
    except Exception:
        curves = getattr(ad.action, "fcurves", [])
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def inside_fn(ob):
    """(x, y) -> le point est-il au-dessus de la flaque `ob` ? Un rayon vertical lancé sur son maillage (la forme
    exacte : les flaques courbes de l'anneau comprises)."""
    Mi = ob.matrix_world.inverted()
    pts = [ob.matrix_world @ _V(c) for c in ob.bound_box]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    ztop = max(p.z for p in pts) + 1.0
    d = (Mi.to_3x3() @ _V((0.0, 0.0, -1.0))).normalized()

    def inside(x, y):
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        hit, *_ = ob.ray_cast(Mi @ _V((x, y, ztop)), d, distance=10.0)
        return hit
    return inside


def scene_puddles(ctx):
    """Les flaques posées par les scènes (objets « *puddle* », « fx_flaque* », « flaque_* ») : leur test de dedans,
    en monde."""
    out = []
    mine = set(o.name for o in ctx.coll.objects)
    for ob in ctx.scene.objects:
        if ob.type != "MESH" or ob.name in mine:
            continue
        if "puddle" in ob.name or ob.name.startswith(("fx_flaque", "flaque_")):
            out.append((inside_fn(ob), ob))
    return out


def add_puddle(ctx, wheel, frame, rx=0.9, ry=0.55, along=0.0, seed=0, zfn=None):
    """Une flaque sous la roue `wheel` (« BL », « FR »…) à l'image `frame` de la trajectoire du moment, allongée le
    long de la route ; décalée de `along` m vers l'avant de la voiture. Renvoie (ellipse, objet)."""
    pos, fwd, vel, wh, wv, slip, speed = pose_at(ctx.track, frame)
    c = wh[wheel]
    cx, cy = c[0] + fwd[0] * along, c[1] + fwd[1] * along
    z = c[2] - ctx.wheel_r
    ang = math.atan2(fwd[1], fwd[0])
    ob = _puddle_mesh(f"fx_flaque_{wheel}_{int(frame)}", cx, cy, z, rx, ry, ang, seed, zfn)
    ob.data.materials.append(mat_puddle())
    ctx.coll.objects.link(ob)
    ob.visible_shadow = False
    return (cx, cy, rx, ry, ang), ob


def ripple_layer(ctx, src):
    """Une couche de rides sur une flaque existante : la même forme, 1,5 mm au-dessus."""
    bpy = _bpy()
    ob = bpy.data.objects.new(f"fx_rides_{src.name}", src.data.copy())
    ob.matrix_world = src.matrix_world.copy()
    ob.location.z += 0.0015
    ob.data.materials.clear()
    ob.data.materials.append(mat_ripple())
    ctx.coll.objects.link(ob)
    camera_only(ob, glossy=False)
    return ob


# ---------------------------------------------------------------- les effets

def water(ctx, wet=1.0, puddles=(), drops=1.0, mist=1.0, mask=0.85, near=1.2, hide_old=True, splash=1.0,
          frames=None, seed=1, veil="bas"):
    """L'eau : voile d'embruns (gouttes + brume) derrière les quatre roues, proportionnel à la vitesse, plus dense
    en glisse ; gerbes aux flaques traversées (celles de la scène et celles de `puddles` : [(roue, image, rx, ry,
    décalage)] posées ici sous la roue) ; rides après le passage. hide_old : les anciennes gerbes en volume
    (« spray_* », sources des taches noires) sont retirées."""
    bpy = _bpy()
    if hide_old:
        for ob in ctx.scene.objects:
            if ob.name.startswith("spray_") and ob.type == "MESH":
                ob.hide_render = True
    ells = []
    for e, ob in scene_puddles(ctx):
        ells.append((e, ob, False))
    for spec in puddles:
        w, f, rx, ry, along = tuple(spec) + (0.9, 0.55, 0.0)[len(spec) - 2:]
        e, ob = add_puddle(ctx, w, f, rx, ry, along, seed=len(ells))
        ells.append((e, ob, True))
    d_all, m_all = wheel_spray(ctx.track, None, ctx.wheel_r, rate_drops=2400.0 * drops, rate_mist=190.0 * mist,
                               wet=wet, seed=seed, frames=frames, veil=veil)
    n_cross = 0
    sheets = []
    if ells:
        cross = puddle_crossings(ctx.track, [e for e, _, _ in ells])
        for k, c in enumerate(cross):
            dd, ss = puddle_splash(ctx.track, c, ctx.wheel_r, depth=splash, seed=seed * 31 + k, veil=veil)
            d_all += dd
            sheets += ss
            e, ob, mine = ells[c[3]]
            pos, fwd, vel, wh, wv, slip, speed = pose_at(ctx.track, c[0])
            target = ob if mine else ripple_layer(ctx, ob)
            key_ripples(target, c[0], wh[c[2]], fwd, ctx.frames)
            n_cross += 1
    od = emit(ctx, f"fx_gouttes_{ctx.plan}", d_all, "drops", mat_drop(), glossy=True)
    om = emit(ctx, f"fx_embruns_{ctx.plan}", m_all + sheets, "sprites", mat_spray(veil),
              mask=mask, near=near)
    log(f"eau : {len(d_all)} gouttes, {len(m_all)} sprites d'embruns, {len(sheets)} de nappe, {n_cross} traversées "
        f"de flaque sur {len(ells)} flaques")
    return od, om


def pack_spray(ctx, prefixes=("patrol", "van"), drops=0.2, mist=0.4, wet=0.8, mask=0.85, near=3.0, seed=61,
               max_rigs=8):
    """Les embruns des poursuivants : chaque rig (vide sans parent, l'avant vers +y local, celui de lieux.rig) qui
    roule reçoit quatre roues fictives (±0,8 m, ±1,45 m) et le même voile que la berline, plus léger. C'est la
    meute qui soulève l'eau derrière elle : la masse se lit à contre-jour."""
    sc = ctx.scene
    rigs = [o for o in sc.objects if o.type == "EMPTY" and o.parent is None and o.name.startswith(tuple(prefixes))
            and o.animation_data and o.animation_data.action]
    mid = ctx.track[len(ctx.track) // 2].pos
    rigs = sorted(rigs, key=lambda o: math.dist(tuple(o.matrix_world.translation)[:2], mid[:2]))[:max_rigs]
    if not rigs:
        return None
    keep = sc.frame_current
    samples = {r.name: [] for r in rigs}
    for f in range(ctx.frames[0] - 1, ctx.frames[1] + 2):
        sc.frame_set(f)
        for r in rigs:
            M = r.matrix_world
            o = M.translation
            fw = (M.to_3x3() @ _V((0.0, 1.0, 0.0)))
            fw = _norm((fw.x, fw.y, 0.0))
            rt = (fw[1], -fw[0], 0.0)
            wh = {n: (o.x + fw[0] * a + rt[0] * b, o.y + fw[1] * a + rt[1] * b, o.z + 0.36)
                  for n, a, b in (("FL", 1.45, -0.8), ("FR", 1.45, 0.8), ("BL", -1.45, -0.8), ("BR", -1.45, 0.8))}
            samples[r.name].append((f, tuple(o), fw, wh))
    sc.frame_set(keep)
    d_all, m_all = [], []
    for k, r in enumerate(rigs):
        tr = build_track(samples[r.name])
        if max(p.speed for p in tr) < 3.0:
            continue
        d, m = wheel_spray(tr, None, 0.36, rate_drops=2400.0 * drops, rate_mist=140.0 * mist, wet=wet, seed=seed + k)
        d_all += d
        m_all += m
    emit(ctx, f"fx_gouttes_meute_{ctx.plan}", d_all, "drops", mat_drop(), glossy=True)
    ob = emit(ctx, f"fx_embruns_meute_{ctx.plan}", m_all, "sprites",
              mat_spray(), mask=mask, near=near)
    log(f"eau de la meute : {len(rigs)} véhicules, {len(d_all)} gouttes, {len(m_all)} sprites")
    return ob


def gomme(ctx, slip_min=6.0, rate=100.0, brake=0.0, size=1.0, alpha=0.65, mask=0.9, near=1.0, hide=("fumee_pneus_",),
          carry=0.18, drag=1.3, life=(1.2, 1.8), color="#e6e4e8", seed=5):
    """La fumée des pneus en glisse (et au freinage si `brake`), en sprites : claire, prise par les lampes, qui
    reste derrière et se dissipe ; creusée dans le cône caméra-berline (mask). Les anciennes bouffées en volume
    (`hide`) sont retirées."""
    for ob in ctx.scene.objects:
        if ob.name.startswith(tuple(hide)) and ob.type == "MESH":
            ob.hide_render = True
    parts = tyre_smoke(ctx.track, ctx.wheel_r, slip_min, rate, brake, seed, size=size, alpha=alpha, carry=carry,
                       drag=drag, life=life)
    # le bord fondu d'un grand sprite de fumée ne voile pas : seul son cœur compte pour le cône (edge 0,15)
    ob = emit(ctx, f"fx_fumee_{ctx.plan}", parts, "sprites", mat_smoke(color),
              mask=mask, near=near, edge=0.15)
    log(f"gomme : {len(parts)} sprites de fumée")
    return ob


def _key_transform(ob, keys, frames):
    from mathutils import Euler
    for f in frames:
        x, y, z, rx, ry, rz = keys[f]
        ob.location = (x, y, z)
        ob.rotation_euler = Euler((rx, ry, rz), "XYZ")
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_euler", frame=f)


def _debris_mesh(kind, seed):
    """Un papier froissé (carré plié en deux pans), une feuille (losange courbé) ou un gobelet (tronc de cône
    ouvert), en code."""
    import bmesh
    bpy = _bpy()
    R = random.Random(seed)
    bm = bmesh.new()
    if kind == "gobelet":
        n, r0, r1, h = 14, 0.032, 0.045, 0.11
        bot = [bm.verts.new((r0 * math.cos(a), r0 * math.sin(a), 0.0)) for a in (i * math.tau / n for i in range(n))]
        top = [bm.verts.new((r1 * math.cos(a), r1 * math.sin(a), h)) for a in (i * math.tau / n for i in range(n))]
        for i in range(n):
            bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
        bm.faces.new(bot[::-1])
        col, rough = "#d9d4c8", 0.5
    elif kind == "feuille":
        w, L = 0.05, 0.16
        pts = [(0, -L / 2, 0), (w, -L / 6, 0.01), (w * 0.7, L / 4, 0.015), (0, L / 2, 0.0), (-w * 0.7, L / 4, 0.015),
               (-w, -L / 6, 0.01)]
        vs = [bm.verts.new(p) for p in pts]
        mid = bm.verts.new((0, 0, -0.006))
        for i in range(len(vs)):
            bm.faces.new((mid, vs[i], vs[(i + 1) % len(vs)]))
        col, rough = R.choice(["#6b5a2e", "#7a4a22", "#4f5a2a"]), 0.6
    else:
        s = R.uniform(0.18, 0.26)
        g = 4
        grid = [[bm.verts.new(((i / g - 0.5) * s, (j / g - 0.5) * s * 0.75,
                               0.025 * math.sin(i * 1.7 + j * 0.9 + seed) + 0.03 * abs(i / g - 0.5)))
                 for j in range(g + 1)] for i in range(g + 1)]
        for i in range(g):
            for j in range(g):
                bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
        col, rough = R.choice(["#d8d3c6", "#c9c2b0", "#e2ddd2"]), 0.75
    me = bpy.data.meshes.new(f"fx_{kind}_{seed}")
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.get(f"fx_{kind}_{col}")
    if not m:
        m = bpy.data.materials.new(f"fx_{kind}_{col}")
        nt, N, out = _nodes(m)
        p = N.new("ShaderNodeBsdfPrincipled")
        p.inputs["Base Color"].default_value = _lin(col)
        p.inputs["Roughness"].default_value = rough
        if kind != "gobelet":
            tl = N.new("ShaderNodeBsdfTranslucent")
            tl.inputs["Color"].default_value = _lin(col)
            mx = N.new("ShaderNodeMixShader")
            mx.inputs["Fac"].default_value = 0.25
            nt.links.new(p.outputs[0], mx.inputs[1])
            nt.links.new(tl.outputs[0], mx.inputs[2])
            nt.links.new(mx.outputs[0], out.inputs["Surface"])
        else:
            nt.links.new(p.outputs[0], out.inputs["Surface"])
    me.materials.append(m)
    ob = bpy.data.objects.new(me.name, me)
    return ob


def pick_near_lens(ctx, n=3, dist=(1.6, 5.0), lateral=(0.6, 2.2), seed=23, ground=None, frame=None):
    """Des points au sol près de l'objectif, à portée du sillage : à la trace de la berline à `lateral` m, à
    `dist` m de la caméra à l'image où elle y passe, et dans le cadre (hors des bandes d'habillage, 12 % en haut et
    15 % en bas, pour leur envol). Renvoie [(x, y, z, image de passage, distance à la trace)]."""
    rng = random.Random(seed)
    out = []
    tr = ctx.track
    tries = 0
    while len(out) < n and tries < 400:
        tries += 1
        i = rng.randrange(1, len(tr) - 1)
        p = tr[i]
        cp = ctx.cam_pos.get(p.frame, (None,))[0]
        if cp is None:
            continue
        side = rng.choice((-1.0, 1.0))
        lat = rng.uniform(*lateral)
        q = (p.pos[0] + p.right[0] * side * lat, p.pos[1] + p.right[1] * side * lat,
             (p.pos[2] if ground is None else ground) + 0.004)
        dc = math.dist(q[:2], cp[:2])
        if not (dist[0] <= dc <= dist[1]):
            continue
        # une caméra qui suit la berline roule ensuite vers l'objet levé : il ne doit jamais passer à moins de
        # 2,5 m de l'objectif (flou, plein cadre, il masquait la caisse)
        if min(math.dist(q, c[0]) for fr, c in ctx.cam_pos.items() if fr >= p.frame) < max(2.5, dist[0]):
            continue
        x, y, zz = ctx.view((q[0], q[1], q[2] + 0.6), p.frame)
        if not (0.1 < x < 0.9 and 0.15 < y < 0.88 and zz > 0):
            continue
        if any(math.dist(q[:2], o[:2]) < 1.2 for o in out):
            continue
        f, d = nearest_pass(tr, q)
        out.append((q[0], q[1], q[2], f, d))
    return out


def vol(ctx, n=3, kinds=("papier", "feuille", "gobelet"), dist=(1.6, 5.0), lateral=(0.6, 2.0), seed=23, spots=None):
    """Ce que le sillage lève : les objets « fx_papier_* » posés par la scène s'il y en a, sinon n objets légers
    posés ici près de l'objectif ; levés au passage, ils retombent."""
    frames = range(ctx.frames[0] - 1, ctx.frames[1] + 2)
    placed = [o for o in ctx.scene.objects if o.name.startswith("fx_papier_") and o.type == "MESH"]
    todo = []
    if placed and spots is None:
        spots = []
        for o in placed:
            p = tuple(o.matrix_world.translation)
            f, d = nearest_pass(ctx.track, p)
            spots.append((*p, f, d))
            todo.append((o, "papier", o.rotation_euler.z))
    else:
        spots = spots or pick_near_lens(ctx, n, dist, lateral, seed)
        for k in range(len(spots)):
            kind = kinds[k % len(kinds)]
            ob = _debris_mesh(kind, seed + k)
            ctx.coll.objects.link(ob)
            todo.append((ob, kind, None))
    for k, ((x, y, z, f, d), (ob, kind, rz)) in enumerate(zip(spots, todo)):
        pos, fwd, vel, *_ = pose_at(ctx.track, f)
        keys = debris_keys((x, y, z), frames, f, d, vel, seed=seed + k, kind=kind)
        if rz is not None:
            keys = {fr: (*v[:5], v[5] - keys[frames[0]][5] + rz) for fr, v in keys.items()}
        ob.parent = None
        ob.rotation_mode = "XYZ"
        _key_transform(ob, keys, frames)
        ob.visible_shadow = True
    log(f"vol : {len(spots)} objets levés par le sillage ({', '.join(f'{d:.1f} m' for *_, d in spots)} de la trace)")
    return spots


def companion_skip(pattern):
    return pattern + "band_"


def plots(ctx, pattern="cone_", radius=3.0, seed=29, companion=None, topple=True, height=0.75, label="plots"):
    """Les plots du barrage : chacun reçoit le souffle selon sa distance à la trace ; ceux du bord du trou
    basculent vers l'extérieur et glissent, les autres vacillent. companion(nom) -> nom d'un objet qui suit (la
    bande d'une balise) ; topple=False : ils plient et reviennent (balises souples)."""
    bpy = _bpy()
    frames = range(ctx.frames[0] - 1, ctx.frames[1] + 2)
    n_top = n_wob = 0
    for k, ob in enumerate(sorted([o for o in ctx.scene.objects if o.name.startswith(pattern) and o.type in ("MESH", "EMPTY")],
                                  key=lambda o: o.name)):
        if ob.parent is not None and ob.parent.name.startswith(pattern):
            continue
        if companion and ob.name.startswith(companion_skip(pattern)):
            continue
        mates = [ob] + ([o for o in [ctx.scene.objects.get(companion(ob.name))] if o is not None] if companion else [])
        base = ob.matrix_world.copy()
        p = tuple(base.translation)
        f, d = nearest_pass(ctx.track, p)
        pos, fwd, vel, wh, wv, slip, speed = pose_at(ctx.track, f)
        push = max(0.0, 1.0 - max(0.0, d - 0.9) / radius) * min(1.3, speed / 25.0)
        if not topple:
            push = min(push, 0.5)
        # vers l'extérieur de la trace
        q = (pos[0], pos[1])
        out = _norm((p[0] - q[0], p[1] - q[1], 0.0))
        out = _norm(_add(out, _mul(fwd, 0.6)))
        keys = topple_keys(frames, f, push, height=height, seed=seed + k)
        axis = _V((-out[1], out[0], 0.0))
        from mathutils import Matrix
        bases = {o.name: o.matrix_world.copy() for o in mates}
        for o in mates:
            o.animation_data_clear()
            o.parent = None
            o.rotation_mode = "XYZ"
        for fr in frames:
            th, sl = keys[fr]
            # bascule autour du bord du socle côté extérieur (0,18 m ; au pied pour une balise), glissement
            pivot = _V(p) + _V(out) * (0.18 if topple else 0.0)
            R = Matrix.Translation(pivot) @ Matrix.Rotation(th, 4, axis) @ Matrix.Translation(-pivot)
            for o in mates:
                o.matrix_world = Matrix.Translation(_V(out) * sl) @ R @ bases[o.name]
                o.keyframe_insert("location", frame=fr)
                o.keyframe_insert("rotation_euler", frame=fr)
        n_top += push > 0.55
        n_wob += push <= 0.55
    log(f"{label} : {n_top} basculent, {n_wob} vacillent")
    return n_top, n_wob


def swing_groups(ctx, groups, amp, freq=1.2, reach=7.0, seed=31, label="objets"):
    """Fait balancer des groupes d'objets au passage : groups [(objets, pivot, axe)] ; chaque groupe tourne d'un
    même angle autour de son axe passant par le pivot (une lanterne et son fil autour du crochet, une guirlande et
    ses ampoules autour de sa corde). L'amplitude `amp` (degrés) décroît avec la distance (3D) du groupe à la
    caisse qui passe et suit la vitesse ; le sens suit le souffle (vers l'avant de la voiture)."""
    from mathutils import Matrix
    frames = range(ctx.frames[0] - 1, ctx.frames[1] + 2)
    n = 0
    for k, (objs, pivot, axis) in enumerate(groups):
        objs = [o for o in objs if not (o.animation_data and o.animation_data.action)]
        if not objs:
            continue
        cen = [o.matrix_world.translation for o in objs]
        c = _V((sum(p.x for p in cen) / len(cen), sum(p.y for p in cen) / len(cen), sum(p.z for p in cen) / len(cen)))
        f, dxy = nearest_pass(ctx.track, (c.x, c.y))
        d = math.hypot(dxy, max(0.0, c.z - 0.7))
        if d > reach:
            continue
        pos, fwd, vel, wh, wv, slip, speed = pose_at(ctx.track, f)
        a = math.radians(amp) * (1.0 - d / reach) ** 1.5 * min(1.3, speed / 25.0)
        if a < math.radians(0.2):
            continue
        ax = _V(axis).normalized()
        # le souffle pousse vers l'avant de la voiture : le bas du groupe part dans ce sens
        lever = (c - _V(pivot))
        push = _V((fwd[0], fwd[1], 0.0))
        sgn = 1.0 if ax.cross(lever).dot(push) >= 0 else -1.0
        rng = random.Random(seed + k)
        ph, fq = rng.uniform(-0.06, 0.06), freq * rng.uniform(0.85, 1.15)
        bases = {o.name: o.matrix_world.copy() for o in objs}
        for o in objs:
            o.parent = None
            o.rotation_mode = "XYZ"
        for fr in frames:
            th = sgn * sway(fr / FPS, f / FPS + ph, a, fq)
            R = Matrix.Translation(pivot) @ Matrix.Rotation(th, 4, ax) @ Matrix.Translation(-_V(pivot))
            for o in objs:
                o.matrix_world = R @ bases[o.name]
                o.keyframe_insert("location", frame=fr)
                o.keyframe_insert("rotation_euler", frame=fr)
        n += 1
    log(f"tremble : {n} {label} balancés")
    return n


def tremble(ctx, specs, seed=31):
    """Ce qui bouge au passage, par motif de nom (préfixe ; « nom$ » : ce nom exact) : specs [(motif, amplitude °,
    fréquence Hz, mode, rayon m)] ; mode « pendule » (autour d'un axe horizontal au sommet de l'objet,
    perpendiculaire à la trace), « pied » (au pied), « corde » (une chaîne entre des poteaux : autour de la ligne de
    ses attaches, sa plus grande longueur au sommet) ou « torsion » (autour de z)."""
    n = 0
    tr = ctx.track
    for (pat, amp, freq, mode, reach) in specs:
        groups = []
        match = (lambda n: n == pat[:-1]) if pat.endswith("$") else (lambda n: n.startswith(pat))
        for ob in [o for o in ctx.scene.objects if match(o.name) and o.type == "MESH"]:
            pts = [ob.matrix_world @ _V(c) for c in ob.bound_box]
            cx, cy = sum(p.x for p in pts) / 8, sum(p.y for p in pts) / 8
            f, _ = nearest_pass(tr, (cx, cy))
            fwd = pose_at(tr, f)[1]
            if mode == "pendule":
                groups.append(([ob], (cx, cy, max(p.z for p in pts)), (fwd[1], -fwd[0], 0.0)))
            elif mode == "corde":
                dx = max(p.x for p in pts) - min(p.x for p in pts)
                dy = max(p.y for p in pts) - min(p.y for p in pts)
                groups.append(([ob], (cx, cy, max(p.z for p in pts)), (1.0, 0.0, 0.0) if dx > dy else (0.0, 1.0, 0.0)))
            elif mode == "pied":
                o0 = ob.matrix_world.translation
                groups.append(([ob], (o0.x, o0.y, min(p.z for p in pts)), (fwd[1], -fwd[0], 0.0)))
            else:
                groups.append(([ob], (cx, cy, min(p.z for p in pts)), (0.0, 0.0, 1.0)))
        n += swing_groups(ctx, groups, amp, freq, reach, seed, label=pat)
    return n


def hanging_groups(ctx):
    """Les choses suspendues de la rue des enseignes : chaque lanterne avec son fil et sa lampe, autour du haut du
    fil ; chaque guirlande avec ses ampoules, autour de sa corde."""
    sc = ctx.scene.objects
    groups = []
    for wire in [o for o in sc if o.name.startswith("lantern_wire_")]:
        k = wire.name[len("lantern_wire_"):]
        objs = [wire] + [o for o in (sc.get(f"lantern_{k}"), sc.get(f"lantern_{k}_down")) if o is not None]
        pts = [wire.matrix_world @ _V(c) for c in wire.bound_box]
        top = (sum(p.x for p in pts) / 8, sum(p.y for p in pts) / 8, max(p.z for p in pts))
        f, _ = nearest_pass(ctx.track, top)
        fwd = pose_at(ctx.track, f)[1]
        groups.append((objs, top, (fwd[1], -fwd[0], 0.0)))
    for fe in [o for o in sc if o.name.startswith("festoon_")]:
        tag = fe.name[len("festoon_"):]
        bulbs = [o for o in sc if o.name.startswith(f"bulb_{tag}_")]
        me = fe.data
        if not me.vertices:
            continue
        vs = [fe.matrix_world @ v.co for v in me.vertices]
        a = min(vs, key=lambda v: v.x)
        b = max(vs, key=lambda v: v.x)
        groups.append(([fe] + bulbs, tuple((a + b) / 2), tuple(b - a)))
    return groups


def rotor_wash(ctx, heli_pattern="heli", surface_z=None, reach=34.0, alpha=0.12, rate=40.0, flutter_specs=(), seed=37):
    """Le souffle des hélicoptères bas : sprites d'eau ou de poussière rabattus en anneau sous chacun (sur
    `surface_z`, l'eau ou le quai), et les objets souples (flutter_specs [(motif, amplitude °, rayon m)]) qui
    battent tant qu'un rotor est au-dessus."""
    bpy = _bpy()
    from mathutils import Matrix
    sc = ctx.scene
    helis = [o for o in sc.objects if o.name.startswith(heli_pattern) and o.type == "EMPTY" and o.parent is None]
    if not helis:
        helis = [o for o in sc.objects if o.name.startswith(heli_pattern) and o.parent is None]
    fr = list(range(ctx.frames[0] - 1, ctx.frames[1] + 2))
    tracks = {h.name: {} for h in helis}
    keep = sc.frame_current
    for f in fr:
        sc.frame_set(f)
        for h in helis:
            tracks[h.name][f] = tuple(h.matrix_world.translation)
    sc.frame_set(keep)
    parts = []
    z0 = surface_z if surface_z is not None else 0.0
    for k, h in enumerate(helis):
        parts += downwash(tracks[h.name], z0, set(fr), seed + k, rate, reach, alpha)
    ob = emit(ctx, f"fx_souffle_{ctx.plan}", parts, "sprites", mat_sprite("fx_brume_rotor", "#c6ccd8", 0.7, 0.3, 0.8),
              mask=0.9, near=1.5)
    n = 0
    for pat, amp, reach_o in flutter_specs:
        for j, o in enumerate([o for o in sc.objects if o.name.startswith(pat) and o.type == "MESH"]):
            if o.animation_data and o.animation_data.action:
                continue
            base = o.matrix_world.copy()
            pts = [base @ _V(c) for c in o.bound_box]
            c = _V((sum(p.x for p in pts) / 8, sum(p.y for p in pts) / 8, min(p.z for p in pts)))
            o.parent = None
            any_k = False
            for f in fr:
                g = 0.0
                for h in helis:
                    hp = _V(tracks[h.name][f])
                    dxy = math.hypot(hp.x - c.x, hp.y - c.y)
                    g = max(g, (1.0 - smoothstep(reach * 0.4, reach, hp.z - c.z)) * (1.0 - smoothstep(6.0, reach_o, dxy)))
                th = math.radians(amp) * g * flutter(f / FPS, 1.0, 2.2, j * 0.37)
                R = Matrix.Translation(c) @ Matrix.Rotation(th, 4, _V((1.0, 0.3, 0.0)).normalized()) @ Matrix.Translation(-c)
                o.matrix_world = R @ base
                o.keyframe_insert("location", frame=f)
                o.keyframe_insert("rotation_euler", frame=f)
                any_k = any_k or g > 0.01
            n += any_k
    log(f"rotors : {len(helis)} hélicoptères, {len(parts)} sprites de souffle, {n} objets qui battent")
    del bpy
    return ob


def etincelles(ctx, frame, joint=True, n=260, seed=17):
    """La gerbe sous la caisse, une fois dans le film, à l'image `frame` (où la trajectoire passe un joint : un
    joint d'acier en travers de la chaussée est posé sous le point de contact si `joint`)."""
    bpy = _bpy()
    parts = sparks(ctx.track, frame, ctx.wheel_r, n=n, seed=seed)
    ob = emit(ctx, f"fx_etincelles_{ctx.plan}", parts, "drops", mat_spark(), glossy=True)
    if ob:
        ob.visible_transmission = True
    if joint:
        import bmesh
        pos, fwd, vel, wh, *_ = pose_at(ctx.track, frame)
        z = min(c[2] for c in wh.values()) - ctx.wheel_r
        c = _add(pos, _mul(fwd, 1.25))
        right = (fwd[1], -fwd[0], 0.0)
        bm = bmesh.new()
        w, half = 0.22, 3.6
        quad = [_add(c, _add(_mul(right, sx * half), _mul(fwd, sy * w / 2))) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        vs = [bm.verts.new((q[0], q[1], z + 0.004)) for q in quad]
        bm.faces.new(vs)
        me = bpy.data.meshes.new("fx_joint_acier")
        bm.to_mesh(me)
        bm.free()
        m = bpy.data.materials.new("fx_joint_acier")
        nt, N, out = _nodes(m)
        p = N.new("ShaderNodeBsdfPrincipled")
        p.inputs["Base Color"].default_value = _lin("#3a3a3c")
        p.inputs["Metallic"].default_value = 0.9
        p.inputs["Roughness"].default_value = 0.35
        nt.links.new(p.outputs[0], out.inputs["Surface"])
        me.materials.append(m)
        jo = bpy.data.objects.new("fx_joint_acier", me)
        ctx.coll.objects.link(jo)
    log(f"étincelles : {len(parts)} points à l'image {frame}")
    return ob


def arret(ctx, stop_frame=None, drip=True, smoke=True, mask=0.55):
    """FIN : la fumée du freinage, emportée sur sa lancée, rattrape la voiture arrêtée et passe devant elle (légère,
    creusée devant la caisse) ; les gouttes qui tombent du bas de caisse une fois l'arrêt."""
    tr = ctx.track
    if stop_frame is None:
        stop_frame = next((p.frame for p in tr if p.speed < 0.3 and p.frame > tr[0].frame + 2), tr[-1].frame)
    out = []
    if smoke:
        parts = tyre_smoke(tr, ctx.wheel_r, slip_min=4.0, rate=70.0, brake=1.0, seed=41, size=1.1, alpha=0.45,
                           carry=0.75, drag=0.75, life=(3.0, 4.2))
        out.append(emit(ctx, f"fx_fumee_arret_{ctx.plan}", parts, "sprites",
                        mat_smoke(), mask=mask, near=0.9))
        log(f"arrêt : {len(parts)} sprites de fumée de freinage (arrêt à l'image {stop_frame})")
    if drip:
        p = tr[-1]
        pts = []
        right = p.right
        for (a, b) in ((2.15, -0.55), (2.15, 0.0), (2.15, 0.55), (0.9, -0.82), (-0.6, 0.82), (-2.2, 0.3)):
            q = _add(p.pos, _add(_mul(p.fwd, a), _mul(right, b)))
            pts.append((q[0], q[1], p.pos[2] + 0.28))
        ground = min(c[2] for c in p.wheels.values()) - ctx.wheel_r
        parts = drips(pts, (stop_frame - 2, ctx.frames[1] + 1), ground)
        out.append(emit(ctx, f"fx_gouttes_arret_{ctx.plan}", parts, "drops", mat_drop(), glossy=True))
        log(f"arrêt : {len(parts)} gouttes")
    return out


# ================================================================ les plans

def _budget(scene):
    """Les sprites se superposent : assez de rebonds transparents pour qu'aucun ne s'arrête en noir."""
    c = scene.cycles
    c.transparent_max_bounces = max(getattr(c, "transparent_max_bounces", 8), 96)


def hooked(build, plans):
    """Enveloppe le build d'une scène qui rend plusieurs plans (scene_a : OUV et P1) : le plan rendu, ses clés
    posées, reçoit ses interactions. Une seule ligne dans la scène, sans toucher à son corps."""
    def wrapped(plan=None, *a, **k):
        scene = build(plan, *a, **k)
        if plan in plans and scene is not None:
            dress(plan, scene)
        return scene
    wrapped.__doc__ = build.__doc__
    wrapped.__wrapped__ = build
    return wrapped


def dress(plan, scene=None, **opt):
    """Pose les interactions du plan (OUV, P1… FIN6), sur la trajectoire de la scène telle qu'elle est. Sans
    berline lisible, ou FILM3D_FX=0, ne fait rien."""
    if not enabled():
        log(f"{plan} : effets inactifs (FILM3D_FX=1 les active)")
        return None
    bpy = _bpy()
    ctx = Ctx(plan, scene)
    if not ctx.track or ctx.cam is None:
        log(f"{plan} : pas de berline « coupe » à quatre roues ou pas de caméra, aucun effet")
        return None
    recipe = RECIPES.get(plan)
    if recipe is None:
        log(f"{plan} : aucune recette")
        return ctx
    recipe(ctx, **opt)
    _budget(ctx.scene)
    ctx.scene.frame_set(ctx.scene.frame_current)
    n = len(ctx.coll.objects)
    log(f"{plan} : {n} objets d'effets")
    del bpy
    return ctx


def _t(ctx, u):
    """L'image à la fraction u du plan."""
    f0, f1 = ctx.frames
    return f0 + (f1 - f0) * u


def r_ouv(ctx, **o):
    # la menace qui monte : la berline file devant nous, l'eau derrière ses roues
    if enabled("eau"):
        # de dos à 8 m : le voile est entre l'objectif et elle, il reste bas et léger ; l'ornière de la scène
        # (fx_flaque) sous les roues gauches
        water(ctx, wet=0.7, drops=0.7, mist=0.45, mask=0.95, near=2.0)


def r_p1(ctx, **o):
    # la traque commence : de face, la gerbe de la flaque de la scène (fx_flaque) sous les roues droites, côté
    # caméra ; les embruns derrière la berline à contre-jour des phares de la patrouille ; les feuilles de papier
    # (fx_papier_*) levées quand elle les frôle
    if enabled("eau"):
        water(ctx, wet=0.8, mask=0.85, near=1.4, splash=1.3)


def r_p2(ctx, **o):
    # la maîtrise, le panache : la fumée de la glisse (toujours derrière elle, jamais entre elle et l'objectif),
    # l'eau chassée vers l'extérieur, les flaques de l'anneau, les balises de l'îlot frôlées qui plient, le cocotier
    # penché sous lequel elle passe
    if enabled("eau"):
        water(ctx, wet=0.9, mist=1.2, mask=0.9, near=1.5)
        for ob in ctx.scene.objects:
            if ob.name.startswith("spray_trail_"):
                ob.hide_render = True


def r_p3(ctx, **o):
    # le piège, ça passe de justesse : à 110 km/h l'eau gicle des flaques du premier plan, les plots du trou
    # s'envolent, les enseignes et les guirlandes tremblent
    if enabled("eau"):
        water(ctx, wet=0.9, mask=0.9, near=1.2)


def r_p4(ctx, **o):
    # le nombre qui écrase : à la longue focale, le voile d'embruns de la berline à contre-jour de la meute
    if enabled("eau"):
        water(ctx, wet=0.8, mist=1.3, mask=0.8, near=3.0)
        pack_spray(ctx, near=3.0)


def r_p5(ctx, **o):
    # l'escalade, le ciel s'en mêle : la fumée de la glisse qui se voit, l'eau, le souffle du rotor sur le quai
    if enabled("eau"):
        water(ctx, wet=0.8, mask=0.85, near=1.2)


def r_p6(ctx, **o):
    # la démesure, plus d'issue : l'eau à 120 km/h, les rotors rabattent l'eau de la lagune, l'unique gerbe
    # d'étincelles du film au joint d'acier de la jetée
    if enabled("eau"):
        water(ctx, wet=0.8, mask=0.85, near=1.2)
        pack_spray(ctx, near=2.0)


def r_fin(ctx, **o):
    # le silence, la reddition : la fumée du freinage rattrape la voiture et passe devant, les gouttes tombent
    if enabled("eau"):
        water(ctx, wet=0.6, mask=0.85, near=0.8)


def r_fin6(ctx, **o):
    # la consécration : les rotors rabattent l'eau autour de la pointe, la fumée résiduelle
    pass


def r_banc(ctx, puddle_t=0.85, **o):
    # le banc : une flaque sous la roue avant gauche (côté caméra rase), la glisse de la courbe
    if enabled("eau"):
        water(ctx, wet=1.0, puddles=[("FL", ctx.frames[0] + puddle_t * FPS, 1.1, 0.6, 0.3)], mask=0.85, near=1.2)


RECIPES = {"OUV": r_ouv, "P1": r_p1, "P2": r_p2, "P3": r_p3, "P4": r_p4, "P5": r_p5, "P6": r_p6, "FIN": r_fin,
           "FIN6": r_fin6, "BANC": r_banc}
