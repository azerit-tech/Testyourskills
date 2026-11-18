# Les images de communication de la berline (w111) : la rotation à 360° et les photos de studio, sur le banc de
# hero_bench.py (la voiture telle que les scènes la reçoivent, bitume mouillé, éclairages types ambre, neon, helico,
# ciel). Rendu sur la carte (OptiX) de la machine louée seulement.
#
#   blender -b --factory-startup -P tools/film3d/lab/promo_car.py -- --mode rot --light neon --res 1080x1080 \
#       --frames 1-144 --samples 128 --out /root/promo/rot-neon
#   blender -b --factory-startup -P tools/film3d/lab/promo_car.py -- --mode photo --light neon --res 1080x1350 \
#       --shots av-g-bas,ar-d-feux,... --samples 256 --out /root/promo/voiture
#
# Rotation : 144 images (6 s à 24 i/s), la caméra fait un tour complet à hauteur de trois quarts bas (--height,
# 1,0 m), au 45 mm, à rayon constant (la voiture prend --fill de la largeur du cadre vue de flanc) ; l'image f est à
# l'azimut --az0 + 360 (f - 1) / 144 : l'image 144 suivie de l'image 1 boucle sans saut. Images <out>/0001.png…
# Photos : <out>/<lumière>-<vue>.png, profondeur de champ légère (f/2 à f/2,8 sur les gros plans, f/8 en pied).
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.dirname(HERE)
sys.path[:0] = [p for p in (HERE, FILM) if p not in sys.path]

# vues en pied : azimut (0 = face, positif vers la gauche de la voiture), hauteur, focale, part de la largeur, f/
FULL = {
    "av-g-bas": (32.0, 0.40, 50.0, 0.97, 8.0),        # trois quarts avant bas, la calandre et le flanc gauche
    "av-d-bas": (-32.0, 0.40, 50.0, 0.97, 8.0),
    "ar-d-feux": (-148.0, 0.55, 50.0, 0.97, 8.0),     # trois quarts arrière, les feux
    "ar-g-feux": (148.0, 0.55, 50.0, 0.97, 8.0),
    "flanc-g": (84.0, 0.62, 85.0, 0.94, 8.0),         # le flanc, compressé au 85 mm
    "face-bas": (0.0, 0.30, 35.0, 0.92, 8.0),
}


def _args():
    import argparse
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="photo", choices=("rot", "photo"))
    ap.add_argument("--light", default="neon")
    ap.add_argument("--out", required=True)
    ap.add_argument("--res", default="1080x1350")
    ap.add_argument("--samples", type=int, default=256)
    ap.add_argument("--frames", default="1-144")
    ap.add_argument("--n", type=int, default=144)
    ap.add_argument("--az0", type=float, default=35.0)
    ap.add_argument("--height", type=float, default=1.0)
    ap.add_argument("--lens", type=float, default=45.0)
    ap.add_argument("--fill", type=float, default=0.86)
    ap.add_argument("--shots", default=",".join(list(FULL) + ["calandre", "phare", "roue", "conducteur", "feu"]))
    ap.add_argument("--stop", type=float, default=0.0)
    ap.add_argument("--cabin", type=float, default=4.0)
    ap.add_argument("--disc", default="", help="rotation sur fond noir : le bitume en disque autour de la berline, "
                    "fondu au noir pur de r0 à r1 m (ex. 2.7,3.8) ; le ciel et les lampes invisibles à la caméra "
                    "(ils éclairent et se reflètent toujours)")
    ap.add_argument("--workbench", action="store_true", help="contrôle de cadrage sur le Mac (ni lumière ni matière)")
    return ap.parse_args(argv)


def _frames(spec):
    out = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += range(int(a), int(b) + 1)
        elif part:
            out.append(int(part))
    return out


def _setup(a):
    import bpy
    import hero_bench as HB
    ns = type("A", (), {})()
    ns.no_driver, ns.engine, ns.samples, ns.res = False, "cycles", a.samples, a.res
    ns.steer, ns.stop, ns.marks = 0.0, a.stop, False
    scene, car, parts = HB.build(ns)
    HB.lighting(a.light)
    if a.light == "helico":
        HB.searchlight_off_glass(car)
    if a.cabin:
        import lieux as L
        L.cabin_light({"body": car.name}, energy=a.cabin)
    scene.render.use_persistent_data = True
    if a.workbench:
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.compositing_node_group = None
    scene.render.image_settings.color_mode = "RGB"
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPTIX"
    except TypeError:
        pass
    if a.disc:
        black_stage(bpy, scene, car, *(float(v) for v in a.disc.split(",")))
    return bpy, scene, car, parts


