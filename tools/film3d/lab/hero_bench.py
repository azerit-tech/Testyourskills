# Le banc d'essai de la berline (w111) en plan rapproché : la voiture seule, telle que les scènes la reçoivent
# (scene_a.street_hero : conducteur assis, phares et feux allumés), sur un bitume mouillé sombre, sous les trois
# éclairages types du film, vue à hauteur de moyeu (0,45 m) à 60 % de la largeur du cadre.
#
#   ambre   l'avenue : lampadaires ambre en hauteur, ciel de l'heure bleue
#   helico  le port : projecteur froid d'hélicoptère, à 30 m, dans une brume légère, nuit noire
#   neon    la rue des enseignes : néons corail et lilas de part et d'autre, nuit noire
#   ciel    le ciel de nuit violet seul, sans lampe (FIN, FIN6) : ce que le vernis et les vitres en renvoient
#
# Vues (repère de street_hero : l'avant vers -y, la gauche vers +x) : face, av-g, av-d, flanc-g, flanc-d, ar-g,
# ar-d, dos ; gros plans : roue (avant gauche), calandre, phare (avant gauche), feu (arrière gauche), capot, coffre,
# conducteur (à travers le pare-brise), volant (depuis la place du passager, sans le conducteur), dessous (0,18 m).
#
#   blender -b --factory-startup -P tools/film3d/lab/hero_bench.py -- --out <dossier> --tag avant \
#       --lights ambre,helico,neon --views face,av-g,... --samples 64
#   python3 tools/film3d/lab/hero_bench.py --compose <planche.png> --cols 4 <img> ...   (ffmpeg, sans Blender)
#
# Chaque image s'écrit <out>/<tag>-<lumière>-<vue>.png. --marks pose les repères de rotation de motion.wheel_marks
# sur les roues (ils doivent rester invisibles en Cycles). Rendu sur la carte (OptiX) hors du Mac seulement.
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.dirname(HERE)

VIEWS = {
    # azimut (0 = face, positif vers la gauche de la voiture), hauteur de l'objectif, focale
    "face": (0.0, 0.45, 28.0),
    "av-g": (35.0, 0.45, 28.0),
    "av-d": (-35.0, 0.45, 28.0),
    "flanc-g": (90.0, 0.45, 28.0),
    "flanc-d": (-90.0, 0.45, 28.0),
    "ar-g": (145.0, 0.45, 28.0),
    "ar-d": (-145.0, 0.45, 28.0),
    "dos": (180.0, 0.45, 28.0),
}
CLOSE = ("roue", "calandre", "phare", "feu", "capot", "coffre", "conducteur", "volant", "dessous")
WIDTH = 0.60        # la part de la largeur du cadre prise par la voiture (45 à 70 % dans le film)


def _args():
    import argparse
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.expanduser("~/film/iter-berline"))
    ap.add_argument("--tag", default="essai")
    ap.add_argument("--lights", default="ambre,helico,neon")
    ap.add_argument("--views", default=",".join(VIEWS))
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--res", default="720x1280")
    ap.add_argument("--marks", action="store_true", help="repères de rotation sur les roues (contrôle)")
    ap.add_argument("--no-driver", action="store_true")
    ap.add_argument("--fill", default="", help="la source de face de lieux.car_fill (P4) : on, ou noglossy "
                                               "(invisible aux reflets)")
    ap.add_argument("--compose", default="", help="planche : chemin de sortie, puis les images")
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--cell", default="360x640")
    ap.add_argument("images", nargs="*")
    return ap.parse_args(argv)


# ---------------------------------------------------------------- planche (ffmpeg seul)

