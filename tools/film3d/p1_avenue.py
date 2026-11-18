# Le plan P1 écrit une fois, sans Blender. Depuis le 17 novembre (SPEC §18.55, le trajet roulé) : la fenêtre « P1 »
# du parcours unique (parcours.py), 31 images entre OUV et P2, la fin de l'avenue pendant le freinage du rond-point
# (la berline y passe de 93 à 63 km/h, feux stop allumés). La patrouille 1 (une autre voiture que la garée d'OUV,
# ouv_avenue.chaser_pos lit la même loi) est en chasse depuis avant OUV/1 : elle remonte la berline par la voie d'en
# face jusqu'à sa portière arrière, rampe allumée au bord gauche du cadre, et freine plus fort qu'elle à l'approche
# du rond-point : à P2/1, 2 m derrière elle, à sa vitesse, en freinage établi (P2 la voit se faire déborder).
# La berline et le bras de la caméra se lisent dans le parcours (fenêtre « P1 ») : rien du chemin n'est écrit ici.
import math

import contacts as C
import motion as M
import ouv_avenue as OUV
import parcours as PC

FRAMES = dict(PC.SHOTS)["P1"]
F0 = 1
V3 = True                           # les plafonds v3 de test_motion.py s'appliquent
V31 = True                          # et ceux du découpage v3.1 (cadre commun, conduite)
T_END = (FRAMES - 1) / M.FPS
HERO = PC.hero("P1")                # la fenêtre du parcours, en image du plan (1 = la première)


def _f(t):
    return F0 + t * M.FPS


# l'ellipse d'OUV dans la scène A (nulle : les deux fenêtres se touchent) : la place de la première image de P1 sur l'avenue, comptée en secondes d'OUV
# prolongé à vitesse constante (elle se déduit des ancres du parcours ; nulle quand les deux fenêtres se touchent)
ELLIPSIS = (HERO["pos"](F0)[1] - OUV.hero_pos(OUV.T_END)[1]) / OUV.SPEED - 1.0 / M.FPS

# La patrouille, voie d'en face : x -1,7, 3,45 m à gauche de la berline (1,5 m d'air entre les caisses). Trois
# secondes avant OUV/1 elle roule LEAD0 m derrière la berline (hors du cadre, à gauche de la caméra) ; elle la
# remonte jusqu'à sa portière arrière (son avant au bord gauche du cadre dès OUV/1) et y reste ; elle freine plus fort
# qu'elle au rond-point et entre dans P2 comme P2 l'attend : LEAD_END m (derrière), à sa vitesse, en freinage établi
# de PATROL_BRAKE m/s². Plus de dépassement : à 2 m devant, la berline lancée la percutait dans son dérapage de P2.
LANE_X = -1.7
LEAD0 = -5.5                        # m : son avance trois secondes avant OUV/1 (hors champ, à gauche)
LEAD_END = -7.0                     # m : son centre derrière celui de la berline à P2/1 (sa portière arrière)
PATROL_BRAKE = 6.95                        # (6,95 : le plafond de 7 m/s² mesuré aux différences finies)
_TC = M.t_of(F0 + FRAMES)           # P2/1
_T0 = -(OUV.FRAMES / M.FPS) - 3.0   # trois secondes avant OUV/1 (la berline y roule à vitesse tenue)


def _vh(t):
    return HERO["speed"](_f(t))


def _hero_acc(t):
    return (_vh(t + 1e-3) - _vh(t - 1e-3)) / 2e-3


# Sa conduite : trois nœuds d'avance raccordés en quintiques d'Hermite (le premier, hors champ ; le deuxième, à sa
# hauteur, EARLY s avant que la berline ne freine : elle freine avant elle, en flic qui voit le rond-point ; _TK),
# puis, de _TK à la coupe et au-delà, son freinage établi de PATROL_BRAKE m/s² (P2 le reprend là).
# (le freinage de la berline : dans OUV avant le 17 novembre au soir ; depuis, la croisière d'avenue le repousse dans P1)
_TB = (OUV.p1_time(M.t_of(OUV.brake_windows()[0][0])) if OUV.brake_windows()
       else M.t_of(PC.brake_windows("P1")[0][0]))
