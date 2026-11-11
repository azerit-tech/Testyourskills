# Méthode A (« kit ») : l'habillage de la façade avec des pièces de bibliothèque (CC0 / CC BY).
import math
import random

import bpy
from mathutils import Vector

import bench
import A_lib as L
from A_facade import (E1, E2, GF, FH, NF, PYL, SKIN, TOP, WINDOWS, X0, Y0, Y1, SILL, WH, quad)

S = bench.S
lin = S.lin
HALF_PI = math.pi / 2


def set_mat(ob, mat, match=None):
    for i, m in enumerate(ob.data.materials):
        if match is None or (m is not None and match(m)):
            ob.data.materials[i] = mat


# ---------------------------------------------------------------- néons

def neon_alphabet(M):
    """Les 26 lettres du pack « Neon Letters » (tubes réels), triées par rangée puis par x."""
    objs = L.load("A-neon-letters.glb")
    back = [o for o in objs if len(o.data.polygons) < 50]
    L.remove(back)
    objs = [o for o in objs if o not in back]
    info = []
    for o in objs:
        mn, mx = L.bounds([o])
        info.append((mn.z, mn.x, o))
    info.sort(key=lambda t: -t[0])
    rows, cur = [], [info[0]]
    for t in info[1:]:
        if cur[-1][0] - t[0] > 0.1:
            rows.append(cur)
            cur = []
        cur.append(t)
    rows.append(cur)
    alpha = {}
    seq = iter("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    for row in rows:
        for _, _, o in sorted(row, key=lambda t: t[1]):
            ch = next(seq)
            src, dims = L.source([o], f"A_letter_{ch}")
            alpha[ch] = (src, dims)
    print("[A] lettres :", "".join(sorted(alpha)), flush=True)
    return alpha


def neon_word(alpha, text, mat, origin, height, facing, spacing=0.18, vertical=False):
    """Pose un mot. facing : 'x' (la rue) ou '-y' (vers la caméra, enseigne en drapeau).
    Horizontal : centré sur origin ; vertical : lettres empilées, la première en haut."""
    sc = height / 0.23
    obs = []
    if vertical:
        z = origin[2]
        for i, ch in enumerate(text):
            src, dims = alpha[ch]
            obs.append(L.place(src, f"A_neon_{text}_{i}", (origin[0], origin[1], z - height), 0.0, sc))
            z -= height * (1 + spacing * 2.2)
    else:
        widths = [alpha[ch][1].x * sc if ch != " " else height * 0.5 for ch in text]
        total = sum(widths) + spacing * height * (len(text) - 1)
        s = -total / 2
        for i, ch in enumerate(text):
            if ch != " ":
                src, dims = alpha[ch]
                c = s + widths[i] / 2
                if facing == "x":
                    loc = (origin[0], origin[1] + c, origin[2])
                    rot = HALF_PI
                else:
                    loc = (origin[0] + c, origin[1], origin[2])
                    rot = 0.0
                obs.append(L.place(src, f"A_neon_{text}_{i}", loc, rot, sc))
            s += widths[i] + spacing * height
    for ob in obs:
        # matériau par objet (les données des lettres sont partagées)
        for slot in ob.material_slots:
            slot.link = "OBJECT"
            slot.material = mat
    return obs


def tube(name, p0, p1, mat, r=0.022):
    return S.cyl(name, p0, p1, r, mat, seg=8)


# ---------------------------------------------------------------- petites pièces

def props(M):
    P = {}
    # descente d'eau (gouttière métal Poly Haven)
    g = L.load("modular_metal_gutter/modular_metal_gutter.gltf")
    for key in ("section", "outlet", "bracing", "funnel", "coupler"):
        part = [o for o in g if o.name == f"modular_metal_gutter_{key}"]
        P["gut_" + key] = L.source(part, f"A_gut_{key}", base=True)
    L.remove([o for o in g if L.alive(o) and not o.name.startswith("A_")])
    # tuyaux
    p = L.load("modular_pipes/modular_pipes.gltf")
    for key in ("pipe_200cm_metal", "pipe_thin_200cm_metal", "pipe_thin_100cm_metal", "pipe_support_metal"):
        P[key] = L.source([o for o in p if o.name == key], f"A_{key}")
    L.remove([o for o in p if L.alive(o) and not o.name.startswith("A_")])
    for key, f, rot in (("ubox1", "utility_box_01/utility_box_01.gltf", HALF_PI), ("ubox2", "utility_box_02/utility_box_02.gltf", HALF_PI),
                        ("seclight", "security_light/security_light.gltf", HALF_PI), ("planter", "planter_box_01/planter_box_01.gltf", 0.0),
                        ("plant", "potted_plant_02/potted_plant_02.gltf", 0.0), ("barchair", "bar_chair_round_01/bar_chair_round_01.gltf", 0.0)):
        P[key] = L.source(L.load(f), f"A_{key}", rot)
    rs = L.load("rollershutter_door/rollershutter_door.gltf")
    P["shutter"] = L.source([o for o in rs if o.name == "rollershutter_door"], "A_shutter", HALF_PI)
    L.remove([o for o in rs if L.alive(o) and not o.name.startswith("A_")])
    ac = L.load("exterior_aircon_unit/exterior_aircon_unit.gltf")
    P["ac_ext"] = L.source([o for o in ac if o.name == "exterior_aircon_unit"], "A_ac_ext", HALF_PI)
    P["ac_rust"] = L.source([o for o in ac if o.name == "exterior_aircon_unit_rusted"], "A_ac_rust", HALF_PI)
    t = L.load("outdoor_table_chair_set_01/outdoor_table_chair_set_01.gltf")
    P["table"] = L.source(t, "A_table")
    gd = L.load("A-glass-doors.glb")
    keep = [o for o in gd if o.name.startswith("Glass Door.001_")]
    L.remove([o for o in gd if o not in keep])
    for o in keep:
        set_mat(o, M["glass"], lambda m: "Glass" in m.name)
    P["door"] = L.source(keep, "A_door", HALF_PI)
    aw = L.load("A-old-awning.glb")
    P["awning"] = L.source(aw, "A_awning", 0.0)
    no = L.load("A-neon-open.glb")
    P["open"] = L.source(no, "A_open", HALF_PI)
    for k, (src, d) in P.items():
        print(f"[A] pièce {k} : {d.x:.2f} × {d.y:.2f} × {d.z:.2f}", flush=True)
    return P


def downpipe(P, name, x, y, z_top):
    sec, d = P["gut_section"]
    n = int(z_top - 0.4) + 1
    h = (z_top - 0.4) / n
    for k in range(n):
        L.place(sec, f"{name}_s{k}", (x, y, 0.4 + k * h), 0.0, (1, 1, h / d.z))
        if k % 2 == 1:
            L.place(P["gut_bracing"][0], f"{name}_b{k}", (x - 0.05, y, 0.4 + k * h), -HALF_PI)
    L.place(P["gut_outlet"][0], f"{name}_out", (x, y, 0.0), -HALF_PI)
    L.place(P["gut_funnel"][0], f"{name}_top", (x, y, z_top - 0.1), 0.0)


def dress_props(M, P):
    random.seed(5)
    xf_end = X0 + 0.3
    # descentes d'eau dans les angles rentrants entre les blocs d'extrémité et le corps central
    downpipe(P, "A_dp1", X0 + 0.1, E1[1] + 0.12, TOP + 0.8)
    downpipe(P, "A_dp2", X0 + 0.1, E2[0] - 0.12, TOP + 0.8)
    # le bloc de service : rideau de fer, coffrets électriques, applique de sécurité, tuyaux
    src, d = P["shutter"]
    L.place(src, "A_shutter_0", (xf_end - 0.2, 16.6, 0.0), 0.0, (1.0, 1.15, 1.08))
    L.place(P["ubox2"][0], "A_ubox2", (xf_end + P["ubox2"][1].x / 2, 15.0, 0.15), 0.0)
    L.place(P["ubox1"][0], "A_ubox1", (xf_end + P["ubox1"][1].x / 2, 14.35, 0.15), 0.0, 0.9)
    L.place(P["seclight"][0], "A_seclight", (xf_end + 0.2, 16.6, 3.05), 0.0)
    S.add_light("A_seclight_l", "SPOT", (xf_end + 0.3, 16.6, 2.85), (0.5, 0, -1), lin("#fff1d6"), 120.0, spot=80)
    pt, dpt = P["pipe_thin_200cm_metal"]
    L.place(pt, "A_pipe_h", (xf_end + 0.05, 15.4, 2.75), HALF_PI, (1, 1, 1))
    pv, dpv = P["pipe_200cm_metal"]
    L.place(pv, "A_pipe_v", (xf_end + 0.06, 14.85, 1.27), 0.0, (1, 1, 0.75))
    # entrée : plantes en pot de part et d'autre, jardinières le long de la terrasse
    for y in (22.75, 25.25):
        L.place(P["plant"][0], f"A_plant_{y}", (X0 + 0.45, y, 0.15), random.uniform(0, 6), 1.6)
    for k, y in enumerate((18.2, 19.3, 20.4, 21.5)):
        L.place(P["planter"][0], f"A_planter_{k}", (X0 + 2.95, y, 0.15), HALF_PI, 1.0)
    # terrasse du café, devant la vitrine gauche
    for k, (x, y, r) in enumerate(((X0 + 1.4, 18.9, 0.3), (X0 + 1.5, 20.7, 2.0), (X0 + 2.1, 22.0, 4.1))):
        L.place(P["table"][0], f"A_table_{k}", (x, y, 0.15), r)
    # climatiseurs extérieurs sur consoles, sous deux fenêtres
    for k, (yy, f, which) in enumerate(((19.2, 1, "ac_ext"), (28.8, 0, "ac_rust"), (32.2, 2, "ac_ext"))):
        src, d = P[which]
        proj = 0.3 if yy > E2[0] else 0.0
        zf = GF + f * FH
        L.place(src, f"A_acx_{k}", (X0 + proj + d.x / 2 + 0.02, yy, zf + 0.05), 0.0, 0.85)


# ---------------------------------------------------------------- l'éclairage de la façade

def facade_lights(M):
    """Lavages de façade (forts en bas, qui s'éteignent en montant), tubes néon sur les arêtes."""
    pa, pb = PYL
    # le pylône : deux tubes lilas sur ses arêtes avant, et un lavage lilas depuis la marquise
    for k, y in enumerate((pa + 0.03, pb - 0.03)):
        tube(f"A_tube_pyl_{k}", (X0 + 0.63, y, GF + 0.2), (X0 + 0.63, y, TOP + 3.5), M["lilac"])
    for k, y in enumerate((pa + 0.25, pb - 0.25)):
        S.add_light(f"A_wash_pyl_{k}", "SPOT", (X0 + 1.5, y, 3.8), (-0.12, 0, 1), lin(S.LILAC), 2600.0, spot=22)
    # tube corail sous le nez de la marquise
    tube("A_tube_canopy", (X0 + 2.74, 21.6, 3.22), (X0 + 2.74, 26.4, 3.22), M["coral"])
    # les blocs d'extrémité : projecteurs crème au pied, sur les arêtes
    for (ya, yb) in (E1, E2):
        for k, y in enumerate((ya + 0.5, yb - 0.5)):
            S.add_light(f"A_wash_end_{ya}_{k}", "SPOT", (X0 + 0.9, y, GF + 0.05), (-0.18, 0, 1), lin("#ffe6c6"), 1100.0, spot=35)
    # le corps central : projecteurs ambre sur le bandeau du rez-de-chaussée, tous les 2,6 m
    for y in (18.9, 21.6, 26.4, 29.1):
        S.add_light(f"A_wash_mid_{y}", "SPOT", (X0 + 0.55, y, GF + 0.08), (-0.1, 0, 1), lin("#ffd7a0"), 700.0, spot=70)
    # tube lilas sur la corniche du corps central
    for (ya, yb) in ((E1[1], pa), (pb, E2[0])):
        tube(f"A_tube_cornice_{ya}", (X0 + 0.27, ya + 0.05, TOP + 0.72), (X0 + 0.27, yb - 0.05, TOP + 0.72), M["lilac"], 0.018)
