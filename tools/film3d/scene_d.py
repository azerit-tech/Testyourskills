# Scène D, la jetée et la pointe : 300 m de jetée droite et plate au départ du port, puis la pointe, un
# terre-plein rond de 60 m dallé, entouré d'eau, un quai de pierre, un garde-corps bas, un seul lampadaire ; et
# ses trois plans P6 (toute la ville), FIN (l'arrestation) et FIN6 (l'encerclement)
# (docs/cinematique-poursuite.md §2.4).
#
# Construire et rendre un plan (une seule commande, sous le verrou commun) :
#
#   FILM3D_HERO=w111 lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     --factory-startup -P tools/film3d/render_lieux.py -- --lieu pointe --plan FIN [--engine cycles --samples 32]
#
# écrit Azerit/design/film/ref/lieux/pointe-FIN-socle[-cadrage].png (render_lieux.py).
#
# Repère : le monde de l'eau de lieux.py. La jetée a son axe en x = 80, de y = 100 (le bout du terre-plein du
# port) à y = 400 ; la pointe est centrée en (80, 430). La poursuite roule vers +y ; la ville est derrière, vers
# -y, avec la bande corail du ciel. Toutes les caméras regardent vers elle.
#
# La jetée : chaussée de 8 m à deux voies, trottoirs de 2 m, couronnement de pierre, garde-corps et mur de quai
# (lieux.roadway, rail « quai »), lampadaires des deux côtés tous les 30 m.
# La pointe : dallage, couronnement, mur de quai, garde-corps de 0,9 m, une borne d'amarrage tous les 8 m, le
# lampadaire à 8 m du point d'arrêt, hors de l'axe de la jetée. Côté lagune (sud-est), le garde-corps s'ouvre
# trois fois sur 2,5 m, fermé par une chaîne : les passerelles de la marina s'y accrocheront (palier « marina »).
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lieux as L  # noqa: E402

S, road = L.S, L.road

# ---------------------------------------------------------------- les cotes

JX = L.JETTY_X                  # 80 : l'axe de la jetée
JY0, JY1 = L.JETTY_YS           # 100 .. 400
J_HALF = 4.0                    # la chaussée à deux voies, cunettes comprises
J_WALK = 2.0
J_EDGE = J_HALF + 0.2 + J_WALK + 0.5      # 6,7 : le bord du couronnement
J_LAMPS = [JY0 + 15.0 + 30.0 * k for k in range(10)]   # 115 .. 385

CX, CY = L.POINTE               # (80, 430)
R = L.POINTE_R                  # 30
COPING = 0.55
RAIL_H = 0.9
OPENINGS = (-20.0, -40.0, -60.0)  # les trois ouvertures (degrés autour du centre, depuis +x), côté lagune
OPEN_W = 2.5
STOP = Vector((CX, CY, 0.0))    # là où la berline s'arrête
LAMP_AT = (CX + 5.5, CY - 5.8)  # à 8 m du point d'arrêt, à droite de l'axe de la jetée


def jetty_z(y):
    return 0.0


def jetty_point(x, y, lift=0.0):
    """Un point sur la chaussée de la jetée (bombé de la chaussée à deux voies compris)."""
    with L.road_half(J_HALF):
        z = road.road_z(x - JX)
    return Vector((x, y, z + lift))


def place_on_jetty(rig, x, y, heading=0.0):
    p = jetty_point(x, y)
    return L.put(rig, p.x, p.y, p.z, heading)


# ---------------------------------------------------------------- la jetée

def build_jetty(hidden, lamp_src, far=False):
    """La jetée de 300 m, droite et plate, du terre-plein du port à la pointe."""
    ys = [JY0 + 4.0 * k for k in range(int((JY1 - JY0) / 4.0) + 1)] + [JY1 + 1.0]
    out = L.roadway("jetee", ys, jetty_z, x0=JX, half=J_HALF, walk=J_WALK, rail="quai", lamp_src=lamp_src,
                    lamp_ys=J_LAMPS, far=far, rail_ys=(JY0, CY - math.sqrt(R * R - J_EDGE * J_EDGE)))
    print(f"[jetee] {JY1 - JY0:.0f} m en x {JX:.0f}, chaussée {2 * J_HALF:.0f} m, {len(out['lamps'])} lampadaires",
          flush=True)
    return out


# ---------------------------------------------------------------- la pointe

