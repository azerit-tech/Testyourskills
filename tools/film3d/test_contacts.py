# Les contrôles des contacts de la poursuite (contacts.py, SPEC §18.68), sans Blender :
#   - chaque contact est à sa place : hors des dérapages, des douze images d'avant un gel, de la fin ;
#   - le choc est celui de deux caisses : vitesse d'approche, restitution, durée, impulsion dans leurs fourchettes ;
#   - les boîtes se touchent à l'image dite, sans jamais s'enfoncer de plus de 5 cm (au quart d'image), et se
#     séparent ; la patrouille reprend sa ligne avant la fin de son plan, à des accélérations de voiture ;
#   - la berline encaisse : 1 à 2 m/s de côté, jamais à plus de 0,3 m de sa ligne 1,5 s après, revenue sur sa
#     trajectoire d'avant en moins de 1,5 s, sur la chaussée (0,9 m de la bordure), à 1 m de la circulation ;
#   - le film n'a pas bougé : durées, étoiles (parcours.check), crêtes des deux dérapages, arrêt de la pointe ;
#   - la quantité de mouvement est conservée ; la caméra a son à-coup, court ; la gerbe est là, courte.
#   - le choc se voit : la patrouille dans le cadre avant lui, le point de contact aussi (diag/audit_cadre.py).
#   python3 tools/film3d/test_contacts.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import contacts as C  # noqa: E402
import dynamique as D  # noqa: E402
import parcours as P  # noqa: E402
import bras  # noqa: E402

BRAS = bras.installer()      # BRAS_FILM=B|C : la caméra du réglage (bras.py) ; sans : celle du film v10

FAILS = []
FPS = 24.0
DERAPAGES = ((125, 200), (426, 485))        # images du film : pas de contact dans les dérapages
AVANT_GEL = 12                              # ni dans les douze images d'avant un gel
ENFONCE_MAX = 0.05                          # m
LIGNE, REPRISE = 0.3, 1.5                   # m, s
BORDURE, CIRCULATION = 0.9, 1.0             # m
# m/s² : l'adhérence du mouillé (0,7 g) et le freinage des patrouilles, 6,5 et 7,2, relevés du rapport des μ depuis
# que toutes les voitures roulent sur celui de la berline (fusion v11, dynamique.K_MU : 9,3 et 10,3)
PATROUILLE_LAT, PATROUILLE_LONG = round(6.5 * D.K_MU, 1), round(7.2 * D.K_MU, 1)
CADRE_PART = 0.80                           # la part de la patrouille dans le cadre avant un choc (SPEC §18.69)


def check(name, ok, detail=""):
    print(f"{'ok  ' if ok else 'ÉCHEC'} {name}" + (f" : {detail}" if detail else ""))
    if not ok:
        FAILS.append(name)


def _crete(d, f0, f1):
    k = max(range(f0 * 10, f1 * 10), key=lambda k: abs(d.slip(k / (10 * FPS))))
    return k / 10.0, abs(d.slip(k / (10 * FPS)))


def _gels():
    out, g = [], 0
    for _, n in P.SHOTS:
        g += n
        out.append(g - 1)
    return out + [P.TOTAL + P.FIN6_FRAMES - 1]


def test_places():
    gels = _gels()
    for c in C.CHOCS:
        g = c["image"]
        ok = (not any(a <= g <= b for a, b in DERAPAGES) and not any(0 <= q - g <= AVANT_GEL for q in gels)
              and g < P.TOTAL)
        check(f"{c['nom']} : hors des dérapages, des {AVANT_GEL} images d'avant un gel et de la fin", ok,
              f"image {g:g} ; gels {gels}")


