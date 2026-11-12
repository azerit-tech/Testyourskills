# Le plan FIN écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md, FIN : « Cernée au pied du phare,
# les mains levées », 52 images) : de dos de bout en bout. La berline sort de la jetée lancée, glisse sur la
# pointe et s'arrête en son centre à l'image 30, cap 25° (scene_d.slide_pose) ; la caméra, qui la suivait 7 m
# derrière et 1,2 m à gauche à 0,6 m du sol, freine moins fort qu'elle, s'approche et s'arrête 5,5 m derrière, puis
# monte à 1,3 m en basculant de +4 à -2°. Devant la berline, le phare entier (lieux.phare, sa lanterne à 16,8 m) ;
# au-dessus d'elle, l'hélicoptère, bas, face à elle : son faisceau se pose sur elle à l'image 30. À sa droite, la
# patrouille de la v2, arrêtée, portière ouverte, l'agent accroupi qui se redresse en joue ; à sa gauche, la
# patrouille 1 qui nous a dépassés et s'arrête près de son essieu arrière (hors du cadre : 24 mm en 9:16, sa
# rampe bat sur le flanc gauche) ; derrière la caméra, trois poursuivants, leurs seuls phares. Temps mort de 30 à
# 35, le conducteur lève les mains de 35 à 46, on tient jusqu'à 52. Personne ne tire.
# scene_d.plan_FIN n'en lit que les fonctions du temps et les images clés ; motion.py mesure --v3 FIN les contrôle.
#
# Repère de l'eau (lieux.py) : la pointe centrée en (80, 430), la jetée vers -y ; cap 0 = +y, positif vers -x.
# 52 images à 24 par seconde (shared/film/cut.ts), 2,17 s.
import math
import os

import motion as M

FRAMES = 52
F0 = 1
V3 = True
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = FRAMES
T_STILL = M.t_of(STILL_FRAME)

JX, JY1 = 80.0, 400.0              # lieux.JETTY_X, lieux.JETTY_YS[1]
CX, CY = 80.0, 430.0               # lieux.POINTE
HERO_STOP = 25.0                   # scene_d.HERO_STOP
HERO_BOX = (4.9, 1.9)              # la berline au sol : longueur, largeur (m)
PATROL_BOX = (5.1, 2.0)
PHARE_AT = (75.0, 458.3, 16.8)     # lieux.PHARE_AT et la hauteur de sa lanterne (lieux.PHARE_FEU)


def slide_pose(s):
    """scene_d.slide_pose, recopiée (sans Blender) : (x, y, cap) de la glissade, s de 0 à 1."""
    e = 1.0 - (1.0 - s) ** 2
    x = JX + 1.75 - 1.75 * (3 * s * s - 2 * s * s * s)
    y = JY1 - 6.0 + (CY - JY1 + 6.0) * e
    return x, y, HERO_STOP * s ** 1.6


def ease5(a, b, x):
    """Rampe de 0 à 1 de a à b, vitesse et accélération nulles aux deux bouts (6u⁵ - 15u⁴ + 10u³)."""
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * u * (u * (6.0 * u - 15.0) + 10.0)


def brake_dist(t, v0, decel, t1, taper):
    """La distance parcourue à t par un véhicule lancé à v0 qui freine à `decel` jusqu'à t1, puis relâche son
    freinage en ligne droite jusqu'à zéro sur `taper` secondes, où il s'arrête (vitesse et accélération nulles à
    l'arrêt : sans le relâché, l'accélération sautait de 1 g à rien d'une image à l'autre). Avant 0, le même
    freinage remonte le temps (il arrive plus vite)."""
    if t <= t1:
        return v0 * t - decel * t * t / 2.0
    v1 = v0 - decel * t1
    d1 = v0 * t1 - decel * t1 * t1 / 2.0
    tau = min(t - t1, taper)
    return d1 + v1 * tau - decel * (tau * tau / 2.0 - tau ** 3 / (6.0 * taper))


def brake_profile(f_stop, decel, taper_frames=6):
    """(v0, t1, taper, distance) d'un freinage qui s'arrête à l'image f_stop (brake_dist)."""
    T = M.t_of(f_stop)
    taper = taper_frames / M.FPS
    t1 = T - taper
    v0 = decel * (t1 + taper / 2.0)
    return v0, t1, taper, brake_dist(T, v0, decel, t1, taper)


