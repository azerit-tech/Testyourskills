# La ville de nuit derrière les baies (SPEC §17.4) : un front de mer de style
# Miami Beach à l'heure bleue, construit d'après OpenStreetMap et rendu dans
# Blender (Cycles).
#
#   blender -b -P tools/bake/city.py -- [--preview] [--samples 96] [--width 5120]
#                                     [--only pano,sky,check] [--out dir]
#
# South Beach, Miami Beach, vu d'un 20e étage sur la dune au nord d'Ocean
# Drive, face au sud : la plage et l'Atlantique devant à gauche, les façades
# art déco d'Ocean Drive et leurs néons à droite, Lummus Park et ses
# cocotiers entre les deux, South Pointe au fond, les tours de Brickell et
# du centre de Miami tout à droite, à 7 km de l'autre côté de Biscayne Bay.
# Vraies emprises, hauteurs, rues, plages et parcs (tools/bake/osm.py, cache
# hors ligne dans tools/bake/.cache/osm). Données © OpenStreetMap
# contributors, ODbL (https://www.openstreetmap.org/copyright). Rien du jeu :
# ni nom, ni asset ; les néons, les enseignes et les fenêtres sont inventés.
#
# Sorties dans web/public/3d :
# - city.webp : le panorama cylindrique vu de la baie (ARC, V_MIN, V_MAX comme
#   stage.ts), posé derrière les baies de l'open space ;
# - sky.webp : le ciel équirectangulaire de l'heure bleue (fond, environnement).
# Les façades sont des textures générées ici (RGB = lumière des fenêtres, A =
# vitrage, tools/bake/.cache/facade-*.webp), le sol une vue de dessus des
# rues, plages et parcs dont la terre est déduite (l'eau partout ailleurs),
# les cocotiers un vrai modèle (Sketchfab, CC BY) instancié le long d'Ocean
# Drive et de la plage.
import argparse
import json
import math
import os
import random
import sys
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--width", type=int, default=5120)
ap.add_argument("--samples", type=int, default=96)
ap.add_argument("--preview", action="store_true", help="petit calcul rapide pour la mise au point")
ap.add_argument("--only", default="pano,sky,check", help="sorties à produire, parmi pano,sky,check")
ap.add_argument("--out", default=None)
ap.add_argument("--checks", default=None, help="dossier des rendus de contrôle (défaut : --out)")
args = ap.parse_args(argv)
if args.preview:
    args.width, args.samples = 1600, 24
ONLY = set(args.only.split(","))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = args.out or os.path.join(ROOT, "web", "public", "3d")
CHECKS = args.checks or OUT
CACHE = os.path.join(ROOT, "tools", "bake", ".cache")

# ---------- le cadrage du panorama, repris par stage.ts ----------
ARC = 100.0
V_MIN, V_MAX = -14.0, 16.0
FAR = 9000.0

# ---------- le lieu ----------
# La baie du dev : au nord d'Ocean Drive, en bord de plage à la hauteur de la
# 16e rue, au-dessus des hôtels de Collins Avenue (36 m au plus autour). Elle regarde le cap HEADING : la plage et
# l'océan devant à gauche, les façades néon d'Ocean Drive à droite, South
# Pointe au fond et les tours de Brickell tout à droite, à 7 km.
WIN_LAT, WIN_LON = 25.7898, -80.1278
HEADING = 195.0  # cap de la baie (degrés depuis le nord, sens horaire)
WIN_H = 66.0  # 20e étage
CLEAR = (44.0, 26.0)  # l'immeuble du dev, invisible de sa baie : aucun bâtiment OSM sur son emprise
# les emprises OSM, fixes : le cache sert tant qu'elles ne changent pas
AREA_NEAR = (25.758, -80.152, 25.815, -80.116)  # South Beach
AREA_FAR = (25.752, -80.205, 25.800, -80.170)  # Brickell et le centre de Miami, au loin
SUN_AZ = 248.0  # le soleil vient de se coucher à l'ouest-sud-ouest (novembre, Miami)

GROUND_Z = -WIN_H  # le sol, sous la baie
E_WIN = 2.5  # radiance d'une fenêtre allumée à 1 dans la texture
E_NEON = 16.0
E_LAMP = 12.0
TILE_M = 16.0  # une texture de façade couvre 16 m × 16 m
TILE_PX = 512
STYLES = ("punched", "bands", "curtain", "blank")

# néons (linéaire) : rose #ff3fa4, cyan #3fd8ff, violet, orangé, blanc chaud
NEONS = [(1.0, 0.05, 0.37), (1.0, 0.05, 0.37), (1.0, 0.05, 0.37), (0.05, 0.69, 1.0), (0.05, 0.69, 1.0), (0.3, 0.06, 0.9), (1.0, 0.22, 0.03), (1.0, 0.75, 0.45)]


