# Les tests de motion.py, sans Blender : python3 tools/film3d/test_motion.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion as M  # noqa: E402

FRAMES = range(0, 30)
FAIL = []

# Les plafonds des caméras du découpage v3 (docs/cinematique-decoupage-v3.md, 2.4 et 6), mesurés par
# python3 tools/film3d/motion.py mesure --v3 sur la caméra sans tremblé (camera_rail), en différences centrées
# sur trois images. Ils ne s'appliquent qu'aux plans qui portent V3 = True. None : pas de contrôle.
CAM_PAN_MAX = 40.0      # °/s, panoramique, focales de 28 mm et moins (0,8 largeur de cadre par seconde)
CAM_TILT_MAX = 12.0     # °/s, bascule
CAM_VREL_MAX = 3.0      # m/s, variation de l'écart caméra-berline (caméras qui roulent avec elle)
CAM_AREL_MAX = 4.0      # m/s², accélération de la caméra par rapport à la berline
CAM_BEHIND_MIN = 0.80   # part des images derrière (60° ou moins de l'arrière de sa route)
CAM_ORBIT_MAX, CAM_ORBIT_ACC_MAX = 30.0, 40.0   # °/s, °/s² d'azimut autour de la berline (plans à orbite)
CAM_LIMITS_PLAN = {
    "P1": {"front_max": 0.0},                                 # jamais de face (2.2)
    "P3": {"gap": 0.3},     # la trouée : 0,65 m entre les boîtes de la berline et du barrage (0,35 au moins) ; la patrouille 1
                             # à 1,5 m au moins de la berline : test_p3
    "P4": {"pan": 4.6, "vrel": None, "arel": None, "behind": 0.0,   # fixe, 200 mm, de face
           "zoom": True, "low_center": (0.52, 0.56), "low_all": True, "width_min": 0.17},
    # v3.1 : la berline vire sur le mouillé (route jusqu'à 36°/s, mise en virage en 20 images) et la caméra la suit à
    # 7,6 m dans l'axe de sa vitesse : sa visée accélère comme ce cap (≈ 65°/s², la largeur de cadre 1,2 en vaut 55)
    # et, à 7,6 m de rayon, elle tire 7,5 m/s² par rapport à la berline (4 demanderaient 1,6 s de mise en virage, plus
    # que le plan n'en laisse) ; en sortie, la berline relancée à 6,8 m/s² et la caméra à l'extérieur, 8,2 en propre
    "P5": {"pan": 42.0, "pan_acc": 1.4, "arel": 8.0, "accel": 8.5},
    # les avions entrent grands par le haut du cadre : 8 images au plus au-dessus de 88 % à leur entrée, puis
    # dessous (test_p6 le vérifie, avion par avion ; le plafond commun de motion.py est levé pour P6)
    "P6": {"air_top": 999.0, "air_entry": 8},
    "FIN6": {"behind": 0.0, "orbit": CAM_ORBIT_MAX},         # orbite, berline arrêtée (30°/s)
}
# les autres plafonds de 2.4
CAM_PAN_LENS = 28.0          # mm : au-delà, CAM_PAN_MAX × 24 / focale
CAM_PAN_ACC_MAX = 1.2        # largeurs de cadre par s² (55°/s² à 24 mm)
CAM_TILT_ACC_MAX = 25.0      # °/s²
CAM_ROLL_MAX, CAM_ROLL_RATE_MAX = 3.0, 6.0      # °, °/s
CAM_ACCEL_MAX = 8.0          # m/s², accélération propre de la caméra
CAM_CRANE_MAX, CAM_CRANE_ACC_MAX = 2.5, 3.0     # m/s, m/s² (vitesse verticale)
CAM_ZOOM_RATE_MAX, CAM_ZOOM_TOTAL_MAX = 0.04, 0.10   # par seconde, sur le plan (seul P4 zoome)
# le cadre (section 6, points 5 et 8) : les bandes de l'habillage en % depuis le bas ; les centres (règle des
# plans bas, coupes) dans la convention des fiches, depuis le haut (CAM_Y_FROM_TOP)
CAM_BAND = (15.0, 88.0)      # % depuis le bas : la boîte de la berline dedans…
CAM_BAND_SHARE = 0.90        # … sur cette part des images
CAM_LOW_Z = 1.0              # m : caméra basse
CAM_LOW_CENTER = (0.50, 0.62)        # centre de la berline en hauteur, caméra basse
CAM_Y_FROM_TOP = True
CAM_WIDTH_MIN, CAM_WIDTH_SHARE = 0.30, 2.0 / 3.0
CAM_AIR_TOP = 88.0           # % depuis le bas : hélicoptères et avions dessous
CAM_PHARE_X, CAM_PHARE_Y = (5.0, 95.0), (15.0, 88.0)
CAM_GAP_MIN, CAM_CAM_GAP_MIN = 1.5, 0.8          # m entre caisses ; m de la caméra aux véhicules et poteaux
CAM_CUT_DX, CAM_CUT_DY, CAM_CUT_RATIO = 8.0, 6.0, (0.75, 1.33)
CAM_FILM_SIX = (0.60, 0.25)  # film à six étoiles : derrière au moins, de face au plus
CAM_FILM_ONE = 0.85          # film à une étoile : derrière au moins
CAM_VIB_TOL = 1.0        # °/s : ce que la vibration, les ressauts et les secousses de passage de l'opérateur
                         # ajoutent au plus aux vitesses de la colonne « finale » de motion.py mesure


def v3_limits():
    """(plafonds communs, plafonds par plan) pour motion.v3_report."""
    base = dict(pan=CAM_PAN_MAX, pan_lens=CAM_PAN_LENS, pan_acc=CAM_PAN_ACC_MAX, tilt=CAM_TILT_MAX,
                tilt_acc=CAM_TILT_ACC_MAX, roll=CAM_ROLL_MAX, roll_rate=CAM_ROLL_RATE_MAX, vrel=CAM_VREL_MAX,
                arel=CAM_AREL_MAX, accel=CAM_ACCEL_MAX, crane=CAM_CRANE_MAX, crane_acc=CAM_CRANE_ACC_MAX,
                orbit=None, orbit_acc=CAM_ORBIT_ACC_MAX, zoom=False, zoom_rate=CAM_ZOOM_RATE_MAX,
                zoom_total=CAM_ZOOM_TOTAL_MAX, behind=CAM_BEHIND_MIN, front_max=None, band=CAM_BAND,
                band_share=CAM_BAND_SHARE, low_z=CAM_LOW_Z, low_center=CAM_LOW_CENTER, low_all=False,
                y_from_top=CAM_Y_FROM_TOP, width_min=CAM_WIDTH_MIN, width_share=CAM_WIDTH_SHARE,
                air_top=CAM_AIR_TOP, phare_x=CAM_PHARE_X, phare_y=CAM_PHARE_Y, gap=CAM_GAP_MIN,
                cam_gap=CAM_CAM_GAP_MIN, cut_dx=CAM_CUT_DX, cut_dy=CAM_CUT_DY, cut_ratio=CAM_CUT_RATIO,
                film_six=CAM_FILM_SIX, film_one=CAM_FILM_ONE)
    return base, CAM_LIMITS_PLAN


# Le découpage v3.1 (verdict du bout-à-bout v3 : caméra trop basse, cadre qui change, voiture pas fluide) : un seul
# cadre de poursuite pour les plans de dos (motion.V31_BACK), une berline lourde sur le mouillé, rien qui saute à
# l'écran. Seuls les plans qui portent V31 = True sont contrôlés (motion.py mesure --v3 les montre tous).
CAM31_H = (2.1, 2.7)          # m, caméra sans tremblé au-dessus de la chaussée sous l'objectif (visée 2,4)
CAM31_H_FLOOR = 1.8           # m, jamais dessous
CAM31_DIST = (6.5, 8.5)       # m, distance horizontale au centre de la berline (visée 7,5)
CAM31_DH, CAM31_DD = 0.4, 1.0         # m, variation dans le plan (hauteur, distance)
CAM31_SIDE = (-0.3, 1.5)      # m, décalage à gauche de la route de la berline (0 à 1,5 ; 0,3 de tolérance à droite)
CAM31_LENS = 24.0             # mm, partout
CAM31_CENTER_X, CAM31_CENTER_Y = (50.0, 6.0), (58.0, 4.0)   # % (y depuis le haut) : visée, tolérance
CAM31_WIDTH_VAR = 0.15        # largeur de la berline à ±15 % de sa médiane dans le plan
CAM31_CUT_DH, CAM31_CUT_DD = 0.3, 0.8                     # m, aux coupes entre deux plans de dos
# la voiture, au centre de la caisse, aux images rendues (m/s², m/s³, °/s²)
CAR31_HERO = dict(lat=6.5, brake=7.0, acc=3.0, circle=7.5, jerk=12.0, yaw_acc=120.0)
CAR31_PATROL = dict(lat=7.0, brake=7.0, acc=4.0, circle=7.5, jerk=12.0, yaw_acc=120.0)
CAR31_STOP_LAMP = 2.0         # m/s² de freinage : fenêtres des feux stop (hero_cars.stop_lamps)
# la glisse (cap de la caisse moins cap de la vitesse)
SLIP31_MAX = 18.0             # °
SLIP31_ON, SLIP31_OFF = 40.0, 30.0    # °/s, installation et retour
SLIP31_ACC = 5.5              # m/s² d'accélération combinée : dessous, elle ne naît pas
SLIP31_LOSS = 0.10            # la vitesse perd au moins 10 % pendant une glisse de plus de 5°
SLIP31_BACK = 4.0             # ° au plus de retour de l'autre côté, une fois
# la fluidité à l'écran (le centre de la berline vu par les clés finales, % de la largeur du cadre par image² et
# image³) et la caisse (roulis et tangage bornés, Δ² du roulis par image², écart au seul transfert de masse)
SCREEN31_D2, SCREEN31_D3 = 0.20, 0.20     # tremblés v3.1 : 0,04 à 0,16 sur les plans de dos ; sans tremblé, 0,10
BODY31_ROLL, BODY31_PITCH = 4.0, 2.0
BODY31_ROLL_D2, BODY31_NOISE = 0.10, 0.02
CAM31_LIMITS_PLAN = {
    "P6": {"rise_after": 0.5, "rise_h_max": 3.6},           # monte à la fin pour découvrir la pointe
    "FIN": {"stop_h_min": 2.0, "stop_dist_min": 5.5},       # plus bas et plus près une fois la berline arrêtée
}