def test_choc():
    for c in C.CHOCS:
        j = C.norme(c)
        dv = j / D.CAR["m"]
        check(f"{c['nom']} : un choc de deux caisses (approche 1,5 à 3 m/s, restitution 0,1 à 0,3, force 0,05 à 0,15 s, "
              "impulsion 1500 à 3000 N·s, 1 à 2 m/s donnés à la berline)",
              1.5 <= c["v"] <= 3.0 and 0.1 <= c["e"] <= 0.3 and 0.05 <= c["duree"] <= 0.15 and 1500.0 <= j <= 3000.0
              and 1.0 <= dv <= 2.0, f"{c['v']:g} m/s, e {c['e']:g}, {c['duree']:g} s, {j:.0f} N·s, {dv:.2f} m/s")
        # l'impulsion que la simulation reçoit est bien celle-là (l'intégrale de la force)
        f = C.efforts_de([c])
        n = 4000
        t0, h = C.instant(c) - c["duree"], 2.0 * c["duree"] / n
        s = math.hypot(*(sum((f(t0 + (k + 0.5) * h) or (0.0, 0.0))[i] for k in range(n)) * h for i in (0, 1)))
        check(f"{c['nom']} : l'impulsion donnée à la simulation est celle du choc", abs(s - j) < 0.01 * j,
              f"{s:.0f} N·s pour {j:.0f}")


def test_caisses():
    for c in C.CHOCS:
        pat = C.patrouille_de(c)
        pat._pret()
        row = next(r for r in pat.rows if r["c"] is c)
        t0 = row["t0"]
        gs = [c["image"] + k / 4.0 for k in range(int((row["ta"] + t0) * 4 * FPS - c["image"] * 4) - 4,
                                                   int((row["tb"] + t0) * 4 * FPS - c["image"] * 4) + 8)]
        ec = {g: pat.ecart(g / FPS - t0) for g in gs}
        on = [g for g in gs if ec[g] <= 0.0]
        gmin = min(gs, key=lambda g: ec[g])
        check(f"{c['nom']} : les caisses se touchent à l'image dite (à une image près)",
              bool(on) and on[0] - 1.0 <= c["image"] <= on[-1] + 1.0 and abs(on[0] - c["image"]) <= 1.5,
              f"touchées des images {on[0]:g} à {on[-1]:g}" if on else "jamais")
        check(f"{c['nom']} : une image entière les montre l'une contre l'autre",
              any(abs(g - round(g)) < 1e-9 for g in on), f"{[g for g in on if abs(g - round(g)) < 1e-9][:8]}")
        check(f"{c['nom']} : jamais enfoncées de plus de {ENFONCE_MAX * 100:g} cm (au quart d'image)",
              ec[gmin] >= -ENFONCE_MAX, f"{ec[gmin] * 100:+.1f} cm à l'image {gmin:g}")
        if on:
            seule = all(g2 - g1 <= 1.01 for g1, g2 in zip(on, on[1:]))      # (à une image près : ±1 cm au premier appui)
            check(f"{c['nom']} : un seul contact, puis elles se séparent", seule and on[-1] - on[0] <= 10.0,
                  f"{on[-1] - on[0]:g} images l'une contre l'autre")
        # la patrouille : de sa ligne à sa ligne, avant la fin de son plan, à des accélérations de voiture
        fin_plan = P.START[pat.plan] + dict(P.SHOTS)[pat.plan] - 1
        tb = (row["tb"] + t0) * FPS
        ecart_fin = math.dist(pat(row["tb"] + 0.01), pat.base(row["tb"] + 0.01))
        check(f"{c['nom']} : la patrouille a repris sa ligne avant la fin de son plan", tb <= fin_plan
              and ecart_fin < 1e-6, f"image {tb:.1f} (le plan finit à {fin_plan}), {ecart_fin * 1000:.1f} mm de sa ligne")
        import motion as M
        lat = lon = lon0 = 0.0
        for k in range(int(row["ta"] * 48) - 2, int(row["tb"] * 48) + 3):
            t = k / 48.0
            if abs(t - row["tc"]) < c["duree"] / 2 + 1.6 / FPS:
                continue                                  # (le choc lui-même : une impulsion, pas une manœuvre)
            (vx, vy), (ax, ay) = M.kinematics(pat, t)
            (bx, by), (cx, cy) = M.kinematics(pat.brut, t)
            v, vb = math.hypot(vx, vy), math.hypot(bx, by)
            lat, lon = max(lat, abs(ax * vy - ay * vx) / v), max(lon, abs(ax * vx + ay * vy) / v)
            lon0 = max(lon0, abs(cx * bx + cy * by) / vb)
        check(f"{c['nom']} : la patrouille manœuvre comme une voiture (de côté ≤ {PATROUILLE_LAT:g} m/s², en long ≤ "
              f"{PATROUILLE_LONG:g} et pas plus de 0,5 au-delà de sa ligne d'avant)",
              lat <= PATROUILLE_LAT and lon <= PATROUILLE_LONG and lon <= lon0 + 0.5,
              f"de côté {lat:.1f}, en long {lon:.1f} (sa ligne d'avant {lon0:.1f})")
        # la quantité de mouvement : ce que la berline reçoit, la patrouille le rend
        h = c["duree"] / 2 + 0.002
        (x0, y0), (x1, y1) = pat.choc(row["tc"] + h + 0.5), pat.choc(row["tc"] + h + 1.5)
        dvp = math.hypot(x1 - x0, y1 - y0)
        jy, qx = abs(C.impulsion(c)[1]), C.point(c)[1]
        veut = jy * (1.0 / C.M_PATROL + qx * qx / C.I_PATROL)
        check(f"{c['nom']} : la patrouille rend l'impulsion (le saut de vitesse de son point de contact : J/m + qx² J/I)",
              abs(dvp - veut) < 0.01 * veut, f"{dvp:.2f} m/s pour {veut:.2f} ({jy / C.M_PATROL:.2f} à son centre)")


