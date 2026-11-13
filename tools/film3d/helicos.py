# Les hélicoptères de P5 et P6, une seule distribution (la coupe P5 → P6 est continue : P6/1 suit P5/60, au même
# point de la ville). Trois appareils, définis une fois dans le repère de ville et en temps du film (s depuis OUV/1,
# parcours.t_of) ; les deux plans les lisent (p5_virage.heli, p6_jetee.heli) et leurs scènes les posent (key) :
# même appareil, même place, même cap, même assiette, même vitesse des deux côtés de la coupe, rotors en phase.
#  - 0 : celui de P5 ; il arrive de l'est et freine devant la berline (p5_virage.heli_arrival), en stationnaire à
#    P5/60, puis rejoint en JOIN_A s sa place devant elle sur la jetée (p6_jetee.heli_slot(0)), en se retournant.
#  - 1 et 2 : ceux qui l'attendent sur la jetée (p6_jetee.heli_slot(1), (2)) ; dans P5 ils arrivent, plus haut
#    (APPROACH) : le 2 de l'avant, posé sur sa place à P6/1 ; le 1 de la droite, au-dessus de l'eau, sur la sienne
#    deux secondes après la coupe (position, vitesse et accélération continues partout).
# Ce module ne lit que les deux plans et le parcours, sans Blender (sauf film_rotors, appelé par les scènes).
import math

import motion as M
import parcours as PC
import p5_virage as P5
import p6_jetee as P6

N = 3
FPS = PC.FPS
T5 = PC.t_of("P5", P5.F0)                      # P5/1, en temps du film
T5_END = PC.t_of("P5", P5.F0 + P5.FRAMES - 1)  # P5/60
T6 = PC.t_of("P6", P6.F0)                      # P6/1 = P5/60 + une image
JOIN_A = 2.0          # s : l'appareil de P5, du stationnaire de P5/60 à sa place sur la jetée
TURN_A = 1.6          # s : son demi-tour, du nez vers elle au cap de la jetée (dans JOIN_A)
BEAM_JOIN = 1.0       # s : son faisceau, de la visée de P5 (elle, en retard) à celle de P6 (2 m devant elle)
# l'arrivée des appareils 1 et 2 sur leur place : (début, fin) en s autour de P6/1, et d'où ils arrivent (le long de
# la jetée, vers sa gauche, en hauteur, m) ; un écart à leur place qui s'éteint en quintique (vitesse et accélération
# continues), freinage de 5,8 × l'écart / durée² au plus. Le 1 vient de la droite, au-dessus de l'eau : par l'avant,
# il croisait l'appareil 0, qui plonge devant elle pendant P5 sur le chemin de sa place (moins de 5 m).
APPROACH = [None, None, (-4.0, 0.0, (16.0, 4.0, 6.0))]
# le 1 est l'ailier du 0 : il arrive de l'est avec lui sur la même courbe, WING m à côté (dans la ville : vers l'est,
# vers le nord, en hauteur ; 16 m d'air au moins avec les deux autres), sans se tourner vers elle ; il la quitte pour
# sa place sur WING_JOIN (s autour de P6/1) : au bord droit du cadre à la coupe, il y entre au début de P6 (15 m au moins sous les avions)
WING = (17.0, -4.0, 0.0)
WING_JOIN = (-1.5, 1.5)
SEEDS = (11.0, 23.0, 37.0)      # l'assiette de chaque appareil (motion.aircraft_attitude), la même dans les deux plans


# ---- les repères : la scène d'un plan <-> la ville (p_ville = R(rot) p_scène + t ; cap_ville = cap_scène + rot)

def _pose(shot):
    return PC.pose_ville(shot)


def to_ville(shot, s):
    rot, tx, ty = _pose(shot)
    c, n = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    x, y = s[0], s[1]
    return (c * x - n * y + tx, n * x + c * y + ty) + tuple(s[2:3]) + \
        ((s[3] + rot,) + tuple(s[4:]) if len(s) > 3 else ())


def to_scene(shot, s):
    rot, tx, ty = _pose(shot)
    c, n = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    x, y = s[0] - tx, s[1] - ty
    return (c * x + n * y, -n * x + c * y) + tuple(s[2:3]) + \
        ((s[3] - rot,) + tuple(s[4:]) if len(s) > 3 else ())


def local(shot, T):
    """Le temps du plan (s depuis sa première image) d'un temps du film."""
    return T - PC.t_of(shot, 1)


def car(T):
    """(x, y) de la berline dans la ville."""
    return PC.placer("P4")[0](*PC.DRIVE.pos(T))


# ---- les trajectoires dans la ville : (x, y, z, cap, tangage, roulis), z au-dessus de l'eau du monde de l'eau

def _quintic(u):
    u = min(1.0, max(0.0, u))
    return u * u * u * (10.0 - 15.0 * u + 6.0 * u * u)


def _slot(i, T):
    return to_ville("P6", P6.heli_slot(i)(local("P6", T)))


