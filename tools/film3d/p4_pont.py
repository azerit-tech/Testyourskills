# Le plan P4 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.4, « le pont ») : la berline qui
# descend la rampe vers la caméra, derrière elle la meute étagée par la rampe jusqu'à la crête ; le fourgon, un peu
# plus vite qu'elle, qui force vers le milieu ; la caméra posée au pied, 200 mm, zoom avant lent, sans tremblé écrit
# (v3.1 : seul l'opérateur commun de motion.py). scene_c.py n'en lit que les fonctions du temps ; motion.py en tire
# roues, braquage et transfert de masse.
#
# Repère du pont (scene_c.py), qui est celui de la ville : l'axe x = 0, la poursuite roule vers +y (cap 0), la crête
# en y = -130, le pied de la rampe en y = -5 (le plan autonome ; dans la ville, motion.pont_profil : crête en y
# −263,5, pied en y −210). t = 0 à la première image, 24 images par seconde.
#
# Dans la ville (FILM3D_VILLE, « 1 » par défaut) : depuis le 17 novembre (SPEC §18.55) le pont est roulé en entier,
# du joint de la rue (y −328) au pied de la rampe (y −210, le pont de 110 m depuis le 17 novembre au soir) : la
# fenêtre « P4 » du parcours unique (parcours.py), 108 images, la montée, la crête à 107 km/h, la descente et le
# freinage du port. La caméra est LA caméra du film, le bras commun de poursuite (parcours.chase, sur le tablier) :
# plus de plan de face, plus de caméra fixe ni de zoom. La
# patrouille 1 remonte la berline par la gauche pendant la montée, la dépasse et freine vers le port ; la meute
# suit, derrière la caméra, et se range à la file pour P5. « 0 » : le plan autonome d'avant, inchangé (33,3 m/s,
# caméra fixe en y 10, 200 mm).
import math
import os

import motion as M