def black_stage(bpy, scene, car, r0, r1):
    """La berline sur un disque de bitume qui se fond au noir pur (encart sur fond sombre) : au-delà de r0 la matière
    du sol glisse vers une émission nulle (ni diffus ni reflet), noire à r1 ; le ciel vu directement par la caméra est
    noir (ses reflets sur la caisse restent) ; les néons et lampes ne se voient plus en direct."""
    g = bpy.data.objects.get("wet_asphalt")
    keep = {car, *car.children_recursive}
    if g is not None:
        for m in g.data.materials:
            nt = m.node_tree
            out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output)
            src = out.inputs["Surface"].links[0].from_socket
            geo = nt.nodes.new("ShaderNodeNewGeometry")
            sep = nt.nodes.new("ShaderNodeSeparateXYZ")
            nt.links.new(geo.outputs["Position"], sep.inputs[0])
            hyp = nt.nodes.new("ShaderNodeVectorMath")
            hyp.operation = "LENGTH"
            comb = nt.nodes.new("ShaderNodeCombineXYZ")
            nt.links.new(sep.outputs[0], comb.inputs[0])
            nt.links.new(sep.outputs[1], comb.inputs[1])
            nt.links.new(comb.outputs[0], hyp.inputs[0])
            mr = nt.nodes.new("ShaderNodeMapRange")
            mr.interpolation_type = "SMOOTHSTEP"
            mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = r0, r1
            nt.links.new(hyp.outputs["Value"], mr.inputs["Value"])
            black = nt.nodes.new("ShaderNodeEmission")
            black.inputs["Strength"].default_value = 0.0
            mix = nt.nodes.new("ShaderNodeMixShader")
            nt.links.new(mr.outputs["Result"], mix.inputs[0])
            nt.links.new(src, mix.inputs[1])
            nt.links.new(black.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], out.inputs["Surface"])
    w = scene.world.node_tree
    wout = next(n for n in w.nodes if n.type == "OUTPUT_WORLD" and n.is_active_output)
    wsrc = wout.inputs["Surface"].links[0].from_socket
    lp = w.nodes.new("ShaderNodeLightPath")
    nul = w.nodes.new("ShaderNodeBackground")
    nul.inputs["Strength"].default_value = 0.0
    mix = w.nodes.new("ShaderNodeMixShader")
    nt_l = w.links
    nt_l.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt_l.new(wsrc, mix.inputs[1])
    nt_l.new(nul.outputs[0], mix.inputs[2])
    nt_l.new(mix.outputs[0], wout.inputs["Surface"])
    for ob in scene.objects:
        if ob not in keep and ob is not g and ob.type in ("MESH", "LIGHT"):
            ob.visible_camera = False


