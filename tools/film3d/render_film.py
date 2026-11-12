# Rend le film entier, plan par plan, dans l'ordre du montage (shared/film/cut.ts) : la machine louée n'a plus qu'à
# copier et lancer. Deux moitiés dans ce fichier : le pilote (python3, sans Blender) lance un Blender par plan, qui
# relit ce même fichier en ouvrier (--worker) : il construit la scène du plan, la rend image par image, s'arrête.
#
#   python3 tools/film3d/render_film.py                   # les neuf plans, Cycles GPU (OptiX, sinon CUDA), 720 × 1280
#   python3 tools/film3d/render_film.py --bench           # une image par plan, mesurée, et la durée du film estimée
#   python3 tools/film3d/render_film.py --bench --plan P3 --essai rugosite   # un essai de lumière, sur l'image fixe
#     du plan (banc/P3+rugosite0.5.png, à comparer à banc/P3.png)
#   python3 tools/film3d/render_film.py --assemble        # les images -> une prise par plan (plans/<PLAN>-1.mp4)
#   python3 tools/film3d/render_film.py --list            # construit sans rendre : la liste des assets chargés
#   python3 tools/film3d/render_film.py --selftest        # la reprise, les cadences, les noms : sans Blender
#
# Options : --plan P3,P4 ; --frames a-b (comptées dans le plan, de 1 à sa longueur) ; --samples N (sinon ceux de la
# scène, 256 et débruiteur) ; --res 720x1280 ; --draft (360 × 640, 32 échantillons) ; --dry (Workbench 360 × 640,
# l'essai à blanc du Mac) ; --cpu ; --threads N (0 : tous) ; --out DIR (les images, FILM3D_RENDER ou
# design/film/rendu) ; --plans DIR (les prises du montage, design/film/plans) ; --take N ; --force ; --blender PATH.
#
# Les images : <out>/<PLAN>/0001.png… (une par fichier, numérotées dans le plan), écrites sous un nom provisoire puis
# renommées : une image présente, PNG complet et à la bonne taille, est sautée à la relance (reprise). Le journal :
# <out>/journal.tsv (une ligne par image, temps compris) et <out>/<PLAN>/blender.log. Un plan sans mouvement (la
# plage d'images de sa scène plus courte que le plan) rend son image fixe une fois et la recopie, et le dit.
# Un plan qu'aucune scène ne sait encore construire est sauté, et dit : le montage posera son carton.
#
# Les essais de lumière (--essai, éteints par défaut : sans eux les cadres validés ne changent pas ; les images d'un
# essai vont dans <out>/<PLAN>+<essai>/ et ne deviennent jamais une prise du montage) :
#   rugosite[=0.5]        la rugosité de la chaussée (Roughness des matières rue_asphalt*, rue_gutter) × 0,5
#   brume[=1]             la brume creusée entre la caisse de la berline et l'objectif (et autour de la caisse)
#   peinture=<hex>        FILM3D_PAINT        metal=<0..1>   FILM3D_PAINT_METAL
#   vernis=<0..1>         FILM3D_PAINT_COAT (facteur du poids du vernis)
#   vernis_rugosite=<0..1>  FILM3D_PAINT_COAT_ROUGH (rugosité ajoutée au vernis)
#
# Sur le Mac (règle machine) : jamais la carte graphique, -t 2, sous le verrou commun et nice ; --dry seulement.
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# L'ordre du montage (scripts/film-lib.ts SHOTS) et la scène qui construit chaque plan : (module, argument de build).
ORDER = ("OUV", "P1", "P2", "P3", "P4", "P5", "P6", "FIN", "FIN6")
SOURCES = {
    "OUV": ("scene_a", "OUV"), "P1": ("scene_a", "P1"), "P2": ("scene_f", "P2"), "P3": ("scene_b", None),
    "P4": ("scene_c", "P4"), "P5": ("scene_e", "P5"), "P6": ("scene_d", "P6"), "FIN": ("scene_d", "FIN"),
    "FIN6": ("scene_d", "FIN6"),
}
# (repli seulement si shared/film/cut.ts manque : il reste la seule source des durées)
FALLBACK_FRAMES = {"OUV": 24, "P1": 28, "P2": 28, "P3": 28, "P4": 28, "P5": 28, "P6": 40, "FIN": 36, "FIN6": 56}
FULL = (720, 1280)
DRAFT = (360, 640)
ESSAIS = {"rugosite": 0.5, "brume": 1.0, "peinture": None, "metal": None, "vernis": None, "vernis_rugosite": None}
PAINT_ENV = {"peinture": "FILM3D_PAINT", "metal": "FILM3D_PAINT_METAL", "vernis": "FILM3D_PAINT_COAT",
             "vernis_rugosite": "FILM3D_PAINT_COAT_ROUGH"}


