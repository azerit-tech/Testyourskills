# Méthode A (« kit ») : charger des pièces de bibliothèque (glb / glTF), les ranger dans la
# collection cachée et les poser en instances, à l'échelle et dans l'orientation voulues.
import math
import os

import bpy
from mathutils import Matrix, Vector

import bench

S = bench.S


def load(name):
    """Importe un fichier d'assets ; rend ses maillages, transformations appliquées (même partagées)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(S.ASSETS, name))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    return meshes


def bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return Vector(map(min, *pts)), Vector(map(max, *pts))


def source(objs, name, rot_z=0.0, base=True):
    """Joint les morceaux en une source cachée, tournée de rot_z (pour regarder +x), origine au
    centre de l'emprise, au sol. Rend (source, dimensions)."""
    objs = [o for o in objs if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    if rot_z:
        ob.data.transform(Matrix.Rotation(rot_z, 4, "Z"))
    dims = recentre(ob, base)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    bench.hidden_collection().objects.link(ob)
    return ob, dims


def recentre(ob, base=True):
    """Origine au centre de l'emprise, au sol, d'après les sommets (pas la boîte en cache)."""
    vs = [v.co for v in ob.data.vertices]
    mn = Vector(map(min, *vs))
    mx = Vector(map(max, *vs))
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z if base else (mn.z + mx.z) / 2))
    ob.data.transform(Matrix.Translation(-c))
    ob.data.update()
    ob.location = (0, 0, 0)
    return mx - mn


def place(src, name, loc, rot_z=0.0, scale=(1, 1, 1)):
    ob = bpy.data.objects.new(name, src.data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    if not isinstance(scale, (tuple, list)):
        scale = (scale, scale, scale)
    ob.scale = scale
    return ob


def fit(src, dims, name, x_face, y0, y1, z0, z1, depth=None):
    """Pose une pièce (tournée pour regarder +x) dans une ouverture : largeur y0..y1, hauteur
    z0..z1, sa face avant au plan x_face."""
    sy = (y1 - y0) / dims.y
    sz = (z1 - z0) / dims.z
    sx = (depth / dims.x) if depth else min(sy, sz)
    return place(src, name, (x_face - dims.x * sx / 2, (y0 + y1) / 2, z0), 0.0, (sx, sy, sz))


def cap_textures(maxpx=2048):
    for img in bpy.data.images:
        try:
            w, h = img.size
        except Exception:
            continue
        if max(w, h) > maxpx:
            k = maxpx / max(w, h)
            img.scale(int(w * k), int(h * k))


def alive(o):
    try:
        return o.name in bpy.data.objects
    except ReferenceError:
        return False


def remove(objs):
    for o in objs:
        if alive(o):
            bpy.data.objects.remove(o)


def any_image(mat):
    if mat is None or not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image is not None:
            return n.image
    return None


def by_name(objs, *keys):
    return [o for o in objs if any(k.lower() in o.name.lower() for k in keys)]


def report(objs, tag):
    for o in objs:
        mn, mx = bounds([o])
        d = mx - mn
        print(f"[A] {tag} {o.name} {d.x:.2f} {d.y:.2f} {d.z:.2f}", flush=True)


ROT_FACE_PLUS_X = {"-y": math.pi / 2, "+y": -math.pi / 2, "+x": 0.0, "-x": math.pi}
