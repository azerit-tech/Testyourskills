# Le plan OUV écrit une fois, sans Blender (docs/cinematique-decoupage-v2.md §3, « le dos, au ras de l'avenue ») :
# la berline remonte l'avenue vers l'horizon corail à 50 km/h, sur la voie intérieure de sa chaussée, seule ; la
# caméra la suit de dos au ras de la chaussée : 8 m derrière son centre, 1,4 m à sa gauche, 0,55 m du sol, 24 mm,
# un mètre par seconde moins vite qu'elle (elle prend un mètre d'avance sur le plan, la menace s'éloigne avec elle).
# La patrouille est garée gyrophare éteint à l'angle de la rue transversale de y 266, devant à gauche, côté ville,
# le long de la bordure, l'avant vers la berline : on la longe, elle glisse vers le bord gauche du cadre ; la
# berline la dépasse juste après (c'est elle qui démarre derrière la berline en P1).
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
CAM_BACK, CAM_SIDE, CAM_Z = 8.0, -1.4, 0.55   # CAM_SIDE : vers +x (la droite de la berline) ; négatif, à sa gauche
CAM_LAG = 1.0                 # m/s : la caméra moins vite qu'elle
CAM_YAW = 181.3               # lacet de motion.key_camera (180 : vers +y) ; à 180,6 la berline touchait le bord droit
CAM_PITCH = 4.5               # site : le centre de la berline vers 54 % de la hauteur (plans bas : 50 à 62 %)
LENS = 24.0
FOCUS_F = 4.0                 # ouverture ; le point sur la berline
# la rue transversale de la patrouille : celle de y 266 (découpage v2, P1 option A, 12 novembre) ; à celle de y 120,
# P1 regardait en arrière au-delà de y 20, là où la ville s'arrête (l'horizon nu à gauche du cadre) ; ici il a
# 250 m d'avenue construite derrière la berline, et OUV en a 400 devant
STREET = 266.0
PATROL = (-5.9, STREET - 2.0, 180.0)  # x, y, cap (lieux : 0 vers +y) : garée le long de la bordure côté ville, avant vers -y
Y0 = PATROL[1] - 25.0   # la berline à la première image, 25 m avant la patrouille (inchangé depuis le brouillon)
# ce que la berline frôle (fx.py en tire la gerbe) : une ornière d'eau sur la ligne de ses roues gauches, côté caméra,
# étroite (pas de flaque miroir large dans l'axe de la caméra) ; les roues avant y entrent vers l'image 13, les
# arrière en sortent vers l'image 23
PUDDLE = (1.03, 248.6, 0.55, 2.8)    # centre x, y, largeur, longueur (m)
# la patrouille qu'on devine se réveiller : l'écran de bord s'allume (lumière froide dans l'habitacle) à WAKE
WAKE = 16
SCREEN = (PATROL[0] + 0.25, PATROL[1] - 0.2, 1.05)
SCREEN_W = 6.0


def hero_pos(t):
    return HERO_X, Y0 + SPEED * t


def patrol_pos(t):
    return PATROL[0], PATROL[1]


def tracks():
    return {"hero": hero_pos, "patrol": patrol_pos}


def camera(t):
    """(x, y, z, lacet, site, roulis, focale) : sur un rail, CAM_LAG moins vite que la berline, sans secousse."""
    x, y = hero_pos(t)
    return x + CAM_SIDE, y - CAM_BACK - CAM_LAG * t, CAM_Z, CAM_YAW, CAM_PITCH, 0.0, LENS


if __name__ == "__main__":
    import math
    for f in (1, 12, 24):
        t = M.t_of(f)
        cx, cy = camera(t)[:2]
        a = math.degrees(math.atan2(cx - PATROL[0], PATROL[1] - cy))
        half = math.degrees(math.atan(10.125 / LENS))
        print(f"image {f:2d} : berline y {hero_pos(t)[1]:.1f}, caméra {hero_pos(t)[1] - cy:.2f} m derrière, patrouille "
              f"à {PATROL[1] - cy:.1f} m devant la caméra, {a:.0f}° à gauche (cadre : de {180 - CAM_YAW - half:.0f} à "
              f"{180 - CAM_YAW + half:.0f}°)")
