# Les contrôles du calcul des interactions (fx.py), sans Blender : balistique, trajectoire lue, embruns, flaques,
# fumée, envols, plots, balancements, étincelles, gouttes.
#   python3 tools/film3d/test_fx.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fx  # noqa: E402

R = 0.31
WHEELS = (("FL", 1.4, -0.77), ("FR", 1.4, 0.77), ("BL", -1.4, -0.77), ("BR", -1.4, 0.77))


def line_track(speed=20.0, n=30, slip_deg=0.0):
    """Une berline qui roule vers +y, la caisse tournée de slip_deg ; roues à ±0,77 m et ±1,4 m."""
    out = []
    for f in range(n):
        y = speed * f / fx.FPS
        s = math.radians(slip_deg)
        fwd = (-math.sin(s), math.cos(s), 0.0)
        right = (fwd[1], -fwd[0], 0.0)
        wh = {name: (fwd[0] * a + right[0] * b, y + fwd[1] * a + right[1] * b, R) for name, a, b in WHEELS}
        out.append((f, (0.0, y, 0.0), fwd, wh))
    return fx.build_track(out)


def braking_track(v0=12.0, decel=8.0, n=45):
    out = []
    y, v = 0.0, v0
    for f in range(n):
        out.append((f, (0.0, y, 0.0), (0.0, 1.0, 0.0), {name: (b, y + a, R) for name, a, b in WHEELS}))
        y += v / fx.FPS
        v = max(0.0, v - decel / fx.FPS)
    return fx.build_track(out)


def test_ballistic():
    assert fx.ballistic((0, 0, 1), (3, 0, 2), 0.0, 1.0) == (0, 0, 1)
    p = fx.ballistic((0, 0, 0), (1, 0, 5), 0.5, 0.0)            # traînée minimale : la parabole
    assert abs(p[0] - 0.5) < 0.01 and abs(p[2] - (2.5 - 0.5 * 9.81 * 0.25)) < 0.03, p
    v = fx.ballistic_vel((0, 0, 0), 20.0, 2.0)                  # la vitesse limite de chute : g/k
    assert abs(v[2] + 9.81 / 2.0) < 1e-3
    t = fx.land_time((0, 0, 0.3), (0, 0, 2.0), 1.0, 0.0, 3.0)
    assert 0.3 < t < 1.0 and abs(fx.ballistic((0, 0, 0.3), (0, 0, 2.0), t, 1.0)[2]) < 1e-3, t
    assert fx.land_time((0, 0, 0.3), (0, 0, 0.2), 1.0, 0.0, 3.0, grav=-0.02) == 3.0   # la fumée monte


def test_track():
    tr = line_track(20.0)
    assert all(abs(p.speed - 20.0) < 0.01 for p in tr), [p.speed for p in tr]
    assert all(abs(p.slip) < 0.01 for p in tr)
    tr = line_track(20.0, slip_deg=15.0)
    assert all(abs(abs(p.slip) - 15.0) < 0.5 for p in tr), [p.slip for p in tr]
    pos, fwd, vel, wh, wv, slip, speed = fx.pose_at(tr, 10.5)
    assert abs(speed - 20.0) < 0.01 and abs(wh["FL"][1] - wh["BL"][1] - 2.8 * math.cos(math.radians(15))) < 0.02
    f, d = fx.nearest_pass(line_track(20.0), (2.0, 12.0))
    assert abs(d - 2.0) < 1e-6 and abs(f - 12.0 / (20.0 / fx.FPS)) < 0.01, (f, d)
    tr = braking_track()
    assert tr[5].a_long < -6.0 and tr[-1].speed < 0.01


