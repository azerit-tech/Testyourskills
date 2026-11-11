# Image A du film, l'ouverture calme : construit la scène et l'enregistre.
#
#   nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/scene_a.py
#
# Lit les assets de Azerit/design/film/assets (python3 tools/film3d/fetch.py),
# écrit Azerit/design/film/assets/scene-a.blend. Le rendu : render.py.
#
# Repère : z en haut, l'avenue file vers +y, la caméra à y = 0 regarde +y.
# La circulation est à droite : le coupé vient vers nous sur la voie x < 0.
import math
import os
import random
import re
import subprocess
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def main_checkout():
    try:
        common = subprocess.run(["git", "-C", ROOT, "rev-parse", "--git-common-dir"], capture_output=True, text=True, check=True).stdout.strip()
        return os.path.dirname(os.path.abspath(os.path.join(ROOT, common)))
    except Exception:
        return ROOT


ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(os.path.dirname(main_checkout()), "design", "film", "assets")
random.seed(27)

# Palette (sRGB) du §3.1 de docs/cinematique-poursuite.md
PLUM = "#4b2f54"
CREAM = "#fff9cb"
INDIGO = "#4b4fb8"
NAVY = "#243152"
CORAL = "#ff6a3d"
AMBER = "#ffc36b"
LILAC = "#8d8cf0"

# Le cadre
LANE_X = -1.75         # la voie intérieure, celle du coupé
CAM_X = -2.6           # un peu à gauche : la patrouille sort à gauche du coupé
CAM_Z = 0.9            # hauteur de capot
COUPE_Y = 15.0         # centre du coupé (l'avant à ~12,9 m de l'objectif)
COUPE_YAW = 4.0        # degrés
POLICE_X = -5.6        # la voie extérieure, loin derrière
POLICE_Y = 95.0
SPEED = 50 / 3.6       # m/s, pour le flou de bougé
WHEEL_R = 0.38         # rayon des roues du coupé (m)
ROAD_HALF = 7.0
WALK = 4.5


def lin(hexcolor, a=1.0):
    h = hexcolor.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


# ---------------------------------------------------------------- nœuds

class Nodes:
    """Petit assistant pour écrire un arbre de nœuds lisiblement."""

    def __init__(self, tree):
        self.t = tree
        self.n = tree.nodes
        self.x = 0

    def new(self, kind, **inputs):
        node = self.n.new(kind)
        node.location = (self.x, 0)
        self.x += 40
        for k, v in inputs.items():
            if k.startswith("_"):
                setattr(node, k[1:], v)
            else:
                self.set(node.inputs[k], v)
        return node

    def set(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.t.links.new(v, sock)
        else:
            sock.default_value = v

    def link(self, a, b):
        self.t.links.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        m = self.new("ShaderNodeMath", _operation=op, _use_clamp=clamp)
        self.set(m.inputs[0], a)
        if b is not None:
            self.set(m.inputs[1], b)
        return m.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        m = self.new("ShaderNodeMix", _data_type="RGBA", _blend_type=blend)
        self.set(m.inputs["Factor"], fac)
        self.set(m.inputs[6], a)
        self.set(m.inputs[7], b)
        return m.outputs[2]

    def mixf(self, fac, a, b):
        m = self.new("ShaderNodeMix", _data_type="FLOAT")
        self.set(m.inputs["Factor"], fac)
        self.set(m.inputs[2], a)
        self.set(m.inputs[3], b)
        return m.outputs[0]

    def ramp(self, fac, stops):
        r = self.new("ShaderNodeValToRGB")
        self.set(r.inputs[0], fac)
        el = r.color_ramp.elements
        while len(el) < len(stops):
            el.new(0.5)
        for e, (pos, col) in zip(el, stops):
            e.position = pos
            e.color = col if len(col) == 4 else (*col, 1)
        return r.outputs[0]

    def sep(self, vec):
        s = self.new("ShaderNodeSeparateXYZ")
        self.set(s.inputs[0], vec)
        return s.outputs


def material(name):
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N = Nodes(nt)
    out = N.new("ShaderNodeOutputMaterial")
    return m, N, out


def principled(N, **kw):
    return N.new("ShaderNodeBsdfPrincipled", **kw)


def image(N, path, vec=None, color=True):
    img = bpy.data.images.load(path, check_existing=True)
    if not color:
        img.colorspace_settings.name = "Non-Color"
    t = N.new("ShaderNodeTexImage")
    t.image = img
    if vec is not None:
        N.set(t.inputs["Vector"], vec)
    return t


def droplets(N, coord, scale, size=0.42, strength=0.5):
    """Gouttes de pluie : des bosses rondes de Voronoi, en hauteur pour un Bump."""
    v = N.new("ShaderNodeTexVoronoi", Scale=scale, Randomness=1.0)
    N.set(v.inputs["Vector"], coord)
    r = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="3D")
    N.set(r.inputs["Vector"], v.outputs["Position"])
    rad = N.math("MULTIPLY", N.math("ADD", N.math("MULTIPLY", r.outputs["Value"], size), size * 0.25), 1.0)
    d = N.math("DIVIDE", v.outputs["Distance"], rad)
    h = N.math("SUBTRACT", 1.0, N.math("POWER", N.math("MINIMUM", d, 1.0), 2.0))
    keep = N.math("GREATER_THAN", r.outputs["Value"], 0.35)
    h = N.math("MULTIPLY", N.math("SQRT", N.math("MAXIMUM", h, 0.0)), keep)
    b = N.new("ShaderNodeBump", Strength=strength, Distance=0.002)
    N.set(b.inputs["Height"], h)
    return b.outputs["Normal"], h


# ---------------------------------------------------------------- import

def import_glb(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, name))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return meshes


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    return ob


def recentre(ob, base=True):
    """Origine au centre de l'emprise, au sol."""
    pts = [Vector(c) for c in ob.bound_box]
    mn = Vector(map(min, *pts))
    mx = Vector(map(max, *pts))
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z if base else (mn.z + mx.z) / 2))
    ob.data.transform(__import__("mathutils").Matrix.Translation(-c))
    ob.location = (0, 0, 0)
    return mx - mn