EARLY, LEAD_PEAK = 1.6, -1.5
# son freinage établi, avant la coupe ; depuis la croisière d'avenue (17 novembre au soir) la berline ne freine
# plus que 0,8 s avant P2/1 : la patrouille, 3,5 m derrière elle 5 s avant, lève le pied avant elle, se laisse
# glisser lentement (l'à-coup sous 10 m/s³), et n'établit son freinage que 0,15 s avant la coupe
_TK = _TC - (0.5 if _TB < _TC - 1.5 else 0.15)
if _TB < _TC - 1.5:
    _T1 = _TB - EARLY
else:
    # (audit des mouvements, 18 novembre : à 3,5 m derrière, 5 s avant P2/1, elle n'entrait jamais dans le cadre, à
    # peine son pare-chocs les vingt premières images d'OUV. Elle est à la hauteur de la berline à l'ouverture, 0,75 m
    # derrière, son capot et sa portière dans le quart gauche du cadre ; elle lève le pied dès qu'elle voit le
    # rond-point et sort du cadre par la gauche vers OUV/50 ; l'accélération sous 2,2 m/s², l'à-coup sous 12 m/s³)
    # (v11, SPEC §18.70 : le critique du brouillon éclairé v10 lisait « deux voitures côte à côte » : le film
    # s'ouvrait patrouille déjà au contact. Elle arrive maintenant de derrière : W0 m/s plus vite que la berline
    # avant l'ouverture, LEAD0 m derrière elle à l'image G0 du film, elle la remonte en levant le pied (A0 m/s²
    # de moins qu'elle), culmine vers l'image 26 à 1,2 m derrière sa hauteur, détachée d'elle de 1,5 m, et retombe
    # jusqu'à sa place de P2/1 : un seul arc, sans palier (avec un palier à sa hauteur, la retombée demandait
    # 18 m/s³ d'à-coup dans le freinage du rond-point, 12 permis ; balayé, 11,9 ici). contacts.CHOCS la rabat sur
    # la berline à son sommet)
    G0, LEAD0, W0, A0 = -6.0, -6.0, 7.0, -4.0
    _T0 = (G0 - PC.START["P1"]) / M.FPS
    _T1 = None


def _hero_y(t):
    return HERO["pos"](_f(t))[1]


_VC = _vh(_TC)                      # à la coupe, à la vitesse de la berline
_YC = _hero_y(_TC) + LEAD_END
_VK = _VC + PATROL_BRAKE * (_TC - _TK)
_YK = _YC - _VK * (_TC - _TK) + 0.5 * PATROL_BRAKE * (_TC - _TK) ** 2
W0 = globals().get("W0", 0.0)
_KEYS = ([(_T0, LEAD0, W0, A0)] if _T1 is None else [(_T0, LEAD0, 0.0, 0.0), (_T1, LEAD_PEAK, 0.0, 0.0)]) + [
         (_TK, _YK - _hero_y(_TK), _VK - _vh(_TK), -PATROL_BRAKE - _hero_acc(_TK))]


def _lead(t):
    """Son avance sur la berline (m)."""
    if t <= _T0:
        return LEAD0 + W0 * (t - _T0)
    if t >= _TK:
        dt = t - _TK
        return _YK + _VK * dt - 0.5 * PATROL_BRAKE * dt * dt - _hero_y(t)
    return M._hermite5(_KEYS, t)


def _w(t):
    """L'écart de vitesse patrouille − berline (m/s)."""
    h = 1e-3
    if t >= _TK:
        return _VK - PATROL_BRAKE * (t - _TK) - _vh(t)
    return (_lead(t + h) - _lead(t - h)) / (2 * h)


def patrol_accel(t):
    """Son accélération (m/s²)."""
    h = 1e-3
    if t >= _TK:
        return -PATROL_BRAKE
    return _hero_acc(t) + (_w(t + h) - _w(t - h)) / (2 * h)


# la berline dans le cadre : centre x de 50 % (là où OUV/40 la laisse : une seule prise, plus de saut de 2 % à la
# coupe) à 55 % à l'image 20 (de la place à gauche pour la patrouille ; 56 sortait de x 50 ± 6 avec le tremblé de
# l'opérateur), y 58 % depuis le haut
U0, U1 = OUV.CAM_U, 0.55
U_T1 = M.t_of(20)
V_HERO = OUV.CAM_V
LENS = OUV.LENS
FOCUS, FSTOP = 7.8, 5.6             # la berline nette, la patrouille à peine moins
STILL = 30                          # l'image fixe (banc) : la patrouille remonte à sa portière

