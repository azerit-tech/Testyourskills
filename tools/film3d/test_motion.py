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
    t1 = M.t_of(P.F0 + P.FRAMES - 1)
    hx = P.project(P.heli(t1)[:3], t1)
    hero_top = boxes_f[-1][3]
    check("P5 : l'hélicoptère au-dessus d'elle à la fin", hx and 30.0 <= hx[0] <= 70.0 and hero_top + 15.0 <= hx[1] <= 82.0,
          f"x {hx[0]:.0f} %, y {hx[1]:.0f} %" if hx else "derrière")
    pk = [P.project((*P.pack_pos(0)(M.t_of(f)), 0.8), M.t_of(f)) for f in range(P.F0, P.F0 + 6)]
    check("P5 : la meute dans le champ au début", all(q and 0.0 <= q[0] <= 100.0 for q in pk),
          f"x {', '.join(f'{q[0]:.0f}' for q in pk if q)} %")
    yaws = [P.camera_aim(M.t_of(f))[0] for f in range(P.F0, P.F0 + P.FRAMES)]
    steps = [b - a for a, b in zip(yaws, yaws[1:])]
    check("P5 : panoramique amorti au départ et à l'arrivée", abs(steps[0]) < 1.0 and abs(steps[-1]) < 1.0
          and max(abs(s) for s in steps) < 6.0, f"{steps[0]:.2f}°, {steps[-1]:.2f}° par image, {max(abs(s) for s in steps):.1f} au plus")
    check("P5 : l'hélicoptère au-dessus des piles", min(P.heli(M.t_of(f))[2] for f in frames) >= 19.0)


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
    tiers central (son centre), entière hors des bandes du HUD (15 % du bas, 12 % du haut), le trou des plots dans le
    cadre à chaque image ; éclairs d'une ou deux images."""
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
    check("P3 : roulis ≤ 6°", max(abs(p["roll"]) for p in ps) <= 6.0, f"{max(abs(p['roll']) for p in ps):.2f}°")
    check("P3 : tangage ≤ 3°", max(abs(p["pitch"]) for p in ps) <= 3.0, f"{max(abs(p['pitch']) for p in ps):.2f}°")
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
        if not (abs(uc) <= 1 / 3 and u0 > -1.0 and u1 < 1.0 and v0 >= 0.15 and v1 <= 0.88 and 0.3 <= vc <= 0.6
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
