# Le plan P6 écrit une fois, sans Blender (découpage v3.1, P6 ; SPEC §18.36, la conduite unique) : la berline sort du
# virage du port et file sur la jetée vers la pointe, un cul-de-sac entouré d'eau ; la patrouille 1 remonte par la
# voie de gauche, la colonne suit par ses lumières, trois hélicoptères devant elle, faisceaux sur elle ; deux avions
# arrivent de derrière nous, passent au-dessus de tout et s'écartent au-dessus de la pointe (ils ne tirent rien).
#
# La berline et le bras de la caméra se lisent dans le parcours unique (parcours.py), fenêtre « P6 », posée dans la
# scène D : rien du chemin n'est écrit ici. P5 → P6 n'est plus une coupe d'espace : P6/1 est l'image qui suit P5/60,
# encore dans la sortie du virage (cap, latérale, lacet, glisse et panoramique du bras qui retombent), puis la
# ligne droite de la jetée, où elle accélère. La caméra : le cadre de poursuite commun (2,4 m de haut, 7,5 m
# derrière, 0,3 m à gauche, 24 mm), visé comme les autres plans (ouv_avenue.aim), puis la seule grue permise avec
# FIN : de l'image 30 à la fin, 8,0 m derrière à 3,6 m, pour découvrir la pointe.
#
# Repère : la scène D (scene_d.py), la jetée sur x = 80, la pointe en (80 ; 430). Les autres véhicules roulent sur
# la vraie route du parcours (PC.ROUTE), décalée en travers pour la voie de gauche. t = 0 à la première image.
import math

import motion as M
import ouv_avenue as OUV
import parcours as PC

FRAMES = dict(PC.SHOTS)["P6"]
V3 = True
V31 = True
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = 30
T_STILL = M.t_of(STILL_FRAME)

JX = 80.0                                  # l'axe de la jetée (lieux.JETTY_X)
LANE = 1.75
POINTE_Y = 430.0                           # le centre de la pointe (lieux.POINTE)

HERO = PC.hero("P6")                       # la fenêtre du parcours, en image du plan (1 = la première)
_TO_SCENE, _CAP = PC.placer("P6")


def _f(t):
    return F0 + t * M.FPS


def hero_pos(t):
    """La berline (scène D), t en s depuis la première image ; définie avant elle (les ressorts de M.sample)."""
    return HERO["pos"](_f(t))


def hero_heading(t):
    return HERO["heading"](_f(t))


def hero_steer(t):
    return HERO["steer"](_f(t))


def hero_speed(t):
    return HERO["speed"](_f(t))


def hero_travel(t):
    return HERO["travel"](_f(t))


def brake_windows():
    """Les fenêtres des feux stop (images du plan) : celles du parcours, aucune ici (elle accélère)."""
    return PC.brake_windows("P6")


# ---- la route dans la scène : un point de PC.ROUTE à l'abscisse s, décalé de `lat` vers la gauche

def road(s, lat=0.0):
    x, y, h, _ = PC.ROUTE.at(s)
    h = math.radians(h)
    return _TO_SCENE(x - math.cos(h) * lat, y - math.sin(h) * lat)


def _project(p, s):
    """L'abscisse de la route la plus proche de p (scène), par Newton depuis s."""
    for _ in range(8):
        x, y = road(s)
        h = math.radians(PC.ROUTE.at(s)[2] - _CAP)
        d = (p[0] - x) * -math.sin(h) + (p[1] - y) * math.cos(h)
        s += d
        if abs(d) < 1e-7:
            break
    return s


_S1 = _project(hero_pos(0.0), PC.ROUTE.length - 50.0)
for _k in range(3):                        # le départ de Newton loin du virage, puis on affine
    _S1 = _project(hero_pos(0.0), _S1)


def hero_s(t):
    """L'abscisse de la berline sur la route (m), lue par projection."""
    return _project(hero_pos(t), _S1 + 12.0 * t)


# ---- la meute (v3.1 : des voitures qui roulent vrai), celle de P5 : elle suit la berline à la file, sur son chemin
# et à son allure, avec un retard en secondes (la règle des deux secondes : l'écart se resserre quand elle ralentit) ;
# elle a pris le virage du port comme elle, dans les mêmes limites, et entre sur la jetée derrière elle. La caméra
# regarde vers la pointe : la meute n'entre pas dans le cadre (17 à 50 m derrière la berline), seules les lumières
# de ses rampes y arrivent. La patrouille 1 de P5 s'arrête dans le port : elle ne suit pas.
# (genre, retard en s) : l'état de sortie de la meute de P5, donné par son agent (1,6 / 2,5 / 3,4 s)
COLUMN = [("patrol", 1.6), ("van", 2.5), ("patrol", 3.4)]


def column_pos(i):
    tau = COLUMN[i][1]
    return lambda t: hero_pos(t - tau)


