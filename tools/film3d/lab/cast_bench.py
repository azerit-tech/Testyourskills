# Le banc d'essai des poursuivants : chaque véhicule seul sur un bitume mouillé sombre, de nuit, en plan rapproché.
#
#   blender -b --factory-startup -P tools/film3d/lab/cast_bench.py -- --veh patrol --light ambre --tag avant
#
# --veh patrol | patrol_open | van | heli | jet   (patrol_open : les deux portières avant ouvertes)
# --light ambre | neon                             (lampadaires ambre ; néons corail et lilas)
# --views face,tq_front,flank,tq_rear,bar,wheel,... (voir VIEWS ; par défaut celles du véhicule)
# --bar on | off                                    (rampe allumée ou éteinte)
# --samples 64 (chercher) | 256 (valider), --res 720x1280, --out <dossier>
# --inspect                                         (liste matières et textures des modèles, écrit les textures)
# --jobs patrol:ambre:face+rampe,van:neon           (plusieurs essais dans la même session ;
#        patrol:ambre:rampe::7 à l'image 7, patrol:ambre:rampe:off rampe éteinte)
#
# Les planches avant / après : python3 tools/film3d/lab/planche.py <sortie.png> <largeur> <ligne> <ligne> ...
#
# Les véhicules sont chargés par les fonctions des scènes (lieux.patrol, van, helicopter, jet) : ce qu'on voit ici
# est ce que les plans montrent. Écrit <out>/<veh>-<light>-<vue>-<tag>.png.
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

import cast_vehicles as cv  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--veh", default="patrol")
    ap.add_argument("--light", default="ambre")
    ap.add_argument("--views", default="")
    ap.add_argument("--bar", default="on")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--res", default="720x1280")
    ap.add_argument("--out", default=os.path.expanduser("~/film/iter-meute"))
    ap.add_argument("--tag", default="essai")
    ap.add_argument("--frame", type=int, default=1)
    ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--probe", action="store_true", help="les îlots du maillage du jet (couches du jet des tuyères)")
    ap.add_argument("--jobs", default="", help="patrol:ambre:face+rampe,van:neon,... (une session)")
    return ap.parse_args(argv)


# ---------------------------------------------------------------- l'inventaire des modèles

MODELS = {"patrol": "patrol-jeandiz/model.glb",
          "van": next(v["file"] for v in cv.VANS.values() if v.get("hq")),
          "heli": cv.HELIS["solid"]["file"], "jet": cv.JETS["concept"]["file"]}


def inspect(out):
    """Chaque modèle tel que livré : ses objets, ses matières, les images branchées (et sur quelle entrée) ; les
    images sont écrites en 1024 px pour chercher un lettrage à l'œil."""
    for key, rel in MODELS.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        parts = cv.import_model(os.path.join(cv.CAST, rel))
        print(f"\n=== {key} : {len(parts)} objets", flush=True)
        mats = {}
        for o in parts:
            for m in o.data.materials:
                if m:
                    mats.setdefault(m.name, []).append(o.name)
        os.makedirs(os.path.join(out, "tex", key), exist_ok=True)
        for name, objs in sorted(mats.items()):
            m = bpy.data.materials[name]
            uses = []
            for n in m.node_tree.nodes if m.node_tree else []:
                if n.type == "TEX_IMAGE" and n.image:
                    to = []
                    stack = [n]
                    seen = set()
                    while stack:
                        x = stack.pop()
                        for s in x.outputs:
                            for li in s.links:
                                if li.to_node.type == "BSDF_PRINCIPLED":
                                    to.append(li.to_socket.name)
                                elif li.to_node.name not in seen:
                                    seen.add(li.to_node.name)
                                    stack.append(li.to_node)
                    uses.append(f"{n.image.name} {tuple(n.image.size)} -> {','.join(sorted(set(to)))}")
            print(f"  [{name}] {len(objs)} obj : {', '.join(sorted(set(objs)))[:220]}", flush=True)
            for u in uses:
                print(f"      {u}", flush=True)
        for img in bpy.data.images:
            if img.size[0] == 0:
                continue
            w, h = img.size
            f = 1024 / max(w, h)
            if f < 1:
                img.scale(int(w * f), int(h * f))
            safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in img.name)
            img.filepath_raw = os.path.join(out, "tex", key, safe + ".png")
            img.file_format = "PNG"
            try:
                img.save()
            except Exception as e:
                print(f"  ! {img.name} : {e!r}", flush=True)