def log(msg):
    print(f"[film] {msg}", flush=True)


# ---------------------------------------------------------------- le commun, sans Blender

def main_checkout():
    try:
        common = subprocess.run(["git", "-C", ROOT, "rev-parse", "--git-common-dir"], capture_output=True, text=True,
                                check=True).stdout.strip()
        return os.path.dirname(os.path.abspath(os.path.join(ROOT, common)))
    except Exception:
        return ROOT


def assets_dir():
    return os.environ.get("FILM3D_ASSETS") or os.path.join(os.path.dirname(main_checkout()), "design", "film", "assets")


def read_cut(root=ROOT):
    """Les images de vidéo de chaque plan, lues dans shared/film/cut.ts (SHOT_FRAMES, ENDINGS.*.video)."""
    path = os.path.join(root, "shared", "film", "cut.ts")
    try:
        src = open(path, encoding="utf-8").read()
        body = re.search(r"SHOT_FRAMES\s*:[^=]*=\s*\{([^}]*)\}", src).group(1)
        out = {k: int(v) for k, v in re.findall(r"(\w+)\s*:\s*(\d+)", body)}
        for shot, n in re.findall(r'shot\s*:\s*"(\w+)"\s*,\s*video\s*:\s*(\d+)', src):
            out[shot] = int(n)
        if set(out) >= set(ORDER):
            return {p: out[p] for p in ORDER}
        log(f"! {path} : plans manquants {sorted(set(ORDER) - set(out))}, durées de repli")
    except (OSError, AttributeError) as e:
        log(f"! {path} illisible ({e}), durées de repli")
    return dict(FALLBACK_FRAMES)


def parse_frames(spec, n):
    """« a-b » ou « a » (comptées dans le plan, 1 à n) -> liste d'indices ; None -> tout le plan."""
    if not spec:
        return list(range(1, n + 1))
    m = re.fullmatch(r"(\d+)(?:-(\d+))?", spec.strip())
    if not m:
        raise ValueError(f"--frames {spec} : attendu a-b")
    a, b = int(m.group(1)), int(m.group(2) or m.group(1))
    return [i for i in range(max(1, a), min(n, b) + 1)]


def parse_essais(items):
    out = {}
    for it in items or ():
        k, _, v = it.partition("=")
        k = k.strip()
        if k not in ESSAIS:
            raise ValueError(f"--essai {k} : inconnu ({', '.join(ESSAIS)})")
        if not v and ESSAIS[k] is None:
            raise ValueError(f"--essai {k}=<valeur> : une valeur est attendue")
        out[k] = v or str(ESSAIS[k])
    return out


def plan_dirname(plan, essais):
    """Le dossier d'images d'un plan ; un essai a le sien (P3+rugosite0.5), jamais une prise du montage."""
    if not essais:
        return plan
    return plan + "+" + "+".join(re.sub(r"[^\w.-]", "", f"{k}{v}") for k, v in sorted(essais.items()))


def frame_path(d, i):
    return os.path.join(d, f"{i:04d}.png")


def png_size(path):
    """(largeur, hauteur) d'un PNG complet (signature, en-tête, bloc de fin), sinon None."""
    try:
        size = os.path.getsize(path)
        if size < 57:
            return None
        with open(path, "rb") as f:
            head = f.read(24)
            f.seek(size - 12)
            tail = f.read(12)
    except OSError:
        return None
    if head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR" or tail[4:8] != b"IEND":
        return None
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def todo(d, idxs, res):
    """Les images encore à rendre : absentes, tronquées, ou d'une autre taille."""
    return [i for i in idxs if png_size(frame_path(d, i)) != tuple(res)]


def parse_res(s):
    m = re.fullmatch(r"(\d+)[x×](\d+)", s)
    if not m:
        raise ValueError(f"--res {s} : attendu 720x1280")
    return int(m.group(1)), int(m.group(2))


def hms(s):
    s = int(round(s))
    return f"{s // 3600} h {s % 3600 // 60:02d}" if s >= 3600 else f"{s // 60} min {s % 60:02d}" if s >= 60 else f"{s} s"


# ---------------------------------------------------------------- l'ouvrier, dans Blender

