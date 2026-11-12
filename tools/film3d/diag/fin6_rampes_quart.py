# essai : les faisceaux de rampe de l'anneau (22 spots de 5 kW) au quart
n = 0
for o in scene.objects:
    if o.type == "LIGHT" and "_beam_" in o.name and not o.name.endswith("_hero"):
        o.data.energy *= 0.25
        n += 1
print(f"[diag] {n} faisceaux de rampe au quart", flush=True)
