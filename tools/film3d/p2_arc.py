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

# Elle entre comme elle sort de P1 (p1_avenue, lu à l'image qui suit sa dernière) : 3,45 m à gauche, 3,0 m devant,
# à la vitesse de la berline, en freinage établi de 7 m/s² (elle l'a dépassée et pile en voyant le rond-point). Elle
# ne tient pas à côté de la berline dans l'anneau : au plus près de l'îlot, la berline passe à 11,3 m de son centre,
# la bordure extérieure est à 15 m, et 1,5 m d'air plus une caisse de 1,95 m n'y tiennent pas ; elle ne peut pas
# non plus passer devant (il lui faudrait 6,2 m d'avance avant le virage). Elle tient donc son freinage (P1_HOLD0 s,
# puis P1_BRAKE m/s² pour rester dans le cercle d'adhérence quand elle tourne, relâché à l'à-coup P1_JERK pour finir
# arrêtée) ; elle s'écarte un peu à gauche (P1_WIDE) le temps que la berline la déborde en glissant, et cesse de
# tourner (P1_STRAIGHT) : elle s'arrête rampe allumée à l'entrée de l'anneau, hors du coin. Sa route : la ligne
# décalée du parcours, puis sa courbure qui s'éteint ; son profil, celui de sa vitesse vraie le long de cette route.
_P1T = P1.T_END + 1.0 / FPS                    # P2/1 est l'image qui suit P1/FRAMES
P1_SIDE = P1.hero_pos(_P1T)[0] - P1.patrol_pos(_P1T)[0]                  # 3,45 m
P1_LEAD0 = P1.patrol_pos(_P1T)[1] - P1.hero_pos(_P1T)[1]                 # 3,0 m
P1_V0 = P1.patrol_speed(_P1T)
P1_A0 = (P1.patrol_speed(_P1T + 1.0 / 96.0) - P1.patrol_speed(_P1T - 1.0 / 96.0)) * 48.0
P1_WIDE, P1_WIDE_S = 4.0, (3.0, 26.0)            # m à gauche ; m après la coupe (abscisses du parcours)
P1_STRAIGHT = (13.0, 21.0)                       # m de sa route après la coupe : elle cesse de tourner
P1_HOLD0, P1_BRAKE, P1_JERK = 0.3, 6.5, 10.0      # s, m/s², m/s³


def _smoother(a, b, x):
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * u * (u * (6.0 * u - 15.0) + 10.0)


def _p1_side_s(s):
    """Son écart à gauche de la route à l'abscisse s : P1_SIDE, élargi à P1_WIDE entre les abscisses P1_WIDE_S
    (comptées depuis la coupe ; quintique : ni la latérale ni l'à-coup ne sautent), le temps que la berline la
    déborde (sa glisse rapproche son avant)."""
    a, b = (hero_s(0.0) + x for x in P1_WIDE_S)
    return P1_SIDE + (P1_WIDE - P1_SIDE) * _smoother(a, b, s)


def _p1_line(s):
    x, y = _route_xy(s)
    h = math.radians(_route_cap(s))
    d = _p1_side_s(s)
    return x - d * math.cos(h), y - d * math.sin(h)


_S0 = hero_s(0.0) + P1_LEAD0
_LDS = 0.02


def _p1_dside(s):
    """La dérivée de son écart le long du parcours (m/m)."""
    a, b = (hero_s(0.0) + x for x in P1_WIDE_S)
    u = min(1.0, max(0.0, (s - a) / (b - a)))
    return (P1_WIDE - P1_SIDE) * 30.0 * u * u * (1.0 - u) * (1.0 - u) / (b - a)


def _p1_line_heading(s):
    """Le cap de la ligne décalée (radians) et sa longueur par mètre de parcours : sa tangente est
    T (1 − d κ) − d' N (T le cap du parcours, N sa droite, κ sa courbure)."""
    d, dd = _p1_side_s(s), _p1_dside(s)
    k = PC.ROUTE.at(s)[3]
    return math.radians(_route_cap(s)) + math.atan2(dd, 1.0 - d * k), math.hypot(1.0 - d * k, dd)