# ---------------------------------------------------------------- le plateau

AMBER = "#ffb36b"
CORAL = "#ff6a3d"
LILAC = "#8d8cf0"


def gpu(scene):
    """Cycles sur OptiX (CUDA à défaut) ; jamais sur le Mac."""
    c = scene.cycles
    c.device = "CPU"
    if sys.platform == "darwin":
        return "CPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type == kind]
        if devs:
            for d in prefs.devices:
                d.use = d.type == kind
            c.device = "GPU"
            return kind
    return "CPU"


def _light(name, kind, loc, target, color, energy, size=0.5, spot=None, shape=None, size_y=None):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = cv.lin(color)[:3]
    if kind == "SPOT":
        d.spot_size = math.radians(spot or 130)
        d.spot_blend = 0.5
        d.shadow_soft_size = size
    elif kind == "AREA":
        d.shape = shape or "RECTANGLE"
        d.size = size
        d.size_y = size_y or size
    else:
        d.shadow_soft_size = size
    ob = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y")
    return ob


def lighting(kind, air=False):
    """« ambre » : deux lampadaires de rue (spots ambre de 2600 W à 5,4 m, comme lieux.lamp), un devant à droite,
    un derrière à gauche. « neon » : deux enseignes, corail à gauche et lilas à droite (tubes à 3 m), plus un
    lampadaire lointain. Pour un aéronef, la même chose renvoyée par le sol (lumière vers le haut, faible)."""
    if kind == "soir":
        return
    if air:
        if kind == "ambre":
            _light("rebond_ambre", "AREA", (0, 0, 0.3), (0, 0, 30), AMBER, 4000.0, size=30.0)
        else:
            _light("rebond_corail", "AREA", (-8, 0, 0.3), (-8, 0, 30), CORAL, 2500.0, size=20.0)
            _light("rebond_lilas", "AREA", (8, 0, 0.3), (8, 0, 30), LILAC, 2500.0, size=20.0)
        return
    if kind == "ambre":
        _light("lampadaire_1", "SPOT", (4.6, 4.5, 5.4), (4.0, 4.0, 0), AMBER, 2600.0)
        _light("lampadaire_2", "SPOT", (-4.6, -5.5, 5.4), (-4.0, -5.0, 0), AMBER, 2600.0)
    else:
        for name, x, col in (("neon_corail", -4.2, CORAL), ("neon_lilas", 4.2, LILAC)):
            ob = _light(name, "AREA", (x, 1.0, 3.0), (0, 1.0, 1.0), col, 900.0, size=2.4, size_y=0.25)
            ob.data.spread = math.radians(140)
            # le tube lui-même, émissif, pour qu'il se reflète comme une enseigne
            bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=2.4, location=(x, 1.0, 3.0),
                                                rotation=(math.radians(90), 0, 0))
            tube = bpy.context.active_object
            tube.name = f"{name}_tube"
            tube.data.materials.append(cv.mat_emit(f"{name}_tube", col, 12.0))
        _light("lampadaire_loin", "SPOT", (0.0, -16.0, 5.4), (0.0, -14.0, 0), AMBER, 2600.0)


def ground():
    import cast_vehicles_render as R
    g = R.wet_ground(cv, size=120.0)
    return g


# ---------------------------------------------------------------- les véhicules

MEUTE = []


