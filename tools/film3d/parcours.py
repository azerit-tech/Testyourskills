# Le parcours unique de la berline : une seule conduite pour tout le film à six étoiles, découpée aux coupes.
# Chaque plan en lit une fenêtre de temps, posée dans sa scène par une rotation et une translation : la berline et
# la caméra quittent un plan dans l'état exact où elles entrent dans le suivant. Python pur.
import math

import motion as M

FPS = 24.0
SHOTS = (("OUV", 40), ("P1", 48), ("P2", 84), ("P3", 48), ("P4", 48), ("P5", 60), ("P6", 60))
START, _f = {}, 0                 # première image globale de chaque plan (0 = OUV/1)
for _n, _d in SHOTS:
    START[_n] = _f
    _f += _d
TOTAL = _f                        # 388

# ---- le profil (abscisses en m depuis OUV/1)
V_OUV, V1, V_FAR = 50 / 3.6, 16.4, 30.0     # l'avenue ; avant le rond-point ; jamais atteinte : elle accélère
S_GO = 31.0                                 # elle met les gaz
S_ARC2, R2, A2 = 65.0, 30.0, 64.0           # le rond-point : début nominal, rayon, angle (à gauche)
VA2, B2, G2 = 12.8, 9.0, 24.0               # vitesse d'arc, où elle la demande, où elle remet les gaz (m après S_ARC2)
S_ARC5, R5, A5 = 182.0, 15.0, 50.0          # le port (à droite)
VA5, B5, G5 = 9.47, 5.0, 9.0
TAIL = 80.0
LIM = dict(slip_per=16.0, slip_drag=0.14, slip_hold=0.4, slip_max=15.0)
JERK = 12.0 * 0.72


def _ease(radius):
    """La longueur d'adoucissement d'un arc : celle que motion.drive prendrait pour lui seul."""
    lat = LIM.get("lat", 6.5) * LIM.get("margin", 0.92)
    return max(2.0, lat * math.sqrt(lat * radius) / JERK)       # 9,27 m pour 30 m ; 6,55 m pour 15 m


def _route(pieces, ds=0.1):
    """pieces = [(longueur, courbure, adoucissement)] : chaque arc lissé par deux moyennes glissantes de SA longueur
    (motion.make_route n'en prend qu'une pour toute la route : l'arc de 15 m y perdait son rayon)."""
    n = sum(max(1, int(round(L / ds))) for L, _, _ in pieces)
    kappa, i = [0.0] * n, 0
    for L, k, ease in pieces:
        m = max(1, int(round(L / ds)))
        if k:
            w = max(1, int(round(ease / ds)) | 1)
            pad = 2 * w
            raw = [0.0] * (i + pad) + [k] * m + [0.0] * (n - i - m + pad)
            sm = M._box(M._box(raw, w), w)[pad:pad + n]
            kappa = [a + b for a, b in zip(kappa, sm)]
        i += m
    return M.Route(0.0, 0.0, 0.0, kappa, ds)


def _drive():
    l2, l5 = R2 * math.radians(A2), R5 * math.radians(A5)
    e2, e5 = _ease(R2), _ease(R5)
    route = _route([(S_ARC2, 0.0, 0.0), (l2, 1.0 / R2, e2), (S_ARC5 - S_ARC2 - l2, 0.0, 0.0), (l5, -1.0 / R5, e5),
                    (TAIL, 0.0, 0.0)])
    speed = [(0.0, V_OUV), (S_GO, V_OUV), (S_GO + 0.1, V1),
             (S_ARC2 + B2 - 0.1, V1), (S_ARC2 + B2, VA2), (S_ARC2 + G2, VA2), (S_ARC2 + G2 + 0.1, V_FAR),
             (S_ARC5 + B5 - 0.1, V_FAR), (S_ARC5 + B5, VA5), (S_ARC5 + G5, VA5), (S_ARC5 + G5 + 0.1, V_FAR)]
    return M.drive(route, speed, t0=0.0, kind="hero", lim=LIM, ease=max(e2, e5), t_span=(-2.0, TOTAL / FPS + 2.5))


DRIVE = _drive()