def find_image(mat, socket="Base Color"):
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            src = n.inputs[socket].links
            while src:
                node = src[0].from_node
                if node.type == "TEX_IMAGE":
                    return node.image
                ins = [i for i in node.inputs if i.links]
                src = ins[0].links if ins else None
    return None


# ---------------------------------------------------------------- matériaux

def mat_paint():
    """Prune métallisé : la couleur est dans le métal (reflets teintés prune), un vernis léger
    à faible indice garde des reflets nets sans laver la teinte ; gouttes de pluie sur le vernis."""
    m, N, out = material("coupe_paint")
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    flake = N.new("ShaderNodeTexVoronoi", Scale=2500.0)
    N.set(flake.inputs["Vector"], co)
    fb = N.new("ShaderNodeBump", Strength=0.12, Distance=0.0005)
    N.set(fb.inputs["Height"], flake.outputs["Distance"])
    drop_big, _ = droplets(N, co, 60.0, size=0.40, strength=0.7)
    drop_small, _ = droplets(N, co, 170.0, size=0.36, strength=0.5)
    nmix = N.new("ShaderNodeMix", _data_type="VECTOR")
    N.set(nmix.inputs["Factor"], 0.5)
    N.link(drop_big, nmix.inputs[4])
    N.link(drop_small, nmix.inputs[5])
    p = principled(N, **{"Base Color": lin(PLUM), "Metallic": 0.85, "Roughness": 0.32,
                         "Coat Weight": 0.45, "Coat Roughness": 0.02, "Coat IOR": 1.35})
    N.link(fb.outputs["Normal"], p.inputs["Normal"])
    N.link(nmix.outputs[1], p.inputs["Coat Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m, N, p


def mat_windscreen():
    """Pare-brise : verre légèrement teinté, on devine l'habitacle, gouttes et reflets."""
    m, N, out = material("windscreen")
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    dn, _ = droplets(N, co, 90.0, size=0.42, strength=0.8)
    p = principled(N, **{"Base Color": (0.55, 0.5, 0.6, 1), "Roughness": 0.01, "Transmission Weight": 1.0, "IOR": 1.52})
    N.link(dn, p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def paint_with_detail(src_img):
    """La peinture prune, multipliée par la texture d'origine (grilles, joints)."""
    m, N, p = mat_paint()
    if src_img is not None:
        uv = N.new("ShaderNodeUVMap")
        t = N.new("ShaderNodeTexImage")
        t.image = src_img
        N.link(uv.outputs[0], t.inputs[0])
        bw = N.new("ShaderNodeRGBToBW")
        N.link(t.outputs["Color"], bw.inputs[0])
        g = N.math("MULTIPLY", N.math("POWER", bw.outputs[0], 1.4), 0.75)
        col = N.mix(1.0, lin(PLUM), N.new("ShaderNodeCombineColor", Red=1, Green=1, Blue=1).outputs[0], "MULTIPLY")
        mul = N.new("ShaderNodeMix", _data_type="RGBA", _blend_type="MULTIPLY")
        N.set(mul.inputs["Factor"], 1.0)
        N.set(mul.inputs[6], lin(PLUM))
        N.link(g, mul.inputs[7])
        N.link(mul.outputs[2], p.inputs["Base Color"])
        del col
    return m


def mat_tinted_glass(name="tinted_glass"):
    m, N, out = material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    dn, _ = droplets(N, co, 120.0, strength=0.5)
    p = principled(N, **{"Base Color": (0.004, 0.003, 0.006, 1), "Roughness": 0.03, "Specular IOR Level": 0.6})
    N.link(dn, p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_clear_glass(name="lamp_glass"):
    m, N, out = material(name)
    p = principled(N, **{"Base Color": (1, 1, 1, 1), "Roughness": 0.04, "Transmission Weight": 1.0, "IOR": 1.45})
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_emit(name, color, strength):
    m, N, out = material(name)
    e = N.new("ShaderNodeEmission", Color=color, Strength=strength)
    N.link(e.outputs[0], out.inputs[0])
    return m


def mat_plain(name, color, rough=0.5, metal=0.0):
    m, N, out = material(name)
    p = principled(N, **{"Base Color": color, "Roughness": rough, "Metallic": metal})
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_police_body():
    """Deux tons marine et crème, sans lettrage : portières et toit crème."""
    m, N, out = material("police_paint")
    co = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    x, z = co[0], co[2]
    doors = N.math("MULTIPLY", N.math("MULTIPLY", N.math("GREATER_THAN", x, -1.05), N.math("LESS_THAN", x, 0.95)),
                   N.math("MULTIPLY", N.math("GREATER_THAN", z, 0.42), N.math("LESS_THAN", z, 0.9)))
    roof = N.math("GREATER_THAN", z, 1.27)
    cream = N.math("MAXIMUM", doors, roof)
    col = N.mix(cream, lin("#1d2747"), lin("#e9e2bf"))
    p = principled(N, **{"Metallic": 0.2, "Roughness": 0.3, "Coat Weight": 1.0, "Coat Roughness": 0.03})
    N.link(col, p.inputs["Base Color"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_lightbar():
    """Feux éteints : lentilles corail d'un côté, violettes de l'autre."""
    m, N, out = material("lightbar_lenses")
    y = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])[1]
    col = N.mix(N.math("GREATER_THAN", y, 0.0), lin(CORAL), lin(LILAC))
    p = principled(N, **{"Roughness": 0.08, "Transmission Weight": 0.6, "IOR": 1.5})
    N.link(col, p.inputs["Base Color"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_road():
    m, N, out = material("wet_asphalt")
    tc = N.new("ShaderNodeTexCoord").outputs["Object"]
    uv = N.new("ShaderNodeMapping", Scale=(1 / 2.2, 1 / 2.2, 1.0))
    N.link(tc, uv.inputs[0])
    folder = os.path.join(ASSETS, "asphalt_02")
    diff = image(N, os.path.join(folder, "diff_2k.jpg"), uv.outputs[0])
    rough = image(N, os.path.join(folder, "rough_2k.jpg"), uv.outputs[0], color=False)
    nor = image(N, os.path.join(folder, "nor_gl_2k.jpg"), uv.outputs[0], color=False)
    nmap = N.new("ShaderNodeNormalMap", Strength=0.8)
    N.link(nor.outputs["Color"], nmap.inputs["Color"])
    xyz = N.sep(tc)
    x, y = xyz[0], xyz[1]
    # flaques : un bruit large, étiré dans l'axe de la route, plus des ornières
    pn = N.new("ShaderNodeTexNoise", Scale=0.16, Detail=6.0, Roughness=0.62)
    pm = N.new("ShaderNodeMapping", Scale=(1.0, 0.35, 1.0))
    N.link(tc, pm.inputs[0])
    N.link(pm.outputs[0], pn.inputs["Vector"])
    rut = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, N.math("MINIMUM", N.math("ABSOLUTE", N.math("SUBTRACT", N.math("ABSOLUTE", N.math("SUBTRACT", N.math("FLOORED_MODULO", N.math("ADD", x, 7.0), 3.5), 1.75)), 0.85)), 0.35), True), 0.18)
    wet = N.math("ADD", pn.outputs["Factor"], rut)
    puddle = N.ramp(wet, [(0.55, (0, 0, 0)), (0.60, (1, 1, 1))])
    damp = N.ramp(wet, [(0.36, (0, 0, 0)), (0.50, (1, 1, 1))])
    # marquages : axe double continu, voies en tirets, rives continues (peinture usée)
    ax = N.math("ABSOLUTE", x)
    centre = N.math("LESS_THAN", N.math("ABSOLUTE", N.math("SUBTRACT", ax, 0.16)), 0.06)
    dash_on = N.math("LESS_THAN", N.math("FLOORED_MODULO", y, 12.0), 4.0)
    lanes = N.math("MULTIPLY", N.math("LESS_THAN", N.math("ABSOLUTE", N.math("SUBTRACT", ax, 3.5)), 0.07), dash_on)
    edge = N.math("LESS_THAN", N.math("ABSOLUTE", N.math("SUBTRACT", ax, 6.75)), 0.08)
    paint = N.math("MAXIMUM", N.math("MAXIMUM", centre, lanes), edge)
    wear = N.new("ShaderNodeTexNoise", Scale=9.0, Detail=8.0)
    N.link(tc, wear.inputs["Vector"])
    paint = N.math("MULTIPLY", paint, N.math("GREATER_THAN", wear.outputs["Factor"], 0.36))
    # couleur : asphalte assombri par l'eau, plus sombre et plus lisse dans les flaques
    dark = N.mix(1.0, diff.outputs["Color"], (0.42, 0.42, 0.44, 1), "MULTIPLY")
    darker = N.mix(1.0, diff.outputs["Color"], (0.2, 0.2, 0.22, 1), "MULTIPLY")
    col = N.mix(N.math("MAXIMUM", damp, puddle), dark, darker)
    col = N.mix(paint, col, (0.55, 0.53, 0.47, 1))
    r_dry = N.math("MULTIPLY", rough.outputs["Color"], 0.75)
    r = N.mixf(damp, r_dry, N.math("MULTIPLY", rough.outputs["Color"], 0.32))
    r = N.mixf(puddle, r, 0.07)
    r = N.mixf(N.math("MULTIPLY", paint, N.math("SUBTRACT", 1.0, puddle)), r, 0.4)
    # la normale s'aplatit sous l'eau
    nflat = N.new("ShaderNodeMix", _data_type="VECTOR")
    N.link(puddle, nflat.inputs["Factor"])
    N.link(nmap.outputs[0], nflat.inputs[4])
    geo = N.new("ShaderNodeNewGeometry")
    N.link(geo.outputs["Normal"], nflat.inputs[5])
    # rides très fines sur l'eau
    rip = N.new("ShaderNodeTexNoise", Scale=60.0, Detail=2.0)
    N.link(tc, rip.inputs["Vector"])
    rb = N.new("ShaderNodeBump", Strength=0.04, Distance=0.01)
    N.link(rip.outputs["Factor"], rb.inputs["Height"])
    N.link(nflat.outputs[1], rb.inputs["Normal"])
    p = principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(r, p.inputs["Roughness"])
    N.link(rb.outputs["Normal"], p.inputs["Normal"])
    # l'eau étire les reflets dans l'axe de la route, comme sur un vrai bitume mouillé
    tg = N.new("ShaderNodeTangent", _direction_type="RADIAL", _axis="X")
    N.link(tg.outputs[0], p.inputs["Tangent"])
    N.link(N.mixf(puddle, 0.85, 0.6), p.inputs["Anisotropic"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_concrete():
    m, N, out = material("wet_concrete")
    tc = N.new("ShaderNodeTexCoord").outputs["Object"]
    uv = N.new("ShaderNodeMapping", Scale=(0.5, 0.5, 0.5))
    N.link(tc, uv.inputs[0])
    folder = os.path.join(ASSETS, "concrete_floor_01")
    diff = image(N, os.path.join(folder, "diff_1k.jpg"), uv.outputs[0])
    rough = image(N, os.path.join(folder, "rough_1k.jpg"), uv.outputs[0], color=False)
    nor = image(N, os.path.join(folder, "nor_gl_1k.jpg"), uv.outputs[0], color=False)
    nmap = N.new("ShaderNodeNormalMap", Strength=0.6)
    N.link(nor.outputs["Color"], nmap.inputs["Color"])
    p = principled(N)
    N.link(N.mix(1.0, diff.outputs["Color"], (0.5, 0.5, 0.52, 1), "MULTIPLY"), p.inputs["Base Color"])
    N.link(N.math("MULTIPLY", rough.outputs["Color"], 0.45), p.inputs["Roughness"])
    N.link(nmap.outputs[0], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_stucco(tint, seed):
    """Stuc pastel peint, avec coulures de pluie sous les corniches."""
    m, N, out = material(f"stucco_{seed}")
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    u = N.math("ADD", xyz[0], xyz[1])
    vec = N.new("ShaderNodeCombineXYZ")
    N.link(u, vec.inputs[0])
    N.link(xyz[2], vec.inputs[1])
    folder = os.path.join(ASSETS, "beige_wall_001")
    uvm = N.new("ShaderNodeMapping", Scale=(0.35, 0.35, 0.35))
    N.link(vec.outputs[0], uvm.inputs[0])
    diff = image(N, os.path.join(folder, "diff_1k.jpg"), uvm.outputs[0])
    nor = image(N, os.path.join(folder, "nor_gl_1k.jpg"), uvm.outputs[0], color=False)
    nmap = N.new("ShaderNodeNormalMap", Strength=0.5)
    N.link(nor.outputs["Color"], nmap.inputs["Color"])
    bw = N.new("ShaderNodeRGBToBW")
    N.link(diff.outputs["Color"], bw.inputs[0])
    stucco = N.mix(1.0, lin(tint), N.math("MULTIPLY", bw.outputs[0], 1.5), "MULTIPLY")
    streak = N.new("ShaderNodeTexNoise", Scale=1.0, Detail=4.0)
    sm = N.new("ShaderNodeMapping", Scale=(3.0, 0.12, 1.0))
    N.link(vec.outputs[0], sm.inputs[0])
    N.link(sm.outputs[0], streak.inputs["Vector"])
    stucco = N.mix(N.math("MULTIPLY", streak.outputs["Factor"], 0.6), stucco, N.mix(1.0, stucco, (0.55, 0.55, 0.6, 1), "MULTIPLY"))
    p = principled(N, Roughness=0.8)
    N.link(stucco, p.inputs["Base Color"])
    N.link(nmap.outputs[0], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_rooms(seed, ys, cw):
    """Le fond des chambres, vu par les fenêtres : chacune sa lampe, sa chaleur, certaines éteintes.
    Il éclaire pour de vrai l'embrasure (piliers, dalles) autour de lui."""
    m, N, out = material(f"rooms_{seed}")
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    y, z = xyz[1], xyz[2]
    col_i = N.math("FLOOR", N.math("DIVIDE", N.math("SUBTRACT", y, ys), cw))
    fl = N.math("FLOOR", N.math("DIVIDE", z, 3.2))
    fy = N.math("FRACT", N.math("DIVIDE", N.math("SUBTRACT", y, ys), cw))
    fz = N.math("FRACT", N.math("DIVIDE", z, 3.2))
    cell = N.new("ShaderNodeCombineXYZ")
    N.link(col_i, cell.inputs[0])
    N.link(fl, cell.inputs[1])
    N.set(cell.inputs[2], float(seed) * 1.37)
    wn = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="3D")
    N.link(cell.outputs[0], wn.inputs["Vector"])
    r1 = wn.outputs["Value"]
    rgb = N.sep(wn.outputs["Color"])
    lobby = N.math("LESS_THAN", z, 3.2)
    lit = N.math("MAXIMUM", N.math("GREATER_THAN", r1, 0.3), lobby)
    # trois chaleurs de lampe et, rarement, la lueur froide d'un écran
    warmth = N.ramp(rgb[0], [(0.0, lin("#ff9f45")), (0.45, lin("#ffc47a")), (0.85, lin("#ffe6c0")), (0.93, lin("#a9b8ff"))])
    # rideau tiré d'un côté, lampe posée plus bas que le plafond
    curtain = N.math("GREATER_THAN", N.math("ABSOLUTE", N.math("SUBTRACT", fy, rgb[1])), N.math("MULTIPLY", rgb[2], 0.45))
    curtain = N.mixf(curtain, 0.25, 1.0)
    lamp = N.math("ADD", 0.35, N.math("MULTIPLY", N.math("SUBTRACT", 1.0, fz), 0.9))
    level = N.math("ADD", 0.4, N.math("MULTIPLY", N.math("POWER", rgb[1], 2.0), 2.2))
    amt = N.math("MULTIPLY", N.math("MULTIPLY", N.math("MULTIPLY", lit, curtain), lamp), level)
    amt = N.mixf(lobby, amt, 1.6)
    e = N.new("ShaderNodeEmission")
    N.link(warmth, e.inputs["Color"])
    N.link(N.math("MULTIPLY", amt, 8.0), e.inputs["Strength"])
    d = principled(N, **{"Base Color": (0.03, 0.025, 0.025, 1), "Roughness": 0.9})
    add = N.new("ShaderNodeAddShader")
    N.link(e.outputs[0], add.inputs[0])
    N.link(d.outputs[0], add.inputs[1])
    N.link(add.outputs[0], out.inputs[0])
    return m


def mat_window_glass():
    """Vitre : transparente de face, miroir en incidence rasante (Fresnel), sans réfraction."""
    m, N, out = material("window_glass")
    lw = N.new("ShaderNodeLayerWeight", Blend=0.15)
    g = N.new("ShaderNodeBsdfGlossy", Roughness=0.03, Color=(0.9, 0.9, 0.95, 1))
    t = N.new("ShaderNodeBsdfTransparent")
    mx = N.new("ShaderNodeMixShader")
    N.link(N.math("ADD", N.math("MULTIPLY", lw.outputs["Fresnel"], 0.5), 0.04), mx.inputs[0])
    N.link(t.outputs[0], mx.inputs[1])
    N.link(g.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_awning(hexcolor, name):
    m, N, out = material(name)
    y = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])[1]
    stripe = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", y, 0.5)), 0.5)
    col = N.mix(stripe, lin(hexcolor), lin("#f1ebdd"))
    p = principled(N, Roughness=0.7)
    N.link(col, p.inputs["Base Color"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_sea():
    m, N, out = material("sea")
    tc = N.new("ShaderNodeTexCoord").outputs["Object"]
    w = N.new("ShaderNodeTexNoise", Scale=0.6, Detail=8.0)
    wm = N.new("ShaderNodeMapping", Scale=(1.0, 0.3, 1.0))
    N.link(tc, wm.inputs[0])
    N.link(wm.outputs[0], w.inputs["Vector"])
    b = N.new("ShaderNodeBump", Strength=0.25, Distance=0.2)
    N.link(w.outputs["Factor"], b.inputs["Height"])
    p = principled(N, **{"Base Color": (0.004, 0.006, 0.012, 1), "Roughness": 0.06})
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------- géométrie

def box(name, x0, x1, y0, y1, z0, z1, mat):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    for f in [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]:
        bm.faces.new([vs[i] for i in f])
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def rounded_footprint(x0, x1, y0, y1, r, grow=0.0, seg=10, near=True, far=True):
    """Rectangle aux angles côté route (x = x1) arrondis (near : y0, far : y1), agrandi de `grow`."""
    x0, x1, y0, y1 = x0 - grow, x1 + grow, y0 - grow, y1 + grow
    r = r + grow
    pts = [(x0, y0)]
    if near:
        for i in range(seg + 1):
            a = -math.pi / 2 + (math.pi / 2) * i / seg
            pts.append((x1 - r + r * math.cos(a), y0 + r + r * math.sin(a)))
    else:
        pts.append((x1, y0))
    if far:
        for i in range(seg + 1):
            a = (math.pi / 2) * i / seg
            pts.append((x1 - r + r * math.cos(a), y1 - r + r * math.sin(a)))
    else:
        pts.append((x1, y1))
    pts.append((x0, y1))
    return pts


class Boxes:
    """Beaucoup de pavés dans un seul maillage, un matériau par pavé."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def add(self, x0, x1, y0, y1, z0, z1, mat, front_mat=None):
        """front_mat : le matériau de la seule face tournée vers +x (la rue)."""
        idx = self._mi(mat)
        fidx = self._mi(front_mat) if front_mat else idx
        bm = self.bm
        vs = [bm.verts.new((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
        for f, plus_x in [((0, 2, 3, 1), False), ((4, 5, 7, 6), False), ((0, 1, 5, 4), False), ((2, 6, 7, 3), False), ((0, 4, 6, 2), False), ((1, 3, 7, 5), True)]:
            face = bm.faces.new([vs[i] for i in f])
            face.material_index = fidx if plus_x else idx

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def done(self):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        return ob


def prism(name, pts, z0, z1, mat):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in pts]
    hi = [bm.verts.new((x, y, z1)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    # les faces planes restent planes, l'arrondi est lissé
    mod = ob.modifiers.new("smooth", "SMOOTH_BY_ANGLE") if hasattr(bpy.types, "SmoothByAngleModifier") else None
    if mod is None:
        try:
            me.set_sharp_from_angle(angle=math.radians(35))
        except Exception:
            pass
    return ob


def hotel(i, y0, width, floors, tint, trim_mat, glass_mat):
    """Hôtel Art déco bas : deux tours d'angle arrondies en stuc plein, entre elles une façade
    profonde (piliers, dalles, chambres éclairées en retrait d'un mètre, vitres), balcons pleins
    sur une façade sur deux, bandeaux, corniche, aileron, marquises rayées au rez-de-chaussée."""
    depth = random.uniform(14, 20)
    x1 = -ROAD_HALF - WALK
    x0 = x1 - depth
    y1 = y0 + width
    h = floors * 3.2 + 1.4
    r = random.uniform(2.5, 4.0)
    cw_t = r + random.uniform(1.0, 2.5)
    stucco = mat_stucco(tint, i)
    prism(f"hotel_{i}_tower_a", rounded_footprint(x0, x1, y0, y0 + cw_t, r, far=False), 0, h, stucco)
    prism(f"hotel_{i}_tower_b", rounded_footprint(x0, x1, y1 - cw_t, y1, r, near=False), 0, h, stucco)
    gy0, gy1 = y0 + cw_t, y1 - cw_t
    n = max(2, int((gy1 - gy0) / random.uniform(2.6, 3.4)))
    cw = (gy1 - gy0) / n
    D = 1.0
    B = Boxes(f"hotel_{i}_facade")
    rooms = mat_rooms(i, gy0, cw)
    B.add(x0 + 1, x1 - D, gy0, gy1, 0, h, stucco, front_mat=rooms)
    pier = 0.42
    for k in range(n + 1):
        yk = gy0 + k * cw
        B.add(x1 - D, x1, yk - pier / 2, yk + pier / 2, 0, h, stucco)
    B.add(x1 - D, x1, gy0, gy1, 0, 0.35, stucco)
    for f in range(1, floors + 1):
        zf = f * 3.2
        B.add(x1 - D, x1, gy0, gy1, zf - 0.55, zf + 0.25, stucco)
    B.add(x1 - D, x1, gy0, gy1, h - 1.2, h, stucco)
    balconies = random.random() < 0.55
    for f in range(1, floors):
        zf = f * 3.2
        for k in range(n):
            if not balconies and not (k % 3 == 1 and f % 2 == 0):
                continue
            ya, yb = gy0 + k * cw + pier / 2, gy0 + (k + 1) * cw - pier / 2
            B.add(x1, x1 + 1.05, ya, yb, zf - 0.2, zf, stucco)
            B.add(x1 + 0.95, x1 + 1.05, ya, yb, zf, zf + 0.95, stucco)
            B.add(x1, x1 + 1.05, ya - 0.05, ya + 0.05, zf, zf + 0.95, stucco)
            B.add(x1, x1 + 1.05, yb - 0.05, yb + 0.05, zf, zf + 0.95, stucco)
    awn = mat_awning(random.choice([CORAL, "#2f6f6a", "#3a4a8a", "#b84a62"]), f"awning_{i}")
    for k in range(n):
        if random.random() < 0.6:
            ya, yb = gy0 + k * cw + pier / 2, gy0 + (k + 1) * cw - pier / 2
            B.add(x1, x1 + 1.6, ya, yb, 2.55, 2.7, awn)
            B.add(x1 + 1.55, x1 + 1.6, ya, yb, 2.2, 2.7, awn)
    B.add(x1 - 0.5, x1 - 0.48, gy0, gy1, 0.35, h - 1.2, glass_mat)
    body = B.done()
    body["h"] = h
    for f in range(1, floors + 1):
        zf = f * 3.2 + 0.25
        prism(f"hotel_{i}_band_{f}", rounded_footprint(x0, x1, y0, y1, r, grow=0.35), zf, zf + 0.12, trim_mat)
    prism(f"hotel_{i}_cornice", rounded_footprint(x0, x1, y0, y1, r, grow=0.25), h, h + 0.5, trim_mat)
    if random.random() < 0.6:
        yc = y0 + cw_t / 2 if random.random() < 0.5 else (y0 + y1) / 2
        box(f"hotel_{i}_fin", x1 - 0.3, x1 + 0.6, yc - 0.6, yc + 0.6, 3.2, h + random.uniform(3, 6), trim_mat)


def instance(src, name, loc, rot_z=0.0, scale=1.0):
    ob = bpy.data.objects.new(name, src.data)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    ob.scale = (scale, scale, scale)
    for k in src.keys():
        ob[k] = src[k]
    return ob


def linear_keys(ob):
    """Interpolation linéaire : la vitesse est constante sur l'obturateur."""
    act = ob.animation_data.action
    curves = list(getattr(act, "fcurves", []) or [])
    if not curves:
        # Blender 5 : les courbes vivent dans les tranches de l'action
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


# ---------------------------------------------------------------- scène

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    hidden = bpy.data.collections.new("sources")
    scene.collection.children.link(hidden)

    # --- le coupé : modèle générique haute définition, l'avant vers -y d'origine
    parts = import_glb("coupe-hd.glb")
    paint = mat_paint()[0]
    side_glass = mat_tinted_glass()
    windscreen = mat_windscreen()
    head_emit = mat_emit("coupe_headlight", lin(CREAM), 40.0)
    drl_emit = mat_emit("coupe_drl", lin(CREAM), 12.0)
    tail_emit = mat_emit("coupe_taillight", lin("#ff2a1a"), 9.0)
    lamp_glass = mat_clear_glass()
    housing = mat_plain("headlight_housing", (0.02, 0.02, 0.022, 1), 0.15, 1.0)
    plate = mat_plain("blank_plate", (0.55, 0.55, 0.52, 1), 0.5)
    keep = []
    for o in parts:
        n = o.name
        if n.startswith("Icosphere") or re.search(r"badge|logo|emblem", n, re.I):
            bpy.data.objects.remove(o)
            continue
        if n.startswith("headlights.") and "car-body" in n:
            o.data.materials[0] = head_emit
        elif n.startswith("headlight-drl"):
            o.data.materials[0] = drl_emit
        elif n.startswith("headlight-base"):
            o.data.materials[0] = housing
        elif n.startswith(("headlight-lens", "headlights.")):
            o.data.materials[0] = lamp_glass
        elif n.startswith("glass-windshield"):
            o.data.materials[0] = windscreen
        elif "Glass ext" in n:
            o.data.materials[0] = side_glass
        elif "car-body" in n:
            o.data.materials[0] = paint
        elif n.startswith("taillight"):
            o.data.materials[0] = tail_emit
        keep.append(o)
    # les roues à part (jante, pneu, disque), origine au moyeu, pour qu'elles tournent
    wheel_parts = {}
    for o in list(keep):
        if o.name.startswith(("wheel-full", "tire-low", "brake-disc")):
            keep.remove(o)
            c = sum((o.matrix_world @ Vector(v) for v in o.bound_box), Vector()) / 8
            wheel_parts.setdefault((c.x > 0, c.y > 0), []).append(o)
    coupe = join(keep, "coupe")
    pts = [Vector(v) for v in coupe.bound_box]
    mn, mx = Vector(map(min, *pts)), Vector(map(max, *pts))
    origin = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    recentre(coupe)
    for (px, py), objs in wheel_parts.items():
        w = join(objs, f"wheel_{'l' if px else 'r'}{'r' if py else 'f'}")
        pts = [Vector(v) for v in w.bound_box]
        hub = (Vector(map(min, *pts)) + Vector(map(max, *pts))) / 2
        w.data.transform(__import__("mathutils").Matrix.Translation(-hub))
        w.rotation_mode = "XYZ"
        w.parent = coupe
        w.location = hub - origin
    coupe.rotation_mode = "XYZ"
    coupe.location = (LANE_X, COUPE_Y, 0)
    # quelques degrés de lacet : le capot ne renvoie plus l'horizon en plein
    coupe.rotation_euler = (0, 0, math.radians(COUPE_YAW))
    for side in (-1, 1):
        L = bpy.data.lights.new(f"headlight_{side}", "SPOT")
        L.energy = 90
        L.color = lin(CREAM)[:3]
        L.spot_size = math.radians(60)
        L.spot_blend = 0.6
        L.shadow_soft_size = 0.04
        lo = bpy.data.objects.new(f"headlight_{side}", L)
        scene.collection.objects.link(lo)
        lo.parent = coupe
        lo.location = (side * 0.77, -2.15, 0.70)
        lo.rotation_euler = (math.radians(95), 0, math.radians(180))
    # les gerbes d'eau derrière les roues arrière
    spray_m, SN, sout = material("spray")
    sco = SN.new("ShaderNodeTexCoord").outputs["Object"]
    sno = SN.new("ShaderNodeTexNoise", Scale=4.0, Detail=6.0)
    SN.link(sco, sno.inputs["Vector"])
    grad = SN.math("SUBTRACT", 1.0, SN.math("MINIMUM", SN.new("ShaderNodeVectorMath", _operation="LENGTH").outputs[1] if False else 0.0, 1.0))
    vlen = SN.new("ShaderNodeVectorMath", _operation="LENGTH")
    SN.link(sco, vlen.inputs[0])
    fall = SN.math("POWER", SN.math("MAXIMUM", SN.math("SUBTRACT", 1.0, vlen.outputs["Value"]), 0.0), 1.5)
    dens = SN.math("MULTIPLY", SN.math("MULTIPLY", SN.math("MAXIMUM", SN.math("SUBTRACT", sno.outputs["Factor"], 0.45), 0.0), fall), 6.0)
    sv = SN.new("ShaderNodeVolumePrincipled", Color=lin("#d8d4ea"), Anisotropy=0.5)
    SN.link(dens, sv.inputs["Density"])
    SN.link(sv.outputs[0], sout.inputs["Volume"])
    del grad
    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1.0)
        sp = bpy.context.active_object
        sp.name = f"spray_{side}"
        sp.data.materials.append(spray_m)
        sp.parent = coupe
        sp.location = (side * 0.95, 2.9, 0.28)
        sp.scale = (0.45, 1.3, 0.35)
        sp.visible_shadow = False

    # --- la patrouille
    parts = import_glb("police.glb")
    pol_paint = mat_police_body()
    bar = mat_lightbar()
    # phares en veilleuse seulement : la patrouille se remarque en second
    pol_head = mat_emit("police_headlight", lin("#fff4d6"), 2.5)
    keep = []
    for o in parts:
        n = o.name
        if "Badges" in n:
            bpy.data.objects.remove(o)
            continue
        if "Numberplate" in n:
            o.data.materials[0] = plate
        elif "Bodymat" in n:
            o.data.materials[0] = pol_paint
        elif "Lightbar_Glass" in n:
            o.data.materials[0] = bar
        elif "Headlights001_UCB" in n:
            o.data.materials[0] = pol_head
        elif "Headlights_Glass" in n:
            o.data.materials[0] = lamp_glass
        elif "Transperent" in n:
            o.data.materials[0] = side_glass
        keep.append(o)
    police = join(keep, "police")
    recentre(police)
    police.location = (POLICE_X, POLICE_Y, 0)
    police.rotation_mode = "XYZ"
    police.rotation_euler = (0, 0, -math.pi / 2)

    # --- la route, les trottoirs, la plage, la mer
    road = box("road", -ROAD_HALF, ROAD_HALF, -30, 900, -0.05, 0.0, mat_road())
    conc = mat_concrete()
    box("walk_left", -ROAD_HALF - WALK, -ROAD_HALF, -30, 900, -0.05, 0.15, conc)
    box("walk_right", ROAD_HALF, ROAD_HALF + WALK, -30, 900, -0.05, 0.15, conc)
    box("block_left", -200, -ROAD_HALF - WALK, -30, 900, -0.05, 0.15, conc)
    wall = mat_plain("sea_wall", lin("#d9d2c4"), 0.6)
    box("sea_wall", ROAD_HALF + WALK, ROAD_HALF + WALK + 0.35, -30, 900, 0.0, 0.85, wall)
    sand = mat_plain("wet_sand", lin("#3a332d"), 0.3)
    box("beach", ROAD_HALF + WALK, 34, -30, 1200, -1.6, -1.5, sand)
    box("sea", 34, 3000, -400, 4000, -1.7, -1.6, mat_sea())
    box("sea_far", -3000, 3000, 900, 4000, -1.75, -1.65, bpy.data.materials["sea"])

    # --- les hôtels, côté ville
    trims = [mat_plain("trim_white", lin("#f3efe6"), 0.55), mat_plain("trim_cream", lin("#efe2c4"), 0.55)]
    wglass = mat_window_glass()
    tints = ["#f2c6cf", "#bfe3d6", "#d8cdf0", "#f6d2b0", "#c8dcef", "#f4e6b8"]
    y = 22.0
    i = 0
    while y < 620:
        w = random.uniform(20, 34)
        hotel(i, y, w, random.randint(3, 5), tints[i % len(tints)], trims[i % 2], wglass)
        y += w + random.uniform(2, 7)
        i += 1
    # au loin, de l'autre côté, la pointe de la baie : quelques hôtels
    for k in range(6):
        yy = 650 + k * 40
        hotel(100 + k, yy, 30, random.randint(4, 7), tints[k % len(tints)], trims[k % 2], wglass)
        for o in [o for o in bpy.data.objects if o.name.startswith(f"hotel_{100 + k}")]:
            o.location.x += 30 + ROAD_HALF * 2 + WALK * 2 + 20
            o.scale.x = -1

    # --- les palmiers
    parts = import_glb("palms.glb")
    groups = {tag: [o for o in parts if o.name.startswith(tag)] for tag in ("PALMLOW_", "PALMLOW2_", "PALMLOW3_")}
    palms = []
    for tag, grp in groups.items():
        p = join(grp, f"palm_src_{len(palms)}")
        recentre(p)
        for c in list(p.users_collection):
            c.objects.unlink(p)
        hidden.objects.link(p)
        palms.append(p)
    k = 0
    for side, x, start, step in ((1, ROAD_HALF + 2.4, 6.0, 13.0), (-1, -ROAD_HALF - 1.6, 12.0, 17.0)):
        yy = start
        while yy < 700:
            instance(palms[k % 3], f"palm_{k}", (x + random.uniform(-0.4, 0.4), yy + random.uniform(-1.5, 1.5), 0.15),
                     random.uniform(0, math.tau), random.uniform(1.15, 1.45))
            yy += step + random.uniform(-2, 2)
            k += 1

    # --- les lampadaires
    parts = import_glb("streetlights.glb")
    mine = [o for o in parts if o.name.startswith("polySurface102")]
    for o in [o for o in parts if o not in mine]:
        bpy.data.objects.remove(o)
    lamp = join(mine, "lamp_src")
    metal, head = mat_plain("lamp_metal", (0.05, 0.05, 0.055, 1), 0.35, 0.8), mat_emit("lamp_head", lin(AMBER), 40.0)
    for i, m in enumerate(lamp.data.materials):
        lamp.data.materials[i] = head if m.name.startswith("light") else metal
    recentre(lamp)
    # le bras part vers -y dans le modèle ; tête à (0,-1,7 , 4,7) environ
    for c in list(lamp.users_collection):
        c.objects.unlink(lamp)
    hidden.objects.link(lamp)
    S = 1.75
    k = 0
    for side in (-1, 1):
        yy = 14.0 if side < 0 else 28.0
        while yy < 700:
            x = side * (ROAD_HALF + 0.6)
            rot = math.pi / 2 if side < 0 else -math.pi / 2  # le bras (−y du modèle) vers la route
            instance(lamp, f"lamp_{k}", (x, yy, 0.15), rot, S)
            head = Vector((0, -1.68 * S, 4.68 * S)).copy()
            head.rotate(__import__("mathutils").Euler((0, 0, rot)))
            L = bpy.data.lights.new(f"lamp_{k}", "SPOT")
            L.energy = 2600
            L.color = lin(AMBER)[:3]
            L.spot_size = math.radians(130)
            L.spot_blend = 0.5
            L.shadow_soft_size = 0.25
            lo = bpy.data.objects.new(f"lamp_light_{k}", L)
            scene.collection.objects.link(lo)
            lo.location = Vector((x, yy, 0.15)) + head - Vector((0, 0, 0.12))
            yy += 30.0
            k += 1
    hidden.hide_render = True
    hidden.hide_viewport = True

    # --- le ciel : HDRI réel, ramené à la palette par l'élévation
    world = bpy.data.worlds.new("blue_hour")
    scene.world = world
    if hasattr(world, "use_nodes"):
        world.use_nodes = True
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N = Nodes(nt)
    tc = N.new("ShaderNodeTexCoord")
    # la lueur du soleil couché au bout de l'avenue (+y), le ciel plus sombre derrière la caméra
    mp = N.new("ShaderNodeMapping", Rotation=(0, 0, math.radians(-90)))
    N.link(tc.outputs["Generated"], mp.inputs[0])
    env = N.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(ASSETS, "qwantani_dusk_2_puresky_2k.exr"))
    N.link(mp.outputs[0], env.inputs[0])
    dxyz = N.sep(tc.outputs["Generated"])
    elev = N.math("MAXIMUM", dxyz[2], 0.0)
    # la bande corail n'existe que du côté du couchant, au bout de l'avenue
    toward = N.math("POWER", N.math("MAXIMUM", dxyz[1], 0.0), 3.0)
    dusk = N.ramp(elev, [(0.0, lin(CORAL)), (0.03, lin("#b9586f")), (0.08, lin(INDIGO)), (0.3, lin("#303c80")), (0.7, lin(NAVY))])
    night = N.ramp(elev, [(0.0, lin("#3c3f86")), (0.1, lin("#2f3a78")), (0.5, lin(NAVY))])
    tint = N.mix(toward, night, dusk)
    bw = N.new("ShaderNodeRGBToBW")
    N.link(env.outputs["Color"], bw.inputs[0])
    # la luminance de l'HDRI, comprimée : on garde ses nuages, pas son exposition
    lum = N.math("MULTIPLY", N.math("POWER", bw.outputs[0], 0.5), 0.9)
    skycol = N.mix(1.0, tint, N.new("ShaderNodeCombineColor").outputs[0], "MULTIPLY")
    graded = N.new("ShaderNodeMix", _data_type="RGBA", _blend_type="MULTIPLY")
    N.set(graded.inputs["Factor"], 1.0)
    N.link(tint, graded.inputs[6])
    N.link(lum, graded.inputs[7])
    # 30 % de la couleur d'origine de l'HDRI, pour garder ses nuances
    final = N.mix(0.05, graded.outputs[2], env.outputs["Color"])
    bg = N.new("ShaderNodeBackground", Strength=0.55)
    N.link(final, bg.inputs["Color"])
    wo = N.new("ShaderNodeOutputWorld")
    N.link(bg.outputs[0], wo.inputs["Surface"])
    del skycol

    # --- la brume d'après la pluie
    haze_m, HN, hout = material("haze")
    vol = HN.new("ShaderNodeVolumePrincipled", Color=lin("#b8b4d8"), Density=0.0015, Anisotropy=0.45)
    HN.link(vol.outputs[0], hout.inputs["Volume"])
    haze = box("haze", -60, 60, -10, 480, -0.1, 40, haze_m)
    haze.visible_shadow = False

    # --- la caméra
    cam = bpy.data.cameras.new("cam")
    cam.lens = 50
    cam.sensor_fit = "AUTO"
    cam.sensor_width = 36
    cam.shift_y = 0.1
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = 2.0
    cam.dof.aperture_blades = 7
    cam.clip_end = 5000
    co = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(co)
    co.location = (CAM_X, 0, CAM_Z)
    co.rotation_euler = (math.radians(90.0), 0, 0)
    focus = bpy.data.objects.new("focus", None)
    scene.collection.objects.link(focus)
    focus.location = (LANE_X, COUPE_Y - 2.0, 0.7)
    cam.dof.focus_object = focus
    scene.camera = co

    # --- rendu
    r = scene.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = 720, 1280
    r.resolution_percentage = 100
    r.threads_mode = "FIXED"
    r.threads = 2
    c = scene.cycles
    c.device = "CPU"
    c.samples = 256
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.02
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.max_bounces = 8
    c.diffuse_bounces = 3
    c.glossy_bounces = 4
    c.transmission_bounces = 6
    c.volume_bounces = 0
    c.transparent_max_bounces = 8
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.sample_clamp_indirect = 8.0
    c.blur_glossy = 1.0
    c.film_exposure = 1.0
    vs = scene.view_settings
    vs.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            vs.look = look
            break
        except TypeError:
            pass
    vs.exposure = 0.0
    r.image_settings.file_format = "PNG"
    r.image_settings.color_depth = "8"

    # --- compositing : halo des lumières, dispersion légère de l'objectif
    ng = bpy.data.node_groups.new("comp_a", "CompositorNodeTree")
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    rl = ng.nodes.new("CompositorNodeRLayers")
    gl = ng.nodes.new("CompositorNodeGlare")
    for k, v in (("Type", "Bloom"), ("Quality", "High"), ("Threshold", 1.2), ("Strength", 0.12), ("Size", 0.6), ("Saturation", 1.0)):
        try:
            gl.inputs[k].default_value = v
        except Exception as e:
            print("[scene_a] glare", k, e)
    ld = ng.nodes.new("CompositorNodeLensdist")
    try:
        ld.inputs["Dispersion"].default_value = 0.012
        ld.inputs["Distortion"].default_value = -0.01
    except Exception as e:
        print("[scene_a] lens", e)
    go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ng.links.new(gl.outputs["Image"], ld.inputs["Image"])
    ng.links.new(ld.outputs["Image"], go.inputs[0])
    scene.compositing_node_group = ng

    # --- le mouvement, pour le flou de bougé : tout roule à 50 km/h vers la caméra (−y),
    # la caméra recule à la même vitesse (travelling avant). Image 2 = la pose ci-dessus.
    scene.frame_start, scene.frame_end = 1, 3
    for ob in (co, focus, coupe, police):
        y = ob.location.y
        for f in (1, 3):
            ob.location.y = y - SPEED * (f - 2) / 24
            ob.keyframe_insert("location", index=1, frame=f)
        ob.location.y = y
        linear_keys(ob)
    spin = SPEED / WHEEL_R / 24
    for w in [o for o in coupe.children if o.name.startswith("wheel_")]:
        for f in (1, 3):
            w.rotation_euler.x = spin * (f - 2)
            w.keyframe_insert("rotation_euler", index=0, frame=f)
        w.rotation_euler.x = 0
        linear_keys(w)
    scene.frame_set(2)
    r.motion_blur_shutter = 0.5
    r.use_motion_blur = False

    out = os.path.join(ASSETS, "scene-a.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print(f"[scene_a] écrit {out}", flush=True)


build()