def clone_partage(root, name):
    """lieux.clone sans lieux.own_lights : des copies aux lumières partagées, le témoin de la meute qui clignotait
    d'un bloc (motion.flash_bars posait le décalage du dernier véhicule sur tous)."""
    import lieux as L
    own, L.own_lights = L.own_lights, (lambda r: r)
    try:
        return L.clone(root, name)
    finally:
        L.own_lights = own


def load(veh, bar_on=True):
    """Le rig du véhicule tel que les scènes le chargent (lieux), l'avant vers +y, posé à l'origine ; pour un
    aéronef, en l'air."""
    import lieux as L
    if veh in ("patrol", "patrol_open"):
        root = L.patrol("patrol", lights_on=bar_on)
        if veh == "patrol_open":
            L.open_door(root, side=1)
            L.open_door(root, side=-1)
        L.put(root, 0, 0, 0, 0)
    elif veh == "van":
        root = L.van("van", lights_on=bar_on)
        L.put(root, 0, 0, 0, 0)
    elif veh in ("heli", "heli_bas"):
        root, h = L.helicopter("heli", searchlight=True)
        L.put(root, 0, 0, 16.0 if veh == "heli" else 8.0, 0)
        bpy.context.view_layer.update()
        L.aim(h, (0.0, 9.0, 0.0))
    elif veh == "jet":
        root = L.jet("jet")
        L.put(root, 0, 0, 30.0, 0)
    elif veh == "violets":
        # les deux violets côte à côte : à gauche la palette des scènes (LILAC, faisceaux et flaques), à droite
        # celui des rampes (cast_vehicles.BAR_LILAC) ; chacun un tube émissif et sa lumière sur le mouillé
        root = bpy.data.objects.new("violets", None)
        bpy.context.scene.collection.objects.link(root)
        for name, x, col in (("palette", -1.3, cv.LILAC), ("rampes", 1.3, cv.BAR_LILAC)):
            ob = _light(f"violet_{name}", "AREA", (x, 2.0, 2.2), (x, 2.0, 0.0), col, 600.0, size=1.6, size_y=0.2)
            ob.data.spread = math.radians(120)
            bpy.ops.mesh.primitive_cylinder_add(radius=0.045, depth=1.6, location=(x, 2.0, 2.25),
                                                rotation=(0, math.radians(90), 0))
            tube = bpy.context.active_object
            tube.name = f"violet_{name}_tube"
            tube.data.materials.append(cv.mat_emit(f"violet_{name}_tube", col, 8.0))
    elif veh in ("meute", "meute_partage"):
        # trois patrouilles de front : meute par lieux.clone (chacune ses lumières, elles battent en désordre),
        # meute_partage par clone_partage (lumières partagées, elles battent ensemble)
        root = L.patrol("patrol", lights_on=bar_on)
        L.put(root, 0, 0, 0, 0)
        MEUTE[:] = [root]
        for i, x in ((1, -3.4), (2, 3.4)):
            c = (L.clone if veh == "meute" else clone_partage)(root, f"patrol{i}")
            L.put(c, x, -1.5 * i, 0, 0)
            MEUTE.append(c)
    else:
        raise SystemExit(f"véhicule inconnu : {veh}")
    bpy.context.view_layer.update()
    return root


def extent(root):
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for o in [root, *root.children_recursive]:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, p))
            mx = Vector(map(max, mx, p))
    return mn, mx


def find(root, *keys):
    for o in root.children_recursive:
        if any(k in o.name for k in keys):
            return o
    return None


