# Le plan P6 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3 et §2.4, « la jetée ») : la berline
# en tête sur la jetée à 120 km/h, la colonne de gyrophares derrière elle (v2 : en Z sur la rampe du pont, la voie
# du quai et la jetée ; v3.1 : sur la jetée seule), trois hélicoptères en formation au-dessus d'elle, faisceaux croisés sur elle ; deux avions de chasse
# qui arrivent du fond, très bas dans l'axe de la jetée, et passent au-dessus de tout (ils ne tirent rien).
# Découpage v3.1 (docs/cinematique-decoupage-v3.md, P6 et v3.1) : de dos au cadre commun, 7,5 m derrière la
# berline à 2,4 m, puis la caméra monte à la fin à 3,6 m ; trois hélicoptères devant elle, la patrouille 1 qui remonte par la voie de gauche,
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
V31 = True
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


# --- la colonne, v3.1 (une voiture qui roule vrai) : derrière la berline sur la jetée, à sa vitesse, en ligne droite,
# sans accélération ni à-coup. La caméra regarde vers la pointe : la colonne n'entre jamais dans le cadre (seule la
# patrouille 1, qui la double, s'y voit), seules les flaques de lumière des premières rampes sur l'enrobé mouillé y
# arrivent. Les véhicules qui étaient encore dans les virages de 15 m du quai (160 à 390 m derrière : 10 m/s² en
# virage, 17 m/s² en sortie, au-delà des limites v3.1) sont retirés plutôt que freinés hors champ.
# (genre, retard sur la berline en m sur la route ; voie : 0 à droite, 1 à gauche) ; le fourgon en troisième. La
# deuxième est la patrouille 1 (patrol1_pos : son retard n'est pas fixe, ce 40 n'est pas lu)
COLUMN = [("patrol", 22.0, 0), ("patrol", 40.0, 1), ("van", 63.0, 0), ("patrol", 91.0, 1), ("patrol", 109.0, 0),
          ("patrol", 132.0, 1)]


def column_s(i, t):
    """L'abscisse sur la route d'un véhicule de la colonne : la berline moins son retard, à vitesse constante."""
    return S_HERO_START + SPEED * t - COLUMN[i][1]


def column_pos(i):
    if i == 1:
        return patrol1_pos
    lane = COLUMN[i][2]
    return lambda t: route(column_s(i, t), 2 * LANE * lane)


# --- la patrouille 1 (celle d'OUV, toujours à gauche de la berline) : voie de gauche, 1,6 m d'air entre les
# flancs ; elle roule 4 m/s plus vite qu'elle tout le plan (134 km/h, sans à-coup), de 6,5 m derrière (centre à
# centre, son nez au coffre de la berline) à 3,3 m devant. Écart à la fiche (le nez au coffre vers l'image 30) : à
# 24 mm, la caméra 7 à 8 m derrière la berline dans son axe ne voit la voie de gauche qu'à 6 m devant elle au moins
# (22,9° de demi-champ, 2,55 m jusqu'à son flanc) ; son nez entre au bord gauche à l'image 20, la rampe vers 40
P1_GAP0, P1_DV = 6.5, 4.0


def p1_gap(t):
    """Le retard de la patrouille 1 sur la berline (centre à centre, m) ; négatif : elle est devant."""
    return P1_GAP0 - P1_DV * t


def patrol1_pos(t):
    return route(S_HERO_START + SPEED * t - p1_gap(t), 2 * LANE)


# --- les hélicoptères : devant la berline, faisceaux tournés vers l'arrière et le bas, sur elle ; (x monde, y
# devant elle, hauteur) à l'image 1. Plus loin devant que la fiche (+16, +24, +38 m) : à +16 m, le premier sort du
# cadre par la gauche, et la caméra montée reportait les autres vers 85 % de la hauteur ; à +30, +40 et +55 m, 71 à
# 83 %. En x, ils s'étagent à 22, 77 et 58 % de la largeur, à 12 points au moins du phare (46 %), hors du chemin
# des avions à l'écran (à 72 et x 77,5, le premier se confondait avec l'un d'eux), et laissent passer
# les avions à 15 m au moins. Ils descendent de 2 à 2,5 m
# pendant la montée de la caméra (vers la pointe, où FIN en pose un à 8 m)
HELIS = [(73.5, 30.0, 8.0), (92.0, 40.0, 9.5), (86.0, 55.0, 12.0)]
HELI_DROP = [2.0, 2.0, 2.5]


def heli(i):
    x0, ahead, z0 = HELIS[i]

    def fn(t):
        _, y = hero_pos(t)
        bob = 0.35 * math.sin(2 * math.pi * 0.6 * t + 1.7 * i)
        z = z0 - HELI_DROP[i] * M.smoothstep(M.t_of(CRANE_F0 - 10), T_END, t)
        return x0, y + ahead, z + bob, (x0 - JX) * 0.4, -7.0, 2.0 * math.sin(2 * math.pi * 0.4 * t + i)
    return fn


def beam_target(t):
    """Les faisceaux, venus de devant, visent 2 m devant la berline : la tache claire est au-delà d'elle, jamais
    entre elle et l'objectif."""
    x, y = hero_pos(t)
    return x, y + 2.0, 0.6


