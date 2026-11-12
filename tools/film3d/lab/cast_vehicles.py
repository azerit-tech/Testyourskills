# Les véhicules et accessoires du haut de l'escalade : fourgon, hélicoptère,
# avion de chasse, barrage (barrières, plots, herse, mât d'éclairage).
#
# Module importable depuis cast.py (Blender) :
#
#   import sys; sys.path.insert(0, "tools/film3d/lab"); import cast_vehicles as cv
#   van = cv.load_van()                     # dict : body, lightbar, lenses, lights
#   heli = cv.load_helicopter()             # dict : body, rotor_main, rotor_tail, searchlight, ...
#   jet = cv.load_jet()                     # dict : body, nav_lights
#   props = cv.load_props()                 # dict : barrier, barrier_concrete, cone, spike_strip, light_tower, ...
#
# Repère commun à tout ce qui est rendu ici (le même que police.glb brut) :
# l'avant vers +x, le haut +z, l'origine au centre de l'emprise et au sol
# (bas des roues, des patins ; pour l'avion, bas du train ou du ventre).
# Échelle réelle, en mètres.
#
# Le laboratoire (planches comparatives, crépuscule) :
#   blender -b -t 2 --factory-startup -P tools/film3d/lab/cast_vehicles.py -- --sheet van|helico|avion|props|crepuscule
# écrit Azerit/design/film/ref/lab/cast-vehicules-comparatif-<planche>.png
# et Azerit/design/film/assets/cast/lab-vehicles.blend.
import math
import os
import subprocess
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def _main_checkout():
    try:
        common = subprocess.run(["git", "-C", ROOT, "rev-parse", "--git-common-dir"], capture_output=True, text=True, check=True).stdout.strip()
        return os.path.dirname(os.path.abspath(os.path.join(ROOT, common)))
    except Exception:
        return ROOT


ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(os.path.dirname(_main_checkout()), "design", "film", "assets")
CAST = os.path.join(ASSETS, "cast")
REF = os.path.join(os.path.dirname(ASSETS), "ref")

# palette (la même que scene_a.py)
NAVY = "#1d2747"        # caisse de la patrouille
CREAM = "#cfc8aa"       # portières de la patrouille, filets du fourgon et de l'hélicoptère : crème rabattu (#e9e2bf
                        # brûlait en blanc sous les phares et les lampadaires, portière ouverte de FIN)
PATROL_BODY = "#111830" # caisse de la patrouille détaillée : marine profond presque noir (sous vernis)
CORAL = "#ff6a3d"       # lentille gauche de la rampe
LILAC = "#8d8cf0"       # lentille droite de la rampe
LAMP = "#fff9cb"        # projecteur, phares
BAR_GLOW = 2.0         # émission de la rampe allumée (au-delà, AgX la blanchit et le corail / violet ne se lit plus)
JET_GREY = "#3a404d"    # avion repeint, gris bleuté sombre


def lin(hexcolor, a=1.0):
    h = hexcolor.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


# ---------------------------------------------------------------- import et géométrie

def _collection(collection):
    return collection or bpy.context.scene.collection


def import_model(path, collection=None):
    """Importe un glTF, met chaque maillage à plat (sans parent, transformations appliquées).

    Un maillage au nom générique (« Object_12 ») prend le nom de son parent glTF, plus parlant.
    Les vides, caméras et lumières du fichier sont supprimés, les animations aussi."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        if o.name.startswith("Object_") and o.parent is not None:
            o.name = o.parent.name + "|" + o.name
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        o.animation_data_clear()
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    coll = _collection(collection)
    for o in meshes:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    return meshes


def join(objs, name):
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    ob.rotation_mode = "XYZ"
    return ob


def bbox(objs):
    """Emprise monde (min, max) d'une liste d'objets (bound_box n'est à jour qu'après une évaluation)."""
    bpy.context.view_layer.update()
    mn = Vector((1e18,) * 3)
    mx = Vector((-1e18,) * 3)
    for o in objs:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, p))
            mx = Vector(map(max, mx, p))
    return mn, mx


def transform_all(objs, mat):
    """Applique une matrice aux sommets de chaque objet (les objets restent à l'origine)."""
    done = set()
    for o in objs:
        if o.data in done:
            continue
        o.data.transform(mat)
        done.add(o.data)
        o.data.update()


def normalise(objs, rot_z=0.0, length=None, axis_len=0, scale=None, ground=True):
    """Tourne (degrés, autour de z), met à l'échelle et recentre au sol un ensemble de maillages.

    length : longueur voulue (m) selon l'axe axis_len (0 = x) après rotation ; scale : facteur direct."""
    if rot_z:
        transform_all(objs, Matrix.Rotation(math.radians(rot_z), 4, "Z"))
    mn, mx = bbox(objs)
    s = scale if scale else (length / (mx[axis_len] - mn[axis_len]) if length else 1.0)
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z if ground else (mn.z + mx.z) / 2))
    transform_all(objs, Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    return s


def remove(objs, *patterns):
    """Supprime les objets dont le nom contient un des motifs ; renvoie les restants."""
    keep = []
    for o in objs:
        if any(p in o.name for p in patterns):
            me = o.data
            bpy.data.objects.remove(o)
            if me is not None and me.users == 0:
                bpy.data.meshes.remove(me)
        else:
            keep.append(o)
    return keep


def pick(objs, *patterns):
    return [o for o in objs if any(p in o.name for p in patterns)]


def set_origin(ob, point):
    """Déplace l'origine d'un objet sur un point monde, sans bouger sa géométrie."""
    bpy.context.view_layer.update()
    local = ob.matrix_world.inverted() @ Vector(point)
    ob.data.transform(Matrix.Translation(-local))
    ob.matrix_world = ob.matrix_world @ Matrix.Translation(local)


def parent_keep(child, parent):
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = mw


def vertex_centroid(ob):
    mw = ob.matrix_world
    vs = ob.data.vertices
    s = Vector()
    for v in vs:
        s += mw @ v.co
    return s / max(1, len(vs))


def vertex_bbox(objs):
    """Emprise monde (min, max) mesurée sur les sommets : juste même après un data.transform (bound_box, lui, n'est
    rafraîchi qu'à l'évaluation de l'objet)."""
    mn = Vector((1e18,) * 3)
    mx = Vector((-1e18,) * 3)
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            mn = Vector(map(min, mn, p))
            mx = Vector(map(max, mx, p))
    return mn, mx


def split_wheels(parts, is_wheel, tag):
    """Sort des pièces d'un véhicule ses quatre roues (une pièce glTF par roue dans les modèles retenus), pour
    qu'elles tournent : chaque roue garde sa géométrie, son origine passe au centre de ses sommets (sur l'axe),
    elle s'appelle wheel_<FL|FR|BL|BR>_<tag> (l'avant vers +x, la gauche vers +y). Renvoie (le reste, les roues) ;
    sans quatre roues, rien n'est sorti. À parenter à la caisse après le join (attach_wheels)."""
    wheels = [o for o in parts if is_wheel(o)]
    if len(wheels) != 4:
        return parts, []
    for o in wheels:
        mn, mx = vertex_bbox([o])
        c = (mn + mx) / 2
        set_origin(o, c)
        key = ("F" if c.x > 0 else "B") + ("L" if c.y > 0 else "R")
        o.name = o.data.name = f"wheel_{key}_{tag}"
        o.rotation_mode = "XYZ"
        o["wheel_r"] = (mx.z - mn.z) / 2
        o["front_x"] = mx.x
    return [o for o in parts if o not in wheels], wheels


def attach_wheels(body, wheels):
    """Les roues sorties par split_wheels, enfants de la caisse, leurs places gardées ; la caisse note leur rayon,
    l'empattement, l'essieu avant (x, repère de la caisse) et l'avant des roues avant (front_wheel_x)."""
    if not wheels:
        return
    for w in wheels:
        parent_keep(w, body)
    front = [w for w in wheels if w.location.x > 0]
    rear = [w for w in wheels if w.location.x <= 0]
    body["wheel_r"] = sum(w["wheel_r"] for w in wheels) / 4
    fx = sum(w.location.x for w in front) / max(1, len(front))
    rx = sum(w.location.x for w in rear) / max(1, len(rear))
    body["front_axle"], body["wheelbase"] = fx, fx - rx
    body["front_wheel_x"] = max(w["front_x"] for w in front) if front else fx


def split_loose(ob):
    """Sépare un maillage en morceaux disjoints ; renvoie la liste des morceaux."""
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return list(bpy.context.selected_objects)


def decimate(ob, ratio):
    m = ob.modifiers.new("decimate", "DECIMATE")
    m.ratio = ratio
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)


def tris(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == "MESH")


def roof_z(ob, x, y=0.0):
    """Hauteur du dessus d'un objet en (x, y), par un rayon tiré d'en haut (coordonnées monde)."""
    inv = ob.matrix_world.inverted()
    o = inv @ Vector((x, y, 100.0))
    d = (inv.to_3x3() @ Vector((0, 0, -1))).normalized()
    hit, loc, _n, _i = ob.ray_cast(o, d)
    return (ob.matrix_world @ loc).z if hit else None


def downscale_images(objs, size=2048):
    """Ramène à 2k les textures plus grandes (la mémoire du Mac est comptée)."""
    seen = set()
    for o in objs:
        for m in o.data.materials:
            if not m or not m.node_tree:
                continue
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image and n.image.name not in seen:
                    seen.add(n.image.name)
                    w, h = n.image.size
                    if max(w, h) > size:
                        f = size / max(w, h)
                        n.image.scale(int(w * f), int(h * f))


# ---------------------------------------------------------------- matériaux

def _mat(name):
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return m, nt, out


def _math(nt, op, a, b=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, n.inputs[i])
        else:
            n.inputs[i].default_value = v
    return n.outputs[0]


def _principled(nt, **kw):
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    for k, v in kw.items():
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, p.inputs[k])
        else:
            p.inputs[k].default_value = v
    return p


