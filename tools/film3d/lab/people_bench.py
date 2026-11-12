# Le banc d'essai des gens : chaque personnage dans chacune de ses poses, sur un sol mouillé sombre, sous deux
# lumières (des phares de face ; des néons corail et lilas de côté), vu de face, de trois quarts et de dos, en pied
# et en plan taille ; plus le conducteur derrière le pare-brise de la berline (lieux.hero, la scène du film).
# Machine louée seulement (Cycles, OptiX).
#
#   FILM3D_ASSETS=~/film/assets blender -b --factory-startup -P tools/film3d/lab/people_bench.py -- \
#       --out ~/film/iter-gens/<essai> [--samples 64] [--only agent,conducteur,parebrise,variantes]
#       [--poses crouch,aim,guard] [--lights phares,neons] [--views face,tq,dos] [--shots pied,taille] [--inspect]
#       [--classes] [--wb] [--exposure 1.0]
#   pare-brise : [--pb-lights phares,neons,projecteur] [--pb-views face,tq] [--pb-shots large,serre]
#       [--pb-poses volant,mains] [--hands "up,fwd,out,door_out,écart;…"] [--cabin 25] [--sky [--sky-strength 1]]
#
# Une image par case (720 × 1280, `<perso>-<pose>-<lumière>-<vue>-<cadre>.png`) et une planche par personnage et
# par pose (`planche-<perso>-<pose>.png` : une ligne par lumière ; face, trois quarts, dos en pied puis en taille).
# `--inspect` écrit seulement ce que livrent les modèles (maillages, lissage, textures, dans `<out>/tex/`).
import math
import os
import re
import subprocess
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import cast_people as cp  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(name, default):
    return args[args.index(name) + 1] if name in args else default


OUT = os.path.expanduser(opt("--out", os.path.join(os.path.expanduser("~"), "film", "iter-gens", "essai")))
SAMPLES = int(opt("--samples", "64"))
ONLY = opt("--only", "agent,conducteur,parebrise").split(",")
POSES = opt("--poses", "crouch,aim,guard").split(",")
LIGHTS = opt("--lights", "phares,neons").split(",")
VIEWS = opt("--views", "face,tq,dos").split(",")
SHOTS = opt("--shots", "pied,taille").split(",")
W, H = 720, 1280
CORAL, LILAC, HEAD = "#ff6a3d", "#8d8cf0", "#fff0d2"
VIEW_AZ = {"face": 0.0, "tq": 40.0, "dos": 180.0}   # degrés autour du personnage, 0 : devant lui (vers -y)


