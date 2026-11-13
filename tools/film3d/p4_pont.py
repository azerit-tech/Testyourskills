# Le plan P4 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.4, « le pont ») : la berline qui
# descend la rampe vers la caméra, derrière elle la meute étagée par la rampe jusqu'à la crête ; le fourgon, un peu
# plus vite qu'elle, qui force vers le milieu ; la caméra posée au pied, 200 mm, zoom avant lent, sans tremblé écrit
# (v3.1 : seul l'opérateur commun de motion.py). scene_c.py n'en lit que les fonctions du temps ; motion.py en tire
# roues, braquage et transfert de masse.
#
# Repère du pont (scene_c.py), qui est celui de la ville : l'axe x = 0, la poursuite roule vers +y (cap 0), la crête
# en y = -130, le pied de la rampe en y = -5. t = 0 à la première image, 24 images par seconde.
#
# Dans la ville (FILM3D_VILLE, « 1 » par défaut ; docs/cinematique-plan-de-ville.md §2.5, « Pont ») : la berline se
# lit dans le parcours unique (parcours.py, fenêtre « P4 », ancrée au pied de la rampe, voie x 1,80 : le tablier
# ouvert de part et d'autre) ; P4/49 est P5/1, la coupe vers P5 n'est qu'un changement de caméra. La caméra, sur le
# terre-plein du port, devant ses séparateurs : (1,20 ; 31,60 ; 1,2), 163 mm. « 0 » : le plan autonome d'avant,
# inchangé (33,3 m/s, caméra en y 10, 200 mm).
import math
import os

import motion as M

VILLE = os.environ.get("FILM3D_VILLE", "1").strip().lower() not in ("0", "non", "no", "false", "off")  # lieux.ville_on
V3 = True
V31 = True
F0 = 1
Y_REF = 45.0                  # l'ancienne caméra (brouillon) : les trajectoires d'avant restent comptées d'elle
Y_CREST = -130.0
SITE_AIM = (0.545, 0.545)     # le centre de la berline à 54,5 % de la hauteur depuis le haut (52 à 56)
PORT_FRAMES = (34, 42)        # la lumière ambre du port monte sur sa calandre (lumière v3.1, P4 : images 36 à 48)
ZOOM = 0.06                   # le zoom avant : 200 mm à l'image 1, 212 mm à la dernière (rampes de 10 images)
BAR_H = 1.7                   # la rampe d'une patrouille au-dessus du tablier


def ease_trap(t, t0, t1, r):
    """0 avant t0, 1 après t1 ; vitesse en trapèze aux rampes en cosinus de r secondes."""
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


def deck_z(y):
    """Le tablier (scene_c.deck_z, recopié et interpolé par motion._bridge_z)."""
    return M._bridge_z(y)


def bar_visible(y, h=BAR_H):
    """La rampe d'un véhicule en y (à h m au-dessus du tablier) se voit-elle de l'objectif, par-dessus la crête ?"""
    if y >= Y_CREST:
        return True
    zc = deck_z(Y_CREST)
    sight = CAM[2] + (zc - CAM[2]) * (CAM[1] - y) / (CAM[1] - Y_CREST)
    return deck_z(y) + h > sight


