# Planches du laboratoire des véhicules (appelé par cast_vehicles.py en __main__).
#
#   blender -b -t 2 --factory-startup -P tools/film3d/lab/cast_vehicles.py -- --sheet patrouille-choisie [--samples 128]  (rendu GPU Metal)
#
# --sheet van | helico | avion | props : candidats côte à côte, studio gris éclairé de face,
#   la patrouille à gauche pour l'échelle ; écrit ref/lab/cast-vehicules-comparatif-<sheet>.png
# --sheet crepuscule : les retenus à l'heure bleue (rampes et projecteur allumés) ;
#   écrit ref/lab/cast-vehicules-comparatif-crepuscule.png et assets/cast/lab-vehicles.blend
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", default="van")
    ap.add_argument("--samples", type=int, default=128)
    ap.add_argument("--res", default="")
    ap.add_argument("--pct", type=int, default=100)
    ap.add_argument("--debug-rotors", action="store_true")
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--only", default="", help="plans à refaire, ex. patrol-crownvic,van-vandura")
    ap.add_argument("--reuse", action="store_true", help="garde les plans déjà rendus")
    return ap.parse_args(argv)


def use_gpu():
    """Cycles sur la carte graphique (Metal) ; renvoie True si un périphérique Metal est actif."""
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    ok = False
    for d in prefs.devices:
        d.use = d.type == "METAL"
        ok = ok or d.use
    print(f"[lab] GPU Metal : {'oui' if ok else 'non'} ({', '.join(d.name for d in prefs.devices if d.use)})", flush=True)
    return ok


def setup_render(w, h, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU" if use_gpu() else "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.max_bounces = 6
    sc.cycles.transparent_max_bounces = 8
    sc.render.threads_mode = "FIXED"
    sc.render.threads = 2
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast" if "AgX - Medium High Contrast" in [
        i.identifier for i in sc.view_settings.bl_rna.properties["look"].enum_items] else "None"