# --- la glissade : 1,1 g, relâchée sur les six dernières images, arrêt à l'image 30 ; elle entre à 43 km/h et
# glisse 6,5 m (la fiche : 45 km/h, 7,8 m à 1 g ; arrêt à 30, à 1,1 g et relâchée, c'est ce qui reste)
F_STOP = 30
T_STOP = M.t_of(F_STOP)
HERO_DECEL = 10.8
HERO_TAPER = 4                     # images de relâché (plus long, la caisse ne revenait plus en arrière)
V_ENTRY, _T1, _TAPER, SLIDE_D = brake_profile(F_STOP, HERO_DECEL, HERO_TAPER)
SLIDE_L = CY - JY1 + 6.0           # 36 m : y est linéaire en e = 1 - (1 - s)²


def slide_s(t):
    q = max(0.0, SLIDE_D - brake_dist(t, V_ENTRY, HERO_DECEL, _T1, _TAPER))
    return 1.0 - math.sqrt(q / SLIDE_L)


def hero_pos(t):
    x, y, _ = slide_pose(slide_s(t))
    return x, y


def hero_heading(t):
    return slide_pose(slide_s(t))[2]


# --- le rail : la caméra et la patrouille 1 roulent sur des parallèles à la route de la berline sur la pointe
# (son cap de route moyen sur le plan, 7°) ; u le long du rail depuis le point d'arrêt, « gauche » à gauche
ROUTE_H = 7.0
_rh = math.radians(ROUTE_H)
FWD_R = (-math.sin(_rh), math.cos(_rh))
LEFT_R = (-FWD_R[1], FWD_R[0])


def rail_point(u, left):
    return CX + FWD_R[0] * u + LEFT_R[0] * left, CY + FWD_R[1] * u + LEFT_R[1] * left


def rail_u(p):
    return (p[0] - CX) * FWD_R[0] + (p[1] - CY) * FWD_R[1]


# --- la caméra : 7 m derrière la berline à l'image 1, 1,2 m à gauche, 0,6 m, 24 mm, site +4°. Elle freine moins
# fort que la berline (7,4 m/s² contre 11), relâche avec elle (3,6 m/s² à l'arrêt de la berline : son écart
# d'accélération reste sous 4 m/s²), et s'arrête à l'image F_CAM_STOP, 5,5 m derrière. Puis la grue (0,6 à
# 1,3 m), la bascule (+4 à -2°) et un glissement à gauche (1,2 à 1,5 m), amortis en entrée et en sortie ; image
# 52 fixe. Le lacet garde le centre de la berline au milieu du cadre.
CAM_LENS = 24.0
CAM_GAP0 = 7.8
# l'accélération de la caméra le long du rail, (image, m/s²) ; linéaire entre les clés, nulle après la dernière
F_CAM_STOP = 40
CAM_ACC = [(F0, -7.6), (F_STOP - HERO_TAPER, -7.6), (F_STOP, -3.0), (F_CAM_STOP, 0.0)]
CAM_LEFT = (1.2, 1.5)
F_SLIDE = (32, 52)
CAM_Z = (0.6, 1.3)
CAM_PITCH = (5.0, 0.0)
F_CRANE = (18, 52)


def _cam_knots():
    """Les états (t, u, v, a) de la caméra aux clés de CAM_ACC, sa vitesse de départ choisie pour qu'elle
    s'arrête à la dernière clé."""
    ts = [M.t_of(f) for f, _ in CAM_ACC]
    acc = [a for _, a in CAM_ACC]
    dv = sum((acc[i] + acc[i + 1]) / 2.0 * (ts[i + 1] - ts[i]) for i in range(len(ts) - 1))
    v0 = -dv
    u0 = rail_u(hero_pos(ts[0])) - CAM_GAP0
    knots, u, v = [], u0, v0
    for i in range(len(ts)):
        knots.append((ts[i], u, v, acc[i]))
        if i + 1 < len(ts):
            h = ts[i + 1] - ts[i]
            k = (acc[i + 1] - acc[i]) / h
            u += v * h + acc[i] * h * h / 2.0 + k * h ** 3 / 6.0
            v += acc[i] * h + k * h * h / 2.0
    return knots


_KNOTS = _cam_knots()


def cam_u(t):
    """La position de la caméra le long du rail (m)."""
    if t <= _KNOTS[0][0]:
        t0, u, v, a = _KNOTS[0]
        h = t - t0
        return u + v * h + a * h * h / 2.0
    for (ta, u, v, a), (tb, _, _, b) in zip(_KNOTS, _KNOTS[1:]):
        if t <= tb:
            h, k = t - ta, (b - a) / (tb - ta)
            return u + v * h + a * h * h / 2.0 + k * h ** 3 / 6.0
    return _KNOTS[-1][1]


