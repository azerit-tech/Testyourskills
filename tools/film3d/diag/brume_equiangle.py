# essai : les boîtes de brume échantillonnées en équiangle (vers les lumières), plus en distance + MIS : le
# nuage de grains autour du lampadaire vient-il de la singularité en 1/r² de son spot dans la brume ?
n = 0
for o in scene.objects:
    if o.name.startswith("haze") and o.type == "MESH":
        for m in o.data.materials:
            if m:
                m.cycles.volume_sampling = "EQUIANGULAR"
                n += 1
print(f"[diag] {n} matières de brume en équiangle", flush=True)
