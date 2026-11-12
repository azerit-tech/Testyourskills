# Les tests de motion.py, sans Blender : python3 tools/film3d/test_motion.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion as M  # noqa: E402

FRAMES = range(0, 30)
FAIL = []


def check(name, ok, detail=""):
    print(f"{'ok  ' if ok else 'ÉCHEC'} {name}{' : ' + detail if detail else ''}")
    if not ok:
        FAIL.append(name)


def test_straight():
    """Une ligne droite à vitesse constante : ni roulis ni tangage, les roues tournent à v / r."""
    r, v = 0.33, 20.0
    ps = M.sample(M.straight(3.0, 0.0, v), FRAMES, wheel_r=r, noise=0.0)
    check("droite : roulis nul", max(abs(p["roll"]) for p in ps) < 1e-3, f"{max(abs(p['roll']) for p in ps):.2e}°")
    check("droite : tangage nul", max(abs(p["pitch"]) for p in ps) < 1e-3, f"{max(abs(p['pitch']) for p in ps):.2e}°")
    check("droite : braquage nul", max(abs(p["steer"]) for p in ps) < 1e-3)
    rate = (ps[-1]["spin"] - ps[0]["spin"]) / (ps[-1]["t"] - ps[0]["t"])
    check("droite : roues à v / r", abs(rate - v / r) < 0.01 * v / r, f"{rate:.2f} rad/s pour {v / r:.2f}")
    check("droite : roues dans le sens de la marche", rate > 0)
    check("droite : cap constant", max(abs(p["heading"]) for p in ps) < 1e-6)
    noisy = M.sample(M.straight(3.0, 0.0, v), FRAMES, wheel_r=r)
    check("droite : bruit de suspension faible", max(abs(p["roll"]) for p in noisy) < 0.3
          and max(abs(p["heave"]) for p in noisy) < 0.01)


def test_braking():
    """Un freinage à 9 m/s² : l'avant plonge (tangage négatif), sans dépasser 3°."""
    pos = M.straight(0.0, 0.0, 25.0, accel=lambda t: -9.0 if t >= 0.2 else 0.0)
    ps = M.sample(pos, FRAMES, noise=0.0)
    lo = min(p["pitch"] for p in ps)
    check("freinage : l'avant plonge", lo < -1.5, f"{lo:.2f}°")
    check("freinage : plongée bornée à 3°", lo >= -M.PITCH_MAX - 1e-9)
    before = [p for p in ps if p["t"] < 0.15]
    check("freinage : rien avant le freinage", max(abs(p["pitch"]) for p in before) < 0.05)
    # la caisse suit avec du retard : à 0,05 s du coup de frein elle n'a pas encore plongé de moitié
    early = [p for p in ps if 0.2 < p["t"] <= 0.26]
    check("freinage : la caisse suit avec retard", all(p["pitch"] > lo / 2 for p in early))
    acc = [p for p in ps if p["t"] > 0.5]
    check("freinage : accélération lue", all(abs(p["a_long"] + 9.0) < 0.3 for p in acc))


def _circle(r, v, right=True):
    """Un cercle de rayon r parcouru à v, qui part vers +y en tournant à droite (ou à gauche)."""
    sgn = -1.0 if right else 1.0
    cx = -sgn * r

    def pos(t):
        a = v * t / r
        return cx + sgn * r * math.cos(a), r * math.sin(a)
    return pos


def test_right_turn():
    """Un virage à droite : roulis vers la gauche (l'extérieur), braquage à droite ; en glisse, contre-braquage."""
    ps = M.sample(_circle(30.0, 15.0), FRAMES, noise=0.0, warmup=1.0)
    end = ps[-1]
    check("virage à droite : accélération latérale vers la droite", end["a_lat"] < -5.0, f"{end['a_lat']:.2f} m/s²")
    check("virage à droite : roulis vers la gauche", end["roll"] < -2.0, f"{end['roll']:.2f}°")
    check("virage à droite : roulis borné", min(p["roll"] for p in ps) >= -M.ROLL_MAX)
    check("virage à droite : braquage à droite", end["steer"] < -1.0, f"{end['steer']:.2f}°")
    check("virage à droite : le cap décroît", ps[-1]["heading"] < ps[0]["heading"])
    left = M.sample(_circle(30.0, 15.0, right=False), FRAMES, noise=0.0, warmup=1.0)
    check("virage à gauche : roulis vers la droite", left[-1]["roll"] > 2.0, f"{left[-1]['roll']:.2f}°")
    drift = M.sample(_circle(15.0, 15.0), FRAMES, slip=lambda t: -22.0, noise=0.0, warmup=1.0)
    check("glisse à droite : contre-braquage (roues à gauche)", drift[-1]["steer"] > 2.0, f"{drift[-1]['steer']:.2f}°")
    check("glisse à droite : la caisse plus à droite que la route",
          abs(drift[-1]["heading"] - drift[-1]["travel"] + 22.0) < 1e-6)