def mat_plain(name, color, rough=0.5, metal=0.0, coat=0.0):
    m, nt, out = _mat(name)
    p = _principled(nt, **{"Base Color": lin(color) if isinstance(color, str) else color, "Roughness": rough,
                           "Metallic": metal, "Coat Weight": coat, "Coat Roughness": 0.05})
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_emit(name, color, strength):
    m, nt, out = _mat(name)
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = lin(color) if isinstance(color, str) else color
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


def mat_livery(name, bands=(), roof=None, base=NAVY, stripe=CREAM, metal=0.2, rough=0.32, coat=1.0, axis_up=2):
    """Livrée deux tons sans lettrage, calculée en coordonnées objet.

    bands : boîtes (x0, x1, z0, z1) peintes en crème ; roof : au-dessus de cette hauteur, crème."""
    m, nt, out = _mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    x, z = sep.outputs[0], sep.outputs[axis_up]
    mask = None
    for x0, x1, z0, z1 in bands:
        b = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", _math(nt, "GREATER_THAN", x, x0), _math(nt, "LESS_THAN", x, x1)),
                  _math(nt, "MULTIPLY", _math(nt, "GREATER_THAN", z, z0), _math(nt, "LESS_THAN", z, z1)))
        mask = b if mask is None else _math(nt, "MAXIMUM", mask, b)
    if roof is not None:
        r = _math(nt, "GREATER_THAN", z, roof)
        mask = r if mask is None else _math(nt, "MAXIMUM", mask, r)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = lin(base)
    mix.inputs[7].default_value = lin(stripe)
    if mask is not None:
        nt.links.new(mask, mix.inputs["Factor"])
    else:
        mix.inputs["Factor"].default_value = 0.0
    p = _principled(nt, **{"Metallic": metal, "Roughness": rough, "Coat Weight": coat, "Coat Roughness": 0.04})
    nt.links.new(mix.outputs[2], p.inputs["Base Color"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_lenses(name="lightbar_lenses", strength=0.0, split_axis=1):
    """Lentilles de rampe : corail d'un côté (coordonnée objet > 0), violet de l'autre ; strength > 0 les allume."""
    m, nt, out = _mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    side = _math(nt, "GREATER_THAN", sep.outputs[split_axis], 0.0)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = lin(LILAC)
    mix.inputs[7].default_value = lin(CORAL)
    nt.links.new(side, mix.inputs["Factor"])
    p = _principled(nt, **{"Roughness": 0.08, "Transmission Weight": 0.6, "IOR": 1.5, "Emission Strength": strength})
    nt.links.new(mix.outputs[2], p.inputs["Base Color"])
    # la moitié éteinte du clignotement (motion.flash_bars, via lightbar_lights) s'éteint aussi ici
    on = _bar_on(nt, side)
    ecol = nt.nodes.new("ShaderNodeMix")
    ecol.data_type = "RGBA"
    nt.links.new(_math(nt, "ADD", BAR_REST, _math(nt, "MULTIPLY", on, 1.0 - BAR_REST)), ecol.inputs["Factor"])
    ecol.inputs[6].default_value = (0, 0, 0, 1)
    nt.links.new(mix.outputs[2], ecol.inputs[7])
    nt.links.new(ecol.outputs[2], p.inputs["Emission Color"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_glass(name="cast_glass", tint="#20242c"):
    m, nt, out = _mat(name)
    p = _principled(nt, **{"Base Color": lin(tint), "Roughness": 0.03, "Transmission Weight": 0.85, "IOR": 1.45})
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_tinted_texture(name, src_mat, color, keep=0.35, rough=0.45, metal=0.3):
    """Garde le détail (lumière) d'une texture d'origine sans ses couleurs : repeint dans color.

    À n'utiliser que sur une texture sans lettrage (le dessin d'un lettrage resterait lisible en valeur)."""
    img = None
    if src_mat and src_mat.node_tree:
        for n in src_mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED" and n.inputs["Base Color"].links:
                fr = n.inputs["Base Color"].links[0].from_node
                if fr.type == "TEX_IMAGE":
                    img = fr.image
    m, nt, out = _mat(name)
    p = _principled(nt, **{"Roughness": rough, "Metallic": metal})
    if img is None:
        p.inputs["Base Color"].default_value = lin(color)
    else:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(t.outputs[0], bw.inputs[0])
        # valeur relative au gris moyen de la texture, ramenée autour de 1
        f = _math(nt, "ADD", _math(nt, "MULTIPLY", bw.outputs[0], keep * 2.5), 1.0 - keep)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = lin(color)
        nt.links.new(f, mix.inputs[7])
        nt.links.new(mix.outputs[2], p.inputs["Base Color"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def _mask_boxes(nt, sep, boxes, axes=(0, 2)):
    """Masque 0/1 : union de boîtes (a0, a1, b0, b1) sur deux axes des coordonnées objet."""
    mask = None
    for a0, a1, b0, b1 in boxes:
        a, b = sep.outputs[axes[0]], sep.outputs[axes[1]]
        m = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", _math(nt, "GREATER_THAN", a, a0), _math(nt, "LESS_THAN", a, a1)),
                  _math(nt, "MULTIPLY", _math(nt, "GREATER_THAN", b, b0), _math(nt, "LESS_THAN", b, b1)))
        mask = m if mask is None else _math(nt, "MAXIMUM", mask, m)
    return mask


def rubber_over(src, name, dark=0.1, keep_uv=()):
    """Pneus d'un atlas trop clair (gris moyen, lettrage du flanc lisible) : couleur × dark, sans vernis ;
    keep_uv : boîtes (u0, u1, v0, v1) d'UV gardées (la jante)."""
    m = src.copy()
    m.name = name
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if "Coat Weight" in p.inputs:
        for l in list(p.inputs["Coat Weight"].links):
            nt.links.remove(l)
        p.inputs["Coat Weight"].default_value = 0.0
    if not p.inputs["Base Color"].links:
        return m
    orig = p.inputs["Base Color"].links[0].from_socket
    k = dark
    if keep_uv:
        uv = nt.nodes.new("ShaderNodeUVMap")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(uv.outputs[0], sep.inputs[0])
        keep = _mask_boxes(nt, sep, keep_uv, axes=(0, 1))
        k = _math(nt, "ADD", dark, _math(nt, "MULTIPLY", keep, 1.0 - dark))
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(orig, mul.inputs[6])
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    for i in range(3):
        if isinstance(k, float):
            comb.inputs[i].default_value = k
        else:
            nt.links.new(k, comb.inputs[i])
    nt.links.new(comb.outputs[0], mul.inputs[7])
    nt.links.new(mul.outputs[2], p.inputs["Base Color"])
    return m


def livery_over(src, name, light_boxes=(), base=NAVY, light=CREAM, keep_uv=(), rough=0.3, metal=0.35, coat=1.0,
                lamp_strength=0.0, flake=False, keep_out=(), lamp_zones=None, coat_rough=None):
    """Repeint un matériau d'origine (ses cartes de normales et de rugosité restent) : caisse base,
    boîtes (x0, x1, z0, z1) en coordonnées objet peintes en light (portières, filet).

    keep_uv : boîtes (u0, u1, v0, v1) d'UV où la texture couleur d'origine reste (feux peints dans l'atlas).
    keep_out : boîtes (x0, x1, z0, z1) en coordonnées objet où l'atlas n'est jamais gardé, même dans keep_uv
    (le lettrage d'origine des portières partage ces UV avec les feux).
    lamp_zones : dict(v_split, core=(y, z, x0), core_r, core_gain) : les feux de l'atlas au-dessus de v_split sont
    les phares, en dessous les feux arrière ; leurs niveaux sont deux nœuds Valeur, « lamp_head » et « lamp_tail »
    (1 par défaut, à piloter par l'énergie des lampes : lamp_drivers) ; chaque phare a un cœur chaud, un disque de
    rayon core_r centré en (±y, z) à l'avant de x0 (coordonnées objet), core_gain fois plus fort que son verre."""
    if src is not None and src.node_tree:
        m = src.copy()
        m.name = name
        nt = m.node_tree
        p = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    else:
        m, nt, out = _mat(name)
        p = _principled(nt)
        nt.links.new(p.outputs[0], out.inputs[0])
    orig = None
    for l in list(p.inputs["Base Color"].links):
        orig = l.from_socket
        nt.links.remove(l)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = lin(base)
    mix.inputs[7].default_value = lin(light)
    mask = _mask_boxes(nt, sep, light_boxes)
    if mask is not None:
        nt.links.new(mask, mix.inputs["Factor"])
    else:
        mix.inputs["Factor"].default_value = 0.0
    col = mix.outputs[2]
    if keep_uv and orig is not None:
        uv = nt.nodes.new("ShaderNodeUVMap")
        su = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(uv.outputs[0], su.inputs[0])
        km = _mask_boxes(nt, su, keep_uv, axes=(0, 1))
        if keep_out:
            # le bas des portières de « jeandiz » tombe dans la zone d'atlas des feux : gardé, son lettrage
            # d'origine s'y lisait (et s'allumait avec les feux) sur la portière ouverte de FIN
            km = _math(nt, "MULTIPLY", km, _math(nt, "SUBTRACT", 1.0, _mask_boxes(nt, sep, keep_out)))
        k = nt.nodes.new("ShaderNodeMix")
        k.data_type = "RGBA"
        nt.links.new(km, k.inputs["Factor"])
        nt.links.new(col, k.inputs[6])
        nt.links.new(orig, k.inputs[7])
        col = k.outputs[2]
        if lamp_strength:
            # les feux de l'atlas s'allument : clairs -> crème (phares), saturés -> leur couleur (feux rouges)
            hsv = nt.nodes.new("ShaderNodeSeparateColor")
            hsv.mode = "HSV"
            nt.links.new(_raw_tex(orig), hsv.inputs[0])
            ec = nt.nodes.new("ShaderNodeMix")
            ec.data_type = "RGBA"
            nt.links.new(hsv.outputs[1], ec.inputs["Factor"])
            ec.inputs[6].default_value = lin(LAMP)
            nt.links.new(orig, ec.inputs[7])
            nt.links.new(ec.outputs[2], p.inputs["Emission Color"])
            lit = nt.nodes.new("ShaderNodeMapRange")
            lit.inputs["From Min"].default_value = 0.45
            lit.inputs["From Max"].default_value = 0.8
            nt.links.new(hsv.outputs[2], lit.inputs["Value"])
            level = lit.outputs[0]
            if lamp_zones:
                head = _math(nt, "GREATER_THAN", su.outputs[1], lamp_zones["v_split"])
                vals = {}
                for key in ("lamp_head", "lamp_tail"):
                    v = nt.nodes.new("ShaderNodeValue")
                    v.name = v.label = key
                    v.outputs[0].default_value = 1.0
                    vals[key] = v.outputs[0]
                lvl = _math(nt, "ADD", _math(nt, "MULTIPLY", head, vals["lamp_head"]),
                            _math(nt, "MULTIPLY", _math(nt, "SUBTRACT", 1.0, head), vals["lamp_tail"]))
                level = _math(nt, "MULTIPLY", level, lvl)
                cy, cz, x0 = lamp_zones["core"]
                r = lamp_zones.get("core_r", 0.05)
                dy = _math(nt, "SUBTRACT", _math(nt, "ABSOLUTE", sep.outputs[1]), cy)
                dz = _math(nt, "SUBTRACT", sep.outputs[2], cz)
                d = _math(nt, "SQRT", _math(nt, "ADD", _math(nt, "MULTIPLY", dy, dy), _math(nt, "MULTIPLY", dz, dz)))
                fall = nt.nodes.new("ShaderNodeMapRange")
                fall.clamp = True
                fall.inputs["From Min"].default_value = 0.35 * r
                fall.inputs["From Max"].default_value = r
                fall.inputs["To Min"].default_value = 1.0
                fall.inputs["To Max"].default_value = 0.0
                nt.links.new(d, fall.inputs["Value"])
                core = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", fall.outputs[0], head),
                             _math(nt, "GREATER_THAN", sep.outputs[0], x0))
                level = _math(nt, "ADD", level, _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", core, vals["lamp_head"]),
                                                      lamp_zones.get("core_gain", 5.0)))
            nt.links.new(_math(nt, "MULTIPLY", _math(nt, "MULTIPLY", km, level), lamp_strength),
                         p.inputs["Emission Strength"])
    nt.links.new(col, p.inputs["Base Color"])
    if flake:
        # vraie peinture auto (non testé en rendu) : la carte de rugosité d'origine (mate) est remplacée par
        # une base métallisée à paillettes fines (bruit très serré sur la rugosité et le métal), sous un vernis
        # brillant qui reflète le ciel
        for key in ("Metallic", "Roughness", "Coat Weight", "Coat Roughness"):
            for l in list(p.inputs[key].links):
                nt.links.remove(l)
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 1800.0
        nz.inputs["Detail"].default_value = 0.0
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        fr = nt.nodes.new("ShaderNodeMapRange")
        fr.inputs["To Min"].default_value = rough - 0.12
        fr.inputs["To Max"].default_value = rough + 0.12
        nt.links.new(nz.outputs["Fac"], fr.inputs["Value"])
        nt.links.new(fr.outputs[0], p.inputs["Roughness"])
        fm = nt.nodes.new("ShaderNodeMapRange")
        fm.inputs["To Min"].default_value = metal - 0.2
        fm.inputs["To Max"].default_value = metal + 0.2
        nt.links.new(nz.outputs["Fac"], fm.inputs["Value"])
        nt.links.new(fm.outputs[0], p.inputs["Metallic"])
    else:
        for key in ("Metallic", "Roughness"):
            if not p.inputs[key].links:
                p.inputs[key].default_value = metal if key == "Metallic" else rough
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = coat_rough if coat_rough is not None else (0.02 if flake else 0.03)
    return m


def lamp_drivers(mat, head=None, tail=None):
    """Les niveaux « lamp_head » et « lamp_tail » d'une livrée (livery_over, lamp_zones) suivent l'énergie d'une
    lampe : phares éteints par une scène (énergie 0), leur verre et leur cœur s'éteignent ; en veilleuse (120 W au
    lieu de 450), ils baissent d'autant. Pilotes à expression simple."""
    for key, d in (("lamp_head", head), ("lamp_tail", tail)):
        n = mat.node_tree.nodes.get(key) if mat and mat.node_tree else None
        if n is None or d is None:
            continue
        fc = n.outputs[0].driver_add("default_value")
        drv = fc.driver
        drv.type = "SCRIPTED"
        v = drv.variables.new()
        v.name = "e"
        v.type = "SINGLE_PROP"
        v.targets[0].id_type = "LIGHT"
        v.targets[0].id = d
        v.targets[0].data_path = "energy"
        drv.expression = f"min(1.5, e / {max(d.energy, 1e-3):.3f})"


def atlas_points(ob, uv_box):
    """Les centres (coordonnées objet) des faces d'un maillage dont le centre en UV tombe dans uv_box
    (u0, u1, v0, v1) : où un atlas a peint ses feux."""
    me = ob.data
    uv = me.uv_layers.active
    out = []
    if uv is None:
        return out
    u0, u1, v0, v1 = uv_box
    for poly in me.polygons:
        su = sv = 0.0
        for li in poly.loop_indices:
            a, b = uv.data[li].uv
            su += a
            sv += b
        n = len(poly.loop_indices)
        if u0 < su / n < u1 and v0 < sv / n < v1:
            out.append(poly.center.copy())
    return out


def mats_named(objs, *names):
    """(objet, indice, matériau) des emplacements dont le matériau s'appelle name (ou name.00N)."""
    out = []
    for o in objs:
        for i, m in enumerate(o.data.materials):
            if m is None:
                continue
            base = m.name
            if len(base) > 4 and base[-4] == "." and base[-3:].isdigit():
                base = base[:-4]
            if base in names or m.name in names:
                out.append((o, i, m))
    return out


def _replace_mats(objs, names, mat_or_fn):
    """Remplace les matériaux nommés ; mat_or_fn est un matériau ou une fonction (matériau d'origine) -> matériau."""
    cache = {}
    for o, i, m in mats_named(objs, *names):
        if callable(mat_or_fn):
            if m.name not in cache:
                cache[m.name] = mat_or_fn(m)
            o.data.materials[i] = cache[m.name]
        else:
            o.data.materials[i] = mat_or_fn


def mat_lamp(name, color=LAMP, strength=0.0, glass=False):
    """Feu : verre clair (ou réflecteur) qui s'allume en émission de la couleur donnée."""
    m, nt, out = _mat(name)
    kw = {"Base Color": lin(color) if not glass else (0.9, 0.9, 0.9, 1), "Roughness": 0.05 if glass else 0.2,
          "Metallic": 0.0 if glass else 0.6, "Emission Color": lin(color), "Emission Strength": strength}
    if glass:
        kw.update({"Transmission Weight": 0.9, "IOR": 1.5})
    p = _principled(nt, **kw)
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def headlight_spots(body, points, on=True, energy=350.0, color=LAMP, angle=55.0, collection=None, blend=0.6):
    """Deux spots vers l'avant (+x), légèrement plongeants, aux points donnés (repère du véhicule)."""
    out = []
    if not on:
        return out
    for i, p in enumerate(points):
        d = bpy.data.lights.new(f"{body.name}_head_{i}", "SPOT")
        d.energy = energy
        d.color = lin(color)[:3]
        d.spot_size = math.radians(angle)
        d.spot_blend = blend
        d.shadow_soft_size = 0.05
        ob = bpy.data.objects.new(d.name, d)
        (collection or body.users_collection[0]).objects.link(ob)
        ob.parent = body
        ob.location = p
        # le spot éclaire selon -z local ; rotation de -84 degrés autour de y : -z vers +x, 6 degrés vers le bas
        ob.rotation_euler = (0.0, math.radians(-84), 0.0)
        out.append(ob)
    return out


def _assign(objs, mat):
    for o in objs:
        if not o.data.materials:
            o.data.materials.append(mat)
        for i in range(len(o.data.materials)):
            o.data.materials[i] = mat


def _blank_plate():
    # neutre, sans aucun signe ; plus sombre que le blanc : sous un lampadaire, un rectangle blanc sautait aux yeux
    return mat_plain("cast_plate", "#9f9c90", rough=0.5)


# ---------------------------------------------------------------- la rampe de gyrophares

def lightbar(collection=None, strength=0.0, width=None):
    """La rampe de la patrouille (géométrie de police.glb), lentilles corail / violet.

    Renvoie (rampe, lentilles) : deux objets, origine au centre et au bas de la rampe, rampe en travers (y)."""
    parts = import_model(os.path.join(ASSETS, "police.glb"), collection)
    keep = pick(parts, "Lightbar_UCB", "Lightbar_Glass")
    remove([o for o in parts if o not in keep], "")
    base = pick(keep, "Lightbar_UCB")[0]
    lens = pick(keep, "Lightbar_Glass")[0]
    mn, mx = bbox([base, lens])
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    s = (width / (mx.y - mn.y)) if width else 1.0
    transform_all([base, lens], Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    base.name = base.data.name = "lightbar"
    lens.name = lens.data.name = "lightbar_lenses"
    _assign([lens], mat_lenses("lightbar_lenses", strength))
    parent_keep(lens, base)
    return base, lens


def lightbar_lights(bar, energy=600.0):
    """La lueur de la rampe sur le toit, le capot et la chaussée mouillée : de chaque côté (corail +y, violet -y)
    un point juste au-dessus du cache et un point juste devant, hors du boîtier (sinon il le masque)."""
    bpy.context.view_layer.update()
    mn, mx = bbox([bar] + list(bar.children))
    inv = bar.matrix_world.inverted()
    top = (inv @ mx).z
    front = (inv @ mx).x
    # la rampe elle-même ne reçoit pas ces lueurs (à quelques centimètres, elles brûlaient le boîtier en blanc
    # et le corail / violet ne se lisait plus) : liaison de lumière, rampe et lentilles exclues
    shell = bpy.data.collections.new(f"{bar.name}_glow_exclude")
    for o in [bar] + list(bar.children):
        shell.objects.link(o)
    for co in shell.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
    out = []
    for side, col in ((1, CORAL), (-1, LILAC)):
        for tag, loc, e in (("top", (0.0, side * 0.36, top + 0.06), 1.0),
                            ("front", (front + 0.08, side * 0.36, top * 0.5), 0.8)):
            d = bpy.data.lights.new(f"{bar.name}_glow_{tag}_{'L' if side > 0 else 'R'}", "POINT")
            d.energy = energy * e
            d.color = lin(col)[:3]
            d.shadow_soft_size = 0.12
            ob = bpy.data.objects.new(d.name, d)
            bar.users_collection[0].objects.link(ob)
            ob.parent = bar
            ob.location = loc
            ob.light_linking.receiver_collection = shell
            out.append(ob)
    bar_drive_lenses(bar, {"corail": out[0].data, "lilas": out[2].data})
    return out


def bar_drive_lenses(bar, lights):
    """Les optiques de la rampe suivent ses lueurs : sur chaque maillage de la rampe, bar_off_corail et
    bar_off_lilas (lus par les matières, _bar_on) valent 0 quand la lueur de ce côté est à sa pleine énergie et 1
    quand motion.flash_bars l'a baissée (6 %). Pilotes à expression simple (sans Python), lus à chaque image ;
    les copies liées (lieux.clone) gardent ces pilotes et leurs lumières partagées."""
    for o in [bar] + [c for c in bar.children_recursive if c.type == "MESH"]:
        for tone, d in lights.items():
            key = f"bar_off_{tone}"
            o[key] = 0.0
            fc = o.driver_add(f'["{key}"]')
            drv = fc.driver
            drv.type = "SCRIPTED"
            v = drv.variables.new()
            v.name = "e"
            v.type = "SINGLE_PROP"
            v.targets[0].id_type = "LIGHT"
            v.targets[0].id = d
            v.targets[0].data_path = "energy"
            drv.expression = f"max(0.0, min(1.0, 1.25 - 1.25 * e / {max(d.energy, 1e-3):.3f}))"


def tail_lights(body, points, on=True, energy=6.0):
    """Lueur rouge des feux arrière (points derrière la caisse)."""
    out = []
    if not on:
        return out
    for i, p in enumerate(points):
        d = bpy.data.lights.new(f"{body.name}_tail_{i}", "POINT")
        d.energy = energy
        d.color = lin("#ff2a1a")[:3]
        d.shadow_soft_size = 0.06
        ob = bpy.data.objects.new(d.name, d)
        body.users_collection[0].objects.link(ob)
        ob.parent = body
        ob.location = p
        out.append(ob)
    return out


def _raw_tex(sock):
    """La couleur brute de l'image derrière un socket (le glTF la multiplie souvent par un facteur sombre)."""
    n = sock.node
    for _ in range(4):
        if n.type == "TEX_IMAGE":
            return n.outputs[0]
        ins = [i for i in n.inputs if i.is_linked]
        if not ins:
            break
        n = ins[0].links[0].from_node
    return sock


# Les cœurs des modules, plus saturés que la palette : AgX désature une émission forte vers le blanc, un corail
# pur à 8 sortait saumon. Le diffuseur reste à la couleur de la palette.
CORAL_CORE = (1.0, 0.075, 0.018, 1.0)
LILAC_CORE = (0.16, 0.07, 1.0, 1.0)
BAR_CORE = 2.2        # cœur d'un module allumé : × la force de la rampe (BAR_GLOW 2 -> 4,4)
BAR_DIFFUSE = 0.09    # le reste du diffuseur allumé, relatif au cœur
BAR_REST = 0.03       # une moitié éteinte garde un reste de lueur (le diffuseur chauffé)


def _bar_side(nt, sep):
    """1 côté corail (+y objet), 0 côté lilas."""
    return _math(nt, "GREATER_THAN", sep.outputs[1], 0.0)


def _bar_on(nt, side):
    """1 quand la moitié de la rampe de ce côté est allumée. Les objets de la rampe portent bar_off_corail et
    bar_off_lilas (0 allumé, 1 éteint), pilotés par l'énergie de leurs lueurs (lightbar_lights) : le
    clignotement que motion.flash_bars pose sur les lumières passe aux lentilles. Sans ces propriétés (rampe
    sans lueurs), l'attribut vaut 0 : allumée."""
    offs = []
    for key in ("bar_off_corail", "bar_off_lilas"):
        a = nt.nodes.new("ShaderNodeAttribute")
        a.attribute_type = "OBJECT"
        a.attribute_name = key
        offs.append(a.outputs["Fac"])
    off = _math(nt, "ADD", _math(nt, "MULTIPLY", side, offs[0]),
                _math(nt, "MULTIPLY", _math(nt, "SUBTRACT", 1.0, side), offs[1]))
    return _math(nt, "SUBTRACT", 1.0, off)


def _bar_modules(nt, sep, zc, zh, per_m=8.5):
    """Les modules de la rampe, en coordonnées objet : un cœur par cellule le long de la rampe (y), dans la bande
    du milieu de sa hauteur ; renvoie (cœur 0..1, réflecteur 0..1 : l'anneau autour du cœur)."""
    cell = _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", _math(nt, "FRACT", _math(nt, "MULTIPLY", sep.outputs[1], per_m)), 0.5))
    dz = _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", sep.outputs[2], zc))

    def ramp(v, a, b):
        r = nt.nodes.new("ShaderNodeMapRange")
        r.clamp = True
        r.inputs["From Min"].default_value = a
        r.inputs["From Max"].default_value = b
        r.inputs["To Min"].default_value = 1.0
        r.inputs["To Max"].default_value = 0.0
        nt.links.new(v, r.inputs["Value"])
        return r.outputs[0]
    # distance au centre du module, en largeurs de cellule : des coupelles rondes, pas des cadres
    dzc = _math(nt, "MULTIPLY", dz, per_m)
    d = _math(nt, "SQRT", _math(nt, "ADD", _math(nt, "MULTIPLY", cell, cell), _math(nt, "MULTIPLY", dzc, dzc)))
    core = ramp(d, 0.07, 0.17)
    dish = ramp(d, 0.30, 0.44)
    # le cœur ne déborde pas de la hauteur de la rampe
    core = _math(nt, "MULTIPLY", core, ramp(dz, 0.30 * zh, 0.40 * zh))
    return core, _math(nt, "MAXIMUM", _math(nt, "SUBTRACT", dish, core), 0.0)


def mat_bar_retint(src, name, strength=0.0, zc=0.06, zh=0.12):
    """Rampe détaillée : le boîtier garde sa texture (sombre) ; toutes ses optiques (caches clairs et caches
    rouges / bleus de la texture d'origine) deviennent des diffuseurs clairs, fumés, sur des réflecteurs chromés :
    une rangée de modules par moitié, corail (+y) et lilas (-y). Allumée, chaque module a un cœur saturé et le
    diffuseur une lueur douce de sa couleur ; la moitié éteinte du clignotement laisse voir ses réflecteurs.
    zc, zh : hauteur du milieu et hauteur de la rampe (repère de la rampe)."""
    m = src.copy()
    m.name = name
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    orig = p.inputs["Base Color"].links[0].from_socket if p.inputs["Base Color"].links else None
    outn = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    side = _bar_side(nt, sep)
    for key in ("Alpha", "Transmission Weight"):
        for l in list(p.inputs[key].links):
            nt.links.remove(l)
    p.inputs["Alpha"].default_value = 1.0
    p.inputs["Transmission Weight"].default_value = 0.0
    p.inputs["Emission Strength"].default_value = 0.0
    if orig is None:
        p.inputs["Base Color"].default_value = (0.02, 0.02, 0.022, 1.0)
        return m
    hsv = nt.nodes.new("ShaderNodeSeparateColor")
    hsv.mode = "HSV"
    # sur l'image brute : le facteur de couleur du glTF (0,16) éteignait le masque de luminosité
    nt.links.new(_raw_tex(orig), hsv.inputs[0])
    lit = nt.nodes.new("ShaderNodeMapRange")
    lit.inputs["From Min"].default_value = 0.35
    lit.inputs["From Max"].default_value = 0.6
    nt.links.new(hsv.outputs[2], lit.inputs["Value"])
    optic = lit.outputs[0]
    # le boîtier : la texture d'origine, assombrie (plastique noir satiné)
    for l in list(p.inputs["Base Color"].links):
        nt.links.remove(l)
    p.inputs["Base Color"].default_value = (0.012, 0.012, 0.014, 1.0)
    for l in list(p.inputs["Roughness"].links):
        nt.links.remove(l)
    p.inputs["Roughness"].default_value = 0.42
    for l in list(p.inputs["Metallic"].links):
        nt.links.remove(l)
    p.inputs["Metallic"].default_value = 0.0
    core, refl = _bar_modules(nt, sep, zc, zh)
    # l'optique : un diffuseur fumé verni sur des réflecteurs chromés (visibles éteinte), à peine teinté de sa couleur
    tint = nt.nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    nt.links.new(side, tint.inputs["Factor"])
    tint.inputs[6].default_value = (0.05, 0.05, 0.075, 1.0)
    tint.inputs[7].default_value = (0.08, 0.04, 0.035, 1.0)
    base = nt.nodes.new("ShaderNodeMix")
    base.data_type = "RGBA"
    nt.links.new(_math(nt, "MAXIMUM", refl, _math(nt, "MULTIPLY", core, 0.6)), base.inputs["Factor"])
    nt.links.new(tint.outputs[2], base.inputs[6])
    base.inputs[7].default_value = (0.55, 0.55, 0.58, 1.0)
    lens = _principled(nt, **{"Roughness": 0.18, "Coat Weight": 1.0, "Coat Roughness": 0.02, "Coat IOR": 1.55})
    nt.links.new(base.outputs[2], lens.inputs["Base Color"])
    nt.links.new(_math(nt, "MAXIMUM", refl, _math(nt, "MULTIPLY", core, 0.6)), lens.inputs["Metallic"])
    shader = lens.outputs[0]
    if strength > 0:
        on = _bar_on(nt, side)
        col = nt.nodes.new("ShaderNodeMix")
        col.data_type = "RGBA"
        nt.links.new(side, col.inputs["Factor"])
        col.inputs[6].default_value = LILAC_CORE
        col.inputs[7].default_value = CORAL_CORE
        level = _math(nt, "MULTIPLY", _math(nt, "ADD", core, BAR_DIFFUSE),
                      _math(nt, "ADD", BAR_REST, _math(nt, "MULTIPLY", on, 1.0 - BAR_REST)))
        ecol = nt.nodes.new("ShaderNodeMix")
        ecol.data_type = "RGBA"
        ecol.blend_type = "MULTIPLY"
        ecol.inputs["Factor"].default_value = 1.0
        nt.links.new(col.outputs[2], ecol.inputs[6])
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        for i in range(3):
            nt.links.new(level, comb.inputs[i])
        nt.links.new(comb.outputs[0], ecol.inputs[7])
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(ecol.outputs[2], em.inputs["Color"])
        # la force reste un nombre (lieux.bar_boost la multiplie pour les plans lointains)
        em.inputs["Strength"].default_value = strength * BAR_CORE
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(lens.outputs[0], add.inputs[0])
        nt.links.new(em.outputs[0], add.inputs[1])
        shader = add.outputs[0]
    mixs = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(optic, mixs.inputs[0])
    nt.links.new(p.outputs[0], mixs.inputs[1])
    nt.links.new(shader, mixs.inputs[2])
    nt.links.new(mixs.outputs[0], outn.inputs["Surface"])
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "DITHERED"
    return m


def hq_lightbar(collection=None, strength=0.0, width=1.2):
    """La rampe détaillée (16k triangles, boîtier, caches, optiques) prise sur le modèle patrol-jeandiz.

    Renvoie (rampe, lentilles) comme lightbar() : origine au centre et au bas, rampe en travers (y)."""
    parts = import_model(os.path.join(CAST, "patrol-jeandiz/model.glb"), collection)
    keep = pick(parts, "Roof light bar", "roof lights")
    remove([o for o in parts if o not in keep], "")
    transform_all(keep, Matrix.Rotation(math.radians(90), 4, "Z"))
    mn, mx = bbox(keep)
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    s = width / (mx.y - mn.y)
    transform_all(keep, Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    base = pick(keep, "Roof light bar")[0]
    lens = pick(keep, "roof lights")[0]
    base.name = base.data.name = "hq_lightbar"
    lens.name = lens.data.name = "hq_lightbar_lenses"
    zh = (mx.z - mn.z) * s
    for i, m in enumerate(base.data.materials):
        if m is not None:
            base.data.materials[i] = mat_bar_retint(m, "hq_lightbar_shell", strength, zc=0.5 * zh, zh=zh)
    _assign([lens], mat_lenses("hq_lightbar_lenses", strength))
    parent_keep(lens, base)
    return base, lens


# ---------------------------------------------------------------- le fourgon

VANS = {
    # fourgon blindé de l'auteur de l'ancienne patrouille, haut et long (premier choix, 21k)
    "md84": dict(file="van-md84/model.glb", rot=0, remove=("Badges",), body=("Bodymat",), plate=("Numberplate",),
                 glass=("Glass", "Windshield"), bands=((-3.0, 1.9, 1.05, 1.75),), roof=2.47, bar_x=1.05, bar_w=1.3),
    # fourgon tôlé du même auteur, plus court et plus bas
    "shvan": dict(file="van-shvan/model.glb", rot=0, remove=("Badges",), body=("bodymat",), plate=("Numberplate",),
                  glass=("glass", "Glass", "Windshield"), bands=((-2.4, 1.7, 0.62, 1.32),), roof=1.86, bar_x=0.9, bar_w=1.2),
    # fourgon d'intervention à caisse (lettrage SWAT / SECURITY retiré, caisse repeinte)
    "swat": dict(file="van-swat/model.glb", rot=90, remove=("Swat Left",), body=("Main Body.058", "Larger_Body"), plate=(),
                 glass=(), bands=((-3.4, 2.2, 1.25, 2.2),), roof=2.75, bar_x=2.2, bar_w=1.3),
    # fourgon tôlé à capot court 1976-1996, 431k, cartes PBR (relief des tôles, vernis) : le choix
    # caisse repeinte en gardant relief et rugosité ; un filet crème sous les vitres
    "vandura": dict(file="van-vandura/model.glb", rot=90, hq=True, paint=("Body",), lamps=("Lights",), glass=("Windows",),
                    bands=((-3.0, 1.45, 1.04, 1.16),), bar_x=0.55, bar_w=1.3,
                    tyres=("Wheels",), rim_uv=((0.635, 0.825, 0.615, 0.805),)),
}


def _load_van_hq(variant, spec, collection, lights_on, strength):
    tag = f"van_{variant}"
    parts = import_model(os.path.join(CAST, spec["file"]), collection)
    normalise(parts, rot_z=spec["rot"], length=spec.get("length"))
    downscale_images(parts, 2048)
    _replace_mats(parts, spec["paint"], lambda m: livery_over(m, f"{tag}_paint", spec["bands"]))

    def lamp(m):
        # les feux peints dans leur texture : la même texture sert d'émission quand ils sont allumés
        c = m.copy()
        c.name = f"{tag}_lamps"
        p = next(n for n in c.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        if p.inputs["Base Color"].links:
            c.node_tree.links.new(p.inputs["Base Color"].links[0].from_socket, p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value = 6.0 if lights_on else 0.0
        return c
    _replace_mats(parts, spec["lamps"], lamp)
    if spec.get("tyres"):
        # l'atlas des roues est gris clair (flanc presque blanc) : pneus noircis, lettrage du flanc avec ; le moyeu acier gardé
        _replace_mats(parts, spec["tyres"], lambda m: rubber_over(m, f"{tag}_tyres", 0.12, spec.get("rim_uv", ())))
    # vitres d'origine opaques (gris plat) : verre teinté, la caisse n'a pas d'aménagement intérieur
    _replace_mats(parts, spec.get("glass", ()), mat_glass(f"{tag}_tint", tint="#0d0f12"))
    # les roues (une pièce par roue, matière des roues) : à part, pour tourner
    # (la matière des roues vient d'être remplacée par rubber_over : elle s'appelle maintenant <tag>_tyres)
    tyres = tuple(spec.get("tyres", ())) + (f"{tag}_tyres",)
    parts, wheels = split_wheels(parts, lambda o: any(m and m.name.startswith(tyres) for m in o.data.materials), tag)
    body = join(parts, tag)
    attach_wheels(body, wheels)
    # (l'emprise du véhicule entier, roues comprises : la hauteur des phares et la taille rendue n'ont pas bougé)
    mn, mx = vertex_bbox([body] + wheels)
    bar, lens = hq_lightbar(collection, strength, width=spec["bar_w"])
    z = roof_z(body, spec["bar_x"]) or mx.z
    bar.location = (spec["bar_x"], 0, z - 0.015)
    parent_keep(bar, body)
    lights = lightbar_lights(bar) if lights_on else []
    lights += headlight_spots(body, [(mx.x - 0.1, 0.62, mn.z + 0.8), (mx.x - 0.1, -0.62, mn.z + 0.8)], on=lights_on)
    return dict(body=body, lightbar=bar, lenses=lens, lights=lights, length=mx.x - mn.x, height=mx.z - mn.z + 0.17,
                tris=tris([body, bar, lens] + wheels), wheels=wheels)


def load_van(variant="vandura", collection=None, lights_on=False, lens_strength=None):
    """Le fourgon, repeint marine et crème, rampe sur le toit de la cabine.

    variant « vandura » (le choix, détaillé) ; « md84 », « shvan », « swat » : les premiers essais, plus légers.
    Renvoie dict(body, lightbar, lenses, lights, length, height, tris). L'avant vers +x, au sol."""
    spec = VANS[variant]
    if spec.get("hq"):
        strength = lens_strength if lens_strength is not None else (BAR_GLOW if lights_on else 0.0)
        return _load_van_hq(variant, spec, collection, lights_on, strength)
    parts = import_model(os.path.join(CAST, spec["file"]), collection)
    parts = remove(parts, *spec["remove"]) if spec["remove"] else parts
    normalise(parts, rot_z=spec["rot"])
    paint = mat_livery(f"van_{variant}_paint", bands=spec["bands"], roof=spec["roof"])
    if variant == "swat":
        # la caisse et ses panneaux : tous les matériaux texturés de lettrage deviennent la livrée
        for o in parts:
            for i, m in enumerate(o.data.materials):
                if m and m.name.split(".")[0] in ("Main_Body", "Larger_Body_Parts"):
                    o.data.materials[i] = paint
    else:
        _assign(pick(parts, *spec["body"]), paint)
    if spec["plate"]:
        _assign(pick(parts, *spec["plate"]), _blank_plate())
    body = join(parts, f"van_{variant}")
    mn, mx = bbox([body])
    strength = lens_strength if lens_strength is not None else (BAR_GLOW if lights_on else 0.0)
    bar, lens = lightbar(collection, strength, width=spec["bar_w"])
    z = roof_z(body, spec["bar_x"]) or mx.z
    bar.location = (spec["bar_x"], 0, z - 0.01)
    parent_keep(bar, body)
    lights = lightbar_lights(bar) if lights_on else []
    return dict(body=body, lightbar=bar, lenses=lens, lights=lights, length=mx.x - mn.x, height=mx.z - mn.z + 0.17,
                tris=tris([body, bar, lens]))


# ---------------------------------------------------------------- l'hélicoptère

def searchlight(parent, loc, collection=None, on=False, energy=30000.0, angle=9.0):
    """Projecteur écrit en code : chape, phare cylindrique, lentille et spot. Le pivot vise par sa rotation.

    Au repos, le faisceau part vers l'avant et vers le bas (45°). Renvoie dict(pivot, housing, lens, spot)."""
    coll = _collection(collection)
    pivot = bpy.data.objects.new(f"{parent.name}_searchlight_pivot", None)
    pivot.empty_display_type = "ARROWS"
    pivot.empty_display_size = 0.4
    coll.objects.link(pivot)
    pivot.location = loc
    pivot.parent = parent
    pivot.rotation_euler = (0, math.radians(45), 0)   # -z local tourné vers l'avant-bas
    dark = mat_plain("searchlight_body", "#1b1e24", rough=0.35, metal=0.8)
    bm = bmesh.new()
    # le phare : un cylindre d'axe -z local (le faisceau sort par le bas)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.17, radius2=0.2, depth=0.34,
                          matrix=Matrix.Translation((0, 0, -0.05)))
    # la chape (fourche) et son axe
    for s in (-1, 1):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, s * 0.23, 0.08)) @ Matrix.Diagonal((0.05, 0.04, 0.3, 1)))
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, 0.24)) @ Matrix.Diagonal((0.1, 0.5, 0.04, 1)))
    me = bpy.data.meshes.new(f"{parent.name}_searchlight")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(dark)
    housing = bpy.data.objects.new(me.name, me)
    coll.objects.link(housing)
    housing.parent = pivot
    lme = bpy.data.meshes.new(f"{parent.name}_searchlight_lens")
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=24, radius=0.16, matrix=Matrix.Translation((0, 0, -0.225)))
    bm.to_mesh(lme)
    bm.free()
    lme.materials.append(mat_emit("searchlight_lens", LAMP, 60.0 if on else 0.3))
    lens = bpy.data.objects.new(lme.name, lme)
    coll.objects.link(lens)
    lens.parent = pivot
    sd = bpy.data.lights.new(f"{parent.name}_searchlight_spot", "SPOT")
    sd.energy = energy if on else 0.0
    sd.color = lin(LAMP)[:3]
    sd.spot_size = math.radians(angle)
    sd.spot_blend = 0.35
    sd.shadow_soft_size = 0.12
    spot = bpy.data.objects.new(sd.name, sd)
    coll.objects.link(spot)
    spot.parent = pivot
    spot.location = (0, 0, -0.24)
    return dict(pivot=pivot, housing=housing, lens=lens, spot=spot)


