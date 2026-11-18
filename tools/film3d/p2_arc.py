# Le plan P2 écrit une fois, indépendant du décor (docs/cinematique-decoupage-v3.md §4 P2, « le dérapage, sous le
# nez de la deuxième patrouille », repris au découpage v3.1 et à la feuille de route du parcours) : la berline et le
# bras de caméra lus dans le parcours unique (parcours.py, fenêtre « P2 »), les deux patrouilles, la visée. Rien ici
# ne lit Blender.
#
# Repère : celui de la scène F (l'îlot du rond-point en (0, 0), l'avenue vers +y, la rue des enseignes vers −x),
# où le parcours pose la fenêtre de P2 (son ancre). La berline arrive dans la voie de l'avenue (x 1,75) à 16,4 m/s,
# freine (feux stop du parcours), entre dans l'anneau à contresens en frôlant l'îlot, glisse d'une douzaine de
# degrés qui monte et se résorbe, remet les gaz avant la fin de l'arc et sort dans la voie de la rue des enseignes
# (y 0,35) : à la dernière image il lui reste 2,4° de courbe, P3 enchaîne sans coupe d'espace ni de temps (la pose
# de P2/111 est celle de P3/1). Une scène qui pose le plan ailleurs (le carrefour de la scène A) passe une pose
# (ox, oy, lacet) : to_scene.
#
# La patrouille 1 entre comme elle sort de P1 : à gauche, 3,45 m sur le côté, 3,0 m devant, à la vitesse de la
# berline, en freinage établi : elle pile, la berline la déborde en glissant à l'intérieur du virage, elle s'arrête
# rampe allumée à l'entrée de l'anneau (vers l'image 69) et sort du cadre par la gauche vers l'image 43 ; elle
# n'entre pas dans P3. La patrouille 2 descend l'avenue nord, de face, et vire derrière la berline à travers
# l'anneau : à la dernière image elle passe derrière la caméra, c'est elle qui poursuit dans P3.
import math

import motion as M
import p1_avenue as P1
import parcours as PC

FRAMES = dict(PC.SHOTS)["P2"]          # 110
F0 = 1
FPS = M.FPS
T_END = (FRAMES - 1) / FPS
V31 = True                  # le découpage v3.1 (cadre commun, voiture vraie) : vaut aussi V3
V3 = True                   # les plafonds v3 des tests (test_motion, motion.py mesure) s'appliquent à ce plan
STILL = 0.40                # l'instant de l'image fixe, de 0 (début du plan) à 1 (fin) : la glisse à sa crête
HERO = PC.hero("P2")        # la fenêtre du parcours, en image du plan (1 = la première)
HALF_L, HALF_W = 2.445, 0.94            # la caisse de la berline (motion.HERO_BOX : 4,89 × 1,88)
PATROL_L, PATROL_W = 5.1, 1.95          # celle d'une patrouille


def t_of(frame):
    return (frame - F0) / FPS


def _f(t):
    return F0 + t * FPS


# ---------------------------------------------------------------- la berline : la fenêtre du parcours

def hero_pos(t):
    """La berline (scène F), t en s depuis la première image ; définie avant elle (les ressorts de M.sample)."""
    return HERO["pos"](_f(t))


def hero_heading(t):
    """Le cap de la caisse (glisse comprise ; degrés, 0 vers +y, positif à gauche)."""
    return HERO["heading"](_f(t))


def hero_travel(t):
    return HERO["travel"](_f(t))


def hero_slip(t):
    return HERO["slip"](_f(t))


def hero_steer(t):
    return HERO["steer"](_f(t))


def hero_spin(t):
    """Le patinage des roues arrière (rapport à la vitesse du sol : 1 roule, plus glisse aux gaz)."""
    return HERO["spin"](_f(t))


def hero_speed(t):
    return HERO["speed"](_f(t))


def brake_windows():
    """Les fenêtres des feux stop (images du plan) : celles du parcours."""
    return PC.brake_windows("P2")


DRIFT = max(abs(hero_slip(t_of(f))) for f in range(F0, F0 + FRAMES))   # la crête de la glisse (12°)
F_DRIFT = max(range(F0, F0 + FRAMES), key=lambda f: abs(hero_slip(t_of(f))))


# ---------------------------------------------------------------- la route du parcours, dans la scène

