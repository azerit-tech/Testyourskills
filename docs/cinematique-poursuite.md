# La cinématique de poursuite

*Écrit le 10 novembre 2026. Document de conception : aucun code, aucune décision reportée au SPEC tant que Jacques n'a pas validé (le paragraphe à y reporter est au §9). Remplace la poursuite 2D du §18.33 comme révélation visée.*

La barre, dans les mots de Jacques : « un effet film à la fin », « une super cinématique à la GTA », « un truc vraiment vraiment vraiment stylé, genre digne des plus grands studios ». Et le film qu'il voit : « au départ c'est très chill, il n'y a qu'une voiture de police ; petit à petit il y a plein de gens qui arrivent à sa suite, les étoiles montent, jusqu'à arriver à la fin : il y a tout, hélicoptères, avions de chasse », puis « ça s'arrête : ils se font arrêter ». Donc : un début calme et commun à tous, une montée étoile par étoile, et une arrestation dont l'image gelée devient la fiche. Enfin, le 10 au soir : « l'objectif c'est juste de faire un truc très réaliste », « au début elle s'effraye », « des policiers qui commencent à tirer », « un truc GTA GTA ultra stylé ». Et le calcul n'est plus une contrainte : il louera une machine. **La première chose à faire est le test du §0.**

---

## 0. Test de look, dix minutes

Avant tout le reste : **deux images**, pour voir si l'image de film qu'on vise sort des outils. Rien d'autre n'est demandé à Jacques avant ce test.

**Comment**
- Ton outil d'images habituel (ChatGPT, Gemini ou Midjourney). Aucune image à téléverser.
- Demander le **portrait 9:16**, dans la plus grande taille. Si l'outil ne propose que le 2:3, le prendre : on juge le look, pas le cadrage. Dans Midjourney, ajouter `--ar 9:16 --style raw`.
- Coller chaque prompt tel quel. Deux variantes par image, pas plus.
- Déposer dans `/Users/jacquesmougeot/Desktop/Azerit/design/film/ref/`, sous les noms `test-a.png` et `test-b.png`.

**Image A, le début calme**

```
Photorealistic live-action film frame from a big-budget crime thriller, vertical 9:16, shot on location with a large-format digital cinema camera and an anamorphic lens: real cars, real street, practical lighting, natural reflections, shallow depth of field, fine film grain. Not CGI, not an illustration, not a video game. Blue hour just after rain in a fictional subtropical coastal city: the sky runs from deep indigo at the top to navy, with a thin coral-orange band along the horizon; the wet asphalt mirrors the sky and every light; warm amber streetlamps and hotel windows; shadows are deep plum and navy, never pure black. A long, straight, deserted seafront avenue lined with tall palm trees and pastel art deco low-rise hotels with rounded corners. Calm front tracking shot at hood height, 50 mm lens. In the lower half of the frame, cruising unhurried toward the camera: a late-1980s two-door sports coupe of an invented design that matches no real car model, low and wedge-shaped, dark plum metallic paint beaded with rain, plain rectangular headlights glowing warm cream, dark tinted windows, no badge, blank licence plate. Far behind it, small in the frame, one single police sedan of an invented design, two-tone navy and cream with no lettering and no emblem, follows at a distance, its roof light bar switched off. Nothing has started yet: a quiet late-night drive. The top 12% of the frame is plain sky and the bottom 15% is plain wet road, with nothing important in them; both cars sit inside the central 80% of the width. No people visible, no text, no letters, no numbers, no logos, no readable signs, no watermark, no borders.
```

**Image B, le sommet**

```
Photorealistic live-action film frame from a big-budget crime thriller, vertical 9:16, shot on location with a large-format digital cinema camera and an anamorphic lens: real cars, practical lighting, natural reflections, shallow depth of field, fine film grain. Not CGI, not an illustration, not a video game. Blue hour just after rain in a fictional subtropical coastal city of pastel art deco hotels and tall palm trees: the sky runs from deep indigo to navy, with a thin coral-orange band along the horizon; the wet ground mirrors every light; shadows are deep plum and navy, never pure black; every window in the city is lit warm amber. Low wide-angle shot, 24 mm lens, 40 cm above the ground, on a rain-wet esplanade at the end of a seafront avenue. In the centre, stopped, in three-quarter front view: a late-1980s two-door sports coupe of an invented design that matches no real car model, low and wedge-shaped, dark plum metallic paint beaded with rain, rectangular headlights glowing warm cream, windscreen full of reflections, wrapped in drifting tyre smoke. It is completely surrounded by a ring of police sedans and one tall police van of an invented design, two-tone navy and cream, no lettering, no emblem, roof light bars flashing coral-orange and violet, never red and blue. Behind every open car door, officers stand as black backlit silhouettes, weapons drawn and aimed at the coupe; no face is readable. Above, three dark helicopters with no markings hover in formation, their three cream-white searchlight beams crossing on the coupe through the haze. Higher still, two dark grey fighter jets of an invented design, no markings, nothing under their wings, streak very low over the city. The top 12% of the frame is plain sky and the bottom 15% is plain wet ground, with nothing important in them; the coupe sits inside the central 80% of the width. No blood, nobody hurt, no explosion, no text, no letters, no numbers, no logos, no insignia, no readable signs, no watermark, no borders.
```

Si l'outil refuse l'image B, remplacer `weapons drawn and aimed at the coupe` par `facing the coupe` et relancer.

**Ce qu'on regarde pour dire oui ou non**

1. **Le réalisme** : on croit à une image tirée d'un film tourné en vrai. Non si ça sent le rendu 3D, le dessin, le jouet ou la publicité.
2. **La couleur** : ciel indigo, bande corail à l'horizon, ombres prune, gyrophares corail et violet, phares crème. Non si c'est noir, gris, ou rouge et bleu.
3. **La lecture sur un téléphone** : affichée à 390 px de large, A se comprend en une seconde (une voiture tranquille, une seule voiture de police loin derrière) ; dans B on distingue la voiture, l'anneau, les hélicoptères et les avions, et la voiture reste le sujet.
4. **La place du HUD** : rien d'important dans les 12 % du haut ni les 15 % du bas.

Quatre oui : on passe aux références (§7.6). Non au 1 ou au 2 : on corrige le bloc LOOK et on refait le test. Non au 3 sur l'image B : on allège le sommet avant d'écrire les plans.

---

## 1. La voie, tranchée

**On tourne un vrai film : neuf plans vidéo (dix avec une fin en option) générés par IA par Jacques, d'après les briefs du §7, montés par nous, avec nos étoiles, notre radio et notre fin par-dessus, en direct.**

### Les trois voies, jugées d'abord contre la barre

| | (a) 3D temps réel, modèles CC0 | (b) Plans vidéo générés par IA | (c) Autres hybrides |
|---|---|---|---|
| **Ce qu'on voit sur un téléphone moyen** | Des voitures-jouets à facettes sur une avenue de cubes, fluides à 60 images par seconde. Propre, bien cadré, mais c'est l'image d'un jeu mobile gratuit. | Une image de film : carrosserie mouillée, reflets des gyrophares sur le bitume, brume, longue focale. 24 images par seconde, comme au cinéma. | Voir plus bas. |
| **Atteint « digne des plus grands studios » ?** | **Non.** Les kits CC0 (Kenney) sont dessinés pour des jeux de plateau. Ce qui fait une image de studio (modèles sur mesure, matières, éclairage, animation, fumée, reflets) demande des artistes et des semaines, et un téléphone moyen ne le calcule pas en direct. Le langage de film (coupes, focales, ralenti) améliore la mise en scène, pas la matière de l'image. | **Oui, si on trie sévèrement.** On ne garde que 28 images (1,2 s) de chaque plan de 5 à 8 s : la coupe courte cache les défauts des outils. | Non pour les variantes regardées. |
| **Poids à télécharger** | Three.js (déjà là) + environ 1,5 Mo de modèles. | Environ 3,4 Mo en 720p (plafond 4 Mo), 1,6 Mo en 540p pour les connexions lentes. L'ascenseur actuel pèse 11 Mo. | |
| **Charge pour le téléphone** | Dépend du GPU : à régler appareil par appareil. | Presque nulle : un flux H.264 720p, décodé par la puce vidéo de tous les téléphones. C'est la voie la plus sûre sur un téléphone faible. | |
| **Fonction du temps, calable** | Oui. | Oui : le temps du film est le temps de la vidéo ; `seek` et `hold` existent nativement. | |
| **Risque pour le 19 novembre** | Faible à construire, mais le risque réel est un troisième « non mais tu rigoles ». | Les plans de Jacques (cohérence de la voiture, délais), et la lecture vidéo sur iPhone en mode économie d'énergie (§5.5). | |
| **Ce que ça coûte à Jacques** | Rien. | Environ une journée de génération étalée sur trois jours, et des crédits d'outil vidéo (ordre de grandeur : quelques dizaines d'euros ; non vérifié). Plus, au besoin, 30 à 150 $ de machine louée (§1.2). | |
| **Le clip vertical à partager (§18.8)** | Demande un rendu de la scène 3D, lent sans carte graphique. | Presque gratuit : ffmpeg recolle les plans et pose les étoiles, côté serveur, en quelques secondes. | |