def srgb_to_lin(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# façades pastel de South Beach, et le gris des tours modernes (sRGB → linéaire)
PASTELS = [srgb_to_lin(c) for c in ((0.93, 0.91, 0.86), (0.95, 0.76, 0.78), (0.74, 0.88, 0.8), (0.97, 0.82, 0.64), (0.95, 0.9, 0.62), (0.72, 0.83, 0.92), (0.86, 0.8, 0.93), (0.9, 0.88, 0.85))]
GREYS = [srgb_to_lin(c) for c in ((0.6, 0.6, 0.6), (0.45, 0.47, 0.5), (0.3, 0.32, 0.36), (0.75, 0.74, 0.72))]

scene = bpy.context.scene
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import osm  # noqa: E402

# repère : +y = le cap de la baie retourné, c'est-à-dire derrière le dev ;
# -y = devant lui (HEADING) ; +x = sa droite ; z vers le haut, 0 à la baie.
FRAME = osm.Frame(WIN_LAT, WIN_LON, HEADING - 180.0)


def hrand(i, salt=0):
    return random.Random(i * 7919 + salt)


def ring_area(ring):
    return 0.5 * sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# ---------- nœuds ----------
def nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    return nt, nt.nodes.new("ShaderNodeOutputMaterial")


def math_node(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def color_attr(nt, name):
    n = nt.nodes.new("ShaderNodeVertexColor")
    n.layer_name = name
    return n.outputs["Color"]


def image_node(nt, img, scale):
    tc = nt.nodes.new("ShaderNodeUVMap")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, 1)
    nt.links.new(tc.outputs[0], mp.inputs[0])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest" if img.size[0] <= 64 else "Linear"
    nt.links.new(mp.outputs[0], tex.inputs[0])
    return tex


# ---------- le ciel de l'heure bleue ----------
ZENITH = (0.004, 0.009, 0.03)
HORIZON = (0.05, 0.045, 0.11)  # violet, loin du soleil
GLOW_HI = (0.75, 0.18, 0.42)  # rose, au-dessus de l'orangé
GLOW_LO = (1.2, 0.45, 0.12)  # orangé, juste sur l'horizon


def sky_world():
    """Ciel procédural : dégradé du zénith à l'horizon, le crépuscule orangé
    puis rose du côté du soleil couché, quelques nuages, les premières étoiles."""
    w = bpy.data.worlds.new("bluehour")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    x, y, z = sep.outputs["X"], sep.outputs["Y"], sep.outputs["Z"]
    e = math_node(nt, "MAXIMUM", z, 0.0)  # sin(élévation)
    # azimut du soleil dans le repère de la scène : +y = HEADING + 180
    a = math.radians(SUN_AZ - (HEADING - 180.0))
    sx, sy = math.sin(a), math.cos(a)
    hl = math_node(nt, "SQRT", math_node(nt, "ADD", math_node(nt, "MULTIPLY", x, x), math_node(nt, "MULTIPLY", y, y)))
    cosA = math_node(nt, "DIVIDE", math_node(nt, "ADD", math_node(nt, "MULTIPLY", x, sx), math_node(nt, "MULTIPLY", y, sy)), math_node(nt, "MAXIMUM", hl, 1e-4))
    toward = math_node(nt, "POWER", math_node(nt, "MULTIPLY", math_node(nt, "ADD", cosA, 1.0), 0.5, clamp=True), 3.0)
    # base : zénith → horizon
    t = math_node(nt, "POWER", math_node(nt, "SUBTRACT", 1.0, e), 4.0)
    base = nt.nodes.new("ShaderNodeMix")
    base.data_type = "RGBA"
    base.clamp_factor = True
    nt.links.new(t, base.inputs["Factor"])
    base.inputs["A"].default_value = (*ZENITH, 1)
    base.inputs["B"].default_value = (*HORIZON, 1)
    # crépuscule : rose jusqu'à 20°, orangé sur les 6 derniers degrés, côté soleil
    pink = math_node(nt, "MULTIPLY", toward, math_node(nt, "EXPONENT", math_node(nt, "DIVIDE", e, -0.16)))
    orange = math_node(nt, "MULTIPLY", math_node(nt, "POWER", toward, 1.5), math_node(nt, "EXPONENT", math_node(nt, "DIVIDE", e, -0.045)))
    below = math_node(nt, "LESS_THAN", z, 0.0)  # sous l'horizon : la brume garde la lueur
    pink = math_node(nt, "MULTIPLY", pink, math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MULTIPLY", below, 0.4)))
    m1 = nt.nodes.new("ShaderNodeMix")
    m1.data_type = "RGBA"
    m1.clamp_factor = True
    nt.links.new(math_node(nt, "MULTIPLY", pink, 0.9), m1.inputs["Factor"])
    nt.links.new(base.outputs["Result"], m1.inputs["A"])
    m1.inputs["B"].default_value = (*GLOW_HI, 1)
    m2 = nt.nodes.new("ShaderNodeMix")
    m2.data_type = "RGBA"
    m2.clamp_factor = True
    nt.links.new(math_node(nt, "MULTIPLY", orange, 0.85), m2.inputs["Factor"])
    nt.links.new(m1.outputs["Result"], m2.inputs["A"])
    m2.inputs["B"].default_value = (*GLOW_LO, 1)
    # nuages : bruit projeté sur un plafond, roses près du soleil, sombres ailleurs
    proj = nt.nodes.new("ShaderNodeVectorMath")
    proj.operation = "DIVIDE"
    nt.links.new(tc.outputs["Generated"], proj.inputs[0])
    cz = nt.nodes.new("ShaderNodeCombineXYZ")
    zz = math_node(nt, "ADD", e, 0.05)
    for i in range(3):
        nt.links.new(zz, cz.inputs[i])
    nt.links.new(cz.outputs[0], proj.inputs[1])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.55
    nz.inputs["Detail"].default_value = 6
    nz.inputs["Roughness"].default_value = 0.6
    nt.links.new(proj.outputs[0], nz.inputs["Vector"])
    cloud = math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", nz.outputs["Fac"], 0.56), 3.0, clamp=True)
    cloud = math_node(nt, "MULTIPLY", cloud, math_node(nt, "SUBTRACT", 1.0, math_node(nt, "EXPONENT", math_node(nt, "DIVIDE", e, -0.03))))  # pas de nuages sur l'horizon même
    cl = nt.nodes.new("ShaderNodeMix")
    cl.data_type = "RGBA"
    cl.clamp_factor = True
    nt.links.new(math_node(nt, "MULTIPLY", toward, math_node(nt, "EXPONENT", math_node(nt, "DIVIDE", e, -0.25))), cl.inputs["Factor"])
    cl.inputs["A"].default_value = (0.012, 0.012, 0.03, 1)  # nuage sombre, contre-jour
    cl.inputs["B"].default_value = (0.7, 0.22, 0.3, 1)  # nuage rose, éclairé par-dessous
    m3 = nt.nodes.new("ShaderNodeMix")
    m3.data_type = "RGBA"
    m3.clamp_factor = True
    nt.links.new(math_node(nt, "MULTIPLY", cloud, 0.85), m3.inputs["Factor"])
    nt.links.new(m2.outputs["Result"], m3.inputs["A"])
    nt.links.new(cl.outputs["Result"], m3.inputs["B"])
    # étoiles : bruit blanc très seuillé, seulement haut dans le ciel sombre
    wn = nt.nodes.new("ShaderNodeTexWhiteNoise")
    wn.noise_dimensions = "3D"
    sc = nt.nodes.new("ShaderNodeVectorMath")
    sc.operation = "SCALE"
    nt.links.new(tc.outputs["Generated"], sc.inputs[0])
    sc.inputs["Scale"].default_value = 900.0
    nt.links.new(sc.outputs[0], wn.inputs["Vector"])
    star = math_node(nt, "GREATER_THAN", wn.outputs["Value"], 0.9985)
    star = math_node(nt, "MULTIPLY", star, math_node(nt, "MULTIPLY", math_node(nt, "POWER", e, 1.5), math_node(nt, "SUBTRACT", 1.0, toward)))
    add = nt.nodes.new("ShaderNodeMix")
    add.data_type = "RGBA"
    add.blend_type = "ADD"
    add.clamp_factor = True
    nt.links.new(math_node(nt, "MULTIPLY", star, 0.6), add.inputs["Factor"])
    nt.links.new(m3.outputs["Result"], add.inputs["A"])
    add.inputs["B"].default_value = (0.5, 0.5, 0.6, 1)
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(add.outputs["Result"], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


# ---------- les textures de façade ----------
def hash01(a, b, salt):
    """Un tirage dans [0, 1) propre à une cellule entière (a, b) : le même partout."""
    h = (a.astype(np.int64) * 73856093) ^ (b.astype(np.int64) * 19349663) ^ (salt * 83492791)
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF) / float(0x1000000)


def facade_tile(style):
    """Une tuile de 16 m × 16 m : RGB = lumière émise par les fenêtres
    (0..1, × E_WIN), A = vitrage (1) ou mur (0). v = 0 en bas."""
    N = TILE_PX
    px = TILE_M / N
    yy, xx = np.mgrid[0:N, 0:N]
    u, v = (xx + 0.5) * px, (yy + 0.5) * px
    warm, cool, pinkish, dim = np.array([1.0, 0.68, 0.38]), np.array([0.8, 0.9, 1.0]), np.array([1.0, 0.45, 0.65]), np.array([0.6, 0.42, 0.25])
    glass_dark = np.array([0.003, 0.005, 0.011])  # vitrage éteint : presque noir, un soupçon de bleu
    if style == "punched":  # art déco : petites fenêtres percées, logements et hôtels
        bay, fl = 2.4, 3.2
        cu, cv = u / bay, v / fl
        cx, cy = np.floor(cu).astype(np.int64), np.floor(cv).astype(np.int64)
        fx, fy = cu - cx, cv - cy
        glass = (fx > 0.27) & (fx < 0.73) & (fy > 0.3) & (fy < 0.8)
        lit = hash01(cx, cy, 1) < 0.2
        tint = hash01(cx, cy, 2)
        gain = 0.35 + 0.65 * hash01(cx, cy, 3) ** 1.5
    elif style == "bands":  # bandeaux horizontaux continus, meneaux tous les 1,6 m
        bay, fl = 1.6, 3.2
        cu, cv = u / bay, v / fl
        cx, cy = np.floor(cu).astype(np.int64), np.floor(cv).astype(np.int64)
        fx, fy = cu - cx, cv - cy
        glass = (fy > 0.32) & (fy < 0.84) & ((fx > 0.04) & (fx < 0.96))
        run = np.floor(cu / 3.0).astype(np.int64)  # allumé par groupes de trois travées
        lit = hash01(run, cy, 4) < 0.2
        tint = hash01(run, cy, 5)
        gain = 0.4 + 0.6 * hash01(run, cy, 6)
    elif style == "curtain":  # mur-rideau : vitré partout sauf les allèges et les meneaux
        bay, fl = 1.5, 3.3
        cu, cv = u / bay, v / fl
        cx, cy = np.floor(cu).astype(np.int64), np.floor(cv).astype(np.int64)
        fx, fy = cu - cx, cv - cy
        glass = (fy > 0.12) & (fy < 0.97) & (fx > 0.03) & (fx < 0.97)
        floor_lit = hash01(np.zeros_like(cy), cy, 7) < 0.22  # des plateaux entiers
        lit = floor_lit & (hash01(cx, cy, 8) < 0.8)
        tint = 0.6 + 0.4 * hash01(cx, cy, 9)  # blanc froid de bureau
        gain = 0.45 + 0.35 * hash01(cx, cy, 10)
    else:  # murs presque aveugles : parkings, locaux, quelques fenêtres
        bay, fl = 4.0, 3.2
        cu, cv = u / bay, v / fl
        cx, cy = np.floor(cu).astype(np.int64), np.floor(cv).astype(np.int64)
        fx, fy = cu - cx, cv - cy
        glass = (fx > 0.35) & (fx < 0.65) & (fy > 0.4) & (fy < 0.75) & (hash01(cx, cy, 11) < 0.5)
        lit = hash01(cx, cy, 12) < 0.1
        tint = hash01(cx, cy, 13)
        gain = 0.3 + 0.5 * hash01(cx, cy, 14)
    col = np.where((tint < 0.72)[..., None], warm, np.where((tint < 0.9)[..., None], cool, np.where((tint < 0.95)[..., None], pinkish, dim)))
    if style == "curtain":  # bureaux : plafonniers froids, quelques plateaux chauds
        col = np.where((hash01(cx, cy, 15) < 0.8)[..., None], cool, warm)
    rgb = np.where((glass & lit)[..., None], col * gain[..., None], np.where(glass[..., None], glass_dark, 0.0))
    rgba = np.concatenate([np.clip(rgb, 0, 1), glass[..., None].astype(np.float32)], axis=2).astype(np.float32)
    return rgba


def save_rgba(name, rgba, path, quality=85, srgb=True):
    """Écrit une image RGBA (lignes du bas vers le haut) en WebP ; les valeurs
    sont encodées en sRGB si demandé (le fichier se lit alors comme sRGB)."""
    h, w = rgba.shape[:2]
    out = rgba.copy()
    if srgb:
        c = out[..., :3]
        out[..., :3] = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, 1), 1 / 2.4) - 0.055)
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(out.ravel())
    img.file_format = "WEBP"
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)
    img = bpy.data.images.load(path)
    img.name = name
    img.colorspace_settings.name = "sRGB"
    return img


