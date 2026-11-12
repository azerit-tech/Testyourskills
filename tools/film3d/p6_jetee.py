# Le plan P6 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3 et §2.4, « la jetée ») : la berline
# en tête sur la jetée à 120 km/h, la colonne de gyrophares derrière elle en Z (la rampe du pont, la voie du quai,
# la jetée), trois hélicoptères en formation au-dessus d'elle, faisceaux croisés sur elle ; deux avions de chasse
# qui arrivent du fond, très bas dans l'axe de la jetée, et passent au-dessus de tout (ils ne tirent rien) ; la
# grue qui monte et recule, et tremble au passage des avions. scene_d.py n'en lit que les fonctions du temps ;
# motion.py en tire roues, roulis et tangage.
#
# Repère de l'eau (lieux.py) : la jetée sur x = 80 de y = 100 à 400, la voie du quai en y = 70, le pont sur x = 0
# (il touche le terre-plein en y = 1). La poursuite roule vers +y. t = 0 à la première image ; 40 images à 24 par
# seconde (shared/film/cut.ts), 1,625 s. L'image fixe (STILL_FRAME, 21) garde la pose validée : la berline en
# y = 280 (s = 180 sur la jetée), la grue à 35 m, 65 m devant elle, plongée de 14°.
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


# --- les hélicoptères : en formation au-dessus de la berline, qui la suivent ; (dx, dy, z) depuis la jetée
HELIS = [(-22.0, 12.0, 17.0), (20.0, -6.0, 20.0), (-6.0, -30.0, 24.0)]


def heli(i):
    dx, dy, z = HELIS[i]

    def fn(t):
        x, y = hero_pos(t)
        bob = 0.35 * math.sin(2 * math.pi * 0.6 * t + 1.7 * i)
        return x - LANE + dx, y + dy, z + bob, -dx * 1.5, -7.0, 2.0 * math.sin(2 * math.pi * 0.4 * t + i)
    return fn


def beam_target(t):
    x, y = hero_pos(t)
    return x, y, 0.6


# --- la grue : 24 mm, dans l'axe de la jetée, tournée vers la ville (-y) ; à l'image fixe à 35 m, 65 m devant
# la berline, 14° de plongée (la pose validée)
CAM_X, CAM_Y_STILL = JX + 1.0, Y_HERO_STILL + 65.0
LENS = 24.0

# --- les avions : de derrière la ville (-y) vers la grue, très bas, dans l'axe de la jetée, nez vers +y ; ils
# passent au-dessus de la colonne et finissent au-dessus de la berline, sous les 12 % du haut du cadre
# (x, y et z à la dernière image, vitesse en m/s)
JETS = [(JX - 20.0, Y_HERO_STILL + 12.0, 52.0, 185.0), (JX + 9.0, Y_HERO_STILL - 14.0, 56.0, 185.0)]


def jet(i):
    x1, y1, z1, v = JETS[i]

    def fn(t):
        y = y1 - v * (T_END - t)
        z = z1 + 0.05 * (y1 - y)                                   # ils descendent vers la grue
        bank = (-6.0 if i == 0 else 5.0) + 2.0 * math.sin(3.0 * t + i)
        return x1, y, z, 1.0 - 2.0 * i, -2.8, bank
    return fn


def jet_noise(t):
    """Le souffle des avions sur la grue : il monte quand ils approchent (distance au plus proche)."""
    cy = CAM_Y_STILL + 18.0 * (t - T_STILL)
    d = min(math.dist((CAM_X, cy), jet(i)(t)[:2]) for i in range(len(JETS)))
    return M.smoothstep(260.0, 70.0, d)


def camera(t):
    """(x, y, z, lacet, site, roulis, focale) : la grue monte de 14 à 35 m en reculant (35 m, 14° de plongée à
    l'image fixe), finit sa montée plus lentement ; elle tremble au passage des avions."""
    if t <= T_STILL:
        u = M.smoothstep(-T_STILL, T_STILL, t) * 2.0 - 1.0          # la montée lancée dès la première image
        z = 14.0 + 21.0 * u
        pitch = -6.0 - 8.0 * u
    else:
        v = (t - T_STILL) / (T_END - T_STILL)
        z = 35.0 + 3.0 * v * (2.0 - v)
        pitch = -14.0 - 1.0 * v
    y = CAM_Y_STILL + 18.0 * (t - T_STILL)
    n = jet_noise(t)                    # la dérive lente de la grue, et la vibration (8 à 11 Hz) au passage
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.08 + 0.15 * n, rotor=0.02 + 0.3 * n, seed=6.1)
    return CAM_X + dx * 0.3, y + dy * 0.3, z + dz * 0.3, dyaw, pitch + dpitch, droll, LENS


def tracks():
    """Les véhicules au sol (pour M.min_gap)."""
    out = {"hero": hero_pos}
    for i, (kind, _, _) in enumerate(COLUMN):
        out[f"{kind}_{i}"] = column_pos(i)
    return out


if __name__ == "__main__":
    for f in (1, 11, STILL_FRAME, 31, 40):
        t = M.t_of(f)
        c = camera(t)
        print(f"image {f:2d} : berline ({hero_pos(t)[0]:.1f}, {hero_pos(t)[1]:.1f}), grue y {c[1]:.0f} z {c[2]:.1f} "
              f"site {c[4]:.1f}°, avion 0 en y {jet(0)(t)[1]:.0f}")
    print("écart minimal au sol :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
    for i in range(len(COLUMN)):
        a, b = route(column_s(i, 0.0)), route(column_s(i, T_END))
        print(f"  {COLUMN[i][0]}_{i} : ({a[0]:.0f}, {a[1]:.0f}) -> ({b[0]:.0f}, {b[1]:.0f})")
    print("souffle des avions :", [round(jet_noise(M.t_of(f)), 2) for f in range(1, FRAMES + 1, 4)])
