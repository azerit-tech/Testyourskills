# Le plan P1 écrit une fois, sans Blender (docs/cinematique-decoupage-v2.md §3, P1 option A, « une patrouille
# démarre ») : 2,5 s après la dernière image d'OUV (ellipse, SPEC §18.36), la berline sur la même voie, à la même
# vitesse (50 km/h), à la position d'OUV prolongée. Pendant l'ellipse la patrouille a quitté son angle de rue : elle
# roule dans la voie de la berline, derrière elle ; sa rampe s'allume à l'image 8 (corail et lilas, 2 Hz) ; elle se
# rapproche un peu ; la berline bondit à l'image 20.
# La caméra la précède, de trois quarts avant droit : 12 m devant son centre, 2,8 m à sa droite (côté océan, sur la
# voie extérieure, libre), 0,5 m du sol, 50 mm, regard en arrière vers la ville. Travelling avant à la vitesse de
# la berline ; quand elle met les gaz, la caméra se laisse rattraper de 12 à 10,5 m : elle grossit dans le cadre.
# La patrouille entière derrière elle, dans le même cadre, à gauche.
import math

import motion as M
import ouv_avenue as OUV

FRAMES = 28
F0 = 1
ELLIPSIS = 2.5                      # s entre la dernière image d'OUV et la première de P1
T_CUT = OUV.FRAMES / M.FPS + ELLIPSIS   # le temps d'OUV prolongé de la première image de P1
T_ON = M.t_of(8)                    # la rampe s'allume
T_GO = M.t_of(20)                   # la berline bondit
ACCEL = 4.0                         # m/s², atteint en 0,15 s
GAP0 = 22.0                         # m entre les centres au début de P1 (à 32 m, 12 % de large : une tache)
CLOSING = 1.5                       # m/s : la patrouille se rapproche un peu
# la patrouille réveillée : deux images après sa rampe, elle met les gaz (on la voit grossir avant que la berline ne
# bondisse) et déboîte d'un mètre vers la voie extérieure, comme pour la doubler ; elle reste dans le cadre, à
# gauche de la berline, jamais derrière elle
T_PUSH = M.t_of(10)
PUSH = 7.0                          # m/s², atteint en 0,2 s (à 5, elle ne grossissait que de 12 %)
PULL_OUT = 0.5                      # m vers +x, de l'image 10 à la fin (à 1 m, elle touchait le bord gauche)

# la caméra (repère du monde : l'avenue vers +y, l'océan à x > 0)
CAM_AHEAD = 12.0                    # m devant le centre de la berline jusqu'à T_GO
CAM_CAUGHT = 10.5                   # m à la fin : elle s'est laissé rattraper
CAM_SIDE = 2.8                      # m à sa droite (+x)
CAM_Z = 0.5
YAW0, YAW1 = 12.5, 14.0             # lacet (motion.key_camera : 0 vers -y, positif vers -x), du début à la fin
PITCH = 1.5                         # le centre de la berline vers 52 % de la hauteur (règle des plans bas : 50 à 62 %)
LENS = 50.0
FOCUS, FSTOP = 20.0, 5.6            # la berline et la patrouille nettes toutes les deux
STILL = 14                          # l'image fixe (banc) : la rampe allumée, la berline encore à 12 m

# ce que la berline frôle (fx.py en tire les effets) : une ornière d'eau étroite sur la ligne de ses roues droites,
# côté caméra, que les roues avant prennent dès l'image 12 (à l'image 14 la roue est dedans : elle n'est plus dans la
# nappe des phares devant la calandre, où une flaque large faisait un trou noir) et les arrière quittent vers l'image
# 22 ; trois feuilles de papier à plat juste à droite de sa ligne, à 8 m de l'objectif à la fin, que son passage
# soulève (images 26 à 28)
PUDDLE = (2.47, 297.0, 0.55, 3.0)    # centre x, y, largeur, longueur (m)
PAPERS = ((3.15, 304.6, 20.0), (3.55, 305.3, -35.0), (2.95, 306.1, 70.0))   # x, y, rotation (degrés)
# les phares de la patrouille en veilleuse (lumières de 450 à 120 W, verres à 30 % de leur force)
PATROL_HEAD_W = 120.0
PATROL_HEAD_LENS = 0.3


def _accel(t):
    return 0.0 if t < T_GO else ACCEL * min(1.0, (t - T_GO) / 0.15)


_PROF = M.Profile(OUV.SPEED, _accel)
T_END = (FRAMES - 1) / M.FPS


def hero_pos(t):
    """OUV prolongé de l'ellipse à vitesse constante, puis le profil de P1 (le bond à T_GO)."""
    return OUV.HERO_X, OUV.hero_pos(T_CUT)[1] + _PROF.s(t)


def hero_speed(t):
    return _PROF.v(t)


def _push(t):
    return 0.0 if t < T_PUSH else PUSH * min(1.0, (t - T_PUSH) / 0.2)


_PATROL = M.Profile(OUV.SPEED + CLOSING, _push)


def patrol_pos(t):
    """Dans la voie de la berline, derrière elle, à 50 km/h plus CLOSING ; puis elle accélère et déboîte."""
    return (OUV.HERO_X + PULL_OUT * M.smoothstep(T_PUSH, T_END + 0.2, t),
            OUV.hero_pos(T_CUT)[1] - GAP0 + _PATROL.s(t))


def patrol_heading(t):
    """Le cap de la caisse (lieux : 0 vers +y, positif vers -x), celui de sa route."""
    h = 1.0 / 240.0
    (x0, y0), (x1, y1) = patrol_pos(t - h), patrol_pos(t + h)
    return math.degrees(math.atan2(-(x1 - x0), y1 - y0))


def tracks():
    return {"hero": hero_pos, "patrol": patrol_pos}


def bars_on(frame):
    return M.t_of(frame) >= T_ON


def cam_ahead(t):
    """La distance de la caméra au centre de la berline, le long de l'avenue : 12 m, puis rattrapée en douceur à
    partir de quatre images avant le bond (sur neuf images, la caméra freinait à 3 g)."""
    return CAM_AHEAD + (CAM_CAUGHT - CAM_AHEAD) * M.smoothstep(T_GO - 4.0 / M.FPS, T_END, t)


def camera(t):
    """(x, y, z, lacet, site, roulis, focale) : sur un rail, sans secousse."""
    x, y = hero_pos(t)
    u = M.smoothstep(0.0, T_END, t)
    return x + CAM_SIDE, y + cam_ahead(t), CAM_Z, YAW0 + (YAW1 - YAW0) * u, PITCH, 0.0, LENS


if __name__ == "__main__":
    for f in (1, 8, 14, 20, 28):
        t = M.t_of(f)
        hy, py = hero_pos(t)[1], patrol_pos(t)[1]
        c = camera(t)
        print(f"image {f:2d} : berline y {hy:.2f} à {hero_speed(t) * 3.6:.0f} km/h, patrouille {hy - py:.1f} m derrière "
              f"à {_PATROL.v(t) * 3.6:.0f} km/h, x {patrol_pos(t)[0]:.2f}, cap {patrol_heading(t):.1f}°, "
              f"caméra y {c[1]:.2f} ({c[1] - hy:.2f} m devant), lacet {c[3]:.1f}°, "
              f"rampe {'allumée' if bars_on(f) else 'éteinte'}")