HELIS = {
    # hélicoptère léger blanc à carénage de rotor de queue, sans aucun marquage (non texturé), 52k
    "pranav": dict(file="heli-pranav/model.glb", rot=90, scale=1.13,
                   main=("BLADE_1|", "Circle_2|", "Cylinder.003_10|"), tail=("REAR BLADE_22|", "Cylinder.002_9|"),
                   skids=("NurbsPath",), remove=()),
    # même silhouette, livrée d'origine d'un service de secours réel (texte, drapeaux) : tout repeint
    "ec135": dict(file="heli-ec135/model.glb", rot=-90, scale=0.17,
                  main=("|Object_9",), tail=("|Object_7",), skids=(),
                  remove=("Body6", "Bottoms", "Helmet", "Tops", "Shoes", "Eyes", "Eyelashes", "Icosphere", "CockpitButtons", "Object_21")),
    # hélicoptère léger générique, une seule texture (vert et blanc), rotors fondus dans la cellule
    "irs": dict(file="heli-irs/model.glb", rot=180, length=12.6, main=(), tail=(), skids=(), remove=()),
    # même silhouette, modèle détaillé (200k, cartes PBR 1k, cabine meublée) : le choix ; livrée d'origine d'une police réelle
    # entièrement repeinte, seules ses cartes de relief et de rugosité restent
    "solid": dict(file="heli-solid/model.glb", rot=90, scale=1.0, main=("|Object_7",), tail=("|Object_10",),
                  skids=(), remove=()),
}


