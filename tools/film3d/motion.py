# Le mouvement des plans : des clés calculées à partir de la trajectoire, sans physique simulée, pour que le poids
# se sente. Le calcul est en Python pur (testable sans Blender : test_motion.py) ; la couche qui pose les clés
# (key_vehicle, key_camera, key_searchlight, flash_bars, spin_rotors) n'importe bpy qu'à l'appel.
#
#   import motion as M
#   poses = M.sample(pos, slip=slip, frames=range(0, 30), wheel_r=hero["wheel_r"])   # pos(t) -> (x, y)
#   M.key_vehicle(hero_rig, poses, wheels=L.hero_wheels(hero_rig), ground=sol)
#
# Repère et conventions : ceux de lieux.put. Le cap en degrés, 0 = l'avant vers +y, positif vers la gauche (-x).
# Roulis positif : la caisse penche à droite ; tangage positif : l'avant monte ; braquage positif : à gauche.
# Le temps t en secondes, t = 0 à la première image du plan (image F0 = 1 dans Blender), 24 images par seconde.
#
# Ce que donne sample(), image par image : la vitesse, les accélérations longitudinale et latérale (dérivées
# numériques lissées), la distance parcourue et la rotation des roues (distance / rayon), le braquage des roues
# avant (géométrie d'Ackermann plus la dérive : contre-braquage en glisse), le transfert de masse (roulis selon
# l'accélération latérale, tangage selon la longitudinale, bornés, en réponse du second ordre : la caisse suit
# avec ~0,15 s de retard et dépasse un peu, elle « s'assoit »), et un petit bruit de suspension lié à la vitesse.
#
# La dynamique (FILM3D_DYN, active par défaut ; FILM3D_DYN=0 rend exactement les clés d'avant) : chaque véhicule a
# son réglage (CHASSIS : la berline souple, la patrouille ferme, le fourgon haut), retrouvé par key_vehicle sur le
# nom du rig ; la caisse répond au transfert de masse et, par quatre coins sur ressorts, au relief (le sol passé à
# key_vehicle, ses ressauts, un grain de route), avec un léger désordre d'un véhicule à l'autre (graine de sample) ;
# les roues restent dans leurs passages (jeu mesuré, CHASSIS[...]["arch"]). key_object penche les aéronefs selon
# leur accélération (aircraft_attitude) ; key_camera ajoute l'opérateur (camera_operator) selon le type de caméra.
import math
import os
import random

FPS = 24.0
F0 = 1                      # l'image Blender du temps 0

ROLL_PER_G = 6.0            # degrés de roulis par g d'accélération latérale (la borne arrive à 1 g)
PITCH_PER_G = 3.2           # degrés de tangage par g d'accélération longitudinale
ROLL_MAX, PITCH_MAX = 6.0, 3.0
SUSP_HZ, SUSP_ZETA = 1.6, 0.55   # la caisse sur ses ressorts : ~0,15 s pour 63 %, ~12 % de dépassement
STEER_LAG = 0.06            # s : les mains au volant
STEER_MAX = 35.0
STEER_RATE = 60.0           # degrés par seconde aux roues (dynamique) : un contre-braquage vif, pas un claquement
G = 9.81


def t_of(frame, f0=F0, fps=FPS):
    return (frame - f0) / fps


def smoothstep(a, b, x):
    if b == a:
        return 1.0 if x >= b else 0.0
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * (3.0 - 2.0 * u)


def soft_clamp(x, bound):
    return bound * math.tanh(x / bound)


def soft_limit(x, bound, knee=0.7):
    """Linéaire jusqu'à knee × bound, puis une épaule douce (tanh) qui ne dépasse jamais bound."""
    k = knee * bound
    if abs(x) <= k:
        return x
    return math.copysign(k + (bound - k) * math.tanh((abs(x) - k) / (bound - k)), x)


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def heading_of(vx, vy):
    """Le cap (convention de lieux.put) d'une direction (vx, vy)."""
    return math.degrees(math.atan2(-vx, vy))


def _unwrap(prev, ang):
    while ang - prev > 180.0:
        ang -= 360.0
    while ang - prev < -180.0:
        ang += 360.0
    return ang


def kinematics(pos, t, h=1.0 / 48.0):
    """Vitesse (vx, vy), accélération (ax, ay) en t, par différences centrées ; l'accélération est lissée sur
    ±h (poids 1-2-1), pour qu'un raccord d'arcs ne donne pas un pic d'une image."""
    def vel(u):
        a, b = pos(u + h / 2), pos(u - h / 2)
        return ((a[0] - b[0]) / h, (a[1] - b[1]) / h)

    def acc(u):
        a, b = vel(u + h / 2), vel(u - h / 2)
        return ((a[0] - b[0]) / h, (a[1] - b[1]) / h)

    v = vel(t)
    a = [acc(t + k * h) for k in (-1, 0, 1)]
    ax = 0.25 * a[0][0] + 0.5 * a[1][0] + 0.25 * a[2][0]
    ay = 0.25 * a[0][1] + 0.5 * a[1][1] + 0.25 * a[2][1]
    return v, (ax, ay)


def bumps(s, seed=0.0):
    """Le relief de la chaussée sous la voiture, en fonction de la distance parcourue : somme de sinus de
    longueurs d'onde premières entre elles, dans [-1, 1]."""
    return (0.5 * math.sin(2 * math.pi * s / 3.1 + 1.3 + seed) + 0.3 * math.sin(2 * math.pi * s / 1.7 + 0.4 + 2 * seed)
            + 0.2 * math.sin(2 * math.pi * s / 5.3 + 2.1 + 3 * seed))


class _Spring:
    """Une réponse du second ordre (pulsation w, amortissement z), intégrée à pas fixe."""

    def __init__(self, hz, zeta, x0=0.0):
        self.w, self.z, self.x, self.v = 2 * math.pi * hz, zeta, x0, 0.0

    def step(self, target, dt):
        a = self.w * self.w * (target - self.x) - 2 * self.z * self.w * self.v
        self.v += a * dt
        self.x += self.v * dt
        return self.x


def dyn_on():
    """La dynamique est-elle active ? (FILM3D_DYN=0 : les clés d'avant, à l'identique)"""
    return os.environ.get("FILM3D_DYN", "1").strip().lower() not in ("0", "off", "non", "false", "no")


# ---------------------------------------------------------------- la caisse sur ses ressorts, par véhicule
#
# roll_per_g, pitch_per_g : degrés par g (transfert de masse) ; *_max : bornes douces ; *_hz, *_zeta : la caisse
# sur ses ressorts (fréquence propre, amortissement : 0,3 dépasse de 37 % puis de 14 %, deux rebonds) ; corner_* :
# chaque coin sur son ressort, qui suit le sol avec un amortisseur (vitesse relative) ; road : le grain de route
# (m, longues ondes que la caisse suit) ; driver : les corrections du conducteur (g, gaz et volant), qui font que
# deux véhicules d'une meute ne bougent pas ensemble ; squat : la caisse qui se tasse sous le transfert (m par
# degré de tangage) ; heave_up/down : bornes du pompage (m) ; arch : le jeu vertical mesuré entre le haut du pneu
# et le passage de roue (diag/dyn_arches.py), que la caisse ne mange jamais ; ext : la détente d'un ressort (m) ; track : la voie (m) ; jitter : le
# désordre d'un exemplaire à l'autre (fraction, tirée de la graine).
CHASSIS = {
    # une grosse berline des années 60 : souple, lente, elle s'assoit et flotte
    "hero": dict(roll_per_g=6.4, roll_max=6.5, pitch_per_g=2.7, pitch_max=3.2, roll_hz=1.1, roll_zeta=0.32,
                 pitch_hz=1.6, pitch_zeta=0.35, corner_hz=1.25, corner_zeta=0.35, road=0.007, driver=0.025,
                 squat=0.006, heave_up=0.05, heave_down=0.03, arch=(0.055, 0.06), ext=0.12, track=1.55, jitter=0.0, steer_lag=0.07),
    # la patrouille : plus ferme, plus vive
    "patrol": dict(roll_per_g=4.6, roll_max=5.0, pitch_per_g=2.1, pitch_max=2.6, roll_hz=1.45, roll_zeta=0.42,
                   pitch_hz=1.5, pitch_zeta=0.40, corner_hz=1.55, corner_zeta=0.42, road=0.006, driver=0.04,
                   squat=0.004, heave_up=0.045, heave_down=0.03, arch=0.03, ext=0.09, track=1.51, jitter=0.12, steer_lag=0.05),
    # le fourgon : haut, lourd, il roule beaucoup et tangue lentement
    "van": dict(roll_per_g=8.0, roll_max=7.5, pitch_per_g=2.6, pitch_max=3.0, roll_hz=1.0, roll_zeta=0.30,
                pitch_hz=1.1, pitch_zeta=0.32, corner_hz=1.15, corner_zeta=0.32, road=0.009, driver=0.04,
                squat=0.006, heave_up=0.07, heave_down=0.035, arch=0.075, ext=0.12, track=1.68, jitter=0.12, steer_lag=0.08),
}