VILLE = os.environ.get("FILM3D_VILLE", "1").strip().lower() not in ("0", "non", "no", "false", "off")  # lieux.ville_on
V3 = True
V31 = True
F0 = 1
Y_REF = 45.0                  # l'ancienne caméra (brouillon) : les trajectoires d'avant restent comptées d'elle
Y_CREST = M.pont_profil()["crest"]   # la crête : -130 (autonome), -263,5 (la ville, le pont de 110 m)
SITE_AIM = (0.545, 0.545)     # le centre de la berline à 54,5 % de la hauteur depuis le haut (52 à 56)
PORT_FRAMES = (34, 42)        # la lumière ambre du port monte sur sa calandre (lumière v3.1 ; en ville : la fin)
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

    def hero_steer(t):
        """Les roues avant de la conduite simulée (au bout du pont elle se jette déjà vers le port)."""
        return HERO["steer"](_f(t))

    def hero_spin(t):
        """Les roues arrière (rapport à la vitesse du sol : 1 roule, 0 bloquée par le frein à main)."""
        return HERO["spin"](_f(t))

    def brake_windows():
        """Les feux stop (images du plan) : ceux du parcours, l'entrée du virage du port."""
        return PC.brake_windows("P4")

    HERO_X = hero_pos(T_END)[0]           # la voie du pont (x 1,80) : la berline y entre sur le plat
    _END = hero_pos(T_END)
    PORT_FRAMES = (FRAMES - 14, FRAMES - 6)     # la lumière ambre du port sur sa calandre : les dernières images
    LENS = PC.VISEE_LENS
    CAM = PC.chase("P4", F0)[:3]                # la caméra à la première image (scene_c l'y pose avant les clés)
    STILL_FRAME = PC.ETOILES[4] - PC.START["P4"] + 1      # la crête, l'étoile 4
    T_STILL = M.t_of(STILL_FRAME)
    SPEED = hero_speed(0.0)
    LAG = (0.3, 0.012, 1.5)   # s : chacune reprend la conduite de la berline en retard, 0,3 s plus 0,012 s par
                              # mètre de distance (1,5 s au plus) : chacune à son rythme, la plus loin plus tard
    SURGE = 0.22              # m : elle se jette et lâche de 0,22 m (1 m/s² au plus, en plus de l'accélération de la
                              # berline, 2,8 : le plafond des patrouilles est 4)

    # La meute (« le nombre qui écrase »), sur toute la largeur du tablier au début. Chacune suit la conduite de la
    # berline, en retard selon sa distance (LAG), à sa distance, avec ses louvoiements de 3 à 3,6 s et 0,4 m (v3.1).
    # En ville, le pont roulé en entier (17 novembre) : la meute roule derrière la caméra, hors champ ; quatre de
    # plus, 1,5 m/s plus vite, à CREST_GAPS m derrière (le plan de face les découvrait à la crête). P4 → P5 est continu
    # (P4/49 = P5/1) : la patrouille 1 roule devant la berline, à sa gauche (en amorce au bord droit du cadre, qu'elle
    # quitte seule), et freine pour s'arrêter tout droit au port ; derrière la berline, deux patrouilles et le fourgon
    # se resserrent à la file dans sa voie, à FILE_S secondes d'elle à P5/1 (ce que la caméra de P5 attend).
    # (genre, x au début, x à la fin, retard, vitesse en plus en m/s, louvoiement en m, sa période en s, phase) ;
    # retard : en m derrière la berline à t = 0, None (déduit de CREST_FRAMES) ou ("file", s) (à la file à P5/1)
    # m derrière la berline à P4/1 : les quatre plus rapides (le pont de 110 m, 17 novembre au soir : sur la rue et le
    # boulevard du quai à P4/1, intercalés entre les trois qui se rangent à la file, ils passent la crête pendant le
    # tronçon)
    CREST_GAPS = (44.0, 72.0, 94.0, 86.0)
    FILE_S = (1.6, 2.5, 3.4)
    T49 = M.t_of(F0 + FRAMES)           # P5/1
    # SPEC §18.62 (la circulation) : sur le tablier, la meute tient x −2,3 à 2,6 (louvoiement compris, 0,6 m d'air
    # avec les voitures rangées contre la glissière de droite et la file d'en face) ; avant le pont, dans la rue des
    # enseignes (8,4 m de bordure à bordure, des garées à gauche), elle roule en deux files, RUE_X, sans louvoyer, et
    # s'ouvre sur la largeur du tablier en traversant le boulevard du quai (RUE_Y) : avant, elle roulait jusqu'à
    # |x| 5,4 sur les trottoirs et à travers les garées (hors champ, derrière la caméra)
    PACK = [("patrol", None, None, None, 0.0, 0.0, 3.0, 0.3),                # la patrouille 1 : patrol1_pos
            ("patrol", 2.6, HERO_X, ("file", FILE_S[0]), 0.0, 0.35, 3.4, 6.0),
            ("patrol", -2.3, HERO_X, ("file", FILE_S[1]), 0.0, 0.40, 3.2, 4.0),
            ("patrol", -2.3, -2.3, 58.0, 0.0, 0.40, 3.6, 4.25),
            ("patrol", 2.6, 2.6, 78.0, 0.0, 0.35, 3.1, 5.0),
            ("patrol", 4.4, 5.4, None, 1.5, 0.40, 3.3, 2.6),          # en ville : CREST_GAPS m derrière, 1,5 m/s
            ("patrol", -2.3, -2.3, None, 1.5, 0.40, 3.5, 0.8),        # plus vite que la berline
            ("patrol", 1.0, 1.0, None, 1.5, 0.35, 3.0, 3.3),
            ("patrol", -0.95, -0.95, None, 1.5, 0.40, 3.2, 4.4)]
    VAN = ("van", 2.6, HERO_X, ("file", FILE_S[2]), 0.0, 0.3, 3.3, 1.7)   # le fourgon ferme la file
    # les deux files de la rue (x) : à droite 1, 4, 5, 7 et le fourgon ; à gauche 2, 3, 6, 8 ; le passage de la rue au
    # tablier, de RUE_Y[0] à RUE_Y[1] (y, le boulevard du quai)
    RUE_X = {1: 3.45, 2: -0.35, 3: -0.35, 4: 3.45, 5: 3.9, 6: -0.35, 7: 3.45, 8: -0.35, "van": 3.45}
    RUE_Y = (-348.0, -262.0)
    RUE_SWAY = 0.35

    # la patrouille 1 : P1_SIDE m à gauche de la berline, P1_LEAD m devant elle à P5/1, à P1_V m/s, en freinage
    # établi de P1_BRAKE m/s² ; avant son freinage, elle roule comme la berline (même vitesse, avance constante), puis
    # passe de l'accélération de la berline à -P1_BRAKE à l'à-coup constant P1_JERK
    P1_SIDE, P1_LEAD, P1_V, P1_BRAKE, P1_JERK = 3.4, 7.0, 17.6, 6.4, 10.0      # (3,4 : p5_virage.PATROL_IN)

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

    # En ville (17 novembre), la loi ci-dessus ne sert plus : la berline freine déjà à 6,44 m/s² quand la patrouille
    # devrait commencer son freinage. Le 18 novembre (audit des mouvements) : elle n'est plus dans le cadre à P4/1.
    # Avant, à P4/1 elle roulait déjà à côté de la berline, au bord gauche du cadre : ville.py la gardait donc dans
    # P3 comme « entrante », figée à sa place de P4/0 (ses clés ne commencent qu'à P4/0) ; on voyait une patrouille
    # arrêtée au milieu du pont pendant toute la fin de P3, qui partait d'un coup à 110 km/h à P4/1. Elle arrive
    # maintenant de derrière la caméra, lancée (elle débouche du boulevard du quai, comme la meute) : à P4/1, P1_BEHIND m
    # derrière la berline (à côté de l'objectif, hors champ), à P1_V0 km/h environ ; elle lève le pied (P1_COAST m/s²),
    # entre dans le cadre par la gauche vers l'image 10 et double ; puis elle freine pour le port (P1_BRAKE_J d'à-coup
    # jusqu'au freinage de P5) et entre dans P5 dans l'état qu'il attend (p5_virage.PATROL_IN : 7 m devant, à sa
    # vitesse d'entrée, freinage de 6,4 m/s²). Une vraie conduite : sa vitesse s'intègre à rebours depuis P5/1, une
    # accélération à à-coup borné ; l'instant de son freinage est celui qui la met à P1_BEHIND m à P4/1. Depuis film/v8,
    # 10 m (8 avant) : le bras franc (FILM3D_VITESSE=2), plus près et au 19 mm, la faisait entrer dès l'image 6.
    P1_BEHIND, P1_COAST, P1_BRAKE_J = -10.0, -0.5, 10.0
    _P1_DT = 1.0 / 240.0

    def _p1_accel(t, tb, a49):
        """Son accélération : P1_COAST, puis le freinage établi de P5 (a49) à partir de tb, la rampe entre les deux à
        P1_BRAKE_J m/s³."""
        tr = (P1_COAST - a49) / P1_BRAKE_J
        if t >= tb:
            return a49
        if t >= tb - tr:
            return P1_COAST + (a49 - P1_COAST) * (t - (tb - tr)) / tr
        return P1_COAST

    def _p1_table(tb, v49, a49, y49, t0=-2.0):
        """[(y, v)] au 1/240 s, de t0 à P5/1, intégrés à rebours depuis l'état de P5/1."""
        n = int(round((T49 - t0) / _P1_DT))
        y, v, out = y49, v49, [(y49, v49)]
        for k in range(n):
            t = T49 - k * _P1_DT
            a0, a1 = _p1_accel(t, tb, a49), _p1_accel(t - _P1_DT, tb, a49)
            v1 = v - 0.5 * (a0 + a1) * _P1_DT
            y -= 0.5 * (v + v1) * _P1_DT
            y, v = y, v1
            out.append((y, v))
        out.reverse()
        return t0, out

    def _p1_solve():
        """(t0, table, v49, état de P5/1) : l'instant de son freinage qui la met à P1_BEHIND m à P4/1 (bissection)."""
        import p5_virage as P5
        v49, a49 = P5.PATROL_V0, -P5.PATROL_IN["decel"]
        y49 = hero_pos(T49)[1] + P5.PATROL_IN["lead"]
        lo, hi = 0.8, T49
        for _ in range(40):
            mid = (lo + hi) / 2
            t0, tab = _p1_table(mid, v49, a49, y49)
            y0 = tab[int(round(-t0 / _P1_DT))][0]
            if y0 - hero_pos(0.0)[1] < P1_BEHIND:
                lo = mid          # trop loin derrière : freiner plus tard
            else:
                hi = mid
        t0, tab = _p1_table((lo + hi) / 2, v49, a49, y49)
        return t0, tab, (lo + hi) / 2, v49, P5.PATROL_IN

    _P1_T0, _P1_YV, P1_BRAKE_AT, _P1_V49, _P1_IN = _p1_solve()
    P1_V0 = _P1_YV[int(round(-_P1_T0 / _P1_DT))][1] * 3.6

    def _p1_y(t):
        """Sa place le long du pont (y), table au 1/240 s ; avant la table, sa vitesse de t0 tenue."""
        u = (t - _P1_T0) / _P1_DT
        if u <= 0.0:
            y, v = _P1_YV[0]
            return y + v * (t - _P1_T0)
        k = min(len(_P1_YV) - 2, int(u))
        w = min(1.0, u - k)
        return _P1_YV[k][0] + (_P1_YV[k + 1][0] - _P1_YV[k][0]) * w

    def _p1_lead(t):
        return _p1_y(min(t, T49)) - hero_pos(min(t, T49))[1]

    # pendant qu'elle la remonte, côte à côte, elle passe P1_PASS m à gauche d'elle (1,5 m d'air entre les caisses),
    # et se rabat à P1_SIDE une fois devant (P1_TUCK, en images du plan), l'état que P5 attend
    # (P1_TUCK : de 35 % du tronçon à 11 images de sa fin ; 150 et 238 sur les 249 images du pont d'avant)
    # (fusion v10 : de l'image 70 à l'avant-dernière, 38 à 97 avant. La berline simulée sort du slalom du pont le
    # nez 2,5° à gauche ; rabattue quand elle n'a que 5 m d'avance, la patrouille passait à 1,19 m de son aile
    # avant ; rabattue plus tard, une fois 5,5 m devant : 1,51 m)
    P1_PASS, P1_TUCK = 3.6, (70, FRAMES - 1)

    def _p1_side(t):
        # (une quintique : sur le pont court, la rabattue ne dure que 2,5 s ; l'à-coup reste sous 12 m/s³)
        u = min(1.0, max(0.0, (t - M.t_of(P1_TUCK[0])) / (M.t_of(P1_TUCK[1]) - M.t_of(P1_TUCK[0]))))
        return P1_PASS + (P1_SIDE - P1_PASS) * u * u * u * (10.0 + u * (6.0 * u - 15.0))

    # la part du slalom de la berline (parcours.voie, SPEC §18.62) que la patrouille 1 suit : la moitié. La berline
    # prend la voie de droite du pont (3,8 m à droite de la route) : la patrouille qui la remonte par la gauche
    # reste dans le cadre, à 1,9 m de la file d'en face au plus juste (diag/audit_trafic.py)
    # (fusion v10 : 0,6, 0,5 avant. La voiture simulée déboîte de 3,85 m ; à 0,5 la patrouille n'entrait dans le
    # cadre qu'à P4/32, deux images après la fenêtre de test_entrees ; à 0,6 : P4/27)
    P1_VOIE = 0.6

    def _voie_x(t):
        # l'écart du slalom en x de la scène (la voie à gauche de la berline est vers −x)
        return -PC.voie(PC.s_of_t(PC.t_of("P4", _f(t))))

    def patrol1_pos(t):
        hx, hy = hero_pos(t)
        x = hx - (1.0 - P1_VOIE) * _voie_x(t) - _p1_side(t)
        if t <= T49:
            return x, hy + _p1_lead(t)
        # au-delà de P5/1 (les ressorts de M.sample) : son freinage tenu
        dt = t - T49
        y49 = hero_pos(T49)[1] + _P1_IN["lead"]
        return hero_pos(T49)[0] - P1_SIDE, y49 + _P1_V49 * dt - 0.5 * _P1_IN["decel"] * dt * dt

    def _follow(gap, dv, t):
        """y d'un véhicule qui suit la conduite de la berline en retard (LAG), `gap` m derrière elle à t = 0, dv
        m/s plus vite."""
        lag = min(LAG[2], LAG[0] + LAG[1] * gap)
        y0 = hero_pos(0.0)[1]
        return hero_pos(t - lag)[1] + (y0 - hero_pos(-lag)[1]) - gap + dv * t

    _TB = M.t_of(brake_windows()[-1][0])          # le freinage du port (la berline)

    def _pack_fn(x0, x1, gap, dv, amp, per, ph, xr=None):
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
            # elle se jette, elle lâche (pas pendant le freinage du port : il reste sous les 7 m/s²)
            y = _follow(gap, dv, t) + SURGE * math.sin(w) * (1.0 - M.smoothstep(_TB - 3.0, _TB, t))
            sway = amp * math.sin(1.25 * w + 0.7 * ph) * (1.0 - u if x1 == HERO_X else 1.0)
            # (fusion v10 : le louvoiement réduit de moitié pendant le freinage du port ; la berline simulée y freine
            # à 6,8 m/s², la patrouille 6 qui la suit louvoyait à 3,3 m/s² en même temps : 7,6 sur le cercle)
            sway *= 1.0 - 0.5 * M.smoothstep(_TB - 1.5, _TB, t)
            x = x0 + (x1 - x0) * u + sway
            if xr is not None:          # dans la rue : sa file, un louvoiement réduit (SPEC §18.62)
                xs = xr + RUE_SWAY * sway
                u = min(1.0, max(0.0, (y - RUE_Y[0]) / (RUE_Y[1] - RUE_Y[0])))
                x = xs + (x - xs) * u * u * u * (10.0 + u * (6.0 * u - 15.0))    # quintique : à-coup borné
            return x, y
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

    for _k, _g in zip(range(len(PACK) - len(CREST_GAPS), len(PACK)), CREST_GAPS):
        PACK[_k] = PACK[_k][:3] + (_g,) + PACK[_k][4:]

    def pack_pos(i):
        if i == 0:
            return patrol1_pos
        return _pack_fn(*PACK[i][1:], xr=RUE_X[i])

    van_pos = _pack_fn(*VAN[1:], xr=RUE_X["van"])

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
    """(x, y, z, lacet, site, roulis, focale), sans tremblé. En ville : LA caméra du film (parcours.chase, le bras
    commun sur le tablier). Hors ville : fixe, le lacet qui suit la berline (0,6 m à droite de
    l'objectif : 0,3 à 0,8°) ; le site qui la suit aussi, à SITE_AIM de la hauteur, sur le tablier (v3.1 :
    le trapèze d'avant la laissait dériver de 2 points au milieu et repartir en fin de plan) ; le zoom de 200 à
    212 mm, aux rampes de 10 images (départ et arrivée progressifs)."""
    if VILLE:
        return PC.chase("P4", F0 + t * M.FPS)
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


if VILLE:
    camera.bras_commun = "P4"      # motion.camera_operator : la vibration du bras commun, sur le temps du film


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
