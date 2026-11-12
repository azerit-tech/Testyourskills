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
    slow, _ = fx.wheel_spray(line_track(8.0), None, R, seed=2)
    fast, mist = fx.wheel_spray(line_track(30.0), None, R, seed=2)
    drift, mist_d = fx.wheel_spray(line_track(30.0, slip_deg=20.0), None, R, seed=2)
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


def test_drips():
    d = fx.drips([(0, 0, 0.3), (1, 0, 0.3)], (10, 40), 0.0)
    assert len(d) >= 4 and all(10 <= q.birth < 40 for q in d)
    assert all(abs(fx.ballistic(q.p, q.v, q.life, q.drag)[2]) < 0.01 for q in d)


def test_particle_at():
    q = fx.Particle(10, (0, 0, 1), (0, 0, 0), 0.5, 1.0)
    assert q.at(9) is None and q.at(10)[1] == 0.0 and q.at(10 + 0.5 * fx.FPS + 1) is None


def test_switch():
    os.environ["FILM3D_FX"] = "0"
    assert not fx.enabled() and fx.dress("P3") is None
    os.environ["FILM3D_FX"] = "1"
    os.environ["FILM3D_FX_ONLY"] = "eau"
    assert fx.enabled("eau") and not fx.enabled("gomme")
    del os.environ["FILM3D_FX_ONLY"]
    assert fx.enabled("gomme")


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            n += 1
    print(f"test_fx : {n} contrôles passés")