def _yaw_to(src, dst):
    """Le lacet de motion.key_camera (0 : vers -y, positif vers -x) qui regarde de src vers dst, dans [0, 360)."""
    a = math.degrees(math.atan2(-(dst[0] - src[0]), -(dst[1] - src[1])))
    return a + 360.0 if a < 0.0 else a


_HALF_W = math.tan(math.radians(M.fov_deg(CAM_LENS)[0] / 2.0))


def camera_dos_rail(t):
    """La caméra de dos : (x, y, z, lacet, site, roulis, focale) sans tremblé. Le lacet met au milieu du cadre la boîte de la berline
    (motion.frame_box), pas son centre : vue de trois quarts arrière, sa boîte penche vers le coin le plus proche
    (le centre visé, elle tombait à x 58 %)."""
    left = CAM_LEFT[0] + (CAM_LEFT[1] - CAM_LEFT[0]) * ease5(M.t_of(F_SLIDE[0]), M.t_of(F_SLIDE[1]), t)
    k = ease5(M.t_of(F_CRANE[0]), M.t_of(F_CRANE[1]), t)
    x, y = rail_point(cam_u(t), left)
    z = CAM_Z[0] + (CAM_Z[1] - CAM_Z[0]) * k
    pitch = CAM_PITCH[0] + (CAM_PITCH[1] - CAM_PITCH[0]) * k
    hx, hy = hero_pos(t)
    yaw = _yaw_to((x, y), (hx, hy))
    pose = dict(x=hx, y=hy, heading=hero_heading(t))
    for _ in range(3):
        b = M.frame_box((x, y, z, yaw, pitch, 0.0, CAM_LENS), pose)
        if not b:
            break
        yaw += math.degrees(math.atan((b[0] + b[1] - 100.0) / 100.0 * _HALF_W))   # le lacet tourne à droite
    return x, y, z, yaw, pitch, 0.0, CAM_LENS


# --- le repli de face (la fiche : « le cadre de face validé en v2, avec le nouveau minutage sur 52 images »),
# derrière l'interrupteur FILM3D_FIN_FACE=1 : la pose validée de la v2 (à 9 m devant le point d'arrêt, 20 cm du
# sol, lacet 1°, site 14°, 24 mm), atteinte par une avancée de 2,2 m au ras du sol qui se pose à l'arrêt de la
# berline (image 30), puis tient. Les mains s'y lisent derrière le pare-brise ; il n'est jamais dans le film à six
# étoiles. Par défaut, la caméra de dos.
FACE = os.environ.get("FILM3D_FIN_FACE", "0") == "1"
FACE_CAM = (CX + 0.7, CY + 8.97, 0.2)
FACE_YAW, FACE_PITCH, FACE_PUSH, FACE_EASE, FACE_TILT = 1.0, 14.0, 2.2, 2.3, 2.5
_FBACK = (math.sin(math.radians(FACE_YAW)), math.cos(math.radians(FACE_YAW)))


def camera_face_rail(t):
    u = min(1.0, max(0.0, t) / T_STOP)
    k = FACE_PUSH * (1.0 - u) ** FACE_EASE
    return (FACE_CAM[0] + _FBACK[0] * k, FACE_CAM[1] + _FBACK[1] * k, FACE_CAM[2], FACE_YAW,
            FACE_PITCH - FACE_TILT * (1.0 - u) ** FACE_EASE, 0.0, CAM_LENS)


def camera_rail(t):
    """La caméra du plan sans tremblé : de dos, ou de face derrière l'interrupteur."""
    return camera_face_rail(t) if FACE else camera_dos_rail(t)


def camera(t):
    """camera_rail et le tremblé de la caméra portée (0,12° à 24 mm), qui s'éteint de moitié une fois posée."""
    x, y, z, yaw, pitch, roll, lens = camera_rail(t)
    s = 1.0 - 0.5 * ease5(M.t_of(F_CAM_STOP - 6), M.t_of(STILL_FRAME), t)
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.12, rotor=0.0, seed=2.2)
    return x + dx * 0.3 * s, y + dy * 0.3 * s, z + dz * 0.3 * s, yaw + dyaw * s, pitch + dpitch * s, droll * s, lens


def focus_point(t):
    """La mise au point sur la lunette arrière (1,7 m derrière le centre de la berline, à 1,1 m) ; de face, sur
    le pare-brise (1 m devant, à 1 m : la pose validée de la v2)."""
    x, y = hero_pos(t)
    h = math.radians(hero_heading(t))
    if FACE:
        return x, y + 1.0, 1.0
    return x + math.sin(h) * 1.7, y - math.cos(h) * 1.7, 1.1