def views(veh, root):
    """{vue: (position, cible, focale)} autour du véhicule, caméra à 0,5 m (au sol pour un aéronef)."""
    mn, mx = extent(root)
    c = (mn + mx) / 2
    L, W, H = mx.y - mn.y, mx.x - mn.x, mx.z - mn.z
    if veh == "violets":
        return {"cote_a_cote": ((0.0, -3.0, 0.6), Vector((0.0, 2.0, 1.4)), 24.0)}
    if veh in ("meute", "meute_partage"):
        t = Vector((0.0, -1.5, 1.2))
        return {"meute": ((2.0, mx.y + 12.0, 1.6), t, 40.0), "meute_haut": ((4.0, mx.y + 9.0, 4.5), t, 32.0)}
    if veh in ("heli", "heli_bas", "jet"):
        z = c.z
        d = 16.0 if veh == "heli" else 24.0
        lens = 35.0 if veh == "heli" else 40.0
        out = {
            "dessous_tqav": ((d * 0.55, d * 0.75, 0.5), c, lens),
            "dessous_tqar": ((d * 0.55, -d * 0.75, 0.5), c, lens),
            "dessous_flanc": ((d, 0.0, 0.5), c, lens),
            "dessous_face": ((-1.5, d, 0.5), c, lens),
            "dessous_g": ((-d * 0.6, d * 0.3, 0.5), c, lens),
        }
        if veh == "heli_bas":
            # de dessous et de derrière, à 9 m (P5, P6, FIN)
            return {"arriere9": ((1.2, -4.0, 0.6), c, 24.0), "arriere9_g": ((-2.5, -3.5, 0.6), c, 24.0)}
        if veh == "heli":
            # de dessous et de derrière, à 16 et 25 m
            out["arriere16"] = ((1.5, -4.0, 0.6), c, 24.0)
            out["arriere25"] = ((3.0, -19.0, 0.6), c, 35.0)
            sl = find(root, "searchlight_lens")
            p = sl.matrix_world.translation if sl else c
            out["projecteur"] = ((3.0, 11.0, 0.5), p, 135.0)
            out["dessous_aplomb"] = ((0.5, 3.0, 0.5), c, 24.0)
        else:
            out["tuyeres"] = ((3.0, -d * 0.9, 0.5), Vector((c.x, mn.y + 1.5, z)), 85.0)
            # de derrière quand il dépasse la caméra (P6)
            out["depasse"] = ((3.0, -8.0, 0.6), c, 24.0)
            out["depasse_loin"] = ((4.0, -30.0, 0.6), c, 35.0)
            out["dessous_aplomb"] = ((0.5, -4.0, 0.5), c, 24.0)
        return out
    t = Vector((c.x, c.y, H * 0.42))
    D = L / 2 + 4.5
    a = math.radians(38)
    out = {
        "face": ((0.5, mx.y + 5.0, 0.5), t, 28.0),
        "tqav": ((math.sin(a) * D, math.cos(a) * D, 0.5), t, 24.0),
        "flanc": ((W / 2 + 6.0, c.y, 0.5), t, 24.0),
        "tqar": ((math.sin(a) * D, -math.cos(a) * D, 0.5), t, 24.0),
        "arriere": ((-0.5, mn.y - 5.0, 0.5), t, 28.0),
        "flanc_g": ((-(W / 2 + 6.0), c.y, 0.5), t, 24.0),
        "tqav_g": ((-math.sin(a) * D, math.cos(a) * D, 0.5), t, 24.0),
        "dessus": ((3.2, mx.y + 3.0, H + 2.6), Vector((c.x, c.y, H * 0.7)), 24.0),
        "plaque_av": ((0.4, mx.y + 2.2, 0.5), Vector((0, mx.y - 0.1, 0.55)), 45.0),
        "plaque_ar": ((-0.4, mn.y - 2.2, 0.6), Vector((0, mn.y + 0.1, 0.75)), 45.0),
        "phares": ((0.9, mx.y + 4.0, 0.55), Vector((0, mx.y - 0.2, H * 0.32)), 50.0),
        "calandre": ((0.3, mx.y + 1.6, 0.75), Vector((0, mx.y - 0.3, H * 0.36)), 35.0),
        "coffre": ((0.3, mn.y - 1.8, H * 0.95), Vector((0, mn.y + 0.5, H * 0.55)), 35.0),
    }
    for dd in (3, 5, 8):
        for h in (0.6, 1.5, 2.4):
            # la patrouille 1 des caméras v3 : de trois quarts arrière, à gauche du cadre, son coin arrière droit à
            # dd m de l'objectif (10° à gauche de l'axe), caméra à h m qui regarde la route droit devant (24 mm)
            q = Vector((mx.x, mn.y, 0.0))
            cpos = q + dd * Vector((math.sin(math.radians(10)), -math.cos(math.radians(10)), 0.0))
            cpos.z = h
            out[f"v3_{dd}_{int(h * 10):02d}"] = (tuple(cpos), Vector((cpos.x, cpos.y + 12.0, 0.9)), 24.0)
    for dd in (5, 8):
        # les caméras de dos d'après le verdict « trop bas » : 2,4 m de haut, plongée de 12°, 24 mm ; la patrouille
        # 1 de trois quarts arrière à gauche du cadre, son coin arrière droit à dd m (12° à gauche de l'axe)
        q = Vector((mx.x, mn.y, 0.0))
        cpos = q + dd * Vector((math.sin(math.radians(12)), -math.cos(math.radians(12)), 0.0))
        cpos.z = 2.4
        pitch = math.radians(12)
        out[f"haut{dd}"] = (tuple(cpos), cpos + 10 * Vector((0.0, math.cos(pitch), -math.sin(pitch))), 24.0)
    bar = find(root, "hq_lightbar")
    if bar is not None:
        bmn, bmx = extent_obj(bar)
        bc = (bmn + bmx) / 2
        out["rampe"] = ((bc.x + 1.4, bc.y + 2.2, bc.z + 0.35), bc, 50.0)
        out["rampe_face"] = ((bc.x + 0.2, bc.y + 4.5, bc.z + 0.1), bc, 50.0)
    wh = find(root, "wheel_FR")
    if wh is not None:
        p = wh.matrix_world.translation
        out["roue"] = ((p.x + 1.7, p.y + 1.3, 0.45), p, 40.0)
    if veh == "patrol_open":
        out = {k: out[k] for k in ("tqav", "tqav_g", "flanc", "flanc_g", "tqar")}
        out["porte_d"] = ((W / 2 + 2.6, c.y + 1.8, 0.8), Vector((W / 2 + 0.4, c.y + 0.5, 0.6)), 28.0)
        out["porte_g"] = ((-(W / 2 + 2.6), c.y + 1.8, 0.8), Vector((-(W / 2 + 0.4), c.y + 0.5, 0.6)), 28.0)
    return out


