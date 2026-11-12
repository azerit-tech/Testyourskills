# Film 3D : tests de look en Blender (Cycles)

Les assets et les rendus restent hors du dépôt, dans `Azerit/design/film/` (`assets/`, `ref/`). Crédits : `CREDITS.md`.

**La règle machine** (en vigueur, elle remplace celles plus bas) : un seul Blender à la fois sur le Mac, toujours sous le verrou commun (`lockf -k <verrou> nice -n 19 … -b -t 2`), jamais deux, jamais sans le verrou. Le cadrage se fait en Workbench (quelques secondes, sans noyaux). La lumière se vérifie en Cycles sur le processeur seulement : deux fils, 360 × 640, 32 échantillons, débruiteur ; un rendu qui dépasse 4 minutes ou 2 Go s'arrête, et la scène s'allège. La carte graphique ne sert que sur la machine louée, où les mêmes scènes se rendent telles quelles (`--engine cycles --gpu --percent 100 --samples 256`).

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

Options de `render.py` : `--shot a|b|c|d` (a l'ouverture ; b drone, deux patrouilles gyrophares allumés ; c trois quarts arrière bas, une patrouille collée ; d profil à hauteur de roue ; b à d en flou de bougé, écrits `test-b-drone.png`, `test-c-arriere.png`, `test-d-profil.png`), `--blur` (flou de bougé, obturateur 180°, la scène roule à 50 km/h ; écrit `test-a-blur.png`), `--preview` (360 × 640, 64 échantillons), `--samples N`, `--threads N` (2 par défaut pour laisser le Mac utilisable, 0 = tous), `--gpu` (Metal, ou OptiX/CUDA sur une machine louée ; CPU par défaut), `--grain` (intensité du grain ffmpeg, 0 = aucun).

Le premier rendu Metal d'une session compile ses noyaux pendant environ deux minutes. Un rendu Metal plein format a planté une fois à la compilation (`MetalKernelPipeline`) et est passé au second essai.

**Le banc d'essai du réalisme** (`lab/`) : un même bout de rue (une parcelle de 20 m, la chaussée, deux palmiers, trois lampadaires, le ciel et le réflecteur du film) et deux caméras fixes, 360 × 640 à 64 échantillons, pour comparer des méthodes à armes égales. `lab/bench.py` le construit, `lab/baseline.py` y pose la façade actuelle ; chaque méthode est un script `lab/<méthode>.py` qui écrit `ref/lab/<méthode>-large.png` et `-pres.png`. Les téléchargements d'essai passent par `python3 -I tools/film3d/lab/labfetch.py sketchfab|polyhaven|ambientcg …` (les fonctions de `fetch.py`, ambientCG compris).

```sh
lockf -k <verrou> nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/lab/baseline.py
```

**La règle des rendus** : voir la règle machine en tête (un seul Blender sous le verrou, `-t 2`, Cycles processeur bridé ; plus de carte graphique sur le Mac).

**Les variantes de la rue** se choisissent au moment de construire la scène, par des variables d'environnement lues par `scene_a.py` :

- `FILM3D_FACADE=base|kit|proc|mix` : les boîtes d'origine, les pièces assemblées (`facade_kit.py`), tout en nœuds (`facade_proc.py`), ou le mélange, par défaut (`facade_mix.py` : étages en enduit photographique, rez-de-chaussée en boutiques de bibliothèque).
- `FILM3D_ROUTE=base|pluie|sechage` : l'enrobé d'origine, la rue juste après l'averse ou la rue qui sèche (`road.py`), par défaut depuis le choix de Jacques du 11 novembre.
- `FILM3D_RDC=terrasse|sobre` (façades `mix`) : stores et guirlandes (par défaut) ou devantures nues, avec moins d'objets.
- `FILM3D_PARKED` : les voitures garées sont là par défaut, `FILM3D_PARKED=0` les retire.
- `FILM3D_HERO=w111|slc|coupe` : la voiture poursuivie, la berline des années 60 par défaut, le coupé des années 70 (les deux par `lab/hero_cars.py`) ou le coupé d'origine. Elle garde le nom d'objet `coupe` et ses roues `wheel_*` (`render.py` la cherche ainsi), phares crème et feux arrière allumés, roues qui tournent dans les plans en flou de bougé.
- `FILM3D_DRIVER=0` : la voiture d'époque roule vide ; par défaut le conducteur à capuche y est assis (`lab/cast_people.py`, `cast_driver_in_car` : volant mesuré sur sa matière, assise, dossier et pavillon trouvés par lancers de rayons ; le journal de construction donne les cotes et l'écart des mains). Le coupé d'origine roule vide dans la rue.
- `FILM3D_BLEND` : le nom du `.blend` écrit dans `assets/` (`scene-a.blend` par défaut).

