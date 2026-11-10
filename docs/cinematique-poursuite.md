# La cinématique de poursuite

*Écrit le 10 novembre 2026. Document de conception : aucun code, aucune décision reportée au SPEC tant que Jacques n'a pas validé (le paragraphe à y reporter est au §9). Remplace la poursuite 2D du §18.33 comme révélation visée.*

La barre, dans les mots de Jacques : « un effet film à la fin », « une super cinématique à la GTA », « un truc vraiment vraiment vraiment stylé, genre digne des plus grands studios ». Une course-poursuite qui monte avec les étoiles, et une fin de film avant que la fiche se pose.

---

## 1. La voie, tranchée

**On tourne un vrai film : neuf plans vidéo générés par IA par Jacques, d'après les briefs du §7, montés par nous, avec nos étoiles, notre radio et notre fin par-dessus, en direct.**

### Les trois voies, jugées d'abord contre la barre

| | (a) 3D temps réel, modèles CC0 | (b) Plans vidéo générés par IA | (c) Autres hybrides |
|---|---|---|---|
| **Ce qu'on voit sur un téléphone moyen** | Des voitures-jouets à facettes sur une avenue de cubes, fluides à 60 images par seconde. Propre, bien cadré, mais c'est l'image d'un jeu mobile gratuit. | Une image de film : carrosserie mouillée, reflets des gyrophares sur le bitume, brume, longue focale. 24 images par seconde, comme au cinéma. | Voir plus bas. |
| **Atteint « digne des plus grands studios » ?** | **Non.** Les kits CC0 (Kenney) sont dessinés pour des jeux de plateau. Ce qui fait une image de studio (modèles sur mesure, matières, éclairage, animation, fumée, reflets) demande des artistes et des semaines, et un téléphone moyen ne le calcule pas en direct. Le langage de film (coupes, focales, ralenti) améliore la mise en scène, pas la matière de l'image. | **Oui, si on trie sévèrement.** On ne garde que 28 images (1,2 s) de chaque plan de 5 à 8 s : la coupe courte cache les défauts des outils. | Non pour les variantes regardées. |
| **Poids à télécharger** | Three.js (déjà là) + environ 1,5 Mo de modèles. | Environ 3,4 Mo en 720p (plafond 4 Mo), 1,6 Mo en 540p pour les connexions lentes. L'ascenseur actuel pèse 11 Mo. | |
| **Charge pour le téléphone** | Dépend du GPU : à régler appareil par appareil. | Presque nulle : un flux H.264 720p, décodé par la puce vidéo de tous les téléphones. C'est la voie la plus sûre sur un téléphone faible. | |
| **Fonction du temps, calable** | Oui. | Oui : le temps du film est le temps de la vidéo ; `seek` et `hold` existent nativement. | |
| **Risque pour le 19 novembre** | Faible à construire, mais le risque réel est un troisième « non mais tu rigoles ». | Les plans de Jacques (cohérence de la voiture, délais), et la lecture vidéo sur iPhone en mode économie d'énergie (§5.5). | |
| **Ce que ça coûte à Jacques** | Rien. | Environ une journée de génération étalée sur trois jours, et des crédits d'outil vidéo (ordre de grandeur : quelques dizaines d'euros ; non vérifié). | |
| **Le clip vertical à partager (§18.8)** | Demande un rendu de la scène 3D, lent sans carte graphique. | Presque gratuit : ffmpeg recolle les plans et pose les étoiles, côté serveur, en quelques secondes. | |

**Pourquoi pas (a), le penchant de départ.** Ses deux avantages sont réels : elle ne dépend pas de Jacques, et tout reste calculé. Mais elle échoue sur le seul critère qui compte maintenant. Une 3D à facettes bien éclairée serait la poursuite 2D refusée, avec de la profondeur : mieux, pas un film. On ne la choisit pas.

