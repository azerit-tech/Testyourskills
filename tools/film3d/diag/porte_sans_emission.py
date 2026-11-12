# essai : la portière détachée sans émission (copie de ses matières, émission à 0)
door = next(o for o in scene.objects if o.name.endswith("_portiere"))
for i, m in enumerate(door.data.materials):
    if m is None or not m.node_tree:
        continue
    c = m.copy()
    for nd in c.node_tree.nodes:
        if nd.type == "BSDF_PRINCIPLED":
            es = nd.inputs["Emission Strength"]
            for l in list(es.links):
                c.node_tree.links.remove(l)
            es.default_value = 0.0
    door.data.materials[i] = c
print("[diag] portière sans émission", flush=True)
