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
CAM_X = -2.35          # un peu à gauche : la patrouille sort à gauche du coupé
CAM_Z = 0.85           # hauteur de capot
COUPE_Y = 13.0         # centre du coupé (l'avant à ~10,7 m de l'objectif)
POLICE_X = -5.1        # la voie extérieure
POLICE_Y = 42.0
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
    m, N, out = material("coupe_paint")
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    flake = N.new("ShaderNodeTexNoise", Scale=900.0, Detail=1.0)
    N.set(flake.inputs["Vector"], co)
    fb = N.new("ShaderNodeBump", Strength=0.08, Distance=0.001)
    N.set(fb.inputs["Height"], flake.outputs["Factor"])
    drop_n, drop_h = droplets(N, co, 70.0, strength=0.6)
    drop_n2, _ = droplets(N, N.math("MULTIPLY", co, 1.0) if False else co, 190.0, size=0.38, strength=0.4)
    # mélange des deux tailles de gouttes : la plus forte gagne
    coatn = N.new("ShaderNodeBump", Strength=0.0)
    base = lin(PLUM)
    # sous le vernis, une base surtout diffuse : la couleur tient, les reflets restent nets
    p = principled(N, **{"Base Color": base, "Metallic": 0.15, "Roughness": 0.45, "Specular IOR Level": 0.25, "Coat Weight": 1.0,
                         "Coat Roughness": 0.02, "Coat IOR": 1.5})
    N.link(fb.outputs["Normal"], p.inputs["Normal"])
    nmix = N.new("ShaderNodeMix", _data_type="VECTOR")
    N.set(nmix.inputs["Factor"], 0.5)
    N.link(drop_n, nmix.inputs[4])
    N.link(drop_n2, nmix.inputs[5])
    N.link(nmix.outputs[1], p.inputs["Coat Normal"])
    N.link(p.outputs[0], out.inputs[0])
    del coatn
    return m, N, p


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
    puddle = N.ramp(wet, [(0.50, (0, 0, 0)), (0.56, (1, 1, 1))])
    damp = N.ramp(wet, [(0.30, (0, 0, 0)), (0.52, (1, 1, 1))])
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
    r = N.mixf(puddle, r, 0.05)
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
    N.link(N.mixf(puddle, 0.75, 0.3), p.inputs["Anisotropic"])
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


def mat_hotel(tint, seed):
    """Stuc pastel, fenêtres en grille, une sur deux allumée en ambre ; rez-de-chaussée vitré."""
    m, N, out = material(f"hotel_{seed}")
    wc = N.new("ShaderNodeTexCoord").outputs["Object"]
    xyz = N.sep(wc)
    u = N.math("ADD", xyz[0], xyz[1])
    z = xyz[2]
    h = N.new("ShaderNodeAttribute", _attribute_type="OBJECT", _attribute_name="h").outputs["Fac"]
    cell_w, floor_h = 2.7, 3.2
    fu = N.math("FRACT", N.math("DIVIDE", u, cell_w))
    fz = N.math("FRACT", N.math("DIVIDE", z, floor_h))
    win = N.math("MULTIPLY", N.math("MULTIPLY", N.math("GREATER_THAN", fu, 0.2), N.math("LESS_THAN", fu, 0.8)),
                 N.math("MULTIPLY", N.math("GREATER_THAN", fz, 0.32), N.math("LESS_THAN", fz, 0.82)))
    upper = N.math("MULTIPLY", N.math("GREATER_THAN", z, floor_h), N.math("LESS_THAN", z, N.math("SUBTRACT", h, 1.2)))
    win = N.math("MULTIPLY", win, upper)
    lobby = N.math("MULTIPLY", N.math("GREATER_THAN", z, 0.4), N.math("LESS_THAN", z, 2.6))
    lobby = N.math("MULTIPLY", lobby, N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", u, 4.0)), 0.86))
    cell = N.new("ShaderNodeCombineXYZ")
    N.link(N.math("FLOOR", N.math("DIVIDE", u, cell_w)), cell.inputs[0])
    N.link(N.math("FLOOR", N.math("DIVIDE", z, floor_h)), cell.inputs[1])
    N.set(cell.inputs[2], float(seed))
    wn = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="3D")
    N.link(cell.outputs[0], wn.inputs["Vector"])
    lit = N.math("GREATER_THAN", wn.outputs["Value"], 0.42)
    warm = N.mix(wn.outputs["Value"], lin("#ffb35a"), lin("#ffd28a"))
    glass = N.math("MAXIMUM", win, lobby)
    # chaque fenêtre a sa lampe : rideau tiré, lampe de chevet, plafonnier
    rnd2 = N.sep(wn.outputs["Color"])[1]
    curtain = N.math("ADD", 0.25, N.math("MULTIPLY", N.math("POWER", rnd2, 2.0), 1.1))
    curtain = N.math("MULTIPLY", curtain, N.math("ADD", 0.55, N.math("MULTIPLY", N.math("SUBTRACT", 1.0, fz), 0.7)))
    emit_amt = N.math("MAXIMUM", N.math("MULTIPLY", N.math("MULTIPLY", win, lit), curtain), N.math("MULTIPLY", lobby, 0.3))
    folder = os.path.join(ASSETS, "beige_wall_001")
    uvm = N.new("ShaderNodeMapping", Scale=(0.35, 0.35, 0.35))
    vec = N.new("ShaderNodeCombineXYZ")
    N.link(u, vec.inputs[0])
    N.link(z, vec.inputs[1])
    N.link(vec.outputs[0], uvm.inputs[0])
    diff = image(N, os.path.join(folder, "diff_1k.jpg"), uvm.outputs[0])
    bw = N.new("ShaderNodeRGBToBW")
    N.link(diff.outputs["Color"], bw.inputs[0])
    stucco = N.mix(1.0, lin(tint), N.math("MULTIPLY", bw.outputs[0], 1.5), "MULTIPLY")
    # salissures de pluie : coulures sombres sous les corniches
    streak = N.new("ShaderNodeTexNoise", Scale=1.0, Detail=4.0)
    sm = N.new("ShaderNodeMapping", Scale=(3.0, 0.12, 1.0))
    N.link(vec.outputs[0], sm.inputs[0])
    N.link(sm.outputs[0], streak.inputs["Vector"])
    stucco = N.mix(N.math("MULTIPLY", streak.outputs["Factor"], 0.5), stucco, N.mix(1.0, stucco, (0.6, 0.6, 0.65, 1), "MULTIPLY"))
    col = N.mix(glass, stucco, (0.01, 0.01, 0.015, 1))
    p = principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.mixf(glass, 0.75, 0.06), p.inputs["Roughness"])
    N.link(warm, p.inputs["Emission Color"])
    N.link(N.math("MULTIPLY", emit_amt, 3.0), p.inputs["Emission Strength"])
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