if VILLE:
    import parcours as PC

    FRAMES = dict(PC.SHOTS)["P4"]
    T_END = (FRAMES - 1) / M.FPS
    HERO = PC.hero("P4")

    def _f(t):
        return F0 + t * M.FPS

    def hero_pos(t):
        """La berline (scène C = ville), t en s depuis la première image ; définie avant elle (ressorts de M.sample)."""
        return HERO["pos"](_f(t))

    def hero_heading(t):
        return HERO["heading"](_f(t))

    def hero_speed(t):
        return HERO["speed"](_f(t))

    def brake_windows():
        """Les feux stop (images du plan) : ceux du parcours, l'entrée du virage du port."""
        return PC.brake_windows("P4")

    HERO_X = hero_pos(0.0)[0]
    _END = hero_pos(T_END)
    # la caméra (porte 2 du plan de ville, section 7) : devant les séparateurs du port (y 34,3 de la ville), rien à
    # retirer ; 0,6 m à gauche de la voie de la berline, CAM_AHEAD m devant sa dernière image, à 163 mm : la berline
    # garde à la dernière image la taille qu'elle avait au 212 mm à 45,7 m
    CAM_AHEAD, LENS = 37.29, 163.0
    CAM = (HERO_X - 0.6, _END[1] + CAM_AHEAD, 1.2)
    STILL_FRAME = 24
    T_STILL = M.t_of(STILL_FRAME)
    SPEED = hero_speed(0.0)
    LAG = (0.3, 0.012, 1.5)   # s : chacune reprend la conduite de la berline en retard, 0,3 s plus 0,012 s par
                              # mètre de distance (1,5 s au plus) : chacune à son rythme, la plus loin plus tard
    SURGE = 0.22              # m : elle se jette et lâche de 0,22 m (1 m/s² au plus, en plus de l'accélération de la
                              # berline, 2,8 : le plafond des patrouilles est 4)

    # La meute (« le nombre qui écrase »), sur toute la largeur du tablier au début. Chacune suit la conduite de la
    # berline, en retard selon sa distance (LAG), à sa distance, avec ses louvoiements de 3 à 3,6 s et 0,4 m (v3.1).
    # Quatre et le fourgon déjà sur la descente à l'image 1 (la crête est à 86 m derrière la berline) ; quatre de
    # plus, 3 m/s plus vite, passent la crête : leur rampe se découvre aux images CREST_FRAMES. P4 → P5 est continu
    # (P4/49 = P5/1) : la patrouille 1 roule devant la berline, à sa gauche (en amorce au bord droit du cadre, qu'elle
    # quitte seule), et freine pour s'arrêter tout droit au port ; derrière la berline, deux patrouilles et le fourgon
    # se resserrent à la file dans sa voie, à FILE_S secondes d'elle à P5/1 (ce que la caméra de P5 attend).
    # (genre, x au début, x à la fin, retard, vitesse en plus en m/s, louvoiement en m, sa période en s, phase) ;
    # retard : en m derrière la berline à t = 0, None (déduit de CREST_FRAMES) ou ("file", s) (à la file à P5/1)
    CREST_FRAMES = (8, 18, 28, 38)
    FILE_S = (1.6, 2.5, 3.4)
    T49 = M.t_of(F0 + FRAMES)           # P5/1
    PACK = [("patrol", None, None, None, 0.0, 0.0, 3.0, 0.3),                # la patrouille 1 : patrol1_pos
            ("patrol", 4.6, HERO_X, ("file", FILE_S[0]), 0.0, 0.35, 3.4, 6.0),
            ("patrol", -2.6, HERO_X, ("file", FILE_S[1]), 0.0, 0.40, 3.2, 4.0),
            ("patrol", -5.0, -4.6, 54.0, 0.0, 0.40, 3.6, 4.25),
            ("patrol", 4.4, 4.6, 78.0, 0.0, 0.35, 3.1, 5.0),
            ("patrol", 4.4, 4.4, None, 3.0, 0.40, 3.3, 2.6),          # sa rampe passe la crête à l'image 8
            ("patrol", -4.6, -4.6, None, 3.0, 0.40, 3.5, 0.8),        # 18
            ("patrol", 1.0, 1.0, None, 3.0, 0.35, 3.0, 3.3),          # 28
            ("patrol", -1.6, -1.6, None, 3.0, 0.40, 3.2, 4.4)]        # 38
    VAN = ("van", 5.6, HERO_X, ("file", FILE_S[2]), 0.0, 0.3, 3.3, 1.7)   # le fourgon ferme la file

    # la patrouille 1 : P1_SIDE m à gauche de la berline, P1_LEAD m devant elle à P5/1, à P1_V m/s, en freinage
    # établi de P1_BRAKE m/s² ; avant son freinage, elle roule comme la berline (même vitesse, avance constante), puis
    # passe de l'accélération de la berline à -P1_BRAKE à l'à-coup constant P1_JERK
    P1_SIDE, P1_LEAD, P1_V, P1_BRAKE, P1_JERK = 3.1, 7.0, 17.6, 6.4, 10.0

    def _hero_acc(t):
        h = 1.0 / 240.0
        return (hero_speed(t + h) - hero_speed(t - h)) / (2 * h)

    def _p1_acc(t, t1, a1):
        """Son accélération à t, freinage commencé à t1 (où elle accélérait de a1)."""
        tau = (P1_BRAKE + a1) / P1_JERK
        return a1 + (-P1_BRAKE - a1) * min(1.0, max(0.0, t - t1) / tau)

    def _p1_tables():
        """Le début de son freinage t1 (sa vitesse à P5/1 vaut P1_V) et ses tables (t, v, s) jusqu'à P5/1."""
        def run(t1):
            n = max(1, math.ceil((T49 - t1) * 240.0))
            h = (T49 - t1) / n
            t, v, s_, out = t1, hero_speed(t1), 0.0, [(t1, hero_speed(t1), 0.0)]
            ah = _hero_acc(t1)
            for _ in range(n):
                a0, a1 = _p1_acc(t, t1, ah), _p1_acc(t + h, t1, ah)
                v1 = v + 0.5 * (a0 + a1) * h
                s_ += 0.5 * (v + v1) * h
                t, v = t + h, v1
                out.append((t, v, s_))
            return out
        lo, hi = T49 - 3.0, T49 - 0.75
        for _ in range(50):
            mid = (lo + hi) / 2
            if run(mid)[-1][1] > P1_V:
                hi = mid          # trop vite à la fin : freiner plus tôt
            else:
                lo = mid
        t1 = (lo + hi) / 2
        return t1, run(t1)

    P1_T1, _P1_TAB = _p1_tables()
    _P1_Y1 = hero_pos(T49)[1] + P1_LEAD - _P1_TAB[-1][2]       # sa place au début de son freinage

    def patrol1_pos(t):
        hx, hy = hero_pos(t)
        x = hx - P1_SIDE
        if t <= P1_T1:
            return x, hy - hero_pos(P1_T1)[1] + _P1_Y1
        if t >= T49:
            # au-delà de P5/1 (les ressorts de M.sample) : son freinage tenu
            dt = t - T49
            return x, _P1_Y1 + _P1_TAB[-1][2] + _P1_TAB[-1][1] * dt - 0.5 * P1_BRAKE * dt * dt
        k = min(len(_P1_TAB) - 2, int((t - P1_T1) / (T49 - P1_T1) * (len(_P1_TAB) - 1)))
        (ta, _, sa), (tb, _, sb) = _P1_TAB[k], _P1_TAB[k + 1]
        return x, _P1_Y1 + sa + (sb - sa) * (t - ta) / (tb - ta)

    def _follow(gap, dv, t):
        """y d'un véhicule qui suit la conduite de la berline en retard (LAG), `gap` m derrière elle à t = 0, dv
        m/s plus vite."""
        lag = min(LAG[2], LAG[0] + LAG[1] * gap)
        y0 = hero_pos(0.0)[1]
        return hero_pos(t - lag)[1] + (y0 - hero_pos(-lag)[1]) - gap + dv * t

    def _pack_fn(x0, x1, gap, dv, amp, per, ph):
        if isinstance(gap, tuple):
            # à la file : la distance à P5/1 vaut s secondes à la vitesse de la berline à P5/1
            want = gap[1] * hero_speed(T49)
            g = want
            for _ in range(30):   # le retard dépend de la distance (LAG) : point fixe
                surge = SURGE * math.sin(2 * math.pi * T49 / per + ph)
                g = want - (hero_pos(T49)[1] - (_follow(g, dv, T49) + g + surge))
            gap = g

        def fn(t):
            w = 2.0 * math.pi * t / per + ph
            # à la file, rangée dans la voie de la berline à la dernière image, sans louvoiement ; sinon un glissement
            # commencé avant le plan, fini après
            u = M.smoothstep(-0.5, T_END if x1 == HERO_X else T_END + 0.5, t)
            y = _follow(gap, dv, t) + SURGE * math.sin(w)                  # elle se jette, elle lâche
            sway = amp * math.sin(1.25 * w + 0.7 * ph) * (1.0 - u if x1 == HERO_X else 1.0)
            return x0 + (x1 - x0) * u + sway, y
        return fn

    def _first_seen(fn):
        """La première image où la rampe de fn passe au-dessus de la crête (None si jamais dans le plan)."""
        for f in range(F0, F0 + FRAMES):
            if bar_visible(fn(M.t_of(f))[1]):
                return f
        return None

    def _solve_gap(entry, frame):
        """Le retard de départ qui découvre la rampe entre l'image frame - 1 et l'image frame (bissection)."""
        _, x0, x1, _, dv, amp, per, ph = entry
        lo, hi = 60.0, 200.0
        for _ in range(60):
            mid = (lo + hi) / 2
            f = _first_seen(_pack_fn(x0, x1, mid, dv, amp, per, ph))
            if f is not None and f < frame:
                lo = mid          # vue trop tôt : plus loin
            else:
                hi = mid
        return (lo + hi) / 2

    for _k, _fr in zip(range(len(PACK) - len(CREST_FRAMES), len(PACK)), CREST_FRAMES):
        PACK[_k] = PACK[_k][:3] + (round(_solve_gap(PACK[_k], _fr) + 0.3, 2),) + PACK[_k][4:]

    def pack_pos(i):
        if i == 0:
            return patrol1_pos
        return _pack_fn(*PACK[i][1:])

    van_pos = _pack_fn(*VAN[1:])