def v31_limits():
    """(plafonds communs, plafonds par plan) pour motion.plan_checks31."""
    base = dict(cam_h=CAM31_H, cam_h_floor=CAM31_H_FLOOR, cam_dist=CAM31_DIST, cam_dh=CAM31_DH, cam_dd=CAM31_DD,
                cam_side=CAM31_SIDE, cam_lens=CAM31_LENS, cam_center_x=CAM31_CENTER_X, cam_center_y=CAM31_CENTER_Y,
                cam_width_var=CAM31_WIDTH_VAR, cut_dh=CAM31_CUT_DH, cut_dd=CAM31_CUT_DD,
                car=dict(hero=CAR31_HERO, patrol=CAR31_PATROL), stop_lamp=CAR31_STOP_LAMP, slip_max=SLIP31_MAX,
                slip_on=SLIP31_ON, slip_off=SLIP31_OFF, slip_acc=SLIP31_ACC, slip_loss=SLIP31_LOSS,
                slip_back=SLIP31_BACK, screen_d2=SCREEN31_D2, screen_d3=SCREEN31_D3, body_roll=BODY31_ROLL,
                body_pitch=BODY31_PITCH, body_roll_d2=BODY31_ROLL_D2, body_noise=BODY31_NOISE)
    return base, CAM31_LIMITS_PLAN


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
    """P5 (découpage v3) : ce que les contrôles v3 ne voient pas : la meute loin derrière, les conteneurs, ce que
    la berline frôle sans le toucher, la caméra loin des séparateurs, la patrouille 1 dans le cadre, le premier plan,
    l'hélicoptère au-dessus des piles et dans le cadre final (écarts, cadre et vitesses : test_v3)."""
    import p5_virage as P
    check("M.min_gap voit un croisement", M.min_gap({"a": lambda t: (0.0, 10 * t), "b": lambda t: (0.0, 10 - 10 * t)},
                                                    range(0, 30))[0] < 0.5)
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    tr = P.tracks()
    pack = [n for n in tr if n not in ("hero", "patrol_0")]
    gap = min(math.dist(P.hero_pos(M.t_of(f)), tr[n](M.t_of(f))) for n in pack for f in frames)
    check("P5 : la meute à 30 m derrière la berline au moins", gap >= 30.0, f"{gap:.1f} m au plus près")
    # le mur de conteneurs prolongé (x -15,1 à -10,1, y 54 à 79), les jambes du portique (x -24 et -10,6, y 81 et
    # 95), les piles du côté est (x 24,9 à 70, y 45,7 à 57,9) : aucun centre de véhicule ni la caméra à moins de 3 m
    # (plus sa demi-largeur, 1 m)
    boxes = [(-15.1, -10.1, 54.0, 79.0), (24.9, 70.0, 45.7, 57.9)] + [(x - 1.0, x + 1.0, y - 1.8, y + 1.8)
                                                                       for x in (-24.0, -10.6) for y in (81.0, 95.0)]

    def clear(q, bs=boxes):
        return min(math.hypot(max(b[0] - q[0], 0, q[0] - b[1]), max(b[2] - q[1], 0, q[1] - b[3])) for b in bs)
    cams = [P.camera_rail(M.t_of(f)) for f in frames]
    near = min([clear(fn(M.t_of(f))) for fn in tr.values() for f in frames] + [clear(c[:2]) for c in cams])
    check("P5 : rien à moins de 3 m d'un conteneur ou du portique", near >= 4.0, f"{near:.1f} m")
    # ce que la berline frôle sans le toucher : la caisse (ses coins et le milieu de ses flancs) entre 0,4 et 2 m
    # des poteaux de la chaîne ; à plus de 0,4 m des caisses ; la meute à plus de 0,6 m des poteaux (demi-largeur
    # d'une patrouille : 1 m)
    poses = M.sample(P.hero_pos, frames, slip=P.hero_slip)

    def body_pts(p):
        h = math.radians(p["heading"])
        fx, fy = -math.sin(h), math.cos(h)
        return [(p["x"] + fx * a + fy * b, p["y"] + fy * a - fx * b) for a in (-2.45, 0.0, 2.45) for b in (-0.9, 0.9)]
    posts = [(x - 0.13, x + 0.13, y - 0.13, y + 0.13) for x, y in P.CHAIN_POSTS]
    d_chain = min(clear(q, posts) for p in poses for q in body_pts(p))
    d_crates = min(clear(q, [P.CRATES_BOX]) for p in poses for q in body_pts(p))
    check("P5 : la berline frôle la chaîne sans la toucher", 0.4 <= d_chain <= 2.0, f"{d_chain:.2f} m au plus près")
    check("P5 : la berline loin des caisses", d_crates >= 0.4, f"{d_crates:.2f} m au plus près")
    d_pack = min(clear(fn(M.t_of(f)), posts) for n, fn in tr.items() if n != "hero" for f in frames)
    check("P5 : la meute passe à côté de la chaîne", d_pack >= 1.6, f"{d_pack:.2f} m entre un centre et un poteau")
    # la caméra (fiche) : à 2 m au moins des séparateurs, à 0,8 m au moins des poteaux et des caisses, horizon à plat
    d_bar = min(P.BARRIER_Y - c[1] for c in cams)
    d_box = min(clear(c[:2], posts + [P.CRATES_BOX]) for c in cams)
    check("P5 : caméra loin des séparateurs, des poteaux et des caisses", d_bar >= 2.0 and d_box >= 0.8,
          f"{d_bar:.1f} m des séparateurs, {d_box:.1f} m des poteaux et des caisses")
    check("P5 : horizon à plat", all(c[5] == 0.0 for c in cams))
    # le premier plan : la flaque jamais dans les 15 % du bas du cadre, la roue arrière gauche dedans en sortie de
    # glisse (images 40 à 48) ;
    # aucune bouffée de fumée gardée à moins de 2 m de la caméra
    low = min((q[1], f) for f in frames for q in (P.project(p, M.t_of(f)) for p in P.puddle_pts())
              if q and -5.0 <= q[0] <= 105.0)
    pud = M._rect(P.PUDDLE_AT, P.PUDDLE_YAW - 90.0, P.PUDDLE_SIZE)
    wet = [round(t * M.FPS + P.F0) for t, x, y in P.wheel_track(-1, frames=(40, 48), n=32)
           if M._point_gap((x, y), pud) == 0.0]
    check("P5 : la flaque hors du bas du cadre, sous la roue arrière gauche", low[0] >= P.FLOOR_BAND and wet,
          f"au plus bas à {low[0]:.1f} % (image {low[1]}) ; roue dedans aux images {wet[:1] + wet[-1:]}")
    kept = P.smoke_keep(M.smoke_puffs(poses))
    check("P5 : la fumée gardée loin de l'objectif", len(kept) >= 4, f"{len(kept)} bouffées, dès l'image {kept[0][0]}"
          if kept else "aucune")
    # la patrouille 1 entière dans le cadre, à gauche de la berline, 12 images de suite au moins (PATROL_SEEN) ; elle
    # s'arrête avant les séparateurs, le nez rentré (elle sous-vire), et ne recule jamais
    seen = [f for f in range(P.F0, P.F0 + P.FRAMES) if P.patrol_seen(f)]
    runs, cur = [], []
    for f in seen:
        cur = cur + [f] if cur and f == cur[-1] + 1 else [f]
        runs.append(cur)
    run = max(runs, key=len) if runs else []
    check("P5 : la patrouille 1 entière dans le cadre, à gauche de la berline, 12 images de suite",
          len(run) >= 12 and (run[0], run[-1]) == P.PATROL_SEEN, f"images {run[0]} à {run[-1]}" if run else "jamais")
    p0 = tr["patrol_0"]
    rect = M._rect(p0(M.t_of(P.F0 + P.FRAMES - 1)), P.patrol_heading(M.t_of(P.F0 + P.FRAMES - 1)), M.CAR_DIMS["patrol"])
    bar = [(P.BARRIER_X[0], P.BARRIER_Y - 0.35), (P.BARRIER_X[1], P.BARRIER_Y - 0.35),
           (P.BARRIER_X[1], P.BARRIER_Y + 0.35), (P.BARRIER_X[0], P.BARRIER_Y + 0.35)]
    ys = [p0(M.t_of(f))[1] for f in frames]
    check("P5 : la patrouille 1 s'arrête avant les séparateurs", M._poly_gap(rect, bar) >= 1.2
          and P.PATROL.speed(M.t_of(P.F0 + P.FRAMES - 1)) < 0.1 and all(b >= a for a, b in zip(ys, ys[1:])),
          f"{M._poly_gap(rect, bar):.2f} m, cap {P.patrol_heading(M.t_of(P.F0 + P.FRAMES - 1)):.0f}°")
    # le cadre final : l'hélicoptère devant elle, entre x 45 et 65 %, y 68 et 82 % du bas, au-dessus de la berline
    t1 = M.t_of(P.F0 + P.FRAMES - 1)
    hh = P.aircraft()["heli"](t1)
    q = M.screen_point(P.camera_rail(t1), hh)
    car = P.frame_box([p for p in poses if p["frame"] == P.F0 + P.FRAMES - 1][0])
    check("P5 : le cadre final, l'hélicoptère devant elle et au-dessus", q and 0.45 <= q[0] <= 0.65
          and 0.68 <= 1 - q[1] <= 0.82 and 100 * (1 - q[1]) > car[3] + 5.0,
          f"hélicoptère x {100 * q[0]:.0f} %, y {100 * (1 - q[1]):.0f} % du bas ; berline jusqu'à {car[3]:.0f} %"
          if q else "derrière")
    # au-dessus des piles du côté est (13 m au plus, 6 m de marge autour) avec 4 m d'air ; jamais sous 9 m ailleurs
    over = [P.heli(M.t_of(f)) for f in frames]
    low = [h[2] - 13.0 for h in over if 24.9 - 6.0 <= h[0] <= 70.0 + 6.0 and 45.7 - 6.0 <= h[1] <= 57.9 + 6.0]
    check("P5 : l'hélicoptère au-dessus des piles", (not low or min(low) >= 4.0) and min(h[2] for h in over) >= 9.0,
          f"{min(low) if low else 0:.1f} m d'air au-dessus des piles, {min(h[2] for h in over):.1f} m au plus bas")