def _new_cam(bpy, scene, name, lens):
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.clip_start, cd.clip_end = lens, 0.02, 2000
    cam = bpy.data.objects.new(name, cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def _look(cam, target):
    from mathutils import Vector
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def _corners(parts):
    import hero_bench as HB
    from mathutils import Vector
    mn, mx = HB._bbox(parts)
    return mn, mx, [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]


def _place_full(bpy, cam, parts, az, z, fill, aim_z=0.60):
    """La caméra à l'azimut `az`, hauteur z, reculée à plat jusqu'à ce que la voiture prenne `fill` du cadre en
    largeur (ou 92 % en hauteur, le premier atteint)."""
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector
    sc = bpy.context.scene
    mn, mx, corners = _corners(parts)
    c = (mn + mx) / 2
    target = Vector((c.x, c.y, aim_z))
    a = math.radians(az)
    u = Vector((math.sin(a), -math.cos(a), 0.0))
    lo, hi = 1.0, 40.0
    for _ in range(32):
        k = (lo + hi) / 2
        cam.location = Vector((c.x, c.y, z)) + u * k
        _look(cam, target)
        bpy.context.view_layer.update()
        pts = [world_to_camera_view(sc, cam, p) for p in corners]
        xs, ys = [p.x for p in pts], [p.y for p in pts]
        if max(xs) - min(xs) > fill or max(ys) - min(ys) > 0.92:
            lo = k
        else:
            hi = k
    return (cam.location - target).length


def rotation(a):
    bpy, scene, car, parts = _setup(a)
    from mathutils import Vector
    cam = _new_cam(bpy, scene, "cam_rot", a.lens)
    # le rayon : celui où la voiture, vue de flanc (sa plus grande largeur), prend --fill du cadre
    _place_full(bpy, cam, parts, 90.0, a.height, a.fill)
    mn, mx, _ = _corners(parts)
    c = (mn + mx) / 2
    r = (Vector((cam.location.x, cam.location.y)) - Vector((c.x, c.y))).length
    target = Vector((c.x, c.y, 0.58))
    dist = (cam.location - target).length
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = dist
    cam.data.dof.aperture_fstop = 5.6
    os.makedirs(a.out, exist_ok=True)
    print(f"[promo] rotation {a.light} : rayon {r:.2f} m, hauteur {a.height} m, {a.lens:.0f} mm", flush=True)
    for f in _frames(a.frames):
        p = os.path.join(a.out, f"{f:04d}.png")
        if os.path.exists(p):
            continue
        az = math.radians(a.az0 + 360.0 * (f - 1) / a.n)
        cam.location = Vector((c.x + r * math.sin(az), c.y - r * math.cos(az), a.height))
        _look(cam, target)
        scene.render.filepath = p[:-4] + ".part.png"
        t = time.time()
        bpy.ops.render.render(write_still=True)
        os.replace(p[:-4] + ".part.png", p)
        print(f"[promo] {p} en {time.time() - t:.1f} s", flush=True)


def _close(view, car, mn, mx):
    """Les gros plans : (position, visée, focale, f/), repère du banc (l'avant vers -y, la gauche vers +x)."""
    wheels = {o.name.split("_")[-1]: o for o in car.children if o.name.startswith("wheel_")}
    shots = {
        # la calandre et ses chromes, de trois quarts bas, au 85 mm
        "calandre": ((1.10, mn.y - 2.60, 0.52), (0.05, mn.y + 0.05, 0.62), 85.0, 2.8),
        # le phare avant gauche, de près, le flanc qui fuit derrière
        "phare": ((1.35, mn.y - 1.15, 0.66), (0.62, mn.y + 0.12, 0.68), 85.0, 2.0),
        # le feu arrière gauche
        "feu": ((1.45, mx.y + 1.35, 0.70), (0.58, mx.y - 0.05, 0.74), 85.0, 2.0),
        # le conducteur ganté derrière le pare-brise, de trois quarts avant (le cadre de hero_bench)
        "conducteur": ((1.25, mn.y - 1.90, 1.18), (0.40, 0.05, 1.02), 50.0, 2.8),
    }
    if view == "roue":
        w = wheels.get("FL") or next(iter(wheels.values()))
        p = w.matrix_world.translation
        return ((p.x + 1.55, p.y - 0.75, 0.42), (p.x, p.y, p.z), 70.0, 2.8)
    return shots[view]


def photos(a):
    bpy, scene, car, parts = _setup(a)
    from mathutils import Vector
    os.makedirs(a.out, exist_ok=True)
    mn, mx, _ = _corners(parts)
    for v in [s for s in a.shots.split(",") if s]:
        p = os.path.join(a.out, f"{a.light}-{v}.png")
        if os.path.exists(p):
            continue
        if v in FULL:
            az, z, lens, fill, fstop = FULL[v]
            cam = _new_cam(bpy, scene, f"cam_{v}", lens)
            dist = _place_full(bpy, cam, parts, az, z, fill)
        else:
            loc, tgt, lens, fstop = _close(v, car, mn, mx)
            cam = _new_cam(bpy, scene, f"cam_{v}", lens)
            cam.location = Vector(loc)
            _look(cam, tgt)
            dist = (Vector(loc) - Vector(tgt)).length
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = dist
        cam.data.dof.aperture_fstop = fstop
        scene.render.filepath = p[:-4] + ".part.png"
        t = time.time()
        bpy.ops.render.render(write_still=True)
        os.replace(p[:-4] + ".part.png", p)
        print(f"[promo] {p} en {time.time() - t:.1f} s", flush=True)
        bpy.data.objects.remove(cam)


def main():
    a = _args()
    (rotation if a.mode == "rot" else photos)(a)


if __name__ == "__main__":
    main()