def rounded_footprint(x0, x1, y0, y1, r, grow=0.0, seg=10):
    """Rectangle aux deux angles côté route (x = x1) arrondis, agrandi de `grow`."""
    x0, x1, y0, y1 = x0 - grow, x1 + grow, y0 - grow, y1 + grow
    r = r + grow
    pts = [(x0, y0)]
    for i in range(seg + 1):  # angle (x1, y0)
        a = -math.pi / 2 + (math.pi / 2) * i / seg
        pts.append((x1 - r + r * math.cos(a), y0 + r + r * math.sin(a)))
    for i in range(seg + 1):  # angle (x1, y1)
        a = (math.pi / 2) * i / seg
        pts.append((x1 - r + r * math.cos(a), y1 - r + r * math.sin(a)))
    pts.append((x0, y1))
    return pts


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


def hotel(i, y0, width, floors, tint, trim_mat):
    depth = random.uniform(14, 20)
    x1 = -ROAD_HALF - WALK
    x0 = x1 - depth
    y1 = y0 + width
    h = floors * 3.2 + 1.4
    r = random.uniform(2.5, 4.5)
    mat = mat_hotel(tint, i)
    body = prism(f"hotel_{i}", rounded_footprint(x0, x1, y0, y1, r), 0, h, mat)
    body["h"] = h
    # bandeaux horizontaux (les « sourcils » Art déco), sur le pourtour
    for f in range(1, floors + 1):
        zf = f * 3.2 + 0.05
        prism(f"hotel_{i}_band_{f}", rounded_footprint(x0, x1, y0, y1, r, grow=0.45), zf, zf + 0.14, trim_mat)
    prism(f"hotel_{i}_cornice", rounded_footprint(x0, x1, y0, y1, r, grow=0.25), h, h + 0.5, trim_mat)
    # aileron vertical au milieu de la façade, au-dessus du toit (sans enseigne)
    if random.random() < 0.6:
        yc = (y0 + y1) / 2
        box(f"hotel_{i}_fin", x1 - 0.2, x1 + 0.7, yc - 0.6, yc + 0.6, 3.2, h + random.uniform(3, 6), trim_mat)
    # marquise au-dessus de l'entrée
    yc = (y0 + y1) / 2 + random.uniform(-3, 3)
    box(f"hotel_{i}_canopy", x1, x1 + 2.2, yc - 3, yc + 3, 2.9, 3.1, trim_mat)


def instance(src, name, loc, rot_z=0.0, scale=1.0):
    ob = bpy.data.objects.new(name, src.data)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    ob.scale = (scale, scale, scale)
    for k in src.keys():
        ob[k] = src[k]
    return ob


