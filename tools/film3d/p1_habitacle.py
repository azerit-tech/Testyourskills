# Le plan P1 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3, « le rétroviseur ») : la suite exacte
# d'OUV (ouv_avenue.py). P1 commence à l'image qui suit la dernière d'OUV : même voie, même vitesse (50 km/h), même
# position. La berline dépasse la patrouille garée sur sa gauche vers l'image 20 ; la rampe de la patrouille
# s'allume une fois la berline passée (image 23, corail et lilas à 2 Hz) ; la berline bondit (image 25) et la
# patrouille démarre derrière elle en braquant vers l'avenue (le début de son demi-tour).
# La caméra est fixe dans l'habitacle, depuis la banquette arrière, par-dessus l'épaule droite du conducteur, 28 mm :
# scene_a.p1_motion la parente à la caisse (coordonnées de la caisse : l'avant vers -y, le conducteur à +x).
#
# Le rétroviseur intérieur de la w111 (le vrai, matière hero_w111_mirror) est un plan à y -0,63, tourné droit vers
# l'arrière : depuis la caméra il renvoie l'arrière-droite de la voiture, quelques degrés seulement. La patrouille,
# à 7,65 m sur la gauche, n'y entrerait qu'à plus de 30 m derrière : pas pendant P1 (voir mirror_angle).
import math

import motion as M
import ouv_avenue as OUV

FRAMES = 28
F0 = 1
T_CUT = OUV.FRAMES / M.FPS          # le temps d'OUV de la première image de P1 (image 25 depuis le début d'OUV)
T_ON = M.t_of(23)                   # la rampe s'allume
T_GO = M.t_of(25)                   # la berline bondit, la patrouille démarre
ACCEL = 4.0                         # m/s², atteint en 0,15 s
PATROL_ACCEL = 3.0
PATROL_R = 5.5                      # rayon du braquage de la patrouille (vers +x : vers l'avenue)

# la caméra dans la caisse (repère de la caisse de scene_a.street_hero : l'avant vers -y, le conducteur à +x)
CAM_LOCAL = (0.15, 0.65, 1.15)
CAM_PITCH = -10.0
LENS = 28.0
MIRROR = (0.0, -0.63, 1.225)         # le centre du rétroviseur intérieur (sonde du 12 novembre)


def _accel(t):
    return 0.0 if t < T_GO else ACCEL * min(1.0, (t - T_GO) / 0.15)


_PROF = M.Profile(OUV.SPEED, _accel)


def hero_pos(t):
    return OUV.HERO_X, OUV.hero_pos(T_CUT)[1] + _PROF.s(t)


def hero_speed(t):
    return _PROF.v(t)


def _patrol_s(t):
    return 0.0 if t < T_GO else 0.5 * PATROL_ACCEL * (t - T_GO) ** 2


def patrol_pos(t):
    """Garée jusqu'à T_GO, puis un arc vers +x (sa gauche : elle regarde -y) : le début du demi-tour."""
    x0, y0 = OUV.PATROL[0], OUV.PATROL[1]
    th = math.pi + _patrol_s(t) / PATROL_R
    return x0 + PATROL_R + PATROL_R * math.cos(th), y0 + PATROL_R * math.sin(th)


def patrol_heading(t):
    return OUV.PATROL[2] + math.degrees(_patrol_s(t) / PATROL_R)


def tracks():
    return {"hero": hero_pos, "patrol": patrol_pos}


def bars_on(frame):
    return M.t_of(frame) >= T_ON


def mirror_angle():
    """L'angle (degrés, positif vers la gauche de la berline) de ce que le rétroviseur renvoie à la caméra, mesuré
    depuis l'arrière de la voiture ; le rétroviseur est un plan perpendiculaire à l'axe de la caisse."""
    dx = MIRROR[0] - CAM_LOCAL[0]
    dy = MIRROR[1] - CAM_LOCAL[1]
    # la caisse : l'avant vers -y et sa gauche vers +x ; le reflet garde dx et renverse dy
    return math.degrees(math.atan2(dx, -dy))


if __name__ == "__main__":
    for f in (1, 20, 23, 25, 28):
        t = M.t_of(f)
        hx, hy = hero_pos(t)
        px, py = patrol_pos(t)
        print(f"image {f:2d} : berline y {hy:.2f} à {hero_speed(t) * 3.6:.0f} km/h, patrouille ({px:.2f}, {py:.2f}) "
              f"cap {patrol_heading(t):.0f}, {hy - py:+.1f} m, rampe {'allumée' if bars_on(f) else 'éteinte'}")
    print(f"le rétroviseur renvoie {mirror_angle():+.1f}° (la patrouille y entrerait à "
          f"{(OUV.HERO_X - OUV.PATROL[0]) / math.tan(math.radians(12)):.0f} m derrière)")