```sh
FILM3D_FACADE=kit FILM3D_ROUTE=sechage lockf -k <verrou> nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/scene_a.py
```

`render.py --percent N` rend à N % de 720 × 1280 (75 donne 540 × 960) ; `--gpu` rend sur la carte graphique.

**La distribution** : `cast.py` écrit `assets/cast.blend`, une collection par famille. `cast_interior` : le coupé, son rétroviseur intérieur, le conducteur assis mains au volant, une patrouille gyrophare allumé derrière, vue dans le rétroviseur. `cast_people` : le conducteur mains levées, les agents (visée debout, accroupi, garde), arme en main. `cast_vehicles` : la patrouille, le fourgon, l'hélicoptère, l'avion et les plots. Les gens et les véhicules viennent des modules du laboratoire (`lab/cast_people.py`, `lab/cast_vehicles.py`) ; leurs modèles sont dans `assets/cast/<rôle>/`, téléchargés par `fetch.py`. L'assemblage n'a pas encore été rendu (11 novembre).

```sh
lockf -k <verrou> nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/cast.py
lockf -k <verrou> nice -n 10 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 -P tools/film3d/cast_render.py -- --sheet interieur
```

`cast_render.py` rend une planche depuis `cast.blend` : `--sheet interieur` (540 × 960, écrit `ref/cast-interieur.png`), `personnes` (éclairés de face, `cast-personnes.png`), `contrejour` (`cast-personnes-contrejour.png`) ou `vehicules` (`cast-vehicules.png`), en 1600 × 900 pour les trois dernières. GPU Metal par défaut (`--cpu` sinon), 128 échantillons (`--samples N`), `--scale N` en pourcentage de la résolution.

**Le laboratoire** (`lab/`) garde le banc d'essai et les candidats. Les méthodes du banc : `A_kit.py` (pièces assemblées), `B_upper_test.py` (les étages en enduit photographique), `C_proc.py` (tout en nœuds), `D_road.py` (la chaussée mouillée), `P_palms.py` (les palmiers), `W_wagon.py` (les voitures garées), `A_pres.py` (plan fixe rapproché de la scène mélange). Les candidats de la distribution :

- `lab/cast_vehicles.py -- --sheet …` : `van`, `helico`, `avion`, `props` mettent les candidats côte à côte dans un studio gris, la patrouille à gauche pour l'échelle (`ref/lab/cast-vehicules-comparatif-<planche>.png`) ; `crepuscule` montre les retenus à l'heure bleue et écrit `assets/cast/lab-vehicles.blend` ; `patrouille-choisie`, `avant-apres`, `finalistes-patrouille`, `finalistes-helico`, `finalistes-avion` sont des planches de choix.
- `lab/hero_cars.py -- --sheet avant-apres --car w111|slc` et `--sheet finalistes` : la voiture poursuivie, deux voitures d'époque CC BY retravaillées (marques retirées, peinture, chromes, feux allumés, habitacle) ; le modèle livré à gauche, le retravaillé à droite (`ref/lab/mercedes-<car>-avant-apres.png`), puis les deux face au coupé actuel (`ref/lab/voiture-heros-finalistes.png`). `--sheet usure` met la berline usée à côté de la même voiture neuve (`--usure-avant`, 0 par défaut) : trois quarts avant, trois quarts arrière, calandre et pare-chocs (`ref/lab/mercedes-metal-avant-apres.png`). L'usure de la berline se dose sans recoder par `FILM3D_USURE=0..1` (0,5 par défaut ; `--usure` dans le laboratoire) : chromes voilés et rayés, ternis dans les creux, vernis à micro-rayures circulaires, taches d'eau et gouttes sur le dessus, vitres voilées, poussière de route en bas de caisse, pneus mats ; ses cartes d'imperfections viennent d'ambientCG par `fetch.py`. `cast.py` les prend avec `FILM3D_HERO=w111` ou `slc` (le coupé actuel reste le défaut ; le conducteur assis n'est pas encore recalé sur leur volant).
- `lab/cast_people_render.py -- --only front,back,interior,final,situation` : les gens en studio de face, à contre-jour, le conducteur dans le coupé, les finalistes, les agents en situation derrière la patrouille (`ref/lab/`, et `assets/cast/lab-people.blend`). `interior` et `situation` n'ont pas encore été lancés.
- `lab/lieux_sheet.py -- --sheet port,pont,marina,rue,distribution` : les modèles de bibliothèque des lieux du parcours (`assets/lieux/<lieu>/<nom>/`) et les pièces ajoutées à la distribution, une vignette Workbench 480 × 360 par modèle tel que livré, chargé seul, avec triangles, emprise et plus grande texture en légende (`ref/lab/lieux-<planche>.png`). Une quinzaine de secondes et moins de 0,7 Go pour trois planches, sans Cycles.

