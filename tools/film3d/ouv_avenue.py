# Le plan OUV écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md §4, « la patrouille garée s'éveille ») :
# la berline remonte l'avenue vers l'horizon corail à 50 km/h, sur la voie intérieure de sa chaussée ; la caméra la
# suit de dos au ras de la chaussée, sur un rail, sans rotation, un peu moins vite qu'elle. La patrouille garée est à
# l'angle de la rue transversale (STREET), devant à gauche, côté ville, l'avant vers la berline : ses phares
# s'allument à l'image 14, elle glisse hors du bord gauche vers l'image 25 ; à 34 sa rampe s'allume dans notre dos
# (hors champ : corail et lilas sur les façades, la chaussée et le flanc gauche de la berline), et elle reste là. La
# berline ne freine pas : elle passe à vitesse constante, sans feux stop (feuille de route du parcours, fiche OUV).
# OUV et P1 sont une seule prise (le monde continu, SPEC §18.36 : OUV/41 est P1/1). Celle qui la prend en chasse en P1
# n'est donc pas la garée : c'est la patrouille 1, une autre voiture déjà lancée, qui remonte l'avenue par la voie
# d'en face, 3 m/s plus vite qu'elle (chaser_pos : la loi de p1_avenue, une seule trajectoire sur les deux plans) ;
# elle allume sa rampe avec la garée, à 34, et entre par le bord gauche du cadre sur les dernières images.
# La berline et le bras de la caméra se lisent dans le parcours unique (parcours.py) : sa fenêtre « OUV », posée dans
# la scène A ; rien du chemin n'est écrit ici. scene_a.py n'en lit que les fonctions du temps ; motion.py en tire
# roues, braquage et transfert de masse.
#
# Repère de la scène A : l'avenue file vers +y (le soleil couché au bout), la ville à x < 0, l'océan à x > 0 ; les
# rues transversales s'ouvrent côté ville. t = 0 à la première image ; 24 images par seconde.
import math

import motion as M
import parcours as PC

FRAMES = dict(PC.SHOTS)["OUV"]
F0 = 1
T_END = (FRAMES - 1) / M.FPS
V3 = True                     # les plafonds v3 de test_motion.py s'appliquent
V31 = True                    # et ceux du découpage v3.1 (cadre commun, conduite)
HERO = PC.hero("OUV")         # la fenêtre du parcours, en image du plan (1 = la première)


def _f(t):
    return F0 + t * M.FPS


SPEED = HERO["speed"](F0)     # m/s, la conduite calme (13,89 : 50 km/h), constante sur le plan
HERO_X = HERO["pos"](F0)[0]   # la voie intérieure de la chaussée qui monte vers +y
# La caméra, le cadre de poursuite commun du découpage v3.1 (tous les plans de dos) : le bras du parcours (2,4 m de
# haut, 7,5 m derrière le centre de la berline, 0,3 m à sa gauche, son cap filtré sur tout le parcours), 24 mm, la
# berline à x 50 % et à y 58 % depuis le haut. Le lacet et le site sont calculés (aim) pour poser le centre de la
# berline à sa place ; la route est droite, ils ne bougent pas.
CAM_BACK, CAM_SIDE, CAM_Z = PC.CAM_BACK, PC.CAM_LEFT, PC.CAM_Z    # CAM_SIDE : vers la gauche de la berline
CAM_U, CAM_V = 0.50, 0.58                    # le centre de la berline à l'écran (x depuis la gauche, y depuis le haut)
HERO_ZC = 0.72                               # la hauteur de son centre
LENS = 24.0
HALF_W = math.atan(10.125 / LENS)            # demi-champ horizontal (capteur de 36 mm en 9:16)
HALF_H = math.atan(18.0 / LENS)              # demi-champ vertical
FOCUS_F = 4.0                 # ouverture ; le point sur la berline
Y0 = HERO["pos"](F0)[1]  # la berline à la première image (parcours : 20 m avant la patrouille, qu'elle dépasse à 40)
# la rue transversale de la patrouille (découpage v2, P1 option A, 12 novembre) : 22 m devant la première image,
# y 286,85 depuis que l'ancre d'OUV touche P1 (y 266 quand OUV/1 était en 244)
STREET = Y0 + 22.0
PATROL = (-5.9, STREET - 2.0, 180.0)  # x, y, cap (lieux : 0 vers +y) : garée le long de la bordure côté ville, avant vers -y
# la patrouille garée qui s'éveille : ses phares à WAKE (on la voit de face, à 25 m), sa rampe à BARS_ON (hors champ)
WAKE = 14
WAKE_LENS = 0.4                      # la force des verres maillés, en part de celle du modèle (les verres peints dans
                                     # l'atlas suivent l'énergie des spots : cast_vehicles.lamp_drivers, ici un tiers)
