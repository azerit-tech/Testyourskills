# Le plan P4 écrit une fois, sans Blender (docs/cinematique-poursuite.md §2.4, « le pont ») : la berline qui
# descend la rampe vers la caméra à 120 km/h, de 98 à 60 m de l'objectif ; derrière elle les trois patrouilles en
# V, 25 à 60 m, étagées par la rampe jusqu'à la crête ; le fourgon qui déborde de la crête, plus vite qu'elles, et
# force au milieu (il passe de la voie de droite à l'axe) ; la caméra posée sur le plat, 200 mm, zoom avant lent,
# tremblé continu de longue focale. scene_c.py n'en lit que les fonctions du temps ; motion.py en tire roues,
# braquage et transfert de masse.
#
# Repère du pont (scene_c.py) : l'axe x = 0, la poursuite roule vers +y (cap 0), la crête en y = -130, le pied de
# la rampe en y = -5. t = 0 à la première image ; 28 images, 24 par seconde (shared/film/cut.ts).
# L'image fixe d'essai (STILL_FRAME) garde la pose validée : la berline à 70 m de l'objectif, les patrouilles à 25,
# 38 et 60 m derrière elle, le fourgon 6 m après la crête.
import math

import motion as M

FRAMES = 48
V3 = True
F0 = 1
T_END = (FRAMES - 1) / M.FPS

Y_REF = 45.0                  # l'ancienne caméra (brouillon) : les trajectoires restent comptées d'elle
# découpage v3 (docs/cinematique-decoupage-v3.md, P4) : fixe, 17 m plus près que la v2, dans l'axe de la berline
CAM = (1.2, 10.0, 1.2)
LENS = 200.0
ZOOM = 0.06                   # le zoom avant : 200 mm à l'image 1, 212 mm à l'image 48 (3 %/s, rampes amorties)
SPEED = 120 / 3.6             # 33,3 m/s
D0 = 146.0                    # la berline en y -101 à l'image 1 (111 m de l'objectif), en y -35,7 à l'image 48 (46 m)
HERO_X = 1.8
STILL_FRAME = 24
T_STILL = M.t_of(STILL_FRAME)
Y_CREST = -130.0
SITE_AIM = (0.545, 0.545)     # le centre de la berline à 54,5 % de la hauteur depuis le haut (52 à 56)

# La meute, désordonnée et pas en bloc (« le nombre qui écrase ») : chacun à son rythme, qui louvoie, se jette en
# avant puis lâche un peu. Découpage v3 : les six premiers (cinq patrouilles et le fourgon) déjà sur la rampe à
# l'image 1, entre 26 et 43 m derrière elle (au-delà de 44 m, la crête cache leurs rampes : six rampes au début) ;
# la patrouille 1 en tête, à gauche de la berline (à droite de l'écran). Quatre de plus, plus rapides, passent la
# crête l'une après l'autre : leur rampe se découvre aux images 8, 18, 28 et 38 (dix rampes à la fin).
# (genre, x, retard sur la berline à t = 0 en m, vitesse en plus en m/s, louvoiement en m, sa période en s,
# phase, glissement latéral sur le plan en m)
PACK = [("patrol", -1.8, 26.0, 0.0, 0.40, 1.7, 0.3, 0.0),         # la patrouille 1
        ("patrol", 4.6, 30.0, 0.0, 0.35, 2.6, 0.9, -0.5),
        ("patrol", -5.2, 34.0, 0.0, 0.45, 1.4, 4.0, 0.0),
        ("patrol", 0.8, 36.5, 0.0, 0.40, 1.9, 1.0, 0.0),
        ("patrol", -3.6, 42.5, 0.0, 0.35, 1.6, 5.0, 0.0),
        ("patrol", 4.4, 57.6, 3.0, 0.40, 1.8, 2.6, 0.0),         # sa rampe passe la crête à l'image 8
        ("patrol", -4.6, 72.7, 3.0, 0.45, 1.5, 0.8, 0.0),        # 18
        ("patrol", 1.0, 89.0, 3.0, 0.35, 2.0, 3.3, 0.0),         # 28
        ("patrol", -1.6, 103.0, 3.0, 0.40, 1.7, 4.4, 0.0)]       # 38
VAN_GAP0 = 43.0               # le fourgon, 43 m derrière elle à l'image 1, qui remonte la meute
VAN_V = SPEED + 1.0
VAN_X = (5.6, 4.8)            # sur la voie de droite, il serre vers le milieu : il force


