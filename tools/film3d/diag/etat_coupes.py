# L'état de la scène des deux côtés de chaque coupe, sans rendu (SPEC §18.73). Le film est une seule prise rendue
# par tronçons : à la même image du film, les deux tronçons qui se suivent doivent montrer la même ville. Ce contrôle
# relève, dans le Blender de chaque tronçon, tel que render_film le rend (scène du cache, voisins de la ville, vie,
# clins, effets), ce que la caméra voit aux images de la coupe, et compare les deux relevés :
#   - les réglages du rendu (échantillons, débruiteur, bornes, volumes, exposition) ;
#   - la caméra (la même pose : le garde-fou du relevé lui-même) ;
#   - les objets dans le champ, par famille (l'objet de tête et ses enfants) : présents des deux côtés, à la même
#     place dans la ville, avec les mêmes matières (empreinte de l'arbre de nœuds) et les mêmes propriétés ;
#   - le sol sous la berline et dans le quart bas du cadre : objet, lieu, matière ;
#   - les lampes : présentes des deux côtés, même puissance, couleur, cône, place, visée, visibilités, liaisons ;
#   - l'hélicoptère et son projecteur (place, visée au sol, puissances) ;
#   - les effets (fx_*) et les brumes montrés.
# Chaque tronçon se relève à quatre images : celle d'avant sa première, sa première, sa dernière, celle d'après
# (les clés de l'obturateur existent de part et d'autre) ; la coupe a | b se compare donc deux fois, à l'image a et à
# l'image b du film, les deux tronçons posés à la même image.
#
#   python3 tools/film3d/diag/etat_coupes.py --ville DIR --out DIR             # relève les huit tronçons et compare
#   python3 tools/film3d/diag/etat_coupes.py --ville DIR --out DIR --coupes 485,317     # ces coupes seulement
#   python3 tools/film3d/diag/etat_coupes.py --compare DIR/etat               # compare des relevés déjà faits
#   python3 tools/film3d/diag/etat_coupes.py --selftest                        # la comparaison, sans Blender
#   options : --blender PATH ; --threads N (2 sur le Mac) ; --strict (code de sortie 1 s'il reste un écart)
#
# Le relevé passe par render_film (--essai etat) : la scène relevée est celle qui serait rendue, avec le même
# environnement FILM3D_* ; aucune image n'est rendue. Une coupe sans écart ne prouve pas l'image (le bruit, le
# débruiteur, une ombre portée de loin) : elle prouve que les deux tronçons rendent la même scène.
import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILM3D = os.path.dirname(HERE)
if FILM3D not in sys.path:
    sys.path.insert(0, FILM3D)

PORTEE = 260.0          # m : au-delà, un objet du champ n'est pas relevé (il fait moins de quelques pixels)
PETIT = 0.012           # part de la hauteur du cadre : une famille plus petite à l'écran n'est pas relevée
GRILLE = (12, 6)        # rayons du quart bas du cadre (diag/audit_sol.py)
RACINES = re.compile(r"^(ville_.+_racine|vie_racine|clins_racine)$")
HELICO = re.compile(r"^heli(_\d+)?([.:]|$)")
# les réglages du rendu qui changent l'image d'un tronçon à l'autre (scene.cycles, scene.render, vue)
CYCLES = ("samples", "use_adaptive_sampling", "adaptive_threshold", "adaptive_min_samples", "use_denoising", "denoiser",
          "denoising_input_passes", "denoising_prefilter", "sample_clamp_direct", "sample_clamp_indirect",
          "max_bounces", "diffuse_bounces", "glossy_bounces", "transmission_bounces", "volume_bounces",
          "transparent_max_bounces", "caustics_reflective", "caustics_refractive", "blur_glossy", "volume_step_rate",
          "volume_max_steps", "volume_biased", "light_sampling_threshold", "use_light_tree", "film_exposure",
          "pixel_filter_type", "filter_width", "motion_blur_position", "texture_limit_render")
RENDER = ("use_motion_blur", "motion_blur_shutter", "film_transparent", "use_simplify", "simplify_subdivision_render",
          "fps")
VUE = ("view_transform", "look", "exposure", "gamma")

# les tolérances de la comparaison
TOL_POS = 0.10          # m : la même famille des deux côtés (une image du film, la même place)
TOL_LAMPE_POS = 0.10    # m
TOL_ENERGIE = 0.03      # relatif
TOL_COULEUR = 0.02
TOL_VISEE = 0.5         # m au sol (un projecteur) ; ° sinon
TOL_ANGLE = 1.0
JUMEAU = 1.0            # m : deux familles de noms différents à moins de ça et de même taille sont la même


def nom_source(nom):
    """Le nom sans le suffixe de copie que Blender ajoute au chargement d'un voisin (haze.001 : haze)."""
    return re.sub(r"\.\d{3}$", "", nom)


# ---------------------------------------------------------------- le relevé, dans Blender

def _arrondi(v, n=4):
    try:
        return [round(float(c), n) for c in v]
    except TypeError:
        return round(float(v), n)


DETAIL = {}             # nom de l'arbre -> ses lignes (la dernière empreinte calculée : le détail d'un écart)


