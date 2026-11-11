# Essai de facade_b.upper() sur le banc : trois dessins côte à côte (deco, hotel, flats), un
# rez-de-chaussée bouchon (piliers et vitrines lumineuses), les accessoires et les lumières
# posés comme le ferait place() de scene_a.
#
#   lockf -k <scratchpad>/blender.lock nice -n 19 taskpolicy -b \
#     /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/lab/B_upper_test.py
import os
import sys
import time

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench  # noqa: E402

S = bench.S
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import facade_b  # noqa: E402

LINEUP = [("deco", 13.0, "#f2c6cf"), ("hotel", 39.5, "#bfe3d6"), ("flats", 62.0, "#f4e6b8")]


def stub_ground(M, key, spec, gf_h):
    """Un rez-de-chaussée bouchon : piliers en enduit, vitrines lumineuses en retrait, bandeau."""
    B = S.Boxes(f"stub_{key}")
    W = spec["W"]
    glow = S.mat_emit("stub_shop", S.lin("#ffd29a"), 0.7)
    n = max(2, int(W / 4.5))
    cw = W / n
    for k in range(n):
        y0, y1 = k * cw, (k + 1) * cw
        B.add(-0.3, 0, y0, y0 + 0.5, 0, gf_h, M["stucco_nb"])
        B.add(-0.3, 0, y0, y1, 3.4, gf_h, M["stucco_nb"])
        B.add(-0.35, -0.3, y0 + 0.5, y1, 0, 3.4, M["inside"], front_mat=glow)
    B.add(-0.3, 0, W - 0.5, W, 0, gf_h, M["stucco_nb"])
    B.add(-spec["D"], -0.35, 0, W, 0, gf_h, M["inside"])
    return B.done()


def main():
    bench.setup()
    for o in [o for o in bpy.data.objects if o.name.startswith("nb_far")]:
        bpy.data.objects.remove(o)
    hidden = bench.hidden_collection()
    M = facade_b.mats(S)
    specs = S.building_specs()
    ac_src = [S.source([o], f"ac_src_{i}", hidden) for i, o in enumerate(S.import_glb("exterior_aircon_unit/exterior_aircon_unit.gltf"))]
    tank_src = S.source(S.import_glb("water-tank.glb"), "tank_src", hidden)
    X = bench.LOT["x"]
    for key, y0, tint in LINEUP:
        spec = specs[key]
        gf_h = spec.get("gf_h", 4.2)
        t0 = time.time()
        objs, props, lights = facade_b.upper(S, key, M, spec, gf_h)
        print(f"[B_upper] {key} : {len(objs)} objets, {len(props)} accessoires, {len(lights)} lumières, {time.time() - t0:.1f} s", flush=True)
        objs.append(stub_ground(M, key, spec, gf_h))
        col = (*S.lin(tint)[:3], 1.0)
        for o in objs:
            o.location = Vector(o.location) + Vector((X, y0, 0))
            o.color = col
        for j, (pk, (px, py, pz), rot, s) in enumerate(props):
            src = ac_src[j % len(ac_src)] if pk == "ac" else tank_src
            S.instance(src, f"{key}_{pk}_{j}", (X + px, y0 + py, pz), rot, s)
        warm = S.lin("#ffd9a8")
        for j, (lk, (lx, ly, lz), w) in enumerate(lights):
            loc = (X + lx, y0 + ly, lz)
            if lk == "wash":
                S.add_light(f"{key}_wash_{j}", "SPOT", loc, (-1.5, 0, 2.2), warm, 1800.0, spot=75)
            elif lk == "blade":
                S.add_light(f"{key}_blade_{j}", "SPOT", loc, (-0.35, 0, 1), warm, 900.0, spot=28)
            elif lk == "light":
                L = dict(kind="POINT", direction=(0, 0, -1), color="#ffd9a8", energy=100.0, size=(0.2, 0.2), spot=60.0)
                L.update(w)
                S.add_light(f"{key}_fl_{j}", L["kind"], loc, L["direction"], S.lin(L["color"]), L["energy"], L["size"], L["spot"])
    # une vue d'ensemble depuis le trottoir d'en face, en plus des deux caméras du banc
    bench.camera("cam_side", (5.5, 18.0, 1.6), (-11.5, 44.0, 7.0), 20, (-11.5, 40.0, 6.0))
    which = tuple(os.environ.get("B_WHICH", "side,large").split(","))
    bench.render(os.environ.get("B_NAME", "B-upper"), which=which)


main()