def extent_obj(ob):
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for o in [ob, *ob.children_recursive]:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, p))
            mx = Vector(map(max, mx, p))
    return mn, mx


def run(a):
    import lieux as L
    import motion as M
    scene, _hidden = L.new_scene()
    L.sky(scene)
    air = a.veh in ("heli", "heli_bas", "jet")
    ground()
    lighting(a.light, air=air)
    root = load(a.veh, bar_on=(a.bar == "on"))
    if a.veh in ("patrol", "patrol_open", "van") and a.bar == "on":
        M.flash_bars([root], range(1, 25))
    if a.veh in ("meute", "meute_partage") and a.bar == "on":
        M.flash_bars(MEUTE, range(1, 25))
    if a.veh in ("heli", "heli_bas"):
        scene.render.use_motion_blur = True        # le disque des rotors (pilotes sur l'image)
    w, h = (int(v) for v in a.res.split("x"))
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.cycles.samples = a.samples
    dev = gpu(scene)
    scene.frame_set(a.frame)
    vs = views(a.veh, root)
    keep = [v for v in a.views.split(",") if v] or list(vs)
    os.makedirs(a.out, exist_ok=True)
    print(f"[banc] {a.veh} {a.light} barre {a.bar} : {dev}, {a.samples} éch., vues {keep}", flush=True)
    for k in keep:
        if k not in vs:
            print(f"[banc] vue inconnue {k}", flush=True)
            continue
        loc, tgt, lens = vs[k]
        cam = L.camera(f"cam_{k}", loc, tgt, lens=lens, fstop=0)
        scene.camera = cam
        scene.render.filepath = os.path.join(a.out, f"{a.veh}-{a.light}-{k}-{a.tag}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[banc] écrit {scene.render.filepath}", flush=True)


