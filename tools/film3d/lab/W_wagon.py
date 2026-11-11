# Essai des voitures garées : la fourgonnette de bibliothèque, teintée, contre le trottoir du banc.
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench  # noqa: E402

S = bench.S
bench.setup(frontage=True)
hidden = bench.hidden_collection()
src = S.parked_wagon_source(hidden)
for k, (x, y, rz, tint) in enumerate([(-S.ROAD_HALF + 1.15, 12.0, math.pi, "#5a2633"),
                                      (-S.ROAD_HALF + 1.15, 19.5, math.pi, "#2b4756")]):
    inst = S.instance(src, f"parked_{k}", (x, y, 0.0), rz)
    inst.color = (*S.lin(tint)[:3], 1)
print("[W] dims", tuple(round(v, 2) for v in src.dimensions), flush=True)
bench.render("W-wagon", which=("large",))