def worker(a):
    import importlib
    import inspect

    import bpy

    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    plan = a.plan
    n = read_cut()[plan]
    essais = parse_essais(a.essai)
    out_dir = os.path.join(a.out, plan_dirname(plan, essais))
    os.makedirs(out_dir, exist_ok=True)
    ASSETS = os.path.realpath(assets_dir())
    info = dict(plan=plan, frames=n, essais=essais, mode=a.mode)

    def write_info(**kw):
        info.update(kw)
        with open(os.path.join(out_dir, "plan.json"), "w", encoding="utf-8") as f:
            json.dump(info, f, ensure_ascii=False, indent=1)

    # les essais lus à la construction (peinture de la berline), pour ce seul Blender
    for k, env in PAINT_ENV.items():
        if k in essais:
            os.environ[env] = essais[k]
    mod_name, arg = SOURCES[plan]
    # les scènes qui s'écrivent en .blend l'écrivent ici, jamais dans les assets
    os.environ["FILM3D_BLEND"] = os.path.join(out_dir, "scene.blend")
    if mod_name == "scene_b":
        os.environ["FILM3D_PLAN"] = plan
    # ce que la construction lit dans les assets (le pilote en fait la liste à emporter)
    seen = set()

    def audit(event, args):
        if event == "open" and args and isinstance(args[0], (str, bytes, os.PathLike)):
            p = os.fsdecode(args[0])
            if p.startswith(ASSETS) or os.path.realpath(p).startswith(ASSETS):
                seen.add(os.path.realpath(p))
    sys.addaudithook(audit)

    mod = importlib.import_module(mod_name)
    plans = getattr(mod, "PLANS", None)
    known = (plan in plans) if isinstance(plans, dict) else bool(re.search(rf"\b{plan}\b", inspect.getsource(mod.build)))
    if not known:
        log(f"! {plan} : {mod_name}.build ne connaît pas encore ce plan ; rien n'est rendu, le montage posera son "
            f"carton (à reprendre quand {mod_name} le construira)")
        write_info(skipped=f"{mod_name} ne construit pas {plan}")
        return
    t0 = time.time()
    scene = (mod.build(arg) if arg and inspect.signature(mod.build).parameters else mod.build()) or bpy.context.scene
    t_build = time.time() - t0
    still = scene.frame_current
    span = scene.frame_end - scene.frame_start + 1
    animated = span > 3
    if animated and span < n:
        log(f"! {plan} : la scène n'a que {span} images pour un plan de {n} ; le montage tiendra la dernière")
    first = scene.frame_start
    log(f"{plan} construit par {mod_name} en {hms(t_build)} : " + (
        f"animé, images {first} à {first + min(span, n) - 1} de la scène" if animated else
        f"PAS ANIMÉ (plage {scene.frame_start}-{scene.frame_end}) : son image fixe {still} sera répétée {n} fois"))

    # la liste des assets chargés : fichiers ouverts, images, polices, bibliothèques
    for coll in (bpy.data.images, bpy.data.fonts, bpy.data.libraries, bpy.data.sounds, bpy.data.movieclips,
                 bpy.data.volumes, bpy.data.cache_files):
        for d in coll:
            fp = getattr(d, "filepath", "")
            if not fp or fp == "<builtin>" or getattr(d, "packed_file", None):
                continue
            p = os.path.realpath(bpy.path.abspath(fp))
            if not os.path.exists(p) and getattr(d, "source", "FILE") in ("FILE", "SEQUENCE", "TILED"):
                log(f"! fichier introuvable : {d.name} -> {p}")
            elif p.startswith(ASSETS):
                seen.add(p)
    # un .gltf lu : ses images et ses tampons aussi (l'import les empaquette sans passer par open de Python)
    for p in [p for p in seen if p.endswith(".gltf")]:
        try:
            g = json.load(open(p, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for it in g.get("images", []) + g.get("buffers", []):
            uri = it.get("uri", "")
            if uri and not uri.startswith("data:"):
                from urllib.parse import unquote
                seen.add(os.path.realpath(os.path.join(os.path.dirname(p), unquote(uri))))
    rel = sorted(os.path.relpath(p, ASSETS) for p in seen if os.path.isfile(p))
    with open(os.path.join(out_dir, "assets.txt"), "w", encoding="utf-8") as f:
        f.write("".join(r + "\n" for r in rel))
    log(f"{plan} : {len(rel)} fichiers d'assets chargés, liste dans {os.path.join(out_dir, 'assets.txt')}")

    apply_essais(bpy, scene, essais)
    res, engine, device, samples = setup_render(bpy, scene, a)
    write_info(module=mod_name, animated=animated, scene_frames=[scene.frame_start, scene.frame_end], still=still,
               res=list(res), engine=engine, device=device, samples=samples, build_s=round(t_build, 1))
    if a.mode == "list":
        return

    r = scene.render
    if a.mode == "bench":
        bench_dir = os.path.join(a.out, "banc")
        os.makedirs(bench_dir, exist_ok=True)
        scene.frame_set(still)
        r.filepath = os.path.join(bench_dir, f"{plan_dirname(plan, essais)}.png")
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        dt = time.time() - t1
        import resource
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1e6 if sys.platform == "darwin" else 1e3)
        to_render = min(span, n) if animated else 1
        rep = dict(plan=plan, animated=animated, build_s=round(t_build, 1), frame_s=round(dt, 1),
                   frames_to_render=to_render, frames=n, rss_mb=round(rss), res=list(res), samples=samples,
                   device=device, engine=engine)
        with open(os.path.join(bench_dir, f"{plan_dirname(plan, essais)}.json"), "w", encoding="utf-8") as f:
            json.dump(rep, f)
        log(f"banc {plan} : construction {hms(t_build)}, une image {dt:.1f} s ({engine} {device}, {samples} éch., "
            f"{res[0]}×{res[1]}), mémoire {rss:.0f} Mo ; {to_render} image(s) à rendre")
        return

    idxs = parse_frames(a.frames, n)
    if animated:
        idxs = [i for i in idxs if i <= span]
    left = todo(out_dir, idxs, res)
    if len(left) < len(idxs):
        log(f"{plan} : {len(idxs) - len(left)} image(s) déjà rendues et complètes, sautées (reprise)")
    journal = os.path.join(a.out, "journal.tsv")
    new = not os.path.exists(journal)
    jf = open(journal, "a", encoding="utf-8")
    if new:
        jf.write("date\tplan\timage\timage_scene\tsecondes\tmoteur\tappareil\techantillons\ttaille\tfixe\n")

    def note(i, f, dt, fixed):
        jf.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{plan_dirname(plan, essais)}\t{i}\t{f}\t{dt:.1f}\t{engine}\t"
                 f"{device}\t{samples}\t{res[0]}x{res[1]}\t{int(fixed)}\n")
        jf.flush()

    def render_to(path, f):
        scene.frame_set(f)
        tmp = path[:-4] + ".part.png"
        r.filepath = tmp
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        os.replace(tmp, path)
        return time.time() - t1

    if not animated and left:
        still_png = os.path.join(out_dir, "fixe.png")
        if png_size(still_png) != tuple(res):
            dt = render_to(still_png, still)
            note(0, still, dt, True)
            log(f"{plan} : image fixe {still} rendue en {dt:.1f} s, recopiée sur {len(left)} image(s) (plan pas animé)")
        for i in left:
            shutil.copyfile(still_png, frame_path(out_dir, i)[:-4] + ".part.png")
            os.replace(frame_path(out_dir, i)[:-4] + ".part.png", frame_path(out_dir, i))
    else:
        done, spent = 0, 0.0
        for i in left:
            f = first + i - 1
            dt = render_to(frame_path(out_dir, i), f)
            done, spent = done + 1, spent + dt
            note(i, f, dt, False)
            log(f"{plan} image {i}/{n} (scène {f}) : {dt:.1f} s ; reste environ {hms(spent / done * (len(left) - done))}")
    jf.close()
    write_info(rendered=len(left), complete=not todo(out_dir, idxs, res))
    log(f"{plan} : {len(idxs)} image(s) dans {out_dir}")


