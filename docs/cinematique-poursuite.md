# Le film de la poursuite : direction

*Écrit le 10 novembre 2026 pour une voie de plans vidéo générés par IA, réécrit le 11 novembre 2026 pour la voie en vigueur.*

**Le film est rendu en 3D.** Les plans sont construits et rendus dans Blender (Cycles) avec `tools/film3d/`, à partir de modèles de bibliothèque libres (CC0 ou CC BY, aucun modèle tiré d'un jeu). Les images de test se rendent sur le Mac ; le rendu complet du film se fait sur une machine louée avec carte graphique. Les plans rendus passent ensuite par le montage (`scripts/film-assemble.ts`, `tools/film/`) et sont joués par le lecteur à deux balises vidéo (`shared/film/`, `web/src/film/`), qui existent déjà et ne changent pas.

Les décisions, les dates et l'état d'avancement sont au SPEC §18.36, qui fait foi. Ce document est la direction du film : ce qu'on doit voir, plan par plan, et ce que le montage et le lecteur attendent. Il vaut quelle que soit la technique de rendu.

Le film remplace comme révélation visée l'ascenseur (SPEC §6.3) et la poursuite 2D (SPEC §18.33). Tant qu'il n'est pas validé, l'ascenseur reste la révélation par défaut et le film se joue avec `?scene=film`.

*Numérotation : le code cite les sections §2.1, §2.2, §3.1, §4.1, §5.1 à §5.6, §6 T2, §7.3 et §7.10 de ce document. Leurs numéros sont gardés, d'où quelques trous.*

Vocabulaire, tenu dans tout le document :

- **plan** : un morceau du film, entre deux coupes (OUV, P1 à P6, FIN, FIN6) ;
- **prise** : un fichier vidéo d'un plan, sorti du rendu, parmi lesquels le montage choisit ;
- **voiture en fuite** : la voiture de la personne qui reçoit la fiche ;
- **patrouille** : une voiture de police ; **silhouette** : une personne de la police, vue à contre-jour ;
- **HUD** : ce que le site pose en direct sur le film (étoiles, radio, bandes d'encre).

---

## 0. Les images de test

Avant de rendre des plans animés, on juge le look sur des images fixes : le début calme et le sommet. Elles sont rendues par `tools/film3d/` (mode d'emploi dans son `README.md`, crédits des modèles dans son `CREDITS.md`) et déposées hors du dépôt, dans `Azerit/design/film/ref/`.

Une image passe si les quatre réponses sont oui :

1. **Le réalisme** : on croit à une image de film. Non si elle a l'air d'un jeu mobile, d'un dessin ou d'un jouet.
2. **La couleur** : ciel indigo, bande corail à l'horizon, ombres prune, gyrophares corail et lilas, phares crème. Non si c'est noir, gris, ou rouge et bleu.
3. **La lecture sur un téléphone** : à 390 px de large, le début se comprend en une seconde (une voiture tranquille, une seule patrouille loin derrière) ; au sommet on distingue la voiture en fuite, l'encerclement, les hélicoptères et les avions, et la voiture en fuite reste le sujet.
4. **La place du HUD** : rien d'important dans les 12 % du haut ni les 15 % du bas (§7.3).

Ce qui tient et ce qui reste à faire après les premières images : SPEC §18.36.

---

## 1. La voie

- **Un film pré-rendu, pas une scène calculée sur le téléphone.** Une 3D temps réel avec des modèles libres donne sur un téléphone une image de jeu mobile, pas de film (SPEC §18.36). Le téléphone ne fait que lire une vidéo.
- **Le même film pour toutes les fiches d'un même niveau.** Ce qui est personnel : le nombre d'étoiles, donc la longueur du film ; les lignes de radio, qui citent les faits de la fiche ; l'arrêt sur image au pseudo et au niveau ; le lieu du crime où la fiche se pose.
- **Une seule lumière pour la poursuite : l'heure bleue.** Les quatre lumières des profils reviennent à l'arrêt sur image et à l'atterrissage (§3.1).
- **La chaîne de montage et de lecture ne dépend pas du rendu** : elle prend des prises en mp4 et rend trois fichiers (§4.1).

---

## 2. Le storyboard

### 2.1 Les règles du film

- **Format** : vertical 9:16, 24 images par seconde. Toutes les durées se comptent en images ; la seule source est `shared/film/cut.ts`.
- **Très réaliste.** Une image de film de braquage : la personne au volant prend peur, la police descend et tire, la montée devient dangereuse.
- **Le début est le même pour toutes les fiches, et il est calme.** Une conduite de nuit, une seule patrouille loin derrière, gyrophare éteint. Ensuite chaque étoile ajoute des poursuivants, du danger, de la vitesse, du tremblé de caméra et du bruit. La montée doit se lire son coupé : c'est le contraste entre le début et le sommet qui fait le film.
- **Un plan par étoile, une coupe franche à chaque étoile.** L'étoile claque sur la coupe.
- **Le film s'arrête au niveau de la fiche, par l'arrestation** : la voiture en fuite est cernée et s'immobilise, deux mains gantées se lèvent derrière le pare-brise, l'image gèle, et cette image devient la fiche.
- **Sens de l'action** : l'ouverture suit la voiture en fuite de dos ; ensuite elle vient vers nous ou descend dans le cadre, et on voit ce qui arrive derrière elle.
- **La personne au volant vaut pour tout le monde** : capuche relevée, gants de cuir noirs, toujours de dos ou en ombre. Ni peau, ni cheveux, ni traits, donc ni genre, ni âge, ni couleur de peau à lire. Pas d'yeux dans le rétroviseur : il montre les gyrophares. Sa peur passe par les mains qui se crispent, la tête qui se tourne d'un coup, la voiture qui bondit.
- **La police, ce sont des silhouettes** à contre-jour, sans visage lisible, sans insigne, loin de la caméra.
- **On tire à partir de trois étoiles, personne n'est touché.** Éclairs de tir, étincelles sur la carrosserie, un rétroviseur qui vole. Ni sang, ni personne blessée, ni corps au sol : le film se regarde sur un téléphone, en public.
- **Les avions de chasse ne tirent rien** : ni missile, ni explosion.
- **Aucun choc entre véhicules.**
- **Un toucher passe le film** (bouton « Passer » et toucher de l'image). **Rien ne joue en mouvement réduit** : la fiche sort directement.

| Niveau | Plans joués | Images | Durée |
|---|---|---|---|
| ★ | OUV, P1, FIN | 112 | 4,7 s |
| ★★ | OUV, P1, P2, FIN | 140 | 5,8 s |
| ★★★ | OUV, P1 à P3, FIN | 168 | 7,0 s |
| ★★★★ | OUV, P1 à P4, FIN | 196 | 8,2 s |
| ★★★★★ | OUV, P1 à P5, FIN | 224 | 9,3 s |
| ★★★★★★ | OUV, P1 à P6, FIN6 | 284 | 11,8 s |

| Plan | Images de vidéo | Dessiné ensuite par le site |
|---|---|---|
| OUV | 24 | |
| P1 à P5 | 28 chacun | |
| P6 | 40 | |
| FIN | 36 | arrêt sur image 14, flash 10 (60 en tout) |
| FIN6 | 56 | arrêt sur image 12, flash 12 (80 en tout) |

La poursuite entière (OUV et P1 à P6) fait 204 images. Une fin propre aux cinq étoiles (`fin5`, 36 images de vidéo) reste en option (SPEC §18.36) ; `shared/film/cut.ts` ne connaît aujourd'hui que `fin` et `fin6`, et cinq étoiles jouent `fin`.

**La courbe.** Chaque ligne doit être plus forte que la précédente.

| Plan | Aux trousses | Danger | Vitesse | Caméra |
|---|---|---|---|---|
| OUV | une patrouille, loin, gyrophare éteint | aucun | conduite calme | sur rail, stable |
| P1 ★ | la même, gyrophare allumé dans le rétroviseur | la peur : les mains se crispent | la voiture bondit à la fin du plan | stable, dans l'habitacle |
| P2 ★★ | deux patrouilles | la fuite | elle accélère franchement | drone fluide |
| P3 ★★★ | trois patrouilles, un barrage | la police tire | pleine vitesse | fixe, puis la première secousse |
| P4 ★★★★ | la meute et un fourgon | des tirs en roulant | pleine vitesse | longue focale, tremblé continu |
| P5 ★★★★★ | les mêmes, plus un hélicoptère | repérage du ciel | pleine vitesse | à l'épaule, secouée par le rotor |
| P6 ★★★★★★ | une colonne, trois hélicoptères, deux avions de chasse | tout le monde | pleine vitesse | grue qui s'envole |

### 2.2 Le HUD

Deux bandes d'encre `#0c0d1b` encadrent l'image, de la couleur exacte de la page : le film est une fenêtre dans le site. Le HUD est mat, sans lueur.

- **Bande du haut** (9 % de la hauteur, plus l'encoche) : les six étoiles, centrées. Allumée : crème `#fff9cb`. Éteinte : pleine, marine `#243152`. Une étoile qui s'allume passe de 1,5 à 1 en 5 images.
- **Bande du bas** (12 %) : la ligne de radio en JetBrains Mono 500, 13 px, crème, précédée d'un carré de 6 px qui alterne corail et lilas ; une seule ligne, 350 px au plus. Dessous, à droite : « Passer » et le bouton du son, 44 px de haut.
- Les bandes se ferment en 8 images à l'ouverture et s'ouvrent au flash.
- À chaque étoile, l'image tremble de 3 px sur quatre images.

Les lignes de radio viennent de `shared/chase/radio.ts`, une par étoile : « Véhicule en fuite · {poste} », « Arme signalée : {langage} », « Motif : {chef d'accusation} », « Affiliation : {affiliation} », « Profil identifié : {profil} », « Toutes les unités · {niveau} », et à la fin « Fin de course · {niveau} ».

### 2.3 Plan par plan

**OUV : la conduite calme** (24 images)
- *Cadre* : on suit la voiture en fuite de trois quarts dos, à 1,5 m du sol et quelques longueurs derrière elle, 35 mm. L'avenue vide file vers l'horizon corail, palmiers et hôtels Art déco des deux côtés. Loin derrière, une seule patrouille, gyrophare éteint.
- *Caméra* : comme sur un rail, aucune secousse.
- *Action* : rien. Les reflets des lampadaires glissent sur la carrosserie et sur le bitume mouillé.
- *HUD* : les bandes se ferment, six étoiles éteintes, radio muette.

**P1 ★ : le rétroviseur** (28 images)
- *Cadre* : dans l'habitacle, par-dessus l'épaule droite de la personne au volant, depuis la banquette arrière, 28 mm. Au premier plan, flous, sa capuche de dos et ses mains gantées sur le volant. En haut au milieu, le rétroviseur.
- *Caméra* : fixe dans la voiture.
- *Action* : dans le rétroviseur, loin, la rampe de gyrophares s'allume, corail et lilas ; ses couleurs battent sur le plafond et sur la capuche. La tête se tourne d'un coup, les mains gantées se crispent sur le volant, la voiture bondit.
- *HUD* : étoile 1.

**P2 ★★ : vue du ciel** (28 images)
- *Cadre* : plongée totale, drone à 30 m, 35 mm. L'avenue est verticale dans le cadre, les couronnes des palmiers passent sous la caméra.
- *Caméra* : avance avec les voitures et tourne lentement de 10°.
- *Action* : la voiture en fuite accélère, une gerbe d'eau derrière elle. Deux patrouilles la suivent ; leurs gyrophares posent des flaques corail et lilas sur le bitume mouillé.
- *HUD* : étoile 2.

**P3 ★★★ : le barrage** (28 images)
- *Cadre* : caméra à 30 cm du sol, 24 mm, derrière le barrage, tournée vers la voiture en fuite qui arrive. À gauche et à droite, deux patrouilles garées en biais, portières ouvertes ; entre elles, une ligne de plots. Derrière chaque portière, une silhouette accroupie, de dos, découpée par les phares.
- *Caméra* : fixe, puis la première secousse du film.
- *Action* : la police ouvre le feu : des éclairs blancs éclairent les silhouettes, des étincelles éclatent sur le capot. La voiture en fuite ne ralentit pas, traverse les plots, frôle l'objectif. Personne n'est touché, aucune tôle ne se touche.
- *HUD* : étoile 3.

**P4 ★★★★ : la meute** (28 images)
- *Cadre* : très longue focale (200 mm), caméra loin devant, à 1,5 m. La compression empile tout : la voiture en fuite en bas, et derrière elle, serrés, les patrouilles et un fourgon plus haut qu'elles.
- *Caméra* : zoom avant lent, tremblé continu de longue focale, brume.
- *Action* : le fourgon force le passage au milieu. Des éclairs de tir clignotent aux fenêtres des poursuivants, des étincelles ricochent sur le bitume, un rétroviseur de la voiture en fuite s'arrache.
- *HUD* : étoile 4.

**P5 ★★★★★ : le projecteur** (28 images)
- *Cadre* : contre-plongée depuis le trottoir, entre deux troncs de palmiers, 28 mm.
- *Caméra* : à l'épaule, panoramique vers le haut, secouée par le souffle du rotor.
- *Action* : un hélicoptère monte au-dessus des toits ; son projecteur balaie la brume, croise l'objectif et se pose sur la voiture en fuite qui passe.
- *HUD* : étoile 5.

**P6 ★★★★★★ : toute la ville** (40 images)
- *Cadre* : grand plan aérien, 24 mm.
- *Caméra* : grue qui monte et recule au-dessus de l'avenue ; elle tremble au passage des avions.
- *Action* : la voiture en fuite en tête d'une colonne de gyrophares jusqu'à l'horizon ; trois hélicoptères en formation, trois faisceaux croisés sur elle ; toutes les fenêtres de la ville allumées. Deux avions de chasse arrivent du fond, très bas dans l'axe de l'avenue, et passent au-dessus de tout. Ils ne tirent rien.
- *HUD* : étoile 6.

**FIN : l'arrestation** (niveaux ★ à ★★★★★)
1. *L'arrêt* (36 images de vidéo, la vitesse passe du normal au ralenti). Cadre serré : caméra fixe à 20 cm du sol, 35 mm, sur une esplanade vide sous un seul lampadaire. La voiture en fuite finit de freiner vers nous, la fumée de pneus la dépasse. Au premier plan, l'avant d'une patrouille, portière ouverte ; derrière la portière, une silhouette se redresse. Tout autour, hors champ, des lueurs corail et lilas battent dans la brume. Derrière le pare-brise plein de reflets, deux mains gantées se lèvent. Personne ne tire.
2. *L'arrêt sur image* (14 images). La dernière image gèle et passe en deux tons (§3.1), les traits de la toise passent par-dessus, une plaque d'encre porte « @pseudo », et le niveau claque en Barlow Condensed 700, crème. L'image gelée est la photo d'identité. Dans la bande du haut, l'étoile suivante clignote deux fois et reste éteinte.
3. *Le flash* (10 images). Crème `#fff9cb` plein écran, les bandes s'ouvrent. Au sommet du flash, la fiche est posée sur le ciel peint de son lieu du crime (SPEC §18.29).

Le cadre serré de FIN règle le nombre de poursuivants sans rendre cinq fins : une seule patrouille et une seule silhouette sont visibles, ce qui est exact à une étoile ; au-dessus, les autres sont suggérées par les lueurs hors champ, et le niveau est porté par le HUD.

**FIN6 : l'encerclement** (niveau ★★★★★★ seulement)
1. *Le temps s'arrête* (56 images de vidéo). La voiture en fuite vient de s'immobiliser au centre de l'esplanade, encerclée : un anneau de patrouilles et le fourgon, portières ouvertes, une silhouette derrière chacune ; trois faisceaux d'hélicoptère croisés sur elle ; dans le ciel, les deux avions de chasse saisis en plein passage ; toutes les fenêtres allumées. Le temps est gelé : fumée et gouttes suspendues, gyrophares figés. La caméra, elle, continue : elle tourne autour de la voiture au ras du sol et finit de trois quarts face, sur les deux mains gantées levées derrière le pare-brise.
2. *L'arrêt sur image* (12 images) : deux tons, le niveau, les six étoiles.
3. *Le flash* (12 images) : la fiche se pose avec son contour éclairé par l'arrière, réservé à ce niveau (SPEC §18.18).

---

## 3. Le look

**En une phrase** : une image de film de braquage, à l'heure bleue, juste après la pluie, dans une ville côtière Art déco inventée, étalonnée dans la palette du site.

### 3.1 La lumière

- **La poursuite** est à l'heure bleue : ciel indigo `#4b4fb8` vers marine `#243152`, fine bande corail `#ff6a3d` à l'horizon, fenêtres et lampadaires ambre `#ffc36b`, ombres prune `#4b2f54` et marine, jamais noires. Le bitume est mouillé : c'est lui qui renvoie les couleurs.
- **Les gyrophares sont corail et lilas** (`#ff6a3d`, `#8d8cf0`), jamais rouge et bleu : c'est la signature du film, et elle éloigne d'une vraie police.
- **La voiture en fuite** est un coupé prune `#4b2f54`, phares crème `#fff9cb`, vitres teintées, sans écusson, plaque vierge. Les patrouilles et le fourgon sont en deux tons marine et crème, sans lettrage.
- **Les quatre lumières des profils** (`SCENE_LIGHT`, `shared/scenes.ts`) arrivent à la fin, dans les deux tons de l'arrêt sur image (`FREEZE_TONES`, `shared/film/plan.ts`) :

| Lumière du profil | Lumières de l'arrêt sur image | Ombres |
|---|---|---|
| Heure rose | rose `#ffb2c6` | prune `#4b2f54` |
| Heure dorée | pêche `#fcbf96` | prune `#4b2f54` |
| Heure bleue | lavande `#ccc2f5` | marine `#243152` |
| Aube | lilas clair `#e5ddff` | prune `#4b2f54` |

La nuit du film débouche donc sur l'heure du profil : le flash fait le raccord.

### 3.2 Ce que l'image a le droit de montrer

La règle « mat, aucune lueur » (SPEC §18.18) est une règle d'interface. Elle tient pour le HUD : étoiles, radio, bandes, plaque et titre de l'arrêt sur image sont en aplats.

Dans l'image, le film a droit à ce qu'une caméra enregistre : lumière des phares et des gyrophares, éclairs de tir et étincelles, reflets sur le bitume mouillé, brume, faisceaux des projecteurs, faible profondeur de champ, flou de mouvement. Restent interdits même dans l'image : le néon, la grille et le soleil rayé de la synthwave, l'effet VHS, le duo magenta et cyan.

Ce qui attache le film au site : la palette, les bandes de la couleur de la page, les polices du site, l'arrêt sur image en deux tons (le traitement des photos d'identité de la couverture, SPEC §18.31) et l'atterrissage sur le décor peint du profil.

### 3.3 Les traitements posés par le site

| Traitement | Où il se fait |
|---|---|
| Bandes d'encre, étoiles, radio | HTML, par-dessus la vidéo |
| Étalonnage commun aux plans | ffmpeg, au montage (`grade` de `tools/film/montage.json`) |
| Grain | une tuile de bruit de 128 px, déplacée 12 fois par seconde, opacité 7 % |
| Vignette | un dégradé radial fixe |
| Secousse à chaque étoile | translation de l'image sur quatre images |
| Deux tons de l'arrêt sur image | filtre CSS sur une image fixe |
| Flash | un aplat crème en opacité |
| Vibration | une impulsion par étoile (`web/src/lib/haptics.ts`, Android) |

Le grain n'est pas gravé dans les fichiers : il gonflerait le débit pour rien.

---

## 4. Les fichiers

### 4.1 Ce que le lecteur et le montage attendent

**En entrée du montage**, hors du dépôt, dans `~/Desktop/Azerit/design/film/plans/` : une ou plusieurs prises par plan, nommées `PLAN-prise.mp4` (`OUV-1.mp4`, `P3-2.mp4`, `FIN6-1.mp4`). `tools/film/montage.json` dit quelle prise garder et quelle fenêtre en prendre (mode d'emploi : `tools/film/README.md`). Une prise absente est remplacée par un carton : le film se monte toujours.

**En sortie**, dans `web/public/film/` :

| Fichier | Contenu | Images | Plafond de poids |
|---|---|---|---|
| `poursuite-720.mp4` | OUV puis P1 à P6 | 204 | 2,8 Mo |
| `fin-720.mp4` | FIN | 36 | 0,6 Mo |
| `fin6-720.mp4` | FIN6 | 56 | 1,0 Mo |
| `poursuite-540.mp4`, `fin-540.mp4`, `fin6-540.mp4` | les mêmes en 540 × 960 | les mêmes | 1,8 Mo en tout |
| `affiche.jpg` | la première image, 720 × 1280 | 1 | 60 Ko |

Les trois fichiers en 720p pèsent 4 Mo en tout au plus. Encodage : H.264 profil Main, 720 × 1280, 24 images par seconde, une image clé toutes les 12 images, `+faststart`, sans piste son. Les plafonds sont dans `scripts/film-lib.ts` ; si un fichier en dépasse un, le montage baisse la qualité et le dit.

Les polices (Barlow Condensed, Outfit, JetBrains Mono) et les décors peints des profils (`web/public/profiles/`) sont déjà servis par le site.

---

## 5. Le lecteur

### 5.1 Où est le code

```
shared/film/
  cut.ts          24 i/s, les durées en images, l'ordre des plans
  plan.ts         filmPlan(fiche) : niveau, étoiles, coupe, fin, arrêt sur image, flash, radio
  hud.ts          hudAt(plan, t) : l'état exact du HUD à l'instant t
web/src/film/
  player.ts       deux balises vidéo, chargement, bascule, horloge, seek et hold, mesures
  unlock.ts       les deux balises, débloquées par le geste qui lance la fiche
  FilmHud.tsx     bandes, étoiles, radio, arrêt sur image, flash, grain, vignette
  film.css
web/src/components/Film.tsx     même contrat que Chase et Walkout3D envers la page d'une fiche
web/public/film/                les mp4 et l'affiche
tools/film/montage.json         la liste de montage
scripts/film-assemble.ts        ffmpeg : découpe, étalonne, recadre, recolle, encode, vérifie
scripts/film-contact.ts         planche-contact d'une prise, pour choisir sa fenêtre
scripts/film-lib.ts             la partie pure du montage, testée
tools/film3d/                   la scène Blender et son rendu
```

### 5.2 Tout est fonction du temps

- **L'horloge du film est celle de la vidéo.** Pendant la poursuite, le temps est celui de la première balise ; pendant la fin, la coupe plus le temps de la seconde ; après sa dernière image (arrêt sur image, flash), l'horloge du navigateur prend le relais. Le HUD ne peut donc pas se décaler de l'image.
- **Le HUD est une fonction pure** : `hudAt(plan, t)` se teste sans navigateur.
- **Mise au point** : `window.__film = { plan, seek(t), hold(on), stats() }`, en développement et avec `?mock=1`.

### 5.3 La lecture

- **Deux balises `<video muted playsinline>`.** La première joue `poursuite` (toujours le fichier complet à six étoiles). La seconde porte la fin, calée sur sa première image : `fin` de ★ à ★★★★★, `fin6` à ★★★★★★.
- **La coupe au niveau de la fiche** : quand la première balise atteint la dernière image de son dernier plan joué, la seconde démarre et passe devant. Deux images d'encre couvrent la bascule : la dernière du plan et la première de la fin.
- **Fichiers chargés en entier avant de jouer** (`fetch` puis `Blob`) : aucune mise en mémoire tampon pendant le film.
- **Encodage** : celui du §4.1. **540p** si l'économiseur de données est mis ou si la connexion annoncée est lente.
- **Ordinateur** : le film dans une colonne 9:16 centrée, haute comme la fenêtre (900 px au plus), sur l'encre.
- **Cadrage** : l'image remplit l'écran. Un téléphone en 390 × 844 est plus étroit que le 9:16 : 9 % de l'image sont rognés de chaque côté. D'où les zones du §7.3.

### 5.4 Le chargement pendant l'attente

1. Au geste qui lance la fiche, les deux balises sont créées et débloquées.
2. Dès l'attente, `poursuite` puis `fin` se téléchargent.
3. Fiche prête : à six étoiles, `fin6` se charge. La scène se dit prête quand la première image est peinte, et l'écran d'attente se lève.

### 5.5 Les replis

| Cas | Ce qui se passe |
|---|---|
| Mouvement réduit | rien ne joue, la fiche sort |
| Le navigateur refuse de lancer la vidéo sans geste | l'attente montre la pilule « Ouvrir mon dossier » ; le toucher lance le film |
| Le film n'est pas prêt 4 s après la fiche, ou H.264 illisible | la poursuite 2D joue à sa place |
| Erreur de lecture en cours de film | flash immédiat, la fiche se pose |

Essais en développement : `?film=gesture`, `?film=missing`, `?film=nocodec`.

### 5.6 Le budget et sa mesure

| Mesure | Cible sur un téléphone moyen |
|---|---|
| Téléchargement | 4 Mo au plus en 720p, 1,8 Mo en 540p |
| Images vidéo perdues | 0 sur tout le film |
| Bascule de la poursuite à la fin | 2 images au plus |
| Délai entre la levée de l'attente et la première image qui bouge | 300 ms au plus |

`__film.stats()` rend les images perdues, la durée de la bascule, le délai de départ et les octets chargés. À relever dans Chrome avec le processeur ralenti 4 fois, puis sur de vrais téléphones, dans le navigateur du système et dans le navigateur intégré de LinkedIn.

### 5.7 Ce qui part à la validation du film

L'ascenseur est supprimé avec Three.js quand le film est validé (SPEC §18.36). La poursuite 2D reste le repli du film.

---

## 6. La construction

### T1 : le lecteur et le HUD

Construit le 10 novembre 2026 (SPEC §18.36) : le plan, le HUD pur, le lecteur à deux balises, l'enveloppe React, le branchement à la page et à l'attente.

### T2 : le montage

`scripts/film-assemble.ts` transforme les prises en fichiers du site ; tant qu'une prise manque, son carton la remplace. Critères :

1. `npx tsx scripts/film-assemble.ts` produit les six mp4 et l'affiche en moins de deux minutes sur le Mac ; `ffprobe` confirme 204, 36 et 56 images, 24 i/s, 720 × 1280 et 540 × 960, aucune piste son.
2. Un plan absent de `design/film/plans/` est remplacé par son carton, sans erreur.
3. Les poids tiennent dans les plafonds du §4.1 ; sinon le script baisse la qualité et le dit.
4. À 390 px, dans le lecteur : aucun plan ne garde de bande noire, de filigrane ou de texte ; rien d'important sous les bandes ni dans les 9 % rognés de chaque côté.
5. Côte à côte sur une planche, les neuf plans ont la même nuit : même ciel, mêmes ombres prune, gyrophares corail et lilas.
6. Pour chaque prise, une planche-contact (`scripts/film-contact.ts`) et un avis écrit contre la grille du §7.10.
7. Sur une planche des sept plans de poursuite dans l'ordre, la montée se lit sans le son ; OUV et P1 sont calmes.

### T3 : ce qui reste

Le son (le film est muet aujourd'hui), la vérification sur de vrais téléphones, et le passage du film en révélation par défaut (`DEFAULT_SCENE`, `web/src/lib/revealScene.ts`). L'échéance et ce qui se passe si elle est manquée : SPEC §18.36.

---

## 7. Les plans rendus

### 7.1 Format d'une prise

- **Vertical 9:16**, 720 × 1280 au moins, 24 images par seconde, mp4.
- **Plus longue que le plan** : le montage n'en garde que la fenêtre choisie (24 à 56 images selon le plan, §2.1).
- **Image nue** : pas de bandes noires, pas de texte, pas de filigrane, pas d'interface. C'est le site qui pose le HUD.
- **Dépôt** : `Azerit/design/film/plans/`, hors du dépôt Git (§4.1).

### 7.3 Les zones

```
┌───────────────────────┐
│ BANDE DU HAUT  (12 %) │  couverte par les étoiles : ciel seul
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

- La voiture en fuite est toujours entière dans la zone centrale à l'instant fort du plan.
- Les hélicoptères (P5, P6) et les avions de chasse (P6, FIN6) restent sous les 12 % du haut, sauf quand les avions sortent du cadre à la fin de P6.

### 7.4 Le style

- **Très réaliste.** De vraies matières, de vrais reflets. Ni dessin animé, ni image de jeu, ni aplats, ni voitures-jouets.
- **Toujours la même heure** : ciel indigo vers marine, une fine bande corail à l'horizon, bitume mouillé (§3.1).
- **Gyrophares corail et lilas**, jamais rouge et bleu.
- **Rues sans passants ni circulation.** Les seules personnes du film sont la personne au volant et les silhouettes de la police.
- **Une seule action et un seul mouvement de caméra par plan.**
- **Le film monte.** OUV est calme, P1 commence calme. Chaque plan suivant va plus vite, tremble plus et montre plus de monde. Un plan d'ouverture où ça fonce déjà est à refaire, même beau.

### 7.5 Les interdits

- **Rien qui vienne d'un jeu** : ni marque, ni logo, ni personnage, ni carte, ni véhicule, ni modèle, ni image de référence. Les modèles viennent de bibliothèques libres (CC0 ou CC BY) et sont crédités dans `tools/film3d/CREDITS.md`.
- **Aucun nom de jeu, de studio, de ville réelle ou de police réelle**, dans l'image comme dans ce qui sert à la produire.
- **Aucune personne réelle** : pas de visage qui ressemble à quelqu'un. Dans le film il n'y a pas de visage du tout.
- **Des voitures, des hélicoptères et des avions sans écusson, sans cocarde, sans numéro**, qui ne rappellent pas un modèle réel.
- **Ni sang, ni personne blessée, ni corps au sol.** Personne n'est touché, personne n'est renversé.
- **Ni missile, ni explosion, ni incendie.**
- **Aucun choc entre véhicules.**
- **Aucun texte** : ni lettrage de police, ni enseigne, ni plaque lisible, ni numéro sur un toit. Le site est bilingue.
- **Aucune interface** dans l'image : ni étoiles, ni carte, ni jauge, ni bandes.
- **Pas de synthwave** : néon, grille, soleil rayé, effet VHS.
- **Pas de feux d'artifice.**

### 7.10 Garder ou jeter une prise

On jette si, dans la fenêtre gardée, l'une de ces lignes est vraie :

- ça ne fait pas film : image de jeu, de dessin animé, voitures-jouets ;
- un visage est lisible, ou on voit la peau, les cheveux ou les yeux de la personne au volant (rétroviseur compris) ;
- un visage ou une silhouette rappelle une personne réelle ou un personnage existant ;
- il y a du sang, une personne blessée, un corps au sol, quelqu'un est touché ou renversé ;
- un missile part, quelque chose explose ou brûle, il y a un feu d'artifice ;
- une personne qui passe apparaît ;
- il y a du texte, des lettres ou des chiffres, même illisibles (carrosserie, toit, uniforme, enseigne, plaque, cadran) ;
- la voiture en fuite change de forme ou de couleur d'un plan à l'autre ;
- un véhicule ou un avion rappelle un modèle réel, ou porte un écusson, une cocarde, un numéro ;
- les gyrophares sont rouge et bleu ;
- une roue se déforme, une voiture en traverse une autre, glisse sans tourner ou roule à l'envers ;
- deux véhicules se percutent ;
- OUV n'est pas calme, ou un plan est moins agité que celui d'avant ;
- dans FIN, plus d'une patrouille ou plus d'une silhouette est visible (la fin doit rester vraie à une étoile) ;
- le ciel n'est plus à l'heure bleue, ou le sol est sec ;
- l'action sort de la zone centrale, ou quelque chose d'essentiel est dans les bandes ;
- un filigrane, une bande noire ou un sous-titre est incrusté.

On garde, et on choisit entre les prises, sur une seule question : est-ce qu'on mettrait cette seconde dans une bande-annonce ?

---

## 8. Ce qui n'est pas vérifié

- **La lecture automatique sur iPhone en mode économie d'énergie** : une vidéo, même muette, peut y être bloquée sans geste. La parade (débloquer les balises au geste d'envoi, sinon la pilule « Ouvrir mon dossier ») est à vérifier sur un vrai iPhone.
- **Le navigateur intégré de LinkedIn** : la lecture dans la page, sans plein écran du système, dépend de l'application hôte.
- **Les poids des fichiers** : les plafonds du §4.1 sont des budgets, à mesurer sur les vrais plans.
- **La police qui tire, vue depuis un fil professionnel** : ce qui tient l'image du côté du film de braquage, c'est l'absence de sang et de personne touchée, des silhouettes, une voiture pour cible, et une fin où des mains se lèvent. Un plan qui sort plus dur que prévu se jette.
- **La bande-son** : aucun agent ne peut l'écouter. C'est l'oreille de Jacques qui la valide.
