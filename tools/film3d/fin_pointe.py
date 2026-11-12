# Le plan FIN écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md, FIN : « Cernée au pied du phare,
# les mains levées », 52 images), de dos de bout en bout dans le cadre de poursuite commun du découpage v3.1. La
# berline sort de la jetée en plein freinage, glisse (l'arrière à droite, 11°) et s'arrête à l'image 36, 8 m avant
# le centre de la pointe, cap 25° (motion.drive) ; la caméra, 2,4 m au-dessus de la chaussée et 7,5 m derrière,
# s'approche à 6,3 m en descendant à 2,0 m et se fige à la dernière image. Devant la berline, le phare entier
# (lieux.phare, sa lanterne à 16,8 m) ; au-dessus d'elle, l'hélicoptère, bas, face à elle : son faisceau se pose
# sur elle à l'arrêt. La patrouille 1, devant à gauche, freine en virant et s'arrête en travers au pied du phare ;
# derrière la caméra, la meute n'est plus que ses phares. Le conducteur sort les mains par sa vitre de l'image 42
# à 49, on tient jusqu'à 52. Personne ne tire.
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
V31 = True
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = FRAMES
T_STILL = M.t_of(STILL_FRAME)

JX, JY1 = 80.0, 400.0              # lieux.JETTY_X, lieux.JETTY_YS[1]
CX, CY = 80.0, 430.0               # lieux.POINTE
# le point d'arrêt : sur l'axe de la jetée, STOP_BACK m avant le centre de la pointe. De 2,4 m, la berline à
# y 58 %, la caméra plonge de 9° : arrêtée au centre, la lanterne (16,8 m, 28 m devant) montait à 7 % du haut
STOP_BACK = 8.0
SX, SY = CX, CY - STOP_BACK
HERO_BOX = (4.9, 1.9)              # la berline au sol : longueur, largeur (m)
PATROL_BOX = (5.1, 2.0)
PHARE_AT = (75.0, 458.3, 16.8)     # lieux.PHARE_AT et la hauteur de sa lanterne (lieux.PHARE_FEU)


def ease5(a, b, x):
    """Rampe de 0 à 1 de a à b, vitesse et accélération nulles aux deux bouts (6u⁵ - 15u⁴ + 10u³)."""
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * u * (u * (6.0 * u - 15.0) + 10.0)


