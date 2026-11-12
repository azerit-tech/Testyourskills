# essai : les trois projecteurs d'hélicoptère de FIN6 à la puissance totale du seul projecteur de FIN (200 kW en
# tout, au lieu de 3 x 400 kW par défaut d'aim_helis) ; leurs jumelles sur la berline ne changent pas
n = 0
for o in scene.objects:
    if o.type == "LIGHT" and o.name.endswith("searchlight_spot"):
        o.data.energy = 200000.0 / 3
        n += 1
print(f"[diag] {n} projecteurs d'hélicoptère à {200000.0 / 3:.0f} W", flush=True)