def t_of(shot, frame):
    """L'instant du parcours (s depuis OUV/1) de l'image `frame` (1 = la première) du plan."""
    return (START[shot] + frame - 1) / FPS


CAP_B = DRIVE.travel(t_of("P4", 10))           # la droite après le rond-point : +63,98°
CAP_D = DRIVE.travel(TOTAL / FPS + 1.0)        # la droite après le port : +13,94°
# plan : (image de référence, où la berline s'y trouve dans la scène, cap de la droite de la scène qui monte vers +y)
ANCHOR = {
    "OUV": (1, (1.75, 244.0), 0.0),
    "P1": (1, (1.75, 288.0), 0.0),
    "P2": (1, (4.84, -39.77), 0.0),
    "P3": (36, (0.35, 123.30), CAP_B),
    "P4": (48, (1.80, -35.69), CAP_B),
    "P5": (1, (5.25, 43.80), CAP_B),
    "P6": (60, (81.75, 344.42), CAP_D),
}


def placer(shot):
    """(to_scene(x, y), cap) : la transformation du parcours vers la scène du plan, et le cap à retrancher."""
    frame, (tx, ty), cap = ANCHOR[shot]
    ax, ay = DRIVE.pos(t_of(shot, frame))
    c, s = math.cos(math.radians(cap)), math.sin(math.radians(cap))

    def to_scene(x, y):
        dx, dy = x - ax, y - ay
        return tx + c * dx + s * dy, ty - s * dx + c * dy
    return to_scene, cap


def hero(shot):
    """Les fonctions de l'image du plan (décimale admise) : pos (scène), heading et travel (degrés, 0 = +y de la
    scène, positif à gauche), slip, steer, speed, along, alat."""
    to_scene, cap = placer(shot)
    t = lambda f: t_of(shot, f)                                    # noqa: E731
    return dict(pos=lambda f: to_scene(*DRIVE.pos(t(f))), heading=lambda f: DRIVE.heading(t(f)) - cap,
                travel=lambda f: DRIVE.travel(t(f)) - cap, slip=lambda f: DRIVE.slip(t(f)),
                steer=lambda f: DRIVE.steer(t(f)), speed=lambda f: DRIVE.speed(t(f)),
                along=lambda f: DRIVE.along(t(f)), alat=lambda f: DRIVE.alat(t(f)))


# ---- le bras commun de la caméra : deux pôles (tau 0,12 s) sur le cap de la vitesse, filtrés sur tout le parcours
CAM_TAU, CAM_BACK, CAM_LEFT, CAM_Z = 0.12, 7.5, 0.3, 2.4
_H, _T0 = 1.0 / 240.0, -1.5


def _cam_table():
    a1 = a2 = DRIVE.travel(_T0)
    out = []
    for k in range(int((TOTAL / FPS + 0.5 - _T0) / _H)):
        a = DRIVE.travel(_T0 + k * _H)
        a1 += (a - a1) * _H / CAM_TAU
        a2 += (a1 - a2) * _H / CAM_TAU
        out.append(a2)
    return out


_CAM = _cam_table()


def cam_cap(shot, frame):
    """Le cap du bras (degrés, repère de la scène du plan) ; image décimale admise (interpolé à 1/240 s)."""
    u = (t_of(shot, frame) - _T0) / _H
    k = max(0, min(len(_CAM) - 2, int(math.floor(u))))
    f = max(0.0, min(1.0, u - k))
    return _CAM[k] + (_CAM[k + 1] - _CAM[k]) * f - placer(shot)[1]


def camera(shot, frame, back=CAM_BACK, left=CAM_LEFT, z=CAM_Z):
    """La position de la caméra dans la scène : `back` derrière le centre de la berline le long du bras, `left` à sa
    gauche. Le plan la vise comme aujourd'hui (la boîte de la berline en x 50 %, y 58 %)."""
    x, y = hero(shot)["pos"](frame)
    a = math.radians(cam_cap(shot, frame))
    fx, fy = -math.sin(a), math.cos(a)             # l'avant du bras ; sa gauche : (-fy, fx)
    return x - back * fx - left * fy, y - back * fy + left * fx, z