def inspect():
    """Ce que livrent les modèles : maillages, faces, lissage, matières et textures d'origine."""
    for path in ("cop-spp/model.glb", "cop-tuzzy/model.glb", "hood-scarf/model.glb", "cap-aramuor/model.glb",
                 "gun-service/service_pistol.gltf"):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(cp.CAST, path))
        print(f"==== {path}")
        for o in bpy.data.objects:
            if o.type != "MESH":
                if o.type == "ARMATURE":
                    print(f"  armature {o.name} : {len(o.data.bones)} os")
                continue
            me = o.data
            sm = sum(p.use_smooth for p in me.polygons)
            print(f"  {o.name} ({me.name}): {len(me.vertices)} sommets, {len(me.polygons)} faces, lisses {sm}, "
                  f"normales perso {me.has_custom_normals}, uv {len(me.uv_layers)}, groupes {len(o.vertex_groups)}, "
                  f"dims {tuple(round(v, 3) for v in o.dimensions)}")
            for m in me.materials:
                if not m or not m.node_tree:
                    continue
                imgs = [f"{n.image.name} {tuple(n.image.size)} -> {[l.to_socket.name for l in n.outputs[0].links]}"
                        for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
                print(f"     mat {m.name}: {imgs}")
        tag = path.split("/")[0]
        os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
        for img in bpy.data.images:
            if img.size[0] == 0:
                continue
            img.filepath_raw = os.path.join(OUT, "tex", f"{tag}-{re.sub(r'[^A-Za-z0-9_.-]', '_', img.name)}.png")
            img.file_format = "PNG"
            try:
                img.save()
            except RuntimeError as e:
                print("  image non écrite", img.name, e)


# ---------------------------------------------------------------- le plateau

def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cp._MATS.clear()
    sc = bpy.context.scene
    r = sc.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    c = sc.cycles
    c.samples = SAMPLES
    c.use_denoising = True
    c.device = "CPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            c.device = "GPU"
            break
    c.max_bounces = 8
    c.transparent_max_bounces = 16
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = float(opt("--exposure", "1.0"))
    r.use_persistent_data = True
    if "--wb" in args:   # contrôle de la mise en place, sans Cycles
        r.engine = "BLENDER_WORKBENCH"
        sc.display.shading.light = "STUDIO"
        sc.display.shading.color_type = "RANDOM"
        sc.view_settings.view_transform = "Standard"
        sc.view_settings.look = "None"
    wd = bpy.data.worlds.new("nuit")
    wd.use_nodes = True
    bg = wd.node_tree.nodes["Background"]
    # --sky : un ciel de crépuscule lilas, clair, comme au plan final (le reflet qu'il pose sur le pare-brise)
    bg.inputs["Color"].default_value = cp.lin("#6a5ca8" if "--sky" in args else "#141a2e")
    bg.inputs["Strength"].default_value = float(opt("--sky-strength", "1.0")) if "--sky" in args else 0.08
    sc.world = wd
    return sc


def wet_ground():
    """Enrobé mouillé sombre : rugosité tachée (flaques presque miroir, enrobé humide), grain fin."""
    me = bpy.data.meshes.new("sol")
    s = 30.0
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new("sol", me)
    bpy.context.scene.collection.objects.link(ob)
    m = bpy.data.materials.new("sol_mouille")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = cp.lin("#0f1012")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.35
    nz.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.42
    ramp.inputs["From Max"].default_value = 0.58
    ramp.inputs["To Min"].default_value = 0.04
    ramp.inputs["To Max"].default_value = 0.42
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs["Result"], p.inputs["Roughness"])
    g = nt.nodes.new("ShaderNodeTexNoise")
    g.inputs["Scale"].default_value = 180.0
    nt.links.new(tc.outputs["Object"], g.inputs["Vector"])
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = 0.15
    nt.links.new(g.outputs["Fac"], b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    me.materials.append(m)
    return ob


def _aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def light(name, kind, loc, target, color, energy, **kw):
    ld = bpy.data.lights.new(name, kind)
    ld.color = cp.lin(color)[:3]
    ld.energy = energy
    for k, v in kw.items():
        setattr(ld, k, v)
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    _aim(ob, target)
    return ob


def rig_lights(center=Vector((0, 0, 0)), front=Vector((0, -1, 0)), head_z=0.7, head_d=7.0):
    """Les deux éclairages, relatifs au personnage (`front` : la direction où il regarde) :
    « phares » : deux phares de voiture à 7 m devant lui, 0,7 m du sol, 1,4 m d'écart, plus la nuit ;
    « neons » : une enseigne corail à sa droite, une lilas à sa gauche, de côté, à 2,5 m."""
    f = front.normalized()
    side = Vector((-f.y, f.x, 0))           # sa gauche
    c = Vector(center)
    sets = {"phares": [], "neons": []}
    for k in (-1, 1):
        p = c + f * head_d + side * (0.7 * k) + Vector((0, 0, head_z))
        sets["phares"].append(light(f"phare_{k}", "SPOT", p, c + Vector((0, 0, 1.0)), HEAD, 450.0,
                                    spot_size=math.radians(36), spot_blend=0.35, shadow_soft_size=0.06))
    # un lampadaire lointain derrière, pour la découpe (les deux éclairages)
    for name, col, k, en in (("neon_corail", CORAL, -1, 160.0), ("neon_lilas", LILAC, 1, 200.0)):
        p = c + side * (2.5 * k) + f * 0.6 + Vector((0, 0, 1.7))
        ob = light(name, "AREA", p, c + Vector((0, 0, 1.1)), col, en, shape="RECTANGLE", size=0.12, size_y=1.6)
        sets["neons"].append(ob)
    # « projecteur » : le faisceau d'un hélicoptère (FIN, FIN6), serré, tombant à 45° de l'avant droit ; à 10 m,
    # 2,5 kW donnent l'éclairement des 60 kW de FIN à 49 m
    p = c + f * 7.0 - side * 7.0 + Vector((0, 0, 10.0))
    sets["projecteur"] = [light("projecteur", "SPOT", p, c + Vector((0, 0, 1.0)), "#e8eeff", 2500.0,
                                spot_size=math.radians(8), spot_blend=0.3, shadow_soft_size=0.1)]
    return sets


def use_lights(sets, which):
    for k, obs in sets.items():
        for o in obs:
            o.hide_render = k != which


def camera():
    cd = bpy.data.cameras.new("cam")
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 36.0
    cd.clip_start = 0.05
    ob = bpy.data.objects.new("cam", cd)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


def frame(cam, center, front, az_deg, zmin, zmax, lens=50.0, height=None, margin=1.12, radius=0.0):
    """La caméra autour du personnage, à `az_deg` de son regard, cadrant la tranche zmin..zmax en hauteur et
    un rayon `radius` autour de `center` en largeur."""
    cam.data.lens = lens
    vfov = 2 * math.atan(cam.data.sensor_height / 2 / lens)
    hfov = 2 * math.atan(cam.data.sensor_height * W / H / 2 / lens)
    hh = (zmax - zmin) * margin
    d = max(hh / 2 / math.tan(vfov / 2), radius * margin / math.tan(hfov / 2) + radius)
    a = math.radians(az_deg)
    f = front.normalized()
    side = Vector((-f.y, f.x, 0))
    dirv = f * math.cos(a) + side * math.sin(a)
    zc = (zmin + zmax) / 2
    zcam = zc if height is None else height
    cam.location = Vector((center.x, center.y, 0)) + dirv * d + Vector((0, 0, zcam))
    _aim(cam, Vector((center.x, center.y, zc)))
    cam.data.dof.use_dof = False


def render(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[banc] {path}", flush=True)
    return path


def sheet(paths_rows, out, tile=(240, 427)):
    """Planche : une ligne par lumière, les cases dans l'ordre ; ffmpeg (xstack) réduit et colle."""
    rows = [r for r in paths_rows if r]
    if not rows:
        return
    ncol = max(len(r) for r in rows)
    ins, flt, labels, lay = [], [], [], []
    i = 0
    for ri, r in enumerate(rows):
        for ci, p in enumerate(r):
            ins += ["-i", p]
            flt.append(f"[{i}]scale={tile[0]}:{tile[1]}[t{i}]")
            labels.append(f"[t{i}]")
            lay.append(f"{ci * tile[0]}_{ri * tile[1]}")
            i += 1
    fc = ";".join(flt) + ";" + "".join(labels) + f"xstack=inputs={i}:layout={'|'.join(lay)}:fill=black"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex", fc, out], check=False)
    print(f"[banc] planche {out} ({ncol} × {len(rows)})", flush=True)


def char_box(arm):
    meshes = [o for o in arm.children_recursive if o.type == "MESH"]
    return cp._bbox(meshes)


def shoot(cam, tag, center, front, zmin, zmax, waist_z, lights, radius=0.0):
    """Toutes les cases d'une pose : lumières × vues × cadres ; renvoie les lignes de la planche."""
    rows = []
    for lt in LIGHTS:
        use_lights(lights, lt)
        row = []
        for sh in SHOTS:
            for v in VIEWS:
                if sh == "pied":
                    frame(cam, center, front, VIEW_AZ[v], zmin, zmax, lens=50.0, radius=radius)
                else:
                    frame(cam, center, front, VIEW_AZ[v], waist_z, zmax + 0.05, lens=50.0, margin=1.08,
                          radius=min(radius, 0.35) if radius else 0.0)
                row.append(render(os.path.join(OUT, f"{tag}-{lt}-{v}-{sh}.png")))
        rows.append(row)
    return rows


# ---------------------------------------------------------------- les personnages

def bench_officer():
    new_scene()
    wet_ground()
    lights = rig_lights()
    cam = camera()
    arm = cp.load_officer("spp", name="officer_banc")
    if "--classes" in args:
        # contrôle du classement des faces : drap rouge, cuir vert, plaque jaune, le reste gris
        flat = {k: cp._principled(f"banc_{k}", cp.lin(c), 0.6) for k, c in
                (("fabric", "#c03020"), ("leather", "#20a040"), ("plate", "#e0c020"), ("skin", "#e0a0a0"),
                 ("eye", "#ffffff"), ("hair", "#603010"), ("gun", "#2040e0"), ("other", "#808080"))}
        for o in arm.children_recursive:
            if o.type != "MESH":
                continue
            print(f"[banc] {o.name} ({o.data.name}) : {[m.name for m in o.data.materials if m]}", flush=True)
            for i, m in enumerate(o.data.materials):
                n = m.name if m else ""
                k = "plate" if "plate" in n else "leather" if ("leather" in n or "sole" in n) else \
                    "fabric" if re.match(r"ppl_(tops|bottoms|hats)_spp", n) else "skin" if "skin" in n else \
                    "eye" if "eye" in n else "hair" if re.search("hair|beard|moust|lash", n) else \
                    "gun" if "gun" in n else "other"
                o.data.materials[i] = flat[k]
    gun = None
    for i, pose in enumerate(POSES):
        cp.pose_officer(arm, pose, style=0)
        if gun is None:
            gun = cp.attach_handgun(arm, cp.load_handgun("service"))
        bpy.context.view_layer.update()
        mn, mx = char_box(arm)
        hip = (arm.matrix_world @ cp.pb(arm, "Hips").head).z
        # le cadre ne suit que la hauteur (le même qu'aux planches « avant ») ; `--large` suit aussi la largeur
        rad = max(Vector((x, y)).length for x in (mn.x, mx.x) for y in (mn.y, mx.y)) if "--large" in args else 0.0
        rows = shoot(cam, f"agent-{pose}", Vector((0, 0, 0)), Vector((0, -1, 0)), 0.0, mx.z, hip - 0.05, lights,
                     radius=rad)
        sheet(rows, os.path.join(OUT, f"planche-agent-{pose}.png"))


def bench_variants():
    """Trois agents côte à côte (les variantes de load_officer), en garde, de face et de trois quarts."""
    new_scene()
    wet_ground()
    lights = rig_lights()
    cam = camera()
    arms = []
    if hasattr(cp, "_LOOK_COUNT"):
        cp._LOOK_COUNT[0] = 0           # les variantes 0, 1, 2 de gauche à droite
    for i in range(3):
        a = cp.load_officer("spp", name=f"officer_var{i}")
        cp.pose_officer(a, "guard", style=i)
        cp.attach_handgun(a, cp.load_handgun("service"))
        a.location.x = (i - 1) * 1.0
        arms.append(a)
    bpy.context.view_layer.update()
    rows = []
    for lt in LIGHTS:
        use_lights(lights, lt)
        row = []
        for v in ("face", "tq"):
            frame(cam, Vector((0, 0, 0)), Vector((0, -1, 0)), VIEW_AZ[v], 0.0, 1.95, lens=35.0, radius=1.3,
                  margin=1.05)
            row.append(render(os.path.join(OUT, f"variantes-{lt}-{v}.png")))
            for i, a in enumerate(arms):
                hd = a.matrix_world @ cp.pb(a, "Head").head
                frame(cam, Vector((hd.x, hd.y, 0)), Vector((0, -1, 0)), VIEW_AZ[v], 1.2, 1.95, lens=50.0,
                      radius=0.3, margin=1.0)
                row.append(render(os.path.join(OUT, f"variantes-{lt}-{v}-tete{i}.png")))
        rows.append(row)
    sheet(rows, os.path.join(OUT, "planche-variantes.png"))


# le siège et le volant du coupé (cast_people.COUPE_*), ramenés au bassin à l'origine
def _driver_seat():
    hip = Vector(cp.COUPE_HIP)
    off = Vector((hip.x, hip.y, 0.0))
    return hip - off, Vector(cp.COUPE_WHEEL_CENTER) - off, Vector(cp.COUPE_WHEEL_NORMAL), cp.COUPE_WHEEL_RADIUS, \
        Vector(cp.COUPE_PEDAL) - off


def _props(wheel_c, wheel_n, wheel_r, hip):
    bpy.ops.mesh.primitive_torus_add(major_radius=wheel_r, minor_radius=0.014, location=wheel_c)
    t = bpy.context.active_object
    t.rotation_euler = Vector((0, 0, 1)).rotation_difference(wheel_n).to_euler()
    m = cp._principled("banc_volant", cp.lin("#1a1410"), 0.5)
    t.data.materials.append(m)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(hip.x, hip.y + 0.12, hip.z - 0.12))
    s = bpy.context.active_object
    s.scale = (0.5, 0.55, 0.12)
    s.data.materials.append(cp._principled("banc_siege", cp.lin("#3a2a20"), 0.6))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(hip.x, hip.y + 0.38, hip.z + 0.3))
    b = bpy.context.active_object
    b.scale = (0.5, 0.1, 0.75)
    b.rotation_euler = (math.radians(-12), 0, 0)
    b.data.materials.append(cp._principled("banc_siege", cp.lin("#3a2a20"), 0.6))
    b.visible_camera = False      # le dossier cacherait le dos du conducteur ; il garde son ombre