def setup_render(bpy, scene, a):
    r, c = scene.render, scene.cycles
    res = DRAFT if (a.draft or a.dry) and not a.res else parse_res(a.res) if a.res else FULL
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = 100
    r.threads_mode = "FIXED" if a.threads > 0 else "AUTO"
    if a.threads > 0:
        r.threads = a.threads
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    r.image_settings.color_depth = "8"
    if a.dry:
        # le cadrage de render_lieux : volumes cachés, couleurs au hasard, repères de roue visibles, ni flou ni halo
        for ob in scene.objects:
            if ob.type == "MESH" and ob.name.startswith(("haze", "fumee", "spray_")):
                ob.hide_render = True
            if ob.name.startswith("repere_"):
                ob.hide_render = False
        r.engine = "BLENDER_WORKBENCH"
        sh = scene.display.shading
        sh.light, sh.color_type, sh.show_shadows, sh.show_cavity = "STUDIO", "RANDOM", False, False
        scene.compositing_node_group = None
        r.use_motion_blur = False
        return res, "workbench", "-", 0
    r.engine = "CYCLES"
    c.device = "CPU"
    device = "CPU"
    if not a.cpu and sys.platform != "darwin":       # jamais la carte graphique du Mac (règle machine)
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
                device = f"{kind} ({', '.join(d.name for d in devs)})"
                break
        else:
            log("! ni OptiX ni CUDA : rendu sur le processeur")
    if a.samples:
        c.samples = a.samples
    elif a.draft:
        c.samples = 32
    r.use_persistent_data = not a.no_persistent      # les textures et la scène gardées d'une image à l'autre
    return res, "cycles", device, c.samples


