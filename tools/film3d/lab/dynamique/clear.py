"""Le jeu de la berline simulée contre les bordures et l'îlot du rond-point (P2), comme test_motion.test_p2 :
python3 lab/dynamique/clear.py."""
import sys, math
import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import parcours as PC
import p2_arc as P

TO, CAP = PC.placer("P2")
X110 = TO(*PC._to_route("P3")(0.0, 110.0))[0]


def p2_clear(dr):
    """(roues, caisse) : le jeu au plus serré (m) de la berline simulée contre bordures et îlot, comme test_p2."""
    kerbs = (P.SW_KERB, P.NW_KERB)
    ww, wb = (9.0, 0), (9.0, 0)
    for f4 in range(4 * (108 - 24), 4 * (215 + 40)):
        t = f4 / 4 / 24
        hx, hy = TO(*dr.pos(t))
        if hx < X110:
            break
        hd = dr.heading(t) - CAP
        h = math.radians(hd)
        fx, fy = -math.sin(h), math.cos(h)
        for a, b in ((1.38, 0.76), (1.38, -0.76), (-1.39, 0.76), (-1.39, -0.76)):
            wx, wy = hx + fx * a + fy * b, hy + fy * a - fx * b
            patch = P._corners(wx, wy, hd, 0.33, 0.12)
            g = min(min(P._poly_line_gap(patch, k) for k in kerbs), min(math.hypot(*q) for q in patch) - 6.0)
            ww = min(ww, (g, f4 / 4))
        body = P._corners(hx, hy, hd, P.HALF_L, P.HALF_W)
        wb = min(wb, (min(P._poly_line_gap(body, k) for k in kerbs), f4 / 4))
    return ww, wb


if __name__ == "__main__":
    (gw, fw), (gb, fb) = p2_clear(PC.DRIVE)
    print("jeu des roues %.2f m (image %.0f), de la caisse %.2f m (image %.0f)" % (gw, fw, gb, fb))
