# Le plan P1 écrit une fois, sans Blender (docs/cinematique-decoupage-v3.md §4, « la patrouille fond sur elle, elle
# bondit », reprise du 12 au soir) : 1,5 s après la dernière image d'OUV (ellipse), la berline sur la même voie, à la
# même vitesse (50 km/h), à la position d'OUV prolongée. Pendant l'ellipse la patrouille a fait demi-tour : elle
# arrive lancée sur la voie d'en face (92 km/h), rampe allumée, à côté de la caméra et hors champ ; elle entre par
# le bord gauche à l'image 7, sa rampe dans le cadre à partir de 21 ; elle freine pour se caler à la hauteur de la
# berline vers 34, vue de trois quarts arrière ; la berline bondit à 32 et lui reprend un mètre, la patrouille reste
# au bord gauche, rampe comprise.
# La caméra la suit de dos : 8 m derrière et 0,55 m du sol à la première image (le raccord d'OUV), elle monte à
# 1,4 m pour voir par-dessus le coffre de la patrouille, recule à 9,3 m et glisse vers la gauche (de 0,3 à 1,6 m),
# le lacet et le site recalculés à chaque image pour tenir la berline à sa place dans le cadre.
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

# La patrouille, voie d'en face : x -1,7, 1,53 m d'air avec le flanc de la berline quand elle est à sa hauteur.
# Elle arrive lancée, son centre R1 par rapport à celui de la berline à la première image (à côté de l'objectif,
# hors champ), et freine d'un seul tenant jusqu'à rouler à sa vitesse à T_MATCH, son centre alors R_MATCH devant le
# sien : à sa hauteur, de trois quarts arrière, la rampe dans le cadre (plus en arrière, la rampe sortait par le
# bord gauche : avec la berline au centre droit et 33 % de large au moins, le grand-angle de 24 mm ne voit pas plus
# loin à gauche). Au bond elle lève le pied et recule vers le bord gauche. Partir derrière l'objectif et le doubler
# vers l'image 12-16 demandait de freiner à plus de 1 g pour se caler à sa hauteur avant le bond : elle part à côté
# de lui, hors champ.
LANE_X = -1.7
R1 = -7.5                           # m : son nez 3 m devant l'objectif, mais à 35° de l'axe, hors champ
R_MATCH = 0.5
T_MATCH = M.t_of(34)
W0 = 2.0 * (R_MATCH - R1) / T_MATCH  # m/s de plus que la berline au départ (11,6 : 92 km/h)
DECEL = W0 / T_MATCH                # m/s² : elle freine fort (8,5) pour se caler à sa hauteur
PAT_LIFT = 1.5                      # m/s² : au bond, elle lève le pied, la berline lui reprend un peu plus d'un mètre

# la caméra (repère du monde : l'avenue vers +y, l'océan à x > 0) : un seul mouvement, de la première image à
# CAM_T1, en cosinus (vitesse et accélération nulles aux deux bouts) : elle recule, glisse vers la voie d'en face
# (derrière la patrouille, qu'elle voit de trois quarts arrière) et monte par-dessus son coffre ; d'un seul tenant
# pour que l'accélération par rapport à la berline reste sous 4 m/s²
BACK0, BACK1 = 8.0, 9.3             # m derrière le centre de la berline
SIDE0, SIDE1 = -0.3, -1.6           # m à sa droite (négatif : à sa gauche)
Z0, Z1 = 0.55, 1.4                  # hauteur : le raccord d'OUV, puis par-dessus le coffre de la patrouille
CAM_T1 = M.t_of(42)
CAM_FOLLOW = 0.6                    # la part de l'élan du bond que la caméra suit
# la berline dans le cadre : centre x (fraction de la largeur), du raccord au centre droit, puis 57 % à la fin ;
# centre y 55 % depuis le haut (son centre à HERO_ZC du sol)
U0, U30, U48 = 0.52, 0.60, 0.57
V_HERO = 0.55
HERO_ZC = 0.72
LENS = 24.0
FOCUS, FSTOP = 9.0, 5.6             # la berline nette, la patrouille à peine moins
STILL = 30                          # l'image fixe (banc) : la patrouille calée à sa hauteur, juste avant le bond

# ce que la berline frôle (fx.py en tire les effets) : trois feuilles de papier à plat 1,4 m à droite de sa ligne,
# 20 m devant elle au départ, que son passage soulève (images 36 à 44)
PAPERS = ((3.15, 309.4, 20.0), (3.55, 310.1, -35.0), (2.95, 310.9, 70.0))   # x, y, rotation (degrés)
# les phares de la patrouille pleins (plus de veilleuse)
PATROL_HEAD_W = 450.0
PATROL_HEAD_LENS = 1.0

HALF_W = math.atan(10.125 / LENS)            # demi-champ horizontal
HALF_H = math.atan(18.0 / LENS)              # demi-champ vertical


def _accel(t):
    return 0.0 if t < T_GO else ACCEL * min(1.0, (t - T_GO) / 0.15)


_PROF = M.Profile(OUV.SPEED, _accel)


