# Le plan FIN6 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.3 et §2.4, « la pointe ») : le
# temps est gelé, la caméra continue. Elle tourne autour de la berline arrêtée au centre de la pointe, à 7 m, à
# 25 cm du sol, sur 150°, et finit sur la pose validée : trois quarts face, les mains levées, la jetée et la ville
# derrière (azimut 95°). Tout reste figé sauf les rotors, les rampes à 2 Hz et leurs faisceaux (scene_d.py).
#
# Repère de l'eau (lieux.py) : la pointe centrée en (80, 430) ; les azimuts sont comptés depuis +x, dans le sens
# trigonométrique (scene_d._polar). La berline, cap 25° (l'avant vers l'azimut 115°) : son flanc gauche vers 205°,
# son arrière vers 295°. L'orbite part de 245° (trois quarts arrière gauche, la mer et l'autre rive derrière),
# passe le flanc gauche puis l'avant et finit à 95° (le lampadaire, à 8 m vers 313°, reste loin de l'arc).
# 56 images à 24 par seconde (shared/film/cut.ts), 2,29 s.
import math

import motion as M

FRAMES = 56
F0 = 1
T_END = (FRAMES - 1) / M.FPS
STILL_FRAME = FRAMES               # la pose validée est la dernière image
T_STILL = M.t_of(STILL_FRAME)

CX, CY = 80.0, 430.0               # lieux.POINTE
HERO_STOP = 25.0                   # scene_d.HERO_STOP
HERO_BOX = (4.9, 1.9, 1.45)        # la berline : longueur, largeur, hauteur (m)
LAMP_AT = (CX + 5.5, CY - 5.8)     # scene_d.LAMP_AT

# l'anneau (scene_d.plan_FIN6) : dix patrouilles et le fourgon à 14 m, une silhouette devant chacun à 10,6 m
RING_R, COP_R = 14.0, 10.6
RING = [-122.7 + 360.0 / 11 * i for i in range(11)]
COPS = [a + 8.0 for a in RING]

ORBIT_R, ORBIT_Z = 7.0, 0.25
A0, A1 = 245.0, 95.0               # l'arc de 150°, d'un trois quarts arrière à la pose validée
AIM_Z = 1.6                        # la visée de la pose validée (la berline vers 45 % de la hauteur)
LENS = 18.0


def polar(a, r):
    t = math.radians(a)
    return CX + r * math.cos(t), CY + r * math.sin(t)


def azimuth(t):
    """L'azimut de la caméra : lancée dès la première image, elle ralentit et se pose sur la pose validée."""
    u = min(1.0, max(0.0, t / T_END))
    return A0 + (A1 - A0) * (1.0 - (1.0 - u) ** 1.8)


def camera(t):
    """(x, y, z, lacet, site, roulis, focale) : sur l'orbite, tournée vers la berline ; un léger flottement."""
    a = azimuth(t)
    x, y = polar(a, ORBIT_R)
    yaw = 90.0 - a                                  # lacet compté de -y vers -x : regarder vers le centre
    pitch = math.degrees(math.atan2(AIM_Z - ORBIT_Z, ORBIT_R))
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.12, rotor=0.0, seed=1.6)
    k = 1.0 - M.smoothstep(T_END - 0.4, T_END, t)   # immobile sur la dernière image (la pose validée)
    return x + dx * k, y + dy * k, ORBIT_Z + dz * 0.3 * k, yaw + dyaw * k, pitch + dpitch * k, droll * k, LENS


# --- ce que la caméra voit (sans Blender) : capteur de 36 mm sur la hauteur, image 9:16
def project(cam, p):
    """(u, v) d'un point du monde : u de -1 (gauche) à 1 (droite), v de 0 (bas de l'image) à 1 (haut) ; None
    derrière la caméra."""
    x, y, z, yaw, pitch, roll, lens = cam
    a, b = math.radians(yaw), math.radians(pitch)
    f = (-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
    r = (math.cos(a), -math.sin(a), 0.0)                                      # la droite de l'image
    u_ = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])   # le haut
    d = (p[0] - x, p[1] - y, p[2] - z)
    depth = sum(d[i] * f[i] for i in range(3))
    if depth <= 0.01:
        return None
    half_v = 18.0 / lens
    half_h = half_v * 9.0 / 16.0
    return (sum(d[i] * r[i] for i in range(3)) / depth / half_h,
            0.5 + 0.5 * sum(d[i] * u_[i] for i in range(3)) / depth / half_v)


def hero_corners():
    h = math.radians(HERO_STOP)
    fx, fy = -math.sin(h), math.cos(h)
    l, w, ht = HERO_BOX
    out = []
    for a in (-0.5, 0.5):
        for b in (-0.5, 0.5):
            for z in (0.0, ht):
                out.append((CX + fx * l * a + fy * w * b, CY + fy * l * a - fx * w * b, z))
    return out


def rect_dist(p, c, heading, l, w):
    """La distance d'un point (x, y) à un rectangle posé au sol (centre, cap, longueur, largeur)."""
    h = math.radians(heading)
    fx, fy = -math.sin(h), math.cos(h)
    dx, dy = p[0] - c[0], p[1] - c[1]
    a, b = dx * fx + dy * fy, dx * fy - dy * fx
    ea, eb = max(0.0, abs(a) - l / 2), max(0.0, abs(b) - w / 2)
    return math.hypot(ea, eb)


def obstacles():
    """(nom, distance(x, y)) : la berline, les véhicules de l'anneau (un disque de 3 m, quel que soit leur cap),
    les agents (un disque de 0,4 m), le mât du lampadaire."""
    out = [("berline", lambda p: rect_dist(p, (CX, CY), HERO_STOP, HERO_BOX[0], HERO_BOX[1]))]
    for i, a in enumerate(RING):
        c = polar(a, RING_R)
        out.append((f"anneau_{i}", lambda p, c=c: math.dist(p, c) - 3.0))
    for i, a in enumerate(COPS):
        c = polar(a, COP_R)
        out.append((f"agent_{i}", lambda p, c=c: math.dist(p, c) - 0.4))
    out.append(("lampadaire", lambda p: math.dist(p, LAMP_AT) - 0.3))
    return out


if __name__ == "__main__":
    for f in (1, 14, 28, 42, 56):
        c = camera(M.t_of(f))
        vs = [project(c, p)[1] for p in hero_corners()]
        mid = project(c, (CX, CY, HERO_BOX[2] / 2))
        print(f"image {f:2d} : azimut {azimuth(M.t_of(f)):.0f}°, berline de {min(vs):.0%} à {max(vs):.0%} du bas, "
              f"centre à {1 - mid[1]:.0%} du haut")
    near = min((d(camera(M.t_of(f))[:2]), n, f) for f in range(F0, F0 + FRAMES) for n, d in obstacles())
    print(f"au plus près : {near[0]:.2f} m de {near[1]} à l'image {near[2]}")