def _hold(T):
    """L'appareil 0 après P5/60, s'il restait où P5 le laisse : en stationnaire, le nez vers elle."""
    x, y, z, _, p, r = to_ville("P5", P5.heli_arrival(T5_END - T5))
    hx, hy = car(T)
    return x, y, z, M.heading_of(hx - x, hy - y), p, r


def _d(fn, T, k, h=1.0 / 96.0):
    """La dérivée d'ordre k (1 ou 2) de fn (tuple) en T, centrée."""
    a, b, c = fn(T - h), fn(T), fn(T + h)
    if k == 1:
        return [(c[j] - a[j]) / (2 * h) for j in range(3)]
    return [(c[j] - 2 * b[j] + a[j]) / (h * h) for j in range(3)]


_END = {}


def _end_state(i):
    """La place de l'appareil i à la fin de son raccord : position, vitesse et accélération (calculées une fois)."""
    if i not in _END:
        T1 = T5_END + JOIN_A
        fn = lambda T: _slot(i, T)                                   # noqa: E731
        _END[i] = (fn(T1)[:3], _d(fn, T1, 1), _d(fn, T1, 2))
    return _END[i]


def _hermite(p0, p1, v1, a1, D, u):
    """Quintique de Hermite : départ au repos en p0 (vitesse et accélération nulles), arrivée en p1 avec v1 et a1,
    sur D s ; u de 0 à 1."""
    h0 = 1 - 10 * u ** 3 + 15 * u ** 4 - 6 * u ** 5
    h1 = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5
    hv = -4 * u ** 3 + 7 * u ** 4 - 3 * u ** 5
    ha = 0.5 * (u ** 3 - 2 * u ** 4 + u ** 5)
    return [h0 * p0[j] + h1 * p1[j] + hv * D * v1[j] + ha * D * D * a1[j] for j in range(3)]


def state(i, T):
    """L'appareil i à l'instant T du film, dans la ville : (x, y, z, cap, tangage, roulis), sans l'assiette de
    l'accélération (motion.aircraft_attitude l'ajoute : attitude)."""
    if i == 0:
        if T <= T5_END:
            return to_ville("P5", P5.heli_arrival(T - T5))
        u = (T - T5_END) / JOIN_A
        if u >= 1.0:
            return _slot(0, T)
        hold, slot = _hold(T), _slot(0, T)
        p1, v1, a1 = _end_state(0)
        pos = _hermite(hold[:3], p1, v1, a1, JOIN_A, u)
        w = _quintic((T - T5_END) / TURN_A)
        head = hold[3] + (M._unwrap(hold[3], slot[3]) - hold[3]) * w
        k = _quintic(u)
        return (*pos, head, hold[4] + (slot[4] - hold[4]) * k, hold[5] + (slot[5] - hold[5]) * k)
    s = _slot(i, T)
    if APPROACH[i] is None:
        # l'ailier : la courbe du 0 décalée de WING, puis sa place (quintique : position, vitesse, accélération
        # continues) ; le cap de l'un à l'autre par le plus court
        t0, t1 = WING_JOIN
        w = _quintic((T - (T6 + t0)) / (t1 - t0))
        if w >= 1.0:
            return s
        x, y, z, h, p, r = to_ville("P5", P5.heli_arrival(min(T, T5_END) - T5, turn=False))
        pre = (x + WING[0], y + WING[1], z + WING[2], h, p, r)
        if w <= 0.0:
            return pre
        return tuple(a + (b - a) * w for a, b in zip(pre[:3], s[:3])) + \
            (h + (M._unwrap(h, s[3]) - h) * w, p + (s[4] - p) * w, r + (s[5] - r) * w)
    t0, t1, (a, l, up) = APPROACH[i]
    g = 1.0 - _quintic((T - (T6 + t0)) / (t1 - t0))
    if g <= 0.0:
        return s
    rot = math.radians(_pose("P6")[0])
    # le long de la jetée (+y de la scène D) et vers sa gauche (−x de la scène D), dans la ville
    fx, fy = -math.sin(rot), math.cos(rot)
    lx, ly = -math.cos(rot), -math.sin(rot)
    return (s[0] + g * (a * fx + l * lx), s[1] + g * (a * fy + l * ly), s[2] + g * up) + tuple(s[3:])


# ---- l'assiette, calculée une fois sur les deux plans en temps du film : la même aux deux bords de la coupe

F_FIRST = PC.START["P5"] + P5.F0 - 1          # image du film (1 = OUV/1) une image avant P5/1
F_LAST = PC.START["P6"] + P6.F0 + P6.FRAMES   # une image après P6/60
_ATT = {}


def attitude(i):
    """{image du film: (x, y, z, cap, tangage, roulis)} dans la ville, l'assiette de l'accélération comprise."""
    if i not in _ATT:
        _ATT[i] = M.aircraft_attitude(lambda T: state(i, T), range(F_FIRST, F_LAST + 1), "heli", f0=1, fps=FPS,
                                      seed=SEEDS[i])
    return _ATT[i]


