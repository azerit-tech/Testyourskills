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
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def main_checkout():
    try:
        common = subprocess.run(["git", "-C", ROOT, "rev-parse", "--git-common-dir"], capture_output=True, text=True, check=True).stdout.strip()
        return os.path.dirname(os.path.abspath(os.path.join(ROOT, common)))
    except Exception:
        return ROOT


ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.join(os.path.dirname(main_checkout()), "design", "film", "assets")
os.environ.setdefault("FILM3D_ASSETS", ASSETS)  # (lab/cast_people compte ses dossiers depuis son fichier : faux en worktree)
random.seed(27)

# Les variantes à comparer, en attendant le choix de Jacques (une variable d'environnement chacune) :
#   FILM3D_FACADE : base (les boîtes d'origine), kit (pièces assemblées), proc (tout en nœuds),
#                   mix (étages en enduit photographique, rez-de-chaussée en boutiques de bibliothèque)
#   FILM3D_ROUTE  : base (l'enrobé d'origine), pluie (juste après l'averse), sechage (en train de sécher, par défaut :
#                   le choix de Jacques du 11 novembre)
#   FILM3D_HERO   : la voiture poursuivie, w111 (berline des années 60, par défaut), slc (coupé des années 70),
#                   chargées par lab/hero_cars.py, ou coupe (le coupé d'origine) ; FILM3D_DRIVER=0 la laisse vide
#   FILM3D_BLEND  : le nom du .blend écrit dans assets (scene-a.blend par défaut)
FACADE = os.environ.get("FILM3D_FACADE", "mix")
ROUTE = os.environ.get("FILM3D_ROUTE", "sechage")
HERO = os.environ.get("FILM3D_HERO", "w111")
BLEND = os.environ.get("FILM3D_BLEND", "scene-a.blend")
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import ouv_avenue as OUV  # noqa: E402  (le plan OUV, sans Blender)


def facade_module():
    """Le module qui dessine les huit immeubles, selon FILM3D_FACADE (None : make_building d'ici)."""
    if FACADE == "base":
        return None
    import importlib
    return importlib.import_module({"kit": "facade_kit", "proc": "facade_proc", "mix": "facade_mix"}[FACADE])

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


# ---------------------------------------------------------------- la ville : matériaux

FH = 3.2               # hauteur d'un étage courant
RD = 4.0               # profondeur des chambres et des boutiques, derrière la façade
FRONT_X = -ROAD_HALF - WALK


def mat_stucco_obj():
    """Stuc peint, la teinte vient de l'objet (une instance, une couleur) ; coulures sous les
    corniches, pied du mur mouillé et plus sombre."""
    m, N, out = material("stucco")
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    vec = N.new("ShaderNodeCombineXYZ")
    N.link(N.math("ADD", xyz[0], xyz[1]), vec.inputs[0])
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
    info = N.new("ShaderNodeObjectInfo")
    col = N.mix(1.0, info.outputs["Color"], N.math("MULTIPLY", bw.outputs[0], 1.5), "MULTIPLY")
    streak = N.new("ShaderNodeTexNoise", Scale=1.0, Detail=4.0)
    sm = N.new("ShaderNodeMapping", Scale=(3.0, 0.12, 1.0))
    N.link(vec.outputs[0], sm.inputs[0])
    N.link(sm.outputs[0], streak.inputs["Vector"])
    col = N.mix(N.math("MULTIPLY", streak.outputs["Factor"], 0.55), col, N.mix(1.0, col, (0.55, 0.55, 0.6, 1), "MULTIPLY"))
    # le pied du mur a bu la pluie : une lisière irrégulière, entre 0,4 et 1 m
    edge = N.new("ShaderNodeTexNoise", Scale=2.5, Detail=3.0)
    N.link(vec.outputs[0], edge.inputs["Vector"])
    lim = N.math("ADD", 0.45, N.math("MULTIPLY", edge.outputs["Factor"], 0.6))
    wet = N.math("SUBTRACT", 1.0, N.math("DIVIDE", N.math("SUBTRACT", xyz[2], lim), 0.25), clamp=True)
    wet = N.math("MINIMUM", N.math("MAXIMUM", wet, 0.0), 1.0)
    col = N.mix(N.math("MULTIPLY", wet, 0.9), col, N.mix(1.0, col, (0.42, 0.4, 0.45, 1), "MULTIPLY"))
    p = principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.mixf(wet, 0.78, 0.28), p.inputs["Roughness"])
    N.link(nmap.outputs[0], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def _cells(N, y, z, ys, cw, zbase, fh, salt):
    xyz_cell = N.new("ShaderNodeCombineXYZ")
    N.link(N.math("FLOOR", N.math("DIVIDE", N.math("SUBTRACT", y, ys), cw)), xyz_cell.inputs[0])
    N.link(N.math("FLOOR", N.math("DIVIDE", N.math("SUBTRACT", z, zbase), fh)), xyz_cell.inputs[1])
    info = N.new("ShaderNodeObjectInfo")
    N.link(N.math("ADD", N.math("MULTIPLY", info.outputs["Random"], 97.0), salt), xyz_cell.inputs[2])
    wn = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="3D")
    N.link(xyz_cell.outputs[0], wn.inputs["Vector"])
    fy = N.math("FRACT", N.math("DIVIDE", N.math("SUBTRACT", y, ys), cw))
    fz = N.math("FRACT", N.math("DIVIDE", N.math("SUBTRACT", z, zbase), fh))
    return wn.outputs["Value"], N.sep(wn.outputs["Color"]), fy, fz


def mat_rooms(key, ys, cw, zbase, gf_h, shops, ys2, cw2):
    """Le fond des chambres et des boutiques : chacune sa lampe, sa chaleur, certaines éteintes.
    Il éclaire pour de vrai l'intérieur (cloisons, dalles) et le trottoir mouillé."""
    m, N, out = material(f"rooms_{key}")
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    y, z = xyz[1], xyz[2]
    r1, rgb, fy, fz = _cells(N, y, z, ys, cw, zbase, FH, 1.0)
    lit = N.math("GREATER_THAN", r1, 0.32)
    warmth = N.ramp(rgb[0], [(0.0, lin("#ff9f45")), (0.45, lin("#ffc47a")), (0.85, lin("#ffe6c0")), (0.94, lin("#c9d2ff"))])
    lamp = N.math("ADD", 0.35, N.math("MULTIPLY", N.math("SUBTRACT", 1.0, fz), 0.9))
    level = N.math("ADD", 0.35, N.math("MULTIPLY", N.math("POWER", rgb[1], 2.0), 2.0))
    room = N.math("MULTIPLY", N.math("MULTIPLY", N.math("MULTIPLY", lit, lamp), level), 7.0)
    gf = N.math("LESS_THAN", z, gf_h)
    if shops:
        s1, srgb, sfy, sfz = _cells(N, y, N.math("MULTIPLY", z, 0.0), ys2, cw2, 0.0, 1.0, 5.0)
        slit = N.math("GREATER_THAN", s1, 0.18)
        scol = N.ramp(srgb[0], [(0.0, lin("#ffb066")), (0.4, lin("#ffd49a")), (0.8, lin("#fff1dc")), (0.93, lin("#dff7e8"))])
        shop = N.math("MULTIPLY", slit, N.math("ADD", 9.0, N.math("MULTIPLY", srgb[1], 10.0)))
        warmth = N.mix(gf, warmth, scol)
        room = N.mixf(gf, room, shop)
    e = N.new("ShaderNodeEmission")
    N.link(warmth, e.inputs["Color"])
    N.link(room, e.inputs["Strength"])
    d = principled(N, **{"Base Color": (0.05, 0.04, 0.035, 1), "Roughness": 0.9})
    add = N.new("ShaderNodeAddShader")
    N.link(e.outputs[0], add.inputs[0])
    N.link(d.outputs[0], add.inputs[1])
    N.link(add.outputs[0], out.inputs[0])
    return m


