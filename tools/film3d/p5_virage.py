# Le plan P5 écrit une fois, sans Blender (docs/cinematique-decoupage-v2.md, « P5 — La baïonnette du port ») : la
# berline sort du pont déjà en travers, tourne tard et glisse à droite sur la voie du quai ; l'arrière chasse vers
# l'objectif, posé au sol à l'extérieur du virage ; la meute dévale derrière elle ; le faisceau de l'hélicoptère
# balaie le quai et la rattrape ; le panoramique la suit puis monte sur l'hélicoptère, qui arrive de l'est, grand,
# incliné, en avançant. scene_e.py n'en lit que les fonctions du temps ; motion.py en tire roues, braquage et
# transfert de masse.
#
# Repère du port (celui de lieux.py) : la voie du pont sur l'axe x = 0, la berline sur sa voie de droite (x = 3,5)
# vers +y ; la voie du quai (axe y = 70, bords 63 et 77) vers +x ; la file de séparateurs qui ferme l'axe en
# y = 80,6. t = 0 à la première image ; 28 images, 24 par seconde (shared/film/cut.ts), 1,125 s de la première à la
# dernière.
#
# Écarts à la fiche v2, assumés (jugés sur la projection puis à l'image) :
# - la trajectoire est refaite (la fiche la gardait) : entrée tardive (la berline tient sa ligne jusqu'en y = 61
#   au lieu de 55) et rayon de 12 m au lieu de 15, à 70 km/h. Sur l'arc de 15 m elle passait à 13 m de
#   l'objectif, de profil : un passage, pas un frôlement. Ici le centre passe à 9,6 m et la boîte prend 85 % de la
#   largeur ; « quatre images plus tard » n'a plus de sens sur une trajectoire neuve : la berline est à 19 m de
#   l'objectif à la première image ;
# - la glisse va jusqu'à 42° (-20° dès la première image, le coup de volant à contre avant l'arc) : vue du sol, à
#   22° elle se lisait comme un virage ; deux traces de gomme (wheel_track) la dessinent sur la dalle ;
# - le panoramique fait 65° (de -11 à -76) et non 56° : la berline finit plus à gauche sur l'arc serré ;
# - l'hélicoptère finit en (34, 68, 20), plus près que (46, 56, 27) : à 27 m il tenait un timbre-poste ;
# - la meute est reculée (la tête à 39 m derrière à la première image) et répartie sur les deux voies, pour ne
#   jamais rattraper la berline (test_motion).
import math

import motion as M

FRAMES = 28
F0 = 1
T_END = (FRAMES - 1) / M.FPS

LANE_X = 3.5                  # la voie de droite du pont
TURN_R = 12.0
TURN_IN_Y = 61.0              # l'entrée dans l'arc : la berline tient sa ligne jusque-là
TURN_C = (LANE_X + TURN_R, TURN_IN_Y)       # (15,5 ; 60,5) ; la sortie sur y = 72,5, côté nord de la voie du quai

CAR_DIMS = (4.9, 1.8, 1.45)   # longueur, largeur, hauteur de la berline (à quelques centimètres)

# --- la berline : vitesse et accélération (m/s, m/s²), instants (s)
V0 = 19.4                    # 70 km/h à la première image
T_SCRUB = 0.18               # la glisse mange la vitesse
SCRUB = -6.5
T_GO = 0.62                  # la reprise : gaz à fond, l'arrière s'assied, la caisse se redresse
GO = 7.5
D0 = 19.0                    # la berline à 19 m de l'objectif à la première image (la fiche)
SLIP_IN = -20.0              # degrés à la première image : la caisse déjà lancée (le coup de volant à contre)
SLIP_PEAK = -42.0            # au plus fort de la glisse, au milieu de l'arc
SLIP_OUT = -10.0             # à la dernière image, en pleine accélération


def _hero_accel(t):
    a = -1.5 + (SCRUB + 1.5) * M.smoothstep(T_SCRUB - 0.1, T_SCRUB + 0.1, t)
    return a + (GO - SCRUB) * M.smoothstep(T_GO - 0.06, T_GO + 0.12, t)


HERO = M.Profile(V0, _hero_accel)


def _route(u):
    """Le point (x, y) de la route à l'abscisse u (u = 0 à l'entrée de l'arc) : la ligne droite du pont, l'arc à
    droite, la voie du quai."""
    if u <= 0:
        return LANE_X, TURN_IN_Y + u
    phi = u / TURN_R
    if phi > math.pi / 2:
        return TURN_C[0] + (u - TURN_R * math.pi / 2), TURN_C[1] + TURN_R
    return TURN_C[0] - TURN_R * math.cos(phi), TURN_C[1] + TURN_R * math.sin(phi)