def probe_jet():
    """Les îlots du maillage du jet tel que livré : nombre de faces, emprise, alpha et émission moyens (lus sur
    les images aux UV des faces) ; pour trouver les couches transparentes du jet des tuyères."""
    import bmesh
    import numpy as np
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = cv.import_model(os.path.join(cv.CAST, cv.JETS["concept"]["file"]))
    ob = next(o for o in parts if o.type == "MESH")
    m = ob.data.materials[0]
    p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")

    def img(key):
        l = p.inputs[key].links
        n = l[0].from_node if l else None
        while n is not None and n.type != "TEX_IMAGE":
            n = n.inputs[0].links[0].from_node if n.inputs and n.inputs[0].links else None
        if n is None:
            return None
        im = n.image
        w, h = im.size
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        return px.reshape(h, w, 4)
    alpha, emit = img("Alpha"), img("Emission Color")

    def at(a, uv):
        h, w = a.shape[:2]
        return a[min(h - 1, max(0, int(uv.y * h))), min(w - 1, max(0, int(uv.x * w)))]
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    uvl = bm.loops.layers.uv.active
    bm.faces.ensure_lookup_table()
    seen, isl = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, cur = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            cur.append(g)
            for e in g.edges:
                for h2 in e.link_faces:
                    if h2.index not in seen:
                        seen.add(h2.index)
                        stack.append(h2)
        isl.append(cur)
    mw = ob.matrix_world
    print(f"[sonde] {ob.name} : {len(bm.faces)} faces, {len(isl)} îlots", flush=True)
    rows = []
    for k, fs in enumerate(isl):
        pts = [mw @ v.co for f in fs for v in f.verts]
        mn = Vector(map(min, *pts)) if len(pts) > 1 else pts[0]
        mx = Vector(map(max, *pts)) if len(pts) > 1 else pts[0]
        uvs = [sum((l[uvl].uv for l in f.loops), Vector((0, 0))) / len(f.loops) for f in fs]
        al = float(np.mean([at(alpha, u)[3] for u in uvs])) if alpha is not None else 1.0
        em = float(np.mean([at(emit, u)[:3].max() for u in uvs])) if emit is not None else 0.0
        rows.append((em * (1 - al), k, len(fs), mn, mx, al, em))
    for score, k, n, mn, mx, al, em in sorted(rows, reverse=True)[:40]:
        print(f"[sonde] îlot {k:4d} faces {n:5d} alpha {al:.2f} émission {em:.2f} "
              f"min {tuple(round(c, 2) for c in mn)} max {tuple(round(c, 2) for c in mx)}", flush=True)


if __name__ == "__main__":
    a = args()
    if a.inspect:
        inspect(a.out)
    elif a.probe:
        probe_jet()
    elif a.jobs:
        # plusieurs essais dans la même session : veh:lumière[:vue+vue[:barre]], séparés par des virgules
        import copy
        for job in a.jobs.split(","):
            f = job.split(":")
            b = copy.copy(a)
            b.veh, b.light = f[0], f[1]
            b.views = f[2].replace("+", ",") if len(f) > 2 else ""
            b.bar = f[3] if len(f) > 3 and f[3] else a.bar
            b.frame = int(f[4]) if len(f) > 4 else a.frame
            if b.frame != a.frame or b.bar != a.bar:
                b.tag = f"{a.tag}-{'eteinte' if b.bar == 'off' else 'f' + str(b.frame)}"
            run(b)
    else:
        run(a)
