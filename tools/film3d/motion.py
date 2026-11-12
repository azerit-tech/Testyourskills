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
# v3.1 (« rien d'autre ne la secoue ») : roulis au plus 4° et plongée au plus 2°, en proportion des accélérations
# (6,5 m/s² latéraux font 4°, 7 m/s² de freinage 2°), filtrés par des ressorts bien amortis (zeta 0,7 : 5 % de
# dépassement, pas de rebond) ; ni grain de route ni corrections du conducteur (road = driver = 0). Le relief et
# les ressauts que la scène passe à key_vehicle restent.
CHASSIS = {
    # une grosse berline des années 60 : souple, lente, elle s'assoit
    "hero": dict(roll_per_g=6.0, roll_max=4.0, pitch_per_g=2.8, pitch_max=2.0, roll_hz=1.1, roll_zeta=0.7,
                 pitch_hz=1.4, pitch_zeta=0.5, corner_hz=1.25, corner_zeta=0.5, road=0.0, driver=0.0,
                 squat=0.006, heave_up=0.05, heave_down=0.03, arch=(0.055, 0.06), ext=0.12, track=1.55, jitter=0.0, steer_lag=0.07),
    # la patrouille : plus ferme, plus vive
    "patrol": dict(roll_per_g=4.6, roll_max=4.0, pitch_per_g=2.4, pitch_max=2.0, roll_hz=1.45, roll_zeta=0.7,
                   pitch_hz=1.5, pitch_zeta=0.7, corner_hz=1.55, corner_zeta=0.55, road=0.0, driver=0.0,
                   squat=0.004, heave_up=0.045, heave_down=0.03, arch=0.03, ext=0.09, track=1.51, jitter=0.12, steer_lag=0.05),
    # le fourgon : haut, lourd, il roule beaucoup et tangue lentement
    "van": dict(roll_per_g=6.0, roll_max=4.0, pitch_per_g=2.6, pitch_max=2.0, roll_hz=1.0, roll_zeta=0.7,
                pitch_hz=1.1, pitch_zeta=0.7, corner_hz=1.15, corner_zeta=0.5, road=0.0, driver=0.0,
                squat=0.006, heave_up=0.07, heave_down=0.035, arch=0.075, ext=0.12, track=1.68, jitter=0.12, steer_lag=0.08),
}


class Poses(list):
    """La liste des poses de sample() (des dict, comme avant) ; elle garde l'historique cinématique fin (pas de
    1/240 s) pour que key_vehicle refasse la caisse avec le réglage du véhicule et le relief du sol (rebody)."""
    hist = None
    meta = None


def sample(pos, frames=range(0, 30), slip=None, heading=None, wheel_r=0.33, wheelbase=2.9, front=None, f0=F0,
           fps=FPS, noise=1.0, seed=0.0, warmup=0.6, roll_per_g=ROLL_PER_G, pitch_per_g=PITCH_PER_G, chassis=None,
           steer=None):
    """Les poses d'un véhicule image par image. steer(t) : le braquage des roues avant à imposer (Drive.steer : le
    contre-braquage de drive()) ; sinon celui de la géométrie.

    Dynamique active (dyn_on) : la caisse selon le réglage `chassis` (CHASSIS, la berline par défaut ;
    key_vehicle le refait selon le véhicule) ; x, y, cap, vitesse, roues et braquage sont ceux d'avant.
    roll_per_g et pitch_per_g ne servent qu'aux clés d'avant (FILM3D_DYN=0)."""
    if not dyn_on():
        out = _sample_legacy(pos, frames, slip, heading, wheel_r, wheelbase, front, f0, fps, noise, seed, warmup,
                             roll_per_g, pitch_per_g)
        for p in out if steer else ():
            p["steer"] = steer(p["t"])
        return out
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
    out.meta = dict(want=want, dt=dt, seed=seed, wheel_r=wheel_r, wheelbase=wheelbase, front=front, noise=noise,
                    steer_fn=steer)
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
        ps["roll"] = soft_limit(roll_i + roll_c, c["roll_max"], 0.85)
        ps["pitch"] = soft_limit(pitch_i + pitch_c, c["pitch_max"], 0.85)
        ps["heave"] = max(-c["heave_down"], min(c["heave_up"], heave))
        # les roues dans leurs passages : la caisse ne descend jamais sur un pneu de plus que 80 % de son jeu. Elle se
        # soulève d'abord (le centre de tangage avance vers la roue chargée, la caisse se lève sur ses roues
        # délestées : l'anti-plongée et le cabrage d'un essieu arrière brisé), sans détendre aucun ressort de plus
        # que `ext` ; ce qui reste au-delà est réduit en douceur.
        fit_arches(ps, corners, [0.8 * a for a in arch_of(c, corners)], c["ext"])
        if meta.get("steer_fn"):
            ps["steer"] = meta["steer_fn"](ps["t"])
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


# ---------------------------------------------------------------- v3.1 : la conduite (une route, une vitesse voulue)
#
# Au lieu de régler la glisse à la main : drive() prend une route (morceaux droits et arcs, ou des points) et la
# vitesse voulue, et rend une conduite qui tient les limites d'une voiture lourde sur le mouillé (test_motion :
# CAR31_*, SLIP31_*). La courbure est rendue continue (entrées et sorties progressives, deux moyennes glissantes :
# une clothoïde adoucie), la vitesse rabotée là où le cercle d'adhérence l'exige (on freine avant le virage, on
# remet les gaz en sortie), l'accélération installée sans à-coup ; la glisse de l'arrière naît du dépassement
# d'adhérence (accélération combinée au-delà de 5,5 m/s²), s'installe et se résorbe à vitesse bornée, avec un seul
# petit retour, freine la voiture ; les roues avant contre-braquent (modèle bicyclette). Lisse et plausible, pas
# exact. Exemple (vue de dessus : python3 tools/film3d/diag/conduite_demo.py) :
#
#   d = M.drive(dict(start=(0.0, 0.0, 0.0), pieces=[M.line(40), M.arc(28, 90), M.line(40)]), speed=19.0)
#   poses = M.sample(d.pos, frames, heading=d.heading)        # position et cap de la caisse (glisse comprise)
#   for a, b in d.brake_windows(): hero_cars.stop_lamps(body, a, b)    # après la mise en clés

DRIVE = dict(lat=6.5, brake=7.0, acc=3.0, circle=7.5, jerk=12.0,   # les limites (CAR31_HERO)
             margin=0.92,                 # la part des limites visée (le lissage en mange un peu)
             grip=5.5,                    # m/s² combinés : au-delà, l'arrière glisse
             slip_per=8.0,                # ° de glisse par m/s² au-delà de grip
             slip_max=16.0,               # ° (18 au plus)
             slip_on=36.0, slip_off=27.0,  # °/s (40 et 30 au plus)
             slip_acc=70.0,               # °/s², pour que le lacet de la caisse reste sous 120 °/s²
             slip_hold=0.7,               # s : le dépassement d'adhérence retombe lentement (une seule glisse)
             slip_back=2.5, slip_back_s=0.45,   # le petit retour de l'autre côté (°, 4 au plus ; s), une fois
             counter=0.9,                 # en glisse, les roues avant braquées vers l'extérieur : -0,9 × la glisse
             slip_hz=0.9, slip_zeta=0.62,  # la réponse de l'arrière : un seul petit retour (moins de 4°)
             slip_drag=0.22,              # m/s² de freinage par degré de glisse (la vitesse baisse en glissant)
             front=1.45)                  # m du centre à l'essieu avant (braquage)
DRIVE_KINDS = {"hero": DRIVE, "patrol": dict(DRIVE, lat=7.0, acc=4.0), "van": dict(DRIVE, lat=7.0, acc=4.0)}


def line(length):
    """Un morceau droit de route pour drive() : (longueur m, courbure)."""
    return (float(length), 0.0)


def arc(radius, angle):
    """Un arc de route pour drive() : rayon (m), angle (°, positif : à gauche)."""
    return (abs(radius * math.radians(angle)), math.copysign(1.0 / radius, angle))


