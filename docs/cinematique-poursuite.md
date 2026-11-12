# Le film de la poursuite : direction

*Écrit le 10 novembre 2026 pour une voie de plans vidéo générés par IA, réécrit le 11 novembre 2026 pour la voie en vigueur.*

**Le film est rendu en 3D.** Les plans sont construits et rendus dans Blender (Cycles) avec `tools/film3d/`, à partir de modèles de bibliothèque libres (CC0 ou CC BY, aucun modèle tiré d'un jeu). Les images de test se rendent sur le Mac ; le rendu complet du film se fait sur une machine louée avec carte graphique. Les plans rendus passent ensuite par le montage (`scripts/film-assemble.ts`, `tools/film/`) et sont joués par le lecteur à deux balises vidéo (`shared/film/`, `web/src/film/`), qui existent déjà et ne changent pas.

Les décisions, les dates et l'état d'avancement sont au SPEC §18.36, qui fait foi. Ce document est la direction du film : ce qu'on doit voir, plan par plan, et ce que le montage et le lecteur attendent. Il vaut quelle que soit la technique de rendu.

Le film remplace comme révélation visée l'ascenseur (SPEC §6.3). La poursuite 2D (SPEC §18.33), refusée, est retirée du code depuis le 11 novembre 2026. Tant qu'il n'est pas validé, l'ascenseur reste la révélation par défaut et le film se joue avec `?scene=film`.

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
3. **La lecture sur un téléphone** : à 390 px de large, le début se comprend en une seconde (une voiture tranquille, une seule patrouille garée, rampe éteinte, que la voiture dépasse) ; au sommet on distingue la voiture en fuite, l'encerclement, les hélicoptères et les avions, et la voiture en fuite reste le sujet.
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
- **Le début est le même pour toutes les fiches, et il est calme.** Une conduite de nuit ; une seule patrouille, garée rampe éteinte à l'angle de la rue de y 120 côté ville, que la voiture dépasse juste après OUV : c'est elle qui s'allume dans le rétroviseur de P1. Ensuite chaque étoile ajoute des poursuivants, du danger, de la vitesse, du tremblé de caméra et du bruit. La montée doit se lire son coupé : c'est le contraste entre le début et le sommet qui fait le film.
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
| OUV | une patrouille garée devant à gauche, rampe éteinte | aucun | conduite calme | sur rail, stable |
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

Les lignes de radio viennent de `shared/film/radio.ts`, une par étoile : « Véhicule en fuite · {poste} », « Arme signalée : {langage} », « Motif : {chef d'accusation} », « Affiliation : {affiliation} », « Profil identifié : {profil} », « Toutes les unités · {niveau} », et à la fin « Fin de course · {niveau} ».

### 2.3 Plan par plan

**OUV : la conduite calme** (24 images)
- *Cadre* : on suit la voiture en fuite de trois quarts dos, à 1,5 m du sol et quelques longueurs derrière elle, 35 mm. L'avenue vide file vers l'horizon corail, palmiers et hôtels Art déco des deux côtés. Une seule patrouille, garée gyrophare éteint à l'angle d'une rue transversale, devant à gauche, côté ville : elle glisse vers le bord gauche du cadre et la voiture la dépasse juste après la coupe (`tools/film3d/ouv_avenue.py`).
- *Caméra* : comme sur un rail, aucune secousse.
- *Action* : rien. Les reflets des lampadaires glissent sur la carrosserie et sur le bitume mouillé.
- *HUD* : les bandes se ferment, six étoiles éteintes, radio muette.

**P1 ★ : le rétroviseur** (28 images)
- *Cadre* : dans l'habitacle, par-dessus l'épaule droite de la personne au volant, depuis la banquette arrière, 28 mm. Au premier plan, flous, sa capuche de dos et ses mains gantées sur le volant. En haut au milieu, le rétroviseur.
- *Caméra* : fixe dans la voiture.
- *Action* : une ellipse de 2,5 s après OUV : la patrouille a quitté son angle de rue et roule derrière, dans la même voie, à une trentaine de mètres. Dans le rétroviseur, la rampe de gyrophares s'allume, corail et lilas ; ses couleurs battent sur le plafond et sur la capuche. La tête se tourne d'un coup, les mains gantées se crispent sur le volant, la voiture bondit.
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

### 2.4 Le parcours

*Retenu par Jacques le 11 novembre 2026 (SPEC §18.36) : la version riche, avec un second virage, construite par paliers. Plan vu du dessus : `Azerit/design/film/parcours.svg` et `parcours.png`, hors du dépôt. Le §2.3 garde l'action de chaque plan ; cette section dit où elle se joue, ce qui y change et ce qu'il faut construire. Les cotes sont des cibles de construction ; les efforts et les poids sont des estimations, pas des mesures.*

Jacques : « une rue c'est un peu fade, j'en aimerais plusieurs », puis « rajoute un virage » et « fais la version ambitieuse ». La fuite traverse donc une ville.

**La ville.** Une bande de ville entre l'océan et une lagune. L'avenue des hôtels longe l'océan jusqu'à un rond-point. La rue des enseignes en part et traverse la ville. Au bout, un pont à haubans franchit la lagune et se pose sur le terre-plein du port. Un mur de conteneurs ferme l'axe : la route fait une baïonnette, à droite puis à gauche, et repart par une jetée jusqu'à une pointe, où est la marina. Il n'y a pas d'autre issue. La voiture en fuite quitte la carte postale, s'enfonce dans la ville, sort au-dessus de l'eau, se faufile dans le port et arrive au bout de la route : l'arrestation a une raison.

**Les règles du parcours.**

- **Une scène Blender par lieu**, jamais la ville entière. Cible : 3 Go au plus par scène, sur un Mac de 8 Go où la scène A en pèse déjà 3,6 à 4. Six scènes : A, l'avenue (`scene_a.py`, elle existe) ; B, la rue des enseignes ; C, le pont ; D, la jetée et la pointe ; E, le port ; F, le rond-point.
- **Deux paliers par lieu.** D'abord le socle, simple, qui donne un plan montable. Ensuite l'enrichissement, qui s'ajoute au socle sans le défaire. Le film est complet et montable dès que les socles existent.
- **Plus il y a de véhicules, moins il y a d'immeubles.** La meute, les hélicoptères et les avions jouent sur le pont, le port, la jetée et la pointe : de la route, de l'eau, une ville lointaine.
- **À chaque coupe, le lieu ou le regard change.**
- **Le ciel se règle par scène.** Sur l'avenue, la bande corail est au bout de la route. Dans les scènes C, D et E, qui regardent toutes vers la ville, le ciel est tourné pour qu'elle passe derrière la ville. À une seconde le plan, personne ne refait la carte.
- **Les palmiers s'arrêtent au rond-point.** Après lui il n'y en a plus : on a quitté le front de mer.
- **Dans chaque scène la voiture en fuite roule vers +y**, comme dans `scene_a.py`. Les cotes sont données le long de son trajet (s, en mètres) et en travers (x, positif à sa droite).
- **Un plan n'est vu que par les fiches qui atteignent son étoile** : FIN par toutes, P2 dès deux étoiles, P6 à six seulement. C'est l'ordre dans lequel on soigne.

| Plan | Lieu | Scène | Socle | Enrichissement | Effort (socle, puis enrichissement) |
|---|---|---|---|---|---|
| OUV | l'avenue des hôtels | A | elle existe | aucun | rien |
| P1 ★ | l'avenue, avant le rond-point | A | elle existe | aucun | rien |
| P2 ★★ | le rond-point | A, puis F | le carrefour de la scène A | l'anneau et son îlot de palmiers | petit, puis moyen |
| P3 ★★★ | la rue des enseignes | B | la rue entière | aucun | moyen |
| P4 ★★★★ | le pont, la descente | C | le tablier et ses rampes | le pylône et les haubans | petit à moyen, puis petit à moyen |
| P5 ★★★★★ | le port, le virage | E | le quai nu au pied du pont | les conteneurs, puis le portique | petit, puis moyen, puis gros |
| P6 ★★★★★★ | la jetée | D | la jetée nue et le panorama | il s'enrichit avec le pont et le port | petit |
| FIN, FIN6 | la pointe | D | la pointe nue | la marina | petit, puis gros |

Effort : petit, quelques heures d'un agent ; moyen, une journée ; gros, deux jours ou plus.

**Le second virage.** Le rond-point n'est pas le second virage : il remplace le premier, au même endroit et dans le même plan (P2). Le second est au port, dans P5 : la voiture sort du pont, trouve l'axe fermé, vire à droite au frein et balaie l'objectif sous le projecteur. Un virage à angle droit sur un terre-plein ne demande aucune chaussée courbe. La baïonnette se referme par un virage à gauche vers la jetée, hors champ entre P5 et P6 ; P6 la montre d'en haut, dessinée par la colonne. En plus, et sans décor : FIN finit en dérapage. Le sens de l'action tient : dans P4, P5, P6 et FIN la voiture vient vers nous.

**Le panorama (module commun aux scènes C, D et E)**

- *Ce que c'est* : tout ce qu'on voit de loin par-dessus l'eau. La mer (`mat_sea`), la brume, le ciel avec son angle de rotation en paramètre, et la ville lointaine.
- *La ville lointaine* : une bande de 1,2 km le long de la rive, à 300 m et plus de la caméra. Les boîtes à fenêtres allumées des premières façades (`FILM3D_FACADE=base`), deux à sept étages, sans rez-de-chaussée ni accessoires. Un réglage allume toutes les fenêtres (P6, FIN6).
- *Le pont et le port vus de loin* : les constructeurs des scènes C et E s'appellent avec une option « loin » qui ne garde que les grandes formes et les lumières. La jetée et la pointe les montrent sans charger leurs scènes.
- *Effort* : petit. À écrire en premier, les trois scènes en dépendent.

**1. L'avenue des hôtels (scène A, elle existe) : OUV et P1**

- *Dimensions* : chaussée de 14 m à quatre voies, trottoir de 4,5 m côté ville, promenade de 4,5 m et muret côté océan, façades de deux à sept étages d'un seul côté.
- *OUV* : le décor ne change pas. La voiture roule à 50 km/h vers la bande corail, sur la voie de droite, l'océan à sa droite, de y 93 à y 106. La patrouille est garée gyrophare éteint à l'angle de la rue transversale de y 120, devant à gauche, côté ville. Caméra sur rail, à 1,5 m, 35 mm, trois quarts dos.
- *P1* : 2,5 s après OUV (ellipse, même voie, même vitesse, `tools/film3d/p1_avenue.py`), remplacé par le découpage v2 (option A, `docs/cinematique-decoupage-v2.md` §3) : la caméra précède la berline de trois quarts avant droit, au ras de la chaussée, 50 mm ; la patrouille roule derrière elle dans la même voie, à 22 m, sa rampe s'allume à l'image 8, elle accélère et déboîte ; la berline bondit à l'image 20.
- *Le carrefour de la scène A ne change pas* quand le rond-point arrive : à cent mètres et flou, ses feux passent pour ceux du rond-point.
- *Pourquoi deux plans ici* : le calme tient en un seul lieu. La rupture vient avec le virage.

**2. Le rond-point (socle dans la scène A, enrichissement en scène F) : P2**

- *Pourquoi* : vue du ciel, une ligne droite est un trait ; un virage est un dessin, et un rond-point en est un plus beau : l'anneau mouillé, l'îlot, les palmes éclairées par-dessous. C'est ici que la voiture quitte l'avenue.
- *La trajectoire, la même aux deux paliers* : un grand virage à gauche de 30 m de rayon, de la voie extérieure de l'avenue (côté océan) vers la rue des enseignes. La voiture y entre à 70 km/h, l'arrière glisse vers l'extérieur, roues braquées en contre, gerbe d'eau le long de l'arc. Elle couvre 21 m pendant le plan et tourne de 40°. Pas de tête-à-queue.
- *Les poursuivants* : la première patrouille entre dans le virage à la fin du plan, sur la même ligne ; la seconde est encore sur l'avenue. Aucune tôle ne se touche.
- *La caméra, la même aux deux paliers* : drone à 40 m, à la verticale du milieu de l'arc, 35 mm (41 × 23 m au sol). Le cadre est tourné de 45° par rapport à l'avenue : la voiture entre en bas, sort en haut, et monte dans l'image du début à la fin. Rotation lente de 10°.
- *Ce qui change au §2.3* : l'avenue n'est plus verticale dans le cadre ; le drone reste au-dessus du virage au lieu d'avancer ; la voiture vire au lieu d'accélérer tout droit.
- *Le socle* : le premier carrefour de la scène A (y 120 à 134). L'arc coupe le carrefour et passe à 4 m de la bordure d'angle. À faire : habiller les trottoirs et régler les faisceaux des gyrophares, les deux défauts connus de la vue de drone (SPEC §18.36).
- *L'enrichissement, scène F* : le même arc passe à contresens entre l'îlot et l'entrée de l'avenue, à 1,5 m de la bordure de l'îlot. L'îlot et ses palmes sont à droite du cadre, l'anneau en croissant sous la voiture.
- *Dimensions de la scène F* : îlot de 12 m de diamètre, bordure haute de 45 cm ; anneau de 9 m à deux voies, rayon extérieur 15 m ; trottoir de 4 m autour. Quatre branches de 30 m : l'avenue des deux côtés (14 m), la rue des enseignes (8 m), l'accès à la plage (8 m). 80 × 80 m en tout.
- *L'îlot* : terre sombre, un palmier royal de 12 m au centre, quatre cocotiers penchés vers l'extérieur, six projecteurs ambre au pied des troncs.
- *Dans le cadre* : aucun immeuble, le cadre ne sort pas des trottoirs. Aux quatre angles, des terrasses : parasols, tables, jardinières. Passages piétons et lignes de cédez-le-passage aux entrées.
- *La lumière* : les palmes éclairées par-dessous, quatre lampadaires aux entrées, les flaques corail et lilas des gyrophares sur l'anneau, des flaques d'eau côté îlot.
- *La façon la plus économe de courber la chaussée* : ne pas toucher à `road.py`. L'anneau est une couronne de maillage ; la cunette et la bordure sont les profils de `road.py` tournés autour de l'axe. Le matériau est l'enrobé de `road.py` dans une variante sans marquages, dont les ornières suivent le rayon (aujourd'hui ornières et marquages sont câblés sur les quatre voies droites de l'avenue). Les marquages sont des décalques peints (`mat_paint_decal`) : tirets entre les deux voies de l'anneau, rives, dents des cédez-le-passage.
- *Réutilisé* : palmiers, lampadaires, dalles de trottoir, profils de bordure et de cunette, décalques, parasols et tables, voitures garées.
- *Gardé du socle* : l'animation de la voiture et des patrouilles, la caméra. *Jeté* : rien du décor (la scène A reste celle d'OUV et de P1), seulement le rendu du plan.
- *Poids visé* : moins de 1 Go.

**3. La rue des enseignes (scène B) : P3**

- *Dimensions* : 150 m. Chaussée de 8 m à deux voies, trottoirs de 3 m, façades face à face à 14 m, deux à quatre étages (7 à 14 m). Voitures garées d'un seul côté, aucune dans les 40 derniers mètres.
- *Pourquoi* : un barrage ferme un passage étroit. Sur l'avenue, deux patrouilles ne barrent rien, et un côté du cadre est vide : la plage. Ici les façades font deux murs, les enseignes s'empilent vers le fond et se reflètent au sol, les éclairs de tir claquent sur les vitrines. C'est le plan le plus fermé et le plus sombre du film. Le pont, juste après, rouvre le ciel.
- *Dans le cadre* : en bas, la chaussée et les plots. Au premier plan à gauche et à droite, les deux patrouilles de dos, portières ouvertes, une silhouette accroupie derrière chacune. Au centre, les phares de la voiture qui arrive. Sur les côtés, vitrines et enseignes en potence entre 4 et 8 m. En haut, une fente de ciel marine et les fils. Au fond de la rue, flous, les palmes éclairées du rond-point (trois palmiers et leurs projecteurs suffisent).
- *La voiture en fuite* : 110 km/h dans l'axe de la rue, soit 36 m pendant le plan. Un léger écart pour viser le passage de 3 m entre les deux pare-chocs. Elle traverse les plots et frôle l'objectif.
- *Les poursuivants* : deux patrouilles à l'arrêt en barrage à s = 130 m, une roue sur le trottoir, gyrophares allumés ; la troisième 60 m derrière la voiture en fuite.
- *La caméra* : celle du §2.3. À 30 cm du sol, 24 mm, 4 m derrière le barrage, dans l'axe, fixe puis la première secousse.
- *Ce qui change au §2.3* : le décor seul.
- *La lumière* : les enseignes et les vitrines d'abord, la lumière des salles qui déborde sur les trottoirs, un lampadaire tous les 30 m en quinconce. Pas de bande corail. Les gyrophares du barrage battent sur les façades.
- *Les enseignes* : celles du §7.5, en ambre, crème et corail, un peu de menthe et de lilas. Jamais le duo magenta et cyan (§3.2). Une potence tous les 8 à 12 m de chaque côté.
- *Réutilisé* : quatre dessins de façade de `facade_mix.py` (la boutique d'angle, le petit hôtel, l'Art déco d'angle, le bloc bas), la chaussée qui sèche avec des flaques le long des bordures, les voitures garées, les lampadaires, les fils et les guirlandes.
- *À écrire* : une rue à deux voies (la largeur et les marquages de `road.py` sont ceux de l'avenue) ; des immeubles posés des deux côtés avec leurs accessoires et leurs lumières (`place()` ne connaît que le côté ville) ; les potences.
- *Paliers* : un seul. S'il reste du temps : plus de potences et de guirlandes.
- *Poids visé* : moins de 3 Go (quatre dessins au lieu de huit, ni rangs arrière, ni plage).

**4. Le pont (scène C) : P4**

- *Dimensions* : 420 m. 60 m à plat côté ville, une rampe droite de 120 m à 6 %, une crête arrondie de 20 m à 7,2 m, une rampe droite de 120 m à 6 %, puis 100 m à plat qui sont déjà le sol du port. Chaussée de 14 m à quatre voies (le profil et les marquages de l'avenue), trottoirs de 2 m, garde-corps de 1,1 m. Lampadaires des deux côtés tous les 30 m. Tablier à 1,5 m de l'eau aux deux bouts.
- *Pourquoi* : à 200 mm sur une route plate, les poursuivants se cachent les uns derrière les autres. Sur une rampe droite qui descend vers une caméra posée à plat, chaque véhicule est plus haut dans l'image que celui qui le précède : la meute s'étage toute seule, dans un cadre vertical. Une rampe arrondie ne le fait pas : elle doit être droite.
- *Dans le cadre* : en bas, la route plate. Au tiers bas, la voiture en fuite. Au-dessus d'elle, la meute en gradins jusqu'à la crête, aux deux tiers de la hauteur. De chaque côté, les lampadaires écrasés en deux colonnades ambre. Au-dessus de la crête, le ciel rose puis indigo et le haut des tours de la ville en disques ambre flous.
- *La voiture en fuite* : elle est à mi-rampe au début du plan et descend en ligne droite vers la caméra, à 120 km/h : de 100 à 60 m de l'objectif.
- *Les poursuivants* : trois patrouilles en V, 25 à 60 m derrière elle ; le fourgon passe la crête pendant le plan, plus haut qu'elles, et force au milieu. Éclairs de tir aux fenêtres, étincelles sur le bitume, le rétroviseur qui s'arrache.
- *La caméra* : sur le plat, 50 m après le pied de la rampe, dans l'axe, à 1,5 m, à l'horizontale, 200 mm. Zoom avant lent, tremblé continu.
- *Ce qui change au §2.3* : le fourgon n'est plus déjà dans le cadre, il déborde de la crête. Le reste tient.
- *La lumière* : les deux files de lampadaires, la brume plus dense au-dessus de l'eau, la bande corail derrière la ville dans l'axe du pont.
- *Le socle* : le tablier, les rampes, les garde-corps, les lampadaires, l'eau, le panorama.
- *L'enrichissement, les haubans* : un pylône en H à la crête. Deux jambes de 3 × 2 m, hautes de 45 m au-dessus du tablier, écartées de 22 m, hors des trottoirs ; une traverse à 28 m et une en tête. Deux nappes de huit haubans de chaque côté du pylône, de 20 cm de diamètre, ancrés tous les 12 m sur la rive du tablier, de 16 à 100 m du pylône. Quatre projecteurs ambre au pied des jambes ; un feu corail fixe en tête, jamais rouge.
- *Ce que les haubans donnent* : dans P4, la meute sort entre les jambes du pylône comme d'une porte, et les câbles rayent le cadre en diagonale. Dans P5 et P6, le pylône éclairé signe le pont de loin.
- *Gardé du socle* : tout. *Jeté* : rien. Le tablier, les rampes et les lampadaires ne bougent pas ; le pylône et les ancrages sont hors de la chaussée.
- *Réutilisé* : la chaussée de l'avenue telle quelle, les lampadaires, le muret de la promenade comme garde-corps, le panorama.
- *À écrire* : des tronçons de chaussée inclinés (`road.py` n'extrude que du plat : trois tronçons tournés, la crête subdivisée), le pylône, les câbles.
- *Zones du HUD* : la tête du pylône et le haut des câbles tombent dans la bande du haut, rien d'important n'y est.
- *Poids visé* : moins de 1,5 Go, distribution comprise.

**5. Le port (scène E) : P5, le second virage**

- *Le repère* : s = 0 au pied de la rampe, la voiture arrive vers +y, x positif à sa droite.
- *Dimensions* : un terre-plein de béton de 160 × 120 m (x de -60 à 100 m, s de -20 à 100 m), à 1,5 m de l'eau. La voie du pont y avance sur 70 m, large de 14 m. À s = 80 m l'axe est fermé : la voie tourne à droite à angle droit sur la voie du quai (axe à s = 70 m), large de 14 m, longue de 80 m, qui tourne à gauche vers la jetée (x = 80 m). Lignes de voie ambre, usées.
- *Pourquoi* : c'est le virage que Jacques a demandé, et le plan y gagne. Dans le §2.3 la voiture passe tout droit devant l'objectif ; ici elle arrive de face, freine tard et part en travers, l'arrière vers la caméra, au moment où le projecteur la trouve. Derrière elle, la meute dévale la rampe sous le pylône.
- *Dans le cadre au début* : en bas, le béton mouillé et ses lignes ambre. Au centre, la voiture qui arrive de face. Derrière elle, la rampe et la meute, puis le pylône et la bande corail. *À la fin, après le panoramique* : le haut du portique, l'hélicoptère, son faisceau dans la brume, et la voiture en travers au bas du cadre.
- *La voiture en fuite* : elle sort de la rampe à 120 km/h, freine dès s = 10 m, entre dans le virage à s = 55 m à 60 km/h, glisse à droite sur un arc de 15 m de rayon, l'arrière à 7 m de l'objectif, et repart sur la voie du quai. À l'instant fort elle est entière dans la zone centrale, de trois quarts, à 10 m.
- *Les poursuivants* : deux patrouilles au pied de la rampe, le fourgon derrière elles sur la rampe. Aucun n'atteint le virage pendant le plan.
- *L'hélicoptère* : il monte de 5 à 40 m, à 90 m de la caméra, à droite du cadre. Son faisceau croise l'objectif vers l'image 14 et se pose sur la voiture vers l'image 20. Il reste sous les 12 % du haut.
- *La caméra* : au bord nord de la voie du quai, à x = 10 m, s = 77 m, à 40 cm du sol, 28 mm. Elle vise le pied de la rampe. À l'épaule, panoramique vers le haut de 25°, secouée par le rotor.
- *Ce qui change au §2.3* : le trottoir entre deux palmiers devient le bord d'un quai ; la voiture ne passe plus tout droit, elle vire devant l'objectif ; l'hélicoptère monte de derrière le portique, plus de derrière les toits. C'est le seul plan où la vitesse baisse : le danger monte à sa place.
- *La lumière* : quatre mâts d'éclairage de 25 m aux angles, ambre ; les flaques ; la bande corail et le rose derrière la rampe ; puis le projecteur, crème, qui écrase tout.
- *Le socle, le quai nu* : le terre-plein, les deux voies et leur angle, le garde-corps côté eau, des bittes d'amarrage, les quatre mâts, une file de séparateurs en béton et des balises à chevrons ambre, sans texte, qui ferment l'axe à s = 80 m, la rampe du pont reprise de la scène C, le panorama. L'hélicoptère monte de derrière le garde-corps, au-dessus de l'eau.
- *Premier enrichissement, les conteneurs* : des boîtes de 12,2 × 2,44 × 2,59 m et de 6,06 m, tôle ondulée, portes à barres. Deux murs de trois de haut (7,8 m) de part et d'autre de la voie du pont, de s = 10 à 52 m, en retrait de 3 m. Un mur de trois de haut ferme l'axe derrière les séparateurs, sur 60 m. Des piles de deux de haut ailleurs, pour la vue de P6. Environ 90 instances, six teintes salies de la palette : prune, marine, corail, ambre, crème, lilas. Marquage : celui du §7.5. Les deux murs encadrent la voiture qui arrive : ce sont les deux troncs du §2.3.
- *Second enrichissement, le portique* : un portique de quai de 45 m, flèche relevée, à gauche de la voie du pont (x de -25 à -7 m, s de -7 à 7 m). L'hélicoptère monte derrière lui. Un feu corail fixe en tête.
- *Gardé du socle* : tout, y compris l'animation et la caméra de P5. *Jeté* : rien ; seule la montée de l'hélicoptère se recale derrière le portique.
- *Réutilisé* : le béton et les dalles, le muret, la mer, la brume, le ciel, la rampe et le pylône de la scène C, le panorama.
- *À trouver en bibliothèque libre* : un portique à conteneurs (CC0 ou CC BY, pas tiré d'un jeu, sans nom d'exploitant). À défaut, l'écrire : jambes, poutres, flèche en treillis, tirants, cabine. Il est à 90 m et à contre-jour : la silhouette suffit.
- *À écrire* : les conteneurs (plus simple que de nettoyer un modèle marqué), les mâts, les balises.
- *Poids visé* : moins de 2 Go.

**6. La jetée et la pointe (scène D) : P6, FIN et FIN6**

- *Dimensions de la jetée* : 300 m, droite, plate, à 1,5 m de l'eau. Chaussée de 8 m à deux voies, trottoirs de 2 m, garde-corps, lampadaires des deux côtés tous les 30 m. Elle est décalée de 80 m par rapport à l'axe du pont : c'est la baïonnette.
- *Dimensions de la pointe* : un terre-plein rond de 60 m, dallé, garde-corps de 0,9 m, une bitte d'amarrage tous les 8 m, un seul lampadaire à 8 m du point d'arrêt, hors de l'axe de la jetée. Des flaques. Trois ouvertures de 2,5 m dans le garde-corps, côté lagune, fermées par une chaîne : elles attendent les passerelles de la marina.

*P6, toute la ville.*
- *Pourquoi* : on ne voit toute une ville que de l'extérieur. De la jetée elle tient entière dans le cadre, et le film avec elle : la jetée, le port, le pont, la ville. La colonne de gyrophares dessine la baïonnette, doublée par son reflet dans la lagune.
- *Dans le cadre à la fin* : au tiers bas, la jetée et la voiture en tête. Derrière elle, la colonne jusqu'au port : conteneurs sous les mâts, portique. Un peu à droite, la rampe du pont couverte de gyrophares et le pylône éclairé. Aux deux tiers, la ville d'un bord à l'autre, toutes fenêtres allumées, la bande corail derrière. Au-dessus, les trois hélicoptères et les deux avions, sous les 12 % du haut.
- *La voiture en fuite* : en ligne droite sur la jetée, 120 km/h, de s = 150 à 205 m.
- *Les poursuivants* : douze à seize véhicules en colonne sur la jetée, la voie du quai et la rampe ; les lointains ne sont que des rampes de gyrophares. Trois hélicoptères en formation, trois faisceaux croisés sur la voiture. Deux avions arrivent de derrière la ville, très bas, dans l'axe de la jetée.
- *La caméra* : la grue part à 4 m au-dessus de la jetée, 25 m devant la voiture, et monte à 35 m en reculant de 40 m vers la pointe. 24 mm, tournée vers la ville.
- *Ce qui change au §2.3* : l'avenue devient la jetée ; la ville n'est plus vue de côté, elle est de face et entière ; la colonne n'est plus droite, elle fait un Z.
- *Le socle* : la jetée nue et le panorama. *L'enrichissement* : aucun travail propre, le plan s'enrichit quand le pont reçoit ses haubans et le port ses conteneurs.

*FIN et FIN6.*
- *Pourquoi* : un cul-de-sac explique l'arrêt. L'eau tout autour porte la brume et les lueurs hors champ de FIN. Le rond donne sa forme à l'anneau de FIN6. Ce n'est pas un lieu de plus : le §2.3 demandait déjà cette esplanade.
- *FIN* : la voiture arrive par la jetée, freine, part en travers d'un quart de tour à gauche et s'immobilise au centre, de trois quarts face. La caméra du §2.3 (20 cm du sol, 35 mm) est à 9 m du point d'arrêt, tournée vers la jetée : derrière la voiture, la file des lampadaires, floue. Une seule patrouille et une seule silhouette, comme au §2.3.
- *FIN6* : inchangé. Anneau de dix patrouilles et du fourgon à 14 m de la voiture ; orbite de 7 m de rayon à 25 cm du sol, sur 150°. Elle montre tour à tour la jetée couverte de gyrophares, le port, le pont, la ville allumée et l'eau.
- *La lumière* : le lampadaire seul, ambre ; les lueurs corail et lilas dans la brume ; dans FIN6, les trois faisceaux.
- *Le socle, la pointe nue* : le terre-plein, le garde-corps et ses trois ouvertures, les bittes, le lampadaire, la jetée, le panorama.
- *L'enrichissement, la marina* : trois pontons flottants de 40 × 2,5 m qui rayonnent des trois ouvertures, une passerelle de 6 m chacun. Quatorze bateaux amarrés : dix voiliers de 9 à 12 m, mâts nus de 12 à 16 m, et quatre vedettes de 7 m. Un feu crème en tête de mât. Ni nom sur les coques, ni pavillon, ni numéro de voile, ni marque.
- *Ce que la marina donne* : dans FIN6, une forêt de mâts derrière l'anneau de patrouilles, qui accroche les lueurs. Dans FIN, des verticales floues aux bords du cadre. Dans P6, presque rien. C'est l'enrichissement le moins vu : il passe en dernier.
- *Gardé du socle* : tout. *Jeté* : les trois chaînes.
- *À trouver en bibliothèque libre* : deux ou trois voiliers et une vedette (CC0 ou CC BY, pas tirés d'un jeu, noms et logos retirés). À défaut, les écrire : coque sombre, mât, bôme, haubans. Ils sont à 30 m et plus, de nuit : la silhouette suffit.
- *Poids visé* : moins de 1,5 Go nue, moins de 2,5 Go avec la marina.

**L'ordre de construction.** Le gel ne bouge pas : lundi 16 novembre au soir. Le butoir demande six plans : FIN, OUV, P1 à P4 (SPEC §18.36). Plusieurs équipes en parallèle, un seul Blender à la fois sur le Mac, derrière le verrou : les images d'essai des socles passent avant celles des enrichissements.

- *L'équipe de l'eau* : le panorama, puis la jetée et la pointe nues (FIN, P6), puis le pont (P4), puis les haubans, puis la marina.
- *L'équipe de la ville* : la rue des enseignes (P3), puis P2 sur le carrefour, puis le rond-point.
- *L'équipe du port* : dès que la rampe du pont existe, le quai nu et son virage (P5), puis les conteneurs, puis le portique.
- *La bibliothèque* : le portique, les voiliers.
- *Pendant ce temps* : OUV et P1 s'animent sur l'avenue, qui existe.

Les socles : environ trois jours d'agent en tout. Les enrichissements : cinq à six de plus. Un enrichissement entre dans le film plan par plan, quand son image d'essai passe le §0 et son plan le §7.10. Dimanche 15 à midi, ce qui n'a pas d'image d'essai validée part au rendu en socle. Le lecteur lit des mp4 : un plan se remplace après le 19 sans toucher au code.

**Ce qu'on abandonne en premier, dans cet ordre.**

1. La marina : elle coûte le plus pour ce qu'on en voit.
2. Le portique : l'hélicoptère monte alors derrière un mur de conteneurs.
3. Les conteneurs : P5 se joue sur le quai nu.
4. Les haubans : P4 garde sa rampe, qui fait le plan.
5. Le rond-point : P2 reste sur le carrefour.

Et si un socle ne tient pas : la rue des enseignes se replie dans la rue transversale de la scène A, à la sortie du carrefour, caméra tournée vers l'avenue et l'océan ; le virage de P2 ou celui de P5 redevient un passage en ligne droite si son animation ne tient pas ; les rampes du pont deviennent un tablier plat, caméra de P4 à 5 m. On ne coupe ni le pont ni la pointe. Le plancher du parcours est trois décors : l'avenue, le pont, la pointe.

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
| Couleurs | ffmpeg, au montage : chaque plan converti en dernier vers la matrice bt709, et les fichiers étiquetés bt709 (§4.1), pour qu'aucun navigateur ne les lise avec la matrice du SD |
| Grain | une tuile de bruit de 128 px, déplacée 12 fois par seconde, opacité 7 % |
| Vignette | un dégradé radial fixe |
| Secousse à chaque étoile | translation de l'image sur quatre images |
| Deux tons de l'arrêt sur image | filtre CSS sur une image fixe |
| Flash | un aplat crème en opacité ; il part aussi tout de suite sur une erreur de lecture (§5.5) |
| Cache d'encre de la bascule | un aplat d'encre posé par le lecteur, sans attendre React, tant que la fin n'a pas peint sa première image |
| Vibration | une impulsion par étoile (`web/src/lib/haptics.ts`, Android) |

Le grain n'est pas gravé dans les fichiers : il gonflerait le débit pour rien.

---

## 4. Les fichiers

### 4.1 Ce que le lecteur et le montage attendent

**En entrée du montage**, hors du dépôt, dans `~/Desktop/Azerit/design/film/plans/` : une ou plusieurs prises par plan, nommées `PLAN-prise.mp4` (`OUV-1.mp4`, `P3-2.mp4`, `FIN6-1.mp4`). `tools/film/montage.json` dit quelle prise garder et quelle fenêtre en prendre (mode d'emploi : `tools/film/README.md`). Une prise absente est remplacée par un carton : le film se monte toujours.

**En sortie**, dans `web/src/film/media/`, importés par Vite (`web/src/film/files.ts`) : au build, chaque nom reçoit l'empreinte de son contenu (`/assets/poursuite-720-XXXXXXXX.mp4`), servie avec un cache long immuable (`/assets/*`, `server/src/app.ts`) : un film remplacé change d'adresse, et un téléphone ne peut plus jouer une poursuite neuve avec une fin ancienne. `VITE_FILM_BASE`, au build, vide par défaut, sert le film depuis un autre hôte : on y copie les mp4 de `dist/web/assets/` sous leur nom à empreinte, et cet hôte doit répondre en CORS. Deux variantes : la haute en 720 × 1280, l'éco en 540 × 960.

| Fichier | Contenu | Images | Plafond de poids |
|---|---|---|---|
| `poursuite-720.mp4` | OUV puis P1 à P6 | 204 | 4,5 Mo |
| `fin-720.mp4` | FIN | 36 | 0,9 Mo |
| `fin6-720.mp4` | FIN6 | 56 | 1,4 Mo |
| `poursuite-540.mp4`, `fin-540.mp4`, `fin6-540.mp4` | les mêmes en 540 × 960 | les mêmes | 1,68 Mo, 0,34 Mo, 0,52 Mo |
| `affiche.jpg` | la première image, 720 × 1280 (hors du site) | 1 | 60 Ko |

Une personne ne charge que la poursuite et une seule fin : au plus 5,4 Mo en haute (5,9 Mo à six étoiles), 2,2 Mo en éco. Les plafonds de l'éco sont ceux de la haute ramenés à ce total. Encodage : H.264 profil Main, 24 images par seconde, une image clé sur chaque coupe entre plans (lues dans `shared/film/cut.ts`) et au plus toutes les 48 images, couleurs étiquetées bt709, `+faststart`, sans piste son. Les plafonds sont dans `shared/film/budget.ts`, lus par le montage et par le lecteur. Chaque fichier part du CRF 20 en haute, 22 en éco, et monte de 2 tant qu'il dépasse son plafond ; s'il fallait dépasser le CRF 28 pour le tenir, **le montage échoue** (code de sortie 1) au lieu de livrer une image dégradée.

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
  player.ts       deux balises vidéo, bascule, horloge, chien de garde, seek et hold, mesures
  loader.ts       le chargement en flux, un fichier à la fois, la variante, ce qui reste à charger
  net.ts          la partie pure du réseau : variante, débit, délai d'abandon
  watchdog.ts     le chien de garde de la lecture, pur
  report.ts       l'événement `film`, pur
  files.ts        les adresses à empreinte des six mp4
  media/          les mp4 et l'affiche, écrits par le montage
  unlock.ts       les deux balises, débloquées par le geste qui lance la fiche
  FilmHud.tsx     bandes, étoiles, radio, arrêt sur image, flash, grain, vignette
  film.css
shared/film/budget.ts           les plafonds de poids, lus par le montage et le lecteur
web/src/components/Film.tsx     même contrat que Walkout3D envers la page d'une fiche ; délai d'abandon, événement
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
- **Fichiers chargés en entier avant de jouer** (`fetch` puis `Blob`, `loader.ts`) : aucune mise en mémoire tampon pendant le film. Un fichier à la fois, la poursuite d'abord ; chacun une fois pour la page.
- **La variante, sur le débit mesuré.** La réponse se lit en flux (`ReadableStream`) : sur les 350 premiers Ko du premier fichier en haute, débit sous 5 Mbit/s (`ECO_BELOW_BPS`, `net.ts`) : ce fichier est abandonné et tout est repris en éco (540 × 960). Économiseur de données : éco d'emblée, rien n'est demandé en haute. Sans `ReadableStream` : pas de mesure, le repli d'avant (éco si la connexion annoncée est en 3G ou moins). Une fois tranchée, la variante ne change plus pour la page. Encodage : celui du §4.1.
- **Ordinateur** : le film dans une colonne 9:16 centrée, haute comme la fenêtre (900 px au plus), sur l'encre.
- **Cadrage** : l'image remplit l'écran. Un téléphone en 390 × 844 est plus étroit que le 9:16 : 9 % de l'image sont rognés de chaque côté. D'où les zones du §7.3.

### 5.4 Le chargement pendant l'attente

1. Au premier contact avec le formulaire (première saisie, premier toucher, `prefetchReveal`), le module du film se charge et le téléchargement part : `poursuite`, puis `fin`, la fin la plus probable, en basse priorité. Jamais dès l'ouverture de la page ; rien avec l'économiseur de données (tout attend l'envoi), rien en mouvement réduit.
2. Au geste qui lance la fiche, les deux balises sont créées et débloquées ; pendant l'attente, le téléchargement continue (ou part, s'il n'était pas parti).
3. Fiche prête, le niveau est connu : seule la fin utile se charge. À six étoiles, `fin` est abandonnée si elle est encore en cours ou en file, et `fin6` passe par la même file, la même variante et la même mesure que les autres. La scène se dit prête quand la première image est peinte, et l'écran d'attente se lève.

### 5.5 Les replis

| Cas | Ce qui se passe |
|---|---|
| Mouvement réduit | rien ne joue, la fiche sort |
| Le navigateur refuse de lancer la vidéo sans geste | l'attente montre la pilule « Ouvrir mon dossier » ; le toucher lance le film |
| H.264 illisible, fichier absent ou qui n'est pas une vidéo | la fiche se pose sans révélation |
| Fiche prête, film pas encore prêt | on attend au plus 4 s d'onglet visible (`READY_WAIT_MS`, le temps onglet caché ne compte pas) ; toutes les 100 ms, ce qui reste à charger est estimé sur le débit mesuré (avec 25 % de marge et 400 ms de décodage) : s'il ne peut pas arriver dans les 4 s, ou si plus rien n'arrive depuis 1,5 s, la fiche se pose tout de suite, sans révélation ; sans mesure possible, on attend les 4 s |
| Erreur de la balise en cours de film | flash immédiat, la fiche se pose |
| Horloge de la vidéo figée plus de 1,5 s, ou pause que le lecteur n'a pas demandée | une relance (la balise replacée sur son image et relancée) ; au second incident du film, flash immédiat et la fiche se pose (`watchdog.ts`). Jamais d'image figée ni d'écran noir |
| `stalled` sur la balise active | une relance douce ; si l'horloge reste figée, la ligne du dessus tranche |

Essais en développement : `?film=gesture`, `?film=missing`, `?film=nocodec`.

### 5.6 Le budget et sa mesure

| Mesure | Cible sur un téléphone moyen |
|---|---|
| Téléchargement d'une personne | 5,4 Mo au plus en haute (5,9 Mo à six étoiles), 2,2 Mo en éco |
| Images vidéo perdues | 0 sur tout le film |
| Bascule de la poursuite à la fin | 2 images au plus |
| Délai entre la levée de l'attente et la première image qui bouge | 300 ms au plus |

`__film.stats()` rend les images perdues, la durée de la bascule, le délai de départ, les octets chargés, la variante et les relances du chien de garde, en développement et avec `?mock=1` seulement. À relever dans Chrome avec le processeur ralenti 4 fois, puis sur de vrais téléphones, dans le navigateur du système et dans le navigateur intégré de LinkedIn.

**En production, l'événement `film`** (table `events`, `server/src/events.ts`) : une ligne par lecture, envoyée à son issue (`web/src/film/report.ts`). Dix clés fermées et bornées : `outcome` (`played` joué jusqu'au bout, `gesture` pilule montrée et jamais touchée, `timeout` abandon au délai, `nocodec` H.264 illisible, `error` chargement ou lecture en échec, `skipped` passé par la personne, `left` page quittée), `variant` (`720` ou `540`), `bytes`, `loadMs` (de la demande au dernier octet, fichier par fichier, les deux fichiers joués), `startMs`, `dropped`, `switchMs`, `kbps` (le débit mesuré), `inApp` (navigateur intégré d'une application) et `gesture` (la lecture a demandé la pilule). Ni identifiant de fiche, ni adresse, ni navigateur en clair : le serveur refuse l'événement s'il en porte.

### 5.7 Ce qui part à la validation du film

L'ascenseur est supprimé avec Three.js quand le film est validé (SPEC §18.36). La poursuite 2D n'est plus le repli du film : elle est retirée du code, et si le film ne se charge pas la fiche se pose sans révélation.

---

## 6. La construction

### T1 : le lecteur et le HUD

Construit le 10 novembre 2026 (SPEC §18.36) : le plan, le HUD pur, le lecteur à deux balises, l'enveloppe React, le branchement à la page et à l'attente.

### T2 : le montage

`scripts/film-assemble.ts` transforme les prises en fichiers du site ; tant qu'une prise manque, son carton la remplace. Critères :

1. `npx tsx scripts/film-assemble.ts` produit les six mp4 et l'affiche en moins de deux minutes sur le Mac ; `ffprobe` confirme 204, 36 et 56 images, 24 i/s, 720 × 1280 et 540 × 960, aucune piste son.
2. Un plan absent de `design/film/plans/` est remplacé par son carton, sans erreur.
3. Les poids tiennent dans les plafonds du §4.1 ; sinon le script baisse la qualité et le dit, jusqu'au CRF 28, au-delà il échoue.
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
- **Presque aucun texte** : ni lettrage de police, ni plaque lisible, ni numéro sur un toit, ni nom de commerce. Le site est bilingue. Deux exceptions (SPEC §18.36). Les enseignes lumineuses portent des mots génériques (HOTEL, BAR, CAFE, OPEN, VACANCY), jamais une vraie marque, un vrai lieu ou un nom qui ressemble à un commerce existant. Au port, les conteneurs ne portent ni nom d'armateur ni logo : des aplats aux couleurs du film et, au plus, un numéro neutre de cinq chiffres au pochoir. Rien de cela dans les bandes du HUD (§7.3).
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
- il y a du texte, des lettres ou des chiffres, même illisibles (carrosserie, toit, uniforme, plaque, cadran), hors les deux exceptions du §7.5 (enseignes à mots génériques, numéros neutres des conteneurs) ;
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