# --- la patrouille de la v2, arrêtée (les cotes de scene_d.plan_FIN) : parallèle à la berline, à sa droite et un
# peu en avant ; la portière du conducteur (à gauche) tourne autour de la charnière
_h = math.radians(HERO_STOP)
FWD = (-math.sin(_h), math.cos(_h))
RIGHT = (FWD[1], -FWD[0])
PATROL = (CX + RIGHT[0] * 4.0 + FWD[0] * 1.5, CY + RIGHT[1] * 4.0 + FWD[1] * 1.5)
HINGE = (PATROL[0] + FWD[0] * 0.96 - RIGHT[0] * 0.92, PATROL[1] + FWD[1] * 0.96 - RIGHT[1] * 0.92)
DOOR_LEN = 1.31                    # lieux.open_door : door_x de -0,32 à 0,99


def door_dir(deg):
    """La direction de la charnière vers le bord libre de la portière, ouverte de `deg` degrés."""
    a = math.radians(deg)
    return (-FWD[0] * math.cos(a) - RIGHT[0] * math.sin(a), -FWD[1] * math.cos(a) - RIGHT[1] * math.sin(a))


# la portière : déjà ouverte à 72° au début (l'agent est sorti avant le plan), poussée à 80° des images 3 à 11.
# Plus fermée, elle passerait dans l'agent accroupi derrière elle (à 62°, 2 cm d'interpénétration)
DOOR_KEYS = [(3, 72.0), (11, 80.0)]


def door_deg(t):
    (f0, a0), (f1, a1) = DOOR_KEYS
    return a0 + (a1 - a0) * M.smoothstep(M.t_of(f0), M.t_of(f1), t)


# l'agent, derrière la portière ouverte (à 80°), sur la bissectrice de la portière et de l'arrière, à 0,75 m de la
# charnière ; il regarde la berline. Accroupi jusqu'à l'image 20, debout en joue à l'image 32, quand la berline
# vient de s'arrêter (clés d'os) : il a fini de bouger avant les mains.
_d80 = door_dir(80.0)
_bis = (_d80[0] - FWD[0], _d80[1] - FWD[1])
_n = math.hypot(*_bis)
OFFICER = (HINGE[0] + _bis[0] / _n * 0.75, HINGE[1] + _bis[1] / _n * 0.75)
OFFICER_LOOK = (CX - 0.3, CY + 0.6)
OFFICER_KEYS = [(20, "crouch"), (32, "aim")]
OFFICER_R = 0.3                    # son encombrement au sol (épaules, genou)

# le conducteur : les mains au volant pendant le temps mort (30 à 35 : seules battent les rampes), levées
# lentement de 35 à 46 (les clés d'os s'interpolent en douceur), tenues jusqu'à 52
DRIVER_KEYS = (35, 46)

# la fumée des pneus : elle continue sur sa lancée après l'arrêt et dépasse la berline vers l'avant (+y)
SMOKE_DRIFT = 2.6


# --- la patrouille 1 : partie à la hauteur de la caméra, sur sa gauche (2,4 m d'air entre elles), elle freine
# moins fort que la caméra et la dépasse, puis s'arrête à gauche de la berline, un peu en arrière de son essieu
# arrière (le centre de sa caisse 2 m derrière le point d'arrêt sur le rail, 4,6 m à gauche : 2,4 m d'air
# avec le flanc gauche de la berline). Elle reste hors du cadre (le 24 mm en 9:16 ne voit pas à plus de 10° à
# gauche de la route) : sa rampe bat sur le flanc gauche de la berline et sur le sol devant elle.
P1_LEFT = 4.6
P1_END_U = -3.6
F_P1_STOP = 38
P1_DECEL = 10.9
P1_V0, _P1_T1, _P1_TAPER, P1_D = brake_profile(F_P1_STOP, P1_DECEL)


def patrol1_pos(t):
    return rail_point(P1_END_U - P1_D + brake_dist(t, P1_V0, P1_DECEL, _P1_T1, _P1_TAPER), P1_LEFT)


# --- l'hélicoptère, devant la berline, bas (8 m), à 22 m de son centre, un peu à droite de la route (sinon il
# passait devant la tour du phare), le nez vers elle ; son faisceau la cherche pendant la glissade (en retard sur
# elle, un peu de balancement) et se pose sur elle à l'image 30
HELI_AZ = -15.0                    # cap du point d'arrêt vers l'hélicoptère
HELI_D, HELI_Z = 22.0, 8.0
HELI = (CX - math.sin(math.radians(HELI_AZ)) * HELI_D, CY + math.cos(math.radians(HELI_AZ)) * HELI_D, HELI_Z)
HELI_HEADING = HELI_AZ + 180.0
F_BEAM = 30


