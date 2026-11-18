# Le relevé du bas du cadre à une coupe (SPEC §18.63) : pourquoi la chaussée sous la berline n'a pas la même
# luminance des deux côtés d'une coupe continue, alors que la ville pose les mêmes lieux. Lu par render_film dans le
# Blender ouvrier, image par image, avant le rendu :
#   --essai audit     <out>/<PLAN>+audit…/audit-NNNN.json : ce que touchent les rayons de la caméra dans le quart bas
#                     du cadre (objet, lieu, matière), les lampes à moins de AUDIT_R m de la berline (lieu, énergie
#                     à l'image, couleur, visibilités, liaisons) et l'éclairement grossier qu'elles donnent au sol
#                     sous le centre du bas du cadre, le ciel, l'exposition, les brumes montrées ; l'image ne change pas
#   --essai sol_gris  les objets touchés par ces rayons (hors berline) prennent un gris diffus uni (0,18) : si le saut
#                     reste, c'est la lumière ; s'il part, c'est le sol (matière, objet, recouvrement)
# Puis : python3 tools/film3d/diag/coupes.py --rendu <out> --tag +audit+ville+brouillon (ou +sol_gris…), et la
# comparaison des relevés de part et d'autre de chaque coupe (python3 tools/film3d/diag/audit_sol.py A.json B.json).
import json
import math
import os
import re
import sys

AUDIT_R = 60.0
GRILLE = (12, 6)            # rayons en largeur × hauteur dans le quart bas du cadre
GRIS = 0.18


PROPRE = ["(plan)"]         # le lieu du plan rendu (ses objets n'ont pas de ville_lieu), posé par releve


def _lieu(o):
    while o is not None:
        v = o.get("ville_lieu")
        if v:
            return v
        o = o.parent
    return PROPRE[0]


def _parents(o):
    out = []
    while o.parent is not None:
        o = o.parent
        out.append(o)
    return out


def rayons(bpy, scene):
    """[(u, v, objet, matière, distance)] des rayons de la caméra dans le quart bas du cadre."""
    from mathutils import Vector
    cam = scene.camera
    dg = bpy.context.evaluated_depsgraph_get()
    mw = cam.matrix_world
    fr = [mw @ c for c in cam.data.view_frame(scene=scene)]      # haut droit, bas droit, bas gauche, haut gauche
    o = mw.translation
    out = []
    nx, ny = GRILLE
    for j in range(ny):
        v = (j + 0.5) / ny * 0.25                                   # 0 : le bas du cadre
        for i in range(nx):
            u = (i + 0.5) / nx
            bas = fr[2].lerp(fr[1], u)
            haut = fr[3].lerp(fr[0], u)
            p = bas.lerp(haut, v)
            d = (p - o).normalized()
            org, hit_name, mat, dist = o.copy(), None, None, None
            for _ in range(12):
                hit, loc, _n, idx, ob, _m = scene.ray_cast(dg, org, d)
                if not hit:
                    break
                if ob.hide_render or ob.name.startswith(("haze", "spray_", "fumee")):
                    org = loc + d * 0.002
                    continue
                hit_name = ob.name
                try:
                    ev = ob.evaluated_get(dg)
                    mi = ev.data.polygons[idx].material_index
                    mat = ev.material_slots[mi].material.name if ev.material_slots[mi].material else None
                except Exception:
                    mat = None
                dist = (loc - o).length
                out.append(dict(u=round(u, 3), v=round(v, 3), objet=hit_name, lieu=_lieu(ob), matiere=mat,
                                dist=round(dist, 2), sol=[round(c, 2) for c in loc]))
                break
    return out


def lampes(bpy, scene, centre, sol):
    from mathutils import Vector
    out = []
    for ob in scene.objects:
        if ob.type != "LIGHT" or ob.hide_render:
            continue
        p = ob.matrix_world.translation
        if (p - centre).length > AUDIT_R:
            continue
        d = ob.data
        e = d.energy
        ll = getattr(ob, "light_linking", None)
        rc = ll.receiver_collection.name if ll and ll.receiver_collection else None
        dist = (p - sol).length if sol is not None else None
        irr = None
        if sol is not None and d.type in ("POINT", "SPOT", "AREA") and dist:
            irr = e / (4 * math.pi * dist * dist)
            if d.type == "SPOT":
                ax = ob.matrix_world.to_3x3() @ Vector((0, 0, -1))
                if ax.angle(sol - p) > d.spot_size / 2:
                    irr = 0.0
            if d.type == "AREA":
                ax = ob.matrix_world.to_3x3() @ Vector((0, 0, -1))
                irr *= max(0.0, math.cos(ax.angle(sol - p)))
        out.append(dict(nom=ob.name, lieu=_lieu(ob), type=d.type, energie=round(e, 2),
                        couleur=[round(c, 3) for c in d.color], pos=[round(c, 2) for c in p],
                        dist_sol=round(dist, 2) if dist else None, eclairement=round(irr, 4) if irr is not None else None,
                        diffus=getattr(ob, "visible_diffuse", True), brillant=getattr(ob, "visible_glossy", True),
                        recepteurs=rc))
    out.sort(key=lambda l: -(l["eclairement"] or 0))
    return out


