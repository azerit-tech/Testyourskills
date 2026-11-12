# Le plan P6 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3 et §2.4, « la jetée ») : la berline
# en tête sur la jetée à 120 km/h, la colonne de gyrophares derrière elle en Z (la rampe du pont, la voie du quai,
# la jetée), trois hélicoptères en formation au-dessus d'elle, faisceaux croisés sur elle ; deux avions de chasse
# qui arrivent du fond, très bas dans l'axe de la jetée, et passent au-dessus de tout (ils ne tirent rien).
# Découpage v3 (docs/cinematique-decoupage-v3.md, P6) : de dos, la caméra roule 7 m derrière la berline à 1,6 m,
# puis monte lentement à 3,6 m ; trois hélicoptères devant elle, la patrouille 1 qui remonte par la voie de gauche,
# deux avions qui arrivent de derrière nous, passent au-dessus de tout et s'écartent au-dessus de la pointe.
# scene_d.py n'en lit que les fonctions du temps ; motion.py en tire roues, roulis et tangage.
#
# Repère de l'eau (lieux.py) : la jetée sur x = 80 de y = 100 à 400, la voie du quai en y = 70, le pont sur x = 0
# (il touche le terre-plein en y = 1). La poursuite roule vers +y. t = 0 à la première image ; 60 images à 24 par
# seconde (shared/film/cut.ts), 2,46 s : la berline de y = 240 à 322. L'image fixe (STILL_FRAME) est au milieu.
import math

import motion as M

FRAMES = 60
V3 = True
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = 30
T_STILL = M.t_of(STILL_FRAME)

JX, JY0, QUAY_Y = 80.0, 100.0, 70.0        # lieux.JETTY_X, lieux.JETTY_YS[0], lieux.QUAY_Y
LANE = 1.75
SPEED = 120 / 3.6                          # la berline, et la colonne en ligne droite
Y_HERO_START = 240.0
Y_HERO_STILL = Y_HERO_START + SPEED * T_STILL

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


S_HERO_START = _S[4] + (Y_HERO_START - _C2[1])
S_HERO_STILL = S_HERO_START + SPEED * T_STILL


def hero_pos(t):
    return route(S_HERO_START + SPEED * t)


# --- la colonne : 120 km/h en ligne droite, 45 km/h dans les virages de 15 m (près de 1 g), freinage et reprise
# sur 45 m (près de 1 g aussi) : elle se resserre en accordéon dans les virages et s'étire en sortie.
V_TURN = 12.5
RAMP = 45.0


def col_speed(s):
    """La vitesse de la colonne à l'abscisse s de la route (m/s)."""
    d = min(max(0.0, _S[1] - s, s - _S[2]), max(0.0, _S[3] - s, s - _S[4]))     # au plus proche des virages
    return V_TURN + (SPEED - V_TURN) * M.smoothstep(0.0, RAMP, d)


# (genre, retard sur la berline en m sur la route, à l'image fixe ; voie : 0 à droite, 1 à gauche) ; le
# fourgon en troisième ; les plus lointaines sur la rampe du pont. La deuxième est la patrouille 1 (patrol1_pos :
# son retard n'est pas fixe, ce 40 n'est pas lu)
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
    if i == 1:
        return patrol1_pos
    lane = COLUMN[i][2]
    return lambda t: route(column_s(i, t), 2 * LANE * lane)


# --- la patrouille 1 (celle d'OUV, toujours à gauche de la berline) : voie de gauche, de 14 m derrière elle à
# l'image 1 à 6 m à l'image 30 (rampe en cosinus : 8 m/s de plus qu'elle au plus), puis tenue ; au bord gauche du
# cadre à partir de l'image 20, rampe en amorce
P1_GAP0, P1_GAP1, P1_FRAME = 14.0, 6.0, 30


def p1_gap(t):
    u = M.smoothstep(0.0, M.t_of(P1_FRAME), t)
    return P1_GAP0 + (P1_GAP1 - P1_GAP0) * u


def patrol1_pos(t):
    return route(S_HERO_START + SPEED * t - p1_gap(t), 2 * LANE)


# --- les hélicoptères : devant la berline, faisceaux tournés vers l'arrière et le bas, sur elle ; (x monde, y
# devant elle, hauteur) à l'image 1. Plus loin devant que la fiche (+16, +24, +38 m) : à +16 m, le premier sort du
# cadre par la gauche, et la caméra montée reportait les autres vers 85 % de la hauteur ; à +30, +40 et +55 m, 71 à
# 83 %. En x, ils s'étagent dans le cadre (14, 35 et 56 % de la largeur : la caméra regarde à droite de l'axe de la
# jetée). Ils descendent de 2 à 2,5 m pendant la montée de la caméra (vers la pointe, où FIN en pose un à 8 m)
HELIS = [(77.5, 30.0, 8.0), (92.0, 40.0, 9.5), (85.0, 55.0, 12.0)]
HELI_DROP = [2.0, 2.0, 2.5]