def test_spray():
    slow, _ = fx.wheel_spray(line_track(8.0), None, R, seed=2, veil="haut")
    fast, mist = fx.wheel_spray(line_track(30.0), None, R, seed=2, veil="haut")
    drift, mist_d = fx.wheel_spray(line_track(30.0, slip_deg=20.0), None, R, seed=2, veil="haut")
    # de dos, l'intensité plafonne à celle de 70 km/h : autant de gouttes et de voile en l'air à 100 qu'à 70
    for L70, L100 in zip(fx.wheel_spray(line_track(19.4), None, R, seed=2),
                         fx.wheel_spray(line_track(27.8), None, R, seed=2)):
        a70, a100 = sum(q.life for q in L70), sum(q.life for q in L100)
        assert 0.8 < a100 / a70 < 1.2, (a70, a100)
    assert len(fast) > 2.5 * len(slow) > 0, (len(slow), len(fast))
    assert len(drift) > 1.5 * len(fast) and len(mist_d) > len(mist) > 0
    dry, dmist = fx.wheel_spray(line_track(30.0), None, R, wet=0.0, seed=2)
    assert not dry and not dmist
    for q in fast:
        assert q.p[2] >= 0.0 and q.v[1] < 30.0
        end = fx.ballistic(q.p, q.v, q.life, q.drag)
        assert end[2] > -0.02, end                              # jamais sous le sol
        car_y = 30.0 * (q.birth + q.life * fx.FPS) / fx.FPS
        assert end[1] < car_y + 1.0, (end, car_y)               # elle reste derrière la voiture
    assert all(0 < q.alpha <= 1.2 and q.size1 > q.size0 for q in mist)


def test_puddles():
    tr = line_track(25.0)
    e = (0.77, 15.0, 0.9, 0.5, math.pi / 2)                    # sous les roues droites
    cr = fx.puddle_crossings(tr, [e])
    assert sorted(c[2] for c in cr) == ["BR", "FR"], cr
    for f_in, f_out, name, j in cr:
        assert f_out > f_in and j == 0
        y = fx.pose_at(tr, f_in)[3][name][1]
        assert abs(y - (15.0 - 0.9)) < 0.15, y
    drops, sheet = fx.puddle_splash(tr, cr[0], R, seed=4)
    assert len(drops) > 300 and sheet
    assert sum(1 for q in drops if q.v[0] > 0) > 0.6 * len(drops)   # surtout vers l'extérieur (à droite)
    assert max(q.v[2] for q in drops) > 3.0
    assert all(q.life <= 1.2 for q in drops)


def test_smoke():
    assert not fx.tyre_smoke(line_track(25.0), R)
    drift = fx.tyre_smoke(line_track(25.0, slip_deg=20.0), R)
    assert len(drift) > 20 and all(q.grav < 0 and q.size1 > q.size0 for q in drift)
    tr = braking_track()
    assert fx.tyre_smoke(tr, R, brake=1.0) and not fx.tyre_smoke(tr, R, brake=0.0)
    # la fumée du freinage, emportée sur sa lancée, dépasse le point d'arrêt
    sm = fx.tyre_smoke(tr, R, brake=1.0, carry=0.75, drag=0.75, life=(3.0, 4.2), seed=3)
    stop_y = tr[-1].pos[1]
    ends = [fx.ballistic(q.p, q.v, q.life, q.drag, q.grav)[1] for q in sm]
    assert max(ends) > stop_y + 1.0, (max(ends), stop_y)