# --- les avions, l'événement du plan (la fiche) : de derrière la caméra (venus du port), au-dessus d'elle à
# l'image 15 ; ils entrent par le haut du cadre aux images 21 et 20 (au-dessus de 88 % pendant 3 et 5 images,
# AIR_ENTRY au plus : la tolérance de P6 dans test_motion.CAM_LIMITS_PLAN), puis se lisent sous 88 % de l'image
# 25 à la fin : à 84 m de l'objectif à l'image 26 (un sixième de la largeur), ils filent vers la pointe en
# rapetissant ; au-dessus d'elle à l'image 39 (210 m/s), ils s'écartent (cap ±25°) et montent de 6 m au-dessus de
# la mer. (x, z, cap de sortie.) Écarts à la fiche : au-dessus de la caméra à l'image 15 et non 24 : à 24 mm et
# site -8°, un avion à 22 m de haut n'entre dans le cadre que 25 m devant elle et ne passe sous 88 % que 70 m
# devant (à l'image 24, on ne les voyait qu'à 30, et à 26 encore en haut du cadre, flous) ; un peu plus bas et plus
# écartés (x 66 et 95, 22 et 24 m ; x 70 et 90, 24 et 28 m dans la fiche) : à 28 m, le second restait 12 images en
# haut du cadre ; ils passent à 15 m au moins des hélicoptères. scene_d leur retire le flou de bougé : une
# silhouette nette
JETS = [(66.0, 22.0, 25.0), (95.0, 24.0, -25.0)]
JET_V = 210.0
JET_OVER_CAM, JET_TURN = 15, 39
JET_CLIMB = 6.0
AIR_ENTRY = 8


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


# --- la caméra v3.1 (docs/cinematique-decoupage-v3.md, v3.1 A : le cadre de poursuite commun) : de dos, dans l'axe
# de la berline (x 81,75), 24 mm, 7,5 m derrière elle à 2,4 m, son centre à x 50 % et y 57 % depuis le haut ; la
# lanterne du phare au-dessus de son toit, un peu à gauche du centre. Elle tient cette place jusqu'à l'image 30
# (l'image fixe, la coupe depuis P5 à hauteur et distance égales), puis monte seule, à la fin, pour découvrir la
# pointe : 3,6 m et 8,0 m derrière à l'image 60 (la seule grue permise avec FIN). La montée part de l'image 30 en
# douceur (vitesse en demi-cosinus : nulle au départ, 1,9 m/s et 2,4 m/s² au plus) et file encore à la coupe. Le
# site n'est pas écrit à la main : il garde la berline à y 57 % depuis le haut (58 ± 4 ; un point au-dessus de la
# visée tant que P5 sort à 51 %, la coupe v3 tolère 6), puis la laisse glisser à 61 % pendant la montée, ce qui
# ouvre le fond et tient la bascule à 6°/s
CAM_DX = 0.0
CAM_BACK0, CAM_BACK1 = 7.5, 8.0
CAM_Z0, CAM_Z1 = 2.4, 3.6
HERO_V0, HERO_V1 = 0.57, 0.61       # le centre de la berline, depuis le haut du cadre
CRANE_F0 = 30
LENS = 24.0


def ramp_in(t, t0, t1):
    """0 avant t0, 1 à t1 ; vitesse en demi-cosinus : nulle à t0, à son plus haut à t1 (le mouvement continue
    au-delà du plan) ; accélération continue, nulle au départ."""
    if t <= t0:
        return 0.0
    u = (t - t0) / (t1 - t0)
    return u - math.sin(math.pi * u) / math.pi


def crane(t):
    """La part de la montée faite à t (0 jusqu'à l'image CRANE_F0, 1 à la dernière)."""
    return ramp_in(t, M.t_of(CRANE_F0), T_END)


def _site_for(cam, hx, hy, v):
    """Le site qui pose le centre de la boîte de la berline à v (depuis le haut du cadre), par dichotomie."""
    lo, hi = -40.0, 10.0
    for _ in range(40):
        mid = (lo + hi) / 2
        q = M.hero_screen(cam[:4] + (mid,) + cam[5:], hx, hy, 0.0, 0.0)
        if q["v"] < v:          # trop haut dans le cadre : la caméra se relève
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def camera_rail(t):
    """La caméra sans tremblé : (x, y, z, lacet, site, roulis, focale)."""
    hx, hy = hero_pos(t)
    c = crane(t)
    back = CAM_BACK0 + (CAM_BACK1 - CAM_BACK0) * c
    z = CAM_Z0 + (CAM_Z1 - CAM_Z0) * c
    x, y = hx + CAM_DX, hy - back
    # le lacet qui garde la berline au centre du cadre (visée sur elle ; dans l'axe de sa vitesse sur la jetée)
    yaw = math.degrees(math.atan2(-(hx - x), -(hy - y)))
    site = _site_for((x, y, z, yaw, 0.0, 0.0, LENS), hx, hy, HERO_V0 + (HERO_V1 - HERO_V0) * c)
    return x, y, z, yaw, site, 0.0, LENS


def camera(t):
    """La caméra rendue : camera_rail, sans tremblé écrit (v3.1 : le tremblé de motion.handheld faisait à lui seul
    le pire à-coup du film à l'écran ; ne reste que l'opérateur commun de motion.py)."""
    return camera_rail(t)


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
