# Scène D, la jetée et la pointe : 300 m de jetée droite et plate au départ du port, puis la pointe, un
# terre-plein rond de 60 m en enrobé, entouré d'eau, un quai de pierre, un garde-corps bas, un seul lampadaire ; et
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
# La pointe : enrobé, couronnement, mur de quai, garde-corps de 0,9 m, une borne d'amarrage tous les 8 m, le
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


def mat_sol(name="sol_pointe", st=None):
    """Le sol de la pointe : l'enrobé de quai, avec les photos de la rue (Asphalt 02 lu deux fois, la vue
    aérienne d'Aerial Asphalt 01 pour les grandes nuances, le relief d'Asphalt 04 pour les creux) et le vernis
    d'eau de road.wet_shader. Posé en bandes de 9,5 m : de rares joints froids scellés au bitume, ondulés et
    interrompus ; des fissures pontées, des fissures fines ouvertes, des rapiéçages plus sombres, des taches
    d'huile ; des flaques irrégulières dans les creux (le même champ de « creux » que la chaussée, réglage
    « sèche »). Les traces du dérapage sont un décalque à part (skid_marks)."""
    st = st or L.ST
    m, N, out = S.material(name)
    P, _ = road.coords(N)
    px, py, _ = N.sep(P)
    sc = road.scan2(N, P, "asphalt_02", 3.0)
    d2 = sc["disp"]
    aer = road.tex(N, os.path.join(L.ASSETS, "aerial_asphalt_01", "diff_2k.jpg"), road.mapping(N, P, scale=(1 / 30.0,) * 3))
    aer_bw = N.new("ShaderNodeRGBToBW")
    N.link(aer, aer_bw.inputs[0])
    macro = N.math("DIVIDE", aer_bw.outputs[0], 0.125)
    region = road.noise(N, P, 0.03, 2.0)
    # --- les joints froids entre bandes d'enrobé (parallèles à la jetée), ondulés, à moitié effacés
    wob = N.math("MULTIPLY", N.math("SUBTRACT", road.noise(N, P, 0.4, 2.0, stretch=(0.0, 1.0, 0.0)), 0.5), 0.25)
    jm = N.math("FLOORED_MODULO", N.math("ADD", N.math("ADD", px, 3.1), wob), 9.5)
    jd = N.math("MINIMUM", jm, N.math("SUBTRACT", 9.5, jm))
    joint = N.math("MULTIPLY", road.inv(N, road.smooth(N, jd, 0.025, 0.06)),
                   road.smooth(N, road.noise(N, P, 0.35, 2.0, stretch=(0.2, 1.0, 0.2)), 0.4, 0.5))
    # --- fissures pontées (rubans de bitume brillants) et fissures fines ouvertes (sombres, mates)
    n1 = road.noise(N, P, 0.22, 2.0, 0.5, stretch=(1.0, 0.6, 1.0), dist=0.35)
    snake = N.math("MULTIPLY", road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", n1, 0.5)), 0.004, 0.011)),
                   road.smooth(N, road.noise(N, P, 0.045, 2.0), 0.5, 0.6))
    n2 = road.noise(N, P, 0.7, 3.0, 0.5, dist=0.6)
    crack = N.math("MULTIPLY", road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", n2, 0.5)), 0.0015, 0.005)),
                   road.smooth(N, road.noise(N, P, 0.09, 2.0), 0.56, 0.63))
    seal = N.math("MAXIMUM", joint, snake)
    # --- rapiéçages (enrobé plus neuf, plus noir) et taches d'huile
    pn = road.noise(N, P, 0.06, 2.0, 0.4)
    patch = road.smooth(N, pn, 0.66, 0.672)
    oil = road.smooth(N, road.noise(N, P, 0.45, 3.0, 0.6), 0.66, 0.78)
    # --- le champ de « creux » (en écarts-types), d'où l'eau : flaques irrégulières
    meso = road.noise(N, P, 0.42, 3.0, 0.55, stretch=(1.0, 0.7, 1.0))
    d4 = road.tex(N, os.path.join(S.ASSETS, "asphalt_04", "disp_2k.png"), road.mapping(N, P, scale=(1 / 4.04,) * 3, rot=(0, 0, 0.3)), color=False)
    D = N.math("MULTIPLY", N.math("SUBTRACT", 0.5, meso), 14.0)
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", 0.40, d4), 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", region, 0.55), 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", patch, -0.6))
    D = N.math("ADD", D, N.math("MULTIPLY", road.inv(N, road.smooth(N, jd, 0.0, 0.6)), 0.8))
    D = N.math("ADD", D, st["D_off"] + 0.25)
    p0, p1 = st["puddle"]
    w = road.smooth(N, D, p0, p1)
    deep = road.smooth(N, D, p1, p1 + 0.9)
    tipdry = road.smooth(N, d2, 0.62, 0.85)
    # --- couleur
    dk = st["dark"]
    col = N.mix(1.0, sc["diff"], (dk, dk, dk * 1.03, 1), "MULTIPLY")
    col = N.mix(1.0, col, road.grey(N, N.mixf(0.55, 1.0, macro)), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", patch, 0.85), col, N.mix(1.0, col, (0.55, 0.55, 0.57, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", oil, 0.75), col, N.mix(1.0, col, (0.45, 0.44, 0.43, 1), "MULTIPLY"))
    col = N.mix(1.0, col, road.grey(N, N.mixf(w, st["wet"][0], st["wet"][1])), "MULTIPLY")
    col = N.mix(seal, col, (0.010, 0.010, 0.011, 1))
    col = N.mix(crack, col, (0.004, 0.004, 0.004, 1))
    # --- rugosité, normales
    br = N.mixf(seal, N.math("MULTIPLY", sc["rough"], 0.95), 0.22)
    br = N.mixf(crack, br, 0.9)
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    base_n = road.finish_normal(N, sc["nor_gl"], 1.0)
    base_n = road.vmix(N, N.math("MULTIPLY", patch, 0.4), base_n, geo)
    base_n = road.bump(N, road.noise(N, P, 0.28, 3.0), base_n, 1.0, 0.05)
    base_n = road.bump(N, N.math("SUBTRACT", seal, N.math("MULTIPLY", crack, 2.0)), base_n, 1.0, 0.002)
    # --- la pellicule d'eau
    cr = N.mixf(tipdry, st["cr"][0], st["cr"][1])
    cr = N.mixf(seal, cr, N.math("MULTIPLY", cr, 0.6))
    cr = N.mixf(crack, cr, 0.5)
    cr = N.mixf(N.math("POWER", w, 1.4), cr, 0.03)
    rip = road.ripples(N, P)
    thin = road.vmix(N, 0.3, rip, base_n)
    pud_n = road.vmix(N, deep, thin, rip)
    coat_n = road.vmix(N, road.smooth(N, w, 0.25, 1.0), base_n, pud_n)
    road.wet_shader(N, out, col, br, base_n, cr, coat_n)
    return m