def test_lisible():
    """Les cibles de lecture à la taille d'un téléphone : un panache de gomme de 6 à 8 m au moins derrière les roues
    arrière en glisse, qui monte à hauteur de toit ; un voile d'embruns continu à 67 km/h, long de 4 m au moins et
    haut de 0,6 à 1 m ; une lame de flaque qui monte à hauteur de vitre et dure cinq images au moins. Tout derrière
    la berline ou à côté, jamais devant."""
    V = 18.6
    tr = line_track(V, n=40, slip_deg=22.0)
    def rel(q, age):                                  # (en arrière de la berline, hauteur du haut du sprite)
        p = fx.ballistic(q.p, q.v, age, q.drag, q.grav)
        car_y = V * (q.birth / fx.FPS + age)
        u = min(1.0, age / q.life)
        size = q.size0 + (q.size1 - q.size0) * (1 - (1 - u) ** 2)
        return car_y - p[1], p[2] + 0.5 * size
    sm = fx.tyre_smoke(tr, R)
    late = [q for q in sm if 8 < q.birth < 20]
    assert len(late) > 70, len(late)                                 # dense : ~100 par seconde et par roue
    back = [rel(q, 0.4) for q in late]
    assert max(b for b, _ in back) > 6.0 and min(b for b, _ in back) > 0.0, back[:3]
    assert sorted(h for _, h in back)[len(back) // 2] > 1.3          # le haut du panache à hauteur de toit
    # le nez rentre à gauche (virage à gauche) : la fumée part vers l'extérieur, +x
    assert sum(q.v[0] for q in late) / len(late) > 0.4, sum(q.v[0] for q in late) / len(late)
    # de côté ou de face (veil « haut ») : un voile de 0,6 à 1 m, long de 4 m au moins
    drops, mist = fx.wheel_spray(line_track(V, n=40), None, R, seed=5, veil="haut")
    rear = [q for q in mist if 8 < q.birth < 20]
    per_s = len(rear) / (12 / fx.FPS)
    assert per_s > 4 * 30, per_s                                     # continu : > 30 sprites/s par roue
    trail = [rel(q, 0.4 * q.life)[0] for q in rear]
    assert max(trail) > 4.0 and min(trail) > -0.5, (min(trail), max(trail))
    tops = sorted(rel(q, 0.3 * q.life)[1] for q in rear)
    assert 0.6 < tops[len(tops) // 2] < 1.2, tops[len(tops) // 2]
    # de dos (veil « bas », le découpage v3) : sous le pare-chocs, en V vers l'extérieur, retombé avant la caméra
    # (5 à 8 m derrière)
    drops, mist = fx.wheel_spray(line_track(V, n=40), None, R, seed=5)
    rear = [q for q in mist if 8 < q.birth < 20]
    tops = sorted(rel(q, 0.3 * q.life)[1] for q in rear)
    assert tops[len(tops) // 2] < 0.55 and tops[int(len(tops) * 0.9)] < 0.7, tops[len(tops) // 2]
    ends = sorted(rel(q, q.life)[0] for q in rear)                  # à sa fin le sprite est éteint
    assert ends[int(len(ends) * 0.9)] < 7.5, ends[int(len(ends) * 0.9)]
    outward = [q.v[0] * (1 if q.p[0] > 0 else -1) for q in drops]
    assert sum(1 for o in outward if o > 0) > 0.9 * len(outward)
    assert max(fx.ballistic(q.p, q.v, t / 48, q.drag)[2] for q in drops[::7] for t in range(int(q.life * 48))) < 0.5
    # retombées (ou éteintes) avant l'objectif, 7,5 m derrière le milieu de la caisse et 1,4 m plus haut
    ends = sorted(rel(q, q.life)[0] for q in drops if 8 < q.birth < 20)
    assert ends[int(len(ends) * 0.95)] < 7.0 and ends[-1] < 8.0, (ends[int(len(ends) * 0.95)], ends[-1])
    trs = line_track(V, n=40)
    cr = fx.puddle_crossings(trs, [(0.77, 15.0, 0.75, 1.3, 0.0)])
    _, sheet = fx.puddle_splash(trs, cr[0], R, seed=4, veil="haut")
    peak = [max(fx.ballistic(q.p, q.v, t / 48, q.drag, q.grav)[2] for t in range(int(q.life * 48))) for q in sheet]
    assert 0.8 < sorted(peak)[len(peak) // 2] < 1.4, sorted(peak)[len(peak) // 2]
    assert min(q.life for q in sheet) * fx.FPS >= 7                # lisible cinq à six images (fondu compris)
    for q in sheet:
        b, _ = rel(q, q.life * 0.5)
        assert b > -0.8, b                                          # jamais devant la berline
    # de dos à 100 km/h : la gerbe retombe 3 à 5 m derrière les roues, pas plus loin qu'à 70
    e9 = {}
    for spd in (19.4, 27.8):
        dd, mm = fx.wheel_spray(line_track(spd, n=40), None, R, seed=5)
        for i, L in enumerate((dd, mm)):
            e = sorted(spd * (q.birth / fx.FPS + q.life) - fx.ballistic(q.p, q.v, q.life, q.drag, q.grav)[1] - 1.4
                       for q in L if 8 < q.birth < 20 and q.p[1] < spd * q.birth / fx.FPS)
            assert 3.0 < e[len(e) // 2] < 5.0 and e[int(len(e) * 0.9)] < 5.8, (spd, e[len(e) // 2], e[int(len(e) * 0.9)])
            e9.setdefault(i, []).append(e[int(len(e) * 0.9)])
    assert all(abs(a - b) < 0.4 for a, b in e9.values()), e9
    # de dos : la lame de flaque 20 à 30 cm au-dessus de la traînée, le haut sous le bas du coffre (0,8 m)
    _, sheet = fx.puddle_splash(trs, cr[0], R, seed=4)
    peak = sorted(max(rel(q, t / 48)[1] for t in range(int(q.life * 48))) for q in sheet)
    trail = sorted(rel(q, 0.4 * q.life)[1] for q in rear)
    lift = peak[len(peak) // 2] - trail[len(trail) // 2]
    assert 0.15 < lift < 0.4 and peak[int(len(peak) * 0.9)] < 0.8, (lift, peak[int(len(peak) * 0.9)])


def test_debris():
    frames = range(0, 60)
    k = fx.debris_keys((1.5, 10.0, 0.0), frames, 20.0, 1.2, (0.0, 25.0, 0.0), seed=3)
    assert k[5][:3] == (1.5, 10.0, 0.0) and k[5] == k[15]
    zs = [k[f][2] for f in frames]
    assert max(zs) > 0.4, max(zs)
    assert abs(zs[-1]) < 1e-6                                   # il se repose
    assert k[59][1] > 10.0                                      # emporté dans le sens de la voiture
    far = fx.debris_keys((6.0, 10.0, 0.0), frames, 20.0, 6.0, (0.0, 25.0, 0.0))
    assert all(far[f][2] == 0.0 for f in frames)                # trop loin : il ne bouge pas


def test_topple():
    frames = range(0, 60)
    top = fx.topple_keys(frames, 20.0, 0.9)
    assert top[10] == (0.0, 0.0) and abs(top[59][0] - math.pi / 2) < 0.02 and top[59][1] > 0
    assert all(top[f][0] <= math.pi / 2 + 1e-9 for f in frames)
    wob = fx.topple_keys(frames, 20.0, 0.3)
    assert max(abs(wob[f][0]) for f in frames) < math.radians(10) and abs(wob[59][0]) < math.radians(1)


def test_sway():
    assert fx.sway(0.0, 1.0, 5.0) == 0.0
    a = [abs(fx.sway(1.0 + i / 24, 1.0, 5.0)) for i in range(0, 120)]
    assert max(a) <= 6.0 and max(a[:24]) > 2.0 and max(a[-24:]) < max(a[:24])


def test_downwash():
    low = fx.downwash({f: (0.0, 0.0, 12.0) for f in range(30)}, 0.0, set(range(30)))
    assert low and not fx.downwash({f: (0.0, 0.0, 80.0) for f in range(30)}, 0.0, set(range(30)))
    for q in low:
        assert 0.9 < math.hypot(q.p[0], q.p[1]) < 5.1 and (q.p[0] * q.v[0] + q.p[1] * q.v[1]) > 0   # vers l'extérieur


def test_sparks():
    sp = fx.sparks(line_track(33.0), 10, R)
    assert len(sp) >= 260 and all(q.life <= 0.5 + 1e-6 for q in sp)
    assert all(10 <= q.birth <= 13 + 0.5 * fx.FPS for q in sp) and sum(q.birth <= 13 for q in sp) >= 260
    assert all(fx.ballistic(q.p, q.v, q.life, q.drag)[2] > -0.03 for q in sp)


def test_choc():
    """La gerbe d'un contact se voit (SPEC §18.73) : des points d'un centimètre au moins, au point de contact, du
    côté de la patrouille, courts ; leur lueur est nulle avant et après, à son plus fort dans les trois premières
    images, et reste dans le nuage."""
    tr = line_track(17.0)
    touche = (20.0, 25.0)
    sp = fx.choc_sparks(tr, R, (0.4, 1.0), touche, h=0.55)
    assert 200 <= len(sp) <= 900, len(sp)
    assert min(q.size0 for q in sp) >= 0.007 and max(q.size0 for q in sp) <= 0.03          # 1 à 3 cm de rayon
    assert all(q.birth >= touche[0] for q in sp) and max(q.life for q in sp) <= 0.76
    nes = [q for q in sp if q.p[2] > 0.3]                                                  # (hors rebonds)
    assert nes and all(q.birth <= touche[1] + 1e-6 for q in nes)
    pos = fx.pose_at(tr, 20.0)[0]
    assert all(0.6 < fx._dot(fx._sub(q.p, pos), (-fx.pose_at(tr, q.birth)[1][1], fx.pose_at(tr, q.birth)[1][0], 0.0)) < 1.4
               for q in nes if abs(q.birth - 20.0) < 0.05), "au point de contact, à gauche"
    assert sum(q.birth <= touche[0] + 2.0 for q in nes) >= fx.CHOC["n"]                    # la gerbe de l'impact
    assert fx.choc_sparks(tr, R, (0.4, 1.0), touche)[0].p == sp[0].p                       # tirage reproductible
    rows = fx.choc_lueur(sp)
    ks = [k for _, _, k in rows]
    assert ks[0] == 0.0 and ks[-1] == 0.0 and abs(max(ks) - 1.0) < 1e-9
    top = rows[ks.index(max(ks))][0]
    assert touche[0] <= top <= touche[0] + 3.0, top
    assert rows[0][0] < touche[0] and rows[-1][0] - touche[0] <= 0.76 * fx.FPS + 9.0 + 2.0
    for f, c, k in rows:
        if k > 0.05:                               # la lampe reste dans la gerbe : derrière le contact, près du sol
            pp = fx.pose_at(tr, f)[0]
            assert fx._len(fx._sub(c, pp)) < 6.0 and -0.05 < c[2] < 1.2, (f, c)
    assert fx.choc_lueur([]) == []


def test_drips():
    d = fx.drips([(0, 0, 0.3), (1, 0, 0.3)], (10, 40), 0.0)
    assert len(d) >= 4 and all(10 <= q.birth < 40 for q in d)
    assert all(abs(fx.ballistic(q.p, q.v, q.life, q.drag)[2]) < 0.01 for q in d)


def test_particle_at():
    q = fx.Particle(10, (0, 0, 1), (0, 0, 0), 0.5, 1.0)
    assert q.at(9) is None and q.at(10)[1] == 0.0 and q.at(10 + 0.5 * fx.FPS + 1) is None


def test_drift_spray():
    """L'eau du dérapage : rien sans glisse ; en glisse, la lame chassée du côté où glisse le pneu arrière, sous
    1,2 m, retombée en 0,7 s ; la brume plus lente, 1,6 m au plus, éteinte en 0,9 s ; jamais sous le sol."""
    none = fx.drift_spray(line_track(20.0, n=30), R, seed=3)
    assert not none[0] and not none[1]
    tr = line_track(20.0, n=30, slip_deg=20.0)
    d, m = fx.drift_spray(tr, R, seed=3)
    assert len(d) > 300 and len(m) > 10, (len(d), len(m))
    # la caisse tournée à gauche de sa vitesse (+y) : les pneus arrière glissent vers +x (sa droite)
    p = tr[10]
    slide = 1.0 if fx._dot((0.0, 20.0, 0.0), p.right) >= 0 else -1.0
    assert sum(1 for q in d if (q.v[0] * p.right[0] + q.v[1] * p.right[1]) * slide > 0) > 0.95 * len(d)
    for q in d[::5]:
        top = max(fx.ballistic(q.p, q.v, t / 96, q.drag)[2] for t in range(int(q.life * 96) + 1))
        assert top < 1.2 and q.life <= 0.7 + 1e-9 and fx.ballistic(q.p, q.v, q.life, q.drag)[2] > -0.02, (top, q.life)
    assert all(q.size1 <= 1.6 + 1e-9 and q.life <= 0.9 + 1e-9 for q in m)
    assert all(fx.ballistic(q.p, q.v, q.life, q.drag, q.grav)[2] > -0.02 for q in m)
    # à 40 km/h (le port) : éteinte avant le bras commun, à 7,5 m derrière le centre (la caméra ne la traverse pas)
    tr = line_track(11.0, n=40, slip_deg=25.0)
    d, m = fx.drift_spray(tr, R, seed=3)
    for L, med, p90 in ((d, 5.0, 6.0), (m, 7.0, 8.5)):
        b = sorted(11.0 * (q.birth / fx.FPS + q.life) - fx.ballistic(q.p, q.v, q.life, q.drag, q.grav)[1]
                   for q in L if 8 < q.birth < 30)
        assert b[len(b) // 2] < med and b[int(len(b) * 0.9)] < p90, (b[len(b) // 2], b[int(len(b) * 0.9)])


def test_drift_continuity():
    """Les gouttes nées avant une coupe vivent après : deux tronçons du parcours (P5 et P6) qui se suivent tirent les
    mêmes, au même endroit de la ville."""
    import parcours as PC
    out = {}
    for shot in ("P5", "P6"):
        h = PC.hero(shot)
        g0 = PC.START[shot] - 1
        lo = 486 - 30 - g0
        offs = {n: (a, b, R) for n, a, b in WHEELS}
        tr = fx.drive_track(h["pos"], h["heading"], range(lo - 1, 486 - g0 + 2), offs)
        d, m = fx.drift_spray(tr, R, g0=g0, seed=7, frames=(lo, 486 - g0))
        to_v = PC.vers_ville(shot)[0]
        out[shot] = sorted((round(q.birth + g0, 4), tuple(round(c, 3) for c in to_v(*q.p[:2]))) for q in d + m
                           if q.birth + g0 < 485.0)
    a, b = out["P5"], out["P6"]
    assert len(a) > 100 and len(a) == len(b), (len(a), len(b))
    assert all(x[0] == y[0] and math.dist(x[1], y[1]) < 2e-3 for x, y in zip(a, b))


def test_eau_continuity():
    """L'eau des roues est la même d'un tronçon à l'autre (brouillon éclairé v8 : chaque tronçon avait la sienne,
    tirée depuis sa première image) : à chaque jonction du parcours (FIN6 comprise), les deux tronçons tirent les mêmes gouttes et
    les mêmes lambeaux, au même endroit de la ville, sur les EAU_PREROLL images d'avant la coupe ; et un seul réglage
    (fx.EAU) pour tous."""
    import parcours as PC
    plans = ["OUV", "P1", "P2", "P3", "P4", "P5", "P6", "FIN6"]
    e = fx.EAU
    offs = {n: (a, b, R) for n, a, b in WHEELS}
    for p0, p1 in zip(plans, plans[1:]):
        cut = PC.START[p1]
        out = {}
        for shot in (p0, p1):
            h = PC.hero(shot)
            g0 = PC.START[shot] - 1
            lo = cut - fx.EAU_PREROLL - g0
            tr = fx.drive_track(h["pos"], h["heading"], range(lo - 1, cut - g0 + 2), offs)
            d, m = fx.wheel_spray(tr, None, R, rate_drops=2400.0 * e["drops"], rate_mist=190.0 * e["mist"],
                                  wet=e["wet"], seed=1, frames=(lo, cut - g0), mist_alpha=e["mist_alpha"], g0=g0)
            to_v = PC.vers_ville(shot)[0]
            out[shot] = sorted((round(q.birth + g0, 4), tuple(round(c, 3) for c in to_v(*q.p[:2])), round(q.life, 6))
                               for q in d + m if cut - 12 <= q.birth + g0 < cut - 1)
        a, b = out[p0], out[p1]
        assert len(a) > 100 and len(a) == len(b), (p0, p1, len(a), len(b))
        assert all(x[0] == y[0] and x[2] == y[2] and math.dist(x[1], y[1]) < 2e-3 for x, y in zip(a, b)), (p0, p1)


def test_spray_sim():
    """L'eau simulée des pneus (SPEC §18.60), contre les valeurs d'une route mouillée : à 90 km/h, la brume reste sous
    1 m (sous 0,6 m pour l'essentiel) et traîne 3 à 8 m derrière le pare-chocs, vit 0,3 à 0,6 s ; les gouttes
    retombent au sol, sous 1 m pour l'essentiel ; rien sous le sol ; en glisse, le rideau part du côté où glissent
    les pneus arrière ; plus de débit à plus de vitesse, rien sur le sec ni à l'arrêt."""
    V = 25.0
    tr = line_track(V, n=60)
    st = {}
    d, m = fx.spray_sim(tr, R, frames=(5, 40), wet=0.8, stats=st)
    assert len(d) > 200 and len(m) > 400 and st["brisees"] > 50, st

    def rel(q, u):
        p = fx.path_at(q.path, u)
        return V * (q.birth / fx.FPS + u * q.life) - p[1] - 2.45, p[2]

    def pct(a, x):
        a = sorted(a)
        return a[int(x * (len(a) - 1))]
    hm = [max(rel(q, i / 20)[1] for i in range(21)) for q in m]
    hd = [max(rel(q, i / 20)[1] for i in range(21)) for q in d]
    assert pct(hm, 0.9) < 0.6 and max(hm) < 1.2, (pct(hm, 0.9), max(hm))
    assert pct(hd, 0.9) < 1.0, pct(hd, 0.9)
    back = [rel(q, 1.0)[0] for q in m]
    assert 3.0 < pct(back, 0.5) < 8.0 and pct(back, 0.1) > 1.0, (pct(back, 0.1), pct(back, 0.5))
    assert all(0.0 < q.life <= 0.75 for q in m) and 0.3 < pct([q.life for q in m], 0.5) < 0.6   # (brisée : sa vie de brume part du choc)
    assert all(min(fx.path_at(q.path, i / 20)[2] for i in range(21)) > -0.01 for q in d + m)
    assert all(math.dist(fx.path_at(q.path, 0.0), q.path[0]) + math.dist(fx.path_at(q.path, 1.0), q.path[-1]) < 1e-9 for q in d[:20])
    # la brume fine suit l'air : à la moitié de sa vie, elle va presque à la vitesse du sillage (pas balistique)
    slow = fx.spray_sim(line_track(8.0, n=60), R, frames=(5, 40), wet=0.8)
    assert len(slow[0]) + len(slow[1]) < 0.45 * (len(d) + len(m))
    assert fx.spray_sim(line_track(25.0, n=60), R, frames=(5, 40), wet=0.0) == ([], [])
    # la glisse : un rideau du côté où glissent les pneus arrière (la caisse tournée à gauche : vers +x)
    tr = line_track(11.0, n=60, slip_deg=25.0)
    dd, mm = fx.spray_sim(tr, R, frames=(5, 40), roll=0.0, drift=1.0)
    assert len(dd) > 100 and len(mm) > 50
    out = [q.path[-1][0] - q.path[0][0] for q in dd]
    assert sum(1 for o in out if o > 0) > 0.9 * len(out)
    assert pct([max(fx.path_at(q.path, i / 20)[2] for i in range(21)) for q in dd], 0.9) < 1.0
    assert fx.spray_sim(line_track(11.0, n=60), R, frames=(5, 40), roll=0.0, drift=1.0) == ([], [])
    # la traînée d'une goutte : une fine (0,2 mm) rejoint l'air en quelques centièmes de seconde, une grosse (2 mm)
    # garde sa lancée dix fois plus longtemps
    assert fx.drag_rate(0.2e-3, 10.0) > max(30.0, 10.0 * fx.drag_rate(2.0e-3, 10.0))


def test_spray_sim_continuity():
    """La gerbe simulée passe les coupes : deux tronçons qui se suivent tirent et intègrent les mêmes paquets, au
    même endroit de la ville, sur toute leur vie (la conduite lue EAU_AFTER images après la fin de la scène)."""
    import parcours as PC
    offs = {n: (a, b, R) for n, a, b in WHEELS}
    for p0, p1, kw in (("P4", "P5", dict(roll=1.0)), ("P5", "P6", dict(roll=1.0)),
                       ("P5", "P6", dict(roll=0.0, drift=1.1))):
        cut = PC.START[p1]
        out = {}
        for shot in (p0, p1):
            h = PC.hero(shot)
            g0 = PC.START[shot] - 1
            if shot == p0:
                lo, hi = cut - 14 - g0, cut - g0
            else:
                lo, hi = 1 - fx.EAU_PREROLL, cut - g0
            tr = fx.drive_track(h["pos"], h["heading"], range(lo - 1, hi + 2 + fx.EAU_AFTER), offs)
            d, m = fx.spray_sim(tr, R, g0=g0, frames=(lo, hi), wet=0.8, **kw)
            to_v = PC.vers_ville(shot)[0]
            out[shot] = sorted((round(q.birth + g0, 4), round(q.life, 4),
                                tuple(tuple(round(c, 2) for c in to_v(*p[:2])) for p in q.path))
                               for q in d + m if cut - 12 <= q.birth + g0 < cut - 1)
        a, b = out[p0], out[p1]
        assert len(a) > 30 and len(a) == len(b), (p0, p1, kw, len(a), len(b))
        bad = [(x, y) for x, y in zip(a, b) if x[0] != y[0] or abs(x[1] - y[1]) > 2e-3
               or any(math.dist(u, v) > 0.03 for u, v in zip(x[2], y[2]))]
        assert not bad, (p0, p1, kw, len(bad), bad[:1])


def test_switch():
    os.environ.pop("FILM3D_FX", None)
    assert not fx.enabled() and fx.dress("P3") is None          # inactif par défaut
    os.environ["FILM3D_FX"] = "0"
    assert not fx.enabled() and fx.dress("P3") is None
    os.environ["FILM3D_FX"] = "1"
    os.environ["FILM3D_FX_ONLY"] = "eau"
    assert fx.enabled("eau") and not fx.enabled("gomme")
    del os.environ["FILM3D_FX_ONLY"]
    assert fx.enabled("gomme")
    # par plan : ceux dont la bande est validée
    os.environ["FILM3D_FX"] = "P2,P3,P5,P6"
    assert fx.enabled("derapage", plan="P5") and fx.enabled(plan="p2") and not fx.enabled(plan="P4")
    assert not fx.enabled("eau") or fx._PLAN[0] in ("P2", "P3", "P5", "P6")
    del os.environ["FILM3D_FX"]


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            n += 1
    print(f"test_fx : {n} contrôles passés")