CAM = (0.0, 76.0, 0.45)      # au sol, à l'extérieur du virage, dans le prolongement de la ligne d'arrivée
# la distance de la première image à l'entrée de l'arc : la berline à D0 m de l'objectif
S_IN = TURN_IN_Y - (CAM[1] - math.sqrt(D0 ** 2 - (LANE_X - CAM[0]) ** 2))


def road(s):
    """Le point (x, y) de la route de la berline à l'abscisse s (s = 0 à la première image)."""
    return _route(s - S_IN)


def hero_pos(t):
    return road(HERO.s(t))


def hero_phi(t):
    """Où en est la berline dans l'arc, en degrés (0 : entrée)."""
    return max(0.0, math.degrees((HERO.s(t) - S_IN) / TURN_R))


def hero_slip(t):
    """La dérive de la caisse (degrés, négative : glisse à droite, l'arrière dehors). Elle est déjà de -20° à la
    première image (la caisse lancée avant l'arc), se creuse à -42° au milieu de l'arc, et se referme à -10° à la
    reprise."""
    t_in = (S_IN) / max(HERO.v(0.0), 1.0)              # ~ l'instant de l'entrée dans l'arc
    s = SLIP_IN * M.smoothstep(-0.35, 0.0, t)
    s += (SLIP_PEAK - SLIP_IN) * M.smoothstep(t_in - 0.05, t_in + 0.30, t)
    return s + (SLIP_OUT - SLIP_PEAK) * M.smoothstep(T_GO - 0.05, T_GO + 0.40, t)


# --- la meute : sur la voie du pont, vers +y, à 30 m/s ; elle freine fort (elle voit l'axe fermé), sans
# rattraper la berline. La tête 39 m derrière à la première image : dans le champ, à droite de la berline, au
# début du panoramique.
PACK_V = 30.0


def _pack_accel(t):
    return -8.5 * M.smoothstep(0.30, 0.50, t)


PACK = M.Profile(PACK_V, _pack_accel)
PACK_START = [("patrol", 2.8, 18.0), ("patrol", -2.4, 8.0), ("van", 2.8, -10.0), ("patrol", -2.4, -28.0)]


def pack_pos(i):
    _, x, y0 = PACK_START[i]
    return lambda t: (x, y0 + PACK.s(t))


# --- ce que la berline frôle (posé par scene_e.build_east, contrôlé par test_motion) : la chaîne pendue sur l'axe
# de la voie du pont, que l'arrière en glisse longe à 1,4 m (images 1 à 7) ; la flaque que les roues arrière
# traversent au plus fort de la glisse (images 10 à 16) ; les caisses de la sortie, que le nez frôle à 1 m
# (images 25 à 28).
CHAIN_POSTS = [(0.6, 52.0), (0.6, 54.7), (0.6, 57.4), (0.6, 60.1)]
PUDDLE_AT, PUDDLE_SIZE, PUDDLE_YAW = (4.0, 65.8), (4.4, 2.8), 38.0
CRATES_AT = (14.9, 70.3)
CRATES_BOX = (13.85, 16.0, 69.3, 70.95)     # l'emprise des caisses et des palettes (x0, x1, y0, y1)


def tracks():
    """{nom: pos(t)} de tous les véhicules du plan (pour vérifier les distances)."""
    out = {"hero": hero_pos}
    for i, (kind, _, _) in enumerate(PACK_START):
        out[f"{kind}_{i}"] = pack_pos(i)
    return out


# --- l'hélicoptère : il arrive de l'est, au ras des piles de conteneurs, en vol d'avance (nez bas), et vire sur
# la gauche vers la berline (incliné) en montant ; à la fin il ralentit sans s'arrêter, nez qui se relève, et
# dérive encore vers le quai.
HELI_PATH = ((64.0, 36.0, 21.0), (53.0, 49.0, 21.0), (40.0, 63.0, 20.5), (34.0, 68.0, 20.0))