def beam_target(t):
    x, y = hero_pos(t)
    w = 1.0 - M.smoothstep(0.0, M.t_of(F_BEAM), t)
    lx, ly = hero_pos(t - 0.3)
    sway = 1.1 * w * math.sin(2.0 * math.pi * 1.3 * t + 0.4)
    return x + (lx - x) * w + sway, y + (ly - y) * w, 0.8


def aircraft():
    return {"heli": lambda t: HELI}


# --- les poursuivants : trois patrouilles sorties de la jetée derrière nous, qui s'arrêtent l'une après l'autre
# derrière la caméra (8 m au moins) ; on ne voit d'elles que leurs phares, qui jettent l'ombre de la berline vers
# le phare. (u d'arrêt sur le rail, à gauche, image d'arrêt, décélération)
ARC = [(-17.6, 0.0, 26, 9.0), (-20.5, 3.6, 32, 8.5), (-17.5, -3.9, 38, 8.0)]


def arc_pos(i):
    u_end, left, f_stop, decel = ARC[i]
    v0, t1, taper, d = brake_profile(f_stop, decel)
    return lambda t: rail_point(u_end - d + brake_dist(t, v0, decel, t1, taper), left)


def arc_heading(i):
    return lambda t: ROUTE_H


def tracks():
    out = {"hero": hero_pos, "patrol": lambda t: PATROL, "patrol_1": patrol1_pos}
    out.update({f"arc_{i}": arc_pos(i) for i in range(len(ARC))})
    return out


def tracks_heading():
    out = {"patrol": lambda t: HERO_STOP, "patrol_1": lambda t: ROUTE_H}
    out.update({f"arc_{i}": arc_heading(i) for i in range(len(ARC))})
    return out


def _corners(c, heading, box):
    h = math.radians(heading)
    f, r = (-math.sin(h), math.cos(h)), (math.cos(h), math.sin(h))
    return [(c[0] + f[0] * box[0] / 2 * a + r[0] * box[1] / 2 * b, c[1] + f[1] * box[0] / 2 * a + r[1] * box[1] / 2 * b)
            for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


def rect_gap(c1, h1, b1, c2, h2, b2):
    """L'écart entre deux rectangles au sol (axes séparateurs) : > 0, ils ne se touchent pas (m)."""
    p, q = _corners(c1, h1, b1), _corners(c2, h2, b2)
    best = -1e9
    for poly in (p, q):
        for i in range(4):
            ex, ey = poly[(i + 1) % 4][0] - poly[i][0], poly[(i + 1) % 4][1] - poly[i][1]
            n = math.hypot(ex, ey)
            ax = (-ey / n, ex / n)
            pp = [a[0] * ax[0] + a[1] * ax[1] for a in p]
            qq = [a[0] * ax[0] + a[1] * ax[1] for a in q]
            best = max(best, max(min(qq) - max(pp), min(pp) - max(qq)))
    return best


def seg_point(a, b, p):
    """La distance d'un point au segment [a, b]."""
    ab = (b[0] - a[0], b[1] - a[1])
    u = max(0.0, min(1.0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)))
    return math.dist(p, (a[0] + ab[0] * u, a[1] + ab[1] * u))


if __name__ == "__main__":
    print(f"glissade : {V_ENTRY * 3.6:.0f} km/h, {SLIDE_D:.2f} m, arrêt à l'image {F_STOP} ; "
          f"patrouille 1 : {P1_V0 * 3.6:.0f} km/h, {P1_D:.1f} m, arrêt à l'image {F_P1_STOP}")
    for f in (1, 2, 10, 20, 26, 30, 34, 37, 40, 46, 52):
        t = M.t_of(f)
        c = camera_rail(t)
        x, y = hero_pos(t)
        print(f"image {f:2d} : berline ({x:.2f}, {y:.2f}) cap {hero_heading(t):.1f}°, caméra ({c[0]:.2f}, "
              f"{c[1]:.2f}, {c[2]:.2f}) lacet {c[3]:.1f}° site {c[4]:.1f}°, écart {rail_u((x, y)) - cam_u(t):.2f} m, "
              f"patrouille 1 à {rail_u(patrol1_pos(t)) - cam_u(t):+.1f} m de la caméra")
