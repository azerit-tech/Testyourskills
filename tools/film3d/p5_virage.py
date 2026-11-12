# Le plan P5 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.4, « le port ») : la berline qui sort
# du pont, freine et part en glisse à droite sur l'arc de 15 m, la meute qui descend la rampe sans la rattraper,
# l'hélicoptère qui monte derrière le portique et pose son faisceau sur elle, la caméra à l'épaule. scene_e.py
# n'en lit que les fonctions du temps ; motion.py en tire roues, braquage et transfert de masse.
#
# Repère du port (celui de lieux.py) : la voie du pont sur l'axe x = 0, la berline sur sa voie de droite (x = 3,5)
# vers +y ; le virage à droite autour de (18,5, 55), rayon 15 m, puis la voie du quai (y = 70) vers +x.
# t = 0 à la première image ; 28 images, 24 par seconde (shared/film/cut.ts), soit 1,125 s entre la première et la
# dernière.
#
# Écart au §2.4, assumé : 28 images ne tiennent pas « 120 km/h, freinage dès s = 10 m, entrée à 60 km/h, sortie sur
# la voie du quai » (il faudrait plus de 3 s). Le plan commence à l'entrée en glisse, le freinage juste fini hors
# champ (l'assiette arrive plongée et se redresse), et finit au début de la reprise, 62° dans le virage. La caméra
# est sur le bord de la voie du quai, là où la berline sort du virage : elle vient vers l'objectif et grandit d'un
# quart à plus des deux tiers de la largeur du cadre (12 novembre : à 31 m, elle n'existait qu'aux huit dernières
# images).
import math

import motion as M

FRAMES = 28
F0 = 1
T_END = (FRAMES - 1) / M.FPS

TURN_C = (18.5, 55.0)
TURN_R = 15.0
LANE_X = TURN_C[0] - TURN_R            # 3,5 : la voie de droite du pont

# --- la berline : vitesse et accélération (m/s, m/s²), instants (s)
V0 = 16.7                    # 60 km/h à la première image : le freinage (~1 g) vient de finir, hors champ
BRAKE = -9.5                 # ~1 g, avant la première image : l'assiette arrive plongée et se redresse
T_IN = 0.02                  # l'entrée dans l'arc
SCRUB = -3.0                 # la glisse mange la vitesse
T_GO = 0.70                  # la reprise : on remet les gaz, l'arrière s'assied
GO = 4.0
SLIP = -22.0                 # degrés : la caisse tournée plus à droite que sa route, l'arrière dehors
SLIP_OUT = -13.0             # à la reprise, la caisse se redresse un peu


def _hero_accel(t):
    a = BRAKE + (SCRUB - BRAKE) * M.smoothstep(T_IN - 0.04, T_IN + 0.06, t)
    return a + (GO - SCRUB) * M.smoothstep(T_GO - 0.05, T_GO + 0.08, t)


HERO = M.Profile(V0, _hero_accel)
S_IN = HERO.s(T_IN)          # la distance de la première image à l'entrée de l'arc
Y_START = TURN_C[1] - S_IN


def road(s):
    """Le point (x, y) de la route de la berline à l'abscisse s (s = 0 à la première image)."""
    u = s - S_IN
    if u <= 0:
        return LANE_X, TURN_C[1] + u
    phi = u / TURN_R
    if phi > math.pi / 2:
        return TURN_C[0] + (u - TURN_R * math.pi / 2), TURN_C[1] + TURN_R
    return TURN_C[0] - TURN_R * math.cos(phi), TURN_C[1] + TURN_R * math.sin(phi)


def hero_pos(t):
    return road(HERO.s(t))


def hero_slip(t):
    """La dérive de la caisse (degrés, négative : glisse à droite) : nulle au freinage, elle s'installe en 0,3 s
    à l'entrée de l'arc, se réduit à la reprise."""
    s = SLIP * M.smoothstep(T_IN - 0.06, T_IN + 0.28, t)
    return s + (SLIP_OUT - SLIP) * M.smoothstep(T_GO, T_GO + 0.35, t)


def hero_phi(t):
    """Où en est la berline dans l'arc, en degrés (0 : entrée)."""
    return max(0.0, math.degrees((HERO.s(t) - S_IN) / TURN_R))


# --- la meute : au pied de la rampe, vers +y, à 30 m/s ; elle freine fort (elle voit l'axe fermé), sans
# rattraper la berline (46 m derrière à la première image, 29 m au plus près)
PACK_V = 30.0


def _pack_accel(t):
    return -8.0 * M.smoothstep(0.35, 0.55, t)


PACK = M.Profile(PACK_V, _pack_accel)
PACK_START = [("patrol", 1.9, 9.0), ("patrol", -1.9, -1.0), ("van", 1.9, -19.0), ("patrol", -1.9, -37.0)]