def heli(i):
    x0, ahead, z0 = HELIS[i]

    def fn(t):
        _, y = hero_pos(t)
        bob = 0.35 * math.sin(2 * math.pi * 0.6 * t + 1.7 * i)
        z = z0 - HELI_DROP[i] * M.smoothstep(M.t_of(CRANE_F0), T_END, t)
        return x0, y + ahead, z + bob, (x0 - JX) * 0.4, -7.0, 2.0 * math.sin(2 * math.pi * 0.4 * t + i)
    return fn


def beam_target(t):
    """Les faisceaux, venus de devant, visent 2 m devant la berline : la tache claire est au-delà d'elle, jamais
    entre elle et l'objectif."""
    x, y = hero_pos(t)
    return x, y + 2.0, 0.6


# --- les avions : de derrière la caméra (venus du port), au-dessus de la caméra vers l'image 24, au-dessus de la
# pointe vers 44 (210 m/s) ; puis ils s'écartent (cap ±25°) et montent de 6 m au-dessus de la mer. (x, z, cap de
# sortie.) Écart à la fiche (24 et 28 m, x 70 et 90, « entrent par le haut du cadre ») : par le haut, ils passaient
# à 120-140 % de la hauteur, et rien ne doit dépasser 88 % ; plus bas et plus écartés, ils rasent l'eau de part et
# d'autre de la jetée et entrent par les bords, le droit à l'image 30 (85 %), le gauche à 36 (85 %)
JETS = [(64.75, 20.0, 25.0), (106.75, 14.0, -25.0)]
JET_V = 210.0
JET_OVER_CAM, JET_TURN = 24, 44
JET_CLIMB = 6.0


def jet(i):
    x0, z0, cap = JETS[i]
    t_over, t_turn = M.t_of(JET_OVER_CAM), M.t_of(JET_TURN)
    y_over = hero_pos(t_over)[1] - CAM_BACK0

    def fn(t):
        y = y_over + JET_V * (min(t, t_turn) - t_over)
        x, h = x0, 0.0
        if t > t_turn:
            n = 24
            for k in range(n):                     # le virage, intégré : cap de 0 à ±25° en 0,4 s
                tk = t_turn + (t - t_turn) * (k + 0.5) / n
                hk = cap * M.smoothstep(t_turn, t_turn + 0.4, tk)
                x -= JET_V * math.sin(math.radians(hk)) * (t - t_turn) / n
                y += JET_V * math.cos(math.radians(hk)) * (t - t_turn) / n
            h = cap * M.smoothstep(t_turn, t_turn + 0.4, t)
        climb = M.smoothstep(t_turn, T_END + 0.3, t)
        z = z0 + JET_CLIMB * climb
        bank = -1.2 * h + 2.0 * math.sin(3.0 * t + i)
        return x, y, z, h, -2.0 + 6.0 * (climb > 0) * (1.0 - climb), bank
    return fn


# --- la caméra v3 : de dos, sur sa voie, 1,0 m à gauche de la berline (x 80,75), 24 mm. Image 1 : 7,0 m derrière,
# 1,6 m (au ras du toit : le phare reste au-dessus de lui), site -8°. Puis la grue lente : 3,6 m et 8,0 m derrière à
# l'image 60, site -21°. Écarts à la fiche (grue de 28 à 60, site -16°) : 2 m de grue en 32 images demandent
# 4,5 m/s² au moins (plafond 3) ; la grue part donc à l'image 10 (rampe en cosinus sur 50 images : 2,0 m/s et
# 3,0 m/s² au plus), le recul de 1 m avec elle (1,0 m/s). Le site va de -8° à -21° sur tout le plan, en trapèze
# (6,6°/s au plus, fiche 7) : à -16° la caméra montée laissait la berline à 58 % de la hauteur depuis le haut,
# ici 53 % puis 52 % (fiche 52 puis 50). Le phare (75 ; 458,3) tombe à x 22-30 %, y 64 % depuis le bas à l'image 1 :
# la caméra 1 m à gauche de la berline ne le met pas au-dessus de son toit (il y faudrait x 82)
CAM_DX = -1.0
CAM_BACK0, CAM_BACK1 = 7.0, 8.0
CAM_Z0, CAM_Z1 = 1.6, 3.6
SITE0, SITE1 = -8.0, -21.0
YAW_TRIM = 3.0                      # (visée sur son centre, sa boîte tombait à 57 % : on la voit de trois quarts)
CRANE_F0 = 10
LENS = 24.0
SHAKE_BASE = 0.12                   # degrés, à 24 mm
SHAKE_JETS = 0.30                   # au passage des avions, images 26 à 34


