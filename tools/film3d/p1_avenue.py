# Le plan P1 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md §4, « la patrouille fond sur elle, elle
# bondit », repris au découpage v3.1 et à la feuille de route du parcours, fiche P1) : l'image qui suit OUV/40 (une
# seule prise, le monde continu de SPEC §18.36), la berline sur la même voie, à la même vitesse (50 km/h, droit, sans
# accélération). Elle met les gaz vers l'image 5 et l'accélération dessine un triangle (+2,35 m/s² au plus vers
# l'image 24) : 16,4 m/s à la dernière image, presque relâchée, l'état exact où P2 la prend. La patrouille 1 n'est pas
# la garée d'OUV (elle reste à l'angle de la rue, rampe allumée, hors champ derrière nous) : une autre voiture, déjà
# lancée, entrée par le bord gauche à la fin d'OUV (ouv_avenue.chaser_pos, la même loi) ; elle arrive par la voie
# d'en face, 3 m/s plus vite que la berline, rampe allumée ; elle remonte jusqu'à sa portière, la dépasse et pile en
# voyant le rond-point : à la coupe, 3 m devant elle, à sa vitesse, en freinage établi de 7 m/s² (P2 la voit se faire
# déborder).
# La berline et le bras de la caméra se lisent dans le parcours unique (parcours.py), fenêtre « P1 », posée dans la
# scène A : rien du chemin n'est écrit ici. La caméra : le cadre de poursuite commun (2,4 m de haut, 7,5 m derrière,
# 0,3 m à gauche, 24 mm), le lacet et le site recalculés (ouv_avenue.aim) pour tenir la berline à sa place.
import math

import motion as M
import ouv_avenue as OUV
import parcours as PC

FRAMES = dict(PC.SHOTS)["P1"]
F0 = 1
V3 = True                           # les plafonds v3 de test_motion.py s'appliquent
V31 = True                          # et ceux du découpage v3.1 (cadre commun, conduite)
T_END = (FRAMES - 1) / M.FPS
HERO = PC.hero("P1")                # la fenêtre du parcours, en image du plan (1 = la première)


def _f(t):
    return F0 + t * M.FPS


# l'ellipse d'OUV dans la scène A : la place de la première image de P1 sur l'avenue, comptée en secondes d'OUV
# prolongé à vitesse constante (elle se déduit des ancres du parcours ; nulle quand les deux fenêtres se touchent)
ELLIPSIS = (HERO["pos"](F0)[1] - OUV.hero_pos(OUV.T_END)[1]) / OUV.SPEED - 1.0 / M.FPS

# La patrouille, voie d'en face : x -1,7, 3,45 m à gauche de la berline (1,5 m d'air entre les caisses). Elle a W0 m/s
# de plus que la berline à la première image (l'écart constant d'OUV, jusqu'à l'image W_FROM), puis met les gaz plus
# fort qu'elle (ACC_UP), la remonte, la dépasse, et pile en voyant le rond-point : son freinage monte à BRAKE m/s² à
# l'à-coup JERK et il est établi BRAKE_SET images avant la coupe. À P1/49 = P2/1, elle est LEAD_END devant la berline,
# à sa vitesse, en freinage établi (feuille de route, 2.3 : +3,0 m à la coupe vers P2). Son avance à la première image
# reste LEAD0 (la même trajectoire dans OUV) ; W0 et ACC_UP s'en déduisent (la vitesse et l'avance à la coupe).
LANE_X = -1.7
W_FROM = 5                          # image : la fin de l'écart constant
LEAD0 = -2.875                      # m : son avance à la première image (OUV la fait entrer par la gauche)
LEAD_END = 3.0                      # m : son centre devant celui de la berline à P1/49 = P2/1
BRAKE, JERK, BRAKE_SET = 6.95, 11.0, 2      # (6,95 : le plafond de 7 m/s² mesuré aux différences finies)
_TA = M.t_of(W_FROM)
_TC = M.t_of(F0 + FRAMES)           # P1/49, la première image de P2
_T3 = _TC - BRAKE_SET / M.FPS       # le freinage établi
_DT = 1.0 / 960.0


def _vh(t):
    return HERO["speed"](_f(t))


def _hero_acc(t):
    return (_vh(t + 1e-3) - _vh(t - 1e-3)) / 2e-3


_A0 = _hero_acc(_TA)


def _keys(up):
    """Les sommets (t, accélération) de sa loi après _TA, linéaire entre eux (à-coup JERK)."""
    t1 = _TA + abs(up - _A0) / JERK
    ts = _T3 - (BRAKE + up) / JERK
    return [(_TA, _A0), (t1, up), (ts, up), (_T3, -BRAKE)]