def pack_pos(i):
    _, x, y0 = PACK_START[i]
    return lambda t: (x, y0 + PACK.s(t))


def tracks():
    """{nom: pos(t)} de tous les véhicules du plan (pour vérifier les distances)."""
    out = {"hero": hero_pos}
    for i, (kind, _, _) in enumerate(PACK_START):
        out[f"{kind}_{i}"] = pack_pos(i)
    return out


# --- l'hélicoptère : il monte de derrière la file de conteneurs qui ferme l'axe, à l'ouest, et glisse vers le
# nord ; la caméra, qui tourne avec la berline, le trouve dans le haut du cadre à la seconde moitié du plan
HELI_A = (-44.0, 72.0, 10.0)
HELI_B = (-40.0, 96.0, 38.0)


def heli(t):
    """(x, y, z, cap, tangage, roulis) : montée rapide puis ralentie, la cellule qui se cabre en s'arrêtant."""
    u = min(1.0, max(0.0, t / T_END))
    e = 1 - (1 - u) ** 2.2
    x, y, z = (a + (b - a) * e for a, b in zip(HELI_A, HELI_B))
    return x, y, z, -8.0 + 14.0 * e, -7.0 + 4.0 * e, -3.0 - 5.0 * M.smoothstep(0.2, 0.9, u)


# --- la caméra : dans le virage, 6 m à l'intérieur de l'arc (au plus près, la caisse passe à 9 m), à 30 cm du
# sol, 28 mm, à l'épaule : elle voit la berline de trois quarts puis de flanc, la glisse et le contre-braquage
# (de la sortie du virage, elle la voyait de face et la glisse ne se lisait pas). Elle la suit : le lacet vise son
# centre, un peu en avance (elle reste dans le tiers central, panoramique de 65°) ; le site pose ses roues au
# tiers bas, juste au-dessus de la bande des 15 %. La meute, 30 m derrière, reste hors champ.
CAM = (20.0, 61.0, 0.3)
CAM_ROLL = -2.0
LENS = 28.0
TAN_V = 18.0 / LENS           # demi-champ vertical (capteur de 36 mm sur la hauteur, cadre 9:16)
GROUND_V = (-0.66, -0.60)     # où tombent les roues, en fraction de la demi-hauteur (-1 : le bas du cadre)
LAG = -0.04                   # en avance : de l'air devant le capot (avec 60 ms de retard, elle filait au bord)


def camera(t):
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.45, rotor=0.10 + 0.12 * M.smoothstep(0.3, 1.1, t), seed=0.7)
    x, y = hero_pos(t - LAG)
    ex, ey = x - CAM[0], y - CAM[1]
    yaw = 180.0 - math.degrees(math.atan2(-ex, ey))          # lacet compté de -y vers -x (motion.key_camera)
    v = GROUND_V[0] + (GROUND_V[1] - GROUND_V[0]) * M.smoothstep(0.0, T_END, t)
    pitch = math.degrees(math.atan(-v * TAN_V) - math.atan(CAM[2] / math.hypot(ex, ey)))
    return CAM[0] + dx, CAM[1] + dy, CAM[2] + dz, yaw + dyaw, pitch + dpitch, CAM_ROLL + droll, LENS


# --- le faisceau : il balaie la brume derrière la berline, croise l'objectif vers l'image 10, se pose sur elle
# vers l'image 16
SWEEP = ((-30.0, 45.0, 0.0), (-5.0, 62.0, 2.0))


def beam_target(t):
    f = t * M.FPS + F0
    car = hero_pos(t)
    car = (car[0], car[1], 0.7)
    if f <= 6:
        u = M.smoothstep(F0, 6, f)
        return tuple(a + (b - a) * u for a, b in zip(*SWEEP))
    if f <= 10:
        u = M.smoothstep(6, 10, f)
        return tuple(a + (b - a) * u for a, b in zip(SWEEP[1], CAM))
    if f <= 16:
        u = M.smoothstep(10, 16, f)
        return tuple(a + (b - a) * u for a, b in zip(CAM, car))
    return car


if __name__ == "__main__":
    for f in (1, 7, 11, 14, 20, 28):
        t = M.t_of(f)
        x, y = hero_pos(t)
        print(f"image {f:2d} t {t:.3f} s : berline ({x:5.1f}, {y:5.1f}) à {HERO.v(t) * 3.6:4.0f} km/h, arc "
              f"{hero_phi(t):4.1f}°, dérive {hero_slip(t):5.1f}° ; tête de meute y {pack_pos(0)(t)[1]:5.1f}")
    print("écart minimal :", M.min_gap(tracks(), range(F0, F0 + FRAMES)))
