# iter_diag --exec fin_phare_dos : FIN vu de dos depuis la pointe (contrôle du phare, découpage v3 §3), caméra fixe
# derrière la berline arrêtée, 1 m, 24 mm, relevée de 7° vers le phare
import math

c = scene.camera  # noqa: F821  (l'espace de noms d'iter_diag)
c.animation_data_clear()
c.data.animation_data_clear()
c.location = (77.6, 423.5, 1.0)
c.rotation_mode = "XYZ"
c.rotation_euler = (math.radians(97.0), 0.0, math.radians(4.0))
c.data.lens = 24.0
c.data.dof.use_dof = False