def _bez(pts, u):
    a, b, c, d = pts
    w = ((1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3)
    return tuple(sum(wk * p[i] for wk, p in zip(w, pts)) for i in range(3))


def _heli_u(t):
    """L'avancement sur la trajectoire : vite au début, plus lent à la fin (il freine sur la berline)."""
    u = min(1.0, max(0.0, t / T_END))
    return 1.0 - (1.0 - u) ** 1.35


def heli(t):
    """(x, y, z, cap, tangage, roulis) : le cap suit la route (il vise la berline), le nez bas tant qu'il avance
    vite, le roulis à gauche dans le virage."""
    u = _heli_u(t)
    x, y, z = _bez(HELI_PATH, u)
    x2, y2, _ = _bez(HELI_PATH, min(1.0, max(0.0, u + 0.02)))
    x1, y1, _ = _bez(HELI_PATH, min(1.0, max(0.0, u - 0.02)))
    head = M.heading_of(x2 - x1, y2 - y1) if (x2 - x1) or (y2 - y1) else 60.0
    # il se tourne vers la berline en finissant (le projecteur est sous le nez)
    hx, hy = hero_pos(t)
    want = M.heading_of(hx - x, hy - y)
    head = head + (M._unwrap(head, want) - head) * M.smoothstep(0.5, 1.0, t / T_END) * 0.6
    pitch = -11.0 + 7.0 * M.smoothstep(0.45, 1.0, t / T_END)
    roll = -14.0 - 8.0 * M.smoothstep(0.1, 0.6, t / T_END) + 10.0 * M.smoothstep(0.7, 1.0, t / T_END)
    return x, y, z, head, pitch, roll


# --- la caméra : fixe, au sol, 32 mm. Le panoramique tient la berline au milieu du cadre (le milieu de sa boîte
# vue d'ici, pas son centre : l'arrière qui chasse vers l'objectif grossit et tire la boîte à droite), puis, quand
# elle s'éloigne, il se lève et se pose sur un cadre qui tient la berline en bas du tiers central et l'hélicoptère
# au-dessus d'elle. Départ et arrêt amortis : la berline vient d'abord droit sur l'objectif (son relèvement bouge
# à peine), et le lacet se pose en fin de plan.
LENS = 32.0
TAN_V = 18.0 / LENS           # demi-champ vertical (capteur de 36 mm sur la hauteur, cadre 9:16)
TAN_H = TAN_V * 9.0 / 16.0
YAW_END = -76.0               # le cadre final (la fiche : -68 ; la berline finit plus à gauche, voir l'en-tête)
PITCH0, PITCH1 = 3.0, 13.0
CAR_LEAD = 1.5                # degrés d'air devant le capot (elle file vers la gauche du cadre)


def _bearing(x, y):
    """Le lacet (convention de motion.key_camera) qui vise (x, y) depuis la caméra."""
    return (180.0 - math.degrees(math.atan2(-(x - CAM[0]), y - CAM[1])) + 180.0) % 360.0 - 180.0


def hero_heading(t, h=1e-3):
    """Le cap de la caisse (route plus dérive), convention de lieux.put."""
    (x0, y0), (x1, y1) = hero_pos(t - h), hero_pos(t + h)
    return M.heading_of(x1 - x0, y1 - y0) + hero_slip(t)


REAR_AXLE, TRACK = -1.45, 0.75          # l'essieu arrière (m devant le centre) et la demi-voie de la berline
SKID_FRAMES = (6, 24)                   # la gomme marque tant que la dérive dépasse ~22° (images de scène)


def wheel_track(side, axle=REAR_AXLE, frames=SKID_FRAMES, n=72):
    """La trace d'une roue (side : -1 gauche, +1 droite) au sol entre deux images : [(t, x, y)]. Vue d'une caméra
    au sol, la dérive se lit surtout par là : deux arcs noirs qui partent plus larges que la trace de l'avant."""
    t0, t1 = M.t_of(frames[0]), M.t_of(frames[1])
    out = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        x, y = hero_pos(t)
        h = math.radians(hero_heading(t))
        fx, fy = -math.sin(h), math.cos(h)
        out.append((t, x + fx * axle + fy * TRACK * side, y + fy * axle - fx * TRACK * side))
    return out


def _follow(t):
    """Le lacet qui met le milieu de la boîte de la berline au milieu du cadre."""
    x, y = hero_pos(t)
    h = math.radians(hero_heading(t))
    fx, fy = -math.sin(h), math.cos(h)
    rx, ry = fy, -fx
    c = _bearing(x, y)
    bs = [c + (((_bearing(x + fx * a + rx * b, y + fy * a + ry * b) - c) + 180.0) % 360.0 - 180.0)
          for a in (-CAR_DIMS[0] / 2, CAR_DIMS[0] / 2) for b in (-CAR_DIMS[1] / 2, CAR_DIMS[1] / 2)]
    return (min(bs) + max(bs)) / 2 + CAR_LEAD


def camera_aim(t):
    """(lacet, site) sans le tremblé."""
    u = t / T_END
    yaw = _follow(t)
    yaw = yaw + (YAW_END - yaw) * M.smoothstep(0.80, 1.0, u)
    pitch = PITCH0 + (PITCH1 - PITCH0) * M.smoothstep(0.42, 1.0, u)
    return yaw, pitch


def camera(t):
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.10, rotor=0.03 * M.smoothstep(0.3, 1.1, t), seed=0.7)
    yaw, pitch = camera_aim(t)
    return CAM[0] + dx * 0.2, CAM[1] + dy * 0.2, CAM[2] + dz * 0.2, yaw + dyaw, pitch + dpitch, droll * 0.5, LENS