def _box(vals, n):
    """Moyenne glissante sur n échantillons (impair), les bords prolongés."""
    h = max(0, int(n) // 2)
    if h == 0:
        return list(vals)
    pad = [vals[0]] * h + list(vals) + [vals[-1]] * h
    pre = [0.0]
    for v in pad:
        pre.append(pre[-1] + v)
    w = 2 * h + 1
    return [(pre[i + w] - pre[i]) / w for i in range(len(vals))]


def _lerp_tab(xs, ys, x):
    """Interpolation linéaire dans une table à pas constant (xs[0], pas xs[1] - xs[0]), bornée aux extrémités."""
    step = xs[1] - xs[0]
    u = (x - xs[0]) / step
    k = max(0, min(len(xs) - 2, int(math.floor(u))))
    f = max(0.0, min(1.0, u - k))
    return ys[k] + (ys[k + 1] - ys[k]) * f


class Route:
    """Une route à courbure continue, en abscisse curviligne : x, y, cap (°, convention de lieux.put) et courbure
    (1/m, positive à gauche) tous les ds m ; au-delà des bouts, la droite qui la prolonge."""

    def __init__(self, x0, y0, h0, kappa, ds):
        self.ds, self.k = ds, kappa
        self.s = [i * ds for i in range(len(kappa))]
        th, x, y = math.radians(h0), x0, y0
        self.x, self.y, self.h = [x], [y], [h0]
        for i in range(1, len(kappa)):
            km = 0.5 * (kappa[i - 1] + kappa[i])
            tm = th + km * ds / 2
            x += -math.sin(tm) * ds
            y += math.cos(tm) * ds
            th += km * ds
            self.x.append(x)
            self.y.append(y)
            self.h.append(math.degrees(th))
        self.length = self.s[-1]

    def at(self, s):
        """(x, y, cap, courbure) à l'abscisse s."""
        for end, i in ((0.0, 0), (self.length, -1)):
            if (s < 0.0 and i == 0) or (s > self.length and i == -1):
                h = math.radians(self.h[i])
                return self.x[i] - math.sin(h) * (s - end), self.y[i] + math.cos(h) * (s - end), self.h[i], 0.0
        return (_lerp_tab(self.s, self.x, s), _lerp_tab(self.s, self.y, s), _lerp_tab(self.s, self.h, s),
                _lerp_tab(self.s, self.k, s))


def make_route(route, ease, ds=0.1):
    """Route depuis dict(start=(x, y, cap), pieces=[line(…), arc(…), …]) ou une liste de points [(x, y), …] (lissés,
    rééchantillonnés, puis leur courbure intégrée depuis le premier point : la route suit leurs virages, à
    quelques décimètres près). ease : la longueur (m) de chacune des deux moyennes glissantes de la courbure."""
    if isinstance(route, Route):
        return route
    if isinstance(route, dict):
        x0, y0, h0 = route["start"]
        raw = []
        for length, k in route["pieces"]:
            raw += [k] * max(1, int(round(length / ds)))
    else:
        pts = [tuple(p[:2]) for p in route]
        for _ in range(3):                                   # Chaikin, les bouts gardés
            q = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                q += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]),
                      (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
            pts = q + [pts[-1]]
        dense, acc = [pts[0]], 0.0                           # rééchantillonné tous les ds
        for a, b in zip(pts, pts[1:]):
            seg = math.dist(a, b)
            while seg > 1e-9 and acc + seg >= ds:
                u = (ds - acc) / seg
                a = (a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)
                seg = math.dist(a, b)
                dense.append(a)
                acc = 0.0
            acc += seg
        hs = [heading_of(b[0] - a[0], b[1] - a[1]) for a, b in zip(dense, dense[1:])]
        for i in range(1, len(hs)):
            hs[i] = _unwrap(hs[i - 1], hs[i])
        raw = [0.0] + [math.radians(hs[i + 1] - hs[i]) / ds for i in range(len(hs) - 1)] + [0.0]
        x0, y0, h0 = dense[0][0], dense[0][1], hs[0]
    n = max(1, int(round(ease / ds)) | 1)
    pad = n * 2
    k = _box(_box([raw[0]] * pad + raw + [raw[-1]] * pad, n), n)[pad:-pad]
    return Route(x0, y0, h0, k, ds)


class Drive:
    """Le résultat de drive() : des fonctions du temps du plan (t en s) à passer telles quelles aux scènes.
    pos(t) -> (x, y) ; heading(t) : le cap de la caisse (glisse comprise) ; slip(t) : la glisse (°, positive :
    l'avant pointe à gauche de sa route) ; steer(t) : le braquage des roues avant (°, positif à gauche :
    contre-braquage en glisse) ; speed(t) ; along(t), alat(t) (m/s²) ; brake_windows() : les fenêtres de freinage
    pour hero_cars.stop_lamps ; t_stop : l'instant de l'arrêt (None s'il roule encore)."""

    def __init__(self, tab, dt, t_stop):
        self.tab, self.dt, self.t_stop = tab, dt, t_stop
        self.t0 = tab["t"][0]

    def _at(self, key, t):
        return _lerp_tab(self.tab["t"], self.tab[key], t)

    def pos(self, t):
        T = self.tab
        n = len(T["t"])
        u = (t - self.t0) / self.dt
        if u <= 0 or u >= n - 1:                     # hors de la table : en ligne droite, à vitesse tenue
            i = 0 if u <= 0 else n - 1
            h = math.radians(T["travel"][i])
            d = T["v"][i] * (t - T["t"][i])
            return T["x"][i] - math.sin(h) * d, T["y"][i] + math.cos(h) * d
        k = int(math.floor(u))
        f = u - k
        out = []                                     # Hermite : position et vitesse aux deux bouts
        for c, vc in (("x", "vx"), ("y", "vy")):
            p0, p1, m0, m1 = T[c][k], T[c][k + 1], T[vc][k] * self.dt, T[vc][k + 1] * self.dt
            out.append((2 * f ** 3 - 3 * f ** 2 + 1) * p0 + (f ** 3 - 2 * f ** 2 + f) * m0
                       + (-2 * f ** 3 + 3 * f ** 2) * p1 + (f ** 3 - f ** 2) * m1)
        return tuple(out)

    def heading(self, t):
        return self._at("head", t)

    def travel(self, t):
        return self._at("travel", t)

    def slip(self, t):
        return self._at("slip", t)

    def steer(self, t):
        return self._at("steer", t)

    def speed(self, t):
        return self._at("v", t)

    def along(self, t):
        return self._at("along", t)

    def alat(self, t):
        return self._at("alat", t)

    def brake_windows(self, f0=F0, fps=FPS, thr=2.0, frames=None):
        """[(première, dernière image)] où la voiture freine à plus de thr m/s² (les fenêtres de
        hero_cars.stop_lamps) ; frames : les images à considérer (toute la table par défaut)."""
        if frames is None:
            frames = range(int(math.ceil(self.t0 * fps)) + f0, int(self.tab["t"][-1] * fps) + f0 + 1)
        over = [f for f in frames if -self.along(t_of(f, f0, fps)) > thr]
        return [(w[0], w[-1]) for w in _windows(over)]


def drive(route, speed, t0=0.0, stop=False, kind="hero", drift=1.0, ease=None, lim=None, t_span=(-2.0, 12.0)):
    """Une conduite qui tient les limites v3.1 (DRIVE, DRIVE_KINDS) : rend un Drive (pos, heading, slip, steer,
    speed, brake_windows).

    route : dict(start=(x, y, cap °), pieces=[line(m), arc(rayon, angle °), …]) ou [(x, y), …] ;
    speed : la vitesse voulue (m/s) : un nombre, [(abscisse m, vitesse), …] (linéaire entre deux) ou v(s) ; la
      voiture est au départ de la route à t0 (s), lancée à la vitesse voulue là (rabotée par l'adhérence) ;
    stop : s'arrêter au bout de la route (sinon elle continue tout droit, à sa vitesse) ;
    kind : "hero", "patrol" ou "van" (les limites) ; lim : des limites à changer (clés de DRIVE) ;
    drift : le gain de la glisse (0 : jamais, 1 : le modèle) ; ease : la longueur (m) des entrées et sorties de
      courbure (par défaut : ce que demande l'à-coup latéral à la vitesse du virage) ;
    t_span : de quand à quand (s, temps du plan) la table est calculée ; hors de la table, en ligne droite."""
    L = dict(DRIVE_KINDS.get(kind, DRIVE), **(lim or {}))
    mg = L["margin"]
    lat, brake, circle, acc = L["lat"] * mg, L["brake"] * mg, L["circle"] * mg, L["acc"] * mg
    jerk = L["jerk"] * 0.72                  # longitudinal et latéral peuvent varier ensemble
    if callable(speed):
        want = speed
    elif isinstance(speed, (int, float)):
        want = lambda s: float(speed)  # noqa: E731
    else:
        pts = sorted((float(a), float(b)) for a, b in speed)

        def want(s):
            if s <= pts[0][0]:
                return pts[0][1]
            for (sa, va), (sb, vb) in zip(pts, pts[1:]):
                if s <= sb:
                    return va + (vb - va) * (s - sa) / max(1e-9, sb - sa)
            return pts[-1][1]
    ds = 0.1
    if ease is None:                          # l'à-coup latéral : v³ κ' = v · a_lat / ease
        rough = make_route(route, 1.0, ds)
        ease = 2.0
        for s_, k_ in zip(rough.s, rough.k):
            if abs(k_) > 1e-4:
                v = min(want(s_), math.sqrt(lat / abs(k_)))
                ease = max(ease, min(lat, v * v * abs(k_)) * v / jerk)
    R = make_route(route, ease, ds)
    S = R.s
    n = len(S)
    fac = [1.0] * n                           # rabots supplémentaires (corrections après lissage)
    drag = [0.0] * n                          # le freinage de la glisse (m/s²)
    lift = [1.0] * n                          # les gaz : coupés pendant la glisse
    dt = 1.0 / 240.0
    win = max(1, int(round((brake + acc) / jerk / dt)) | 1)
    for _ in range(14):
        # 1. le profil le long de la route : plafonds, freinage en arrière, accélération en avant
        v = [min(want(S[i]), math.sqrt(lat / max(1e-9, abs(R.k[i])))) * fac[i] for i in range(n)]
        if stop:
            v[-1] = 0.0
        for i in range(n - 2, -1, -1):
            al = v[i + 1] ** 2 * abs(R.k[i + 1])
            b = min(brake, math.sqrt(max(0.0, circle * circle - al * al)))
            v[i] = min(v[i], math.sqrt(v[i + 1] ** 2 + 2 * ds * b))
        for i in range(n - 1):
            al = v[i] ** 2 * abs(R.k[i])
            a = min(acc, math.sqrt(max(0.0, circle * circle - al * al))) * lift[i] - drag[i]
            v[i + 1] = min(v[i + 1], math.sqrt(max(0.0, v[i] ** 2 + 2 * ds * a)))
        # 2. au temps : la table à 240 Hz, la vitesse lissée (l'accélération s'installe sans à-coup)
        ts, t = [0.0], 0.0
        for i in range(n - 1):
            vm = v[i] + v[i + 1]
            if vm < 1e-4:
                break
            t += 2 * ds / vm
            ts.append(t)
        m = len(ts)
        t_end = ts[-1]
        grid = [t_span[0] - t0 + k * dt for k in range(int((t_span[1] - t_span[0]) / dt) + 1)]
        vt, j = [], 0
        for tt in grid:
            if tt <= 0.0:
                vt.append(v[0])
            elif tt >= t_end:
                vt.append(v[m - 1])
            else:
                while ts[j + 1] < tt:
                    j += 1
                f = (tt - ts[j]) / (ts[j + 1] - ts[j])
                vt.append(v[j] + (v[j + 1] - v[j]) * f)
        vt = _box(vt, win)
        k0 = next(k for k, tt in enumerate(grid) if tt >= 0.0)
        st = [0.0] * len(grid)
        for k in range(k0 + 1, len(grid)):
            st[k] = st[k - 1] + 0.5 * (vt[k] + vt[k - 1]) * dt
        for k in range(k0 - 1, -1, -1):
            st[k] = st[k + 1] - 0.5 * (vt[k] + vt[k + 1]) * dt
        # 3. accélérations, glisse, braquage
        N = len(grid)
        along = [(vt[min(N - 1, k + 1)] - vt[max(0, k - 1)]) / ((min(N - 1, k + 1) - max(0, k - 1)) * dt)
                 for k in range(N)]
        geo = [R.at(s) for s in st]
        alat = [vt[k] ** 2 * geo[k][3] for k in range(N)]
        slip, sv, tf, out_slip = 0.0, 0.0, 0.0, []
        peak, side, kick = 0.0, 0.0, None
        w = 2 * math.pi * L["slip_hz"]
        for k in range(N):
            comb = math.hypot(along[k], alat[k])
            turn = max(-1.0, min(1.0, geo[k][3] * 25.0))
            target = drift * turn * min(L["slip_max"], L["slip_per"] * max(0.0, comb - L["grip"]))
            # la cible monte vite et retombe lentement : deux dépassements rapprochés font une seule glisse
            rising = abs(target) > abs(tf) and target * tf >= 0.0
            tf += (target - tf) * min(1.0, dt / (0.12 if rising else L["slip_hold"]))
            # le petit retour : quand la glisse retombe sous le tiers de sa crête, l'arrière passe un peu de
            # l'autre côté, une fois, puis plus rien
            if abs(slip) > peak:
                peak, side = abs(slip), math.copysign(1.0, slip)
            if (kick is None and peak > 5.0 and abs(slip) < peak / 3.0 and sv * side < 0.0 and vt[k] > 4.0
                    and drift > 0.0):
                kick = (grid[k] + L["slip_back_s"], -side * min(L["slip_back"], 0.25 * peak))
            goal = kick[1] if kick is not None and grid[k] < kick[0] else tf
            a = w * w * (goal - slip) - 2 * L["slip_zeta"] * w * sv
            a = max(-L["slip_acc"], min(L["slip_acc"], a))
            sv += a * dt
            cap = L["slip_on"] if sv * slip >= 0.0 and abs(goal) >= abs(slip) else L["slip_off"]
            sv = max(-cap, min(cap, sv)) * smoothstep(0.2, 4.0, vt[k])   # à l'arrêt, la caisse ne tourne plus
            slip += sv * dt
            out_slip.append(slip)
        # 4. les limites tiennent-elles après lissage ? sinon raboter là où elles cèdent et recommencer
        new_drag, slid = [0.0] * n, [0.0] * n
        for k in range(N):
            if 0.0 <= st[k] <= S[-1]:
                i = min(n - 1, int(st[k] / ds))
                new_drag[i] = max(new_drag[i], L["slip_drag"] * abs(out_slip[k]))
                slid[i] = max(slid[i], abs(out_slip[k]))
        new_drag = _box(new_drag, int(1.0 / ds) | 1)
        lift = _box([max(0.0, 1.0 - a / 3.0) for a in slid], int(2.0 / ds) | 1)
        worst, at = 0.0, None
        for k in range(N):
            r = max(abs(alat[k]) / L["lat"], math.hypot(along[k], alat[k]) / L["circle"], -along[k] / L["brake"])
            if r > worst:
                worst, at = r, st[k]
        changed = any(abs(a - b) > 0.05 for a, b in zip(new_drag, drag))
        drag = new_drag
        if worst <= 0.985 and not changed:
            break
        if worst > 0.985 and at is not None:
            for i in range(n):
                if abs(S[i] - at) < 2 * ease + 5.0:
                    fac[i] *= 0.97
    # 5. la table : position, vitesse, caps, braquage
    tab = {k: [] for k in ("t", "x", "y", "vx", "vy", "v", "travel", "slip", "head", "steer", "along", "alat")}
    prev_h = None
    for k in range(N):
        x, y, trav, kap = geo[k]
        h = math.radians(trav)
        tab["t"].append(grid[k] + t0)
        tab["x"].append(x)
        tab["y"].append(y)
        tab["vx"].append(-math.sin(h) * vt[k])
        tab["vy"].append(math.cos(h) * vt[k])
        tab["v"].append(vt[k])
        tab["travel"].append(trav)
        tab["slip"].append(out_slip[k])
        hd = trav + out_slip[k]
        hd = hd if prev_h is None else _unwrap(prev_h, hd)
        prev_h = hd
        tab["head"].append(hd)
        tab["along"].append(along[k])
        tab["alat"].append(alat[k])
    steer_prev = 0.0
    for k in range(N):
        a, b = max(0, k - 1), min(N - 1, k + 1)
        om = math.radians(tab["head"][b] - tab["head"][a]) / ((b - a) * dt)
        sp = vt[k]
        if sp > 0.5:
            be = math.radians(-out_slip[k])
            geo_s = math.degrees(math.atan2(sp * math.sin(be) + om * L["front"], sp * math.cos(be)))
            wcs = smoothstep(2.0, 6.0, abs(out_slip[k]))
            steer_prev = max(-STEER_MAX, min(STEER_MAX, geo_s * (1.0 - wcs) - L["counter"] * out_slip[k] * wcs))
        tab["steer"].append(steer_prev)
    t_stop = None
    if stop:
        t_stop = next((tab["t"][k] for k in range(N) if grid[k] > 0 and vt[k] < 0.05), None)
    return Drive(tab, dt, t_stop)


SHAKE_GAIN = 0.5            # v3.1 : les tremblés (plans et opérateur) à la moitié de l'amplitude v3
SHAKE_HZ_MAX = 4.0          # v3.1 : rien au-dessus (le souffle du rotor, la vibration, les ressauts, les passages)


def handheld(t, amp=0.6, rotor=0.12, seed=0.0):
    """La caméra à l'épaule : (dyaw, dpitch, droll en degrés, dx, dy, dz en m). Un bruit lent (0,4 à 1,3 Hz,
    d'amplitude `amp` degrés) et le souffle du rotor (`rotor` degrés). Dynamique active (v3.1) : le tout à
    SHAKE_GAIN, le souffle à 3,1 et 3,7 Hz (sous SHAKE_HZ_MAX) ; FILM3D_DYN=0 : celui d'avant, à 7,9 et 11,3 Hz."""
    def wob(k, f1, f2, f3):
        return (0.55 * math.sin(2 * math.pi * f1 * t + 1.7 * k + seed) + 0.3 * math.sin(2 * math.pi * f2 * t + 0.9 * k)
                + 0.15 * math.sin(2 * math.pi * f3 * t + 2.3 * k + 2 * seed))

    hz = (3.1, 3.7) if dyn_on() else (7.9, 11.3)
    if dyn_on():
        amp, rotor = amp * SHAKE_GAIN, rotor * SHAKE_GAIN
    buf = lambda k: math.sin(2 * math.pi * hz[0] * t + 1.1 * k + seed) * 0.6 + math.sin(2 * math.pi * hz[1] * t + k) * 0.4  # noqa: E731
    g = SHAKE_GAIN if dyn_on() else 1.0
    return (amp * wob(1, 0.41, 0.93, 1.31) + rotor * buf(1),
            amp * 0.8 * wob(2, 0.37, 0.87, 1.23) + rotor * buf(2),
            amp * 0.6 * wob(3, 0.29, 0.71, 1.17) + rotor * 0.5 * buf(3),
            g * 0.012 * wob(4, 0.33, 0.77, 1.1), g * 0.012 * wob(5, 0.31, 0.81, 1.4), g * 0.008 * wob(6, 0.43, 1.03, 1.6))


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
# v3.1 (« pas fluide ») : les amplitudes à la moitié de celles de la v3 et plus rien au-dessus de 4 Hz (la
# vibration à 2,3, 3,1 et 3,7 Hz au lieu de 7 à 14, les ressauts à 3,5 Hz au lieu de 7,5, les passages à 3 Hz
# au lieu de 6, plus longs) : à 24 images par seconde, une vibration rapide se replie en sautillement image à image.
OPERATOR = dict(
    vib_deg=0.0016,          # degrés de vibration par m/s de la caméra (voiture-travelling)
    vib_z=0.00005,           # m de vibration verticale par m/s
    vib_hz=(2.3, 3.1, 3.7),
    vib_air=0.5,             # caméra en l'air (plus de 3 m) : la moitié, et pas de ressauts
    jolt_every=(7.0, 15.0),  # m entre deux ressauts sous la voiture-caméra
    jolt_deg=0.08, jolt_z=0.003, jolt_hz=3.5, jolt_tau=0.22,
    pan_min=12.0,            # degrés de lacet sur le plan : au-delà, c'est un panoramique
    pan_hz=2.0, pan_zeta=0.6,
    tele_lens=100.0,         # mm : au-delà, longue focale
    tele_float=0.0045,       # fraction de la hauteur du cadre
    tele_lag=0.12,           # s
    pass_dist=3.0,           # m entre l'objectif et le flanc d'un véhicule (demi-largeur 1 m)
    pass_deg=0.275, pass_hz=3.0, pass_tau=0.3,
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


def _decay(t, t0, amp, hz, tau, phase=0.0, rise=0.06):
    """Une oscillation amortie qui naît en t0. Dynamique active (v3.1) : elle s'installe en douceur (valeur et
    pente nulles en t0, sur `rise` s), sans quoi son départ est un à-coup d'une image ; FILM3D_DYN=0 : d'un coup."""
    if t < t0:
        return 0.0
    u = t - t0
    on = (1.0 - math.exp(-u / rise)) ** 2 if dyn_on() else 1.0
    return amp * on * math.exp(-u / tau) * math.sin(2 * math.pi * hz * u + phase)


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
            f1, f2, f3 = o["vib_hz"]
            hf = lambda i: (0.5 * math.sin(2 * math.pi * f1 * t + ph[i]) + 0.3 * math.sin(2 * math.pi * f2 * t + ph[i + 1])  # noqa: E731
                            + 0.2 * math.sin(2 * math.pi * f3 * t + ph[i + 2]))
            dy += 0.5 * a * hf(4)
            dp += a * hf(5)
            dr += 0.6 * a * hf(6)
            dz += o["vib_z"] * speed * g * hf(7)
            for tj, s in jolts:
                dp += _decay(t, tj, o["jolt_deg"] * s, o["jolt_hz"], o["jolt_tau"])
                dr += _decay(t, tj, 0.5 * o["jolt_deg"] * s, o["jolt_hz"] * 0.9, o["jolt_tau"], 1.0)
                dz += _decay(t, tj, -o["jolt_z"] * s, o["jolt_hz"], o["jolt_tau"])
        for te, amp in events:
            dp += _decay(t, te, amp, o["pass_hz"], o["pass_tau"])
            dr += _decay(t, te, 0.7 * amp, o["pass_hz"] * 0.85, o["pass_tau"], 0.8)
            dy += _decay(t, te, 0.4 * amp, o["pass_hz"] * 1.25, o["pass_tau"], 2.0)
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


# ---------------------------------------------------------------- la mesure des caméras, sans Blender
#
# Sur les clés calculées, plan par plan : la vitesse angulaire du panoramique (lacet) et de la bascule (site), la
# vitesse et l'accélération de la caméra par rapport à la berline, la part des images où la caméra est derrière
# elle (dans le demi-espace arrière de son cap), la place et la largeur de la berline à l'écran à la première et à
# la dernière image. Deux colonnes : la trajectoire lissée (la caméra écrite, tremblés motion.handheld coupés) et
# la trajectoire finale (ce que key_camera clé : l'écrite, tremblés compris, plus l'opérateur). Les vitesses se
# lisent d'une image rendue à la suivante, comme à l'écran.
#   python3 tools/film3d/motion.py mesure [PLAN…]

HERO_BOX = (4.9, 1.8, 1.45)      # la berline : longueur, largeur, hauteur (m)
SMOOTH_HALF = 2                  # images de part et d'autre : la moyenne de la colonne « finale » (5 images)


class handheld_off:
    """Le temps d'un bloc, motion.handheld rend zéro : la trajectoire écrite sans ses tremblés (la « lissée »)."""

    def __enter__(self):
        g = globals()
        self.old = g["handheld"]
        g["handheld"] = lambda t, amp=0.6, rotor=0.12, seed=0.0: (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        return self

    def __exit__(self, *exc):
        globals()["handheld"] = self.old
        return False


def screen_point(cam, p):
    """(u, v) d'un point du monde dans l'image de la caméra cam = (x, y, z, lacet, site, roulis, focale), comme
    key_camera la pose (cadre 9:16, capteur de 36 mm sur la hauteur) : u depuis la gauche, v depuis le haut, de 0 à
    1 dans le cadre ; None derrière l'objectif."""
    x, y, z, yaw, pitch, roll, lens = cam
    a, b, c = math.radians(yaw), math.radians(pitch), math.radians(roll)
    f = (-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
    r = (-math.cos(a), math.sin(a), 0.0)
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    r, u = ([math.cos(c) * r[i] + math.sin(c) * u[i] for i in range(3)],
            [-math.sin(c) * r[i] + math.cos(c) * u[i] for i in range(3)])
    d = (p[0] - x, p[1] - y, p[2] - z)
    depth = sum(d[i] * f[i] for i in range(3))
    if depth <= 0.01:
        return None
    return (0.5 + 0.5 * sum(d[i] * r[i] for i in range(3)) / depth / (10.125 / lens),
            0.5 - 0.5 * sum(d[i] * u[i] for i in range(3)) / depth / (18.0 / lens))


def hero_screen(cam, x, y, z, heading, box=HERO_BOX):
    """La boîte de la berline à l'écran : dict(u, v (son centre, depuis la gauche et le haut), w (sa largeur),
    u0, u1, v0, v1), en fractions du cadre ; None si elle est entière derrière l'objectif."""
    h = math.radians(heading)
    fx, fy = -math.sin(h), math.cos(h)
    l, w, ht = box
    pts = [screen_point(cam, (x + fx * l * a + fy * w * b, y + fy * l * a - fx * w * b, z + zz))
           for a in (-0.5, 0.5) for b in (-0.5, 0.5) for zz in (0.0, ht)]
    pts = [p for p in pts if p]
    if not pts:
        return None
    u0, u1 = min(p[0] for p in pts), max(p[0] for p in pts)
    v0, v1 = min(p[1] for p in pts), max(p[1] for p in pts)
    return dict(u=(u0 + u1) / 2, v=(v0 + v1) / 2, w=u1 - u0, u0=u0, u1=u1, v0=v0, v1=v1)


def shot_metrics(cam, hero, frames, heading=None, slip=None, ground=None, tracks=(), seed=0.0, rest=0.0,
                 box=HERO_BOX, f0=F0, fps=FPS, op=None, rail=None, **_):
    """Les mesures d'un plan (voir plus haut). cam(t) -> (x, y, z, lacet, site, roulis, focale) comme la scène la
    passe à key_camera ; hero(t) -> (x, y) ; son cap : heading(t), sinon celui de sa marche plus slip(t) (rest à
    l'arrêt) ; ground(x, y) -> (z, …) le sol sous elle ; tracks : les pos(t) des véhicules (secousses de passage).
    frames : les images rendues ; op : des réglages de l'opérateur (OPERATOR) à changer pour la mesure ; rail : la
    caméra sans tremblé du plan (camera_rail), la colonne « lissée » (sinon cam, motion.handheld coupé).
    Rend {"lissee": {...}, "finale": {...}, "brute": {...}, "kind": ..., "derriere": ..., "debut": ..., "fin": ...}."""
    frames = list(frames)
    keyed = list(range(frames[0] - 1, frames[-1] + 2))

    def head(t):
        if heading is not None:
            return heading(t)
        (vx, vy), _ = kinematics(hero, t)
        base = heading_of(vx, vy) if math.hypot(vx, vy) > 0.3 else rest
        return base + (slip(t) if slip else 0.0)

    hp, hh = {}, {}
    for f in keyed:
        t = t_of(f, f0, fps)
        x, y = hero(t)[:2]
        hp[f] = (x, y, ground(x, y)[0] if ground else 0.0)
        hh[f] = head(t)
    if rail is not None:
        smooth = {f: tuple(rail(t_of(f, f0, fps))) for f in keyed}
    else:
        with handheld_off():
            smooth = {f: tuple(cam(t_of(f, f0, fps))) for f in keyed}
    if dyn_on():
        trs = []
        for fn in tracks:
            tr = {}
            for f in keyed:
                x, y = fn(t_of(f, f0, fps))[:2]
                tr[f] = (x, y, ground(x, y)[0] if ground else 0.0)
            trs.append(tr)
        final = camera_operator(cam, keyed, f0, fps, tracks=trs, seed=seed, op=op)
        kind = final.pop("kind")
    else:
        final = {f: tuple(cam(t_of(f, f0, fps))) for f in keyed}
        kind = camera_kind(cam, keyed, f0, fps)

    def rates(vals, angles=None):
        out = {}
        ang = angles or vals
        for key, i in (("pan", 3), ("tilt", 4)):
            best, at = 0.0, frames[0]
            for fa, fb in zip(frames, frames[1:]):
                r = abs(_unwrap(ang[fa][i], ang[fb][i]) - ang[fa][i]) * fps
                if r > best:
                    best, at = r, fa
            out[key], out[key + "_at"] = best, at
        # d'une image rendue à la suivante (les clés hors du plan, souvent figées, ne comptent pas)
        rel = {f: [vals[f][k] - hp[f][k] for k in range(3)] for f in frames}
        v = [math.dist(rel[f + 1], rel[f]) * fps for f in frames[:-1]]
        a = [math.sqrt(sum((rel[f + 1][k] - 2 * rel[f][k] + rel[f - 1][k]) ** 2 for k in range(3))) * fps * fps
             for f in frames[1:-1]]
        out["v_rel"], out["a_rel"] = max(v), max(a)
        out["v_rel_at"], out["a_rel_at"] = frames[v.index(max(v))], frames[1 + a.index(max(a))]
        return out

    def perceived(vals):
        """Le lacet et le site des clés moyennés sur cinq images (0,2 s), fenêtre symétrique qui se resserre aux
        bords (une rampe reste une rampe) : les vibrations (7 à 14 Hz), ressauts et tremblés rapides s'y effacent,
        le mouvement reste. Les positions restent les clés : la vibration n'y pèse que quelques millimètres."""
        un, prev = {}, None
        for f in frames:
            y = vals[f][3] if prev is None else _unwrap(prev, vals[f][3])
            un[f] = (y, vals[f][4])
            prev = y
        out = {}
        for f in frames:
            h = min(SMOOTH_HALF, f - frames[0], frames[-1] - f)
            win = [un[g] for g in range(f - h, f + h + 1)]
            out[f] = (*vals[f][:3], sum(w[0] for w in win) / len(win), sum(w[1] for w in win) / len(win),
                      *vals[f][5:])
        return out

    behind = 0
    for f in frames:
        h = math.radians(hh[f])
        dx, dy = final[f][0] - hp[f][0], final[f][1] - hp[f][1]
        behind += (dx * -math.sin(h) + dy * math.cos(h)) < 0.0
    first, last = frames[0], frames[-1]
    return dict(lissee=rates(smooth), finale=rates(final, perceived(final)), brute=rates(final), kind=kind,
                derriere=behind / len(frames),
                debut=hero_screen(final[first], *hp[first], hh[first], box),
                fin=hero_screen(final[last], *hp[last], hh[last], box))


def _bridge_z(y, _tab={}):
    """La hauteur du tablier de P4 (scene_c.deck_z, recopiée sans Blender) : crête en -130, pied en -5, 6 %.
    Intégrée par pas de 0,25 m de -1010 à 110, puis lue en interpolation linéaire entre deux pas, comme deck_z :
    un arrondi au quart de mètre ferait des marches de 7 mm sur la pente (des à-coups à 200 mm)."""
    if not _tab:
        def ramp(y, a, t):
            return min(1.0, max(0.0, (y - (a - t / 2)) / t))
        z, yy, step = 0.0, -1010.0, 0.25
        while yy <= 110.0:
            _tab[round(yy * 4)] = z
            z += 0.06 * (ramp(yy + step / 2, -255.0, 12.0) - 2 * ramp(yy + step / 2, -130.0, 20.0)
                         + ramp(yy + step / 2, -5.0, 12.0)) * step
            yy += step
    k = y * 4
    k0 = math.floor(k)
    a = _tab.get(k0, 0.0)
    b = _tab.get(k0 + 1, a)
    return max(0.0, a + (b - a) * (k - k0))


def shot_specs():
    """Les neuf plans comme leurs scènes les clés : {plan: arguments de shot_metrics} (les modules des plans, sans
    Blender). Un plan migré au découpage v3 porte V3 = True : sa caméra est camera(t), sa caméra sans tremblé
    camera_rail(t) ; un plan v2 garde la caméra que sa scène clé (celle de P2 recopie scene_carrefour.low_camera,
    en repère de l'arc). Chaque spec porte aussi module, v3 et named ({nom: pos(t)} des véhicules)."""
    import fin6_orbite as F6
    import fin_pointe as F
    import ouv_avenue as OUV
    import p1_avenue as P1
    import p2_arc as P2
    import p3_enseignes as P3
    import p4_pont as P4
    import p5_virage as P5
    import p6_jetee as P6

    def seed(name):
        return sum(map(ord, name)) % 97

    def rng(mod):
        return range(mod.F0, mod.F0 + mod.FRAMES)

    def p2_cam(t):
        x, y, z = P2.low_cam_pos(t)
        ax, ay, az = P2.low_cam_aim(t)
        dx, dy, dz = ax - x, ay - y, az - z
        yaw = math.degrees(math.atan2(-dx, -dy))
        pitch = math.degrees(math.atan2(dz, math.hypot(dx, dy)))
        dyaw, dpitch, droll, ddx, ddy, ddz = handheld(t, amp=0.25, rotor=0.15, seed=2.7)
        return x + ddx, y + ddy, z + ddz, yaw + dyaw, pitch + dpitch, droll, P2.LOW_LENS

    def plan(mod, cam, name, **kw):
        v31 = bool(getattr(mod, "V31", False))
        v3 = bool(getattr(mod, "V3", False)) or v31
        named = dict(mod.tracks()) if hasattr(mod, "tracks") else {}
        return dict(cam=mod.camera if v3 else cam, rail=getattr(mod, "camera_rail", None), module=mod, v3=v3, v31=v31,
                    frames=rng(mod), tracks=list(named.values()), named=named, seed=seed(name), **kw)

    return {
        "OUV": plan(OUV, OUV.camera, "cam", hero=OUV.hero_pos),
        "P1": plan(P1, P1.camera, "cam", hero=P1.hero_pos),
        "P2": plan(P2, p2_cam, "cam", hero=P2.hero_pos, slip=P2.hero_slip),
        "P3": plan(P3, P3.camera, "cam", hero=P3.hero_pos, heading=P3.hero_heading),
        "P4": plan(P4, P4.camera, "cam_P4", hero=P4.hero_pos, ground=lambda x, y: (_bridge_z(y),)),
        "P5": plan(P5, P5.camera, "cam_P5", hero=P5.hero_pos, slip=P5.hero_slip),
        "P6": plan(P6, P6.camera, "cam_P6", hero=P6.hero_pos),
        "FIN": plan(F, F.camera, "cam_FIN", hero=F.hero_pos, heading=F.hero_heading),
        "FIN6": plan(F6, F6.camera, "cam_FIN6", hero=getattr(F6, "hero_pos", lambda t: (F6.CX, F6.CY)),
                     heading=getattr(F6, "hero_heading", lambda t: F6.HERO_STOP)),
    }


PLANS = ("OUV", "P1", "P2", "P3", "P4", "P5", "P6", "FIN", "FIN6")


def measure_shots(plans=PLANS, op=None):
    """{plan: shot_metrics} des plans demandés."""
    specs = shot_specs()
    return {p: shot_metrics(**specs[p], op=op) for p in plans}


def measure_table(res):
    """Le tableau des mesures, une ligne par plan (lissée / finale)."""
    def scr(s):
        return "      hors champ     " if not s else f"{s['u'] * 100:3.0f} {s['v'] * 100:3.0f} {s['w'] * 100:3.0f}"
    lines = ["plan  type   panoramique °/s (image)   bascule °/s (image)       v rel m/s       a rel m/s²    "
             "derrière  début u v l %  fin u v l %",
             "             lissée finale brute       lissée finale brute     lissée finale  lissée finale"]
    for p, m in res.items():
        k = m["kind"]
        typ = ("tele" if k.get("tele") else "pan" if k.get("pan_active", k.get("pan", 0) >= OPERATOR["pan_min"])
               else "trav" if k.get("travel", 0) > 1.5 else "fixe") + ("/air" if k.get("air") else "")
        a, b, c = m["lissee"], m["finale"], m["brute"]
        lines.append(f"{p:5s} {typ:6s} {a['pan']:6.1f} {b['pan']:6.1f} {c['pan']:5.1f} ({a['pan_at']:2d})     "
                     f"{a['tilt']:6.1f} {b['tilt']:6.1f} {c['tilt']:5.1f} ({a['tilt_at']:2d})   "
                     f"{a['v_rel']:6.1f} {b['v_rel']:6.1f}  {a['a_rel']:6.1f} {b['a_rel']:6.1f}   "
                     f"{m['derriere'] * 100:4.0f} %   {scr(m['debut'])}    {scr(m['fin'])}")
    lines.append("lissée : la caméra écrite sans ses tremblés ; finale : les clés (tremblés et opérateur compris) "
                 f"moyennées sur {2 * SMOOTH_HALF + 1} images ; brute : les clés image à image. u, v : centre de la "
                 "berline depuis la gauche et le haut, l : sa largeur, en % du cadre.")
    return "\n".join(lines)


# ---------------------------------------------------------------- découpage v3 : les contrôles
#
# docs/cinematique-decoupage-v3.md, section 6 (règles en 2.2 à 2.4, coupes au tableau 5). Les plafonds sont en
# tête de test_motion.py (v3_limits) ; seuls les plans qui portent V3 = True sont contrôlés, les autres sont
# mesurés pour information. Vitesses sur la caméra sans tremblé (camera_rail), en différences centrées sur trois
# images ; cadre, derrière et raccords sur les clés finales (tremblés et opérateur compris).
#   python3 tools/film3d/motion.py mesure --v3 [PLAN…]

PHARE_AT = (75.0, 458.3, 16.8)       # la lanterne du phare de la pointe (lieux.phare : 16,2 à 17,4 m)
PHARE_WORLD = ("P4", "P5", "P6", "FIN", "FIN6")     # les scènes où il est à sa vraie place (C, D, E)
# le tableau 3 : les images où il doit se voir (None : toutes ; () : absent du plan)
PHARE_FRAMES = {"OUV": None, "P1": None, "P2": (30, 48), "P3": None, "P4": (), "P5": (1, 20), "P6": None,
                "FIN": None, "FIN6": (1, 15)}
# le tableau 5 : (sortant, entrant, berline visée à la sortie, à l'entrée : centre x, centre y, largeur en %)
CUTS = [("OUV", "P1", (50, 54, 34), (52, 54, 44)), ("P1", "P2", (58, 54, 38), (50, 55, 40)),
        ("P2", "P3", (52, 55, 44), (50, 48, 38)), ("P3", "P4", (50, 55, 40), (50, 56, 17)),
        ("P4", "P5", (50, 52, 44), (50, 54, 40)), ("P5", "P6", (56, 52, 36), (50, 52, 42)),
        ("P6", "FIN6", (50, 50, 37), (50, 54, 44)), ("P1", "FIN", (58, 54, 38), (50, 55, 44)),
        ("P2", "FIN", (52, 55, 44), (50, 55, 44)), ("P3", "FIN", (50, 55, 40), (50, 55, 44)),
        ("P4", "FIN", (50, 52, 44), (50, 55, 44)), ("P5", "FIN", (56, 52, 36), (50, 55, 44))]
CUT_XY_ONLY = {("P3", "P4")}         # l'entrée de P4 à 17 % : seule entorse de taille
FILM_SIX = ("OUV", "P1", "P2", "P3", "P4", "P5", "P6", "FIN6")
FILM_ONE = ("OUV", "P1", "FIN")
CAR_DIMS = {"hero": HERO_BOX, "van": (5.4, 2.0, 2.1), "patrol": (5.0, 1.95, 1.5)}


def frame_box(cam, pose, dims=HERO_BOX):
    """La boîte de la berline dans le cadre de cam = (x, y, z, lacet, site, roulis, focale) : (x0, x1, y0, y1, d),
    x depuis la gauche et y depuis le bas en % (comme p5_virage.frame_box, généralisée), d la distance de
    l'objectif au coin le plus proche ; pose : dict(x, y, heading[, z]) ; None si elle est entière derrière."""
    h = math.radians(pose["heading"])
    fx, fy = -math.sin(h), math.cos(h)
    rx, ry = fy, -fx
    l2, w2, ht = dims[0] / 2, dims[1] / 2, dims[2]
    z0 = pose.get("z", 0.0)
    pts = []
    for a in (-l2, l2):
        for b in (-w2, w2):
            for z in (0.1, ht):
                p = (pose["x"] + fx * a + rx * b, pose["y"] + fy * a + ry * b, z0 + z)
                q = screen_point(cam, p)
                if q:
                    pts.append((100.0 * q[0], 100.0 * (1.0 - q[1]), math.dist(cam[:3], p)))
    if not pts:
        return None
    return (min(q[0] for q in pts), max(q[0] for q in pts), min(q[1] for q in pts), max(q[1] for q in pts),
            min(q[2] for q in pts))


def _ref_heading(pose):
    """L'axe de référence de la berline : sa vitesse ; à l'arrêt l'axe de sa caisse (mélange de 0,5 à 2 m/s)."""
    w = smoothstep(0.5, 2.0, pose.get("speed", 0.0))
    tr = pose.get("travel")
    if tr is None:
        return pose["heading"]
    return pose["heading"] + w * (_unwrap(pose["heading"], tr) - pose["heading"])


def behind_angle(cam, pose):
    """L'angle en degrés entre (berline → caméra) et l'arrière de sa route (l'opposé de sa vitesse, l'axe de sa
    caisse à l'arrêt) : 0 pile derrière, 180 pile devant. « Derrière » : 60 au plus ; « de face » : 120 au moins."""
    h = math.radians(_ref_heading(pose))
    dx, dy = cam[0] - pose["x"], cam[1] - pose["y"]
    n = math.hypot(dx, dy)
    if n < 1e-6:
        return 0.0
    c = (dx * math.sin(h) - dy * math.cos(h)) / n
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _rect(c, heading, dims):
    h = math.radians(heading)
    fx, fy = -math.sin(h), math.cos(h)
    rx, ry = fy, -fx
    l2, w2 = dims[0] / 2, dims[1] / 2
    return [(c[0] + fx * a + rx * b, c[1] + fy * a + ry * b) for a, b in ((l2, w2), (l2, -w2), (-l2, -w2), (-l2, w2))]


def _pt_seg(p, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]
    n = ax * ax + ay * ay
    u = 0.0 if n < 1e-12 else max(0.0, min(1.0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / n))
    return math.hypot(p[0] - a[0] - u * ax, p[1] - a[1] - u * ay)


def _inside(p, poly):
    s = [((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) for a, b in zip(poly, poly[1:] + poly[:1])]
    return all(v >= 0 for v in s) or all(v <= 0 for v in s)


def _poly_gap(A, B):
    """L'écart entre deux rectangles au sol (négatif ou nul s'ils se touchent)."""
    if any(_inside(p, B) for p in A) or any(_inside(p, A) for p in B):
        return 0.0
    return min(min(_pt_seg(p, a, b) for a, b in zip(Q, Q[1:] + Q[:1])) for P, Q in ((A, B), (B, A)) for p in P)


def _point_gap(p, poly):
    return 0.0 if _inside(p, poly) else min(_pt_seg(p, a, b) for a, b in zip(poly, poly[1:] + poly[:1]))


def _dims_of(name):
    n = name.lower()
    return CAR_DIMS["hero"] if n in ("hero", "berline") else CAR_DIMS["van"] if ("van" in n or "fourgon" in n) \
        else CAR_DIMS["patrol"]


def _aircraft(mod):
    """{nom: pos(t) -> (x, y, z)} des aéronefs du plan : mod.aircraft() si le fichier l'expose, sinon ce que
    les plans v2 en ont (P5 : heli, P6 : heli(i), jet(i), FIN : HELI)."""
    if hasattr(mod, "aircraft"):
        return {k: (lambda fn: lambda t: tuple(fn(t))[:3])(fn) for k, fn in mod.aircraft().items()}
    out = {}
    name = mod.__name__
    if name == "p5_virage" and hasattr(mod, "heli"):
        out["heli"] = lambda t: (mod.heli(t)[0], mod.heli(t)[1], mod.heli(t)[2] + getattr(mod, "HELI_BODY", 0.0))
    if name == "p6_jetee":
        for i in range(len(getattr(mod, "HELIS", ()))):
            out[f"heli_{i}"] = (lambda fn: lambda t: tuple(fn(t))[:3])(mod.heli(i))
        for i in range(len(getattr(mod, "JETS", ()))):
            out[f"jet_{i}"] = (lambda fn: lambda t: tuple(fn(t))[:3])(mod.jet(i))
    if name == "fin_pointe" and hasattr(mod, "HELI"):
        out["heli"] = lambda t: tuple(mod.HELI)[:3]
    return out


def _phare_ready():
    """Vrai quand lieux.phare existe (lu dans lieux.py, sans Blender)."""
    import re
    try:
        src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "lieux.py"), encoding="utf-8").read()
    except OSError:
        return False
    return re.search(r"^def phare\(", src, re.M) is not None


def plan_data(plan, spec, f0=F0, fps=FPS):
    """Ce qu'un plan donne image par image : poses de la berline, caméra sans tremblé (rail) et clés finales."""
    frames = list(spec["frames"])
    keyed = list(range(frames[0] - 1, frames[-1] + 2))
    hero, heading, slip, ground = spec["hero"], spec.get("heading"), spec.get("slip"), spec.get("ground")
    poses, prev = {}, spec.get("rest", 0.0)
    for f in keyed:
        t = t_of(f, f0, fps)
        x, y = hero(t)[:2]
        (vx, vy), _ = kinematics(hero, t)
        sp = math.hypot(vx, vy)
        travel = heading_of(vx, vy) if sp > 1e-3 else None
        if heading is not None:
            body = heading(t)
        else:
            body = (travel if travel is not None else prev) + (slip(t) if slip else 0.0)
        prev = body - (slip(t) if slip and heading is None else 0.0)
        poses[f] = dict(frame=f, t=t, x=x, y=y, z=ground(x, y)[0] if ground else 0.0, heading=body,
                        travel=travel, speed=sp)
    cam = spec["cam"]
    if spec.get("rail") is not None:
        rail = {f: tuple(spec["rail"](t_of(f, f0, fps))) for f in keyed}
    else:
        with handheld_off():
            rail = {f: tuple(cam(t_of(f, f0, fps))) for f in keyed}
    if dyn_on():
        trs = []
        for fn in spec.get("tracks", ()):
            tr = {}
            for f in keyed:
                x, y = fn(t_of(f, f0, fps))[:2]
                tr[f] = (x, y, ground(x, y)[0] if ground else 0.0)
            trs.append(tr)
        final = camera_operator(cam, keyed, f0, fps, tracks=trs, seed=spec.get("seed", 0.0))
        final.pop("kind")
    else:
        final = {f: tuple(cam(t_of(f, f0, fps))) for f in keyed}
    return dict(plan=plan, frames=frames, keyed=keyed, poses=poses, rail=rail, final=final, spec=spec,
                module=spec.get("module"), v3=spec.get("v3", False),
                v31=spec.get("v31", False), ground=ground, fps=fps, f0=f0)


def rail_rates(d):
    """Les vitesses de la caméra sans tremblé, image par image (différences centrées sur trois images rendues :
    de la deuxième à l'avant-dernière, les clés hors du plan, souvent figées, ne comptent pas) : {grandeur:
    {image: valeur}} ; angles en °/s et °/s², distances en m/s et m/s², focale en fraction par s ; « lens » : la
    focale de chaque image rendue."""
    R, P, fps = d["rail"], d["poses"], d["fps"]
    out = {k: {} for k in ("pan", "pan_acc", "tilt", "tilt_acc", "roll", "roll_rate", "vrel", "arel", "accel",
                           "crane", "crane_acc", "orbit", "orbit_acc", "zoom_rate", "lens")}
    yaw, az, prev_y, prev_a = {}, {}, None, None
    for f in d["keyed"]:
        y = R[f][3] if prev_y is None else _unwrap(prev_y, R[f][3])
        yaw[f], prev_y = y, y
        p = P[f]
        a = math.degrees(math.atan2(R[f][0] - p["x"], R[f][1] - p["y"])) + _ref_heading(p)
        a = a if prev_a is None else _unwrap(prev_a, a)
        az[f], prev_a = a, a

    def rel(f):
        p = P[f]
        return (R[f][0] - p["x"], R[f][1] - p["y"], R[f][2] - (p["z"] + 0.7))

    for f in d["frames"]:
        out["lens"][f] = R[f][6]
    for f in d["frames"][1:-1]:
        a, b = f - 1, f + 1
        out["pan"][f] = abs(yaw[b] - yaw[a]) * fps / 2
        out["pan_acc"][f] = abs(yaw[b] - 2 * yaw[f] + yaw[a]) * fps * fps
        out["tilt"][f] = abs(R[b][4] - R[a][4]) * fps / 2
        out["tilt_acc"][f] = abs(R[b][4] - 2 * R[f][4] + R[a][4]) * fps * fps
        out["roll"][f] = abs(R[f][5])
        out["roll_rate"][f] = abs(R[b][5] - R[a][5]) * fps / 2
        ra, rf, rb = rel(a), rel(f), rel(b)
        out["vrel"][f] = abs(math.hypot(*rb) - math.hypot(*ra)) * fps / 2
        out["arel"][f] = math.sqrt(sum((rb[k] - 2 * rf[k] + ra[k]) ** 2 for k in range(3))) * fps * fps
        out["accel"][f] = math.sqrt(sum((R[b][k] - 2 * R[f][k] + R[a][k]) ** 2 for k in range(3))) * fps * fps
        out["crane"][f] = abs(R[b][2] - R[a][2]) * fps / 2
        out["crane_acc"][f] = abs(R[b][2] - 2 * R[f][2] + R[a][2]) * fps * fps
        out["orbit"][f] = abs(az[b] - az[a]) * fps / 2
        out["orbit_acc"][f] = abs(az[b] - 2 * az[f] + az[a]) * fps * fps
        out["zoom_rate"][f] = abs(R[b][6] - R[a][6]) * fps / 2 / R[f][6]
    return out


def _peak(series):
    f = max(series, key=lambda k: series[k])
    return series[f], f


def _windows(frames_over):
    runs, cur = [], []
    for f in sorted(frames_over):
        if cur and f != cur[-1] + 1:
            runs.append(cur)
            cur = []
        cur.append(f)
    if cur:
        runs.append(cur)
    return runs


def screen_y(y_bottom, lim):
    """Le centre en hauteur dans la convention des fiches (lim["y_from_top"] : depuis le haut, sinon le bas)."""
    return 100.0 - y_bottom if lim.get("y_from_top", True) else y_bottom


def box_center(b, lim):
    """(x, y, largeur) en % d'une boîte de frame_box, y dans la convention des fiches."""
    return (b[0] + b[1]) / 2, screen_y((b[2] + b[3]) / 2, lim), b[1] - b[0]


def plan_checks(d, base, own):
    """Les contrôles de la section 6 sur un plan : [(nom, tient, détail)]. base : les plafonds communs ; own :
    ceux du plan (CAM_LIMITS_PLAN), qui remplacent les communs (None : pas de contrôle)."""
    lim = dict(base, **own)
    plan, frames, P, F = d["plan"], d["frames"], d["poses"], d["final"]
    mod = d["module"]
    out = []

    def add(name, ok, detail):
        out.append((name, bool(ok), detail))

    # 1. durées
    try:
        import render_film as RF
        cut, fb = RF.read_cut().get(plan), RF.FALLBACK_FRAMES.get(plan)
        n = getattr(mod, "FRAMES", len(frames))
        add(f"durée {n} images = cut.ts ({cut}) = FALLBACK_FRAMES ({fb})", n == cut == fb, "")
    except ImportError as e:
        add("durée contre cut.ts", False, f"render_film illisible ({e})")
    # 2. derrière, de face
    ang = {f: behind_angle(F[f], P[f]) for f in frames}
    back = sum(a <= 60.0 for a in ang.values()) / len(frames)
    front = sum(a >= 120.0 for a in ang.values()) / len(frames)
    if lim.get("behind") is not None:
        add(f"derrière ≥ {lim['behind'] * 100:.0f} % des images", back >= lim["behind"] - 1e-9,
            f"{back * 100:.0f} % (de face {front * 100:.0f} %)")
    if lim.get("front_max") is not None:
        add(f"de face ≤ {lim['front_max'] * 100:.0f} % des images", front <= lim["front_max"] + 1e-9,
            f"{front * 100:.0f} %")
    # 3. vitesses, sur la caméra sans tremblé
    r = rail_rates(d)
    if lim.get("pan") is not None:
        inner = list(r["pan"])
        if "pan" in own:
            ceil = {f: own["pan"] for f in inner}
        else:
            ceil = {f: lim["pan"] * (1.0 if r["lens"][f] <= lim["pan_lens"] else 24.0 / r["lens"][f]) for f in inner}
        if lim.get("pan_frames"):
            basec = {f: base["pan"] * (1.0 if r["lens"][f] <= base["pan_lens"] else 24.0 / r["lens"][f])
                     for f in inner}
            over = [f for f in inner if r["pan"][f] > basec[f] + 1e-9]
            runs = _windows(over)
            v, f = _peak(r["pan"])
            add(f"panoramique vif : une fenêtre de {lim['pan_frames']} images au plus au-delà de "
                f"{min(basec.values()):.0f}°/s, crête ≤ {own['pan']:.0f}°/s",
                len(runs) <= 1 and all(len(w) <= lim["pan_frames"] for w in runs) and v <= own["pan"] + 1e-9,
                f"{len(runs)} fenêtre(s) {[f'{w[0]}-{w[-1]}' for w in runs]}, crête {v:.1f}°/s à l'image {f}")
        else:
            bad = {f: r["pan"][f] for f in inner if r["pan"][f] > ceil[f] + 1e-9}
            v, f = _peak(r["pan"])
            add(f"panoramique ≤ {min(ceil.values()):.1f}°/s", not bad,
                f"{max(bad.values()):.1f}°/s à l'image {max(bad, key=bad.get)}" if bad else f"crête {v:.1f}°/s ({f})")
    if lim.get("pan_acc") is not None:
        bad = {f: r["pan_acc"][f] / fov_deg(r["lens"][f])[0] for f in r["pan_acc"]}
        v, f = _peak(bad)
        add(f"accélération de panoramique ≤ {lim['pan_acc']} largeur/s²", v <= lim["pan_acc"] + 1e-9,
            f"{v:.2f} largeur/s² ({r['pan_acc'][f]:.0f}°/s²) à l'image {f}")
    for key, label, unit in (("tilt", "bascule", "°/s"), ("tilt_acc", "accélération de bascule", "°/s²"),
                             ("roll", "roulis de la caméra", "°"), ("roll_rate", "vitesse de roulis", "°/s"),
                             ("vrel", "variation de l'écart caméra–berline", "m/s"),
                             ("arel", "accélération par rapport à la berline", "m/s²"),
                             ("accel", "accélération propre", "m/s²"), ("crane", "grue", "m/s"),
                             ("crane_acc", "accélération de grue", "m/s²"), ("orbit", "orbite (azimut)", "°/s"),
                             ("orbit_acc", "accélération d'orbite", "°/s²")):
        # l'orbite ne vaut que pour les plans qui en ont une (CAM_LIMITS_PLAN : FIN6) : une caméra qui roule
        # derrière la berline ou un pied qu'elle frôle changent vite d'azimut sans tourner autour d'elle
        if key == "orbit_acc" and lim.get("orbit") is None:
            continue
        if lim.get(key) is not None:
            v, f = _peak(r[key])
            add(f"{label} ≤ {lim[key]:g} {unit}", v <= lim[key] + 1e-9, f"{v:.2f} {unit} à l'image {f}")
    lens = [r["lens"][f] for f in frames]
    zoom = (max(lens) - min(lens)) / min(lens)
    if lim.get("zoom"):
        v, f = _peak(r["zoom_rate"])
        add(f"focale ≤ {lim['zoom_rate'] * 100:.0f} %/s, ≤ {lim['zoom_total'] * 100:.0f} % sur le plan",
            v <= lim["zoom_rate"] + 1e-9 and zoom <= lim["zoom_total"] + 1e-9,
            f"{v * 100:.1f} %/s à l'image {f}, {zoom * 100:.1f} % sur le plan")
    else:
        add("focale fixe (seul P4 zoome)", zoom <= 1e-3, f"{min(lens):.1f} à {max(lens):.1f} mm")
    # 5. cadre
    boxes = {f: frame_box(F[f], P[f]) for f in frames}
    y0, y1 = lim["band"]
    inband = [f for f in frames if boxes[f] and boxes[f][2] >= y0 and boxes[f][3] <= y1]
    add(f"berline dans y {y0:.0f}–{y1:.0f} % sur {lim['band_share'] * 100:.0f} % des images",
        len(inband) >= lim["band_share"] * len(frames) - 1e-9,
        f"{len(inband)}/{len(frames)} (hors : {[f for f in frames if f not in inband][:8]})")
    g = d["ground"]
    low = [f for f in frames if F[f][2] - (g(F[f][0], F[f][1])[0] if g else 0.0) <= lim["low_z"] + 1e-9]
    lo, hi = lim["low_center"]
    if lim.get("low_all"):
        low = list(frames)
    if low:
        bad = [f for f in low if not (boxes[f] and lo * 100 <= box_center(boxes[f], lim)[1] <= hi * 100)]
        ys = [box_center(boxes[f], lim)[1] for f in low if boxes[f]]
        add(f"centre entre {lo * 100:.0f} et {hi * 100:.0f} % de la hauteur"
            f"{'' if lim.get('low_all') else ' (caméra à 1 m ou moins)'}", not bad,
            f"{min(ys):.0f} à {max(ys):.0f} %{' ; images ' + str(bad[:8]) if bad else ''}")
    wide = [f for f in frames if boxes[f] and boxes[f][1] - boxes[f][0] >= lim["width_min"] * 100]
    ws = [boxes[f][1] - boxes[f][0] for f in frames if boxes[f]]
    add(f"largeur ≥ {lim['width_min'] * 100:.0f} % sur {lim['width_share'] * 100:.0f} % des images",
        len(wide) >= lim["width_share"] * len(frames) - 1e-9,
        f"{len(wide)}/{len(frames)} images, largeur {min(ws):.0f} à {max(ws):.0f} %")
    # 6. le phare
    rng = PHARE_FRAMES.get(plan)
    at = getattr(mod, "PHARE_AT", None) or (PHARE_AT if plan in PHARE_WORLD and _phare_ready() else None)
    if rng != () and at is not None:
        fr = [f for f in frames if rng is None or rng[0] <= f <= rng[1]]
        bad = []
        for f in fr:
            q = screen_point(F[f], at)
            b = boxes[f]
            ok = q is not None
            if ok:
                x, y = 100 * q[0], 100 * (1 - q[1])
                ok = (lim["phare_x"][0] <= x <= lim["phare_x"][1] and lim["phare_y"][0] <= y <= lim["phare_y"][1]
                      and not (b and b[0] <= x <= b[1] and b[2] <= y <= b[3]))
            if not ok:
                bad.append(f)
        add("le phare dans x 5–95 %, y 15–88 %, hors de la berline", not bad, f"images {bad[:8]}" if bad else
            f"{len(fr)} images")
    elif rng != ():
        add("le phare (en attente de lieux.phare ou de PHARE_AT)", True, "non contrôlé")
    # 7. écarts entre caisses, caméra–véhicules et poteaux
    named = d["spec"].get("named") or {}
    heads = mod.tracks_heading() if hasattr(mod, "tracks_heading") else {}
    best, cam_best, last_h, blind = (float("inf"), None, ""), (float("inf"), None, ""), {}, set()
    for f in frames:
        t = P[f]["t"]
        shapes = {}
        for n, fn in named.items():
            x, y = fn(t)[:2]
            dims = _dims_of(n)
            if n in ("hero", "berline"):
                h = P[f]["heading"]
            elif n in heads:
                h = heads[n](t)
            else:
                (vx, vy), _ = kinematics(fn, t)
                h = heading_of(vx, vy) if math.hypot(vx, vy) > 0.3 else last_h.get(n)
            if h is not None:
                last_h[n] = h
            else:
                blind.add(n)
            shapes[n] = ((x, y), h, dims)
        names = sorted(shapes)
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                (ca, ha, da), (cb, hb, db) = shapes[a], shapes[b]
                if ha is not None and hb is not None:
                    gap = _poly_gap(_rect(ca, ha, da), _rect(cb, hb, db))
                elif ha is not None:
                    gap = _point_gap(cb, _rect(ca, ha, da)) - math.hypot(*db[:2]) / 2
                elif hb is not None:
                    gap = _point_gap(ca, _rect(cb, hb, db)) - math.hypot(*da[:2]) / 2
                else:
                    gap = math.dist(ca, cb) - math.hypot(*da[:2]) / 2 - math.hypot(*db[:2]) / 2
                if gap < best[0]:
                    best = (gap, f, f"{a} et {b}")
        c = d["rail"][f]
        for n, (cc, h, dims) in shapes.items():
            flat = _point_gap(c[:2], _rect(cc, h, dims)) if h is not None else max(
                0.0, math.dist(c[:2], cc) - math.hypot(*dims[:2]) / 2)
            above = c[2] - ((g(*cc)[0] if g else 0.0) + dims[2])
            dist = math.hypot(flat, max(0.0, above))
            if dist < cam_best[0]:
                cam_best = (dist, f, n)
        for k, post in enumerate(getattr(mod, "POSTS", ())):
            dist = math.dist(c[:2], post[:2]) - (post[2] if len(post) > 2 else 0.1)
            if dist < cam_best[0]:
                cam_best = (dist, f, f"poteau {k}")
    if len(named) > 1:
        add(f"écarts entre caisses ≥ {lim['gap']} m", best[0] >= lim["gap"],
            f"{best[0]:.2f} m entre {best[2]} à l'image {best[1]}"
            + (f" ; cap inconnu (arrêtés, comptés en cercle, à donner par tracks_heading()) : {sorted(blind)}"
               if blind else ""))
    if named:
        add(f"caméra à {lim['cam_gap']} m au moins des véhicules et des poteaux", cam_best[0] >= lim["cam_gap"],
            f"{cam_best[0]:.2f} m de {cam_best[2]} à l'image {cam_best[1]}")
    # 8. hauts de cadre des aéronefs
    air = _aircraft(mod)
    if air:
        worst = None
        for f in frames:
            for n, fn in air.items():
                q = screen_point(F[f], fn(P[f]["t"]))
                if q and 0.0 <= q[0] <= 1.0:
                    y = 100 * (1 - q[1])
                    if worst is None or y > worst[0]:
                        worst = (y, f, n)
        add(f"aéronefs sous y {lim['air_top']:.0f} % dans le cadre", worst is None or worst[0] <= lim["air_top"],
            "aucun dans le cadre" if worst is None else f"au plus haut {worst[0]:.0f} % ({worst[2]}, image {worst[1]})")
    d["angles"], d["boxes"] = ang, boxes
    return out


def cut_rows(datas, lim):
    """Le tableau 5, mesuré : [(sortant, entrant, (x, y, l) mesurés à la sortie, à l'entrée, visés, contrôle)] ;
    contrôle None si l'un des deux plans n'est pas v3, sinon (tient, détail)."""
    rows = []
    for a, b, ta, tb in CUTS:
        if a not in datas or b not in datas:
            continue
        da, db = datas[a], datas[b]
        fa = da["frames"][-2] if b == "FIN" else da["frames"][-1]     # l'encre couvre la dernière avant FIN
        fb = db["frames"][1] if b == "FIN" else db["frames"][0]
        ba, bb = frame_box(da["final"][fa], da["poses"][fa]), frame_box(db["final"][fb], db["poses"][fb])
        ma = box_center(ba, lim) if ba else None
        mb = box_center(bb, lim) if bb else None
        chk = None
        if da["v3"] and db["v3"]:
            if not (ma and mb):
                chk = (False, "berline hors champ")
            else:
                dx, dy, k = mb[0] - ma[0], mb[1] - ma[1], mb[2] / max(1e-6, ma[2])
                ok = abs(dx) <= lim["cut_dx"] and abs(dy) <= lim["cut_dy"]
                if (a, b) not in CUT_XY_ONLY:
                    ok = ok and lim["cut_ratio"][0] <= k <= lim["cut_ratio"][1]
                chk = (ok, f"Δx {dx:+.0f}, Δy {dy:+.0f}, largeurs ×{k:.2f}")
        rows.append((a, b, fa, fb, ma, mb, ta, tb, chk))
    return rows


def film_checks(datas, lim):
    """Les films entiers (2.2) : six étoiles ≥ 60 % derrière et ≤ 25 % de face ; une étoile ≥ 85 % derrière.
    Seulement quand tous leurs plans sont v3."""
    out = []
    for name, plans, back_min, front_max in (("six étoiles", FILM_SIX, lim["film_six"][0], lim["film_six"][1]),
                                              ("une étoile", FILM_ONE, lim["film_one"], None)):
        if not all(p in datas and datas[p]["v3"] for p in plans):
            continue
        ang = [a for p in plans for a in datas[p]["angles"].values()]
        back = sum(a <= 60.0 for a in ang) / len(ang)
        front = sum(a >= 120.0 for a in ang) / len(ang)
        ok = back >= back_min and (front_max is None or front <= front_max)
        out.append((f"film à {name} : derrière ≥ {back_min * 100:.0f} %"
                    + (f", de face ≤ {front_max * 100:.0f} %" if front_max is not None else ""), ok,
                    f"derrière {back * 100:.0f} %, de face {front * 100:.0f} % ({len(ang)} images)"))
    return out


def v3_report(base, per_plan, plans=PLANS, v31=None):
    """Tout le contrôle v3 : dict(plans={plan: (v3, [(nom, tient, détail)])}, cuts=cut_rows, films=film_checks) ;
    avec v31 = (plafonds, plafonds par plan) de test_motion.v31_limits, aussi v31={plan: (V31, [(nom, tient,
    détail)])} et cuts31 (cut_rows31)."""
    specs = shot_specs()
    datas = {p: plan_data(p, specs[p]) for p in plans}
    res = {p: (datas[p]["v3"], plan_checks(datas[p], base, per_plan.get(p, {}))) for p in plans}
    out = dict(plans=res, cuts=cut_rows(datas, base), films=film_checks(datas, base), datas=datas)
    if v31 is not None:
        lim31, own31 = v31
        out["v31"] = {p: (datas[p]["v31"], plan_checks31(datas[p], lim31, own31.get(p, {}))) for p in plans}
        out["cuts31"] = cut_rows31(datas, lim31)
    return out


def v3_text(rep):
    """Le rapport v3 lisible : plan par plan, chaque plafond « tient » ou la valeur qui dépasse ; les coupes."""
    lines = []
    for p, (v3, checks) in rep["plans"].items():
        lines.append(f"== {p} " + ("(v3, contrôlé)" if v3 else "(v2 : mesuré pour information, non contrôlé)"))
        for name, ok, detail in checks:
            lines.append(f"   {'tient  ' if ok else 'DÉPASSE'} {name}{' : ' + detail if detail else ''}")
    if rep["films"]:
        lines.append("== films")
        for name, ok, detail in rep["films"]:
            lines.append(f"   {'tient  ' if ok else 'DÉPASSE'} {name} : {detail}")
    lines.append("== coupes (x, y, largeur en % ; y comme les fiches ; sortie à la dernière image, à l'avant-dernière"
                 " vers FIN ; entrée à la première, à l'image 2 de FIN)")
    lines.append("   coupe          sortie mesurée (visée)       entrée mesurée (visée)       contrôle")

    def fmt(m, t):
        return ("hors champ" if not m else f"{m[0]:3.0f}/{m[1]:3.0f}/{m[2]:3.0f}") + f" ({t[0]}/{t[1]}/{t[2]})"
    for a, b, fa, fb, ma, mb, ta, tb, chk in rep["cuts"]:
        c = "v2, non contrôlé" if chk is None else ("tient   " if chk[0] else "DÉPASSE ") + chk[1]
        lines.append(f"   {a + ' → ' + b:13s}  {fmt(ma, ta):27s}  {fmt(mb, tb):27s}  {c}")
    return "\n".join(lines)


# ---------------------------------------------------------------- découpage v3.1 : le cadre commun, la voiture
#
# Verdict du bout-à-bout v3 (« plan filmé trop bas », « qui change bizarre », « pas fluide, les dérapages pas
# naturels ») : un seul cadre de poursuite pour les plans de dos, une voiture qui roule vrai sur le mouillé, rien
# qui saute à l'écran. Plafonds en tête de test_motion.py (v31_limits) ; contrôlés seulement sur les plans qui
# portent V31 = True, mesurés pour information sur les autres. Tout se lit aux images rendues, en différences
# finies à 24 images par seconde (ce que voit le spectateur), sur les images intérieures du plan.

V31_BACK = ("OUV", "P1", "P2", "P3", "P5", "P6", "FIN")      # les plans de dos (P4 de face, FIN6 en orbite)
SCREEN_W = 16.0 / 9.0                                        # la hauteur du cadre en largeurs


def _road(d, x, y):
    g = d["ground"]
    return g(x, y)[0] if g else 0.0


def chase_geom(d, f, cams=None):
    """La caméra sans tremblé à l'image f par rapport à la berline : (hauteur au-dessus de la chaussée sous
    l'objectif, distance horizontale au centre de la berline, décalage à gauche de sa route, focale), en m et mm."""
    c, p = (cams or d["rail"])[f], d["poses"][f]
    h = math.radians(_ref_heading(p))
    dx, dy = c[0] - p["x"], c[1] - p["y"]
    return c[2] - _road(d, c[0], c[1]), math.hypot(dx, dy), -dx * math.cos(h) - dy * math.sin(h), c[6]


def car_series(fn, frames, f0=F0, fps=FPS, heading=None, heads=None):
    """La conduite d'un véhicule pos(t) aux images rendues : {grandeur: {image: valeur}}. speed (m/s), along
    (accélération longitudinale, négative au freinage), alat (latérale, positive à gauche), acc (la norme), travel
    (cap de la vitesse) aux images intérieures ; jerk (m/s³, norme de la variation du vecteur accélération entre
    deux images intérieures, rangée à la première) ; head (cap de la caisse : heading(t), sinon celui de la
    vitesse au-dessus de 1 m/s ; heads : {image: cap} tout fait) et yaw_acc (°/s², sa dérivée seconde)."""
    frames = list(frames)
    P = {f: tuple(fn(t_of(f, f0, fps)))[:2] for f in range(frames[0] - 1, frames[-1] + 2)}
    out = {k: {} for k in ("speed", "along", "alat", "acc", "travel", "jerk", "head", "yaw_acc", "avec")}
    ux, uy = None, None
    for f in frames[1:-1]:
        vx, vy = (P[f + 1][0] - P[f - 1][0]) * fps / 2, (P[f + 1][1] - P[f - 1][1]) * fps / 2
        ax = (P[f + 1][0] - 2 * P[f][0] + P[f - 1][0]) * fps * fps
        ay = (P[f + 1][1] - 2 * P[f][1] + P[f - 1][1]) * fps * fps
        sp = math.hypot(vx, vy)
        if sp > 0.3:
            ux, uy = vx / sp, vy / sp
            out["travel"][f] = heading_of(vx, vy)
        if ux is None:
            al, at = 0.0, 0.0
        else:
            al, at = ax * ux + ay * uy, ux * ay - uy * ax
        out["speed"][f], out["along"][f], out["alat"][f] = sp, al, at
        out["acc"][f], out["avec"][f] = math.hypot(ax, ay), (ax, ay)
    for f in frames[1:-2]:
        a, b = out["avec"][f], out["avec"][f + 1]
        out["jerk"][f] = math.hypot(b[0] - a[0], b[1] - a[1]) * fps
    prev = None
    for f in frames:
        if heads is not None:
            h = heads[f]
        elif heading is not None:
            h = heading(t_of(f, f0, fps))
        elif f in out["travel"] and out["speed"][f] > 1.0:
            h = out["travel"][f]
        else:
            prev = None
            continue
        h = h if prev is None else _unwrap(prev, h)
        out["head"][f], prev = h, h
    H = out["head"]
    for f in frames[1:-1]:
        if f - 1 in H and f in H and f + 1 in H:
            out["yaw_acc"][f] = (H[f + 1] - 2 * H[f] + H[f - 1]) * fps * fps
    return out


def _slip_series(d):
    """L'angle de glisse de la berline (cap de la caisse moins cap de sa vitesse, °, positif : l'arrière part à
    droite, l'avant pointe à gauche de sa route) aux images où elle roule à plus de 2 m/s, et sa vitesse (°/s)."""
    P, fps = d["poses"], d["fps"]
    s = {}
    for f in d["frames"]:
        p = P[f]
        if p.get("travel") is not None and p["speed"] > 2.0:
            s[f] = _unwrap(0.0, p["heading"] - p["travel"])
    rate = {f: (s[f + 1] - s[f - 1]) * fps / 2 for f in s if f - 1 in s and f + 1 in s}
    return s, rate


def _runs_signed(s, thr):
    """Les fenêtres où |s| dépasse thr, d'un même signe : [(signe, [images])]."""
    runs, cur, sg = [], [], 0
    for f in sorted(s):
        v = s[f]
        g = (v > thr) - (v < -thr)
        if g and cur and g == sg and f == cur[-1] + 1:
            cur.append(f)
            continue
        if cur:
            runs.append((sg, cur))
        cur, sg = ([f], g) if g else ([], 0)
    if cur:
        runs.append((sg, cur))
    return runs


def hero_body(d):
    """La caisse de la berline comme sample() la donne (graine 0, sol du plan, sans ressauts) : {image: (roulis,
    tangage, braquage)} pour le réglage complet, et le roulis et le tangage du seul transfert de masse (grain de
    route et corrections du conducteur coupés) : (full, pure). pure est None sans la dynamique."""
    spec, frames = d["spec"], d["keyed"]
    kw = dict(frames=frames, f0=d["f0"], fps=d["fps"])
    if spec.get("heading") is not None:
        kw["heading"] = spec["heading"]
    elif spec.get("slip") is not None:
        kw["slip"] = spec["slip"]
    ps = sample(lambda t: tuple(spec["hero"](t))[:2], **kw)
    steer_fn = getattr(d["module"], "hero_steer", None)
    if dyn_on():
        ps = rebody(ps, "hero", ground=d["ground"])
    full = {p["frame"]: (p["roll"], p["pitch"], steer_fn(p["t"]) if steer_fn else p["steer"]) for p in ps}
    pure = None
    if dyn_on():
        ps = rebody(ps, dict(CHASSIS["hero"], road=0.0, driver=0.0), ground=d["ground"])
        pure = {p["frame"]: (p["roll"], p["pitch"]) for p in ps}
    return full, pure


def screen_track(d, cams):
    """Le centre de la berline à l'écran, image par image, en % de la largeur du cadre (x depuis la gauche, y depuis
    le haut, la hauteur comptée en largeurs : un même pas vaut la même chose dans les deux sens)."""
    out = {}
    for f in d["keyed"]:
        p = d["poses"][f]
        q = screen_point(cams[f], (p["x"], p["y"], p["z"] + HERO_BOX[2] / 2))
        out[f] = None if q is None else (100.0 * q[0], 100.0 * q[1] * SCREEN_W)
    return out


def jumps(s, frames):
    """Les dérivées seconde et troisième d'une suite image par image (nombres ou points du plan), aux images rendues :
    ({image: |Δ²|}, {image: |Δ³|}), en unités par image² et par image³."""
    def sub(*terms):
        vals = [s.get(f) for f, _ in terms]
        if any(v is None for v in vals):
            return None
        if isinstance(vals[0], tuple):
            return math.hypot(*[sum(c * v[k] for (_, c), v in zip(terms, vals)) for k in range(2)])
        return abs(sum(c * v for (_, c), v in zip(terms, vals)))
    d2, d3 = {}, {}
    frames = list(frames)
    for f in frames[1:-1]:
        v = sub((f + 1, 1), (f, -2), (f - 1, 1))
        if v is not None:
            d2[f] = v
    for f in frames[1:-2]:
        v = sub((f + 2, 1), (f + 1, -3), (f, 3), (f - 1, -1))
        if v is not None:
            d3[f] = v
    return d2, d3


def _cam_written(d):
    spec = d["spec"]
    return {f: tuple(spec["cam"](t_of(f, d["f0"], d["fps"]))) for f in d["keyed"]}


def _angles(cams, frames):
    """{image: (lacet déroulé, site)} d'une suite de caméras."""
    out, prev = {}, None
    for f in frames:
        y = cams[f][3] if prev is None else _unwrap(prev, cams[f][3])
        out[f], prev = (y, cams[f][4]), y
    return out


def fluidity(d):
    """Le diagnostic « pas fluide » d'un plan, chiffré : d'où viennent les à-coups à l'écran. Rend un dict :
    screen : {rail|ecrite|finale: (Δ² crête, image, Δ³ crête, image)} du centre de la berline à l'écran (% de
    largeur par image² et image³) vu par la caméra sans tremblé, la caméra écrite (tremblé du plan compris) et
    les clés finales (opérateur compris) ; view : {rail|finale: Δ² crête de la visée (°/image²)} ; body : roulis et
    tangage de la caisse (crêtes, Δ² crête du roulis, bruit : l'écart au seul transfert de masse)."""
    frames = d["frames"]
    out = dict(screen={}, view={})
    for key, cams in (("rail", d["rail"]), ("ecrite", _cam_written(d)), ("finale", d["final"])):
        d2, d3 = jumps(screen_track(d, cams), frames)
        a2 = _peak(d2) if d2 else (0.0, frames[0])
        a3 = _peak(d3) if d3 else (0.0, frames[0])
        out["screen"][key] = (a2[0], a2[1], a3[0], a3[1])
        if key != "ecrite":
            ang = _angles(cams, d["keyed"])
            v2 = {}
            for f in frames[1:-1]:
                v2[f] = math.hypot(*[ang[f + 1][k] - 2 * ang[f][k] + ang[f - 1][k] for k in range(2)])
            out["view"][key] = _peak(v2)
    full, pure = hero_body(d)
    roll = {f: full[f][0] for f in frames}
    r2, _ = jumps(roll, frames)
    out["body"] = dict(roll=_peak({f: abs(v) for f, v in roll.items()}),
                       pitch=_peak({f: abs(full[f][1]) for f in frames}), roll_d2=_peak(r2),
                       noise=_peak({f: max(abs(full[f][0] - pure[f][0]), abs(full[f][1] - pure[f][1]))
                                    for f in frames}) if pure else (0.0, frames[0]))
    out["steer"] = {f: full[f][2] for f in frames}
    return out


def plan_checks31(d, lim, own):
    """Les contrôles v3.1 d'un plan : [(nom, tient, détail)] (cadre commun, voiture, glisse, fluidité) ; d["fluid"]
    reçoit le diagnostic (fluidity)."""
    lim = dict(lim, **own)
    plan, frames, P, fps = d["plan"], d["frames"], d["poses"], d["fps"]
    out = []

    def add(name, ok, detail):
        out.append((name, bool(ok), detail))

    # A. le cadre de poursuite commun (plans de dos)
    hero = car_series(d["spec"]["hero"], frames, d["f0"], fps, heads={f: P[f]["heading"] for f in frames})
    if plan in V31_BACK:
        geo = {f: chase_geom(d, f) for f in frames}
        stop = [f for f in frames if P[f]["speed"] < 0.5] if own.get("stop_h_min") is not None else []
        rise = frames[int(len(frames) * own["rise_after"]):] if own.get("rise_after") is not None else []
        steady = [f for f in frames if f not in stop and f not in rise] or list(frames)
        h_lo, h_hi = lim["cam_h"]
        bad = [f for f in frames
               if not ((own["stop_h_min"] if f in stop else h_lo) - 1e-9 <= geo[f][0]
                       <= (own["rise_h_max"] if f in rise else h_hi) + 1e-9)]
        hs = [geo[f][0] for f in frames]
        add(f"hauteur de la caméra {h_lo:g}–{h_hi:g} m (jamais sous {lim['cam_h_floor']:g})"
            + (f", jusqu'à {own['rise_h_max']:g} m à la fin" if rise else "")
            + (f", {own['stop_h_min']:g} m berline arrêtée" if stop else ""),
            not bad and min(hs) >= lim["cam_h_floor"] - 1e-9,
            f"{hs[0]:.2f} → {hs[-1]:.2f} m (de {min(hs):.2f} à {max(hs):.2f})"
            + (f" ; hors : images {bad[0]}–{bad[-1]} ({len(bad)})" if bad else ""))
        d_lo, d_hi = lim["cam_dist"]
        bad = [f for f in frames if not ((own["stop_dist_min"] if f in stop else d_lo) - 1e-9 <= geo[f][1]
                                         <= d_hi + 1e-9)]
        ds = [geo[f][1] for f in frames]
        add(f"distance au centre de la berline {d_lo:g}–{d_hi:g} m"
            + (f" ({own['stop_dist_min']:g} m berline arrêtée)" if stop else ""), not bad,
            f"{ds[0]:.2f} → {ds[-1]:.2f} m (de {min(ds):.2f} à {max(ds):.2f})"
            + (f" ; hors : images {bad[0]}–{bad[-1]} ({len(bad)})" if bad else ""))
        sv = [geo[f][1] for f in steady]
        hv = [geo[f][0] for f in steady]
        add(f"dans le plan : hauteur ±{lim['cam_dh']:g} m, distance ±{lim['cam_dd']:g} m"
            + (" (hors montée de fin et arrêt)" if rise or stop else ""),
            max(hv) - min(hv) <= lim["cam_dh"] + 1e-9 and max(sv) - min(sv) <= lim["cam_dd"] + 1e-9,
            f"hauteur {max(hv) - min(hv):.2f} m, distance {max(sv) - min(sv):.2f} m")
        side = [geo[f][2] for f in frames]
        s_lo, s_hi = lim["cam_side"]
        add(f"décalage à gauche {s_lo:g}–{s_hi:g} m", s_lo - 1e-9 <= min(side) and max(side) <= s_hi + 1e-9,
            f"de {min(side):+.2f} à {max(side):+.2f} m")
        lens = [geo[f][3] for f in frames]
        add(f"focale {lim['cam_lens']:g} mm", all(abs(v - lim["cam_lens"]) <= 0.05 for v in lens),
            f"{min(lens):.1f} à {max(lens):.1f} mm")
        boxes = d.get("boxes") or {f: frame_box(d["final"][f], P[f]) for f in frames}
        cs = {f: box_center(boxes[f], dict(y_from_top=True)) for f in frames if boxes[f]}
        (cx, tx), (cy, ty) = lim["cam_center_x"], lim["cam_center_y"]
        bad = [f for f in frames if f not in cs or abs(cs[f][0] - cx) > tx or abs(cs[f][1] - cy) > ty]
        xs, ys = [c[0] for c in cs.values()], [c[1] for c in cs.values()]
        add(f"centre de la berline x {cx:g} ± {tx:g}, y {cy:g} ± {ty:g} % depuis le haut", not bad,
            f"x {min(xs):.0f}–{max(xs):.0f}, y {min(ys):.0f}–{max(ys):.0f}"
            + (f" ; hors : {len(bad)} images, de {bad[0]} à {bad[-1]}" if bad else ""))
        ws = sorted(cs[f][2] for f in steady if f in cs)
        med = ws[len(ws) // 2]
        add(f"largeur de la berline ±{lim['cam_width_var'] * 100:.0f} % dans le plan",
            ws[0] >= med * (1 - lim["cam_width_var"]) - 1e-9 and ws[-1] <= med * (1 + lim["cam_width_var"]) + 1e-9,
            f"{ws[0]:.0f} à {ws[-1]:.0f} % (médiane {med:.0f})")
        d["geo"] = geo
    # B. la voiture : la berline et chaque véhicule du plan
    heads = d["module"].tracks_heading() if hasattr(d["module"], "tracks_heading") else {}
    cars = [("berline", "hero", hero)]
    for n, fn in sorted((d["spec"].get("named") or {}).items()):
        if n in ("hero", "berline"):
            continue
        cars.append((n, "van" if "van" in n else "patrol", car_series(fn, frames, d["f0"], fps, heads.get(n))))
    rows = []
    for n, kind, s in cars:
        L = lim["car"]["hero" if kind == "hero" else "patrol"]
        lat = _peak({f: abs(v) for f, v in s["alat"].items()})
        brk = _peak({f: max(0.0, -v) for f, v in s["along"].items()})
        acc = _peak({f: max(0.0, v) for f, v in s["along"].items()})
        circ = _peak({f: math.hypot(s["alat"][f], s["along"][f]) for f in s["alat"]})
        jerk = _peak(s["jerk"]) if s["jerk"] else (0.0, frames[0])
        yaw = _peak({f: abs(v) for f, v in s["yaw_acc"].items()}) if s["yaw_acc"] else (0.0, frames[0])
        vals = dict(lat=lat, brake=brk, acc=acc, circle=circ, jerk=jerk, yaw_acc=yaw)
        bad = [k for k in vals if vals[k][0] > L[k] + 1e-9]
        rows.append((n, vals, bad))
        add(f"conduite {n} : latérale ≤ {L['lat']:g}, freinage ≤ {L['brake']:g}, accélération ≤ {L['acc']:g}, "
            f"cercle ≤ {L['circle']:g} m/s², à-coup ≤ {L['jerk']:g} m/s³, lacet ≤ {L['yaw_acc']:g} °/s²", not bad,
            ", ".join(f"{k} {vals[k][0]:.1f} ({vals[k][1]})" for k in vals))
    d["cars"] = rows
    brake = [f for f, v in hero["along"].items() if -v > lim["stop_lamp"]]
    wins = _windows(brake)
    add(f"feux stop : fenêtres où la berline freine à plus de {lim['stop_lamp']:g} m/s² (information)", True,
        ", ".join(f"{w[0]}–{w[-1]}" for w in wins) if wins else "aucune")
    # la fluidité (et le braquage de la caisse, pour le contre-braquage)
    fl = fluidity(d)
    d["fluid"] = fl
    d["steer"] = fl["steer"]
    # la glisse
    s, rate = _slip_series(d)
    if s:
        pk = _peak({f: abs(v) for f, v in s.items()})
        add(f"glisse ≤ {lim['slip_max']:g}°", pk[0] <= lim["slip_max"] + 1e-9, f"crête {pk[0]:.1f}° à l'image {pk[1]}")
        grow = {f: r * (1 if s[f] >= 0 else -1) for f, r in rate.items()}
        on = _peak({f: v for f, v in grow.items()}) if grow else (0.0, frames[0])
        off = _peak({f: -v for f, v in grow.items()}) if grow else (0.0, frames[0])
        add(f"glisse : s'installe ≤ {lim['slip_on']:g}°/s, se résorbe ≤ {lim['slip_off']:g}°/s",
            on[0] <= lim["slip_on"] + 1e-9 and off[0] <= lim["slip_off"] + 1e-9,
            f"installation {max(0.0, on[0]):.0f}°/s ({on[1]}), retour {max(0.0, off[0]):.0f}°/s ({off[1]})")
        early = [f for f, v in grow.items() if v > 2.0 and abs(s[f]) > 1.0
                 and max(hero["acc"].get(g, 0.0) for g in range(f - 6, f + 1)) < lim["slip_acc"]]
        add(f"glisse nulle sous {lim['slip_acc']:g} m/s² d'accélération combinée", not early,
            f"elle croît sans adhérence dépassée : images {early[:8]}" if early else "tient")
        runs = _runs_signed(s, 1.0)
        msgs, ok = [], True
        for i, (sg, fr) in enumerate(runs):
            peak = max(abs(s[f]) for f in fr)
            if peak < 5.0:
                continue
            v0, v1 = P[fr[0]]["speed"], P[fr[-1]]["speed"]
            loss = (v0 - v1) / max(v0, 1e-6)
            nxt = [r for r in runs[i + 1:] if r[1][0] - fr[-1] <= 12]
            back = max(abs(s[f]) for f in nxt[0][1]) if nxt and nxt[0][0] == -sg else 0.0
            more = len(nxt) > 1 and max(abs(s[f]) for f in nxt[1][1]) > 1.0
            st = [f for f in fr if abs(s[f]) >= 5.0 and f in d["steer"]]
            counter = sum(d["steer"][f] * s[f] < 0 for f in st) / max(1, len(st))
            good = loss >= lim["slip_loss"] - 1e-9 and back <= lim["slip_back"] + 1e-9 and not more
            ok = ok and good
            msgs.append(f"images {fr[0]}–{fr[-1]} : crête {peak:.0f}°, vitesse {-loss * 100:+.0f} %, retour {back:.1f}°"
                        f"{', puis encore' if more else ''}, contre-braquage {counter * 100:.0f} % des images")
        add(f"glisse : vitesse −{lim['slip_loss'] * 100:.0f} % au moins, un seul retour ≤ {lim['slip_back']:g}°, "
            f"contre-braquage", ok, " ; ".join(msgs) if msgs else "aucune glisse de plus de 5°")
    sc = fl["screen"]["finale"]
    add(f"à l'écran, centre de la berline : Δ² ≤ {lim['screen_d2']:g}, Δ³ ≤ {lim['screen_d3']:g} % de largeur "
        f"par image² et image³", sc[0] <= lim["screen_d2"] + 1e-9 and sc[2] <= lim["screen_d3"] + 1e-9,
        f"Δ² {sc[0]:.2f} ({sc[1]}), Δ³ {sc[2]:.2f} ({sc[3]}) ; sans tremblé {fl['screen']['rail'][0]:.2f} / "
        f"{fl['screen']['rail'][2]:.2f}")
    b = fl["body"]
    # la caisse v3.1 est celle de la dynamique ; FILM3D_DYN=0 rend les clés d'avant (et leurs bosses) : information
    add(f"caisse : roulis ≤ {lim['body_roll']:g}°, tangage ≤ {lim['body_pitch']:g}°, Δ² du roulis ≤ "
        f"{lim['body_roll_d2']:g}°/image², rien hors transfert de masse (≤ {lim['body_noise']:g}°)"
        + ("" if dyn_on() else " (FILM3D_DYN=0 : clés d'avant, information)"),
        not dyn_on() or (b["roll"][0] <= lim["body_roll"] + 1e-9 and b["pitch"][0] <= lim["body_pitch"] + 1e-9
                         and b["roll_d2"][0] <= lim["body_roll_d2"] + 1e-9 and b["noise"][0] <= lim["body_noise"] + 1e-9),
        f"roulis {b['roll'][0]:.1f}° ({b['roll'][1]}), tangage {b['pitch'][0]:.1f}° ({b['pitch'][1]}), Δ² "
        f"{b['roll_d2'][0]:.3f} ({b['roll_d2'][1]}), hors transfert {b['noise'][0]:.2f}° ({b['noise'][1]})")
    return out


def cut_rows31(datas, lim):
    """Les coupes entre deux plans de dos : [(sortant, entrant, (h, d, focale) à la sortie, à l'entrée, contrôle)] ;
    contrôle None si l'un des deux n'est pas V31."""
    rows = []
    for a, b, _, _ in CUTS:
        if a not in datas or b not in datas or a not in V31_BACK or b not in V31_BACK:
            continue
        da, db = datas[a], datas[b]
        fa = da["frames"][-2] if b == "FIN" else da["frames"][-1]
        fb = db["frames"][1] if b == "FIN" else db["frames"][0]
        ga, gb = chase_geom(da, fa)[:2] + (chase_geom(da, fa)[3],), chase_geom(db, fb)[:2] + (chase_geom(db, fb)[3],)
        chk = None
        if da.get("v31") and db.get("v31"):
            dh, dd = gb[0] - ga[0], gb[1] - ga[1]
            ok = abs(dh) <= lim["cut_dh"] + 1e-9 and abs(dd) <= lim["cut_dd"] + 1e-9 and abs(gb[2] - ga[2]) <= 0.05
            chk = (ok, f"Δhauteur {dh:+.2f} m, Δdistance {dd:+.2f} m, focales {ga[2]:.0f}/{gb[2]:.0f} mm")
        rows.append((a, b, ga, gb, chk))
    return rows


def v31_text(rep):
    """Le rapport v3.1 : les contrôles par plan, les coupes en hauteur et distance, le diagnostic de fluidité."""
    lines = []
    for p, (on, checks) in rep["v31"].items():
        lines.append(f"== {p} v3.1 " + ("(contrôlé)" if on else "(information : V31 absent)"))
        for name, ok, detail in checks:
            lines.append(f"   {'tient  ' if ok else 'DÉPASSE'} {name}{' : ' + detail if detail else ''}")
    if rep["cuts31"]:
        lines.append("== coupes v3.1 (caméra sans tremblé : hauteur m / distance m / focale mm)")
        for a, b, ga, gb, chk in rep["cuts31"]:
            c = "information" if chk is None else ("tient   " if chk[0] else "DÉPASSE ") + chk[1]
            lines.append(f"   {a + ' → ' + b:13s}  {ga[0]:4.2f}/{ga[1]:4.1f}/{ga[2]:2.0f}  →  "
                         f"{gb[0]:4.2f}/{gb[1]:4.1f}/{gb[2]:2.0f}   Δh {gb[0] - ga[0]:+.2f}  Δd {gb[1] - ga[1]:+.2f}   {c}")
    lines.append("== fluidité, diagnostic (crête et image) : écran = centre de la berline, % de largeur par image² "
                 "(Δ²) et image³ (Δ³), sans tremblé / caméra écrite / clés finales ; visée = Δ² du lacet et du site "
                 "en °/image² ; caisse : roulis Δ² °/image², hors transfert de masse ° ; voiture : à-coup m/s³, "
                 "lacet °/s²")
    lines.append("   plan  écran Δ² rail/écrite/finale   Δ³ finale    visée rail/finale   roulis Δ²  hors transfert"
                 "   à-coup berline   lacet berline   pire véhicule (à-coup)")
    for p, d in rep["datas"].items():
        fl = d.get("fluid")
        if not fl:
            continue
        sc, v, b = fl["screen"], fl["view"], fl["body"]
        cars = d.get("cars") or []
        hero = next((c for c in cars if c[0] == "berline"), None)
        other = max((c for c in cars if c[0] != "berline"), key=lambda c: c[1]["jerk"][0], default=None)
        lines.append(f"   {p:5s} {sc['rail'][0]:5.2f} {sc['ecrite'][0]:5.2f} {sc['finale'][0]:5.2f} ({sc['finale'][1]:2d})"
                     f"   {sc['finale'][2]:5.2f} ({sc['finale'][3]:2d})   {v['rail'][0]:5.2f} {v['finale'][0]:5.2f} "
                     f"({v['finale'][1]:2d})   {b['roll_d2'][0]:6.3f}    {b['noise'][0]:5.2f}°"
                     + (f"      {hero[1]['jerk'][0]:6.1f} ({hero[1]['jerk'][1]:2d})  {hero[1]['yaw_acc'][0]:6.0f} "
                        f"({hero[1]['yaw_acc'][1]:2d})" if hero else "")
                     + (f"   {other[0]} {other[1]['jerk'][0]:.0f} ({other[1]['jerk'][1]})" if other else ""))
    return "\n".join(lines)


def _main(argv):
    if argv and argv[0] == "mesure":
        if "--v3" in argv:
            import test_motion as T
            base, per_plan = T.v3_limits()
            plans = [p.upper() for p in argv[1:] if p != "--v3"] or list(PLANS)
            rep = v3_report(base, per_plan, plans, v31=T.v31_limits())
            print(v3_text(rep))
            print(v31_text(rep))
            return 0
        plans = [p.upper() for p in argv[1:]] or list(PLANS)
        print(measure_table(measure_shots(plans)))
        return 0
    print("usage : python3 tools/film3d/motion.py mesure [--v3] [PLAN…]")
    return 2


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


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import motion as _M          # le module que les plans importent (handheld_off doit agir sur lui)
    sys.exit(_M._main(sys.argv[1:]))
