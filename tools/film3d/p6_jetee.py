# Le plan P6 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3 et §2.4, « la jetée ») : la berline
# en tête sur la jetée à 120 km/h, la colonne de gyrophares derrière elle en Z (la rampe du pont, la voie du quai,
# la jetée), trois hélicoptères en formation au-dessus d'elle, faisceaux croisés sur elle ; deux avions de chasse
# qui arrivent du fond, très bas dans l'axe de la jetée, et passent au-dessus de tout (ils ne tirent rien).
# Découpage v2 (docs/cinematique-decoupage-v2.md, P6) : la caméra devant la berline, au ras du sol, qui la
# précède en travelling avant jusqu'à l'image 24, puis s'envole en reculant ; elle tremble au passage des avions.
# L'ancienne grue reste (camera_grue) pour la variante V1 : 22 images au ras du sol, 18 images hautes.
# scene_d.py n'en lit que les fonctions du temps ; motion.py en tire roues, roulis et tangage.
#
# Repère de l'eau (lieux.py) : la jetée sur x = 80 de y = 100 à 400, la voie du quai en y = 70, le pont sur x = 0
# (il touche le terre-plein en y = 1). La poursuite roule vers +y. t = 0 à la première image ; 40 images à 24 par
# seconde (shared/film/cut.ts), 1,625 s. À l'image fixe (STILL_FRAME, 21) la berline est en y = 280 (s = 180
# sur la jetée).
import math

import motion as M

FRAMES = 40
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = 21
T_STILL = M.t_of(STILL_FRAME)

JX, JY0, QUAY_Y = 80.0, 100.0, 70.0        # lieux.JETTY_X, lieux.JETTY_YS[0], lieux.QUAY_Y
LANE = 1.75
SPEED = 120 / 3.6                          # la berline, et la colonne en ligne droite
Y_HERO_STILL = JY0 + 180.0

# --- la route de la colonne, voie de droite : la rampe du pont vers +y (la voie de la meute de P5, x = 1,9), à
# droite sur la voie du quai (vers +x), à gauche sur la jetée (vers +y) ; deux virages de 15 m de rayon
R1, R2 = 15.0, 15.0
X_BRIDGE = 1.9
Y_QUAY = QUAY_Y - LANE                     # 68,25 : la voie de droite vers +x
X_JETTY = JX + LANE                        # 81,75
Y_RAMP0 = -160.0
_C1 = (X_BRIDGE + R1, Y_QUAY - R1)         # le centre du virage à droite
_C2 = (X_JETTY - R2, Y_QUAY + R2)          # le centre du virage à gauche
_L = [_C1[1] - Y_RAMP0, R1 * math.pi / 2, _C2[0] - _C1[0], R2 * math.pi / 2]
_S = [sum(_L[:k]) for k in range(5)]       # les abscisses des débuts de tronçon


def route(s, lat=0.0):
    """Le point de la route à l'abscisse s (m depuis le bas de la rampe), décalé de `lat` vers la gauche."""
    if s < _S[1]:
        p, d = (X_BRIDGE, Y_RAMP0 + s), (0.0, 1.0)
    elif s < _S[2]:
        a = math.pi - (s - _S[1]) / R1                          # de pi à pi/2, en sens horaire
        p = (_C1[0] + R1 * math.cos(a), _C1[1] + R1 * math.sin(a))
        d = (math.sin(a), -math.cos(a))
    elif s < _S[3]:
        p, d = (_C1[0] + (s - _S[2]), Y_QUAY), (1.0, 0.0)
    elif s < _S[4]:
        a = -math.pi / 2 + (s - _S[3]) / R2                     # de -pi/2 à 0, en sens trigonométrique
        p = (_C2[0] + R2 * math.cos(a), _C2[1] + R2 * math.sin(a))
        d = (-math.sin(a), math.cos(a))
    else:
        p, d = (X_JETTY, _C2[1] + (s - _S[4])), (0.0, 1.0)
    return p[0] - d[1] * lat, p[1] + d[0] * lat