# ---- les hélicoptères : devant la berline, faisceaux tournés vers l'arrière et le bas, sur elle ; (x scène, y devant
# elle, hauteur). À +30, +40 et +55 m, ils s'étagent à 22, 77 et 58 % de la largeur, hors du chemin des avions. Ils
# descendent de 2 à 2,5 m pendant la montée de la caméra (vers la pointe, où FIN en pose un à 8 m). Ce sont leurs
# places (heli_slot) ; leurs trajectoires sont celles de la distribution commune à P5 et P6 (helicos.py) : le 0 est
# l'hélicoptère de P5, qui quitte son stationnaire de P5/60 pour sa place ; 1 et 2 arrivent sur la leur pendant P5.
HELIS = [(73.5, 30.0, 8.0), (92.0, 40.0, 9.5), (86.0, 55.0, 12.0)]
HELI_DROP = [2.0, 2.0, 2.5]


def heli(i):
    """L'appareil i dans la scène D, fn(t) -> (x, y, z, cap, tangage, roulis) (helicos.state, sans l'assiette de
    l'accélération)."""
    import helicos
    return helicos.in_scene("P6", i, dyn=False)


def heli_slot(i):
    """La place de l'appareil i devant la berline, fn(t), t en s depuis P6/1 (négatif admis : P5)."""
    x0, ahead, z0 = HELIS[i]

    def fn(t):
        _, y = hero_pos(t)
        bob = 0.35 * math.sin(2 * math.pi * 0.6 * t + 1.7 * i)
        z = z0 - HELI_DROP[i] * M.smoothstep(M.t_of(CRANE_F0 - 10), T_END, t)
        return x0, y + ahead, z + bob, (x0 - JX) * 0.4, -7.0, 2.0 * math.sin(2 * math.pi * 0.4 * t + i)
    return fn


def beam_target(t):
    """Les faisceaux, venus de devant, visent 2 m devant la berline (le long de sa route) : la tache claire est
    au-delà d'elle, jamais entre elle et l'objectif."""
    x, y = hero_pos(t)
    h = math.radians(hero_travel(t))
    return x - 2.0 * math.sin(h), y + 2.0 * math.cos(h), 0.6


# ---- les avions, l'événement du plan : de derrière la caméra (venus du port), au-dessus d'elle à l'image
# JET_OVER_CAM ; ils entrent par le haut du cadre, filent vers la pointe en rapetissant ; au-dessus d'elle à l'image
# JET_TURN, ils s'écartent (cap ±25°) et montent de 6 m au-dessus de la mer. (x, z, cap de sortie.) La pointe n'est
# plus qu'à 120 m de la caméra (190 avant la conduite unique) : 180 m/s au lieu de 210, le virage à l'image 32.
JETS = [(66.0, 22.0, 25.0), (96.0, 24.0, -25.0)]
JET_V = 180.0
JET_OVER_CAM, JET_TURN = 15, 32
JET_CLIMB = 6.0
AIR_ENTRY = 8


def jet(i):
    x0, z0, cap = JETS[i]
    t_over, t_turn = M.t_of(JET_OVER_CAM), M.t_of(JET_TURN)
    y_over = camera_rail(t_over)[1]

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


# ---- la caméra : le bras du parcours (parcours.camera, son cap filtré sur tout le parcours : il panote encore avec
# la sortie du virage sur les premières images), visé sur la berline (ouv_avenue.aim, x 50 %, y 58 % depuis le
# haut). À partir de l'image CRANE_F0, la grue : 8,0 m derrière à 3,6 m à la dernière image (vitesse en
# demi-cosinus : nulle au départ, à son plus haut à la fin), la berline glisse à 61 % pour ouvrir le fond.
CAM_BACK0, CAM_BACK1 = PC.CAM_BACK, 8.0
CAM_Z0, CAM_Z1 = PC.CAM_Z, 3.6
HERO_V0, HERO_V1 = OUV.CAM_V, OUV.CAM_V + 0.03
CRANE_F0 = 30
LENS = OUV.LENS


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


def _rail(t, du=0.0):
    c = crane(t)
    back = CAM_BACK0 + (CAM_BACK1 - CAM_BACK0) * c
    z = CAM_Z0 + (CAM_Z1 - CAM_Z0) * c
    x, y, _ = PC.camera("P6", _f(t), back=back, z=z)
    hx, hy = hero_pos(t)
    return OUV.aim(x, y, z, hx, hy, OUV.CAM_U + du, HERO_V0 + (HERO_V1 - HERO_V0) * c)


# ---- le raccord de visée avec P5 : à la coupe, la berline glisse à l'écran à la vitesse où P5 la laisse (le centre de
# sa caisse, comme motion.motion_state le mesure : dérivée décentrée sur trois images, vers l'intérieur du plan),
# puis la visée rejoint la sienne en AIM_JOIN images : un écart u(f) = dv · (f − 1) · (1 − w)³, w = (f − 1) / AIM_JOIN,
# nul à la coupe, de pente dv à la coupe, nul, sans pente ni courbure à AIM_JOIN (accélération à l'écran continue)
AIM_JOIN = 24


def _offset(t, dv):
    g = t * M.FPS                       # images depuis la première
    if g >= AIM_JOIN:
        return 0.0
    if g <= 0.0:
        return dv * g                   # avant le plan : la pente de la coupe, prolongée
    return dv * g * (1.0 - g / AIM_JOIN) ** 3