def _accel(t, ks):
    if t <= ks[0][0]:
        return _hero_acc(t)
    for (ta, a), (tb, c) in zip(ks, ks[1:]):
        if t <= tb:
            return a + (c - a) * (t - ta) / max(1e-9, tb - ta)
    return -BRAKE


def _integrate(w0, ks, dt=_DT):
    """[(vitesse, avance gagnée depuis _TA)] tous les dt depuis _TA."""
    v = _vh(_TA) + w0
    out, d, t = [(v, 0.0)], 0.0, _TA
    while t < _TC + 1.0:
        v1 = v + _accel(t + dt / 2, ks) * dt
        d += ((v + v1) - (_vh(t) + _vh(t + dt))) / 2 * dt
        v, t = v1, t + dt
        out.append((v, d))
    return out


def _at(tab, t, dt=_DT):
    u = (t - _TA) / dt
    k = max(0, min(len(tab) - 2, int(u)))
    w = u - k
    return tuple(a + (b - a) * w for a, b in zip(tab[k], tab[k + 1]))


def _solve():
    """(W0, ACC_UP) : la vitesse de la berline et LEAD_END devant elle à la coupe."""
    def w0_for(ks, dt):
        r0, r1 = (_at(_integrate(w, ks, dt), _TC, dt)[0] - _vh(_TC) for w in (0.0, 1.0))
        return -r0 / (r1 - r0)

    def lead_err(up, dt=1.0 / 240.0):
        ks = _keys(up)
        w0 = w0_for(ks, dt)
        return LEAD0 + w0 * _TA + _at(_integrate(w0, ks, dt), _TC, dt)[1] - LEAD_END, w0
    lo, hi = _A0, 4.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if lead_err(mid)[0] > 0 else (lo, mid)     # (l'avance décroît avec ACC_UP)
    up = (lo + hi) / 2
    return w0_for(_keys(up), _DT), up


W0, ACC_UP = _solve()               # 3,1 m/s (17,0 m/s, 61 km/h) ; 2,6 m/s²
_KEYS = _keys(ACC_UP)
_TAB = _integrate(W0, _KEYS)


def patrol_accel(t):
    """Son accélération (m/s²)."""
    return _accel(t, _KEYS)


def _w(t):
    """L'écart de vitesse patrouille − berline (m/s)."""
    return W0 if t <= _TA else _at(_TAB, t)[0] - _vh(t)


def _lead(t):
    """Son avance sur la berline (m), l'intégrale de l'écart de vitesse."""
    if t <= _TA:
        return LEAD0 + W0 * t
    return LEAD0 + W0 * _TA + _at(_TAB, t)[1]


# la berline dans le cadre : centre x de 50 % (là où OUV/40 la laisse : une seule prise, plus de saut de 2 % à la
# coupe) à 55 % à l'image 20 (de la place à gauche pour la patrouille ; 56 sortait de x 50 ± 6 avec le tremblé de
# l'opérateur), y 58 % depuis le haut
U0, U1 = OUV.CAM_U, 0.55
U_T1 = M.t_of(20)
V_HERO = OUV.CAM_V
LENS = OUV.LENS
FOCUS, FSTOP = 7.8, 5.6             # la berline nette, la patrouille à peine moins
STILL = 30                          # l'image fixe (banc) : la patrouille remonte à sa portière

# ce que la berline frôle (fx.py en tire les effets) : trois feuilles de papier à plat 1,4 m à droite de sa ligne ;
# elle les passe à l'image 36, la caméra à l'image 47 (le parcours : y 309,4)
PAPERS = ((3.15, 309.4, 20.0), (3.55, 310.1, -35.0), (2.95, 310.9, 70.0))   # x, y, rotation (degrés)
PATROL_HEAD_LENS = 1.0


def hero_pos(t):
    """La berline (scène A), t en s depuis la première image ; définie avant elle (les ressorts de M.sample)."""
    return HERO["pos"](_f(t))


def hero_heading(t):
    return HERO["heading"](_f(t))


def hero_steer(t):
    return HERO["steer"](_f(t))


def hero_speed(t):
    return HERO["speed"](_f(t))


def brake_windows():
    """Les fenêtres des feux stop (images du plan) : celles du parcours, aucune ici."""
    return PC.brake_windows("P1")


def patrol_pos(t):
    """Voie d'en face, _lead(t) devant la berline le long de l'avenue."""
    return LANE_X, hero_pos(t)[1] + _lead(t)


def patrol_speed(t):
    return hero_speed(t) + _w(t)


def patrol_heading(t):
    """Le cap de la caisse (lieux : 0 vers +y, positif vers -x), celui de sa route."""
    h = 1.0 / 240.0
    (x0, y0), (x1, y1) = patrol_pos(t - h), patrol_pos(t + h)
    return math.degrees(math.atan2(-(x1 - x0), y1 - y0))


