# Les contrôles de la circulation et du slalom (SPEC §18.62), sans Blender :
#   - aucun véhicule n'en touche un autre, à chaque image du film (trafic.verifier : boîtes orientées ; 0,6 m de flanc
#     et 3 m à la file entre la poursuite et la vie) ;
#   - la circulation passe à 1,2 m au moins de l'objectif ;
#   - le slalom tient l'adhérence du mouillé (latérale 6,5 m/s², cercle 7,5) et ne touche ni aux durées, ni aux
#     étoiles, ni aux dérapages, ni au trou du barrage (parcours.check) ;
#   - dans chaque ligne droite, des voitures qui roulent dans le cadre.
#   python3 tools/film3d/test_trafic.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parcours as P  # noqa: E402
import trafic as T  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(f"{'ok  ' if ok else 'ÉCHEC'} {name}" + (f" : {detail}" if detail else ""))
    if not ok:
        FAILS.append(name)


def test_parcours():
    for nom, ok, det in P.check():
        check(f"parcours : {nom}", ok, det)


def test_contacts():
    res = T.verifier(0, None, 1)
    d, g, a, b, m = res[0]
    check("contacts : aucun chevauchement, marges tenues entre la poursuite et la vie (toutes les images)", d >= 0.0,
          f"{d:.2f} m au plus juste, {a} / {b} à l'image {g}{' (marges)' if m else ''}")


def test_adherence():
    h = 1.0 / 48.0
    worst_lat = worst_comb = (0.0, -1)
    for g in range(0, P.TOTAL):
        t = g / P.FPS
        if not any(abs(P.voie(P.s_of_t(t + d))) > 1e-6 for d in (-0.5, 0.0, 0.5)):
            continue
        p0, p1, p2 = P.DRIVE.pos(t - h), P.DRIVE.pos(t), P.DRIVE.pos(t + h)
        vx, vy = (p2[0] - p0[0]) / (2 * h), (p2[1] - p0[1]) / (2 * h)
        ax, ay = (p2[0] - 2 * p1[0] + p0[0]) / h / h, (p2[1] - 2 * p1[1] + p0[1]) / h / h
        v = math.hypot(vx, vy)
        lat, lon = (vx * ay - vy * ax) / v, (vx * ax + vy * ay) / v
        worst_lat = max(worst_lat, (abs(lat), g))
        worst_comb = max(worst_comb, (math.hypot(lat, lon), g))
    check("slalom : latérale ≤ 6,5 m/s², cercle ≤ 7,5 (le mouillé, parcours.LIM)",
          worst_lat[0] <= 6.5 and worst_comb[0] <= 7.5,
          f"latérale {worst_lat[0]:.2f} (image {worst_lat[1]}), cercle {worst_comb[0]:.2f} (image {worst_comb[1]})")


def test_objectif():
    d, g, nom = T.objectif()
    check("objectif : la circulation à 1,2 m au moins de la lentille", d >= 1.2, f"{d:.2f} m de {nom} à l'image {g}")


def test_cadre():
    # dans chaque ligne droite, des voitures de la vie qui roulent dans le cadre, la plupart du temps (la jetée plus
    # calme : une au moins, puis la fin s'arrête)
    for nom, (g0, g1), k, need in (("l'avenue", (0, 100), 2, 0.8), ("la rue", (215, 300), 2, 0.8),
                                   ("le pont", (318, 410), 2, 0.8), ("la jetée", (490, 600), 1, 0.75)):
        n = [T.dans_le_cadre(g) for g in range(g0, g1, 2)]
        part = sum(c >= k for c in n) / len(n)
        check(f"cadre : {nom}, {k} voiture(s) qui roulent dans le cadre {need:.0%} du temps au moins", part >= need,
              f"{part:.0%} du temps, {min(n)} à {max(n)} voitures")


if __name__ == "__main__":
    test_parcours()
    test_contacts()
    test_adherence()
    test_objectif()
    test_cadre()
    print(f"\n{len(FAILS)} échec(s)" if FAILS else "\ntout passe")
    sys.exit(1 if FAILS else 0)
