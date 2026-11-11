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

Les lignes de radio viennent de `shared/film/radio.ts`, une par étoile : « Véhicule en fuite · {poste} », « Arme signalée : {langage} », « Motif : {chef d'accusation} », « Affiliation : {affiliation} », « Profil identifié : {profil} », « Toutes les unités · {niveau} », et à la fin « Fin de course · {niveau} ».

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

### 2.4 Le parcours

*Proposé le 11 novembre 2026, à valider par Jacques sur le plan vu du dessus (`Azerit/design/film/parcours.svg` et `parcours.png`, hors du dépôt). Tant qu'il n'est pas validé, le §2.3 vaut seul.*

Jacques : « une rue c'est un peu fade, j'en aimerais plusieurs ». La fuite traverse donc une ville. Le parcours change les lieux, pas l'action : chaque plan garde ce que le §2.3 lui fait faire et gagne une image à lui.

**La ville.** Une bande de ville entre l'océan et une lagune. L'avenue des hôtels longe l'océan. Des rues la coupent et traversent la ville jusqu'à la lagune. Un pont franchit la lagune et finit sur une pointe, sans autre issue. La voiture en fuite quitte la carte postale, s'enfonce dans la ville, sort au-dessus de l'eau et arrive au bout de la route : l'arrestation a une raison.

**Les règles du parcours.**

- **Une scène Blender par lieu**, jamais la ville entière : la rue pèse déjà 3,6 à 4 Go sur un Mac de 8 Go. Quatre scènes : A, l'avenue et son carrefour (`scene_a.py`, elle existe) ; B, la rue des enseignes ; C, le pont ; D, la pointe.
- **Plus il y a de véhicules, moins il y a d'immeubles.** La meute, les hélicoptères et les avions jouent sur le pont et la pointe : de la route, de l'eau, une ville lointaine. Les plans les plus chargés en distribution sont dans les scènes les plus légères.
- **À chaque coupe, le lieu ou le regard change.** Jamais deux plans de suite au même endroit dans le même axe.
- **Le ciel se règle par scène.** Sur l'avenue, la bande corail est au bout de la route. Sur le pont et la pointe, le ciel est tourné pour qu'elle passe derrière la ville. À une seconde le plan, personne ne refait la carte.
- **Les palmiers restent sur l'avenue.** Après le carrefour il n'y en a plus : on a quitté le front de mer.

| Plan | Lieu | Scène | La voiture en fuite | La caméra | Décor à construire |
|---|---|---|---|---|---|
| OUV | l'avenue des hôtels | A | ligne droite, vers la bande corail | rail, trois quarts dos | rien |
| P1 ★ | l'avenue, avant le carrefour | A | ligne droite, puis elle bondit | dans l'habitacle | rien |
| P2 ★★ | le carrefour | A | virage à gauche, l'arrière glisse | drone à la verticale | petit |
| P3 ★★★ | la rue des enseignes | B | ligne droite, dans l'axe de la rue | fixe, au ras du sol | moyen |
| P4 ★★★★ | le pont, la descente | C | descend la rampe vers nous | 200 mm, face à la rampe | petit à moyen |
| P5 ★★★★★ | le pont, au pied de la rampe | C | passe au ras de l'objectif | à l'épaule, vers le ciel | rien de plus |
| P6 ★★★★★★ | le pont, le dernier tronçon | C | en tête de la colonne | grue qui monte et recule | rien de plus |
| FIN, FIN6 | la pointe | D | freine et s'immobilise | fixe ; orbite | petit |

Effort : petit, quelques heures d'un agent ; moyen, une journée ; gros, deux jours ou plus. Les poids de scène donnés plus bas sont des cibles, pas des mesures.

**L'avenue des hôtels (scène A, elle existe) : OUV et P1**

- *OUV* : rien ne change. La voiture roule vers la bande corail, l'océan à sa droite, devant le premier pâté d'immeubles.
- *P1* : le même lieu, cent mètres plus loin, vu de l'habitacle. Le parcours ajoute une chose : par le pare-brise, flous, les feux orange suspendus du carrefour qui approche. La voiture bondit vers eux.
- *Pourquoi deux plans ici* : le calme tient en un seul lieu. La rupture vient avec le virage.

**Le carrefour (scène A, il existe) : P2**

- *Le lieu* : le premier carrefour de l'avenue (la rue transversale de `scene_a.py`, y 120 à 134). Passages piétons, ligne d'arrêt, feux suspendus, fils, toits équipés : tout y est.
- *Pourquoi* : vue du ciel, une ligne droite est un trait ; un virage est un dessin. Et c'est ici que la voiture quitte l'avenue : la fuite commence.
- *La voiture en fuite* : elle arrive par l'avenue, freine, vire à gauche dans la rue transversale. L'arrière glisse, les roues braquées en contre, la gerbe d'eau suit l'arc. Elle ressort en accélérant. Environ 50 km/h dans le virage, pas de tête-à-queue.
- *Les poursuivants* : la première patrouille entre dans le virage à la fin du plan, la seconde est encore sur l'avenue. Aucune tôle ne se touche.
- *La caméra* : drone à 30 m, à la verticale du carrefour, 35 mm. Le cadre est tourné de 45° par rapport aux rues : la voiture entre en bas, vire au centre, sort en haut. Elle monte dans l'image du début à la fin. Rotation lente de 10°, comme prévu.
- *Ce qui change au §2.3* : l'avenue n'est plus verticale dans le cadre ; le drone reste au-dessus du carrefour au lieu d'avancer ; la voiture vire au lieu d'accélérer tout droit.
- *À faire* : habiller les trottoirs et régler les faisceaux des gyrophares, les deux défauts connus de la vue de drone (SPEC §18.36). Le vrai travail est l'animation du virage.

**La rue des enseignes (scène B, à construire, effort moyen) : P3**

- *Le lieu* : la rue où la voiture vient de tourner, plus loin dans la ville. Étroite : chaussée de 8 m, trottoirs de 3 m, façades face à face à 14 m, deux à quatre étages. Enseignes en potence des deux côtés, vitrines allumées, fils et guirlandes en travers, voitures garées d'un seul côté, flaques le long des bordures. 120 m suffisent.
- *Pourquoi* : un barrage ferme un passage étroit. Sur l'avenue, deux patrouilles ne barrent rien, et un côté du cadre est vide : la plage. Ici les façades font deux murs, les enseignes s'empilent vers le fond et se reflètent au sol, les éclairs de tir claquent sur les vitrines. C'est le plan le plus fermé et le plus sombre du film : pas de bande corail, une fente de ciel marine. Le pont, juste après, rouvre le ciel.
- *La voiture en fuite* : pleine vitesse dans l'axe de la rue, un léger écart pour viser le passage de 3 m entre les deux pare-chocs, elle traverse les plots et frôle l'objectif.
- *Les poursuivants* : deux patrouilles à l'arrêt en barrage, une roue sur le trottoir ; la troisième loin derrière la voiture en fuite, gyrophares au fond de la rue.
- *La caméra* : celle du §2.3 (30 cm du sol, 24 mm, fixe puis la première secousse), dans l'axe de la rue.
- *Ce qui change au §2.3* : le décor seul.
- *Les enseignes* : mots génériques (SPEC §18.36), en ambre, crème et corail, un peu de menthe et de lilas. Jamais le duo magenta et cyan (§3.2). Aucune dans les bandes du HUD.
- *Réutilisé* : quatre dessins de façade de `facade_mix.py` (la boutique d'angle, le petit hôtel, l'Art déco d'angle, le bloc bas), la chaussée qui sèche, les voitures garées, les lampadaires, les fils.
- *À écrire* : une rue à deux voies (la largeur et les marquages de `road.py` sont ceux de l'avenue) ; des immeubles posés des deux côtés avec leurs accessoires et leurs lumières (`place()` ne connaît que le côté ville) ; les potences. Poids visé : moins de 3 Go (quatre dessins au lieu de huit, ni rangs arrière, ni plage).

**Le pont (scène C, à construire, effort petit à moyen) : P4, P5 et P6**

- *Le lieu* : au bout de la rue, un pont routier franchit la lagune. 420 m, quatre voies, deux rampes droites à 6 %, une crête à 7 m, puis un dernier tronçon plat de 100 m. Garde-corps bas, lampadaires des deux côtés tous les 30 m, l'eau dessous, la ville derrière. Aucun immeuble proche.
- *Trois plans, trois regards* : dans l'axe au ras du tablier (P4), de côté vers le ciel (P5), d'en haut vers la ville (P6). La voiture avance : la descente, le pied de la rampe, le dernier tronçon.
- *Réutilisé* : la chaussée, les lampadaires, le muret de la promenade comme garde-corps, la mer, la brume, le ciel.
- *À écrire* : un tablier en pente (`road.py` n'extrude que du plat) et le lointain.
- *Le lointain* : la ville vue de la lagune, à 300 m et plus. Les boîtes à fenêtres allumées des premières façades (`FILM3D_FACADE=base`), sans rez-de-chaussée ni accessoires. Il sert au pont et à la pointe. Poids visé de la scène, distribution comprise : moins de 1,5 Go.

*P4, la meute.*
- *Pourquoi* : à 200 mm sur une route plate, les poursuivants se cachent les uns derrière les autres. Sur une rampe qui descend vers la caméra, chaque véhicule est plus haut dans l'image que celui qui le précède : la meute s'étage toute seule, dans un cadre vertical. La focale écrase les lampadaires en deux colonnades ambre. Au-dessus de la crête, le ciel rose puis indigo, et le haut des tours de la ville en disques ambre flous.
- *La voiture en fuite* : elle vient de passer la crête et descend la rampe en ligne droite, vers la caméra.
- *Les poursuivants* : ils surgissent de la crête pendant le plan. Les patrouilles d'abord, puis le fourgon, plus haut qu'elles, qui force au milieu.
- *La caméra* : sur le tronçon plat, 50 m après le pied de la rampe, à 1,5 m, 200 mm. Zoom avant lent, tremblé continu, brume.
- *Ce qui change au §2.3* : la meute n'est plus déjà dans le cadre, elle déborde de la crête. Le reste tient.

*P5, le projecteur.*
- *Pourquoi* : un hélicoptère qui monte le long d'un pont, de sous le tablier, est une image de film. Rien ne le cache, ni toit ni palme : son projecteur traverse toute la brume de la lagune avant de trouver la voiture.
- *La voiture en fuite* : ligne droite, pleine vitesse, elle passe au ras de l'objectif, la meute derrière elle.
- *L'hélicoptère* : il monte derrière le garde-corps d'en face, au-dessus de l'eau, et vient sur le tablier.
- *La caméra* : sur le trottoir du pont, à 40 cm du sol, entre un fût de lampadaire et le garde-corps, 28 mm. À l'épaule, panoramique vers le haut, secouée par le rotor.
- *Ce qui change au §2.3* : le trottoir est celui du pont ; les deux troncs de palmiers deviennent un fût et un garde-corps ; l'hélicoptère monte de sous le tablier, plus de derrière les toits.

*P6, toute la ville.*
- *Pourquoi* : on ne voit toute une ville que de l'extérieur. Du bout du pont elle tient entière dans le cadre : une bande de fenêtres allumées d'un bord à l'autre, la bande corail derrière elle, et le pont en ruban vertical de gyrophares, doublé par son reflet dans la lagune.
- *La voiture en fuite* : en tête, sur le dernier tronçon, vers la pointe.
- *Les poursuivants* : la colonne couvre le pont jusqu'à la ville. Les trois hélicoptères en formation au-dessus du tablier. Les deux avions arrivent de derrière la ville, très bas, dans l'axe du pont.
- *La caméra* : la grue part à 4 m au-dessus du tablier, devant la voiture, et monte à 35 m en reculant vers la pointe, 24 mm.
- *Ce qui change au §2.3* : l'avenue devient le pont ; la ville n'est plus vue de côté, elle est de face et entière.

**La pointe (scène D, à construire, effort petit) : FIN et FIN6**

- *Le lieu* : l'esplanade du §2.3 a une adresse, le bout de la route après le pont. Un terre-plein rond de 60 m, dallé, entouré d'eau, un garde-corps bas, un seul lampadaire, des flaques.
- *Pourquoi* : un cul-de-sac explique l'arrêt. L'eau tout autour porte la brume et les lueurs hors champ de FIN. Le rond donne sa forme à l'anneau de FIN6.
- *FIN* : la voiture arrive du pont, freine en ligne, finit en léger travers. La caméra du §2.3 est tournée vers le pont : derrière la voiture, la file de ses lampadaires, floue.
- *FIN6* : inchangé. L'orbite montre tour à tour le pont couvert de gyrophares, la ville allumée et l'eau.
- *Ce n'est pas un lieu de plus* : le §2.3 demandait déjà cette esplanade.

**L'ordre de construction.** Le butoir demande six plans : FIN, OUV, P1 à P4 (SPEC §18.36). Trois scènes neuves, environ deux jours d'agent en tout, à mener en parallèle ; les images d'essai passent par l'unique file de rendu du Mac.

1. La pointe et le lointain : FIN est la fin de tous les niveaux, et la scène est la plus légère.
2. Le pont : P4, puis P5 et P6 sans décor de plus.
3. Le carrefour : P2.
4. La rue des enseignes : P3.

OUV et P1 s'animent pendant ce temps sur l'avenue, qui existe.

**Ce qu'on coupe si le temps manque, dans cet ordre.**

1. La rue des enseignes, le seul lieu neuf qui coûte. P3 se replie dans la rue transversale de la scène A, à la sortie du carrefour, caméra tournée vers l'avenue et l'océan : aucun décor à construire.
2. Le virage de P2, si son animation ne tient pas. P2 redevient la ligne droite du §2.3.
3. Les rampes du pont. Tablier plat, et la caméra de P4 monte à 5 m pour étager la meute.

On ne coupe ni le pont ni la pointe : deux scènes sans immeuble pour cinq plans. Le plancher du parcours est donc trois décors : l'avenue, le pont, la pointe.

**La version ambitieuse.** La même carte et le même ordre, avec des lieux plus riches. Elle ajoute :

- **Le rond-point** à la place du carrefour (P2) : la voiture le prend à contresens autour d'un îlot de palmiers. Gros : `road.py` ne sait pas courber une chaussée.
- **Le pont à haubans** (P4, P5, P6) : un pylône et des câbles, qui rayent le cadre à 200 mm et que le projecteur traverse. Moyen.
- **Le port** (P5) : le plan quitte le pont pour un quai, entre des piles de conteneurs aux couleurs du film ; l'hélicoptère monte derrière un portique. P5 gagne son lieu. Gros : portiques à trouver en bibliothèque libre ou à écrire.
- **La marina** (FIN, FIN6) : la pointe reçoit des pontons et des mâts ; l'orbite de FIN6 passe derrière eux. Gros : bateaux de bibliothèque, scène plus lourde.

Trois gros et un moyen : six à huit jours d'agent, des modèles à trouver et à nettoyer, des scènes de 3 Go. Pas avant le gel du 16 novembre. Mais le lecteur lit des mp4 : un plan se remplace après le 19 sans toucher au code. La version ambitieuse est la suite de la version recommandée, pas une autre voie.

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
| Le film n'est pas prêt 4 s après la fiche, ou H.264 illisible | la fiche se pose sans révélation |
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

L'ascenseur est supprimé avec Three.js quand le film est validé (SPEC §18.36). La poursuite 2D n'est plus le repli du film : elle est retirée du code, et si le film ne se charge pas la fiche se pose sans révélation.

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