def compose(out, paths, cols, cell):
    """Les images en grille, chacune légendée de son nom de fichier (sans le chemin), fond sombre."""
    import subprocess
    w, h = cell
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in paths:
        args += ["-i", p]
    f = []
    for i, p in enumerate(paths):
        txt = os.path.splitext(os.path.basename(p))[0].replace(":", " ")
        lab = f",drawtext=fontfile={font}:text='{txt}':x=8:y=h-24:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.55" \
            if os.path.exists(font) else ""
        f.append(f"[{i}:v]scale={w}:{h}:flags=lanczos,setsar=1{lab}[v{i}]")
    n = len(paths)
    layout = "|".join(f"{(i % cols) * (w + 6)}_{(i // cols) * (h + 6)}" for i in range(n))
    f.append("".join(f"[v{i}]" for i in range(n)) + f"xstack=inputs={n}:layout={layout}:fill=0x101114[o]")
    args += ["-filter_complex", ";".join(f), "-map", "[o]", "-frames:v", "1", out]
    r = subprocess.run(args, capture_output=True, text=True)
    print(f"[banc] {'écrit ' + out if r.returncode == 0 else 'ffmpeg : ' + r.stderr[-600:]}", flush=True)


# ---------------------------------------------------------------- la scène

def _gpu(scene):
    import bpy
    if sys.platform == "darwin":        # jamais la carte graphique du Mac (règle machine)
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
            scene.cycles.device = "GPU"
            return kind
    return "CPU"


def _world(cv, cvr, strength):
    cvr.dusk_world(cv)
    bg = next(n for n in __import__("bpy").context.scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Strength"].default_value = strength


def _emit_panel(name, loc, size, normal, color, strength):
    """Un néon : une plaque émissive (vue par la caméra et dans les reflets), tournée vers `normal`."""
    import bmesh
    import bpy
    from mathutils import Matrix, Vector
    import cast_vehicles as cv
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5,
                          matrix=Matrix.Diagonal((size[0], size[1], 1, 1)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(cv.mat_emit(name, color, strength))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector(normal).normalized().to_track_quat("Z", "Y")
    return ob


def _haze(density=0.006):
    """La brume légère du port : une boîte de volume autour de la voiture et du faisceau."""
    import bpy
    import cast_vehicles as cv
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 16))
    ob = bpy.context.active_object
    ob.name = "haze"
    ob.scale = (60, 60, 32)
    m, nt, out = cv._mat("bench_haze")
    v = nt.nodes.new("ShaderNodeVolumePrincipled")
    v.inputs["Density"].default_value = density
    v.inputs["Anisotropy"].default_value = 0.35
    v.inputs["Color"].default_value = (0.85, 0.88, 0.95, 1)
    nt.links.new(v.outputs[0], out.inputs["Volume"])
    ob.data.materials.append(m)
    ob.visible_shadow = False
    return ob


def lighting(kind):
    """Les trois éclairages types (la voiture au centre, l'avant vers -y)."""
    import cast_vehicles as cv
    import cast_vehicles_render as cvr
    import scene_a as A
    lin = cv.lin
    if kind == "ciel":
        # le ciel de nuit violet seul, sans lampe (FIN, FIN6) : ce que le vernis et les vitres en renvoient
        _world(cv, cvr, 0.9)
        return
    if kind == "ambre":
        # l'avenue (OUV, P1) : un lampadaire qui plonge sur la caisse côté gauche avant, un derrière à droite, un loin
        _world(cv, cvr, 0.55)
        cvr.street_spot((4.6, -3.2, 7.2), (0.0, 0.0, 0.7), 5200.0)
        cvr.street_lamp((-5.5, 5.5, 7.5), 1400.0)
        cvr.street_lamp((-4.5, -22.0, 7.5), 2600.0)
        cvr.street_lamp((5.0, 24.0, 7.5), 2600.0)
    elif kind == "helico":
        # le port (P5, FIN6) : la nuit, le projecteur froid à 30 m, un mât d'éclairage ambre loin, la brume
        _world(cv, cvr, 0.14)
        A.add_light("bench_searchlight", "SPOT", (9.0, 10.0, 30.0), (-9.0, -10.0, -29.3), lin("#dfe8ff"), 1.2e6,
                    spot=7.0)
        cvr.street_lamp((-30.0, 18.0, 14.0), 9000.0, "#ffc36b")
        _haze()
    elif kind == "neon":
        # la rue des enseignes (P2, P3) : néons corail à gauche, lilas à droite, à 3 m de haut, 4 m de la caisse ;
        # chaque néon éclaire par une nappe de sa couleur (la plaque seule serait bruitée)
        _world(cv, cvr, 0.10)
        for name, x, y, z, col in (("corail_a", 4.2, -2.0, 3.0, A.CORAL), ("corail_b", 4.4, 4.5, 2.6, A.CORAL),
                                   ("lilas_a", -4.2, 1.0, 3.2, A.LILAC), ("lilas_b", -4.4, -5.5, 2.7, A.LILAC)):
            n = (-1.0 if x > 0 else 1.0, 0.0, -0.15)
            _emit_panel(f"neon_{name}", (x, y, z), (0.08, 1.8), n, col, 30.0)
            A.add_light(f"neon_{name}_l", "AREA", (x - 0.1 * (1 if x > 0 else -1), y, z), n, lin(col), 260.0, (1.8, 0.3))
        cvr.street_lamp((0.0, 18.0, 6.0), 400.0, "#fff0dc")
    else:
        raise SystemExit(f"éclairage inconnu {kind}")