**Pourquoi pas (a), le penchant de départ.** Ses deux avantages sont réels : elle ne dépend pas de Jacques, et tout reste calculé. Mais elle échoue sur le seul critère qui compte maintenant. Une 3D à facettes bien éclairée serait la poursuite 2D refusée, avec de la profondeur : mieux, pas un film. On ne la choisit pas.

**Les hybrides regardés et écartés.**
- *3D pour la poursuite, vidéo pour la fin* : deux matières d'image dans un film de dix secondes, ça se voit à la coupe.
- *3D pré-rendue par nous* (Blender ou autre) : avec une machine louée le calcul n'est plus l'obstacle, mais ce qui manque est le travail d'artistes (modèles, matières, animation, éclairage) ; sans eux, le rendu le plus long du monde reste celui de (a).
- *Les décors peints animés en parallaxe* : c'est léger et c'est le style du site, mais c'est encore « de la 2D qui bouge », ce que Jacques a refusé.
- *Vidéo peinte* (animer nos illustrations en aplats avec l'outil vidéo) : les outils vidéo font trembler les aplats ; ils sont bien meilleurs en image de film. Et l'univers de référence fait la même chose que nous : des illustrations peintes autour, une image de film dedans.

**Ce que (b) nous oblige à accepter, dit franchement.**
- **Le film est le même pour tous les joueurs d'un même niveau.** Ce qui est personnel : le nombre d'étoiles (donc la longueur du film), les six lignes de radio qui citent ses faits, l'arrêt sur image à son nom et à son niveau, et la fiche qui se pose sur son lieu du crime.
- **Une seule lumière pour la poursuite : l'heure bleue.** Le profil n'est connu qu'à la fin de l'attente : on ne peut pas précharger « sa » lumière. Et gyrophares, projecteurs et ville allumée ne se lisent que de nuit. Les quatre lumières reviennent à l'arrêt sur image et à l'atterrissage (§3.1).
- **Jacques est sur le chemin critique.** D'où l'ordre de livraison par lots et le plan de repli du §1.1.

### 1.1 Ce qu'on met en ligne le 19 novembre si les plans sont en retard

- **Date butoir : lundi 16 novembre au soir.** À cette date, il faut au moins le **lot 1 et le lot 2** validés (FIN, OUVERTURE, plans ★ à ★★★★ : six plans, §7.9).
- **Butoir tenue** : le film devient la révélation par défaut. Si les plans ★★★★★, ★★★★★★ ou FIN6 manquent encore, les fiches à 5 et 6 étoiles jouent une deuxième fenêtre des plans déjà validés (sans hélicoptère ni avion) et la fin commune ; les vrais plans se déposent plus tard sans toucher au code (un fichier, un script, un déploiement).
- **Butoir manquée** : **la poursuite 2D peinte (§18.33) est la révélation du 19 novembre.** Elle est construite, testée, ne pèse rien. Ce n'est pas le film que Jacques veut ; c'est ce qui marche ce jour-là. Le film passe par défaut dès qu'il est validé, en changeant une constante (`DEFAULT_SCENE`). L'ascenseur 3D ne revient pas.

### 1.2 Ce qu'une machine louée ouvre

Le calcul n'est plus une contrainte : Jacques louera une machine avec carte graphique. La règle « rien de lourd sur le Mac » ne décide plus de rien dans ce document.

**Ce que ça ouvre**
- **Des modèles vidéo ouverts, lancés chez nous** (les familles Wan, LTX-Video et HunyuanVideo, pilotées par ComfyUI). Ils n'ont pas de filtre : c'est la sortie de secours pour les plans que les générateurs hébergés refusent ou adoucissent (les tirs, §7.8).
- **Autant de prises qu'on veut par plan** : le coût devient du temps de machine, plus des crédits.
- **Une voiture cohérente par entraînement** : un petit modèle d'appoint (LoRA) appris sur vingt à quarante images de la voiture du suspect, ou un conditionnement par images de référence, de profondeur et de première et dernière image.
- **Agrandissement et interpolation** : passer les prises retenues de 720p à 1080p, et doubler ou quadrupler les images pour un vrai ralenti à la fin.
- **Des plans plus longs** que les 5 à 8 s des outils hébergés, utiles pour le clip à partager (§18.8).

**Ordres de grandeur** (relevés sur le web le 10 novembre 2026, à revérifier le jour de la location)
- Une carte de 24 Go (RTX 4090) : 0,35 à 0,75 $ l'heure. Une 32 Go (RTX 5090) : 0,5 à 1,2 $. Une 80 Go (A100, H100) : 1,2 à 4 $.
- Une prise de 5 s en 720p : de quelques minutes à un quart d'heure selon le modèle et la carte (estimation, non mesurée).
- Installation, modèles (des dizaines de Go) et premiers essais : une demi-journée à une journée.
- Tout le film avec six prises par plan, agrandissement compris : 20 à 40 heures de machine, soit **30 à 150 $**.

**Ce qui reste mieux sur un générateur hébergé**
- **Le réalisme et la physique des véhicules** : les meilleurs modèles hébergés gardent une longueur d'avance sur les modèles ouverts, et « très réaliste » est la barre.
- **Zéro installation** : la première prise sort en cinq minutes.
- **Le son d'ambiance** généré avec l'image.

**Décision.** Les générateurs hébergés pour tous les plans qu'ils acceptent. La machine louée pour trois choses : les plans refusés ou adoucis, l'agrandissement et l'interpolation des prises retenues, et l'entraînement de la voiture si la cohérence ne tient pas. Son installation ne doit pas se trouver sur le chemin du 16 novembre : elle se fait en parallèle du lot 1.

---

## 2. Le storyboard

### 2.1 Les règles du film

- **Format** : vertical 9:16, 24 images par seconde. Toutes les durées se comptent en images.
- **Très réaliste.** Une image de film tourné en vrai, dans la grammaire des grandes bandes-annonces de jeux de braquage : un conducteur qui prend peur, des policiers qui descendent et tirent, une montée qui devient dangereuse.
- **Le début est le même pour tous, et il est calme.** Une balade de nuit, puis une seule voiture de patrouille, loin dans le rétroviseur. Ensuite chaque étoile ajoute des poursuivants, du danger, de la vitesse, du tremblé de caméra et du bruit. **La montée doit se lire son coupé** : c'est le contraste entre le début et le sommet qui fait le film.
- **Un plan par étoile, une coupe franche à chaque étoile.** L'étoile claque sur la coupe.
- **Le film s'arrête au niveau de la personne, par son arrestation** : la voiture est cernée et s'immobilise, les mains se lèvent derrière le pare-brise, l'image gèle, et cette image devient la fiche. La fiche est la photo d'identité.
- **Sens de l'action** : l'ouverture suit la voiture de dos ; ensuite elle vient vers nous ou descend dans le cadre, et on voit ce qui arrive derrière elle.
- **Le conducteur, c'est n'importe qui.** Il doit valoir pour toute personne qui reçoit une fiche : capuche relevée, gants de cuir noirs, toujours de dos ou en ombre. Aucune peau, aucun cheveu, aucun trait, donc ni genre, ni âge, ni couleur de peau à lire. **Pas d'yeux dans le rétroviseur** : le rétroviseur montre les gyrophares. Sa peur passe par les mains qui se crispent, la tête qui se tourne d'un coup, la voiture qui bondit.
- **Les policiers sont des silhouettes** à contre-jour, sans visage lisible, sans insigne.
- **On tire, personne n'est touché.** Éclairs de tir, étincelles sur la carrosserie, un rétroviseur qui vole. **Ni sang, ni blessé, ni corps au sol, personne n'est renversé** : le film se regarde sur LinkedIn, sur un téléphone, en public.
- **Les avions ne tirent pas** : ni missile, ni explosion. Une explosion en ville se lit comme une image de guerre, pas comme un film de braquage, et les générateurs la ratent.
- **Pas de carambolage** : aucun véhicule n'en percute un autre. Ce n'est pas une pudeur, c'est de la qualité : les générateurs déforment les tôles.
- **Un toucher passe le film** (bouton « Passer » et toucher de l'image). **Rien ne joue en mouvement réduit** : la fiche sort directement, ses étoiles s'allument une à une (comportement actuel).

| Niveau | Plans joués | Images | Durée |
|---|---|---|---|
| ★ | OUV, P1, FIN | 112 | 4,7 s |
| ★★ | OUV, P1, P2, FIN | 140 | 5,8 s |
| ★★★ | OUV, P1 à P3, FIN | 168 | 7,0 s |
| ★★★★ | OUV, P1 à P4, FIN | 196 | 8,2 s |
| ★★★★★ | OUV, P1 à P5, FIN (ou FIN5 s'il existe) | 224 | 9,3 s |
| ★★★★★★ | OUV, P1 à P6, FIN6 | 284 | 11,8 s |

OUV : 24 images. P1 à P5 : 28 images chacun. P6 : 40 images. FIN et FIN5 : 60 images (36 de vidéo, 14 d'arrêt sur image, 10 de flash). FIN6 : 80 images (56, 12, 12). **Ces comptes n'ont pas changé.**

**La courbe, d'un seul regard.** Chaque ligne doit être plus forte que la précédente.

| Plan | À ses trousses | Danger | Vitesse | Caméra | Bruit |
|---|---|---|---|---|---|
| OUV | personne | aucun | balade | sur rail, parfaitement stable | moteur au ralenti, pneus sur le mouillé |
| P1 ★ | 1 patrouille, dans le rétro | la peur : les mains se crispent | la voiture bondit à la fin du plan | stable, dans l'habitacle | un seul coup de sirène, le moteur s'emballe |
| P2 ★★ | 2 patrouilles | la fuite | elle accélère franchement | drone fluide, qui avance et tourne | deux sirènes, la pulsation commence |
| P3 ★★★ | 3 patrouilles, un barrage | **ils tirent** : éclairs, étincelles sur le capot | pleine vitesse | fixe, puis la première secousse | tirs secs, plots, souffle |
| P4 ★★★★ | 3 patrouilles et un fourgon | ça tire en roulant, un rétroviseur vole | pleine vitesse | longue focale, tremblé continu | un mur de sirènes, tirs |
| P5 ★★★★★ | les mêmes, plus un hélicoptère | repéré du ciel | pleine vitesse | à l'épaule, secouée par le rotor | le rotor couvre tout |
| P6 ★★★★★★ | une colonne, trois hélicoptères, deux avions de chasse | toute une armée | pleine vitesse | grue qui s'envole, secousse violente au passage des avions | tout, puis le tonnerre des réacteurs |

Le site appuie la courbe en direct : la secousse de l'image à chaque étoile grandit avec le niveau (rien à ★, 2 px à ★★, puis 3, 5, 6 et 8 px à ★★★★★★), et la bande-son empile une couche par étoile (§6, T3).

**Filmer des gens et des armes avec les générateurs d'aujourd'hui.** Ils sont faibles sur les visages, les mains et les armes. Pour que ça reste une image de studio :
1. **Jamais de visage** : de dos, en ombre, à contre-jour devant des phares, derrière un pare-brise plein de reflets.
2. **Des gants, pas des mains** : une main gantée de noir sur un volant pardonne un doigt raté.
3. **On ne cadre pas l'arme, on cadre ce qu'elle fait** : l'éclair qui éclaire une silhouette, les étincelles sur la tôle, la vitre qui s'étoile.
4. **Les policiers restent loin** : jamais à moins de dix mètres de la caméra, jamais au centre.
5. **Des plans courts** : 1,2 s. Un défaut n'a pas le temps d'exister.

### 2.2 Le HUD, sur tout le film

Deux bandes d'encre `#0c0d1b` encadrent l'image, comme les bandes noires d'un film. Elles sont de la couleur exacte de la page : le film est une fenêtre dans le site.

- **Bande du haut** (9 % de la hauteur, plus l'encoche : 76 px à 844, 58 px à 640) : les six étoiles, centrées, 26 px. Allumée : crème mat `#fff9cb`. Éteinte : pleine, marine `#243152`. Une étoile qui s'allume passe de 1,5 à 1 en 5 images. Aucune lueur.
- **Bande du bas** (12 % : 101 px à 844, 77 px à 640) : la ligne de radio en JetBrains Mono 500, 13 px, capitales, crème, précédée d'un carré de 6 px corail puis lilas en alternance ; une seule ligne, coupée par des points de suspension au-delà de 350 px. Dessous, à droite : « Passer » et le bouton du son, 44 px de haut.
- Les bandes se ferment en 8 images à l'ouverture et s'ouvrent au flash.

Les six lignes de radio sont celles de `shared/chase/radio.ts`, inchangées. Exemple pour une fiche : « Véhicule en fuite · Backend », « Arme signalée : Python », « Motif : push sur main le vendredi soir », « Affiliation : Doctolib », « Profil identifié : Pyromane », « Toutes les unités · Priorité absolue », et à la fin « Fin de course · Haute surveillance ».

### 2.3 Plan par plan

**OUV — La balade** (24 images, 1,0 s)
- *Cadre* : on suit la voiture du suspect de trois quarts dos, à 1,5 m du sol et quelques longueurs derrière elle, 35 mm. L'avenue vide file vers l'horizon corail, palmiers et hôtels Art déco des deux côtés.
- *Caméra* : comme sur un rail, aucune secousse.
- *Action* : rien. Elle roule tranquille, les reflets des lampadaires glissent sur sa carrosserie et sur le bitume mouillé.
- *Son* : moteur au ralenti, chuintement des pneus sur le mouillé. Pas de pulsation.
- *HUD* : les bandes se ferment, six étoiles éteintes. Radio muette.

**P1 ★ — Le rétro** (28 images)
- *Cadre* : dans l'habitacle, par-dessus l'épaule droite du conducteur, depuis la banquette arrière, 28 mm. Au premier plan, flous, sa capuche de dos et ses mains gantées posées sur le volant. Devant, l'avenue calme. En haut au milieu, le rétroviseur.
- *Caméra* : fixe dans la voiture.
- *Action* : dans le rétroviseur, loin, un gyrophare s'allume, corail et violet ; ses couleurs se mettent à battre sur le plafond et sur la capuche. La tête se tourne d'un coup vers le rétro, les mains sursautent et se crispent sur le volant, la voiture bondit : dehors, les palmiers se mettent à filer.
- *Comment ça tient* : ni visage ni peau, des gants, un seul geste. C'est le plan le plus sûr avec des gens.
- *Son* : un seul coup de sirène, bref ; le cuir des gants ; le moteur qui s'emballe. Clac de l'étoile quand le gyrophare s'allume.
- *HUD* : étoile 1. Radio : « Véhicule en fuite · {poste} ».

**P2 ★★ — Vue du ciel** (28 images)
- *Cadre* : plongée totale, drone à 30 m, 35 mm. L'avenue est verticale dans le cadre, les couronnes des palmiers passent sous la caméra.
- *Caméra* : avance avec les voitures et tourne lentement de 10°. Fluide, mais ça va vite.
- *Action* : le suspect accélère, une gerbe d'eau derrière lui. Deux patrouilles le suivent en V ; leurs gyrophares posent des flaques corail et violet sur le bitume mouillé.
- *Son* : le moteur monte, deux sirènes désaccordées, la pulsation grave commence.
- *HUD* : étoile 2. Radio : « Arme signalée : {langage} ».

**P3 ★★★ — Le barrage** (28 images)
- *Cadre* : caméra à 30 cm du sol, 24 mm, **derrière** le barrage, tournée vers la voiture qui arrive. À gauche et à droite du cadre, deux patrouilles garées en biais, portières ouvertes ; entre elles, une ligne de plots orange. Derrière chaque portière, un policier accroupi, **de dos**, découpé en noir par les phares du suspect.
- *Caméra* : fixe, puis la première secousse du film.
- *Action* : ils ouvrent le feu : des éclairs blancs éclairent leurs silhouettes, des étincelles éclatent sur le capot. La voiture ne ralentit pas, traverse les plots, frôle l'objectif. Les policiers se baissent. Personne n'est touché, aucune tôle ne se touche.
- *Comment ça tient* : les policiers sont de dos et à contre-jour, les armes ne se voient que par leur éclair, et les phares du suspect brûlent le centre de l'image.
- *Son* : trois coups secs, les plots, le souffle du passage.
- *HUD* : étoile 3. Radio : « Motif : {chef d'accusation} ».

**P4 ★★★★ — La meute** (28 images)
- *Cadre* : très longue focale (200 mm), caméra loin devant, à 1,5 m. La compression empile tout : le suspect en bas, et derrière lui, serrés, trois patrouilles et un fourgon plus haut qu'elles.
- *Caméra* : zoom avant lent, tremblé continu de longue focale, brume.
- *Action* : le fourgon force le passage au milieu. Des éclairs de tir clignotent aux fenêtres des poursuivants, des étincelles ricochent sur le bitume autour du suspect, un de ses rétroviseurs s'arrache.
- *Comment ça tient* : à 200 mm, les tireurs font quelques pixels ; on ne voit que des points de lumière.
- *Son* : moteur plus grave du fourgon, quatre sirènes, tirs.
- *HUD* : étoile 4. Radio : « Affiliation : {affiliation} ».

**P5 ★★★★★ — Le projecteur** (28 images)
- *Cadre* : contre-plongée depuis le trottoir, entre deux troncs de palmiers, 28 mm.
- *Caméra* : à l'épaule, panoramique vers le haut, secouée par le souffle du rotor.
- *Action* : un hélicoptère monte au-dessus des toits Art déco ; son projecteur balaie la brume, croise l'objectif (deux images presque blanches) et se pose sur la voiture qui passe.
- *Son* : le battement du rotor arrive et couvre les sirènes.
- *HUD* : étoile 5. Radio : « Profil identifié : {profil} ».

**P6 ★★★★★★ — Toute la ville** (40 images)
- *Cadre* : grand plan aérien, 24 mm.
- *Caméra* : grue qui monte et recule au-dessus de l'avenue ; elle tremble violemment au passage des avions.
- *Action* : le suspect en tête d'une colonne de gyrophares jusqu'à l'horizon ; trois hélicoptères en formation, trois faisceaux croisés sur lui ; toutes les fenêtres de la ville allumées. Deux avions de chasse arrivent du fond, en rase-mottes dans l'axe de l'avenue, et passent en trombe au-dessus de tout ; les palmiers se couchent. Les avions ne tirent pas.
- *Son* : tout joue, trois rotors, puis le tonnerre des réacteurs.
- *HUD* : étoile 6. Radio : « Toutes les unités · Priorité absolue ».

Les feux d'artifice du §18.33 sortent du film : les avions les remplacent comme événement du ciel, et une fête ne va pas avec une arrestation.

**FIN — L'arrestation** (60 images, niveaux ★ à ★★★★★)
1. *L'arrêt* (36 images, la vitesse passe du normal au ralenti). Cadre serré : caméra fixe à 20 cm du sol, 35 mm, sur une esplanade vide sous un seul lampadaire. La voiture du suspect finit de freiner vers nous, le nez plonge, la fumée de pneus la dépasse. Au premier plan, l'avant d'une voiture de patrouille, portière ouverte ; derrière la portière, un policier se redresse, silhouette noire, le bras tendu vers le suspect ; le projecteur de bord se pose sur la voiture. Tout autour, hors champ, des lueurs corail et violet battent dans la brume. **Derrière le pare-brise plein de reflets, deux mains gantées se lèvent.** Personne ne tire, aucune portière du suspect ne s'ouvre. Son : crissement long qui descend, les sirènes se taisent une à une.
2. *L'arrêt sur image* (14 images). L'image gèle sur la dernière image. Elle passe en deux tons (ombres prune, lumières de la teinte du profil, §3.1), les traits de la toise passent par-dessus, une plaque d'encre porte « @pseudo », et le niveau claque en Barlow Condensed 700, 56 px, crème (« HAUTE SURVEILLANCE »). **L'image gelée est la photo d'identité : elle devient la fiche.** C'est aussi le traitement des visages de la couverture (§18.31). Dans la bande du haut, l'étoile suivante clignote deux fois et reste éteinte. Radio : « Fin de course · {niveau} ». Son : déclic d'appareil photo, puis silence complet.
3. *Le flash* (10 images, dont 4 de silence). Crème `#fff9cb` plein écran, les bandes s'ouvrent. Au sommet du flash, la fiche est posée (le passage de relais existant), sur le ciel peint de son lieu du crime (§18.29).

**Le bon nombre de poursuivants dans la fin, sans tourner cinq fins.** Le cadre serré règle le problème honnêtement : **une seule voiture de patrouille et un seul policier sont visibles**, ce qui est exact à une étoile ; au-dessus, les autres sont **suggérés, pas comptés**, par les lueurs hors champ. Le niveau est porté par ce que le site pose en direct : les étoiles, le nombre de sirènes qui se taisent, le mot du niveau. Coût pour Jacques : **aucun plan de plus**.
- *Sa limite* : à cinq étoiles, l'hélicoptère ne se voit pas dans la fin.
- *FIN5, en option (un plan de plus)* : la même image clé que FIN avec une phrase ajoutée, un faisceau de projecteur qui tombe du haut du cadre sur la voiture. Même durée (36 images), fichier `fin5`. S'il est livré, le niveau ★★★★★ le joue ; sinon il joue FIN. À ne tourner qu'une fois tout le reste validé.

**FIN6 — L'armada** (80 images, niveau ★★★★★★ seulement)
1. *Le temps s'arrête* (56 images). La voiture vient de s'immobiliser au centre de l'esplanade, **encerclée par tout** : un anneau de patrouilles et le fourgon, nez vers elle, portières ouvertes, et derrière chaque portière une silhouette qui la tient en joue ; trois faisceaux d'hélicoptère croisés sur elle ; dans le ciel, les deux avions de chasse saisis en plein passage, très bas ; toutes les fenêtres allumées. Le temps est gelé : fumée de pneus et gouttes d'eau suspendues, gyrophares figés. **La caméra, elle, continue** : elle tourne de 120° autour de la voiture au ras du sol, passe devant les silhouettes, et finit de trois quarts face : derrière le pare-brise, deux mains gantées levées. Son : tout se tait sauf une note tenue et un battement de rotor ralenti.
2. *L'arrêt sur image* (12 images) : deux tons prune et crème, « PRIORITÉ ABSOLUE », les six étoiles.
3. *Le flash* (12 images) : plus long, et la fiche se pose avec son contour éclairé par l'arrière (réservé à ce niveau, §18.18).

Les avions sont donc dans les deux : dans P6 ils arrivent et passent, dans FIN6 ils sont figés au-dessus de l'arrestation.

Ce qui rend le six étoiles impossible à confondre : le seul plan aérien de toute la ville, les trois hélicoptères, les avions de chasse, et l'orbite à temps gelé autour de l'armada, qui n'existe dans aucun autre niveau.

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

**Dans l'image**, le film a droit à ce qu'une caméra enregistre : lumière des phares et des gyrophares, éclairs de tir et étincelles, reflets sur le bitume mouillé, brume, faisceaux des projecteurs, faible profondeur de champ, grain. Sont interdits même dans l'image : le néon, la grille et le soleil rayé de la synthwave, l'effet VHS, le duo magenta et cyan.

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
| Secousse à chaque étoile | translation de l'image sur 4 images, de 0 px à ★ jusqu'à 8 px à ★★★★★★ (§2.1) | nul |
| Deux tons de l'arrêt sur image | filtre CSS et deux aplats en mélange, sur une image fixe | une seule composition |
| Flash | un aplat crème en opacité | nul |
| Vibration | une impulsion par étoile, une longue au flash (`web/src/lib/haptics.ts`, Android) | nul |

Le grain n'est pas gravé dans les fichiers : il gonflerait le débit pour rien.

---

## 4. Les assets

### 4.1 Ce que le film utilise

| Asset | Source | Licence | Poids |
|---|---|---|---|
| 9 plans vidéo (OUV, P1 à P6, FIN, FIN6), plus FIN5 en option | générés par Jacques (§7) | la nôtre, sous réserve des conditions de l'outil : abonnement qui autorise l'usage commercial, sans filigrane | originaux hors dépôt, `Azerit/design/film/` |
| `poursuite-720.mp4` (OUV + P1 à P6, 8,5 s) | montage ffmpeg | idem | environ 2,3 Mo, plafond 2,8 Mo |
| `fin-720.mp4` (1,5 s) | idem | idem | environ 0,4 Mo, plafond 0,6 Mo |
| `fin6-720.mp4` (2,3 s) | idem | idem | environ 0,65 Mo, plafond 1,0 Mo |
| `fin5-720.mp4` (1,5 s), **en option** | idem | idem | comme `fin` |
| Les trois mêmes en 540p | idem | idem | 45 % des précédents, 1,8 Mo en tout au plus |
| `affiche.jpg` (première image, 720 × 1280) | extraite du montage | idem | 60 Ko au plus |
| Barlow Condensed, Outfit, JetBrains Mono | déjà servies (`server/fonts`) | SIL OFL | rien de plus |
| Décors peints des profils | déjà là (`web/public/profiles/`) | les nôtres | rien de plus |
| Sons | synthétisés (Web Audio), aucun fichier ; en option l'ambiance extraite des plans (`ambiance.m4a`, 150 Ko) | les nôtres | 0 à 150 Ko |

Les poids sont des budgets, pas des mesures : ils se vérifient sur les vrais plans. Total à charger pour un joueur : 3,4 Mo en 720p (4 Mo au plus), `fin6` seulement s'il a six étoiles, `fin5` (s'il existe) seulement s'il en a cinq, à la place de `fin`.

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

- **Deux balises `<video muted playsinline>`**. A joue `poursuite.mp4` (toujours le fichier complet à six étoiles). B porte la fin, calée sur sa première image : `fin` de ★ à ★★★★★, `fin6` à ★★★★★★, et `fin5` à ★★★★★ si ce fichier en option existe (une table par niveau dans `shared/film/cut.ts`, avec repli sur `fin`).
- **La coupe au niveau de la personne** : quand A atteint la dernière image de son dernier plan (suivi image par image avec `requestVideoFrameCallback`, sinon à chaque rafraîchissement), B démarre et passe devant, A s'arrête. Deux images d'encre couvrent la bascule : c'est une coupe, un à-coup de 80 ms ne s'y voit pas.
- **Fichiers chargés en entier avant de jouer** (`fetch` puis `Blob`) : aucune mise en mémoire tampon pendant le film, et pas besoin que le serveur gère les requêtes partielles.
- **Encodage** : H.264 profil Main, 720 × 1280, 24 i/s, une image clé toutes les 12 images (calage rapide), `+faststart`, sans piste son. Variante 540 × 960 servie si `saveData`, ou si la connexion annoncée est lente.
- **Ordinateur** : le film dans une colonne 9:16 centrée, haute comme la fenêtre (900 px au plus), sur l'encre.
- **Cadrage** : l'image remplit l'écran (`object-fit: cover`). Un téléphone en 390 × 844 est plus étroit que le 9:16 : 9 % de l'image sont rognés de chaque côté. D'où les zones du §7.3.

### 5.4 Le chargement pendant l'attente

1. Au geste qui lance la fiche (`EntryForm`, là où `unlockAudio` est déjà appelé) : les deux balises sont créées et débloquées par un `play()` suivi d'un `pause()`.
2. Dès l'attente : téléchargement en basse priorité de `poursuite` puis de `fin`. Une vraie fiche prend environ 24 s : il y a le temps.
3. Fiche prête : si elle a six étoiles, `fin6` se charge (0,65 Mo) ; à cinq étoiles, `fin5` s'il existe. La scène se dit prête (`onReady`) quand la première image est peinte : l'écran d'attente se lève (`web/src/lib/hold.ts`, inchangé).

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
  8. Lecture refusée (simulée) : la pilule « Ouvrir mon dossier » apparaît, un toucher lance le film. Film absent (fichier 404) : la poursuite 2D joue. `fin5` absent : `fin` joue à cinq étoiles, sans erreur.
  9. `__film.stats()` : 0 image perdue, bascule de 84 ms au plus, processeur ralenti 4 fois.
  10. Tests et typecheck passent.

### T2 — Le montage

- **Périmètre** : la chaîne qui transforme les prises de Jacques en trois fichiers ; d'abord des cartons de remplacement (un aplat par plan, avec son nom et son numéro d'image) pour que T1 avance ; puis les vrais plans, lot par lot, et l'étalonnage commun.
- **Fichiers** : `scripts/film-assemble.ts`, `scripts/film-contact.ts`, `tools/film/montage.json`, `web/public/film/*`. Lit `shared/film/cut.ts` sans le modifier.
- **Critères** :
  1. `npx tsx scripts/film-assemble.ts` produit les six mp4 (huit si `fin5` est livré) et l'affiche en moins de deux minutes sur le Mac ; `ffprobe` confirme 204, 36 et 56 images (36 pour `fin5`), 24 i/s, 720 × 1280 et 540 × 960, aucune piste son.
  2. Un plan absent de `design/film/plans/` est remplacé par son carton, sans erreur.
  3. Les poids tiennent dans les plafonds du §4.1 ; sinon le script baisse la qualité et le dit.
  4. À 390 px, dans le lecteur de T1 : aucun plan ne garde de bande noire, de filigrane ou de texte ; rien d'important sous les bandes ni dans les 9 % rognés de chaque côté.
  5. Côte à côte sur une planche, les neuf plans ont la même nuit : même ciel, mêmes ombres prune, gyrophares corail et lilas.
  6. Pour chaque prise reçue, une planche-contact et un avis écrit contre la grille du §7.10.
  7. Sur une planche des sept plans de poursuite dans l'ordre, la montée se lit sans le son : plus de poursuivants, plus de flou de vitesse et plus de tremblé à chaque plan ; OUV et P1 sont calmes.

### T3 — Le son, les vrais téléphones, le ménage

- **Périmètre** : la bande-son calée sur l'horloge du film ; la vérification sur de vrais appareils ; le réglage par défaut ; la suppression de l'ascenseur une fois le film validé ; le report au SPEC.
- **Fichiers** : `web/src/lib/filmSound.ts`, `web/src/i18n.ts` (libellés), `SPEC.md`, puis les suppressions du §5.7 et `package.json`.
- **La bande-son** (synthétisée, aucun fichier), une couche de plus par étoile, comme l'image (§2.1) : à l'ouverture, seulement le moteur au ralenti et les pneus sur le mouillé ; à ★, un seul coup de sirène bref et le clac ; à ★★, la pulsation grave à 100 battements par minute commence et le moteur monte ; ensuite une sirène de plus par renfort, désaccordée, un coup grave et le clac à chaque étoile, un souffle à chaque coupe ; des tirs secs à ★★★ et ★★★★ ; le rotor à ★★★★★ ; le tonnerre des réacteurs à ★★★★★★. À la fin : le crissement, les sirènes qui se taisent une à une, le déclic, quatre images de silence avant le flash, un accord tenu au flash. Si les plans de Jacques ont un son d'ambiance propre, il passe dessous (`ambiance.m4a`).
- **Critères** :
  1. Avec le son : chaque clac tombe sur sa coupe (à l'oreille et à 40 ms près sur un enregistrement) ; l'ouverture est presque silencieuse et chaque étoile sonne plus fort que la précédente ; silence complet juste avant le flash.
  2. Son coupé : aucun contexte audio créé. Sans geste : le film joue muet, sans erreur.
  3. Sur un iPhone et un Android, dans Safari ou Chrome et dans LinkedIn : le film part seul ou après la pilule, reste dans la page (pas de plein écran du système), 0 image perdue.
  4. `DEFAULT_SCENE` vaut `film` si la butoir du §1.1 est tenue, `chase` sinon.
  5. Après validation de Jacques : l'ascenseur est supprimé, le paquet de la page d'une fiche ne contient plus Three.js, tests et typecheck passent, le SPEC porte le paragraphe du §9.

---

## 7. Ce que Jacques doit fournir : le tournage

C'est le cœur du projet. **D'abord le test du §0 : deux images, dix minutes.** Ensuite seulement : neuf plans vidéo (un dixième en option), précédés de trois images de référence et de dix images clés (FIN6 en a deux). Tout se génère ; rien ne se dessine.

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
  - `cles/K-OUV.png`, `cles/K-P1.png` … `cles/K-FIN.png`, `cles/K-FIN6-A.png`, `cles/K-FIN6-B.png`
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
- Les hélicoptères (P5, P6) et les avions de chasse (P6, FIN6) restent **sous** les 12 % du haut, sauf quand les avions sortent du cadre à la fin de P6.

### 7.4 Le style

**En une phrase** : une image de grand film de braquage, tournée en vrai, à l'heure bleue juste après la pluie, dans une ville côtière Art déco, étalonnée indigo, prune, corail et crème.

- **Très réaliste.** De vraies voitures, une vraie rue, de vrais reflets. Ni dessin animé, ni rendu de jeu vidéo, ni aplats, ni voitures-jouets.
- **Toujours la même heure** : ciel indigo vers marine, une fine bande corail à l'horizon, bitume mouillé.
- **Gyrophares corail et violet**, jamais rouge et bleu : c'est notre signature. Si l'outil s'entête, on corrige la teinte au montage.
- **Rues sans passants ni circulation.** Les seules personnes du film sont le conducteur et les policiers.
- **Le conducteur** : capuche relevée, gants de cuir noirs, toujours de dos ou en ombre. Aucune peau, aucun trait.
- **Les policiers** : des silhouettes à contre-jour, loin de la caméra.
- **Une seule action et un seul mouvement de caméra par plan.**
- **Le film monte.** OUV est calme, P1 commence calme : vitesse de balade, caméra stable, rue tranquille. Chaque plan suivant va plus vite, tremble plus et montre plus de monde. Une prise d'OUV où ça fonce déjà est à jeter, même belle.

### 7.5 Ce qui reste interdit

Les interdits sur les personnes et sur les tirs sont levés. Ceux-ci tiennent :

- **Dans les prompts : aucun nom de jeu, de studio, de ville réelle ou de police réelle, et jamais « dans le style de ».** Ne téléverser aucune image d'un jeu ni d'un film existant.
- **Rien qui vienne d'un jeu** : ni marque, ni logo, ni personnage, ni carte, ni véhicule, ni fichier.
- **Aucune personne réelle** : pas de visage qui ressemble à quelqu'un. Chez nous il n'y a pas de visage du tout.
- **Des voitures, des hélicoptères et des avions d'un dessin inventé**, sans écusson, sans cocarde, sans numéro.
- **Ni sang, ni blessé, ni corps au sol.** Personne n'est touché, personne n'est renversé.
- **Ni missile, ni explosion, ni incendie** : les avions passent, ailes nues.
- **Aucun texte** : ni « POLICE », ni enseigne, ni plaque lisible, ni numéro sur un toit. Les outils écrivent mal, et le site est bilingue.
- **Aucune interface** : pas d'étoiles, de carte, de jauge ni de bandes dans l'image. C'est nous qui les posons.
- **Pas de synthwave** : néon, grille, soleil rayé, effet VHS.
- **Pas de feux d'artifice** (ils étaient au §18.33, ils sortent du film).

### 7.6 La méthode : trois références, puis une image clé par plan, puis la vidéo

La cohérence (même voiture, même ville, même lumière dans les neuf plans) vient de l'ordre de travail, pas de la chance.

1. **Générer les trois références** (images fixes, §7.7) avec ton outil d'images habituel. Nous les valider avant d'aller plus loin : elles fixent tout le reste.
2. **Pour chaque plan, générer son image clé** (une image fixe 9:16 : la première image du plan), en joignant R1, R2 et R3 comme images de référence, avec la phrase : `Use the attached images as references: exactly the same hero car as in image 1, the same pursuit vehicles as in image 2, the same avenue, light and colour grade as in image 3.`
3. **Animer chaque image clé** dans l'outil vidéo, en mode *image vers vidéo* (l'image clé comme première image), avec le prompt de MOUVEMENT du plan.
4. **Quatre prises par plan.** Déposer toutes celles qui passent la grille du §7.10.

On valide les images clés avant de dépenser des crédits vidéo : une image clé ratée donne quatre prises ratées.

### 7.7 Les prompts

En anglais : les outils suivent mieux. Pour une **image** : coller LOOK, puis les blocs utiles (véhicules, personnes), puis l'IMAGE CLÉ du plan, puis SANS. Pour une **vidéo** : joindre l'image clé, coller MOUVEMENT, puis SANS. Quand un prompt a une **variante douce**, elle sert si l'outil refuse (§7.8).

#### LOOK (dans chaque prompt d'image)

```
Photorealistic live-action film frame from a big-budget crime thriller, shot on location with a large-format digital cinema camera and anamorphic lenses: real cars, real streets, practical lighting, natural reflections and motion blur, shallow depth of field, fine film grain. Not CGI, not an illustration, not a video game. A fictional subtropical coastal city with pastel art deco low-rise hotels with rounded corners and tall palm trees. Blue hour just after rain: the sky runs from deep indigo (#4b4fb8) at the top to navy (#243152), with a thin coral-orange band (#ff6a3d) along the horizon. The wet asphalt mirrors the sky and every light. Shadows are deep plum (#4b2f54) and navy, never pure black. Windows and streetlamps glow warm amber (#ffc36b). The streets are empty of bystanders and of other traffic. Colour grade in indigo, plum, coral and cream, slightly saturated, soft contrast, light haze in the distance. Vertical 9:16 frame. Keep the top 12% and the bottom 15% of the frame free of anything important, and keep the main subject inside the central 80% of the width.
```

#### VÉHICULES

```
HERO CAR: a late-1980s two-door sports coupe of an invented design that matches no real car model, low and wedge-shaped, dark plum metallic paint (#4b2f54) beaded with rain, plain rectangular headlights glowing warm cream (#fff9cb), dark tinted side windows, no badge, no stripes, no stickers, a blank licence plate.
```

```
PURSUIT CARS: full-size four-door police sedans of an invented design, two-tone navy and cream bodywork with no lettering, no emblem and no numbers, dark tinted windows, a roof light bar flashing coral-orange (#ff6a3d) and violet (#8d8cf0), never red and blue.
```

```
PURSUIT VAN: a tall boxy police van in the same navy and cream two-tone, no lettering, the same coral-orange and violet roof light bar, clearly taller than the sedans.
```

```
HELICOPTER: a light helicopter of an invented design, dark navy, no markings and no numbers, a single searchlight under its nose throwing a cream-white beam that is visible in the haze.
```

```
FIGHTER JETS: twin-engine military jets of an invented design that matches no real aircraft, matte dark grey, no markings, no roundels, no numbers, clean wings with nothing mounted under them, engines glowing warm orange.
```

#### PERSONNES

```
THE DRIVER: seen only from behind or as a dark shape, never the face. A figure in a dark hooded jacket with the hood up and black leather driving gloves, so that no skin, no hair and no facial feature is ever visible.
```

```
OFFICERS: figures in plain dark uniforms and caps with no insignia, no lettering and no badge, seen only as black backlit silhouettes against headlights and light bars, far from the camera, never a readable face.
```

#### SANS (à la fin de chaque prompt, image ou vidéo)

```
No blood, no wounds, no injured or fallen bodies: nobody is ever hit and nobody is run over. No readable face and no bare skin: people appear only from behind or as backlit silhouettes. No close-up of a weapon. No missiles, no explosions, no fire, no crashes between vehicles. No bystanders. No text, no letters, no numbers, no logos, no brands, no real police insignia, no readable signs, no readable licence plates, no watermark, no subtitles. No user interface, no HUD, no stars, no minimap, no letterbox bars, no borders, no split screen. No red and blue lights. No neon, no VHS effect, no fireworks. Not a cartoon, not an illustration, not CGI, not a video game render, no plastic-looking skin, no toy-like cars.
```

#### Les trois références

**R1 — la voiture** (image 16:9)
```
[LOOK without its last two sentences] [HERO CAR] Reference sheet of the hero car alone on wet asphalt at blue hour, four views of the same car side by side: three-quarter front, three-quarter rear, exact side profile, and directly from above. Neutral framing, the whole car visible in each view.
```

**R2 — les poursuivants** (image 16:9)
```
[LOOK without its last two sentences] [PURSUIT CARS] [PURSUIT VAN] [HELICOPTER] [FIGHTER JETS] Reference sheet at blue hour: one police sedan in three-quarter front view and from directly above, the police van in three-quarter front view, the helicopter hovering in side view, and one fighter jet in flight seen from the side and from below. All light bars lit, coral-orange and violet.
```

**R3 — l'avenue** (image 9:16) : c'est le plan maître, celui qui fixe la ville et la lumière.
```
[LOOK] The master shot of the film's location: a long straight four-lane seafront avenue seen from the middle of the road at eye level, vanishing toward the coral horizon. Tall palm trees line both sides, behind them pastel art deco hotels with warm amber windows, a few streetlamps reflected in the wet road. Completely empty: no vehicles and no people at all.
```

#### Les plans

Les neuf plans à tourner, dans l'ordre du film, puis FIN5 en option.

**OUV — La balade** (calme : c'est le plan le plus lent du film)

Image clé :
```
[LOOK] [HERO CAR] Calm rear three-quarter follow shot, 35 mm lens, camera 1.5 metres above the road and a few car lengths behind the hero car. The hero car cruises unhurried along the empty avenue, in the lower-middle of the frame, its soft tail lights reflected on the wet asphalt. The avenue stretches ahead to the coral horizon between two rows of palm trees and softly lit art deco hotels. A quiet, peaceful late-night drive: no other vehicle anywhere.
```
Mouvement :
```
Perfectly smooth, stable follow shot, as if on a rail: no camera shake at all. The plum coupe cruises at a relaxed, steady pace along the empty avenue. Streetlamp reflections glide slowly over its bodywork and over the wet road, palm fronds sway gently. Nothing else happens: a quiet late-night drive.
```

**P1 ★ — Le rétro** (la peur)

Image clé :
```
[LOOK] [HERO CAR] [THE DRIVER] Interior of the hero car at night, seen over the driver's right shoulder from the back seat, 28 mm lens. In the foreground, slightly out of focus, the dark hooded shape of the driver from behind; both black-gloved hands rest loosely on the steering wheel. Through the windscreen, the calm empty avenue ahead, palm trees and amber streetlamps. In the rear-view mirror, in the upper-middle of the frame, the dark road behind and the headlights of one single distant car. No face and no skin visible anywhere, the mirror shows no eyes. The dashboard dials are dark and unreadable.
```
Mouvement :
```
The camera holds steady inside the car. In the rear-view mirror, far behind, a roof light bar suddenly switches on, flashing coral-orange and violet, and its colours start to pulse on the ceiling of the car and on the driver's hood. The driver's head snaps toward the mirror, the gloved hands flinch and clamp hard on the steering wheel, and the car surges forward: outside, the palm trees start to rush past. We never see the driver's face or eyes.
```

**P2 ★★ — Vue du ciel** (ça accélère)

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] Top-down aerial shot from a drone 30 metres directly above the avenue, 35 mm lens. The avenue runs vertically through the frame, palm tree crowns along both edges. The hero car is in the lower third, driving fast toward the bottom of the frame, a plume of water spray behind it. Behind it, higher in the frame, two police sedans follow in a V formation, their light bars casting coral-orange and violet pools of light on the wet asphalt.
```
Mouvement :
```
The drone flies along with the cars, looking straight down, and slowly rotates about ten degrees; its movement is fluid. The plum coupe accelerates hard toward the bottom of the frame, throwing up water spray; the two police sedans speed up after it and hold their V formation. Light pools slide quickly over the wet road, palm crowns rush past under the camera.
```

**P3 ★★★ — Le barrage** (ils tirent, première secousse)

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] [OFFICERS] Low angle 30 cm above the road, 24 mm wide lens, looking down the avenue from behind a roadblock. Two police sedans are parked at an angle on the left and on the right of the frame, doors open, leaving a gap in the middle closed only by a line of orange traffic cones. Behind each open door an officer crouches with their back to the camera, a black silhouette against the glare. Beyond the cones, the hero car charges straight at the gap and at the camera, flat out, headlights blazing.
```
Mouvement :
```
Static camera. The officers open fire toward the oncoming car: brief white muzzle flashes light up their silhouettes from the front, and sparks burst off the plum coupe's hood and bumper. The coupe does not slow down: it bursts through the line of cones in the gap, cones tumbling toward the lens, and blasts past the camera, which shakes hard. The officers duck behind their doors. Nobody is hit, nobody falls, and the coupe touches neither police car.
```
Variante douce (remplace la première phrase du mouvement après « Static camera. ») :
```
Rapid white strobe flashes burst from behind the two open doors, and showers of sparks spray off the plum coupe's hood and bumper.
```
Et dans l'image clé, `an officer crouches` devient `a dark figure crouches`.

**P4 ★★★★ — La meute** (ça tire en roulant, tremblé continu)

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] [PURSUIT VAN] Extreme telephoto shot, 200 mm lens, from far down the avenue at a height of 1.5 metres: strong lens compression stacks everything. The hero car is in the lower third, coming toward the camera at full speed, its rear window starred with impacts. Packed tightly behind and above it in the frame: three police sedans and, in the middle, the taller police van, a wall of coral-orange and violet flashing light bars shimmering in the haze.
```
Mouvement :
```
Slow zoom in with the constant nervous wobble of a very long handheld lens. All vehicles drive flat out toward the camera but, because of the telephoto compression, seem to advance slowly. The tall van pushes forward between the sedans without touching them. Small muzzle flashes flicker from the passenger windows of the police sedans; sparks skip off the wet asphalt around the plum coupe, and one of its wing mirrors is torn off in a burst of sparks. Haze drifts across.
```
Variante douce (remplace la phrase des tirs) :
```
Small white strobe flashes flicker among the police cars; sparks skip off the wet asphalt around the plum coupe, and one of its wing mirrors is torn off in a burst of sparks.
```

**P5 ★★★★★ — Le projecteur** (caméra à l'épaule, secouée)

Image clé :
```
[LOOK] [HERO CAR] [HELICOPTER] Low angle from the pavement, looking up between two palm trunks, 28 mm lens. Above the rounded rooftops of the art deco hotels, in the upper-middle of the frame, the helicopter is rising into view, its searchlight beam cutting down through the haze. In the lower part of the frame the hero car speeds along the avenue, with coral-orange and violet light flickering on the road behind it.
```
Mouvement :
```
Handheld camera, buffeted by rotor wash, tilting up from the road to the sky. The helicopter rises over the rooftops and swings its searchlight: the cream-white beam sweeps through the haze, crosses the lens for an instant, almost whiting out the picture, then settles on the plum coupe as it speeds past below. Palm fronds thrash in the rotor wash.
```

**P6 ★★★★★★ — Toute la ville** (le sommet : tout, et les avions)

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] [PURSUIT VAN] [HELICOPTER] [FIGHTER JETS] High, wide aerial shot above the avenue, 24 mm lens, looking along it toward the horizon. The hero car leads, in the lower-middle of the frame, driving flat out toward the camera. Behind it a long column of police sedans and the van, light bars stretching into the distance. Three identical helicopters fly in formation above the avenue, their three searchlight beams crossing on the hero car. Far away, low above the horizon and in the axis of the avenue, two fighter jets in tight formation are approaching. Every window of every building in the city is lit warm amber.
```
Mouvement :
```
The camera cranes up and pulls back, revealing more and more of the lit city. The plum coupe races ahead of the endless column of flashing coral-orange and violet lights; the three helicopters hold formation, their beams staying crossed on the coupe. The two fighter jets come in very low and very fast along the avenue and roar overhead, just above the helicopters, leaving through the top of the frame; the camera shakes violently as they pass and the palm trees bend in their wake. The jets fire nothing and nothing explodes.
```
Variante douce : `two fighter jets` devient `two dark military aircraft`.

**FIN — L'arrestation**

Image clé :
```
[LOOK] [HERO CAR] [PURSUIT CARS] [OFFICERS] [THE DRIVER] Tight shot from a very low angle, 20 cm above the ground, 35 mm lens, on an empty rain-wet esplanade at the end of the avenue, under a single amber streetlamp, one pastel art deco facade and palm trees behind. The hero car is in the centre, in three-quarter front view, in the last metre of a hard stop, its nose dipping, tyre smoke rolling forward around it; its windscreen is full of coral-orange and violet reflections, and the driver behind it is only a dark hooded shape. In the left foreground, well inside the frame, the front end and the open door of one police sedan, light bar flashing, and behind the door one officer as a black backlit silhouette. No other vehicle and no other person is visible. The two cars do not touch.
```
Mouvement :
```
Static camera. The action starts at normal speed and ramps into slow motion. The plum coupe rocks to a complete stop, tyre smoke drifting past it. The officer behind the open door rises, a black silhouette with one arm extended toward the coupe; a white spotlight on the sedan's door pillar swings onto the coupe and holds it. Behind the coupe's windscreen, through the reflections, two black-gloved hands slowly rise in surrender; the driver's face stays hidden by the hood and the reflections. Coral-orange and violet light keeps flickering all around from outside the frame. The last second is perfectly still. Nobody fires and the coupe's doors stay closed.
```
Variante douce : `with one arm extended toward the coupe` devient `standing still behind the door`.

**FIN6 — L'armada**

Image clé A (première image) :
```
[LOOK] [HERO CAR] [PURSUIT CARS] [PURSUIT VAN] [HELICOPTER] [FIGHTER JETS] [OFFICERS] Very low angle 20 cm above the ground, 35 mm lens, on the same empty rain-wet esplanade. The hero car has just stopped in the centre, seen from the side, wrapped in low tyre smoke, water droplets hanging in the air around it. It is completely surrounded: a ring of police sedans and the van, stopped nose-in a few metres around it, none of them touching it, doors open, all light bars lit coral-orange and violet. Behind every open door, an officer stands as a black backlit silhouette, arm extended toward the hero car. Three cream-white searchlight beams come down from above the frame and cross exactly on the hero car. In the sky above the skyline, two fighter jets in tight formation are caught mid-pass, very low over the city, with short white vapour trails. Every window of the city is lit amber.
```
Image clé B (dernière image, si l'outil accepte une première et une dernière image) :
```
The same scene and the same instant as the attached image, seen from a camera that has moved 120 degrees around the hero car: the hero car is now in three-quarter front view, its cream headlights pointing at the lens; behind its windscreen, through the reflections, two black-gloved hands are raised, the driver's face hidden by a hood. Same ring of police sedans, van and silhouetted officers around it, same three crossed searchlight beams, same suspended smoke and droplets, same two fighter jets in the sky, same lit city behind.
```
Mouvement :
```
Time is frozen: the cars, the officers, the tyre smoke, the water droplets, the light bars and the two fighter jets in the sky are completely still, suspended. Only the camera moves: it orbits smoothly 120 degrees around the plum coupe at ground level, passing in front of the ring of police cars and silhouettes, and ends in three-quarter front view with the cream headlights pointing into the lens and two black-gloved hands raised behind the windscreen. The three searchlight beams stay crossed on the coupe. Nobody fires.
```
Variante douce : `arm extended toward the hero car` devient `facing the hero car`.

**FIN5 — en option, seulement quand tout le reste est validé** (la fin du niveau ★★★★★, avec le projecteur de l'hélicoptère)

Image clé : celle de FIN, en ajoutant à la fin de son prompt :
```
From above the frame, a cream-white helicopter searchlight beam comes straight down through the haze onto the hero car.
```
Mouvement : celui de FIN, en ajoutant à la fin :
```
A cream-white searchlight beam from above the frame swings onto the coupe and holds it, and the tyre smoke swirls as if under rotor wash. The helicopter itself is not visible.
```

### 7.8 Réglages par outil, et ce que les outils refusent

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

**Ce que les générateurs hébergés ont tendance à refuser ou à adoucir** (d'expérience, non vérifié outil par outil en novembre 2026)

| Ce qu'on demande | Ce qui arrive souvent | Plans touchés |
|---|---|---|
| Des policiers qui tirent sur une voiture | refus, ou la prise sort sans tir : ils restent debout | P3, P4 |
| Une arme pointée | refus, ou l'arme disparaît et le bras retombe | FIN, FIN6, image B du test |
| Des avions de chasse au-dessus d'une ville | parfois un refus, souvent des missiles ajoutés sous les ailes | P6, FIN6 |
| Un conducteur sans visage | l'outil ajoute un visage dans le rétroviseur ou retire la capuche | P1, FIN |
| Le mot « police » | passe presque toujours en image, parfois filtré en vidéo | tous |

**Que faire, dans l'ordre**
1. **La variante douce** écrite sous chaque prompt concerné (§7.7) : elle décrit la lumière (éclairs, étincelles) sans nommer l'arme ni le tir.
2. Si « police » bloque : remplacer `police sedans`, `police van` et `officers` par `pursuit sedans`, `pursuit van` et `dark figures`.
3. Si un visage apparaît quand même : régénérer, et ajouter `the mirror shows only lights` ou `the hood hides everything` à la fin du prompt.
4. **Si l'outil adoucit toujours** (pas d'éclair, pas d'étincelle) : le plan part sur la machine louée, avec un modèle ouvert sans filtre (§1.2), à partir de la même image clé.
5. En dernier recours, le plan se joue sans tir. Le film reste complet : la montée tient par le nombre, la vitesse et le ciel.

### 7.9 Ordre de travail et dates

| Quand | Quoi | Combien |
|---|---|---|
| **Tout de suite** | Le test de look du §0. | 2 images |
| **Mercredi 11** | R1, R2, R3, puis l'image clé de FIN. On valide le look ensemble. En parallèle : louer et installer la machine (§1.2), sans que rien n'en dépende. | 4 images |
| **Jeudi 12, lot 1** | FIN, OUV, P1 : images clés puis prises. Avec ces trois plans, un film complet existe pour une étoile. | 3 plans |
| **Vendredi 13 et samedi 14, lot 2** | P2, P3, P4. Le film couvre alors ★ à ★★★★, soit presque tout le monde (et la fiche de Jacques). | 3 plans |
| **Dimanche 15 et lundi 16, lot 3** | P5, P6, FIN6. Puis FIN5, en option, seulement s'il reste du temps. | 3 plans (+ 1) |
| **Lundi 16 au soir** | Butoir (§1.1). | |
| **Mardi 17 au soir** | Dernière prise acceptée. Après, on ne touche plus au film avant le lancement. | |

Compter une heure par plan, essais compris.

### 7.10 Grille pour garder ou jeter une prise

On jette si, **dans la meilleure seconde de la prise**, l'une de ces lignes est vraie :

- **ça ne fait pas vrai** : image de jeu vidéo, de dessin animé, de rendu 3D, voitures-jouets, peau en plastique ;
- un **visage** est lisible, ou on voit la peau, les cheveux ou les yeux du conducteur (rétroviseur compris) ;
- un visage ou une silhouette rappelle une personne réelle ou un personnage existant ;
- une **main** a un nombre de doigts faux, une **arme** est en gros plan ou déformée ;
- il y a du **sang**, un blessé, un corps au sol, quelqu'un est touché ou renversé ;
- un missile part, quelque chose explose ou brûle, il y a un feu d'artifice ;
- un passant apparaît ;
- il y a du texte, des lettres ou des chiffres, même illisibles (carrosserie, toit, uniforme, enseigne, plaque, cadran) ;
- la voiture du suspect change de forme ou de couleur, ou ne ressemble plus à R1 ;
- un véhicule ou un avion rappelle un modèle réel, ou porte un écusson, une cocarde, un numéro ;
- les gyrophares sont rouge et bleu (corrigeable au montage si tout le reste est parfait) ;
- une roue se déforme, une voiture en traverse une autre, glisse sans tourner ou roule à l'envers ;
- deux véhicules se percutent ;
- OUV n'est pas calme (caméra qui tremble, voiture qui fonce), ou un plan est moins agité que celui d'avant ;
- dans FIN, plus d'une voiture de patrouille ou plus d'un policier est visible (la fin doit rester vraie à une étoile) ;
- le ciel n'est plus à l'heure bleue, ou le sol est sec ;
- l'action sort de la zone centrale, ou quelque chose d'essentiel est dans les bandes ;
- un filigrane, une bande noire ou un sous-titre est incrusté.

On garde, et on choisit entre les prises, sur une seule question : **est-ce qu'on mettrait cette seconde dans une bande-annonce ?**

---

## 8. Risques, et ce qui n'a pas été vérifié

**Le risque principal** : la cohérence et le délai des plans. Neuf plans (dix avec FIN5) avec la même voiture en six jours, par une personne qui a aussi un lancement à préparer. Les parades : le test du §0 d'abord, les références, les lots par priorité, la butoir du 16, et le repli du §1.1.

**Les autres risques**
- **Les gens et les tirs** : c'est là que les générateurs sont les plus faibles et les plus filtrés. Tout le découpage est écrit pour ça (dos, contre-jour, gants, éclairs plutôt qu'armes, plans de 1,2 s), avec une variante douce par prompt et la machine louée en secours (§7.8). P3 est le plan le plus exposé.
- **Des policiers qui tirent, sur LinkedIn** : c'est une image forte dans un fil professionnel. Ce qui la tient du côté du film de braquage : pas de sang, personne de touché, des silhouettes, une voiture pour cible, et une fin où des mains se lèvent. Si un plan sort plus dur que prévu au tri, on le jette.
- **Le conducteur doit valoir pour tout le monde** : une capuche et des gants ne disent ni genre, ni âge, ni peau, mais les outils rajoutent volontiers un visage. C'est une ligne de la grille.
- **Les avions de chasse** : c'est la démesure qui fait rire, à condition qu'aucun missile ne parte et qu'aucun appareil réel ne se reconnaisse. Si l'outil refuse, P6 et FIN6 se tournent sans avions et le film reste complet.
- **FIN doit rester vraie à une étoile** : une seule patrouille, un seul policier. Les outils en ajoutent.
- **FIN6** est le plan le plus difficile : un anneau de véhicules et de silhouettes qui reste cohérent pendant une orbite. Prévoir plus de quatre prises, ou la machine louée.
- **iPhone en mode économie d'énergie** : la lecture automatique d'une vidéo, même muette, y est bloquée sans geste (bogue WebKit 216887 et témoignages concordants). La parade prévue (débloquer les balises au geste d'envoi, sinon la pilule « Ouvrir mon dossier ») s'appuie sur un comportement décrit par des développeurs, pas garanti par Apple. **C'est le premier test de T1 sur un vrai iPhone.**
- **Navigateur intégré de LinkedIn** : la lecture dans la page (sans plein écran du système) dépend de l'application hôte. À tester le premier jour avec les cartons de T2.
- **L'air « fait par IA »** : il se joue au tri. La grille du §7.10 est sévère exprès.
- **Ressemblance avec le jeu** : on prend la grammaire d'un genre, pas une œuvre. Les prompts ne nomment ni jeu, ni studio, ni ville, ni police ; les gyrophares ne sont pas rouge et bleu ; voitures et appareils sont inventés ; le HUD est le nôtre. Chaque prise est relue contre la grille.

**Pas vérifié**
- Ce que chaque générateur hébergé accepte ou refuse en novembre 2026 sur les tirs, les armes et les avions militaires : le tableau du §7.8 est une tendance, pas un relevé.
- Les réglages exacts des outils vidéo (durées, 9:16 en 1080p, première et dernière image, images de référence). Les recherches confirment ces fonctions pour Veo 3.1 et Kling par des pages de revendeurs, pas par les documentations officielles.
- Les modèles ouverts du §1.2 : noms et besoins en mémoire viennent de comparatifs en ligne, les temps par prise sont des estimations, rien n'a été lancé. Les prix à l'heure sont des relevés de sites tiers.
- Le coût en crédits et le temps réel de Jacques.
- Les poids des fichiers : ce sont des budgets, à mesurer sur les vrais plans.
- Que deux balises vidéo préchargées tiennent sur un téléphone faible sans à-coup à la bascule.
- Que le déblocage d'une balise par un geste survit à un changement de source sur iOS.
- Les conditions d'usage commercial de l'outil choisi, et une éventuelle obligation d'indiquer que la séquence est générée par IA (à regarder avant le lancement ; une ligne dans la page de confidentialité coûte peu).
- Les règles de LinkedIn sur une vidéo de tirs dans un lien partagé : le film joue sur notre site, pas dans le fil, mais le clip à partager (§18.8) y sera publié.
- Le contenu des kits Kenney (§4.2), non retenus.
- La bande-son : aucun agent ne peut l'écouter. C'est l'oreille de Jacques qui la valide.

---

## 9. À reporter au SPEC une fois validé (§18.36)

> **La poursuite devient un film (§18.36).** La poursuite 2D du §18.33 n'a pas passé : Jacques veut une cinématique très réaliste, « digne des plus grands studios », dans la grammaire des bandes-annonces de jeux de braquage. La révélation est un film vertical de 4,7 s (★) à 11,8 s (★★★★★★), à 24 i/s : neuf plans vidéo générés par IA par Jacques d'après `docs/cinematique-poursuite.md` (plus une fin en option pour ★★★★★), sur des générateurs hébergés et, pour ce qu'ils refusent, sur une machine louée ; montés par ffmpeg en trois fichiers (`web/public/film/`), joués par deux balises vidéo. Le début est calme et commun à tous : une balade de nuit, puis un gyrophare dans le rétroviseur et le conducteur qui prend peur. Un plan et une coupe par étoile ; chaque étoile ajoute des poursuivants, du danger, de la vitesse, du tremblé et du bruit : deux patrouilles, un barrage où les policiers tirent, un fourgon et des tirs en roulant, un hélicoptère, puis trois hélicoptères, la ville allumée et deux avions de chasse en rase-mottes. Les feux d'artifice sortent du film. Le film s'arrête au niveau de la personne par son arrestation : la voiture, cernée, s'immobilise, deux mains gantées se lèvent derrière le pare-brise (cadre serré, une seule patrouille visible, les autres suggérées par leurs lueurs) ; arrêt sur image en deux tons à la lumière du profil, qui est la photo d'identité ; flash ; la fiche se pose. À six étoiles, une orbite à temps gelé autour de la voiture encerclée par toute l'armada. Le conducteur vaut pour tout le monde : capuche, gants, de dos ou en ombre, jamais de visage ni de peau ; les policiers sont des silhouettes à contre-jour. Les interdits sur les personnes et les tirs sont levés ; restent : ni sang, ni blessé, ni corps au sol ; ni missile ni explosion ; aucune personne réelle ; aucun texte ; aucune marque ni rien qui vienne d'un jeu ; aucun nom de jeu, de studio, de ville ou de police dans un prompt. Les étoiles, la radio (`shared/chase/radio.ts`) et les bandes d'encre sont posées en direct par le site, mates. La poursuite est à l'heure bleue pour tous ; gyrophares corail et violet. Tout est fonction du temps de la vidéo (`window.__film.seek/hold`). Replis : rien en mouvement réduit ; la pilule de l'attente si la lecture demande un geste ; la poursuite 2D si le film ne se charge pas. Three.js et l'ascenseur sont supprimés à la validation.