def _polar(a, r):
    t = math.radians(a)
    return CX + r * math.cos(t), CY + r * math.sin(t)


def _arc_ok(a):
    """L'angle a (degrés) n'est pas dans la gorge de la jetée."""
    x, y = _polar(a, R)
    return not (y < CY and abs(x - JX) < J_EDGE)


def _in_opening(a, margin=0.0):
    half = math.degrees(OPEN_W / 2 / (R - 0.25)) + margin
    return any(abs(((a - o + 180) % 360) - 180) < half for o in OPENINGS)


def mat_dalles(name="dalles_pointe", slab=(1.2, 0.6)):
    """Les dalles de la pointe (béton balayé, Brushed Concrete 04) : appareil à joints décalés, une teinte et
    une variante de la photo par dalle, joints sombres et mouillés, dalles un peu basculées où l'eau reste,
    flaques dans les creux (reflets des phares et des gyrophares au ras du sol), salissures et taches."""
    m, N, out = S.material(name)
    P, O = road.coords(N)
    ox, oy, _ = N.sep(P)
    sy = N.math("DIVIDE", oy, slab[1])
    iy = N.math("FLOOR", sy)
    shift = N.math("MULTIPLY", N.math("FLOORED_MODULO", iy, 2.0), 0.5)
    sx = N.math("ADD", N.math("DIVIDE", ox, slab[0]), shift)
    ix = N.math("FLOOR", sx)
    fx, fy = N.math("FRACT", sx), N.math("FRACT", sy)
    r, g, b, v = road.hash3(N, ix, iy, 3.1)
    r2, g2, _, _ = road.hash3(N, ix, iy, 7.7)
    u = N.math("MULTIPLY", N.math("ADD", N.math("MULTIPLY", fx, 0.5), N.math("GREATER_THAN", r, 0.5)), 0.5)
    w_ = N.math("ADD", N.math("MULTIPLY", fy, 0.25), N.math("MULTIPLY", N.math("FLOOR", N.math("MULTIPLY", g, 4.0)), 0.25))
    uv = road.combine(N, u, w_)
    f = os.path.join(L.ASSETS, "brushed_concrete_04")
    diff = road.tex(N, os.path.join(f, "diff_2k.jpg"), uv)
    rough = road.tex(N, os.path.join(f, "rough_2k.jpg"), uv, color=False)
    nor = road.tex(N, os.path.join(f, "nor_gl_2k.jpg"), uv, color=False)
    hs = N.new("ShaderNodeHueSaturation", Saturation=0.25, Value=1.35)
    N.link(diff, hs.inputs["Color"])
    jx = N.math("MULTIPLY", N.math("MINIMUM", fx, N.math("SUBTRACT", 1.0, fx)), slab[0])
    jy = N.math("MULTIPLY", N.math("MINIMUM", fy, N.math("SUBTRACT", 1.0, fy)), slab[1])
    jd = N.math("MINIMUM", jx, jy)
    joint = road.inv(N, road.smooth(N, jd, 0.004, 0.012))
    tilt = N.math("ADD", N.math("MULTIPLY", N.math("SUBTRACT", fx, 0.5), N.math("SUBTRACT", r2, 0.5)),
                  N.math("MULTIPLY", N.math("SUBTRACT", fy, 0.5), N.math("SUBTRACT", g2, 0.5)))
    D = N.math("MULTIPLY", N.math("SUBTRACT", 0.5, road.noise(N, P, 0.09, 3.0)), 9.0)
    D = N.math("ADD", D, N.math("MULTIPLY", tilt, 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", road.noise(N, P, 0.6, 3.0), 0.5), 4.0))
    D = N.math("ADD", D, N.math("MULTIPLY", road.inv(N, road.smooth(N, jd, 0.0, 0.2)), 0.9))
    w = road.smooth(N, D, 0.9, 1.5)
    stain = road.smooth(N, road.noise(N, P, 0.5, 4.0, 0.6), 0.48, 0.7)
    tyre = road.smooth(N, road.noise(N, P, 0.25, 2.0, stretch=(1.0, 0.15, 1.0)), 0.6, 0.72)
    vor = N.new("ShaderNodeTexVoronoi", Scale=5.0)
    N.link(P, vor.inputs["Vector"])
    vr = N.new("ShaderNodeSeparateColor")
    N.link(vor.outputs["Color"], vr.inputs[0])
    gum = N.math("MULTIPLY", road.inv(N, road.smooth(N, vor.outputs["Distance"], 0.01, 0.018)), N.math("LESS_THAN", vr.outputs[0], 0.3))
    tint = N.math("ADD", 0.78, N.math("MULTIPLY", v, 0.44))
    col = N.mix(1.0, hs.outputs[0], road.combine(N, tint, tint, N.math("ADD", tint, N.math("MULTIPLY", N.math("SUBTRACT", b, 0.5), 0.06))), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", stain, 0.5), col, N.mix(1.0, col, (0.55, 0.52, 0.48, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", tyre, 0.45), col, N.mix(1.0, col, (0.35, 0.34, 0.34, 1), "MULTIPLY"))
    col = N.mix(1.0, col, road.grey(N, N.mixf(w, 0.6, 0.42)), "MULTIPLY")
    col = N.mix(gum, col, (0.03, 0.03, 0.03, 1))
    col = N.mix(joint, col, (0.014, 0.014, 0.014, 1))
    base_n = road.finish_normal(N, road.decode_normal(N, nor), 1.0)
    base_n = road.bump(N, N.math("MULTIPLY", joint, -1.0), base_n, 1.0, 0.006)
    cr = N.mixf(joint, 0.26, 0.12)
    cr = N.mixf(N.math("POWER", w, 1.4), cr, 0.03)
    rip = road.ripples(N, P)
    coat_n = road.vmix(N, road.smooth(N, w, 0.3, 1.0), base_n, rip)
    road.wet_shader(N, out, col, N.math("MULTIPLY", rough, 0.9), base_n, cr, coat_n)
    return m


def bollard_bm(bm, x, y, z, mat=0):
    """Une borne d'amarrage en fonte : fût galbé, tête débordante."""
    prof = [(0.0, 0.0), (0.17, 0.0), (0.15, 0.08), (0.13, 0.32), (0.15, 0.45), (0.21, 0.5), (0.21, 0.56), (0.0, 0.58)]
    n = 16
    rings = []
    for r, h in prof:
        rings.append([bm.verts.new((x + r * math.cos(t), y + r * math.sin(t), z + h)) for t in (i * math.tau / n for i in range(n))])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = mat
            f.smooth = True


def chain_bm(bm, p0, p1, sag=0.22, pitch=0.075, wire=0.008):
    """Une chaîne tendue de p0 à p1, en chaînette (flèche `sag`) : des maillons ovales, un sur deux tourné d'un
    quart de tour."""
    p0, p1 = Vector(p0), Vector(p1)
    span = (p1 - p0).length
    n = max(2, int(span / pitch))
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(p0.lerp(p1, t) - Vector((0, 0, 4 * sag * t * (1 - t))))
    for i in range(n):
        a, b = pts[i], pts[i + 1]
        c, d = (a + b) / 2, (b - a)
        q = d.to_track_quat("X", "Z")
        if i % 2:
            q = q @ Matrix.Rotation(math.pi / 2, 4, "X").to_quaternion()
        M = Matrix.Translation(c) @ q.to_matrix().to_4x4()
        L_, W_ = d.length * 0.62 + wire, 0.022
        ring = []
        for k in range(10):
            t = k * math.tau / 10
            ring.append((L_ * math.cos(t), W_ * math.sin(t)))
        rows = []
        for (u, v) in ring:
            rows.append([bm.verts.new(M @ Vector((u + wire * math.cos(s) * math.cos(math.atan2(v, u)),
                                                  v + wire * math.cos(s) * math.sin(math.atan2(v, u)),
                                                  wire * math.sin(s))))
                         for s in (j * math.tau / 4 for j in range(4))])
        for k in range(10):
            ra, rb = rows[k], rows[(k + 1) % 10]
            for j in range(4):
                f = bm.faces.new((ra[j], ra[(j + 1) % 4], rb[(j + 1) % 4], rb[j]))
                f.smooth = True


def build_pointe(hidden, lamp_src, far=False, marina=False):
    """La pointe : dallage, couronnement, mur du quai, garde-corps et ses trois ouvertures à chaîne, bornes,
    lampadaire. Renvoie le lampadaire (mât, lumière, tête)."""
    dal = mat_dalles()
    quay = bpy.data.materials.get("quai_pierre") or L.mat_quay("quai_pierre")
    cop = bpy.data.materials.get("couronnement") or L.mat_coping("couronnement")
    rail = bpy.data.materials.get("garde_corps") or L.mat_steel("garde_corps", color=(0.32, 0.36, 0.36), rough=0.35,
                                                               rust=0.3, paint=True)
    iron = L.mat_steel("fonte_bornes", color=(0.05, 0.05, 0.055), rough=0.45, rust=0.45, paint=True)
    n = 180
    da = 360.0 / n
    angs = [i * da for i in range(n)]
    # --- le dallage : un disque (la jetée y entre par le sud)
    bm = L.bmesh.new()
    bm.faces.new([bm.verts.new((*_polar(a, R - COPING), 0.0)) for a in angs])
    L.mesh_object("pointe_dallage", bm, [dal])
    # --- le couronnement et le mur du quai, coupés par la gorge de la jetée
    seg = [a for a in angs if _arc_ok(a) and _arc_ok(a + da)]
    bm = L.bmesh.new()
    for a in seg:
        pts = [[(*_polar(a, rr), z), (*_polar(a + da, rr), z)]
               for rr, z in ((R - COPING, 0.0), (R - COPING, 0.12), (R + 0.04, 0.12), (R + 0.04, 0.0))]
        vs = [[bm.verts.new(p[0]), bm.verts.new(p[1])] for p in pts]
        for i in range(3):
            bm.faces.new((vs[i][0], vs[i][1], vs[i + 1][1], vs[i + 1][0]))
    L.mesh_object("pointe_couronnement", bm, [cop])
    bm = L.bmesh.new()
    for a in seg:
        bm.faces.new([bm.verts.new((*_polar(t, R), z)) for t, z in ((a, 0.0), (a + da, 0.0), (a + da, L.WATER_Z - 2.0),
                                                                     (a, L.WATER_Z - 2.0))])
    L.mesh_object("pointe_quai", bm, [quay])
    # --- le garde-corps bas : montants tous les 2,4 m, main courante et lisse ; trois ouvertures fermées d'une chaîne
    rr = R - 0.25
    if not far:
        bm, cb = L.bmesh.new(), L.bmesh.new()
        step = math.degrees(2.4 / rr)
        a, prev = -90.0, None
        while a < 270.0 - step / 2:
            ok = _arc_ok(a) and not _in_opening(a)
            if ok:
                p = _polar(a, rr)
                L.tube_bm(bm, (p[0], p[1], 0.12), (p[0], p[1], RAIL_H), 0.025, seg=8)
                if prev is not None:
                    for h, r_ in ((RAIL_H, 0.03), (0.5, 0.016)):
                        L.tube_bm(bm, (prev[0], prev[1], h), (p[0], p[1], h), r_, seg=8)
                prev = p
            else:
                prev = None
            a += step
        for o in OPENINGS:
            h = math.degrees(OPEN_W / 2 / rr)
            for s in (-1, 1):                              # les deux poteaux de l'ouverture, plus forts
                p = _polar(o + s * h, rr)
                L.tube_bm(bm, (p[0], p[1], 0.12), (p[0], p[1], RAIL_H + 0.05), 0.04, seg=10)
                bm_top = _polar(o + s * h, rr)
                L.tube_bm(bm, (bm_top[0], bm_top[1], RAIL_H + 0.05), (bm_top[0], bm_top[1], RAIL_H + 0.09), 0.05, seg=10)
            p0, p1 = _polar(o - h, rr), _polar(o + h, rr)
            chain_bm(cb, (p0[0], p0[1], RAIL_H - 0.12), (p1[0], p1[1], RAIL_H - 0.12), sag=0.24)
        # le garde-corps se raccorde à celui de la jetée
        L.mesh_object("pointe_garde_corps", bm, [rail])
        steel = bpy.data.materials.get("chaine") or L.mat_steel("chaine", color=(0.36, 0.34, 0.32), rough=0.42, rust=0.55)
        L.mesh_object("pointe_chaines", cb, [steel])
    # --- une borne d'amarrage tous les 8 m sur le couronnement
    bm = L.bmesh.new()
    nb = int(2 * math.pi * (R - 0.28) / 8.0)
    k = 0
    for i in range(nb):
        a = -90.0 + (i + 0.5) * 360.0 / nb
        if _arc_ok(a) and not _in_opening(a, margin=3.0):
            bollard_bm(bm, *_polar(a, R - 0.28), 0.12)
            k += 1
    L.mesh_object("pointe_bornes", bm, [iron])
    # --- le lampadaire, bras vers le point d'arrêt
    d = Vector((STOP.x - LAMP_AT[0], STOP.y - LAMP_AT[1]))
    out = L.lamp(lamp_src, (LAMP_AT[0], LAMP_AT[1], 0.0), arm=(d.x, d.y), energy=3200.0, name="lamp_pointe")
    if marina:
        print("[pointe] marina : palier pas encore écrit", flush=True)
    print(f"[pointe] r {R:.0f} m en ({CX:.0f}, {CY:.0f}), {k} bornes, ouvertures à "
          f"{', '.join(f'{o:.0f}°' for o in OPENINGS)}", flush=True)
    return out


# ---------------------------------------------------------------- le décor et les plans

def decor(scene, hidden, all_lit=False, marina=False):
    lamp_src = L.panorama(scene, hidden, all_lit=all_lit, bridge="loin", port="loin")
    build_jetty(hidden, lamp_src)
    build_pointe(hidden, lamp_src, marina=marina)
    return lamp_src


def glows(points):
    """Les lueurs corail et lilas hors champ, qui battent dans la brume (les autres patrouilles, suggérées)."""
    for i, (p, col, e) in enumerate(points):
        Ld = bpy.data.lights.new(f"glow_off_{i}", "POINT")
        Ld.color = L.lin(col)[:3]
        Ld.energy = e
        Ld.shadow_soft_size = 0.6
        o = bpy.data.objects.new(Ld.name, Ld)
        bpy.context.scene.collection.objects.link(o)
        o.location = p


def aim_helis(helis, target):
    bpy.context.view_layer.update()
    for r in helis:
        piv = next((o for o in r.children_recursive if o.name.endswith("searchlight_pivot")), None)
        if piv is None:
            continue
        p = piv.matrix_world.translation.copy()
        d = (Vector(target) - p).normalized()
        piv.matrix_world = Matrix.Translation(p) @ d.to_track_quat("-Z", "Y").to_matrix().to_4x4()


HERO_STOP = 25.0      # le cap de la berline arrêtée : le travers à gauche, trois quarts face pour FIN


def plan_FIN(scene, hidden, palier="socle"):
    """FIN, l'arrestation : caméra fixe à 20 cm du sol, 35 mm, à 9 m du point d'arrêt, tournée vers la jetée (et
    la ville). La berline est venue de la jetée, a freiné, glissé en travers vers la gauche, et s'arrête au centre,
    trois quarts face ; la fumée des pneus la dépasse. Une patrouille au premier plan, une silhouette ; hors champ,
    des lueurs corail et lilas. Les mains gantées levées derrière le pare-brise."""
    decor(scene, hidden, marina=(palier == "marina"))
    hero = L.hero()
    L.put(hero, STOP.x, STOP.y, 0.0, heading=HERO_STOP)
    L.hands_up(hero)
    L.drive(hero, 1.2, L.hero_wheels(hero), hero["wheel_r"])
    pat = L.patrol("patrol")
    L.put(pat, CX + 4.3, CY + 2.5, 0.0, heading=60.0)       # l'avant entre à gauche du cadre, le reste hors champ
    L.bar_beams(pat, "patrol", yaws=((-30, L.CORAL), (150, L.LILAC)), energy=6000.0)
    try:
        cop = L.officer("guard", style=0, name="officer_fin")
        cop.location = (CX + 2.6, CY - 3.0, 0.0)            # derrière la berline, à gauche
        L.face(cop, (STOP.x, STOP.y))
    except Exception as e:
        print(f"[pointe] agent non posé : {e!r}", flush=True)
    # la fumée des pneus : elle dépasse la voiture vers nous et traîne sur la trace de la glissade
    L.smoke("fumee_avant", (CX - 0.5, CY + 2.6, 0.45), (2.4, 1.4, 0.55), density=0.22, seed=1.0)
    L.smoke("fumee_arriere", (CX + 1.2, CY - 2.6, 0.6), (2.8, 3.4, 0.9), density=0.18, seed=4.0)
    glows([((CX - 9.0, CY + 15.0, 1.4), L.CORAL, 2500.0), ((CX + 11.0, CY + 13.0, 1.6), L.LILAC, 2500.0),
           ((CX - 12.0, CY - 2.0, 1.2), L.LILAC, 1500.0), ((CX + 10.0, CY - 4.0, 1.2), L.CORAL, 1500.0)])
    L.haze((CX - 80, CX + 80), (CY - 470, CY + 60), (L.WATER_Z, 50), 0.0022)
    cam_loc = (CX + 0.7, CY + 8.97, 0.2)
    cam = L.camera("cam_FIN", cam_loc, (CX - 2.2, CY - 32.0, 4.6), lens=35, fstop=2.2,
                   focus=(STOP.x, STOP.y + 1.2, 1.0))
    scene.render.use_motion_blur = True
    return cam


def plan_FIN6(scene, hidden, palier="socle"):
    """FIN6, l'encerclement, temps gelé : la berline au centre, un anneau de dix patrouilles et du fourgon à
    14 m tournés vers elle, une silhouette devant chacun, trois projecteurs d'hélicoptère croisés sur elle, les
    avions saisis dans le ciel. L'orbite : rayon 7 m, à 25 cm, sur 150° ; l'image d'essai au milieu de l'arc,
    trois quarts face, les mains levées et la ville derrière."""
    decor(scene, hidden, all_lit=True, marina=(palier == "marina"))
    rnd = random.Random(6)
    hero = L.hero()
    L.put(hero, STOP.x, STOP.y, 0.0, heading=HERO_STOP)
    L.hands_up(hero)
    ring = [(a, "van" if i == 4 else "patrol") for i, a in enumerate(range(-90, 270, 360 // 11))][:11]
    first = {}
    for i, (a, kind) in enumerate(ring):
        x, y = _polar(a, 14.0)
        r = first.get(kind)
        if r is None:
            r = first[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
        else:
            r = L.clone(r, f"{kind}_{i}")
        h = L.heading_to((STOP.x - x, STOP.y - y)) + rnd.uniform(-28, 28)
        L.put(r, x, y, 0.0, heading=h)
        L.bar_beams(r, f"{kind}_{i}", yaws=((rnd.uniform(-60, 60), L.CORAL), (rnd.uniform(120, 240), L.LILAC)),
                    energy=5000.0)
    try:
        cops = [L.officer(pz, style=st, name=f"officer_{pz}") for pz, st in (("aim", 0), ("crouch", 1), ("guard", 2))]
        for i, (a, kind) in enumerate(ring):
            src = cops[i % 3]
            o = src if i < 3 else S.instance(src, f"officer_{i}", (0, 0, 0))
            x, y = _polar(a + 8.0, 10.6)
            o.location = (x, y, 0.0)
            L.face(o, (STOP.x, STOP.y))
    except Exception as e:
        print(f"[pointe] agents non posés : {e!r}", flush=True)
    first_h, _ = L.helicopter("heli")
    hs = []
    for i, (a, z) in enumerate(((150, 30.0), (30, 34.0), (-100, 28.0))):
        r = first_h if i == 0 else L.clone(first_h, f"heli_{i}")
        x, y = _polar(a, 26.0)
        L.put(r, x, y, z, heading=a + 90, pitch=-5.0, roll=8.0)
        hs.append(r)
    aim_helis(hs, STOP + Vector((0, 0, 0.8)))
    try:
        j = L.jet("jet")
        L.put(j, CX + 40.0, CY - 160.0, 55.0, heading=-8.0, pitch=-3.0, roll=18.0)
        j2 = L.clone(j, "jet_2")
        L.put(j2, CX + 12.0, CY - 190.0, 62.0, heading=-8.0, pitch=-3.0, roll=18.0)
    except Exception as e:
        print(f"[pointe] avions non chargés : {e!r}", flush=True)
    L.smoke("fumee_gelee", (CX + 0.8, CY - 2.6, 0.5), (3.0, 3.5, 0.8), density=0.16, seed=2.0)
    L.haze((CX - 90, CX + 90), (CY - 470, CY + 90), (L.WATER_Z, 60), 0.0022)
    a = 95.0                                          # le milieu de l'arc de 150° (de 20° à 170°)
    cam_loc = (*_polar(a, 7.0), 0.25)
    cam = L.camera("cam_FIN6", cam_loc, (STOP.x, STOP.y, 1.15), lens=21, fstop=2.8,
                   focus=(STOP.x, STOP.y, 1.1))
    return cam


P6_SPEED = 120 / 3.6   # 33 m/s


def plan_P6(scene, hidden, palier="socle"):
    """P6, toute la ville : la grue en haut de sa montée (4 m → 35 m), 24 mm, à 65 m devant la berline, tournée
    vers la ville. La berline en tête sur la jetée (s = 180, à 120 km/h), la colonne de gyrophares derrière elle
    sur la jetée, la voie du quai et la rampe du pont ; trois hélicoptères aux faisceaux croisés, deux avions bas
    dans l'axe de la jetée. Rien dans les 12 % du haut : le ciel."""
    import scene_c
    lamp_src = L.panorama(scene, hidden, all_lit=True, bridge="loin", port="loin")
    build_jetty(hidden, lamp_src)
    build_pointe(hidden, lamp_src, far=True)
    s = 180.0
    y_hero = JY0 + s
    hero = L.hero()
    place_on_jetty(hero, JX + 1.75, y_hero)
    L.drive(hero, P6_SPEED, L.hero_wheels(hero), hero["wheel_r"])
    col = []
    y, k = y_hero - 22.0, 0
    while y > JY0 + 4.0:                               # la jetée : deux voies, en quinconce
        col.append(("jetee", JX + (1.75 if k % 2 == 0 else -1.75), y, 0.0))
        y -= 18.0 + 5.0 * ((k * 7) % 3)
        k += 1
    for x in (60.0, 35.0, 12.0):                       # la voie du quai, vers la jetée (+x)
        col.append(("quai", x, L.QUAY_Y + (1.75 if x > 30 else -1.75), -90.0))
    for y in (-14.0, -40.0, -68.0):                    # la rampe du pont
        col.append(("pont", 1.8 if y > -30 else -1.8, y, 0.0))
    col[2] = ("van",) + col[2][1:]                    # le fourgon, troisième derrière la berline

    src = {}
    for i, (where, x, y, heading) in enumerate(col):
        kind = "van" if where == "van" else "patrol"
        if kind not in src:
            r = src[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
        else:
            r = L.clone(src[kind], f"{kind}_{i}")
        if where in ("jetee", "van"):
            place_on_jetty(r, x, y, heading)
        elif where == "pont":
            scene_c.place_on_deck(r, x, y, heading)
        else:
            L.put(r, x, y, 0.0, heading)
        yaw = 25 + 70 * ((i * 37) % 5) / 4
        L.bar_beams(r, f"{kind}_{i}", yaws=((yaw, L.CORAL), (yaw - 180 + 25 * (i % 3), L.LILAC)))
        L.drive(r, P6_SPEED * 0.95)
    print(f"[P6] colonne de {len(col)} véhicules", flush=True)
    first, _ = L.helicopter("heli")
    hs = []
    for i, (dx, dy, z) in enumerate(((-22.0, 12.0, 17.0), (20.0, -6.0, 20.0), (-6.0, -30.0, 24.0))):
        r = first if i == 0 else L.clone(first, f"heli_{i}")
        L.put(r, JX + dx, y_hero + dy, z, heading=-dx * 1.5, pitch=-7.0)
        hs.append(r)
    aim_helis(hs, jetty_point(JX + 1.75, y_hero, 0.6))
    try:
        j = L.jet("jet")
        L.put(j, JX - 14.0, -60.0, 42.0, heading=0.0, pitch=2.0, roll=-6.0)
        j2 = L.clone(j, "jet_2")
        L.put(j2, JX + 18.0, -110.0, 48.0, heading=0.0, pitch=2.0, roll=6.0)
        L.drive(j, 110.0)
        L.drive(j2, 110.0)
    except Exception as e:  # l'avion n'est qu'une silhouette au fond : sans lui le plan tient
        print(f"[P6] avions non chargés : {e!r}", flush=True)
    L.haze((-300, 300), (-420, 470), (L.WATER_Z, 90), 0.0011)
    # la caméra au haut de la grue : la berline au tiers bas, la ville aux deux tiers (tangente 0,25 au-dessus du
    # centre au 24 mm vertical, soit 14° de plongée ; la berline 28° sous l'horizontale, donc à 65 m devant)
    cam_y = y_hero + 65.0
    cam = L.camera("cam_P6", (JX + 1.0, cam_y, 35.0), (JX + 1.0, cam_y - 100.0, 35.0 - 100.0 * math.tan(math.radians(14))),
                   lens=24, fstop=0.0)
    scene.render.use_motion_blur = True
    return cam


PLANS = {"FIN": plan_FIN, "FIN6": plan_FIN6, "P6": plan_P6}


def build(plan, palier="socle"):
    scene, hidden = L.new_scene()
    cam = PLANS[plan](scene, hidden, palier=palier)
    scene.camera = cam
    scene.frame_set(2)
    return scene