def _heli_materials(variant, parts, paint, dark, glass):
    if variant == "pranav":
        # le fichier n'a que des matériaux unis aux noms génériques (« Material.004 ») : on trie par objet
        for o in parts:
            if "WINDOW" in o.name:
                _assign([o], glass)
            elif any(k in o.name for k in ("BLADE", "Circle_2|", "Cylinder.", "NurbsPath")):
                _assign([o], dark)
            else:
                _assign([o], paint)
    elif variant == "ec135":
        for o in parts:
            for i, m in enumerate(o.data.materials):
                n = m.name if m else ""
                if n.startswith(("EC135_Body_Outer", "EC135_Body_Back")):
                    o.data.materials[i] = paint
                elif n.startswith("EC135_Glass"):
                    o.data.materials[i] = glass
                elif n.startswith("EC135_Body_Inner"):
                    o.data.materials[i] = dark
    elif variant == "solid":
        for o in parts:
            for i, m in enumerate(o.data.materials):
                n = m.name if m else ""
                if n.startswith("BODY"):
                    paint["src_name"] = n
                    o.data.materials[i] = paint
                elif n.startswith("GLASS"):
                    o.data.materials[i] = glass
    elif variant == "irs":
        src = parts[0].data.materials[0]
        tinted = mat_tinted_texture("heli_irs_paint", src, NAVY, keep=0.45)
        _assign(parts, tinted)


