# Le plan P2 écrit une fois, indépendant du décor (docs/cinematique-poursuite.md §2.4, « le rond-point ») : la
# trajectoire de la voiture en fuite et des deux patrouilles, et la caméra du drone. Chaque décor (le carrefour de
# la scène A en socle, scene_carrefour.py ; le rond-point en enrichissement, scène F) ne donne qu'une pose : où
# tombe le repère de l'arc chez lui (origine et lacet). Rien ici ne lit Blender.
#
# Repère de l'arc : la voiture arrive sur l'axe x = 0 en roulant vers +y ; à l'origine, elle entre dans un grand
# virage à gauche de 30 m de rayon (centre en (-30, 0)). Un point de l'arc à l'angle θ : (-30 + 30 cos θ, 30 sin θ),
# cap (-sin θ, cos θ). Le plan couvre 40° (21 m à 70 km/h, 1,08 s, ~28 images) : de θ = 25° à 65°.
#
# Écarts au storyboard, assumés pour l'image fixe : la première patrouille suit à 26 m (34 m la mettraient sous le
# bas du cadre quand la berline sort en haut) ; la caméra est au-dessus de l'arc à θ = 37°, pas à 45° (les trois
# quarts de l'action tiennent alors dans la zone utile du cadre, entre les bandes de l'interface).
import math

R = 30.0                    # rayon du virage
THETA0, THETA1 = 25.0, 65.0 # degrés : l'arc couvert pendant le plan
SPEED = 70 / 3.6            # m/s
DRIFT = 12.0                # degrés : l'arrière glisse vers l'extérieur, la caisse pointe plus à gauche que sa route
GAP1 = 26.0                 # m, la première patrouille derrière la berline, sur la même ligne
GAP2 = 22.0                 # m, la seconde derrière la première, encore sur l'avenue
STILL = 0.85                # l'instant de l'image fixe, de 0 (début du plan) à 1 (fin)

CAM_THETA = 37.0            # la verticale du drone, sur l'arc
CAM_Z = 40.0                # m
CAM_LENS = 35.0             # mm : 41 × 23 m au sol à 40 m en 9:16
CAM_YAW0, CAM_TURN = 40.0, 10.0  # degrés : le haut du cadre suit le cap à 40° puis tourne lentement de 10°


def point(s):
    """Position et cap (x, y, cap en degrés, 0 = +y, positif vers la gauche) à l'abscisse s le long de la route :
    s < 0 sur la droite d'arrivée, s ≥ 0 sur l'arc (au-delà de 90°, la sortie en ligne droite vers -x)."""
    if s < 0:
        return 0.0, s, 0.0
    th = s / R
    if th > math.pi / 2:
        return -R - (s - R * math.pi / 2), R, 90.0
    return -R + R * math.cos(th), R * math.sin(th), math.degrees(th)


def s_of(theta_deg):
    return R * math.radians(theta_deg)


def cars(t=STILL):
    """Les trois véhicules à l'instant t du plan : {nom: (x, y, cap de la route, lacet de la caisse)} en repère
    de l'arc. Le lacet de la caisse est le cap de la route plus le contre-braquage pour la berline."""
    sh = s_of(THETA0) + t * (s_of(THETA1) - s_of(THETA0))
    out = {}
    for name, s, drift in (("hero", sh, DRIFT), ("patrol_1", sh - GAP1, 0.0), ("patrol_2", sh - GAP1 - GAP2, 0.0)):
        x, y, h = point(s)
        # la patrouille qui entre dans le virage glisse à peine
        d = drift if name == "hero" else (4.0 if s > 0 else 0.0)
        out[name] = (x, y, h, h + d)
    return out


def wheel_track(lx, ly, t=STILL, step=0.5):
    """Le sillage d'une roue de la berline dans l'eau, du début du plan jusqu'à l'instant t : la liste des points
    (x, y) en repère de l'arc. (lx, ly) : la roue dans le repère de la caisse (avant vers -y, comme les modèles
    posés dans la rue). Le contre-braquage s'installe sur les dix premiers mètres : les roues arrière s'écartent
    peu à peu de la trace des roues avant, vers l'extérieur du virage."""
    s0, s1 = s_of(THETA0) - 6.0, s_of(THETA0) + t * (s_of(THETA1) - s_of(THETA0))
    out = []
    n = max(2, int((s1 - s0) / step))
    for i in range(n + 1):
        s = s0 + (s1 - s0) * i / n
        x, y, h = point(s)
        d = DRIFT * min(1.0, max(0.0, (s - s0) / 10.0))
        a = math.radians(h + d + 180.0)
        out.append((x + lx * math.cos(a) - ly * math.sin(a), y + lx * math.sin(a) + ly * math.cos(a)))
    return out


def camera(t=STILL):
    """(x, y, z, lacet en degrés, focale) : le drone à la verticale, le haut du cadre tourné vers le cap."""
    x, y, _ = point(s_of(CAM_THETA))
    return x, y, CAM_Z, CAM_YAW0 + CAM_TURN * t, CAM_LENS


def to_scene(pose, x, y, heading=0.0):
    """Passe un point (et un cap, en degrés) du repère de l'arc au repère d'une scène : pose = (ox, oy, lacet)."""
    ox, oy, yaw = pose
    a = math.radians(yaw)
    return (ox + x * math.cos(a) - y * math.sin(a), oy + x * math.sin(a) + y * math.cos(a), heading + yaw)