class Poses(list):
    """La liste des poses de sample() (des dict, comme avant) ; elle garde l'historique cinématique fin (pas de
    1/240 s) pour que key_vehicle refasse la caisse avec le réglage du véhicule et le relief du sol (rebody)."""
    hist = None
    meta = None


def sample(pos, frames=range(0, 30), slip=None, heading=None, wheel_r=0.33, wheelbase=2.9, front=None, f0=F0,
           fps=FPS, noise=1.0, seed=0.0, warmup=0.6, roll_per_g=ROLL_PER_G, pitch_per_g=PITCH_PER_G, chassis=None):
    """Les poses d'un véhicule image par image.

    Dynamique active (dyn_on) : la caisse selon le réglage `chassis` (CHASSIS, la berline par défaut ;
    key_vehicle le refait selon le véhicule) ; x, y, cap, vitesse, roues et braquage sont ceux d'avant.
    roll_per_g et pitch_per_g ne servent qu'aux clés d'avant (FILM3D_DYN=0)."""
    if not dyn_on():
        return _sample_legacy(pos, frames, slip, heading, wheel_r, wheelbase, front, f0, fps, noise, seed, warmup,
                              roll_per_g, pitch_per_g)
    front = wheelbase / 2 if front is None else front
    frames = list(frames)
    t_first, t_last = t_of(frames[0], f0, fps), t_of(frames[-1], f0, fps)
    dt = 1.0 / (fps * 10)
    t = t_first - warmup
    n_steps = int(round((t_last - t) / dt))
    dist, prev_p, prev_travel, prev_head = 0.0, pos(t), None, None
    want = {round(t_of(f, f0, fps) / dt): f for f in frames}
    base_step = round(t / dt)
    hist = []
    for i in range(n_steps + 1):
        t = (base_step + i) * dt
        p = pos(t)
        dist += math.hypot(*_sub(p, prev_p)) if i else 0.0
        prev_p = p
        (vx, vy), (ax, ay) = kinematics(pos, t)
        speed = math.hypot(vx, vy)
        if speed > 1e-6:
            ux, uy = vx / speed, vy / speed
            travel = heading_of(vx, vy)
        else:
            ux, uy = 0.0, 1.0
            travel = prev_travel if prev_travel is not None else 0.0
        if prev_travel is not None:
            travel = _unwrap(prev_travel, travel)
        prev_travel = travel
        a_long = ax * ux + ay * uy
        a_lat = ux * ay - uy * ax
        curv = a_lat / (speed * speed) if speed > 0.5 else 0.0
        if heading is not None:
            head = heading(t)
            if prev_head is not None:
                head = _unwrap(prev_head, head)
        else:
            head = travel + (slip(t) if slip else 0.0)
        prev_head = head
        beta = math.radians(travel - head)
        yaw_rate = speed * curv
        if heading is not None or slip:
            h2 = (heading(t + dt) if heading is not None else heading_of(*kinematics(pos, t + dt)[0])
                  + (slip(t + dt) if slip else 0.0))
            yaw_rate = math.radians(_unwrap(head, h2) - head) / dt
        vxb, vyb = speed * math.cos(beta), speed * math.sin(beta) + yaw_rate * front
        steer_t = math.degrees(math.atan2(vyb, vxb)) if speed > 0.5 else 0.0
        steer_t = max(-STEER_MAX, min(STEER_MAX, steer_t))
        hist.append((base_step + i, t, p[0], p[1], head, travel, speed, a_long, a_lat, curv, dist, steer_t))
    out = Poses()
    out.hist = hist
    out.meta = dict(want=want, dt=dt, seed=seed, wheel_r=wheel_r, wheelbase=wheelbase, front=front, noise=noise)
    for (k, t, x, y, head, travel, speed, a_long, a_lat, curv, dist, steer) in hist:
        if k in want:
            out.append(dict(frame=want[k], t=t, x=x, y=y, heading=head, travel=travel, speed=speed, a_long=a_long,
                            a_lat=a_lat, curvature=curv, dist=dist, spin=dist / wheel_r, steer=steer, roll=0.0,
                            pitch=0.0, heave=0.0))
    return rebody(out, chassis or "hero")


def _jit(rng, j):
    return 1.0 + j * (2.0 * rng.random() - 1.0)


def _road_waves(rng, amp):
    """Le grain de route d'une trace de roues : des ondes longues (13 à 37 m : la caisse les suit) et courtes (2 à
    6 m : à peine filtrées à faible vitesse), phases tirées."""
    waves = [(37.0, 0.45), (23.0, 0.35), (13.0, 0.25), (5.9, 0.12), (2.7, 0.06)]
    return [(lam, amp * a, rng.uniform(0, 2 * math.pi)) for lam, a in waves]


def _wave(ws, s):
    return sum(a * math.sin(2 * math.pi * s / lam + ph) for lam, a, ph in ws)


def _seg_dist(p, a, b):
    """(distance signée le long de la normale, position le long du segment 0..1) d'un point à une ligne."""
    ex, ey = b[0] - a[0], b[1] - a[1]
    n2 = ex * ex + ey * ey
    u = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / n2
    return ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / math.sqrt(n2), u


def joint_height(p, joints, half=1.5):
    """La hauteur ajoutée par les ressauts sous le point p : joints = [((x0, y0), (x1, y1), h[, demi-longueur])],
    une bosse en cosinus de `h` m (négatif : un creux) sur 2 × demi-longueur m (1,5 par défaut : un raccord de
    dalle, un dos d'âne ; un joint vif de quelques centimètres ne se voit pas dans la caisse, elle le filtre),
    en travers de la route, de (x0, y0) à (x1, y1)."""
    z = 0.0
    for j in joints or ():
        a, b, h = j[:3]
        w = j[3] if len(j) > 3 else half
        d, u = _seg_dist(p, a, b)
        if -0.05 <= u <= 1.05 and abs(d) < w:
            z += h * 0.5 * (1.0 + math.cos(math.pi * d / w))
    return z


def default_corners(wheelbase=2.9, front=None, track=1.5):
    """Les quatre coins (x à droite, y vers l'avant, depuis le centre du rig) d'un véhicule sans roues connues."""
    front = wheelbase / 2 if front is None else front
    return [(-track / 2, front), (track / 2, front), (-track / 2, front - wheelbase), (track / 2, front - wheelbase)]


def corner_dz(pose, corners):
    """La descente (m, négative : la caisse s'approche du pneu) de la caisse au-dessus de chaque coin, pour une pose
    (roulis positif : la droite descend ; tangage positif : l'avant monte)."""
    tr, tp = math.tan(math.radians(pose["roll"])), math.tan(math.radians(pose["pitch"]))
    return [pose["heave"] + y * tp - x * tr for x, y in corners]