def load_helicopter(variant="solid", collection=None, searchlight_on=False, name=None):
    """L'hélicoptère, repeint marine et crème, sans marquage, avec projecteur sous le nez.

    Renvoie dict(body, rotor_main, rotor_tail, searchlight (le spot), searchlight_pivot, searchlight_lens,
    main_axis, tail_axis, length, tris). Rotor principal : tourne autour de son z local ; rotor de queue :
    autour de son y local (l'axe est en travers). Les deux rotors et le pivot sont enfants de body."""
    spec = HELIS[variant]
    tag = name or f"heli_{variant}"
    parts = import_model(os.path.join(CAST, spec["file"]), collection)
    parts = remove(parts, *spec["remove"]) if spec["remove"] else parts
    normalise(parts, rot_z=spec["rot"], length=spec.get("length"), scale=spec.get("scale"))
    for o in pick(parts, *spec["skids"]) if spec["skids"] else []:
        decimate(o, 0.06)
    paint = mat_livery(f"{tag}_paint", bands=(), roof=None)
    dark = mat_plain(f"{tag}_dark", "#16181d", rough=0.45, metal=0.4)
    glass = mat_glass(f"{tag}_glass")
    _heli_materials(variant, parts, paint, dark, glass)
    if variant == "irs":
        body, main, tail = _split_irs(parts, tag)
    else:
        mains = pick(parts, *spec["main"])
        tails = pick(parts, *spec["tail"])
        rest = [o for o in parts if o not in mains and o not in tails]
        main = join(mains, f"{tag}_rotor_main")
        tail = join(tails, f"{tag}_rotor_tail")
        body = join(rest, tag)
    # livrée : marine, crème au-dessus de la ligne des vitres (le toit et la poutre de queue restent marine)
    mn, mx = bbox([body])
    h = mx.z - mn.z
    band = ((mn.x + 0.25 * (mx.x - mn.x), mx.x, mn.z + 0.30 * h, mn.z + 0.42 * h),)
    src = bpy.data.materials.get(paint.get("src_name", ""))
    livery = livery_over(src, f"{tag}_livery", band, rough=0.3, metal=0.3) if src else mat_livery(f"{tag}_livery", bands=band)
    for i, m in enumerate(body.data.materials):
        if m == paint:
            body.data.materials[i] = livery
    # l'origine de l'hélicoptère : au sol, à l'aplomb de l'axe du rotor principal
    c = vertex_centroid(main)
    transform_all([body, main, tail], Matrix.Translation((-c.x, -c.y, 0.0)))
    # axes des rotors : centre des sommets (pales symétriques), en haut du moyeu
    c = vertex_centroid(main)
    _mn, _mx = bbox([main])
    main_axis = Vector((c.x, c.y, _mn.z))
    set_origin(main, main_axis)
    ct = vertex_centroid(tail)
    tmn, tmx = bbox([tail])
    tail_axis = Vector(((tmn.x + tmx.x) / 2, ct.y, (tmn.z + tmx.z) / 2))
    set_origin(tail, tail_axis)
    parent_keep(main, body)
    parent_keep(tail, body)
    # le projecteur, sous le nez, côté droit
    bmn, bmx = bbox([body])
    x_sl = bmx.x - 0.18 * (bmx.x - bmn.x) if variant != "irs" else bmx.x - 0.12 * (bmx.x - bmn.x)
    floor = roof_under(body, x_sl, -0.35) or (bmn.z + 0.5)
    sl = searchlight(body, (x_sl, -0.35, floor - 0.3), collection, on=searchlight_on)
    mnb, mxb = bbox([body, main, tail])
    return dict(body=body, rotor_main=main, rotor_tail=tail, searchlight=sl["spot"], searchlight_pivot=sl["pivot"],
                searchlight_lens=sl["lens"], main_axis=main_axis, tail_axis=tail_axis, length=mxb.x - mnb.x,
                tris=tris([body, main, tail]))