def brake_windows(shot):
    """Les fenêtres des feux stop du plan, en images du plan : [(première, dernière)]."""
    return DRIVE.brake_windows(f0=1 - START[shot], frames=range(1, dict(SHOTS)[shot] + 1))


# ---- les états aux coupes, au niveau du module (indépendamment des plans) : les dérivées de motion.motion_state
# sur la fenêtre de chaque plan, prises vers l'intérieur du plan ; roulis et tangage de M.sample sur tout le parcours
FIXED_CAM = ("P4",)                # le plan de face, caméra fixe : pas de panoramique comparé
YAW_ACC_STRICT = False             # l'entrée du virage du port tire 133 °/s² de lacet de caisse (120) : à reprendre
_BODY = {}


def body():
    """{image globale: pose de M.sample} sur tout le parcours (roulis, tangage) : ressorts chauffés avant OUV/1."""
    if not _BODY:
        ps = M.sample(DRIVE.pos, range(-12, TOTAL + 12), heading=DRIVE.heading, steer=DRIVE.steer, f0=0)
        _BODY.update({p["frame"]: p for p in ps})
    return _BODY


def state(shot, frame, side):
    """L'état de la berline et du bras à l'image `frame` du plan, dérivées d'ordre 2 décentrées prises dans le plan
    (side = -1 : en sortie, +1 : en entrée), comme motion.motion_state les prend sur les poses du plan."""
    h = hero(shot)
    fr = [frame + side * k for k in range(4)]
    dt = 1.0 / FPS
    xs, ys = zip(*(h["pos"](f) for f in fr))
    vx, vy = M._d1(xs, side, dt), M._d1(ys, side, dt)
    ax, ay = M._d2(xs, dt), M._d2(ys, dt)
    sp = math.hypot(vx, vy)
    ux, uy = vx / sp, vy / sp
    st = dict(speed=sp, along=ax * ux + ay * uy, alat=ux * ay - uy * ax, travel=M.heading_of(vx, vy))
    st["yaw"] = math.degrees(st["alat"] / sp)
    st["slip"] = M._unwrap(0.0, h["heading"](frame) - st["travel"])
    st["steer"] = h["steer"](frame)
    b = body()[START[shot] + frame - 1]
    st["roll"], st["pitch"] = b["roll"], b["pitch"]
    st["lamps"] = any(a <= frame <= z for a, z in brake_windows(shot))
    st["pan"] = None if shot in FIXED_CAM else M._d1([cam_cap(shot, f) for f in fr], side, dt)
    return st


def cut_states():
    """[(A, B, état de sortie de A, état d'entrée de B)] pour les six coupes de la poursuite."""
    return [(a, b, state(a, na, -1), state(b, 1, +1)) for (a, na), (b, _) in zip(SHOTS, SHOTS[1:])]


if __name__ == "__main__":         # python3 tools/film3d/parcours.py : les fenêtres et les états aux coupes
    for name, n in SHOTS:
        hh = hero(name)
        (x0, y0), (x1, y1) = hh["pos"](1), hh["pos"](n)
        print(f"{name:3s} v {hh['speed'](1):5.2f} → {hh['speed'](n):5.2f} m/s, cap {hh['travel'](1):+6.2f} → "
              f"{hh['travel'](n):+6.2f}°, ({x0:6.2f}, {y0:7.2f}) → ({x1:6.2f}, {y1:7.2f}), caméra "
              f"{tuple(round(v, 2) for v in camera(name, 1))} → {tuple(round(v, 2) for v in camera(name, n))}, "
              f"feux stop {brake_windows(name)}")
    print("\ncoupe         v              long           lat            lacet          glisse         braquage"
          "       roulis         tangage        feux  pano °/s")
    for a, b, sa, sb in cut_states():
        pan = lambda s: "fixe" if s["pan"] is None else f"{s['pan']:+5.1f}"          # noqa: E731
        print(f"{a:3s} → {b:3s}  " + "  ".join(f"{sa[k]:+6.2f}/{sb[k]:+6.2f}" for k in
                                              ("speed", "along", "alat", "yaw", "slip", "steer", "roll", "pitch"))
              + f"  {'X' if sa['lamps'] else '.'}/{'X' if sb['lamps'] else '.'}  {pan(sa)}/{pan(sb)}")