def _p1_path():
    """Sa route, [(x, y, cap)] tous les _LDS m de sa longueur vraie depuis 20 m avant la coupe : la ligne décalée
    (_p1_line) jusqu'à P1_STRAIGHT[0] m après la coupe, puis elle cesse peu à peu de tourner (le virage de la ligne
    s'éteint jusqu'à P1_STRAIGHT[1]) : elle pile droit devant elle, hors du coin de l'anneau. Caps et longueurs
    analytiques (aucune différence finie : le lacet reste lisse)."""
    la, lb = P1_STRAIGHT
    ds = 0.01
    s = _S0 - 20.0
    px, py = _p1_line(s)
    hl, g = _p1_line_heading(s)
    hp, L = hl, -20.0
    out = [(px, py, math.degrees(hp))]
    while s < _S0 + 120.0:
        h2, g2 = _p1_line_heading(s + ds)
        dl = 0.5 * (g + g2) * ds
        hm = hp + (h2 - hl) * (1.0 - _smoother(la, lb, L + dl / 2)) * 0.5
        hp += (h2 - hl) * (1.0 - _smoother(la, lb, L + dl / 2))
        qx, qy = px - math.sin(hm) * dl, py + math.cos(hm) * dl
        while L + dl >= -20.0 + len(out) * _LDS:
            u = (-20.0 + len(out) * _LDS - L) / dl
            out.append((px + (qx - px) * u, py + (qy - py) * u, math.degrees(hp - (h2 - hl) * (1 - u))))
        s, hl, g, px, py, L = s + ds, h2, g2, qx, qy, L + dl
    return out


_P1P = _p1_path()


def _p1_at(L):
    u = (L + 20.0) / _LDS
    k = max(0, min(len(_P1P) - 2, int(math.floor(u))))
    w = u - k
    return tuple(a + (b - a) * w for a, b in zip(_P1P[k], _P1P[k + 1]))


def _p1_keys():
    """Les sommets (t, accélération) de son freinage, linéaire entre eux : P1_A0 à la coupe, tenue P1_HOLD0 s, puis
    P1_BRAKE (moins fort dans l'anneau : sa latérale et son freinage restent dans le cercle d'adhérence), tenu,
    relâché pour finir à vitesse nulle (la tenue s'en déduit)."""
    t0 = P1_HOLD0
    t1 = t0 + abs(P1_BRAKE + P1_A0) / P1_JERK
    t3 = P1_BRAKE / P1_JERK
    v1 = P1_V0 + P1_A0 * t0 + (P1_A0 - P1_BRAKE) / 2.0 * (t1 - t0)
    hold = max(0.0, (v1 - P1_BRAKE * t3 / 2.0) / P1_BRAKE)
    return [(0.0, P1_A0), (t0, P1_A0), (t1, -P1_BRAKE), (t1 + hold, -P1_BRAKE), (t1 + hold + t3, 0.0)]


def _p1_accel(t):
    ks = _P1K
    if t <= 0.0:
        return P1_A0
    for (ta, aa), (tb, ab) in zip(ks, ks[1:]):
        if t <= tb:
            return aa + (ab - aa) * (t - ta) / max(1e-9, tb - ta)
    return 0.0


_P1K = _p1_keys()
_P1 = M.Profile(P1_V0, _p1_accel, t0=-2.0, t1=T_END + 2.0)
P1_STOP = _P1K[-1][0]              # l'instant où elle s'arrête


def patrol1_pos(t):
    return _p1_at(_P1.s(t))[:2]


def patrol1_heading(t):
    """Le cap de sa caisse, celui de sa route là où elle est (arrêtée comprise)."""
    return _p1_at(_P1.s(t))[2]


def p1_s(t):
    """L'abscisse du parcours à côté d'elle (m)."""
    return route_s(*patrol1_pos(t), _S0 + _P1.s(t))


def p1_side(t):
    """Son écart à gauche de la route (m)."""
    x, y = patrol1_pos(t)
    s = p1_s(t)
    rx, ry = _route_xy(s)
    h = math.radians(_route_cap(s))
    return -((x - rx) * math.cos(h) + (y - ry) * math.sin(h))


def patrol1_speed(t):
    return _P1.v(t)


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
P2_Y0 = 45.0                # son départ, à l'image 1 (m)
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


def patrol2_pos(t):
    return tuple(_p2().pos(t))[:2]


def patrol2_heading(t):
    """Le cap de sa caisse (glisse comprise)."""
    return _p2().heading(t)


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
    x, y, z = chase_pos(t)
    yaw, pitch = _aim_smooth(t)
    return PC.raccord("P2", _f(t), (x, y, z, yaw, pitch, 0.0, CHASE_LENS))   # la visée commune aux deux bouts


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