def aim_searchlight(heli, target):
    """Tourne le pivot du projecteur pour que le faisceau (-z local) vise un point monde."""
    bpy.context.view_layer.update()
    piv = heli["searchlight_pivot"]
    p = piv.matrix_world.translation
    d = (Vector(target) - p).normalized()
    piv.matrix_world = Matrix.Translation(p) @ d.to_track_quat("-Z", "Y").to_matrix().to_4x4()


def spin_rotors(heli, rpm_main=380.0, rpm_tail=2200.0, fps=24.0):
    """Fait tourner les rotors par des pilotes (frame courante) : z local pour le principal, y local pour la queue."""
    for ob, rpm, idx in ((heli["rotor_main"], rpm_main, 2), (heli["rotor_tail"], rpm_tail, 1)):
        ob.rotation_mode = "XYZ"
        fc = ob.driver_add("rotation_euler", idx)
        base = ob.rotation_euler[idx]
        fc.driver.expression = f"{base:.4f} + frame * {rpm / 60.0 * math.tau / fps:.5f}"


def roof_under(ob, x, y):
    """Hauteur du dessous d'un objet en (x, y) : rayon tiré d'en bas."""
    inv = ob.matrix_world.inverted()
    o = inv @ Vector((x, y, -100.0))
    d = (inv.to_3x3() @ Vector((0, 0, 1))).normalized()
    hit, loc, _n, _i = ob.ray_cast(o, d)
    return (ob.matrix_world @ loc).z if hit else None


