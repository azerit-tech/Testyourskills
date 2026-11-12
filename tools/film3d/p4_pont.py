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

FRAMES = 28
F0 = 1
T_END = (FRAMES - 1) / M.FPS

Y_REF = 45.0                  # l'ancienne caméra (brouillon) : les trajectoires restent comptées d'elle
# découpage v2 (docs/cinematique-decoupage-v2.md, P4) : 18 m plus près et 30 cm plus bas, dans l'axe de la berline
CAM = (1.2, 27.0, 1.2)
LENS = 200.0
ZOOM = 0.06                   # le zoom avant : +6 % de focale sur le plan
SPEED = 120 / 3.6             # 33,3 m/s
D0 = 98.0                     # la berline à 98 m de Y_REF à la première image (60 m à la dernière ; 80 à 42 m de l'objectif)
HERO_X = 1.8
STILL_FRAME = F0 + round((D0 - 70.0) / SPEED * M.FPS)       # 21 : la berline à 70 m de Y_REF (52 m de l'objectif)
T_STILL = M.t_of(STILL_FRAME)

# La meute, désordonnée et pas en bloc (découpage v2 : « le nombre qui écrase ») : chacun à son rythme, qui
# louvoie, se jette en avant puis lâche un peu, la deuxième qui force vers l'axe ; deux patrouilles de plus
# surgissent de la crête l'une après l'autre (images 6 et 25), plus vite que la berline.
# (genre, x, retard sur la berline à t = 0 en m, vitesse en plus en m/s, louvoiement en m, sa période en s,
# phase, glissement latéral sur le plan en m)
PACK = [("patrol", -1.8, 25.6, 0.0, 0.45, 1.7, 0.3, 0.0),
        ("patrol", 4.2, 38.0, 0.0, 0.35, 2.1, 2.1, -1.2),
        ("patrol", -4.2, 60.0, 0.0, 0.60, 1.4, 4.0, 0.0),
        ("patrol", -3.4, 84.6, 3.0, 0.50, 1.9, 1.0, 0.0),       # passe la crête à l'image 6
        ("patrol", -1.0, 112.8, 2.5, 0.40, 1.6, 5.0, 0.0)]      # passe la crête à l'image 25
VAN_Y_STILL = -124.0          # 6 m après la crête à l'image fixe
VAN_V = 37.0                  # il remonte la meute
VAN_X = (3.5, 0.3)            # de la voie de droite vers l'axe : il force au milieu


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
    y = VAN_Y_STILL + VAN_V * (t - T_STILL)
    u = M.smoothstep(0.1, T_END, t)
    return VAN_X[0] + (VAN_X[1] - VAN_X[0]) * u, y


def tracks():
    out = {"hero": hero_pos, "van": van_pos}
    for i, entry in enumerate(PACK):
        out[f"{entry[0]}_{i}"] = pack_pos(i)
    return out


def camera(t):
    """(x, y, z, lacet, site, roulis, focale) : à l'horizontale, face à la ville ; le tremblé d'une longue focale
    tenue à la main (quelques centièmes de degré : au 200 mm le cadre ne fait que 5,8° de large) ; un léger suivi
    en lacet garde la berline au milieu de la largeur (elle roule 0,6 m à droite de l'objectif). En hauteur elle
    descend dans le cadre en approchant, de 51-60 % à 30-51 % depuis le bas (le découpage : 48-59 puis 29-49)."""
    dyaw, dpitch, droll, dx, dy, dz = M.handheld(t, amp=0.05, rotor=0.012, seed=2.3)
    u = t / T_END
    lens = LENS * (1.0 + ZOOM * (u - T_STILL / T_END))        # 200 mm exactement à l'image fixe
    hx, hy = hero_pos(t)
    follow = math.degrees(math.atan2(-(hx - CAM[0]), CAM[1] - hy))
    return CAM[0] + dx * 0.3, CAM[1], CAM[2] + dz * 0.3, follow + dyaw, dpitch, droll * 0.5, lens


if __name__ == "__main__":
    for f in (1, 8, 14, STILL_FRAME, 28):
        t = M.t_of(f)
        print(f"image {f:2d} : berline à {CAM[1] - hero_pos(t)[1]:5.1f} m, fourgon en ({van_pos(t)[0]:.1f}, "
              f"{van_pos(t)[1]:6.1f}), focale {camera(t)[6]:.0f} mm")
    print("écart minimal :", M.min_gap(tracks(), range(F0 - 1, F0 + FRAMES + 1)))