def _hands_up(arm):
    """La pose de lieux.hands_up (celle du film), sur un conducteur hors voiture : une caisse vide lui sert de parent."""
    import lieux as L
    body = bpy.data.objects.new("banc_caisse", None)
    root = bpy.data.objects.new("banc_rig", None)
    for o in (body, root):
        bpy.context.scene.collection.objects.link(o)
    mw = arm.matrix_world.copy()
    arm.parent = body
    arm.matrix_world = mw
    root["body"] = body.name
    L.hands_up(root)


def bench_driver():
    new_scene()
    wet_ground()
    lights = rig_lights()
    cam = camera()
    hip, wc, wn, wr, pedal = _driver_seat()
    arm = cp.load_driver("hooded")
    cp.place_driver(arm, hip, (0, -1, 0))
    _props(wc, wn, wr, hip)
    for pose in ("volant", "mains"):
        if pose == "volant":
            cp.pose_driver_wheel(arm, wc, wr, wn, pedal=pedal)
        else:
            _hands_up(arm)
        bpy.context.view_layer.update()
        mn, mx = char_box(arm)
        rows = shoot(cam, f"conducteur-{pose}", Vector((0, 0, 0)), Vector((0, -1, 0)), 0.0, mx.z + 0.05,
                     hip.z + 0.1, lights)
        sheet(rows, os.path.join(OUT, f"planche-conducteur-{pose}.png"))


