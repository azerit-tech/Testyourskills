# Le plan OUV écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3, « la conduite calme ») : la
# berline remonte l'avenue vers l'horizon corail à 50 km/h, sur la voie intérieure de sa chaussée ; la caméra la
# suit de trois quarts dos, à 1,5 m, 10 m derrière et 1,8 m à sa gauche (sur l'axe de l'avenue), 35 mm, comme sur un
# rail (aucune secousse). La patrouille est garée gyrophare éteint à l'angle de la rue transversale de y 266, devant
# à gauche, côté ville, le long de la bordure, l'avant vers la berline : elle glisse du milieu gauche du cadre vers
# son bord gauche et en sort vers l'image 17 ; la berline la dépasse juste après (vers l'image 44 ; c'est elle qui
# s'allume dans le rétroviseur de P1). Caméra à gauche de la berline : à sa droite, la caisse cachait la patrouille
# (même direction, 15° à gauche, à l'aperçu du 12 novembre).
# scene_a.py n'en lit que les fonctions du temps ; motion.py en tire roues, braquage et transfert de masse.
#
# Repère de la scène A : l'avenue file vers +y (le soleil couché au bout), la ville à x < 0, l'océan à x > 0 ; les
# rues transversales s'ouvrent côté ville. t = 0 à la première image ; 24 images, 24 par seconde.
import motion as M

FRAMES = 24
F0 = 1
T_END = (FRAMES - 1) / M.FPS

SPEED = 50 / 3.6              # m/s, la conduite calme
HERO_X = 1.75                 # la voie intérieure de la chaussée qui monte vers +y
CAM_BACK, CAM_SIDE, CAM_Z = 10.0, -1.8, 1.5   # CAM_SIDE : vers +x (la droite de la berline) ; négatif, à sa gauche
CAM_YAW = 183.0               # lacet de motion.key_camera (180 : vers +y) : 3° vers la droite, la berline à droite
CAM_PITCH = -2.0              # du centre sans toucher le bord (à 182° elle le touchait), la patrouille au milieu gauche
LENS = 35.0
# la rue transversale de la patrouille : celle de y 266 (découpage v2, P1 option A, 12 novembre) ; à celle de y 120,
# P1 regardait en arrière au-delà de y 20, là où la ville s'arrête (l'horizon nu à gauche du cadre) ; ici il a
# 250 m d'avenue construite derrière la berline, et OUV en a 400 devant
STREET = 266.0
PATROL = (-5.9, STREET - 2.0, 180.0)  # x, y, cap (lieux : 0 vers +y) : garée le long de la bordure côté ville, avant vers -y
Y0 = PATROL[1] - 35.0 + CAM_BACK   # la berline à la première image : la caméra à 35 m de la patrouille


def hero_pos(t):
    return HERO_X, Y0 + SPEED * t


def patrol_pos(t):
    return PATROL[0], PATROL[1]


def tracks():
    return {"hero": hero_pos, "patrol": patrol_pos}


def camera(t):
    """(x, y, z, lacet, site, roulis, focale) : sur un rail, à la vitesse de la berline, sans secousse."""
    x, y = hero_pos(t)
    return x + CAM_SIDE, y - CAM_BACK, CAM_Z, CAM_YAW, CAM_PITCH, 0.0, LENS


if __name__ == "__main__":
    import math
    for f in (1, 12, 24):
        t = M.t_of(f)
        cx, cy = camera(t)[:2]
        a = math.degrees(math.atan2(cx - PATROL[0], PATROL[1] - cy))
        print(f"image {f:2d} : berline y {hero_pos(t)[1]:.1f}, patrouille à {PATROL[1] - cy:.1f} m devant la caméra, "
              f"{a:.0f}° à gauche (cadre : de {180 - CAM_YAW - 16:.0f} à {180 - CAM_YAW + 16:.0f}°)")