FACADE_IMG = {}
for st in STYLES:
    FACADE_IMG[st] = save_rgba(f"facade-{st}", facade_tile(st), os.path.join(CACHE, f"facade-{st}.webp"), quality=88)


# ---------- matières de rendu ----------
def facade_material(style):
    """Mur pastel (attribut « alb ») ou vitrage, fenêtres émissives d'après la tuile ; uv en mètres."""
    mat = bpy.data.materials.new(f"facade_{style}")
    mat.cycles.emission_sampling = "NONE"
    nt, out = nodes(mat)
    tex = image_node(nt, FACADE_IMG[style], 1.0 / TILE_M)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    base = nt.nodes.new("ShaderNodeMix")
    base.data_type = "RGBA"
    nt.links.new(tex.outputs["Alpha"], base.inputs["Factor"])
    nt.links.new(color_attr(nt, "alb"), base.inputs["A"])
    base.inputs["B"].default_value = (0.01, 0.015, 0.03, 1)
    nt.links.new(base.outputs["Result"], bsdf.inputs["Base Color"])
    # vitrage éteint : un reflet du ciel discret, pas une dalle claire
    nt.links.new(math_node(nt, "SUBTRACT", 0.75, math_node(nt, "MULTIPLY", tex.outputs["Alpha"], 0.3)), bsdf.inputs["Roughness"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    nt.links.new(math_node(nt, "MULTIPLY", tex.outputs["Alpha"], E_WIN), bsdf.inputs["Emission Strength"])
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def emissive_material(name, strength):
    """Néons, lampes : la couleur de sommet « lm_a », émise."""
    mat = bpy.data.materials.new(name)
    mat.cycles.emission_sampling = "NONE"
    nt, out = nodes(mat)
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(color_attr(nt, "lm_a"), em.inputs["Color"])
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return mat


def flat_material(name, rgb, rough=0.9, emission=None, estrength=1.0):
    mat = bpy.data.materials.new(name)
    mat.cycles.emission_sampling = "NONE"
    nt, out = nodes(mat)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = estrength
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def road_material():
    """Asphalte, et la lueur chaude des réverbères portée par l'attribut « c »."""
    mat = bpy.data.materials.new("road")
    mat.cycles.emission_sampling = "NONE"
    nt, out = nodes(mat)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.035, 0.035, 0.038, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.6, 0.3, 1)
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_type = "GEOMETRY"
    a.attribute_name = "c"
    nt.links.new(math_node(nt, "MULTIPLY", a.outputs["Fac"], 0.05), bsdf.inputs["Emission Strength"])
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def water_material():
    mat = bpy.data.materials.new("water")
    nt, out = nodes(mat)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.004, 0.009, 0.016, 1)
    bsdf.inputs["Roughness"].default_value = 0.08
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.08, 0.5, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs[0])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.0
    nz.inputs["Detail"].default_value = 6
    nt.links.new(mp.outputs[0], nz.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.2
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


# ---------- géométrie ----------
class Mesh:
    """Accumule des faces, leurs uv, des attributs de face et une couleur par
    face (« alb », albédo, ou « lm_a », couleur émise), puis crée un objet."""

    def __init__(self, name, mat, attrs=(), color=None):
        self.name, self.mat = name, mat
        self.verts, self.faces, self.uvs, self.cols = [], [], [], []
        self.attrs = {a: [] for a in attrs}
        self.color = color

    def face(self, pts, uvs=None, col=(1.0, 1.0, 1.0), **vals):
        i = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(tuple(range(i, i + len(pts))))
        self.uvs.extend(uvs or [(0.0, 0.0)] * len(pts))
        self.cols.extend([col] * len(pts))
        for a in self.attrs:
            self.attrs[a].append(vals.get(a, 0.0))

    def build(self):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(self.verts, [], self.faces)
        uv = me.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", [c for p in self.uvs for c in p])
        for a, vals in self.attrs.items():
            me.attributes.new(a, "FLOAT", "FACE").data.foreach_set("value", vals)
        if self.color:
            ca = me.color_attributes.new(self.color, "FLOAT_COLOR", "POINT")
            ca.data.foreach_set("color", [c for col in self.cols for c in (*col, 1.0)])
        me.materials.append(self.mat)
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        print(f"[city] {self.name}: {len(self.faces)} faces", flush=True)
        return ob


HOUSES = {"house", "detached", "semidetached_house", "terrace", "bungalow", "villa"}
SHEDS = {"garage", "garages", "shed", "hut", "kiosk", "cabin", "service", "toilets", "transformer_tower", "roof", "carport"}
LOW = {"industrial", "warehouse", "retail", "supermarket", "commercial", "parking", "school", "church", "sports_hall", "train_station"}
OFFICE = {"office", "tower", "skyscraper", "government", "commercial", "hotel", "civic", "apartments"}


def massing(tags, r, area, near):
    """Hauteur, bas, style de façade d'un bâtiment d'après ses tags OSM, sinon
    des valeurs plausibles pour South Beach : art déco de deux à cinq étages
    sur Ocean Drive, hôtels et condos plus hauts sur Collins."""
    kind = tags.get("building", "yes")
    if kind == "yes":
        kind = tags.get("building:part", "yes")
    tall_kind = kind in ("hotel", "apartments", "tower", "skyscraper", "office", "condominium")
    lh = 3.3 if tall_kind else 3.0
    h = osm.num(tags.get("height"))
    lv = osm.num(tags.get("building:levels"))
    if h is None and lv is not None:
        h = lv * lh + 0.8 + (osm.num(tags.get("roof:levels")) or 0) * 2.2
    if h is None:
        if kind in SHEDS or area < 35:
            h = r.uniform(3, 4.5)
        elif kind in HOUSES or area < 120:
            h = r.uniform(5, 9)
        elif kind in LOW:
            h = r.uniform(6, 12)
        elif tall_kind:
            h = r.uniform(18, 45)
        else:
            h = r.uniform(8, 16)
    minh = osm.num(tags.get("min_height"))
    if minh is None:
        minh = (osm.num(tags.get("building:min_level")) or 0) * lh
    mat = (tags.get("building:material", "") + tags.get("building:facade:material", "")).lower()
    x = r.random()
    if "glass" in mat or h >= 70:
        style = "curtain"
    elif h >= 35:
        style = "curtain" if x < 0.6 else "bands"
    elif kind == "parking" or kind in SHEDS:
        style = "blank"
    elif kind in LOW:
        style = "blank" if x < 0.5 else "bands"
    elif kind in HOUSES:
        style = "punched"
    else:
        style = "bands" if x < 0.35 else "punched"
    # albédo : pastel pour l'art déco et les hôtels bas, gris pour les tours et les parkings
    if style == "curtain":
        alb = GREYS[1] if x < 0.5 else GREYS[2]
    elif style == "blank":
        alb = r.choice(GREYS)
    else:
        alb = r.choice(PASTELS) if (h < 40 and r.random() < 0.8) else r.choice(GREYS[:2] + [GREYS[3]])
    # de nuit, les murs rendent peu : albédo réduit, pour qu'ils restent plus sombres que le ciel
    return h, minh, style, tuple(c * 0.45 for c in alb)


def extrude(m, ring, holes, z0, z1, bld, alb, bands=1, roof_alb=None, roof=None):
    """Murs (uv en mètres pour la trame des fenêtres), en `bands` bandes
    horizontales pour que la lumière par sommet suive la hauteur, et le toit."""
    r = hrand(bld, 3)
    u0 = r.uniform(0, TILE_M)
    v0 = r.randrange(0, 5) * 3.2
    for rg in [ring] + holes:
        u = u0
        for i in range(len(rg)):
            p, q = rg[i], rg[(i + 1) % len(rg)]
            L = math.hypot(q[0] - p[0], q[1] - p[1])
            if L < 0.2:
                continue
            for k in range(bands):
                za = z0 + (z1 - z0) * k / bands
                zb = z0 + (z1 - z0) * (k + 1) / bands
                m.face([(p[0], p[1], za + GROUND_Z), (q[0], q[1], za + GROUND_Z), (q[0], q[1], zb + GROUND_Z), (p[0], p[1], zb + GROUND_Z)], [(u, za + v0), (u + L, za + v0), (u + L, zb + v0), (u, zb + v0)], col=alb)
            u += L
    rm = roof or m
    ra = roof_alb or lerp3(alb, (0.08, 0.08, 0.08), 0.6)
    if not holes:
        rm.face([(x, y, z1 + GROUND_Z) for x, y in ring], [(0.0, -50.0)] * len(ring), col=ra)
        return
    loops = [[Vector((x, y, z1 + GROUND_Z)) for x, y in rg] for rg in [ring] + holes]
    flat = [p for lp in loops for p in lp]
    for tri in tessellate_polygon(loops):
        rm.face([tuple(flat[k]) for k in tri], [(0.0, -50.0)] * 3, col=ra)


def octahedron(m, x, y, z, s, col):
    """Un point lumineux lisible de partout : huit faces."""
    c = (x, y, z)
    pts = [(x + s, y, z), (x, y + s, z), (x - s, y, z), (x, y - s, z)]
    top, bot = (x, y, z + s), (x, y, z - s)
    for i in range(4):
        a, b = pts[i], pts[(i + 1) % 4]
        m.face([a, b, top], col=col)
        m.face([b, a, bot], col=col)


def dist_to_polyline(px, py, pts):
    best = 1e9
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        d = math.hypot(px - (ax + dx * t), py - (ay + dy * t))
        if d < best:
            best = d
    return best


ROAD = {  # demi-largeur (m), lueur au sol, pas des réverbères
    "motorway": (11.0, 0.8, 40), "trunk": (9.0, 1.0, 32), "primary": (8.0, 1.0, 30), "secondary": (6.5, 0.9, 30), "tertiary": (5.5, 0.75, 32),
    "link": (4.0, 0.7, 34), "residential": (4.5, 0.55, 34), "unclassified": (4.0, 0.5, 36), "living_street": (3.0, 0.45, 36), "pedestrian": (3.5, 0.5, 26),
}


def tier_of(x, y):
    d = math.hypot(x, y)
    return 0 if d < 700 else 1 if d < 2200 else 2


def build_city():
    near = osm.load(FRAME, AREA_NEAR, water=False)
    far = {"buildings": osm.load_tall(FRAME, AREA_FAR), "roads": []}
    extras = osm.load_extras(AREA_NEAR)
    P = lambda ring: [FRAME.xy(*p) for p in ring]
    t0 = time.time()

    facades = {st: facade_material(st) for st in STYLES}
    roof_mat = flat_material("roof", (0.1, 0.1, 0.11), 0.85)
    neon_mat = emissive_material("neon", E_NEON)
    lamp_mat = emissive_material("lamps", E_LAMP)
    road_mat = road_material()
    # le sable prend la lumière des hôtels et des lampadaires du front de mer : une légère émission
    sand_mat = flat_material("sand", srgb_to_lin((0.78, 0.72, 0.6)), 0.95, emission=(0.9, 0.8, 0.62), estrength=0.03)
    green_mat = flat_material("green", srgb_to_lin((0.2, 0.3, 0.14)), 0.95)
    land_mat = flat_material("land", (0.03, 0.03, 0.03), 0.95)

    # un maillage par style de façade et par palier de distance (quantification fine près de la baie)
    bld = {(st, t): Mesh(f"bld_{st}_n{t}", facades[st], color="alb") for st in STYLES for t in range(3)}
    roofs = {t: Mesh(f"roof_n{t}", roof_mat, color="alb") for t in range(3)}
    neon = {t: Mesh(f"neon_n{t}", neon_mat, color="lm_a") for t in range(3)}
    lamps = {t: Mesh(f"lamps_n{t}", lamp_mat, color="lm_a") for t in range(3)}
    roads = Mesh("roads", road_mat, ("c",))
    sand = Mesh("sand", sand_mat)
    green = Mesh("green", green_mat)

    # Ocean Drive et les autres rues à néons : la façade qui les regarde brille
    neon_ways = [rd["pts"] for rd in near["roads"] if rd["tags"].get("name") in ("Ocean Drive", "Collins Avenue", "Washington Avenue", "Española Way", "Lincoln Road")]
    ocean_drive = [rd for rd in near["roads"] if rd["tags"].get("name") == "Ocean Drive"]

    tw, td = CLEAR

    count = 0
    for src, buildings in (("near", near["buildings"]), ("far", far["buildings"])):
        for b in buildings:
            ring = b["outer"][:-1]
            holes = [h[:-1] for h in b["holes"] if len(h) >= 4]
            if len(ring) < 3:
                continue
            cx, cy = sum(x for x, _ in ring) / len(ring), sum(y for _, y in ring) / len(ring)
            d = math.hypot(cx, cy)
            tags = b["tags"]
            if tags.get("building") in ("roof", "carport", "no") or tags.get("building:part") == "roof" or tags.get("location") == "underground" or (osm.num(tags.get("layer")) or 0) < 0:
                continue
            if -tw / 2 - 14 < cx < tw / 2 + 14 and -14 < cy < td + 14:
                continue  # la place de la tour du dev
            r = hrand(b["id"])
            area = abs(ring_area(ring))
            h, minh, style, alb = massing(tags, r, area, src == "near")
            if h - minh < 1.0:
                continue
            # niveau de détail : loin de la baie, seuls les volumes qui comptent
            if src == "far":
                if h < 35:
                    continue
            elif d > 2200 and (h < 9 and area < 400):
                continue
            elif d > 4000 and h < 20:
                continue
            t = tier_of(cx, cy)
            bands = 1 if d > 1500 else min(4, 1 + int(h // 14))
            extrude(bld[(style, t)], ring, holes, minh, h, b["id"], alb, bands, roof=roofs[t])
            count += 1
            if h < 60 and minh == 0 and area > 300 and r.random() < 0.3 and d < 2500 and osm.inside((cx, cy), b["outer"]):
                s = math.sqrt(area) * r.uniform(0.1, 0.22)
                q = [(cx - s, cy - s * 0.7), (cx + s, cy - s * 0.7), (cx + s, cy + s * 0.7), (cx - s, cy + s * 0.7)]
                extrude(bld[("blank", t)], q, [], h, h + r.uniform(2.2, 4.0), b["id"] + 1, GREYS[2], 1, roof=roofs[t])
            # néons : façade tournée vers une rue à néons, à moins de 40 m, immeubles bas
            if src == "near" and 5 <= h <= 45 and d < 2600:
                dn = min(dist_to_polyline(cx, cy, w) for w in neon_ways) if neon_ways else 1e9
                if dn < 45 and r.random() < 0.85:
                    neon_facade(neon[t], ring, h, r, neon_ways)
    print(f"[city] {count} bâtiments ({time.time() - t0:.0f} s)", flush=True)

    # rues, réverbères
    for rd in near["roads"] + far["roads"]:
        street(roads, lamps, rd)
    # plages, parcs
    for pg in extras["beach"]:
        polygon_mesh(sand, P(pg["outer"]), [P(h) for h in pg["holes"]], GROUND_Z + 0.25)
    for pg in extras["green"]:
        polygon_mesh(green, P(pg["outer"]), [P(h) for h in pg["holes"]], GROUND_Z + 0.2)

    objs = {}
    for mesh in list(bld.values()) + list(roofs.values()) + list(neon.values()) + list(lamps.values()) + [roads, sand, green]:
        if mesh.faces:
            objs[mesh.name] = mesh.build()
    # terre : un grand plan sombre sous la ville, l'eau en dessous partout
    land = Mesh("land", land_mat)
    land.face([(-FAR * 2, -FAR * 2, GROUND_Z + 0.02), (FAR * 2, -FAR * 2, GROUND_Z + 0.02), (FAR * 2, FAR * 2, GROUND_Z + 0.02), (-FAR * 2, FAR * 2, GROUND_Z + 0.02)])
    objs["land"] = land.build()
    water = Mesh("water", water_material())
    water.face([(-FAR * 3, -FAR * 3, GROUND_Z - 0.3), (FAR * 3, -FAR * 3, GROUND_Z - 0.3), (FAR * 3, FAR * 3, GROUND_Z - 0.3), (-FAR * 3, FAR * 3, GROUND_Z - 0.3)])
    objs["water"] = water.build()
    objs["palms"] = palms(ocean_drive, extras)
    return objs


def polygon_mesh(m, ring, holes, z, col=(1.0, 1.0, 1.0)):
    ring = ring[:-1] if ring[0] == ring[-1] else ring
    if len(ring) < 3:
        return
    loops = [[Vector((x, y, z)) for x, y in rg] for rg in [ring] + [h[:-1] if h[0] == h[-1] else h for h in holes if len(h) >= 4]]
    flat = [p for lp in loops for p in lp]
    for tri in tessellate_polygon(loops):
        m.face([tuple(flat[k]) for k in tri], col=col)


def facing_edges(ring, ways):
    """Les arêtes du contour tournées vers une rue à néons, les plus proches d'abord."""
    ccw = ring_area(ring) > 0
    out = []
    for i in range(len(ring)):
        p, q = ring[i], ring[(i + 1) % len(ring)]
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        if L < 6:
            continue
        tx, ty = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        nx, ny = (ty, -tx) if ccw else (-ty, tx)
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        ahead = (mx + nx * 12, my + ny * 12)
        d_ahead = min(dist_to_polyline(*ahead, w) for w in ways)
        d_here = min(dist_to_polyline(mx, my, w) for w in ways)
        if d_ahead < d_here and d_here < 40:
            out.append((d_here, p, q, nx, ny, L))
    out.sort(key=lambda e: e[0])
    return out


def neon_facade(m, ring, h, r, ways):
    edges = facing_edges(ring, ways)
    if not edges:
        return
    col = r.choice(NEONS)
    for _, p, q, nx, ny, L in edges[:2]:
        ox, oy = nx * 0.15, ny * 0.15
        # corniche et bandeau au-dessus des vitrines : tubes et leur halo sur le mur, 30 cm
        for zc in (h - 0.6, 3.6 if h > 6 else h * 0.5):
            m.face([(p[0] + ox, p[1] + oy, zc + GROUND_Z), (q[0] + ox, q[1] + oy, zc + GROUND_Z), (q[0] + ox, q[1] + oy, zc + 0.3 + GROUND_Z), (p[0] + ox, p[1] + oy, zc + 0.3 + GROUND_Z)], col=col)
            # le halo du tube sur le mur : une bande plus large, bien plus faible
            hx, hy = nx * 0.06, ny * 0.06
            halo = tuple(c * 0.12 for c in col)
            m.face([(p[0] + hx, p[1] + hy, zc - 0.9 + GROUND_Z), (q[0] + hx, q[1] + hy, zc - 0.9 + GROUND_Z), (q[0] + hx, q[1] + hy, zc + 1.2 + GROUND_Z), (p[0] + hx, p[1] + hy, zc + 1.2 + GROUND_Z)], col=halo)
        # une enseigne verticale en drapeau sur un tiers des façades
        if r.random() < 0.35 and h > 8:
            fx, fy = p[0] + (q[0] - p[0]) * 0.3, p[1] + (q[1] - p[1]) * 0.3
            c2 = r.choice(NEONS)
            w, z0, z1 = 0.7, 4.0, min(h - 1.0, 4.0 + h * 0.55)
            a, b = (fx, fy), (fx + nx * w, fy + ny * w)
            m.face([(a[0], a[1], z0 + GROUND_Z), (b[0], b[1], z0 + GROUND_Z), (b[0], b[1], z1 + GROUND_Z), (a[0], a[1], z1 + GROUND_Z)], col=c2)
            m.face([(b[0], b[1], z0 + GROUND_Z), (a[0], a[1], z0 + GROUND_Z), (a[0], a[1], z1 + GROUND_Z), (b[0], b[1], z1 + GROUND_Z)], col=c2)


def street(roads, lamps, rd):
    t = rd["tags"]
    kind = t["highway"]
    half, glow, step = ROAD["link" if kind.endswith("_link") else kind]
    r = hrand(rd["id"], 1)
    warm = (1.0, 0.72, 0.42) if r.random() < 0.6 else (0.95, 0.95, 0.85)
    major = kind in ("primary", "secondary", "trunk", "motorway")
    pts = rd["pts"]
    acc = r.uniform(0, step)
    side = 1
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay)
        if L < 0.1:
            continue
        tx, ty = (bx - ax) / L, (by - ay) / L
        nx, ny = -ty, tx
        n = max(1, math.ceil(L / 30))
        for k in range(n):
            f0, f1 = k / n, (k + 1) / n
            p0 = (ax + (bx - ax) * f0, ay + (by - ay) * f0)
            p1 = (ax + (bx - ax) * f1, ay + (by - ay) * f1)
            mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
            d = math.hypot(mx, my)
            seg = L / n
            if d > 5000:
                continue
            z = GROUND_Z + 0.08
            roads.face([(p0[0] - nx * half, p0[1] - ny * half, z), (p1[0] - nx * half, p1[1] - ny * half, z), (p1[0] + nx * half, p1[1] + ny * half, z), (p0[0] + nx * half, p0[1] + ny * half, z)], c=glow * r.uniform(0.8, 1.1))
            if d > 2600:
                continue
            acc += seg
            while acc >= step:
                acc -= step
                f = 1 - acc / seg
                lx, ly = p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f
                tier = tier_of(lx, ly)
                for s in (-1, 1) if major or kind == "pedestrian" else (side,):
                    octahedron(lamps[tier], lx + nx * s * (half - 0.8), ly + ny * s * (half - 0.8), GROUND_Z + (9.0 if major else 7.0), 0.3, tuple(c * r.uniform(0.7, 1.0) for c in warm))
                side = -side


def palms(ocean_drive, extras):
    """Les cocotiers : un vrai modèle (Sketchfab, CC BY), instancié le long
    d'Ocean Drive côté parc et sur le front de mer."""
    uid = "26e787f2ff2e4c0fb004c3b0210805a3"  # « Coconut Palm » par evolveduk
    path = os.path.join(CACHE, f"{uid}.glb")
    if not os.path.exists(path):
        import urllib.request

        key = os.environ.get("SKETCHFAB_API_KEY")
        if not key:
            with open(os.path.join(ROOT, ".env")) as f:
                key = next((l.split("=", 1)[1].strip().strip("'\"") for l in f if l.startswith("SKETCHFAB_API_KEY=")), None)
        req = urllib.request.Request(f"https://api.sketchfab.com/v3/models/{uid}/download", headers={"Authorization": f"Token {key}"})
        links = json.load(urllib.request.urlopen(req))
        urllib.request.urlretrieve(links["glb"]["url"], path)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    empties = [o.name for o in new if o.type != "MESH"]
    for o in meshes:  # les transformations des empties du FBX, reportées sur les maillages
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    palm = bpy.context.view_layer.objects.active
    palm.name = palm.data.name = "palm"
    palm.parent = None
    for n in empties:
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    # les textures du modèle en 512 px, ses matières en alpha « hashed » (Cycles) ; 6,3 m → 9 m
    for img in bpy.data.images:
        if img.name.startswith("Image_") and max(img.size) > 512:
            img.scale(512, 512)
    palm.scale = (1.43, 1.43, 1.43)
    bpy.ops.object.transform_apply(scale=True)
    # les cocotiers du front de mer sont éclairés par-dessous : légère émission de leur propre texture
    for mat in palm.data.materials:
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.outputs["Color"].links and n.outputs["Color"].links[0].to_socket.name == "Base Color"), None)
        if bsdf and tex:
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = 0.35
    palm.location = (0, 0, GROUND_Z - 2000)  # l'original, hors de vue
    palm.hide_render = True

    r = random.Random(42)
    spots = []
    # le long d'Ocean Drive, côté parc (l'est), une double rangée
    for rd in ocean_drive:
        pts = rd["pts"]
        acc = 6.0
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            L = math.hypot(bx - ax, by - ay)
            if L < 0.1:
                continue
            tx, ty = (bx - ax) / L, (by - ay) / L
            # la mer est à l'est : le côté de la rue le plus à l'est (x croissant dans un repère tourné de 15°)
            ex, ey = math.sin(math.radians(90 - (HEADING - 180.0))), math.cos(math.radians(90 - (HEADING - 180.0)))
            nx, ny = -ty, tx
            if nx * ex + ny * ey < 0:
                nx, ny = -nx, -ny
            acc += L
            while acc >= 11.0:
                acc -= 11.0
                f = 1 - acc / L
                px, py = ax + (bx - ax) * f, ay + (by - ay) * f
                for off in (9.0, 20.0):
                    spots.append((px + nx * (off + r.uniform(-2, 2)), py + ny * (off + r.uniform(-2, 2))))
    # en lisière de dune : le long des bords ouest des polygones de plage (la
    # mer est à l'est), un cocotier tous les 14 m environ, un peu dans le sable
    for pg in extras["beach"]:
        ring = [FRAME.xy(*p) for p in pg["outer"]]
        xs, ys = [x for x, _ in ring], [y for _, y in ring]
        if max(ys) - min(ys) < 50:
            continue
        cx = sum(xs) / len(xs)
        for (ax, ay), (bx, by) in zip(ring, ring[1:]):
            L = math.hypot(bx - ax, by - ay)
            if L < 4 or (ax + bx) / 2 > cx or abs(by - ay) < abs(bx - ax):
                continue  # bord est, ou bord qui ne court pas le long de la dune
            n = int(L / 14)
            for k in range(n):
                f = (k + r.uniform(0.3, 0.7)) / n
                x, y = ax + (bx - ax) * f + r.uniform(3, 9), ay + (by - ay) * f
                if osm.inside((x, y), ring) and math.hypot(x, y) < 2600:
                    spots.append((x, y))
    spots = [s for s in spots if math.hypot(*s) < 2600 and not (-CLEAR[0] / 2 - 6 < s[0] < CLEAR[0] / 2 + 6 and -6 < s[1] < CLEAR[1] + 6)]
    print(f"[city] {len(spots)} palmiers", flush=True)
    root = bpy.data.objects.new("palms", None)
    scene.collection.objects.link(root)
    for i, (x, y) in enumerate(spots):
        ob = bpy.data.objects.new(f"palm_{i}", palm.data)
        ob.location = (x, y, GROUND_Z)
        ob.rotation_euler = (0, 0, r.uniform(0, 2 * math.pi))
        s = r.uniform(0.8, 1.2)
        ob.scale = (s, s, s)
        ob.parent = root
        scene.collection.objects.link(ob)
    return root


