"""Réglage d'un dérapage : évalue une configuration (dict) sur des critères physiques et de décor."""
import sys, json, math, random, time
import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import parcours as P, dynamique as D
import clear

PLAN = D.Plan(P.ROUTE, P._s_plan, P.PLAN.speed, P.PLAN.along, P.S_ARRET)
CFG = {
    "P2": dict(tgt=153, peak=30.0, side=1.0, span=(-2.0, 14.0), win=(118, 214), joint=318,
               base=dict(side=1.0, peak=30.0, flick=2.0, flick_t=0.4, sag=1.5)),
    "P5": dict(tgt=453, peak=37.0, side=-1.0, span=(-2.0, 25.0), win=(420, 500), joint=560,
               base=dict(side=-1.0, peak=37.0, flick=2.0, flick_t=0.4, sag=2.0)),
}
RANGES = dict(t_init=(-1.1, -0.5), hold=(0.7, 1.3), brake_in=(0.0, 0.7), thr=(0.3, 1.0), acc=(50, 200),
              rate_on=(40, 95), rate_off=(30, 70), lead=(0.15, 0.45), k_vd=(0.0, 0.6), dv=(-0.5, 2.0),
              inside=(0.0, 2.5), gas0=(0.1, 0.6), flick=(0.0, 6.0), flick_t=(0.25, 0.6), settle=(0.3, 1.2),
              inside_t=(0.5, 1.5), wn_drift=(1.2, 3.0), fb_drift=(15.0, 60.0))


def make(which, x):
    c = CFG[which]
    ev = dict(c["base"])
    ev.update({k: v for k, v in x.items() if k not in ("t_init", "hold")})
    ev["t_init"] = c["tgt"] / 24 + x["t_init"]
    ev["t_catch"] = c["tgt"] / 24 + x["hold"]
    return ev


def measure(which, dr):
    c = CFG[which]
    a, b = c["win"]
    fs = [k / 4 for k in range(a * 4, b * 4)]
    sl = [c["side"] * dr.slip(f / 24) for f in fs]
    pk = max(sl)
    fpk = fs[sl.index(pk)]
    hold = sum(1 for v in sl if v > 0.8 * c["peak"]) / 96.0
    neg = max(0.0, -min(sl))
    out = dict(pk=round(pk, 1), fpk=fpk, hold=round(hold, 2), neg=round(neg, 1))
    pre = [abs(dr.lat_err(f / 24)) for f in range(a - 30, a)]
    post = [abs(dr.lat_err(f / 24)) for f in range(b + 10, c["joint"])]
    out["e_pre"], out["e_post"] = round(max(pre), 2), round(max(post), 2)
    out["e_max"] = round(max(abs(dr.lat_err(f / 24)) for f in fs), 2)
    tj = c["joint"] / 24
    out["s_joint"] = round(PLAN.s_ref(tj) - dr.s(tj), 2)
    out["s_end"] = round(PLAN.s_ref(b / 24) - dr.s(b / 24), 2)
    rr = [abs(dr.yaw_rate(f / 24)) for f in fs]
    out["r_max"] = round(max(rr), 1)
    if which == "P2":
        (ww, fw), (wb, fb) = clear.p2_clear(dr)
        out["ww"], out["wb"] = round(ww, 2), round(wb, 2)
    return out


def cost(which, m):
    c = CFG[which]
    J = (3.0 * max(0.0, abs(m["pk"] - c["peak"]) - 1.5) ** 2 + 2.0 * (m["fpk"] - c["tgt"]) ** 2
         + 30.0 * max(0.0, 0.9 - m["hold"]) ** 2 + 30.0 * max(0.0, m["hold"] - 1.4) ** 2
         + 2.0 * max(0.0, m["neg"] - 4.0) ** 2 + 0.3 * m["s_joint"] ** 2 + 0.1 * m["s_end"] ** 2
         + 20.0 * max(0.0, m["e_post"] - 0.5) ** 2 + 20.0 * max(0.0, m["e_pre"] - 0.5) ** 2)
    if which == "P2":
        J += 100.0 * max(0.0, 0.7 - m["ww"]) ** 2 + 100.0 * max(0.0, 0.2 - m["wb"]) ** 2
    else:
        J += 2.0 * max(0.0, m["e_max"] - 2.0) ** 2
    if m["pk"] > 60:
        J += 1e4
    return J


def run(which, x, prior=(), car=None, driver=None, plan=None):
    ev = make(which, x)
    dr = D.simulate(plan or PLAN, list(prior) + [ev], t_span=CFG[which]["span"], car=car, driver=driver)
    m = measure(which, dr)
    return cost(which, m), m, dr


def search(which, n=60, refine=60, seed=1, prior=(), start=None, fixed=None, car=None, driver=None, plan=None):
    random.seed(seed)
    fixed = fixed or {}
    rng = {k: r for k, r in RANGES.items() if k not in fixed}
    best = None
    t0 = time.time()
    cands = ([dict(start)] if start else []) + [None] * n
    for i, x in enumerate(cands):
        x = x or {k: random.uniform(*r) for k, r in rng.items()}
        x.update(fixed)
        J, m, _ = run(which, x, prior, car, driver, plan)
        if best is None or J < best[0]:
            best = (J, x, m)
            print(i, round(J, 1), m, flush=True)
    J0, x0, m0 = best
    step = 0.2
    for it in range(refine):
        x = dict(x0)
        for k, (a, b) in rng.items():
            if random.random() < 0.4:
                x[k] = min(b, max(a, x[k] + random.gauss(0, step * (b - a))))
        J, m, _ = run(which, x, prior, car, driver, plan)
        if J < J0:
            J0, x0, m0 = J, x, m
            print("ref", it, round(J, 1), m, flush=True)
        if it % 20 == 19:
            step *= 0.6
    print("BEST", json.dumps({k: round(v, 4) for k, v in x0.items()}), m0, round(time.time() - t0), "s", flush=True)
    return x0, m0


if __name__ == "__main__":
    which = sys.argv[1]
    mode = sys.argv[2]
    if mode == "show":
        x = json.loads(sys.argv[3])
        drv = json.loads(sys.argv[4]) if len(sys.argv) > 4 else None
        J, m, dr = run(which, x, driver=drv)
        print(round(J, 1), m)
        a, b = CFG[which]["win"]
        for f in range(a, b, 4):
            t = f / 24
            print(f, "slip %5.1f goal %5.1f e %5.2f v %4.1f steer %5.1f thr %.2f brk %.2f r %4.0f spin %.2f roll %4.1f"
                  % (dr.slip(t), dr._at("slip_goal", t), dr.lat_err(t), dr.speed(t), dr.steer(t), dr.throttle(t),
                     dr.brake(t), dr.yaw_rate(t), dr.wheelspin(t), dr.roll(t)))
    else:
        start = json.loads(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != "-" else None
        fixed = json.loads(sys.argv[4]) if len(sys.argv) > 4 else None
        drv = json.loads(sys.argv[5]) if len(sys.argv) > 5 else None
        search(which, n=int(sys.argv[6]) if len(sys.argv) > 6 else 40, refine=int(sys.argv[7]) if len(sys.argv) > 7 else 60,
               start=start, fixed=fixed, driver=drv)