def apply_essais(bpy, scene, essais):
    if "rugosite" in essais:
        k = float(essais["rugosite"])
        count = 0
        for m in bpy.data.materials:
            if not (m.node_tree and m.name.startswith(("rue_asphalt", "rue_gutter"))):
                continue
            nt = m.node_tree
            for p in [nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED"]:
                inp = p.inputs["Roughness"]
                if inp.links:
                    mul = nt.nodes.new("ShaderNodeMath")
                    mul.operation = "MULTIPLY"
                    mul.inputs[1].default_value = k
                    nt.links.new(inp.links[0].from_socket, mul.inputs[0])
                    nt.links.new(mul.outputs[0], inp)
                else:
                    inp.default_value *= k
                count += 1
        log(f"essai rugosité × {k} : {count} Principled de chaussée" + ("" if count else
            " — AUCUNE matière rue_asphalt*/rue_gutter dans ce plan, l'essai ne change rien"))
    if "brume" in essais:
        hollow_haze(bpy, scene)
    for k in PAINT_ENV:
        if k in essais:
            log(f"essai {k} = {essais[k]} ({PAINT_ENV[k]}, lu à la construction de la berline)")


def hollow_haze(bpy, scene):
    """Pas de brume entre la caisse de la berline et l'objectif, ni autour de la caisse : un tube dont l'axe va de la
    caméra au centre de la berline, prolongé d'un rayon de caisse au-delà, recalé à chaque image (caméra et berline
    animées). La densité de chaque volume est multipliée par un masque nul dans le tube, avec un bord fondu."""
    from mathutils import Vector
    hero = bpy.data.objects.get("hero")
    cam = scene.camera
    if hero is None or cam is None:
        log("! essai brume : pas de rig « hero » ou pas de caméra dans ce plan, essai sauté")
        return
    meshes = [o for o in hero.children_recursive if o.type == "MESH" and not o.name.startswith(("repere_", "spray_"))]
    tube = bpy.data.objects.new("brume_creux", None)
    scene.collection.objects.link(tube)
    tube.rotation_mode = "QUATERNION"

    def place(*_):
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        mn = Vector(map(min, *pts))
        mx = Vector(map(max, *pts))
        centre, rad = (mn + mx) / 2, (mx - mn).length / 2
        eye = cam.matrix_world.translation
        axis = centre - eye
        length = axis.length + rad
        axis.normalize()
        tube.location = eye + axis * (length / 2)
        tube.rotation_quaternion = axis.to_track_quat("Z", "Y")
        tube.scale = (rad + 0.3, rad + 0.3, length / 2)
        return centre, rad, length
    centre, rad, length = place()
    bpy.app.handlers.frame_change_post.append(place)
    count = 0
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        nt = m.node_tree
        for vol in [nd for nd in nt.nodes if "Density" in nd.inputs and nd.type in ("PRINCIPLED_VOLUME", "VOLUME_SCATTER",
                                                                                  "VOLUME_ABSORPTION")]:
            tc = nt.nodes.new("ShaderNodeTexCoord")
            tc.object = tube
            sep = nt.nodes.new("ShaderNodeSeparateXYZ")
            nt.links.new(tc.outputs["Object"], sep.inputs[0])
            ab = []
            for i in range(3):
                a = nt.nodes.new("ShaderNodeMath")
                a.operation = "ABSOLUTE"
                nt.links.new(sep.outputs[i], a.inputs[0])
                ab.append(a.outputs[0])
            m1 = nt.nodes.new("ShaderNodeMath")
            m1.operation = "MAXIMUM"
            nt.links.new(ab[0], m1.inputs[0])
            nt.links.new(ab[1], m1.inputs[1])
            m2 = nt.nodes.new("ShaderNodeMath")
            m2.operation = "MAXIMUM"
            nt.links.new(m1.outputs[0], m2.inputs[0])
            nt.links.new(ab[2], m2.inputs[1])
            mask = nt.nodes.new("ShaderNodeMapRange")
            mask.interpolation_type = "SMOOTHSTEP"
            mask.inputs["From Min"].default_value = 0.8
            mask.inputs["From Max"].default_value = 1.0
            nt.links.new(m2.outputs[0], mask.inputs["Value"])
            mul = nt.nodes.new("ShaderNodeMath")
            mul.operation = "MULTIPLY"
            dens = vol.inputs["Density"]
            if dens.links:
                nt.links.new(dens.links[0].from_socket, mul.inputs[0])
            else:
                mul.inputs[0].default_value = dens.default_value
            nt.links.new(mask.outputs["Result"], mul.inputs[1])
            nt.links.new(mul.outputs[0], dens)
            count += 1
    log(f"essai brume creusée : tube de {length:.1f} m sur {2 * rad + 0.6:.1f} m autour de l'axe caméra-berline, "
        f"{count} volume(s) masqué(s)")


# ---------------------------------------------------------------- le pilote, sans Blender

def find_blender(path):
    for p in (path, os.environ.get("BLENDER"), shutil.which("blender"),
              "/Applications/Blender.app/Contents/MacOS/Blender" if sys.platform == "darwin" else None):
        if p and os.path.exists(p):
            return p
    sys.exit("[film] Blender introuvable : --blender CHEMIN ou BLENDER=…")


def vram_used():
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=10).stdout
        return sum(int(x) for x in out.split())
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def run_worker(a, plan, blender):
    essais = parse_essais(a.essai)
    d = os.path.join(a.out, plan_dirname(plan, essais))
    os.makedirs(d, exist_ok=True)
    logpath = os.path.join(d, "blender.log")
    args = [blender, "-b", "--factory-startup", "--python-exit-code", "1", "-t", str(a.threads), "-P",
            os.path.abspath(__file__), "--", "--worker", "--mode", a.mode, "--plan", plan, "--out", a.out,
            "--threads", str(a.threads)]
    for k in ("frames", "samples", "res"):
        if getattr(a, k):
            args += [f"--{k}", str(getattr(a, k))]
    for k in ("draft", "dry", "cpu", "no_persistent"):
        if getattr(a, k):
            args.append("--" + k.replace("_", "-"))
    for e in a.essai or ():
        args += ["--essai", e]
    env = dict(os.environ, FILM3D_ASSETS=a.assets)
    base = vram_used()
    peak = base
    t0 = time.time()
    with open(logpath, "a", encoding="utf-8") as lf:
        lf.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} {' '.join(args)}\n")
        lf.flush()
        pos = lf.tell()
        p = subprocess.Popen(args, stdout=lf, stderr=subprocess.STDOUT, env=env)
        with open(logpath, encoding="utf-8", errors="replace") as rf:
            rf.seek(pos)
            buf = ""
            while True:
                done = p.poll() is not None
                lines = (buf + rf.read()).split("\n")
                buf = "" if done else lines.pop()          # une ligne pas encore finie attend le tour suivant
                for line in lines:
                    if line.startswith("[film]") or "Error" in line or "Traceback" in line:
                        print(line.rstrip(), flush=True)
                v = vram_used()
                if v is not None:
                    peak = max(peak or 0, v)
                if done:
                    break
                time.sleep(2)
    ok = p.returncode == 0
    log(f"{plan} : Blender {'fini' if ok else f'en ÉCHEC (code {p.returncode}), voir {logpath}'} en "
        f"{hms(time.time() - t0)}" + (f", mémoire vidéo au plus {peak} Mo (dont {base} avant)" if peak else ""))
    return ok, peak