def _split_irs(parts, tag):
    """Le modèle irs fond ses rotors dans la cellule : on les retrouve par morceaux disjoints."""
    whole = join(parts, tag)
    pieces = split_loose(whole)
    mn, mx = bbox(pieces)
    L = mx.x - mn.x
    main, tail, body = [], [], []
    for p in pieces:
        a, b = bbox([p])
        cz = (a.z + b.z) / 2
        if a.z > mx.z - 0.55 and (b.x - a.x > 1.0 or b.y - a.y > 1.0 or cz > mx.z - 0.35):
            main.append(p)
        elif b.x < mn.x + 0.16 * L and (b.y - a.y) < 0.25 and abs((a.y + b.y) / 2) > 0.1 and (b.z - a.z) > 0.6:
            tail.append(p)
        else:
            body.append(p)
    return join(body, tag), join(main, f"{tag}_rotor_main"), join(tail, f"{tag}_rotor_tail")


# ---------------------------------------------------------------- l'avion de chasse

JETS = {
    # concept d'avion de chasse imaginaire, gris, sans aucun marquage : le choix
    "concept": dict(file="jet-concept/model.glb", length=16.5, repaint=False, remove=()),
    # concept imaginaire noir de sixième génération
    "h900": dict(file="jet-h900/model.glb", length=17.5, repaint=False, remove=()),
}


def _nose_to_x(objs):
    """Tourne l'ensemble pour mettre le nez vers +x : l'axe long est l'axe le plus long de l'emprise,
    et l'arrière est le bout où sont les dérives (le plus haut)."""
    mn, mx = bbox(objs)
    axis = 0 if (mx.x - mn.x) >= (mx.y - mn.y) else 1
    lo, hi = mn[axis], mx[axis]
    top_lo = top_hi = -1e9
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            t = (p[axis] - lo) / (hi - lo)
            if t < 0.2:
                top_lo = max(top_lo, p.z)
            elif t > 0.8:
                top_hi = max(top_hi, p.z)
    nose_plus = top_lo > top_hi       # dérives côté bas de l'axe : le nez est côté haut
    if axis == 0:
        return 0 if nose_plus else 180
    return -90 if nose_plus else 90


def load_jet(variant="concept", collection=None, nav_lights=True, name=None):
    """L'avion de chasse, sans emport ni marquage, à 16-17 m. Renvoie dict(body, nav_lights, length, span, tris)."""
    spec = JETS[variant]
    tag = name or f"jet_{variant}"
    parts = import_model(os.path.join(CAST, spec["file"]), collection)
    parts = remove(parts, *spec["remove"]) if spec["remove"] else parts
    rot = _nose_to_x(parts)
    normalise(parts, rot_z=rot, length=spec["length"])
    if spec["repaint"]:
        paint = mat_plain(f"{tag}_paint", JET_GREY, rough=0.5, metal=0.35)
        for o in parts:
            for i, m in enumerate(o.data.materials):
                if m and m.name.startswith(("mat_0-", "mat_16-")):
                    o.data.materials[i] = paint
    body = join(parts, tag)
    mn, mx = bbox([body])
    lights = []
    if nav_lights:
        # feux de navigation : rouge en bout d'aile gauche (+y), vert à droite, une ampoule blanche dessus
        lo = hi = None
        mw = body.matrix_world
        for v in body.data.vertices:
            p = mw @ v.co
            if lo is None or p.y < lo.y:
                lo = p.copy()
            if hi is None or p.y > hi.y:
                hi = p.copy()
        for p, col, nm in ((hi, "#ff2a1f", "L"), (lo, "#29ff6a", "R")):
            me = bpy.data.meshes.new(f"{tag}_nav_{nm}")
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.06)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(mat_emit(f"{tag}_nav_{nm}", col, 40.0))
            ob = bpy.data.objects.new(me.name, me)
            _collection(collection).objects.link(ob)
            ob.location = p
            ob.parent = body
            lights.append(ob)
    return dict(body=body, nav_lights=lights, length=mx.x - mn.x, span=mx.y - mn.y, tris=tris([body]))


# ---------------------------------------------------------------- le barrage

PROPS = {
    # chevalet de police rayé orange et blanc (en cm dans le fichier) : la barrière légère retenue
    "barrier": dict(file="barrier-sawhorse/model.glb", scale=0.01),
    # séparateur béton profil « New Jersey », scan Poly Haven (CC0), allégé de 61 k à 24 k triangles : retenu
    "barrier_concrete": dict(file="barrier-ph01/concrete_road_barrier.gltf", decimate=0.4),
    # bloc béton droit, scan Poly Haven (CC0)
    "barrier_concrete_02": dict(file="barrier-ph02/concrete_road_barrier_02.gltf"),
    # barrière de foule en acier
    "barrier_fence": dict(file="barrier-fence/model.glb"),
    # plots de 71 cm à bande réfléchissante : retenu
    "cone": dict(file="cone-jamie/model.glb", height=0.71),
    "cone_worn": dict(file="cone-worn/model.glb", height=0.71),
    # herse accordéon déployée, ramenée à 4,5 m : retenue
    "spike_strip": dict(file="test-spike-strip/model.glb", length=4.5),
    # mât d'éclairage sur remorque, quatre projecteurs, agrandi à 2,8 m replié : retenu
    "light_tower": dict(file="light-tower/model.glb", height=2.8),
    "light_tower_chen": dict(file="light-tower-chen/model.glb", height=2.6),
    "floodlight": dict(file="floodlight/model.glb", height=1.6),
}

# la barrière en bois (96 triangles) faisait jouet : barrières de foule métalliques et blocs béton à la place
KEEP_PROPS = ("barrier_fence", "barrier_concrete", "barrier_concrete_02", "cone_worn", "spike_strip", "light_tower")


def load_prop(key, collection=None, name=None):
    spec = PROPS[key]
    parts = import_model(os.path.join(CAST, spec["file"]), collection)
    downscale_images(parts, 2048)
    s = spec.get("scale")
    mn, mx = bbox(parts)
    if spec.get("height"):
        s = spec["height"] / (mx.z - mn.z)
    # l'axe long à plat suit x
    rot = spec.get("rot", 90 if (mx.y - mn.y) > (mx.x - mn.x) else 0)
    normalise(parts, rot_z=rot, length=spec.get("length"), scale=s)
    ob = join(parts, name or f"prop_{key}")
    if spec.get("decimate"):
        decimate(ob, spec["decimate"])
    return ob


def load_props(keys=KEEP_PROPS, collection=None, lights_on=False):
    """Les accessoires du barrage, chacun à l'origine, au sol, à taille réelle (à instancier).

    Renvoie un dict {clé: objet} ; avec light_tower, aussi 'light_tower_lights' (liste de spots)."""
    out = {}
    for k in keys:
        out[k] = load_prop(k, collection)
    if "light_tower" in out:
        out["light_tower_lights"] = light_tower_lights(out["light_tower"], on=lights_on)
    return out


def light_tower_lights(tower, on=False, energy=4000.0):
    """Quatre spots sous les projecteurs du mât (en haut de l'emprise), vers l'avant (+x) et le bas."""
    mn, mx = bbox([tower])
    out = []
    for i, dy in enumerate((-0.35, 0.35)):
        d = bpy.data.lights.new(f"{tower.name}_spot{i}", "SPOT")
        d.energy = energy if on else 0.0
        d.color = lin(LAMP)[:3]
        d.spot_size = math.radians(70)
        d.spot_blend = 0.5
        d.shadow_soft_size = 0.25
        ob = bpy.data.objects.new(d.name, d)
        tower.users_collection[0].objects.link(ob)
        ob.parent = tower
        ob.location = ((mn.x + mx.x) / 2 + 0.3, dy, mx.z - 0.35)
        ob.rotation_euler = (0, math.radians(120), 0)
        out.append(ob)
    return out


# ---------------------------------------------------------------- la patrouille (référence d'échelle)

# Livrées sobres (sans lettrage) : « doors » caisse marine, portières avant et arrière crème sous la ligne
# des vitres ; « stripe » caisse marine, un seul filet crème à hauteur de poignées.
def _patrol_boxes(livery, front_axle, door_z=(0.30, 0.96), stripe_z=(0.70, 0.78)):
    if livery == "stripe":
        return ((-4.0, 4.0) + stripe_z,)
    return ((front_axle - 2.68, front_axle - 0.52) + door_z,)


# l'atlas de la patrouille jeandiz : ses phares (verre clair, en haut à gauche) et ses feux arrière (dessous)
PATROL_HEAD_UV = (0.012, 0.335, 0.905, 0.998)
PATROL_TAIL_UV = (0.008, 0.18, 0.785, 0.905)
PATROL_HEAD_GLASS = 5.0     # le verre des phares allumés (émission de l'atlas)
PATROL_HEAD_CORE = 5.0      # leur cœur, en multiple du verre : deux sources vives, pas un aplat blanc


def _patrol_trim(parts, tag):
    """L'habitacle : les cadrans et l'écran de l'atlas intérieur s'éclairaient à pleine force (chiffres lisibles par
    le pare-brise ouvert) : une veilleuse."""
    for _o, _i, m in mats_named(parts, "interior"):
        p = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.node_tree else None
        if p is not None:
            p.inputs["Emission Strength"].default_value = min(p.inputs["Emission Strength"].default_value, 0.25)