def car_fill(car, glossy=True, loc=(0.4, -8.0, 2.2), energy=500.0, size=4.0):
    """La source douce de face de lieux.car_fill (P4 : 500 W, disque de 4 m, 8 m devant, 2,2 m de haut), liée à la
    seule voiture, invisible à la caméra ; glossy=False la retire aussi des reflets."""
    import bpy
    from mathutils import Vector
    import cast_vehicles as cv
    col = bpy.data.collections.new("bench_fill_recoit")
    for o in [car, *car.children_recursive]:
        if o.type == "MESH":
            col.objects.link(o)
    d = bpy.data.lights.new("bench_fill", "AREA")
    d.shape, d.size, d.energy, d.color = "DISK", size, energy, cv.lin("#f2e4d4")[:3]
    lo = bpy.data.objects.new("bench_fill", d)
    bpy.context.scene.collection.objects.link(lo)
    lo.location = loc
    lo.rotation_mode = "QUATERNION"
    lo.rotation_quaternion = (Vector((0.0, 0.0, 0.8)) - Vector(loc)).to_track_quat("-Z", "Y")
    lo.visible_camera = False
    lo.visible_volume_scatter = False
    lo.visible_glossy = glossy
    lo.light_linking.receiver_collection = col
    return lo


def _bbox(objs):
    from mathutils import Vector
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector(map(min, *pts)), Vector(map(max, *pts))


def _fit(cam, corners, target, width):
    """Recule la caméra le long de son axe jusqu'à ce que la voiture prenne `width` de la largeur du cadre."""
    import bpy
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    d0 = cam.location - target
    lo, hi = 0.5, 20.0
    for _ in range(30):
        k = (lo + hi) / 2
        cam.location = target + d0.normalized() * k
        bpy.context.view_layer.update()
        xs = [world_to_camera_view(sc, cam, p).x for p in corners]
        if max(xs) - min(xs) > width:
            lo = k
        else:
            hi = k
    return k


def _look(ob, target):
    from mathutils import Vector
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()