else:
    FRAMES = 48
    T_END = (FRAMES - 1) / M.FPS
    # découpage v3 (docs/cinematique-decoupage-v3.md, P4) : fixe, 17 m plus près que la v2, dans l'axe de la berline
    CAM = (1.2, 10.0, 1.2)
    LENS = 200.0
    SPEED = 120 / 3.6             # 33,3 m/s
    D0 = 146.0                    # la berline en y -101 à l'image 1 (111 m de l'objectif), en y -35,7 à l'image 48
    HERO_X = 1.8
    STILL_FRAME = 24
    T_STILL = M.t_of(STILL_FRAME)

    # La meute, désordonnée et pas en bloc (« le nombre qui écrase ») : chacun à son rythme, qui louvoie, se jette en
    # avant puis lâche un peu. v3.1 (une voiture qui roule vrai) : des louvoiements de 3 à 3,6 s et de 0,4 m au plus
    # (au plus 2,9 m/s² en travers, 2,3 en long et 9 m/s³ d'à-coup ; avant, 1,4 à 2,6 s : jusqu'à 14 m/s² et 87
    # m/s³), des glissements commencés avant le plan (pas de départ sec à l'image 1). Découpage v3 : les six premiers
    # (cinq patrouilles et le fourgon) déjà sur la rampe à l'image 1, entre 26 et 43 m derrière elle (au-delà de
    # 44 m, la crête cache leurs rampes : six rampes au début) ; la patrouille 1 en tête, à gauche de la berline (à
    # droite de l'écran). Quatre de plus, plus rapides, passent la crête l'une après l'autre : leur rampe se
    # découvre aux images 8, 18, 28 et 38 (dix rampes à la fin).
    # (genre, x, retard sur la berline à t = 0 en m, vitesse en plus en m/s, louvoiement en m, sa période en s,
    # phase, glissement latéral sur le plan en m)
    PACK = [("patrol", -1.8, 26.0, 0.0, 0.40, 3.0, 0.3, 0.0),         # la patrouille 1
            ("patrol", 4.6, 30.0, 0.0, 0.35, 3.4, 6.0, -0.5),
            ("patrol", -5.2, 34.0, 0.0, 0.40, 3.2, 4.0, 0.0),
            ("patrol", 0.8, 36.5, 0.0, 0.40, 3.6, 4.25, 0.0),
            ("patrol", -3.6, 42.5, 0.0, 0.35, 3.1, 5.0, 0.0),
            ("patrol", 4.4, 57.6, 3.0, 0.40, 3.3, 2.6, 0.0),         # sa rampe passe la crête à l'image 8
            ("patrol", -4.6, 73.7, 3.0, 0.40, 3.5, 0.8, 0.0),        # 18
            ("patrol", 1.0, 89.0, 3.0, 0.35, 3.0, 3.3, 0.0),         # 28
            ("patrol", -1.6, 104.0, 3.0, 0.40, 3.2, 4.4, 0.0)]       # 38
    VAN_GAP0 = 43.0               # le fourgon, 43 m derrière elle à l'image 1, qui remonte la meute
    VAN_V = SPEED + 1.0
    VAN_X = (5.6, 4.8)            # sur la voie de droite, il serre vers le milieu : il force

    def hero_pos(t):
        return HERO_X, Y_REF - D0 + SPEED * t

    def hero_heading(t):
        return 0.0

    def hero_speed(t):
        return SPEED

    def brake_windows():
        return []

    def pack_pos(i):
        _, x, gap, dv, amp, per, ph, slide = PACK[i]

        def fn(t):
            w = 2.0 * math.pi * t / per + ph
            y = Y_REF - D0 - gap + (SPEED + dv) * t + 1.2 * amp * math.sin(w)          # elle se jette, elle lâche
            return x + amp * math.sin(1.25 * w + 0.7 * ph) + slide * M.smoothstep(-0.5, T_END + 0.5, t), y
        return fn

    def van_pos(t):
        y = Y_REF - D0 - VAN_GAP0 + VAN_V * t
        u = M.smoothstep(-0.5, T_END + 0.5, t)
        return VAN_X[0] + (VAN_X[1] - VAN_X[0]) * u, y