def _sig_arbre(tree, vu=None):
    """L'empreinte d'un arbre de nœuds : types, réglages, valeurs des entrées libres, liens (groupes compris)."""
    vu = vu if vu is not None else {}
    if tree.name in vu:
        return vu[tree.name]
    vu[tree.name] = "…"
    lignes = []
    for n in sorted(tree.nodes, key=lambda n: n.name):
        ln = [n.bl_idname, nom_source(n.name)]
        for k in ("operation", "blend_type", "data_type", "attribute_name", "attribute_type", "distribution",
                  "subsurface_method", "interpolation", "projection", "vector_type", "noise_dimensions", "mode",
                  "space", "feature", "distance", "layer_name", "uv_map", "label", "clamp", "use_clamp"):
            if hasattr(n, k):
                ln.append(f"{k}={getattr(n, k)}")
        img = getattr(n, "image", None)
        if img is not None:
            ln.append("image=" + nom_source(img.name))
        ramp = getattr(n, "color_ramp", None)
        if ramp is not None:
            ln.append("rampe=" + ";".join(f"{e.position:.4f}:{','.join(f'{c:.4f}' for c in e.color)}"
                                          for e in ramp.elements))
        sub = getattr(n, "node_tree", None)
        if sub is not None:
            ln.append("groupe=" + _sig_arbre(sub, vu))
        for s in n.inputs:
            if s.is_linked or not hasattr(s, "default_value"):
                continue
            try:
                v = s.default_value
                v = ",".join(f"{float(c):.4f}" for c in v) if hasattr(v, "__len__") and not isinstance(v, str) \
                    else (f"{float(v):.4f}" if isinstance(v, (int, float)) else str(v))
            except Exception:
                v = "?"
            ln.append(f"{s.identifier}={v}")
        for s in n.outputs:                                         # (les nœuds Valeur, RVB : leur sortie est le réglage)
            if n.bl_idname in ("ShaderNodeValue", "ShaderNodeRGB") and hasattr(s, "default_value"):
                v = s.default_value
                ln.append("sortie=" + (",".join(f"{float(c):.4f}" for c in v) if hasattr(v, "__len__")
                                       else f"{float(v):.4f}"))
        lignes.append("|".join(ln))
    for l in sorted((nom_source(l.from_node.name), l.from_socket.identifier, nom_source(l.to_node.name),
                     l.to_socket.identifier) for l in tree.links):
        lignes.append(">".join(l))
    h = hashlib.md5("\n".join(lignes).encode("utf-8")).hexdigest()[:10]
    vu[tree.name] = h
    DETAIL[tree.name] = lignes
    return h


def _detail_matiere(m):
    """Les lignes de l'arbre d'une matière et de ses groupes (ce que l'empreinte résume), pour dire ce qui diffère."""
    if m is None or m.node_tree is None:
        return []
    out, vus, pile = [], set(), [m.node_tree]
    while pile:
        t = pile.pop()
        if t.name in vus:
            continue
        vus.add(t.name)
        _sig_arbre(t, {})
        out += [f"{nom_source(t.name)} :: {l}" for l in DETAIL.get(t.name, ())]
        pile += [n.node_tree for n in t.nodes if getattr(n, "node_tree", None) is not None]
    return out


def _sig_matiere(m, cache):
    if m is None:
        return "(aucune)"
    k = m.name
    if k not in cache:
        cache[k] = _sig_arbre(m.node_tree) if m.node_tree is not None else "sans-noeuds"
    return cache[k]


def _lieu(o, propre):
    while o is not None:
        v = o.get("ville_lieu")
        if v:
            return v
        if o.name == "vie_racine" or o.get("vie"):
            return "vie"
        if o.name == "clins_racine" or o.name.startswith("clin_"):
            return "clins"
        o = o.parent
    return propre


def _tete(o):
    """L'objet de tête de la famille : le plus haut parent qui n'est pas une racine de pose (ville, vie, clins)."""
    while o.parent is not None and not RACINES.match(o.parent.name):
        o = o.parent
    return o


def _rendus(bpy, scene):
    """Les objets que le rendu montre : ni cachés au rendu, ni dans une collection cachée ou exclue."""
    ok = set()

    def walk(lc, hidden):
        hidden = hidden or lc.exclude or lc.collection.hide_render
        if not hidden:
            ok.add(lc.collection.name)
        for ch in lc.children:
            walk(ch, hidden)
    walk(bpy.context.view_layer.layer_collection, False)
    return [o for o in scene.objects if not o.hide_render and any(c.name in ok for c in o.users_collection)]


def _liaison(c):
    """[(nom, état)] d'une collection de liaison de lumière, noms sans suffixe de copie, triés."""
    if c is None:
        return None
    out = [(nom_source(o.name), co.light_linking.link_state) for o, co in zip(c.objects, c.collection_objects)]
    for ch, cc in zip(c.children, c.collection_children):
        out += [(nom_source(o.name), cc.light_linking.link_state) for o in ch.all_objects]
    return sorted(set(out))


def _resume_liaison(membres):
    if membres is None:
        return None
    inc = sorted(n for n, e in membres if e == "INCLUDE")
    exc = sorted(n for n, e in membres if e == "EXCLUDE")
    h = hashlib.md5(json.dumps(membres).encode("utf-8")).hexdigest()[:8]
    return dict(inclus=len(inc), exclus=len(exc), empreinte=h, noms_inclus=inc[:400], noms_exclus=exc[:400])