**Les hybrides regardés et écartés.**
- *3D pour la poursuite, vidéo pour la fin* : deux matières d'image dans un film de dix secondes, ça se voit à la coupe.
- *3D pré-rendue par nous* (Blender ou autre) : interdit (rien de lourd sur le Mac), et sans artiste le résultat est celui de (a).
- *Les décors peints animés en parallaxe* : c'est léger et c'est le style du site, mais c'est encore « de la 2D qui bouge », ce que Jacques a refusé.
- *Vidéo peinte* (animer nos illustrations en aplats avec l'outil vidéo) : les outils vidéo font trembler les aplats ; ils sont bien meilleurs en image de film. Et l'univers de référence fait la même chose que nous : des illustrations peintes autour, une image de film dedans.

**Ce que (b) nous oblige à accepter, dit franchement.**
- **Le film est le même pour tous les joueurs d'un même niveau.** Ce qui est personnel : le nombre d'étoiles (donc la longueur du film), les six lignes de radio qui citent ses faits, l'arrêt sur image à son nom et à son niveau, et la fiche qui se pose sur son lieu du crime.
- **Une seule lumière pour la poursuite : l'heure bleue.** Le profil n'est connu qu'à la fin de l'attente : on ne peut pas précharger « sa » lumière. Et gyrophares, projecteurs et ville allumée ne se lisent que de nuit. Les quatre lumières reviennent à l'arrêt sur image et à l'atterrissage (§3.1).
- **Jacques est sur le chemin critique.** D'où l'ordre de livraison par lots et le plan de repli du §1.1.

### 1.1 Ce qu'on met en ligne le 19 novembre si les plans sont en retard

- **Date butoir : lundi 16 novembre au soir.** À cette date, il faut au moins le **lot 1 et le lot 2** validés (FIN, OUVERTURE, plans ★ à ★★★★ : six plans, §7.9).
- **Butoir tenue** : le film devient la révélation par défaut. Si les plans ★★★★★, ★★★★★★ ou FIN6 manquent encore, les fiches à 5 et 6 étoiles jouent une deuxième fenêtre des plans déjà validés (sans hélicoptère) et la fin commune ; les vrais plans se déposent plus tard sans toucher au code (un fichier, un script, un déploiement).
- **Butoir manquée** : **la poursuite 2D peinte (§18.33) est la révélation du 19 novembre.** Elle est construite, testée, ne pèse rien. Ce n'est pas le film que Jacques veut ; c'est ce qui marche ce jour-là. Le film passe par défaut dès qu'il est validé, en changeant une constante (`DEFAULT_SCENE`). L'ascenseur 3D ne revient pas.

---

## 2. Le storyboard

### 2.1 Les règles du film

- **Format** : vertical 9:16, 24 images par seconde. Toutes les durées se comptent en images.
- **Un plan par étoile, une coupe franche à chaque étoile**, comme une bande-annonce. L'étoile claque sur la coupe.
- **Le film s'arrête au niveau de la personne** : après son dernier plan, on coupe sur la fin.
- **Sens de l'action** : la voiture du suspect vient toujours vers nous ou descend dans le cadre ; jamais de plan où elle repart vers le fond (sauf l'orbite finale à six étoiles).
- **Personne à l'image** : vitres teintées partout, rues désertes. Pas d'arme, pas de choc entre véhicules, seuls des plots volent.
- **Un toucher passe le film** (bouton « Passer » et toucher de l'image). **Rien ne joue en mouvement réduit** : la fiche sort directement, ses étoiles s'allument une à une (comportement actuel).

| Niveau | Plans joués | Images | Durée |
|---|---|---|---|
| ★ | OUV, P1, FIN | 112 | 4,7 s |
| ★★ | OUV, P1, P2, FIN | 140 | 5,8 s |
| ★★★ | OUV, P1 à P3, FIN | 168 | 7,0 s |
| ★★★★ | OUV, P1 à P4, FIN | 196 | 8,2 s |
| ★★★★★ | OUV, P1 à P5, FIN | 224 | 9,3 s |
| ★★★★★★ | OUV, P1 à P6, FIN6 | 284 | 11,8 s |

OUV : 24 images. P1 à P5 : 28 images chacun. P6 : 40 images. FIN : 60 images. FIN6 : 80 images.

### 2.2 Le HUD, sur tout le film

Deux bandes d'encre `#0c0d1b` encadrent l'image, comme les bandes noires d'un film. Elles sont de la couleur exacte de la page : le film est une fenêtre dans le site.

- **Bande du haut** (9 % de la hauteur, plus l'encoche : 76 px à 844, 58 px à 640) : les six étoiles, centrées, 26 px. Allumée : crème mat `#fff9cb`. Éteinte : pleine, marine `#243152`. Une étoile qui s'allume passe de 1,5 à 1 en 5 images. Aucune lueur.
- **Bande du bas** (12 % : 101 px à 844, 77 px à 640) : la ligne de radio en JetBrains Mono 500, 13 px, capitales, crème, précédée d'un carré de 6 px corail puis lilas en alternance ; une seule ligne, coupée par des points de suspension au-delà de 350 px. Dessous, à droite : « Passer » et le bouton du son, 44 px de haut.
- Les bandes se ferment en 8 images à l'ouverture et s'ouvrent au flash.

Les six lignes de radio sont celles de `shared/chase/radio.ts`, inchangées. Exemple pour une fiche : « Véhicule en fuite · Backend », « Arme signalée : Python », « Motif : push sur main le vendredi soir », « Affiliation : Doctolib », « Profil identifié : Pyromane », « Toutes les unités · Priorité absolue », et à la fin « Fin de course · Haute surveillance ».

### 2.3 Plan par plan

**OUV — Ras du bitume** (24 images, 1,0 s)
- *Cadre* : caméra posée sur la route mouillée, à 5 cm du sol, grand-angle 24 mm. L'avenue file vers l'horizon corail, palmiers des deux côtés.
- *Caméra* : fixe.
- *Action* : la voiture du suspect arrive du fond, phares crème, grossit et passe au ras de l'objectif. On coupe quand elle remplit le cadre.
- *Son* : moteur qui enfle, une note grave qui monte, coupée net.
- *HUD* : les bandes se ferment, six étoiles éteintes. Radio muette (un grésillement).

**P1 ★ — Dans le rétro** (28 images)
- *Cadre* : caméra devant la voiture, à hauteur de pare-chocs, 50 mm. Le suspect de trois quarts face, dans la moitié basse.
- *Caméra* : travelling arrière à la vitesse de la voiture, léger tremblé.
- *Action* : au fond, une voiture de patrouille sort d'une rue de côté en glissant, gyrophare corail et lilas, et se cale dans l'axe.
- *Son* : première sirène, lointaine. Clac de l'étoile, coup grave.
- *HUD* : étoile 1. Radio : « Véhicule en fuite · {poste} ».

**P2 ★★ — Vue du ciel** (28 images)
- *Cadre* : plongée totale, drone à 30 m, 35 mm. L'avenue est verticale dans le cadre, les couronnes des palmiers passent sous la caméra.
- *Caméra* : avance avec les voitures et tourne lentement de 10°.
- *Action* : le suspect descend dans le tiers bas ; deux patrouilles l'encadrent en V derrière lui ; leurs gyrophares posent des flaques corail et lilas sur le bitume mouillé.
- *Son* : deuxième sirène, désaccordée de la première.
- *HUD* : étoile 2. Radio : « Arme signalée : {langage} ».

**P3 ★★★ — Le barrage** (28 images)
- *Cadre* : caméra au milieu de la route, à 30 cm du sol, 24 mm, derrière une ligne de plots orange.
- *Caméra* : fixe, une secousse à l'impact.
- *Action* : le suspect traverse la ligne, les plots volent vers l'objectif, l'un passe à ras ; trois patrouilles derrière.
- *Son* : coups secs des plots, souffle, trois sirènes.
- *HUD* : étoile 3. Radio : « Motif : {chef d'accusation} ».

**P4 ★★★★ — La meute** (28 images)
- *Cadre* : très longue focale (200 mm), caméra loin devant, à 1,5 m. La compression empile tout : le suspect en bas, et derrière lui, serrés, trois patrouilles et un fourgon plus haut qu'elles.
- *Caméra* : zoom avant lent, tremblé de longue focale, brume.
- *Action* : le fourgon force le passage au milieu. Un mur de gyrophares.
- *Son* : moteur plus grave du fourgon, quatre sirènes.
- *HUD* : étoile 4. Radio : « Affiliation : {affiliation} ».

**P5 ★★★★★ — Le projecteur** (28 images)
- *Cadre* : contre-plongée depuis le trottoir, entre deux troncs de palmiers, 28 mm.
- *Caméra* : panoramique vers le haut, de la route vers le ciel.
- *Action* : un hélicoptère monte au-dessus des toits Art déco ; son projecteur balaie la brume, croise l'objectif (deux images presque blanches) et se pose sur la voiture qui passe.
- *Son* : le battement du rotor arrive et couvre les sirènes.
- *HUD* : étoile 5. Radio : « Profil identifié : {profil} ».

**P6 ★★★★★★ — Toute la ville** (40 images)
- *Cadre* : grand plan aérien, 24 mm.
- *Caméra* : grue qui monte et recule au-dessus de l'avenue.
- *Action* : le suspect en tête d'une colonne de gyrophares jusqu'à l'horizon ; trois hélicoptères en formation, trois faisceaux qui se croisent sur lui ; toutes les fenêtres de la ville sont allumées ; feux d'artifice sur la ligne des toits.
- *Son* : tout joue, trois rotors, puis une seconde de montée.
- *HUD* : étoile 6. Radio : « Toutes les unités · Priorité absolue ».

**FIN — Le frein à main** (60 images, niveaux ★ à ★★★★★)
1. *Le dérapage* (36 images, tourné au ralenti). Caméra fixe à 20 cm du sol, 35 mm, sur une esplanade vide sous un seul lampadaire. La voiture entre de travers, glisse, fumée de pneus qui roule au sol, et s'arrête de trois quarts face, ses phares balayant l'objectif. Les poursuivants ne sont pas à l'image : seulement leurs lueurs corail et lilas sur le sol mouillé. Son : crissement long qui descend, la sirène s'étouffe.
2. *L'arrêt sur image* (14 images). L'image gèle sur la dernière image. Elle passe en deux tons (ombres prune, lumières de la teinte du profil, §3.1), les traits de la toise passent par-dessus, une plaque d'encre porte « @pseudo », et le niveau claque en Barlow Condensed 700, 56 px, crème (« HAUTE SURVEILLANCE »). C'est la photo d'identité de la fiche, et le traitement des visages de la couverture (§18.31). Dans la bande du haut, l'étoile suivante clignote deux fois et reste éteinte. Radio : « Fin de course · {niveau} ». Son : déclic d'appareil photo, puis silence complet.
3. *Le flash* (10 images, dont 4 de silence). Crème `#fff9cb` plein écran, les bandes s'ouvrent. Au sommet du flash, la fiche est posée (le passage de relais existant), sur le ciel peint de son lieu du crime (§18.29).

**FIN6 — L'orbite** (80 images, niveau ★★★★★★ seulement)
1. *Le temps s'arrête* (56 images). Même dérapage, mais sous trois faisceaux qui se croisent. À l'instant où la voiture s'arrête, le temps gèle : fumée de pneus et gouttes d'eau suspendues en l'air, feux d'artifice figés dans le ciel, toutes les fenêtres allumées. **La caméra, elle, continue** : elle tourne de 120° autour de la voiture immobile et finit de trois quarts face, les phares dans l'objectif. Son : tout se tait sauf une note tenue et un battement de rotor ralenti.
2. *L'arrêt sur image* (12 images) : deux tons prune et crème, « PRIORITÉ ABSOLUE », les six étoiles.
3. *Le flash* (12 images) : plus long, et la fiche se pose avec son contour éclairé par l'arrière (réservé à ce niveau, §18.18).

Ce qui rend le six étoiles impossible à confondre : le seul plan aérien de toute la ville, les trois hélicoptères, les feux d'artifice, et l'orbite à temps gelé, qui n'existe dans aucun autre niveau.

---

## 3. Le look

**En une phrase** : une image de film de braquage, à l'heure bleue, juste après la pluie, étalonnée dans notre palette.

### 3.1 La lumière

- **La poursuite** est tournée dans une seule lumière, **l'heure bleue** (la lumière C de `docs/brief-illustrations.md`) : ciel indigo `#4b4fb8` vers marine `#243152`, fine bande corail `#ff6a3d` à l'horizon, fenêtres et lampadaires ambre `#ffc36b`, ombres prune `#4b2f54` et marine, jamais noires. Le bitume est mouillé : c'est lui qui renvoie les couleurs et donne la richesse d'un film.
- **Les gyrophares sont corail et lilas** (`#ff6a3d`, `#8d8cf0`), jamais rouge et bleu : c'est notre signature, et ça éloigne d'une vraie police. Les phares du suspect sont crème `#fff9cb`.
- **Les quatre lumières des profils** (`SCENE_LIGHT`, `shared/scenes.ts`) arrivent à la fin :

| Lumière du profil | Lumières de l'arrêt sur image | Ombres | Ce qui suit le flash |
|---|---|---|---|
| Heure rose | rose `#ffb2c6` | prune `#4b2f54` | le décor peint du profil, en ciel de page |
| Heure dorée | pêche `#fcbf96` | prune `#4b2f54` | idem |
| Heure bleue | lavande `#ccc2f5` | marine `#243152` | idem |
| Aube | lilas clair `#e5ddff` | prune `#4b2f54` | idem |

La nuit du film débouche donc sur l'heure du profil : le flash fait le raccord.

### 3.2 Ce que le film a le droit d'ajouter, et pourquoi il reste du site

La règle « mat, aucune lueur » est une règle d'**interface**. Elle ne change pas : étoiles, radio, bandes, plaque et titre de l'arrêt sur image sont en aplats, sans halo ni ombre lumineuse.

**Dans l'image**, le film a droit à ce qu'une caméra enregistre : lumière des phares et des gyrophares, reflets sur le bitume mouillé, brume, faisceaux des projecteurs, faible profondeur de champ, grain. Sont interdits même dans l'image : le néon, la grille et le soleil rayé de la synthwave, l'effet VHS, le duo magenta et cyan.

Ce qui l'attache au site :
- la palette (encre, crème, rose poudré, prune, marine, corail), tenue par les prompts puis par un étalonnage unique au montage ;
- les bandes de la couleur de la page ;
- les trois polices du site, et JetBrains Mono pour la voix policière ;
- l'arrêt sur image en deux tons, qui est le traitement des photos d'identité de la couverture ;
- l'atterrissage sur le décor peint du profil.

### 3.3 Les traitements, et leur coût sur un téléphone

| Traitement | Où il se fait | Coût |
|---|---|---|
| Bandes d'encre | deux blocs HTML | nul |
| Coupes, ralenti, tremblé, focales, brume, profondeur | dans les plans générés | nul à la lecture |
| Étalonnage commun aux neuf plans | ffmpeg, au montage | nul à la lecture |
| Grain | une tuile de bruit de 128 px tirée une fois, déplacée 12 fois par seconde, opacité 7 % | négligeable |
| Vignette | un dégradé radial fixe | nul |
| Secousse à chaque étoile | translation de 3 px de l'image sur 4 images | nul |
| Deux tons de l'arrêt sur image | filtre CSS et deux aplats en mélange, sur une image fixe | une seule composition |
| Flash | un aplat crème en opacité | nul |
| Vibration | une impulsion par étoile, une longue au flash (`web/src/lib/haptics.ts`, Android) | nul |

Le grain n'est pas gravé dans les fichiers : il gonflerait le débit pour rien.

---

## 4. Les assets

### 4.1 Ce que le film utilise

| Asset | Source | Licence | Poids |
|---|---|---|---|
| 9 plans vidéo (OUV, P1 à P6, FIN, FIN6) | générés par Jacques (§7) | la nôtre, sous réserve des conditions de l'outil : abonnement qui autorise l'usage commercial, sans filigrane | originaux hors dépôt, `Azerit/design/film/` |
| `poursuite-720.mp4` (OUV + P1 à P6, 8,5 s) | montage ffmpeg | idem | environ 2,3 Mo, plafond 2,8 Mo |
| `fin-720.mp4` (1,5 s) | idem | idem | environ 0,4 Mo, plafond 0,6 Mo |
| `fin6-720.mp4` (2,3 s) | idem | idem | environ 0,65 Mo, plafond 1,0 Mo |
| Les trois mêmes en 540p | idem | idem | 45 % des précédents, 1,8 Mo en tout au plus |
| `affiche.jpg` (première image, 720 × 1280) | extraite du montage | idem | 60 Ko au plus |
| Barlow Condensed, Outfit, JetBrains Mono | déjà servies (`server/fonts`) | SIL OFL | rien de plus |
| Décors peints des profils | déjà là (`web/public/profiles/`) | les nôtres | rien de plus |
| Sons | synthétisés (Web Audio), aucun fichier ; en option l'ambiance extraite des plans (`ambiance.m4a`, 150 Ko) | les nôtres | 0 à 150 Ko |

Les poids sont des budgets, pas des mesures : ils se vérifient sur les vrais plans. Total à charger pour un joueur : 3,4 Mo en 720p (4 Mo au plus), `fin6` seulement s'il a six étoiles.

**Aucun modèle 3D, rien qui vienne d'un jeu.**

### 4.2 Ce que la voie (a) aurait utilisé, pour mémoire

Licences vérifiées sur kenney.nl le 10 novembre 2026 : Car Kit (v3.1, 45 fichiers), City Kit Commercial (v2.1, 50 fichiers), City Kit Roads (v2.2, 90 fichiers), Nature Kit (v1.0, 330 fichiers), tous **CC0**. Le contenu exact des archives (voiture de police, fourgon, plots, palmiers) n'a pas été vérifié. **Aucun hélicoptère CC0 sûr n'a été trouvé** : un modèle annoncé CC0 sur itch.io (kumasousa, FBX, 62 Ko), des modèles sur Poly Pizza dont la licence ne s'affiche pas dans la liste. Rien de tout cela n'est retenu.

### 4.3 Ce que le dépôt contient déjà

- `web/public/3d/` : 11 Mo de modèles CC BY de l'ascenseur (crédits dans `CREDITS.txt`). À supprimer avec l'ascenseur (§5.7).
- `web/public/profiles/` : 2,5 Mo, les 14 décors. Gardés.
- `tools/bake/` : la chaîne Blender de l'ascenseur. À supprimer avec lui.

---

## 5. Le plan technique

### 5.1 Les fichiers

```
shared/film/
  cut.ts          24 i/s, les durées en images, l'ordre des plans (pur, sans DOM)
  plan.ts         filmPlan(fiche) : niveau, étoiles et leurs instants, point de coupe,
                  fin à jouer, arrêt sur image, flash, durée, lignes de radio
  hud.ts          hudAt(plan, t) : l'état exact du HUD à l'instant t
  film.test.ts
web/src/film/
  player.ts       deux balises <video>, chargement, déblocage, bascule, horloge, seek/hold, mesures
  FilmHud.tsx     bandes, étoiles, radio, arrêt sur image, flash, grain, vignette
  film.css
web/src/components/Film.tsx     même contrat que Chase et Walkout3D envers CardPage
web/src/lib/filmSound.ts        la bande-son, branchée sur l'horloge du film
web/public/film/                les mp4, l'affiche, l'ambiance
tools/film/montage.json         la liste de montage : par plan, la prise, l'image d'entrée, la vitesse, le recadrage
scripts/film-assemble.ts        ffmpeg : découpe, étalonne, redimensionne, recolle, encode, vérifie
scripts/film-contact.ts         planche-contact d'une prise (une image sur quatre), pour choisir la fenêtre
```

### 5.2 Tout est fonction du temps

- **L'horloge du film est celle de la vidéo.** Pendant la poursuite : `t = currentTime` de la première balise. Pendant la fin : `t = coupe + currentTime` de la seconde. Après sa dernière image (arrêt sur image, flash) : l'horloge du navigateur prend le relais. Le HUD ne peut donc pas se décaler de l'image, même si la lecture hoquette.
- **Le HUD est une fonction pure** : `hudAt(plan, t)` rend les étoiles allumées, l'avancement du claquement, la ligne de radio, la fermeture des bandes, le clignotement, l'arrêt sur image, l'opacité du flash. Elle se teste sans navigateur.
- **Débogage** : `window.__film = { plan, seek(t), hold(on), stats() }`, en développement et avec `?mock=1`, comme `__chase` et `__tys3d`. `seek` place la bonne balise au bon instant et recalcule le HUD.
- **Le clip vertical (§18.8)** : le serveur rejoue la même liste avec ffmpeg (plans jusqu'au niveau, fin, HUD rendu en PNG par resvg depuis `hudAt`). Plus besoin de rendre une scène.

### 5.3 La lecture

- **Deux balises `<video muted playsinline>`**. A joue `poursuite.mp4` (toujours le fichier complet à six étoiles). B porte la fin (`fin` ou `fin6`), calée sur sa première image.
- **La coupe au niveau de la personne** : quand A atteint la dernière image de son dernier plan (suivi image par image avec `requestVideoFrameCallback`, sinon à chaque rafraîchissement), B démarre et passe devant, A s'arrête. Deux images d'encre couvrent la bascule : c'est une coupe, un à-coup de 80 ms ne s'y voit pas.
- **Fichiers chargés en entier avant de jouer** (`fetch` puis `Blob`) : aucune mise en mémoire tampon pendant le film, et pas besoin que le serveur gère les requêtes partielles.
- **Encodage** : H.264 profil Main, 720 × 1280, 24 i/s, une image clé toutes les 12 images (calage rapide), `+faststart`, sans piste son. Variante 540 × 960 servie si `saveData`, ou si la connexion annoncée est lente.
- **Ordinateur** : le film dans une colonne 9:16 centrée, haute comme la fenêtre (900 px au plus), sur l'encre.
- **Cadrage** : l'image remplit l'écran (`object-fit: cover`). Un téléphone en 390 × 844 est plus étroit que le 9:16 : 9 % de l'image sont rognés de chaque côté. D'où les zones du §7.3.

### 5.4 Le chargement pendant l'attente

1. Au geste qui lance la fiche (`EntryForm`, là où `unlockAudio` est déjà appelé) : les deux balises sont créées et débloquées par un `play()` suivi d'un `pause()`.
2. Dès l'attente : téléchargement en basse priorité de `poursuite` puis de `fin`. Une vraie fiche prend environ 24 s : il y a le temps.
3. Fiche prête : si elle a six étoiles, `fin6` se charge (0,65 Mo). La scène se dit prête (`onReady`) quand la première image est peinte : l'écran d'attente se lève (`web/src/lib/hold.ts`, inchangé).

### 5.5 Les replis

| Cas | Ce qui se passe |
|---|---|
| Mouvement réduit | rien ne joue, la fiche sort (existant) |
| Le navigateur refuse de lancer la vidéo sans geste (iPhone en mode économie d'énergie) | l'attente montre la pilule « Ouvrir mon dossier », qui existe déjà pour le son ; le toucher débloque la vidéo et le son, le film part |
| Le film n'est pas chargé 4 s après que la fiche est prête, ou H.264 illisible | la poursuite 2D joue à sa place (elle ne télécharge rien) ; quand elle sera supprimée : la fiche directe, étoiles une à une |
| Erreur de lecture en cours de film | flash immédiat, la fiche se pose |
| Plans en retard le 19 novembre | §1.1 |

Il n'y a plus de repli « WebGL absent » : le film n'utilise pas WebGL.

### 5.6 Le budget, et comment on le mesure

| Mesure | Cible sur téléphone moyen |
|---|---|
| Téléchargement | 4 Mo au plus en 720p, 1,8 Mo en 540p |
| Images vidéo perdues | 0 sur tout le film |
| HUD | 60 i/s, aucune tâche de plus de 50 ms pendant le film |
| Bascule poursuite → fin | 2 images au plus (84 ms) |
| Délai entre la levée de l'attente et la première image qui bouge | 300 ms au plus |
| Mémoire | deux décodeurs 720p et 4 Mo de fichiers : sous 60 Mo |
| JavaScript ajouté | 15 Ko compressés au plus, hors du paquet de l'accueil ; Three.js n'est plus chargé |

Mesure : `__film.stats()` rend les images perdues (`getVideoPlaybackQuality`), la durée de la bascule, le délai de départ et les octets chargés. À relever dans Chrome avec le processeur ralenti 4 fois et le réseau « 4G rapide », puis sur de vrais téléphones : un iPhone de 2019 ou 2020, un Android de milieu de gamme, chacun dans Safari ou Chrome **et dans le navigateur intégré de LinkedIn**, l'iPhone aussi en mode économie d'énergie.

### 5.7 Ce qu'on reprend, ce qu'on supprime

**Repris tel quel**
- `shared/chase/radio.ts` : les lignes de radio.
- `web/src/pages/CardPage.tsx` et `web/src/components/Reveal.tsx` : les phases `ready`, `playing`, `handoff`, `done`, le passage de relais au sommet du flash, « Passer », Échap.
- `web/src/lib/hold.ts` : l'attente tenue jusqu'à la première image, la pilule du geste, le délai de 20 s.
- `web/src/lib/revealScene.ts` : le réglage `?scene=`, qui gagne la valeur `film`.
- `web/src/lib/audio.ts` : le contexte audio et le choix du son.
- `web/src/lib/chaseSound.ts` : la sirène à deux tons et le clac, dont `filmSound.ts` part.
- `web/src/components/Chase.tsx` : le modèle de l'enveloppe (horloge, onglet caché, bouton du son, `seek` et `hold`).

**Repris en changeant les valeurs**
- `shared/chase/plan.ts` : sa structure (étoiles, clignotement, flash, durée) est celle de `shared/film/plan.ts`, comptée en images.

**Supprimé dès que le film est validé par Jacques**
- L'ascenseur : `web/src/three/` (18 fichiers), `web/src/components/Walkout3D.tsx`, `web/src/cabinPreview.ts`, `web/public/3d/` (11 Mo), `tools/bake/`, et les dépendances `three`, `@types/three`, `postprocessing`, `gltfpack`.

**Supprimé deux semaines après le lancement, si le repli joue pour moins de 2 % des révélations**
- La poursuite 2D : `shared/chase/ChaseFrame.tsx`, `palette.ts`, `web/src/components/Chase.tsx`, `scripts/render-chase.ts`. `radio.ts` déménage alors dans `shared/film/`.

---

## 6. La construction, en trois tâches

T1 et T2 partent en même temps, sur des fichiers disjoints. T3 suit T1.

### T1 — Le lecteur et le HUD

- **Périmètre** : le plan, le HUD pur, le lecteur à deux balises, l'enveloppe React, le branchement à la page et à l'attente. Avec les cartons de T2 tant que les vrais plans manquent.
- **Fichiers** : `shared/film/*`, `web/src/film/*`, `web/src/components/Film.tsx`, `web/src/lib/revealScene.ts` (+ son test), `web/src/pages/CardPage.tsx`, `web/src/lib/hold.ts`, `web/src/components/EntryForm.tsx`, `web/src/styles.css` (bloc du film seulement).
- **Critères, à 390 × 844 puis 360 × 640, avec `?mock=1&scene=film`** :
  1. Fiches de démonstration à 1, 3 et 6 étoiles : le film dure 4,7 s, 7,0 s et 11,8 s (à 0,1 s près) et montre 1, 3 et 6 étoiles allumées, jamais une de plus.
  2. `__film.hold(true)` puis `__film.seek(t)` aux instants de chaque étoile : la bonne image, le bon nombre d'étoiles, la bonne ligne de radio ; deux appels au même instant donnent la même capture.
  3. Sur un enregistrement d'écran, aucune image du plan suivant n'apparaît à la coupe vers la fin.
  4. La radio tient sur une ligne et ne passe jamais sous « Passer » ; les deux boutons font 44 px.
  5. L'arrêt sur image montre le pseudo, le niveau, les deux tons de la lumière du profil ; l'étoile suivante clignote deux fois et reste éteinte ; à six étoiles, rien ne clignote.
  6. Au sommet du flash, la fiche est posée à sa place, sans saut.
  7. Un toucher sur l'image ou sur « Passer » donne la fiche tout de suite. En mouvement réduit, aucune vidéo n'est téléchargée.
  8. Lecture refusée (simulée) : la pilule « Ouvrir mon dossier » apparaît, un toucher lance le film. Film absent (fichier 404) : la poursuite 2D joue.
  9. `__film.stats()` : 0 image perdue, bascule de 84 ms au plus, processeur ralenti 4 fois.
  10. Tests et typecheck passent.

### T2 — Le montage

- **Périmètre** : la chaîne qui transforme les prises de Jacques en trois fichiers ; d'abord des cartons de remplacement (un aplat par plan, avec son nom et son numéro d'image) pour que T1 avance ; puis les vrais plans, lot par lot, et l'étalonnage commun.
- **Fichiers** : `scripts/film-assemble.ts`, `scripts/film-contact.ts`, `tools/film/montage.json`, `web/public/film/*`. Lit `shared/film/cut.ts` sans le modifier.
- **Critères** :
  1. `npx tsx scripts/film-assemble.ts` produit les six mp4 et l'affiche en moins de deux minutes sur le Mac ; `ffprobe` confirme 204, 36 et 56 images, 24 i/s, 720 × 1280 et 540 × 960, aucune piste son.
  2. Un plan absent de `design/film/plans/` est remplacé par son carton, sans erreur.
  3. Les poids tiennent dans les plafonds du §4.1 ; sinon le script baisse la qualité et le dit.
  4. À 390 px, dans le lecteur de T1 : aucun plan ne garde de bande noire, de filigrane ou de texte ; rien d'important sous les bandes ni dans les 9 % rognés de chaque côté.
  5. Côte à côte sur une planche, les neuf plans ont la même nuit : même ciel, mêmes ombres prune, gyrophares corail et lilas.
  6. Pour chaque prise reçue, une planche-contact et un avis écrit contre la grille du §7.10.

### T3 — Le son, les vrais téléphones, le ménage

- **Périmètre** : la bande-son calée sur l'horloge du film ; la vérification sur de vrais appareils ; le réglage par défaut ; la suppression de l'ascenseur une fois le film validé ; le report au SPEC.
- **Fichiers** : `web/src/lib/filmSound.ts`, `web/src/i18n.ts` (libellés), `SPEC.md`, puis les suppressions du §5.7 et `package.json`.
- **La bande-son** (synthétisée, aucun fichier) : une pulsation grave à 100 battements par minute ; un coup grave et le clac à chaque étoile ; une sirène de plus par renfort, désaccordée ; un souffle à chaque coupe ; le rotor à partir de cinq étoiles ; le crissement de la fin ; le déclic ; quatre images de silence avant le flash ; un accord tenu au flash. Si les plans de Jacques ont un son d'ambiance propre, il passe dessous (`ambiance.m4a`).
- **Critères** :
  1. Avec le son : chaque clac tombe sur sa coupe (à l'oreille et à 40 ms près sur un enregistrement) ; silence complet juste avant le flash.
  2. Son coupé : aucun contexte audio créé. Sans geste : le film joue muet, sans erreur.
  3. Sur un iPhone et un Android, dans Safari ou Chrome et dans LinkedIn : le film part seul ou après la pilule, reste dans la page (pas de plein écran du système), 0 image perdue.
  4. `DEFAULT_SCENE` vaut `film` si la butoir du §1.1 est tenue, `chase` sinon.
  5. Après validation de Jacques : l'ascenseur est supprimé, le paquet de la page d'une fiche ne contient plus Three.js, tests et typecheck passent, le SPEC porte le paragraphe du §9.

---

## 7. Ce que Jacques doit fournir : le tournage

C'est le cœur du projet. Neuf plans vidéo, précédés de trois images de référence et de neuf images clés. Tout se génère ; rien ne se dessine.

### 7.1 À quoi ils servent

Le film de révélation, joué juste avant la fiche, plein écran sur téléphone. On ne garde que **1,2 seconde** de chaque plan (1,7 s pour P6, 1,5 s pour FIN, 2,3 s pour FIN6). Une prise de 5 secondes dont une seule seconde est parfaite est une bonne prise.

### 7.2 Format

- **Vertical 9:16.** 1080 × 1920 si l'outil le propose, sinon 720 × 1280.
- **Durée d'une prise** : 5 secondes au moins (8 si c'est le seul choix).
- **24 images par seconde**, mp4.
- **Image nue** : pas de bandes noires, pas de texte, pas de sous-titres, pas de filigrane, pas de logo d'outil.
- **Son** : le laisser activé s'il existe, en demandant des bruits seulement (moteur, sirènes, rotor), sans musique ni voix. On s'en sert s'il est bon.
- **Abonnement** : un palier qui autorise l'usage commercial et retire le filigrane.
- **Dépôt** : `Azerit/design/film/`, hors du dépôt Git.
  - `ref/R1-voiture.png`, `ref/R2-police.png`, `ref/R3-avenue.png`
  - `cles/K-OUV.png`, `cles/K-P1.png` … `cles/K-FIN6.png`
  - `plans/OUV-1.mp4`, `plans/OUV-2.mp4` … (le dernier chiffre est le numéro de la prise ; envoyer toutes les prises correctes, on choisit)

### 7.3 Les zones

```
┌───────────────────────┐
│ BANDE DU HAUT  (12 %) │  couverte par nos étoiles : ciel seul
├───┬───────────────┬───┤
│   │               │   │
│ 9%│   L'ACTION    │9 %│  les bords sont rognés sur les téléphones étroits :
│   │  (80 % de la  │   │  rien d'essentiel dedans
│   │   largeur)    │   │
│   │               │   │
├───┴───────────────┴───┤
│ BANDE DU BAS   (15 %) │  couverte par la radio et « Passer » : route seule
└───────────────────────┘
```

- La voiture du suspect est toujours **entière dans la zone centrale** à l'instant fort du plan.
- Les hélicoptères de P5 et P6 volent **sous** les 12 % du haut.

### 7.4 Le style

**En une phrase** : une image de grand film de braquage, tournée en vrai, à l'heure bleue juste après la pluie, dans une ville côtière Art déco, étalonnée indigo, prune, corail et crème.

- **Photographique, pas dessiné.** Ni dessin animé, ni rendu de jeu vidéo, ni aplats.
- **Toujours la même heure** : ciel indigo vers marine, une fine bande corail à l'horizon, bitume mouillé.
- **Gyrophares corail et lilas**, jamais rouge et bleu.
- **Rues désertes, vitres teintées** : aucune personne visible, nulle part.
- **Une seule action et un seul mouvement de caméra par plan.**

### 7.5 Interdits

- **Dans les prompts : ni le nom du jeu, ni celui de son éditeur, de sa ville ou de son État, ni « dans le style de ».** Ne téléverser aucune image du jeu ni d'un film existant.
- **Aucune marque** : pas de logo, pas de modèle de voiture reconnaissable, pas d'écusson de police réel.
- **Aucun texte** : ni « POLICE », ni enseigne, ni plaque lisible, ni numéro sur un toit.
- **Aucune personne** : ni piéton, ni conducteur, ni silhouette, ni main.
- **Aucune arme, aucun tir, aucune explosion, aucun choc entre véhicules.** Seuls des plots de chantier volent (P3). Les feux d'artifice de P6 et FIN6 sont dans le ciel.
- **Aucune interface** : pas d'étoiles, de carte, de jauge ni de bandes dans l'image. C'est nous qui les posons.
- **Pas de synthwave** : néon, grille, soleil rayé, effet VHS.

Les hélicoptères, interdits dans les décors peints (`docs/brief-illustrations.md` §5), sont autorisés ici et seulement ici : génériques, sans marquage.

### 7.6 La méthode : trois références, puis une image clé par plan, puis la vidéo

La cohérence (même voiture, même ville, même lumière dans les neuf plans) vient de l'ordre de travail, pas de la chance.

1. **Générer les trois références** (images fixes, §7.7) avec ton outil d'images habituel. Nous les valider avant d'aller plus loin : elles fixent tout le reste.
2. **Pour chaque plan, générer son image clé** (une image fixe 9:16 : la première image du plan), en joignant R1, R2 et R3 comme images de référence, avec la phrase : `Use the attached images as references: exactly the same hero car as in image 1, the same pursuit vehicles as in image 2, the same avenue, light and colour grade as in image 3.`
3. **Animer chaque image clé** dans l'outil vidéo, en mode *image vers vidéo* (l'image clé comme première image), avec le prompt de MOUVEMENT du plan.
4. **Quatre prises par plan.** Déposer toutes celles qui passent la grille du §7.10.

On valide les images clés avant de dépenser des crédits vidéo : une image clé ratée donne quatre prises ratées.

### 7.7 Les prompts

En anglais : les outils suivent mieux. Pour une **image** : coller LOOK, puis les blocs VÉHICULES utiles, puis l'IMAGE CLÉ du plan, puis SANS. Pour une **vidéo** : joindre l'image clé, coller MOUVEMENT, puis SANS.

#### LOOK (dans chaque prompt d'image)

```
Cinematic still from a big-budget crime film, photorealistic, shot on an anamorphic lens with fine 35 mm film grain. A fictional subtropical coastal city with pastel art deco low-rise hotels with rounded corners and tall palm trees. Blue hour just after rain: the sky runs from deep indigo (#4b4fb8) at the top to navy (#243152), with a thin coral band (#ff6a3d) along the horizon. The wet asphalt mirrors the sky and every light. Shadows are deep plum (#4b2f54) and navy, never pure black. Windows and streetlamps glow warm amber (#ffc36b). The streets are completely deserted: no pedestrians and no other traffic. Colour grade in indigo, plum, coral and cream, slightly saturated, soft contrast, light haze in the distance. Vertical 9:16 frame. Keep the top 12% of the frame as plain sky and the bottom 15% as plain wet road, with nothing important in them, and keep the main subject inside the central 80% of the width.
```

#### VÉHICULES

```
HERO CAR: a generic late-1980s two-door sports coupe of an invented design that matches no real car model, low and wedge-shaped, matte deep plum paint (#4b2f54), plain rectangular headlights glowing warm cream (#fff9cb), dark tinted windows so that nobody is visible inside, no badge, no stripes, no stickers, a blank licence plate.
```

```
PURSUIT CARS: generic full-size four-door sedans of an invented design, two-tone navy and cream bodywork with no lettering, no emblem and no numbers, dark tinted windows, a roof light bar flashing coral-orange (#ff6a3d) and violet (#8d8cf0), never red and blue.
```

```
PURSUIT VAN: a tall boxy van in the same navy and cream two-tone, no lettering, the same coral-orange and violet roof light bar, clearly taller than the sedans.
```

```
HELICOPTER: a generic light helicopter of an invented design, dark navy, no markings and no numbers, a single searchlight under its nose throwing a cream-white beam that is visible in the haze.
```

#### SANS (à la fin de chaque prompt, image ou vidéo)

```
No people, no pedestrians, no faces, no visible drivers, no hands. No weapons, no gunfire, no explosions, no collisions between vehicles. No text, no letters, no numbers, no logos, no brands, no readable signs, no readable licence plates, no watermark, no subtitles. No user interface, no HUD, no stars, no minimap, no letterbox bars, no borders, no split screen. No red and blue lights. No neon, no VHS effect. Not a cartoon, not an illustration, not a video game render.
```

#### Les trois références

**R1 — la voiture** (image 16:9)
```
[LOOK without its last two sentences] [HERO CAR] Reference sheet of the hero car alone on wet asphalt at blue hour, four views of the same car side by side: three-quarter front, three-quarter rear, exact side profile, and directly from above. Neutral framing, the whole car visible in each view.
```

**R2 — les poursuivants** (image 16:9)
```
[LOOK without its last two sentences] [PURSUIT CARS] [PURSUIT VAN] [HELICOPTER] Reference sheet on wet asphalt at blue hour: one pursuit sedan in three-quarter front view and from directly above, the pursuit van in three-quarter front view, and the helicopter hovering in side view. All light bars lit, coral-orange and violet.
```

**R3 — l'avenue** (image 9:16) : c'est le plan maître, celui qui fixe la ville et la lumière.
```
[LOOK] The master shot of the film's location: a long straight four-lane seafront avenue seen from the middle of the road at eye level, vanishing toward the coral horizon. Tall palm trees line both sides, behind them pastel art deco hotels with warm amber windows, a few streetlamps reflected in the wet road. Completely empty: no vehicles at all.
```

#### Les neuf plans

**OUV — Ras du bitume**

Image clé :
```
[LOOK] [HERO CAR] Extreme low angle: the camera sits on the wet asphalt in the middle of the avenue, 24 mm wide lens, the road surface sharp in the foreground. Far down the avenue, small in the frame, the hero car is coming straight toward the camera, headlights on, its reflection stretched on the wet road. Palm trees and art deco hotels on both sides, coral band on the horizon.
```
Mouvement :
```
Static camera on the ground. The plum coupe races toward the camera at very high speed, growing fast, and passes just beside the lens with a blast of water spray until it fills the frame. Its headlight reflections streak across the wet road. Nothing else moves.
```

**P1 ★ — Dans le rétro**

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] Front tracking shot at bumper height, 50 mm lens: the hero car in three-quarter front view fills the lower half of the frame, driving fast toward the camera, water spraying from its wheels. Far behind it, at a side street, one pursuit sedan is sliding out onto the avenue, its roof light bar lit coral-orange and violet. Palm trees streak past on both sides.
```
Mouvement :
```
The camera tracks backward at the same speed as the plum coupe, with a slight handheld shake. Behind it, the single pursuit sedan fishtails out of the side street, straightens up and accelerates after the coupe, its light bar flashing coral-orange and violet and reflecting on the wet road. Palm trees rush past.
```

**P2 ★★ — Vue du ciel**

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] Top-down aerial shot from a drone 30 metres directly above the avenue, 35 mm lens. The avenue runs vertically through the frame, palm tree crowns along both edges. The hero car is in the lower third, driving toward the bottom of the frame. Behind it, higher in the frame, two pursuit sedans follow in a V formation, their light bars casting coral-orange and violet pools of light on the wet asphalt.
```
Mouvement :
```
The drone flies along with the cars, looking straight down, and slowly rotates about ten degrees. All three cars drive fast toward the bottom of the frame, keeping their formation; the two pursuit sedans close in slightly on the plum coupe. Light pools slide over the wet road, palm crowns pass under the camera.
```

**P3 ★★★ — Le barrage**

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] Low angle 30 cm above the road, 24 mm wide lens, camera in the middle of the avenue. In the foreground a line of plain orange traffic cones stands across the road, with no vehicles and no people near it. The hero car is a few metres behind the cones, driving straight at them and at the camera. Behind it, three pursuit sedans side by side with their light bars lit.
```
Mouvement :
```
Static camera. The plum coupe bursts through the line of traffic cones without slowing down: the cones fly up and tumble toward the camera, one spinning very close past the lens, and the camera shakes once at the impact. The coupe keeps coming. The three pursuit sedans follow through the gap. Only cones are hit: no vehicle touches another.
```

**P4 ★★★★ — La meute**

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] [PURSUIT VAN] Extreme telephoto shot, 200 mm lens, from far down the avenue at a height of 1.5 metres: strong lens compression stacks everything. The hero car is in the lower third, coming toward the camera. Packed tightly behind and above it in the frame: three pursuit sedans and, in the middle, the taller pursuit van, a wall of coral-orange and violet flashing light bars shimmering in the haze.
```
Mouvement :
```
Slow zoom in with the gentle wobble of a very long lens. All vehicles drive fast toward the camera but, because of the telephoto compression, seem to advance slowly. The tall van pushes forward between the sedans. The light bars flash out of sync, their colours rippling over wet bodywork and road. Haze drifts across.
```

**P5 ★★★★★ — Le projecteur**

Image clé :
```
[LOOK] [HERO CAR] [HELICOPTER] Low angle from the pavement, looking up between two palm trunks, 28 mm lens. Above the rounded rooftops of the art deco hotels, in the upper-middle of the frame, the helicopter is rising into view, its searchlight beam cutting down through the haze. In the lower part of the frame the hero car speeds along the avenue, with coral-orange and violet light flickering on the road behind it.
```
Mouvement :
```
The camera tilts up from the road to the sky. The helicopter rises over the rooftops and swings its searchlight: the cream-white beam sweeps through the haze, crosses the lens for an instant, almost whiting out the picture, then settles on the plum coupe as it speeds past below. Palm fronds shake in the rotor wash.
```

**P6 ★★★★★★ — Toute la ville**

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] [PURSUIT VAN] [HELICOPTER] High, wide aerial shot above the avenue, 24 mm lens, looking along it toward the horizon. The hero car leads, in the lower-middle of the frame, driving toward the camera. Behind it a long column of pursuit sedans and the van, light bars stretching into the distance. Three identical helicopters fly in formation above the avenue, their three searchlight beams crossing on the hero car. Every window of every building in the city is lit warm amber. Fireworks burst in coral, cream and pink above the skyline.
```
Mouvement :
```
The camera cranes up and pulls back, revealing more and more of the lit city. The plum coupe races ahead of the endless column of flashing coral-orange and violet lights. The three helicopters hold formation, their beams staying crossed on the coupe. Fireworks keep bursting above the skyline and reflect in the wet avenue.
```

**FIN — Le frein à main**

Image clé :
```
[LOOK] [HERO CAR] Very low angle 20 cm above the ground, 35 mm lens, on an empty rain-wet esplanade at the end of the avenue, under a single amber streetlamp, palm trees and one pastel art deco facade behind. The hero car is entering the frame from the left, sliding sideways, front wheels turned, white tyre smoke starting to roll along the ground. Coral-orange and violet light from vehicles outside the frame flickers on the wet ground. No other vehicle is visible.
```
Mouvement :
```
Slow motion. Static camera. The plum coupe slides broadside across the wet esplanade in a handbrake turn, tyre smoke rolling low over the ground and water spraying, and comes to a complete stop in three-quarter front view facing the camera, its cream headlights sweeping across the lens as it settles. The smoke drifts. Coral-orange and violet light keeps flickering on the ground from outside the frame.
```

**FIN6 — L'orbite**

Image clé A (première image) :
```
[LOOK] [HERO CAR] [HELICOPTER] Very low angle 20 cm above the ground, 35 mm lens, on the same empty rain-wet esplanade. The hero car has just stopped broadside in the centre, seen from the side, wrapped in low tyre smoke, with water droplets hanging in the air around it. Three cream-white searchlight beams come down from above the frame and cross exactly on the car. Behind, every window of the city is lit amber and fireworks in coral, cream and pink fill the sky above the skyline. No other vehicle on the ground.
```
Image clé B (dernière image, si l'outil accepte une première et une dernière image) :
```
The same scene and the same instant as the attached image, seen from a camera that has moved 120 degrees around the car: the hero car is now in three-quarter front view, its cream headlights pointing at the lens. Same three crossed searchlight beams, same suspended smoke and droplets, same fireworks and lit city behind.
```
Mouvement :
```
Time is frozen: the car, the tyre smoke, the water droplets and the fireworks are completely still, suspended in mid-air. Only the camera moves: it orbits smoothly 120 degrees around the plum coupe at ground level and ends in three-quarter front view with the cream headlights pointing into the lens. The three searchlight beams stay crossed on the car.
```

### 7.8 Réglages par outil

Les noms exacts des réglages changent d'une version à l'autre : ce qui compte est la liste ci-dessous.

- **Outil d'images** (ChatGPT, Gemini ou Midjourney, comme pour les décors) : demander le 9:16 dans la plus grande taille (16:9 pour R1 et R2). Rester dans la même conversation et joindre R1, R2, R3 à chaque image clé. Dans Midjourney : `--ar 9:16 --style raw`, et les références en référence d'objet et de style.
- **Outil vidéo** (Veo dans Gemini ou Flow, Kling, Sora, Runway : celui que tu as déjà ; à qualité égale, prendre celui qui accepte une image de départ **et** des images de référence) :
  - mode **image vers vidéo**, l'image clé comme première image ;
  - **9:16**, 1080p si possible ;
  - **5 secondes** (ou 8), 24 images par seconde ;
  - le **meilleur modèle** pour les prises finales, le modèle rapide pour les essais ;
  - **réécriture automatique du prompt désactivée** si le réglage existe : elle ajoute des passants et des enseignes ;
  - **graine fixe** quand on corrige un prompt, pour ne changer qu'une chose à la fois ;
  - le bloc SANS dans le champ « prompt négatif » s'il y en a un, sinon à la fin du prompt ;
  - pour FIN6 : le mode **première et dernière image** s'il existe (clés A et B) ;
  - ne pas utiliser « prolonger la vidéo » : la voiture dérive d'une prolongation à l'autre.
- **Si l'outil refuse le prompt** (certains filtrent « police ») : les prompts ci-dessus disent déjà « pursuit cars » ; remplacer au besoin « chase » par « convoy » et garder le reste.

### 7.9 Ordre de travail et dates

| Quand | Quoi | Combien |
|---|---|---|
| **Mercredi 11** | R1, R2, R3, puis l'image clé de FIN. On valide le look ensemble. | 4 images |
| **Jeudi 12, lot 1** | FIN, OUV, P1 : images clés puis prises. Avec ces trois plans, un film complet existe pour une étoile. | 3 plans |
| **Vendredi 13 et samedi 14, lot 2** | P2, P3, P4. Le film couvre alors ★ à ★★★★, soit presque tout le monde (et la fiche de Jacques). | 3 plans |
| **Dimanche 15 et lundi 16, lot 3** | P5, P6, FIN6. | 3 plans |
| **Lundi 16 au soir** | Butoir (§1.1). | |
| **Mardi 17 au soir** | Dernière prise acceptée. Après, on ne touche plus au film avant le lancement. | |

Compter une heure par plan, essais compris.

### 7.10 Grille pour garder ou jeter une prise

On jette si, **dans la meilleure seconde de la prise**, l'une de ces lignes est vraie :

- une personne, un visage, un conducteur ou une silhouette se voit ;
- il y a du texte, des lettres ou des chiffres, même illisibles (carrosserie, toit, enseigne, plaque) ;
- la voiture du suspect change de forme ou de couleur, ou ne ressemble plus à R1 ;
- elle rappelle un modèle réel, ou un écusson apparaît ;
- les gyrophares sont rouge et bleu ;
- une roue se déforme, une voiture en traverse une autre, glisse sans tourner ou roule à l'envers ;
- deux véhicules se percutent ;
- le ciel n'est plus à l'heure bleue, ou le sol est sec ;
- l'action sort de la zone centrale, ou quelque chose d'essentiel est dans les bandes ;
- l'image a l'air d'un jeu vidéo, d'un dessin animé ou d'une publicité de voiture en plein jour ;
- un filigrane, une bande noire ou un sous-titre est incrusté.

On garde, et on choisit entre les prises, sur une seule question : **est-ce qu'on mettrait cette seconde dans une bande-annonce ?**

---

## 8. Risques, et ce qui n'a pas été vérifié

**Le risque principal** : la cohérence et le délai des plans. Neuf plans avec la même voiture en six jours, par une personne qui a aussi un lancement à préparer. Les parades : les références d'abord, les lots par priorité, la butoir du 16, et le repli du §1.1.

**Les autres risques**
- **iPhone en mode économie d'énergie** : la lecture automatique d'une vidéo, même muette, y est bloquée sans geste (bogue WebKit 216887 et témoignages concordants). La parade prévue (débloquer les balises au geste d'envoi, sinon la pilule « Ouvrir mon dossier ») s'appuie sur un comportement décrit par des développeurs, pas garanti par Apple. **C'est le premier test de T1 sur un vrai iPhone.**
- **Navigateur intégré de LinkedIn** : la lecture dans la page (sans plein écran du système) dépend de l'application hôte. À tester le premier jour avec les cartons de T2.
- **L'air « fait par IA »** : il se joue au tri. La grille du §7.10 est sévère exprès.
- **Ressemblance avec le jeu** : les prompts ne le nomment jamais, les gyrophares ne sont pas rouge et bleu, la voiture est inventée, le HUD est le nôtre. Chaque prise est relue contre la grille.

**Pas vérifié**
- Les réglages exacts des outils vidéo en novembre 2026 (durées, 9:16 en 1080p, première et dernière image, images de référence). Les recherches confirment ces fonctions pour Veo 3.1 et Kling par des pages de revendeurs, pas par les documentations officielles.
- Le coût en crédits et le temps réel de Jacques.
- Les poids des fichiers : ce sont des budgets, à mesurer sur les vrais plans.
- Que deux balises vidéo préchargées tiennent sur un téléphone faible sans à-coup à la bascule.
- Que le déblocage d'une balise par un geste survit à un changement de source sur iOS.
- Les conditions d'usage commercial de l'outil choisi, et une éventuelle obligation d'indiquer que la séquence est générée par IA (à regarder avant le lancement ; une ligne dans la page de confidentialité coûte peu).
- Le contenu des kits Kenney (§4.2), non retenus.
- La bande-son : aucun agent ne peut l'écouter. C'est l'oreille de Jacques qui la valide.

---

## 9. À reporter au SPEC une fois validé (§18.36)

> **La poursuite devient un film (§18.36).** La poursuite 2D du §18.33 n'a pas passé : Jacques veut une cinématique « digne des plus grands studios ». La révélation est un film vertical de 4,7 s (★) à 11,8 s (★★★★★★), à 24 i/s : neuf plans vidéo générés par IA par Jacques d'après `docs/cinematique-poursuite.md`, montés par ffmpeg en trois fichiers (`web/public/film/`), joués par deux balises vidéo. Un plan et une coupe par étoile, renforts cumulés comme au §18.33 ; fin : dérapage au ralenti, arrêt sur image en deux tons à la lumière du profil, flash, la fiche se pose ; à six étoiles, une orbite à temps gelé. Les étoiles, la radio (`shared/chase/radio.ts`) et les bandes d'encre sont posées en direct par le site, mates. La poursuite est à l'heure bleue pour tous ; gyrophares corail et lilas. Aucune personne, aucune arme, aucun choc, aucun texte, aucune marque. Tout est fonction du temps de la vidéo (`window.__film.seek/hold`). Replis : rien en mouvement réduit ; la pilule de l'attente si la lecture demande un geste ; la poursuite 2D si le film ne se charge pas. Three.js et l'ascenseur sont supprimés à la validation.