def rear_plate(body, tail_pts, tag, size=(0.31, 0.155)):
    """Une plaque arrière vierge (aucun caractère), sur le coffre entre les feux, à leur hauteur : trouvée par un
    rayon tiré de l'arrière dans l'axe."""
    tx, _ty, tz = tail_pts[0]
    bpy.context.view_layer.update()
    inv = body.matrix_world.inverted()
    hit, loc, nrm, _i = body.ray_cast(inv @ Vector((tx - 2.0, 0.0, tz)), Vector((1, 0, 0)))
    if not hit:
        return None
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((0.008, size[0], size[1], 1)))
    me = bpy.data.meshes.new(f"{tag}_plate")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(_blank_plate())
    ob = bpy.data.objects.new(me.name, me)
    body.users_collection[0].objects.link(ob)
    ob.parent = body
    n = Vector(nrm).normalized()
    if n.x > 0:                       # la normale vers l'arrière, d'où vient le rayon
        n = -n
    n.y = 0.0                         # d'aplomb en travers, quelle que soit la courbure du coffre
    n.normalize()
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = n.to_track_quat("X", "Z")
    ob.location = Vector(loc) + n * 0.012
    return ob


PATROLS = {
    # berline de patrouille 1992-2011, 304k, maillage fin sans texture de caisse (peinture unie), feux modélisés,
    # vitres teintées ; ses logos (calandre, coffre, cache-moyeux) sont supprimés
    "crownvic": dict(file="patrol-crownvic/model.glb", rot=90, length=5.39,
                     remove=("logo", "cv_badge"), paint=("paint",), glass=("wind",),
                     head=("headlight_left_bulbs", "headlight_right_reflector"), tail=("taillight_glass",),
                     amber=("markerlight_left_bulbs",), ),
    # la même berline en version d'intervention (pare-buffle, rampe, intérieur), 256k, livrée d'origine noir et blanc
    # avec lettrage peinte dans un atlas : la caisse est repeinte, l'atlas ne reste que sur la zone des feux
    "jeandiz": dict(file="patrol-jeandiz/model.glb", rot=90, length=5.39,
                    remove=("Roof light bar", "roof lights", "Icosphere"), paint=("body",), glass=(),
                    keep_uv=((0.0, 0.34, 0.78, 1.0),), head=(), tail=(), amber=()),
}


def load_patrol(variant="jeandiz", collection=None, lights_on=False, livery="doors", name=None):
    """La patrouille : berline détaillée repeinte marine et crème sans lettrage, rampe corail / violet.

    variant « jeandiz » (le choix de Jacques : pare-buffle, cloison, plus de détail) ou « crownvic » ; « classic » = l'ancienne police.glb (référence avant / après).
    livery « doors » (portières crème) ou « stripe » (un filet). lights_on : rampe, phares (deux spots), feux arrière.
    Renvoie dict(body, lightbar, lenses, lights, length, height, tris) ; l'avant vers +x, au sol, origine au centre."""
    if variant == "classic":
        body = _load_patrol_classic(collection, lights_on)
        mn, mx = bbox([body])
        return dict(body=body, lightbar=None, lenses=None, lights=[], length=mx.x - mn.x, height=mx.z - mn.z,
                    tris=tris([body]))
    spec = PATROLS[variant]
    tag = name or f"patrol_{variant}"
    parts = import_model(os.path.join(CAST, spec["file"]), collection)
    parts = remove(parts, *spec["remove"])
    normalise(parts, rot_z=spec["rot"], length=spec["length"])
    downscale_images(parts, 2048)
    # l'essieu avant : centre des roues côté +x
    wheels = [o for o in parts if "Wheel" in o.name or "Tire" in o.name or "rim" in o.name]
    wmn, wmx = bbox(wheels) if wheels else bbox(parts)
    front_axle = wmx.x - 0.36
    on = 1.0 if lights_on else 0.0
    # les feux peints dans l'atlas (jeandiz) : où tombent ses phares et ses feux arrière, mesuré sur les UV
    atlas = {}
    if spec.get("keep_uv"):
        src = [o for o, _i, _m in mats_named(parts, *spec["paint"])]
        for key, box in (("head", PATROL_HEAD_UV), ("tail", PATROL_TAIL_UV)):
            pts = [q for o in src for q in atlas_points(o, box)]
            if pts:
                atlas[key] = pts
    zones = None
    hp = [q for q in atlas.get("head", []) if q.x > 0]
    if hp:
        zones = dict(v_split=PATROL_HEAD_UV[2], core_r=0.055, core_gain=PATROL_HEAD_CORE,
                     core=(sum(abs(q.y) for q in hp) / len(hp), sum(q.z for q in hp) / len(hp), front_axle + 0.3))
    _replace_mats(parts, spec["paint"], lambda m: livery_over(
        m, f"{tag}_paint", _patrol_boxes(livery, front_axle), keep_uv=spec.get("keep_uv", ()),
        base=PATROL_BODY, rough=0.36, metal=0.45, flake=True, coat=0.8, coat_rough=0.09,
        lamp_strength=PATROL_HEAD_GLASS * on, lamp_zones=zones,
        # les flancs, des portières avant aux portières arrière, sous les vitres : loin des feux (aux deux bouts)
        keep_out=((front_axle - 2.9, front_axle - 0.3, 0.0, 1.05),)))
    if spec["glass"]:
        _replace_mats(parts, spec["glass"], mat_glass(f"{tag}_tint", tint="#0d0f12"))
    _patrol_trim(parts, tag)
    heads = pick(parts, *spec["head"]) if spec["head"] else []
    _assign(heads, mat_lamp(f"{tag}_head", LAMP, 25.0 * on))
    _assign(pick(parts, *spec["tail"]) if spec["tail"] else [], mat_lamp(f"{tag}_tail", "#ff2a1a", 3.0 * on, glass=True))
    _assign(pick(parts, *spec["amber"]) if spec["amber"] else [], mat_lamp(f"{tag}_amber", "#ffa21a", 2.0 * on))
    hmn, hmx = bbox(heads) if heads else (None, None)
    # les roues (une pièce « Wheel.* » par roue ; étriers « WheelBrake » laissés à la caisse) : à part, pour tourner
    parts, wheels = split_wheels(parts, lambda o: "Wheel." in o.name and "Brake" not in o.name, tag)
    body = join(parts, tag)
    attach_wheels(body, wheels)
    # (l'emprise du véhicule entier, roues comprises : la hauteur des feux et la taille rendue n'ont pas bougé)
    mn, mx = vertex_bbox([body] + wheels)
    strength = BAR_GLOW if lights_on else 0.0
    # la rampe détaillée (celle du modèle jeandiz, remise à neuf pour les deux variantes), au-dessus des montants B
    bar, lens = hq_lightbar(collection, strength, width=1.2)
    bar_x = spec.get("bar_x", -0.12)
    z = roof_z(body, bar_x) or mx.z
    bar.location = (bar_x, 0, z - 0.015)
    parent_keep(bar, body)
    lights = lightbar_lights(bar) if lights_on else []
    tail_pts = [(mn.x - 0.06, 0.6, mn.z + 0.86), (mn.x - 0.06, -0.6, mn.z + 0.86)]
    if heads:
        hz = (hmn.z + hmx.z) / 2
        hx = hmx.x + 0.05
        hy = 0.5 * max(abs(hmn.y), abs(hmx.y))
    elif zones:
        # phares peints dans l'atlas : le spot part de leur centre, juste devant le verre
        hy, hz, _x0 = zones["core"]
        hx = max(q.x for q in hp) + 0.04
        tp = [q for q in atlas.get("tail", []) if q.x < 0]
        if tp:
            ty = sum(abs(q.y) for q in tp) / len(tp)
            tz = sum(q.z for q in tp) / len(tp)
            tx = min(q.x for q in tp) - 0.06
            tail_pts = [(tx, ty, tz), (tx, -ty, tz)]
    else:
        # à 1 m devant l'essieu, 0,72 m du sol (devant le pare-buffle il n'y a rien)
        hz, hx, hy = mn.z + 0.72, front_axle + 1.0, 0.6
    heads_l = headlight_spots(body, [(hx, hy, hz), (hx, -hy, hz)], on=lights_on, energy=450.0, angle=40.0, blend=0.45)
    tails_l = tail_lights(body, tail_pts, on=lights_on, energy=30.0)
    lights += heads_l + tails_l
    if zones and lights_on:
        # le verre et le cœur des phares suivent leurs spots (une scène qui les éteint ou les met en veilleuse)
        for m in {m for m in body.data.materials if m and m.name.startswith(f"{tag}_paint")}:
            lamp_drivers(m, heads_l[0].data, tails_l[0].data)
    rear_plate(body, tail_pts, tag)
    return dict(body=body, lightbar=bar, lenses=lens, lights=lights, length=mx.x - mn.x, height=mx.z - mn.z + 0.1,
                tris=tris([body, bar, lens] + wheels), wheels=wheels)


def _load_patrol_classic(collection=None, lights_on=False):
    """La patrouille de police.glb, unie marine et crème, à l'échelle du fichier (5,1 m), avant vers +x."""
    parts = import_model(os.path.join(ASSETS, "police.glb"), collection)
    parts = remove(parts, "Badges")
    paint = mat_livery("patrol_paint", bands=((-1.05, 0.95, 0.42, 0.9),), roof=1.27)
    normalise(parts)
    _assign(pick(parts, "Bodymat"), paint)
    _assign(pick(parts, "Numberplate"), _blank_plate())
    _assign(pick(parts, "Lightbar_Glass"), mat_lenses("patrol_lenses", BAR_GLOW if lights_on else 0.0))
    body = join(parts, "patrol_ref")
    if lights_on:
        # deux points corail / violet au-dessus de la rampe (x -0,26, z 1,5 dans le repère du fichier)
        for side, col in ((1, CORAL), (-1, LILAC)):
            d = bpy.data.lights.new(f"patrol_glow_{side}", "POINT")
            d.energy = 60.0
            d.color = lin(col)[:3]
            d.shadow_soft_size = 0.08
            ob = bpy.data.objects.new(d.name, d)
            body.users_collection[0].objects.link(ob)
            ob.parent = body
            ob.location = (-0.26, side * 0.3, 1.62)
    return body


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    import cast_vehicles_render
    cast_vehicles_render.main(sys.modules[__name__])