def releve(bpy, scene, plan, frame):
    """L'état de la scène du plan à l'image `frame` (déjà posée par frame_set), dans le repère de la ville."""
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Matrix, Vector
    import parcours as P
    import ville as V
    propre = V.lieu_of_shot(plan)[0]
    vers_ville = Matrix(V.matrice(V.lieu(propre)["plan"]))
    de_ville = vers_ville.inverted()
    dg = bpy.context.evaluated_depsgraph_get()
    cam = scene.camera
    cam_ev = cam.evaluated_get(dg)
    cmw = cam_ev.matrix_world
    g = P.START[plan] + frame - scene.frame_start

    def ville(p):
        return _arrondi(vers_ville @ Vector(p), 3)

    def cap(v):
        d = vers_ville.to_3x3() @ Vector(v)
        return _arrondi(d.normalized(), 4)

    rep = dict(plan=plan, image_scene=frame, image_film=g, lieu=propre)
    c, r, vs = scene.cycles, scene.render, scene.view_settings
    rep["rendu"] = dict({k: (_arrondi(getattr(c, k)) if isinstance(getattr(c, k, None), float) else getattr(c, k, None))
                         for k in CYCLES},
                        **{k: (_arrondi(getattr(r, k)) if isinstance(getattr(r, k, None), float)
                               else getattr(r, k, None)) for k in RENDER},
                        **{k: (_arrondi(getattr(vs, k)) if isinstance(getattr(vs, k, None), float)
                               else getattr(vs, k, None)) for k in VUE})
    w = scene.world
    fonds = []
    if w is not None and w.node_tree is not None:
        fonds = [_arrondi(n.inputs["Strength"].default_value) for n in w.node_tree.nodes if n.type == "BACKGROUND"]
    rep["monde"] = dict(forces=fonds)
    rep["horloge"] = _arrondi(scene.get("film_image")) if scene.get("film_image") is not None else None
    rep["camera"] = dict(pos=ville(cmw.translation), axe=cap(cmw.to_3x3() @ Vector((0, 0, -1))),
                         focale=_arrondi(cam_ev.data.lens, 3))

    rendus = _rendus(bpy, scene)
    cache_m = {}
    # --- les familles dans le champ
    fam = {}
    for o in rendus:
        if o.type not in ("MESH", "CURVE", "FONT") or o.name.startswith(("haze", "fumee", "spray_")):
            continue
        fam.setdefault(_tete(o).name, []).append(o)
    familles = []
    for top_name, objs in fam.items():
        top = bpy.data.objects[top_name]
        pts = []
        mats = {}
        for o in objs:
            ev = o.evaluated_get(dg)
            mw = ev.matrix_world
            pts += [mw @ Vector(cn) for cn in ev.bound_box]
            if not getattr(o, "visible_camera", True):
                continue
            for s in ev.material_slots:
                if s.material is not None:
                    mats[nom_source(s.material.name)] = _sig_matiere(s.material, cache_m)
        if not pts:
            continue
        # la boîte dans les axes de la ville : la même des deux côtés d'une coupe (deux tronçons n'ont pas les
        # mêmes axes de scène ; alignée sur ceux de la scène, elle changeait de taille et de place dans le cadre)
        pv = [vers_ville @ p for p in pts]
        mn = Vector((min(p.x for p in pv), min(p.y for p in pv), min(p.z for p in pv)))
        mx = Vector((max(p.x for p in pv), max(p.y for p in pv), max(p.z for p in pv)))
        ctr_v = (mn + mx) / 2
        ctr = de_ville @ ctr_v
        if (ctr - cmw.translation).length > PORTEE + (mx - mn).length / 2:
            continue
        uv = [world_to_camera_view(scene, cam, de_ville @ p) for p in
              [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]]
        devant = [p for p in uv if p.z > 0.05]
        if not devant:
            continue
        u0, u1 = min(p.x for p in devant), max(p.x for p in devant)
        v0, v1 = min(p.y for p in devant), max(p.y for p in devant)
        if len(devant) < 8:                                   # à cheval sur le plan de la caméra : jusqu'aux bords
            u0, u1, v0, v1 = min(u0, 0.0), max(u1, 1.0), min(v0, 0.0), max(v1, 1.0)
        if u1 < 0.0 or u0 > 1.0 or v1 < 0.0 or v0 > 1.0:
            continue
        haut = min(v1, 1.0) - max(v0, 0.0)
        large = min(u1, 1.0) - max(u0, 0.0)
        if max(haut, large * 9.0 / 16.0) < PETIT:
            continue
        props = {}
        tev = top.evaluated_get(dg)
        for k in tev.keys():
            if k.startswith(("ville_", "loc_lieu", "_")) or k in ("vie",):
                continue
            val = tev[k]
            if isinstance(val, (int, float)):
                props[k] = round(float(val), 3)
        familles.append(dict(nom=nom_source(top_name), lieu=_lieu(top, propre), centre=_arrondi(ctr_v, 3),
                             taille=_arrondi(mx - mn, 2), ecran=_arrondi((u0, v0, u1, v1), 3),
                             dist=round((ctr - cmw.translation).length, 1), objets=len(objs), matieres=mats,
                             props=props))
    rep["familles"] = sorted(familles, key=lambda f: f["dist"])

    # --- la berline et le sol : sous elle, et dans le quart bas du cadre
    # le rig de la berline : « hero » (lieux.rig) ou, dans les scènes qui le nomment autrement (rig_berline de P2 et
    # P3, l'avenue), l'ancêtre de tête de ses vitres (propriété « vitre », hero_cars.split_glass) ; +y vers l'avant
    hero = bpy.data.objects.get("hero")
    if hero is None:
        for o in scene.objects:
            if o.type == "MESH" and o.get("vitre") and o.get("ville_lieu") is None:
                while o.parent is not None:
                    o = o.parent
                hero = o
                break
    if hero is not None:
        hmw = hero.evaluated_get(dg).matrix_world
        rep["berline"] = dict(pos=ville(hmw.translation), cap=cap(hmw.to_3x3() @ Vector((0, 1, 0))))

    def touche(org, d, dist=1e4, garder=None):
        org = org.copy()
        for _ in range(16):
            hit, loc, _n, idx, ob, _m = scene.ray_cast(dg, org, d, distance=dist)
            if not hit:
                return None
            if ob.hide_render or ob.name.startswith(("haze", "spray_", "fumee", "fx_")) or \
                    not getattr(ob, "visible_camera", True):
                org = loc + d * 0.002
                continue
            mat = None
            try:
                ev = ob.evaluated_get(dg)
                m = ev.material_slots[ev.data.polygons[idx].material_index].material
                mat = (nom_source(m.name), _sig_matiere(m, cache_m)) if m is not None else None
                if m is not None and garder is not None and mat[0] not in garder and len(garder) < 4:
                    garder[mat[0]] = _detail_matiere(m)
            except Exception:
                pass
            return dict(objet=nom_source(ob.name), lieu=_lieu(ob, propre), matiere=mat[0] if mat else None,
                        empreinte=mat[1] if mat else None, point=ville(loc))
        return None

    sols = []
    detail = {}                # matière du sol sous la berline -> les lignes de son arbre (4 matières au plus)
    if hero is not None:
        hp = hmw.translation
        ax = (hmw.to_3x3() @ Vector((0, 1, 0))).normalized()
        lat = Vector((ax.y, -ax.x, 0.0))
        for nom, dp in (("derrière 4 m", -4.0 * ax), ("derrière 8 m", -8.0 * ax), ("gauche 3 m", -3.0 * lat),
                        ("droite 3 m", 3.0 * lat), ("devant 5 m", 5.0 * ax)):
            t = touche(hp + dp + Vector((0, 0, 3.0)), Vector((0, 0, -1)), 12.0, garder=detail)
            t = t or dict(objet=None, lieu=None, matiere=None, empreinte=None)
            sols.append(dict(point=nom, objet=t["objet"], lieu=t["lieu"], matiere=t["matiere"],
                             empreinte=t["empreinte"]))
    rep["sol_berline"] = sols
    rep["sol_detail"] = detail
    fr = [cmw @ c for c in cam_ev.data.view_frame(scene=scene)]      # haut droit, bas droit, bas gauche, haut gauche
    o0 = cmw.translation
    bas = {}
    nx, ny = GRILLE
    for j in range(ny):
        v = (j + 0.5) / ny * 0.25
        for i in range(nx):
            u = (i + 0.5) / nx
            p = fr[2].lerp(fr[1], u).lerp(fr[3].lerp(fr[0], u), v)
            t = touche(o0, (p - o0).normalized())
            k = f"{t['objet']} | {t['lieu']} | {t['matiere']} | {t['empreinte']}" if t else "(rien)"
            bas[k] = bas.get(k, 0) + 1
    rep["sol_cadre"] = bas

    # --- les lampes
    hpos = hmw.translation if hero is not None else cmw.translation
    lampes = []
    for o in rendus:
        if o.type != "LIGHT":
            continue
        ev = o.evaluated_get(dg)
        d = ev.data
        mw = ev.matrix_world
        p = mw.translation
        dist = (p - hpos).length
        e = float(d.energy)
        if e <= 0.0:
            continue
        axe = (mw.to_3x3() @ Vector((0, 0, -1))).normalized()
        poids = None
        if d.type in ("POINT", "SPOT", "AREA"):
            poids = e / (4 * math.pi * max(dist, 0.3) ** 2)
            if d.type == "SPOT" and dist > 0.3 and axe.angle(hpos - p) > d.spot_size / 2 + math.radians(4.0):
                poids = 0.0
        if dist > PORTEE and (poids or 0.0) < 1e-4 and d.type != "SUN":
            continue
        vise = None
        if d.type == "SPOT" and axe.z < -0.05:                # le point du sol (z de la berline) que vise le cône
            k = (hpos.z - p.z) / axe.z
            vise = ville(p + axe * k)
        ll = o.light_linking
        lampes.append(dict(
            nom=nom_source(o.name), lieu=_lieu(o, propre), tete=nom_source(_tete(o).name), type=d.type,
            energie=round(e, 3), couleur=_arrondi(d.color, 3), pos=ville(p), axe=cap(axe),
            cone=round(math.degrees(d.spot_size), 2) if d.type == "SPOT" else None,
            fondu=round(d.spot_blend, 3) if d.type == "SPOT" else None,
            source=round(getattr(d, "shadow_soft_size", 0.0), 3), taille=round(getattr(d, "size", 0.0), 3),
            vise=vise, dist_berline=round(dist, 1), poids=round(poids, 5) if poids is not None else None,
            camera=bool(o.visible_camera), diffus=bool(o.visible_diffuse), brillant=bool(o.visible_glossy),
            brume=bool(o.visible_volume_scatter), ombre=bool(getattr(d, "use_shadow", True)),
            recoit=_resume_liaison(_liaison(ll.receiver_collection)),
            bloque=_resume_liaison(_liaison(ll.blocker_collection))))
    rep["lampes"] = sorted(lampes, key=lambda l: -(l["poids"] or 0.0))

    # --- l'hélicoptère
    helis = []
    for o in rendus:
        if o.parent is None and HELICO.match(o.name):
            mw = o.evaluated_get(dg).matrix_world
            helis.append(dict(nom=nom_source(o.name), pos=ville(mw.translation),
                              cap=cap(mw.to_3x3() @ Vector((0, 1, 0)))))
    rep["helicos"] = helis

    # --- les effets et les brumes
    fxs = []
    for o in rendus:
        if not o.name.startswith("fx_") or o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        try:
            me = ev.to_mesh()
            nv = len(me.vertices)
            if nv:
                mw = ev.matrix_world
                cs = [mw @ v.co for v in (me.vertices[i] for i in range(0, nv, max(1, nv // 200)))]
                ctr = sum(cs, Vector()) / len(cs)
            else:
                ctr = None
            ev.to_mesh_clear()
        except Exception:
            nv, ctr = None, None
        fxs.append(dict(nom=nom_source(o.name), lieu=_lieu(o, propre), sommets=nv, centre=ville(ctr) if ctr else None,
                        matieres={nom_source(s.material.name): _sig_matiere(s.material, cache_m)
                                  for s in ev.material_slots if s.material is not None}))
    rep["fx"] = sorted(fxs, key=lambda f: f["nom"])
    brumes = []
    for o in rendus:
        if o.type == "MESH" and o.name.startswith("haze"):
            dens = None
            for s in o.material_slots:
                m = s.material
                for nd in (m.node_tree.nodes if m and m.node_tree else ()):
                    if nd.type == "PRINCIPLED_VOLUME":
                        dens = None if nd.inputs["Density"].links else round(nd.inputs["Density"].default_value, 5)
            brumes.append(dict(nom=nom_source(o.name), lieu=_lieu(o, propre), densite=dens))
    rep["brumes"] = sorted(brumes, key=lambda b: b["nom"])
    return rep


def releve_plan(bpy, scene, plan, out):
    """render_film --essai etat : les quatre relevés du plan (avant sa première image, sa première, sa dernière,
    après sa dernière), écrits dans <out>/etat/g<image du film>-<plan>.json. Rien n'est rendu."""
    import parcours as P
    n = dict(P.SHOTS).get(plan) or getattr(P, "FIN6_FRAMES", None)
    fs = scene.frame_start
    d = os.path.join(out, "etat")
    os.makedirs(d, exist_ok=True)
    total = P.START["FIN6"] + P.FIN6_FRAMES
    faits = []
    for f in (fs - 1, fs, fs + n - 1, fs + n):
        g = P.START[plan] + f - fs
        if g < 0 or g >= total or (g < P.START[plan] and plan == "OUV") or (plan == "FIN6" and f > fs):
            continue
        scene.frame_set(f)
        rep = releve(bpy, scene, plan, f)
        path = os.path.join(d, f"g{g:04d}-{plan}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(rep, fh, ensure_ascii=False, indent=1)
        faits.append(g)
        print(f"[etat] {plan} image {f} (film {g}) : {len(rep['familles'])} familles dans le champ, "
              f"{len(rep['lampes'])} lampes, {len(rep['fx'])} effets -> {path}", flush=True)
    return faits


# ---------------------------------------------------------------- la comparaison, sans Blender

def _dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _apparier(A, B, cle, pos, tol_nom=None):
    """Apparie deux listes d'articles : par nom (le plus proche d'abord quand un nom revient), puis les restes par
    place (JUMEAU). Rend (paires, seuls_a, seuls_b)."""
    par = {}
    for i, b in enumerate(B):
        par.setdefault(cle(b), []).append(i)
    pris = set()
    paires, seuls_a = [], []
    for a in A:
        cands = [i for i in par.get(cle(a), ()) if i not in pris]
        if cands:
            i = min(cands, key=lambda i: _dist(pos(a), pos(B[i])))
            if tol_nom is None or _dist(pos(a), pos(B[i])) <= tol_nom:
                pris.add(i)
                paires.append((a, B[i]))
                continue
        seuls_a.append(a)
    restes = [i for i in range(len(B)) if i not in pris]
    encore = []
    for a in seuls_a:
        cands = [i for i in restes if _dist(pos(a), pos(B[i])) <= JUMEAU and _meme_taille(a, B[i])]
        if cands:
            i = min(cands, key=lambda i: _dist(pos(a), pos(B[i])))
            restes.remove(i)
            paires.append((a, B[i]))
        else:
            encore.append(a)
    return paires, encore, [B[i] for i in restes]


def _meme_taille(a, b):
    ta, tb = a.get("taille"), b.get("taille")
    if not isinstance(ta, (list, tuple)) or not isinstance(tb, (list, tuple)):      # (une lampe : son type)
        return a.get("type") == b.get("type")
    return all(abs(x - y) <= 0.25 * max(x, y, 0.5) for x, y in zip(ta, tb))


def _ecran(f):
    u0, v0, u1, v1 = f["ecran"]
    return f"cadre x {max(u0, 0) * 100:.0f}–{min(u1, 1) * 100:.0f} %, y {max(v0, 0) * 100:.0f}–{min(v1, 1) * 100:.0f} %"


def comparer(A, B):
    """Les écarts entre deux relevés de la même image du film (A : le tronçon d'avant, B : celui d'après).
    Rend une liste de (rubrique, texte)."""
    out = []
    pa, pb = A["plan"], B["plan"]

    def note(rub, txt):
        out.append((rub, txt))

    # les réglages du rendu
    for k in sorted(set(A["rendu"]) | set(B["rendu"])):
        if A["rendu"].get(k) != B["rendu"].get(k):
            note("rendu", f"{k} : {A['rendu'].get(k)} ({pa}) | {B['rendu'].get(k)} ({pb})")
    if A["monde"] != B["monde"]:
        note("rendu", f"force du ciel : {A['monde']['forces']} | {B['monde']['forces']}")
    if A.get("horloge") != B.get("horloge"):
        note("rendu", f"horloge film_image : {A.get('horloge')} | {B.get('horloge')}")
    # la caméra et la berline : le garde-fou du relevé
    d = _dist(A["camera"]["pos"], B["camera"]["pos"])
    ang = math.degrees(math.acos(max(-1.0, min(1.0, sum(x * y for x, y in zip(A["camera"]["axe"], B["camera"]["axe"]))))))
    if d > 0.05 or ang > 0.3 or abs(A["camera"]["focale"] - B["camera"]["focale"]) > 0.05:
        note("caméra", f"{d:.2f} m, {ang:.2f}° et {A['camera']['focale']} | {B['camera']['focale']} mm d'écart")
    if A.get("berline") and B.get("berline"):
        d = _dist(A["berline"]["pos"], B["berline"]["pos"])
        if d > 0.05:
            note("berline", f"{d:.2f} m d'écart de place")
    # le sol
    for sa, sb in zip(A["sol_berline"], B["sol_berline"]):
        ka = (sa["objet"], sa["lieu"], sa["matiere"], sa["empreinte"])
        kb = (sb["objet"], sb["lieu"], sb["matiere"], sb["empreinte"])
        if ka != kb:
            note("sol", f"sous la berline, {sa['point']} : {ka[0]} ({ka[1]}, {ka[2]} {ka[3]}) | "
                        f"{kb[0]} ({kb[1]}, {kb[2]} {kb[3]})")
    da, db = A.get("sol_detail") or {}, B.get("sol_detail") or {}
    for k in sorted(set(da) & set(db)):
        la, lb = set(da[k]), set(db[k])
        if la != lb:
            sa_, sb_ = sorted(la - lb), sorted(lb - la)
            note("sol", f"matière « {k} », {len(sa_)} ligne(s) propres à {pa}, {len(sb_)} à {pb} :")
            for tag, ls in ((pa, sa_), (pb, sb_)):
                for l in ls[:8]:
                    note("sol", f"    {tag} : {l[:260]}")
    for k in sorted(set(A["sol_cadre"]) | set(B["sol_cadre"])):
        na, nb = A["sol_cadre"].get(k, 0), B["sol_cadre"].get(k, 0)
        if abs(na - nb) >= 2:
            note("sol", f"quart bas du cadre, rayons {na:2d} | {nb:2d} : {k}")
    # les familles dans le champ
    paires, sa, sb = _apparier(A["familles"], B["familles"], lambda f: f["nom"], lambda f: f["centre"])
    for cote, plan, seuls in ((pa, pb, sa), (pb, pa, sb)):
        for f in seuls:
            note("objets", f"« {f['nom']} » ({f['lieu']}) dans {cote}, absent de {plan} : à {f['dist']:.0f} m, "
                           f"{_ecran(f)}, {f['objets']} objet(s)")
    for a, b in paires:
        d = _dist(a["centre"], b["centre"])
        if d > TOL_POS or not _meme_taille(a, b):
            note("objets", f"« {a['nom']} » ({a['lieu']} | {b['lieu']}) : déplacé de {d:.2f} m, taille "
                           f"{a['taille']} | {b['taille']} ({_ecran(a)})")
        ma, mb = a["matieres"], b["matieres"]
        diff = sorted(k for k in set(ma) | set(mb) if ma.get(k) != mb.get(k))
        if diff:
            note("matières", f"« {a['nom']} » ({a['lieu']} | {b['lieu']}, {_ecran(a)}) : " + ", ".join(
                f"{k} {ma.get(k, 'absente')} | {mb.get(k, 'absente')}" for k in diff[:6])
                + ("…" if len(diff) > 6 else ""))
        ka, kb = a.get("props") or {}, b.get("props") or {}
        diff = sorted(k for k in set(ka) | set(kb) if ka.get(k) != kb.get(k))
        if diff:
            note("objets", f"« {a['nom']} » : propriétés " + ", ".join(f"{k} {ka.get(k)} | {kb.get(k)}"
                                                                      for k in diff[:6]))
    # les lampes
    paires, sa, sb = _apparier(A["lampes"], B["lampes"], lambda l: l["nom"], lambda l: l["pos"], tol_nom=3.0)
    # la même lampe (même nom, même objet de tête) loin de sa place d'en face : son porteur n'est pas au même
    # endroit des deux côtés de la coupe (une patrouille, un hélicoptère) ; dit une fois par porteur
    reste_b = list(sb)
    porteurs = {}
    for l in list(sa):
        m = next((x for x in reste_b if x["nom"] == l["nom"] and x.get("tete") == l.get("tete")), None)
        if m is None:
            continue
        sa.remove(l)
        reste_b.remove(m)
        porteurs.setdefault(l.get("tete") or l["nom"], []).append((l, m))
    sb = reste_b
    for tete, lm in sorted(porteurs.items()):
        l, m = max(lm, key=lambda q: max(q[0]["energie"], q[1]["energie"]))
        note("lampes", f"« {tete} » n'est pas à la même place : ses {len(lm)} lampe(s) à {_dist(l['pos'], m['pos']):.1f} m "
                       f"d'écart (« {l['nom']} », {l['energie']:g} W : à {l['dist_berline']:.0f} m de la berline, poids "
                       f"{l['poids']} dans {pa} | à {m['dist_berline']:.0f} m, poids {m['poids']} dans {pb})")
    for cote, plan, seuls in ((pa, pb, sa), (pb, pa, sb)):
        for l in seuls:
            rc = l["recoit"]
            lie = f", liée ({rc['inclus']} inclus, {rc['exclus']} exclus)" if rc else ""
            note("lampes", f"« {l['nom']} » ({l['lieu']}, {l['type']}, {l['energie']:g} W{lie}) dans {cote}, absente "
                           f"de {plan} : à {l['dist_berline']:.0f} m de la berline, poids {l['poids']}")
    for a, b in paires:
        ecarts = []
        ea, eb = a["energie"], b["energie"]
        if abs(ea - eb) > TOL_ENERGIE * max(ea, eb):
            ecarts.append(f"puissance {ea:g} | {eb:g} W")
        if max(abs(x - y) for x, y in zip(a["couleur"], b["couleur"])) > TOL_COULEUR:
            ecarts.append(f"couleur {a['couleur']} | {b['couleur']}")
        if _dist(a["pos"], b["pos"]) > TOL_LAMPE_POS:
            ecarts.append(f"place {_dist(a['pos'], b['pos']):.2f} m")
        if a["vise"] and b["vise"]:
            if _dist(a["vise"], b["vise"]) > TOL_VISEE:
                ecarts.append(f"visée au sol {_dist(a['vise'], b['vise']):.2f} m")
        elif a["type"] in ("SPOT", "AREA", "SUN"):
            ang = math.degrees(math.acos(max(-1.0, min(1.0, sum(x * y for x, y in zip(a["axe"], b["axe"]))))))
            if ang > TOL_ANGLE:
                ecarts.append(f"axe {ang:.1f}°")
        for k, nom in (("cone", "cône"), ("fondu", "fondu"), ("source", "source"), ("taille", "taille")):
            if a.get(k) != b.get(k) and abs((a.get(k) or 0) - (b.get(k) or 0)) > 0.02 * max(abs(a.get(k) or 0),
                                                                                           abs(b.get(k) or 0), 0.01):
                ecarts.append(f"{nom} {a.get(k)} | {b.get(k)}")
        for k, nom in (("camera", "vue de la caméra"), ("diffus", "diffus"), ("brillant", "reflets"),
                       ("brume", "brume"), ("ombre", "ombres")):
            if a.get(k) != b.get(k):
                ecarts.append(f"{nom} {a.get(k)} | {b.get(k)}")
        for k, nom in (("recoit", "éclaire"), ("bloque", "ombre de")):
            ra, rb = a.get(k), b.get(k)
            if (ra or {}).get("empreinte") != (rb or {}).get("empreinte"):
                if ra is None or rb is None:
                    ecarts.append(f"{nom} : {'tout' if ra is None else 'liée'} | {'tout' if rb is None else 'liée'}")
                    continue
                for etat in ("inclus", "exclus"):
                    na, nb = set(ra["noms_" + etat]), set(rb["noms_" + etat])
                    if na != nb:
                        da, db = sorted(na - nb), sorted(nb - na)
                        ecarts.append(f"{nom}, {etat} seulement dans {pa} : {', '.join(da[:5])}{'…' if len(da) > 5 else ''}"
                                      f" ({len(da)}) ; seulement dans {pb} : {', '.join(db[:5])}"
                                      f"{'…' if len(db) > 5 else ''} ({len(db)})")
        if ecarts:
            note("lampes", f"« {a['nom']} » ({a['lieu']} | {b['lieu']}, à {a['dist_berline']:.0f} m, poids "
                           f"{a['poids']}) : " + " ; ".join(ecarts))
    # l'hélicoptère
    ha, hb = A["helicos"], B["helicos"]
    if len(ha) != len(hb):
        note("hélicoptère", f"{len(ha)} appareil(s) dans {pa}, {len(hb)} dans {pb}")
    for a, b in zip(ha, hb):
        d = _dist(a["pos"], b["pos"])
        ang = math.degrees(math.acos(max(-1.0, min(1.0, sum(x * y for x, y in zip(a["cap"], b["cap"]))))))
        if d > 0.2 or ang > 1.0:
            note("hélicoptère", f"« {a['nom']} » : {d:.2f} m et {ang:.1f}° d'écart")
    # les effets et les brumes
    def famille_fx(nom):                    # fx_brume_P5 et fx_brume_P6 : la même eau, tirée par chaque tronçon
        return re.sub(r"_(OUV|P\d|FIN6?)$", "", nom)
    fa = {famille_fx(f["nom"]): dict(f, tire=f["nom"] != famille_fx(f["nom"])) for f in A["fx"]}
    fb = {famille_fx(f["nom"]): dict(f, tire=f["nom"] != famille_fx(f["nom"])) for f in B["fx"]}
    for k in sorted(set(fa) | set(fb)):
        a, b = fa.get(k), fb.get(k)
        na, nb = (a or {}).get("sommets") or 0, (b or {}).get("sommets") or 0
        if (a is None or b is None) and max(na, nb) == 0:
            continue
        if a is None or b is None:
            note("effets", f"« {k} » : {na} sommets dans {pa}, {nb} dans {pb}"
                           f"{' (absent de ' + (pa if a is None else pb) + ')'}")
            continue
        if a.get("tire") or b.get("tire"):
            continue                        # (tirés par chaque tronçon sur sa fenêtre : le compte de points diffère,
                                            # la continuité de l'eau aux coupes est le contrôle de test_fx)
        if abs(na - nb) > 0.1 * max(na, nb, 20):
            note("effets", f"« {k} » : {na} | {nb} sommets")
        elif a.get("centre") and b.get("centre") and _dist(a["centre"], b["centre"]) > 0.5:
            note("effets", f"« {k} » : centre déplacé de {_dist(a['centre'], b['centre']):.2f} m")
        if a["matieres"] != b["matieres"]:
            note("effets", f"« {k} » : matières {a['matieres']} | {b['matieres']}")
    ba = sorted((b["nom"], b["densite"]) for b in A["brumes"])
    bb = sorted((b["nom"], b["densite"]) for b in B["brumes"])
    if ba != bb:
        note("brumes", f"{ba} | {bb}")
    return out


def coupes():
    """[(image d'avant, image d'après, plan d'avant, plan d'après)] des sept coupes du film."""
    import parcours as P
    noms = [p for p, _n in P.SHOTS] + ["FIN6"]
    return [(P.START[b] - 1, P.START[b], a, b) for a, b in zip(noms, noms[1:])]


def rapport(d, choisies=None):
    """Compare les relevés du dossier `d`. Rend (texte, nombre d'écarts, coupes sans relevé)."""
    lignes, total, manque = [], 0, []
    for ga, gb, pa, pb in coupes():
        if choisies and ga not in choisies and gb not in choisies:
            continue
        lignes.append(f"===== coupe {ga} | {gb} ({pa} → {pb})")
        for g in (ga, gb):
            fa, fb = os.path.join(d, f"g{g:04d}-{pa}.json"), os.path.join(d, f"g{g:04d}-{pb}.json")
            if not (os.path.exists(fa) and os.path.exists(fb)):
                lignes.append(f"  image {g} : relevé absent ({os.path.basename(fa if not os.path.exists(fa) else fb)})")
                manque.append((ga, gb))
                continue
            A, B = json.load(open(fa, encoding="utf-8")), json.load(open(fb, encoding="utf-8"))
            ecarts = comparer(A, B)
            total += len(ecarts)
            lignes.append(f"  image {g} du film ({pa}/{A['image_scene']} et {pb}/{B['image_scene']}) : "
                          f"{len(A['familles'])} | {len(B['familles'])} familles dans le champ, {len(A['lampes'])} | "
                          f"{len(B['lampes'])} lampes ; {len(ecarts)} écart(s)")
            rub = None
            for r, t in sorted(ecarts, key=lambda e: e[0]):
                if r != rub:
                    lignes.append(f"    [{r}]")
                    rub = r
                lignes.append(f"      {t}")
    lignes.append(f"===== {total} écart(s) au total" + (f", {len(manque)} relevé(s) absent(s)" if manque else ""))
    return "\n".join(lignes), total, manque


# ---------------------------------------------------------------- le pilote

def plans_des_coupes(choisies):
    ps = []
    for ga, gb, pa, pb in coupes():
        if not choisies or ga in choisies or gb in choisies:
            ps += [p for p in (pa, pb) if p not in ps]
    return ps


def selftest():
    base = dict(plan="A", image_scene=60, image_film=485, lieu="port",
                rendu=dict(samples=32, volume_biased=False), monde=dict(forces=[0.65]), horloge=485.0,
                camera=dict(pos=[0, 0, 2.4], axe=[0, 1, 0], focale=24.0), berline=dict(pos=[0, 7, 0], cap=[0, 1, 0]),
                sol_berline=[dict(point="derrière 4 m", objet="port_terre_plein", lieu="port", matiere="tp",
                                  empreinte="aa")],
                sol_cadre={"port_terre_plein | port | tp | aa": 72},
                familles=[dict(nom="rail", lieu="port", centre=[5, 20, 1], taille=[10, 0.1, 1], ecran=[0.1, 0.4, 0.3, 0.5],
                               dist=20.0, objets=3, matieres={"acier": "x1"}, props={})],
                lampes=[dict(nom="projo_tache_0", lieu="port", tete="heli", type="SPOT", energie=1000.0,
                             couleur=[1, 1, 1], pos=[0, 60, 20], axe=[0, -0.9, -0.4], cone=10.0, fondu=0.5, source=1.2,
                             taille=0.0, vise=[0, 9, 0], dist_berline=57.0, poids=0.02, camera=False, diffus=True,
                             brillant=True, brume=False, ombre=True, recoit=None, bloque=None)],
                helicos=[dict(nom="heli", pos=[0, 60, 20], cap=[0, -1, 0])], fx=[], brumes=[])
    B = json.loads(json.dumps(base))
    B["plan"], B["lieu"] = "B", "jetee"
    assert comparer(base, B) == [], comparer(base, B)
    # un objet absent, une lampe de plus, une visée déplacée, une matière et un réglage différents : cinq écarts
    B["familles"] = []
    B["lampes"][0]["vise"] = [2, 9, 0]
    B["lampes"].append(dict(B["lampes"][0], nom="hero_face", pos=[0, 14, 1.4], energie=250.0, type="AREA", vise=None))
    B["sol_berline"][0]["empreinte"] = "bb"
    B["rendu"]["volume_biased"] = True
    rubs = sorted(r for r, _t in comparer(base, B))
    assert rubs == ["lampes", "lampes", "objets", "rendu", "sol"], rubs
    # un jumeau : un autre nom, la même place et la même taille
    C = json.loads(json.dumps(base))
    C["plan"] = "C"
    C["familles"][0]["nom"] = "garde_corps"
    assert comparer(base, C) == [], comparer(base, C)
    assert [c[:2] for c in coupes()] == [(74, 75), (107, 108), (214, 215), (317, 318), (425, 426), (485, 486),
                                         (618, 619)], coupes()
    assert plans_des_coupes({485}) == ["P5", "P6"]
    print("[etat] selftest : comparaison (sans écart, cinq écarts, jumeau), coupes, plans : ok")


def main():
    ap = argparse.ArgumentParser(description="L'état de la scène des deux côtés de chaque coupe (voir l'en-tête).")
    ap.add_argument("--ville", default=None, help="le cache de la ville (ville.py --cache)")
    ap.add_argument("--out", default=None, help="le dossier du contrôle (les relevés dans <out>/etat)")
    ap.add_argument("--coupes", default=None, help="485,317 : les coupes à contrôler (toutes par défaut)")
    ap.add_argument("--compare", default=None, metavar="DIR", help="compare des relevés déjà faits")
    ap.add_argument("--blender", default=None)
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--strict", action="store_true", help="code de sortie 1 s'il reste un écart")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        selftest()
        return
    choisies = {int(x) for x in a.coupes.split(",")} if a.coupes else None
    d = a.compare
    if d is None:
        if not (a.ville and a.out):
            sys.exit("[etat] --ville DIR --out DIR (ou --compare DIR, ou --selftest)")
        plans = plans_des_coupes(choisies)
        cmd = [sys.executable, os.path.join(FILM3D, "render_film.py"), "--ville", a.ville, "--out", a.out,
               "--essai", "etat", "--plan", ",".join(plans), "--threads", str(a.threads)]
        if os.environ.get("FILM3D_DRAFT", "").strip() not in ("", "0"):
            cmd.append("--draft")
        if a.blender:
            cmd += ["--blender", a.blender]
        print("[etat] " + " ".join(cmd), flush=True)
        r = subprocess.run(cmd)
        if r.returncode != 0:
            print("[etat] ! un tronçon n'a pas pu être relevé (voir <out>/<PLAN>+etat…/blender.log)", flush=True)
        d = os.path.join(a.out, "etat")
    txt, total, manque = rapport(d, choisies)
    print(txt)
    with open(os.path.join(d, "rapport.txt"), "w", encoding="utf-8") as f:
        f.write(txt + "\n")
    if a.strict and (total or manque):
        sys.exit(1)


if __name__ == "__main__":
    main()