def slide_pose(s):
    """La glissade de la berline, s de 0 (elle freine en sortant de la jetée, voie de droite) à 1 (arrêtée au
    centre, tournée de HERO_STOP) : (x, y, cap). L'arrière chasse vers la droite, l'avant pivote à gauche."""
    e = 1.0 - (1.0 - s) ** 2
    x = JX + 1.75 - 1.75 * (3 * s * s - 2 * s * s * s)
    y = JY1 - 6.0 + (STOP.y - JY1 + 6.0) * e
    return x, y, HERO_STOP * s ** 1.6


def skid_marks(name="traces_glissade", track=0.77, base=1.37, width=0.2, n=48):
    """Les traces de pneus du dérapage, de la sortie de la jetée au point d'arrêt : un ruban par roue (l'arrière
    dès le freinage, l'avant un peu après), noir de gomme, plus mat que l'eau, qui s'efface par endroits.
    Décalque à 6 mm du sol, coordonnées de texture : u le long de la trace, v en travers."""
    m, N, out = S.material(name)
    uv = N.new("ShaderNodeTexCoord").outputs["UV"]
    u, v, _ = N.sep(uv)
    P, _ = road.coords(N)
    streak = road.noise(N, road.combine(N, N.math("MULTIPLY", u, 3.0), N.math("MULTIPLY", v, 40.0), 0.0), 2.0, 3.0, 0.6)
    a = N.math("MULTIPLY", road.smooth(N, u, 0.0, 0.25), road.smooth(N, streak, 0.3, 0.6))
    a = N.math("MULTIPLY", a, road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", v, 0.5)), 0.32, 0.5)))
    a = N.math("MULTIPLY", a, N.mixf(road.smooth(N, road.noise(N, P, 0.8, 2.0), 0.35, 0.6), 0.45, 0.95))
    p = S.principled(N, **{"Base Color": (0.006, 0.006, 0.006, 1), "Roughness": 0.42})
    p.inputs["Coat Weight"].default_value = 0.6
    p.inputs["Coat IOR"].default_value = 1.33
    p.inputs["Coat Roughness"].default_value = 0.12
    N.link(a, p.inputs["Alpha"])
    N.link(p.outputs[0], out.inputs[0])
    bm = L.bmesh.new()
    uvl = bm.loops.layers.uv.new()
    for lx in (-track, track):
        for ly, s0 in ((-base, 0.0), (base, 0.25)):
            pts = []
            for i in range(n + 1):
                s = s0 + (1.0 - s0) * i / n
                x, y, h = slide_pose(s)
                c, sn = math.cos(math.radians(h)), math.sin(math.radians(h))
                pts.append(Vector((x + lx * c - ly * sn, y + lx * sn + ly * c, 0.0)))
            rows = []
            for i, p_ in enumerate(pts):
                t = (pts[min(i + 1, n)] - pts[max(i - 1, 0)]).normalized()
                side = Vector((t.y, -t.x, 0.0)) * (width / 2)
                z = 0.006
                rows.append((bm.verts.new(p_ - side + Vector((0, 0, z))), bm.verts.new(p_ + side + Vector((0, 0, z)))))
            for i in range(n):
                f = bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
                for lp, (uu, vv) in zip(f.loops, ((i / n, 0.0), (i / n, 1.0), ((i + 1) / n, 1.0), ((i + 1) / n, 0.0))):
                    lp[uvl].uv = (uu, vv)
    ob = L.mesh_object(name, bm, [m])
    ob.visible_shadow = False
    return ob


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
    """La pointe : sol, couronnement, mur du quai, garde-corps et ses trois ouvertures à chaîne, bornes,
    lampadaire. Renvoie le lampadaire (mât, lumière, tête)."""
    dal = mat_sol()
    quay = bpy.data.materials.get("quai_pierre") or L.mat_quay("quai_pierre")
    cop = bpy.data.materials.get("couronnement") or L.mat_coping("couronnement")
    rail = bpy.data.materials.get("garde_corps") or L.mat_steel("garde_corps", color=(0.32, 0.36, 0.36), rough=0.35,
                                                               rust=0.3, paint=True)
    iron = L.mat_steel("fonte_bornes", color=(0.05, 0.05, 0.055), rough=0.45, rust=0.45, paint=True)
    n = 180
    da = 360.0 / n
    angs = [i * da for i in range(n)]
    # --- le sol : un disque d'enrobé (la jetée y entre par le sud)
    bm = L.bmesh.new()
    bm.faces.new([bm.verts.new((*_polar(a, R - COPING), 0.0)) for a in angs])
    L.mesh_object("pointe_sol", bm, [dal])
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
        build_marina(hidden, far=far)
    print(f"[pointe] r {R:.0f} m en ({CX:.0f}, {CY:.0f}), {k} bornes, ouvertures à "
          f"{', '.join(f'{o:.0f}°' for o in OPENINGS)}", flush=True)
    return out


# ---------------------------------------------------------------- la marina

PONTOON_L, PONTOON_W, GANGWAY = 40.0, 2.5, 6.0
DECK_Z = L.WATER_Z + 0.45            # le platelage flottant, 45 cm au-dessus de l'eau
# les places : (ponton, côté, distance depuis la tête du ponton, genre, échelle)
# le cap de chaque ponton (degrés depuis +x) : la passerelle part dans l'axe de son ouverture, le ponton tourne
# vers le sud, parallèle à la jetée pour le dernier ; toutes les caméras regardent vers -y, la marina passe ainsi
# derrière l'anneau de FIN6 et au bord gauche de FIN au lieu de fuir hors du cadre
PONTOON_DIRS = (-30.0, -60.0, -90.0)
# côté +1 : à gauche en marchant vers le large ; les pontons les plus vus portent le plus de mâts
BERTHS = [(2, -1, 7.0, "voile", 1.0), (2, -1, 20.0, "voile", 1.1), (2, -1, 33.0, "voile", 0.9),
          (2, 1, 9.0, "voile", 0.95), (2, 1, 22.0, "vedette", 1.0), (2, 1, 35.0, "voile", 1.05),
          (1, -1, 8.0, "voile", 1.05), (1, -1, 21.0, "voile", 0.9), (1, -1, 34.0, "vedette", 1.0),
          (1, 1, 10.0, "voile", 1.0), (1, 1, 24.0, "voile", 1.1),
          (0, -1, 9.0, "vedette", 1.0), (0, -1, 22.0, "voile", 0.95), (0, 1, 15.0, "vedette", 1.0)]
SAIL_L, CRUISER_L = 11.0, 7.0        # les longueurs visées (voiliers de 9,9 à 12 m, mâts de 12 à 15 m)


def _placed(bm, mat, build):
    """Construit une pièce dans `bm` (la fonction `build`), puis la pose par la matrice `mat`."""
    before = set(bm.verts)
    build(bm)
    L.bmesh.ops.transform(bm, matrix=mat, verts=[v for v in bm.verts if v not in before])


def _boat_source(rel, name, hidden, length):
    """Un bateau de bibliothèque ($FILM3D_ASSETS/rel) joint en un objet, mis à `length` m de long, la longueur
    le long de +y, origine sous la quille, rangé dans les sources. Renvoie (objet, emprise, tête de mât locale).
    Les noms d'images sont imprimés : aucune ne doit porter de nom de bateau ni de marque."""
    parts = S.import_glb(rel)
    ob = S.join(parts, name)

    def recentre():
        # lu sur les sommets : la boîte englobante de l'objet ne suit pas data.transform avant une mise à jour
        cs = [v.co for v in ob.data.vertices]
        mn = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
        mx = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
        ob.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
        ob.location = (0, 0, 0)
        return mx - mn
    size = recentre()
    if size.x > size.y:
        ob.data.transform(Matrix.Rotation(math.pi / 2, 4, "Z"))
        size = recentre()
    ob.data.transform(Matrix.Scale(length / size.y, 4))
    size = recentre()
    top = max(ob.data.vertices, key=lambda v: v.co.z).co.copy()
    # à 25 m et plus, de nuit, la silhouette suffit : 30 000 faces au plus, images à 512 px (la scène de FIN6
    # est déjà à 1,8 Go)
    nf = len(ob.data.polygons)
    if nf > 30000:
        mod = ob.modifiers.new("allege", "DECIMATE")
        mod.ratio = 30000.0 / nf
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for m in ob.data.materials:
        for n in (m.node_tree.nodes if m and m.node_tree else []):
            if n.type == "TEX_IMAGE" and n.image and max(n.image.size) > 512:
                w, h = n.image.size
                f = 512.0 / max(w, h)
                n.image.scale(max(1, int(w * f)), max(1, int(h * f)))
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    hidden.objects.link(ob)
    imgs = sorted({n.image.name for m in ob.data.materials if m and m.node_tree for n in m.node_tree.nodes
                   if n.type == "TEX_IMAGE" and n.image})
    print(f"[marina] source {name} : {size.x:.2f} × {size.y:.2f} × {size.z:.2f} m, "
          f"{len(ob.data.polygons)} faces, images {imgs}", flush=True)
    return ob, size, top


def _proxy(name, hidden, length, beam, mast):
    """La version vue de loin : une coque sombre en caisson et un mât (quelques dizaines de faces)."""
    bm = L.bmesh.new()
    L.box_bm(bm, (-beam / 2, -length / 2, 0.0), (beam / 2, length / 2, 1.6))
    top = Vector((0.0, 0.0, 1.6))
    if mast:
        top = Vector((0.0, length * 0.06, mast))
        L.tube_bm(bm, (0.0, top.y, 1.6), top, 0.08, seg=6)
    hull = bpy.data.materials.get("coque_loin") or S.mat_plain("coque_loin", (0.03, 0.035, 0.045, 1), 0.4)
    ob = L.mesh_object(name, bm, [hull], coll=hidden)
    return ob, Vector((beam, length, top.z)), top


def build_marina(hidden, far=False):
    """Le palier « marina » de la pointe : trois pontons flottants de 40 × 2,5 m au départ des trois ouvertures du
    garde-corps, chacun relié au couronnement par une passerelle de 6 m dans l'axe de l'ouverture, puis tourné vers
    le sud (PONTOON_DIRS) ; quatorze bateaux amarrés le long des
    pontons, dix voiliers (9,9 à 12 m, mâts nus) et quatre vedettes de 7 m, en copies liées d'un modèle par
    genre ; un feu crème en tête de chaque mât, des bornes basses à lueur crème sur les pontons, une bouée
    lumineuse à l'entrée. `far` : coques et mâts en caissons (la vue lointaine). Ni nom, ni pavillon, ni numéro,
    ni marque. Aucune lampe : des émissions seules (la scène reste légère)."""
    wood = bpy.data.materials.get("platelage") or L.mat_concrete("platelage", tint=(0.34, 0.3, 0.26), streaks=0.6,
                                                                   scale=0.8)
    float_m = bpy.data.materials.get("flotteur") or S.mat_plain("flotteur", (0.05, 0.05, 0.055, 1), 0.5)
    rail = bpy.data.materials.get("garde_corps") or float_m
    cream = L.emit_mat("feu_mat", L.lin("#ffe9c8"), 45.0)
    bm, fb, gb, lb = L.bmesh.new(), L.bmesh.new(), L.bmesh.new(), L.bmesh.new()
    frames = []
    centre = Vector((CX, CY, 0.0))
    for o, od in zip(OPENINGS, PONTOON_DIRS):
        t, td = math.radians(o), math.radians(od)
        u = Vector((math.cos(t), math.sin(t), 0.0))           # l'axe de l'ouverture : la passerelle
        d = Vector((math.cos(td), math.sin(td), 0.0))         # le ponton, vers le large
        v = Vector((-d.y, d.x, 0.0))                          # en travers du ponton
        r0 = R + GANGWAY
        head = centre + u * r0                                # la tête du ponton, au pied de la passerelle
        frames.append((head, d, v))
        rot = Matrix.Rotation(td - math.pi / 2, 4, "Z")       # le +y local le long du ponton
        c = head + d * (PONTOON_L / 2 - 0.6)
        at = Matrix.Translation((c.x, c.y, DECK_Z)) @ rot
        # le platelage, ses deux flotteurs
        _placed(bm, at, lambda b: L.box_bm(b, (-PONTOON_W / 2, -PONTOON_L / 2, -0.06),
                                            (PONTOON_W / 2, PONTOON_L / 2, 0.06)))

        def floats(b):
            for sd in (-1, 1):
                x = sd * (PONTOON_W / 2 - 0.45)
                L.box_bm(b, (x - 0.3, -PONTOON_L / 2 + 0.4, -0.55), (x + 0.3, PONTOON_L / 2 - 0.4, -0.06))
        _placed(fb, at, floats)
        # la passerelle : du couronnement (0,27 m) au platelage, en pente douce, deux mains courantes
        a0 = centre + u * (R - 0.2)
        ln = r0 + 0.3 - (R - 0.2)
        z0, z1 = 0.27, DECK_Z + 0.06
        gat = (Matrix.Translation((a0.x, a0.y, z0)) @ Matrix.Rotation(t - math.pi / 2, 4, "Z")
               @ Matrix.Rotation(math.atan2(z1 - z0, ln), 4, "X"))
        dl = math.hypot(ln, z1 - z0)

        def gangway(b):
            L.box_bm(b, (-0.6, 0.0, -0.05), (0.6, dl, 0.0))
            for sd in (-1, 1):
                L.tube_bm(b, (sd * 0.6, 0.0, 0.9), (sd * 0.6, dl, 0.9), 0.025, seg=6)
                for k in range(4):
                    L.tube_bm(b, (sd * 0.6, dl * k / 3, 0.0), (sd * 0.6, dl * k / 3, 0.9), 0.02, seg=6)
        _placed(gb, gat, gangway)
        # des bornes basses tous les 10 m, en quinconce, une lueur crème à 50 cm
        for k in range(4):
            p = c + d * (-PONTOON_L / 2 + 5.0 + 10.0 * k) + v * (PONTOON_W / 2 - 0.25) * (1 if k % 2 else -1)
            L.tube_bm(fb, (p.x, p.y, DECK_Z + 0.06), (p.x, p.y, DECK_Z + 0.5), 0.07, seg=8)
            L.bmesh.ops.create_uvsphere(lb, u_segments=8, v_segments=5, radius=0.09,
                                        matrix=Matrix.Translation((p.x, p.y, DECK_Z + 0.56)))
    L.mesh_object("marina_pontons", bm, [wood])
    L.mesh_object("marina_flotteurs", fb, [float_m])
    L.mesh_object("marina_passerelles", gb, [rail])
    # les bateaux : une source par genre, des copies liées
    if far:
        src = {"voile": _proxy("src_voilier_loin", hidden, SAIL_L, 3.4, 14.0),
               "vedette": _proxy("src_vedette_loin", hidden, CRUISER_L, 2.5, 0.0)}
    else:
        src = {"voile": _boat_source(os.path.join("lieux", "marina", "sailboat", "model.glb"), "src_voilier", hidden,
                                     SAIL_L),
               "vedette": _boat_source(os.path.join("lieux", "marina", "sport-cruiser", "model.glb"), "src_vedette",
                                       hidden, CRUISER_L)}
    rng = random.Random(14)
    n_sail = 0
    for i, (pi, side, s, kind, k) in enumerate(BERTHS):
        head, d, v = frames[pi]
        ob, size, top = src[kind]
        p = head + d * s + v * side * (PONTOON_W / 2 + size.x * k / 2 + 0.5)
        # la flottaison : la quille du voilier plonge d'environ 11 % de sa hauteur hors tout, la vedette de 25 cm
        sink = 0.11 * size.z * k if (kind == "voile" and not far) else (0.6 if far else 0.25)
        heading = math.atan2(d.y, d.x) - math.pi / 2 + (math.pi if rng.random() < 0.5 else 0.0)
        z = L.WATER_Z - sink
        S.instance(ob, f"marina_{kind}_{i}", (p.x, p.y, z), rot_z=heading, scale=k)
        if kind == "voile":
            n_sail += 1
            m = (Matrix.Rotation(heading, 3, "Z") @ top) * k
            L.bmesh.ops.create_uvsphere(lb, u_segments=8, v_segments=5, radius=0.11,
                                        matrix=Matrix.Translation((p.x + m.x, p.y + m.y, z + m.z + 0.12)))
    L.mesh_object("marina_feux", lb, [cream]).visible_shadow = False
    # la bouée lumineuse de l'entrée, au large de la marina
    if not far:
        try:
            parts = S.import_glb(os.path.join("lieux", "marina", "ocean-buoy", "ocean_buoy.gltf"))
            buoy = S.join(parts, "marina_bouee")
            size = S.recentre(buoy)
            buoy.data.transform(Matrix.Scale(4.2 / size.z, 4))
            S.recentre(buoy)
            bx, by = _polar(-40.0, R + GANGWAY + PONTOON_L + 22.0)
            buoy.location = (bx, by, L.WATER_Z - 1.2)
            bb = L.bmesh.new()
            L.bmesh.ops.create_uvsphere(bb, u_segments=10, v_segments=6, radius=0.18,
                                        matrix=Matrix.Translation((bx, by, L.WATER_Z + 3.05)))
            L.mesh_object("marina_bouee_feu", bb,
                          [L.emit_mat("feu_bouee", L.lin(L.CORAL), 60.0)]).visible_shadow = False
        except Exception as e:
            print(f"[marina] bouée non posée : {e!r}", flush=True)
    print(f"[marina] {len(OPENINGS)} pontons de {PONTOON_L:.0f} m, {len(BERTHS)} bateaux ({n_sail} voiliers), "
          f"{'vue lointaine' if far else 'complète'}", flush=True)


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
        o.visible_camera = False


def _car_collections(car):
    """Les deux collections de liaison d'une voiture (créées une fois) : « sans » (ses maillages exclus) et « avec »
    (ses maillages seuls)."""
    out_c = bpy.data.collections.get(f"{car.name}_lumiere_sans")
    if out_c is None:
        body = [o for o in car.children_recursive if o.type == "MESH"]
        out_c = bpy.data.collections.new(f"{car.name}_lumiere_sans")
        in_c = bpy.data.collections.new(f"{car.name}_lumiere_avec")
        for o in body:
            out_c.objects.link(o)
            in_c.objects.link(o)
        for co in out_c.collection_objects:
            co.light_linking.link_state = "EXCLUDE"
    return out_c, bpy.data.collections[f"{car.name}_lumiere_avec"]


def split_for_car(lights, car, energy=None, color=None, tag="lumiere", fraction=None):
    """Sépare la lumière que reçoit une voiture de celle du décor : chaque lumière de `lights` exclut la voiture
    (liaison de lumière) et reçoit une jumelle au même endroit, de puissance `energy` et de teinte `color`, qui
    n'éclaire qu'elle, invisible à la caméra et à la brume. La brume et le sol gardent la pleine puissance, la
    peinture reçoit ce qu'elle supporte. `fraction` : la jumelle à cette part de la source, de sa couleur (une
    jumelle de données par source). Renvoie les jumelles."""
    out_c, in_c = _car_collections(car)
    made, twins = {}, []
    for o in lights:
        o.light_linking.receiver_collection = out_c
        d = made.get(o.data.name)
        if d is None:
            d = made[o.data.name] = o.data.copy()
            d.name = f"{tag}_{car.name}"
            d.energy = o.data.energy * fraction if fraction is not None else energy
            if color:
                d.color = L.lin(color)[:3]
        c = bpy.data.objects.new(f"{o.name}_{car.name}", d)
        for coll in o.users_collection:
            coll.objects.link(c)
        c.parent = o.parent
        c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        c.rotation_mode = o.rotation_mode
        c.location, c.rotation_euler = o.location.copy(), o.rotation_euler.copy()
        c.rotation_quaternion = o.rotation_quaternion.copy()
        c.visible_camera = False
        c.visible_volume_scatter = False
        c.light_linking.receiver_collection = in_c
        twins.append(c)
    return twins


def car_out_of_rigs(rigs, car):
    """La voiture exclue de toutes les lumières des véhicules `rigs` (rampes, lueurs, flaques, phares, feux),
    sauf de ses jumelles (split_for_car) : les lumières sans liaison reçoivent l'exclusion de la voiture, celles
    qui excluaient déjà leur rampe (« _glow_exclude ») l'excluent aussi. Les lumières gardent leur pleine
    puissance pour le sol et la brume. Renvoie le nombre de lumières touchées."""
    out_c, _ = _car_collections(car)
    body = list(out_c.objects)
    n = 0
    for r in rigs:
        for o in r.children_recursive:
            if o.type != "LIGHT" or o.name.endswith(f"_{car.name}"):
                continue
            rc = o.light_linking.receiver_collection
            if rc is None:
                o.light_linking.receiver_collection = out_c
                n += 1
            elif rc != out_c and any(co.light_linking.link_state == "EXCLUDE" for co in rc.collection_objects):
                for b in body:
                    if b.name not in rc.objects:
                        rc.objects.link(b)
                for co in rc.collection_objects:
                    co.light_linking.link_state = "EXCLUDE"
                n += 1
    return n


def aim_helis(helis, target, energy=400000.0, car=None, car_energy=None, cone=None):
    """Les projecteurs des hélicoptères sur la cible. À 30-40 m, les 30 kW du projecteur de cast_vehicles
    éclairent la voiture vingt fois moins que le lampadaire : on les pousse (la lumière est partagée par les
    copies) pour que le faisceau se lise dans la brume et que la tache tombe sur la carrosserie.
    `car` (un rig) et `car_energy` : à pleine puissance, la peinture bordeaux sortait rose, hautes lumières
    délavées ; le faisceau principal exclut alors la voiture (liaison de lumière) et un second projecteur
    coaxial, crème, à `car_energy`, n'éclaire qu'elle. `cone` : l'ouverture en degrés (9 par défaut)."""
    bpy.context.view_layer.update()
    spots = []
    for r in helis:
        for o in r.children_recursive:
            if o.type == "LIGHT" and o.name.endswith("searchlight_spot"):
                o.data.energy = energy
                o.data.color = L.lin("#e2eaff")[:3]     # xénon, bleuté : la berline reste bordeaux sous le faisceau
                if cone:
                    o.data.spot_size = math.radians(cone)
                spots.append(o)
    if car is not None and car_energy:
        split_for_car(spots, car, car_energy, "#fff0d8", tag="faisceau")   # crème : des reflets chauds, pas bleutés
    for r in helis:
        piv = next((o for o in r.children_recursive if o.name.endswith("searchlight_pivot")), None)
        if piv is None:
            continue
        p = piv.matrix_world.translation.copy()
        d = (Vector(target) - p).normalized()
        piv.matrix_world = Matrix.Translation(p) @ d.to_track_quat("-Z", "Y").to_matrix().to_4x4()


HERO_STOP = 25.0      # le cap de la berline arrêtée : le travers à gauche, trois quarts face pour FIN


def plan_FIN(scene, hidden, palier="socle"):
    """FIN, l'arrestation : caméra fixe à 20 cm du sol, 24 mm, à 9 m du point d'arrêt, tournée vers la jetée (et
    la ville), relevée de 14° : la berline et l'horizon au tiers bas, le ciel au-dessus. La berline est venue de la
    jetée, a freiné, glissé en travers vers la gauche (les traces de gomme) et s'arrête au centre, trois quarts face,
    les mains gantées levées derrière le pare-brise (l'habitacle un peu éclairé) ; la fumée des pneus la dépasse.
    Au premier plan à gauche, la patrouille arrêtée à côté d'elle, l'avant vers nous, la portière du conducteur
    grande ouverte ; derrière la portière un agent se redresse, l'arme tendue, à contre-jour du lampadaire et d'une
    lueur corail. Hors champ, des lueurs corail et lilas battent dans la brume et sur le sol mouillé.
    (Au 35 mm du cahier des charges, la berline seule remplit la largeur à 9 m : le 24 mm fait entrer la patrouille.)

    Animé (36 images, fin_pointe.py) : la berline finit les 4,5 derniers mètres de sa glissade et s'arrête à l'image
    22 ; la portière, déjà ouverte, est poussée à fond ; l'agent passe d'accroupi à en joue (clés d'os, images 18
    à 28) ; le conducteur lève les mains (images 22 à 31) ; la fumée dépasse la berline. La dernière image est la
    pose validée."""
    import motion as M
    import fin_pointe as F
    decor(scene, hidden, marina=(palier in ("marina", "complet")))
    scene.frame_start, scene.frame_end = F.F0, F.F0 + F.FRAMES - 1
    frames = range(F.F0 - 1, F.F0 + F.FRAMES + 1)
    skid_marks()
    hero = L.hero()
    wheels = L.hero_wheels(hero)
    poses = M.sample(F.hero_pos, frames, heading=F.hero_heading, wheel_r=hero["wheel_r"])
    M.key_vehicle(hero, poses, wheels=wheels)
    M.wheel_marks(wheels, hero["wheel_r"])
    L.hands_up_keys(hero, *F.DRIVER_KEYS)
    L.cabin_light(hero, energy=25.0)
    # la patrouille, parallèle à la berline, à sa droite et un peu en avant : sa portière gauche s'ouvre vers elle
    f = Vector((-math.sin(math.radians(HERO_STOP)), math.cos(math.radians(HERO_STOP)), 0.0))
    r = Vector((f.y, -f.x, 0.0))
    pp = STOP + r * 4.0 + f * 1.5
    pat = L.patrol("patrol")
    L.put(pat, pp.x, pp.y, 0.0, heading=HERO_STOP)
    door_ob = L.door_object(pat, side=1)
    for f_, a_ in F.DOOR_KEYS:
        L.door_angle(door_ob, a_, frame=f_)
    # ni flaques ni phares : à 2-6 m du sol vu par l'objectif, ses flaques de rampe et ses phares (tournés vers
    # nous) éclairaient tout le tiers bas ; restent la rampe, ses faisceaux et ses lueurs sur la carrosserie
    for o in pat.children_recursive:
        if o.type == "LIGHT" and "_head_" in o.name:
            o.data.energy = 0.0
    # les faisceaux de sa rampe partent vers l'arrière, presque à l'horizontale : vers l'avant, le corail frappait
    # le sol juste devant l'objectif et blanchissait tout le tiers bas
    L.bar_beams(pat, "patrol", yaws=((125, L.CORAL), (-125, L.LILAC)), energy=3000.0, tilt=3.0)
    M.flash_bars([pat], frames)
    # comme dans FIN6 : les lueurs de sa rampe, à 4 m, n'excluaient que la rampe et teintaient la berline
    car_out_of_rigs([pat], hero)
    # l'agent garde son armature : accroupi derrière la portière, il se redresse en joue (fin_pointe.OFFICER_KEYS)
    try:
        cop = L.officer_rig(F.OFFICER_KEYS, style=0, name="officer_fin")
        cop.location = (*F.OFFICER, 0.0)
        L.face(cop, F.OFFICER_LOOK)
    except Exception as e:
        print(f"[pointe] agent non posé : {e!r}", flush=True)
    # la fumée des pneus : sur la trace de la glissade, derrière la berline, aussi légère que dans FIN6. Une nappe
    # devant la voiture (0,42, de 0,1 à 0,9 m, à 6 m de l'objectif) remplissait toute la moitié basse : éclairée
    # par les lueurs, elle faisait le gris pâle et plat
    for ob in (L.smoke("fumee_arriere", (CX + 1.6, CY - 3.2, 0.8), (3.6, 4.4, 1.4), density=0.18, seed=4.0),
               L.smoke("fumee_trace", (CX + 1.5, CY - 11.0, 1.0), (3.5, 6.0, 1.6), density=0.12, seed=7.0)):
        # sur sa lancée, la fumée dépasse la berline vers l'objectif et gonfle (pose validée à la dernière image)
        loc, sc = ob.location.copy(), ob.scale.copy()
        for f_ in frames:
            e = 1.0 - (1.0 - min(1.0, (f_ - F.F0) / (F.FRAMES - 1))) ** 2
            ob.location = loc + Vector((0.0, F.SMOKE_DRIFT * (e - 1.0), -0.15 * (1.0 - e)))
            ob.scale = sc * (0.8 + 0.2 * e)
            ob.keyframe_insert("location", frame=f_)
            ob.keyframe_insert("scale", frame=f_)
    # plus de lueurs hors champ (FIN6 n'en a pas et son sol reste sombre) : le contre-jour de l'agent, c'est le
    # lampadaire de la pointe, derrière lui
    # le lampadaire de la pointe frappe la berline : ambre à 3,2 kW, il la sortait orange vif ; plus faible et
    # plus blanc, elle reste bordeaux sombre
    lp = bpy.data.objects.get("lamp_pointe_light")
    if lp:
        lp.data.energy = 1300.0
        lp.data.color = L.lin("#ffe2c2")[:3]
    # le haut du cadre : un hélicoptère au-dessus de la jetée, son projecteur sur la berline (sous la bande des 12 %)
    # le faisceau tombe raide (44°) et serré (6°) depuis l'avant droit : son empreinte reste autour de la berline
    # (jusqu'à 3,5 m devant elle) au lieu de s'étirer vers l'objectif ; l'hélicoptère reste dans le cadre, à
    # droite, sous la bande des 12 %
    heli, _ = L.helicopter("heli")
    L.put(heli, CX - 10.0, CY - 34.0, 34.0, heading=-20.0, pitch=-6.0, roll=5.0)
    aim_helis([heli], STOP + Vector((0, 0, 0.8)), energy=200000.0, car=hero, car_energy=60000.0, cone=6.0)
    # la brume est réelle depuis que lieux.haze tourne ses normales vers l'extérieur : 0,0005 sur 800 m laisse la
    # ville voilée mais lisible ; la nappe locale, plus dense, prend les faisceaux et les lueurs
    L.haze((CX - 80, CX + 80), (CY - 470, CY + 60), (L.WATER_Z, 50), 0.0005)
    # la nappe locale s'arrête devant la patrouille : entre elle et l'objectif, plus de voile laiteux
    L.haze((CX - 35, CX + 35), (CY - 45, CY + 4), (L.WATER_Z, 30), 0.0025, name="haze_pointe")
    cam_loc = Vector((CX + 0.7, CY + 8.97, 0.2))
    a = math.radians(-1.0)
    d = Vector((math.sin(a), -math.cos(a), math.tan(math.radians(14.0))))
    L.cap_images(1024, keep_objects=[hero, bpy.data.objects["pointe_sol"]])
    cam = L.camera("cam_FIN", cam_loc, cam_loc + d * 40.0, lens=24, fstop=2.2,
                   focus=(STOP.x, STOP.y + 1.0, 1.0))
    scene.render.use_motion_blur = True
    return cam


def plan_FIN6(scene, hidden, palier="socle"):
    """FIN6, l'encerclement, temps gelé : la berline au centre, un anneau de dix patrouilles et du fourgon à
    14 m tournés vers elle, une silhouette devant chacun, trois projecteurs d'hélicoptère croisés sur elle, les
    avions saisis dans le ciel. L'orbite, animée (56 images, fin6_orbite.py) : rayon 7 m, à 25 cm, sur 150°, de
    l'azimut 245° (trois quarts arrière gauche) à 95° ; elle finit sur l'image d'essai validée, trois quarts face,
    les mains levées et la ville derrière. Le temps est gelé : seuls tournent les rotors et battent les rampes et
    leurs faisceaux (2 Hz). Vu à 25 cm, la berline cache tout ce qui est derrière
    elle : l'anneau est calé pour que deux véhicules l'encadrent (le fourgon à droite, une patrouille à gauche), et
    le 18 mm prend les autres sur les bords ; les rampes de tout l'anneau posent leurs flaques de couleur sur
    l'enrobé mouillé."""
    import motion as M
    import fin6_orbite as F6
    decor(scene, hidden, all_lit=True, marina=(palier in ("marina", "complet")))
    scene.frame_start, scene.frame_end = F6.F0, F6.F0 + F6.FRAMES - 1
    frames = range(F6.F0 - 1, F6.F0 + F6.FRAMES + 1)
    rnd = random.Random(6)
    hero = L.hero()
    L.put(hero, STOP.x, STOP.y, 0.0, heading=HERO_STOP)
    L.hands_up(hero)
    L.cabin_light(hero, energy=25.0)
    skid_marks()
    ring = [(a, "van" if i == 0 else "patrol") for i, a in enumerate(F6.RING)]
    first, rigs = {}, []
    for i, (a, kind) in enumerate(ring):
        x, y = _polar(a, 14.0)
        r = first.get(kind)
        if r is None:
            r = first[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
            L.bar_pools(r, energy=1200.0)
        else:
            r = L.clone(r, f"{kind}_{i}")
        h = L.heading_to((STOP.x - x, STOP.y - y)) + rnd.uniform(-28, 28)
        L.put(r, x, y, 0.0, heading=h)
        beams = L.bar_beams(r, f"{kind}_{i}", yaws=((rnd.uniform(-60, 60), L.CORAL),
                                                     (rnd.uniform(120, 240), L.LILAC)), energy=5000.0)
        # vingt-deux faisceaux corail et lilas croisés sur la berline la passaient au rose : elle n'en reçoit que
        # le dixième, de leur couleur (un liseré), l'anneau et la brume gardent tout
        split_for_car(beams, hero, tag="rampe", fraction=0.1)
        rigs.append(r)
    # le temps est gelé, pas les gyrophares : rampes, faisceaux et flaques battent à 2 Hz (corail, lilas)
    n = M.flash_bars(rigs, frames)
    print(f"[FIN6] {n} lumières de rampe clignotantes", flush=True)
    # la vraie cause du rose et de la calandre brûlée : l'anneau gardait 42 lumières sans liaison (22 phares
    # tournés vers la berline, 20 feux) et 66 lueurs et flaques de rampe qui n'excluaient que leur rampe ; à 14 m,
    # toutes l'éclairaient en plein (calandre (187, 184, 209) au banc). Elle n'en reçoit plus que ses jumelles
    print(f"[FIN6] berline exclue de {car_out_of_rigs(rigs, hero)} lumières de l'anneau", flush=True)
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
    # sur la berline, trois projecteurs à 40 m : 15 kW chacun lui donnent la même lumière que les 60 kW du seul
    # projecteur de FIN, à 49 m, sous lequel elle reste bordeaux (à 50 kW chacun, elle sortait encore rose)
    # des cônes de 6° comme dans FIN : à 9°, les trois faisceaux emplissaient la brume autour de la berline d'un
    # voile clair qui la passait au rose (la brume n'obéit pas à la liaison de lumière)
    aim_helis(hs, STOP + Vector((0, 0, 0.8)), car=hero, car_energy=15000.0, cone=6.0)
    # le lampadaire de la pointe, ambre à 3,2 kW à 8 m de la berline, la sortait rose avec le faisceau : il garde sa
    # pleine puissance pour le sol et la brume, la berline n'en reçoit que la part de FIN (1300 W, crème)
    split_for_car([bpy.data.objects["lamp_pointe_light"]], hero, 1300.0, "#ffe2c2", tag="lampadaire")
    try:
        j = L.jet("jet")
        L.put(j, CX + 40.0, CY - 160.0, 55.0, heading=-8.0, pitch=-3.0, roll=18.0)
        j2 = L.clone(j, "jet_2")
        L.put(j2, CX + 12.0, CY - 190.0, 62.0, heading=-8.0, pitch=-3.0, roll=18.0)
    except Exception as e:
        print(f"[pointe] avions non chargés : {e!r}", flush=True)
    L.smoke("fumee_gelee", (CX + 0.8, CY - 2.6, 0.5), (3.0, 3.5, 0.8), density=0.16, seed=2.0)
    L.haze((CX - 90, CX + 90), (CY - 470, CY + 90), (L.WATER_Z, 60), 0.0005)
    # la nappe de la pointe à 0,0025 comme dans FIN : à 0,004, prise par les trois faisceaux, elle voilait la
    # berline de rose depuis l'objectif
    L.haze((CX - 35, CX + 35), (CY - 35, CY + 35), (L.WATER_Z, 40), 0.0025, name="haze_pointe")
    a = 95.0                                          # le milieu de l'arc de 150° (de 20° à 170°)
    cam_loc = (*_polar(a, 7.0), 0.25)
    L.cap_images(1024, keep_objects=[hero, bpy.data.objects["pointe_sol"]])
    cam = L.camera("cam_FIN6", cam_loc, (STOP.x, STOP.y, 1.6), lens=18, fstop=2.8,
                   focus=(STOP.x, STOP.y, 1.1))
    # l'orbite : la dernière image retrouve la pose ci-dessus (azimut 95°, visée à 1,6 m)
    M.key_camera(cam, frames, F6.camera)
    cam.data.dof.focus_object = hero
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    return cam


def p6_ground(x, y):
    """Le sol sous un véhicule de la colonne : la chaussée bombée de la jetée, le terre-plein plat, la rampe du
    pont et sa pente (scene_e.deck_ground)."""
    if y >= JY0 - 2.0 and abs(x - JX) < 6.0:
        return jetty_point(x, y).z, 0.0
    import scene_e
    return scene_e.deck_ground(x, y)


def plan_P6(scene, hidden, palier="socle"):
    """P6, toute la ville, animé (40 images, p6_jetee.py) : la grue monte de 14 à 35 m en reculant, 24 mm, dans
    l'axe de la jetée, tournée vers la ville ; à l'image fixe (21) la pose validée : 35 m, 65 m devant la berline,
    14° de plongée. La berline en tête sur la jetée à 120 km/h ; derrière elle quinze véhicules en colonne, rampes
    clignotantes, de la rampe du pont à la jetée par la voie du quai (ils ralentissent dans les deux virages) ;
    trois hélicoptères en formation qui la suivent, faisceaux croisés sur elle ; deux avions qui arrivent de
    derrière la ville, très bas dans l'axe de la jetée, passent au-dessus de la colonne et finissent au-dessus de
    la berline (ils ne tirent rien) ; la grue tremble à leur approche. Rien dans les 12 % du haut : le ciel."""
    import motion as M
    import p6_jetee as P6
    lamp_src = L.panorama(scene, hidden, all_lit=True, bridge="loin", port="loin", haubans=(palier in ("haubans", "complet")))
    build_jetty(hidden, lamp_src)
    build_pointe(hidden, lamp_src, far=True, marina=(palier in ("marina", "complet")))
    scene.frame_start, scene.frame_end = P6.F0, P6.F0 + P6.FRAMES - 1
    frames = range(P6.F0 - 1, P6.F0 + P6.FRAMES + 1)      # une image de part et d'autre : l'obturateur du flou
    hero = L.hero()
    wheels = L.hero_wheels(hero)
    poses = M.sample(P6.hero_pos, frames, wheel_r=hero["wheel_r"])
    M.key_vehicle(hero, poses, wheels=wheels, ground=p6_ground)
    M.wheel_marks(wheels, hero["wheel_r"])

    src, rigs = {}, []
    for i, (kind, _, _) in enumerate(P6.COLUMN):
        if kind not in src:
            r = src[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
            L.bar_pools(r, energy=2500.0)        # le ruban de gyrophares sur la chaussée mouillée, vu de 35 m
            L.bar_boost(r, 4.0)
        else:
            r = L.clone(src[kind], f"{kind}_{i}")
        x, y = P6.column_pos(i)(P6.T_STILL)
        L.put(r, x, y, p6_ground(x, y)[0])
        yaw = 25 + 70 * ((i * 37) % 5) / 4
        L.bar_beams(r, f"{kind}_{i}", yaws=((yaw, L.CORAL), (yaw - 180 + 25 * (i % 3), L.LILAC)))
        # les roues séparées (cast_vehicles.split_wheels) : elles tournent et braquent, la caisse penche seule
        body = M.body_of(r)
        wh, wr = M.wheels_of(body), body.get("wheel_r", 0.36)
        ps = M.sample(P6.column_pos(i), frames, wheel_r=wr, seed=float(i),
                      wheelbase=body.get("wheelbase", 2.9), front=body.get("front_axle"))
        M.key_vehicle(r, ps, wheels=wh, ground=p6_ground, pivot=(0.0, 0.0, 0.36))
        M.wheel_marks(wh, wr, axis="Y")
        rigs.append(r)
    n = M.flash_bars(rigs, frames)
    print(f"[P6] colonne de {len(rigs)} véhicules, {n} lumières de rampe clignotantes", flush=True)

    first, _ = L.helicopter("heli")
    hs = [first] + [L.clone(first, f"heli_{i}") for i in range(1, len(P6.HELIS))]
    for i, r in enumerate(hs):
        M.key_object(r, frames, P6.heli(i))
    scene.frame_set(P6.STILL_FRAME)
    aim_helis(hs, P6.beam_target(P6.T_STILL))
    for r in hs:
        piv = next(o for o in r.children_recursive if o.name.endswith("searchlight_pivot"))
        M.key_searchlight({"searchlight_pivot": piv}, frames, P6.beam_target)
    try:
        j = L.jet("jet")
        jets = [j, L.clone(j, "jet_2")]
        for i, r in enumerate(jets):
            M.key_object(r, frames, P6.jet(i))
    except Exception as e:  # l'avion n'est qu'une silhouette au fond : sans lui le plan tient
        print(f"[P6] avions non chargés : {e!r}", flush=True)
    # la brume seulement en couloir sur la jetée, sous la caméra : sur toute la lagune, vue de 35 m, elle diffusait
    # le ciel en un voile rose qui noyait l'eau noire et ses reflets (rendus du 12 novembre)
    L.haze((JX - 30, JX + 30), (JY0 - 20, JY1), (L.WATER_Z, 28), 0.0012)
    L.cap_images(1024)                                # tout est à 60 m et plus
    c = P6.camera(P6.T_STILL)
    cam = L.camera("cam_P6", c[:3], (c[0], c[1] - 100.0, c[2] - 100.0 * math.tan(math.radians(14))),
                   lens=P6.LENS, fstop=0.0)
    M.key_camera(cam, frames, P6.camera)
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    print(f"[P6] berline de y {poses[1]['y']:.0f} à {poses[-2]['y']:.0f} ; grue de {P6.camera(0.0)[2]:.0f} à "
          f"{P6.camera(P6.T_END)[2]:.0f} m", flush=True)
    return cam


STILL = {"P6": 21, "FIN6": 56, "FIN": 36}                        # l'image fixe d'essai des plans animés (STILL_FRAME)


PLANS = {"FIN": plan_FIN, "FIN6": plan_FIN6, "P6": plan_P6}


def build(plan, palier="complet"):
    """« complet » (par défaut, celui du film : render_film.py n'en passe pas) prend tous les paliers validés : la
    marina (P6, FIN, FIN6) et le pylône du pont (P6) ; « socle », « marina », « haubans » un seul (render_lieux.py)."""
    scene, hidden = L.new_scene()
    cam = PLANS[plan](scene, hidden, palier=palier)
    scene.camera = cam
    scene.frame_set(STILL.get(plan, 2))
    return scene