def _screen_speed(plan, spec, f, s):
    """La vitesse en x du centre de la berline à l'écran (% de la largeur par image) à l'image f, telle que la mesure
    de la coupe la prend (motion.motion_state : clés finales, opérateur commun compris)."""
    d = M.plan_data(plan, spec)
    scr = M.screen_track(d, d["final"])
    return M._d1([scr[f + s * k][0] for k in range(3)], s, 1.0)


_DV = []


def aim_dv():
    """La pente du raccord (fraction de la largeur par image) : celle qui donne à P6/1 la vitesse à l'écran de P5 à
    sa dernière image, lue par la mesure de la coupe (deux essais : sans raccord, puis une sécante ; l'opérateur
    commun ne rend pas la pente un pour un). Calculée une fois."""
    if not _DV:
        import p5_virage as P5
        specs = M.shot_specs()
        target = _screen_speed("P5", specs["P5"], P5.F0 + P5.FRAMES - 1, -1)

        def entry(dv):
            cam = lambda t: _rail(t, _offset(t, dv))       # noqa: E731
            return _screen_speed("P6", dict(specs["P6"], cam=cam, rail=cam), F0, +1)
        a0 = entry(0.0)
        dv1 = (target - a0) / 100.0
        a1 = entry(dv1)
        _DV.append(dv1 if abs(a1 - a0) < 1e-9 else dv1 * (target - a0) / (a1 - a0))
    return _DV[0]


def aim_offset(t):
    """L'écart de visée en x (fraction de la largeur) à t : le raccord avec P5, nul après AIM_JOIN images (sans lire
    la mesure, que la fin du plan sert aussi au plan suivant)."""
    if t * M.FPS >= AIM_JOIN:
        return 0.0
    return _offset(t, aim_dv())


def camera_rail(t):
    """La caméra sans tremblé : (x, y, z, lacet, site, roulis, focale)."""
    return _rail(t, aim_offset(t))


def camera(t):
    """La caméra rendue : camera_rail, sans tremblé écrit (ne reste que l'opérateur commun de motion.py)."""
    return camera_rail(t)


# ---- ce que la berline traverse : des flaques étroites sur la ligne de ses roues (scene_d.p6_foreground, fx.py) ;
# elle les passe à ces images, roue gauche puis droite en alternance
PUDDLE_FRAMES = (16, 21, 28, 33, 40, 46)


def puddles():
    """[(x, y, demi-largeur, allongement)] : le centre de la flaque sous la roue, à l'image où elle la passe."""
    out = []
    for k, f in enumerate(PUDDLE_FRAMES):
        t = M.t_of(f)
        x, y = hero_pos(t)
        h = math.radians(hero_travel(t))
        side = 0.75 if k % 2 == 0 else -0.75        # à droite, à gauche
        out.append((x + side * math.cos(h), y + side * math.sin(h), (0.20, 0.17, 0.22, 0.18, 0.20, 0.19)[k],
                    (4.0, 5.0, 3.5, 4.5, 4.0, 4.0)[k]))
    return out


def tracks():
    """Les véhicules au sol (pour M.min_gap)."""
    out = {"hero": hero_pos}
    for i, (kind, _) in enumerate(COLUMN):
        out[f"{kind}_{i}"] = column_pos(i)
    return out


def aircraft():
    """Les aéronefs, {nom: pos(t)} (pour les contrôles du haut du cadre de motion.py)."""
    out = {f"heli_{i}": heli(i) for i in range(len(HELIS))}
    out.update({f"jet_{i}": jet(i) for i in range(len(JETS))})
    return out


def state_out(f=None):
    """L'état de la meute à l'image f (la dernière par défaut) : position, retard le long de la route, vitesse."""
    f = F0 + FRAMES - 1 if f is None else f
    t = M.t_of(f)
    out = {}
    for i, (kind, _) in enumerate(COLUMN):
        p = column_pos(i)
        (vx, vy), _ = M.kinematics(p, t)
        out[f"{kind}_{i}"] = dict(pos=p(t), gap=hero_s(t) - _project(p(t), hero_s(t)), speed=math.hypot(vx, vy))
    return out


if __name__ == "__main__":
    for f in (1, 10, 20, 24, 30, 34, 44, 52, 60):
        t = M.t_of(f)
        c = camera_rail(t)
        hx, hy = hero_pos(t)
        print(f"image {f:2d} : berline ({hx:.2f}, {hy:.2f}) {hero_speed(t):5.2f} m/s, caméra "
              f"{math.dist(c[:2], (hx, hy)):4.2f} m, z {c[2]:.2f}, site {c[4]:+.1f}°, lacet {c[3]:+.1f}° ; "
              f"avions en y {jet(0)(t)[1]:.0f}, {jet(1)(t)[1]:.0f}")
    print("écart minimal au sol :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
    for f in (F0, F0 + FRAMES - 1):
        for k, v in state_out(f).items():
            print(f"{k} à l'image {f} : ({v['pos'][0]:.2f}, {v['pos'][1]:.2f}), {v['gap']:+.1f} m derrière, "
                  f"{v['speed']:.2f} m/s")