def rebody(poses, chassis="hero", ground=None, corners=None, joints=None, seed=None):
    """Refait la caisse (roulis, tangage, pompage) des poses de sample() pour un réglage (CHASSIS ou un dict), un
    sol `ground(x, y) -> (z, pente)` et ses ressauts `joints` ; `corners` : les coins des roues (x à droite, y vers
    l'avant, m, depuis le centre du rig). Position, cap, roues et braquage ne changent pas. Sans historique (des
    poses faites à la main), rend les poses telles quelles."""
    hist = getattr(poses, "hist", None)
    if not hist:
        return poses
    meta = poses.meta
    base = CHASSIS.get(chassis, CHASSIS["hero"]) if isinstance(chassis, str) else dict(chassis)
    kind = chassis if isinstance(chassis, str) else "custom"
    seed = meta["seed"] if seed is None else seed
    rng = random.Random(f"{kind}:{float(seed):.3f}")
    j = base["jitter"]
    c = dict(base)
    for k in ("roll_per_g", "pitch_per_g", "roll_hz", "pitch_hz", "corner_hz"):
        c[k] = base[k] * _jit(rng, j)
    for k in ("roll_zeta", "pitch_zeta", "corner_zeta"):
        c[k] = base[k] * _jit(rng, j * 1.2)
    if corners is None:
        corners = default_corners(meta["wheelbase"], meta["front"], c["track"])
    corners = [tuple(q) for q in corners]
    left = [i for i, q in enumerate(corners) if q[0] < 0]
    right = [i for i, q in enumerate(corners) if q[0] >= 0]
    fy = max(q[1] for q in corners)
    frt = [i for i, q in enumerate(corners) if q[1] > fy - 0.5]
    rear = [i for i, q in enumerate(corners) if i not in frt]
    xs = [q[0] for q in corners]
    track = (max(xs) - min(xs)) or c["track"]
    wb = (fy - min(q[1] for q in corners)) or meta["wheelbase"]
    noise = meta["noise"]
    # le grain de route : la trace de droite reprend celle de gauche, un peu décalée (une route n'a pas deux reliefs
    # indépendants à 1,5 m l'un de l'autre)
    wl = _road_waves(rng, c["road"] * noise)
    waves = {"L": wl, "R": [(lam, a, ph + rng.uniform(-0.6, 0.6)) for lam, a, ph in wl]}
    # les corrections du conducteur : deux sinus lents chacun (gaz, volant), en g
    drv = [(rng.uniform(0.5, 0.9), rng.uniform(1.1, 1.7), rng.uniform(0, 6.3), rng.uniform(0, 6.3)) for _ in range(2)]

    def driver(k, t, speed):
        f1, f2, p1, p2 = drv[k]
        return c["driver"] * noise * min(1.0, speed / 15.0) * (0.65 * math.sin(2 * math.pi * f1 * t + p1)
                                                              + 0.35 * math.sin(2 * math.pi * f2 * t + p2))

    dt = meta["dt"]
    want = meta["want"]
    wr, ww = 2 * math.pi * c["roll_hz"], 2 * math.pi * c["pitch_hz"]
    wc = 2 * math.pi * c["corner_hz"]
    # le sol sous chaque coin, d'abord pour tout l'historique (l'amortisseur lit sa vitesse)
    grounds, inputs = [], []
    for (k, t, x, y, head, travel, speed, a_long, a_lat, curv, dist, steer) in hist:
        h = math.radians(head)
        fx, fy_ = -math.sin(h), math.cos(h)
        rx, ry = fy_, -fx
        g, u = [], []
        for (cx, cy) in corners:
            px, py = x + rx * cx + fx * cy, y + ry * cx + fy_ * cy
            z = ground(px, py)[0] if ground else 0.0
            g.append(z)
            u.append(z + (joint_height((px, py), joints) if joints else 0.0)
                     + _wave(waves["L" if cx < 0 else "R"], dist + cy))
        grounds.append(g)
        inputs.append(u)
    roll = pitch = steer_s = None
    vr = vp = 0.0
    zc = list(inputs[0])
    vc = [(inputs[1][i] - inputs[0][i]) / dt if len(inputs) > 1 else 0.0 for i in range(len(corners))]
    by_k = {}
    for n, (k, t, x, y, head, travel, speed, a_long, a_lat, curv, dist, steer) in enumerate(hist):
        # au-delà de 2 g, ce n'est pas une voiture qui freine mais une trajectoire qui part lancée (l'arrêt avant
        # la première image, la vitesse pleine ensuite) : la caisse n'en voit rien
        if math.hypot(a_long, a_lat) > 2.0 * G:
            a_long = a_lat = 0.0
        roll_t = soft_limit(c["roll_per_g"] * (a_lat / G + driver(1, t, speed)), c["roll_max"])
        pitch_t = soft_limit(c["pitch_per_g"] * (a_long / G + driver(0, t, speed)), c["pitch_max"])
        if roll is None:
            roll, pitch = roll_t, pitch_t
        # les mains au volant : un premier ordre (le retard du conducteur), la vitesse de braquage bornée (STEER_RATE)
        # et, presque à l'arrêt, les roues qui restent où elles sont (une voiture arrêtée ne redresse pas ses roues)
        if steer_s is None:
            steer_s = steer
        else:
            grip = smoothstep(0.3, 2.5, speed)
            d = (steer - steer_s) * min(1.0, dt / c["steer_lag"]) * grip
            steer_s += max(-STEER_RATE * dt, min(STEER_RATE * dt, d))
        # la caisse sur ses ressorts : l'accélération rappelle vers la cible, l'amortisseur freine sa vitesse
        vr += (wr * wr * (roll_t - roll) - 2 * c["roll_zeta"] * wr * vr) * dt
        roll += vr * dt
        vp += (ww * ww * (pitch_t - pitch) - 2 * c["pitch_zeta"] * ww * vp) * dt
        pitch += vp * dt
        # les coins : chacun suit son sol (relief, ressauts, grain), l'amortisseur sur la vitesse relative ; les
        # roues, elles, restent sur le sol vrai : ce qui compte est l'écart de la caisse à ce sol
        u, g = inputs[n], grounds[n]
        if n:
            for i in range(len(u)):
                du = (u[i] - inputs[n - 1][i]) / dt
                vc[i] += (wc * wc * (u[i] - zc[i]) + 2 * c["corner_zeta"] * wc * (du - vc[i])) * dt
                zc[i] += vc[i] * dt
        if k in want:
            by_k[k] = (roll, pitch, [zc[i] - g[i] for i in range(len(u))], steer_s)
    for ps in poses:
        k = round(ps["t"] / dt)
        roll_i, pitch_i, rel, ps["steer"] = by_k[k]
        mean = lambda idx: sum(rel[i] for i in idx) / max(1, len(idx))  # noqa: E731
        roll_c = math.degrees(math.atan2(mean(left) - mean(right), track)) if left and right else 0.0
        pitch_c = math.degrees(math.atan2(mean(frt) - mean(rear), wb)) if frt and rear else 0.0
        # à l'accélération, l'arrière s'écrase et la caisse se tasse ; au freinage l'avant plonge, l'arrière se lève
        heave = sum(rel) / len(rel) - c["squat"] * max(0.0, pitch_i)
        ps["roll"] = soft_limit(roll_i + roll_c, c["roll_max"] + 0.5, 0.85)
        ps["pitch"] = soft_limit(pitch_i + pitch_c, c["pitch_max"] + 0.5, 0.85)
        ps["heave"] = max(-c["heave_down"], min(c["heave_up"], heave))
        # les roues dans leurs passages : la caisse ne descend jamais sur un pneu de plus que 80 % de son jeu. Elle se
        # soulève d'abord (le centre de tangage avance vers la roue chargée, la caisse se lève sur ses roues
        # délestées : l'anti-plongée et le cabrage d'un essieu arrière brisé), sans détendre aucun ressort de plus
        # que `ext` ; ce qui reste au-delà est réduit en douceur.
        fit_arches(ps, corners, [0.8 * a for a in arch_of(c, corners)], c["ext"])
    poses.meta = dict(meta, chassis=kind, corners=corners)
    return poses


def arch_of(c, corners):
    """Le jeu de chaque coin (m) : c["arch"], un nombre ou (avant, arrière)."""
    a = c["arch"]
    if not isinstance(a, (tuple, list)):
        return [a] * len(corners)
    fy = max(q[1] for q in corners)
    return [a[0] if q[1] > fy - 0.5 else a[1] for q in corners]


def fit_arches(ps, corners, lims, ext):
    """Garde chaque coin au-dessus de son pneu : la descente d'un coin (corner_dz) ne passe jamais `lims` (m), par
    une épaule douce à partir de 70 %. La caisse se soulève d'abord (sans détendre un ressort de plus que `ext`),
    puis roulis et tangage se réduisent s'il le faut. Modifie la pose."""
    def soft(comp, lim):
        k0 = 0.7 * lim
        return comp if comp <= k0 else k0 + (lim - k0) * math.tanh((comp - k0) / (lim - k0))
    dz = corner_dz(ps, corners)
    bound = [soft(-d, lim) for d, lim in zip(dz, lims)]
    need = max(-d - b for d, b in zip(dz, bound))
    if need <= 1e-12:
        return
    ps["heave"] += min(need, max(0.0, ext - max(dz)))
    dz = corner_dz(ps, corners)
    keep = 1.0
    for d, b in zip(dz, bound):
        tilt = d - ps["heave"]
        if -d > b + 1e-12 and tilt < 0.0:
            keep = min(keep, max(0.0, (-b - ps["heave"]) / tilt))
    if keep < 1.0:
        ps["roll"] *= keep
        ps["pitch"] *= keep