def camera(car, parts, view):
    """La caméra d'une vue ; renvoie l'objet caméra."""
    import bpy
    from mathutils import Vector
    cd = bpy.data.cameras.new(f"cam_{view}")
    cd.clip_start = 0.02
    cd.clip_end = 2000
    cam = bpy.data.objects.new(f"cam_{view}", cd)
    bpy.context.scene.collection.objects.link(cam)
    mn, mx = _bbox(parts)
    c = (mn + mx) / 2
    if view in VIEWS:
        az, z, lens = VIEWS[view]
        cd.lens = lens
        a = math.radians(az)
        target = Vector((c.x, c.y, 0.62))
        cam.location = Vector((c.x + 8 * math.sin(a), c.y - 8 * math.cos(a), z))
        _look(cam, target)
        corners = [Vector((x, y, zz)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for zz in (mn.z, mx.z)]
        # la visée reste à hauteur constante : la caméra recule à plat (z fixe)
        _fit(cam, corners, Vector((target.x, target.y, z)), WIDTH)
        _look(cam, target)
        return cam
    wheels = {k: o for k, o in ((o.name.split("_")[-1], o) for o in car.children) if o.name.startswith("wheel_")}
    shots = {
        # gros plans (position, visée, focale)
        "calandre": ((0.45, mn.y - 1.55, 0.62), (0.0, mn.y + 0.05, 0.60), 50.0),
        "phare": ((0.95, mn.y - 0.75, 0.70), (0.62, mn.y + 0.10, 0.68), 50.0),
        "feu": ((1.25, mx.y + 1.05, 0.62), (0.58, mx.y - 0.02, 0.72), 50.0),
        "capot": ((0.55, mn.y - 1.25, 1.55), (0.0, mn.y + 0.75, 0.86), 40.0),
        "coffre": ((-0.45, mx.y + 1.35, 1.45), (0.0, mx.y - 0.40, 0.86), 40.0),
        "conducteur": ((1.25, mn.y - 1.9, 1.18), (0.40, 0.05, 1.02), 50.0),
        "volant": ((-0.25, 0.25, 1.12), (0.42, -0.55, 0.87), 35.0),
        "dessous": ((3.1, -1.2, 0.18), (0.0, 0.0, 0.22), 24.0),
    }
    if view == "roue":
        w = wheels.get("FL") or next(iter(wheels.values()))
        p = w.matrix_world.translation
        cd.lens = 50.0
        cam.location = (p.x + 1.30, p.y - 0.30, 0.40)
        _look(cam, p)
        return cam
    # les cadres du film : P4 de face au 200 mm à 45 m, 1,2 m de haut ; P1 de trois quarts avant droit, 12 m devant,
    # 2,8 m à droite, 0,5 m, 50 mm
    shots["p4"] = ((0.0, mn.y - 45.0, 1.2), (0.0, mn.y, 0.70), 200.0)
    shots["p1"] = ((-2.8, mn.y - 12.0, 0.5), (0.0, c.y, 0.75), 50.0)
    loc, tgt, lens = shots[view]
    cd.lens = lens
    cam.location = loc
    _look(cam, tgt)
    return cam


def build(a):
    import bpy
    sys.path[:0] = [p for p in (HERE, FILM) if p not in sys.path]
    if a.no_driver:
        os.environ["FILM3D_DRIVER"] = "0"
    import scene_a as A
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    A.render_settings(scene)
    dev = _gpu(scene)
    w, h = (int(v) for v in a.res.split("x"))
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.cycles.samples = a.samples
    import cast_vehicles as cv
    import cast_vehicles_render as cvr
    cvr.wet_ground(cv)
    car = A.street_hero(scene)
    car.location = (0, 0, 0)
    car.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    if a.marks:
        import motion as M
        M.wheel_marks([o for o in car.children if o.name.startswith("wheel_")], car["wheel_r"])
    parts = [car] + [o for o in car.children if o.type == "MESH" and (o.name.startswith(("wheel_", "hero_")))]
    print(f"[banc] berline posée, {dev}, {a.samples} échantillons, {w} × {h}", flush=True)
    return scene, car, parts


def main():
    a = _args()
    if a.compose:
        compose(a.compose, a.images, a.cols, tuple(int(v) for v in a.cell.split("x")))
        return
    import time
    import bpy
    os.makedirs(a.out, exist_ok=True)
    views = [v for v in a.views.split(",") if v]
    for kind in [k for k in a.lights.split(",") if k]:
        scene, car, parts = build(a)
        lighting(kind)
        if a.fill:
            car_fill(car, glossy=a.fill != "noglossy")
        driver = [o for o in car.children_recursive if o.type == "ARMATURE"]
        driver += [o for d in driver for o in d.children_recursive]
        for v in views:
            cam = camera(car, parts, v)
            scene.camera = cam
            cam.data.dof.use_dof = False
            # le volant se regarde sans le conducteur (ses bras cachent le moyeu)
            for o in driver:
                o.hide_render = v == "volant"
            p = os.path.join(a.out, f"{a.tag}-{kind}-{v}.png")
            scene.render.filepath = p
            t = time.time()
            bpy.ops.render.render(write_still=True)
            print(f"[banc] écrit {p} en {time.time() - t:.0f} s", flush=True)
            bpy.data.objects.remove(cam)


if __name__ == "__main__":
    main()
