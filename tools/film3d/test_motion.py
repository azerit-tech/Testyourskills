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
    check("droite : bruit de suspension faible", max(abs(p["roll"]) for p in noisy) < 0.4
          and max(abs(p["heave"]) for p in noisy) < 0.012,
          f"roulis {max(abs(p['roll']) for p in noisy):.2f}°, pompage {max(abs(p['heave']) for p in noisy) * 100:.1f} cm")


def test_braking():
    """Un freinage à 9 m/s² : l'avant plonge (tangage négatif), sans dépasser 3°."""
    pos = M.straight(0.0, 0.0, 25.0, accel=lambda t: -9.0 if t >= 0.2 else 0.0)
    ps = M.sample(pos, FRAMES, noise=0.0)
    lo = min(p["pitch"] for p in ps)
    check("freinage : l'avant plonge", lo < -1.5, f"{lo:.2f}°")
    bound = (M.CHASSIS["hero"]["pitch_max"] + 0.5) if M.dyn_on() else M.PITCH_MAX
    check("freinage : plongée bornée", lo >= -bound - 1e-9, f"{lo:.2f}° pour {bound:.1f}")
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
    """P5 : les véhicules gardent leurs distances (jamais moins de 6 m entre deux centres), la berline frôle sans
    toucher, le cadre du découpage v2 tient (projection des boîtes, sans Blender)."""
    import p5_virage as P
    d, f, a, b = M.min_gap(P.tracks(), range(P.F0 - 1, P.F0 + P.FRAMES + 1))
    check("P5 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    gap = min(math.dist(P.hero_pos(M.t_of(f)), P.pack_pos(0)(M.t_of(f))) for f in range(P.F0, P.F0 + P.FRAMES))
    check("P5 : la meute ne rattrape pas la berline", gap > 25.0, f"{gap:.1f} m au plus près")
    check("M.min_gap voit un croisement", M.min_gap({"a": lambda t: (0.0, 10 * t), "b": lambda t: (0.0, 10 - 10 * t)},
                                                    range(0, 30))[0] < 0.5)
    # le mur de conteneurs prolongé (x -15,1 à -10,1, y 54 à 79), les jambes du portique (x -24 et -10,6, y 81 et
    # 95), les piles du côté est (x 24,9 à 70, y 45,7 à 57,9) : aucun centre de véhicule à moins de 3 m (plus sa
    # demi-largeur, 1 m)
    boxes = [(-15.1, -10.1, 54.0, 79.0), (24.9, 70.0, 45.7, 57.9)] + [(x - 1.0, x + 1.0, y - 1.8, y + 1.8)
                                                                       for x in (-24.0, -10.6) for y in (81.0, 95.0)]

    def clear(q, bs=boxes):
        return min(math.hypot(max(b[0] - q[0], 0, q[0] - b[1]), max(b[2] - q[1], 0, q[1] - b[3])) for b in bs)
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    near = min(clear(fn(M.t_of(f))) for fn in P.tracks().values() for f in frames)
    check("P5 : rien à moins de 3 m d'un conteneur ou du portique", near >= 4.0, f"{near:.1f} m")
    # ce que la berline frôle sans le toucher : la caisse (ses coins et le milieu de ses flancs) à plus de 0,4 m
    # des poteaux de la chaîne et des caisses de la sortie, et à moins de 2 m (sinon elle ne frôle rien) ; la
    # meute à plus de 0,6 m des poteaux (demi-largeur d'une patrouille : 1 m)
    poses = M.sample(P.hero_pos, frames, slip=P.hero_slip)

    def body_pts(p):
        h = math.radians(p["heading"])
        fx, fy = -math.sin(h), math.cos(h)
        return [(p["x"] + fx * a + fy * b, p["y"] + fy * a - fx * b) for a in (-2.45, 0.0, 2.45) for b in (-0.9, 0.9)]
    posts = [(x - 0.13, x + 0.13, y - 0.13, y + 0.13) for x, y in P.CHAIN_POSTS]
    d_chain = min(clear(q, posts) for p in poses for q in body_pts(p))
    d_crates = min(clear(q, [P.CRATES_BOX]) for p in poses for q in body_pts(p))
    check("P5 : la berline frôle la chaîne sans la toucher", 0.4 <= d_chain <= 2.0, f"{d_chain:.2f} m au plus près")
    check("P5 : la berline frôle les caisses sans les toucher", 0.4 <= d_crates <= 2.0, f"{d_crates:.2f} m au plus près")
    d_pack = min(clear(fn(M.t_of(f)), posts) for n, fn in P.tracks().items() if n != "hero" for f in frames)
    check("P5 : la meute passe à côté de la chaîne", d_pack >= 1.6, f"{d_pack:.2f} m entre un centre et un poteau")
    # rien ne frôle l'objectif : la caisse à plus de 5 m de la caméra
    d_cam = min(math.dist(q, P.CAM[:2]) for p in poses for q in body_pts(p))
    check("P5 : la berline à plus de 5 m de l'objectif", d_cam >= 5.0, f"{d_cam:.1f} m au plus près")
    # le cadre (découpage v2) : la berline passe près (moins de 9 m, plus de la moitié de la largeur), le milieu de sa
    # boîte reste dans le tiers central, elle ne touche ni la bande haute (12 %) ni la basse (15 %) ; l'hélicoptère
    # dans le cadre final, au-dessus d'elle, hors de la bande haute ; la meute dans le champ aux premières images
    boxes_f = [P.frame_box(p) for p in poses if P.F0 <= p["frame"] < P.F0 + P.FRAMES]
    mids = [(b[0] + b[1]) / 2 for b in boxes_f]
    check("P5 : la berline au milieu du cadre", all(33.0 <= m <= 67.0 for m in mids),
          f"milieu de {min(mids):.0f} à {max(mids):.0f} %")
    check("P5 : la berline hors des bandes d'habillage", all(b[2] >= 15.0 and b[3] <= 88.0 for b in boxes_f),
          f"y de {min(b[2] for b in boxes_f):.0f} à {max(b[3] for b in boxes_f):.0f} %")
    check("P5 : la berline passe près", min(b[4] for b in boxes_f) <= 9.0 and max(b[1] - b[0] for b in boxes_f) >= 50.0,
          f"{min(b[4] for b in boxes_f):.1f} m, {max(b[1] - b[0] for b in boxes_f):.0f} % de la largeur")
    # les plans bas : pendant le passage (à moins de 12 m), le centre de la berline entre 50 et 62 % de la hauteur
    # depuis le haut ; le cadre final : l'hélicoptère entre 18 et 30 % depuis le haut, la berline entre 55 et 70 %,
    # le faisceau entre les deux
    near = [100.0 - (b[2] + b[3]) / 2 for b in boxes_f if b[4] <= 12.0]
    check("P5 : la berline au milieu de la hauteur pendant le passage", near and all(50.0 <= c <= 62.0 for c in near),
          f"centre de {min(near):.0f} à {max(near):.0f} % du haut")
    t1 = M.t_of(P.F0 + P.FRAMES - 1)
    hh = P.heli(t1)
    hx = P.project((hh[0], hh[1], hh[2] + P.HELI_BODY), t1)
    car_end = 100.0 - (boxes_f[-1][2] + boxes_f[-1][3]) / 2
    check("P5 : le cadre final, l'hélicoptère au-dessus d'elle", hx and 30.0 <= hx[0] <= 70.0
          and 18.0 <= 100.0 - hx[1] <= 30.0 and 55.0 <= car_end <= 70.0,
          f"hélicoptère x {hx[0]:.0f} %, à {100 - hx[1]:.0f} % du haut ; berline à {car_end:.0f} %" if hx else "derrière")
    cams = [P.camera(M.t_of(f)) for f in frames]
    check("P5 : caméra sur pied, horizon à plat", all(c[5] == 0.0 and c[:3] == tuple(P.CAM) for c in cams))
    pk = [P.project((*P.pack_pos(0)(M.t_of(f)), 0.8), M.t_of(f)) for f in range(P.F0, P.F0 + 6)]
    check("P5 : la meute dans le champ au début", all(q and 0.0 <= q[0] <= 100.0 for q in pk),
          f"x {', '.join(f'{q[0]:.0f}' for q in pk if q)} %")
    yaws = [P.camera_aim(M.t_of(f))[0] for f in range(P.F0, P.F0 + P.FRAMES)]
    steps = [b - a for a, b in zip(yaws, yaws[1:])]
    check("P5 : panoramique amorti au départ et à l'arrivée", abs(steps[0]) < 1.0 and abs(steps[-1]) < 1.0
          and max(abs(s) for s in steps) < 6.0, f"{steps[0]:.2f}°, {steps[-1]:.2f}° par image, {max(abs(s) for s in steps):.1f} au plus")
    # au-dessus des piles du côté est (13 m au plus, 6 m de marge autour) avec 4 m d'air ; jamais sous 10 m ailleurs
    over = [P.heli(M.t_of(f)) for f in frames]
    low = [h[2] - 13.0 for h in over if 24.9 - 6.0 <= h[0] <= 70.0 + 6.0 and 45.7 - 6.0 <= h[1] <= 57.9 + 6.0]
    check("P5 : l'hélicoptère au-dessus des piles", (not low or min(low) >= 4.0) and min(h[2] for h in over) >= 10.0,
          f"{min(low) if low else 0:.1f} m d'air au-dessus des piles, {min(h[2] for h in over):.1f} m au plus bas")


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
    check("P2 : roulis ≤ 6°", max(abs(p["roll"]) for p in ps) <= 6.0, f"{max(abs(p['roll']) for p in ps):.2f}°")
    check("P2 : glisse de 22 à 25°", 22.0 <= P.DRIFT <= 25.0, f"{P.DRIFT:.1f}°")
    # la caméra basse du découpage v2 : jamais à moins de 6 m d'un véhicule, la berline la double
    cam = lambda t: P.low_cam_pos(t)[:2]                            # noqa: E731
    d, f, a, b = M.min_gap(dict(P.tracks(), camera=cam), range(P.F0 - 1, P.F0 + P.FRAMES + 1))
    check("P2 : la caméra à 6 m au moins des véhicules", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    ang = lambda p: math.degrees(math.atan2(p[1], p[0] + P.R))      # noqa: E731
    check("P2 : la berline double la caméra", ang(cam(0.0)) > ang(P.hero_pos(0.0)) and
          ang(cam(P.T_END)) < ang(P.hero_pos(P.T_END)))


def test_p4():
    """P4 : aucune distance sous 6 m ; la meute 25 m derrière la berline au moins ; la pose validée à l'image fixe."""
    import p4_pont as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    d, f, a, b = M.min_gap(P.tracks(), frames)
    check("P4 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    gap = min(math.dist(P.hero_pos(M.t_of(f)), P.pack_pos(i)(M.t_of(f))) for f in frames for i in range(len(P.PACK)))
    check("P4 : la meute ne rattrape pas la berline", gap >= 25.0, f"{gap:.1f} m au plus près")
    dist = P.Y_REF - P.hero_pos(P.T_STILL)[1]
    check("P4 : la trajectoire inchangée (70 m de Y_REF à l'image fixe)", abs(dist - 70.0) < 1.0, f"{dist:.1f} m")
    near = min(P.CAM[1] - P.hero_pos(M.t_of(f))[1] for f in frames)
    check("P4 : la berline reste à 40 m de l'objectif au moins", near >= 40.0, f"{near:.1f} m")


def test_p3():
    """P3 (découpage v2, de dos) : aucun choc (centres à plus de 3 m, caisse à 15 cm au moins des patrouilles, des
    agents, des plots, des voitures garées et des caisses, caméra à 2 m au moins de la caisse) ; roulis et tangage
    bornés ; la berline commence 5 images plus tôt (y 93,5 à 95) et finit au-delà des plots, entre les patrouilles ;
    la caméra s'arrête avant les plots, à vitesse nulle, et descend de 1,9 à 0,6 m sans palier ; la berline dans le
    tiers central (son centre), son centre entre 50 et 62 % de la hauteur depuis le haut (la règle des plans bas : la
    chaussée n'a pas la moitié du cadre), entière hors des bandes du HUD (15 % du bas, 12 % du haut), le trou des plots
    dans le cadre à chaque image ; éclairs d'une ou deux images."""
    import p3_enseignes as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    d, f, a, b = M.min_gap(P.tracks(), frames)
    check("P3 : distances gardées", d >= 3.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    cl = P.clearances(frames)
    cam = cl.pop("camera")
    n, (dm, fm) = min(cl.items(), key=lambda kv: kv[1][0])
    check("P3 : la caisse ne touche rien", dm >= 0.15, f"{dm:.2f} m de {n} à l'image {fm:.2f}")
    check("P3 : la caméra à 2 m au moins de la caisse", cam[0] >= 2.0, f"{cam[0]:.2f} m à l'image {cam[1]:.2f}")
    ps = M.sample(P.hero_pos, frames, heading=P.hero_heading, wheel_r=0.31, wheelbase=2.77)
    rmax, pmax = ((M.CHASSIS["hero"]["roll_max"] + 0.5, M.CHASSIS["hero"]["pitch_max"] + 0.5) if M.dyn_on()
                  else (6.0, 3.0))
    check("P3 : roulis borné", max(abs(p["roll"]) for p in ps) <= rmax, f"{max(abs(p['roll']) for p in ps):.2f}°")
    check("P3 : tangage borné", max(abs(p["pitch"]) for p in ps) <= pmax, f"{max(abs(p['pitch']) for p in ps):.2f}°")
    y0, y1 = P.hero_pos(0.0)[1], P.hero_pos(P.T_END)[1]
    check("P3 : de y 93,5–95 au-delà des plots", 93.5 <= y0 <= 95.0 and y1 - P.HALF_L > P.CONE_LINE + 0.5
          and y1 < P.PATROLS["patrol_a"][1] + 3.0, f"y {y0:.1f} → {y1:.1f}")
    v_end = M.t_of(P.F0 + P.FRAMES - 1)
    cys = [P.camera(M.t_of(f))[1] for f in range(P.F0, P.F0 + P.FRAMES)]
    check("P3 : la caméra s'arrête avant les plots", max(cys) < P.CONE_LINE - 1.0
          and abs(P.cam_y(v_end) - P.cam_y(v_end - 1 / 24)) < 0.02, f"y {max(cys):.1f} (plots à {P.CONE_LINE:.1f})")
    zs = [P.cam_z(M.t_of(f)) for f in range(P.F0, P.F0 + P.FRAMES)]
    low = next(i for i, z in enumerate(zs) if z <= P.Z1 + 1e-6)
    check("P3 : descente de 1,9 à 0,6 m sans palier", abs(zs[0] - 1.9) < 0.01 and abs(zs[-1] - 0.6) < 1e-6
          and all(zs[i + 1] < zs[i] - 0.005 for i in range(low - 1)), f"au sol à l'image {low + P.F0}")
    bad = []
    for f in range(P.F0, P.F0 + P.FRAMES):
        t = M.t_of(f)
        c = P.camera(t)
        (u0, u1, v0, v1), (uc, vc) = P.hero_frame(t, c)
        g = P.project(c, (P.GAP[0], P.GAP[1], 0.9))
        if not (abs(uc) <= 1 / 3 and u0 > -1.0 and u1 < 1.0 and v0 >= 0.15 and v1 <= 0.88 and 0.38 <= vc <= 0.50
                and g and abs(g[0]) < 0.6 and 0.15 < g[1] < 0.88):
            bad.append(f)
    check("P3 : la berline au tiers central, hors du HUD, le barrage dans le cadre", not bad, f"images {bad[:6]}")
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
    """P6 (découpage v2) : aucune distance sous 6 m au sol ; la colonne derrière la berline ; la caméra devant elle,
    au ras du sol jusqu'à l'image 24, à 5 m et 13 m devant à la fin ; les appareils s'évitent, les avions au large
    de la jetée ; rien ne frôle la caméra ; personne ne tire (il n'y a rien à tirer)."""
    import p6_jetee as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    d, f, a, b = M.min_gap(P.tracks(), frames)
    check("P6 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    gap = min(math.dist(P.hero_pos(M.t_of(f)), P.column_pos(i)(M.t_of(f))) for f in frames for i in range(len(P.COLUMN)))
    check("P6 : la colonne ne rattrape pas la berline", gap >= 15.0, f"{gap:.1f} m au plus près")
    low = [P.camera_path(M.t_of(f)) for f in range(P.F0, P.LIFT_FRAME + 1)]
    lo_ok = all(abs(c[1] - P.hero_pos(M.t_of(f))[1] - 7.0) < 0.01 and abs(c[2] - 0.55) < 0.01
                for f, c in zip(range(P.F0, P.LIFT_FRAME + 1), low))
    end = P.camera_path(P.T_END)
    check("P6 : au ras du sol à 7 m devant jusqu'à l'image 24, 5 m de haut et 13 m devant à la fin",
          lo_ok and abs(end[2] - 5.0) < 0.01 and abs(end[1] - P.hero_pos(P.T_END)[1] - 13.0) < 0.01,
          f"fin {end[2]:.2f} m de haut, {end[1] - P.hero_pos(P.T_END)[1]:.2f} m devant")
    air = {f"heli_{i}": P.heli(i) for i in range(len(P.HELIS))}
    air.update({f"jet_{i}": P.jet(i) for i in range(len(P.JETS))})
    worst = min((math.dist(air[p](M.t_of(f))[:3], air[q](M.t_of(f))[:3]), p, q, f)
                for f in frames for p in air for q in air if p < q)
    check("P6 : les appareils s'évitent (15 m)", worst[0] >= 15.0, f"{worst[0]:.1f} m entre {worst[1]} et {worst[2]}")
    side = min(abs(P.jet(i)(M.t_of(f))[0] - P.JX) for f in frames for i in range(len(P.JETS)))
    check("P6 : les avions passent au large de la jetée (20 m)", side >= 20.0, f"{side:.1f} m de l'axe")
    for name, fn in (("caméra", P.camera), ("caméra V1", P.camera_v1)):
        cam = min(math.dist(fn(M.t_of(f))[:3], air[k](M.t_of(f))[:3]) for f in frames for k in air)
        check(f"P6 : rien ne frôle la {name} (20 m)", cam >= 20.0, f"{cam:.1f} m au plus près")
    car = min(math.dist(P.camera(M.t_of(f))[:2], P.hero_pos(M.t_of(f))) for f in frames)
    check("P6 : la caméra garde 7 m devant la berline", car >= 6.9, f"{car:.2f} m au plus près")


def test_ouv():
    """OUV : la berline dépasse la patrouille garée à plus de 2 m (de flanc à flanc, demi-largeurs de 0,95 m), le
    plan et les trois secondes qui le suivent (elle la dépasse vers l'image 44) ; la patrouille dans le cadre."""
    import ouv_avenue as P
    d, f, a, b = M.min_gap(P.tracks(), range(P.F0, P.F0 + 96))
    check("OUV : la berline passe à plus de 2 m de la patrouille", d - 2 * 0.95 > 2.0,
          f"{d - 1.9:.1f} m de flanc à flanc à l'image {f}")
    half = math.degrees(math.atan(10.125 / P.LENS))
    worst = 0.0
    for f in range(P.F0, P.F0 + 20):
        cx, cy = P.camera(M.t_of(f))[:2]
        a = math.degrees(math.atan2(cx - P.PATROL[0], P.PATROL[1] - cy))   # vers la gauche
        worst = max(worst, a + (P.CAM_YAW - 180.0))   # depuis l'axe de visée (tourné vers la droite de CAM_YAW - 180)
    check("OUV : la patrouille dans le cadre jusqu'à l'image 20", worst < half - 2.5,
          f"au plus {worst:.1f}° à gauche de l'axe, le bord à {half:.1f}°")


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
    off = max(abs(P.project(P.camera(M.t_of(f)), (P.CX, P.CY, P.HERO_BOX[2] / 2))[0]) / 2 for f in frames)
    check("FIN6 : le milieu de la berline dans le tiers central de la largeur", off <= 1 / 6, f"{off:.0%} du centre")
    hs = [1.0 - P.project(P.camera(M.t_of(f)), (P.CX, P.CY, P.HERO_BOX[2] / 2))[1] for f in frames]
    check("FIN6 : plan bas, le milieu de la berline entre 50 et 62 % de la hauteur", 0.50 <= min(hs) and max(hs) <= 0.62,
          f"de {min(hs):.1%} à {max(hs):.1%}")
    w = [abs(P.azimuth(M.t_of(f + 1)) - P.azimuth(M.t_of(f))) for f in frames]
    check("FIN6 : départ et arrêt amortis", w[0] < 0.6 * max(w) and w[-2] < 0.05 * max(w),
          f"{w[0]:.2f}° puis {max(w):.2f}° au plus vite, {w[-2]:.3f}° à la fin")
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
    first = next(p for p in ps if p["frame"] == P.F0)
    check("FIN : la caisse ne se cabre pas à la première image (la berline arrive lancée)", first["pitch"] < 0.0,
          f"{first['pitch']:.2f}°")
    stop = min(f for f in range(P.F0, P.F0 + P.FRAMES) if math.dist(P.hero_pos(M.t_of(f)), (P.CX, P.CY)) < 1e-6)
    check("FIN : la berline s'arrête à l'image 22", stop == 22, f"image {stop}")
    # la caméra : l'avancée de 2,2 m se pose sur la pose validée à l'image 22 et n'en bouge plus
    c0, cl = P.camera(M.t_of(P.F0)), P.camera(M.t_of(P.F_LAND))
    still = all(P.camera(M.t_of(f)) == cl for f in range(P.F_LAND, P.F0 + P.FRAMES + 1))
    check("FIN : la caméra se pose à l'image 22 sur la pose validée, puis tient",
          math.dist(cl[:3], P.CAM) < 1e-9 and cl[3:] == (1.0, 14.0, 0.0, 24.0) and still)
    check("FIN : l'avancée fait 2,2 m", abs(math.dist(c0[:2], cl[:2]) - 2.2) < 0.25, f"{math.dist(c0[:2], cl[:2]):.2f} m")
    steps = [math.dist(P.camera(M.t_of(f))[:2], P.camera(M.t_of(f + 1))[:2]) for f in range(P.F0, P.F_LAND)]
    check("FIN : l'avancée freine sans à-coup", all(b <= a + 1e-9 for a, b in zip(steps, steps[1:])) and steps[-1] < 0.005,
          f"{steps[-1] * 1000:.1f} mm à la dernière image")
    # plan bas : le milieu de la berline entre 50 et 62 % de la hauteur depuis le haut (62,6 % sur la pose validée,
    # qui ne change pas : 0,7 point de tolérance), sans monter vers l'horizon au début de l'avancée
    from fin6_orbite import project, HERO_BOX
    hs = [1.0 - project(P.camera(M.t_of(f)), (*P.hero_pos(M.t_of(f)), HERO_BOX[2] / 2))[1] for f in frames]
    check("FIN : le milieu de la berline entre 50 et 63 % de la hauteur", 0.50 <= min(hs) and max(hs) <= 0.63,
          f"de {min(hs):.1%} à {max(hs):.1%}")
    # les poursuivants : arrêtés l'un après l'autre, avant la berline ou avec elle, sans rien toucher
    stops = [a[1] for a in P.ARC]
    check("FIN : les poursuivants s'arrêtent l'un après l'autre", len(set(stops)) == len(stops)
          and all(b - a >= 4 for a, b in zip(stops, stops[1:])) and max(stops) <= 22, f"images {stops}")
    for i in range(len(P.ARC)):
        pos, head = P.arc_pos(i), P.arc_heading(i)
        moved = math.dist(pos(M.t_of(stops[i])), pos(M.t_of(stops[i] + 6)))
        gaps = []
        for f in range(P.F0 - 1, P.F0 + P.FRAMES + 1):
            t = M.t_of(f)
            gaps.append(P.rect_gap(pos(t), head(t), P.PATROL_BOX, P.hero_pos(t), P.hero_heading(t), P.HERO_BOX))
            gaps.append(P.rect_gap(pos(t), head(t), P.PATROL_BOX, P.PATROL, P.HERO_STOP, P.PATROL_BOX))
            for j in range(i):
                gaps.append(P.rect_gap(pos(t), head(t), P.PATROL_BOX, P.arc_pos(j)(t), P.arc_heading(j)(t),
                                       P.PATROL_BOX))
        check(f"FIN : le poursuivant {i} arrêté à l'image {stops[i]}, à 1 m au moins de tout véhicule",
              moved < 1e-6 and min(gaps) >= 1.0, f"{min(gaps):.2f} m au plus près")


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
    """P1, après l'ellipse (§18.36) : la position d'OUV prolongée de 2,5 s à vitesse constante, la même vitesse au
    début ; la patrouille derrière, dans la même voie, à plus de 15 m ; la rampe s'allume dans le plan ; la caméra
    (découpage v2, option A) devant la berline, hors de sa voie, sans jamais la toucher, et rattrapée en douceur."""
    import ouv_avenue as O
    import p1_avenue as P
    h = 1.0 / 240.0
    last = O.hero_pos(M.t_of(O.F0 + O.FRAMES - 1))
    want = last[1] + O.SPEED * (P.ELLIPSIS + 1.0 / M.FPS)
    gap = abs(P.hero_pos(0.0)[1] - want) + abs(P.hero_pos(0.0)[0] - last[0])
    check("P1 : OUV prolongé de 2,5 s à vitesse constante", gap < 1e-6, f"{gap:.2e} m")
    v1 = (P.hero_pos(h)[1] - P.hero_pos(0.0)[1]) / h
    check("P1 : même vitesse au début", abs(v1 - O.SPEED) < 0.01, f"{v1 * 3.6:.2f} km/h")
    frames = range(P.F0, P.F0 + P.FRAMES)
    behind = min(P.hero_pos(M.t_of(f))[1] - P.patrol_pos(M.t_of(f))[1] for f in frames)
    lane = max(abs(P.patrol_pos(M.t_of(f))[0] - P.hero_pos(M.t_of(f))[0]) for f in frames)
    check("P1 : la patrouille derrière, à plus de 15 m, à moins d'une voie de côté", behind > 15.0 and lane < 1.5,
          f"{behind:.1f} m au plus près, {lane:.2f} m d'écart latéral")
    on = [f for f in frames if P.bars_on(f)]
    check("P1 : la rampe s'allume dans le plan", on and on[0] > frames[0], f"image {on[0] if on else None}")
    cams = [P.camera(M.t_of(f)) for f in frames]
    ahead = [c[1] - P.hero_pos(M.t_of(f))[1] for c, f in zip(cams, frames)]
    side = min(c[0] - P.hero_pos(M.t_of(f))[0] for c, f in zip(cams, frames))
    check("P1 : la caméra devant, à plus de 10 m, hors de la voie de la berline", min(ahead) > 10.0 and side > 2.0,
          f"{min(ahead):.2f} m au plus près, {side:.2f} m à droite")
    step = max(abs(b - a) for a, b in zip(ahead, ahead[1:]))
    check("P1 : la caméra se laisse rattraper sans à-coup", ahead[-1] < ahead[0] and step < 0.2, f"{step:.3f} m par image")


def test_bars():
    seq = [M.bar_phase(f) for f in range(24)]
    check("rampes : 2 Hz, alternance corail / lilas", seq[:6] == ["corail"] * 6 and seq[6:12] == ["lilas"] * 6
          and seq.count("corail") == 12)


# ---------------------------------------------------------------- la dynamique (FILM3D_DYN)

class dyn:
    """Le temps d'un bloc, FILM3D_DYN à la valeur donnée."""

    def __init__(self, on):
        self.on = on

    def __enter__(self):
        self.old = os.environ.get("FILM3D_DYN")
        os.environ["FILM3D_DYN"] = "1" if self.on else "0"

    def __exit__(self, *a):
        if self.old is None:
            os.environ.pop("FILM3D_DYN", None)
        else:
            os.environ["FILM3D_DYN"] = self.old


REF_COMMIT = "bcc8b32"      # le motion.py d'avant la dynamique


def _old_motion():
    """Le motion.py d'avant la dynamique (git show), pour vérifier que FILM3D_DYN=0 le rend à l'identique ; None si
    le dépôt n'a pas ce commit."""
    import subprocess
    import types
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        src = subprocess.run(["git", "-C", here, "show", f"{REF_COMMIT}:tools/film3d/motion.py"], capture_output=True,
                             text=True, check=True).stdout
    except Exception:
        return None
    mod = types.ModuleType("motion_avant")
    exec(compile(src, "motion_avant.py", "exec"), mod.__dict__)
    return mod


def _plan_tracks():
    """(nom, pos, kwargs de sample, images) des véhicules des plans, sans Blender."""
    import fin_pointe as F
    import p2_arc as P2
    import p3_enseignes as P3
    import p4_pont as P4
    import p5_virage as P5
    import p6_jetee as P6
    out = [("P2 berline", P2.hero_pos, dict(slip=P2.hero_slip), range(P2.F0 - 1, P2.F0 + P2.FRAMES + 1)),
           ("P2 patrouille", P2.patrol_pos(0), dict(slip=P2.patrol_slip(0), seed=1.0), range(0, 30)),
           ("P3 berline", P3.hero_pos, dict(heading=P3.hero_heading, wheel_r=0.31, wheelbase=2.77),
            range(P3.F0 - 1, P3.F0 + P3.FRAMES + 1)),
           ("P4 berline", P4.hero_pos, {}, range(P4.F0 - 1, P4.F0 + P4.FRAMES + 1)),
           ("P4 fourgon", P4.van_pos, dict(seed=4.0), range(P4.F0 - 1, P4.F0 + P4.FRAMES + 1)),
           ("P5 berline", P5.hero_pos, dict(slip=P5.hero_slip), range(P5.F0 - 1, P5.F0 + P5.FRAMES + 1)),
           ("P5 meute", P5.pack_pos(0), dict(seed=0.0), range(P5.F0 - 1, P5.F0 + P5.FRAMES + 1)),
           ("P6 berline", P6.hero_pos, {}, range(P6.F0 - 1, P6.F0 + P6.FRAMES + 1)),
           ("P6 colonne", P6.column_pos(3), dict(seed=3.0), range(P6.F0 - 1, P6.F0 + P6.FRAMES + 1)),
           ("FIN berline", F.hero_pos, dict(heading=F.hero_heading), range(F.F0 - 1, F.F0 + F.FRAMES + 1))]
    return out


def test_dyn_switch():
    """FILM3D_DYN=0 : sample() rend exactement les poses d'avant (le motion.py du commit de référence) ; dynamique
    active, la position au sol, le cap, la vitesse et la rotation des roues ne bougent pas d'un iota."""
    old = _old_motion()
    tracks = _plan_tracks()
    if old is None:
        print(f"     (commit {REF_COMMIT} absent : comparaison au motion.py d'avant sautée)")
    else:
        bad = []
        with dyn(False):
            for name, pos, kw, fr in tracks:
                if [dict(p) for p in M.sample(pos, fr, **kw)] != old.sample(pos, fr, **kw):
                    bad.append(name)
        check("interrupteur : FILM3D_DYN=0 rend les poses d'avant à l'identique", not bad, ", ".join(bad))
    keys = ("frame", "t", "x", "y", "heading", "travel", "speed", "dist", "spin")
    worst = []
    for name, pos, kw, fr in tracks:
        with dyn(False):
            a = M.sample(pos, fr, **kw)
        with dyn(True):
            b = M.sample(pos, fr, **kw)
        if any(p[k] != q[k] for p, q in zip(a, b) for k in keys) or len(a) != len(b):
            worst.append(name)
    check("dynamique : position au sol, cap, vitesse et roues inchangés", not worst, ", ".join(worst))
    import fin_pointe as F
    with dyn(True):
        ps = M.sample(F.hero_pos, range(0, 38), heading=F.hero_heading)
    p22 = next(p for p in ps if p["frame"] == 22)
    check("FIN : la position au sol de l'image 22 inchangée", (p22["x"], p22["y"]) == F.hero_pos(M.t_of(22))
          and p22["heading"] == F.hero_heading(M.t_of(22)))


def _steady(ps, key, t_from):
    v = [p[key] for p in ps if p["t"] >= t_from]
    return sum(v) / len(v)


def test_hero_body():
    """La berline : roulis de 4 à 6° vers l'extérieur à 0,8 g, plongée de 1,5 à 3° à 0,8 g de freinage, la caisse qui
    suit avec retard et dépasse (elle a une masse)."""
    g = 0.8 * M.G
    v = 20.0
    r = v * v / g
    with dyn(True):
        ps = M.sample(_circle(r, v), range(0, 60), noise=0.0, warmup=1.5)
        roll = _steady(ps, "roll", 1.2)
        check("berline : roulis à 0,8 g de 4 à 6°, vers l'extérieur", -6.0 <= roll <= -4.0, f"{roll:.2f}°")
        brk = M.sample(M.straight(0.0, 0.0, 30.0, accel=lambda t: -g if t >= 0.2 else 0.0), range(0, 40), noise=0.0)
        lo = min(p["pitch"] for p in brk)
        mid = _steady([p for p in brk if p["t"] < 1.4], "pitch", 1.0)
        check("berline : plongée à 0,8 g de 1,5 à 3°", -3.0 <= mid <= -1.5 and lo >= -3.4, f"{mid:.2f}°, {lo:.2f}° au plus")
        # la réponse à un coup de frein : 63 % de la plongée entre 0,08 et 0,3 s après, un dépassement
        t63 = next(p["t"] for p in brk if p["pitch"] <= 0.63 * mid) - 0.2
        check("berline : la caisse suit avec retard", 0.08 <= t63 <= 0.3, f"{t63 * 1000:.0f} ms")
        check("berline : la caisse dépasse (la masse)", lo < mid * 1.08, f"{lo:.2f} pour {mid:.2f}°")
        acc = M.sample(M.straight(0.0, 0.0, 5.0, accel=lambda t: 0.45 * M.G if t >= 0.2 else 0.0), range(0, 40),
                       noise=0.0)
        up = _steady([p for p in acc if p["t"] < 1.4], "pitch", 1.0)
        hv = _steady([p for p in acc if p["t"] < 1.4], "heave", 1.0)
        check("berline : cabrage à l'accélération, la caisse se tasse", up > 0.8 and hv < -0.003,
              f"{up:.2f}°, {hv * 100:.1f} cm")


def test_fin_stop():
    """FIN : la berline freine, plonge, s'arrête ; la caisse revient en arrière, repart, se pose (deux oscillations
    amorties) ; les roues restent braquées à l'arrêt."""
    import fin_pointe as F
    with dyn(True):
        ps = M.sample(F.hero_pos, range(F.F0 - 1, F.F0 + F.FRAMES + 1), heading=F.hero_heading)
    stop = F.F0 + F.T_STOP * M.FPS
    before = [p for p in ps if p["frame"] < stop]
    after = [p for p in ps if p["frame"] > stop]
    dive = min(p["pitch"] for p in before)
    check("FIN : la plongée au freinage", dive <= -1.5, f"{dive:.2f}°")
    pk = max(after, key=lambda p: p["pitch"])
    check("FIN : la caisse revient en arrière après l'arrêt", pk["pitch"] >= 0.25 * -dive,
          f"{pk['pitch']:+.2f}° à l'image {pk['frame']}")
    later = [p for p in after if p["frame"] > pk["frame"]]
    lo = min(later, key=lambda p: p["pitch"]) if later else None
    check("FIN : la seconde oscillation, plus petite", lo is not None and lo["pitch"] < 0.0
          and -lo["pitch"] < pk["pitch"], f"{lo['pitch']:+.2f}° à l'image {lo['frame']}" if lo else "")
    last = next(p for p in ps if p["frame"] == F.STILL_FRAME)
    check("FIN : la caisse posée à l'image validée", abs(last["pitch"]) < 0.3 and abs(last["roll"]) < 0.3,
          f"tangage {last['pitch']:+.2f}°, roulis {last['roll']:+.2f}°")
    st = [p["steer"] for p in after]
    check("FIN : les roues restent où elles sont à l'arrêt", max(st) - min(st) < 1.0, f"{min(st):.1f} à {max(st):.1f}°")
    rate = max(abs(ps[i + 1]["steer"] - ps[i]["steer"]) for i in range(len(ps) - 1)) * M.FPS
    check("FIN : la vitesse de braquage bornée", rate <= M.STEER_RATE + 1e-6, f"{rate:.0f}°/s")


def test_arches():
    """Les roues dans leurs passages : sur tous les plans, la caisse ne descend jamais au-dessus d'un pneu de plus
    de 80 % du jeu mesuré (diag/dyn_arches.py), réglage par réglage."""
    worst = []
    with dyn(True):
        for name, pos, kw, fr in _plan_tracks():
            for kind in M.CHASSIS:
                ps = M.rebody(M.sample(pos, fr, **kw), kind)
                cs = ps.meta["corners"]
                gaps = M.arch_of(M.CHASSIS[kind], cs)
                r, cm = max((-d / g, -d) for p in ps for d, g in zip(M.corner_dz(p, cs), gaps))
                worst.append((r, name, kind, cm))
    w = max(worst)
    check("roues dans les ailes : jamais plus de 80 % du jeu", w[0] <= 0.8 + 1e-9,
          f"{w[3] * 100:.1f} cm ({w[0] * 100:.0f} % du jeu) : {w[1]}, {w[2]}")


def _deck(y):
    """Le profil du pont (scene_c.py, recopié sans Blender) : crête en -130, raccords paraboliques."""
    def ramp(y, a, t):
        return min(1.0, max(0.0, (y - (a - t / 2)) / t))
    z, yy, step = 0.0, -1010.0, 0.25
    while yy < y:
        z += 0.06 * (ramp(yy + step / 2, -255.0, 12.0) - 2 * ramp(yy + step / 2, -130.0, 20.0)
                     + ramp(yy + step / 2, -5.0, 12.0)) * step
        yy += step
    return max(0.0, z)


_DECK = {}


def deck_ground(x, y):
    k = round(y * 4)
    if k not in _DECK:
        _DECK[k] = _deck(k / 4)
    z0 = _DECK[k]
    return z0, 0.0


def test_pack():
    """La meute : chaque véhicule à son rythme (deux patrouilles ne tanguent pas ensemble), reproductible ; le
    fourgon roule plus qu'une patrouille ; il s'allège au passage de la crête de P4 puis retombe."""
    import p4_pont as P
    fr = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    with dyn(True):
        a = M.rebody(M.sample(P.pack_pos(0), fr, seed=1.0), "patrol")
        b = M.rebody(M.sample(P.pack_pos(1), fr, seed=2.0), "patrol")
        a2 = M.rebody(M.sample(P.pack_pos(0), fr, seed=1.0), "patrol")

        def corr(u, v):
            mu, mv = sum(u) / len(u), sum(v) / len(v)
            su = math.sqrt(sum((x - mu) ** 2 for x in u))
            sv = math.sqrt(sum((x - mv) ** 2 for x in v))
            return sum((x - mu) * (y - mv) for x, y in zip(u, v)) / (su * sv)
        cp = corr([p["pitch"] for p in a], [p["pitch"] for p in b])
        cr = corr([p["roll"] for p in a], [p["roll"] for p in b])
        amp = max(abs(p["pitch"]) for p in a)
        check("meute : deux patrouilles à leur rythme", abs(cp) < 0.8 and abs(cr) < 0.8 and amp > 0.08,
              f"corrélations {cp:.2f} (tangage), {cr:.2f} (roulis), {amp:.2f}° au plus")
        check("meute : reproductible (graine)", [dict(p) for p in a] == [dict(p) for p in a2])
        circ = _circle(40.0, 15.0)
        rv = _steady(M.rebody(M.sample(circ, range(0, 40), noise=0.0, warmup=1.5), "van"), "roll", 1.0)
        rp = _steady(M.rebody(M.sample(circ, range(0, 40), noise=0.0, warmup=1.5), "patrol"), "roll", 1.0)
        check("meute : le fourgon roule plus qu'une patrouille", abs(rv) > 1.4 * abs(rp), f"{rv:.2f} contre {rp:.2f}°")
        van = M.rebody(M.sample(P.van_pos, fr, seed=4.0, noise=0.0), "van", ground=deck_ground)
        flat = M.rebody(M.sample(P.van_pos, fr, seed=4.0, noise=0.0), "van")
        up = max(p["heave"] - q["heave"] for p, q in zip(van, flat) if abs(p["y"] + 130.0) < 10.0)
        check("P4 : le fourgon s'allège sur la crête", up > 0.01, f"{up * 100:.1f} cm de plus qu'à plat")
        # un ressaut en travers : la caisse pompe, puis se repose
        j = M.rebody(M.sample(M.straight(0.0, 0.0, 25.0), range(0, 40), noise=0.0), "hero",
                     joints=[((-5.0, 12.0), (5.0, 12.0), 0.03)])
        hj = [abs(p["heave"]) + abs(p["pitch"]) * 0.01 for p in j]
        check("ressaut : la caisse pompe puis se repose", max(hj) > 0.004 and hj[-1] < 0.3 * max(hj),
              f"{max(hj) * 100:.1f}, puis {hj[-1] * 100:.2f}")


def test_steer_dyn():
    """Les roues avant, dynamique active : contre-braquage net en glisse (P2, P5), vitesse de braquage bornée."""
    import p2_arc as P2
    import p5_virage as P5
    with dyn(True):
        p2 = M.sample(P2.hero_pos, range(P2.F0 - 1, P2.F0 + P2.FRAMES + 1), slip=P2.hero_slip)
        p5 = M.sample(P5.hero_pos, range(P5.F0 - 1, P5.F0 + P5.FRAMES + 1), slip=P5.hero_slip)
    s2 = p2[-2]["steer"]
    check("P2 : contre-braquage (glisse à gauche, roues à droite)", s2 < -2.0, f"{s2:.1f}°")
    drift = [p for p in p5 if p["heading"] - p["travel"] < -8.0]
    s5 = max(p["steer"] for p in drift) if drift else 0.0
    check("P5 : contre-braquage en glisse (glisse à droite, roues à gauche)", s5 > 2.0, f"{s5:.1f}° au plus")
    rate = max(abs(p[i + 1]["steer"] - p[i]["steer"]) * M.FPS for p in (p2, p5) for i in range(len(p) - 1))
    check("roues : vitesse de braquage bornée", rate <= M.STEER_RATE + 1e-6, f"{rate:.0f}°/s")


def test_aircraft():
    """Les aéronefs : l'hélicoptère pique pour accélérer, se cabre pour freiner, penche dans le virage ; l'avion
    roule dans son virage ; au stationnaire l'assiette respire ; les positions ne changent jamais."""
    fr = range(0, 30)

    def line(a):
        return lambda t: (0.0, 10.0 * t + 0.5 * a * t * t, 30.0, 0.0, -5.0, 0.0)
    acc = M.aircraft_attitude(line(6.0), fr, "heli")
    brk = M.aircraft_attitude(line(-6.0), fr, "heli")
    check("hélicoptère : il pique pour accélérer", acc[25][4] < -5.0 - 1.0, f"{acc[25][4]:.1f}°")
    check("hélicoptère : il se cabre pour freiner", brk[25][4] > -5.0 + 1.0, f"{brk[25][4]:.1f}°")
    same = all(acc[f][:4] == line(6.0)(M.t_of(f))[:4] for f in fr)
    check("hélicoptère : la trajectoire inchangée", same)

    def turn(t, r=60.0, v=25.0):
        a = v * t / r
        return -r + r * math.cos(a), r * math.sin(a), 30.0, math.degrees(a), -6.0, 0.0
    tl = M.aircraft_attitude(turn, fr, "heli", warmup=1.5)
    check("hélicoptère : il penche dans le virage à gauche", tl[29][5] < -2.0, f"{tl[29][5]:.1f}°")
    jt = M.aircraft_attitude(lambda t: turn(t, 900.0, 180.0), fr, "jet", warmup=1.5)
    bank = math.degrees(math.atan(180.0 ** 2 / 900.0 / M.G))
    check("avion : il roule dans son virage", -jt[29][5] > 0.6 * min(bank, 30.0), f"{jt[29][5]:.1f}° pour {bank:.0f}°")
    hov = M.aircraft_attitude(lambda t: (0.0, 0.0, 20.0, 0.0, 0.0, 0.0), range(0, 60), "heli")
    amp = max(abs(v[4]) + abs(v[5]) for v in hov.values())
    check("hélicoptère : le stationnaire respire, doucement", 0.2 < amp < 2.5, f"{amp:.2f}°")
    import p5_virage as P5
    import p6_jetee as P6
    p5 = M.aircraft_attitude(P5.heli, range(P5.F0 - 1, P5.F0 + P5.FRAMES + 1), "heli")
    d5 = max(max(abs(v[4] - P5.heli(M.t_of(f))[4]), abs(v[5] - P5.heli(M.t_of(f))[5])) for f, v in p5.items())
    check("P5 : l'hélicoptère s'incline, borné", 1.0 < d5 <= M.AIR["heli"]["max"] + 1.5, f"{d5:.1f}° ajoutés au plus")
    fr6 = range(P6.F0 - 1, P6.F0 + P6.FRAMES + 1)
    d6 = max(abs(v[4] - P6.heli(0)(M.t_of(f))[4]) for f, v in M.aircraft_attitude(P6.heli(0), fr6, "heli").items())
    check("P6 : en poursuite à vitesse tenue, presque rien ajouté", d6 < 1.5, f"{d6:.2f}°")


def _cam_dev(fn, fr, out):
    yaw = max(abs(out[f][3] - fn(M.t_of(f))[3]) for f in fr)
    pit = max(abs(out[f][4] - fn(M.t_of(f))[4]) for f in fr)
    return yaw, pit


def test_operator():
    """L'opérateur caméra : une caméra fixe sans passage reste immobile ; un véhicule qui la frôle la secoue,
    brièvement ; la voiture-travelling vibre selon sa vitesse ; le panoramique dépasse un peu à l'arrêt ; tout reste
    sous 2 % de la largeur et 1,2 % de la hauteur du cadre ; les fins de plan restent en place."""
    fr = list(range(0, 36))
    fixed = lambda t: (0.0, 0.0, 0.4, 0.0, 2.0, 0.0, 28.0)  # noqa: E731
    out = M.camera_operator(fixed, fr)
    check("opérateur : caméra fixe immobile", all(out[f] == fixed(M.t_of(f)) for f in fr), str(out["kind"]))
    near = [{f: (2.5, -20.0 + 25.0 * M.t_of(f), 0.7) for f in fr}]
    far = [{f: (6.0, -20.0 + 25.0 * M.t_of(f), 0.7) for f in fr}]
    sh = M.camera_operator(fixed, fr, tracks=near)
    nf = M.camera_operator(fixed, fr, tracks=far)
    pk = max(range(len(fr)), key=lambda i: abs(sh[fr[i]][4] - 2.0))
    a = abs(sh[fr[pk]][4] - 2.0)
    tail = max(abs(sh[f][4] - 2.0) for f in fr[pk + 14:])
    check("opérateur : un véhicule à 1,5 m la secoue, brièvement", a > 0.08 and tail < 0.25 * a,
          f"{a:.2f}° puis {tail:.3f}° une demi-seconde après")
    check("opérateur : à 5 m, rien", all(nf[f] == fixed(M.t_of(f)) for f in fr))

    def travel(v):
        return lambda t: (0.0, v * t, 0.5, 180.0, 3.0, 0.0, 24.0)
    sd = {}
    for v in (10.0, 20.0):
        o = M.camera_operator(travel(v), fr, seed=1.0, op=dict(jolt_deg=0.0))
        d = [o[f][4] - 3.0 for f in fr]
        sd[v] = math.sqrt(sum(x * x for x in d) / len(d))
    check("opérateur : la vibration suit la vitesse", 1.6 < sd[20.0] / sd[10.0] < 2.4 and sd[20.0] < 0.15,
          f"{sd[10.0]:.3f}° à 36 km/h, {sd[20.0]:.3f}° à 72 km/h")

    def pan(t):
        u = M.smoothstep(0.0, 0.7, t)
        return 0.0, 0.0, 0.5, -60.0 * min(1.0, t / 0.7) if t > 0 else 0.0, 2.0, 0.0, 32.0
    po = M.camera_operator(pan, fr)
    over = min(po[f][3] for f in fr) - (-60.0)
    check("opérateur : le panoramique dépasse un peu à l'arrêt", -1.2 < over < -0.05, f"{over:.2f}°")
    hf, vf = M.fov_deg(32.0)
    yd, pd = _cam_dev(pan, fr, po)
    check("opérateur : panoramique dans ses bornes", yd <= 0.02 * hf + 1e-6, f"{yd:.2f}° pour {hf:.1f}° de large")
    import fin6_orbite as F6
    import ouv_avenue as O
    import p4_pont as P4
    import p5_virage as P5
    import p6_jetee as P6
    for name, mod in (("OUV", O), ("P4", P4), ("P5", P5), ("P6", P6), ("FIN6", F6)):
        n = getattr(mod, "FRAMES", 24)
        frs = list(range(mod.F0 - 1, mod.F0 + n + 1))
        o = M.camera_operator(mod.camera, frs, seed=3.0)
        lens = o["kind"]["lens"]
        hf, vf = M.fov_deg(lens)
        yd, pd = _cam_dev(mod.camera, frs, o)
        check(f"opérateur {name} : sous 2 % de la largeur, 1,2 % de la hauteur", yd <= 0.02 * hf + 1e-6
              and pd <= 0.012 * vf + 1e-6, f"lacet {yd:.3f}°, site {pd:.3f}° ({lens:.0f} mm), {o['kind']}")
    o = M.camera_operator(F6.camera, list(range(F6.F0, F6.F0 + F6.FRAMES)), seed=3.0)
    lf = F6.F0 + F6.FRAMES - 1
    d = max(abs(o[lf][k] - F6.camera(M.t_of(lf))[k]) for k in (3, 4, 5))
    check("opérateur FIN6 : la pose validée tient à la dernière image", d < 0.05, f"{d:.3f}°")


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
    test_dyn_switch()
    test_hero_body()
    test_fin_stop()
    test_arches()
    test_pack()
    test_steer_dyn()
    test_aircraft()
    test_operator()
    print(f"\n{'tout passe' if not FAIL else str(len(FAIL)) + ' échec(s)'}")
    sys.exit(1 if FAIL else 0)