def ease_trap(t, t0, t1, r):
    """0 avant t0, 1 après t1 ; vitesse en trapèze aux rampes en cosinus de r secondes."""
    T = t1 - t0
    tau = min(max(t - t0, 0.0), T)

    def up(x):
        return x / 2.0 - r / (2 * math.pi) * math.sin(math.pi * x / r)
    if tau < r:
        pos = up(tau)
    elif tau <= T - r:
        pos = r / 2.0 + tau - r
    else:
        pos = (T - r) - up(T - tau)
    return pos / (T - r)


def deck_z(y):
    """Le tablier (scene_c.deck_z, recopié par motion._bridge_z)."""
    return M._bridge_z(y)


def hero_pos(t):
    return HERO_X, Y_REF - D0 + SPEED * t


def pack_pos(i):
    _, x, gap, dv, amp, per, ph, slide = PACK[i]

    def fn(t):
        w = 2.0 * math.pi * t / per + ph
        y = Y_REF - D0 - gap + (SPEED + dv) * t + 1.2 * amp * math.sin(w)          # elle se jette, elle lâche
        return x + amp * math.sin(1.25 * w + 0.7 * ph) + slide * M.smoothstep(0.0, T_END, t), y
    return fn


def van_pos(t):
    y = Y_REF - D0 - VAN_GAP0 + VAN_V * t
    u = M.smoothstep(0.1, T_END, t)
    return VAN_X[0] + (VAN_X[1] - VAN_X[0]) * u, y


def tracks():
    out = {"hero": hero_pos, "van": van_pos}
    for i, entry in enumerate(PACK):
        out[f"{entry[0]}_{i}"] = pack_pos(i)
    return out


def camera_rail(t):
    """(x, y, z, lacet, site, roulis, focale), sans tremblé : fixe, le lacet qui suit la berline (0,6 m à droite de
    l'objectif : 0,3 à 0,8°) ; le site qui la met à SITE_AIM de la hauteur à la première et à la dernière image
    (elle descend la rampe), de l'un à l'autre en trapèze amorti (0,6°/s au plus : suivi image par image, il montait à
    1,3°/s au pied de la rampe) ; le zoom de 200 à 212 mm, en trapèze lui aussi (rampes de 6 images)."""
    e = ease_trap(t, 0.0, T_END, 0.25)
    lens = LENS * (1.0 + ZOOM * e)
    hx, hy = hero_pos(t)
    yaw = math.degrees(math.atan2(-(hx - CAM[0]), CAM[1] - hy))
    s0, s1 = site_aim(0.0, SITE_AIM[0]), site_aim(T_END, SITE_AIM[1])
    return CAM[0], CAM[1], CAM[2], yaw, s0 + (s1 - s0) * e, 0.0, lens


def site_aim(t, aim):
    """Le site qui met le centre de la berline à `aim` de la hauteur (depuis le haut) à l'instant t : la visée
    passe au-dessus d'elle."""
    hx, hy = hero_pos(t)
    d = CAM[1] - hy
    lens = LENS * (1.0 + ZOOM * ease_trap(t, 0.0, T_END, 0.25))
    elev = math.degrees(math.atan2(deck_z(hy) + 0.72 - CAM[2], d))
    return elev + math.degrees(math.atan((aim - 0.5) * 2.0 * 18.0 / lens))


def camera(t):
    """camera_rail plus le tremblé d'une longue focale tenue (0,05°)."""
    x, y, z, yaw, site, roll, lens = camera_rail(t)
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.05, rotor=0.012, seed=2.3)
    return x + dx * 0.3, y, z + dz * 0.3, yaw + dyaw, site + dpitch, droll * 0.5, lens


def bar_visible(y, h=1.7):
    """La rampe d'un véhicule en y (à h m au-dessus du tablier) se voit-elle de l'objectif, par-dessus la crête ?"""
    if y >= Y_CREST:
        return True
    zc = deck_z(Y_CREST)
    sight = CAM[2] + (zc - CAM[2]) * (CAM[1] - y) / (CAM[1] - Y_CREST)
    return deck_z(y) + h > sight


if __name__ == "__main__":
    for f in (1, 8, 18, STILL_FRAME, 28, 38, 48):
        t = M.t_of(f)
        n = sum(bar_visible(pack_pos(i)(t)[1]) for i in range(len(PACK))) + bar_visible(van_pos(t)[1])
        print(f"image {f:2d} : berline à {CAM[1] - hero_pos(t)[1]:5.1f} m, {n} rampes visibles, site "
              f"{camera_rail(t)[4]:+.2f}°, focale {camera_rail(t)[6]:.0f} mm")
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