def _sample_legacy(pos, frames=range(0, 30), slip=None, heading=None, wheel_r=0.33, wheelbase=2.9, front=None,
                   f0=F0, fps=FPS, noise=1.0, seed=0.0, warmup=0.6, roll_per_g=ROLL_PER_G, pitch_per_g=PITCH_PER_G):
    """Les poses d'un véhicule image par image (les clés d'avant la dynamique, FILM3D_DYN=0).

    pos(t) -> (x, y) : la trajectoire du centre de la caisse, au sol.
    slip(t) -> degrés : la caisse par rapport à sa route (cap de la caisse - cap de la route ; une glisse à droite
    est négative : la caisse tourne plus à droite que sa route). Ou heading(t) -> degrés : le cap de la caisse.
    front : distance du centre à l'essieu avant (wheelbase / 2 par défaut). noise : 0 coupe le bruit de suspension.

    Renvoie une liste de dict (une par image) : frame, t, x, y, heading (la caisse), travel (la route), speed,
    a_long, a_lat (m/s², latérale positive vers la gauche), curvature (1/m, positive à gauche), dist (m),
    spin (rad, positif en avançant), steer, roll, pitch (degrés), heave (m)."""
    front = wheelbase / 2 if front is None else front
    frames = list(frames)
    t_first, t_last = t_of(frames[0], f0, fps), t_of(frames[-1], f0, fps)
    dt = 1.0 / (fps * 10)
    roll_s = pitch_s = steer_s = None
    out = []
    t = t_first - warmup
    n_steps = int(round((t_last - t) / dt))
    dist, prev_p, prev_travel, prev_head = 0.0, pos(t), None, None
    want = {round(t_of(f, f0, fps) / dt): f for f in frames}
    base_step = round(t / dt)
    for i in range(n_steps + 1):
        t = (base_step + i) * dt
        p = pos(t)
        dist += math.hypot(*_sub(p, prev_p)) if i else 0.0
        prev_p = p
        (vx, vy), (ax, ay) = kinematics(pos, t)
        speed = math.hypot(vx, vy)
        if speed > 1e-6:
            ux, uy = vx / speed, vy / speed
            travel = heading_of(vx, vy)
        else:
            ux, uy = 0.0, 1.0
            travel = prev_travel if prev_travel is not None else 0.0
        if prev_travel is not None:
            travel = _unwrap(prev_travel, travel)
        prev_travel = travel
        a_long = ax * ux + ay * uy
        a_lat = ux * ay - uy * ax                       # positive : vers la gauche de la route
        curv = a_lat / (speed * speed) if speed > 0.5 else 0.0
        if heading is not None:
            head = heading(t)
            if prev_head is not None:
                head = _unwrap(prev_head, head)
        else:
            head = travel + (slip(t) if slip else 0.0)
        prev_head = head
        beta = math.radians(travel - head)              # la route vue de la caisse (positif : à sa gauche)
        # le lacet de la caisse : sa dérivée, par différence avec l'image d'avant (sinon la courbure de la route)
        yaw_rate = speed * curv
        if heading is not None or slip:
            h2 = (heading(t + dt) if heading is not None else heading_of(*kinematics(pos, t + dt)[0])
                  + (slip(t + dt) if slip else 0.0))
            yaw_rate = math.radians(_unwrap(head, h2) - head) / dt
        # les roues avant visent la vitesse de l'essieu avant, vue de la caisse : la dérive, plus le lacet × front
        vxb, vyb = speed * math.cos(beta), speed * math.sin(beta) + yaw_rate * front
        steer_t = math.degrees(math.atan2(vyb, vxb)) if speed > 0.5 else 0.0
        steer_t = max(-STEER_MAX, min(STEER_MAX, steer_t))
        roll_t = soft_clamp(roll_per_g * a_lat / G, ROLL_MAX)       # virage à droite : a_lat < 0, roulis < 0 (à gauche)
        pitch_t = soft_clamp(pitch_per_g * a_long / G, PITCH_MAX)   # freinage : a_long < 0, l'avant plonge
        if roll_s is None:
            roll_s, pitch_s = _Spring(SUSP_HZ, SUSP_ZETA, roll_t), _Spring(SUSP_HZ, SUSP_ZETA, pitch_t)
            steer_s = steer_t
        roll = roll_s.step(roll_t, dt)
        pitch = pitch_s.step(pitch_t, dt)
        steer_s += (steer_t - steer_s) * min(1.0, dt / STEER_LAG)
        k = base_step + i
        if k in want:
            amp = noise * min(1.0, speed / 30.0)
            out.append(dict(
                frame=want[k], t=t, x=p[0], y=p[1], heading=head, travel=travel, speed=speed, a_long=a_long,
                a_lat=a_lat, curvature=curv, dist=dist, spin=dist / wheel_r, steer=steer_s,
                roll=max(-ROLL_MAX, min(ROLL_MAX, roll)) + 0.15 * amp * bumps(dist, seed + 1.0),
                pitch=max(-PITCH_MAX, min(PITCH_MAX, pitch)) + 0.12 * amp * bumps(dist * 1.3, seed + 2.0),
                heave=0.006 * amp * bumps(dist * 0.8, seed)))
    return out


def straight(x, y0, speed, accel=None):
    """Une trajectoire droite le long de +y, en x fixe : pos(t). `accel(t)` -> m/s² (0 par défaut), intégré."""
    if accel is None:
        return lambda t: (x, y0 + speed * t)
    prof = Profile(speed, accel)
    return lambda t: (x, y0 + prof.s(t))


class Profile:
    """Un profil de vitesse : v(0) = v0 et une accélération a(t), intégrés une fois (pas de 1/960 s, de -2 à
    +4 s) ; s(t) et v(t) lus par interpolation."""

    def __init__(self, v0, accel, t0=-2.0, t1=4.0, dt=1.0 / 960.0, vmin=0.0):
        self.t0, self.dt = t0, dt
        n = int((t1 - t0) / dt) + 1
        k0 = int(round(-t0 / dt))
        v, s = [0.0] * n, [0.0] * n
        v[k0] = v0
        for k in range(k0 + 1, n):
            v[k] = max(vmin, v[k - 1] + accel((k - 1 - k0) * dt + dt / 2) * dt)
            s[k] = s[k - 1] + (v[k - 1] + v[k]) / 2 * dt
        for k in range(k0 - 1, -1, -1):
            v[k] = max(vmin, v[k + 1] - accel((k + 1 - k0) * dt - dt / 2) * dt)
            s[k] = s[k + 1] - (v[k] + v[k + 1]) / 2 * dt
        self._v, self._s, self.k0 = v, s, k0

    def _lerp(self, arr, t):
        u = (t - self.t0) / self.dt
        k = max(0, min(len(arr) - 2, int(math.floor(u))))
        f = u - k
        return arr[k] * (1 - f) + arr[k + 1] * f

    def v(self, t):
        return self._lerp(self._v, t)

    def s(self, t):
        return self._lerp(self._s, t)


def min_gap(tracks, frames=range(0, 30), f0=F0, fps=FPS):
    """La plus petite distance entre les centres de deux véhicules sur le plan : tracks = {nom: pos(t)}.
    Renvoie (distance, image, nom1, nom2)."""
    best = (float("inf"), None, None, None)
    names = sorted(tracks)
    for f in frames:
        t = t_of(f, f0, fps)
        ps = {n: tracks[n](t) for n in names}
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                d = math.hypot(*_sub(ps[a], ps[b]))
                if d < best[0]:
                    best = (d, f, a, b)
    return best


def handheld(t, amp=0.6, rotor=0.12, seed=0.0):
    """La caméra à l'épaule : (dyaw, dpitch, droll en degrés, dx, dy, dz en m). Un bruit lent (0,4 à 1,3 Hz,
    d'amplitude `amp` degrés) et le souffle du rotor (8 Hz, `rotor` degrés)."""
    def wob(k, f1, f2, f3):
        return (0.55 * math.sin(2 * math.pi * f1 * t + 1.7 * k + seed) + 0.3 * math.sin(2 * math.pi * f2 * t + 0.9 * k)
                + 0.15 * math.sin(2 * math.pi * f3 * t + 2.3 * k + 2 * seed))

    buf = lambda k: math.sin(2 * math.pi * 7.9 * t + 1.1 * k + seed) * 0.6 + math.sin(2 * math.pi * 11.3 * t + k) * 0.4
    return (amp * wob(1, 0.41, 0.93, 1.31) + rotor * buf(1),
            amp * 0.8 * wob(2, 0.37, 0.87, 1.23) + rotor * buf(2),
            amp * 0.6 * wob(3, 0.29, 0.71, 1.17) + rotor * 0.5 * buf(3),
            0.012 * wob(4, 0.33, 0.77, 1.1), 0.012 * wob(5, 0.31, 0.81, 1.4), 0.008 * wob(6, 0.43, 1.03, 1.6))


def bar_phase(frame, period=12, offset=0):
    """Le clignotement des rampes : « corail » la première moitié de la période, « lilas » la seconde (2 Hz
    chacun à 24 images par seconde, comme le carré de la radio). `offset` décale un véhicule de la meute."""
    return "corail" if ((frame + offset) % period) < period // 2 else "lilas"


