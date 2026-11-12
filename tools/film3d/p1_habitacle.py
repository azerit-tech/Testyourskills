# Le plan P1 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3, « le rétroviseur »), après une
# ellipse (SPEC §18.36) : P1 commence 2,5 s après la dernière image d'OUV, la berline sur la même voie, à la même
# vitesse (50 km/h) et à la position d'OUV prolongée de 2,5 s. Pendant l'ellipse la patrouille a quitté son angle
# de rue : au début de P1 elle roule dans la voie de la berline, 32 m derrière, donc dans le rétroviseur ; sa rampe
# s'y allume à l'image 8 (corail et lilas, 2 Hz) ; elle se rapproche un peu ; la berline bondit à l'image 20.
# La caméra est fixe dans l'habitacle, depuis la banquette arrière, par-dessus l'épaule droite du conducteur, 28 mm :
# scene_a.p1_motion la parente à la caisse (coordonnées de la caisse : l'avant vers -y, le conducteur à +x).
#
# Le rétroviseur intérieur de la w111 (le vrai, matière hero_w111_mirror, 18 × 5 cm) regarde droit vers l'arrière :
# depuis la caméra, à droite du centre, il renverrait 6,7° à droite de l'axe. Tourné de MIRROR_YAW vers le
# conducteur et basculé de MIRROR_TILT vers le haut (un conducteur le règle), il montre l'axe de la voie derrière, à
# hauteur de rampe. À 32 m la rampe (1,2 m) y fait ~2,2°, soit ~20 px de large à 360 px (le miroir : ~70 px).
import math

import motion as M
import ouv_avenue as OUV

FRAMES = 28
F0 = 1
ELLIPSIS = 2.5                      # s entre la dernière image d'OUV et la première de P1
T_CUT = OUV.FRAMES / M.FPS + ELLIPSIS   # le temps d'OUV prolongé de la première image de P1
T_ON = M.t_of(8)                    # la rampe s'allume, dans le rétroviseur
T_GO = M.t_of(20)                   # la berline bondit
ACCEL = 4.0                         # m/s², atteint en 0,15 s
GAP0 = 32.0                         # m entre les centres au début de P1
CLOSING = 1.5                       # m/s : la patrouille se rapproche un peu

# la caméra dans la caisse (repère de la caisse de scene_a.street_hero : l'avant vers -y, le conducteur à +x)
CAM_LOCAL = (0.15, 0.65, 1.25)     # 13 cm sous le pavillon : le dossier avant ne prend que le bas du cadre
CAM_PITCH = -12.0                  # le rétroviseur au tiers haut, hors de la bande du HUD
LENS = 28.0
MIRROR = (0.0, -0.63, 1.225)       # le centre du rétroviseur intérieur (sonde du 12 novembre)
BAR_Z = 1.15                       # la hauteur visée derrière, entre le pavillon et la rampe de la patrouille
FOCUS, FSTOP = 5.0, 4.0            # la mise au point (m) et l'ouverture : le reflet du miroir net, la capuche floue
STILL = 14                         # l'image fixe (banc) : la rampe allumée, corail, dans le rétroviseur


def _accel(t):
    return 0.0 if t < T_GO else ACCEL * min(1.0, (t - T_GO) / 0.15)


_PROF = M.Profile(OUV.SPEED, _accel)


def hero_pos(t):
    """OUV prolongé de l'ellipse à vitesse constante, puis le profil de P1 (le bond à T_GO)."""
    return OUV.HERO_X, OUV.hero_pos(T_CUT)[1] + _PROF.s(t)


def hero_speed(t):
    return _PROF.v(t)


def patrol_pos(t):
    """Dans la voie de la berline, derrière elle, à 50 km/h plus CLOSING."""
    return OUV.HERO_X, OUV.hero_pos(T_CUT)[1] - GAP0 + (OUV.SPEED + CLOSING) * t


def patrol_heading(t):
    return 0.0


def tracks():
    return {"hero": hero_pos, "patrol": patrol_pos}


def bars_on(frame):
    return M.t_of(frame) >= T_ON


def _mirror_turn():
    """(lacet, bascule) du rétroviseur en degrés, pour que la caméra y voie l'axe de la voie derrière, à BAR_Z :
    la normale est la bissectrice de (miroir -> caméra) et (miroir -> cible). Lacet positif vers +x (le conducteur),
    bascule positive vers le haut."""
    d_cam = [c - m for c, m in zip(CAM_LOCAL, MIRROR)]
    dist = GAP0 - MIRROR[1]
    d_tgt = [0.0 - MIRROR[0], dist, BAR_Z - MIRROR[2]]
    n1 = math.sqrt(sum(c * c for c in d_cam))
    n2 = math.sqrt(sum(c * c for c in d_tgt))
    n = [a / n1 + b / n2 for a, b in zip(d_cam, d_tgt)]
    return math.degrees(math.atan2(n[0], n[1])), math.degrees(math.atan2(n[2], math.hypot(n[0], n[1])))


MIRROR_YAW, MIRROR_TILT = _mirror_turn()


def bar_pixels(t, width_px=360, bar=1.2):
    """La largeur de la rampe dans le miroir, en pixels de l'image (champ horizontal de 2·atan(10,125/28))."""
    path = math.dist(CAM_LOCAL, MIRROR) + (hero_pos(t)[1] - patrol_pos(t)[1]) + MIRROR[1]
    ang = math.degrees(2 * math.atan(bar / 2 / path))
    return ang * width_px / (2 * math.degrees(math.atan(10.125 / LENS)))


if __name__ == "__main__":
    for f in (1, 8, 20, 28):
        t = M.t_of(f)
        hy, py = hero_pos(t)[1], patrol_pos(t)[1]
        print(f"image {f:2d} : berline y {hy:.2f} à {hero_speed(t) * 3.6:.0f} km/h, patrouille {hy - py:.1f} m derrière, "
              f"rampe {'allumée' if bars_on(f) else 'éteinte'} ({bar_pixels(t):.0f} px dans le miroir)")
    print(f"rétroviseur tourné de {MIRROR_YAW:.1f}° vers le conducteur, basculé de {MIRROR_TILT:.2f}°")
