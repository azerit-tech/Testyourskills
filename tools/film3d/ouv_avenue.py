# Le plan OUV écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md §4, « la patrouille garée s'éveille ») :
# la berline remonte l'avenue vers l'horizon corail à 50 km/h, sur la voie intérieure de sa chaussée ; la caméra la
# suit de dos au ras de la chaussée, sur un rail, sans rotation, un peu moins vite qu'elle. La patrouille est garée à
# l'angle de la rue transversale de y 266, devant à gauche, côté ville, l'avant vers la berline : ses phares
# s'allument à l'image 14, elle glisse hors du bord gauche vers l'image 30 ; à 34 sa rampe s'allume dans notre dos
# (hors champ : corail et lilas sur les façades, la chaussée et le flanc gauche de la berline) ; de 37 à 40 les feux
# stop de la berline : elle a vu. C'est elle qui la prend en chasse en P1.
# scene_a.py n'en lit que les fonctions du temps ; motion.py en tire roues, braquage et transfert de masse.
#
# Repère de la scène A : l'avenue file vers +y (le soleil couché au bout), la ville à x < 0, l'océan à x > 0 ; les
# rues transversales s'ouvrent côté ville. t = 0 à la première image ; 40 images, 24 par seconde.
import motion as M

FRAMES = 40
F0 = 1
T_END = (FRAMES - 1) / M.FPS
V3 = True                     # les plafonds v3 de test_motion.py s'appliquent

SPEED = 50 / 3.6              # m/s, la conduite calme
HERO_X = 1.75                 # la voie intérieure de la chaussée qui monte vers +y
# La caméra, 8 m derrière son centre au départ, 0,2 m à sa droite, 0,55 m du sol, 24 mm. La fiche la voulait 0,6 m à
# gauche : de là, la berline au centre (x 50 %), la patrouille garée tombait à x 3-18 % et sortait à l'image 25 ; à
# 0,2 m à droite, berline au centre, la patrouille est à x 12-26 %, juste à gauche de la berline sans passer derrière
# elle, et sort du bord gauche à l'image 30 (fiche : de 24 à 32). Plus à droite, elle passerait derrière la berline.
CAM_BACK, CAM_SIDE, CAM_Z = 8.0, 0.2, 0.55   # CAM_SIDE : vers +x (la droite de la berline)
# 0,5 m/s moins vite qu'elle : 8,8 m derrière à la fin, la berline à 34 % de large (point de coupe vers P1, 44 % :
# rapport 0,77) ; à 1 m/s (fiche : 9,6 m à la fin) elle finissait à 30 %, rapport 0,68, sous les 0,75 du raccord
CAM_LAG = 0.5
CAM_YAW = 178.6               # lacet de motion.key_camera (180 : vers +y ; moins, vers -x) : la berline à x 50 %
# site : le centre de la berline à 53 % de la hauteur depuis le haut (fiche, point de coupe y 55 ± 5)
CAM_PITCH = 4.5
LENS = 24.0
FOCUS_F = 4.0                 # ouverture ; le point sur la berline
# la rue transversale de la patrouille : celle de y 266 (découpage v2, P1 option A, 12 novembre) ; il y a 250 m
# d'avenue construite derrière la berline, et 400 devant
STREET = 266.0
PATROL = (-5.9, STREET - 2.0, 180.0)  # x, y, cap (lieux : 0 vers +y) : garée le long de la bordure côté ville, avant vers -y
Y0 = PATROL[1] - 20.0   # la berline à la première image, 20 m avant la patrouille ; elle la dépasse à l'image 40
# la patrouille garée qui s'éveille : ses phares à WAKE (on la voit de face, à 25 m), sa rampe à BARS_ON (hors
# champ), puis les feux stop de la berline sur BRAKE (première et dernière image)
WAKE = 14
WAKE_HEAD_W = 150.0                  # W par phare (450 dans le modèle : de face à 30 m, ils éblouissaient le cadre)
WAKE_LENS = 0.4                      # la force des verres maillés, en part de celle du modèle (les verres peints dans
                                     # l'atlas suivent l'énergie des spots : cast_vehicles.lamp_drivers, ici un tiers)
BARS_ON = 34
BRAKE = (37, 40)


def hero_pos(t):
    return HERO_X, Y0 + SPEED * t


def patrol_pos(t):
    return PATROL[0], PATROL[1]


def tracks():
    return {"hero": hero_pos, "patrol": patrol_pos}


def tracks_heading():
    """Le cap des véhicules arrêtés (lieux : 0 vers +y) : la patrouille garée, l'avant vers -y."""
    return {"patrol": lambda t: PATROL[2]}


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale) : sur un rail, CAM_LAG moins vite que la berline, sans rotation."""
    x, y = hero_pos(t)
    return x + CAM_SIDE, y - CAM_BACK - CAM_LAG * t, CAM_Z, CAM_YAW, CAM_PITCH, 0.0, LENS


def camera(t):
    """La caméra du plan : le rail, sans tremblé écrit (l'opérateur de motion.key_camera s'y ajoute au rendu)."""
    return camera_rail(t)


def bars_on(frame):
    return frame >= BARS_ON


# Le phare lointain (découpage v3, §3 ; scene_a le pose par lieux.phare_lointain) : sur l'horizon marin, 14° à droite
# de l'axe de l'avenue, à 600 m de la caméra de la première image. À 0,55 m du sol, le mur de la promenade (0,95 m,
# 41 m plus loin dans cette direction) monte à 0,56° au-dessus de l'horizon : posé sur l'eau, la tour de 1,0° n'en
# sortait que par la lanterne. Le repli du §3 : sur un cap sombre, base à 0,5° au-dessus de l'horizon, 1,3° de haut.
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
    return BRAKE[0] <= frame <= BRAKE[1]


if __name__ == "__main__":
    for f in (1, 14, 24, 30, 34, 40):
        c = camera(M.t_of(f))
        car = M.hero_screen(c, *hero_pos(M.t_of(f)), 0.0, 0.0)
        pat = M.hero_screen(c, PATROL[0], PATROL[1], 0.0, PATROL[2], box=(5.1, 1.95, 1.5))
        where = "hors champ" if not pat or pat["u1"] < 0 else f"x {max(0.0, pat['u0']) * 100:.0f}-{pat['u1'] * 100:.0f} %"
        print(f"image {f:2d} : caméra {hero_pos(M.t_of(f))[1] - c[1]:.2f} m derrière ; berline x {car['u'] * 100:.0f}, "
              f"y {car['v'] * 100:.0f}, largeur {car['w'] * 100:.0f} % ; patrouille {where}")