def project(p, t):
    """Le point monde p (x, y, z) dans le cadre de la caméra à l'instant t, sans le tremblé : (x %, y %, distance)
    comptés depuis la gauche et depuis le bas ; None s'il est derrière l'objectif."""
    yaw, pitch = camera_aim(t)
    a, b = math.radians(yaw), math.radians(pitch)
    f = (-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
    r = (f[1], -f[0], 0.0)                         # f × z
    n = math.hypot(r[0], r[1])
    r = (r[0] / n, r[1] / n, 0.0)
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    v = tuple(p[i] - CAM[i] for i in range(3))
    zc = sum(v[i] * f[i] for i in range(3))
    if zc <= 0.05:
        return None
    xc, yc = sum(v[i] * r[i] for i in range(3)), sum(v[i] * u[i] for i in range(3))
    return 50.0 + 50.0 * xc / zc / TAN_H, 50.0 + 50.0 * yc / zc / TAN_V, math.sqrt(sum(c * c for c in v))


def car_box(pose, dims=CAR_DIMS):
    """Les huit coins de la caisse d'une pose de motion.sample."""
    h = math.radians(pose["heading"])
    fx, fy = -math.sin(h), math.cos(h)
    rx, ry = fy, -fx
    L2, W2, H = dims[0] / 2, dims[1] / 2, dims[2]
    return [(pose["x"] + fx * a + rx * b, pose["y"] + fy * a + ry * b, z)
            for a in (-L2, L2) for b in (-W2, W2) for z in (0.1, H)]


def frame_box(pose):
    """La boîte de la berline dans le cadre : (x0, x1, y0, y1) en %, et la distance au plus près de l'objectif."""
    pts = [project(p, pose["t"]) for p in car_box(pose)]
    pts = [q for q in pts if q]
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    return min(xs), max(xs), min(ys), max(ys), min(q[2] for q in pts)


# --- le faisceau : sa tache court sur la voie du pont derrière la berline (entre elle et la meute), la rattrape
# vers l'image 12, puis la tient avec un léger retard (l'opérateur du projecteur la suit à 0,06 s, un mètre).
SWEEP = ((2.0, 44.0, 0.0), (4.5, 60.0, 0.0))     # sur la voie du pont, derrière elle, vers elle
BEAM_LAG = 0.06


def beam_target(t):
    f = t * M.FPS + F0
    hx, hy = hero_pos(t - BEAM_LAG)
    car = (hx, hy, 0.6)
    if f <= 12:
        u = M.smoothstep(F0, 12, f)
        sweep = tuple(a + (b - a) * u for a, b in zip(*SWEEP))
        k = M.smoothstep(7, 12, f)                     # il glisse vers elle
        return tuple(s + (c - s) * k for s, c in zip(sweep, car))
    return car


if __name__ == "__main__":
    poses = M.sample(hero_pos, range(F0, F0 + FRAMES), slip=hero_slip)
    for p in poses:
        f = p["frame"]
        t = p["t"]
        x0, x1, y0, y1, d = frame_box(p)
        hx = heli(t)
        hp = project(hx[:3], t)
        pk = project((*pack_pos(0)(t), 0.8), t)
        print(f"image {f:2d} : berline ({p['x']:5.1f}, {p['y']:5.1f}) {HERO.v(t) * 3.6:4.0f} km/h, arc {hero_phi(t):4.1f}°, "
              f"dérive {p['heading'] - p['travel']:5.1f}° ; cadre x {x0:4.0f}–{x1:4.0f} y {y0:4.0f}–{y1:4.0f}, au plus "
              f"près {d:4.1f} m ; lacet {camera_aim(t)[0]:6.1f} site {camera_aim(t)[1]:4.1f} ; hélico "
              + (f"x {hp[0]:4.0f} y {hp[1]:4.0f} à {hp[2]:4.1f} m" if hp else "derrière")
              + (f" ; tête de meute x {pk[0]:4.0f} y {pk[1]:4.0f}" if pk else ""))
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