def bench_windshield():
    """Le conducteur dans la berline (lieux.hero : la voiture et le conducteur du film), vu de face à travers le
    pare-brise, mains au volant puis mains levées (lieux.hands_up), sous les phares d'une patrouille puis sous les
    néons, de face et de trois quarts avant, à 3,5 m et en plan serré à 2 m."""
    import lieux as L
    new_scene()
    wet_ground()
    root = L.hero()
    L.put(root, 0, 0, 0, heading=0.0)        # l'avant vers +y
    cab = L.cabin_light(root, energy=float(opt("--cabin", "25")))
    # la lampe de l'habitacle est une sphère de 12 cm visible à la caméra (un disque blanc derrière le pare-brise) :
    # cachée ici, signalée au compte rendu
    cab.visible_camera = cab.visible_glossy = cab.visible_transmission = False
    bpy.context.view_layer.update()
    arm = L.hero_driver(root)
    if arm is None:
        print("[banc] pas de conducteur dans la berline", flush=True)
        return
    front = Vector((0, 1, 0))
    head = arm.matrix_world @ cp.pb(arm, "Head").head
    mn, mx = char_box(arm)
    print(f"[banc] conducteur : tête {tuple(round(v, 2) for v in head)}, boîte {tuple(round(v, 2) for v in mn)} "
          f"→ {tuple(round(v, 2) for v in mx)}, caisse {tuple(round(v, 2) for v in bpy.data.objects[root['body']].matrix_world.translation)}",
          flush=True)
    # les phares d'une patrouille arrêtée face à la berline, à 6 m : à 0,7 m le capot cache l'habitacle ; à 1,1 m
    # (une patrouille haute, ou sur une bosse) ils entrent par le pare-brise
    lights = rig_lights(center=Vector((head.x, head.y, 0)), front=front, head_z=1.1, head_d=6.0)
    cam = camera()
    # --hands "up,fwd,out,door_out,écart;…" : des réglages d'essai de lieux.hands_up (l'écart s'ajoute à celui des
    # doigts), une pose « mains1 », « mains2 »… chacun
    tries = [t for t in opt("--hands", "").split(";") if t]
    poses = [p_ for p_ in opt("--pb-poses", "volant,mains").split(",") if p_] + \
        [f"mains{i + 1}" for i in range(len(tries))]
    for pose in poses:
        if pose == "mains":
            L.hands_up(root)
        elif pose.startswith("mains"):
            v_ = [float(x) for x in tries[int(pose[5:]) - 1].split(",")]
            L.hands_up(root, up=v_[0], fwd=v_[1], out=v_[2], door_out=v_[3])
            if len(v_) > 4 and v_[4]:
                for s_ in ("Left", "Right"):
                    cp.curl(arm, s_, angles=(0, 0, 0), thumb=(0, 0, 0), spread=v_[4])
        bpy.context.view_layer.update()
        if pose != "volant":
            for s_ in ("Left", "Right"):
                h_ = arm.matrix_world @ cp.pb(arm, s_ + "Hand").head
                t_ = arm.matrix_world @ cp.pb(arm, s_ + "HandMiddle1").tail
                print(f"[banc] {pose} {s_} : poignet {tuple(round(c, 3) for c in h_)}, doigts "
                      f"{tuple(round(c, 3) for c in t_)}", flush=True)
        rows = []
        for lt in opt("--pb-lights", "phares,neons,projecteur").split(","):
            use_lights(lights, lt)
            row = []
            for v, az in [x for x in (("face", 0.0), ("tq", 32.0)) if x[0] in opt("--pb-views", "face,tq")]:
                # hors de la voiture (l'avant à 2,45 m du centre), un peu au-dessus du capot, visée sur le buste
                for sh, dist, lens in [x for x in (("large", 6.0, 35.0), ("serre", 4.0, 70.0))
                                       if x[0] in opt("--pb-shots", "large,serre")]:
                    a = math.radians(az)
                    dirv = Vector((math.sin(a), math.cos(a), 0))
                    cam.data.lens = lens
                    cam.location = Vector((head.x, head.y, 0)) + dirv * dist + Vector((0, 0, 1.5))
                    _aim(cam, head + Vector((0, 0, -0.08)))
                    row.append(render(os.path.join(OUT, f"parebrise-{pose}-{lt}-{v}-{sh}.png")))
            rows.append(row)
        sheet(rows, os.path.join(OUT, f"planche-parebrise-{pose}.png"))


if __name__ == "__main__":
    if "--inspect" in args:
        inspect()
        sys.exit(0)
    os.makedirs(OUT, exist_ok=True)
    for part, fn in (("agent", bench_officer), ("variantes", bench_variants), ("conducteur", bench_driver),
                     ("parebrise", bench_windshield)):
        if part in ONLY:
            fn()