def test_berline():
    import trafic as T
    import vie as V
    d, b = P.DRIVE, P.sans_chocs()
    pours, veh = T._poursuite(), V.vehicules()
    for c in C.CHOCS:
        tc = C.instant(c)
        dev = dslip = dyaw = 0.0
        hors = base01 = tc
        for k in range(int(tc * 240) - 12, int((tc + 3.0) * 240)):
            t = k / 240.0
            (x, y), (xb, yb) = d.pos(t), b.pos(t)
            a = math.radians(b.travel(t))
            n = (x - xb) * -math.cos(a) + (y - yb) * -math.sin(a)
            dev = n if abs(n) > abs(dev) else dev
            if abs(n) > 0.1:
                base01 = t
            if abs(d.voie_err(t)) > LIGNE and t < tc + 2.0:      # (au-delà : le dérapage suivant)
                hors = t
            dslip = max(dslip, abs((d.heading(t) - d.travel(t)) - (b.heading(t) - b.travel(t))))
            dyaw = max(dyaw, abs(d.yaw_rate(t) - b.yaw_rate(t)))
        check(f"{c['nom']} : la berline encaisse (une embardée de 0,1 à 0,6 m, 4° de glisse en plus au plus fort)",
              0.1 <= abs(dev) <= 0.6 and dslip <= 4.0,
              f"embardée {dev:+.2f} m, glisse {dslip:.1f}°, lacet {dyaw:.0f}°/s de plus qu'avant")
        check(f"{c['nom']} : revenue à {LIGNE:g} m de sa ligne et sur sa trajectoire d'avant en moins de {REPRISE:g} s",
              hors - tc < REPRISE and base01 - tc < REPRISE,
              f"hors de {LIGNE:g} m de sa ligne jusqu'à {hors - tc:.2f} s, à plus de 0,1 m de sa trajectoire d'avant "
              f"jusqu'à {base01 - tc:.2f} s")
        # la chaussée et la circulation, pendant l'embardée (36 images)
        bord, cote = _bordure(c, T)
        check(f"{c['nom']} : la berline reste à {BORDURE:g} m de la bordure", bord >= BORDURE, f"{bord:.2f} m ({cote})")
        pire = (1e9, None, None)
        for g in range(int(c["image"]) - 2, int(c["image"]) + 37):
            bs = T.boites(g, pours, veh)
            A = T._coins(*bs[0][2:5], bs[0][5], bs[0][6])
            for q in bs[1:]:
                if q[1] in ("patrol", "van") or q[4] is None or math.hypot(q[2] - bs[0][2], q[3] - bs[0][3]) > 12.0:
                    continue
                s = T.separation(A, q[8] or T._coins(q[2], q[3], q[4], q[5], q[6]))
                if s < pire[0]:
                    pire = (s, g, q[0])
        check(f"{c['nom']} : la berline à {CIRCULATION:g} m au moins de la circulation pendant l'embardée",
              pire[0] >= CIRCULATION, f"{pire[0]:.2f} m de {pire[2]} à l'image {pire[1]}" if pire[1] else "personne à 12 m")


