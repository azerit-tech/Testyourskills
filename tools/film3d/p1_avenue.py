# Le plan P1 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md §4, « la patrouille fond sur elle, elle
# bondit ») : 1,5 s après la dernière image d'OUV (ellipse), la berline sur la même voie, à la même vitesse (50 km/h),
# à la position d'OUV prolongée. Pendant l'ellipse la patrouille a fait demi-tour : elle roule derrière, rampe
# allumée, à cheval sur la double ligne (2,35 m à gauche de la berline), hors champ à côté de la caméra ; elle
# accélère à l'image 10 et tient sa vitesse à 24, son capot entre par le bord gauche à 27 ; la berline bondit à 32 ;
# la patrouille tient le bord gauche jusqu'à la fin, son nez 4 m derrière le centre de la berline.
# La caméra la suit de dos au ras de la chaussée, comme en OUV : 8 m derrière, 0,4 m à sa gauche, 0,6 m, 24 mm, sur
# un rail à sa vitesse ; au bond elle ne suit qu'une part de son accélération et se laisse distancer.
import math

import motion as M
import ouv_avenue as OUV

FRAMES = 48
F0 = 1
V3 = True                           # les plafonds v3 de test_motion.py s'appliquent
ELLIPSIS = 1.5                      # s entre la dernière image d'OUV et la première de P1
T_CUT = OUV.FRAMES / M.FPS + ELLIPSIS   # le temps d'OUV prolongé de la première image de P1
T_END = (FRAMES - 1) / M.FPS
T_GO = M.t_of(32)                   # la berline bondit
ACCEL = 4.0                         # m/s², atteint en 0,15 s
LANE_X = -0.6                       # la patrouille à cheval sur la double ligne, 2,35 m à gauche de la berline
# L'écart entre les centres. La fiche partait de 14 m : à 6 m/s² à partir de l'image 10, la patrouille n'y
# regagnait que 3 m avant le bond, et son capot n'entrait pas dans le cadre avant la fin du plan. À 8,9 m, elle est
# entière hors champ (son nez 1,6 m devant l'objectif, à 31° de l'axe : hors du demi-champ de 22,9°) ; son capot
# entre par le bord gauche à l'image 27 ; elle finit à 6,6 m (son nez 4,1 m derrière le centre de la berline,
# 1,7 m d'air entre les caisses), au bord gauche, x 0-23 %.
GAP0 = 8.9
# elle accélère à 6 m/s² à l'image 10 et tient sa vitesse (58 km/h) à 24 : jusqu'à 34 (la fiche), elle gagnait
# 5 m/s sur la berline et la percutait avant la fin ; à 24, le bond de la berline (4 m/s²) efface l'écart de vitesse
# vers l'image 44, et l'écart se stabilise
T_PUSH = M.t_of(10)
T_HOLD = M.t_of(24)
PUSH = 6.0                          # m/s², atteint en 0,2 s

# la caméra (repère du monde : l'avenue vers +y, l'océan à x > 0)
CAM_BACK = 8.0                      # m derrière le centre de la berline jusqu'au bond (fiche : 7 m ; à 7 m, avec
                                    # 1,5 m d'air entre les caisses, le capot ne montait pas au-delà de x 11 %)
CAM_FOLLOW = 0.2                    # la part de l'accélération du bond que la caméra suit (accélération relative 3,2 m/s²)
CAM_SIDE = -0.3                     # m à sa gauche (-x) : 1,07 m d'air entre l'objectif et le flanc de la patrouille (fiche : 0,4)
CAM_Z = 0.6
YAW0, YAW1 = 182.3, 179.5           # lacet (180 : vers +y ; plus, vers +x) : la berline de x 52 à x 57 %
PITCH = 4.0                         # le centre de la berline à 53 % de la hauteur depuis le haut
LENS = 24.0
FOCUS, FSTOP = 8.0, 5.6             # la berline nette, le capot de la patrouille contre l'objectif flou
STILL = 30                          # l'image fixe (banc) : le capot de la patrouille dans le cadre, juste avant le bond