def area(name, loc, target, size, energy, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, "AREA")
    d.size = size
    d.energy = energy
    d.color = color
    ob = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    look_at(ob, target)
    return ob


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def camera(loc, target, lens=50.0, ortho=None):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cd.clip_end = 2000
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho
    cam = bpy.data.objects.new("cam", cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    look_at(cam, target)
    bpy.context.scene.camera = cam
    return cam


def studio(cv, span, depth=40.0, height=30.0):
    """Sol et fond gris d'un seul tenant (cyclo), monde gris neutre."""
    import bmesh
    from mathutils import Matrix
    w = bpy.data.worlds.new("studio")
    bpy.context.scene.world = w
    if hasattr(w, "use_nodes"):
        w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.16, 0.16, 0.17, 1)
    bg.inputs["Strength"].default_value = 0.6
    bm = bmesh.new()
    # profil en L arrondi, extrudé le long de x
    pts = []
    R = 8.0
    for i in range(0, 13):
        a = math.radians(90 * i / 12)
        pts.append((depth - R + R * math.sin(a), R - R * math.cos(a)))
    prof = [(-depth, 0.0)] + pts + [(depth, height)]
    half = span / 2 + 30
    verts = []
    for x in (-half, half):
        row = [bm.verts.new((x, y, z)) for y, z in prof]
        verts.append(row)
    for i in range(len(prof) - 1):
        bm.faces.new((verts[0][i], verts[1][i], verts[1][i + 1], verts[0][i + 1]))
    me = bpy.data.meshes.new("cyclo")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(cv.mat_plain("studio_grey", "#8a8b8e", rough=0.7))
    ob = bpy.data.objects.new("cyclo", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def label(text, loc, size=0.5, rot_z=0.0):
    cu = bpy.data.curves.new(f"lbl_{text}", "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "CENTER"
    ob = bpy.data.objects.new(f"lbl_{text}", cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    from cast_vehicles import mat_plain
    cu.materials.append(mat_plain("label_ink", "#15161a", rough=0.8))
    return ob


def frame(total, lens, elev, target_z, aspect=1.0, margin=1.12):
    """Caméra de face qui cadre une rangée de largeur total (le capteur fait 36 mm de large)."""
    half = math.atan(18.0 / lens)
    d = total / 2 * margin / math.tan(half)
    cam = camera((0, -d * math.cos(math.radians(elev)), target_z + d * math.sin(math.radians(elev))), (0, 0, target_z), lens=lens)
    return cam


def place(ob, x, y=0.0, yaw=0.0, z=0.0):
    ob.rotation_mode = "XYZ"
    ob.location = (x, y, z)
    ob.rotation_euler = (0, 0, math.radians(yaw))


def row(cv, items, gap, yaw, label_size=0.45, label_dy=-1.0, y=0.0):
    """Pose les objets (racines) côte à côte le long de x, chacun tourné de yaw ; renvoie la largeur totale."""
    sizes = []
    for ob, _ in items:
        kids = [ob] + [c for c in ob.children_recursive if c.type == "MESH"]
        mn, mx = cv.bbox(kids)
        sizes.append(max(mx.x - mn.x, mx.y - mn.y))
    total = sum(sizes) + gap * (len(items) - 1)
    x = -total / 2
    for (ob, name), s in zip(items, sizes):
        cx = x + s / 2
        place(ob, cx, y, yaw)
        label(name, (cx, y - s / 2 + label_dy, 0.005), label_size)
        x += s + gap
    return total


def build_sheet(cv, which, debug=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    patrol = cv.load_patrol("classic")["body"]
    yaw = -35.0
    if which == "van":
        items = [(patrol, "patrouille 5,1 m")]
        for v in ("md84", "shvan", "swat"):
            d = cv.load_van(v)
            items.append((d["body"], f"{v} {d['length']:.1f} x {d['height']:.1f} m  {d['tris'] // 1000}k"))
            print(f"[lab] van {v}: {d['length']:.2f} m, {d['height']:.2f} m, {d['tris']} tris")
        total = row(cv, items, 2.2, yaw)
        studio(cv, total)
        frame(total, 60, 9, 1.3)
        key_target = (0, 0, 1.2)
        res = (1800, 700)
    elif which == "helico":
        items = [(patrol, "patrouille")]
        for v in ("pranav", "ec135", "irs"):
            d = cv.load_helicopter(v)
            if debug:
                red = cv.mat_emit("dbg_red", "#ff2020", 3.0)
                blue = cv.mat_emit("dbg_blue", "#2050ff", 3.0)
                cv._assign([d["rotor_main"]], red)
                cv._assign([d["rotor_tail"]], blue)
                d["rotor_main"].rotation_euler.z += math.radians(45)
                d["rotor_tail"].rotation_euler.y += math.radians(60)
            items.append((d["body"], f"{v} {d['length']:.1f} m  {d['tris'] // 1000}k"))
            print(f"[lab] heli {v}: {d['length']:.2f} m, {d['tris']} tris, main axis {tuple(round(a, 2) for a in d['main_axis'])}, tail axis {tuple(round(a, 2) for a in d['tail_axis'])}")
        total = row(cv, items, 2.5, yaw, label_size=0.8, label_dy=-1.2)
        studio(cv, total, depth=60, height=40)
        frame(total, 55, 10, 1.8)
        key_target = (0, 0, 1.5)
        res = (1800, 700)
    elif which == "avion":
        items = [(patrol, "patrouille")]
        for v in ("concept", "h900"):
            d = cv.load_jet(v, nav_lights=False)
            items.append((d["body"], f"{v} {d['length']:.1f} x {d['span']:.1f} m  {d['tris'] // 1000}k"))
            print(f"[lab] jet {v}: {d['length']:.2f} m, span {d['span']:.2f}, {d['tris']} tris")
        total = row(cv, items, 3.0, yaw, label_size=1.0, label_dy=-1.5)
        studio(cv, total, depth=70, height=40)
        frame(total, 55, 22, 0.8)
        key_target = (0, 0, 1.0)
        res = (1800, 800)
    elif which == "props":
        front = ("barrier", "barrier_concrete", "barrier_concrete_02", "barrier_fence", "cone", "cone_worn", "spike_strip")
        back = ("light_tower", "light_tower_chen", "floodlight")
        rows = {"front": [], "back": [(patrol, "patrouille 5,1 m")]}
        for k in front + back:
            ob = cv.load_prop(k)
            mn, mx = cv.bbox([ob])
            rows["front" if k in front else "back"].append((ob, f"{k.replace('_', ' ')} {mx.z - mn.z:.2f} m"))
            print(f"[lab] prop {k}: {mx.x - mn.x:.2f} x {mx.y - mn.y:.2f} x {mx.z - mn.z:.2f} m, {cv.tris([ob])} tris")
        t1 = row(cv, rows["front"], 0.8, -20.0, label_size=0.2, label_dy=-0.45, y=-2.5)
        t2 = row(cv, rows["back"], 1.5, -20.0, label_size=0.3, label_dy=-0.6, y=3.0)
        total = max(t1, t2)
        studio(cv, total)
        frame(total, 50, 16, 0.7, margin=1.05)
        key_target = (0, 0, 0.6)
        res = (1800, 800)
    else:
        raise SystemExit(f"planche inconnue {which}")
    # clé douce de face-gauche, petit débouché à droite, contre-jour léger ; l'énergie suit la taille de la rangée
    k = max(1.0, total / 25.0) ** 0.75
    area("key", (-0.3 * total, -0.45 * total, 0.35 * total), key_target, 0.5 * total, 9000.0 * k * k)
    area("fill", (0.45 * total, -0.4 * total, 0.08 * total), key_target, 0.35 * total, 2000.0 * k * k)
    area("rim", (0, 0.4 * total, 0.3 * total), key_target, 0.4 * total, 3500.0 * k * k)
    return res


def build_dusk(cv):
    """Les retenus ensemble à l'heure bleue du film : patrouille, fourgon, hélicoptère (projecteur sur le fourgon),
    avion, barrage ; ciel étalonné, bitume mouillé, lampadaire ambre, brume."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    dusk_world(cv)
    wet_ground(cv, size=400.0)
    patrol = cv.load_patrol(lights_on=True)
    place(patrol["body"], -4.0, -1.0, 150)
    van = cv.load_van(lights_on=True)
    place(van["body"], 4.5, 2.5, 200)
    heli = cv.load_helicopter(searchlight_on=True)
    place(heli["body"], 1.0, 14.0, 160, z=11.0)
    sc.view_layer.update()
    cv.aim_searchlight(heli, van["body"].matrix_world.translation + Vector((0, 0, 1.0)))
    jet = cv.load_jet("concept")
    place(jet["body"], -10.0, 45.0, 200, z=24.0)
    jet["body"].rotation_euler.x = math.radians(-12)
    props = cv.load_props(lights_on=True)
    for x in (-5.2, -3.0, 1.6, 3.8):
        inst = props["barrier_fence"].copy()
        sc.collection.objects.link(inst)
        place(inst, x, -7.5, 2)
    place(props["barrier_fence"], 6.0, -7.5, -4)
    place(props["barrier_concrete"], -9.5, -6.0, 75)
    place(props["barrier_concrete_02"], -8.0, -8.2, 80)
    for i in range(7):
        c = props["cone_worn"].copy()
        sc.collection.objects.link(c)
        place(c, -6.0 + i * 2.0, -9.5, i * 17)
    place(props["cone_worn"], 8.0, -9.0)
    place(props["spike_strip"], 0.0, -12.0, 0)
    place(props["light_tower"], 10.5, -3.5, 135)
    street_spot((-9.0, -12.0, 7.5), (0.0, 0.0, 0.5), 9000.0, angle=90.0)
    street_lamp((-14.0, 10.0, 7.5), 2600.0)
    bpy.ops.mesh.primitive_cube_add(size=1)
    fog = bpy.context.active_object
    fog.name = "fog"
    fog.scale = (40, 40, 16)
    fog.location = (0, 8, 8)
    fm, fnt, fout = cv._mat("fog")
    vol = fnt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = 0.01
    vol.inputs["Color"].default_value = (0.72, 0.7, 0.85, 1)
    fnt.links.new(vol.outputs[0], fout.inputs["Volume"])
    fog.data.materials.append(fm)
    fog.visible_shadow = False
    camera((-2.0, -22.0, 3.0), (1.0, 6.0, 5.0), lens=26)
    return (1280, 720), dict(patrol=patrol, van=van, heli=heli, jet=jet, props=props)


# ---------------------------------------------------------------- plans rapprochés à l'heure bleue

def dusk_world(cv, strength=0.35, rot=-90.0, graded=True):
    sc = bpy.context.scene
    w = bpy.data.worlds.new("dusk")
    sc.world = w
    if hasattr(w, "use_nodes"):
        w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes.get("Background")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(cv.ASSETS, "qwantani_dusk_2_puresky_2k.exr"))
    mapping = nt.nodes.new("ShaderNodeMapping")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["Generated"], mapping.inputs[0])
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(rot))
    nt.links.new(mapping.outputs[0], env.inputs[0])
    if not graded:
        nt.links.new(env.outputs[0], bg.inputs[0])
        bg.inputs["Strength"].default_value = strength
        return
    # l'étalonnage du ciel de scene_a.py : HDRI réel ramené à la palette de l'heure bleue par l'élévation,
    # bande corail du côté du couchant (+y), sa luminance comprimée garde les nuages
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    elev = cv._math(nt, "MAXIMUM", sep.outputs[2], 0.0)
    toward = cv._math(nt, "POWER", cv._math(nt, "MAXIMUM", sep.outputs[1], 0.0), 3.0)

    def ramp(fac, stops):
        r = nt.nodes.new("ShaderNodeValToRGB")
        nt.links.new(fac, r.inputs[0])
        el = r.color_ramp.elements
        while len(el) < len(stops):
            el.new(0.5)
        for e, (pos, col) in zip(el, stops):
            e.position = pos
            e.color = cv.lin(col)
        return r.outputs[0]
    dusk = ramp(elev, [(0.0, "#ff6a3d"), (0.03, "#b9586f"), (0.08, "#4b4fb8"), (0.3, "#303c80"), (0.7, "#243152")])
    night = ramp(elev, [(0.0, "#3c3f86"), (0.1, "#2f3a78"), (0.5, "#243152")])
    tint = nt.nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    nt.links.new(toward, tint.inputs["Factor"])
    nt.links.new(night, tint.inputs[6])
    nt.links.new(dusk, tint.inputs[7])
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(env.outputs[0], bw.inputs[0])
    lum = cv._math(nt, "MULTIPLY", cv._math(nt, "POWER", bw.outputs[0], 0.5), 0.9)
    gr = nt.nodes.new("ShaderNodeMix")
    gr.data_type = "RGBA"
    gr.blend_type = "MULTIPLY"
    gr.inputs["Factor"].default_value = 1.0
    nt.links.new(tint.outputs[2], gr.inputs[6])
    nt.links.new(lum, gr.inputs[7])
    fin = nt.nodes.new("ShaderNodeMix")
    fin.data_type = "RGBA"
    fin.inputs["Factor"].default_value = 0.05
    nt.links.new(gr.outputs[2], fin.inputs[6])
    nt.links.new(env.outputs[0], fin.inputs[7])
    nt.links.new(fin.outputs[2], bg.inputs[0])
    bg.inputs["Strength"].default_value = 0.55


def wet_ground(cv, size=160.0):
    """Bitume mouillé : texture asphalt_02, assombri par l'eau, flaques lisses (bruit large), relief aplati dessous."""
    bpy.ops.mesh.primitive_plane_add(size=size)
    g = bpy.context.active_object
    g.name = "wet_asphalt"
    m, nt, out = cv._mat("wet_asphalt_tex")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 2.2, 1 / 2.2, 1.0)
    nt.links.new(tc.outputs["Object"], mp.inputs[0])
    folder = os.path.join(cv.ASSETS, "asphalt_02")

    def img(fn, color=True):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(folder, fn))
        if not color:
            t.image.colorspace_settings.name = "Non-Color"
        nt.links.new(mp.outputs[0], t.inputs[0])
        return t
    diff, rough, nor = img("diff_2k.jpg"), img("rough_2k.jpg", False), img("nor_gl_2k.jpg", False)
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.6
    nt.links.new(nor.outputs[0], nmap.inputs["Color"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.22
    noise.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    pud = nt.nodes.new("ShaderNodeMapRange")
    pud.inputs["From Min"].default_value = 0.52
    pud.inputs["From Max"].default_value = 0.58
    nt.links.new(noise.outputs[0], pud.inputs["Value"])
    puddle = pud.outputs[0]
    dark = nt.nodes.new("ShaderNodeMix")
    dark.data_type = "RGBA"
    dark.blend_type = "MULTIPLY"
    dark.inputs["Factor"].default_value = 1.0
    nt.links.new(diff.outputs[0], dark.inputs[6])
    nt.links.new(cv._math(nt, "SUBTRACT", 0.4, cv._math(nt, "MULTIPLY", puddle, 0.2)), dark.inputs[7])
    r = cv._math(nt, "MULTIPLY", rough.outputs[0], 0.45)
    r = cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", r, cv._math(nt, "SUBTRACT", 1.0, puddle)), cv._math(nt, "MULTIPLY", puddle, 0.03))
    nflat = nt.nodes.new("ShaderNodeMix")
    nflat.data_type = "VECTOR"
    nt.links.new(puddle, nflat.inputs["Factor"])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nt.links.new(nmap.outputs[0], nflat.inputs[4])
    nt.links.new(geo.outputs["Normal"], nflat.inputs[5])
    p = cv._principled(nt)
    nt.links.new(dark.outputs[2], p.inputs["Base Color"])
    nt.links.new(r, p.inputs["Roughness"])
    nt.links.new(nflat.outputs[1], p.inputs["Normal"])
    nt.links.new(p.outputs[0], out.inputs[0])
    g.data.materials.append(m)
    return g


def street_lamp(loc, energy=1800.0, color="#ffb36b"):
    d = bpy.data.lights.new("street_lamp", "POINT")
    d.energy = energy
    d.shadow_soft_size = 0.25
    h = color.lstrip("#")
    d.color = tuple((int(h[i:i + 2], 16) / 255.0) ** 2.2 for i in (0, 2, 4))
    ob = bpy.data.objects.new("street_lamp", d)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    return ob


def street_spot(loc, target, energy=5000.0, color="#ffc36b", angle=75.0):
    d = bpy.data.lights.new("street_key", "SPOT")
    d.energy = energy
    d.spot_size = math.radians(angle)
    d.spot_blend = 0.55
    d.shadow_soft_size = 0.3
    h = color.lstrip("#")
    d.color = tuple((int(h[i:i + 2], 16) / 255.0) ** 2.2 for i in (0, 2, 4))
    ob = bpy.data.objects.new("street_key", d)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    look_at(ob, target)
    return ob


def cam_label(cv, cam, text, res):
    """Légende incrustée en bas à gauche de l'image : un texte émissif collé devant l'objectif (vu de la caméra seule)."""
    cu = bpy.data.curves.new(f"cap_{text}", "FONT")
    cu.body = text
    dist = 0.5
    half_w = dist * 18.0 / cam.data.lens
    half_h = half_w * res[1] / res[0]
    cu.size = 0.07 * half_h
    ob = bpy.data.objects.new(f"cap_{text}", cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = cam
    ob.location = (-half_w * 0.94, -half_h * 0.92, -dist)
    cu.materials.append(cv.mat_emit("caption", "#f2eedd", 1.2))
    for attr in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(ob, attr, False)
    return ob


def load_kind(cv, kind, variant):
    """Charge un véhicule allumé ; renvoie (racine, légende)."""
    if kind == "patrol":
        d = cv.load_patrol(variant, lights_on=True)
        return d["body"], f"patrouille {variant}  {d['tris'] // 1000}k"
    if kind == "van":
        d = cv.load_van(variant, lights_on=True)
        return d["body"], f"fourgon {variant}  {d['tris'] // 1000}k"
    if kind == "heli":
        d = cv.load_helicopter(variant, searchlight_on=True)
        d["body"].location.z = 3.2
        bpy.context.view_layer.update()
        cv.aim_searchlight(d, Vector((9.0, -1.0, 0.0)))
        return d["body"], f"hélicoptère {variant}  {d['tris'] // 1000}k"
    if kind == "jet":
        d = cv.load_jet(variant)
        d["body"].location.z = 4.0
        bpy.context.view_layer.update()
        return d["body"], f"avion {variant}  {d['tris'] // 1000}k"
    raise SystemExit(f"genre inconnu {kind}")


def build_shot(cv, kind, variant, res, az=38.0, lens=35.0):
    """Un véhicule seul, trois quarts avant rapproché, bitume mouillé, ciel du film, tout allumé."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    dusk_world(cv)
    wet_ground(cv)
    root, caption = load_kind(cv, kind, variant)
    kids = [root] + [c for c in root.children_recursive if c.type == "MESH"]
    mn, mx = cv.bbox(kids)
    L, W, H = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
    print(f"[lab] {kind} {variant}: {L:.2f} x {W:.2f} x {H:.2f} m, min z {mn.z:.2f} | {caption}", flush=True)
    c = (mn + mx) / 2
    a = math.radians(az)
    seen = L * math.cos(a) + W * math.sin(a)
    d = seen * 1.08 / (2 * 18.0 / lens) + W / 2
    cam_z = {"heli": 1.4, "jet": 1.6}.get(kind, 1.15)
    cam = camera((c.x + d * math.cos(a), c.y - d * math.sin(a), cam_z), (c.x, c.y, mn.z + 0.45 * H), lens=lens)
    cam_label(cv, cam, caption, res)
    # la lumière clé de la rue du film : un lampadaire ambre au-dessus du trottoir, côté caméra, en avant du véhicule,
    # qui plonge sur la caisse ; un autre loin derrière pour la flaque de lumière dans le fond
    key = street_spot((c.x + 0.35 * L + 1.5, c.y - W / 2 - 4.5, 7.2), (c.x, c.y, mn.z + 0.5 * H), 5200.0)
    street_lamp((c.x - 2.0, c.y + 7.0, 7.5), 1400.0)
    street_lamp((c.x - 22.0, c.y + 6.0, 7.5), 2600.0)
    return caption


def compose(paths, cols, out, cell):
    """Assemble les plans en grille (ffmpeg), sans recadrage."""
    import subprocess
    n = len(paths)
    rows = (n + cols - 1) // cols
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in paths:
        args += ["-i", p]
    f = [f"[{i}:v]format=rgb48le,scale={cell[0]}:{cell[1]}:flags=lanczos,setsar=1[v{i}]" for i in range(n)]
    layout = "|".join(f"{(i % cols) * (cell[0] + 8)}_{(i // cols) * (cell[1] + 8)}" for i in range(n))
    f.append("".join(f"[v{i}]" for i in range(n)) + f"xstack=inputs={n}:layout={layout}:fill=0x101114[o]")
    args += ["-filter_complex", ";".join(f), "-map", "[o]", "-frames:v", "1", "-pix_fmt", "rgb24", out]
    r = subprocess.run(args, capture_output=True, text=True)
    print(f"[lab] {'écrit ' + out if r.returncode == 0 else 'ffmpeg: ' + r.stderr[-400:]}", flush=True)


# avant / après : ancien retenu à gauche, nouveau à droite ; finalistes : deux candidats proches
SHOT_SETS = {
    "patrouille-choisie": [("patrol", "jeandiz")],
    "avant-apres": [("patrol", "classic"), ("patrol", "jeandiz"), ("van", "md84"), ("van", "vandura"),
                    ("heli", "ec135"), ("heli", "solid")],
    "finalistes-patrouille": [("patrol", "crownvic"), ("patrol", "jeandiz")],
    "finalistes-helico": [("heli", "ec135"), ("heli", "solid")],
    "finalistes-avion": [("jet", "concept"), ("jet", "h900")],
}


def render_shots(cv, a, sheet, lab):
    res = tuple(int(v) for v in a.res.split("x")) if a.res else (960, 720)
    shots = os.path.join(lab, "plans")
    os.makedirs(shots, exist_ok=True)
    only = set(a.only.split(",")) if a.only else None
    paths = []
    for kind, variant in SHOT_SETS[sheet]:
        p = os.path.join(shots, f"{kind}-{variant}.png")
        paths.append(p)
        if (only and f"{kind}-{variant}" not in only) or (a.reuse and os.path.exists(p)):
            continue
        build_shot(cv, kind, variant, res)
        setup_render(res[0], res[1], a.samples)
        bpy.context.scene.render.resolution_percentage = a.pct
        bpy.context.scene.view_settings.exposure = 0.5
        bpy.context.scene.render.filepath = p
        if not a.no_render:
            bpy.ops.render.render(write_still=True)
            print(f"[lab] écrit {p}", flush=True)
    if len(paths) == 1 and os.path.exists(paths[0]):
        import shutil
        shutil.copyfile(paths[0], os.path.join(lab, f"{sheet}.png"))
        print(f"[lab] écrit {os.path.join(lab, sheet + '.png')}", flush=True)
    elif all(os.path.exists(p) for p in paths):
        compose(paths, 2, os.path.join(lab, f"cast-vehicules-{sheet}.png" if sheet == "avant-apres" else f"{sheet}.png"), res)


def main(cv):
    a = args()
    lab = os.path.join(cv.REF, "lab")
    os.makedirs(lab, exist_ok=True)
    for sheet in a.sheet.split(","):
        if sheet in SHOT_SETS:
            render_shots(cv, a, sheet, lab)
        else:
            render_one(cv, a, sheet, lab)


def render_one(cv, a, sheet, lab):
    if sheet == "crepuscule":
        res, _ = build_dusk(cv)
        out = os.path.join(lab, "cast-vehicules-comparatif-crepuscule.png")
        blend = os.path.join(cv.CAST, "lab-vehicles.blend")
    else:
        res = build_sheet(cv, sheet, a.debug_rotors)
        suffix = sheet + ("-rotors" if a.debug_rotors else "")
        out = os.path.join(lab, f"cast-vehicules-comparatif-{suffix}.png")
        blend = None
    if a.res:
        res = tuple(int(v) for v in a.res.split("x"))
    setup_render(res[0], res[1], a.samples)
    bpy.context.scene.render.resolution_percentage = a.pct
    if sheet == "crepuscule":
        bpy.context.scene.cycles.volume_step_rate = 4.0
        bpy.context.scene.view_settings.exposure = 0.5
    if blend:
        bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
        print(f"[lab] écrit {blend}", flush=True)
    if a.no_render:
        return
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f"[lab] écrit {out}", flush=True)