# ---------------------------------------------------------------- la couche Blender (bpy importé à l'appel)

def _clear(ob):
    if ob.animation_data and ob.animation_data.action:
        ob.animation_data.action = None


def rig_up(body, heading, name=None, extras=()):
    """Un véhicule posé à la main (une caisse seule, sans rig : la rue, le rond-point) mis sur un rig pour
    key_vehicle : un vide au sol sous la caisse, tourné de `heading` degrés (0 : +y, positif à gauche), qui devient
    le parent de la caisse et des `extras` (ses lumières posées à part), leurs places dans le monde gardées."""
    import bpy
    from mathutils import Matrix
    bpy.context.view_layer.update()
    loc = body.matrix_world.translation
    rig = bpy.data.objects.new(name or f"rig_{body.name}", None)
    bpy.context.scene.collection.objects.link(rig)
    rig.location = (loc.x, loc.y, 0.0)
    rig.rotation_euler = (0.0, 0.0, math.radians(heading))
    bpy.context.view_layer.update()
    inv = rig.matrix_world.inverted()
    for ob in (body, *extras):
        mw = ob.matrix_world.copy()
        ob.parent = rig
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.matrix_basis = inv @ mw
    rig["body"] = body.name
    return rig


def body_of(root):
    """La caisse d'un rig (lieux.rig, rig_up) : l'enfant nommé par root["body"] ; une copie de lieux.clone garde la
    propriété de sa source, sa caisse est l'enfant « copie:nom »."""
    name = root["body"]
    return next(c for c in root.children if c.name == name or c.name.endswith(":" + name))


SPIN_STEP = 0.8 * math.pi


def spin_steps(d_spin, limit=SPIN_STEP):
    """Le nombre de pas de clé d'une roue entre deux images : une rotation d'Euler « compatible » ne peut avancer
    de plus d'un demi-tour d'une clé à l'autre (au-delà, elle prend l'angle équivalent le plus proche, à rebours :
    à 120 km/h, 3,9 rad par image, les roues tournaient à l'envers à 2,4 rad par image). Au-delà de `limit`, on
    ajoute des clés entre les images."""
    return max(1, math.ceil(abs(d_spin) / limit))


def chassis_kind(root, body):
    """Le réglage de caisse d'un véhicule (CHASSIS) : la propriété « chassis » du rig ou de la caisse si elle est
    posée, sinon son nom (fourgon, patrouille, sinon la berline), sinon sa hauteur."""
    for ob in (root, body):
        k = ob.get("chassis") if ob is not None else None
        if k in CHASSIS:
            return k
    names = " ".join(str(n).lower() for n in (root.name, getattr(body, "name", ""), root.get("body", "")))
    if any(k in names for k in ("van", "fourgon")):
        return "van"
    if any(k in names for k in ("patrol", "police", "patrouille")):
        return "patrol"
    if root.get("height", 0.0) > 1.9:
        return "van"
    return "hero"


# les véhicules clés de la scène en cours, pour la caméra (camera_operator : la secousse d'un passage proche) :
# {(scène, rig): {image: (x, y, z)}}
TRACKS = {}


def _register(root, poses, ground):
    try:
        import bpy
        sc = bpy.context.scene.name
    except Exception:
        sc = ""
    TRACKS[(sc, root.name)] = {ps["frame"]: (ps["x"], ps["y"], (ground(ps["x"], ps["y"])[0] if ground else 0.0) + 0.7)
                               for ps in poses}


def scene_tracks():
    """Les trajectoires des véhicules clés dans la scène en cours : [{image: (x, y, z)}]."""
    try:
        import bpy
        sc = bpy.context.scene.name
    except Exception:
        sc = ""
    return [v for (s, _n), v in TRACKS.items() if s == sc]


def key_vehicle(root, poses, wheels=(), ground=None, pivot=(0.0, 0.0, 0.5), body=None, joints=None, chassis=None):
    """Pose les clés d'un véhicule déjà construit (un rig de lieux : root, son enfant body["body"]).

    Dynamique active (dyn_on) : la caisse est refaite (rebody) avec le réglage du véhicule (`chassis`, sinon
    chassis_kind), le relief de `ground` sous ses quatre roues et les ressauts `joints` ([((x0, y0), (x1, y1), h)],
    en travers de la route, repère du monde) ; position, cap, roues et braquage inchangés.

    Le rig porte la position, le cap et la pente du sol (`ground(x, y)` -> (z, pente en degrés), plat par défaut) ;
    la caisse (body) porte le roulis, le tangage et le pompage autour de `pivot` (repère du rig, m) ; les roues
    (`wheels`, enfants de la caisse) restent au sol, droites, et ne prennent que leur rotation et, à l'avant, le
    braquage. Les roues avant sont celles qui sont du côté de l'avant de la caisse. Un véhicule sans roues
    séparées (patrouilles, fourgon) penche tout entier : ses roues bougent avec la caisse. Remplace toutes les clés
    déjà posées (les clés de flou faites à la main) : le flou de mouvement vient de ces clés."""
    from mathutils import Matrix, Vector
    if body is None:
        body = body_of(root)
    for ob in (root, body, *wheels):
        _clear(ob)
    root.rotation_mode = body.rotation_mode = "XYZ"
    rest = body.get("motion_rest")
    if rest is None:
        rest = [list(r) for r in body.matrix_basis]
        body["motion_rest"] = [v for r in rest for v in r]
    else:
        rest = [list(rest[i * 4:i * 4 + 4]) for i in range(4)]
    B0 = Matrix(rest)
    fwd_b = (B0.to_3x3().inverted() @ Vector((0.0, 1.0, 0.0))).normalized()
    axle = Vector((0.0, 0.0, 1.0)).cross(fwd_b).normalized()        # l'axe de rotation des roues en avançant
    info = []
    for w in wheels:
        _clear(w)
        if "motion_rest" not in w:
            w["motion_rest"] = list(w.location)
        p_b = Vector(w["motion_rest"])
        info.append((w, p_b, p_b.dot(fwd_b) > 0.0))
        w.rotation_mode = "XYZ"
    c = Vector(pivot)
    if dyn_on() and getattr(poses, "hist", None):
        kind = chassis or chassis_kind(root, body)
        corners = None
        if len(info) >= 4:
            # les roues dans le repère du rig (x à droite, y vers l'avant), depuis le pivot
            corners = [((B0 @ p_b).x - c.x, (B0 @ p_b).y - c.y) for _w, p_b, _f in info]
        poses = rebody(poses, kind, ground=ground, corners=corners, joints=joints)
        r = [abs(p["roll"]) for p in poses]
        q = [p["pitch"] for p in poses]
        print(f"[motion] {root.name} ({kind}) : roulis jusqu'à {max(r):.1f}°, tangage {min(q):+.1f} à {max(q):+.1f}°, "
              f"pompage {min(p['heave'] for p in poses) * 100:+.1f} à {max(p['heave'] for p in poses) * 100:+.1f} cm, "
              f"braquage {min(p['steer'] for p in poses):+.1f} à {max(p['steer'] for p in poses):+.1f}°", flush=True)
    _register(root, poses, ground)
    prev_b, prev_w, prev_ps = None, {}, None
    for ps in poses:
        f = ps["frame"]
        z, slope = ground(ps["x"], ps["y"]) if ground else (0.0, 0.0)
        root.location = (ps["x"], ps["y"], z)
        root.rotation_euler = (math.radians(slope), 0.0, math.radians(ps["heading"]))
        root.keyframe_insert("location", frame=f)
        root.keyframe_insert("rotation_euler", frame=f)
        tilt = Matrix.Rotation(math.radians(ps["pitch"]), 4, "X") @ Matrix.Rotation(math.radians(ps["roll"]), 4, "Y")
        Mb = Matrix.Translation(c + Vector((0.0, 0.0, ps["heave"]))) @ tilt @ Matrix.Translation(-c) @ B0
        loc, rot, _s = Mb.decompose()
        e = rot.to_euler("XYZ", prev_b) if prev_b else rot.to_euler("XYZ")
        prev_b = e
        body.location, body.rotation_euler = loc, e
        body.keyframe_insert("location", frame=f)
        body.keyframe_insert("rotation_euler", frame=f)
        Mb_inv = Mb.inverted()
        n = spin_steps(ps["spin"] - prev_ps["spin"]) if prev_ps else 1
        for w, p_b, is_front in info:
            for k in range(1, n + 1):
                # les pas intermédiaires (n > 1) : la rotation seule, sur la caisse de l'image (écart de l'ordre du mm)
                u = k / n
                q = ps if k == n else {key: prev_ps[key] + (ps[key] - prev_ps[key]) * u for key in ("spin", "steer")}
                R = Matrix.Rotation(q["spin"], 4, axle)
                if is_front:
                    R = Matrix.Rotation(math.radians(q["steer"]), 4, "Z") @ R
                Mw = Mb_inv @ B0 @ Matrix.Translation(p_b) @ R
                wl, wr, _ = Mw.decompose()
                pe = prev_w.get(w.name)
                we = wr.to_euler("XYZ", pe) if pe else wr.to_euler("XYZ")
                prev_w[w.name] = we
                w.rotation_euler = we
                if k < n:
                    w.keyframe_insert("rotation_euler", frame=prev_ps["frame"] + (f - prev_ps["frame"]) * u)
            w.location = wl
            w.keyframe_insert("location", frame=f)
            w.keyframe_insert("rotation_euler", frame=f)
        prev_ps = ps
    return root