def hero_pos(t):
    """OUV prolongé de l'ellipse à vitesse constante, puis le profil de P1 (le bond à T_GO)."""
    return OUV.HERO_X, OUV.hero_pos(T_CUT)[1] + _PROF.s(t)


def hero_speed(t):
    return _PROF.v(t)


def _patrol_accel(t):
    if t < T_MATCH:
        return -DECEL
    return -PAT_LIFT * min(1.0, (t - T_GO) / 0.3) if t >= T_GO else 0.0


_PATROL = M.Profile(OUV.SPEED + W0, _patrol_accel)


def patrol_pos(t):
    """Voie d'en face ; lancée, elle freine jusqu'à la vitesse de la berline, puis lève le pied au bond."""
    return LANE_X, OUV.hero_pos(T_CUT)[1] + R1 + _PATROL.s(t)


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


def _ease(t):
    """0 à 1 en cosinus de la première image à CAM_T1."""
    u = min(1.0, max(0.0, t / CAM_T1))
    return 0.5 - 0.5 * math.cos(math.pi * u)


def cam_back(t):
    """La distance de la caméra au centre de la berline : de BACK0 à BACK1, plus, au bond, la part de l'élan qu'elle
    ne suit pas."""
    extra = _PROF.s(t) - OUV.SPEED * t
    return BACK0 + (BACK1 - BACK0) * _ease(t) + (1.0 - CAM_FOLLOW) * extra


def _target_u(t):
    a = M.smoothstep(0.0, M.t_of(30), t)
    b = M.smoothstep(M.t_of(30), T_END, t)
    return U0 + (U30 - U0) * a + (U48 - U30) * b


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale) : sur un rail qui monte et glisse à gauche, sans secousse ; le lacet et
    le site posent le centre de la berline à (_target_u, V_HERO) du cadre."""
    hx, hy = hero_pos(t)
    x = hx + SIDE0 + (SIDE1 - SIDE0) * _ease(t)
    y = hy - cam_back(t)
    z = Z0 + (Z1 - Z0) * _ease(t)
    dx, dy = hx - x, hy - y
    # lacet de motion.key_camera : 180 vers +y, plus vers +x ; la berline à droite de l'axe de phi ; puis deux pas de
    # Newton sur la boîte projetée (motion.hero_screen), dont le centre n'est pas celui de la caisse
    phi = math.degrees(math.atan((_target_u(t) - 0.5) * 2.0 * math.tan(HALF_W)))
    yaw = 180.0 + math.degrees(math.atan2(dx, dy)) - phi
    beta = math.degrees(math.atan((V_HERO - 0.5) * 2.0 * math.tan(HALF_H)))
    pitch = math.degrees(math.atan2(HERO_ZC - z, math.hypot(dx, dy))) + beta
    want = (_target_u(t), V_HERO)
    for _ in range(2):
        b0 = M.hero_screen((x, y, z, yaw, pitch, 0.0, LENS), hx, hy, 0.0, 0.0)
        bu = M.hero_screen((x, y, z, yaw + 0.1, pitch, 0.0, LENS), hx, hy, 0.0, 0.0)
        bv = M.hero_screen((x, y, z, yaw, pitch + 0.1, 0.0, LENS), hx, hy, 0.0, 0.0)
        yaw += 0.1 * (want[0] - b0["u"]) / (bu["u"] - b0["u"])
        pitch += 0.1 * (want[1] - b0["v"]) / (bv["v"] - b0["v"])
    return x, y, z, yaw, pitch, 0.0, LENS


def camera(t):
    """La caméra du plan : le rail, sans tremblé écrit (l'opérateur de motion.key_camera s'y ajoute au rendu)."""
    return camera_rail(t)


# Le phare lointain (découpage v3, §3) : comme en OUV (ouv_avenue.phare_pose), 600 m devant la caméra de la première
# image, sur un cap sombre ; même repli : à 0,55 m du sol, le mur de la promenade le cache jusqu'à la lanterne, d'où
# 1,3° comme en OUV (le tableau demandait 1,2). 21° à droite de l'axe et non 14 : la berline va au centre droit
# (x 52 à 60 %, 38 % de large) et la caméra tourne vers la droite pour l'y tenir ; à 14°, le phare passait de x 75 à
# 64 % et se cachait derrière son toit des images 13 à 20. À 21°, x 91 % à la première image, 80 % à la dernière,
# toujours à plus de 4 % du bord droit de la berline et à plus de 9° de son centre.
# Phase : de 90 à 180° sur le plan (48 images à 45°/s), à plus de 20° de l'objectif (249° vu du phare) : comme en
# OUV, celle qui montre le moins de pinceau sur l'horizon (26 % de la largeur à l'image 1, 87 % à la dernière).
PHARE_ECART = 21.0
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
              f"{body_gap(t):.2f} m d'air, objectif {lens_gap(t):.2f} m, {where} | caméra {cam_back(t):.2f} m, "
              f"{c[0] - hx:+.2f}, z {c[2]:.2f}, lacet {c[3]:.1f}, site {c[4]:.1f}")