# ---------- construction ----------
sky_world()
objs = build_city()
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 3
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 2
scene.cycles.transparent_max_bounces = 4
scene.cycles.sample_clamp_indirect = 6.0
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.0
os.makedirs(OUT, exist_ok=True)
os.makedirs(CHECKS, exist_ok=True)


def render(path, w, h, samples, fmt="PNG"):
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.cycles.samples = samples
    scene.render.image_settings.file_format = fmt
    scene.render.image_settings.color_mode = "RGBA" if scene.render.film_transparent else "RGB"
    scene.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"[city] rendu {os.path.basename(path)} {w}×{h} en {time.time() - t:.0f} s", flush=True)


def camera(name, kind="PERSP"):
    cam = bpy.data.cameras.new(name)
    cam.type = kind
    cam.clip_end = FAR * 4
    ob = bpy.data.objects.new(name, cam)
    scene.collection.objects.link(ob)
    scene.camera = ob
    return cam, ob


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


# ---------- le sol en texture ----------
def ground_texture(name, size_m, cx, cy, px, dilate_m, erode_m):
    """Vue de dessus des rues, plages et parcs, et la terre là où la ville est
    (dilatation puis érosion des éléments) ; l'eau est transparente. Posée
    sur un quad au-dessus du plan d'eau : la baie et l'océan sont là où rien
    n'est bâti."""
    cam, ob = camera("top", "ORTHO")
    cam.ortho_scale = size_m
    ob.location = (cx, cy, GROUND_Z + 800)
    ob.rotation_euler = (0, 0, 0)
    hidden = []
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name not in ("roads", "sand", "green") and not o.name.startswith(("roof_", "bld_")):
            hidden.append((o, o.hide_render))
            o.hide_render = True
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    tmp = os.path.join(CACHE, f"{name}-render.png")
    render(tmp, px, px, 8)
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    for o, hr in hidden:
        o.hide_render = hr
    img = bpy.data.images.load(tmp)
    arr = np.empty(px * px * 4, np.float32)
    img.pixels.foreach_get(arr)
    arr = arr.reshape(px, px, 4)
    feat = arr[..., 3] > 0.5
    # la terre : les éléments dilatés puis érodés (fermeture), pour avaler les parcelles
    mask = feat.copy()
    m_per_px = size_m / px
    for _ in range(int(round(dilate_m / m_per_px))):
        mask = grow(mask)
    for _ in range(int(round(erode_m / m_per_px))):
        mask = ~grow(~mask)
    mask |= feat
    land_rgb = np.array([0.18, 0.175, 0.185], np.float32)  # parcelles sombres (sRGB, ≈ 0,028 linéaire)
    rgb = np.where(feat[..., None], arr[..., :3], land_rgb)  # le PNG est déjà encodé en sRGB
    rgba = np.concatenate([rgb, mask[..., None].astype(np.float32)], axis=2)
    out = save_rgba(name, rgba, os.path.join(CACHE, f"{name}.webp"), quality=80, srgb=False)
    bpy.data.objects.remove(ob)
    bpy.data.images.remove(img)
    os.remove(tmp)
    return out