def bench_summary(a, plans, peaks):
    rows, total = [], 0.0
    for plan in plans:
        path = os.path.join(a.out, "banc", f"{plan_dirname(plan, parse_essais(a.essai))}.json")
        if not os.path.exists(path):
            rows.append(f"  {plan:5} pas mesuré (plan sauté ou en échec)")
            continue
        b = json.load(open(path, encoding="utf-8"))
        est = b["build_s"] + b["frame_s"] * b["frames_to_render"]
        total += est
        rows.append(f"  {plan:5} {'animé' if b['animated'] else 'FIXE '} construction {hms(b['build_s']):>10}  "
                    f"image {b['frame_s']:7.1f} s × {b['frames_to_render']:2}  = {hms(est):>10}  mémoire {b['rss_mb']} Mo"
                    + (f", vidéo {peaks.get(plan)} Mo" if peaks.get(plan) else ""))
    txt = "\n".join([f"banc d'essai ({time.strftime('%Y-%m-%d %H:%M')}) :"] + rows +
                    [f"  film entier estimé : {hms(total)} (la première image d'un plan compte la compilation et "
                     f"le chargement : estimation haute)"])
    print(txt, flush=True)
    with open(os.path.join(a.out, "banc", "banc.txt"), "w", encoding="utf-8") as f:
        f.write(txt + "\n")


