# Les contrôles de la circulation et du slalom (SPEC §18.62), sans Blender :
#   - aucun véhicule n'en touche un autre, à chaque image du film (trafic.verifier : boîtes orientées ; 0,6 m de flanc
#     et 3 m à la file entre la poursuite et la vie) ;
#   - la circulation passe à 1,2 m au moins de l'objectif ;
#   - le slalom tient l'adhérence du mouillé (latérale 6,5 m/s², cercle 7,5) et ne touche ni aux durées, ni aux
#     étoiles, ni aux dérapages, ni au trou du barrage (parcours.check) ;
#   - dans chaque ligne droite, des voitures qui roulent dans le cadre ;
#   - la file d'en face du pont (SPEC §18.69) : phares, accélérations, 1 m de la poursuite au quart d'image.
#   - pas de rue vide : aucun trou de plus de 1,5 s sans voiture qui roule à l'image, hors rond-point et barrage.
#   python3 tools/film3d/test_trafic.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parcours as P  # noqa: E402
import trafic as T  # noqa: E402

FAILS = []
DENSE_ADMIS = (160, 230)                    # images : le dérapage du rond-point, la rue jusqu'à la sortie du barrage


def check(name, ok, detail=""):
    print(f"{'ok  ' if ok else 'ÉCHEC'} {name}" + (f" : {detail}" if detail else ""))
    if not ok:
        FAILS.append(name)


def _chocs():
    """Les images du film autour des contacts déclarés (contacts.py, SPEC §18.68 : contacts.images_choc) : la
    berline y prend un choc, pas une manœuvre ; les contrôles de sa conduite les laissent de côté (les écarts entre
    caisses, eux, trafic.verifier les règle)."""
    import contacts as CT
    return {P.START[c["plan"]] + f - 1 for c in CT.CHOCS for f in CT.images_choc(c["plan"])}


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
    chocs = _chocs()
    for g in sorted(set(range(0, P.TOTAL)) - chocs):
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
    # (v11 : 6,5 et 7,5 m/s² sur le mouillé, relevés du rapport des adhérences, parcours.ADHERENCE)
    lat_max, cercle_max = 6.5 * P.ADHERENCE, 7.5 * P.ADHERENCE
    check(f"slalom : latérale ≤ {lat_max:.1f} m/s², cercle ≤ {cercle_max:.1f} (6,5 et 7,5 du mouillé × parcours.ADHERENCE)",
          worst_lat[0] <= lat_max and worst_comb[0] <= cercle_max,
          f"latérale {worst_lat[0]:.2f} (image {worst_lat[1]}), cercle {worst_comb[0]:.2f} (image {worst_comb[1]})")


def test_slalom_simule():
    """Le dosage de la conduite simulée (parcours.SLALOM_SIMULE, l'entrée de dynamique.Plan.voie sur film/physique) :
    la demande reste sous 0,9 g (au-dessus, la berline simulée sort de sa ligne : 0,8 m à 1,05 g), l'à-coup demandé
    sous 40 m/s³ (le plafond de film/physique), rien dans les dérapages ni dans le trou du barrage, et la jetée ne
    commence qu'après s 402 (la berline simulée sort du dérapage du port 1 m large)."""
    pire_a = pire_j = (0.0, None)
    for m in P.SLALOM_SIMULE:
        ka, kj = (7.51, 52.5) if len(m) > 3 else (P.VOIE_K, P.VOIE_J)
        v = max(P.DRIVE.speed(P.t_of_s(m[0] + u * m[1])) for u in (0.0, 0.25, 0.5, 0.75, 1.0))
        pire_a = max(pire_a, (ka * abs(m[2]) * v * v / m[1] ** 2 / 9.81, m[0]))
        pire_j = max(pire_j, (kj * abs(m[2]) * v ** 3 / m[1] ** 3, m[0]))
    # (v11 : 55 m/s³, 40 avant. À μ 1,0 un écart tardif, 1,5 m en une seconde, demande 9 m/s² et 50 à 55 m/s³ ;
    # le tableau de dosage de film/v11-virages le mesure à 2,7° de glisse et 0,17 m hors de la ligne à 10 m/s²)
    check("slalom simulé : demande ≤ 0,9 g, à-coup demandé ≤ 55 m/s³", pire_a[0] <= 0.9 and pire_j[0] <= 55.0,
          f"{pire_a[0]:.2f} g (s {pire_a[1]:g}), {pire_j[0]:.1f} m/s³ (s {pire_j[1]:g})")
    nul = max(abs(P.voie_simulee(P.s_of_t(g / P.FPS))) for a, b in P.VOIE_NULLE for g in range(a, b + 1))
    trou = max(abs(P.voie_simulee(P.VOIE_BARRAGE[0] + (P.VOIE_BARRAGE[1] - P.VOIE_BARRAGE[0]) * i / 60))
               for i in range(61))
    jetee = min(m[0] for m in P.SLALOM_SIMULE if m[0] > 380.0)
    check("slalom simulé : nul dans les dérapages et le trou du barrage, la jetée après s 402",
          nul < 1e-6 and trou < 1e-6 and jetee >= 402.0, f"{nul:.1e} m, {trou:.1e} m, jetée à s {jetee:g}")


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