Les planches comparatives citent aussi des candidats écartés que `fetch.py` ne télécharge pas ; un candidat s'essaie avec `lab/labfetch.py`, et `fetch.py` reçoit ensuite ce qui est retenu.

**Les lieux du parcours** (docs/cinematique-poursuite.md §2.4) : chaque lieu est un script qui écrit sa scène dans `assets/`, et deux scripts de rendu.

- `lieux.py` : le commun des lieux au bord de l'eau (scènes C, D, E) — panorama (ciel tourné, lagune, brume, ville lointaine, autre rive), chaussée sur pilotis ou sur quai (`roadway`), quais de pierre, lampadaires, voiture poursuivie et poursuivants en rigs, agents, caméras. Ne construit aucun lieu.
- `scene_c.py` : le pont (320 m de la ville au port, quatre voies, crête à 7,2 m) et son plan P4, la meute, animé depuis `p4_pont.py` (la berline de 98 à 60 m à 120 km/h, le V des patrouilles, le fourgon qui déborde de la crête et force au milieu, zoom avant lent et tremblé au 200 mm).
- `scene_d.py` : la jetée (300 m) et la pointe (terre-plein rond de 60 m), et ses plans P6, FIN, FIN6.
- `scene_e.py` : le port, le terre-plein au pied du pont, le virage sur la voie du quai, et son plan P5, le projecteur de l'hélicoptère.
- `render_lieux.py` : construit un plan d'un lieu au bord de l'eau et le rend (`--lieu pont|pointe|port|rond-point --plan P4 [--palier socle]`), ou rend une scène déjà écrite (`--scene scene-b.blend`). Workbench par défaut (cadrage), `--engine cycles --samples 32` pour la lumière, `--gpu` sur la machine louée seulement ; grain ffmpeg 7 par défaut pour un lieu, 0 pour une scène (`--grain N` pour fixer).
- `render_lieux.py --anim` (avec `--lieu/--plan` ou `--scene`) : rend toutes les images du plan dans `ref/anim/` et assemble `<lieu>-<plan>-anim.mp4` (ou `<scène>-anim.mp4`) et `-anim-ralenti.mp4` (×4), dans la même session Blender.
- `motion.py` : le mouvement, en clés calculées depuis la trajectoire (aucune physique) ; `p5_virage.py` : la trajectoire de P5. Tests sans Blender : `python3 tools/film3d/test_motion.py`.
- `fx.py` : les interactions, ce qui réagit au passage de la berline (embruns et gerbes de flaque, rides, fumée de glisse et de freinage, papiers levés, plots et balises soufflés, lanternes et guirlandes qui balancent, souffle des rotors, la gerbe d'étincelles unique, les gouttes de l'arrêt). Chaque scène l'appelle en une ligne en fin de plan (`__import__("fx").dress(plan, scene)` ; `scene_a` par `fx.hooked`) ; il lit le mouvement dans la scène évaluée (caisse `coupe`, roues `wheel_*`, caméra, rigs), calcule tout en Python pur (balistique avec traînée, sans simulation) et pose des clés ou des points à attributs de naissance que des nœuds de géométrie évaluent à chaque sous-image (le flou de bougé est juste). Gouttes en nuage de points, brume et fumée en sprites tournés vers la caméra, vus d'elle seule (ni ombre, ni rebond, ni reflet sur la caisse), creusés dans le cône caméra-berline au-dessus du bas de caisse ; aucune lumière ajoutée. `FILM3D_FX=0` retire tout, `FILM3D_FX_ONLY=eau,gomme,vol,tremble,etincelles,arret` isole des familles. Le banc : `lab/fx_bench.py -- --cam rase|suite --frames 19,22,25` (la berline en ligne puis en glisse, une flaque, une patrouille à contre-jour, caméra à 0,45 m). Tests sans Blender : `python3 tools/film3d/test_fx.py`.
- `scene_b.py` : la rue des enseignes (8 m, deux voies, enseignes en potence, guirlandes, au fond l'îlot du rond-point) et son plan P3, le barrage ; écrit `scene-b.blend`.
- `render_b.py` : l'ancienne commande de rendu de la ville, devenue une enveloppe de `render_lieux.py --scene` (mêmes arguments, `scene-b.blend` et grain 0 par défaut).
- `p2_arc.py` : le plan P2 écrit une fois (virage de 30 m à 70 km/h, contre-braquage, deux patrouilles, drone à 40 m et 35 mm) ; chaque décor ne donne qu'une pose. Le plan animé en lit le temps (`hero_pos`, `hero_slip`, `patrol_pos`, `drone_yaw`) ; `scene_f.py` le pose en clés (`scene_carrefour.animate`), sillage dévoilé sous les roues.
- `scene_carrefour.py` : le socle de P2, le premier carrefour de la scène A et ses quatre angles seuls ; écrit `scene-carrefour.blend`.
- `scene_f.py` : le rond-point de P2 (îlot et palmiers, anneau à deux voies tourné avec UV, quatre branches, terrasses), le même arc pris à contresens au ras de l'îlot ; écrit `scene-f.blend`.

```sh
lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/scene_f.py
lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 -P tools/film3d/render_lieux.py -- --scene scene-f.blend --engine cycles --samples 32
lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/render_lieux.py -- --lieu pont --plan P4
```

**Animer un plan** (`motion.py`, modèle : `p5_virage.py` et `plan_P5` dans `scene_e.py`) :

1. Écrire la trajectoire dans un fichier sans Blender `p<N>_<nom>.py` : `pos(t) -> (x, y)` en mètres, t en secondes, t = 0 à la première image du plan (`M.t_of(frame)`).
2. La vitesse par `M.Profile(v0, accel_fn)` (`.s(t)` la distance, `.v(t)` la vitesse), la route par une fonction `road(s)` ; `pos = lambda t: road(P.s(t))`.
3. Une glisse se donne par `slip(t)` en degrés (négative : la caisse tournée plus à droite que sa route) ; sinon le cap se lit sur la trajectoire.
4. Les distances : `M.min_gap({nom: pos}, images)` et un assert par plan dans `test_motion.py` ; jamais de choc entre véhicules.
5. Dans la scène : `poses = M.sample(pos, range(F0 - 1, F0 + N + 1), slip=…, wheel_r=root["wheel_r"], wheelbase=…, seed=i)` (une image de plus de chaque côté pour l'obturateur).
6. Puis `M.key_vehicle(root, poses, wheels=[…], ground=fn(x, y) -> (z, pente), pivot=(0, 0, h))` ; `wheels` : celles de la berline (`L.hero_wheels`) ; celles d'une patrouille ou du fourgon, séparées au chargement (`cast_vehicles.split_wheels`), par `M.wheels_of(M.body_of(rig))`, avec le rayon, l'empattement et l'essieu avant notés sur la caisse (`wheel_r`, `wheelbase`, `front_axle`) à passer à `M.sample` ; `M.wheel_marks(wheels, r)` pose sur ses roues un repère que seul l'aperçu Workbench montre (`axis="Y"` pour une patrouille ou le fourgon).
7. Tout autre objet mobile : `M.key_object(ob, images, fn)`, `fn(t) -> (x, y, z, cap, tangage, roulis)` ; la fumée d'une glisse : `M.smoke_puffs(poses)` puis `M.key_smoke(ob, naissance, images, lieu)`.
8. La caméra : `M.key_camera(cam, images, fn)`, `fn(t) -> (x, y, z, lacet, site, roulis, focale)` ; l'épaule par `M.handheld(t, amp, rotor, seed)`.
9. L'hélicoptère : `M.key_object`, `M.key_searchlight(h, images, cible_fn)`, `M.spin_rotors(h)` ; les rampes : `M.flash_bars(rigs, images)` (corail / lilas à 2 Hz).
10. L'aperçu : `render_lieux.py -- --lieu … --plan … --anim` (ou `--scene … --anim`), Workbench sous le verrou ; le flou de bougé vient des clés (obturateur 0,5), plus de clés de flou à la main.

**Rendre le film sur la machine louée** (`render_film.py`, `pack_assets.sh`). À louer au minimum : Linux, une carte NVIDIA RTX à 8 Go de mémoire vidéo (12 à 24 Go confortables ; les scènes pèsent 1,2 à 1,8 Go en mémoire sur le Mac, le banc mesure la vraie mémoire vidéo), 16 Go de mémoire vive (la construction de l'avenue a dépassé 4 Go), 4 cœurs, 30 Go de disque ; Blender 5.2.2 pour Linux, ffmpeg, git, python3. Dans l'ordre :

1. Sur le Mac : `sh tools/film3d/pack_assets.sh` (écrit `design/film/film3d-assets.tar`, environ 1,3 Go, sans `.env` ni scènes construites), puis copier l'archive sur la machine (`scp`).
2. Là-bas : `git clone` du dépôt, `mkdir -p ~/film/assets && tar -xf film3d-assets.tar -C ~/film/assets`, `export FILM3D_ASSETS=~/film/assets BLENDER=~/blender-5.2.2-linux-x64/blender`.
3. Vérifier : `nvidia-smi`, `$BLENDER -b --factory-startup --python-expr "import bpy; print(bpy.app.version_string)"`, `python3 tools/film3d/render_film.py --selftest`.
4. Le banc : `python3 tools/film3d/render_film.py --bench` (une image fixe par plan dans `~/film/rendu/banc/`, durée du film estimée et mémoire vidéo dans `banc.txt`).
5. Les essais de lumière, une commande chacun, sur l'image fixe du plan (à comparer à `banc/<PLAN>.png`) : `--bench --plan P3 --essai rugosite` ; `--bench --plan FIN6 --essai brume` ; `--bench --plan P5 --essai vernis=0.5` (aussi `vernis_rugosite=0.15`, `metal=0.1`, `peinture=4e0a28`). Un essai retenu se reporte dans le code, jamais par défaut ici.
6. Le rendu : `nohup python3 tools/film3d/render_film.py > ~/film/rendu.log 2>&1 &` (les neuf plans, 296 images ; la même commande relancée reprend où elle s'est arrêtée ; `--plan P4` ou `--frames 1-12` pour une partie ; `--draft` pour un passage rapide en 360 × 640). P1 est sauté tant qu'aucune scène ne le construit ; un plan pas encore animé rend son image fixe répétée, et le journal le dit.
7. L'assemblage : `python3 tools/film3d/render_film.py --assemble` (une prise par plan, `~/film/plans/<PLAN>-1.mp4`, H.264 quasi sans perte en bt709 ; `--take 2` pour une seconde prise).
8. Rapatrier : `scp machine:~/film/plans/*.mp4 ~/Desktop/Azerit/design/film/plans/`, puis sur le Mac `npx tsx scripts/film-contact.ts <prise>` et `npx tsx scripts/film-assemble.ts` (les six mp4 du site, à leurs plafonds de poids).

Sur le Mac, seulement l'essai à blanc, sous le verrou : `lockf -k <verrou> nice -n 19 python3 tools/film3d/render_film.py --dry --plan P3 --threads 2 --out <dossier>`, puis `--assemble` (un brouillon, jamais une prise).