def _bordure(c, T):
    """La marge de la berline (ses quatre coins) à la bordure la plus proche, des 2 images d'avant le choc aux 36
    d'après : l'avenue (ses deux trottoirs), le pont (glissières à 7 m de l'axe) ; ailleurs, non mesuré."""
    import motion as M
    import vie as V
    pire, cote = 1e9, "non mesuré"
    for k in range(-8, 36 * 4 + 1):
        g = c["image"] + k / 4.0
        import ville as VL
        x, y, cap = VL.hero_city(g + 1)[:3]
        pts = T._coins(x, y, cap, C.HERO[0], C.HERO[1])
        if c["plan"] in ("OUV", "P1"):
            m = min(min(p[1] - V.AV_TROTTOIR_BORD_MER, V.AV_TROTTOIR_BORD_VILLE - p[1]) for p in pts)
            cc = "avenue"
        elif M.PONT_Y_START < y < M.PONT_Y_FOOT and abs(x) < 12.0:
            m, cc = min(7.0 - abs(p[0]) for p in pts), "pont"
        else:
            continue
        if m < pire:
            pire, cote = m, f"{cc}, image {g:g}"
    return pire, cote


def test_film():
    for nom, ok, det in P.check():
        check(f"parcours : {nom}", ok, det)
    d, b = P.DRIVE, P.sans_chocs()
    (f2, c2), (f5, c5) = _crete(d, 120, 200), _crete(d, 430, 485)
    (g2, b2), (g5, b5) = _crete(b, 120, 200), _crete(b, 430, 485)
    check("film : la crête du rond-point n'a pas bougé (0,5° et 0,5 image au plus)", abs(c2 - b2) <= 0.5
          and abs(f2 - g2) <= 0.5, f"{c2:.2f}° à l'image {f2:g} (sans les contacts {b2:.2f}° à {g2:g})")
    check("film : la crête du port n'a pas bougé (0,5° et 0,5 image au plus)", abs(c5 - b5) <= 0.5
          and abs(f5 - g5) <= 0.5, f"{c5:.2f}° à l'image {f5:g} (sans les contacts {b5:.2f}° à {g5:g})")
    check("film : l'arrêt de la pointe à une image près de celui d'avant", d.t_stop is not None and b.t_stop is not None
          and abs(d.t_stop - b.t_stop) * FPS <= 1.0,
          f"image {d.t_stop * FPS:.1f} (sans les contacts {b.t_stop * FPS:.1f})" if d.t_stop else "elle ne s'arrête pas")
    ds = {g: d.s(g / FPS) - b.s(g / FPS) for g in list(P.ETOILES.values()) + _gels()[:-1]} if hasattr(P, "ETOILES") \
        else {g: d.s(g / FPS) - b.s(g / FPS) for g in (77, 153, 255, 375, 453, 567, 107, 214, 317, 425, 485, 618)}
    pire = max(ds, key=lambda g: abs(ds[g]))
    check("film : l'horaire tenu aux étoiles et aux gels (0,5 m au plus)", abs(ds[pire]) <= 0.5,
          f"{ds[pire]:+.2f} m à l'image {pire}")
    # sans contact, la force est nulle : la simulation est celle d'avant
    f = C.efforts_de(())
    check("sans contact, aucune force", all(f(k / 96.0) is None for k in range(0, 720 * 4)))


def test_camera():
    pire = [0.0, 0.0]
    for c in C.CHOCS:
        tc = C.instant(c)
        avant = C.secousse(tc - c["duree"])
        apres = C.secousse(tc + C.SECOUSSE_S)
        for k in range(0, 200):
            s = C.secousse(tc - 0.1 + k / 400.0)
            pire = [max(pire[0], abs(s[0])), max(pire[1], max(abs(v) for v in s[1:]))]
        check(f"{c['nom']} : l'à-coup de la caméra, nul avant le choc, éteint 0,33 s après",
              all(v == 0.0 for v in avant) and all(abs(v) < 1e-3 for v in apres))
    check("caméra : un à-coup de quelques centimètres (1 à 6 cm, moins de 1°)", 0.01 <= pire[0] <= 0.06 and pire[1] < 1.0,
          f"{pire[0] * 100:.1f} cm, {pire[1]:.2f}°")