def test_face():
    """La file d'en face du pont (trafic.FACE, SPEC §18.69) : phares allumés, accélération d'une voiture (départ,
    freinage, virage, écart : 5,6 m/s² au plus, au quart d'image), 1 m au moins de la berline, des patrouilles et de
    la meute au quart d'image, et toujours à l'ouest de la voie de la patrouille 1."""
    import vie as V
    face = {"trafic_" + r[0] for r in T.FACE}
    veh = [v for v in V.vehicules() if v[0] in face]
    check("face : quatre voitures, phares allumés", len(veh) == len(T.FACE) == 4 and all(v[4].get("phares") for v in veh),
          f"{len(veh)} voitures")
    pire, lim = (0.0, None, 0), 5.6
    h = 3.0
    dt = h / T.FPS
    for nom, _m, _t, c, _kw in veh:
        for k in range(4, 640 * 4):
            g = k / 4.0
            a, b, d = c.pose(g - h), c.pose(g), c.pose(g + h)
            acc = math.hypot(a[0] - 2 * b[0] + d[0], a[1] - 2 * b[1] + d[1]) / dt ** 2
            if acc > pire[0]:
                pire = (acc, nom, g)
    check(f"face : accélération ≤ {lim:g} m/s² (départ, freinage, virage, écart)", pire[0] <= lim,
          f"{pire[0]:.2f} m/s², {pire[1]} à l'image {pire[2]:g}")
    pours = T._poursuite()
    juste, est = (99.0, None, None, 0), (-99.0, None, 0)
    for k in range(240 * 4, 470 * 4 + 1):
        g = k / 4.0
        bs = T.boites(g, pours, veh)
        miens = [b for b in bs if b[0] in face]
        for b in bs:
            if b[1] not in ("hero", "patrol", "van") or b[4] is None:
                continue
            B = T._coins(b[2], b[3], b[4], b[5], b[6])
            for m in miens:
                if math.hypot(m[2] - b[2], m[3] - b[3]) > 12.0:
                    continue
                d = T.separation(T._coins(m[2], m[3], m[4], m[5], m[6]), B)
                if d < juste[0]:
                    juste = (d, m[0], b[0], g)
        for m in miens:
            if m[3] > -326.0:                               # sur le pont, avant le virage du boulevard
                x = max(q[0] for q in T._coins(m[2], m[3], m[4], m[5], m[6]))
                if x > est[0]:
                    est = (x, m[0], g)
    check("face : 1 m au moins de la berline, des patrouilles et de la meute (au quart d'image)", juste[0] >= 1.0,
          f"{juste[0]:.2f} m, {juste[1]} / {juste[2]} à l'image {juste[3]:g}")
    check("face : sur le pont, à l'ouest de x −2 (la voie d'en face et, autour de la voiture arrêtée, celle du milieu)",
          est[0] <= -2.0, f"x {est[0]:+.2f} au plus à l'est, {est[1]} à l'image {est[2]:g}")


def test_dense():
    """Pas de rue vide (SPEC §18.69) : à l'image, une voiture de la vie qui roule, lisible, à moins de 40 m de
    l'objectif (diag/audit_cadre.py), sans trou de plus de 1,5 s dans la poursuite. Un seul trou admis, et connu :
    le dérapage du rond-point puis les 25 m de rue fermés par le barrage (images 158 à 248), où rien ne peut rouler
    sans gêner."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "diag"))
    import audit_cadre as AC
    AC.dense(silence=True)
    trous = AC.OUT["trous"]
    hors = [t for t in trous if not (DENSE_ADMIS[0] <= t[0] and t[1] <= DENSE_ADMIS[1])]
    n = sum(k > 0 for k in AC.OUT["n_vie"])
    check("dense : aucun trou de plus de 1,5 s sans voiture qui roule à l'image, hors rond-point et barrage "
          f"(images {DENSE_ADMIS[0]} à {DENSE_ADMIS[1]})", not hors,
          f"trous {trous} ; {n} images sur {P.TOTAL} avec une voiture lisible")
    pont = AC.OUT["n_vie"][290:354]
    check("dense : du boulevard au milieu du pont (images 290 à 353), une voiture lisible la moitié du temps au moins",
          sum(k > 0 for k in pont) >= len(pont) / 2, f"{sum(k > 0 for k in pont)} images sur {len(pont)}")


if __name__ == "__main__":
    test_dense()
    test_face()
    test_parcours()
    test_contacts()
    test_adherence()
    test_slalom_simule()
    test_objectif()
    test_cadre()
    print(f"\n{len(FAILS)} échec(s)" if FAILS else "\ntout passe")
    sys.exit(1 if FAILS else 0)
