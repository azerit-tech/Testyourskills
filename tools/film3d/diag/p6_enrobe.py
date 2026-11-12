# essai P6 : l'enrobé de la jetée moins mouillé (vernis à 0,3, comme le tablier du pont pour P4) : vu en rasant à
# 0,55 m et flouté par 120 km/h, il reflétait le ciel en un voile blanc sur toute la moitié basse
done = set()
for o in scene.objects:
    if o.type != "MESH" or not o.name.startswith("jetee"):
        continue
    for m in o.data.materials:
        if m is None or m.name in done or not m.node_tree:
            continue
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED" and "Coat Weight" in n.inputs and not n.inputs["Coat Weight"].is_linked:
                if n.inputs["Coat Weight"].default_value > 0.3:
                    n.inputs["Coat Weight"].default_value = 0.3
                    done.add(m.name)
print(f"[diag] vernis à 0,3 sur {sorted(done)}", flush=True)
