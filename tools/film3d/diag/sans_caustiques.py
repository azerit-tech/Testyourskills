# essai : plus de caustiques réfléchies (scene.cycles.caustics_reflective) : le spot du lampadaire renvoyé vers
# le haut par le sol mouillé (un miroir) n'éclaire plus la brume que par hasard, d'où le nuage de grains ?
c = scene.cycles
print(f"[diag] caustiques réfléchies {c.caustics_reflective}, réfractées {c.caustics_refractive}, "
      f"flou des reflets {c.blur_glossy}, clamp {c.sample_clamp_direct}/{c.sample_clamp_indirect}", flush=True)
c.caustics_reflective = False
print("[diag] caustiques réfléchies coupées", flush=True)