BARS_ON = 34


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
    return PC.brake_windows("OUV")


def patrol_pos(t):
    """La patrouille garée (immobile)."""
    return PATROL[0], PATROL[1]


def p1_time(t):
    """L'instant de P1 (s depuis P1/1, négatif dans OUV) de l'instant t d'OUV."""
    return t - (T_END + 1.0 / M.FPS)


def chaser_pos(t):
    """La patrouille 1 (celle de P1) : la loi de p1_avenue.patrol_pos prolongée en arrière dans OUV."""
    import p1_avenue as P1
    return P1.patrol_pos(p1_time(t))


def chaser_heading(t):
    import p1_avenue as P1
    return P1.patrol_heading(p1_time(t))


def tracks():
    """« patrol » : la patrouille 1 (motion.PATROL1, la même qu'en P1) ; « patrol_garee » : la garée."""
    return {"hero": hero_pos, "patrol": chaser_pos, "patrol_garee": patrol_pos}


def tracks_heading():
    """Le cap des véhicules (lieux : 0 vers +y) : la garée, l'avant vers -y ; la patrouille 1, celui de sa route."""
    return {"patrol_garee": lambda t: PATROL[2], "patrol": chaser_heading}


def aim(x, y, z, hx, hy, u=CAM_U, v=CAM_V):
    """(x, y, z, lacet, site, roulis, focale) d'une caméra posée en (x, y, z) qui met le centre de la berline (hx, hy,
    à HERO_ZC du sol) à (u, v) du cadre (v depuis le haut) : lacet de motion.key_camera (180 vers +y, plus vers +x),
    puis trois pas de Newton sur la boîte projetée (motion.hero_screen), dont le centre n'est pas celui de la caisse."""
    dx, dy = hx - x, hy - y
    phi = math.degrees(math.atan((u - 0.5) * 2.0 * math.tan(HALF_W)))
    yaw = 180.0 + math.degrees(math.atan2(dx, dy)) - phi
    beta = math.degrees(math.atan((v - 0.5) * 2.0 * math.tan(HALF_H)))
    pitch = math.degrees(math.atan2(HERO_ZC - z, math.hypot(dx, dy))) + beta
    for _ in range(3):
        b0 = M.hero_screen((x, y, z, yaw, pitch, 0.0, LENS), hx, hy, 0.0, 0.0)
        bu = M.hero_screen((x, y, z, yaw + 0.1, pitch, 0.0, LENS), hx, hy, 0.0, 0.0)
        bv = M.hero_screen((x, y, z, yaw, pitch + 0.1, 0.0, LENS), hx, hy, 0.0, 0.0)
        yaw += 0.1 * (u - b0["u"]) / (bu["u"] - b0["u"])
        pitch += 0.1 * (v - b0["v"]) / (bv["v"] - b0["v"])
    return x, y, z, yaw, pitch, 0.0, LENS


def cam_side(t):
    """Le décalage du bras à gauche : 0 tant que la patrouille garée est dans le cadre (à 0,3 m, le lacet tourne à
    droite pour garder la berline au centre et la patrouille sort avant l'image 24), puis le décalage du parcours,
    atteint à la dernière image, sans vitesse, comme P1 le tient."""
    return PC.CAM_LEFT * M.smoothstep(M.t_of(SIDE_FROM), T_END, t)


SIDE_FROM = 22                # l'image où le bras commence à glisser vers la gauche (0,75 s : 3,2 m/s² au plus)