S_HERO_STILL = _S[4] + (Y_HERO_STILL - _C2[1])


def hero_pos(t):
    return route(S_HERO_STILL + SPEED * (t - T_STILL))


# --- la colonne : 120 km/h en ligne droite, 45 km/h dans les virages de 15 m (près de 1 g), freinage et reprise
# sur 45 m (près de 1 g aussi) : elle se resserre en accordéon dans les virages et s'étire en sortie.
V_TURN = 12.5
RAMP = 45.0


def col_speed(s):
    """La vitesse de la colonne à l'abscisse s de la route (m/s)."""
    d = min(max(0.0, _S[1] - s, s - _S[2]), max(0.0, _S[3] - s, s - _S[4]))     # au plus proche des virages
    return V_TURN + (SPEED - V_TURN) * M.smoothstep(0.0, RAMP, d)


# (genre, retard sur la berline en m sur la route, à l'image fixe ; voie : 0 à droite, 1 à gauche) ; le
# fourgon en troisième ; les plus lointaines sur la rampe du pont
COLUMN = [("patrol", 22.0, 0), ("patrol", 40.0, 1), ("van", 63.0, 0), ("patrol", 91.0, 1), ("patrol", 109.0, 0),
          ("patrol", 132.0, 1), ("patrol", 160.0, 0), ("patrol", 178.0, 1), ("patrol", 214.0, 0),
          ("patrol", 236.0, 1), ("patrol", 268.0, 0), ("patrol", 296.0, 1), ("patrol", 330.0, 0),
          ("patrol", 358.0, 1), ("patrol", 392.0, 0)]
_DT = 1.0 / 240.0
_TABLES = {}


def _s_table(s0):
    """s(t) d'un véhicule de la colonne, à l'abscisse s0 à l'image fixe : ds/dt = col_speed(s), intégré (pas de
    1/240 s) de -0,25 s à T_END + 0,25 s."""
    n_back, n_fwd = int((T_STILL + 0.25) / _DT) + 1, int((T_END - T_STILL + 0.25) / _DT) + 1
    back, s = [], s0
    for _ in range(n_back):
        s -= col_speed(s) * _DT
        back.append(s)
    fwd, s = [], s0
    for _ in range(n_fwd):
        s += col_speed(s) * _DT
        fwd.append(s)
    return back[::-1] + [s0] + fwd, T_STILL - n_back * _DT


def column_s(i, t):
    _, gap, _ = COLUMN[i]
    if i not in _TABLES:
        _TABLES[i] = _s_table(S_HERO_STILL - gap)
    tab, t0 = _TABLES[i]
    k = (t - t0) / _DT
    k0 = max(0, min(len(tab) - 2, int(math.floor(k))))
    u = k - k0
    return tab[k0] * (1 - u) + tab[k0 + 1] * u


def column_pos(i):
    lane = COLUMN[i][2]
    return lambda t: route(column_s(i, t), 2 * LANE * lane)


# --- les hélicoptères : en formation serrée derrière la berline, qui la suivent ; (dx, dy, z) depuis la jetée
# (la caméra regarde vers -y : -x est à droite de l'image). Découpage v2 : derrière elle et non plus autour,
# pour qu'ils tiennent au-dessus d'elle dans le cadre de face au ras du sol ; à 12, 15 et 20 m (14, 18 et 24 les
# mettaient dans les 12 % du haut, une fois la caméra tournée vers le bas pour remonter la berline)
HELIS = [(-9.0, -20.0, 12.0), (10.0, -30.0, 15.0), (1.0, -50.0, 20.0)]


def heli(i):
    dx, dy, z = HELIS[i]

    def fn(t):
        x, y = hero_pos(t)
        bob = 0.35 * math.sin(2 * math.pi * 0.6 * t + 1.7 * i)
        return x - LANE + dx, y + dy, z + bob, -dx * 1.5, -7.0, 2.0 * math.sin(2 * math.pi * 0.4 * t + i)
    return fn


