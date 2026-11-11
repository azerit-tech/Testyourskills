# Méthode A (« kit ») : ce qui garnit les ouvertures. Fenêtres à petits bois (Window Asset Pack),
# intérieurs de boutiques éclairés (Simple Storefront Interior Pack), portes vitrées (Glass Doors),
# climatiseur de fenêtre et grilles (Air conditioner pack), garde-corps marin (Railing Set), store (CC0 Awning).
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import bench
import A_lib as L
from A_facade import E1, E2, GF, FH, PYL, SKIN, TOP, X0, quad

S = bench.S
lin = S.lin
HALF_PI = math.pi / 2


def crop(objs, name, xr, zr, rot=0.0, yr=None):
    """Découpe d'un pack « planche » la pièce dont les faces tombent dans la boîte xr × zr."""
    parts = []
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        dels = []
        for f in bm.faces:
            c = f.calc_center_median()
            inside = xr[0] <= c.x <= xr[1] and zr[0] <= c.z <= zr[1] and (yr is None or yr[0] <= c.y <= yr[1])
            if not inside:
                dels.append(f)
        bmesh.ops.delete(bm, geom=dels, context="FACES")
        if len(bm.faces):
            me = bpy.data.meshes.new(name + "_part")
            bm.to_mesh(me)
            for m in o.data.materials:
                me.materials.append(m)
            ob = bpy.data.objects.new(name + "_part", me)
            bpy.context.scene.collection.objects.link(ob)
            parts.append(ob)
        bm.free()
    return L.source(parts, name, rot)


# ---------------------------------------------------------------- fenêtres

def window_sources(M):
    objs = L.load("A-window-pack.glb")
    white = S.mat_plain("A_win_frame", lin("#efebe2"), 0.32)
    for o in objs:
        for i, m in enumerate(o.data.materials):
            # le pack : vitres bleu clair, cadres gris ; on remet nos matériaux
            col = None
            if m is not None and m.node_tree:
                for n in m.node_tree.nodes:
                    if n.type == "BSDF_PRINCIPLED":
                        col = n.inputs["Base Color"].default_value
            is_glass = col is not None and col[2] > col[0] + 0.05
            o.data.materials[i] = M["glass"] if is_glass else white
        if not o.data.materials:
            o.data.materials.append(white)
    W = {
        "case12": crop(objs, "A_win_case12", (-2.25, -1.42), (0.93, 2.25), HALF_PI),
        "sash": crop(objs, "A_win_sash", (-0.27, 0.55), (4.08, 5.5), HALF_PI),
        "double": crop(objs, "A_win_double", (1.05, 2.55), (0.93, 2.25), HALF_PI),
    }
    L.remove(objs)
    for k, (s, d) in W.items():
        print(f"[A] fenêtre {k} : {d.x:.2f} × {d.y:.2f} × {d.z:.2f}", flush=True)
    return W


def leaf(src, dims, name, x, ya, yb, z0, z1, open_deg=0.0, hinge="a"):
    """Un vantail du pack calé entre ya et yb ; ouvert vers l'intérieur de open_deg autour de son gond."""
    w = yb - ya
    sy, sz = w / dims.y, (z1 - z0) / dims.z
    a = math.radians(open_deg)
    if hinge == "a":
        c = (x - w / 2 * math.sin(a), ya + w / 2 * math.cos(a))
        rot = a
    else:
        c = (x - w / 2 * math.sin(a), yb - w / 2 * math.cos(a))
        rot = -a
    return L.place(src, name, (c[0], c[1], z0), rot, (1.0, sy, sz))