# ---------------------------------------------------------------- scène

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    hidden = bpy.data.collections.new("sources")
    scene.collection.children.link(hidden)

    # --- le coupé
    parts = import_glb("coupe.glb")
    paint_src = None
    paint = None
    glass = mat_tinted_glass()
    head_emit = mat_emit("coupe_headlight", lin(CREAM), 30.0)
    lamp_glass = mat_clear_glass()
    plate = mat_plain("blank_plate", (0.55, 0.55, 0.52, 1), 0.5)
    keep = []
    for o in parts:
        n = o.name
        if "Badges" in n:
            bpy.data.objects.remove(o)
            continue
        if "Numberplates" in n:
            o.data.materials[0] = plate
        elif "Bodymat" in n:
            if paint is None:
                paint_src = find_image(o.data.materials[0])
                paint = paint_with_detail(paint_src)
            o.data.materials[0] = paint
        elif "Headlights_Secondary_Glass" in n:
            o.data.materials[0] = lamp_glass
        elif "Headlights_Secondary_UCB" in n:
            o.data.materials[0] = head_emit
        elif "Transperent" in n:
            o.data.materials[0] = glass
        keep.append(o)
    coupe = join(keep, "coupe")
    recentre(coupe)
    coupe.location = (LANE_X, COUPE_Y, 0)
    coupe.rotation_mode = "XYZ"  # le glTF importe en quaternions
    coupe.rotation_euler = (0, 0, -math.pi / 2)
    for side in (-1, 1):
        # phares : x avant = +2,24 dans le repère du coupé (avant vers -y une fois tourné)
        L = bpy.data.lights.new(f"headlight_{side}", "SPOT")
        L.energy = 110
        L.color = lin(CREAM)[:3]
        L.spot_size = math.radians(70)
        L.spot_blend = 0.6
        L.shadow_soft_size = 0.05
        lo = bpy.data.objects.new(f"headlight_{side}", L)
        scene.collection.objects.link(lo)
        lo.location = (LANE_X + side * 0.62, COUPE_Y - 2.3, 0.39)
        lo.rotation_euler = (math.radians(95), 0, math.radians(180))

    # --- la patrouille
    parts = import_glb("police.glb")
    pol_paint = mat_police_body()
    bar = mat_lightbar()
    pol_head = mat_emit("police_headlight", lin("#fff4d6"), 25.0)
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
            o.data.materials[0] = glass
        keep.append(o)
    police = join(keep, "police")
    recentre(police)
    police.location = (POLICE_X, POLICE_Y, 0)
    police.rotation_mode = "XYZ"
    police.rotation_euler = (0, 0, -math.pi / 2)
    for side in (-1, 1):
        L = bpy.data.lights.new(f"police_head_{side}", "SPOT")
        L.energy = 150
        L.color = lin("#fff4d6")[:3]
        L.spot_size = math.radians(70)
        L.spot_blend = 0.6
        L.shadow_soft_size = 0.05
        lo = bpy.data.objects.new(f"police_head_{side}", L)
        scene.collection.objects.link(lo)
        lo.location = (POLICE_X + side * 0.6, POLICE_Y - 2.4, 0.66)
        lo.rotation_euler = (math.radians(95), 0, math.radians(180))

    # --- la route, les trottoirs, la plage, la mer
    road = box("road", -ROAD_HALF, ROAD_HALF, -30, 900, -0.05, 0.0, mat_road())
    conc = mat_concrete()
    box("walk_left", -ROAD_HALF - WALK, -ROAD_HALF, -30, 900, -0.05, 0.15, conc)
    box("walk_right", ROAD_HALF, ROAD_HALF + WALK, -30, 900, -0.05, 0.15, conc)
    box("block_left", -200, -ROAD_HALF - WALK, -30, 900, -0.05, 0.15, conc)
    wall = mat_plain("sea_wall", lin("#d9d2c4"), 0.6)
    box("sea_wall", ROAD_HALF + WALK, ROAD_HALF + WALK + 0.35, -30, 900, 0.0, 0.85, wall)
    sand = mat_plain("wet_sand", lin("#5d5247"), 0.35)
    box("beach", ROAD_HALF + WALK, 80, -30, 1200, -1.6, -1.5, sand)
    box("sea", 80, 3000, -400, 4000, -1.7, -1.6, mat_sea())
    box("sea_far", -3000, 3000, 900, 4000, -1.75, -1.65, bpy.data.materials["sea"])

    # --- les hôtels, côté ville
    trims = [mat_plain("trim_white", lin("#f3efe6"), 0.55), mat_plain("trim_cream", lin("#efe2c4"), 0.55)]
    tints = ["#f2c6cf", "#bfe3d6", "#d8cdf0", "#f6d2b0", "#c8dcef", "#f4e6b8"]
    y = 22.0
    i = 0
    while y < 620:
        w = random.uniform(20, 34)
        hotel(i, y, w, random.randint(3, 5), tints[i % len(tints)], trims[i % 2])
        y += w + random.uniform(2, 7)
        i += 1
    # au loin, de l'autre côté, la pointe de la baie : quelques hôtels
    for k in range(6):
        yy = 650 + k * 40
        hotel(100 + k, yy, 30, random.randint(4, 7), tints[k % len(tints)], trims[k % 2])
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
    focus.location = (LANE_X, COUPE_Y - 2.0, 0.6)
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

    out = os.path.join(ASSETS, "scene-a.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print(f"[scene_a] écrit {out}", flush=True)


build()