def camera_rail(t):
    """Le cadre commun : le bras du parcours (parcours.camera), visé sur la berline."""
    x, y = hero_pos(t)
    return aim(*PC.camera("OUV", _f(t), left=cam_side(t)), x, y)


def camera(t):
    """La caméra du plan : le rail, sans tremblé écrit (l'opérateur de motion.key_camera s'y ajoute au rendu)."""
    return camera_rail(t)


def bars_on(frame):
    return frame >= BARS_ON


# Le phare lointain (découpage v3, §3 ; scene_a le pose par lieux.phare_lointain) : sur l'horizon marin, 14° à droite
# de l'axe de l'avenue, à 600 m de la caméra de la première image. À 0,55 m du sol, le mur de la promenade (0,95 m,
# 41 m plus loin dans cette direction) monte à 0,56° au-dessus de l'horizon : posé sur l'eau, la tour de 1,0° n'en
# sortait que par la lanterne. Le repli du §3 : sur un cap sombre, base à 0,5° au-dessus de l'horizon, 1,3° de haut.
# À revoir au cadre v3.1 (caméra à 2,4 m : le mur ne cache plus la tour, elle peut revenir sur l'eau à 1,0°).
PHARE_CAP, PHARE_ECART = 0.0, 14.0   # cap de l'avenue (lieux : 0 vers +y), degrés à droite de l'axe
PHARE_DEG = 1.3                      # hauteur angulaire de la tour, du pied au sommet du chapeau
PHARE_BASE_DEG = 0.5                 # son pied au-dessus de l'horizon de la caméra
PHARE_D = 600.0
# l'azimut du premier pinceau à l'image 0 (degrés depuis +x, sens trigonométrique ; 45°/s) : de 95 à 170° sur le
# plan. Relevés de 1° et vus de 600 m, les pinceaux restent sur l'horizon (y 46,5 à 50 %) quel que soit leur
# azimut : la phase qui en montre le moins, à plus de 20° de l'objectif (256° vu du phare), l'un presque dans l'axe
# du regard, l'autre filant hors du bord droit (32 % de la largeur à l'image 1, 77 % à la dernière).
PHARE_PHASE = 95.0
PHARE_TOUR, PHARE_FEU = 17.9, 16.8   # lieux.PHARE_H et PHARE_FEU (m, à l'échelle 1)


def phare_pose(cam, cap=PHARE_CAP, ecart=PHARE_ECART, deg=PHARE_DEG, base_deg=PHARE_BASE_DEG, d=PHARE_D):
    """(pied (x, y, z), échelle, lanterne (x, y, z)) du phare lointain vu de la caméra `cam` (x, y, z, …) : le calcul
    de lieux.phare_lointain, la hauteur du pied en plus."""
    import math
    h = math.radians(cap - ecart)
    x, y = cam[0] - math.sin(h) * d, cam[1] + math.cos(h) * d
    z = cam[2] + d * math.tan(math.radians(base_deg))
    s = d * math.tan(math.radians(deg)) / PHARE_TOUR
    return (x, y, z), s, (x, y, z + PHARE_FEU * s)


PHARE_PIED, PHARE_ECHELLE, PHARE_AT = phare_pose(camera(0.0))


def braking(frame):
    return any(a <= frame <= b for a, b in brake_windows())


if __name__ == "__main__":
    for f in (1, 14, 24, 30, 34, 40):
        c = camera(M.t_of(f))
        car = M.hero_screen(c, *hero_pos(M.t_of(f)), 0.0, 0.0)
        pat = M.hero_screen(c, PATROL[0], PATROL[1], 0.0, PATROL[2], box=(5.1, 1.95, 1.5))
        where = "hors champ" if not pat or pat["u1"] < 0 else f"x {max(0.0, pat['u0']) * 100:.0f}-{pat['u1'] * 100:.0f} %"
        print(f"image {f:2d} : caméra {hero_pos(M.t_of(f))[1] - c[1]:.2f} m derrière ; berline x {car['u'] * 100:.0f}, "
              f"y {car['v'] * 100:.0f}, largeur {car['w'] * 100:.0f} % ; patrouille {where}")