_TO, _CAP = PC.placer("P2")


def _route_xy(s):
    x, y = _TO(*PC.ROUTE.at(s)[:2])
    return x, y


def _route_cap(s):
    return PC.ROUTE.at(s)[2] - _CAP


def route_s(x, y, s=None):
    """L'abscisse du parcours la plus proche du point (x, y) de la scène (Newton depuis s, ou depuis l'ancre)."""
    s = PC.ANCHOR["P2"][0][1] if s is None else s
    for _ in range(30):
        rx, ry = _route_xy(s)
        h = math.radians(_route_cap(s))
        step = (x - rx) * -math.sin(h) + (y - ry) * math.cos(h)
        s += step
        if abs(step) < 1e-7:
            break
    return s


def _hero_s_table():
    out, s = [], None
    for k in range(-48, 4 * (FRAMES + 48) + 1):
        s = route_s(*hero_pos(k / (4.0 * FPS)), s)
        out.append(s)
    return out


_HS = _hero_s_table()


def hero_s(t):
    """L'abscisse de la berline sur le parcours (m), interpolée au quart d'image."""
    u = t * 4.0 * FPS + 48
    k = max(0, min(len(_HS) - 2, int(math.floor(u))))
    return _HS[k] + (_HS[k + 1] - _HS[k]) * (u - k)


# ---------------------------------------------------------------- la patrouille 1

# Elle entre comme elle sort de P1 (p1_avenue) : 3,4 m à gauche, 7 m derrière (à côté de la caméra, hors du cadre),
# à la vitesse de la berline, en freinage établi de 6,95 m/s². Jusqu'à v10 elle tenait ce freinage, cessait de
# tourner et s'arrêtait rampe allumée à l'entrée de l'anneau : le film perdait sa poursuivante, et celle du pont
# surgissait de nulle part à 118 km/h. Depuis v11 (SPEC §18.71) elle est la suiveuse de police.py : elle freine
# dans sa voie jusqu'à l'entrée de l'anneau (5 m/s au plus bas, là où elle s'arrêtait), se rabat sur la ligne de la
# berline et remet les gaz derrière elle, par l'anneau et la rue des enseignes, jusqu'à sa place du pont. Une seule
# voiture, une seule loi, écrite en ville et en temps du film ; ici, sa lecture dans le repère de ce tronçon.
import police as _police  # noqa: E402


def patrol1_pos(t):
    return _police.suiveuse_scene("P2", t)


def patrol1_heading(t):
    """Le cap de sa caisse, celui de sa course."""
    return _police.suiveuse_cap_scene("P2", t)


def patrol1_speed(t):
    return _police.suiveuse_vitesse(_police.g_de("P2", t))


def p1_s(t):
    """L'abscisse du parcours à côté d'elle (m)."""
    return route_s(*patrol1_pos(t))


def p1_side(t):
    """Son écart à gauche de la route (m)."""
    x, y = patrol1_pos(t)
    s = p1_s(t)
    rx, ry = _route_xy(s)
    h = math.radians(_route_cap(s))
    return -((x - rx) * math.cos(h) + (y - ry) * math.sin(h))


def patrol1_lead(t):
    """Son avance sur la berline, le long du parcours (m)."""
    return p1_s(t) - hero_s(t)


# ---------------------------------------------------------------- la patrouille 2

# Elle descend l'avenue nord dans la voie de gauche (x P2_X, cap 180), de face pour la caméra pendant que la
# berline tourne : elle traverse le cadre de gauche à droite au-dessus du toit (images 1 à 57), arrive à la bouche
# nord et vire derrière la berline, sur un arc de P2_R m à travers le quart nord-ouest de l'anneau (la bordure de
# l'angle à 1,4 m de sa caisse, l'îlot à 1,5 m), qui la pose dans la rue des enseignes à y P2_EXIT_Y. Sa conduite est
# celle de l'outil commun (motion.drive : freinage avant le virage, glisse installée et résorbée, contre-braquage) ;
# à la dernière image, elle passe derrière la caméra, à 5,9 m, en sortie de glisse et relancée : la poursuivante de
# P3. Rampe allumée tout le plan.
P2_X = -1.75
P2_Y0 = 48.0                # son départ, à l'image 1 (m)
P2_R = 16.0                 # le rayon de son virage dans l'anneau (m)
P2_EXIT_Y = 1.0             # sa ligne dans la rue des enseignes, 0,65 m à gauche de celle de la berline
P2_ROUTE = dict(start=(P2_X, P2_Y0, 180.0),
                pieces=[(P2_Y0 - P2_EXIT_Y - P2_R, 0.0), (P2_R * math.pi / 2, -1.0 / P2_R), (40.0, 0.0)])