def dress_windows(M, W, openings):
    random.seed(23)
    blind = M["blind"]
    for (kind, ya, yb, z0, z1, xf, f, key) in openings:
        if kind != "win":
            continue
        xw = xf - 0.2                      # le plan des vitres, dans le tableau
        tag = f"{f}_{ya:.1f}"
        src, d = W["case12"]
        if yb - ya > 1.5:
            ym = (ya + yb) / 2
            # meneau central en stuc peint
            S.box(f"A_mull_{tag}", xw - 0.06, xw + 0.06, ym - 0.05, ym + 0.05, z0, z1, M["trim"])
            r = random.random()
            leaf(src, d, f"A_leafL_{tag}", xw, ya, ym - 0.05, z0, z1, 28.0 if r < 0.18 else 0.0, "a")
            leaf(src, d, f"A_leafR_{tag}", xw, ym + 0.05, yb, z0, z1, 35.0 if 0.18 <= r < 0.3 else 0.0, "b")
        else:
            leaf(src, d, f"A_leaf_{tag}", xw, ya, yb, z0, z1, 0.0)
        # store vénitien baissé à une hauteur différente selon la chambre
        if random.random() < 0.5:
            zb = z1 - (z1 - z0) * random.uniform(0.15, 0.75)
            S.box(f"A_blind_{tag}", xw - 0.12, xw - 0.11, ya + 0.04, yb - 0.04, zb, z1 - 0.02, blind)
        # coulure sous l'appui, plus étroite que la fenêtre
        w = (yb - ya) * random.uniform(0.55, 0.9)
        yc = (ya + yb) / 2 + random.uniform(-0.15, 0.15)
        h = random.uniform(0.6, 1.7)
        xs = xf + 0.004
        quad(f"A_streak_{tag}", [(xs, yc - w / 2, z0 - 0.07 - h), (xs, yc + w / 2, z0 - 0.07 - h),
                                  (xs, yc + w / 2, z0 - 0.07), (xs, yc - w / 2, z0 - 0.07)], M["streak"])
    # sous les sourcils filants et la corniche aussi, l'eau a coulé
    for k in range(10):
        y = random.uniform(E1[1] + 0.2, E2[0] - 0.4)
        if PYL[0] - 0.3 < y < PYL[1] + 0.3:
            continue
        zt = TOP + 0.75
        h = random.uniform(0.4, 1.2)
        w = random.uniform(0.25, 0.7)
        quad(f"A_streak_c{k}", [(X0 + 0.004, y, zt - h), (X0 + 0.004, y + w, zt - h), (X0 + 0.004, y + w, zt), (X0 + 0.004, y, zt)], M["streak"])


# ---------------------------------------------------------------- rez-de-chaussée

def interiors_sources():
    objs = L.load("A-storefront-interiors.glb")
    drop = [o for o in objs if "Background" in o.name or "HUMAN" in o.name]
    objs = [o for o in objs if o not in drop]
    L.remove(drop)
    # l'atlas est déjà éclairé (lumière cuite) : émission de la texture, plus une diffusion faible
    for o in objs:
        for i, m in enumerate(o.data.materials):
            img = (S.find_image(m) or L.any_image(m)) if m else None
            mm, N, out = S.material("A_interior_baked")
            t = N.new("ShaderNodeTexImage")
            t.image = img
            N.link(N.new("ShaderNodeUVMap").outputs[0], t.inputs[0])
            e = N.new("ShaderNodeEmission", Strength=2.6)
            N.link(t.outputs["Color"], e.inputs["Color"])
            dfs = N.new("ShaderNodeBsdfDiffuse")
            N.link(t.outputs["Color"], dfs.inputs["Color"])
            add = N.new("ShaderNodeAddShader")
            N.link(e.outputs[0], add.inputs[0])
            N.link(dfs.outputs[0], add.inputs[1])
            N.link(add.outputs[0], out.inputs[0])
            o.data.materials[i] = mm
    # les cases de l'atlas (x, z du pack ; l'ouverture regarde −y)
    I = {
        "reception": crop(objs, "A_int_reception", (6.4, 13.2), (17.0, 22.1), HALF_PI),
        "display": crop(objs, "A_int_display", (-4.25, 0.5), (10.1, 13.7), HALF_PI),
        "boutique": crop(objs, "A_int_boutique", (23.4, 28.1), (10.1, 13.7), HALF_PI),
        "bar": crop(objs, "A_int_bar", (-11.4, -4.9), (10.1, 13.7), HALF_PI),
    }
    L.remove(objs)
    for k, (s, d) in I.items():
        print(f"[A] intérieur {k} : {d.x:.2f} × {d.y:.2f} × {d.z:.2f}", flush=True)
    return I


def put_interior(src, dims, name, y0, y1, height, x_front):
    sy = (y1 - y0) / dims.y
    sz = height / dims.z
    sx = min(sy, sz)
    return L.place(src, name, (x_front - dims.x * sx / 2, (y0 + y1) / 2, 0.15), 0.0, (sx, sy, sz))