# ce que la berline frôle (fx.py en tire les effets) : trois feuilles de papier à plat 1,4 m à droite de sa ligne,
# 20 m devant elle au départ, que son passage soulève (images 36 à 44)
PAPERS = ((3.15, 309.4, 20.0), (3.55, 310.1, -35.0), (2.95, 310.9, 70.0))   # x, y, rotation (degrés)
# les phares de la patrouille pleins (plus de veilleuse) : ils jettent l'ombre de la berline devant elle
PATROL_HEAD_W = 450.0
PATROL_HEAD_LENS = 1.0


def _accel(t):
    return 0.0 if t < T_GO else ACCEL * min(1.0, (t - T_GO) / 0.15)


_PROF = M.Profile(OUV.SPEED, _accel)


def hero_pos(t):
    """OUV prolongé de l'ellipse à vitesse constante, puis le profil de P1 (le bond à T_GO)."""
    return OUV.HERO_X, OUV.hero_pos(T_CUT)[1] + _PROF.s(t)


def hero_speed(t):
    return _PROF.v(t)


def _push(t):
    if t < T_PUSH or t >= T_HOLD:
        return 0.0
    return PUSH * min(1.0, (t - T_PUSH) / 0.2, (T_HOLD - t) / 0.2)


_PATROL = M.Profile(OUV.SPEED, _push)


def patrol_pos(t):
    """Sur la double ligne, GAP0 derrière la berline à sa vitesse ; elle accélère à T_PUSH, tient sa vitesse à T_HOLD."""
    return LANE_X, OUV.hero_pos(T_CUT)[1] - GAP0 + _PATROL.s(t)


def patrol_speed(t):
    return _PATROL.v(t)


def patrol_heading(t):
    """Le cap de la caisse (lieux : 0 vers +y, positif vers -x), celui de sa route."""
    h = 1.0 / 240.0
    (x0, y0), (x1, y1) = patrol_pos(t - h), patrol_pos(t + h)
    return math.degrees(math.atan2(-(x1 - x0), y1 - y0))


def tracks():
    return {"hero": hero_pos, "patrol": patrol_pos}


def bars_on(frame):
    """La rampe allumée tout le plan (allumée hors champ à la fin d'OUV)."""
    return True


def cam_back(t):
    """La distance de la caméra au centre de la berline : CAM_BACK, puis, au bond, la part de l'élan qu'elle ne suit pas."""
    extra = _PROF.s(t) - OUV.SPEED * t
    return CAM_BACK + (1.0 - CAM_FOLLOW) * extra


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale) : sur un rail, sans secousse."""
    x, y = hero_pos(t)
    u = M.smoothstep(0.0, T_END, t)
    return x + CAM_SIDE, y - cam_back(t), CAM_Z, YAW0 + (YAW1 - YAW0) * u, PITCH, 0.0, LENS


def camera(t):
    """La caméra du plan : le rail, sans tremblé écrit (l'opérateur de motion.key_camera s'y ajoute au rendu)."""
    return camera_rail(t)


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


if __name__ == "__main__":
    for f in (1, 10, 20, 24, 27, 30, 32, 34, 40, 48):
        t = M.t_of(f)
        c = camera(t)
        hx, hy = hero_pos(t)
        px, py = patrol_pos(t)
        car = M.hero_screen(c, hx, hy, 0.0, 0.0)
        pat = M.hero_screen(c, px, py, 0.0, 0.0, box=(5.1, 1.95, 1.5))
        where = "hors champ" if not pat or pat["u1"] < 0 or pat["u0"] > 1 else f"x 0-{pat['u1'] * 100:.0f} %"
        print(f"image {f:2d} : berline {hero_speed(t) * 3.6:.0f} km/h, x {car['u'] * 100:.0f} y {car['v'] * 100:.0f} "
              f"l {car['w'] * 100:.0f} % ; patrouille {patrol_speed(t) * 3.6:.0f} km/h, {hy - py:.2f} m (nez "
              f"{hy - py - 2.55:.2f} m derrière le centre), {body_gap(t):.2f} m d'air, objectif à {lens_gap(t):.2f} m, "
              f"{where} ; caméra {cam_back(t):.2f} m derrière")