# ce que la berline frôle (fx.py en tire les effets) : trois feuilles de papier à plat 1,4 m à droite de sa ligne ;
# elle les passe à l'image 36, la caméra à l'image 47 (le parcours : y 309,4)
PAPERS = ((3.15, 309.4, 20.0), (3.55, 310.1, -35.0), (2.95, 310.9, 70.0))   # x, y, rotation (degrés)
PATROL_HEAD_LENS = 1.0


def hero_pos(t):
    """La berline (scène A), t en s depuis la première image ; définie avant elle (les ressorts de M.sample)."""
    return HERO["pos"](_f(t))


def hero_heading(t):
    return HERO["heading"](_f(t))


def hero_steer(t):
    return HERO["steer"](_f(t))


def hero_spin(t):
    """Le patinage des roues arrière (rapport à la vitesse du sol : 1 roule, plus glisse aux gaz)."""
    return HERO["spin"](_f(t))


def hero_speed(t):
    return HERO["speed"](_f(t))


def brake_windows():
    """Les fenêtres des feux stop (images du plan) : celles du parcours, aucune ici."""
    return PC.brake_windows("P1")


def _patrol_ligne(t):
    """Voie d'en face, _lead(t) devant la berline le long de l'avenue."""
    return LANE_X, hero_pos(t)[1] + _lead(t)


# sa ligne, avec le contact de l'ouverture (contacts.py, SPEC §18.68 : elle serre la berline, la tape, rebondit)
patrol_pos = C.Patrouille(_patrol_ligne, "P1", (("OUV", "patrol"), ("P1", "patrol")))


def patrol_speed(t):
    return hero_speed(t) + _w(t)


def patrol_heading(t):
    """Le cap de la caisse (lieux : 0 vers +y, positif vers -x), celui de sa route."""
    h = 1.0 / 240.0
    (x0, y0), (x1, y1) = patrol_pos(t - h), patrol_pos(t + h)
    return math.degrees(math.atan2(-(x1 - x0), y1 - y0))


def tracks():
    """« patrol » : la patrouille 1 ; « patrol_garee » : la garée d'OUV, restée à l'angle de la rue."""
    return {"hero": hero_pos, "patrol": patrol_pos, "patrol_garee": OUV.patrol_pos}


def tracks_heading():
    return {"patrol": patrol_heading, "patrol_garee": lambda t: OUV.PATROL[2]}


def bars_on(frame):
    """La rampe allumée tout le plan (allumée hors champ à la fin d'OUV)."""
    return True


def _target_u(t):
    return U0 + (U1 - U0) * M.smoothstep(0.0, U_T1, t)


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale) : LA caméra du film (parcours.chase), le bras commun à la visée
    commune, la berline à 50 %, 58 % (17 novembre : plus de berline décalée à 55 % propre à P1)."""
    return PC.chase("P1", _f(t))


def camera(t):
    """La caméra du plan : le rail, sans tremblé écrit (l'opérateur de motion.key_camera s'y ajoute au rendu)."""
    return camera_rail(t)


camera.bras_commun = "P1"      # motion.camera_operator : vibration sur le temps du film, écarts fondus aux bouts


# Le phare lointain (découpage v3, §3) : comme en OUV (ouv_avenue.phare_pose), 600 m devant la caméra de la première
# image, sur un cap sombre, 14° à droite de l'axe (x 82 % à la première image, 87 % à la dernière, à 9 % au moins du
# bord droit de la berline). Hauteur (1,3°), pied et cap : le repli du découpage v3 pour une caméra à 0,55 m, à
# revoir à 2,4 m (le mur de la promenade ne cache plus la tour).
# Phase : de 90 à 180° sur le plan (48 images à 45°/s), à plus de 20° de l'objectif (256° vu du phare) : comme en
# OUV, celle qui montre le moins de pinceau sur l'horizon.
PHARE_ECART = 14.0
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
              f"{body_gap(t):.2f} m d'air, objectif {lens_gap(t):.2f} m, {where} | caméra {hy - c[1]:.2f} m, "
              f"{c[0] - hx:+.2f}, z {c[2]:.2f}, lacet {c[3]:.1f}, site {c[4]:.1f}")