def shop_glazing(M, name, xg, ya, yb, top, door_at=None, P=None):
    """Vitrine : soubassement sombre, glace, montants alu ; une porte vitrée du pack."""
    B = S.Boxes(name)
    B.add(xg - 0.06, xg + 0.06, ya, yb, 0.15, 0.6, M["riser"])
    B.add(xg - 0.005, xg + 0.005, ya, yb, 0.6, top, M["glass"])
    for z in (0.6, 2.55, top - 0.06):
        B.add(xg - 0.04, xg + 0.04, ya, yb, z, z + 0.06, M["frame"])
    n = max(1, int((yb - ya) / 1.25))
    for k in range(n + 1):
        y = ya + (yb - ya) * k / n
        B.add(xg - 0.05, xg + 0.05, y - 0.03, y + 0.03, 0.6, top, M["frame"])
    return B.done()


def dress_ground(M, P, I, alpha_word):
    random.seed(3)
    xg = X0 - 0.22                       # le plan des vitrines
    # boutique gauche : vitrine d'objets, store rayé corail
    put_interior(*I["display"], "A_int_L", E1[1] + 0.3, 21.75, 2.95, X0 - 0.4)
    shop_glazing(M, "A_glaze_L", xg, E1[1] + 0.35, 21.6, 3.0)
    S.add_light("A_shopL_out", "AREA", (X0 + 0.5, 19.8, 2.2), (1, 0, -0.45), lin("#ffcf96"), 160.0, (3.4, 2.0))
    # boutique droite : boutique de vêtements, néon OPEN dans la vitrine
    put_interior(*I["boutique"], "A_int_R", 26.25, E2[0] - 0.25, 2.95, X0 - 0.4)
    shop_glazing(M, "A_glaze_R", xg, 26.4, E2[0] - 0.35, 3.0)
    S.add_light("A_shopR_out", "AREA", (X0 + 0.5, 28.2, 2.2), (1, 0, -0.45), lin("#ffd9a8"), 150.0, (3.4, 2.0))
    op, dop = P["open"]
    o = L.place(op, "A_open_sign", (xg - 0.08, 28.9, 1.6), 0.0, 1.8)
    # le hall de l'hôtel : réception boisée derrière les portes vitrées, imposte
    put_interior(*I["reception"], "A_int_lobby", 21.75, 26.25, 3.9, X0 - 0.4)
    door, dd = P["door"]
    L.place(door, "A_lobby_door", (xg, 24.0, 0.15), 0.0, (1.0, 2.1 / dd.y, 2.55 / dd.z))
    B = S.Boxes("A_lobby_glaze")
    for y0, y1 in ((22.0, 22.95), (25.05, 26.0)):
        B.add(xg - 0.005, xg + 0.005, y0, y1, 0.15, 3.4, M["glass"])
        B.add(xg - 0.05, xg + 0.05, y0 - 0.03, y0 + 0.03, 0.15, 3.4, M["frame"])
        B.add(xg - 0.05, xg + 0.05, y1 - 0.03, y1 + 0.03, 0.15, 3.4, M["frame"])
    B.add(xg - 0.005, xg + 0.005, 22.95, 25.05, 2.7, 3.4, M["glass"])
    B.add(xg - 0.05, xg + 0.05, 22.0, 26.0, 2.68, 2.74, M["frame"])
    B.done()
    S.add_light("A_lobby_out", "AREA", (X0 + 0.3, 24.0, 2.6), (1, 0, -0.5), lin("#ffcf96"), 220.0, (3.6, 2.4))
    # le bar du bloc d'extrémité : comptoir, tabourets, mot BAR en néon dans la vitrine
    put_interior(*I["bar"], "A_int_bar", 31.0, 35.6, 2.95, X0 + 0.3 - 0.4)
    shop_glazing(M, "A_glaze_bar", X0 + 0.3 - 0.22, E2[0] + 0.45, E2[1] - 0.45, 3.0)
    alpha_word("BAR", M["coral"], (X0 + 0.3 - 0.3, 32.2, 2.05), 0.42, "x")
    S.add_light("A_bar_out", "AREA", (X0 + 0.8, 32.2, 2.2), (1, 0, -0.45), lin("#ffb877"), 120.0, (2.4, 2.0))