def mat_curtain(key, ys, cw, zbase, gf_h):
    """Rideaux translucides, tirés d'un côté, des deux, ou pas du tout."""
    m, N, out = material(f"curtain_{key}")
    xyz = N.sep(N.new("ShaderNodeTexCoord").outputs["Object"])
    y, z = xyz[1], xyz[2]
    r1, rgb, fy, fz = _cells(N, y, z, ys, cw, zbase, FH, 1.0)
    left = N.math("LESS_THAN", fy, N.math("MULTIPLY", rgb[1], 0.55))
    right = N.math("GREATER_THAN", fy, N.math("SUBTRACT", 1.0, N.math("MULTIPLY", rgb[2], 0.45)))
    full = N.math("GREATER_THAN", r1, 0.86)
    mask = N.math("MAXIMUM", N.math("MAXIMUM", left, right), full)
    mask = N.math("MULTIPLY", mask, N.math("GREATER_THAN", r1, 0.1))
    mask = N.math("MULTIPLY", mask, N.math("GREATER_THAN", z, gf_h))
    tr = N.new("ShaderNodeBsdfTransparent")
    tl = N.new("ShaderNodeBsdfTranslucent", Color=lin("#f0e2c6"))
    df = N.new("ShaderNodeBsdfDiffuse", Color=lin("#d9c8aa"))
    cloth = N.new("ShaderNodeMixShader")
    N.set(cloth.inputs[0], 0.35)
    N.link(tl.outputs[0], cloth.inputs[1])
    N.link(df.outputs[0], cloth.inputs[2])
    mx = N.new("ShaderNodeMixShader")
    N.link(mask, mx.inputs[0])
    N.link(tr.outputs[0], mx.inputs[1])
    N.link(cloth.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_roof():
    m, N, out = material("roof")
    tc = N.new("ShaderNodeTexCoord").outputs["Object"]
    n = N.new("ShaderNodeTexNoise", Scale=0.35, Detail=6.0)
    N.link(tc, n.inputs["Vector"])
    col = N.ramp(n.outputs["Factor"], [(0.3, lin("#3a3740")), (0.7, lin("#5c5761"))])
    p = principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.ramp(n.outputs["Factor"], [(0.42, (0.12, 0.12, 0.12)), (0.55, (0.75, 0.75, 0.75))]), p.inputs["Roughness"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_shutter():
    m, N, out = material("shutter")
    tc = N.new("ShaderNodeTexCoord").outputs["Object"]
    w = N.new("ShaderNodeTexWave", _wave_type="BANDS", _bands_direction="Z", Scale=9.0, Distortion=0.0)
    N.link(tc, w.inputs["Vector"])
    b = N.new("ShaderNodeBump", Strength=0.6, Distance=0.01)
    N.link(w.outputs["Fac"], b.inputs["Height"])
    p = principled(N, **{"Base Color": lin("#8d8c92"), "Metallic": 0.6, "Roughness": 0.42})
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_parking():
    m, N, out = material("parking")
    tc = N.new("ShaderNodeTexCoord").outputs["Object"]
    xyz = N.sep(tc)
    uv = N.new("ShaderNodeMapping", Scale=(0.25, 0.25, 0.25))
    N.link(tc, uv.inputs[0])
    folder = os.path.join(ASSETS, "asphalt_02")
    diff = image(N, os.path.join(folder, "diff_2k.jpg"), uv.outputs[0])
    stripe = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", xyz[1], 2.7)), 0.045)
    stripe = N.math("MULTIPLY", stripe, N.math("GREATER_THAN", xyz[0], -9.0))
    col = N.mix(stripe, N.mix(1.0, diff.outputs["Color"], (0.35, 0.35, 0.38, 1), "MULTIPLY"), (0.55, 0.55, 0.52, 1))
    p = principled(N)
    N.link(col, p.inputs["Base Color"])
    n = N.new("ShaderNodeTexNoise", Scale=0.3, Detail=4.0)
    N.link(tc, n.inputs["Vector"])
    N.link(N.ramp(n.outputs["Factor"], [(0.45, (0.06, 0.06, 0.06)), (0.6, (0.5, 0.5, 0.5))]), p.inputs["Roughness"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_gutter():
    """L'eau qui court le long de la bordure : un miroir sombre, à peine ridé."""
    m, N, out = material("gutter_water")
    tc = N.new("ShaderNodeTexCoord").outputs["Object"]
    n = N.new("ShaderNodeTexNoise", Scale=6.0, Detail=4.0)
    nm = N.new("ShaderNodeMapping", Scale=(1.0, 0.15, 1.0))
    N.link(tc, nm.inputs[0])
    N.link(nm.outputs[0], n.inputs["Vector"])
    b = N.new("ShaderNodeBump", Strength=0.08, Distance=0.05)
    N.link(n.outputs["Factor"], b.inputs["Height"])
    p = principled(N, **{"Base Color": (0.01, 0.01, 0.012, 1), "Roughness": 0.02})
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def city_mats():
    return {
        "stucco": mat_stucco_obj(),
        "trim": mat_plain("trim_white", lin("#f3efe6"), 0.5),
        "cream": mat_plain("trim_cream", lin("#efe2c4"), 0.5),
        "frame_w": mat_plain("frame_white", lin("#e9e6df"), 0.35, 0.3),
        "frame_b": mat_plain("frame_bronze", lin("#3b302c"), 0.35, 0.7),
        "inside": mat_plain("room_inside", lin("#5a4c44"), 0.9),
        "glass": mat_window_glass(),
        "roof": mat_roof(),
        "shutter": mat_shutter(),
        "metal": mat_plain("street_metal", (0.035, 0.035, 0.04, 1), 0.4, 0.8),
        "sign": mat_plain("sign_blank", lin("#e7e1d3"), 0.55),
        "riser": mat_plain("stall_riser", lin("#2c2a30"), 0.4),
        "glow": mat_emit("canopy_glow", lin("#ffe2b0"), 25.0),
    }


# ---------------------------------------------------------------- la ville : géométrie

def add_hex(B, v8, mat):
    """Un pavé quelconque (huit sommets, dessous puis dessus, dans l'ordre de Boxes.add)."""
    idx = B._mi(mat)
    vs = [B.bm.verts.new(v) for v in v8]
    for f in [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]:
        B.bm.faces.new([vs[i] for i in f]).material_index = idx


def balcony(B, M, xo, ya, yb, zf, depth, rail):
    """Dalle et garde-corps marin à trois lisses, poteaux tous les mètres environ."""
    B.add(xo, xo + depth, ya - 0.1, yb + 0.1, zf - 0.18, zf + 0.02, M["trim"])
    xr = xo + depth - 0.07
    for zr in (0.38, 0.68, 1.0):
        B.add(xr - 0.025, xr + 0.025, ya - 0.06, yb + 0.06, zf + zr - 0.025, zf + zr + 0.025, rail)
        for ye in (ya - 0.06, yb + 0.06):
            B.add(xo, xr, ye - 0.02, ye + 0.02, zf + zr - 0.02, zf + zr + 0.02, rail)
    n = max(1, int((yb - ya) / 1.1))
    for k in range(n + 1):
        yk = ya - 0.06 + (yb - ya + 0.12) * k / n
        B.add(xr - 0.03, xr + 0.03, yk - 0.03, yk + 0.03, zf, zf + 1.02, rail)


def window_row(B, M, S, xo, ya, yb, n, zf, balc, doors=()):
    """Un étage : trumeaux et allèges en stuc, fenêtres en retrait de 30 cm dans leur cadre
    (montants, meneau, imposte), vitre, rideau, et derrière, la pièce (dalle, cloisons)."""
    cw = (yb - ya) / n
    p = S["pier"]
    st = M["stucco"]
    fm = M[S["frame"]]
    sill, wh = S["sill"], S["wh"]
    top = zf + sill + wh
    B.add(xo - RD, xo - 0.35, ya, yb, zf, zf + 0.22, M["inside"])
    for k in range(n + 1):
        yk = ya + k * cw
        B.add(xo - RD, xo - 0.35, max(ya, yk - 0.08), min(yb, yk + 0.08), zf, zf + FH, M["inside"])
        B.add(xo - 0.35, xo, max(ya, yk - p / 2), min(yb, yk + p / 2), zf, zf + FH, st)
    B.add(xo - 0.35, xo, ya, yb, top, zf + FH, st)
    for k in range(n):
        y0, y1 = ya + k * cw + p / 2, ya + (k + 1) * cw - p / 2
        door = k in balc or k in doors
        sl = 0.06 if door else sill
        if not door:
            B.add(xo - 0.35, xo, y0, y1, zf, zf + sill, st)
            B.add(xo, xo + 0.08, y0 - 0.06, y1 + 0.06, zf + sill - 0.08, zf + sill, M["trim"])
        z0 = zf + sl
        B.add(xo - 0.34, xo - 0.26, y0, y1, z0, z0 + 0.06, fm)
        B.add(xo - 0.34, xo - 0.26, y0, y1, top - 0.06, top, fm)
        B.add(xo - 0.34, xo - 0.26, y0, y0 + 0.06, z0, top, fm)
        B.add(xo - 0.34, xo - 0.26, y1 - 0.06, y1, z0, top, fm)
        if y1 - y0 > 1.3:
            ym = (y0 + y1) / 2
            B.add(xo - 0.34, xo - 0.26, ym - 0.03, ym + 0.03, z0, top, fm)
        zt = top - 0.45
        B.add(xo - 0.34, xo - 0.26, y0, y1, zt - 0.025, zt + 0.025, fm)
        if k in balc:
            balcony(B, M, xo, y0 - p / 2 + 0.1, y1 + p / 2 - 0.1, zf, S["balc_d"], M[S["rail"]])
        elif S.get("ac") and random.random() < S["ac"]:
            S["props"].append(("ac", (xo + 0.25, (y0 + y1) / 2 + random.uniform(-0.3, 0.3), zf + 0.15), math.pi / 2, 1.0))
    B.add(xo - 0.305, xo - 0.295, ya, yb, zf + 0.05, top, M["glass"])
    B.add(xo - 0.5, xo - 0.49, ya, yb, zf + 0.25, top, S["curtain"])
    if S.get("eyebrow"):
        B.add(xo, xo + 0.6, ya, yb, top + 0.06, top + 0.16, M["trim"])


def shopfronts(B, M, S, xo, ya, yb, n, gf_h):
    """Rez-de-chaussée de boutiques : vitrines sur soubassement, bandeau d'enseigne laissé vierge,
    stores rayés penchés, rideaux de fer baissés sur quelques-unes, comptoirs en ombre chinoise."""
    cw = (yb - ya) / n
    st = M["stucco"]
    fm = M[S["frame"]]
    B.add(xo - RD, xo - 0.3, ya, yb, 0.0, 0.3, M["inside"])
    B.add(xo - RD, xo - 0.3, ya, yb, gf_h - 0.35, gf_h, M["inside"])
    lobby = S.get("lobby_bay")
    for k in range(n):
        B.add(xo - 0.3, xo, ya + k * cw, ya + (k + 1) * cw, gf_h - 0.15 if k == lobby else 3.15, gf_h, st)
    for k in range(n + 1):
        yk = ya + k * cw
        B.add(xo - 0.3, xo, max(ya, yk - 0.3), min(yb, yk + 0.3), 0, 3.15, st)
        B.add(xo - RD, xo - 0.3, max(ya, yk - 0.08), min(yb, yk + 0.08), 0, gf_h, M["inside"])
    for k in range(n):
        y0, y1 = ya + k * cw + 0.3, ya + (k + 1) * cw - 0.3
        if k == lobby:
            continue
        B.add(xo - 0.28, xo - 0.02, y0, y1, 0, 0.55, M["riser"])
        B.add(xo - 0.27, xo - 0.26, y0, y1, 0.55, 3.15, M["glass"])
        for zz in (0.55, 3.09):
            B.add(xo - 0.29, xo - 0.22, y0, y1, zz, zz + 0.06, fm)
        B.add(xo - 0.29, xo - 0.22, y0 + 0.9, y0 + 0.96, 0.55, 3.15, fm)
        B.add(xo - 0.29, xo - 0.22, y0 + 0.9, y1, 2.45, 2.5, fm)
        if random.random() < 0.22:
            B.add(xo - 0.2, xo - 0.13, y0, y1, 0.55, 3.15, M["shutter"])
        else:
            yc = random.uniform(y0 + 0.5, y1 - 1.5)
            B.add(xo - 2.8, xo - 2.0, yc, yc + random.uniform(0.8, 1.8), 0.3, 1.25, M["inside"])
            B.add(xo - RD + 0.05, xo - RD + 0.5, y0 + 0.2, y1 - 0.2, 0.3, random.uniform(1.6, 2.4), M["inside"])
            S["lights"].append(("shop", (xo + 0.6, (y0 + y1) / 2, 1.8), y1 - y0))
        if S.get("awning") and random.random() < 0.7:
            am = S["awning"][k % len(S["awning"])]
            lo, hi, dz = 3.2, 2.55, 0.05
            add_hex(B, [(xo, y0 - 0.1, lo), (xo + 1.6, y0 - 0.1, hi), (xo, y1 + 0.1, lo), (xo + 1.6, y1 + 0.1, hi),
                        (xo, y0 - 0.1, lo + dz), (xo + 1.6, y0 - 0.1, hi + dz), (xo, y1 + 0.1, lo + dz), (xo + 1.6, y1 + 0.1, hi + dz)], am)
            B.add(xo + 1.58, xo + 1.62, y0 - 0.1, y1 + 0.1, hi - 0.28, hi + 0.03, am)
        elif random.random() < 0.5:
            B.add(xo, xo + 0.06, y0 + 0.2, y1 - 0.2, 3.35, 3.95, M["sign"])
    if lobby is not None:
        y0, y1 = ya + lobby * cw + 0.3, ya + (lobby + 1) * cw - 0.3
        entrance(B, M, S, xo, y0, y1, gf_h)


def entrance(B, M, S, xo, y0, y1, gf_h):
    """L'entrée de l'hôtel, plus haute que les vitrines : verrière quadrillée jusqu'au plafond,
    pilastres à gradins, marquise blanche éclairée par-dessous."""
    fm = M[S["frame"]]
    B.add(xo - 0.27, xo - 0.26, y0, y1, 0.3, gf_h - 0.15, M["glass"])
    nv = max(2, int((y1 - y0) / 0.9))
    for k in range(nv + 1):
        yk = y0 + (y1 - y0) * k / nv
        B.add(xo - 0.3, xo - 0.22, yk - 0.03, yk + 0.03, 0.3, gf_h - 0.15, fm)
    for zz in (0.3, 2.4, gf_h - 0.21):
        B.add(xo - 0.3, xo - 0.22, y0, y1, zz, zz + 0.06, fm)
    for ys in (y0 - 0.45, y1):
        B.add(xo, xo + 0.25, ys, ys + 0.45, 0.15, gf_h + 1.0, M["trim"])
        B.add(xo, xo + 0.15, ys + 0.08, ys + 0.37, gf_h + 1.0, gf_h + 1.6, M["trim"])
    B.add(xo, xo + 3.0, y0 - 0.2, y1 + 0.2, 3.35, 3.6, M["trim"])
    B.add(xo + 2.9, xo + 3.0, y0 - 0.2, y1 + 0.2, 3.2, 3.6, M["trim"])
    for k in range(3):
        yk = y0 + (y1 - y0) * (k + 0.5) / 3
        B.add(xo + 0.8, xo + 2.2, yk - 0.06, yk + 0.06, 3.33, 3.35, M["glow"])
    S["lights"].append(("canopy", (xo + 1.6, (y0 + y1) / 2, 3.25), y1 - y0))


def roof_props(B, M, S, x0, x1, ya, yb, top):
    st = M["stucco"]
    if S.get("stair"):
        xs = x0 + 2.0
        ys = ya + (yb - ya) * random.uniform(0.55, 0.75)
        B.add(xs, xs + 3.2, ys, ys + 2.6, top, top + 2.7, st)
        B.add(xs - 0.2, xs + 3.4, ys - 0.2, ys + 2.8, top + 2.7, top + 2.85, M["trim"])
        B.add(xs + 3.2, xs + 3.25, ys + 0.8, ys + 1.8, top, top + 2.1, M["riser"])
    for k in range(S.get("vents", 0)):
        xv, yv = random.uniform(x0 + 1.5, x1 - 2.5), random.uniform(ya + 1, yb - 1)
        B.add(xv, xv + 0.5, yv, yv + 0.5, top, top + random.uniform(0.6, 1.2), M["metal"])
    for k in range(S.get("ac_roof", 0)):
        S["props"].append(("ac", (random.uniform(x0 + 2.0, x1 - 3.0), random.uniform(ya + 1.5, yb - 1.5), top),
                           random.choice((0, math.pi / 2, math.pi)), random.uniform(1.6, 2.0)))
    if S.get("tank"):
        S["props"].append(("tank", (x0 + 4.5, ya + (yb - ya) * random.uniform(0.2, 0.4), top), random.uniform(0, 6), 0.0065))
    if S.get("roof_sign"):
        # le cadre d'enseigne sur le toit, tourné vers l'avenue, panneau laissé vierge
        L = min(10.0, (yb - ya) * 0.6)
        yc = ya + (yb - ya) * random.uniform(0.35, 0.65)
        sy0, sy1 = yc - L / 2, yc + L / 2
        xs = x1 - 2.4
        z0, z1 = top + 1.6, top + 1.6 + S["roof_sign"]
        B.add(xs, xs + 0.12, sy0, sy1, z0, z1, M["sign"])
        for zz in (z0 - 0.1, z1):
            B.add(xs - 0.05, xs + 0.17, sy0 - 0.1, sy1 + 0.1, zz, zz + 0.1, M["metal"])
        for ye in (sy0 - 0.1, sy1):
            B.add(xs - 0.05, xs + 0.17, ye, ye + 0.1, z0, z1, M["metal"])
        n = int(L / 2.0) + 1
        for k in range(n):
            yk = sy0 + (L - 0.12) * k / max(1, n - 1)
            B.add(xs - 0.9, xs - 0.78, yk, yk + 0.12, top, z1, M["metal"])
            B.add(xs - 0.9, xs, yk, yk + 0.08, top + 0.8, top + 0.88, M["metal"])
        S["lights"].append(("wash", (xs + 1.5, yc, top + 0.3), L))


def blade(B, M, S, yc, z0, z1):
    """Enseigne verticale en drapeau, perpendiculaire à la façade, laissée vierge."""
    B.add(0, 1.2, yc - 0.14, yc + 0.14, z0, z1, M["trim"])
    B.add(0.15, 1.05, yc - 0.17, yc + 0.17, z0 + 0.35, z1 - 0.35, M["sign"])
    B.add(0, 0.5, yc - 0.1, yc + 0.1, z1, z1 + 1.2, M["trim"])
    S["lights"].append(("blade", (1.4, yc, z0 - 0.3), z1 - z0))


def make_building(key, M, spec):
    """Un immeuble, dans son repère : façade en x = 0 tournée vers +x (l'avenue), emprise
    y de 0 à W, profondeur vers −x. Rend (objet, accessoires, lumières), à instancier."""
    S = dict(pier=0.5, sill=0.9, wh=1.6, frame="frame_w", rail="trim", balc_d=1.3, gf_h=4.2, gf="shops",
             nshops=4, floors=4, r=3.0, ct=4.5, round_near=False, round_far=False)
    S.update(spec)
    S["props"], S["lights"] = [], []
    W, Dp, gf_h, nfl = S["W"], S["D"], S["gf_h"], S["floors"]
    tops = gf_h + (nfl - 1) * FH
    ya = S["ct"] if S["round_near"] else 0.3
    yb = W - S["ct"] if S["round_far"] else W - 0.3
    ncol = S.get("ncol") or max(2, round((yb - ya) / S.get("bay", 3.0)))
    zbase = gf_h - FH
    S["curtain"] = mat_curtain(key, ya, (yb - ya) / ncol, zbase, gf_h)
    rooms = mat_rooms(key, ya, (yb - ya) / ncol, zbase, gf_h, S["gf"] == "shops", ya, (yb - ya) / S["nshops"])
    B = Boxes(f"bld_{key}")
    st = M["stucco"]
    sb_n, sb = S.get("setback", (0, 0.0))
    main_top = gf_h + (nfl - 1 - sb_n) * FH
    # le corps, derrière les pièces ; sa face avant est le fond des pièces
    B.add(-Dp, -RD, ya, yb, 0, main_top, st, front_mat=rooms)
    if sb_n:
        B.add(-Dp, -sb - RD, ya, yb, main_top, tops, st, front_mat=rooms)
    if not S["round_near"]:
        B.add(-Dp, 0, 0, 0.3, 0, main_top, st)
    if not S["round_far"]:
        B.add(-Dp, 0, W - 0.3, W, 0, main_top, st)
    # rez-de-chaussée
    if S["gf"] == "shops":
        shopfronts(B, M, S, 0.0, ya, yb, S["nshops"], gf_h)
    else:
        if gf_h - FH > 0.05:
            B.add(-0.35, 0, ya, yb, 0, gf_h - FH, st)
        gS = dict(S, sill=S["sill"] + 0.25)
        window_row(B, M, gS, 0.0, ya, yb, ncol, gf_h - FH, (), doors=S.get("doors", ()))
    # étages
    for f in range(1, nfl):
        zf = gf_h + (f - 1) * FH
        xo = -sb if f >= nfl - sb_n else 0.0
        bal = S.get("balc", "none")
        if bal == "all":
            bays = set(range(ncol))
        elif bal == "alt":
            bays = set(range(f % 2, ncol, 2))
        elif bal == "ends":
            bays = {0, ncol - 1}
        else:
            bays = set()
        if S.get("gallery") and f == 1:
            bays = set()
        window_row(B, M, S, xo, ya, yb, ncol, zf, bays, doors=S.get("doors", ()) if S.get("gallery") else ())
        if S.get("bands"):
            B.add(xo, xo + 0.12, ya, yb, zf - 0.12, zf + 0.0, M["trim"])
    # coursive de motel : la galerie de l'étage, ses poteaux, l'avancée du toit
    if S.get("gallery"):
        zf = gf_h
        B.add(0, 2.0, ya, yb, zf - 0.22, zf, M["trim"])
        for zr in (0.45, 0.95):
            B.add(1.92, 1.97, ya, yb, zf + zr - 0.03, zf + zr + 0.03, M[S["rail"]])
        for k in range(int((yb - ya) / 1.2) + 1):
            yk = ya + k * 1.2
            B.add(1.92, 1.97, yk, yk + 0.04, zf, zf + 0.98, M[S["rail"]])
        for k in range(int((yb - ya) / 4.0) + 1):
            yk = ya + k * 4.0
            B.add(1.82, 1.98, yk, yk + 0.16, 0, tops + 0.1, M[S["rail"]])
        B.add(0, 2.4, ya - 0.2, yb + 0.2, tops, tops + 0.35, M["trim"])
        add_hex(B, [(1.2, yb + 0.1, 0.15), (2.4, yb + 0.1, 0.15), (1.2, yb + 1.3, 0.15), (2.4, yb + 1.3, 0.15),
                    (1.2, yb - 3.6, zf), (2.4, yb - 3.6, zf), (1.2, yb - 2.4, zf), (2.4, yb - 2.4, zf)], M["trim"])
    # tours d'angle arrondies, en stuc plein, filets horizontaux qui en font le tour
    tower_obs = []
    for near in ([True] if S["round_near"] else []) + ([False] if S["round_far"] else []):
        yy0, yy1 = (0, ya) if near else (yb, W)
        fp = rounded_footprint(-Dp, 0, yy0, yy1, S["r"], near=near, far=not near)
        tower_obs.append(prism(f"bld_{key}_tower{int(near)}", fp, 0, main_top + 0.9, st))
        g = 0.6 if S.get("eyebrow") else 0.14
        levels = [gf_h + (f - 1) * FH + S["sill"] + S["wh"] + 0.06 for f in range(1, nfl - sb_n)] + [3.25]
        for j, zz in enumerate(levels):
            fpb = rounded_footprint(-Dp, 0, yy0, yy1, S["r"], grow=g, near=near, far=not near)
            tower_obs.append(prism(f"bld_{key}_band{int(near)}_{j}", fpb, zz, zz + 0.1, M["trim"]))
    # toit : dalle, acrotère, gradins au milieu, corniche
    B.add(-Dp, 0, 0, W, main_top - 0.2, main_top, M["roof"], front_mat=st)
    B.add(-0.3, 0, ya, yb, main_top, main_top + 0.9, st)
    B.add(-Dp, -Dp + 0.3, 0, W, main_top, main_top + 0.9, st)
    B.add(-Dp, 0, 0, 0.3, main_top, main_top + 0.9, st)
    B.add(-Dp, 0, W - 0.3, W, main_top, main_top + 0.9, st)
    B.add(0, 0.22, ya, yb, main_top + 0.7, main_top + 0.9, M[S.get("cornice", "trim")])
    if sb_n:
        B.add(-Dp + 0.3, -sb, 0.3, W - 0.3, tops - 0.2, tops, M["roof"], front_mat=st)
        B.add(-sb - 0.3, -sb, ya, yb, tops, tops + 0.9, st)
        B.add(-sb, -sb + 0.2, ya, yb, tops + 0.7, tops + 0.9, M["trim"])
        for zr in (0.5, 1.0):
            B.add(-0.12, -0.06, ya, yb, main_top + 0.9 + zr - 0.03, main_top + 0.9 + zr + 0.03, M[S["rail"]])
    if S.get("step"):
        yc = W / 2
        B.add(-0.4, 0, yc - 3.2, yc + 3.2, main_top + 0.9, main_top + 2.0, st)
        B.add(-0.4, 0, yc - 1.6, yc + 1.6, main_top + 2.0, main_top + 3.0, st)
        B.add(0, 0.2, yc - 3.2, yc + 3.2, main_top + 1.85, main_top + 2.0, M["trim"])
    roof_props(B, M, S, -Dp, -sb if sb_n else 0.0, 0.3, W - 0.3, tops if sb_n else main_top)
    if S.get("blade"):
        blade(B, M, S, S["blade"] * W, gf_h + 0.6, main_top + 2.5)
    ob = B.done()
    if tower_obs:
        ob = join([ob] + tower_obs, f"bld_{key}")
    return ob, S["props"], S["lights"]



# ---------------------------------------------------------------- la ville : la rue

SIDE_STREETS = [(120.0, 134.0), (266.0, 280.0), (452.0, 466.0)]


def in_street(y, m=2.0):
    return any(a - m <= y <= b + m for a, b in SIDE_STREETS)


def segments(y0, y1):
    """Les tronçons de trottoir entre les rues transversales."""
    out, y = [], y0
    for a, b in SIDE_STREETS:
        out.append((y, a))
        y = b
    out.append((y, y1))
    return out


def cyl(name, p0, p1, r, mat, seg=12):
    p0, p1 = Vector(p0), Vector(p1)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=(p1 - p0).length)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    ob.location = (p0 + p1) / 2
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (p1 - p0).to_track_quat("Z", "Y")
    return ob


def add_light(name, kind, loc, direction, color, energy, size=(1.0, 1.0), spot=60.0):
    L = bpy.data.lights.new(name, kind)
    L.energy = energy
    L.color = color[:3]
    if kind == "AREA":
        L.shape = "RECTANGLE"
        L.size, L.size_y = size
    elif kind == "SPOT":
        L.spot_size = math.radians(spot)
        L.spot_blend = 0.7
        L.shadow_soft_size = 0.08
    ob = bpy.data.objects.new(name, L)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector(direction).normalized().to_track_quat("-Z", "Y")
    return ob


def source(objs, name, hidden):
    ob = join(objs, name)
    recentre(ob)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    hidden.objects.link(ob)
    return ob


def parasol(name, x, y, canvas, metal, light=True, r=1.35):
    """Un parasol de terrasse : mât, toile à huit pans un peu creusée, lampe chaude dessous."""
    cyl(f"{name}_pole", (x, y, 0.15), (x, y, 2.55), 0.025, metal, seg=8)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    apex = bm.verts.new((0, 0, 0.42))
    rim = [bm.verts.new((r * math.cos(a), r * math.sin(a), 0.0)) for a in (i * math.tau / 8 for i in range(8))]
    mid = [bm.verts.new((0.55 * r * math.cos(a), 0.55 * r * math.sin(a), 0.26)) for a in ((i + 0.5) * math.tau / 8 for i in range(8))]
    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new((apex, rim[i], mid[i]))
        bm.faces.new((apex, mid[i], rim[j]))
        bm.faces.new((mid[i], rim[i], rim[j]))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(canvas)
    ob.location = (x, y, 2.2)
    ob.rotation_euler = (0, 0, random.uniform(0, 1))
    if light:
        add_light(f"{name}_lamp", "POINT", (x, y, 2.05), (0, 0, -1), lin("#ffc890"), 60.0)
    return ob


def parked_wagon_source(hidden, length=4.9):
    """La fourgonnette garée (modèle de bibliothèque, sans logo) : l'axe long sur y, 4,9 m, phares
    éteints, plaque vierge, la caisse prend la couleur de chaque instance (Object Info)."""
    ob = source(import_glb("parked-wagon.glb"), "wagon_src", hidden)
    d = ob.dimensions.copy()
    if d.x > d.y:
        ob.data.transform(__import__("mathutils").Matrix.Rotation(math.pi / 2, 4, "Z"))
    s = length / max(d.x, d.y)
    ob.data.transform(__import__("mathutils").Matrix.Scale(s, 4))
    recentre(ob)
    plate = mat_plain("plate_blank", lin("#d8d4c8"), 0.5)
    for i, m in enumerate(ob.data.materials):
        if m is None:
            continue
        if m.name.startswith("LicensePlate"):
            ob.data.materials[i] = plate
            continue
        if not m.use_nodes:
            continue
        nt = m.node_tree
        for n in nt.nodes:
            if n.type == "BSDF_PRINCIPLED":
                if m.name.startswith("Emission"):
                    n.inputs["Emission Strength"].default_value = 0.0
                if m.name.startswith("Car_paint"):
                    info = nt.nodes.new("ShaderNodeObjectInfo")
                    nt.links.new(info.outputs["Color"], n.inputs["Base Color"])
                    n.inputs["Coat Weight"].default_value = 0.6
                    n.inputs["Coat Roughness"].default_value = 0.03
    return ob


def parked_cars(hidden):
    """Quelques voitures garées : contre le trottoir de la promenade (hors du plan de profil, y 45 à 80)
    et sur le parking du motel. Une seule source, instanciée, teintes sourdes des années 80."""
    src = parked_wagon_source(hidden)
    tints = ["#5a2633", "#2b4756", "#b9a47c", "#34343a", "#7b6a58", "#3f5a3e"]
    spots = [(ROAD_HALF - 1.15, 33.0, 0.0), (ROAD_HALF - 1.15, 104.0, 0.0), (ROAD_HALF - 1.15, 131.0, math.pi),
             (ROAD_HALF - 1.15, 210.0, 0.0), (FRONT_X - 4.0, 166.0, math.pi / 2), (FRONT_X - 4.0, 172.5, math.pi / 2 + 0.05)]
    for k, (x, y, rz) in enumerate(spots):
        inst = instance(src, f"parked_{k}", (x, y, 0.16 if x < 0 else 0.0), rz)
        inst.color = (*lin(tints[k % len(tints)])[:3], 1)


def wires(name, spans, mat, sag=0.6, r=0.012):
    """Des fils qui pendent (chaînette approchée par une parabole), tous dans une courbe."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 1
    for a, b in spans:
        a, b = Vector(a), Vector(b)
        sp = cu.splines.new("POLY")
        n = 16
        sp.points.add(n)
        for i in range(n + 1):
            t = i / n
            p = a.lerp(b, t)
            p.z -= sag * 4 * t * (1 - t) * max(0.3, (b - a).length / 30)
            sp.points[i].co = (p.x, p.y, p.z, 1)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    cu.materials.append(mat)
    return ob


def _maker():
    mod = facade_module()
    if mod is None:
        return make_building
    me = sys.modules[__name__]
    return lambda key, M, spec: mod.make_building(me, key, M, spec)


def prototypes(M):
    specs = building_specs()
    make = _maker()
    return {k: make(k, M, v) + (v,) for k, v in specs.items()}


def prototypes_one(M, key):
    """Un seul des huit dessins (le banc d'essai) : (objet, accessoires, lumières, spec)."""
    v = building_specs()[key]
    return _maker()(key, M, v) + (v,)


def building_specs():
    awn = [mat_awning(c, f"awning_{i}") for i, c in enumerate([CORAL, "#2f6f6a", "#3a4a8a", "#b84a62", "#c79a3a"])]
    specs = {
        # Art déco d'angle : tour arrondie, sourcils filants, drapeau vierge, gradins au faîte
        "deco": dict(W=26, D=16, floors=4, nshops=4, round_near=True, eyebrow=True, balc="ends", blade=0.1,
                     step=True, ac_roof=3, stair=True, vents=3, awning=[awn[0], awn[1]], uplight=True),
        # petit hôtel : entrée haute à marquise, balcons alternés, climatiseurs aux fenêtres
        "hotel": dict(W=22, D=15, floors=3, nshops=3, lobby_bay=1, step=True, eyebrow=True, balc="alt", bay=2.7,
                      ac=0.25, ac_roof=2, tank=True, frame="frame_b", awning=[awn[3]], uplight=True, blade=0.86),
        # boutique d'angle, deux niveaux, cadre d'enseigne sur le toit
        "shop": dict(W=14, D=12, floors=2, nshops=3, round_far=True, r=2.5, ct=3.5, roof_sign=3.0, ac_roof=2,
                     vents=2, awning=[awn[4], awn[2]], ac=0.3),
        # paquebot : les deux angles arrondis, balcons filants à lisses marines
        "liner": dict(W=30, D=16, floors=4, nshops=5, lobby_bay=2, round_near=True, round_far=True, eyebrow=True,
                      balc="all", rail="frame_w", ac_roof=4, tank=True, awning=[awn[1]]),
        # immeuble d'appartements, balcons empilés, soubassement
        "flats": dict(W=22, D=14, floors=5, gf="rooms", balc="all", frame="frame_b", rail="frame_b", bay=2.75,
                      ac=0.3, ac_roof=3, stair=True, bands=True),
        # motel des années 50 : coursive, portes, climatiseurs de fenêtre, en retrait derrière son parking
        "motel": dict(W=34, D=11, floors=2, gf="rooms", gf_h=FH, gallery=True, ncol=10, doors=set(range(0, 10, 2)),
                      sill=1.0, wh=1.2, ac=0.5, vents=4, rail="frame_w"),
        # la tour en gradins : deux étages en retrait, angle arrondi, réservoir
        "tower": dict(W=28, D=18, floors=7, nshops=4, lobby_bay=1, setback=(2, 4.0), round_far=True, balc="alt",
                      bands=True, tank=True, ac_roof=4, stair=True, awning=[awn[2]]),
        # le bloc bas en longueur, fenêtres en bandeau, enseigne de toit
        "block": dict(W=36, D=16, floors=4, nshops=6, round_near=True, round_far=True, bay=4.2, wh=1.5,
                      eyebrow=True, roof_sign=3.5, ac_roof=5, vents=4, awning=[awn[0], awn[4]], uplight=True),
    }
    return specs


def base_street(M, conc, road_m, kerb, paint, side_asphalt):
    """La rue d'origine : des boîtes, un enrobé unique (FILM3D_ROUTE=base)."""
    box("road", -ROAD_HALF, ROAD_HALF, -30, 900, -0.05, 0.0, road_m)
    for i, (a, b) in enumerate(segments(-30, 900)):
        box(f"walk_left_{i}", FRONT_X, -ROAD_HALF - 0.2, a, b, -0.05, 0.15, conc)
        box(f"kerb_left_{i}", -ROAD_HALF - 0.2, -ROAD_HALF, a, b, -0.05, 0.16, kerb)
        box(f"block_left_{i}", -200, FRONT_X, a, b, -0.05, 0.15, conc)
    for i, (a, b) in enumerate(SIDE_STREETS):
        box(f"side_street_{i}", -200, -ROAD_HALF, a, b, -0.05, 0.0, side_asphalt)
        for k in range(14):
            x = -ROAD_HALF + 0.6 + k * 0.98
            box(f"zebra_{i}_{k}", x, x + 0.5, a - 4.0, a - 0.8, 0.0, 0.004, paint)
        box(f"stop_{i}", -ROAD_HALF, -0.2, b + 0.5, b + 0.9, 0.0, 0.004, paint)
    box("walk_right", ROAD_HALF + 0.2, ROAD_HALF + WALK, -30, 900, -0.05, 0.15, conc)
    box("kerb_right", ROAD_HALF, ROAD_HALF + 0.2, -30, 900, -0.05, 0.16, kerb)
    gw = mat_gutter()
    box("gutter_left", -ROAD_HALF, -ROAD_HALF + 0.5, -30, 900, -0.05, 0.003, gw)
    box("gutter_right", ROAD_HALF - 0.5, ROAD_HALF, -30, 900, -0.05, 0.003, gw)
    y = 8.0
    while y < 600:
        if not in_street(y):
            box(f"drain_l_{int(y)}", -ROAD_HALF + 0.02, -ROAD_HALF + 0.45, y, y + 0.9, 0.0, 0.005, M["metal"])
            box(f"drain_r_{int(y)}", ROAD_HALF - 0.45, ROAD_HALF - 0.02, y + 11, y + 11.9, 0.0, 0.005, M["metal"])
        y += 24.0


def build_city(hidden):
    M = city_mats()
    conc = mat_concrete()
    road_m = mat_road()
    kerb = mat_plain("kerb", lin("#9a948c"), 0.45)
    paint = mat_plain("paint_white", lin("#d9d5cc"), 0.55)
    green = mat_plain("sign_green", lin("#1f4a3a"), 0.45)
    wood = mat_plain("pole_wood", lin("#3a2c24"), 0.8)
    side_asphalt = mat_plain("side_asphalt", lin("#262428"), 0.25)

    # --- la route, les trottoirs, la plage, la mer
    if ROUTE != "base":
        # la chaussée bombée, le caniveau, la bordure, les dalles, les regards (tools/film3d/road.py)
        import road
        road.build_street(sys.modules[__name__], M, ROUTE)
    else:
        base_street(M, conc, road_m, kerb, paint, side_asphalt)
    wall = mat_plain("sea_wall", lin("#d9d2c4"), 0.6)

    box("sea_wall", ROAD_HALF + WALK, ROAD_HALF + WALK + 0.35, -30, 900, 0.0, 0.85, wall)
    box("sea_wall_cap", ROAD_HALF + WALK - 0.08, ROAD_HALF + WALK + 0.45, -30, 900, 0.85, 0.95, M["trim"])
    sand = mat_plain("wet_sand", lin("#3a332d"), 0.3)
    box("beach", ROAD_HALF + WALK, 34, -30, 1200, -1.6, -1.5, sand)
    box("sea", 34, 3000, -400, 4000, -1.7, -1.6, mat_sea())
    box("sea_far", -3000, 3000, 900, 4000, -1.75, -1.65, bpy.data.materials["sea"])

    # --- les immeubles : huit dessins, instanciés, chacun sa couleur
    P = prototypes(M)
    protos = {}
    for k, (ob, props, lights, spec) in P.items():
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        hidden.objects.link(ob)
        protos[k] = (ob, props, lights, spec)
    ac_parts = import_glb("exterior_aircon_unit/exterior_aircon_unit.gltf")
    ac_src = [source([o], f"ac_src_{i}", hidden) for i, o in enumerate(ac_parts)]
    tank_src = source(import_glb("water-tank.glb"), "tank_src", hidden)
    pastels = ["#f2c6cf", "#bfe3d6", "#f4e6b8", "#f6efe0", "#c8dcef", "#f6d2b0", "#d8cdf0", "#e3efd0", "#f7d9e6"]
    count = [0]

    def place(kind, x, y0, tint, lights=True, mirror=False, props=True):
        ob, props, lts, spec = protos[kind]
        n = count[0]
        count[0] += 1
        inst = instance(ob, f"{ob.name}_{n}", (x, y0, 0))
        inst.color = (*lin(tint)[:3], 1)
        sx = -1 if mirror else 1
        if mirror:
            inst.scale.x = -1
            return
        if not props:
            return
        for j, (pk, (px, py, pz), rot, s) in enumerate(props):
            # ac, tank, ou le nom d'un objet source caché fourni par le module de façades
            src = random.choice(ac_src) if pk == "ac" else tank_src if pk == "tank" else bpy.data.objects[pk]
            instance(src, f"{pk}_{n}_{j}", (x + sx * px, y0 + py, pz), rot, s)
        if not lights:
            return
        warm = lin("#ffd9a8")
        for j, (lk, (lx, ly, lz), w) in enumerate(lts):
            loc = (x + lx, y0 + ly, lz)
            if lk == "shop":
                add_light(f"shop_{n}_{j}", "AREA", loc, (1, 0, -0.35), lin("#ffcf96"), 90.0 * w / 3, (w, 2.2))
            elif lk == "canopy":
                add_light(f"canopy_{n}_{j}", "AREA", loc, (0.2, 0, -1), warm, 260.0, (w, 2.2))
            elif lk == "wash":
                add_light(f"wash_{n}_{j}", "SPOT", loc, (-1.5, 0, 2.2), warm, 1800.0, spot=75)
            elif lk == "blade":
                add_light(f"blade_{n}_{j}", "SPOT", loc, (-0.35, 0, 1), warm, 900.0, spot=28)
            elif lk == "light":
                # lumière libre d'un module de façades : w = dict(kind, direction, color (sRGB), energy, size, spot)
                L = dict(kind="POINT", direction=(0, 0, -1), color="#ffd9a8", energy=100.0, size=(0.2, 0.2), spot=60.0)
                L.update(w)
                lo = add_light(f"fl_{n}_{j}", L["kind"], loc, L["direction"], lin(L["color"]), L["energy"], L["size"], L["spot"])
                if L.get("hide"):
                    # invisible à la caméra et dans les reflets : une source douce sans tache dans l'image
                    lo.visible_camera = lo.visible_glossy = lo.visible_transmission = False
        if spec.get("own_uplights"):
            return
        # les façades éclairées du pied : toutes près de la caméra, plus fort sur quelques-unes
        yy = 1.5
        power = 700.0 if spec.get("uplight") else 380.0
        zl = spec.get("gf_h", 4.2) + 0.1 if spec.get("gf", "shops") == "shops" else 0.2
        while yy < spec["W"] - 1:
            add_light(f"up_{n}_{int(yy)}", "SPOT", (x + 0.45, y0 + yy, zl), (-0.16, 0, 1), lin("#ffe2bf"), power, spot=60)
            yy += 4.0

    # côté ville, de près : chaque dessin une fois, puis une suite tirée au sort
    seq = [("deco", 20), ("hotel", 48), ("shop", 72), ("liner", 88), ("flats", 136), ("motel", 160),
           ("tower", 196), ("block", 226)]
    for i, (k, y0) in enumerate(seq):
        x = FRONT_X - (14.0 if k == "motel" else 0.0)
        place(k, x, y0, pastels[i % len(pastels)])
    box("motel_lot", FRONT_X - 14.0, FRONT_X, 158.0, 196.0, 0.0, 0.16, mat_parking())
    # le mât d'enseigne du motel, panneau vierge, éclairé du pied
    cyl("motel_mast", (FRONT_X - 1.5, 160.5, 0.15), (FRONT_X - 1.5, 160.5, 9.5), 0.18, M["metal"])
    box("motel_sign", FRONT_X - 1.7, FRONT_X - 1.3, 158.2, 162.8, 6.0, 9.2, M["sign"])
    box("motel_sign_rim", FRONT_X - 1.75, FRONT_X - 1.25, 158.1, 162.9, 9.2, 9.35, M["trim"])
    add_light("motel_sign_up", "SPOT", (FRONT_X + 1.2, 160.5, 0.3), (-0.4, 0, 1), lin("#ffe2bf"), 1500.0, spot=30)
    y = 282.0
    keys = [kk for kk in protos if kk != "motel"]
    i = len(seq)
    while y < 640:
        k = random.choice(keys)
        W = protos[k][3]["W"]
        nxt = next(((a, b) for a, b in SIDE_STREETS if a > y), None)
        if nxt and y + W > nxt[0] - 1.0:
            if nxt[0] - 1.0 - y >= 14.0:
                place("shop", FRONT_X, y, pastels[i % len(pastels)], lights=y < 320)
                i += 1
            y = nxt[1] + 2.0
            continue
        place(k, FRONT_X, y, pastels[i % len(pastels)], lights=y < 320)
        y += W + random.choice([0.0, 0.0, 2.0, 6.0])
        i += 1
    # la lumière de cinéma : de grands réflecteurs doux au-dessus de l'avenue, tournés vers les
    # façades, invisibles à la caméra et dans les reflets ; le pastel des stucs se lit enfin
    for k, yy in enumerate(range(30, 300, 34)):
        f = add_light(f"fill_{k}", "AREA", (0.5, yy, 9.0), (-1, 0, -0.18), lin("#ffd2c0"), 2200.0, (32.0, 9.0))
        f.visible_camera = False
        f.visible_glossy = False
        f.visible_transmission = False
    # derrière, deux rangs d'immeubles de plus : la ville continue, vue du drone
    for row, xr in enumerate((FRONT_X - 26.0, FRONT_X - 52.0)):
        y = -20.0 + row * 9.0
        while y < 420:
            k = random.choice(keys)
            W = protos[k][3]["W"]
            nxt = next(((a, b) for a, b in SIDE_STREETS if a > y - 1), None)
            if nxt and y + W > nxt[0] - 1.0:
                y = nxt[1] + 2.0
                continue
            place(k, xr, y, random.choice(pastels), lights=False, props=row == 0)
            y += W + random.choice([0.0, 3.0, 8.0])
    # au loin, de l'autre côté, la pointe de la baie
    for k in range(7):
        kind = ["tower", "liner", "block", "tower", "flats", "liner", "tower"][k]
        place(kind, 85.0, 650 + k * 38, pastels[(k * 2) % len(pastels)], mirror=True)

    # --- feux, panneaux, fils, aux carrefours
    tl = import_glb("traffic-light.glb")
    amber = mat_emit("signal_amber", lin("#ffb347"), 30.0)
    dark = mat_plain("signal_off", (0.02, 0.02, 0.02, 1), 0.2)
    body = mat_plain("signal_body", lin("#2d3a2f"), 0.5, 0.4)
    for o in tl:
        n = o.name
        o.data.materials.clear()
        o.data.materials.append(amber if "light_yellow" in n else dark if "light_" in n else body)
    head = source(tl, "signal_src", hidden)
    spans = []
    for i, (a, b) in enumerate(SIDE_STREETS):
        if a > 400:
            continue
        for side, yy, face in ((-1, a - 1.2, math.pi), (1, b + 1.2, 0.0)):
            xp = side * (ROAD_HALF + 0.7)
            cyl(f"signal_pole_{i}_{side}", (xp, yy, 0.15), (xp, yy, 7.0), 0.13, body)
            cyl(f"signal_arm_{i}_{side}", (xp, yy, 6.4), (side * 1.0, yy, 6.4), 0.07, body)
            for hx in (side * 4.6, side * 2.0):
                instance(head, f"signal_{i}_{side}_{hx}", (hx, yy, 5.45), face, 1.0)
            instance(head, f"signal_{i}_{side}_pole", (xp - side * 0.3, yy, 2.6), face, 1.0)
            box(f"arm_sign_{i}_{side}", side * 3.2 - 0.6, side * 3.2 + 0.6, yy - 0.03, yy + 0.03, 6.55, 6.95, green)
        # le poteau de nom de rue, plaques vierges
        cyl(f"name_post_{i}", (-ROAD_HALF - 1.0, a - 3.5, 0.15), (-ROAD_HALF - 1.0, a - 3.5, 3.4), 0.04, M["metal"])
        box(f"name_plate_{i}a", -ROAD_HALF - 1.45, -ROAD_HALF - 0.55, a - 3.53, a - 3.47, 3.0, 3.22, green)
        box(f"name_plate_{i}b", -ROAD_HALF - 1.03, -ROAD_HALF - 0.97, a - 3.95, a - 3.05, 3.24, 3.46, green)
        spans.append(((-ROAD_HALF - 0.7, a - 1.2, 6.95), (ROAD_HALF + 0.7, b + 1.2, 6.95)))
        spans.append(((-ROAD_HALF - 0.7, a - 1.2, 6.8), (ROAD_HALF + 0.7, a - 1.2, 6.8)))
    # les poteaux de bois du côté ville, trois fils de l'un à l'autre, une descente vers les façades
    poles = [y for y in range(30, 640, 42) if not in_street(y, 3)]
    for y in poles:
        cyl(f"upole_{y}", (FRONT_X + 0.5, y, 0.15), (FRONT_X + 0.5, y, 9.6), 0.14, wood)
        box(f"upole_arm_{y}", FRONT_X - 0.4, FRONT_X + 1.4, y - 0.06, y + 0.06, 9.0, 9.12, wood)
    for y0, y1 in zip(poles, poles[1:]):
        for dx in (-0.3, 0.5, 1.3):
            spans.append(((FRONT_X + dx, y0, 9.1), (FRONT_X + dx, y1, 9.1)))
        spans.append(((FRONT_X + 1.3, y0, 9.0), (FRONT_X - 0.1, y0 + 6.0, 6.8)))
    wires("wires", spans, M["metal"], sag=0.7)

    # --- le mobilier : bancs, poubelles, jardinières, abribus, terrasse
    keep = ("seat", "seat_back", "legs_single", "legs_double", "back_support_r", "back_support_l", "arm_rest_01", "arm_rest_02", "crossbar")
    parts = import_glb("modular_street_seating/modular_street_seating.gltf")
    mine = [o for o in parts if o.name.split(".")[0] in keep]
    for o in [o for o in parts if o not in mine]:
        bpy.data.objects.remove(o)
    bench = source(mine, "bench_src", hidden)
    parts = import_glb("metal_trash_can/metal_trash_can.gltf")
    mine = [o for o in parts if "rust" not in o.name and "lid" not in o.name]
    for o in [o for o in parts if o not in mine]:
        bpy.data.objects.remove(o)
    can = source(mine, "can_src", hidden)
    terrace = source(import_glb("outdoor_table_chair_set_01/outdoor_table_chair_set_01.gltf"), "terrace_src", hidden)
    # les jardinières : terre sombre et deux ou trois arbustes de bibliothèque (vus du drone, une
    # haie en pavé faisait une dalle verte)
    shrub = source(import_glb("shrub_01/shrub_01.gltf"), "shrub_src", hidden)
    sd = shrub.dimensions
    shrub_s = 1.0 / max(sd.x, sd.y, 0.01)
    soil = mat_plain("planter_soil", lin("#1c1612"), 0.9)
    for y in [20.5 + 34 * k for k in range(18)]:
        if in_street(y, 4):
            continue
        box(f"planter_{y}", -ROAD_HALF - 2.6, -ROAD_HALF - 1.3, y - 1.2, y + 1.2, 0.15, 0.62, conc)
        box(f"planter_soil_{y}", -ROAD_HALF - 2.5, -ROAD_HALF - 1.4, y - 1.1, y + 1.1, 0.62, 0.58 + 0.06, soil)
        for j, dy in enumerate((-0.6, 0.15, 0.75)[: random.choice((2, 3))]):
            instance(shrub, f"shrub_{y}_{j}", (-ROAD_HALF - 1.95 + random.uniform(-0.1, 0.1), y + dy, 0.6),
                     random.uniform(0, math.tau), shrub_s * random.uniform(0.9, 1.25))
    for y in range(98, 620, 46):
        if in_street(y, 4):
            continue
        instance(bench, f"bench_l_{y}", (FRONT_X + 1.3, y, 0.15), math.pi / 2)
        instance(can, f"can_l_{y}", (-ROAD_HALF - 0.75, y + 3.0, 0.15), random.uniform(0, 6))
    for y in range(20, 620, 26):
        instance(bench, f"bench_r_{y}", (ROAD_HALF + WALK - 0.8, y, 0.15), math.pi / 2)
        if y % 52 == 20:
            instance(can, f"can_r_{y}", (ROAD_HALF + WALK - 0.7, y + 2.2, 0.15), random.uniform(0, 6))
    # les terrasses : tables de bibliothèque sous des parasols de toile, une lampe chaude dessous
    canvas = [mat_plain("parasol_cream", lin("#efe4cf"), 0.85), mat_plain("parasol_coral", lin("#e0704f"), 0.85)]
    terraces = [(50.5, 0), (55.5, 0), (60.5, 0), (94.0, 1), (99.0, 1), (231.0, 0), (236.0, 0), (241.0, 0)]
    for k, (yy, c) in enumerate(terraces):
        instance(terrace, f"terrace_{k}", (FRONT_X + 1.6, yy, 0.15), random.uniform(-0.3, 0.3))
        parasol(f"parasol_{k}", FRONT_X + 1.6, yy, canvas[c], M["metal"], light=yy < 120)
    # l'abribus : toit, vitres, panneau lumineux vierge
    sy0, sy1 = 37.0, 42.0
    xb, xf = FRONT_X + 0.5, FRONT_X + 2.2
    for yy in (sy0, sy1):
        for xx in (xb, xf):
            box(f"shelter_post_{xx:.1f}_{yy}", xx - 0.05, xx + 0.05, yy - 0.05, yy + 0.05, 0.15, 2.6, M["metal"])
    box("shelter_roof", xb - 0.2, xf + 0.3, sy0 - 0.2, sy1 + 0.2, 2.6, 2.72, M["metal"])
    box("shelter_back", xb - 0.02, xb + 0.02, sy0, sy1, 0.35, 2.4, M["glass"])
    box("shelter_ad", xb + 0.08, xf - 0.1, sy1 - 0.08, sy1 + 0.08, 0.5, 2.3, M["metal"])
    box("shelter_ad_face", xb + 0.18, xf - 0.2, sy1 - 0.1, sy1 + 0.1, 0.6, 2.2, mat_emit("ad_blank", lin("#f4eee2"), 3.0))
    box("shelter_seat", xb + 0.1, xb + 0.5, sy0 + 0.6, sy1 - 0.6, 0.55, 0.6, M["metal"])


# ---------------------------------------------------------------- les palmiers

def translucent_leaves(mat, amount=0.4, tint=(1.0, 0.95, 0.7)):
    """La palme reste découpée par son alpha ; une part de sa lumière passe au travers (contre-jour)."""
    nt = mat.node_tree
    if any(n.name == "tys_translucent" for n in nt.nodes):
        return
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
    if bsdf is None or out is None:
        return
    alpha_link = bsdf.inputs["Alpha"].links[0].from_socket if bsdf.inputs["Alpha"].links else None
    col_link = bsdf.inputs["Base Color"].links[0].from_socket if bsdf.inputs["Base Color"].links else None
    bsdf.inputs["Alpha"].default_value = 1.0
    if alpha_link:
        nt.links.remove(bsdf.inputs["Alpha"].links[0])
    bsdf.inputs["Roughness"].default_value = 0.55
    tl = nt.nodes.new("ShaderNodeBsdfTranslucent")
    tl.name = "tys_translucent"
    if col_link:
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(col_link, mul.inputs[6])
        mul.inputs[7].default_value = (*tint, 1)
        nt.links.new(mul.outputs[2], tl.inputs["Color"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = amount
    nt.links.new(bsdf.outputs[0], mix.inputs[1])
    nt.links.new(tl.outputs[0], mix.inputs[2])
    cut = nt.nodes.new("ShaderNodeMixShader")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    if alpha_link:
        nt.links.new(alpha_link, cut.inputs[0])
    else:
        cut.inputs[0].default_value = 1.0
    nt.links.new(tr.outputs[0], cut.inputs[1])
    nt.links.new(mix.outputs[0], cut.inputs[2])
    nt.links.new(cut.outputs[0], out.inputs["Surface"])


def to_base(ob, trunk_pts):
    """Origine au pied du tronc (le point le plus bas du tronc)."""
    low = min(trunk_pts, key=lambda p: p.z)
    ob.data.transform(__import__('mathutils').Matrix.Translation(-low))
    ob.location = (0, 0, 0)


def coconut_sources(hidden, scale=0.55):
    """Les 25 cocotiers du « Realistic Palm Tree 2 Free », chacun joint (palmes + tronc), au pied."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, "palm-coconut-group.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    meshes = [o for o in meshes if "Palm_P2_" in o.name]
    groups = {}
    for o in meshes:
        key = o.name.split("Palm_P2_")[1].split("_")[0]
        groups.setdefault(key, []).append(o)
    out = []
    for key, objs in sorted(groups.items(), key=lambda kv: int(kv[0])):
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        trunk = next((o for o in objs if "Trunk" in o.name), None)
        if trunk is None:
            continue
        pts = [Vector(v.co) for v in trunk.data.vertices]
        ob = join(objs, f"coco_src_{key}")
        to_base(ob, pts)
        ob.data.transform(__import__('mathutils').Matrix.Scale(scale, 4))
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        hidden.objects.link(ob)
        top = max(v.co.z for v in ob.data.vertices)
        hi = [v.co for v in ob.data.vertices if v.co.z > top * 0.7]
        cx, cy = sum(v.x for v in hi) / len(hi), sum(v.y for v in hi) / len(hi)
        out.append((ob, top, math.atan2(cy, cx), math.hypot(cx, cy)))
    for m in bpy.data.materials:
        if m.name.startswith("Leaf"):
            translucent_leaves(m)
    return out


def royal_source(hidden, name="palm-royal.glb"):
    parts = import_glb(name)
    trunk = next(o for o in parts if "trunk" in o.name)
    pts = [Vector(v.co) for v in trunk.data.vertices]
    ob = join(parts, "royal_src")
    to_base(ob, pts)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    hidden.objects.link(ob)
    for m in ob.data.materials:
        if m and "leaflet" in m.name:
            translucent_leaves(m, 0.45)
    return ob


def tree_grate(name, x, y, size=1.3):
    """Grille d'arbre en fonte au ras du trottoir, terre sombre dessous."""
    soil = bpy.data.materials.get("grate_soil") or mat_plain("grate_soil", lin("#1c1612"), 0.9)
    iron = bpy.data.materials.get("grate_iron") or mat_plain("grate_iron", (0.03, 0.03, 0.032, 1), 0.45, 0.85)
    h = size / 2
    box(f"{name}_soil", x - h, x + h, y - h, y + h, 0.10, 0.151, soil)
    box(f"{name}_frame", x - h, x + h, y - h, y + h, 0.152, 0.158, iron)
    # le cadre évidé : les barreaux d'une grille rayonnante, simplifiée en lames parallèles
    box(f"{name}_hole", x - 0.18, x + 0.18, y - 0.18, y + 0.18, 0.152, 0.159, soil)



# ---------------------------------------------------------------- scène

def make_world(scene):
    """Le ciel : HDRI réel, ramené à la palette par l'élévation."""
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


def render_settings(scene):
    """Cycles sur CPU, deux fils, AgX ; halo des lumières et dispersion au compositing."""
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



def street_hero(scene):
    """La voiture poursuivie d'époque (lab/hero_cars.py), mise au repère de la rue comme le coupé : l'avant vers -y,
    au sol, à sa place sur la voie. Le quart de tour est appliqué aux maillages (les roues tournent ensuite autour de
    leur x local, comme celles du coupé). L'objet s'appelle `coupe` et ses roues `wheel_*` : render.py et
    lab/A_pres.py la cherchent sous ces noms. Phares ramenés à ceux du coupé (90 W, 60°), le conducteur assis
    (lab/cast_people.py) parenté à la caisse."""
    lab = os.path.join(HERE, "lab")
    if lab not in sys.path:
        sys.path.insert(0, lab)
    import hero_cars
    car = hero_cars.load_hero(HERO, lights_on=True)
    body = car["body"]
    bpy.context.view_layer.update()
    R = Matrix.Rotation(-math.pi / 2, 4, "Z")     # l'avant de +x (repère des chargeurs) vers -y (la rue)
    kids = {c: c.matrix_world.copy() for c in body.children}
    body.data.transform(R @ body.matrix_world)
    body.matrix_world = Matrix.Identity(4)
    for c, W in kids.items():
        W = R @ W
        if c.type == "MESH":
            loc, rot, sca = W.decompose()
            c.data.transform(Matrix.LocRotScale(None, rot, sca))
            W = Matrix.Translation(loc)
        c.matrix_parent_inverse = Matrix.Identity(4)
        c.matrix_world = W
        c.rotation_mode = "XYZ"
    for k, w in car["wheels"].items():
        w.name = f"wheel_{k}"
    for lo in car["lights"]:
        if lo.data.type == "SPOT":
            lo.data.energy = 90
            lo.data.spot_size = math.radians(60)
    body.name = "coupe"
    body.rotation_mode = "XYZ"
    body["wheel_r"] = car["wheel_radius"] or WHEEL_R
    body["length"] = car["length"]
    body["half_track"] = max((abs(a[1]) for a in car["axles"].values()), default=0.75)
    bpy.context.view_layer.update()
    if os.environ.get("FILM3D_DRIVER", "1") != "0":
        try:
            import cast_people
            # le repère du volant donné par hero_cars (avant vers +x) passé dans celui de la rue (avant vers -y)
            w = car["cockpit"]["wheel"]
            objs = cast_people.cast_driver_in_car(body, f"hero_{HERO}_wheel_rim", Vector((w.y, -w.x, w.z)))
            if objs:
                objs[0].parent = body
                objs[0].matrix_parent_inverse = Matrix.Identity(4)
        except Exception as e:  # le conducteur n'est qu'une silhouette : sans lui, la voiture roule vide
            print(f"[scene_a] conducteur non posé : {e!r}", flush=True)
    print(f"[scene_a] voiture poursuivie {HERO} : {car['length']:.2f} × {car['width']:.2f} × {car['height']:.2f} m, "
          f"roues r {body['wheel_r']:.3f}, demi-voie {body['half_track']:.3f}, {car['tris']} triangles", flush=True)
    body.location = (LANE_X, COUPE_Y, 0)
    body.rotation_euler = (0, 0, math.radians(COUPE_YAW))
    return body


def ouv_motion(scene, coupe, cam, focus):
    """Le plan OUV animé (ouv_avenue.py) : la berline remonte l'avenue vers +y à 50 km/h, mise sur un rig
    (motion.rig_up) et clée par motion.key_vehicle (roues, suspension) ; la caméra la suit sur un rail
    (motion.key_camera) ; la mise au point sur la caisse ; flou de bougé d'un demi-obturateur."""
    import motion as M
    frames = range(OUV.F0, OUV.F0 + OUV.FRAMES)
    scene.frame_start, scene.frame_end = frames[0], frames[-1]
    wheels = [o for o in coupe.children if o.name.startswith("wheel_")]
    ys = [w.location.y for w in wheels]
    wb = (max(ys) - min(ys)) if len(ys) > 1 else 2.9
    # la caisse tournée l'avant vers +y (street_hero la pose vers -y) puis mise sur son rig, au cap 0
    x0, y0 = OUV.hero_pos(M.t_of(OUV.F0))
    coupe.location = (x0, y0, 0)
    coupe.rotation_euler = (0, 0, math.pi)
    rig = M.rig_up(coupe, 0.0, "rig_berline")
    poses = M.sample(OUV.hero_pos, frames, wheel_r=coupe["wheel_r"], wheelbase=wb)
    M.key_vehicle(rig, poses, wheels=wheels)
    M.wheel_marks(wheels, coupe["wheel_r"])
    cam.data.shift_y = 0.0
    M.key_camera(cam, frames, OUV.camera)
    cam.data.dof.focus_object = coupe
    bpy.data.objects.remove(focus)
    scene.frame_set(frames[0])
    scene.render.motion_blur_shutter = 0.5
    scene.render.use_motion_blur = True
    print(f"[scene_a] OUV : {len(poses)} images, berline de y {poses[0]['y']:.1f} à {poses[-1]['y']:.1f}, "
          f"empattement {wb:.2f} m", flush=True)


def key_hands(coupe, frames, steer_fn):
    """Les mains gantées sur la jante, clés d'os : à chaque image clé, pose_driver_wheel reposée deux fois (la
    main gauche à grip + braquage, la droite à grip - braquage, en degrés de volant) ; la jante ne tourne pas."""
    from mathutils import Vector
    import cast_people as CP
    arm = next((o for o in coupe.children_recursive if o.type == "ARMATURE" and "wheel_fit" in o), None)
    if arm is None:
        print("[scene_a] P1 : pas de conducteur, mains non animées", flush=True)
        return
    bpy.context.view_layer.update()
    fit = list(arm["wheel_fit"])
    W = coupe.matrix_world
    C, N, rad, pedal = W @ Vector(fit[0:3]), (W.to_3x3() @ Vector(fit[3:6])).normalized(), fit[6], W @ Vector(fit[7:10])
    for f in frames:
        a = steer_fn(f)
        CP.pose_driver_wheel(arm, C, rad, N, grip_deg=62.0 + a, pedal=pedal)
        left = {b.name: (b.location.copy(), b.rotation_quaternion.copy()) for b in arm.pose.bones if "Left" in b.name}
        CP.pose_driver_wheel(arm, C, rad, N, grip_deg=62.0 - a, pedal=pedal)
        for b in arm.pose.bones:
            if b.name in left:
                b.location, b.rotation_quaternion = left[b.name]
            b.keyframe_insert("location", frame=f)
            b.keyframe_insert("rotation_quaternion", frame=f)


def p1_cabin(scene, coupe, frames, on):
    """L'habitacle de P1 lisible : le rétroviseur réglé sur la voie derrière, le pare-brise sans réflexion totale vu de dos, une
    source froide douce et deux lueurs corail et lilas derrière la lunette, liées aux seuls objets de la berline et
    du conducteur (liaison de lumière, comme lieux.car_fill) ; invisibles à la caméra et aux reflets."""
    import motion as M
    import p1_habitacle as P
    # le rétroviseur (faces de hero_w111_mirror, sans sommet partagé) tourné autour de son centre : un conducteur le
    # règle ; la normale (0, 1, 0) passe à (lacet vers +x, bascule vers le haut) de p1_habitacle
    me = coupe.data
    mi = {i for i, m in enumerate(me.materials) if m and m.name.endswith("_mirror")}
    vs = sorted({v for p in me.polygons if p.material_index in mi for v in p.vertices})
    # le miroir se détache du pare-brise : tout le rétroviseur du modèle est en chrome poli (boîtier compris), il
    # reflétait l'avenue jusque sur ses bords. Seule la glace (faces tournées vers l'arrière, la caméra) reste miroir ;
    # le boîtier, son bord arrondi (le liseré qui accroche la source froide), la tige et son pied prennent l'ivoire
    # satiné du volant (hero_w111_wheel_rim)
    ivory = bpy.data.materials.get(f"hero_{HERO}_wheel_rim")
    if vs and ivory is not None:
        if ivory.name not in me.materials:
            me.materials.append(ivory)
        k = list(me.materials).index(ivory)
        glass = sorted({v for p in me.polygons if p.material_index in mi and p.normal.y > 0.9 for v in p.vertices})
        n_case = n_stem = 0
        for p in me.polygons:
            if p.material_index in mi and p.normal.y <= 0.9:
                p.material_index = k
                n_case += 1
            elif p.material_index not in mi and p.material_index != k:
                c = p.center
                mat = me.materials[p.material_index]
                if (abs(c.x) < 0.04 and -0.75 < c.y < -0.55 and 1.25 < c.z < 1.42 and mat
                        and not mat.name.endswith("_glass")):
                    p.material_index = k
                    n_stem += 1
        print(f"[scene_a] P1 : rétroviseur, {len(glass)} sommets de glace, {n_case} faces de boîtier et "
              f"{n_stem} de tige passées en ivoire", flush=True)
    if vs:
        c = sum((me.vertices[v].co for v in vs), Vector()) / len(vs)
        R = Matrix.Rotation(-math.radians(P.MIRROR_YAW), 3, "Z") @ Matrix.Rotation(math.radians(P.MIRROR_TILT), 3, "X")
        for v in vs:
            me.vertices[v].co = c + R @ (me.vertices[v].co - c)
        me.update()
    # le pare-brise vu de l'intérieur : le nœud Fresnel de hero_cars.mat_window prend 1/1,52 sur une face vue de dos
    # et passe en réflexion totale au-delà de 41° ; le pare-brise couché, vu de la banquette sous ~60°, devenait un
    # miroir de l'habitacle noir (l'avenue 7 fois plus sombre qu'en OUV au premier rendu). Une vitre est une
    # feuille mince : vue de dos, le reflet reste celui du verre de face (~0,1)
    for m in bpy.data.materials:
        if not (m.name.endswith("_glass") and m.name.startswith("hero_") and m.node_tree):
            continue
        nt = m.node_tree
        for mix in [n for n in nt.nodes if n.type == "MIX_SHADER" and n.inputs[0].is_linked]:
            src = mix.inputs[0].links[0].from_socket
            bf = nt.nodes.new("ShaderNodeNewGeometry").outputs["Backfacing"]
            keep = nt.nodes.new("ShaderNodeMath")
            keep.operation = "SUBTRACT"
            keep.inputs[0].default_value = 1.0
            nt.links.new(bf, keep.inputs[1])
            front = nt.nodes.new("ShaderNodeMath")
            front.operation = "MULTIPLY"
            nt.links.new(src, front.inputs[0])
            nt.links.new(keep.outputs[0], front.inputs[1])
            back = nt.nodes.new("ShaderNodeMath")
            back.operation = "MULTIPLY_ADD"
            nt.links.new(bf, back.inputs[0])
            back.inputs[1].default_value = 0.1
            nt.links.new(front.outputs[0], back.inputs[2])
            nt.links.new(back.outputs[0], mix.inputs[0])
    # les receveurs : la caisse, ses portes, le conducteur
    col = bpy.data.collections.new("habitacle_seul")
    for o in [coupe, *coupe.children_recursive]:
        if o.type == "MESH" and not o.name.startswith("wheel_"):
            col.objects.link(o)

    def lamp(name, color, energy, size, loc, aim):
        d = bpy.data.lights.new(name, "AREA")
        d.shape, d.size, d.energy, d.color = "DISK", size, energy, lin(color)[:3]
        lo = bpy.data.objects.new(name, d)
        scene.collection.objects.link(lo)
        lo.parent = coupe
        lo.location = loc
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = (Vector(aim) - Vector(loc)).to_track_quat("-Z", "Y")
        lo.visible_camera = lo.visible_glossy = lo.visible_transmission = lo.visible_volume_scatter = False
        lo.light_linking.receiver_collection = col
        return lo
    # la source froide : du pavillon au-dessus de la banquette vers le tableau de bord (le noyer, le volant ivoire)
    lamp("habitacle", "#b4bce6", 45.0, 0.5, (0.1, 0.75, 1.33), (0.2, -0.75, 0.85))   # 25 W : le noyer restait noir
    # les lueurs de la rampe, derrière la lunette (repère de la caisse : l'arrière vers +y) : elles battent avec
    # elle (M.bar_phase, décalage 0 comme la patrouille dans flash_bars) et teintent le pavillon et l'épaule
    for name, color, tone, x, watts in (("lueur_corail", CORAL, "corail", 0.35, 40.0), ("lueur_lilas", LILAC, "lilas", -0.35, 60.0)):
        d = lamp(name, color, watts, 0.25, (x, 2.0, 1.15), (0.3, 0.0, 1.25)).data   # corail à 60 W : pavillon et dossier trop roses
        for f in frames:
            d.energy = watts if f >= on and M.bar_phase(f) == tone else 0.0
            d.keyframe_insert("energy", frame=f)
        for fc in M.fcurves(d):
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"


def p1_motion(scene, coupe, police, cam, focus):
    """Le plan P1 animé (p1_habitacle.py), 2,5 s après OUV : la berline et la patrouille sur leurs rigs (roues,
    suspension), la rampe éteinte puis allumée (corail et lilas, 2 Hz, motion.flash_bars) ; la caméra fixe dans
    l'habitacle, parentée à la caisse, mise au point sur le rétroviseur intérieur (le vrai, celui du modèle) ;
    les mains bougent à peine sur la jante ; une faible lumière froide sous le pavillon."""
    import motion as M
    import p1_habitacle as P
    frames = range(P.F0, P.F0 + P.FRAMES)
    scene.frame_start, scene.frame_end = frames[0], frames[-1]
    on = min(f for f in frames if P.bars_on(f))
    # les mains d'abord, la caisse encore immobile : deux degrés et demi de volant, une correction lente
    key_hands(coupe, list(range(P.F0, P.F0 + P.FRAMES, 4)) + [P.F0 + P.FRAMES - 1],
              lambda f: 2.5 * math.sin(math.pi * (f - P.F0) / (P.FRAMES - 1)))
    # la berline
    wheels = [o for o in coupe.children if o.name.startswith("wheel_")]
    ys = [w.location.y for w in wheels]
    wb = (max(ys) - min(ys)) if len(ys) > 1 else 2.9
    x0, y0 = P.hero_pos(M.t_of(P.F0))
    coupe.location = (x0, y0, 0)
    coupe.rotation_euler = (0, 0, math.pi)
    rig = M.rig_up(coupe, 0.0, "rig_berline")
    poses = M.sample(P.hero_pos, frames, wheel_r=coupe["wheel_r"], wheelbase=wb)
    M.key_vehicle(rig, poses, wheels=wheels)
    M.wheel_marks(wheels, coupe["wheel_r"])
    # la patrouille : après l'ellipse, dans la voie de la berline, derrière elle (l'avant de son modèle vers +x)
    px, py = P.patrol_pos(M.t_of(P.F0))
    police.location = (px, py, 0)
    police.rotation_euler = (0, 0, math.radians(P.patrol_heading(0.0) + 90.0))
    prig = M.rig_up(police, P.patrol_heading(0.0), "rig_police")
    wh, wr = M.wheels_of(police), police.get("wheel_r", 0.36)
    pp = M.sample(P.patrol_pos, frames, heading=P.patrol_heading, wheel_r=wr, wheelbase=police.get("wheelbase", 2.9),
                  front=police.get("front_axle"))
    M.key_vehicle(prig, pp, wheels=wh, pivot=(0.0, 0.0, 0.36))
    M.wheel_marks(wh, wr, axis="Y")
    # la rampe : clignote à partir de l'image `on`, éteinte avant (lumières et matières émissives de la patrouille)
    M.flash_bars([prig], range(on, frames[-1] + 1))
    lit = []
    for ob in police.children_recursive:
        if ob.type == "LIGHT":
            d = ob.data
            full = d.get("motion_energy", d.energy)
            for f in range(frames[0], on):
                d.energy = 0.0
                d.keyframe_insert("energy", frame=f)
            if "motion_energy" not in d:
                d.energy = full
                d.keyframe_insert("energy", frame=on)
            lit.append(d)
    mats = {m for ob in [police, *police.children_recursive] if ob.type == "MESH" for m in ob.data.materials if m and m.node_tree}
    for m in mats:
        for n in m.node_tree.nodes:
            s = n.inputs.get("Emission Strength") if n.type == "BSDF_PRINCIPLED" else (n.inputs.get("Strength") if n.type == "EMISSION" else None)
            if s is None or s.is_linked or s.default_value <= 0.0:
                continue
            full = s.default_value
            s.default_value = 0.0
            s.keyframe_insert("default_value", frame=frames[0])
            s.default_value = full
            s.keyframe_insert("default_value", frame=on)
            lit.append(m.node_tree)
    for idb in lit:
        for fc in M.fcurves(idb):
            for kp in fc.keyframe_points:
                kp.interpolation = "CONSTANT"
    # la caméra : fixe dans la caisse (repère de street_hero : l'avant vers -y), regard vers l'avant, un peu plongé
    from mathutils import Vector
    cam.animation_data_clear()
    cam.parent = coupe
    cam.matrix_parent_inverse = Matrix.Identity(4)
    cam.location = P.CAM_LOCAL
    cam.rotation_mode = "QUATERNION"
    b = math.radians(P.CAM_PITCH)
    cam.rotation_quaternion = Vector((0.0, -math.cos(b), math.sin(b))).to_track_quat("-Z", "Y")
    cam.data.lens = P.LENS
    cam.data.shift_y = 0.0
    cam.data.clip_start = 0.05
    cam.data.dof.focus_object = None
    # la mise au point : sur la glace du rétroviseur (1,3 m), le reflet de la patrouille (à 30 m de plus) sortait
    # flou en trois points ; à 5 m et f/4, la glace et son cadre restent nets à 4 px près, le reflet et l'avenue
    # nets, la capuche au premier plan floue
    cam.data.dof.focus_distance = P.FOCUS
    cam.data.dof.aperture_fstop = P.FSTOP
    bpy.data.objects.remove(focus)
    p1_cabin(scene, coupe, frames, on)
    scene.frame_set(P.STILL)          # l'image fixe du banc : la rampe allumée dans le rétroviseur
    scene.render.motion_blur_shutter = 0.5
    scene.render.use_motion_blur = True
    print(f"[scene_a] P1 : {len(poses)} images, berline de y {poses[0]['y']:.1f} à {poses[-1]['y']:.1f}, rampe "
          f"allumée à l'image {on}, {len(lit)} lumières et matières de la patrouille clées", flush=True)


def build(plan=None, palier=None):
    """La scène A (l'avenue du front de mer). Sans plan : l'ancienne image fixe, écrite dans assets/scene-a.blend.
    plan « OUV » ou « P1 » (render_lieux --lieu avenue) : le plan animé (l'ouverture, puis le rétroviseur dans
    l'habitacle), rendu sans écrire la scène ; palier ignoré."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    hidden = bpy.data.collections.new("sources")
    scene.collection.children.link(hidden)

    # --- la voiture poursuivie (FILM3D_HERO) ; le coupé : modèle générique haute définition, l'avant vers -y d'origine
    paint = mat_paint()[0]
    side_glass = mat_tinted_glass()
    windscreen = mat_windscreen()
    head_emit = mat_emit("coupe_headlight", lin(CREAM), 40.0)
    drl_emit = mat_emit("coupe_drl", lin(CREAM), 12.0)
    tail_emit = mat_emit("coupe_taillight", lin("#ff2a1a"), 9.0)
    lamp_glass = mat_clear_glass()
    housing = mat_plain("headlight_housing", (0.02, 0.02, 0.022, 1), 0.15, 1.0)
    plate = mat_plain("blank_plate", (0.55, 0.55, 0.52, 1), 0.5)
    if HERO == "coupe":
        parts = import_glb("coupe-hd.glb")
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
        wheel_r, spray_x, spray_y = WHEEL_R, 0.95, 2.9
    else:
        coupe = street_hero(scene)
        wheel_r = coupe["wheel_r"]
        spray_x, spray_y = coupe["half_track"] + 0.2, coupe["length"] / 2 + 0.45
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
        sp.location = (side * spray_x, spray_y, 0.28)
        sp.scale = (0.45, 1.3, 0.35)
        sp.visible_shadow = False

    # --- la patrouille : celle de bibliothèque des autres scènes (cast_vehicles.load_patrol, l'avant vers +x dans
    # son repère), rampe éteinte (en P1 ses lumières existent, éteintes par clés jusqu'à ce qu'elle s'allume) ; elle
    # garde le nom « police »
    lab = os.path.join(HERE, "lab")
    if lab not in sys.path:
        sys.path.insert(0, lab)
    import cast_vehicles as cv
    police = cv.load_patrol("jeandiz", lights_on=(plan == "P1"), name="police")["body"]
    police.name = "police"
    police.location = (POLICE_X, POLICE_Y, 0)
    police.rotation_mode = "XYZ"
    police.rotation_euler = (0, 0, -math.pi / 2)        # l'avant vers -y
    if plan in ("OUV", "P1"):
        # garée à l'angle de la rue transversale de y 120, côté ville (ouv_avenue.PATROL, cap des lieux)
        police.location = (OUV.PATROL[0], OUV.PATROL[1], 0)
        police.rotation_euler = (0, 0, math.radians(OUV.PATROL[2] + 90.0))

    # --- la ville : la route, les immeubles, la rue
    build_city(hidden)
    if os.environ.get("FILM3D_PARKED", "1") != "0":
        parked_cars(hidden)

    # --- les palmiers : vingt-cinq cocotiers distincts (troncs courbes) et un palmier royal droit,
    # palmes translucides, une grille d'arbre au pied de chacun
    cocos = coconut_sources(hidden)
    royal = royal_source(hidden)
    city = [(ob, ang) for ob, top, ang, off in cocos if 8.0 < top < 13.5 and off < 3.5]
    sea = [(ob, ang) for ob, top, ang, off in cocos if 8.0 < top < 15.5 and off < 6.0]
    k = 0
    for side, x, start, step in ((1, ROAD_HALF + 2.4, 6.0, 13.0), (-1, -ROAD_HALF - 1.6, 12.0, 17.0)):
        yy = start
        n = 0
        while yy < 700:
            if side < 0 and in_street(yy, 2.5):
                yy += 6.0
                continue
            px, py = x + random.uniform(-0.3, 0.3), yy + random.uniform(-1.5, 1.5)
            if side < 0 and n % 3 != 1:
                # côté ville : surtout des palmiers royaux, droits, à peine penchés
                ob = instance(royal, f"palm_{k}", (px, py, 0.15), random.uniform(0, math.tau), random.uniform(0.85, 1.12))
                ob.rotation_euler = (math.radians(random.uniform(-2, 2)), math.radians(random.uniform(-2, 2)), ob.rotation_euler.z)
            else:
                # la couronne des cocotiers penche vers la chaussée côté ville, vers la mer côté promenade
                src, ang = random.choice(city if side < 0 else sea)
                instance(src, f"palm_{k}", (px, py, 0.15), -ang + random.uniform(-0.6, 0.6), random.uniform(0.9, 1.1))
            if py < 330:
                tree_grate(f"palm_{k}_grate", px, py)
            yy += step + random.uniform(-2, 2)
            k += 1
            n += 1

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
            if in_street(yy, 3.0):
                yy += 8.0
                continue
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

    make_world(scene)

    # --- la brume d'après la pluie
    haze_m, HN, hout = material("haze")
    # (0,0006 : la brume est réelle depuis que les normales de sa boîte sortent, la caméra dedans ; à 0,0015 l'avenue
    # sortirait noyée. Non vérifié à l'image depuis la correction des normales.)
    vol = HN.new("ShaderNodeVolumePrincipled", Color=lin("#b8b4d8"), Density=0.0006, Anisotropy=0.45)
    HN.link(vol.outputs[0], hout.inputs["Volume"])
    haze = box("haze", -60, 60, -10, 480, -0.1, 40, haze_m)
    # box() tourne les faces vers l'intérieur : Cycles croirait la caméra hors de la brume (lieux.haze, même cure)
    bm = bmesh.new()
    bm.from_mesh(haze.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(haze.data)
    bm.free()
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

    render_settings(scene)
    r = scene.render

    if plan == "OUV":
        ouv_motion(scene, coupe, co, focus)
        return scene
    if plan == "P1":
        p1_motion(scene, coupe, police, co, focus)
        return scene

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
    spin = SPEED / wheel_r / 24
    for w in [o for o in coupe.children if o.name.startswith("wheel_")]:
        for f in (1, 3):
            w.rotation_euler.x = spin * (f - 2)
            w.keyframe_insert("rotation_euler", index=0, frame=f)
        w.rotation_euler.x = 0
        linear_keys(w)
    scene.frame_set(2)
    r.motion_blur_shutter = 0.5
    r.use_motion_blur = False

    out = os.path.join(ASSETS, BLEND)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print(f"[scene_a] écrit {out}", flush=True)


if __name__ == "__main__":
    build()
