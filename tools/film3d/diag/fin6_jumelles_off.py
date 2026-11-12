# essai : les jumelles de la berline éteintes (projecteurs, lampadaire, rampes : les lumières qui n'éclairent
# qu'elle) ; ce qui reste sur la carrosserie est le reflet du décor
n = 0
for o in scene.objects:
    if o.type == "LIGHT" and o.name.endswith("_hero"):
        o.data.energy = 0.0
        n += 1
print(f"[diag] {n} jumelles de la berline éteintes", flush=True)