def test_p2():
    """P2 (découpage v3.1) : la pose de l'image fixe retrouvée par le plan animé ; la route à courbure continue, la
    glisse finie et les gaz remis à la fin ; la glisse (15 à 18°) et la dynamique ; la caméra sans tremblé écrit ; la berline au point de coupe
    (y depuis le haut). Écarts, conduite et plafonds : test_v3 et les contrôles v3.1."""
    import p2_arc as P
    t = P.STILL * P.T_END
    ref = P.cars(P.STILL)
    ok = all(math.dist(ref[k][:2], P.tracks()[k](t)) < 1e-6 for k in ref)
    check("P2 : la pose de l'image fixe, glisse tenue", ok and abs(P.hero_slip(t) - P.DRIFT) < 1e-9)
    check("P2 : V31 et V3", P.V31 and P.V3)
    ks = [P.curvature(P.S_EXIT * i / 400) for i in range(401)]
    jump = max(abs(b - a) for a, b in zip(ks, ks[1:]))
    # (84 images : le plan s'arrête dans l'arc, glisse finie et gaz remis ; P3 montre la sortie)
    t_out = P.t_of(P.F0 + P.FRAMES - 1)
    check("P2 : courbure continue, glisse finie une douzaine d'images avant la fin, gaz remis", jump < 1e-3
          and abs(P.hero_slip(t_out - 10 / 24)) < 0.05 and P.hero_accel(t_out) > 1.0, f"saut {jump:.5f} /m")
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    ps = M.sample(P.hero_pos, frames, slip=P.hero_slip, noise=0.0)
    peak = max(ps, key=lambda p: p["heading"] - p["travel"])
    check("P2 : glisse de 15 à 18°", 15.0 <= P.DRIFT <= 18.0, f"{P.DRIFT:.1f}°")
    check("P2 : en glisse, roulis vers la droite et contre-braquage (roues à droite)",
          peak["roll"] > 2.0 and peak["steer"] < -5.0, f"roulis {peak['roll']:.2f}°, braquage {peak['steer']:.2f}°")
    check("P2 : roulis ≤ 4°", max(abs(p["roll"]) for p in ps) <= 4.0, f"{max(abs(p['roll']) for p in ps):.2f}°")
    check("P2 : les feux stop au freinage d'avant l'îlot", P.stop_frames() and P.stop_frames()[0][0] <= 3,
          f"{P.stop_frames()}")
    tt = M.t_of(20)
    check("P2 : camera(t) = camera_rail(t) (aucun tremblé écrit)", P.camera(tt) == P.camera_rail(tt))
    # la caméra de poursuite : la berline au point de coupe à la première et à la dernière image
    for f in (P.F0, P.F0 + P.FRAMES - 1):
        tt = M.t_of(f)
        hx, hy = P.hero_pos(tt)
        bx = M.hero_screen(P.camera_rail(tt), hx, hy, 0.0, P.hero_heading(tt))
        u, y, w = bx["u"] * 100, bx["v"] * 100, bx["w"] * 100
        check(f"P2 : point de coupe à l'image {f}", abs(u - 50) <= 6 and abs(y - 58) <= 4 and abs(w - 41) <= 6,
              f"x {u:.0f}, y {y:.0f}, largeur {w:.0f} %")