P2_SPEED = 14.0             # m/s voulus (50 km/h) : le virage la ralentit, elle relance ensuite
P2_T0 = t_of(1)
_P2D = None


def _p2():
    global _P2D
    if _P2D is None:
        _P2D = M.drive(P2_ROUTE, P2_SPEED, t0=P2_T0, kind="patrol", t_span=(-2.0, T_END + 2.0))
    return _P2D


# Depuis v11 (SPEC §18.71) elle ne vire plus derrière la berline : la patrouille 1, la suiveuse (police.py), lui
# coupe la route dans l'anneau, sur la ligne de la berline. Elle pile : dès P2_PILE[0] s du plan elle laisse tomber
# son allure à zéro en P2_PILE[1] s, sur la trace de sa conduite (place, cap, glisse lus à son horloge ralentie), et
# s'arrête rampe allumée à la bouche est de l'anneau, avant la fin du plan. Jusqu'à v10 elle entrait dans la rue sur
# la ligne de la berline et s'arrêtait devant la trouée du barrage : la suiveuse la percutait.
P2_PILE = ((124 - PC.START["P2"]) / FPS, 3.5)


def _p2_horloge(t):
    """L'instant de sa conduite (motion.drive) qu'elle occupe à l'instant t du plan : le même jusqu'à P2_PILE[0],
    puis son horloge ralentit jusqu'à l'arrêt (allure × 1 - (3u² - 2u³), u de 0 à 1 sur P2_PILE[1] s)."""
    tb, d = P2_PILE
    u = min(1.0, max(0.0, (t - tb) / d))
    return t if u <= 0.0 else tb + d * (u - u ** 3 + 0.5 * u ** 4)


P2_STOP = P2_PILE[0] + P2_PILE[1]           # s : elle est arrêtée


def patrol2_pos(t):
    return tuple(_p2().pos(_p2_horloge(t)))[:2]


def patrol2_heading(t):
    """Le cap de sa caisse (glisse comprise)."""
    return _p2().heading(_p2_horloge(t))


# Les clés posées avant l'image 1, en images (audit des mouvements, 18 novembre) : la patrouille 2 est dans le cadre
# de P2/1, déjà lancée (de face, au fond de l'avenue nord) ; ville.py la garde donc dans P1, à la place et dans l'état
# de ses clés. Sans clés avant P2/1, elle y restait figée à sa première clé pendant tout P1, puis partait d'un coup :
# la scène la clé depuis P1/1 (sa conduite, motion.drive, roule déjà tout droit dans l'avenue nord avant le plan).
CLES_AVANT = {"patrol_2": dict(PC.SHOTS)["P1"]}


def patrol_pos(i):
    return patrol1_pos if i == 0 else patrol2_pos


def patrol_slip(i):
    """La patrouille 1 ne glisse pas ; la patrouille 2 a son cap propre (patrol_heading)."""
    return (lambda t: 0.0) if i == 0 else None


def patrol_heading(i):
    return patrol1_heading if i == 0 else patrol2_heading


def tracks():
    """{nom: pos(t)} des trois véhicules (pour vérifier les distances)."""
    return {"hero": hero_pos, "patrol_1": patrol1_pos, "patrol_2": patrol2_pos}


def tracks_heading():
    """{nom: cap(t)} des caisses des patrouilles."""
    return {"patrol_1": patrol1_heading, "patrol_2": patrol2_heading}


def cars(t=STILL):
    """Les trois véhicules à l'instant t du plan (0 à 1) : {nom: (x, y, cap de la marche, lacet de la caisse)}."""
    tt = t * T_END
    x, y = hero_pos(tt)
    out = {"hero": (x, y, hero_travel(tt), hero_heading(tt))}
    x, y = patrol1_pos(tt)
    out["patrol_1"] = (x, y, patrol1_heading(tt), patrol1_heading(tt))
    x, y = patrol2_pos(tt)
    out["patrol_2"] = (x, y, patrol2_heading(tt), patrol2_heading(tt))
    return out


