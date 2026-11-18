# Par-dessus le film : les étoiles qui montent, les pièces du parcours

*Réflexion du 18 novembre 2026, à la demande de Jacques : « par-dessus l'animation j'aimerais afficher les étoiles qui augmentent au fur et à mesure, plus aussi peut-être des commentaires sur son parcours ». Rien n'est décidé ni construit : `SPEC.md` ne change pas tant que les maquettes n'ont pas été vues (§7).*

## 0. En bref

Aujourd'hui les étoiles ne sont pas sur l'animation, elles sont à côté : petites, dans une bande noire, et la seule ligne de texte ne dit rien du parcours. La recommandation : **une étoile, une pièce**. Un fait du dossier s'affiche sous la berline (« 5 ans comptés, poste par poste »), l'étoile tombe en grand sur l'image, puis la suivante se remplit pendant que la poursuite continue. Au gel, celle qui manquait se vide et l'écran dit de combien : « 3ᵉ étoile : à 7 points ».

## 1. Ce que le site fait aujourd'hui

Regardé sur le site lancé en local, en démo, à 390 × 844.

- **Ce qui marche.** Tout l'affichage est une fonction de l'image du film : rien ne se décale, et le clip à partager pourra le rejouer tel quel. L'arrêt sur image, la plaque et le niveau qui claque sont bons.
- **Les étoiles sont hors de l'image.** Deux bandes d'encre prennent 21 % de la hauteur. Les étoiles font 26 px, dans la bande du haut, à 400 px de la berline que l'œil suit. Celle qui s'allume grossit de 13 px pendant 0,2 s : on ne la voit que si on la regardait déjà.
- **Rien ne monte.** Entre deux étoiles, rien ne bouge pendant trois à cinq secondes. L'étoile en suspens ne bat que la dernière demi-seconde. On n'attend donc pas la suivante.
- **La ligne ne parle pas du parcours.** « Véhicule en fuite : Backend », « Arme signalée : Python » : ce sont les étiquettes de la fiche, pas les raisons de la note, et la moitié des mots est du jargon de radio. Les critères du barème de recrutement et leurs pièces, la vraie matière du jugement, sont absents du film.
- **Le cas le plus fréquent est le plus pauvre.** À une étoile, l'écran reste sans un mot pendant 3,2 s sur 4,5.

## 2. Trois directions

| | Ce que c'est | Coût | Risque |
|---|---|---|---|
| **A. Le compteur** | La note grimpe en grands chiffres ; une étoile tombe à chaque seuil. Pas de texte. | Une demi-journée, aucune donnée nouvelle. | Ne dit rien de la personne. Dévoile la note avant la fiche, qui en fait son coup. Son rythme est celui du film, pas du jugement : 0 à 1 en trois secondes, puis 29 points en trois secondes. Un score d'arcade. |
| **B. La radio qui parle du parcours** | Les bandes et la ligne actuelles, avec six phrases tirées du dossier. | Une demi-journée. | Ne change rien à ce que l'œil voit : étoiles petites et hors image, texte de 14 px dans une bande. |
| **C. Une étoile, une pièce** | Étoiles sur l'image, étoile suivante qui se remplit, étoile qui tombe en grand, un fait du dossier par étoile, l'étoile refusée au gel. | Deux à trois jours, en deux lots (§6). | Plus de choses sur l'image : le budget du §3 doit être tenu. Les phrases sont à relire sur de vrais profils avant d'être montrées. |

**Recommandation : C.** A répond à « les étoiles qui augmentent » mais pas à « son parcours » ; B fait l'inverse sans toucher à l'image. C fait les deux avec trois éléments, et son premier lot ne demande aucune donnée nouvelle. Le compteur n'est pas repris : la jauge dans l'étoile dit la même chose sans chiffre, et la note reste le coup de la fiche. Une maquette de A existe pour comparer.

## 3. La recommandation en détail

**Les étoiles : ce qui se voit sans lire.**