def beam_target(t):
    """Les faisceaux visent 3 m derrière la berline : venus de derrière elle, visés sur elle, ils posaient leur
    nappe devant, sur l'enrobé entre elle et la caméra (la moitié basse du cadre blanche)."""
    x, y = hero_pos(t)
    return x, y - 3.0, 0.6


# --- la grue du brouillon (variante V1) : 24 mm, dans l'axe de la jetée, tournée vers la ville (-y) ; à
# l'image fixe à 35 m, 65 m devant la berline, 14° de plongée
CAM_X, CAM_Y_STILL = JX + 1.0, Y_HERO_STILL + 65.0
LENS_GRUE = 24.0

# --- la caméra v2 : 0,75 m à gauche de la berline (x = 81,0), 7 m devant elle, 0,55 m de haut, 21 mm, jusqu'à
# l'image 24 ; puis elle s'envole en reculant : 5 m de haut et 13 m devant à l'image 40. Site -4° au sol (le
# découpage disait +8° : la berline tombait à 42 % de la hauteur et la chaussée prenait la moitié du cadre ; la
# règle des plans bas met son centre entre 50 et 62 %, ici 55 %), -14° en haut (-8° la laissait à 39 %, ici 45 %)
LOW_X, LOW_AHEAD, LOW_Z, LOW_SITE = 81.0, 7.0, 0.55, -4.0
HIGH_AHEAD, HIGH_Z, HIGH_SITE = 13.0, 5.0, -14.0
LIFT_FRAME = 24
LENS = 21.0

# --- les avions : de derrière la ville (-y) vers la caméra, très bas (30 et 34 m), de part et d'autre de l'axe de
# la jetée, nez vers +y ; ils grossissent au milieu du cadre, passent au-dessus de la colonne, de la berline et
# de la caméra, et sortent par le haut entre les images 34 et 40 (x, y et z à la dernière image, vitesse en m/s).
# Écartés de 22 et 20 m de l'axe : les hélicoptères, plus bas, sont sur l'axe
JETS = [(JX - 22.0, Y_HERO_STILL + 60.0, 30.0, 185.0), (JX + 20.0, Y_HERO_STILL + 44.0, 34.0, 185.0)]


def jet(i):
    x1, y1, z1, v = JETS[i]

    def fn(t):
        y = y1 - v * (T_END - t)
        z = z1 + 0.01 * (y1 - y)                                   # ils descendent un peu vers la caméra
        bank = (-6.0 if i == 0 else 5.0) + 2.0 * math.sin(3.0 * t + i)
        return x1, y, z, 1.0 - 2.0 * i, -2.8, bank
    return fn


def jet_noise(t, cam=None):
    """Le souffle des avions sur la caméra : il monte quand ils approchent (distance au plus proche)."""
    cx, cy = (cam or camera_path)(t)[:2]
    d = min(math.dist((cx, cy), jet(i)(t)[:2]) for i in range(len(JETS)))
    return M.smoothstep(260.0, 70.0, d)


def camera_path(t):
    """(x, y, z, site) de la caméra v2, sans tremblé : au ras du sol à 7 m devant la berline jusqu'à l'image 24,
    puis l'envol, accéléré puis amorti, jusqu'à 5 m de haut et 13 m devant à l'image 40."""
    hx, hy = hero_pos(t)
    v = M.smoothstep(M.t_of(LIFT_FRAME), T_END, t)
    v = v * v * (2.0 - v)                       # part lentement, accélère, se pose doucement sur la dernière image
    ahead = LOW_AHEAD + (HIGH_AHEAD - LOW_AHEAD) * v
    return LOW_X, hy + ahead, LOW_Z + (HIGH_Z - LOW_Z) * v, LOW_SITE + (HIGH_SITE - LOW_SITE) * v