# ---------------------------------------------------------------- l'air entre les caisses, et l'objectif

def _corners(x, y, head, half_l, half_w):
    h = math.radians(head)
    fx, fy = -math.sin(h), math.cos(h)
    return [(x + fx * half_l * a + fy * half_w * b, y + fy * half_l * a - fx * half_w * b)
            for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


def _seg_dist(p, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]
    u = max(0.0, min(1.0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / max(1e-12, ax * ax + ay * ay)))
    return math.hypot(p[0] - a[0] - u * ax, p[1] - a[1] - u * ay)


def _inside(p, poly):
    s = [((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) for a, b in zip(poly, poly[1:] + poly[:1])]
    return all(v >= 0 for v in s) or all(v <= 0 for v in s)


def box_gap(pa, pb):
    """L'air entre deux rectangles (listes de coins) : 0 s'ils se touchent."""
    if any(_inside(p, pb) for p in pa) or any(_inside(p, pa) for p in pb):
        return 0.0
    return min([_seg_dist(p, a, b) for p in pa for a, b in zip(pb, pb[1:] + pb[:1])]
               + [_seg_dist(p, a, b) for p in pb for a, b in zip(pa, pa[1:] + pa[:1])])


def body_gap(t, which=0):
    """L'air entre la caisse de la berline et celle de la patrouille `which` (m)."""
    hx, hy = hero_pos(t)
    px, py = patrol_pos(which)(t)
    return box_gap(_corners(hx, hy, hero_heading(t), HALF_L, HALF_W),
                   _corners(px, py, patrol_heading(which)(t), PATROL_L / 2, PATROL_W / 2))


def lens_gap(t, which=0):
    """L'air entre l'objectif et la caisse de la patrouille `which` (m, au sol)."""
    c = camera_rail(t)
    px, py = patrol_pos(which)(t)
    poly = _corners(px, py, patrol_heading(which)(t), PATROL_L / 2, PATROL_W / 2)
    if _inside(c[:2], poly):
        return 0.0
    return min(_seg_dist(c[:2], a, b) for a, b in zip(poly, poly[1:] + poly[:1]))


# Le coin sud-ouest de l'anneau, l'intérieur du virage : la berline y coupe la corde. Son nez de bordure (anneau de
# 15 m, branches de 7 et 4 m de demi-largeur) passait à 2 cm de la caisse vers l'image 80 ; en ville, scene_f l'arrondit
# en évasement de sortie : un arc de FLARE_R m (le nez de bordure) tangent à l'anneau et au bord de la rue, tangent à
# ce bord au joint même (X_RUE), le plus grand arc qui ne fasse pas de cran avec la bordure de la rue. La caisse de la
# berline passe alors à 0,7 m de la bordure (P2/82) ; au joint, la bordure de la rue (y −4) n'en laisse que 0,8. Les
# cotes sont celles du nez (la face de la bordure côté chaussée) ; scene_f les lit ici.
RING_FACE = 15.0                 # le nez de la bordure de l'anneau (scene_f.R_OUT)
# le joint avec la rue des enseignes : s 91 de la scène B (scene_b.Y_END), passé dans ce repère par le parcours
X_RUE = PC.placer("P2")[0](*PC._to_route("P3")(0.0, 91.0))[0]                    # −18,154
FLARE_R = (X_RUE ** 2 + 4.0 ** 2 - RING_FACE ** 2) / (2.0 * RING_FACE - 2.0 * 4.0)   # 5,48 : centre en x X_RUE
ENTRY_R = 10.0                   # l'évasement d'entrée, de l'avenue sud dans l'anneau


def flare():
    """(cx, cy, angle de la tangente sur l'anneau vu du centre de l'évasement, en degrés) : le centre de l'arc,
    tangent extérieurement à l'anneau et au bord y = −4 de la rue."""
    cy = -(4.0 + FLARE_R)
    cx = -math.sqrt((RING_FACE + FLARE_R) ** 2 - cy ** 2)
    return cx, cy, math.degrees(math.atan2(-cy, -cx))


def entry_flare():
    """(cx, cy, angle de la tangente sur l'anneau vu du centre de l'évasement, en degrés) : l'évasement d'entrée,
    tangent extérieurement à l'anneau et au bord x = −7 de l'avenue sud."""
    cx = -(7.0 + ENTRY_R)
    cy = -math.sqrt((RING_FACE + ENTRY_R) ** 2 - cx ** 2)
    return cx, cy, math.degrees(math.atan2(-cy, -cx))


def sw_kerb(ville=True):
    """Le nez de la bordure du coin sud-ouest, de l'avenue à la rue : [(x, y)] dans la scène."""
    if ville:
        ex, ey, a_e = entry_flare()
        cx, cy, a_f = flare()
        a_sud, a_ring = a_e + 180.0, a_f + 180.0
        entry = [(ex + ENTRY_R * math.cos(math.radians(a)), ey + ENTRY_R * math.sin(math.radians(a)))
                 for a in (a_e * k / 24 for k in range(25))]
        arc = [(cx + FLARE_R * math.cos(math.radians(a)), cy + FLARE_R * math.sin(math.radians(a)))
               for a in (a_f + (90.0 - a_f) * k / 24 for k in range(25))]
    else:
        a_sud = 270.0 - math.degrees(math.asin(7.0 / RING_FACE))
        a_ring, entry, arc = 180.0 + math.degrees(math.asin(4.0 / RING_FACE)), [], []
    ring = [(RING_FACE * math.cos(math.radians(a)), RING_FACE * math.sin(math.radians(a)))
            for a in (a_sud + (a_ring - a_sud) * k / 32 for k in range(33))]
    return [(-7.0, -25.0)] + entry + ring + arc + [(-45.0, -4.0)]


SW_KERB = sw_kerb()
# le nez de la bordure de l'angle nord-ouest, du bord ouest de l'avenue nord (x −7) au bord nord de la rue (y 4) par
# l'anneau : la patrouille 2 le longe en virant derrière la berline
NW_KERB = [(-7.0, 46.0)] + [(RING_FACE * math.cos(math.radians(a)), RING_FACE * math.sin(math.radians(a)))
           for a in (90.0 + math.degrees(math.asin(7.0 / RING_FACE)) + (90.0 - math.degrees(math.asin(7.0 / RING_FACE))
                     - math.degrees(math.asin(4.0 / RING_FACE))) * k / 32 for k in range(33))] + [(-45.0, 4.0)]


def _poly_line_gap(poly, edge):
    if any(_inside(p, poly) for p in edge):
        return 0.0
    return min([_seg_dist(p, a, b) for p in poly for a, b in zip(edge, edge[1:])]
               + [_seg_dist(p, a, b) for p in edge for a, b in zip(poly, poly[1:] + poly[:1])])


def kerb_gap(t, which=0):
    """L'air entre la caisse de la patrouille `which` (ou de la berline : which = None) et la bordure du coin
    sud-ouest (l'intérieur du virage) ; pour une patrouille, aussi celle de l'angle nord-ouest."""
    if which is None:
        x, y = hero_pos(t)
        return _poly_line_gap(_corners(x, y, hero_heading(t), HALF_L, HALF_W), SW_KERB)
    px, py = patrol_pos(which)(t)
    poly = _corners(px, py, patrol_heading(which)(t), PATROL_L / 2, PATROL_W / 2)
    return min(_poly_line_gap(poly, SW_KERB), _poly_line_gap(poly, NW_KERB))


def island_gap(t, which=0):
    """L'air entre la caisse de la patrouille `which` et la bordure de l'îlot (rayon 6 m)."""
    px, py = patrol_pos(which)(t)
    poly = _corners(px, py, patrol_heading(which)(t), PATROL_L / 2, PATROL_W / 2)
    return min(min(math.hypot(*p) for p in poly),
               min(math.hypot(*[a[i] + (b[i] - a[i]) * u / 8 for i in (0, 1)]) for a, b in zip(poly, poly[1:] + poly[:1])
                   for u in range(9))) - 6.0


# ---------------------------------------------------------------- la trace des roues

def wheel_track(lx, ly, t=STILL, step=1.0 / 96.0, t0=-0.5):
    """La trace d'une roue de la berline, de t0 (s) jusqu'à l'instant t (0 à 1) du plan : [(x, y, instant)] dans
    la scène, pas de step s. (lx, ly) : la roue dans le repère de la caisse (avant vers −y, comme les modèles posés
    dans la rue). En glisse, les roues arrière s'écartent de la trace des roues avant, vers l'extérieur."""
    t1 = t * T_END
    out = []
    n = max(2, int((t1 - t0) / step))
    for i in range(n + 1):
        tt = t0 + (t1 - t0) * i / n
        x, y = hero_pos(tt)
        a = math.radians(hero_heading(tt) + 180.0)
        out.append((x + lx * math.cos(a) - ly * math.sin(a), y + lx * math.sin(a) + ly * math.cos(a), tt))
    return out


# ---------------------------------------------------------------- la caméra de poursuite (le bras commun, v3.1)
#
# Le bras du parcours (parcours.camera : 7,5 m derrière le centre de la berline le long de son cap filtré, 0,3 m à
# sa gauche, 2,4 m de haut), 24 mm. Lacet et site posent le centre de la boîte de la berline (glisse comprise) à
# CHASE_U depuis la gauche et CHASE_FRAME_Y depuis le haut, tout le plan : la place que P1 lui laisse et que P3
# reprend. Aucun tremblé écrit : celui de l'opérateur vient de motion.py.
CHASE_LENS = 24.0
CHASE_U = 0.50
CHASE_FRAME_Y = 0.58
HERO_MID_Z = 0.725          # m : le milieu de la boîte de la berline (motion.HERO_BOX)


def chase_pos(t):
    return PC.camera("P2", _f(t))


def _aim(t):
    """Le lacet et le site qui posent la boîte de la berline (motion.hero_screen) à (CHASE_U, CHASE_FRAME_Y)."""
    x, y, z = chase_pos(t)
    hx, hy = hero_pos(t)
    yaw = math.degrees(math.atan2(-(hx - x), -(hy - y)))   # motion.key_camera : 0 regarde -y, positif vers -x
    pitch = math.degrees(math.atan2(HERO_MID_Z - z, math.hypot(hx - x, hy - y)))
    head = hero_heading(t)
    for _ in range(4):
        box = M.hero_screen((x, y, z, yaw, pitch, 0.0, CHASE_LENS), hx, hy, 0.0, head)
        if not box:
            break
        yaw += math.degrees(math.atan(2.0 * (box["u"] - CHASE_U) * 10.125 / CHASE_LENS))
        pitch -= math.degrees(math.atan(2.0 * (box["v"] - CHASE_FRAME_Y) * 18.0 / CHASE_LENS))
    return yaw, pitch


# La visée lissée : le lacet et le site qui tiennent la berline à sa place, moyennés sur une fenêtre gaussienne de
# AIM_SIGMA s (au quart d'image). Tenue exactement, la berline qui entre dans le virage donnait au panoramique une
# accélération de 3,4 largeurs/s² (image 24, plafond 1,2) ; lissée, elle bouge de quelques % dans le cadre.
AIM_SIGMA = 0.35
AIM_LAND = 1.0              # s : la dernière seconde, où la visée lissée rejoint la visée exacte
_AQ = 4 * FPS
_AIM0 = -2.0


def _aim_table():
    out, prev = [], None
    for k in range(int((T_END + 4.0) * _AQ) + 1):
        yaw, pitch = _aim(_AIM0 + k / _AQ)
        if prev is not None:
            yaw = prev + (yaw - prev + 180.0) % 360.0 - 180.0       # sans saut de 360°
        out.append((yaw, pitch))
        prev = yaw
    return out


_AIMS = _aim_table()


def _aim_smooth(t):
    n = int(3 * AIM_SIGMA * _AQ)
    c = (t - _AIM0) * _AQ
    k0 = int(round(c))
    wy = wp = ws = 0.0
    for k in range(k0 - n, k0 + n + 1):
        j = max(0, min(len(_AIMS) - 1, k))
        w = math.exp(-0.5 * ((k - c) / (AIM_SIGMA * _AQ)) ** 2)
        wy += w * _AIMS[j][0]
        wp += w * _AIMS[j][1]
        ws += w
    wy, wp = wy / ws, wp / ws
    if t <= T_END - AIM_LAND:
        return wy, wp
    # la dernière seconde : la visée rejoint la visée exacte, celle que P3 tient dès son image 1 (sans quoi la
    # berline, à 47,7 % à P2/110, sautait à 50 % à la coupe) ; fondu quintique, sans saut de vitesse ni d'accélération
    ey, ep = _aim(t)
    ey = wy + (ey - wy + 180.0) % 360.0 - 180.0
    x = min(1.0, (t - T_END + AIM_LAND) / AIM_LAND)
    k = x * x * x * (10.0 - 15.0 * x + 6.0 * x * x)
    return wy + (ey - wy) * k, wp + (ep - wp) * k


def camera_rail(t):
    """La caméra sans tremblé : (x, y, z, lacet, site, roulis, focale), dans la scène (motion.key_camera)."""
    return PC.chase("P2", _f(t))       # LA caméra du film : le bras commun à la visée commune (17 novembre)


def camera(t):
    """La caméra de P2 : camera_rail telle quelle (v3.1 : le tremblé est celui de l'opérateur, motion.py)."""
    return camera_rail(t)


camera.bras_commun = "P2"      # motion.camera_operator : vibration sur le temps du film, écarts fondus aux bouts


def patrol_screen(t, which=0):
    """La boîte de la patrouille `which` à l'écran (motion.hero_screen), None hors champ."""
    px, py = patrol_pos(which)(t)
    return M.hero_screen(camera_rail(t), px, py, 0.0, patrol_heading(which)(t), box=(PATROL_L, PATROL_W, 1.5))


# ---------------------------------------------------------------- l'ancien drone (scene_carrefour.drone, la scène A)
CAM_HEAD = 37.0             # le cap de la berline sous le drone
CAM_Z = 40.0                # m
CAM_LENS = 35.0             # mm
CAM_YAW0, CAM_TURN = 40.0, 10.0


def drone_camera(t=STILL):
    """(x, y, z, lacet en degrés, focale) : l'ancien drone à la verticale de la berline quand elle a tourné de
    CAM_HEAD degrés (scene_carrefour.drone)."""
    f = min(range(F0, F0 + FRAMES), key=lambda g: abs(hero_travel(t_of(g)) - CAM_HEAD))
    x, y = hero_pos(t_of(f))
    return x, y, CAM_Z, CAM_YAW0 + CAM_TURN * t, CAM_LENS


def drone_yaw(t):
    return CAM_YAW0 + CAM_TURN * t / T_END


def to_scene(pose, x, y, heading=0.0):
    """Passe un point (et un cap, en degrés) du repère du plan (la scène F) au repère d'une autre scène : pose = (ox,
    oy, lacet)."""
    ox, oy, yaw = pose
    a = math.radians(yaw)
    return (ox + x * math.cos(a) - y * math.sin(a), oy + x * math.sin(a) + y * math.cos(a), heading + yaw)


def report(frames=None):
    """Le plan image par image : berline, patrouilles (avance, air, à l'écran), caméra."""
    lines = []
    for f in frames or list(range(1, FRAMES + 1, 6)) + [FRAMES]:
        t = t_of(f)
        c = camera_rail(t)
        car = M.hero_screen(c, *hero_pos(t), 0.0, hero_heading(t))
        b1, b2 = patrol_screen(t, 0), patrol_screen(t, 1)

        def where(b):
            if not b or b["u1"] < 0 or b["u0"] > 1:
                return "hors champ"
            return f"x {max(0.0, b['u0']) * 100:3.0f}-{min(1.0, b['u1']) * 100:3.0f} %"
        lines.append(
            f"{f:3d} : berline {hero_speed(t):5.2f} m/s glisse {hero_slip(t):+5.1f}° x {car['u'] * 100:3.0f} "
            f"y {car['v'] * 100:3.0f} l {car['w'] * 100:3.0f} % | p1 {patrol1_speed(t):5.2f} m/s, avance "
            f"{patrol1_lead(t):+5.2f} m à {p1_side(t):.2f}, air {body_gap(t, 0):4.2f}, bordure {kerb_gap(t, 0):4.2f}, objectif "
            f"{lens_gap(t, 0):4.1f}, {where(b1)} | p2 air {body_gap(t, 1):5.1f}, {where(b2)}")
    return "\n".join(lines)


if __name__ == "__main__":          # python3 tools/film3d/p2_arc.py : le plan, image par image
    print(report())