def brake_dist(t, v0, decel, t1, taper):
    """La distance parcourue à t par un véhicule lancé à v0 qui freine à `decel` jusqu'à t1, puis relâche son
    freinage en ligne droite jusqu'à zéro sur `taper` secondes, où il s'arrête (vitesse et accélération nulles à
    l'arrêt : sans le relâché, l'accélération sautait de tout à rien d'une image à l'autre). Avant 0, le même
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


# --- l'arrêt (découpage v3.1, route mouillée, berline lourde) : motion.drive, l'outil commun de conduite. La route :
# un arc à gauche (HERO_R m, HERO_ARC°, précédé de HERO_LINE m droits) qui finit au point d'arrêt ; HERO_V m/s
# voulus. L'outil freine dans les limites (6,4 m/s², installé et relâché sans à-coup), la glisse naît de
# la combinaison freinage et virage au-delà de 5,5 m/s² (HERO_SLIP_PER ° par m/s² : 11°, l'arrière vers la droite,
# l'extérieur du virage), les roues avant contre-braquent (hero_steer), et elle s'arrête sans pivot : la glisse se
# fige avec la vitesse. Le grand rayon fait naître la glisse tôt, au-dessus de 4 m/s : plus bas, motion.drive
# l'amortit d'un coup (le lacet de la caisse passait 250 °/s² avec un arc de 20 m). Le plan la prend en plein freinage (t0 < 0, l'ellipse d'encre avant FIN) : 24 km/h à
# l'image 1, arrêtée à l'image F_STOP, cap de caisse HERO_STOP.
F_STOP = 36
HERO_V = 12.0
HERO_LINE, HERO_R, HERO_ARC = 0.0, 40.0, 15.0
HERO_SLIP_PER = 20.0


def _hero_route(start):
    return dict(start=start, pieces=([M.line(HERO_LINE)] if HERO_LINE else []) + [M.arc(HERO_R, HERO_ARC)])


def _hero_drive():
    """La conduite de la berline : la route posée pour finir au point d'arrêt (SX, SY), le départ réglé pour que
    l'arrêt tombe à l'image F_STOP."""
    lim = dict(slip_per=HERO_SLIP_PER)
    d = M.drive(_hero_route((0.0, 0.0, 0.0)), HERO_V, stop=True, lim=lim, t_span=(-1.0, 10.0))
    ex, ey = d.pos(d.t_stop + 1.0)
    t0 = M.t_of(F_STOP) - d.t_stop
    return M.drive(_hero_route((SX - ex, SY - ey, 0.0)), HERO_V, t0=t0, stop=True, lim=lim,
                   t_span=(t0 - 1.0, t0 + 10.0))


HERO = _hero_drive()
T_STOP = HERO.t_stop
V_ENTRY = HERO.speed(0.0)
HERO_STOP = HERO.heading(T_STOP + 1.0)      # le cap de la caisse arrêtée (25°)
hero_pos, hero_heading, hero_slip, hero_steer = HERO.pos, HERO.heading, HERO.slip, HERO.steer


# l'avancement de la glissade (traces de pneus) : la distance parcourue depuis T_SLIDE0 (une seconde avant le
# plan), rapportée à celle de l'arrêt
T_SLIDE0 = -1.0
_SLIDE_DT = 1.0 / 240.0


def _slide_table():
    ts, ds = [T_SLIDE0], [0.0]
    t = T_SLIDE0
    while t < T_STOP:
        t2 = min(T_STOP, t + _SLIDE_DT)
        ds.append(ds[-1] + math.dist(hero_pos(t), hero_pos(t2)))
        ts.append(t2)
        t = t2
    return ts, ds


_SLIDE_T, _SLIDE_D = _slide_table()
SLIDE_D = _SLIDE_D[-1]


def slide_s(t):
    """L'avancement de la glissade (0 une seconde avant le plan, 1 à l'arrêt)."""
    if t <= T_SLIDE0:
        return 0.0
    if t >= T_STOP:
        return 1.0
    k = min(len(_SLIDE_T) - 2, int((t - T_SLIDE0) / _SLIDE_DT))
    w = (t - _SLIDE_T[k]) / max(1e-9, _SLIDE_T[k + 1] - _SLIDE_T[k])
    return (_SLIDE_D[k] + (_SLIDE_D[k + 1] - _SLIDE_D[k]) * w) / SLIDE_D


def _t_of_s(s):
    lo, hi = T_SLIDE0, T_STOP
    for _ in range(50):
        mid = (lo + hi) / 2.0
        if slide_s(mid) < s:
            lo = mid
        else:
            hi = mid
    return hi


def slide_pose(s):
    """(x, y, cap de caisse) de la glissade, s de 0 à 1 (slide_s) : scene_d.skid_marks la lit."""
    t = _t_of_s(min(1.0, max(0.0, s)))
    x, y = hero_pos(t)
    return x, y, hero_heading(t)


# --- le rail : la caméra et la patrouille 1 roulent sur des parallèles à la route de la berline sur la pointe
# (son cap de route moyen sur le plan, 3°) ; u le long du rail depuis le point d'arrêt, « gauche » à gauche
ROUTE_H = 3.0
_rh = math.radians(ROUTE_H)
FWD_R = (-math.sin(_rh), math.cos(_rh))
LEFT_R = (-FWD_R[1], FWD_R[0])


def rail_point(u, left):
    return SX + FWD_R[0] * u + LEFT_R[0] * left, SY + FWD_R[1] * u + LEFT_R[1] * left


def rail_u(p):
    return (p[0] - SX) * FWD_R[0] + (p[1] - SY) * FWD_R[1]


# --- la caméra (le cadre de poursuite commun, découpage v3.1) : 2,4 m au-dessus de la chaussée, 7,5 m derrière la
# berline, 24 mm, la boîte de la berline au milieu du cadre à y 58 % depuis le haut. Pas de rail : elle roule avec
# la berline et freine avec elle ; son cap tourne de CAM_DIR[0] (la caisse à l'image 1, 14°) à CAM_DIR[1] (la caisse
# arrêtée, 25°) ; elle s'approche de 7,6 à 6,2 m (F_GAP) en descendant à 2,0 m (F_CRANE), et glisse de 0,3 à 0,9 m
# à gauche (CAM_LEFT : le flanc du conducteur) ; image 52 fixe. Les rampes qui commencent avant l'image 1 (F_DIR,
# F_SLIDE) sont déjà lancées à la coupe : sur 7,5 m de bras, une rampe entière dans le plan balançait la caméra
# à plus de 4 m/s² par rapport à la berline. Le cap et la distance tiennent sa largeur à ±15 % et son axe à 1,5 m
CAM_LENS = 24.0
CAM_DIR = (11.0, 23.0)
F_DIR = (-30, 52)
CAM_GAP = (7.6, 6.2)
F_GAP = (1, 52)
CAM_LEFT = (0.3, 0.9)
F_SLIDE = (-30, 52)
CAM_Z = (2.4, 2.0)
F_CRANE = (1, 52)
# la boîte de la berline, % depuis le haut : 56 à la coupe, 61 quand elle s'arrête (la lanterne reste sous les
# 15 % du haut) ; % depuis la gauche : 52 à la coupe, puis au milieu. À la coupe, à 8 % et 6 % au plus de la
# sortie de chacun des plans P1 à P5 (test_motion, coupes v3)
CAM_Y = (56.0, 61.0)
F_CAM_Y = (10, 40)
AIM_X = (52.0, 50.0)
F_AIM = (20, 48)
# la visée : le centre de la caisse, décalé de AIM_BOX fois l'écart lissé (polynôme de degré BOX_FIT_DEG) entre lui
# et le centre de la boîte à l'écran
AIM_BOX = 1.0
BOX_FIT_DEG = 3
F_CAM_STOP = STILL_FRAME


def _ease(f, t):
    return ease5(M.t_of(f[0]), M.t_of(f[1]), t)


def cam_ground(t):
    """La position au sol de la caméra (x, y) : CAM_GAP derrière la berline et CAM_LEFT à gauche, au cap CAM_DIR."""
    hx, hy = hero_pos(t)
    th = math.radians(CAM_DIR[0] + (CAM_DIR[1] - CAM_DIR[0]) * _ease(F_DIR, t))
    fx, fy = -math.sin(th), math.cos(th)
    gap = CAM_GAP[0] + (CAM_GAP[1] - CAM_GAP[0]) * _ease(F_GAP, t)
    left = CAM_LEFT[0] + (CAM_LEFT[1] - CAM_LEFT[0]) * _ease(F_SLIDE, t)
    return hx - fx * gap - fy * left, hy - fy * gap + fx * left


def cam_u(t):
    """La position de la caméra le long du rail (m), pour les contrôles."""
    return rail_u(cam_ground(t))


def _yaw_to(src, dst):
    """Le lacet de motion.key_camera (0 : vers -y, positif vers -x) qui regarde de src vers dst, dans [0, 360)."""
    a = math.degrees(math.atan2(-(dst[0] - src[0]), -(dst[1] - src[1])))
    return a + 360.0 if a < 0.0 else a


_HALF_W = math.tan(math.radians(M.fov_deg(CAM_LENS)[0] / 2.0))
_HALF_H = math.tan(math.radians(M.fov_deg(CAM_LENS)[1] / 2.0))


def camera_dos_rail(t, correct=True):
    """La caméra de dos : (x, y, z, lacet, site, roulis, focale) sans tremblé. Le lacet et le site mettent la boîte
    de la berline (motion.frame_box) à AIM_X % depuis la gauche et CAM_Y % depuis le haut, à l'écart lissé près
    (correct=False : le centre de la caisse à la place de sa boîte, pour l'ajustement)."""
    x, y = cam_ground(t)
    z = CAM_Z[0] + (CAM_Z[1] - CAM_Z[0]) * _ease(F_CRANE, t)
    hx, hy = hero_pos(t)
    yaw = _yaw_to((x, y), (hx, hy))
    pitch = -math.degrees(math.atan2(z - 0.7, math.dist((x, y), (hx, hy))))
    aim = AIM_X[0] + (AIM_X[1] - AIM_X[0]) * ease5(M.t_of(F_AIM[0]), M.t_of(F_AIM[1]), t)
    cy = CAM_Y[0] + (CAM_Y[1] - CAM_Y[0]) * ease5(M.t_of(F_CAM_Y[0]), M.t_of(F_CAM_Y[1]), t)
    # visé : le centre de la caisse, décalé de l'écart lissé entre lui et le centre de sa boîte (_box_offset) : la
    # boîte reste en place (AIM_X, CAM_Y) et le centre de la caisse ne suit à l'écran que des courbes douces. La
    # boîte seule (son coin le plus proche) saute quand la caisse pivote dans la glisse ; le centre seul la laisse
    # filer de 12 % à droite en fin de plan, la caisse en travers
    ox, oy = _box_offset(t) if correct else (0.0, 0.0)
    return _aim_point(x, y, z, yaw, pitch, (hx, hy, M.HERO_BOX[2] / 2.0),
                      aim / 100.0 - AIM_BOX * ox, cy / 100.0 - AIM_BOX * oy)


def _aim_point(x, y, z, yaw, pitch, p, u, v):
    """La caméra (x, y, z) tournée pour mettre le point p du monde en (u, v) du cadre (depuis la gauche et le
    haut)."""
    for _ in range(6):
        q = M.screen_point((x, y, z, yaw, pitch, 0.0, CAM_LENS), p)
        if q is None:
            break
        yaw += math.degrees(math.atan((2.0 * q[0] - 2.0 * u) * _HALF_W))   # le lacet tourne à droite
        pitch -= math.degrees(math.atan((2.0 * q[1] - 2.0 * v) * _HALF_H))
    return x, y, z, yaw, pitch, 0.0, CAM_LENS


_BOX_FIT = None


def _polyfit(xs, ys, deg):
    """Les coefficients (du degré 0 au degré deg) des moindres carrés de ys en xs."""
    n = deg + 1
    a = [[sum(x ** (i + j) for x in xs) for j in range(n)] + [sum(y * x ** i for x, y in zip(xs, ys))]
         for i in range(n)]
    for i in range(n):
        k = max(range(i, n), key=lambda r: abs(a[r][i]))
        a[i], a[k] = a[k], a[i]
        for r in range(n):
            if r != i:
                m = a[r][i] / a[i][i]
                a[r] = [vr - m * vi for vr, vi in zip(a[r], a[i])]
    return [a[i][n] / a[i][i] for i in range(n)]


def _box_offset(t):
    """L'écart (u, v) du centre de la boîte de la berline au centre de sa caisse, à l'écran, la caméra visant la
    caisse : un polynôme de degré BOX_FIT_DEG ajusté sur les images du plan, donc lisse."""
    global _BOX_FIT
    if _BOX_FIT is None:
        ts, us, vs = [], [], []
        for f in range(F0, STILL_FRAME + 1):
            tf = M.t_of(f)
            cam = camera_dos_rail(tf, correct=False)
            hx, hy = hero_pos(tf)
            q = M.screen_point(cam, (hx, hy, M.HERO_BOX[2] / 2.0))
            b = M.frame_box(cam, dict(x=hx, y=hy, heading=hero_heading(tf)))
            if q is None or not b:
                continue
            ts.append(tf)
            us.append((b[0] + b[1]) / 200.0 - q[0])
            vs.append(1.0 - (b[2] + b[3]) / 200.0 - q[1])
        _BOX_FIT = (_polyfit(ts, us, BOX_FIT_DEG), _polyfit(ts, vs, BOX_FIT_DEG))
    tc = min(max(t, M.t_of(F0)), M.t_of(STILL_FRAME))
    return tuple(sum(c * tc ** i for i, c in enumerate(fit)) for fit in _BOX_FIT)


# --- le repli de face (la fiche : « le cadre de face validé en v2, avec le nouveau minutage sur 52 images »),
# derrière l'interrupteur FILM3D_FIN_FACE=1 : la pose validée de la v2 (à 9 m devant le point d'arrêt, 20 cm du
# sol, lacet 1°, site 14°, 24 mm), atteinte par une avancée de 2,2 m au ras du sol qui se pose à l'arrêt de la
# berline (F_STOP), puis tient. Les mains s'y lisent derrière le pare-brise ; il n'est jamais dans le film à six
# étoiles. Par défaut, la caméra de dos.
FACE = os.environ.get("FILM3D_FIN_FACE", "0") == "1"
FACE_CAM = (SX + 0.7, SY + 8.97, 0.2)
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
    """La caméra du plan : camera_rail, sans tremblé écrit (découpage v3.1)."""
    return camera_rail(t)


def focus_point(t):
    """La mise au point sur la lunette arrière (1,7 m derrière le centre de la berline, à 1,1 m) ; de face, sur
    le pare-brise (1 m devant, à 1 m : la pose validée de la v2)."""
    x, y = hero_pos(t)
    h = math.radians(hero_heading(t))
    if FACE:
        return x, y + 1.0, 1.0
    return x + math.sin(h) * 1.7, y - math.cos(h) * 1.7, 1.1


# le conducteur : les mains au volant pendant le temps mort (36 à 42 : seules battent les rampes), puis dehors par
# sa vitre baissée en DRIVER_OUT images (lieux.hands_out_keys), tenues jusqu'à 52 ; de face (FACE), levées de 42 à
# 51 derrière le pare-brise
DRIVER_KEYS = (42, 51)
DRIVER_OUT = 7



# --- la patrouille 1, seule voiture du cadre : elle a doublé la caméra et la berline avant le plan (de la hauteur
# de la caméra, à 7 m/s² au plus, il lui faudrait 34 m en 52 images pour finir devant elle). À l'image 1, devant à
# gauche, déjà en freinage ; motion.drive la conduit (route : un arc à droite de P1_R m sur P1_ARC° depuis le cap
# P1_CAP0) : la glisse naît du freinage dans le virage (11°, l'arrière vers la gauche), les roues
# contre-braquent, et elle s'arrête en travers devant la berline à gauche, vers le pied du phare (cap de caisse
# -60°), à l'image F_P1_STOP : elle ferme la pointe.
P1_STOP = (SX - 6.0, SY + 18.0)      # à gauche du cadre (x 20 à 46 % à la fin), sous la lanterne
P1_CAP0, P1_LINE, P1_R, P1_ARC, P1_V = -30.0, 0.0, 40.0, -20.0, 12.0
P1_SLIP_PER = 20.0
F_P1_STOP = 38


def _p1_route(start):
    return dict(start=start, pieces=([M.line(P1_LINE)] if P1_LINE else []) + [M.arc(P1_R, P1_ARC)])


def _p1_drive():
    lim = dict(slip_per=P1_SLIP_PER)
    d = M.drive(_p1_route((0.0, 0.0, P1_CAP0)), P1_V, stop=True, kind="patrol", lim=lim, t_span=(-1.0, 10.0))
    ex, ey = d.pos(d.t_stop + 1.0)
    t0 = M.t_of(F_P1_STOP) - d.t_stop
    return M.drive(_p1_route((P1_STOP[0] - ex, P1_STOP[1] - ey, P1_CAP0)), P1_V, t0=t0, stop=True, kind="patrol",
                   lim=lim, t_span=(t0 - 1.0, t0 + 10.0))


PATROL1 = _p1_drive()
P1_HEAD = PATROL1.heading(PATROL1.t_stop + 1.0)
P1_V0 = PATROL1.speed(0.0)
patrol1_pos, patrol1_heading, patrol1_slip, patrol1_steer = (PATROL1.pos, PATROL1.heading, PATROL1.slip,
                                                             PATROL1.steer)


# le lampadaire de la pointe, dans FIN et FIN6 (scene_d les y déplace, sans le tourner) : à droite du point d'arrêt
# et un peu en arrière, à 9,5 m de la berline, sa tête et son reflet sur l'enrobé mouillé hors du cadre à toutes
# les images de FIN, avec 15 % de marge pour le flou du reflet. À sa place de la pointe (scene_d.LAMP_AT), sa tête
# sortait du cadre en haut à droite et son reflet restait en bas : une tache blanche sans source lisible (règle
# E). Sur une caméra qui plonge, le reflet n'est pas à l'aplomb de la tête à l'écran : on vérifie les deux.
LAMP_FIN = (SX + 9.0, SY - 3.0)
_LAMP_OLD = (80.0 + 5.5, 430.0 - 5.8)              # scene_d.LAMP_AT, le bras tourné vers la pointe (80, 430)
_LAMP_K = 1.68 * 1.75 / math.hypot(80.0 - _LAMP_OLD[0], 430.0 - _LAMP_OLD[1])     # lieux.lamp, LAMP_S 1,75
LAMP_HEAD = (LAMP_FIN[0] + (80.0 - _LAMP_OLD[0]) * _LAMP_K, LAMP_FIN[1] + (430.0 - _LAMP_OLD[1]) * _LAMP_K,
             4.68 * 1.75)


# --- l'hélicoptère, devant la berline, bas (8 m), à 22 m de son centre, un peu à droite de la route (sinon il
# passait devant la tour du phare), le nez vers elle ; son faisceau la cherche pendant la glissade (devant elle,
# un peu de balancement : en retard, sa tache tombait derrière elle, sur le sol blanc du tiers bas) et se pose sur
# elle à l'arrêt (F_BEAM)
HELI_AZ = -15.0                    # cap du point d'arrêt vers l'hélicoptère
HELI_D, HELI_Z = 22.0, 8.0
HELI = (SX - math.sin(math.radians(HELI_AZ)) * HELI_D, SY + math.cos(math.radians(HELI_AZ)) * HELI_D, HELI_Z)
HELI_HEADING = HELI_AZ + 180.0
F_BEAM = F_STOP


def beam_target(t):
    x, y = hero_pos(t)
    w = 1.0 - M.smoothstep(0.0, M.t_of(F_BEAM), t)
    sway = 1.1 * w * math.sin(2.0 * math.pi * 1.3 * t + 0.4)
    return x + sway, y + 3.5 * w, 0.8


def aircraft():
    return {"heli": lambda t: HELI}


# --- la meute : plus de voitures, seulement leur lumière. Des paires de phares hors champ, derrière la caméra, qui
# arrivent de la jetée l'une après l'autre (elles s'allument en entrant dans le virage, de l'image f_in à
# f_in + 8) et s'arrêtent sur le rail, 6 m au moins derrière la caméra ; elles allongent l'ombre de la berline
# vers le phare. (u d'arrêt sur le rail, à gauche, image d'allumage, image d'arrêt, décélération)
PACK = [(-16.5, 0.6, 36, 46, 8.0), (-19.0, 3.2, 40, 50, 8.0), (-20.0, -2.4, 44, 52, 7.5)]
PACK_LAMP = (2.3, 0.7, 0.65)       # les phares : en avant du centre, demi-écart, hauteur


def pack_pos(i):
    u_end, left, _, f_stop, decel = PACK[i]
    v0, t1, taper, d = brake_profile(f_stop, decel)
    return lambda t: rail_point(u_end - d + brake_dist(min(t, M.t_of(f_stop)), v0, decel, t1, taper), left)


def pack_level(i, t):
    """L'allumage de la paire i, de 0 à 1."""
    f_in = PACK[i][2]
    return ease5(M.t_of(f_in), M.t_of(f_in + 8), t)


def tracks():
    return {"hero": hero_pos, "patrol_1": patrol1_pos}


def tracks_heading():
    return {"patrol_1": patrol1_heading}


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
          f"patrouille 1 : {P1_V0 * 3.6:.0f} km/h, arrêt à l'image {F_P1_STOP}, cap {P1_HEAD:.0f}°")
    for f in (1, 2, 10, 20, 26, 30, 34, 37, 40, 46, 52):
        t = M.t_of(f)
        c = camera_rail(t)
        x, y = hero_pos(t)
        print(f"image {f:2d} : berline ({x:.2f}, {y:.2f}) cap {hero_heading(t):.1f}°, caméra ({c[0]:.2f}, "
              f"{c[1]:.2f}, {c[2]:.2f}) lacet {c[3]:.1f}° site {c[4]:.1f}°, écart {rail_u((x, y)) - cam_u(t):.2f} m, "
              f"patrouille 1 à {rail_u(patrol1_pos(t)) - cam_u(t):+.1f} m de la caméra")
