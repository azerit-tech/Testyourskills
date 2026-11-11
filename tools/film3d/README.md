# Film 3D : tests de look en Blender (Cycles)

Les assets et les rendus restent hors du dépôt, dans `Azerit/design/film/` (`assets/`, `ref/`). Crédits : `CREDITS.md`.

**Télécharger les assets** (Sketchfab CC BY avec la clé du `.env`, Poly Haven CC0) :

```sh
python3 tools/film3d/fetch.py
```

**Construire la scène de l'image A** (écrit `assets/scene-a.blend`) :

```sh
nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/scene_a.py
```

**Rendre l'image fixe** (écrit `ref/test-a.png`, plus `test-a-raw.png` sans grain) :

```sh
nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 -P tools/film3d/render.py -- --samples 512
```

Options de `render.py` : `--blur` (flou de bougé, obturateur 180°, la scène roule à 50 km/h ; écrit `test-a-blur.png`), `--preview` (360 × 640, 64 échantillons), `--samples N`, `--threads N` (2 par défaut pour laisser le Mac utilisable, 0 = tous), `--gpu` (Metal, ou OptiX/CUDA sur une machine louée ; CPU par défaut), `--grain` (intensité du grain ffmpeg, 0 = aucun).

Le premier rendu Metal d'une session compile ses noyaux pendant environ deux minutes. Un rendu Metal plein format a planté une fois à la compilation (`MetalKernelPipeline`) et est passé au second essai.