def grow(m):
    g = m.copy()
    g[1:, :] |= m[:-1, :]
    g[:-1, :] |= m[1:, :]
    g[:, 1:] |= m[:, :-1]
    g[:, :-1] |= m[:, 1:]
    return g


def ground_quad(name, img, size_m, cx, cy, z):
    mat = bpy.data.materials.new(name)
    nt, out = nodes(mat)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    uv = nt.nodes.new("ShaderNodeUVMap")
    nt.links.new(uv.outputs[0], tex.inputs[0])
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    # alpha arrondi : terre ou eau, sans demi-teinte
    nt.links.new(math_node(nt, "ROUND", tex.outputs["Alpha"]), bsdf.inputs["Alpha"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.9
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    m = Mesh(name, mat)
    h = size_m / 2
    m.face([(cx - h, cy - h, z), (cx + h, cy - h, z), (cx + h, cy + h, z), (cx - h, cy + h, z)], [(0, 0), (1, 0), (1, 1), (0, 1)])
    return m.build()


# le sol en deux quads texturés : la terre là où la ville est, l'eau partout ailleurs
near_img = ground_texture("ground-near", 4096.0, 0.0, -1200.0, 2048, 50.0, 36.0)
far_img = ground_texture("ground-far", 16384.0, -2500.0, -2500.0, 1024, 64.0, 32.0)
ground_quad("ground_near", near_img, 4096.0, 0.0, -1200.0, GROUND_Z + 0.05)
ground_quad("ground_far", far_img, 16384.0, -2500.0, -2500.0, GROUND_Z - 0.05)
bpy.data.objects.remove(bpy.data.objects["land"])

# ---------- le panorama cylindrique vu de la baie ----------
if "pano" in ONLY:
    cam, eye = camera("eye", "PANO")
    cam.panorama_type = "CENTRAL_CYLINDRICAL"
    cam.central_cylindrical_range_u_min = math.radians(-ARC / 2)
    cam.central_cylindrical_range_u_max = math.radians(ARC / 2)
    cam.central_cylindrical_range_v_min = math.tan(math.radians(V_MIN))
    cam.central_cylindrical_range_v_max = math.tan(math.radians(V_MAX))
    eye.location = (0, -0.5, 0)
    eye.rotation_euler = (math.pi / 2, 0, math.pi)  # regarde vers -y : le cap de la baie
    H = round(args.width * (math.tan(math.radians(V_MAX)) - math.tan(math.radians(V_MIN))) / math.radians(ARC))
    tmp = os.path.join(CACHE, "city-render.png")
    render(tmp, args.width, H, args.samples)
    img = bpy.data.images.load(tmp)
    w = min(4096, args.width)
    img.scale(w, round(H * w / args.width))
    img.file_format = "WEBP"
    img.save(filepath=os.path.join(OUT, "city.webp"), quality=74)
    os.remove(tmp)
    bpy.data.objects.remove(eye)
    print("[city] écrit city.webp", img.size[:], flush=True)

# ---------- le ciel équirectangulaire ----------
if "sky" in ONLY:
    cam, eye = camera("sky", "PANO")
    cam.panorama_type = "EQUIRECTANGULAR"
    eye.location = (0, 0, 0)
    eye.rotation_euler = (math.pi / 2, 0, math.pi)  # le centre de l'image = le cap de la baie
    hidden = [o for o in bpy.data.objects if o.type == "MESH" and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    W = 1024 if args.preview else 4096
    tmp = os.path.join(CACHE, "sky-render.png")
    render(tmp, W, W // 2, 16)
    for o in hidden:
        o.hide_render = False
    img = bpy.data.images.load(tmp)
    # Un dégradé : rendu grand pour lisser le bruit (16 échantillons), puis réduit
    # de moitié. 4096 px bruités font 6 Mo de WebP, 2048 px lissés en font 10 Ko.
    img.scale(W // 2, W // 4)
    img.file_format = "WEBP"
    img.save(filepath=os.path.join(OUT, "sky.webp"), quality=85)
    os.remove(tmp)
    bpy.data.objects.remove(eye)
    print("[city] écrit sky.webp", img.size[:], flush=True)

# ---------- rendus de contrôle ----------
if "check" in ONLY:
    cam, eye = camera("check")
    cam.lens_unit = "FOV"
    cam.angle = math.radians(55)
    eye.location = (150, 900, 600 - WIN_H)
    look_at(eye, (0, -300, -WIN_H + 20))
    render(os.path.join(CHECKS, "check-sky.png"), 1280, 720, 16 if args.preview else 48)
    eye.location = (0, -0.5, 0)
    look_at(eye, (60, -500, -30))
    render(os.path.join(CHECKS, "check-window.png"), 1280, 720, 16 if args.preview else 48)
    cam.angle = math.radians(38)
    look_at(eye, (-140, -520, -45))  # Ocean Drive et ses néons, à droite de la vue
    render(os.path.join(CHECKS, "check-strip.png"), 1280, 720, 16 if args.preview else 48)
    bpy.data.objects.remove(eye)
print("[city] terminé", flush=True)