def test_p4():
    """P4 (découpage v3) : aucune distance sous 6 m ; la meute 25 m derrière la berline au moins ; la berline de
    y -101 à -35,7 (111 à 46 m de l'objectif) ; six rampes au-dessus de la crête à l'image 1, dix à la fin, les
    quatre nouvelles qui se découvrent aux images 8, 18, 28 et 38."""
    import p4_pont as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    d, f, a, b = M.min_gap(P.tracks(), frames)
    check("P4 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    gap = min(math.dist(P.hero_pos(M.t_of(f)), P.pack_pos(i)(M.t_of(f))) for f in frames for i in range(len(P.PACK)))
    check("P4 : la meute ne rattrape pas la berline", gap >= 25.0, f"{gap:.1f} m au plus près")
    y0, y1 = P.hero_pos(0.0)[1], P.hero_pos(P.T_END)[1]
    check("P4 : la berline de y -101 à -35,7", abs(y0 + 101.0) < 0.1 and abs(y1 + 35.7) < 0.3, f"{y0:.1f} à {y1:.1f}")
    near = min(P.CAM[1] - P.hero_pos(M.t_of(f))[1] for f in frames)
    check("P4 : la berline reste à 40 m de l'objectif au moins", near >= 40.0, f"{near:.1f} m")

    def bars(f):
        t = M.t_of(f)
        return sum(P.bar_visible(P.pack_pos(i)(t)[1]) for i in range(len(P.PACK))) + P.bar_visible(P.van_pos(t)[1])
    seen = [bars(f) for f in range(P.F0, P.F0 + P.FRAMES)]
    rise = [f for f, (a_, b_) in enumerate(zip(seen, seen[1:]), start=P.F0 + 1) if b_ > a_]
    check("P4 : six rampes au début, dix à la fin, une de plus aux images 8, 18, 28, 38",
          seen[0] == 6 and seen[-1] == 10 and rise == [8, 18, 28, 38], f"{seen[0]} puis {seen[-1]}, aux images {rise}")


def test_p3():
    """P3 (découpage v3.1, de dos, 48 images ; cadre commun et conduite : v31_*, motion.py mesure --v3) : aucun
    choc (la caisse à 15 cm au moins des patrouilles du barrage, des agents, des plots et des caisses ; 0,35 m au
    moins des patrouilles du barrage, la trouée ne se lit pas comme un choc ; la patrouille 1 à 1,5 m au moins de
    la berline ; la caméra à 2 m au moins de la caisse et à 0,8 m au moins de tout le reste) ; roulis et tangage
    bornés ; la berline de y 76–79 à 134 ; la caméra passe le barrage à sa suite, à 2,4 m tout le plan, 7,5 m
    derrière la berline (± 0,5) ; la berline dans le tiers central (son centre), entière hors des bandes du HUD
    (15 % du bas, 12 % du haut), le trou des plots dans le cadre tant qu'il est à plus de 3 m devant la caméra (de 2,4 m,
    plus près, il passe sous le cadre) ; le centre de sa boîte à x
    50 ± 6 %, y 58 ± 4 % depuis le haut à la première et à la dernière image ; la patrouille 1 : sa rampe et la
    moitié de sa caisse au moins dans le cadre, à gauche, 12 images de suite dès l'image 1, puis elle sort par le
    quart bas gauche et n'y revient pas, en freinant à 7 m/s² au plus sans à-coup (0,5 m/s² d'une image à l'autre
    au plus : 12 m/s³), et à la dernière image l'avant de sa caisse est avant les panneaux du barrage ; feux stop
    sur les images où la berline freine à plus de 2 m/s² ; éclairs d'une ou deux images."""
    import p3_enseignes as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    tr = P.tracks()
    d, f, a, b = M.min_gap({k: tr[k] for k in ("hero", "patrol_c")}, frames)
    check("P3 : la patrouille 1 dans sa voie, à côté de la berline (centres)", d >= 3.0, f"{d:.1f} m à l'image {f}")
    body = min((P._poly_dist(P.hero_box(M.t_of(f / 4)), P._car_box(*P.chase_pos(M.t_of(f / 4)), P.CHASE[2],
                                                                   *P.CHASE_HALF)), f / 4)
               for f in range(4 * frames[0], 4 * frames[-1] + 1))
    check("P3 : 1,5 m au moins entre la berline et la patrouille 1", body[0] >= 1.5,
          f"{body[0]:.2f} m à l'image {body[1]}")
    cl = P.clearances(frames)
    cam = cl.pop("camera")
    n, (dm, fm) = min(cl.items(), key=lambda kv: kv[1][0])
    check("P3 : la caisse ne touche rien", dm >= 0.15, f"{dm:.2f} m de {n} à l'image {fm:.2f}")
    bar = min(cl[k] for k in ("patrol_a", "patrol_b"))
    check("P3 : la trouée large (0,35 m au moins des patrouilles du barrage)", bar[0] >= 0.35,
          f"{bar[0]:.2f} m à l'image {bar[1]:.2f}")
    check("P3 : la caméra à 2 m au moins de la caisse", cam[0] >= 2.0, f"{cam[0]:.2f} m à l'image {cam[1]:.2f}")
    cc = P.cam_clearances()
    cc.pop("berline")
    n, (dm, fm) = min(cc.items(), key=lambda kv: kv[1][0])
    check("P3 : la caméra à 0,8 m au moins de tout", dm >= 0.8, f"{dm:.2f} m de {n} à l'image {fm:.2f}")
    ps = M.sample(P.hero_pos, frames, heading=P.hero_heading, wheel_r=0.31, wheelbase=2.77)
    rmax, pmax = ((M.CHASSIS["hero"]["roll_max"] + 0.5, M.CHASSIS["hero"]["pitch_max"] + 0.5) if M.dyn_on()
                  else (6.0, 3.0))
    check("P3 : roulis borné", max(abs(p["roll"]) for p in ps) <= rmax, f"{max(abs(p['roll']) for p in ps):.2f}°")
    check("P3 : tangage borné", max(abs(p["pitch"]) for p in ps) <= pmax, f"{max(abs(p['pitch']) for p in ps):.2f}°")
    y0, y1 = P.hero_pos(0.0)[1], P.hero_pos(P.T_END)[1]
    check("P3 : de y 76–79 à 134", 76.0 <= y0 <= 79.0 and abs(y1 - 134.0) < 0.05, f"y {y0:.1f} → {y1:.1f}")
    shown = range(P.F0, P.F0 + P.FRAMES)
    cys = [P.cam_y(M.t_of(f)) for f in shown]
    vs = [(cys[i + 1] - cys[i]) * M.FPS for i in range(len(cys) - 1)]
    ds = [P.hero_pos(M.t_of(f))[1] - cys[i] for i, f in enumerate(shown)]
    check("P3 : la caméra passe le barrage à sa suite, 7,5 m derrière la berline (± 0,5)",
          cys[-1] > P.PATROLS["patrol_a"][1] and all(abs(d - 7.5) <= 0.5 for d in ds) and min(vs) > 0,
          f"y {cys[0]:.1f} → {cys[-1]:.1f}, {min(ds):.2f} à {max(ds):.2f} m derrière")
    wet = []
    for name, px, py, r, sy in P.PUDDLES:
        for f4 in range(4 * P.F0, 4 * (P.F0 + P.FRAMES)):
            t = M.t_of(f4 / 4)
            cy = P.cam_y(t)
            if (P.PUDDLE_FREE[0] <= cy <= P.PUDDLE_FREE[1] and abs(cy - py) <= 1.36 * r * sy
                    and abs(P.cam_x(t) - px) - 1.36 * r < 1.0):
                wet.append(name)
                break
    check("P3 : pas de flaque sur la route de la caméra entre y 116 et 130 (1 m de part et d'autre)", not wet,
          f"{wet}")
    zs = [P.camera(M.t_of(f))[2] for f in shown]
    check("P3 : la caméra à 2,4 m tout le plan", all(abs(z - 2.4) < 1e-6 for z in zs), f"{min(zs):.2f} à {max(zs):.2f} m")
    bad = []
    for f in shown:
        t = M.t_of(f)
        c = P.camera(t)
        (u0, u1, v0, v1), (uc, vc) = P.hero_frame(t, c)
        g = P.project(c, (P.GAP[0], P.GAP[1], 0.9)) if c[1] < P.GAP[1] - 3.0 else (0.0, 0.5)
        if not (abs(uc) <= 1 / 3 and u0 > -1.0 and u1 < 1.0 and v0 >= 0.15 and v1 <= 0.88
                and (c[2] > 1.0 or 0.38 <= vc <= 0.50) and g and abs(g[0]) < 0.6 and 0.15 < g[1] < 0.88):
            bad.append(f)
    check("P3 : la berline au tiers central, hors du HUD, le barrage dans le cadre", not bad, f"images {bad[:6]}")
    cut = []
    for f in (P.F0, P.F0 + P.FRAMES - 1):
        t = M.t_of(f)
        x, y = P.hero_pos(t)
        m = M.hero_screen(P.camera(t), x, y, 0.0, P.hero_heading(t))      # la boîte, comme mesure
        cut.append((100 * m["u"], 100 * m["v"], 100 * m["w"]))
    check("P3 : le point de coupe à la première et à la dernière image (x 50 ± 6, y 58 ± 4 depuis le haut)",
          all(abs(x - 50) <= 6 and abs(y - 58) <= 4 for x, y, w in cut),
          " ; ".join(f"x {x:.0f} y {y:.0f} l {w:.0f}" for x, y, w in cut))
    seen, last, low = [], [], False
    hl, hw = P.CHASE_HALF
    for f in shown:
        t = M.t_of(f)
        c = P.camera(t)
        kx, ky = P.chase_pos(t)
        qs = [P.project(c, (kx + sx * hw, ky + sy * hl, z)) for sx in (-1, 1) for sy in (-1, 1) for z in (0.3, 1.45)]
        inn = [q for q in qs if q and -1 <= q[0] <= 1 and 0 <= q[1] <= 1]
        r = P.project(c, (kx, ky, 1.62))
        seen.append(bool(r and -1 <= r[0] <= 0 and 0.15 <= r[1] <= 0.88 and len(inn) >= 4))
        if inn:
            last.append((f, inn))
        low = low or any(q and q[0] < 0 and q[1] < 0 for q in qs)
    run = next((i for i, v in enumerate(seen) if not v), len(seen))
    fl, inn = last[-1]
    acc = [(P._CHASE.v(M.t_of(f + 1)) - P._CHASE.v(M.t_of(f))) * M.FPS for f in range(P.F0, P.F0 + P.FRAMES)]
    jerk = max(abs(acc[i + 1] - acc[i]) for i in range(len(acc) - 1))
    front = P.chase_pos(P.T_END)[1] + hl
    panel = min(y for _, y in P.PANELS) - 0.5
    check("P3 : la patrouille 1 dans le cadre à gauche (rampe et caisse), puis sortie par le bas à gauche",
          run >= 12 and low and all(q[0] < 0 and q[1] < 0.55 for q in inn) and fl < P.F0 + P.FRAMES - 1
          and [f for f, _ in last] == list(range(P.F0, fl + 1)),
          f"{run} images de suite dès l'image 1, dernière vue à l'image {fl}")
    check("P3 : la patrouille 1 freine à 7 m/s² au plus sans à-coup, et reste avant le barrage",
          min(acc) >= -7.05 and jerk <= 0.5 and front < panel,
          f"{min(acc):.1f} m/s², {jerk:.2f} m/s² d'une image à l'autre ; l'avant à y {front:.1f} (panneaux à {panel:.1f})")
    lamps = P.brake_windows()
    on = {f for a, b in lamps for f in range(a, b + 1)}
    hard = {f for f in shown if P._accel(M.t_of(f)) < -2.0}
    check("P3 : feux stop là où la berline freine à plus de 2 m/s²", on == hard and lamps, f"{lamps}")
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
    """P6 (découpage v3) : aucune distance sous 6 m au sol (la patrouille 1 à part, 1,5 m d'air de flanc à flanc
    avec la berline) ; la colonne derrière la berline ; la caméra de dos au cadre commun v3.1 (7,5 m derrière à
    2,4 m) jusqu'à l'image 30, puis 8 m derrière à 3,6 m à la fin, grue sous 2,5 m/s, la berline à y 58 % depuis le
    haut (± 4) ; la patrouille 1 à gauche, de 6,5 m derrière à 3,3 m devant, au
    bord gauche du cadre de l'image 20 à la fin, à 0,8 m au moins de la caméra ; les appareils s'évitent ; rien ne
    frôle la caméra ; les hélicoptères sous 88 % du cadre, les avions aussi, sauf à leur entrée par le haut
    (air_entry images au plus) ; les avions au-dessus de la pointe vers l'image 44 (JET_TURN) ; personne ne tire."""
    import p6_jetee as P
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    d, f, a, b = M.min_gap({k: v for k, v in P.tracks().items() if k != "patrol_1"}, frames)
    check("P6 : distances gardées", d >= 6.0, f"{d:.1f} m entre {a} et {b} à l'image {f}")
    flank = min(abs(P.hero_pos(M.t_of(g))[0] - P.patrol1_pos(M.t_of(g))[0]) - 0.9 - 0.95 for g in frames)
    check("P6 : 1,5 m d'air entre la berline et la patrouille 1", flank >= 1.5, f"{flank:.2f} m")
    gap = min(math.dist(P.hero_pos(M.t_of(f)), P.column_pos(i)(M.t_of(f)))
              for f in frames for i in range(len(P.COLUMN)) if i != 1)
    check("P6 : la colonne ne rattrape pas la berline", gap >= 15.0, f"{gap:.1f} m au plus près")
    c0, c1 = P.camera_rail(0.0), P.camera_rail(P.T_END)
    h0, h1 = P.hero_pos(0.0), P.hero_pos(P.T_END)
    cm = P.camera_rail(M.t_of(30))
    hm = P.hero_pos(M.t_of(30))
    ok = (abs(h0[1] - c0[1] - 7.5) < 0.01 and abs(c0[2] - 2.4) < 0.01 and abs(hm[1] - cm[1] - 7.5) < 0.01
          and abs(cm[2] - 2.4) < 0.01 and abs(h1[1] - c1[1] - 8.0) < 0.01 and c1[2] <= 3.6 + 1e-6
          and all(P.hero_pos(M.t_of(g))[1] > P.camera_rail(M.t_of(g))[1] for g in frames))
    check("P6 : de dos, 7,5 m derrière à 2,4 m jusqu'à l'image 30, puis 8 m derrière à 3,6 m au plus", ok,
          f"début {h0[1] - c0[1]:.2f} m à {c0[2]:.2f} m, fin {h1[1] - c1[1]:.2f} m à {c1[2]:.2f} m")
    vs = [M.hero_screen(P.camera_rail(M.t_of(g)), *P.hero_pos(M.t_of(g)), 0.0, 0.0)["v"] for g in frames]
    check("P6 : la berline à y 58 % depuis le haut (± 4)", all(abs(v - 0.58) <= 0.04 for v in vs),
          f"{min(vs) * 100:.1f} à {max(vs) * 100:.1f} %")
    vz = max(abs(P.camera_rail(M.t_of(g + 1))[2] - P.camera_rail(M.t_of(g - 1))[2]) * M.FPS / 2 for g in frames)
    check("P6 : la grue sous 2,5 m/s", vz <= 2.5, f"{vz:.2f} m/s")
    p1 = [P.hero_pos(M.t_of(g))[1] - P.patrol1_pos(M.t_of(g))[1] for g in (P.F0, P.F0 + P.FRAMES - 1)]
    side = all(P.patrol1_pos(M.t_of(g))[0] < P.hero_pos(M.t_of(g))[0] for g in frames)
    check("P6 : la patrouille 1 à gauche, de 6,5 m derrière à 3,3 m devant",
          side and abs(p1[0] - 6.5) < 0.1 and abs(p1[1] + 3.3) < 0.1, f"{p1[0]:.1f} puis {p1[1]:.1f} m")
    # son nez (le coin avant droit) dans le cadre à partir de l'image 20
    seen = []
    for g in range(P.F0, P.F0 + P.FRAMES):
        px, py = P.patrol1_pos(M.t_of(g))
        q = M.screen_point(P.camera_rail(M.t_of(g)), (px + 0.95, py + 2.45, 0.8))
        if q is not None and 0.0 <= q[0] <= 1.0:
            seen.append(g)
    check("P6 : la patrouille 1 au bord gauche de l'image 20 à la fin",
          bool(seen) and seen[0] <= 20 and seen == list(range(seen[0], P.F0 + P.FRAMES)),
          f"de l'image {seen[0] if seen else '-'}")
    # la caméra et la patrouille 1 : de flanc (demi-largeur 0,95 m) au moins 0,8 m
    cam_p1 = min(abs(P.camera_rail(M.t_of(g))[0] - P.patrol1_pos(M.t_of(g))[0]) - 0.95 for g in frames)
    check("P6 : la caméra à 0,8 m au moins de la patrouille 1", cam_p1 >= 0.8, f"{cam_p1:.2f} m de son flanc")
    air = {f"heli_{i}": P.heli(i) for i in range(len(P.HELIS))}
    air.update({f"jet_{i}": P.jet(i) for i in range(len(P.JETS))})
    worst = min((math.dist(air[p](M.t_of(f))[:3], air[q](M.t_of(f))[:3]), p, q, f)
                for f in frames for p in air for q in air if p < q)
    check("P6 : les appareils s'évitent (15 m)", worst[0] >= 15.0, f"{worst[0]:.1f} m entre {worst[1]} et {worst[2]}")
    cam = min(math.dist(P.camera(M.t_of(f))[:3], air[k](M.t_of(f))[:3]) for f in frames for k in air)
    check("P6 : rien ne frôle la caméra (20 m)", cam >= 20.0, f"{cam:.1f} m au plus près")
    entry = CAM_LIMITS_PLAN["P6"]["air_entry"]
    for k, fn in air.items():
        inw, high = [], []
        for g in range(P.F0, P.F0 + P.FRAMES):
            q = M.screen_point(P.camera_rail(M.t_of(g)), fn(M.t_of(g))[:3])
            if q is not None and 0.0 <= q[0] <= 1.0:
                inw.append(g)
                if (1 - q[1]) * 100 > CAM_AIR_TOP:
                    high.append(g)
        allowed = 0 if k.startswith("heli") else entry
        ok = len(high) <= allowed and (not high or high == list(range(inw[0], inw[0] + len(high))))
        check(f"P6 : {k} sous {CAM_AIR_TOP:.0f} % du cadre" + ("" if allowed == 0 else f", sauf {entry} images à son entrée"),
              ok, f"{len(high)} image(s) au-dessus" + (f" ({high[0]}-{high[-1]}, entré à {inw[0]})" if high else ""))
    over = [P.jet(i)(M.t_of(P.JET_TURN))[1] for i in range(len(P.JETS))]
    check(f"P6 : les avions au-dessus de la pointe à l'image {P.JET_TURN}", all(410.0 < y < 470.0 for y in over),
          f"y {over[0]:.0f}, {over[1]:.0f}")


def test_ouv():
    """OUV (découpage v3.1) : la berline dépasse la patrouille garée à plus de 2 m (de flanc à flanc, demi-largeurs de
    0,95 m), le plan et les trois secondes qui le suivent ; la patrouille dans le cadre à gauche de la berline (sans
    passer derrière elle) jusqu'à l'image 24, hors champ à 32 ; le cadre de poursuite commun (2,4 m de haut, 7,5 m
    derrière, 24 mm), sans grue ; la berline au point de coupe à la première et à la dernière image (x 50 ± 6, y 58 ± 4
    depuis le haut) ; l'éveil dans l'ordre : phares, rampe, feux stop."""
    import ouv_avenue as P
    d, f, a, b = M.min_gap(P.tracks(), range(P.F0, P.F0 + 96))
    check("OUV : la berline passe à plus de 2 m de la patrouille", d - 2 * 0.95 > 2.0,
          f"{d - 1.9:.1f} m de flanc à flanc à l'image {f}")
    seen, gap = [], 1.0
    for f in range(P.F0, P.F0 + P.FRAMES):
        c = P.camera_rail(M.t_of(f))
        car = M.hero_screen(c, *P.hero_pos(M.t_of(f)), 0.0, 0.0)
        pat = M.hero_screen(c, P.PATROL[0], P.PATROL[1], 0.0, P.PATROL[2], box=(5.1, 1.95, 1.5))
        if pat and pat["u1"] > 0.0:
            seen.append(f)
            gap = min(gap, car["u0"] - pat["u1"])
    check("OUV : la patrouille à gauche jusqu'à l'image 24, hors champ à 32, jamais derrière la berline",
          seen and seen[0] == P.F0 and 24 <= seen[-1] < 32 and gap > 0.0,
          f"dans le cadre jusqu'à l'image {seen[-1] if seen else None}, au plus près {gap * 100:.0f} % de la berline")
    _common_frame("OUV", P)
    for f in (P.F0, P.F0 + P.FRAMES - 1):
        car = M.hero_screen(P.camera_rail(M.t_of(f)), *P.hero_pos(M.t_of(f)), 0.0, 0.0)
        x, y = car["u"] * 100, car["v"] * 100
        check(f"OUV : la berline au point de coupe à l'image {f}", abs(x - 50) <= 6 and abs(y - 58) <= 4,
              f"x {x:.0f}, y {y:.0f}, largeur {car['w'] * 100:.0f} %")
    check("OUV : phares, rampe puis feux stop", P.F0 < P.WAKE < P.BARS_ON < P.BRAKE[0] <= P.BRAKE[1] < P.F0 + P.FRAMES,
          f"phares {P.WAKE}, rampe {P.BARS_ON}, feux stop {P.BRAKE[0]}-{P.BRAKE[1]}")


def _common_frame(name, P):
    """Le cadre de poursuite commun du découpage v3.1 : 2,4 m de haut (2,1 à 2,7), 7,5 m derrière le centre de la
    berline (6,5 à 8,5), 24 mm, 0 à 1,5 m à sa gauche ; dans le plan, la hauteur à 0,4 m près, la distance à 1 m."""
    frames = range(P.F0, P.F0 + P.FRAMES)
    cams = [P.camera_rail(M.t_of(f)) for f in frames]
    zs = [c[2] for c in cams]
    backs = [P.hero_pos(M.t_of(f))[1] - c[1] for f, c in zip(frames, cams)]
    sides = [P.hero_pos(M.t_of(f))[0] - c[0] for f, c in zip(frames, cams)]
    check(f"{name} : le cadre commun (2,4 m, 7,5 m, 24 mm), sans grue",
          2.1 <= min(zs) and max(zs) <= 2.7 and max(zs) - min(zs) <= 0.4 and 6.5 <= min(backs)
          and max(backs) <= 8.5 and max(backs) - min(backs) <= 1.0 and all(c[6] == 24.0 for c in cams)
          and -1e-9 <= min(sides) and max(sides) <= 1.5,
          f"hauteur {zs[0]:.2f} à {zs[-1]:.2f} m, distance {backs[0]:.2f} à {backs[-1]:.2f} m, "
          f"à gauche {min(sides):.2f} à {max(sides):.2f} m")


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
    """FIN (découpage v3.1) : rien ne frôle la caméra ; la berline, prise en plein freinage, glisse sans pivoter à
    l'arrêt et s'arrête vers l'image 36, 8 m avant le centre de la pointe, cap 25° ; ses feux stop dès la première
    image ; les mains sortent par la vitre après un temps mort ; la caméra du cadre commun (2,4 m, 7,5 m, 24 mm) finit
    près et fixe (2,0 m, 5,5 à 6,5 m) ; la patrouille 1 seule, devant à gauche, freine en virant et s'arrête en
    travers, à gauche du cadre au moins 12 images de suite ; la meute, rien que ses phares, derrière la caméra."""
    import fin_pointe as P
    frames = range(P.F0, P.F0 + P.FRAMES)
    keyed = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    c = min(P.rect_gap(P.hero_pos(M.t_of(f)), P.hero_heading(M.t_of(f)), P.HERO_BOX, P.camera_rail(M.t_of(f))[:2],
                       0.0, (0.2, 0.2)) for f in keyed)
    check("FIN : rien ne frôle la caméra", c >= 1.0, f"{c:.2f} m au plus près")
    # l'arrêt : motion.drive, au point d'arrêt, cap 25° ; vers l'image 36 (34 à 38), sans pivot une fois arrêtée
    x, y = P.hero_pos(P.T_STILL)
    check("FIN : arrêtée 8 m avant le centre de la pointe, cap de caisse 25° (±1)",
          math.dist((x, y), (P.SX, P.SY)) < 0.01 and abs(P.SY - (P.CY - 8.0)) < 1e-9 and P.SX == P.CX
          and abs(P.HERO_STOP - 25.0) <= 1.0, f"({x:.2f}, {y:.2f}), {P.HERO_STOP:.1f}°")
    f_stop = P.F0 + P.T_STOP * M.FPS
    check("FIN : l'arrêt vers l'image 36 (34 à 38)", 34 <= P.F_STOP <= 38 and abs(f_stop - P.F_STOP) < 0.5,
          f"image {f_stop:.1f}")
    held = max(math.dist(P.hero_pos(M.t_of(f)), (x, y)) for f in range(P.F_STOP, P.F0 + P.FRAMES + 1))
    turn = max(abs(P.hero_heading(M.t_of(f)) - P.HERO_STOP) for f in range(P.F_STOP - 6, P.F0 + P.FRAMES + 1))
    check("FIN : arrêtée, elle ne bouge plus et ne pivote pas (dès 6 images avant l'arrêt, moins de 1°)",
          held < 0.01 and turn < 1.0, f"{held * 100:.1f} cm, {turn:.2f}°")
    ps = M.sample(P.hero_pos, range(0, 56), heading=P.hero_heading, steer=P.hero_steer, noise=0.0)
    check("FIN : la caisse plonge au freinage", min(p["pitch"] for p in ps) < -1.0,
          f"{min(p['pitch'] for p in ps):.2f}°")
    first = next(p for p in ps if p["frame"] == P.F0)
    check("FIN : la caisse ne se cabre pas à la première image (la berline arrive en freinant)", first["pitch"] < 0.0,
          f"{first['pitch']:.2f}°")
    v0, a0 = P.HERO.speed(M.t_of(P.F0)), P.HERO.along(M.t_of(P.F0))
    check("FIN : prise en plein freinage (20 à 30 km/h, 4 m/s² au moins à l'image 1)",
          20.0 <= v0 * 3.6 <= 30.0 and a0 <= -4.0, f"{v0 * 3.6:.0f} km/h, {a0:.1f} m/s²")
    slip = [P.hero_slip(M.t_of(f)) for f in frames]
    check("FIN : la glisse de fin (8 à 18°, l'arrière à droite), figée à l'arrêt",
          8.0 <= max(slip) <= 18.0 and min(slip) > -1.0 and abs(slip[-1] - P.hero_slip(P.T_STOP)) < 0.5,
          f"crête {max(slip):.1f}°")
    wins = P.HERO.brake_windows(frames=keyed)
    check("FIN : les feux stop dès la première image (freinage de plus de 2 m/s²)", wins and wins[0][0] <= P.F0,
          f"{wins}")
    # le temps : temps mort après l'arrêt, les mains dehors en 6 à 8 images, tenues jusqu'à la fin
    out = P.DRIVER_KEYS[0] + P.DRIVER_OUT
    check("FIN : temps mort de l'arrêt aux mains (5 images au moins), mains dehors en 6 à 8 images, tenues",
          P.DRIVER_KEYS[0] - P.F_STOP >= 5 and 6 <= P.DRIVER_OUT <= 8 and out <= P.STILL_FRAME - 3,
          f"images {P.DRIVER_KEYS[0]} à {out}")
    check("FIN : le faisceau se pose sur elle à l'arrêt", P.F_BEAM == P.F_STOP
          and math.dist(P.beam_target(P.T_STOP)[:2], P.hero_pos(P.T_STOP)) < 1e-6)
    # la caméra : le cadre commun à la coupe, près et fixe à la fin
    def geo(f):
        cam = P.camera_rail(M.t_of(f))
        hx, hy = P.hero_pos(M.t_of(f))
        return cam[2], math.dist(cam[:2], (hx, hy)), cam[6]
    h0, d0, l0 = geo(P.F0)
    check("FIN : la caméra part à 2,4 m, 7,5 m derrière (±0,2), 24 mm", abs(h0 - 2.4) < 1e-9 and abs(d0 - 7.5) <= 0.2
          and l0 == 24.0, f"{h0:.2f} m, {d0:.2f} m")
    h1, d1, _ = geo(P.STILL_FRAME)
    cl = P.camera_rail(P.T_STILL)
    still = all(P.camera_rail(M.t_of(f)) == cl for f in (P.STILL_FRAME, P.STILL_FRAME + 1))
    check("FIN : la caméra finit à 2,0 m, 5,5 à 6,5 m (les mains), à gauche, et l'image 52 est fixe",
          abs(h1 - 2.0) < 1e-9 and 5.5 <= d1 <= 6.5 and P.CAM_LEFT[1] >= 0.8 and still, f"{h1:.2f} m, {d1:.2f} m")
    # les autres véhicules : 1,5 m d'air entre caisses, la caméra à 0,8 m au moins (motion.py mesure --v3 aussi)
    check("FIN : seule la patrouille 1 roule avec la berline", set(P.tracks()) == {"hero", "patrol_1"}
          and not hasattr(P, "PATROL") and not hasattr(P, "ARC"))
    g = min(P.rect_gap(P.patrol1_pos(M.t_of(f)), P.patrol1_heading(M.t_of(f)), P.PATROL_BOX, P.hero_pos(M.t_of(f)),
                       P.hero_heading(M.t_of(f)), P.HERO_BOX) for f in keyed)
    cg = min(P.rect_gap(P.patrol1_pos(M.t_of(f)), P.patrol1_heading(M.t_of(f)), P.PATROL_BOX,
                        P.camera_rail(M.t_of(f))[:2], 0.0, (0.2, 0.2)) for f in keyed)
    check("FIN : la patrouille 1 à 1,5 m au moins de la berline, 0,8 m de la caméra", g >= 1.5 and cg >= 0.8,
          f"{g:.2f} m, {cg:.2f} m")
    # la patrouille 1 : devant à gauche dès l'image 1, elle freine en virant à droite et s'arrête en travers
    # (sa caisse à 60° de la route de la berline, ±5) avant les mains, puis ne bouge plus
    a0 = P.rail_u(P.patrol1_pos(M.t_of(P.F0))) - P.rail_u(P.hero_pos(M.t_of(P.F0)))
    moved = math.dist(P.patrol1_pos(M.t_of(P.F_P1_STOP)), P.patrol1_pos(P.T_STILL))
    sw = P.patrol1_heading(P.T_STILL) - P.patrol1_heading(M.t_of(P.F0))
    check("FIN : la patrouille 1 devant à gauche, freine en virant et s'arrête en travers avant les mains",
          a0 > 10.0 and P.patrol1_pos(M.t_of(P.F0))[0] < P.hero_pos(M.t_of(P.F0))[0] and moved < 0.01
          and P.F_P1_STOP <= P.DRIVER_KEYS[0] and abs(P.P1_HEAD + 60.0) <= 5.0 and sw <= -8.0,
          f"{a0:+.1f} m devant, cap {P.P1_HEAD:.0f}°, {sw:+.0f}° pendant le plan")
    run, best = 0, 0
    for f in frames:
        t = M.t_of(f)
        c = P.camera_rail(t)
        px, py = P.patrol1_pos(t)
        b = M.frame_box(c, dict(x=px, y=py, heading=P.patrol1_heading(t)), (5.0, 1.95, 1.75))
        hb = M.frame_box(c, dict(x=P.hero_pos(t)[0], y=P.hero_pos(t)[1], heading=P.hero_heading(t)))
        hid = (max(0.0, min(b[1], hb[1]) - max(b[0], hb[0])) * max(0.0, min(b[3], hb[3]) - max(b[2], hb[2]))
               / ((b[1] - b[0]) * (b[3] - b[2]))) if b else 1.0
        ok = b and b[0] >= 2.0 and b[1] <= 98.0 and 12.0 <= b[2] <= b[3] <= 85.0 and (b[0] + b[1]) / 2 < 50.0 \
            and hid <= 0.1
        run = run + 1 if ok else 0
        best = max(best, run)
    check("FIN : la patrouille 1 entière dans le cadre, à gauche, visible, 12 images de suite au moins", best >= 12,
          f"{best} images")
    # la meute : rien que ses phares, allumés l'un après l'autre des images 36 à 52, arrêtés, 6 m au moins
    # derrière la caméra
    ins = [p[2] for p in P.PACK]
    check("FIN : les phares de la meute arrivent l'un après l'autre, des images 36 à 52",
          ins == sorted(ins) and len(set(ins)) == len(ins) and ins[0] >= 36 and all(p[3] <= 52 for p in P.PACK)
          and P.pack_level(0, M.t_of(35)) == 0.0, f"images {ins}")
    for i in range(len(P.PACK)):
        pos = P.pack_pos(i)
        moved = math.dist(pos(M.t_of(P.PACK[i][3])), pos(M.t_of(P.PACK[i][3] + 4)))
        behind = min(P.cam_u(M.t_of(f)) - P.rail_u(pos(M.t_of(f))) - P.PACK_LAMP[0] for f in keyed)
        check(f"FIN : la paire {i} arrêtée à l'image {P.PACK[i][3]}, toujours 6 m au moins derrière la caméra",
              moved < 1e-6 and behind >= 6.0, f"{behind:.1f} m")
    # le repli de face (FILM3D_FIN_FACE=1) : la pose validée de la v2, atteinte à l'arrêt de la berline, puis tenue
    fl = P.camera_face_rail(P.T_STOP)
    held = all(P.camera_face_rail(M.t_of(f)) == fl for f in range(P.F_STOP, P.F0 + P.FRAMES + 1))
    fc = min(P.rect_gap(P.hero_pos(M.t_of(f)), P.hero_heading(M.t_of(f)), P.HERO_BOX, P.camera_face_rail(M.t_of(f))[:2],
                        0.0, (0.2, 0.2)) for f in keyed)
    check("FIN : le repli de face se pose sur la pose validée à l'arrêt, puis tient", not P.FACE and held
          and math.dist(fl[:3], P.FACE_CAM) < 1e-9 and fl[3:] == (1.0, 14.0, 0.0, 24.0) and fc >= 1.0,
          f"berline à {fc:.2f} m au plus près")
    # le lampadaire de la pointe : sa tête (et donc son reflet sur l'enrobé, au même azimut) hors du cadre à toutes
    # les images (règle E : pas de tache sans source lisible)
    hx, hy, hz = P.LAMP_HEAD
    seen = [f for f in keyed for z in (hz, 0.0, -hz) if (lambda q: q is not None and -0.15 <= q[0] <= 1.15
                                                          and -0.2 <= q[1] <= 1.2)(
        M.screen_point(P.camera_rail(M.t_of(f)), (hx, hy, z)))]
    check("FIN : le lampadaire de la pointe, sa tache au sol et son reflet hors du cadre", not seen,
          f"images {sorted(set(seen))[:6]}")
    # l'hélicoptère devant, bas, face à elle
    hd = math.dist(P.HELI[:2], (P.SX, P.SY))
    check("FIN : l'hélicoptère 22 m devant elle, à 8 m, le nez vers elle", abs(hd - 22.0) < 1e-6 and P.HELI[2] == 8.0
          and abs(((P.HELI_HEADING - P.HELI_AZ) % 360.0) - 180.0) < 1e-6 and P.HELI[1] > P.SY + 15.0)


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
    """P1 (découpage v3.1), après l'ellipse : la position d'OUV prolongée de ELLIPSIS à vitesse constante, la même
    vitesse au début ; la patrouille sur la voie d'en face, 1,5 m d'air au moins entre les caisses et 1 m entre elle et
    l'objectif ; sa rampe dans le cadre, à gauche de la berline, de l'image 16 à la fin ; le cadre commun ; la berline
    à x 50 ± 6 et y 58 ± 4 partout, à x 50 ± 3 au raccord ; des voitures qui roulent vrai : freinage ≤ 7 m/s²,
    accélérations ≤ 3 (berline) et ≤ 4 (patrouille), à-coups ≤ 12 m/s³."""
    import ouv_avenue as O
    import p1_avenue as P
    h = 1.0 / 240.0
    last = O.hero_pos(M.t_of(O.F0 + O.FRAMES - 1))
    want = last[1] + O.SPEED * (P.ELLIPSIS + 1.0 / M.FPS)
    gap = abs(P.hero_pos(0.0)[1] - want) + abs(P.hero_pos(0.0)[0] - last[0])
    check(f"P1 : OUV prolongé de {P.ELLIPSIS} s à vitesse constante", gap < 1e-6, f"{gap:.2e} m")
    v1 = (P.hero_pos(h)[1] - P.hero_pos(0.0)[1]) / h
    check("P1 : même vitesse au début", abs(v1 - O.SPEED) < 0.01, f"{v1 * 3.6:.2f} km/h")
    frames = range(P.F0, P.F0 + P.FRAMES)
    air = min(P.body_gap(M.t_of(f)) for f in frames)
    lens = min(P.lens_gap(M.t_of(f)) for f in frames)
    left = min(P.hero_pos(M.t_of(f))[0] - P.patrol_pos(M.t_of(f))[0] for f in frames)
    check("P1 : la patrouille à gauche, 1,5 m d'air entre les caisses, 1 m de l'objectif",
          air >= 1.5 and lens >= 1.0 and left > 3.0, f"{air:.2f} m, {lens:.2f} m, {left:.2f} m à gauche")
    bar = []
    for f in frames:
        c = P.camera_rail(M.t_of(f))
        box, b = P.patrol_screen(M.t_of(f))
        car = M.hero_screen(c, *P.hero_pos(M.t_of(f)), 0.0, 0.0)
        if b and 0.0 <= b[0] < car["u0"] and 0.12 <= b[1] <= 0.85:
            bar.append(f)
    check("P1 : sa rampe dans le cadre, à gauche de la berline, de l'image 16 à la fin",
          all(f in bar for f in range(16, P.F0 + P.FRAMES)),
          f"de l'image {bar[0] if bar else None} à {bar[-1] if bar else None}")
    _common_frame("P1", P)
    bad = []
    for f in frames:
        car = M.hero_screen(P.camera_rail(M.t_of(f)), *P.hero_pos(M.t_of(f)), 0.0, 0.0)
        if abs(car["u"] * 100 - 50) > 6 or abs(car["v"] * 100 - 58) > 4:
            bad.append(f)
    car = M.hero_screen(P.camera_rail(0.0), *P.hero_pos(0.0), 0.0, 0.0)
    check("P1 : la berline à x 50 ± 6, y 58 ± 4, à x 50 ± 3 au raccord", not bad and abs(car["u"] * 100 - 50) <= 3,
          f"images {bad[:6]}" if bad else f"x {car['u'] * 100:.0f} au raccord")
    dt = 1.0 / 96.0
    ts = [i * dt for i in range(int(P.T_END / dt) + 1)]
    for name, v, amax in (("berline", P.hero_speed, 3.0), ("patrouille", P.patrol_speed, 4.0)):
        acc = [(v(t + dt) - v(t - dt)) / (2 * dt) for t in ts]
        jerk = max(abs(acc[i + 1] - acc[i]) / dt for i in range(len(acc) - 1))
        check(f"P1 : la {name} roule vrai (freinage ≤ 7, accélération ≤ {amax:g} m/s², à-coup ≤ 12 m/s³)",
              -7.0 - 1e-3 <= min(acc) and max(acc) <= amax + 1e-3 and jerk <= 12.5,
              f"{min(acc):.2f} à {max(acc):.2f} m/s², à-coup {jerk:.1f} m/s³")


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
           ("P5 meute", P5.pack_pos(0), dict(seed=0.0, heading=P5.patrol_heading),
            range(P5.F0 - 1, P5.F0 + P5.FRAMES + 1)),
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
    """La berline (v3.1) : roulis de 3 à 4° vers l'extérieur à 0,8 g (4° au plus), plongée de 1,5 à 2° à 0,8 g de
    freinage (2° au plus), la caisse qui suit avec retard et dépasse un peu (elle a une masse, sans rebondir)."""
    g = 0.8 * M.G
    v = 20.0
    r = v * v / g
    with dyn(True):
        ps = M.sample(_circle(r, v), range(0, 60), noise=0.0, warmup=1.5)
        roll = _steady(ps, "roll", 1.2)
        check("berline : roulis à 0,8 g de 3 à 4°, vers l'extérieur", -4.0 <= roll <= -3.0, f"{roll:.2f}°")
        brk = M.sample(M.straight(0.0, 0.0, 30.0, accel=lambda t: -g if t >= 0.2 else 0.0), range(0, 40), noise=0.0)
        lo = min(p["pitch"] for p in brk)
        mid = _steady([p for p in brk if p["t"] < 1.4], "pitch", 1.0)
        check("berline : plongée à 0,8 g de 1,5 à 2°", -2.0 <= mid <= -1.5 and lo >= -2.0, f"{mid:.2f}°, {lo:.2f}° au plus")
        # la réponse à un coup de frein : 63 % de la plongée entre 0,08 et 0,3 s après, un dépassement
        t63 = next(p["t"] for p in brk if p["pitch"] <= 0.63 * mid) - 0.2
        check("berline : la caisse suit avec retard", 0.08 <= t63 <= 0.3, f"{t63 * 1000:.0f} ms")
        check("berline : la caisse dépasse un peu (la masse)", mid * 1.15 < lo < mid * 1.02, f"{lo:.2f} pour {mid:.2f}°")
        acc = M.sample(M.straight(0.0, 0.0, 5.0, accel=lambda t: 0.45 * M.G if t >= 0.2 else 0.0), range(0, 40),
                       noise=0.0)
        up = _steady([p for p in acc if p["t"] < 1.4], "pitch", 1.0)
        hv = _steady([p for p in acc if p["t"] < 1.4], "heave", 1.0)
        check("berline : cabrage à l'accélération, la caisse se tasse", up > 0.8 and hv < -0.003,
              f"{up:.2f}°, {hv * 100:.1f} cm")


def test_fin_stop():
    """FIN : la berline freine, plonge, s'arrête ; la caisse se relève avec le freinage qui se relâche (motion.drive,
    à-coup ≤ 12 m/s³ : relevée aux neuf dixièmes avant les mains), revient à peine en arrière (30 % de la plongée au
    plus, v3.1 : pas de rebond franc), se pose ; les roues restent braquées à l'arrêt."""
    import fin_pointe as F
    with dyn(True):
        ps = M.sample(F.hero_pos, range(F.F0 - 1, F.F0 + F.FRAMES + 1), heading=F.hero_heading)
    stop = F.F0 + F.T_STOP * M.FPS
    before = [p for p in ps if p["frame"] < stop]
    after = [p for p in ps if p["frame"] > stop]
    dive = min(p["pitch"] for p in before)
    check("FIN : la plongée au freinage", dive <= -1.5, f"{dive:.2f}°")
    pk = max(after, key=lambda p: p["pitch"])
    up = next(p for p in ps if p["frame"] == F.DRIVER_KEYS[0])["pitch"]
    check("FIN : la caisse se relève avant les mains et revient à peine en arrière après l'arrêt",
          up >= 0.1 * dive and 0.0 <= pk["pitch"] <= 0.3 * -dive,
          f"{up:+.2f}° à l'image {F.DRIVER_KEYS[0]}, {pk['pitch']:+.2f}° à l'image {pk['frame']}")
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
    s2 = min(p["steer"] for p in p2)          # (v3.1 : la glisse se résorbe avant la fin du plan)
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
    fp = list(range(0, 60))       # la secousse v3.1 est plus lente (3 Hz, 0,3 s) : de quoi la voir s'éteindre
    near = [{f: (2.5, -20.0 + 25.0 * M.t_of(f), 0.7) for f in fp}]
    far = [{f: (6.0, -20.0 + 25.0 * M.t_of(f), 0.7) for f in fp}]
    sh = M.camera_operator(fixed, fp, tracks=near)
    nf = M.camera_operator(fixed, fp, tracks=far)
    pk = max(range(len(fp)), key=lambda i: abs(sh[fp[i]][4] - 2.0))
    a = abs(sh[fp[pk]][4] - 2.0)
    tail = max(abs(sh[f][4] - 2.0) for f in fp[pk + 14:])
    check("opérateur : un véhicule à 1,5 m la secoue, brièvement", a > 0.04 and tail < 0.25 * a,   # v3.1 : moitié de la v3
          f"{a:.2f}° puis {tail:.3f}° une demi-seconde après")
    check("opérateur : à 5 m, rien", all(nf[f] == fixed(M.t_of(f)) for f in fp))

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



def _drive_numbers(d, frames):
    s = M.car_series(d.pos, frames, heads={f: d.heading(M.t_of(f)) for f in frames})
    sl = {f: d.slip(M.t_of(f)) for f in frames}
    rate = {f: (sl[f + 1] - sl[f - 1]) * M.FPS / 2 for f in frames[1:-1]}
    grow = [r * (1 if sl[f] >= 0 else -1) for f, r in rate.items()]
    return dict(lat=max(abs(v) for v in s["alat"].values()), brake=max(-v for v in s["along"].values()),
                acc=max(s["along"].values()), circle=max(math.hypot(s["alat"][f], s["along"][f]) for f in s["alat"]),
                jerk=max(s["jerk"].values()), yaw_acc=max(abs(v) for v in s["yaw_acc"].values()),
                vmin=min(s["speed"].values()), slip=max(abs(v) for v in sl.values()), on=max(grow),
                off=max(-g for g in grow), sl=sl)


def test_drive():
    """L'outil de conduite (motion.drive) : un virage de 28 m abordé à 19 m/s voulus, un arrêt en glisse depuis
    44 km/h, une route en points ; toutes les limites v3.1 tenues aux images rendues ; on freine avant le virage
    (feux stop), la glisse perd de la vitesse, contre-braque, ne revient qu'une fois et peu."""
    def within(name, d, frames, L):
        n = _drive_numbers(d, frames)
        bad = [k for k in ("lat", "brake", "acc", "circle", "jerk", "yaw_acc") if n[k] > L[k] + 1e-9]
        check(f"conduite, {name} : les limites de la voiture", not bad,
              ", ".join(f"{k} {n[k]:.1f}" for k in ("lat", "brake", "acc", "circle", "jerk", "yaw_acc")))
        check(f"conduite, {name} : la glisse ≤ {SLIP31_MAX:g}°, s'installe ≤ {SLIP31_ON:g}°/s, se résorbe ≤ "
              f"{SLIP31_OFF:g}°/s", n["slip"] <= SLIP31_MAX and n["on"] <= SLIP31_ON and n["off"] <= SLIP31_OFF,
              f"{n['slip']:.1f}°, {n['on']:.0f} et {n['off']:.0f} °/s")
        return n
    fr = list(range(1, 145))
    turn = M.drive(dict(start=(0.0, 0.0, 0.0), pieces=[M.line(50), M.arc(28, 90), M.line(40)]), speed=19.0)
    n = within("virage de 28 m", turn, fr, CAR31_HERO)
    check("conduite : l'arc de 28 m pris à 13,5 m/s au plus", n["vmin"] <= 13.5, f"{n['vmin']:.1f} m/s")
    arc_in = next(f for f in fr if abs(turn.travel(M.t_of(f))) > 2.0)
    br = turn.brake_windows(frames=fr)
    check("conduite : on freine avant le virage (feux stop)", br and br[0][0] < arc_in, f"{br}, virage à {arc_in}")
    sl = n["sl"]
    drift = [f for f in fr if abs(sl[f]) > 3.0]
    v0, v1 = (turn.speed(M.t_of(drift[0])), turn.speed(M.t_of(drift[-1]))) if drift else (1.0, 1.0)
    check("conduite : la glisse perd 10 % de vitesse au moins", drift and v1 <= (1 - SLIP31_LOSS) * v0,
          f"{v0:.1f} → {v1:.1f} m/s")
    cs = sum(turn.steer(M.t_of(f)) * sl[f] < 0 for f in drift) / max(1, len(drift))
    check("conduite : contre-braquage pendant la glisse", cs >= 0.9, f"{cs * 100:.0f} % des images")
    back = min(sl.values())
    signs = [f for f in fr if sl[f] < -1.0]
    check(f"conduite : un seul petit retour (≤ {SLIP31_BACK:g}°), puis plus rien", -SLIP31_BACK <= back
          and (not signs or max(sl[f] for f in fr if f > signs[-1]) < 1.0), f"{back:.1f}°")
    stop = M.drive(dict(start=(0.0, 0.0, 0.0), pieces=[M.line(12), M.arc(14, 70)]), speed=12.2, stop=True)
    fs = list(range(1, 105))
    n = within("arrêt en glisse", stop, fs, CAR31_HERO)
    check("conduite : l'arrêt en glisse glisse et s'arrête", n["slip"] >= 5.0 and stop.t_stop is not None
          and stop.speed(stop.t_stop + 0.5) < 0.01, f"{n['slip']:.1f}°, arrêt à {stop.t_stop}")
    still = [stop.heading(stop.t_stop + k / 24) for k in range(0, 24)]
    check("conduite : à l'arrêt la caisse ne tourne plus", max(still) - min(still) < 0.3,
          f"{max(still) - min(still):.2f}°")
    pts = [(0, 0), (0, 40), (-8, 60), (-28, 68), (-60, 68)]
    road = M.drive(pts, speed=15.0, kind="patrol")
    within("route en points (patrouille)", road, fr, CAR31_PATROL)
    end = road.pos(12.0)
    check("conduite : la route en points mène au dernier point (à 3 m près, en ligne)", abs(end[1] - 68.0) < 3.0
          and end[0] < -60.0, f"({end[0]:.1f}, {end[1]:.1f})")
    ps = M.sample(turn.pos, range(1, 60), heading=turn.heading, steer=turn.steer)
    check("conduite : sample garde le braquage imposé", all(abs(p["steer"] - turn.steer(p["t"])) < 1e-9 for p in ps))


def test_camera_measure():
    """La mesure des caméras des neuf plans (sans Blender) : chaque plan mesuré ; la vibration de l'opérateur ne
    compte pas comme un mouvement (avec et sans vibration, ressauts ni secousses, les vitesses de la colonne
    « finale » diffèrent de moins de CAM_VIB_TOL)."""
    res = M.measure_shots()
    check("caméras : les neuf plans mesurés", list(res) == list(M.PLANS)
          and all(m["debut"] and m["fin"] for m in res.values()), ", ".join(res))
    if M.dyn_on():
        calm = M.measure_shots(op=dict(vib_deg=0.0, vib_z=0.0, jolt_deg=0.0, jolt_z=0.0, pass_deg=0.0))
        worst = max(((abs(res[p]["finale"][k] - calm[p]["finale"][k]), p, k, res[p]["brute"][k] - calm[p]["brute"][k])
                     for p in res for k in ("pan", "tilt")))
        check("caméras : la vibration ne compte pas dans les vitesses", worst[0] <= CAM_VIB_TOL,
              f"au plus {worst[0]:.2f}°/s ({worst[1]}, {worst[2]}) ; image à image, sans moyenne : {worst[3]:+.2f}°/s")


def test_v3():
    """Le découpage v3 (section 6) sur les plans qui portent V3 = True : durées, derrière, vitesses, cadre, phare,
    écarts, hauts de cadre, raccords du tableau 5 entre deux plans migrés, films entiers. Les plans v2 ne sont que
    mesurés (python3 tools/film3d/motion.py mesure --v3)."""
    base, per_plan = v3_limits()
    rep = M.v3_report(base, per_plan, v31=v31_limits())
    v3 = [p for p, (on, _) in rep["plans"].items() if on]
    check("v3 : plans migrés", True, ", ".join(v3) if v3 else "aucun encore")
    for p, (on, checks) in rep["plans"].items():
        if on:
            for name, ok, detail in checks:
                check(f"v3 {p} : {name}", ok, detail)
    for a, b, fa, fb, ma, mb, ta, tb, chk in rep["cuts"]:
        if chk is not None:
            check(f"v3 coupe {a} → {b} : |Δx| ≤ {CAM_CUT_DX:g}, |Δy| ≤ {CAM_CUT_DY:g}"
                  + ("" if (a, b) in M.CUT_XY_ONLY else ", largeurs ×0,75 à ×1,33"), chk[0], chk[1])
    for name, ok, detail in rep["films"]:
        check(f"v3 {name}", ok, detail)
    # v3.1 : seulement les plans qui portent V31 = True
    v31 = [p for p, (on, _) in rep["v31"].items() if on]
    check("v3.1 : plans migrés", True, ", ".join(v31) if v31 else "aucun encore")
    for p, (on, checks) in rep["v31"].items():
        if on:
            for name, ok, detail in checks:
                check(f"v3.1 {p} : {name}", ok, detail)
    for a, b, ga, gb, chk in rep["cuts31"]:
        if chk is not None:
            check(f"v3.1 coupe {a} → {b} : |Δhauteur| ≤ {CAM31_CUT_DH:g} m, |Δdistance| ≤ {CAM31_CUT_DD:g} m, "
                  "même focale", chk[0], chk[1])


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
    test_drive()
    test_camera_measure()
    test_v3()
    print(f"\n{'tout passe' if not FAIL else str(len(FAIL)) + ' échec(s)'}")
    sys.exit(1 if FAIL else 0)
