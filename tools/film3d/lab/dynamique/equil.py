import sys, math
import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import dynamique as D


def resid(R, beta_deg, V, delta, kap, c=D.CAR):
    car = D.Car(c)
    b = math.radians(-beta_deg)        # left drift: slip positive => beta (velocity angle) negative
    car.u, car.v = V * math.cos(b), V * math.sin(b)
    car.r = V / R
    car.w = car.u * (1 + kap) / c["R"]
    # steady loads: iterate ax, ay
    for _ in range(30):
        Fx, Fy, Mz, Fxr, det = car.forces(delta, 0, 0, 0)
        ax, ay = Fx / c["m"], Fy / c["m"]
        car.ax, car.ay = ax, ay
        # steady roll / pitch
        car.phi = c["ms"] * c["h_roll"] * ay / (c["K_roll"] - c["ms"] * G * c["h_roll"])
        car.th = c["ms"] * c["h_pitch"] * ax / c["K_pitch"]
    # inertial accel needed in body frame for steady circle: a = (-v r, u r)
    need_x, need_y = -car.v * car.r, car.u * car.r
    return (Fx / c["m"] - need_x, Fy / c["m"] - need_y, Mz / 1000.0), det


G = 9.81


def solve(R, beta, V0=12.0):
    x = [V0, math.radians(-20.0), 0.1]
    for it in range(60):
        f0, det = resid(R, beta, *x)
        J = []
        for j in range(3):
            xx = list(x)
            h = [1e-3, 1e-4, 1e-4][j]
            xx[j] += h
            f1, _ = resid(R, beta, *xx)
            J.append([(a - b) / h for a, b in zip(f1, f0)])
        # J columns -> transpose
        A = [[J[j][i] for j in range(3)] for i in range(3)]
        import motion as M
        dx = M._solve(A, [-v for v in f0])
        lam = 1.0
        x = [a + lam * b for a, b in zip(x, dx)]
        if max(map(abs, f0)) < 1e-6:
            break
    return x, f0, det


for R, beta in ((30, 20), (30, 25), (30, 30), (30, 35), (22, 30), (22, 36), (22, 38)):
    (V, d, k), f, det = solve(R, beta)
    print(f"R {R} beta {beta}: V {V:.2f} m/s ({V*3.6:.1f} km/h) steer {math.degrees(d):.1f} kap {k:.3f} "
          f"a_f {math.degrees(det['a_f']):.1f} a_r {math.degrees(det['a_r']):.1f} Fxr {det['Fxr']:.0f} res {max(map(abs,f)):.1e} "
          f"alat {V*V/R:.2f}")