def ramp_cos(t, t0, t1):
    """0 avant t0, 1 après t1 ; vitesse en cosinus surélevé (nulle aux deux bouts, accélération continue)."""
    if t <= t0:
        return 0.0
    if t >= t1:
        return 1.0
    u = (t - t0) / (t1 - t0)
    return u - math.sin(2 * math.pi * u) / (2 * math.pi)


def ease_trap(t, t0, t1, r):
    """0 avant t0, 1 après t1 ; vitesse en trapèze aux rampes en cosinus de r secondes : le mouvement le plus
    lent qui tienne dans [t0, t1] avec des départs et des arrivées amortis."""
    T = t1 - t0
    tau = min(max(t - t0, 0.0), T)

    def up(x):
        return x / 2.0 - r / (2 * math.pi) * math.sin(math.pi * x / r)
    if tau < r:
        pos = up(tau)
    elif tau <= T - r:
        pos = r / 2.0 + tau - r
    else:
        pos = (T - r) - up(T - tau)
    return pos / (T - r)


def camera_rail(t):
    """La caméra sans tremblé : (x, y, z, lacet, site, roulis, focale)."""
    hx, hy = hero_pos(t)
    c = ramp_cos(t, M.t_of(CRANE_F0), T_END)
    back = CAM_BACK0 + (CAM_BACK1 - CAM_BACK0) * c
    z = CAM_Z0 + (CAM_Z1 - CAM_Z0) * c
    x, y = hx + CAM_DX, hy - back
    site = SITE0 + (SITE1 - SITE0) * ease_trap(t, 0.0, T_END, 0.5)
    # le lacet qui garde la boîte de la berline au centre du cadre (visée sur elle, plus YAW_TRIM)
    yaw = math.degrees(math.atan2(-(hx - x), -(hy - y))) + YAW_TRIM
    return x, y, z, yaw, site, 0.0, LENS


def jet_noise(t):
    """Le souffle des avions : une bosse sur les images 26 à 34 (0 à 1)."""
    return M.smoothstep(M.t_of(24), M.t_of(28), t) * (1.0 - M.smoothstep(M.t_of(32), M.t_of(36), t))


def camera(t):
    """La caméra rendue : camera_rail plus le tremblé (0,12°, 0,3° au passage des avions)."""
    x, y, z, yaw, site, roll, lens = camera_rail(t)
    n = jet_noise(t)
    amp = SHAKE_BASE + (SHAKE_JETS - SHAKE_BASE) * n
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=amp, rotor=0.02 + 0.15 * n, seed=6.1)
    return x + dx * 0.3, y + dy * 0.3, z + dz * 0.3, yaw + dyaw, site + dpitch, roll + droll, lens


def tracks():
    """Les véhicules au sol (pour M.min_gap)."""
    out = {"hero": hero_pos}
    for i, (kind, _, _) in enumerate(COLUMN):
        out[f"{kind}_{i}"] = column_pos(i)
    return out


def aircraft():
    """Les aéronefs, {nom: pos(t)} (pour les contrôles du haut du cadre de motion.py)."""
    out = {f"heli_{i}": heli(i) for i in range(len(HELIS))}
    out.update({f"jet_{i}": jet(i) for i in range(len(JETS))})
    return out



if __name__ == "__main__":
    for f in (1, 10, 20, 24, 30, 34, 44, 52, 60):
        t = M.t_of(f)
        c = camera_rail(t)
        hx, hy = hero_pos(t)
        print(f"image {f:2d} : berline ({hx:.1f}, {hy:.1f}), caméra {hy - c[1]:4.1f} m derrière, z {c[2]:.2f}, "
              f"site {c[4]:+.1f}°, lacet {c[3]:+.1f}° ; patrouille 1 {hy - patrol1_pos(t)[1]:.1f} m derrière ; "
              f"avions en y {jet(0)(t)[1] - c[1]:+.0f}, {jet(1)(t)[1] - c[1]:+.0f} m de la caméra")
    print("écart minimal au sol :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
