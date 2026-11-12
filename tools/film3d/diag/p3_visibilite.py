# Diagnostic jetable, sans Blender : le barrage (agents, patrouilles) se lit-il à côté ou au-dessus de la berline,
# selon le décalage latéral de la caméra ?  python3 tools/film3d/diag/p3_visibilite.py -0.3 -0.8
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import motion as M  # noqa: E402
import p3_enseignes as P  # noqa: E402

for side in [float(a) for a in sys.argv[1:]] or [P.CAM_SIDE]:
    P.CAM_SIDE = side
    print("CAM_SIDE", side)
    for f in (1, 6, 10, 14, 17, 20, 22, 24, 28):
        t = M.t_of(f)
        c = P.camera(t)
        (u0, u1, v0, v1), (uc, vc) = P.hero_frame(t, c)

        def vis(p):
            return "VU" if p and abs(p[0]) < 1 and (p[0] < u0 or p[0] > u1 or p[1] > v1) else "--"
        a1, a0 = P.project(c, (-1.9, 126.4, 1.55)), P.project(c, (1.95, 126.4, 1.55))
        pb, pa = P.project(c, (-3.4, 125.5, 1.0)), P.project(c, (3.4, 125.5, 1.0))
        print(f"  {f:2d} berline u {u0:+.2f}..{u1:+.2f} (centre {uc:+.2f}) haut {v1:.2f} | agent1 {a1[0]:+.2f} {a1[1]:.2f} "
              f"{vis(a1)} | agent0 {a0[0]:+.2f} {a0[1]:.2f} {vis(a0)} | patB {vis(pb)} patA {vis(pa)} | cam x {c[0]:.2f} "
              f"z {c[2]:.2f}")