def rear_axle(pose, wheelbase=2.9):
    """Le milieu de l'essieu arrière d'une pose de sample() (x, y) : là où naît la fumée d'une glisse."""
    h = math.radians(pose["heading"])
    return pose["x"] + math.sin(h) * wheelbase / 2, pose["y"] - math.cos(h) * wheelbase / 2


def smoke_puffs(poses, wheelbase=2.9, slip_min=8.0, every=4):
    """Les bouffées de fumée d'une glisse : une toutes les `every` images tant que la caisse dérive de plus de
    `slip_min` degrés, posée à l'essieu arrière de cette image (elle reste où elle est née, donc derrière la
    voiture). Renvoie [(image de naissance, x, y, force 0..1)]."""
    out = []
    for p in poses:
        slip = abs(p["heading"] - p["travel"])
        if slip >= slip_min and (not out or p["frame"] - out[-1][0] >= every):
            out.append((p["frame"], *rear_axle(p, wheelbase), min(1.0, slip / 20.0)))
    return out


def key_smoke(ob, birth, frames, at, size=1.0, grow=10, rise=0.4, drift=(0.0, 0.0)):
    """Une bouffée de fumée (une boîte de volume) en clés simples : invisible (échelle 1 %) avant sa naissance,
    elle gonfle de 15 % à 100 % en `grow` images en montant de `rise` m et en dérivant de `drift` m."""
    _clear(ob)
    for f in frames:
        u = 0.0 if f < birth else min(1.0, (f - birth) / grow)
        e = 1 - (1 - u) ** 2
        k = 0.01 if f < birth else size * (0.15 + 0.85 * e)
        ob.scale = (k, k, k)
        ob.location = (at[0] + drift[0] * e, at[1] + drift[1] * e, at[2] + rise * e)
        ob.keyframe_insert("scale", frame=f)
        ob.keyframe_insert("location", frame=f)


def wheels_of(body):
    """Les roues séparées d'une caisse (enfants « wheel_* », ou « copie:wheel_* » dans une copie de lieux.clone)."""
    return [c for c in body.children if c.name.split(":")[-1].startswith("wheel_")]