def test_gaps():
    """Les véhicules d'un plan gardent leurs distances : jamais moins de 6 m entre deux centres (P5)."""
    import p5_virage as P
    d, f, a, b = M.min_gap(P.tracks(), range(P.F0 - 1, P.F0 + P.FRAMES + 1))
    check("P5 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    gap = min(math.dist(P.hero_pos(M.t_of(f)), P.pack_pos(0)(M.t_of(f))) for f in range(P.F0, P.F0 + P.FRAMES))
    check("P5 : la meute ne rattrape pas la berline", gap > 25.0, f"{gap:.1f} m au plus près")
    check("M.min_gap voit un croisement", M.min_gap({"a": lambda t: (0.0, 10 * t), "b": lambda t: (0.0, 10 - 10 * t)},
                                                    range(0, 30))[0] < 0.5)
    # le mur de conteneurs prolongé (x -15,1 à -10,1, y 54 à 79) et les jambes du portique (x -24 et -10,6, y 81 et
    # 95) : aucun centre de véhicule à moins de 3 m (plus sa demi-largeur, 1 m)
    boxes = [(-15.1, -10.1, 54.0, 79.0)] + [(x - 1.0, x + 1.0, y - 1.8, y + 1.8) for x in (-24.0, -10.6)
                                             for y in (81.0, 95.0)]

    def clear(q):
        return min(math.hypot(max(b[0] - q[0], 0, q[0] - b[1]), max(b[2] - q[1], 0, q[1] - b[3])) for b in boxes)
    near = min(clear(fn(M.t_of(f))) for fn in P.tracks().values() for f in range(P.F0 - 1, P.F0 + P.FRAMES + 1))
    check("P5 : rien à moins de 3 m d'un conteneur ou du portique", near >= 4.0, f"{near:.1f} m")


def test_p2():
    """P2 : la trajectoire validée (cars) retrouvée par le plan animé à l'instant STILL ; aucune distance sous 6 m."""
    import p2_arc as P
    d, f, a, b = M.min_gap(P.tracks(), range(P.F0 - 1, P.F0 + P.FRAMES + 1))
    check("P2 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    t = P.STILL * P.T_END
    ref = P.cars(P.STILL)
    ok = all(math.dist(ref[k][:2], P.tracks()[k](t)) < 1e-6 for k in ref)
    check("P2 : la trajectoire validée inchangée", ok and abs(P.hero_slip(t) - P.DRIFT) < 1e-9)
    ps = M.sample(P.hero_pos, range(0, 30), slip=P.hero_slip, noise=0.0)
    check("P2 : virage à gauche, roulis vers la droite", ps[-1]["roll"] > 2.0, f"{ps[-1]['roll']:.2f}°")
    check("P2 : glisse à gauche, contre-braquage (roues à droite)", ps[-1]["steer"] < 0.0, f"{ps[-1]['steer']:.2f}°")


def test_p4():
    """P4 : aucune distance sous 6 m ; la meute 25 m derrière la berline au moins ; la pose validée à l'image fixe."""
    import p4_pont as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    d, f, a, b = M.min_gap(P.tracks(), frames)
    check("P4 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    gap = min(math.dist(P.hero_pos(M.t_of(f)), P.pack_pos(i)(M.t_of(f))) for f in frames for i in range(len(P.PACK)))
    check("P4 : la meute ne rattrape pas la berline", gap >= 25.0, f"{gap:.1f} m au plus près")
    dist = P.CAM[1] - P.hero_pos(P.T_STILL)[1]
    check("P4 : la berline à 70 m à l'image fixe", abs(dist - 70.0) < 1.0, f"{dist:.1f} m")


def test_p3():
    """P3 : aucun choc (centres à plus de 3 m, caisse à 15 cm au moins des patrouilles, des agents, des plots et de
    la caméra) ; roulis et tangage bornés ; le cadre validé à l'image fixe ; éclairs d'une ou deux images."""
    import p3_enseignes as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    d, f, a, b = M.min_gap(P.tracks(), frames)
    check("P3 : distances gardées", d >= 3.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    cl = P.clearances(frames)
    n, (dm, fm) = min(cl.items(), key=lambda kv: kv[1][0])
    check("P3 : la caisse ne touche rien", dm >= 0.15, f"{dm:.2f} m de {n} à l'image {fm:.2f}")
    ps = M.sample(P.hero_pos, frames, heading=P.hero_heading, wheel_r=0.31, wheelbase=2.77)
    check("P3 : roulis ≤ 6°", max(abs(p["roll"]) for p in ps) <= 6.0, f"{max(abs(p['roll']) for p in ps):.2f}°")
    check("P3 : tangage ≤ 3°", max(abs(p["pitch"]) for p in ps) <= 3.0, f"{max(abs(p['pitch']) for p in ps):.2f}°")
    x, y = P.hero_pos(P.T_STILL)
    ok = abs(x - P.STILL[0]) < 1e-6 and abs(y - P.STILL[1]) < 1e-6 and abs(P.hero_heading(P.T_STILL) - P.STILL[2]) < 1e-9
    check("P3 : la pose validée à l'image fixe", ok, f"({x:.3f}, {y:.3f}), {P.hero_heading(P.T_STILL):.2f}°")
    runs = []
    for k in P.SHOTS:
        n = 0
        for f in range(P.F0, P.F0 + P.FRAMES + 1):
            if P.firing(k, f):
                n += 1
            elif n:
                runs.append(n)
                n = 0
    check("P3 : éclairs d'une ou deux images", runs and max(runs) <= 2, f"durées {runs}")
    check("P3 : éclairs sur l'image fixe", all(P.firing(k, P.STILL_FRAME) for k in P.SHOTS))


def test_p6():
    """P6 : aucune distance sous 6 m au sol ; la colonne derrière la berline ; la pose validée à l'image fixe ; les
    avions au-dessus de tout, loin des hélicoptères et de la grue ; personne ne tire (il n'y a rien à tirer)."""
    import p6_jetee as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    d, f, a, b = M.min_gap(P.tracks(), frames)
    check("P6 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    gap = min(math.dist(P.hero_pos(M.t_of(f)), P.column_pos(i)(M.t_of(f))) for f in frames for i in range(len(P.COLUMN)))
    check("P6 : la colonne ne rattrape pas la berline", gap >= 15.0, f"{gap:.1f} m au plus près")
    x, y = P.hero_pos(P.T_STILL)
    c = P.camera(P.T_STILL)
    check("P6 : la pose validée à l'image fixe", abs(y - P.Y_HERO_STILL) < 0.01 and abs(c[1] - y - 65.0) < 0.5
          and abs(c[2] - 35.0) < 0.5, f"berline y {y:.1f}, grue {c[1] - y:.1f} m devant, {c[2]:.1f} m")
    air = {f"heli_{i}": P.heli(i) for i in range(len(P.HELIS))}
    air.update({f"jet_{i}": P.jet(i) for i in range(len(P.JETS))})
    worst = min((math.dist(air[p](M.t_of(f))[:3], air[q](M.t_of(f))[:3]), p, q, f)
                for f in frames for p in air for q in air if p < q)
    check("P6 : les appareils s'évitent (30 m)", worst[0] >= 30.0, f"{worst[0]:.1f} m entre {worst[1]} et {worst[2]}")
    low = min(P.jet(i)(M.t_of(f))[2] - max(P.heli(k)(M.t_of(f))[2] for k in range(len(P.HELIS)))
              for f in frames for i in range(len(P.JETS)))
    check("P6 : les avions au-dessus des hélicoptères", low >= 20.0, f"{low:.1f} m au plus bas")
    cam = min(math.dist(P.camera(M.t_of(f))[:3], air[k](M.t_of(f))[:3]) for f in frames for k in air)
    check("P6 : rien ne frôle la grue", cam >= 25.0, f"{cam:.1f} m au plus près")


def test_ouv():
    """OUV : la berline dépasse la patrouille garée à plus de 2 m (de flanc à flanc, demi-largeurs de 0,95 m), le
    plan et les trois secondes qui le suivent (elle la dépasse vers l'image 44) ; la patrouille dans le cadre."""
    import ouv_avenue as P
    d, f, a, b = M.min_gap(P.tracks(), range(P.F0, P.F0 + 96))
    check("OUV : la berline passe à plus de 2 m de la patrouille", d - 2 * 0.95 > 2.0,
          f"{d - 1.9:.1f} m de flanc à flanc à l'image {f}")
    cx, cy = P.camera(M.t_of(P.F0))[:2]
    a0 = math.degrees(math.atan2(cx - P.PATROL[0], P.PATROL[1] - cy))
    half = math.degrees(math.atan(10.125 / P.LENS))
    check("OUV : la patrouille dans le cadre à la première image", abs(a0 - (180.0 - P.CAM_YAW)) < half,
          f"{a0:.0f}° à gauche, le cadre de {180 - P.CAM_YAW - half:.0f} à {180 - P.CAM_YAW + half:.0f}°")


def test_fin6():
    """FIN6 : la caméra ne passe à moins de 1 m d'aucun véhicule, agent ni mât ; la berline entière dans le cadre,
    hors des bandes du HUD (12 % du haut, 15 % du bas), son milieu entre 35 et 60 % de la hauteur ; l'orbite de
    150° finit sur la pose validée (azimut 95°, immobile)."""
    import fin6_orbite as P
    frames = range(P.F0, P.F0 + P.FRAMES)
    near = min((d(P.camera(M.t_of(f))[:2]), n, f) for f in frames for n, d in P.obstacles())
    check("FIN6 : rien à moins de 1 m de la caméra", near[0] >= 1.0, f"{near[0]:.2f} m de {near[1]} à l'image {near[2]}")
    worst = []
    for f in frames:
        c = P.camera(M.t_of(f))
        pts = [P.project(c, p) for p in P.hero_corners()]
        mid = P.project(c, (P.CX, P.CY, P.HERO_BOX[2] / 2))
        ok = all(q is not None and abs(q[0]) <= 1.0 and 0.15 <= q[1] <= 0.88 for q in pts) and 0.35 <= mid[1] <= 0.60
        if not ok:
            worst.append(f)
    check("FIN6 : la berline dans le cadre, hors du HUD, au milieu de la hauteur", not worst, f"images {worst[:5]}")
    check("FIN6 : 150° d'orbite", abs(abs(P.azimuth(P.T_END) - P.azimuth(0.0)) - 150.0) < 0.01)
    a, b = P.camera(P.T_STILL), P.camera(M.t_of(P.STILL_FRAME - 1))
    check("FIN6 : la pose validée à la fin", abs(P.azimuth(P.T_STILL) - 95.0) < 0.01 and math.dist(a[:3], b[:3]) < 0.05,
          f"{math.dist(a[:3], b[:3]) * 100:.1f} cm entre les deux dernières images")


def test_fin():
    """FIN : la berline et la patrouille ne se touchent pas (0,5 m d'air au moins, caisses en rectangles) ; la
    portière ne traverse pas l'agent ; rien ne frôle la caméra ; la berline arrêtée sur la pose validée."""
    import fin_pointe as P
    frames = range(P.F0, P.F0 + P.FRAMES)
    g = min(P.rect_gap(P.hero_pos(M.t_of(f)), P.hero_heading(M.t_of(f)), P.HERO_BOX, P.PATROL, P.HERO_STOP,
                       P.PATROL_BOX) for f in frames)
    check("FIN : la berline ne touche pas la patrouille", g >= 0.5, f"{g:.2f} m au plus près")
    d = min(P.seg_point(P.HINGE, tuple(P.HINGE[k] + P.door_dir(P.door_deg(M.t_of(f)))[k] * P.DOOR_LEN for k in (0, 1)),
                        P.OFFICER) - P.OFFICER_R for f in frames)
    check("FIN : la portière ne traverse pas l'agent", d >= 0.05, f"{d:.2f} m au plus près")
    o = min(P.rect_gap(P.hero_pos(M.t_of(f)), P.hero_heading(M.t_of(f)), P.HERO_BOX, P.OFFICER, 0.0,
                       (2 * P.OFFICER_R, 2 * P.OFFICER_R)) for f in frames)
    check("FIN : la berline ne touche pas l'agent", o >= 0.5, f"{o:.2f} m au plus près")
    c = min(P.rect_gap(P.hero_pos(M.t_of(f)), P.hero_heading(M.t_of(f)), P.HERO_BOX, P.CAM[:2], 0.0, (0.2, 0.2))
            for f in frames)
    check("FIN : rien ne frôle la caméra", c >= 1.0, f"{c:.2f} m au plus près")
    x, y = P.hero_pos(P.T_STILL)
    check("FIN : la pose validée à la fin", math.dist((x, y), (P.CX, P.CY)) < 1e-6
          and abs(P.hero_heading(P.T_STILL) - P.HERO_STOP) < 1e-6)
    ps = M.sample(P.hero_pos, range(0, 40), heading=P.hero_heading, noise=0.0)
    check("FIN : la caisse plonge au freinage", min(p["pitch"] for p in ps) < -1.0,
          f"{min(p['pitch'] for p in ps):.2f}°")


def test_spin_steps():
    """Les roues à pleine vitesse : sample() cumule bien la distance sur le rayon ; key_vehicle ajoute assez de clés
    pour qu'aucun pas ne dépasse 0,8 demi-tour (au-delà, l'Euler « compatible » tourne à rebours : vu en P6, 75 rad
    de clés pour 150 rad parcourus)."""
    import p6_jetee as P
    fr = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    ps = M.sample(P.column_pos(0), fr, wheel_r=0.33, seed=0.0)
    d = sum(math.dist((ps[k]["x"], ps[k]["y"]), (ps[k + 1]["x"], ps[k + 1]["y"])) for k in range(len(ps) - 1))
    spin = ps[-1]["spin"] - ps[0]["spin"]
    check("roues : angle cumulé = distance / rayon", abs(spin - d / 0.33) < 0.01 * d / 0.33,
          f"{spin:.1f} rad pour {d / 0.33:.1f}")
    worst = max(abs(ps[k + 1]["spin"] - ps[k]["spin"]) / M.spin_steps(ps[k + 1]["spin"] - ps[k]["spin"])
                for k in range(len(ps) - 1))
    raw = max(abs(ps[k + 1]["spin"] - ps[k]["spin"]) for k in range(len(ps) - 1))
    check("roues : pas de clé sous le demi-tour", worst < math.pi and raw > math.pi,
          f"{raw:.2f} rad par image, {worst:.2f} par clé")


def test_p1():
    """P1 : la suite exacte d'OUV (position et vitesse à la coupe, le pas d'une image) ; la berline passe à plus
    de 2 m de la patrouille, de flanc à flanc ; la rampe ne s'allume qu'une fois la patrouille dépassée."""
    import ouv_avenue as O
    import p1_habitacle as P
    h = 1.0 / 240.0
    gap = math.dist(P.hero_pos(0.0), O.hero_pos(P.T_CUT))
    check("P1 : même position à la coupe", gap < 1e-6, f"{gap:.2e} m")
    step = P.hero_pos(0.0)[1] - O.hero_pos(M.t_of(O.F0 + O.FRAMES - 1))[1]
    check("P1 : le pas d'une image à la coupe", abs(step - O.SPEED / M.FPS) < 1e-6, f"{step:.4f} m")
    v1 = (P.hero_pos(h)[1] - P.hero_pos(0.0)[1]) / h
    check("P1 : même vitesse à la coupe", abs(v1 - O.SPEED) < 0.01, f"{v1 * 3.6:.2f} km/h")
    frames = range(P.F0, P.F0 + P.FRAMES)
    d, f, a, b = M.min_gap(P.tracks(), frames)
    check("P1 : la berline passe à plus de 2 m de la patrouille", d - 2 * 0.95 > 2.0,
          f"{d - 1.9:.1f} m de flanc à flanc à l'image {f}")
    first = min(f for f in frames if P.bars_on(f))
    passed = P.hero_pos(M.t_of(first))[1] > P.patrol_pos(M.t_of(first))[1]
    check("P1 : la rampe s'allume une fois la patrouille dépassée", passed, f"image {first}")


def test_bars():
    seq = [M.bar_phase(f) for f in range(24)]
    check("rampes : 2 Hz, alternance corail / lilas", seq[:6] == ["corail"] * 6 and seq[6:12] == ["lilas"] * 6
          and seq.count("corail") == 12)


if __name__ == "__main__":
    test_straight()
    test_braking()
    test_right_turn()
    test_gaps()
    test_p2()
    test_p4()
    test_p3()
    test_p6()
    test_ouv()
    test_fin6()
    test_fin()
    test_spin_steps()
    test_p1()
    test_bars()
    print(f"\n{'tout passe' if not FAIL else str(len(FAIL)) + ' échec(s)'}")
    sys.exit(1 if FAIL else 0)