def camera(t):
    """(x, y, z, lacet, site, roulis, focale) : de face, devant la berline ; le lacet suit la berline (elle roule
    0,75 m à droite de l'objectif, à 7 m : 6° environ) ; tremblé de travelling, secousse au passage des avions."""
    x, y, z, site = camera_path(t)
    hx, hy = hero_pos(t)
    follow = math.degrees(math.atan2(-(hx - x), y - hy))
    n = jet_noise(t)
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.10 + 0.25 * n, rotor=0.03 + 0.4 * n, seed=6.1)
    return x + dx * 0.05, y + dy * 0.05, z + dz * 0.05, follow + dyaw, site + dpitch, droll, LENS


def camera_grue(t):
    """La grue du brouillon : elle monte de 14 à 35 m en reculant (35 m, 14° de plongée à l'image fixe), finit
    sa montée plus lentement ; elle tremble au passage des avions."""
    if t <= T_STILL:
        u = M.smoothstep(-T_STILL, T_STILL, t) * 2.0 - 1.0          # la montée lancée dès la première image
        z = 14.0 + 21.0 * u
        pitch = -6.0 - 8.0 * u
    else:
        v = (t - T_STILL) / (T_END - T_STILL)
        z = 35.0 + 3.0 * v * (2.0 - v)
        pitch = -14.0 - 1.0 * v
    y = CAM_Y_STILL + 18.0 * (t - T_STILL)
    n = jet_noise(t, cam=lambda t_: (CAM_X, CAM_Y_STILL + 18.0 * (t_ - T_STILL)))
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.08 + 0.15 * n, rotor=0.02 + 0.3 * n, seed=6.1)
    return CAM_X + dx * 0.3, y + dy * 0.3, z + dz * 0.3, dyaw, pitch + dpitch, droll, LENS_GRUE


V1_CUT = 22                   # la variante V1 : au ras du sol jusqu'à l'image 22, la grue ensuite


def camera_v1(t):
    """La variante V1 : la caméra v2 au ras du sol (images 1 à 22), puis la grue haute sur toute la colonne (23 à 40)."""
    return camera(t) if t < M.t_of(V1_CUT + 0.5) else camera_grue(t)


def key_camera_v1(cam, frames):
    """Les clés de la variante V1, coupe franche : avec des clés aux seules images entières, la caméra glissait du
    sol à la grue entre 22 et 23 et le flou de bougé (obturateur 0,5) étalait les deux images de la coupe ; deux clés
    de plus en 22,49 (sol, tenue constante) et 22,51 (grue) font le saut hors de la fenêtre de l'obturateur."""
    cut = V1_CUT + 0.5
    M.key_camera(cam, sorted(list(frames) + [cut - 0.01, cut + 0.01]), camera_v1)
    for idb in (cam, cam.data):
        for fc in M.fcurves(idb):
            for k in fc.keyframe_points:
                if abs(k.co.x - (cut - 0.01)) < 1e-3:
                    k.interpolation = "CONSTANT"


def tracks():
    """Les véhicules au sol (pour M.min_gap)."""
    out = {"hero": hero_pos}
    for i, (kind, _, _) in enumerate(COLUMN):
        out[f"{kind}_{i}"] = column_pos(i)
    return out


if __name__ == "__main__":
    for f in (1, 12, STILL_FRAME, 24, 31, 34, 37, 40):
        t = M.t_of(f)
        c = camera(t)
        hx, hy = hero_pos(t)
        print(f"image {f:2d} : berline ({hx:.1f}, {hy:.1f}), caméra {c[1] - hy:4.1f} m devant, z {c[2]:.2f}, "
              f"site {c[4]:+.1f}°, lacet {c[3]:+.1f}° ; avions en y {jet(0)(t)[1] - c[1]:+.0f}, "
              f"{jet(1)(t)[1] - c[1]:+.0f} m de la caméra")
    print("écart minimal au sol :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
    for i in range(len(COLUMN)):
        a, b = route(column_s(i, 0.0)), route(column_s(i, T_END))
        print(f"  {COLUMN[i][0]}_{i} : ({a[0]:.0f}, {a[1]:.0f}) -> ({b[0]:.0f}, {b[1]:.0f})")
    print("souffle des avions :", [round(jet_noise(M.t_of(f)), 2) for f in range(1, FRAMES + 1, 4)])