def wheel_marks(wheels, radius=0.33, axis="X"):
    """Un repère sur chaque roue (une branche de jante de couleur d'objet à part), pour juger à l'œil le sens et
    la vitesse de rotation dans l'aperçu Workbench. Caché au rendu (hide_render) : render_lieux.py ne le rallume
    qu'en Workbench. Les roues sont des objets séparés dont l'axe est le x local (la berline) ; axis="Y" pour les
    roues de cast_vehicles (patrouille, fourgon : l'avant vers +x, l'axe des roues en y local)."""
    import bpy
    import bmesh
    out = []
    for w in wheels:
        bm = bmesh.new()
        m = bmesh.ops.create_cube(bm, size=1.0)
        size = (0.30, 0.07, radius * 0.75) if axis == "X" else (0.07, 0.30, radius * 0.75)
        bmesh.ops.scale(bm, vec=size, verts=m["verts"])
        bmesh.ops.translate(bm, vec=(0.0, 0.0, radius * 0.6), verts=m["verts"])
        me = bpy.data.meshes.new("repere_" + w.name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("repere_" + w.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = w
        ob.color = (1.0, 0.85, 0.0, 1.0)
        ob.hide_render = True
        # par sécurité, si un rendu le rallume : invisible pour Cycles (caméra, reflets, diffus, ombres)
        ob.visible_camera = ob.visible_glossy = ob.visible_diffuse = ob.visible_shadow = False
        out.append(ob)
    return out


# ---------------------------------------------------------------- les aéronefs : l'assiette suit l'accélération

AIR = {
    # gain : fraction de l'inclinaison « physique » atan(a / g) ; hz, zeta : la cellule qui répond ; max : borne
    # douce (degrés) ; breath : l'assiette du stationnaire (degrés), qui respire ; trem : le frémissement en vol
    "heli": dict(gain=0.6, hz=0.9, zeta=0.75, max=9.0, breath=0.8, trem=0.25, pitch=True),
    "jet": dict(gain=1.0, hz=1.4, zeta=0.8, max=30.0, breath=0.0, trem=0.2, pitch=False),
}


def aircraft_kind(ob):
    """« heli », « jet » ou None, d'après la propriété « aircraft » ou le nom du rig (heli…, jet…)."""
    k = ob.get("aircraft") if hasattr(ob, "get") else None
    if k in AIR:
        return k
    n = ob.name.split(":")[-1].lower()
    if n.startswith(("heli", "helico")):
        return "heli"
    if n.startswith(("jet", "avion", "plane")):
        return "jet"
    return None


def aircraft_attitude(fn, frames, kind="heli", f0=F0, fps=FPS, seed=0.0, warmup=0.8):
    """L'assiette d'un aéronef ajoutée à celle de sa trajectoire, sans toucher à sa position : fn(t) -> (x, y, z,
    cap, tangage, roulis) ; renvoie {image: (x, y, z, cap, tangage, roulis)}. L'hélicoptère s'incline dans le sens de
    son accélération horizontale (il pique pour accélérer, se cabre pour freiner, penche dans le virage), l'avion
    roule dans ses virages ; au stationnaire, l'assiette respire. La part « vitesse constante » est déjà dans la
    trajectoire (le nez bas d'un hélicoptère en poursuite) : seule l'accélération s'ajoute."""
    c = AIR[kind]
    frames = list(frames)
    dt = 1.0 / (fps * 10)
    t0, t1 = t_of(frames[0], f0, fps), t_of(frames[-1], f0, fps)
    rng = random.Random(f"air:{kind}:{float(seed):.3f}")
    ph = [rng.uniform(0, 2 * math.pi) for _ in range(6)]
    h = 1.0 / 24.0
    w = 2 * math.pi * c["hz"]
    st = None
    out = {}
    want = {round(t_of(f, f0, fps) / dt): f for f in frames}
    k0 = round((t0 - warmup) / dt)
    for k in range(k0, round(t1 / dt) + 1):
        t = k * dt
        q0, qp, qm = fn(t), fn(t + h), fn(t - h)
        ax, ay = (qp[0] - 2 * q0[0] + qm[0]) / (h * h), (qp[1] - 2 * q0[1] + qm[1]) / (h * h)
        v = math.hypot(qp[0] - qm[0], qp[1] - qm[1]) / (2 * h)
        hd = math.radians(q0[3])
        a_f = -ax * math.sin(hd) + ay * math.cos(hd)        # le long du cap
        a_left = -ax * math.cos(hd) - ay * math.sin(hd)     # vers la gauche du cap
        # une trajectoire qui part lancée (immobile avant le plan) donne un pic sans réalité : ignoré au-delà de 5 g ;
        # sinon l'accélération est bornée en douceur à 1 g (rien de ce qui vole ici ne tire plus)
        mag = math.hypot(a_f, a_left)
        if mag > 5.0 * G:
            a_f = a_left = 0.0
        elif mag > 1e-9:
            s = soft_clamp(mag, G) / mag
            a_f, a_left = a_f * s, a_left * s
        # vers l'avant, le nez plonge (tangage < 0) ; vers la gauche, la cellule penche à gauche (roulis < 0)
        tp = -c["gain"] * math.degrees(math.atan(a_f / G)) if c["pitch"] else 0.0
        tr = -c["gain"] * math.degrees(math.atan(a_left / G))
        tp, tr = soft_clamp(tp, c["max"]), soft_clamp(tr, c["max"])
        if st is None:
            st = [tp, 0.0, tr, 0.0]
        st[1] += (w * w * (tp - st[0]) - 2 * c["zeta"] * w * st[1]) * dt
        st[0] += st[1] * dt
        st[3] += (w * w * (tr - st[2]) - 2 * c["zeta"] * w * st[3]) * dt
        st[2] += st[3] * dt
        if k in want:
            hover = smoothstep(4.0, 1.0, v)
            b = c["breath"] * hover
            tr_ = c["trem"] * (1.0 - hover) * min(1.0, v / 20.0)
            dp = (b * (0.7 * math.sin(2 * math.pi * 0.23 * t + ph[0]) + 0.3 * math.sin(2 * math.pi * 0.53 * t + ph[1]))
                  + tr_ * math.sin(2 * math.pi * 1.7 * t + ph[2]))
            dr = (b * 1.15 * (0.7 * math.sin(2 * math.pi * 0.17 * t + ph[3]) + 0.3 * math.sin(2 * math.pi * 0.41 * t + ph[4]))
                  + tr_ * 1.3 * math.sin(2 * math.pi * 1.3 * t + ph[5]))
            x, y, z, hh, p, r = fn(t)
            out[want[k]] = (x, y, z, hh, p + st[0] + dp, r + st[2] + dr)
    return out


def key_object(ob, frames, fn, f0=F0, fps=FPS):
    """Clés de position et d'orientation d'un objet quelconque : fn(t) -> (x, y, z, cap, tangage, roulis) dans la
    convention de lieux.put (hélicoptère, objets portés). Un aéronef (aircraft_kind : hélicoptère, avion) prend en
    plus l'assiette de son accélération (aircraft_attitude), dynamique active ; sa position ne change pas."""
    _clear(ob)
    ob.rotation_mode = "XYZ"
    frames = list(frames)
    kind = aircraft_kind(ob) if dyn_on() else None
    att = aircraft_attitude(fn, frames, kind, f0, fps, seed=sum(map(ord, ob.name)) % 97) if kind else None
    for f in frames:
        x, y, z, h, p, r = att[f] if att else fn(t_of(f, f0, fps))
        ob.location = (x, y, z)
        ob.rotation_euler = (math.radians(p), math.radians(r), math.radians(h))
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_euler", frame=f)


# ---------------------------------------------------------------- l'opérateur caméra
#
# Ce qu'un opérateur ajoute à la trajectoire écrite d'une caméra, selon son type, jamais gratuit : la voiture-
# travelling vibre finement selon sa vitesse et sursaute sur les ressauts ; la caméra posée au sol ne bouge pas,
# sauf une secousse brève quand un véhicule la frôle (moins de 3 m) ; la longue focale flotte lentement et recadre
# avec un léger retard ; le panoramique démarre et s'arrête en douceur, avec un léger dépassement (une tête
# fluide : un second ordre, en avance de son retard pour suivre sans traîner). Les écarts sont bornés en fraction
# du cadre (le sujet reste dans le tiers central, rien n'entre dans les bandes de l'habillage).
OPERATOR = dict(
    vib_deg=0.0032,          # degrés de vibration par m/s de la caméra (voiture-travelling)
    vib_z=0.00010,           # m de vibration verticale par m/s
    vib_air=0.5,             # caméra en l'air (plus de 3 m) : la moitié, et pas de ressauts
    jolt_every=(7.0, 15.0),  # m entre deux ressauts sous la voiture-caméra
    jolt_deg=0.16, jolt_z=0.006, jolt_hz=7.5, jolt_tau=0.12,
    pan_min=12.0,            # degrés de lacet sur le plan : au-delà, c'est un panoramique
    pan_hz=2.0, pan_zeta=0.6,
    tele_lens=100.0,         # mm : au-delà, longue focale
    tele_float=0.009,        # fraction de la hauteur du cadre
    tele_lag=0.12,           # s
    pass_dist=3.0,           # m entre l'objectif et le flanc d'un véhicule (demi-largeur 1 m)
    pass_deg=0.55, pass_hz=6.0, pass_tau=0.17,
    max_yaw=0.02, max_pitch=0.012,   # fractions de la largeur et de la hauteur du cadre
    max_roll=0.6,            # degrés
)


def fov_deg(lens):
    """(largeur, hauteur) du champ en degrés, cadre vertical 9:16, capteur de 36 mm sur la hauteur."""
    return 2 * math.degrees(math.atan(10.125 / lens)), 2 * math.degrees(math.atan(18.0 / lens))


def camera_kind(fn, frames, f0=F0, fps=FPS):
    """Ce que fait une caméra sur le plan : dict(travel (m/s au plus), pan (degrés de lacet), tele (focale ≥ 100),
    air (au-dessus de 3 m))."""
    ts = [t_of(f, f0, fps) for f in frames]
    vals = [fn(t) for t in ts]
    sp = [math.dist(vals[i + 1][:3], vals[i][:3]) * fps for i in range(len(vals) - 1)] or [0.0]
    yaws, prev = [], None
    for v in vals:
        y = v[3] if prev is None else _unwrap(prev, v[3])
        yaws.append(y)
        prev = y
    lens = sorted(v[6] for v in vals)[len(vals) // 2]
    return dict(travel=max(sp), pan=max(yaws) - min(yaws), tele=lens >= OPERATOR["tele_lens"],
                air=min(v[2] for v in vals) > 3.0, lens=lens)


def _decay(t, t0, amp, hz, tau, phase=0.0):
    if t < t0:
        return 0.0
    u = t - t0
    return amp * math.exp(-u / tau) * math.sin(2 * math.pi * hz * u + phase)


def camera_operator(fn, frames, f0=F0, fps=FPS, tracks=(), seed=0.0, warmup=0.5, op=None):
    """L'opérateur appliqué à fn(t) -> (x, y, z, lacet, site, roulis, focale) : renvoie {image: (x, y, z, lacet,
    site, roulis, focale)} et, dans « kind », ce qu'il a reconnu. tracks : les véhicules de la scène, [{image: (x,
    y, z)}] (secousse d'un passage proche)."""
    o = dict(OPERATOR, **(op or {}))
    frames = list(frames)
    kind = camera_kind(fn, frames, f0, fps)
    hfov, vfov = fov_deg(kind["lens"])
    rng = random.Random(f"op:{float(seed):.3f}")
    ph = [rng.uniform(0, 2 * math.pi) for _ in range(12)]
    dt = 1.0 / (fps * 10)
    t0, t1 = t_of(frames[0], f0, fps), t_of(frames[-1], f0, fps)
    want = {round(t_of(f, f0, fps) / dt): f for f in frames}
    pan = kind["pan"] >= o["pan_min"] and not kind["tele"]
    w = 2 * math.pi * o["pan_hz"]
    lead = 2 * o["pan_zeta"] / w
    moving = kind["travel"] > 1.5

    def aim(t, prev=None):
        v = fn(t)
        y = v[3] if prev is None else _unwrap(prev, v[3])
        return y, v[4]

    # les passages proches : (instant, amplitude) pour chaque véhicule qui frôle l'objectif
    events = []
    if tracks:
        for tr in tracks:
            best = None
            for f in frames:
                if f not in tr:
                    continue
                c = fn(t_of(f, f0, fps))
                d = math.dist(c[:3], tr[f]) - 1.0
                if best is None or d < best[0]:
                    best = (d, f)
            if best and best[0] < o["pass_dist"]:
                f = best[1]
                fa, fb = (f - 1 if f - 1 in tr else f), (f + 1 if f + 1 in tr else f)
                v_rel = math.dist(tr[fb], tr[fa]) * fps / max(1, fb - fa)
                amp = o["pass_deg"] * (1.0 - max(0.0, best[0]) / o["pass_dist"]) * min(1.0, v_rel / 15.0)
                events.append((t_of(f, f0, fps) - 0.04, amp))
    # les ressauts sous la voiture-caméra, le long de sa distance parcourue
    jolts, next_s, s_cam, prev_c = [], rng.uniform(*o["jolt_every"]) * 0.5, 0.0, None
    yaw_x = yaw_v = pit_x = pit_v = None
    lp_y = lp_p = None
    prev_y = None
    out = {}
    # une caméra qui se pose à la fin du plan (la pose validée) : les écarts s'éteignent sur ses 0,3 dernières s
    e1, e0 = fn(t1), fn(t1 - 1.0 / fps)
    land = ((moving or pan) and math.dist(e1[:3], e0[:3]) * fps < 0.6
            and abs(_unwrap(e0[3], e1[3]) - e0[3]) * fps < 3.0)
    k0 = round((t0 - warmup) / dt)
    for k in range(k0, round(t1 / dt) + 1):
        t = k * dt
        base = fn(t)
        y, p = aim(t, prev_y)
        prev_y = y
        if prev_c is not None:
            step = math.dist(base[:3], prev_c)
            s_cam += step
        speed = math.dist(base[:3], prev_c) / dt if prev_c is not None else 0.0
        prev_c = base[:3]
        if moving and not kind["air"] and s_cam >= next_s:
            jolts.append((t, min(1.0, speed / 20.0)))
            next_s = s_cam + rng.uniform(*o["jolt_every"])
        dy = dp = dr = dz = 0.0
        if pan:
            yl, pl = aim(t + lead, y)
            if yaw_x is None:
                ya, pa = aim(t + 1e-3, y)
                yaw_x, yaw_v, pit_x, pit_v = y, (ya - y) / 1e-3, p, (pa - p) / 1e-3
            yaw_v += (w * w * (yl - yaw_x) - 2 * o["pan_zeta"] * w * yaw_v) * dt
            yaw_x += yaw_v * dt
            pit_v += (w * w * (pl - pit_x) - 2 * o["pan_zeta"] * w * pit_v) * dt
            pit_x += pit_v * dt
            dy += yaw_x - y
            dp += pit_x - p
        if kind["tele"]:
            if lp_y is None:
                lp_y, lp_p = y, p
            a = min(1.0, dt / o["tele_lag"])
            lp_y += (y - lp_y) * a
            lp_p += (p - lp_p) * a
            fl = o["tele_float"] * vfov
            dy += (lp_y - y) + fl * (0.6 * math.sin(2 * math.pi * 0.13 * t + ph[0]) + 0.4 * math.sin(2 * math.pi * 0.31 * t + ph[1]))
            dp += (lp_p - p) + fl * 0.8 * (0.6 * math.sin(2 * math.pi * 0.17 * t + ph[2]) + 0.4 * math.sin(2 * math.pi * 0.47 * t + ph[3]))
        if moving:
            g = o["vib_air"] if kind["air"] else 1.0
            a = o["vib_deg"] * speed * g
            hf = lambda i: (0.5 * math.sin(2 * math.pi * 7.3 * t + ph[i]) + 0.3 * math.sin(2 * math.pi * 11.1 * t + ph[i + 1])  # noqa: E731
                            + 0.2 * math.sin(2 * math.pi * 13.7 * t + ph[i + 2]))
            dy += 0.5 * a * hf(4)
            dp += a * hf(5)
            dr += 0.6 * a * hf(6)
            dz += o["vib_z"] * speed * g * hf(7)
            for tj, s in jolts:
                dp += _decay(t, tj, o["jolt_deg"] * s, o["jolt_hz"], o["jolt_tau"])
                dr += _decay(t, tj, 0.5 * o["jolt_deg"] * s, o["jolt_hz"] * 0.8, o["jolt_tau"], 1.0)
                dz += _decay(t, tj, -o["jolt_z"] * s, o["jolt_hz"], o["jolt_tau"])
        for te, amp in events:
            dp += _decay(t, te, amp, o["pass_hz"], o["pass_tau"])
            dr += _decay(t, te, 0.7 * amp, o["pass_hz"] * 0.85, o["pass_tau"], 0.8)
            dy += _decay(t, te, 0.4 * amp, o["pass_hz"] * 1.2, o["pass_tau"], 2.0)
        if k in want:
            base = fn(t_of(want[k], f0, fps))
            if land:
                e = smoothstep(t1, t1 - 0.3, t)
                dy, dp, dr, dz = dy * e, dp * e, dr * e, dz * e
            dy = soft_clamp(dy, o["max_yaw"] * hfov) if dy else 0.0
            dp = soft_clamp(dp, o["max_pitch"] * vfov) if dp else 0.0
            dr = soft_clamp(dr, o["max_roll"]) if dr else 0.0
            x, yy, z, yaw, pitch, roll, lens = base
            out[want[k]] = (x, yy, z + dz, yaw + dy, pitch + dp, roll + dr, lens)
    out["kind"] = dict(kind, pan_active=pan, moving=moving, passes=len(events), jolts=len(jolts), lands=land)
    return out


def key_camera(cam, frames, fn, f0=F0, fps=FPS, operator=True):
    """Clés d'une caméra : fn(t) -> (x, y, z, lacet, tangage, roulis en degrés, focale en mm). Lacet compté de -y
    vers -x (comme les plans des lieux), tangage positif vers le haut, roulis autour de l'axe de visée.
    Dynamique active : l'opérateur (camera_operator) s'ajoute selon le type de caméra ; operator=False l'enlève."""
    from mathutils import Matrix, Vector
    _clear(cam)
    if cam.data.animation_data:
        cam.data.animation_data.action = None
    cam.rotation_mode = "QUATERNION"
    prev = None
    frames = list(frames)
    vals = None
    if operator and dyn_on():
        vals = camera_operator(fn, frames, f0, fps, tracks=scene_tracks(), seed=sum(map(ord, cam.name)) % 97)
        print(f"[motion] {cam.name} : opérateur {vals['kind']}", flush=True)
    for f in frames:
        x, y, z, yaw, pitch, roll, lens = vals[f] if vals else fn(t_of(f, f0, fps))
        a, b = math.radians(yaw), math.radians(pitch)
        d = Vector((-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b)))
        q = d.to_track_quat("-Z", "Y") @ Matrix.Rotation(math.radians(roll), 4, "Z").to_quaternion()
        if prev is not None and prev.dot(q) < 0:
            q.negate()
        prev = q
        cam.location = (x, y, z)
        cam.rotation_quaternion = q
        cam.data.lens = lens
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_quaternion", frame=f)
        cam.data.keyframe_insert("lens", frame=f)


def key_searchlight(heli_dict, frames, target_fn, f0=F0, fps=FPS):
    """Le projecteur d'hélicoptère (cast_vehicles.load_helicopter) qui vise target_fn(t) -> (x, y, z) monde à
    chaque image ; l'hélicoptère doit déjà avoir ses clés (son pivot suit sa cellule)."""
    import bpy
    from mathutils import Matrix, Vector
    piv = heli_dict["searchlight_pivot"]
    _clear(piv)
    piv.rotation_mode = "XYZ"
    sc = bpy.context.scene
    prev = None
    for f in frames:
        sc.frame_set(f)
        p = piv.matrix_world.translation.copy()
        d = (Vector(target_fn(t_of(f, f0, fps))) - p).normalized()
        piv.matrix_world = Matrix.Translation(p) @ d.to_track_quat("-Z", "Y").to_matrix().to_4x4()
        bpy.context.view_layer.update()
        e = piv.rotation_euler.copy()
        if prev is not None:
            e.make_compatible(prev)
            piv.rotation_euler = e
        prev = e.copy()
        piv.keyframe_insert("location", frame=f)
        piv.keyframe_insert("rotation_euler", frame=f)


def _tone(color):
    """« corail » ou « lilas » pour une couleur de lumière (linéaire), None sinon."""
    r, g, b = color[:3]
    if r > 0.5 and b < 0.25 * r and g < 0.35 * r:
        return "corail"
    if b > 0.5 and r < 0.75 * b and g < 0.6 * b:
        return "lilas"
    return None


def flash_bars(roots, frames, period=12, low=0.06):
    """Le clignotement des rampes de la meute : chaque lumière corail ou lilas d'un véhicule (descendance du rig :
    lueurs de rampe, faisceaux, flaques) s'allume la moitié de la période, en alternance corail / lilas, clés
    constantes ; chaque véhicule est décalé de quelques images. Les lentilles émissives restent allumées."""
    n = 0
    for i, root in enumerate(roots):
        offset = (i * 5) % period
        for ob in [root, *root.children_recursive]:
            if ob.type != "LIGHT":
                continue
            tone = _tone(ob.data.color)
            if tone is None:
                continue
            d = ob.data
            if d.animation_data and d.animation_data.action:
                d.animation_data.action = None
            full = d.get("motion_energy", d.energy)
            d["motion_energy"] = full
            for f in frames:
                d.energy = full if bar_phase(f, period, offset) == tone else full * low
                d.keyframe_insert("energy", frame=f)
            for fc in fcurves(d):
                for kp in fc.keyframe_points:
                    kp.interpolation = "CONSTANT"
            n += 1
    return n


def fcurves(idblock):
    """Les courbes de l'action d'un bloc (Blender 5 : rangées dans les tranches de l'action)."""
    ad = idblock.animation_data
    act = ad.action if ad else None
    if act is None:
        return []
    curves = list(getattr(act, "fcurves", []) or [])
    if not curves:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    return curves


def spin_rotors(heli_dict, rpm_main=380.0, rpm_tail=2200.0):
    """Les rotors d'un hélicoptère de cast_vehicles, en tours par minute (pilotes sur l'image)."""
    import cast_vehicles as cv
    cv.spin_rotors(heli_dict, rpm_main=rpm_main, rpm_tail=rpm_tail)
