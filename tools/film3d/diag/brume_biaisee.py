# essai : le rendu des volumes « biaisé » de Cycles (scene.cycles.volume_biased), moins de bruit pour un peu de biais
scene.cycles.volume_biased = True
print(f"[diag] volumes biaisés ; clamp direct {scene.cycles.sample_clamp_direct}, indirect "
      f"{scene.cycles.sample_clamp_indirect}, rebonds de volume {scene.cycles.volume_bounces}", flush=True)