def test_gerbe():
    import fx
    check("fx : la famille « choc »", "choc" in fx.FAMILIES)
    for c in C.CHOCS:
        pat = C.patrouille_de(c)
        t = pat.touche(c)
        # une trajectoire de berline comme fx la lit dans la scène : la route, tout droit
        tr = fx.build_track([(f, (0.0, f * 1.0, 0.0), (0.0, 1.0, 0.0),
                              {k: (x, f * 1.0 + y, 0.31) for k, (x, y) in
                               dict(fl=(-0.75, 1.4), fr=(0.75, 1.4), rl=(-0.75, -1.4), rr=(0.75, -1.4)).items()})
                             for f in range(int(t[0]) - 3, int(t[1]) + 30)])
        parts = C.gerbe(c, tr, 0.31, pat.point(c), t)
        nais = [p.birth for p in parts]
        haut = max(p.p[2] for p in parts)
        cote = [p.p[0] for p in parts if p.p[2] > 0.3]
        check(f"{c['nom']} : une gerbe courte au point de contact (100 à 600 étincelles, rebonds compris, sur 16 images au plus, à la "
              "hauteur des ailes, du côté de la patrouille)",
              100 <= len(parts) <= 600 and max(nais) - min(nais) <= 16.0 and haut < 0.8
              and all(-c["cote"] * x > 0.5 for x in cote) and max(p.life for p in parts) <= 0.45,
              f"{len(parts)} points, images {min(nais):.1f} à {max(nais):.1f}, {haut:.2f} m au plus haut")


def test_cadre():
    """Les chocs se voient (SPEC §18.69) : avec la caméra du film, la patrouille a 80 % au moins de sa silhouette
    dans le cadre pendant les 8 images qui précèdent chaque contact, le point de contact y est, la berline reste
    entière dans le cadre utile ; le déport et le recul qui le permettent sont nuls à chaque raccord et dans les
    dérapages."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "diag"))
    import audit_cadre as AC
    for c in C.CHOCS:
        rows = AC.lignes_choc(c, avant=8, apres=6)
        mini, au, dans = AC.bilan_choc(c, rows)
        check(f"{c['nom']} : la patrouille à {CADRE_PART * 100:.0f} % au moins dans le cadre les 8 images d'avant le "
              "choc, entière au choc, le point de contact dans le cadre",
              mini >= CADRE_PART and au >= 0.99 and dans, f"{mini * 100:.1f} % au moins, {au * 100:.1f} % au choc")
        hors = [r["g"] for r in rows if not (0.05 <= r["hero"][0] and r["hero"][1] <= 0.95)]
        check(f"{c['nom']} : la berline entière dans le cadre utile (5 à 95 % de large) autour du choc", not hors,
              f"images {hors}" if hors else
              f"de {min(r['hero'][0] for r in rows) * 100:.0f} à {max(r['hero'][1] for r in rows) * 100:.0f} %")
    bords = sorted({g for n, _ in P.SHOTS for g in (P.START[n] - 1, P.START[n])} | {P.TOTAL - 1, P.TOTAL})
    pire = max(max(abs(x) for x in P.cadre_choc(g / FPS)) for g in bords if g > 0)
    glisse = max(max(abs(x) for x in P.cadre_choc(g / FPS)) for a, b in DERAPAGES for g in range(a, b + 1))
    check("le cadre des chocs : nul à chaque raccord et dans les dérapages", pire < 1e-9 and glisse < 1e-9,
          f"{pire:.1e} aux raccords, {glisse:.1e} dans les dérapages")


if __name__ == "__main__":
    test_cadre()
    test_places()
    test_choc()
    test_caisses()
    test_berline()
    test_film()
    test_camera()
    test_gerbe()
    print(f"\n{len(FAILS)} échec(s)" if FAILS else "\ntout passe")
    sys.exit(1 if FAILS else 0)