- La bande du haut disparaît. Les six étoiles du site passent à 34 px, centrées en haut de l'image, sur le ciel, cernées d'encre.
- **L'étoile suivante se remplit** de bas en haut, en demi-teinte, jusqu'à l'instant où elle tombe. C'est elle qui « augmente au fur et à mesure ». Elle n'est jamais pleine avant : une capture ne montre pas une étoile de trop.
- **L'étoile tombe en grand** : le même dessin, 104 px, sur le ciel au-dessus de la berline pendant une demi-seconde, puis elle rejoint sa place. Avec le coup sourd et le tintement qui existent. Ni éclair plein écran ni secousse : ils ont été retirés le 17 novembre, à raison.
- **L'étoile refusée** (une à cinq étoiles) : la jauge monte jusqu'à la part vraie de la note entre deux seuils (38, c'est 53 % du chemin de 30 à 45), se fige avec l'image, clignote, se vide. Sous le niveau : « 3ᵉ étoile : à 7 points ». On a vu la jauge monter, on sait de combien on l'a manquée : c'est ce qui donne envie de rejouer et de montrer.
- **Le gel passe de 0,6 à 1,5 s** : c'est le seul moment immobile où cette ligne se lit.

**Les pièces : ce qui se lit.**

- **Quoi.** Une pièce par étoile gagnée : le fait d'un critère du barème, celui que la grille montre déjà sous la fiche, en version courte. On prend les critères qui pèsent le plus dans la note, et on les montre dans l'ordre de la maison : **l'expérience d'abord (LinkedIn), GitHub ensuite**. L'étiquette nomme le critère et sa source : « Expérience · LinkedIn », « Code · GitHub », « Stack · recoupé ».
- **Quelle voix.** Le procès-verbal, pas la radio : une phrase sans verbe, le chiffre en tête, sans « tu », sans adjectif, sans blague. C'est déjà la voix de la grille et de la fiche ; elle est épicène et se traduit mot pour mot. L'humour reste aux chefs d'accusation.
- **Quand.** La pièce arrive 1,75 s **avant** son étoile et reste 1,25 s après. On lit quand la route est calme, l'étoile tombe comme le verdict de la pièce, et pendant le dérapage on regarde. Au coup, l'étiquette s'inverse (encre sur crème) : le lien se fait sans un mot.
- **Où.** Sous la berline, sur la chaussée : l'étiquette en JetBrains Mono 12 px, le fait en Barlow Condensed 700 de 28 px, crème sur un aplat d'encre, comme le niveau au gel. Un bloc étroit et centré, pas un bandeau : la chaussée porte la sensation de vitesse.

**Le budget de texte**, le même d'une à six étoiles :

| | Règle |
|---|---|
| À l'écran en même temps | Un seul bloc : une étiquette (22 signes au plus) et un fait sur **une ligne de 32 signes au plus**. |
| Durée | 3 s par pièce. La règle : 0,5 s pour la trouver, puis 1 s par 14 signes (2,8 s pour 32 signes). |
| Entre deux pièces | De 0,2 à 2 s d'image seule ; 1,4 s au début ; à six étoiles, les 5 dernières secondes sans un mot. |
| Au gel | Une ligne de 24 signes au plus, sur image fixe, 1,2 s. |
| Au total | Une étoile : une pièce et le verdict. Six étoiles : six pièces, 18 s de texte sur 30. |

**D'où viennent les phrases.** Du moteur de la grille (`server/src/scoring/grid.ts`), qui écrit déjà en code, avec les chiffres de la personne, la pièce de chaque critère. Il écrit en plus une ligne courte, en français et en anglais : pas d'appel à l'IA, pas d'attente, la même entrée donne les mêmes lignes. Format : `GridCriterion.film?: { text; publicText? }`, d'où le plan du film tire `pieces` (une par étoile gagnée, dans l'ordre) et `verdict` (l'étoile refusée, les points qui manquent). Une fiche sans grille montre au plus deux faits déjà publics (spécialité, langage) ; au-delà, les étoiles tombent sans texte.

**Garde-fous.** Un test refuse toute ligne trop longue. Une pièce dit ce qui est atteint, jamais ce qui manque : le manque se lit sous la fiche, avec le geste qui le lève. Jamais l'école ni son rang, jamais un trou dans le parcours, rien sur l'âge. Le nom d'un employeur ne paraît que pour la personne elle-même ; la page partagée et le clip prennent la version publique (« 3 ans chez un éditeur logiciel »). Aucun texte libre de l'IA sur une personne (principe 4).

**Les zones**, lues sur quinze images du brouillon v9 (en part de la hauteur) :

- de 0 à 14 %, le ciel : la rangée d'étoiles, sous l'encoche ;
- de 14 à 30 %, le ciel encore : l'étoile qui tombe, une demi-seconde ;
- de 30 à 44 %, l'horizon, le couchant, les hélicoptères : rien ;
- de 44 à 68 %, la berline, la police, le barrage : **jamais rien** ;
- de 72 à 80 %, la chaussée : la pièce ; en bas, « Passer » et le son.

Téléphone couché : la pièce se pose sur la bande d'encre du bas, comme la ligne actuelle. Petit téléphone : la taille du fait suit sa longueur. Mouvement réduit : le film ne joue pas par défaut ; s'il est demandé, l'étoile s'allume à sa place, sans vol. Contraste : le texte est sur un aplat d'encre, donc indépendant de l'image ; les étoiles tiennent sur le rose comme sous le pinceau de l'hélicoptère grâce à leur cerne.

**Le gel et l'après.** La rangée d'étoiles reste, la pièce s'efface, la plaque et le niveau claquent comme aujourd'hui, la ligne de l'étoile refusée vient dessous, puis l'éclair crème pose la fiche. Sous la fiche, les critères vus dans le film pourront porter une étoile dans la grille du recruteur : on y retrouve la phrase en entier. Le clip à partager (§18.8) reprend le même état image par image, rendu côté serveur et posé par ffmpeg, avec les pièces en version publique.

**À voir côté film.** L'étoile 4 tombe à l'image 375, sept images après le choc de la police (368) : elle gagnerait à tomber dessus.

## 4. Trois exemples, image par image

Trois dev inventés. Images à 24 par seconde ; ★ : l'étoile tombe.

**Théo, deux étoiles (38).** Un an d'alternance, un premier poste depuis huit mois, trois dépôts.

| Images | À l'écran |
|---|---|
| 35 → 107 | *Parcours · LinkedIn* — **Un vrai poste, tenu 8 mois** · ★ à 77 |
| 111 → 183 | *Code · GitHub* — **3 dépôts lus, niveau 2 sur 5** · ★★ à 153 |
| 157 → 214 | La troisième étoile se remplit jusqu'à 53 %. |
| 214 → 250 | Gel : « @theo-lmb », **DÉLIT**, puis *3ᵉ étoile : à 7 points* ; la jauge se vide. |

**Nadia, quatre étoiles (66).** Cinq ans de back-end, trois ans chez un éditeur, un GitHub tenu.

| Images | À l'écran |
|---|---|
| 35 → 107 | *Expérience · LinkedIn* — **5 ans comptés, poste par poste** · ★ à 77 |
| 111 → 183 | *Parcours · LinkedIn* — **3 ans chez un éditeur logiciel** · ★★ à 153 |
| 213 → 285 | *Stack · recoupé* — **Go : 1 240 commits, 4 ans** · ★★★ à 255 |
| 333 → 405 | *Code · GitHub* — **Tests dans 4 dépôts sur 5** · ★★★★ à 375 |
| 379 → 425 | La cinquième étoile se remplit jusqu'à 40 %. |
| 425 → 461 | Gel : « @nadia-bnl », **HAUTE SURVEILLANCE**, puis *5ᵉ étoile : à 9 points*. |

**Elias, six étoiles (92).** Onze ans, une bibliothèque open source qu'il maintient.

| Images | À l'écran |
|---|---|
| 35 → 107 | *Expérience · LinkedIn* — **11 ans comptés, poste par poste** · ★ à 77 |
| 111 → 183 | *Parcours · LinkedIn* — **6 ans dans une équipe produit** · ★★ à 153 |
| 213 → 285 | *Stack · recoupé* — **Rust : 3 900 commits, 6 ans** · ★★★ à 255 |
| 333 → 405 | *Code · GitHub* — **Niveau 5 sur 5, tests partout** · ★★★★ à 375 |
| 411 → 483 | *Activité · GitHub* — **48 semaines actives sur 52** · ★★★★★ à 453 |
| 525 → 597 | *Production · recoupé* — **tidewatch : 14 versions livrées** · ★★★★★★ à 567 |
| 597 → 719 | Rien : l'encerclement, six étoiles pleines. Puis le gel, **PRIORITÉ ABSOLUE**. |

En anglais, la même forme : *Experience · LinkedIn* — **5 years counted, role by role**.

## 5. Ce qu'il ne faut pas faire

- Empiler compteur, jauge, mini-carte, radio et sous-titres. Trois éléments, pas un de plus.
- Deux lignes à la fois, ou une phrase de plus de 32 signes.
- Du texte sur la berline, ou un bandeau sur toute la largeur de la chaussée.
- Un éclair ou une secousse à chaque étoile.
- Une pièce qui se moque, ou qui dit un manque pendant la poursuite.
- Reprendre le jeu : ses étoiles en haut à droite qui clignotent, sa police de titre, ses cartons de fin de mission. Ici la rangée est centrée, l'étoile est celle du site, les mots sont ceux du dossier.

## 6. Construction en lots

1. **Les étoiles sur l'image** (site seul, aucune donnée nouvelle) : bande du haut retirée, étoiles à 34 px, jauge, étoile qui tombe, étoile refusée et sa ligne au gel, gel à 36 images ; la ligne de radio actuelle passe sous la berline, dans le nouveau bloc. Fichiers : `shared/film/cut.ts`, `plan.ts`, `hud.ts`, `sound.ts`, `web/src/film/FilmHud.tsx`, `film.css`, leurs tests. Sur la branche `film/site-v5`. Une journée, plus un essai sur un vrai iPhone.
2. **Les pièces** : la ligne courte de chaque critère dans `server/src/scoring/grid.ts`, `shared/types.ts`, `shared/publicView.ts`, un `shared/film/pieces.ts` (le choix des pièces, les replis) à la place de `radio.ts`, les fiches de démo. Un jour et demi, puis une relecture des lignes sur une vingtaine de vrais profils, qui décide de la mise en ligne.
3. **Après** : le clip à partager, l'étoile dans la grille sous la fiche, un son pour la jauge.

**Dépend du rendu final** : la place libre en haut de chaque plan (les hélicoptères du port et de la jetée passent à 15 % de la hauteur), les contours de la berline sur les images gelées, et la fusion de `film/site-v5`, sans laquelle rien ne se branche.

**Avant le lancement de demain** : le lot 1 est faisable s'il part aujourd'hui et si quelqu'un le regarde sur un téléphone ce soir. Le lot 2 ne l'est pas raisonnablement : une phrase fausse sur une personne le jour du lancement coûte plus cher qu'une ligne de radio un peu creuse. Il peut suivre deux jours après.

## 7. Les maquettes, et ce qui est vérifié

Dans `design/film/ref/iter/incrustation/` (hors du dépôt) : `incrustation-6-etoiles.mp4` (Elias, 31 s), `incrustation-2-etoiles.mp4` (Théo, gel à l'image 214, 10,8 s), `variante-compteur-2-etoiles.mp4` (la direction A), des images fixes, et `fabrication/` (la page qui rend l'incrustation image par image, et ses scripts). L'incrustation est posée sur le brouillon éclairé v9 agrandi, avec les polices, les couleurs et l'étoile du site, à l'échelle d'un téléphone de 390 × 844. Les maquettes sont muettes.

- **Vérifié à l'image** : l'affichage actuel, sur le site en local ; sur les maquettes, la berline n'est couverte à aucune étoile, chaque pièce tient sur une ligne, les étoiles se lisent sur le ciel rose comme sous l'hélicoptère.
- **Supposé** : la lisibilité en mouvement sur un vrai téléphone (jugée sur des images extraites, pas en main) ; le son ; le deux-tons du gel, approché dans la maquette ; les lignes des exemples, écrites à la main dans la forme que le moteur produirait.
