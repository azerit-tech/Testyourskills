# Méthode C du banc de réalisme (« proc ») : tout par le code.
#
# Bibliothèque : un constructeur de maillages bmesh (pavés, murs percés de baies à vrais
# tableaux, prismes, cylindres, tores, ellipsoïdes, tubes, lettres), le chanfrein appliqué
# (modificateur Bevel figé dans le maillage, pour que les instances le portent), les matériaux
# procéduraux (stuc patiné, vitres à intérieurs simulés par lancer de rayon dans le shader),
# et la carte d'usure calculée en numpy depuis le dessin même de la façade (coulures sous
# chaque appui et chaque bandeau, soubassement sale, reprises de peinture, épaufrures,
# fissures aux angles des baies).
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import scene_a as S

lin = S.lin
ATTR_V = ("rlo", "rhi", "wz", "wy")


# ---------------------------------------------------------------- maillages

def _orient(vs, want):
    """Remet un polygone dans le sens qui donne la normale voulue (méthode de Newell)."""
    n = Vector((0.0, 0.0, 0.0))
    k = len(vs)
    for i in range(k):
        a, b = vs[i].co, vs[(i + 1) % k].co
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    if n.dot(Vector(want)) < 0:
        vs = list(reversed(vs))
    return vs


class MB:
    """Un maillage en construction ; bevel > 0 : chanfrein figé à la fin (arêtes de plus de 30°)."""

    def __init__(self, name, bevel=0.0, seg=2):
        self.name, self.bevel, self.seg = name, bevel, seg
        self.bm = bmesh.new()
        self.mats = []
        self.lv = {a: self.bm.faces.layers.float_vector.new(a) for a in ATTR_V}
        self.lf = self.bm.faces.layers.float.new("rseed")

    def mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def v(self, p):
        return self.bm.verts.new(p)

    def poly(self, vs, mat, want=None, smooth=False, attrs=None):
        if want is not None:
            vs = _orient(vs, want)
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(mat)
        f.smooth = smooth
        if attrs:
            for k, val in attrs.items():
                if k == "rseed":
                    f[self.lf] = val
                else:
                    f[self.lv[k]] = val
        return f

    def quad(self, pts, mat, want=None, attrs=None, smooth=False):
        return self.poly([self.v(p) for p in pts], mat, want, smooth, attrs)

    def box(self, x0, x1, y0, y1, z0, z1, mat, attrs=None, faces=None, mats=None):
        """Pavé ; faces : sous-ensemble de ('-x','+x','-y','+y','-z','+z') ; mats : matériau par face."""
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        V = {}
        for i, x in enumerate((x0, x1)):
            for j, y in enumerate((y0, y1)):
                for k, z in enumerate((z0, z1)):
                    V[i, j, k] = self.v((x, y, z))
        spec = {
            "-x": ([(0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)], (-1, 0, 0)),
            "+x": ([(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], (1, 0, 0)),
            "-y": ([(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], (0, -1, 0)),
            "+y": ([(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)], (0, 1, 0)),
            "-z": ([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], (0, 0, -1)),
            "+z": ([(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], (0, 0, 1)),
        }
        for key, (idx, want) in spec.items():
            if faces is not None and key not in faces:
                continue
            m = (mats or {}).get(key, mat)
            self.poly([V[t] for t in idx], m, want, attrs=attrs)

    def wall(self, xf, y0, y1, z0, z1, holes, mat, rim=(), rim_d=0.3, reveal=None):
        """Mur plan (normale +x) percé de baies (ya, yb, za, zb, profondeur) à vrais tableaux.
        Une seule nappe : les arêtes des baies se chanfreinent, le nu du mur reste lisse."""
        r6 = lambda a: round(a, 5)  # noqa: E731
        ys = sorted({r6(y0), r6(y1)} | {r6(h[0]) for h in holes} | {r6(h[1]) for h in holes})
        zs = sorted({r6(z0), r6(z1)} | {r6(h[2]) for h in holes} | {r6(h[3]) for h in holes})
        F = [[self.v((xf, y, z)) for z in zs] for y in ys]
        nI, nJ = len(ys) - 1, len(zs) - 1

        def hole(yc, zc):
            for k, h in enumerate(holes):
                if h[0] < yc < h[1] and h[2] < zc < h[3]:
                    return k
            return -1
        cell = [[hole((ys[i] + ys[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2) for j in range(nJ)] for i in range(nI)]
        for i in range(nI):
            for j in range(nJ):
                if cell[i][j] < 0:
                    self.poly([F[i][j], F[i + 1][j], F[i + 1][j + 1], F[i][j + 1]], mat, (1, 0, 0))
        rm = reveal or mat
        for k, h in enumerate(holes):
            ya, yb, za, zb, d = h
            ia, ib, ja, jb = ys.index(r6(ya)), ys.index(r6(yb)), zs.index(r6(za)), zs.index(r6(zb))
            Bv = {}

            def bv(i, j):
                if (i, j) not in Bv:
                    Bv[i, j] = self.v((xf - d, ys[i], zs[j]))
                return Bv[i, j]
            for i in range(ia, ib):
                self.poly([F[i][ja], F[i + 1][ja], bv(i + 1, ja), bv(i, ja)], rm, (0, 0, 1))
                self.poly([F[i][jb], F[i + 1][jb], bv(i + 1, jb), bv(i, jb)], rm, (0, 0, -1))
            for j in range(ja, jb):
                self.poly([F[ia][j], F[ia][j + 1], bv(ia, j + 1), bv(ia, j)], rm, (0, 1, 0))
                self.poly([F[ib][j], F[ib][j + 1], bv(ib, j + 1), bv(ib, j)], rm, (0, -1, 0))
        Rv = {}

        def rv(i, j):
            if (i, j) not in Rv:
                Rv[i, j] = self.v((xf - rim_d, ys[i], zs[j]))
            return Rv[i, j]
        if "top" in rim:
            for i in range(nI):
                if cell[i][nJ - 1] < 0:
                    self.poly([F[i][nJ], F[i + 1][nJ], rv(i + 1, nJ), rv(i, nJ)], mat, (0, 0, 1))
        if "bottom" in rim:
            for i in range(nI):
                if cell[i][0] < 0:
                    self.poly([F[i][0], F[i + 1][0], rv(i + 1, 0), rv(i, 0)], mat, (0, 0, -1))
        if "left" in rim:
            for j in range(nJ):
                if cell[0][j] < 0:
                    self.poly([F[0][j], F[0][j + 1], rv(0, j + 1), rv(0, j)], mat, (0, -1, 0))
        if "right" in rim:
            for j in range(nJ):
                if cell[nI - 1][j] < 0:
                    self.poly([F[nI][j], F[nI][j + 1], rv(nI, j + 1), rv(nI, j)], mat, (0, 1, 0))

    def prism(self, pts, z0, z1, mat, smooth_max=0.5, caps=True):
        """Prisme vertical ; les petits côtés (arcs) sont lissés, les grands restent plans."""
        area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
        if area < 0:
            pts = list(reversed(pts))
        lo = [self.v((x, y, z0)) for x, y in pts]
        hi = [self.v((x, y, z1)) for x, y in pts]
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            seg = math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1])
            ex, ey = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
            self.poly([lo[i], lo[j], hi[j], hi[i]], mat, (ey, -ex, 0), smooth=seg < smooth_max)
        if caps:
            self.poly(list(reversed(lo)), mat, (0, 0, -1))
            self.poly(hi, mat, (0, 0, 1))

    def cyl(self, p0, p1, r0, mat, r1=None, seg=12, smooth=True, caps=True):
        p0, p1 = Vector(p0), Vector(p1)
        r1 = r0 if r1 is None else r1
        ax = p1 - p0
        u = ax.orthogonal().normalized()
        w = ax.cross(u).normalized()
        dirs = [u * math.cos(2 * math.pi * i / seg) + w * math.sin(2 * math.pi * i / seg) for i in range(seg)]
        a = [self.v(p0 + d * r0) for d in dirs]
        b = [self.v(p1 + d * r1) for d in dirs]
        for i in range(seg):
            j = (i + 1) % seg
            self.poly([a[i], a[j], b[j], b[i]], mat, dirs[i] + dirs[j], smooth=smooth)
        if caps:
            self.poly(list(a), mat, -ax)
            self.poly(list(b), mat, ax)

    def torus(self, c, n, R, r, mat, seg=24, rseg=8):
        c, n = Vector(c), Vector(n).normalized()
        u = n.orthogonal().normalized()
        w = n.cross(u)
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            d = u * math.cos(a) + w * math.sin(a)
            rings.append((d, [self.v(c + d * (R + r * math.cos(2 * math.pi * k / rseg)) + n * (r * math.sin(2 * math.pi * k / rseg))) for k in range(rseg)]))
        for i in range(seg):
            d0, A = rings[i]
            d1, B = rings[(i + 1) % seg]
            for k in range(rseg):
                q = (k + 1) % rseg
                ctr = c + (d0 + d1).normalized() * R
                mid = (A[k].co + A[q].co + B[k].co + B[q].co) / 4
                self.poly([A[k], B[k], B[q], A[q]], mat, mid - ctr, smooth=True)

    def ellipsoid(self, c, radii, mat, rot=None, nu=16, nv=10):
        c = Vector(c)
        rot = rot or Matrix.Identity(3)
        rx, ry, rz = radii

        def p(th, ph):
            return c + rot @ Vector((rx * math.sin(ph) * math.cos(th), ry * math.sin(ph) * math.sin(th), rz * math.cos(ph)))
        top, bot = self.v(p(0, 0)), self.v(p(0, math.pi))
        rings = [[self.v(p(2 * math.pi * i / nu, math.pi * j / nv)) for i in range(nu)] for j in range(1, nv)]
        for i in range(nu):
            q = (i + 1) % nu
            self.poly([top, rings[0][i], rings[0][q]], mat, rings[0][i].co - c, smooth=True)
            self.poly([bot, rings[-1][q], rings[-1][i]], mat, rings[-1][i].co - c, smooth=True)
            for j in range(nv - 2):
                A, B = rings[j], rings[j + 1]
                self.poly([A[i], B[i], B[q], A[q]], mat, (A[i].co + B[q].co) / 2 - c, smooth=True)

    def disc(self, c, n, r, mat, seg=24, attrs=None):
        c, n = Vector(c), Vector(n).normalized()
        u = n.orthogonal().normalized()
        w = n.cross(u)
        vs = [self.v(c + (u * math.cos(2 * math.pi * i / seg) + w * math.sin(2 * math.pi * i / seg)) * r) for i in range(seg)]
        self.poly(vs, mat, n, attrs=attrs)

    def grid(self, fn, nu, nv, mat, want, smooth=True):
        """Une nappe paramétrée fn(u, v) -> (x, y, z), u, v dans [0, 1]."""
        V = [[self.v(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                self.poly([V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]], mat, want, smooth=smooth)

    def done(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if self.bevel > 0:
            md = ob.modifiers.new("bevel", "BEVEL")
            md.width = self.bevel
            md.segments = self.seg
            md.limit_method = "ANGLE"
            md.angle_limit = math.radians(30)
            md.use_clamp_overlap = True
            freeze(ob)
        return ob


def freeze(ob, matrix=None):
    """Fige modificateurs (ou courbe, texte) dans un maillage : les instances le partagent."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    if matrix is not None:
        me.transform(matrix)
    if ob.type == "MESH":
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        bpy.data.meshes.remove(old)
        return ob
    new = bpy.data.objects.new(ob.name + "_m", me)
    bpy.context.scene.collection.objects.link(new)
    data = ob.data
    bpy.data.objects.remove(ob)
    try:
        bpy.data.curves.remove(data)
    except Exception:
        pass
    return new


_FONT = []


def basis(right, up, loc):
    r, u = Vector(right).normalized(), Vector(up).normalized()
    n = r.cross(u)
    m = Matrix((r, u, n)).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def text(body, loc, right, up, size, mat, extrude=0.025, bold=0.0, align="CENTER"):
    """Lettres en relief (Blender, police intégrée), figées en maillage dans le repère de l'immeuble."""
    if not _FONT:
        _FONT.append(bpy.data.fonts.load("<builtin>"))
    cu = bpy.data.curves.new("txt_" + body, "FONT")
    cu.body = body
    cu.font = _FONT[0]
    cu.size = size
    cu.extrude = extrude
    cu.offset = bold
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.materials.append(mat)
    ob = bpy.data.objects.new("txt_" + body, cu)
    bpy.context.scene.collection.objects.link(ob)
    return freeze(ob, basis(right, up, loc))


def tube(paths, r, mat, name="tube"):
    """Tubes (néons, câbles, fils) : polylignes à section ronde, figées en maillage."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    for pts in paths:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (p[0], p[1], p[2], 1.0)
    cu.materials.append(mat)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    return freeze(ob)


def sag(a, b, s, n=16):
    a, b = Vector(a), Vector(b)
    out = []
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t)
        p.z -= s * 4 * t * (1 - t)
        out.append(tuple(p))
    return out


def arc_pts(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def ring_sector(cx, cy, r_in, r_out, a0, a1, n=24):
    """L'emprise d'un bandeau qui suit un arrondi d'angle (secteur de couronne)."""
    return arc_pts(cx, cy, r_out, a0, a1, n) + list(reversed(arc_pts(cx, cy, r_in, a0, a1, n)))


# ---------------------------------------------------------------- nœuds

def vm(N, op, a, b=None, scale=None):
    n = N.new("ShaderNodeVectorMath", _operation=op)
    if isinstance(a, tuple):
        a = a[:3]
    if isinstance(b, tuple):
        b = b[:3]
    N.set(n.inputs[0], a)
    if b is not None:
        N.set(n.inputs[1], b)
    if scale is not None:
        N.set(n.inputs["Scale"], scale)
    return n.outputs[1] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else n.outputs[0]


def cxyz(N, x, y, z):
    c = N.new("ShaderNodeCombineXYZ")
    N.set(c.inputs[0], x)
    N.set(c.inputs[1], y)
    N.set(c.inputs[2], z)
    return c.outputs[0]


def attr(N, name, kind="GEOMETRY"):
    return N.new("ShaderNodeAttribute", _attribute_type=kind, _attribute_name=name)


def noise(N, vec, scale, detail=4.0, rough=0.55, mapping=None):
    if mapping is not None:
        mp = N.new("ShaderNodeMapping", Scale=mapping)
        N.link(vec, mp.inputs[0])
        vec = mp.outputs[0]
    t = N.new("ShaderNodeTexNoise", Scale=scale, Detail=detail, Roughness=rough)
    N.link(vec, t.inputs["Vector"])
    return t.outputs[0]


def band(N, v, a, b):
    """1 si a < v < b."""
    return N.math("MULTIPLY", N.math("GREATER_THAN", v, a), N.math("LESS_THAN", v, b))


def white(N, w):
    n = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="1D")
    N.set(n.inputs["W"], w)
    return n.outputs[0], N.sep(n.outputs[1])


def ramp_const(N, fac, stops):
    out = N.ramp(fac, stops)
    out.node.color_ramp.interpolation = "CONSTANT"
    return out


# ---------------------------------------------------------------- matériaux

def mat_stucco(name, wx, kind, corner, rough=0.85):
    """Stuc peint. Teinte de l'objet (Object Info : une couleur par instance) ; bandeaux et
    moulures plus blancs (trim) ou dans la couleur d'accent de l'objet (propriété « accent »,
    sinon une teinte voisine calculée). La carte d'usure de la façade donne coulures, reprises,
    épaufrures et fissures ; l'occlusion ambiante salit les angles rentrants."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    x, y, z = N.sep(P)
    CX, CY, RC = corner
    # l'arrondi d'angle est déplié : la carte suit le mur dans l'arc
    inC = N.math("MULTIPLY", N.math("LESS_THAN", y, CY), N.math("GREATER_THAN", x, CX - 0.05))
    th = N.math("ARCTAN2", N.math("SUBTRACT", y, CY), N.math("SUBTRACT", x, CX))
    U = N.mixf(inC, y, N.math("ADD", CY, N.math("MULTIPLY", th, RC)))
    onmap = N.math("GREATER_THAN", x, CX - 0.05)
    uu = N.math("DIVIDE", N.math("SUBTRACT", U, wx.y0), wx.W)
    vv = N.math("DIVIDE", N.math("SUBTRACT", z, wx.z0), wx.H)
    tex = N.new("ShaderNodeTexImage")
    tex.image = wx.image
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"
    N.link(cxyz(N, uu, vv, 0.0), tex.inputs["Vector"])
    sc = N.new("ShaderNodeSeparateColor")
    N.link(tex.outputs["Color"], sc.inputs[0])
    R, G, B = sc.outputs[0], sc.outputs[1], sc.outputs[2]
    A = tex.outputs["Alpha"]
    R, G = N.math("MULTIPLY", R, onmap), N.mixf(onmap, 0.5, G)
    B, A = N.math("MULTIPLY", B, onmap), N.math("MULTIPLY", A, onmap)
    # hors carte (murs mitoyens, édicules du toit) : des coulures de bruit
    vs = noise(N, P, 1.0, 4.0, 0.6, mapping=(3.0, 3.0, 0.14))
    proc = N.math("MULTIPLY", N.math("SUBTRACT", vs, 0.42, clamp=True), 1.4)
    dirt = N.math("ADD", R, N.math("MULTIPLY", proc, N.math("SUBTRACT", 1.0, onmap)))
    info = N.new("ShaderNodeObjectInfo")
    base = info.outputs["Color"]
    if kind == "trim":
        base = N.mix(0.8, base, lin("#f6f1e7"))
    elif kind == "accent":
        acc = attr(N, "accent", "OBJECT")
        has = N.math("GREATER_THAN", vm(N, "LENGTH", acc.outputs["Vector"]), 0.001)
        hs = N.new("ShaderNodeHueSaturation", Hue=0.68, Saturation=1.6, Value=0.8, Fac=1.0)
        N.link(base, hs.inputs["Color"])
        base = N.mix(has, hs.outputs[0], acc.outputs["Color"])
    # reprises de peinture : plaques de la carte et dérive très lente de teinte
    lf = noise(N, P, 0.11, 2.0, 0.5)
    tint = N.math("ADD", N.math("MULTIPLY", N.math("SUBTRACT", G, 0.5), 0.6), N.math("MULTIPLY", N.math("SUBTRACT", lf, 0.5), 0.35))
    hs2 = N.new("ShaderNodeHueSaturation", Fac=1.0)
    N.link(N.math("ADD", 0.5, N.math("MULTIPLY", N.math("SUBTRACT", lf, 0.5), 0.05)), hs2.inputs["Hue"])
    N.link(N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", G, 0.5), 0.5)), hs2.inputs["Saturation"])
    N.link(N.math("ADD", 1.0, N.math("MULTIPLY", tint, 0.9)), hs2.inputs["Value"])
    N.link(base, hs2.inputs["Color"])
    col = hs2.outputs[0]
    # grain de l'enduit
    gr = noise(N, P, 9.0, 8.0, 0.62)
    fine = noise(N, P, 90.0, 3.0, 0.5)
    col = vm(N, "SCALE", col, scale=N.math("ADD", 0.88, N.math("MULTIPLY", gr, 0.22)))
    # coulures et crasse
    col = N.mix(N.math("MULTIPLY", N.math("MINIMUM", dirt, 1.0), 0.88), col, vm(N, "MULTIPLY", col, (0.32, 0.30, 0.29)))
    ao = N.new("ShaderNodeAmbientOcclusion", Distance=0.5, _samples=4, _only_local=True)
    occ = N.math("SUBTRACT", 1.0, ao.outputs["AO"])
    col = N.mix(N.math("MULTIPLY", occ, 0.75), col, vm(N, "MULTIPLY", col, (0.45, 0.42, 0.42)))
    # épaufrures (l'enduit blanc-gris dessous) et fissures
    col = N.mix(B, col, lin("#c4bcae"))
    col = N.mix(N.math("MULTIPLY", A, 0.38), col, (0.12, 0.1, 0.09, 1))
    # pied de mur qui a bu la pluie
    edge = N.math("ADD", 0.3, N.math("MULTIPLY", noise(N, P, 2.0, 3.0), 0.5))
    wet = N.math("SUBTRACT", 1.0, N.math("DIVIDE", N.math("SUBTRACT", z, edge), 0.2), clamp=True)
    col = N.mix(N.math("MULTIPLY", wet, 0.8), col, vm(N, "MULTIPLY", col, (0.5, 0.48, 0.5)))
    r = N.math("SUBTRACT", rough, N.math("MULTIPLY", N.math("MINIMUM", dirt, 1.0), 0.25))
    r = N.mixf(wet, r, 0.35)
    h = N.math("ADD", N.math("MULTIPLY", gr, 0.6), N.math("MULTIPLY", fine, 0.3))
    h = N.math("SUBTRACT", h, N.math("ADD", N.math("MULTIPLY", B, 0.5), N.math("MULTIPLY", A, 0.8)))
    bump = N.new("ShaderNodeBump", Strength=0.28, Distance=0.004)
    N.link(h, bump.inputs["Height"])
    p = S.principled(N, **{"Specular IOR Level": 0.4})
    N.link(col, p.inputs["Base Color"])
    N.link(r, p.inputs["Roughness"])
    N.link(bump.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_room_glass(name, gain=1.0):
    """Vitre et chambre simulée derrière. Chaque vitre porte, en attributs de face, la boîte de
    sa pièce (rlo, rhi), sa baie (wz, wy) et une graine (rseed). Le shader lance le rayon de la
    caméra dans la boîte : mur du fond, cloisons, sol, plafond, un meuble en silhouette, une
    lampe et sa chaleur ; stores vénitiens à des hauteurs diverses, voilages, rideaux ; par-dessus,
    le reflet du ciel et de la rue (Fresnel), chaque vitre un peu voilée et désaxée."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    geo = N.new("ShaderNodeNewGeometry")
    vt = N.new("ShaderNodeVectorTransform", _vector_type="VECTOR", _convert_from="WORLD", _convert_to="OBJECT")
    N.link(geo.outputs["Incoming"], vt.inputs[0])
    d = vm(N, "NORMALIZE", vm(N, "SCALE", vt.outputs[0], scale=-1.0))
    d = vm(N, "ADD", d, (1e-5, 1e-5, 1e-5))
    lo, hi = attr(N, "rlo").outputs["Vector"], attr(N, "rhi").outputs["Vector"]
    seed = attr(N, "rseed").outputs["Fac"]
    size = vm(N, "SUBTRACT", hi, lo)
    tm = vm(N, "MAXIMUM", vm(N, "DIVIDE", vm(N, "SUBTRACT", lo, P), d), vm(N, "DIVIDE", vm(N, "SUBTRACT", hi, P), d))
    tx, ty, tz = N.sep(tm)
    tyz = N.math("MINIMUM", ty, tz)
    t = N.math("MINIMUM", tx, tyz)
    H = vm(N, "ADD", P, vm(N, "SCALE", d, scale=t))
    u = vm(N, "DIVIDE", vm(N, "SUBTRACT", H, lo), size)
    ux, uy, uz = N.sep(u)
    dx, dy, dz = N.sep(d)
    isX = N.math("LESS_THAN", tx, N.math("ADD", tyz, 1e-4))
    notX = N.math("SUBTRACT", 1.0, isX)
    isZ = N.math("MULTIPLY", notX, N.math("LESS_THAN", tz, N.math("ADD", ty, 1e-4)))
    isY = N.math("MULTIPLY", notX, N.math("SUBTRACT", 1.0, isZ))
    flo = N.math("MULTIPLY", isZ, N.math("LESS_THAN", dz, 0.0))
    cei = N.math("SUBTRACT", isZ, flo)
    # tirages au sort de la pièce
    r0, (r1, r2, r3) = white(N, seed)
    r4, (r5, r6, r7) = white(N, N.math("ADD", seed, 17.31))
    wallc = ramp_const(N, r0, [(0.0, lin("#e9d9bd")), (0.2, lin("#e2b99d")), (0.36, lin("#b9c3a5")), (0.5, lin("#d8aaa6")),
                               (0.64, lin("#aeb6cc")), (0.78, lin("#d9b872")), (0.9, lin("#efe9de"))])
    side = vm(N, "SCALE", wallc, scale=0.82)
    alb = N.mix(isY, wallc, side)
    # un cadre au mur du fond, une porte sur une cloison, la plinthe
    pic = N.math("MULTIPLY", N.math("MULTIPLY", isX, band(N, uy, N.math("ADD", 0.12, N.math("MULTIPLY", r1, 0.45)), N.math("ADD", 0.38, N.math("MULTIPLY", r1, 0.45)))), band(N, uz, 0.42, 0.66))
    picc = ramp_const(N, r2, [(0.0, lin("#3b4a5e")), (0.3, lin("#7a4a3a")), (0.6, lin("#c9b27a")), (0.8, lin("#2f3b33"))])
    alb = N.mix(pic, alb, picc)
    door = N.math("MULTIPLY", N.math("MULTIPLY", isY, band(N, ux, 0.12, 0.4)), N.math("LESS_THAN", uz, 0.76))
    alb = N.mix(N.math("MULTIPLY", door, N.math("GREATER_THAN", r3, 0.35)), alb, lin("#6b4a33"))
    skirt = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, isZ), N.math("LESS_THAN", uz, 0.035))
    alb = N.mix(skirt, alb, lin("#efe9df"))
    # sol (parquet ou moquette) et plafond
    hx, hy, hz = N.sep(H)
    plank = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", hy, 0.16)), 0.93)
    wood = vm(N, "SCALE", lin("#7a5236"), scale=N.math("ADD", 0.6, N.math("MULTIPLY", plank, 0.4)))
    floorc = N.mix(N.math("GREATER_THAN", r5, 0.55), wood, ramp_const(N, r6, [(0.0, lin("#8b6f5a")), (0.5, lin("#5c5f6e")), (0.8, lin("#9a7b62"))]))
    alb = N.mix(flo, alb, floorc)
    alb = N.mix(cei, alb, lin("#efe8db"))
    # la lampe : plafonnier au milieu, ou lampadaire dans un coin du fond
    ceil_lamp = N.math("GREATER_THAN", r3, 0.5)
    Lu = N.new("ShaderNodeMix", _data_type="VECTOR")
    N.link(ceil_lamp, Lu.inputs["Factor"])
    N.link(cxyz(N, 0.2, N.mixf(N.math("GREATER_THAN", r4, 0.5), 0.12, 0.88), 0.55), Lu.inputs[4])
    N.set(Lu.inputs[5], (0.55, 0.5, 0.96))
    Lw = vm(N, "ADD", lo, vm(N, "MULTIPLY", Lu.outputs[1], size))
    dist2 = vm(N, "DOT_PRODUCT", vm(N, "SUBTRACT", H, Lw), vm(N, "SUBTRACT", H, Lw))
    lit = N.math("GREATER_THAN", r7, 0.3)
    pw = N.math("MULTIPLY", lit, N.math("ADD", 0.7, N.math("MULTIPLY", r5, 1.8)))
    E = N.math("ADD", N.math("DIVIDE", pw, N.math("ADD", 0.35, dist2)), N.math("ADD", 0.02, N.math("MULTIPLY", ux, 0.05)))
    lampc = N.ramp(r6, [(0.0, lin("#ff9a48")), (0.35, lin("#ffc06e")), (0.75, lin("#ffe3b8")), (0.92, lin("#fff4e4")), (0.97, lin("#c8ccff"))])
    room = vm(N, "SCALE", vm(N, "MULTIPLY", alb, lampc), scale=E)
    # le plafonnier se voit (abat-jour lumineux)
    shade = N.math("MULTIPLY", N.math("MULTIPLY", cei, ceil_lamp), N.math("LESS_THAN", dist2, 0.05))
    room = N.mix(N.math("MULTIPLY", shade, lit), room, vm(N, "SCALE", lampc, scale=6.0))
    # télévision dans les pièces éteintes : une lueur froide et basse
    tv = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, lit), N.math("GREATER_THAN", r1, 0.7))
    room = vm(N, "ADD", room, vm(N, "SCALE", vm(N, "MULTIPLY", alb, lin("#9fa6ff")), scale=N.math("MULTIPLY", tv, N.math("MULTIPLY", N.math("SUBTRACT", 1.0, uz), 0.35))))
    # un meuble en silhouette dans un plan intermédiaire
    xf = N.math("ADD", N.sep(lo)[0], N.math("MULTIPLY", N.sep(size)[0], N.math("ADD", 0.45, N.math("MULTIPLY", r2, 0.3))))
    px_, py_, pz_ = N.sep(P)
    tf = N.math("DIVIDE", N.math("SUBTRACT", xf, px_), dx)
    Hf = vm(N, "ADD", P, vm(N, "SCALE", d, scale=tf))
    uf = vm(N, "DIVIDE", vm(N, "SUBTRACT", Hf, lo), size)
    fx_, fy_, fz_ = N.sep(uf)
    a0 = N.math("ADD", 0.08, N.math("MULTIPLY", r4, 0.4))
    low = N.math("MULTIPLY", band(N, fy_, a0, N.math("ADD", a0, 0.48)), N.math("LESS_THAN", fz_, N.math("ADD", 0.16, N.math("MULTIPLY", band(N, fy_, a0, N.math("ADD", a0, 0.06)), 0.12))))
    tall = N.math("MULTIPLY", band(N, fy_, N.math("SUBTRACT", 0.9, N.math("MULTIPLY", r7, 0.2)), N.math("SUBTRACT", 1.08, N.math("MULTIPLY", r7, 0.2))), N.math("LESS_THAN", fz_, 0.72))
    shape = N.math("MAXIMUM", N.math("MULTIPLY", low, N.math("GREATER_THAN", r2, 0.25)), N.math("MULTIPLY", tall, N.math("GREATER_THAN", r1, 0.45)))
    furn = N.math("MULTIPLY", shape, N.math("LESS_THAN", tf, t))
    furnc = vm(N, "SCALE", vm(N, "MULTIPLY", ramp_const(N, r5, [(0.0, lin("#5a3b2c")), (0.4, lin("#40465a")), (0.7, lin("#8c7a64"))]), lampc), scale=N.math("MULTIPLY", N.math("ADD", 0.12, N.math("MULTIPLY", pw, 0.25)), N.math("ADD", 0.4, fz_)))
    room = N.mix(furn, room, furnc)
    # stores et rideaux, au droit de la vitre
    wz, wy = attr(N, "wz").outputs["Vector"], attr(N, "wy").outputs["Vector"]
    z0, z1, bf = N.sep(wz)
    y0, y1, ck = N.sep(wy)
    v = N.math("DIVIDE", N.math("SUBTRACT", pz_, z0), N.math("SUBTRACT", z1, z0))
    w = N.math("DIVIDE", N.math("SUBTRACT", py_, y0), N.math("SUBTRACT", y1, y0))
    glowback = vm(N, "SCALE", lampc, scale=N.math("ADD", 0.03, N.math("MULTIPLY", pw, 0.32)))
    slat = N.math("ADD", 0.72, N.math("MULTIPLY", N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", pz_, 0.045)), 0.78), 0.28))
    blind = N.math("GREATER_THAN", v, N.math("SUBTRACT", 1.0, bf))
    blindc = vm(N, "SCALE", vm(N, "MULTIPLY", lin("#e6dcc8"), glowback), scale=slat)
    cw = N.math("ADD", 0.1, N.math("MULTIPLY", r4, 0.22))
    curt = N.math("MULTIPLY", N.math("GREATER_THAN", ck, 0.5), N.math("MAXIMUM", N.math("LESS_THAN", w, cw), N.math("GREATER_THAN", w, N.math("SUBTRACT", 1.0, N.math("MULTIPLY", cw, N.math("ADD", 0.5, r1))))))
    fold = N.math("ADD", 0.65, N.math("MULTIPLY", N.math("ADD", 0.5, N.math("MULTIPLY", N.math("SINE", N.math("MULTIPLY", py_, 52.0)), 0.5)), 0.35))
    curtc = vm(N, "SCALE", vm(N, "MULTIPLY", ramp_const(N, r2, [(0.0, lin("#e8d8b8")), (0.35, lin("#c98b6e")), (0.6, lin("#8a8fbf")), (0.8, lin("#e9e1d6"))]), glowback), scale=N.math("MULTIPLY", fold, 1.4))
    sheer = N.math("MULTIPLY", N.math("GREATER_THAN", ck, 0.85), 0.55)
    room = N.mix(sheer, room, vm(N, "ADD", vm(N, "SCALE", room, scale=0.35), vm(N, "SCALE", lin("#f2e6d0"), scale=N.math("ADD", 0.02, N.math("MULTIPLY", pw, 0.22)))))
    room = N.mix(curt, room, curtc)
    room = N.mix(blind, room, blindc)
    em = N.new("ShaderNodeEmission", Strength=gain)
    N.link(room, em.inputs["Color"])
    # la vitre : reflet, un peu voilé et désaxé d'une vitre à l'autre (verre ancien)
    tilt = cxyz(N, 1.0, N.math("MULTIPLY", N.math("SUBTRACT", r5, 0.5), 0.05), N.math("MULTIPLY", N.math("SUBTRACT", r6, 0.5), 0.05))
    nt = N.new("ShaderNodeVectorTransform", _vector_type="NORMAL", _convert_from="OBJECT", _convert_to="WORLD")
    N.link(tilt, nt.inputs[0])
    nn = vm(N, "NORMALIZE", nt.outputs[0])
    gl = N.new("ShaderNodeBsdfGlossy", Color=(0.92, 0.92, 0.95, 1))
    N.link(N.math("ADD", 0.015, N.math("MULTIPLY", r0, 0.05)), gl.inputs["Roughness"])
    N.link(nn, gl.inputs["Normal"])
    fr = N.new("ShaderNodeFresnel", IOR=1.5)
    N.link(nn, fr.inputs["Normal"])
    mx = N.new("ShaderNodeMixShader")
    N.link(N.math("ADD", fr.outputs[0], 0.03), mx.inputs[0])
    N.link(em.outputs[0], mx.inputs[1])
    N.link(gl.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_shop_glass(name="C_shop_glass"):
    """Vitrine : transparente, reflet Fresnel, un film de poussière plus dense en bas."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    z = N.sep(P)[2]
    lw = N.new("ShaderNodeLayerWeight", Blend=0.1)
    dust = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, N.math("DIVIDE", z, 1.2), clamp=True), 0.25)
    f = N.math("ADD", N.math("MULTIPLY", lw.outputs["Fresnel"], 0.85), 0.05)
    g = N.new("ShaderNodeBsdfGlossy", Color=(0.9, 0.9, 0.92, 1))
    N.link(N.math("ADD", 0.01, N.math("MULTIPLY", noise(N, P, 3.0), 0.03)), g.inputs["Roughness"])
    t = N.new("ShaderNodeBsdfTransparent", Color=(0.9, 0.9, 0.88, 1))
    df = N.new("ShaderNodeBsdfDiffuse", Color=(0.35, 0.33, 0.3, 1))
    m1 = N.new("ShaderNodeMixShader")
    N.link(dust, m1.inputs[0])
    N.link(t.outputs[0], m1.inputs[1])
    N.link(df.outputs[0], m1.inputs[2])
    mx = N.new("ShaderNodeMixShader")
    N.link(f, mx.inputs[0])
    N.link(m1.outputs[0], mx.inputs[1])
    N.link(g.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_pbr(name, color, rough=0.5, metal=0.0, noise_amt=0.0, coat=0.0, bump=0.0, sheen=0.0):
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    p = S.principled(N, **{"Metallic": metal, "Coat Weight": coat, "Coat Roughness": 0.05, "Sheen Weight": sheen})
    col = lin(color) if isinstance(color, str) else color
    if noise_amt:
        n = noise(N, P, 6.0, 5.0)
        N.link(vm(N, "SCALE", col, scale=N.math("ADD", 1.0 - noise_amt, N.math("MULTIPLY", n, 2 * noise_amt))), p.inputs["Base Color"])
        N.link(N.math("ADD", rough * 0.8, N.math("MULTIPLY", n, rough * 0.4)), p.inputs["Roughness"])
    else:
        N.set(p.inputs["Base Color"], col)
        N.set(p.inputs["Roughness"], rough)
    if bump:
        b = N.new("ShaderNodeBump", Strength=bump, Distance=0.003)
        N.link(noise(N, P, 40.0, 4.0), b.inputs["Height"])
        N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_vitrolite(name="C_vitrolite"):
    """Verre opaque noir des devantures Art déco : poli, en plaques à joints fins."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    x, y, z = N.sep(P)
    jy = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", N.math("ADD", y, x), 0.6)), 0.015)
    jz = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", z, 0.38)), 0.02)
    j = N.math("MAXIMUM", jy, jz)
    n = noise(N, P, 1.5, 3.0)
    p = S.principled(N, **{"Coat Weight": 1.0, "Coat Roughness": 0.03})
    N.link(N.mix(j, vm(N, "SCALE", lin("#14161c"), scale=N.math("ADD", 0.7, N.math("MULTIPLY", n, 0.6))), (0.2, 0.19, 0.18, 1)), p.inputs["Base Color"])
    N.link(N.math("ADD", 0.12, N.math("MULTIPLY", j, 0.6)), p.inputs["Roughness"])
    b = N.new("ShaderNodeBump", Strength=0.3, Distance=0.002)
    N.link(N.math("SUBTRACT", 1.0, j), b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_terrazzo(name, c1, c2, checker=0.0):
    """Terrazzo poli (éclats de Voronoi), en damier si checker > 0 (taille de case en m)."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    vo = N.new("ShaderNodeTexVoronoi", Scale=60.0)
    N.link(P, vo.inputs["Vector"])
    chip = N.math("GREATER_THAN", N.sep(vo.outputs["Color"])[0], 0.8)
    if checker:
        x, y, z = N.sep(P)
        a = N.math("FLOORED_MODULO", N.math("ADD", N.math("FLOOR", N.math("DIVIDE", x, checker)), N.math("FLOOR", N.math("DIVIDE", y, checker))), 2.0)
        base = N.mix(a, lin(c1), lin(c2))
    else:
        base = lin(c1)
    col = N.mix(N.math("MULTIPLY", chip, 0.5), base, (0.55, 0.5, 0.45, 1))
    p = S.principled(N, Roughness=0.12)
    N.link(col, p.inputs["Base Color"])
    N.link(N.math("ADD", 0.08, N.math("MULTIPLY", noise(N, P, 2.0), 0.18)), p.inputs["Roughness"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_wood(name, color="#5b3824", stripe_axis=2, period=0.05):
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    c = N.sep(P)[stripe_axis]
    flute = N.math("ADD", 0.5, N.math("MULTIPLY", N.math("SINE", N.math("MULTIPLY", c, 2 * math.pi / period)), 0.5))
    n = noise(N, P, 3.0, 6.0, mapping=(1.0, 1.0, 12.0))
    p = S.principled(N, **{"Coat Weight": 0.4, "Coat Roughness": 0.15})
    N.link(vm(N, "SCALE", lin(color), scale=N.math("ADD", 0.6, N.math("MULTIPLY", n, 0.6))), p.inputs["Base Color"])
    N.set(p.inputs["Roughness"], 0.45)
    b = N.new("ShaderNodeBump", Strength=0.4, Distance=0.006)
    N.link(flute, b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_neon(name, color, strength):
    """Tube néon : cœur émissif, gaine de verre légèrement brillante."""
    m, N, out = S.material(name)
    e = N.new("ShaderNodeEmission", Color=lin(color), Strength=strength)
    N.link(e.outputs[0], out.inputs[0])
    return m


def mat_awning(name, c1, c2="#efe6d4", period=0.5):
    """Toile rayée, un peu translucide (la lumière de la salle passe au travers), plis."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    y = N.sep(P)[1]
    st = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", y, period)), 0.5)
    col = N.mix(st, lin(c1), lin(c2))
    n = noise(N, P, 5.0, 4.0)
    col = vm(N, "SCALE", col, scale=N.math("ADD", 0.8, N.math("MULTIPLY", n, 0.3)))
    p = S.principled(N, **{"Roughness": 0.75, "Sheen Weight": 0.3})
    N.link(col, p.inputs["Base Color"])
    tl = N.new("ShaderNodeBsdfTranslucent")
    N.link(col, tl.inputs["Color"])
    mx = N.new("ShaderNodeMixShader")
    N.set(mx.inputs[0], 0.35)
    N.link(p.outputs[0], mx.inputs[1])
    N.link(tl.outputs[0], mx.inputs[2])
    b = N.new("ShaderNodeBump", Strength=0.3, Distance=0.01)
    N.link(noise(N, P, 2.5, 2.0, mapping=(1.0, 3.0, 1.0)), b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_louvre(name, color, period=0.035, axis=2, metal=0.3):
    """Tôle à ailettes (climatiseurs, grilles) : rainures par bosselage."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    c = N.sep(P)[axis]
    g = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", c, period)), 0.5)
    n = noise(N, P, 4.0, 4.0)
    p = S.principled(N, Metallic=metal)
    N.link(vm(N, "SCALE", lin(color), scale=N.math("ADD", 0.55, N.math("MULTIPLY", n, 0.5))), p.inputs["Base Color"])
    N.link(N.math("ADD", 0.4, N.math("MULTIPLY", n, 0.3)), p.inputs["Roughness"])
    b = N.new("ShaderNodeBump", Strength=0.6, Distance=0.006)
    N.link(g, b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_glass(name, color, rough=0.05):
    m, N, out = S.material(name)
    p = S.principled(N, **{"Base Color": lin(color), "Roughness": rough, "Transmission Weight": 1.0, "IOR": 1.5})
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_roof(name="C_roof"):
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    n = noise(N, P, 0.4, 6.0)
    p = S.principled(N)
    N.link(N.ramp(n, [(0.3, lin("#3a3740")), (0.7, lin("#5c5761"))]), p.inputs["Base Color"])
    N.link(N.ramp(n, [(0.42, (0.15, 0.15, 0.15)), (0.55, (0.7, 0.7, 0.7))]), p.inputs["Roughness"])
    N.link(p.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------- carte d'usure

def _vnoise(rng, h, w, ch, cw):
    """Bruit de valeur lissé (cellules de ch × cw pixels)."""
    gh, gw = int(h / ch) + 3, int(w / cw) + 3
    g = rng.random((gh, gw), dtype=np.float32)
    yy = np.arange(h, dtype=np.float32) / ch
    xx = np.arange(w, dtype=np.float32) / cw
    iy, ix = yy.astype(np.int32), xx.astype(np.int32)
    fy, fx = yy - iy, xx - ix
    fy, fx = (fy * fy * (3 - 2 * fy))[:, None], (fx * fx * (3 - 2 * fx))[None, :]
    top = g[iy][:, ix] * (1 - fx) + g[iy][:, ix + 1] * fx
    bot = g[iy + 1][:, ix] * (1 - fx) + g[iy + 1][:, ix + 1] * fx
    return top * (1 - fy) + bot * fy


def _fbm(rng, h, w, cell, octaves=4):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for k in range(octaves):
        c = max(1.5, cell / 2 ** k)
        out += amp * _vnoise(rng, h, w, c, c)
        tot += amp
        amp *= 0.5
    return out / tot


class Weather:
    """La carte d'usure d'une façade, dans son plan déplié (u = y le long du mur, arrondi d'angle
    déplié ; v = z). R : coulures et crasse ; G : reprises de peinture (0,5 neutre) ;
    B : épaufrures ; A : fissures. On y inscrit appuis, bandeaux, baies et descentes d'eau
    pendant la construction, puis bake() dessine tout d'un coup."""

    def __init__(self, name, y0, y1, z0, z1, px=0.0125, seed=11):
        self.y0, self.z0, self.px = y0, z0, px
        self.nx, self.nz = int(round((y1 - y0) / px)), int(round((z1 - z0) / px))
        self.W, self.H = self.nx * px, self.nz * px
        self.ledges, self.openings, self.pipes, self.arrises = [], [], [], []
        self.rng = np.random.default_rng(seed)
        self.image = bpy.data.images.new(name, self.nx, self.nz, alpha=True, float_buffer=False)
        self.image.colorspace_settings.name = "Non-Color"
        self.image.alpha_mode = "CHANNEL_PACKED"

    def ledge(self, ya, yb, z, s=1.0):
        self.ledges.append((ya, yb, z, s))

    def opening(self, ya, yb, za, zb):
        self.openings.append((ya, yb, za, zb))

    def c(self, y):
        return int(np.clip((y - self.y0) / self.px, 0, self.nx))

    def r(self, z):
        return int(np.clip((z - self.z0) / self.px, 0, self.nz))

    def bake(self):
        h, w, px, rng = self.nz, self.nx, self.px, self.rng
        Z = (np.arange(h, dtype=np.float32) * px + self.z0)[:, None]
        Y = (np.arange(w, dtype=np.float32) * px + self.y0)[None, :]
        dirt = np.zeros((h, w), np.float32)

        def scr(a, b):
            return 1 - (1 - a) * (1 - b)
        # coulures sous chaque appui, bandeau, climatiseur
        for (ya, yb, zl, s) in self.ledges:
            L = yb - ya
            r0, r1, c0, c1 = self.r(zl - 0.16), self.r(zl), self.c(ya + 0.02), self.c(yb - 0.02)
            if r1 > r0 and c1 > c0:
                dz = (zl - Z[r0:r1]) / 0.16
                dirt[r0:r1, c0:c1] = scr(dirt[r0:r1, c0:c1], (1 - dz) ** 2 * 0.3 * min(s, 1.2))
            centers = [(ya + rng.uniform(0.02, 0.14), True), (yb - rng.uniform(0.02, 0.14), True)]
            centers += [(y, False) for y in rng.uniform(ya + 0.08, yb - 0.08, size=max(0, int(L / 0.28)))]
            for yc, end in centers:
                ln = rng.uniform(0.45, 1.9) * (1.25 if end else 0.75) * min(1.5, s) ** 0.5
                a = rng.uniform(0.4, 1.0) * (1.45 if end else 0.8) * min(s, 1.3)
                wd = rng.uniform(0.018, 0.07) * (1.4 if end else 1.0)
                r0, r1 = self.r(zl - ln), self.r(zl)
                c0, c1 = self.c(yc - 5 * wd - 0.05), self.c(yc + 5 * wd + 0.05)
                if r1 <= r0 or c1 <= c0:
                    continue
                zz, yy = Z[r0:r1], Y[:, c0:c1]
                dd = np.clip((zl - zz) / ln, 0, 1)
                sig = wd * (0.5 + 0.9 * dd)
                wig = 0.012 * np.sin(zz * rng.uniform(2, 6) + rng.uniform(0, 6.3))
                val = a * (1 - dd) ** 1.4 * np.exp(-((yy - yc - wig) / sig) ** 2)
                dirt[r0:r1, c0:c1] = scr(dirt[r0:r1, c0:c1], val)
        # la coulure a un grain vertical
        vstreak = _vnoise(rng, h, w, 1.1 / px, 0.035 / px)
        dirt *= 0.5 + 0.9 * vstreak
        # descentes d'eau : une traînée sombre de haut en bas
        for yp in self.pipes:
            dirt = scr(dirt, 0.4 * np.exp(-((Y - yp) / 0.13) ** 2) * (0.4 + 0.9 * vstreak))
        # soubassement : éclaboussures jusqu'à 0,8 à 1,4 m, lisière irrégulière
        edge = 0.8 + 0.6 * _vnoise(rng, 1, w, 1, 0.7 / px)[0]
        fine = _fbm(rng, h, w, 0.05 / px, 3)
        pl = np.clip(1 - Z / edge[None, :], 0, 1) ** 0.7 * (0.25 + 0.45 * fine)
        dirt = scr(dirt, pl)
        # crasse générale très douce, plus forte sous l'acrotère (lavage de la pluie)
        low = _fbm(rng, h, w, 2.5 / px, 4)
        dirt = scr(dirt, 0.1 * low)
        dirt = np.clip(dirt, 0, 1)
        # reprises de peinture : plaques rectangulaires de teinte voisine + dérive lente
        G = 0.5 + 0.25 * (low - 0.5)
        for _ in range(24):
            yy0 = rng.uniform(self.y0, self.y0 + self.W - 1)
            zz0 = rng.uniform(0.2, 14.0)
            c0, c1 = self.c(yy0), self.c(yy0 + rng.uniform(0.8, 4.5))
            r0, r1 = self.r(zz0), self.r(zz0 + rng.uniform(0.6, 3.0))
            G[r0:r1, c0:c1] += rng.uniform(-0.17, 0.17)
        for (ya, yb, za, zb) in self.openings:
            if rng.random() < 0.3:
                m = rng.uniform(0.1, 0.4)
                G[self.r(za - m):self.r(zb + m), self.c(ya - m):self.c(yb + m)] += rng.uniform(0.04, 0.1)
        # épaufrures le long des arêtes des baies, des pilastres, du soubassement
        chipn = _vnoise(rng, h, w, 0.025 / px, 0.025 / px)
        zone = np.zeros((h, w), np.float32)
        b = 0.035
        for (ya, yb, za, zb) in self.openings:
            r0, r1, c0, c1 = self.r(za - b), self.r(zb + b), self.c(ya - b), self.c(yb + b)
            zone[r0:r1, c0:c1] = 1.0
            ri0, ri1, ci0, ci1 = self.r(za + 0.01), self.r(zb - 0.01), self.c(ya + 0.01), self.c(yb - 0.01)
            zone[ri0:ri1, ci0:ci1] = 0.0
        for ya in self.arrises:
            zone[:, self.c(ya - b):self.c(ya + b)] = 1.0
        zone = np.maximum(zone, (Z < 1.3).astype(np.float32) * 0.5)
        B = zone * np.clip((chipn - 0.66) * 8, 0, 1)
        B = np.maximum(B, np.clip((chipn - 0.9) * 10, 0, 1) * (Z < 3.0) * 0.7)
        # fissures fines depuis les angles des baies
        A = np.zeros((h, w), np.float32)
        for (ya, yb, za, zb) in self.openings:
            for (cy, cz, sy, sz) in ((ya, zb, -1, 1), (yb, zb, 1, 1), (ya, za, -1, -1), (yb, za, 1, -1)):
                if rng.random() > 0.18:
                    continue
                ang = math.atan2(sz, sy) + rng.uniform(-0.35, 0.35)
                py, pz = cy, cz
                for _ in range(int(rng.uniform(0.25, 1.1) / (px * 0.7))):
                    ang += rng.normal(0, 0.18)
                    py += math.cos(ang) * px * 0.7
                    pz += math.sin(ang) * px * 0.7
                    rr, cc = self.r(pz), self.c(py)
                    if 0 < rr < h - 1 and 0 < cc < w - 1:
                        A[rr, cc] = 1.0
                        pass
        rgba = np.stack([dirt, np.clip(G, 0, 1), np.clip(B, 0, 1), A], axis=-1).astype(np.float32)
        self.image.pixels.foreach_set(rgba.ravel())
        self.image.update()
        return rgba