def ac_pack(M):
    """Le climatiseur de fenêtre sur ses consoles et une grille d'aération, découpés dans la planche."""
    objs = L.load("A-ac-pack.glb")
    A = {"wac": crop(objs, "A_wac", (-5.6, -4.4), (5.75, 7.0), HALF_PI),
         "split": crop(objs, "A_split", (4.45, 5.8), (4.9, 6.45), HALF_PI),
         "louvre": crop(objs, "A_louvre", (-1.0, -0.2), (4.45, 5.0), HALF_PI)}
    L.remove(objs)
    for k, (s, d) in A.items():
        print(f"[A] clim {k} : {d.x:.2f} × {d.y:.2f} × {d.z:.2f}", flush=True)
    return A


def dress_ac(A):
    src, d = A["wac"]
    for k, (y, f, xo) in enumerate(((15.8, 1, 0.3), (26.2, 2, 0.0))):
        zf = GF + f * FH
        sc = 0.75 / d.y
        L.place(src, f"A_wac_{k}", (X0 + xo + d.x * sc / 2, y, zf + 0.25), 0.0, sc)
    src, d = A["split"]
    sc = 0.85 / d.y
    L.place(src, "A_split_0", (X0 + d.x * sc / 2, 21.8, GF + 2 * FH + 0.1), 0.0, sc)
    src, d = A["louvre"]
    for k, (y, z) in enumerate(((14.6, 3.2), (33.4, 3.35))):
        L.place(src, f"A_louvre_{k}", (X0 + 0.3 + 0.01, y, z), 0.0, 0.5 / d.y)


def railing(M):
    objs = L.load("A-railing-set.glb")
    src, d = crop(objs, "A_rail", (-1.16, -0.56), (-1.0, 1.0), 0.0)
    L.remove(objs)
    S.find_image  # noqa
    for o in [src]:
        o.data.materials.clear()
        o.data.materials.append(M["frame"])
    sc = 1.0 / d.z
    seg = d.x * sc
    y = E1[1] + 0.1
    k = 0
    while y + seg <= E2[0] + 0.01:
        # le long du toit du corps central, un peu en retrait de l'acrotère
        L.place(src, f"A_rail_{k}", (X0 - 1.3, y + seg / 2, TOP + 0.15), HALF_PI, sc)
        y += seg
        k += 1
    print(f"[A] garde-corps : {k} travées de {seg:.2f} m", flush=True)


def awning(M):
    objs = L.load("A-awning-cc0.glb")
    src, d = L.source(objs, "A_awn_src")
    me = src.data
    zs = [v.co.z for v in me.vertices]
    ztop = max(zs)
    top = [v.co for v in me.vertices if v.co.z > ztop - 0.05]
    depth_axis = 1 if d.x > d.y else 0
    s = sum(c[depth_axis] for c in top) / len(top)
    if depth_axis == 0:
        rot = math.pi if s > 0 else 0.0
    else:
        rot = HALF_PI if s > 0 else -HALF_PI
    me.transform(Matrix.Rotation(rot, 4, "Z"))
    d = L.recentre(src)
    # toile rayée corail et crème
    m, N, out = S.material("A_awning_fabric")
    y = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])[1]
    stripe = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", y, 0.32)), 0.5)
    col = N.mix(stripe, lin("#e9e1cf"), lin("#e2603c"))
    p = S.principled(N, Roughness=0.75, **{"Sheen Weight": 0.3})
    N.link(col, p.inputs["Base Color"])
    tl = N.new("ShaderNodeBsdfTranslucent")
    N.link(col, tl.inputs["Color"])
    mx = N.new("ShaderNodeMixShader")
    N.set(mx.inputs[0], 0.25)
    N.link(p.outputs[0], mx.inputs[1])
    N.link(tl.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    src.data.materials.clear()
    src.data.materials.append(m)
    print(f"[A] store : {d.x:.2f} × {d.y:.2f} × {d.z:.2f} (rot {math.degrees(rot):.0f})", flush=True)
    ya, yb = E1[1] + 0.25, 21.7
    sy = (yb - ya) / d.y
    sx = 1.5 / d.x
    sz = 0.8 / d.z
    L.place(src, "A_awning_L", (X0 + 1.5 / 2, (ya + yb) / 2, 3.1 - 0.8), 0.0, (sx, sy, sz))