def film_frame(shot, frame):
    return PC.START[shot] + frame


def in_scene(shot, i, dyn=None):
    """fn(t) -> (x, y, z, cap, tangage, roulis) de l'appareil i dans la scène du plan, t en s depuis sa première
    image ; avec l'assiette de l'accélération si la dynamique est active (motion.dyn_on), aux images entières."""
    dyn = M.dyn_on() if dyn is None else dyn

    def fn(t):
        T = PC.t_of(shot, 1) + t
        if dyn:
            f = t * FPS + 1
            if abs(f - round(f)) < 1e-6 and F_FIRST <= film_frame(shot, round(f)) <= F_LAST:
                return to_scene(shot, attitude(i)[film_frame(shot, round(f))])
        return to_scene(shot, state(i, T))
    return fn


# ---- les faisceaux : la cible de chaque appareil, dans la ville

def beam(i, T):
    """(x, y, z) : la tache du faisceau de l'appareil i. L'appareil 0 garde la visée de P5 jusqu'à P5/60 (elle, en
    retard, p5_virage.beam_target) et prend celle de P6 (2 m devant elle) en BEAM_JOIN s ; 1 et 2, celle de P6."""
    p6 = to_ville("P6", P6.beam_target(local("P6", T)))
    if i != 0:
        return p6
    p5 = to_ville("P5", P5.beam_target(local("P5", T)))
    w = _quintic((T - T5_END) / BEAM_JOIN)
    return tuple(a + (b - a) * w for a, b in zip(p5, p6))


# ---- la lampe de l'appareil 0 (lumière v3.1) : une seule définition en temps du film, lue par P5 et P6. Le pinceau
# visible est la puissance de la lampe de brume fois la densité de la brume du plan (P5 0,0016, P6 0,0012) : le même
# produit des deux côtés de la coupe ; puis, sur BEAM0_FONDU s de P6, pendant qu'il rejoint sa place, sa lampe de
# brume s'éteint jusqu'à celle des deux autres (BEAM0_FIN, la lampe de 8 kW de la jetée) et son cône passe de 5 à 4°,
# sans marche. Au sol 8 kW (à 100 kW, une plaque claire au bas du cadre de P5), sur la berline seule 50 kW, partout
BEAM0_PINCEAU = 1.6e6 * 0.0016      # W × densité : le pinceau de P5
BEAM0_SOL, BEAM0_BERLINE = 8000.0, 5.0e4
BEAM0_FIN = 8000.0
BEAM0_CONE = (5.0, 4.0)
BEAM0_FONDU = 1.75                  # s depuis P6/1
BEAM0_SOURCE = (0.12, 0.25)         # la lampe de brume : taille de la source (m), bord du cône (celles de P5 ; à 1,5 m,
                                    # celle de la jetée, le pinceau de P6 sortait flou et large)


def beam0(T, density):
    """(W, degrés) : la lampe de brume de l'appareil 0 au temps du film T, dans une brume de densité `density`."""
    w = _quintic((T - T6) / BEAM0_FONDU)
    start = BEAM0_PINCEAU / density
    return start * (BEAM0_FIN / start) ** w, BEAM0_CONE[0] + (BEAM0_CONE[1] - BEAM0_CONE[0]) * w


def beam_in_scene(shot, i):
    def fn(t):
        return to_scene(shot, beam(i, PC.t_of(shot, 1) + t))
    return fn


# ---- dans Blender : les rotors sur l'image du film (cast_vehicles.spin_rotors les pilote sur l'image du plan)

def film_rotors(rig, shot):
    """Les pilotes des rotors de `rig` lus sur l'image du film : « frame » devient « (frame + START) ». Renvoie le
    nombre de pilotes repris."""
    off = PC.START[shot]
    n = 0
    for ob in [rig] + list(rig.children_recursive):
        ad = ob.animation_data
        if ad is None:
            continue
        for fc in ad.drivers:
            e = fc.driver.expression
            if "frame" in e and "(frame +" not in e:
                fc.driver.expression = e.replace("frame", f"(frame + {off})")
                n += 1
    return n


def key(ob, shot, i, frames):
    """Les clés de l'appareil i dans la scène du plan (position et orientation, assiette comprise), sur ses images,
    et ses rotors sur l'image du film."""
    fn = in_scene(shot, i)
    M._clear(ob)
    ob.rotation_mode = "XYZ"
    for f in frames:
        x, y, z, h, p, r = fn(M.t_of(f))
        ob.location = (x, y, z)
        ob.rotation_euler = (math.radians(p), math.radians(r), math.radians(h))
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_euler", frame=f)
    return film_rotors(ob, shot)


if __name__ == "__main__":
    for T in (T5, T5_END - 1.0, T5_END, T6, T6 + 1.0, T6 + 2.5):
        print(f"T {T:6.3f} : " + " | ".join(
            "%d (%.1f, %.1f, %.1f) cap %.0f" % ((i,) + tuple(state(i, T)[:4])) for i in range(N)))
