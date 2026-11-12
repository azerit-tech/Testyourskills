# la brume de P6 : coupée avant le dessous de la caméra (y <= 300), en coordonnées du monde
ob = bpy.data.objects["haze"]
mw, mi = ob.matrix_world, ob.matrix_world.inverted()
for v in ob.data.vertices:
    w = mw @ v.co
    if w.y > 300:
        w.y = 300
        v.co = mi @ w
ob.data.update()
