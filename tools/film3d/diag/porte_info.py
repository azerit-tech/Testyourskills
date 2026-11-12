# essai : l'inventaire de la portière détachée de la patrouille de FIN (matières, UV du bas de la portière,
# émission), sans rien changer
import bmesh

door = next(o for o in scene.objects if o.name.endswith("_portiere"))
me = door.data
print(f"[diag] portière {door.name} : {len(me.polygons)} faces, matières {[m.name if m else None for m in me.materials]}")
uvl = me.uv_layers.active
for mi, m in enumerate(me.materials):
    polys = [p for p in me.polygons if p.material_index == mi]
    if not polys:
        continue
    zs = [me.vertices[v].co.z for p in polys for v in p.vertices]
    us = [uvl.data[li].uv for p in polys for li in p.loop_indices] if uvl else []
    lo = [uvl.data[li].uv for p in polys if p.center.z < 0.6 for li in p.loop_indices] if uvl else []
    inkeep = sum(1 for uv in lo if uv.x <= 0.34 and uv.y >= 0.78)
    print(f"[diag]   {m.name if m else None} : {len(polys)} faces, z {min(zs):.2f}-{max(zs):.2f}, "
          f"uv {min(u.x for u in us):.2f}-{max(u.x for u in us):.2f} x {min(u.y for u in us):.2f}-{max(u.y for u in us):.2f}, "
          f"bas (z<0,6) {len(lo)} coins dont {inkeep} dans la zone d'atlas gardée", flush=True)
    if m and m.node_tree:
        for nd in m.node_tree.nodes:
            if nd.type == "BSDF_PRINCIPLED":
                es = nd.inputs["Emission Strength"]
                print(f"[diag]   émission {'liée' if es.is_linked else es.default_value}", flush=True)
            if nd.type == "TEX_COORD":
                print(f"[diag]   coordonnées de texture, objet {nd.object}", flush=True)
            if nd.type == "TEX_IMAGE" and nd.image:
                print(f"[diag]   image {nd.image.name}", flush=True)
print(f"[diag] portière à {tuple(round(x, 2) for x in door.matrix_world.translation)}, origine charnière", flush=True)