def releve(bpy, scene, frame, path, plan=None):
    from mathutils import Vector
    if plan:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        import ville
        PROPRE[0] = ville.lieu_of_shot(plan)[0]
    hero = bpy.data.objects.get("hero")
    centre = hero.matrix_world.translation.copy() if hero else scene.camera.matrix_world.translation.copy()
    rs = rayons(bpy, scene)
    mid = [r for r in rs if abs(r["u"] - 0.5) < 0.1]
    sol = Vector(mid[0]["sol"]) if mid else None
    ls = lampes(bpy, scene, centre, sol)
    w = scene.world
    bg = None
    if w and w.node_tree:
        for n in w.node_tree.nodes:
            if n.type == "BACKGROUND":
                bg = n.inputs["Strength"].default_value
    vs = scene.view_settings
    hazes = []
    for o in scene.objects:
        if o.type == "MESH" and o.name.startswith("haze") and not o.hide_render:
            dens = None
            for s in o.material_slots:
                m = s.material
                for nd in (m.node_tree.nodes if m and m.node_tree else ()):
                    if nd.type == "PRINCIPLED_VOLUME":
                        dens = None if nd.inputs["Density"].links else round(nd.inputs["Density"].default_value, 5)
            hazes.append(dict(nom=o.name, lieu=_lieu(o), densite=dens))
    par_obj = {}
    for r in rs:
        k = f"{r['objet']} | {r['lieu']} | {r['matiere']}"
        par_obj[k] = par_obj.get(k, 0) + 1
    rep = dict(image=frame, ciel=w.name if w else None, ciel_force=bg, exposition=vs.exposure, look=vs.look,
               film_exposure=scene.cycles.film_exposure, brumes=hazes, sol_touche=par_obj,
               eclairement_sol=round(sum(l["eclairement"] or 0 for l in ls), 4), lampes=ls[:40], rayons=rs)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rep, f, indent=1, ensure_ascii=False)
    print(f"[audit] image {frame} : {len(rs)} rayons, {len(par_obj)} objets touchés, {len(ls)} lampes à moins de "
          f"{AUDIT_R:g} m, éclairement grossier {rep['eclairement_sol']:.3f}", flush=True)
    return rs


def sol_gris(bpy, scene, rs):
    gris = bpy.data.materials.get("audit_sol_gris")
    if gris is None:
        gris = bpy.data.materials.new("audit_sol_gris")
        gris.use_nodes = True
        p = next(n for n in gris.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Base Color"].default_value = (GRIS, GRIS, GRIS, 1)
        p.inputs["Roughness"].default_value = 1.0
    n = 0
    for name in sorted({r["objet"] for r in rs}):
        ob = bpy.data.objects.get(name)
        if ob is None or name.startswith(("hero", "coupe")) or "body" in ob.keys() or \
                any(p.name == "hero" for p in _parents(ob)):
            continue
        for s in ob.material_slots:
            if s.material is not gris:
                s.link = "OBJECT"
                s.material = gris
                n += 1
    print(f"[audit] sol gris : {n} emplacements de matière", flush=True)


def compare(a, b):
    A, B = json.load(open(a, encoding="utf-8")), json.load(open(b, encoding="utf-8"))
    for k in ("ciel", "ciel_force", "exposition", "look", "film_exposure", "eclairement_sol"):
        if A.get(k) != B.get(k):
            print(f"{k} : {A.get(k)} | {B.get(k)}")
    print("brumes :", [(h["nom"], h["densite"]) for h in A["brumes"]], "|", [(h["nom"], h["densite"]) for h in B["brumes"]])
    ka, kb = set(A["sol_touche"]), set(B["sol_touche"])
    for k in sorted(ka | kb):
        print(f"sol {A['sol_touche'].get(k, 0):3d} | {B['sol_touche'].get(k, 0):3d}  {k}")
    la = {(re.sub(r"\.\d{3}$", "", l["nom"]), l["lieu"]): l for l in A["lampes"]}
    lb = {(re.sub(r"\.\d{3}$", "", l["nom"]), l["lieu"]): l for l in B["lampes"]}
    for k in sorted(set(la) | set(lb), key=lambda k: -max((la.get(k) or {}).get("eclairement") or 0,
                                                           (lb.get(k) or {}).get("eclairement") or 0)):
        x, y = la.get(k), lb.get(k)
        ex = x and (x["energie"], x["eclairement"], x["diffus"], x["recepteurs"])
        ey = y and (y["energie"], y["eclairement"], y["diffus"], y["recepteurs"])
        if ex != ey:
            print(f"lampe {k[0]} ({k[1]}) : {ex} | {ey}")


if __name__ == "__main__":
    compare(sys.argv[1], sys.argv[2])
