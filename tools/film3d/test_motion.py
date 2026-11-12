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
    # 21 mm, le virage de 30 m. accel : la berline y tire 12,6 m/s² (70 km/h sur 30 m) ; une caméra qui la suit à
    # 4 m/s² près (arel) en tire donc au moins 8,6 : le plafond commun de 8 ne peut pas tenir avec celui d'arel
    "P2": {"pan": 41.0, "behind": 0.67, "accel": 13.5},
    "P3": {"gap": 0.3},     # la trouée : 0,65 m entre les boîtes de la berline et du barrage (0,35 au moins) ; la patrouille 1
                             # à 1,5 m au moins de la berline : test_p3
    "P4": {"pan": 4.6, "vrel": None, "arel": None, "behind": 0.0,   # fixe, 200 mm, de face
           "zoom": True, "low_center": (0.52, 0.56), "low_all": True, "width_min": 0.17},
    "P5": {"pan": 75.0, "pan_frames": 16, "pan_acc": 3.0, "behind": 0.67,   # le seul mouvement vif du film
           # la berline prend 22 à 32 m/s² dans l'arc de 12 m : ni 4 par rapport à elle ni 8 en propre ne tiennent
           "arel": None, "accel": 24.0},
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
SCREEN31_D2, SCREEN31_D3 = 0.25, 0.35
BODY31_ROLL, BODY31_PITCH = 4.0, 2.0
BODY31_ROLL_D2, BODY31_NOISE = 0.10, 0.15
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
    la berline frôle sans le toucher, la caméra loin des séparateurs, la patrouille 1 qui double la caméra,
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
    # la patrouille 1 double la caméra par la gauche entre les images 1 et 12
    p0 = tr["patrol_0"]
    passed = [f for f in range(P.F0, P.F0 + P.FRAMES) if p0(M.t_of(f))[1] > P.camera_rail(M.t_of(f))[1]]
    left = all(p0(M.t_of(f))[0] < P.camera_rail(M.t_of(f))[0] - 2.0 for f in range(P.F0, P.F0 + 14))
    check("P5 : la patrouille 1 double la caméra par la gauche", passed and P.F0 <= passed[0] <= 12 and left,
          f"devant elle dès l'image {passed[0] if passed else '—'}")
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
    """P2 (découpage v3) : la pose de l'image fixe retrouvée par le plan animé ; la glisse et la dynamique ; la
    caméra sans tremblé ; la berline au point de coupe (y depuis le haut). Écarts et plafonds : test_v3."""
    import p2_arc as P
    t = P.STILL * P.T_END
    ref = P.cars(P.STILL)
    ok = all(math.dist(ref[k][:2], P.tracks()[k](t)) < 1e-6 for k in ref)
    check("P2 : la pose de l'image fixe", ok and abs(P.hero_slip(t) - P.DRIFT) < 1e-9)
    check("P2 : 48 images, V3", P.FRAMES == 48 and P.V3)
    ps = M.sample(P.hero_pos, range(0, 49), slip=P.hero_slip, noise=0.0)
    check("P2 : virage à gauche, roulis vers la droite", ps[30]["roll"] > 2.0, f"{ps[30]['roll']:.2f}°")
    check("P2 : glisse à gauche, contre-braquage (roues à droite)", ps[30]["steer"] < 0.0, f"{ps[30]['steer']:.2f}°")
    # (le plan s'ouvre dans l'arc : 12,6 m/s² tenus de l'image 1 à 43, le roulis plafonne vers 6°)
    check("P2 : roulis ≤ 6,5°", max(abs(p["roll"]) for p in ps) <= 6.5, f"{max(abs(p['roll']) for p in ps):.2f}°")
    check("P2 : glisse à 25°", P.DRIFT == 25.0, f"{P.DRIFT:.1f}°")
    tt = M.t_of(20)
    c, r = P.camera(tt), P.camera_rail(tt)
    check("P2 : camera_rail, la caméra sans tremblé", c[6] == r[6] and math.dist(c[:3], r[:3]) < 0.2
          and abs(c[3] - r[3]) < 1.0 and abs(c[4] - r[4]) < 1.0)
    # la caméra de poursuite : la berline au point de coupe à la première et à la dernière image
    for f in (P.F0, P.F0 + P.FRAMES - 1):
        tt = M.t_of(f)
        hx, hy = P.hero_pos(tt)
        bx = M.hero_screen(P.camera_rail(tt), hx, hy, 0.0, P.hero_heading(tt))
        u, y, w = bx["u"] * 100, bx["v"] * 100, bx["w"] * 100
        check(f"P2 : point de coupe à l'image {f}", abs(u - 50) <= 6 and abs(y - 55) <= 5 and abs(w - 42) <= 8,
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
    """P3 (découpage v3, de dos, 48 images) : aucun choc (la caisse à 15 cm au moins des patrouilles du barrage, des
    agents, des plots et des caisses : elle passe de justesse, la fiche le veut ; 0,35 m au moins des patrouilles
    du barrage, la trouée ne se lit pas comme un choc ; la patrouille 1 à 1,5 m au moins de la berline ; la caméra
    à 2 m au moins de la caisse et à 0,8 m au moins de tout le reste) ; roulis et tangage bornés ; la berline de
    y 71,5–73,5 à 134 ; la caméra passe le barrage à sa suite sans jamais ralentir, et descend de Z0 à Z1 (2,4 à
    1,4 m) sans palier ; la berline dans le tiers central (son centre), son centre entre 50 et 62 % de la hauteur
    depuis le haut quand la caméra est à 1 m ou moins (la règle des plans bas), entière hors des bandes du HUD (15 %
    du bas, 12 % du haut), le trou des plots dans le cadre tant qu'il est devant ; le point de coupe : à la
    première image, celui de mesure (Δx ≤ 8, Δy ≤ 6, largeurs × 0,75–1,33 de la sortie de P2, 52/55/44), à la
    dernière x 50 ± 6 %, y 55 ± 6 % depuis le haut, largeur 42 ± 8 % ; la patrouille 1 : sa rampe et la moitié de
    sa caisse au moins dans le cadre, à gauche, 12 images de suite dès l'image 1, puis elle sort par le quart bas
    gauche (l'arrière par le bas, l'avant en dernier par le bord gauche, sous la mi-hauteur) et n'y revient pas,
    sans freinage sec (8 m/s² au plus, 1,25 m/s² d'une image à l'autre au plus), et à la dernière image l'avant de
    sa caisse est avant les panneaux du barrage ; éclairs d'une ou deux images."""
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
    check("P3 : de y 71,5–73,5 à 134", 71.5 <= y0 <= 73.5 and abs(y1 - 134.0) < 0.05, f"y {y0:.1f} → {y1:.1f}")
    shown = range(P.F0, P.F0 + P.FRAMES)
    cys = [P.cam_y(M.t_of(f)) for f in shown]
    vs = [(cys[i + 1] - cys[i]) * M.FPS for i in range(len(cys) - 1)]
    check("P3 : la caméra passe le barrage sans ralentir", cys[-1] > P.PATROLS["patrol_a"][1]
          and all(vs[i + 1] >= vs[i] - 1e-6 for i in range(len(vs) - 1)),
          f"y {cys[0]:.1f} → {cys[-1]:.1f}, {min(vs):.1f} à {max(vs):.1f} m/s")
    zs = [P.cam_z(M.t_of(f)) for f in shown]
    low = next(i for i, z in enumerate(zs) if z <= P.Z1 + 1e-6)
    top = max(i for i, z in enumerate(zs) if z >= P.Z0 - 1e-6)
    check("P3 : descente de 2,4 à 1,4 m sans palier", abs(zs[0] - 2.4) < 1e-6 and abs(zs[-1] - 1.4) < 1e-6
          and all(zs[i + 1] < zs[i] - 1e-4 for i in range(top + 2, low - 1)),
          f"de l'image {top + P.F0} à l'image {low + P.F0}")
    bad = []
    for f in shown:
        t = M.t_of(f)
        c = P.camera(t)
        (u0, u1, v0, v1), (uc, vc) = P.hero_frame(t, c)
        g = P.project(c, (P.GAP[0], P.GAP[1], 0.9)) if c[1] < P.GAP[1] - 1.0 else (0.0, 0.5)
        if not (abs(uc) <= 1 / 3 and u0 > -1.0 and u1 < 1.0 and v0 >= 0.15 and v1 <= 0.88
                and (c[2] > 1.0 or 0.38 <= vc <= 0.50) and g and abs(g[0]) < 0.6 and 0.15 < g[1] < 0.88):
            bad.append(f)
    check("P3 : la berline au tiers central, hors du HUD, le barrage dans le cadre", not bad, f"images {bad[:6]}")
    cut = []
    for f in (P.F0, P.F0 + P.FRAMES - 1):
        (u0, u1, v0, v1), (uc, vc) = P.hero_frame(M.t_of(f), P.camera(M.t_of(f)))
        cut.append((50 * ((u0 + u1) / 2 + 1), 100 * (1 - (v0 + v1) / 2), 50 * (u1 - u0)))   # la boîte, comme mesure
    (x0, y0_, w0), (x1, y1_, w1) = cut
    check("P3 : le point de coupe à la première et à la dernière image",
          abs(x0 - 52) <= 8 and abs(y0_ - 55) <= 6 and 0.75 <= w0 / 44.0 <= 1.33
          and abs(x1 - 50) <= 6 and abs(y1_ - 55) <= 6 and abs(w1 - 42) <= 8,
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
    check("P3 : la patrouille 1 lève le pied sans freinage sec, et reste avant le barrage",
          min(acc) >= -8.05 and jerk <= 1.25 and front < panel,
          f"{min(acc):.1f} m/s², {jerk:.2f} m/s² d'une image à l'autre ; l'avant à y {front:.1f} (panneaux à {panel:.1f})")
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
    avec la berline) ; la colonne derrière la berline ; la caméra de dos, 7 m derrière à 1,6 m à l'image 1, 8 m
    derrière à 3,6 m à la fin, grue sous 2,5 m/s ; la patrouille 1 à gauche, de 6,5 m derrière à 3,3 m devant, au
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
    ok = (abs(h0[1] - c0[1] - 7.0) < 0.01 and abs(c0[2] - 1.6) < 0.01 and abs(h1[1] - c1[1] - 8.0) < 0.01
          and abs(c1[2] - 3.6) < 0.01 and all(P.hero_pos(M.t_of(g))[1] > P.camera_rail(M.t_of(g))[1] for g in frames))
    check("P6 : de dos, 7 m derrière à 1,6 m, puis 8 m derrière à 3,6 m", ok,
          f"début {h0[1] - c0[1]:.2f} m à {c0[2]:.2f} m, fin {h1[1] - c1[1]:.2f} m à {c1[2]:.2f} m")
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
    """OUV (découpage v3) : la berline dépasse la patrouille garée à plus de 2 m (de flanc à flanc, demi-largeurs de
    0,95 m), le plan et les trois secondes qui le suivent ; la patrouille dans le cadre à gauche de la berline (sans
    passer derrière elle) jusqu'à l'image 24, hors champ à 32 ; la berline au point de coupe à la première et à la
    dernière image (x 50 ± 6, y 55 ± 5 depuis le haut) ; l'éveil dans l'ordre : phares, rampe, feux stop."""
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
    for f in (P.F0, P.F0 + P.FRAMES - 1):
        car = M.hero_screen(P.camera_rail(M.t_of(f)), *P.hero_pos(M.t_of(f)), 0.0, 0.0)
        x, y = car["u"] * 100, car["v"] * 100
        check(f"OUV : la berline au point de coupe à l'image {f}", abs(x - 50) <= 6 and abs(y - 55) <= 5,
              f"x {x:.0f}, y {y:.0f}, largeur {car['w'] * 100:.0f} %")
    check("OUV : phares, rampe puis feux stop", P.F0 < P.WAKE < P.BARS_ON < P.BRAKE[0] <= P.BRAKE[1] < P.F0 + P.FRAMES,
          f"phares {P.WAKE}, rampe {P.BARS_ON}, feux stop {P.BRAKE[0]}-{P.BRAKE[1]}")


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
    keyed = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    c = min(P.rect_gap(P.hero_pos(M.t_of(f)), P.hero_heading(M.t_of(f)), P.HERO_BOX, P.camera_rail(M.t_of(f))[:2],
                       0.0, (0.2, 0.2)) for f in keyed)
    check("FIN : rien ne frôle la caméra", c >= 1.0, f"{c:.2f} m au plus près")
    x, y = P.hero_pos(P.T_STILL)
    check("FIN : arrêtée au centre de la pointe, cap 25°", math.dist((x, y), (P.CX, P.CY)) < 1e-6
          and abs(P.hero_heading(P.T_STILL) - P.HERO_STOP) < 1e-6)
    ps = M.sample(P.hero_pos, range(0, 56), heading=P.hero_heading, noise=0.0)
    check("FIN : la caisse plonge au freinage", min(p["pitch"] for p in ps) < -1.0,
          f"{min(p['pitch'] for p in ps):.2f}°")
    first = next(p for p in ps if p["frame"] == P.F0)
    check("FIN : la caisse ne se cabre pas à la première image (la berline arrive lancée)", first["pitch"] < 0.0,
          f"{first['pitch']:.2f}°")
    stop = min(f for f in range(P.F0, P.F0 + P.FRAMES) if math.dist(P.hero_pos(M.t_of(f)), (P.CX, P.CY)) < 1e-6)
    check("FIN : la berline s'arrête à l'image 30", stop == 30 == P.F_STOP, f"image {stop}")
    v0 = math.dist(P.hero_pos(M.t_of(0.5)), P.hero_pos(M.t_of(1.5))) * M.FPS
    check("FIN : elle entre lancée (40 à 48 km/h)", 40.0 <= v0 * 3.6 <= 48.0, f"{v0 * 3.6:.0f} km/h")
    # le temps : mains levées après le temps mort, agent debout avant elles, faisceau posé à l'arrêt
    check("FIN : temps mort de l'arrêt aux mains (5 images), mains de 35 à 46, tenues jusqu'à la fin",
          P.DRIVER_KEYS == (35, 46) and P.DRIVER_KEYS[0] - P.F_STOP >= 5 and P.DRIVER_KEYS[1] <= P.STILL_FRAME - 6)
    check("FIN : l'agent debout en joue avant les mains", P.OFFICER_KEYS[-1][1] == "aim"
          and P.OFFICER_KEYS[-1][0] <= P.DRIVER_KEYS[0], f"{P.OFFICER_KEYS}")
    check("FIN : le faisceau se pose sur elle à l'arrêt", P.F_BEAM == P.F_STOP
          and math.dist(P.beam_target(P.T_STOP)[:2], P.hero_pos(P.T_STOP)) < 1e-6)
    # la caméra : derrière elle, à gauche, basse au départ ; elle freine sans à-coup, s'arrête, monte, puis tient
    c0 = P.camera_rail(M.t_of(P.F0))
    u0 = P.rail_u(P.hero_pos(M.t_of(P.F0))) - P.cam_u(M.t_of(P.F0))
    check("FIN : la caméra part 7,5 à 8,5 m derrière, 1,2 m à gauche, à 0,6 m, 24 mm",
          7.5 <= u0 <= 8.5 and abs(P.CAM_LEFT[0] - 1.2) < 1e-9 and abs(c0[2] - 0.6) < 1e-9 and c0[6] == 24.0,
          f"{u0:.2f} m derrière")
    steps = [abs(P.cam_u(M.t_of(f + 1)) - P.cam_u(M.t_of(f))) for f in range(P.F0, P.F_CAM_STOP)]
    check("FIN : la caméra freine sans à-coup et s'arrête", all(b <= a + 1e-9 for a, b in zip(steps, steps[1:]))
          and steps[-1] < 0.005, f"{steps[-1] * 1000:.1f} mm à la dernière image")
    cl = P.camera_rail(P.T_STILL)
    still = all(math.dist(P.camera_rail(M.t_of(f))[:3], cl[:3]) < 1e-9
                and abs(P.camera_rail(M.t_of(f))[4] - cl[4]) < 1e-9 for f in (P.STILL_FRAME, P.STILL_FRAME + 1))
    check("FIN : la grue monte à 1,3 m et l'image 52 est fixe", abs(cl[2] - 1.3) < 1e-9 and still)
    # les autres véhicules : 1,5 m d'air entre caisses, la caméra à 0,8 m au moins (motion.py mesure --v3 aussi)
    others = {"patrol": (lambda t: P.PATROL, lambda t: P.HERO_STOP), "patrol_1": (P.patrol1_pos, lambda t: P.ROUTE_H)}
    others.update({f"arc_{i}": (P.arc_pos(i), P.arc_heading(i)) for i in range(len(P.ARC))})
    for name, (pos, head) in others.items():
        g = min(P.rect_gap(pos(M.t_of(f)), head(M.t_of(f)), P.PATROL_BOX, P.hero_pos(M.t_of(f)),
                           P.hero_heading(M.t_of(f)), P.HERO_BOX) for f in keyed)
        cg = min(P.rect_gap(pos(M.t_of(f)), head(M.t_of(f)), P.PATROL_BOX, P.camera_rail(M.t_of(f))[:2], 0.0,
                            (0.2, 0.2)) for f in keyed)
        check(f"FIN : {name} à 1,5 m au moins de la berline, 0,8 m de la caméra", g >= 1.5 and cg >= 0.8,
              f"{g:.2f} m, {cg:.2f} m")
    # la patrouille 1 : à la hauteur de la caméra au départ, elle la dépasse par la gauche et s'arrête à gauche de
    # la berline, près de son essieu arrière, avant les mains
    d0 = P.rail_u(P.patrol1_pos(M.t_of(P.F0))) - P.cam_u(M.t_of(P.F0))
    d1 = P.rail_u(P.patrol1_pos(P.T_STILL)) - P.cam_u(P.T_STILL)
    moved = math.dist(P.patrol1_pos(M.t_of(P.F_P1_STOP)), P.patrol1_pos(P.T_STILL))
    check("FIN : la patrouille 1 dépasse la caméra par la gauche et s'arrête avant les mains",
          d0 < 2.5 and d1 > d0 + 3.0 and P.P1_LEFT > P.CAM_LEFT[1] + 2.0 and moved < 1e-6
          and P.F_P1_STOP <= P.DRIVER_KEYS[0] + 3, f"{d0:+.1f} m puis {d1:+.1f} m de la caméra")
    hx, hy = P.hero_pos(P.T_STILL)
    px, py = P.patrol1_pos(P.T_STILL)
    h = math.radians(P.HERO_STOP)
    side = (px - hx) * -math.cos(h) + (py - hy) * -math.sin(h)
    along = (px - hx) * -math.sin(h) + (py - hy) * math.cos(h)
    check("FIN : la patrouille 1 à gauche de la berline, un peu en arrière de son essieu arrière",
          side > 3.0 and -4.0 <= along <= -1.0, f"{side:.1f} m à gauche, {along:+.1f} m le long")
    # les poursuivants : arrêtés l'un après l'autre derrière la caméra (8 m au moins), jamais devant elle
    stops = [a[2] for a in P.ARC]
    check("FIN : les poursuivants s'arrêtent l'un après l'autre", len(set(stops)) == len(stops)
          and all(b - a >= 4 for a, b in zip(stops, stops[1:])), f"images {stops}")
    for i in range(len(P.ARC)):
        pos = P.arc_pos(i)
        moved = math.dist(pos(M.t_of(stops[i])), pos(M.t_of(stops[i] + 6)))
        behind = min(P.cam_u(M.t_of(f)) - P.rail_u(pos(M.t_of(f))) for f in keyed)
        check(f"FIN : le poursuivant {i} arrêté à l'image {stops[i]}, toujours 6 m au moins derrière la caméra",
              moved < 1e-6 and behind >= 6.0, f"{behind:.1f} m")
    # le repli de face (FILM3D_FIN_FACE=1) : la pose validée de la v2, atteinte à l'arrêt de la berline, puis tenue
    fl = P.camera_face_rail(P.T_STOP)
    held = all(P.camera_face_rail(M.t_of(f)) == fl for f in range(P.F_STOP, P.F0 + P.FRAMES + 1))
    fc = min(P.rect_gap(P.hero_pos(M.t_of(f)), P.hero_heading(M.t_of(f)), P.HERO_BOX, P.camera_face_rail(M.t_of(f))[:2],
                        0.0, (0.2, 0.2)) for f in keyed)
    check("FIN : le repli de face se pose sur la pose validée à l'image 30, puis tient", not P.FACE and held
          and math.dist(fl[:3], P.FACE_CAM) < 1e-9 and fl[3:] == (1.0, 14.0, 0.0, 24.0) and fc >= 1.0,
          f"berline à {fc:.2f} m au plus près")
    # l'hélicoptère devant, bas, face à elle
    hd = math.dist(P.HELI[:2], (P.CX, P.CY))
    check("FIN : l'hélicoptère 22 m devant elle, à 8 m, le nez vers elle", abs(hd - 22.0) < 1e-6 and P.HELI[2] == 8.0
          and abs(((P.HELI_HEADING - P.HELI_AZ) % 360.0) - 180.0) < 1e-6 and P.HELI[1] > P.CY + 15.0)


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
    """P1 (découpage v3, reprise du 12 au soir), après l'ellipse : la position d'OUV prolongée de ELLIPSIS à vitesse
    constante, la même vitesse au début ; la patrouille sur la voie d'en face, 1,5 m d'air au moins entre les caisses
    et 1 m entre elle et l'objectif ; hors champ à la première image, entrée par le bord gauche avant l'image 16, sa
    rampe dans le cadre de l'image 28 à la fin ; la caméra derrière, qui monte au-dessus de 1,2 m ; la berline au
    point de coupe au début, au centre droit à la fin."""
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
    seen, bar = [], []
    for f in frames:
        box, b = P.patrol_screen(M.t_of(f))
        if box and box["u1"] > 0.0 and box["u0"] < 1.0:
            seen.append(f)
        if b and 0.0 <= b[0] <= 1.0 and 0.0 <= b[1] <= 1.0:
            bar.append(f)
    check("P1 : la patrouille hors champ au début, entrée par la gauche avant l'image 16",
          seen and P.F0 < seen[0] < 16, f"de l'image {seen[0] if seen else None} à {seen[-1] if seen else None}")
    check("P1 : sa rampe dans le cadre de l'image 28 à la fin", all(f in bar for f in range(28, P.F0 + P.FRAMES)),
          f"de l'image {bar[0] if bar else None} à {bar[-1] if bar else None}")
    cams = [P.camera_rail(M.t_of(f)) for f in frames]
    back = [P.hero_pos(M.t_of(f))[1] - c[1] for f, c in zip(frames, cams)]
    check("P1 : la caméra derrière, qui monte au-dessus de 1,2 m", min(back) > 7.5 and cams[0][2] < 0.6
          and max(c[2] for c in cams) > 1.2, f"de {back[0]:.2f} à {back[-1]:.2f} m, de {cams[0][2]:.2f} à "
          f"{cams[-1][2]:.2f} m de haut")
    for f, lo, hi in ((P.F0, 44, 56), (P.F0 + P.FRAMES - 1, 55, 58)):
        car = M.hero_screen(P.camera_rail(M.t_of(f)), *P.hero_pos(M.t_of(f)), 0.0, 0.0)
        x, y = car["u"] * 100, car["v"] * 100
        check(f"P1 : la berline à x {lo}-{hi}, y 55 ± 5, 33 % au moins à l'image {f}",
              lo <= x <= hi and abs(y - 55) <= 5 and car["w"] >= 0.33,
              f"x {x:.0f}, y {y:.0f}, largeur {car['w'] * 100:.0f} %")


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
    test_camera_measure()
    test_v3()
    print(f"\n{'tout passe' if not FAIL else str(len(FAIL)) + ' échec(s)'}")
    sys.exit(1 if FAIL else 0)