def assemble(a, plans, cut):
    """Les images de chaque plan -> une prise mp4 (24 i/s, H.264 quasi sans perte, bt709) : dans le dossier des prises
    du montage si elle est complète, en pleine taille et sans essai ; sinon un brouillon à côté des images."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("[film] ffmpeg introuvable")
    essais = parse_essais(a.essai)
    made = []
    for plan in plans:
        d = os.path.join(a.out, plan_dirname(plan, essais))
        n = cut[plan]
        info = {}
        if os.path.exists(os.path.join(d, "plan.json")):
            info = json.load(open(os.path.join(d, "plan.json"), encoding="utf-8"))
        if info.get("skipped"):
            log(f"{plan} : pas de scène ({info['skipped']}), pas de prise : le montage posera son carton")
            continue
        sizes = [png_size(frame_path(d, i)) for i in range(1, n + 1)]
        have = [i for i, s in enumerate(sizes, 1) if s]
        if not have:
            log(f"{plan} : aucune image dans {d}")
            continue
        last = have[-1]
        missing = [i for i in range(1, last + 1) if not sizes[i - 1]]
        if missing or len(set(s for s in sizes if s)) > 1:
            log(f"! {plan} : images manquantes ou de tailles différentes ({missing[:8]}…), pas de prise")
            continue
        if last < n:
            log(f"! {plan} : {last} images sur {n} (plan court ou --frames) : la prise est courte, le montage tiendra "
                f"la dernière")
        w, h = sizes[0]
        full = w >= FULL[0] and h >= FULL[1] and info.get("engine") == "cycles" and not essais
        if full:
            os.makedirs(a.plans, exist_ok=True)
            dest = os.path.join(a.plans, f"{plan}-{a.take}.mp4")
            if os.path.exists(dest) and not a.force:
                log(f"! {dest} existe déjà : --take N pour une autre prise, ou --force")
                continue
        else:
            dest = os.path.join(a.out, f"{plan_dirname(plan, essais)}-brouillon.mp4")
        vf = ("scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
              "setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709")
        cmd = [ffmpeg, "-y", "-v", "error", "-framerate", "24", "-start_number", "1", "-i",
               os.path.join(d, "%04d.png"), "-frames:v", str(last), "-vf", vf, "-c:v", "libx264", "-preset", "slow",
               "-crf", "12", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
               "-color_trc", "bt709", "-color_range", "tv", "-r", "24", "-movflags", "+faststart", "-an", dest]
        if a.threads > 0:
            cmd[1:1] = ["-threads", str(a.threads)]
        subprocess.run(cmd, check=True)
        made.append(dest)
        log(f"{plan} : {last} images {w}×{h} -> {dest}" + ("" if full else " (BROUILLON : pas une prise du montage)")
            + ("" if info.get("animated", True) else " — image fixe répétée, plan pas encore animé"))
    if made:
        log("ensuite, sur le Mac : npx tsx scripts/film-contact.ts <prise> (planche-contact), puis "
            "npx tsx scripts/film-assemble.ts (les six mp4 du site et l'affiche)")
    return made


def selftest():
    import tempfile
    cut = read_cut()
    assert sum(cut.values()) == 296 and cut["P6"] == 40 and cut["FIN6"] == 56, cut
    assert parse_frames("3-5", 28) == [3, 4, 5] and parse_frames("17", 28) == [17] and parse_frames(None, 3) == [1, 2, 3]
    assert parse_frames("20-40", 24) == [20, 21, 22, 23, 24]
    assert plan_dirname("P3", {"rugosite": "0.5"}) == "P3+rugosite0.5" and plan_dirname("P3", {}) == "P3"
    assert parse_essais(["rugosite"]) == {"rugosite": "0.5"} and parse_essais(["peinture=#4e0a28"])["peinture"]
    for bad in (["peinture"], ["inconnu=1"]):
        try:
            parse_essais(bad)
            raise AssertionError(bad)
        except ValueError:
            pass
    import struct
    import zlib

    def png(w, h):
        raw = b"".join(b"\0" + b"\0" * (3 * w) for _ in range(h))
        chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))  # noqa: E731
        return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    with tempfile.TemporaryDirectory() as d:
        for i in (1, 2, 4):
            open(frame_path(d, i), "wb").write(png(36, 64))
        open(frame_path(d, 3), "wb").write(png(36, 64)[:-20])        # tronquée
        open(frame_path(d, 5), "wb").write(png(18, 32))              # autre taille
        assert png_size(frame_path(d, 1)) == (36, 64) and png_size(frame_path(d, 3)) is None
        assert todo(d, range(1, 7), (36, 64)) == [3, 5, 6], todo(d, range(1, 7), (36, 64))
    print("[film] selftest : durées (296 images), --frames, essais, reprise (absente, tronquée, autre taille) : ok")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description="Rend le film plan par plan (voir l'en-tête du fichier).")
    ap.add_argument("--plan", default=",".join(ORDER), help="OUV,P1,… (tous par défaut, dans l'ordre du montage)")
    ap.add_argument("--frames", default=None, help="a-b, comptées dans le plan (1 à sa longueur)")
    ap.add_argument("--samples", type=int, default=None)
    ap.add_argument("--res", default=None, help="720x1280 par défaut (360x640 en --draft et --dry)")
    ap.add_argument("--draft", action="store_true", help="360 × 640, 32 échantillons")
    ap.add_argument("--dry", action="store_true", help="essai à blanc en Workbench, 360 × 640")
    ap.add_argument("--cpu", action="store_true")
    ap.add_argument("--no-persistent", action="store_true", help="ne garde pas la scène d'une image à l'autre")
    ap.add_argument("--threads", type=int, default=0, help="0 : tous (machine louée) ; 2 sur le Mac")
    ap.add_argument("--essai", action="append", default=[], help="rugosite, brume, peinture=hex, metal=, vernis=, "
                                                                 "vernis_rugosite=")
    ap.add_argument("--bench", action="store_true")
    ap.add_argument("--list", action="store_true", help="construit sans rendre : assets.txt par plan")
    ap.add_argument("--assemble", action="store_true", help="les images -> une prise mp4 par plan")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--out", default=None)
    ap.add_argument("--plans", default=None, help="le dossier des prises du montage (design/film/plans)")
    ap.add_argument("--take", type=int, default=1)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--blender", default=None)
    ap.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--mode", default="render", help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    a.assets = assets_dir()
    film = os.path.dirname(os.path.abspath(a.assets))
    a.out = os.path.abspath(a.out or os.environ.get("FILM3D_RENDER") or os.path.join(film, "rendu"))
    a.plans = os.path.abspath(a.plans or os.path.join(film, "plans"))
    if a.selftest:
        selftest()
        return
    if a.worker:
        worker(a)
        return
    parse_essais(a.essai)
    plans = [p.strip() for p in a.plan.split(",") if p.strip()]
    for p in plans:
        if p not in SOURCES:
            sys.exit(f"[film] plan inconnu : {p} ({', '.join(ORDER)})")
    plans = [p for p in ORDER if p in plans]
    cut = read_cut()
    os.makedirs(a.out, exist_ok=True)
    if a.assemble:
        assemble(a, plans, cut)
        return
    a.mode = "bench" if a.bench else "list" if a.list else "render"
    blender = find_blender(a.blender)
    log(f"{a.mode} de {', '.join(plans)} ({sum(cut[p] for p in plans)} images) ; assets {a.assets} ; images {a.out}")
    failed, peaks = [], {}
    for plan in plans:
        ok, peak = run_worker(a, plan, blender)
        peaks[plan] = peak
        if not ok:
            failed.append(plan)
    if a.bench:
        bench_summary(a, plans, peaks)
    if a.list:
        union = set()
        for plan in plans:
            p = os.path.join(a.out, plan, "assets.txt")
            if os.path.exists(p):
                union.update(x.strip() for x in open(p, encoding="utf-8") if x.strip())
        with open(os.path.join(a.out, "assets.txt"), "w", encoding="utf-8") as f:
            f.write("".join(x + "\n" for x in sorted(union)))
        log(f"{len(union)} fichiers d'assets chargés par {', '.join(plans)} : {os.path.join(a.out, 'assets.txt')}")
    if failed:
        log(f"ÉCHEC : {', '.join(failed)} (voir <out>/<PLAN>/blender.log)")
        sys.exit(1)


if __name__ == "__main__":
    main()