def tracks():
    out = {"hero": hero_pos, "van": van_pos}
    for i, entry in enumerate(PACK):
        out[f"{entry[0]}_{i}"] = pack_pos(i)
    return out


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale), sans tremblé : fixe, le lacet qui suit la berline (0,6 m à droite de
    l'objectif : 0,3 à 0,8°) ; le site qui la suit aussi, à SITE_AIM de la hauteur, sur le tablier (v3.1 :
    le trapèze d'avant la laissait dériver de 2 points au milieu et repartir en fin de plan) ; le zoom de 200 à
    212 mm, aux rampes de 10 images (départ et arrivée progressifs)."""
    lens = LENS * (1.0 + ZOOM * zoom_e(t))
    hx, hy = hero_pos(t)
    yaw = math.degrees(math.atan2(-(hx - CAM[0]), CAM[1] - hy))
    aim = SITE_AIM[0] + (SITE_AIM[1] - SITE_AIM[0]) * t / T_END
    return CAM[0], CAM[1], CAM[2], yaw, site_aim(t, aim), 0.0, lens


def zoom_e(t):
    """La part du zoom faite à t : 0 à 1 sur le plan, vitesse en trapèze aux rampes en cosinus de 0,4 s (10
    images : départ et arrivée progressifs ; 3,9 %/s au plus, plafond 4)."""
    return ease_trap(t, 0.0, T_END, 0.4)


def site_aim(t, aim):
    """Le site qui met le centre de la berline à `aim` de la hauteur (depuis le haut) à l'instant t : la visée
    passe au-dessus d'elle."""
    hx, hy = hero_pos(t)
    d = CAM[1] - hy
    lens = LENS * (1.0 + ZOOM * zoom_e(t))
    elev = math.degrees(math.atan2(deck_z(hy) + 0.72 - CAM[2], d))
    return elev + math.degrees(math.atan((aim - 0.5) * 2.0 * 18.0 / lens))


def camera(t):
    """La caméra rendue : camera_rail, sans tremblé écrit (v3.1 ; l'opérateur commun de motion.py fait le reste)."""
    return camera_rail(t)


def bars_seen(f):
    """Le nombre de rampes au-dessus de la crête à l'image f."""
    t = M.t_of(f)
    return sum(bar_visible(pack_pos(i)(t)[1]) for i in range(len(PACK))) + bar_visible(van_pos(t)[1])


if __name__ == "__main__":
    for f in (1, 8, 18, STILL_FRAME, 28, 38, FRAMES):
        t = M.t_of(f)
        print(f"image {f:2d} : berline à {CAM[1] - hero_pos(t)[1]:5.1f} m, {hero_speed(t):5.2f} m/s, {bars_seen(f)} "
              f"rampes visibles, site {camera_rail(t)[4]:+.2f}°, focale {camera_rail(t)[6]:.0f} mm")
    if VILLE:
        t, h = T49, 1.0 / M.FPS
        hx, hy = hero_pos(t)
        print(f"P4/49 = P5/1 : berline ({hx:.2f} ; {hy:.2f}) à {hero_speed(t):.2f} m/s")
        for name, fn in [("patrouille 1", patrol1_pos)] + [(f"patrol_{i}", pack_pos(i)) for i in range(1, 5)] + \
                [("fourgon", van_pos)]:
            (x0, y0), (x1, y1), (x2, y2) = fn(t - h), fn(t), fn(t + h)
            v, a = (y2 - y0) / (2 * h), (y2 - 2 * y1 + y0) / (h * h)
            print(f"  {name:12s} ({x1:5.2f} ; {y1:7.2f}) : {x1 - hx:+.2f} m en travers, {y1 - hy:+6.2f} m "
                  f"({(y1 - hy) / hero_speed(t):+.2f} s), {v:5.2f} m/s, {a:+5.2f} m/s²")
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