def tracks():
    """« patrol » : la patrouille 1 ; « patrol_garee » : la garée d'OUV, restée à l'angle de la rue."""
    return {"hero": hero_pos, "patrol": patrol_pos, "patrol_garee": OUV.patrol_pos}


def tracks_heading():
    return {"patrol": patrol_heading, "patrol_garee": lambda t: OUV.PATROL[2]}


def bars_on(frame):
    """La rampe allumée tout le plan (allumée hors champ à la fin d'OUV)."""
    return True


def _target_u(t):
    return U0 + (U1 - U0) * M.smoothstep(0.0, U_T1, t)


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale) : le bras du parcours (parcours.camera), la berline à (_target_u,
    V_HERO)."""
    hx, hy = hero_pos(t)
    return OUV.aim(*PC.camera("P1", _f(t)), hx, hy, _target_u(t), V_HERO)


def camera(t):
    """La caméra du plan : le rail, sans tremblé écrit (l'opérateur de motion.key_camera s'y ajoute au rendu)."""
    return camera_rail(t)


# Le phare lointain (découpage v3, §3) : comme en OUV (ouv_avenue.phare_pose), 600 m devant la caméra de la première
# image, sur un cap sombre, 14° à droite de l'axe (x 82 % à la première image, 87 % à la dernière, à 9 % au moins du
# bord droit de la berline). Hauteur (1,3°), pied et cap : le repli du découpage v3 pour une caméra à 0,55 m, à
# revoir à 2,4 m (le mur de la promenade ne cache plus la tour).
# Phase : de 90 à 180° sur le plan (48 images à 45°/s), à plus de 20° de l'objectif (256° vu du phare) : comme en
# OUV, celle qui montre le moins de pinceau sur l'horizon.
PHARE_ECART = 14.0
PHARE_PHASE = 90.0
PHARE_PIED, PHARE_ECHELLE, PHARE_AT = OUV.phare_pose(camera(0.0), ecart=PHARE_ECART)


def body_gap(t, hero_l=4.89, hero_w=1.88, patrol_l=5.1, patrol_w=1.95):
    """L'air entre les deux caisses (boîtes alignées sur l'avenue), en m."""
    (hx, hy), (px, py) = hero_pos(t), patrol_pos(t)
    dx = max(0.0, abs(hx - px) - (hero_w + patrol_w) / 2)
    dy = max(0.0, abs(hy - py) - (hero_l + patrol_l) / 2)
    return math.hypot(dx, dy)


def lens_gap(t, patrol_l=5.1, patrol_w=1.95):
    """L'air entre l'objectif et la caisse de la patrouille, en m."""
    c = camera_rail(t)
    px, py = patrol_pos(t)
    dx = max(0.0, abs(c[0] - px) - patrol_w / 2)
    dy = max(0.0, abs(c[1] - py) - patrol_l / 2)
    return math.hypot(dx, dy)


def patrol_screen(t):
    """(boîte de la patrouille à l'écran, (u, v) de sa rampe) ; None hors champ."""
    c = camera_rail(t)
    px, py = patrol_pos(t)
    box = M.hero_screen(c, px, py, 0.0, 0.0, box=(5.1, 1.95, 1.5))
    bar = M.screen_point(c, (px, py - 0.12, 1.62))
    return box, bar


if __name__ == "__main__":
    for f in (1, 8, 12, 16, 20, 24, 28, 30, 32, 36, 40, 44, 48):
        t = M.t_of(f)
        c = camera(t)
        hx, hy = hero_pos(t)
        px, py = patrol_pos(t)
        car = M.hero_screen(c, hx, hy, 0.0, 0.0)
        box, bar = patrol_screen(t)
        if not box or box["u1"] < 0:
            where = "hors champ"
        else:
            where = f"x {max(0.0, box['u0']) * 100:.0f}-{min(1.0, box['u1']) * 100:.0f} %"
            if bar and 0.0 <= bar[0] <= 1.0:
                where += f", rampe x {bar[0] * 100:.0f} y {(1 - bar[1]) * 100:.0f} (bas)"
        print(f"{f:2d} : berline {hero_speed(t) * 3.6:3.0f} km/h x {car['u'] * 100:.0f} y {car['v'] * 100:.0f} "
              f"l {car['w'] * 100:.0f} % | patrouille {patrol_speed(t) * 3.6:3.0f} km/h, centre {py - hy:+.2f} m, "
              f"{body_gap(t):.2f} m d'air, objectif {lens_gap(t):.2f} m, {where} | caméra {hy - c[1]:.2f} m, "
              f"{c[0] - hx:+.2f}, z {c[2]:.2f}, lacet {c[3]:.1f}, site {c[4]:.1f}")
