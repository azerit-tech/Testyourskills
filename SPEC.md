# Testyourskills — ce qu'on veut, idéalement

*Spécification cible, écrite le 14 octobre 2026. C'est le document de référence : toute décision de design, de jugement ou de code se vérifie contre lui. Quand on tranche une question ouverte, on met à jour ce fichier.*

## 0. En une phrase

Un outil de communication pour azerit.tech : tu donnes ton pseudo GitHub ou ton CV, tu reçois en dix secondes une fiche de dev dans l'univers de GTA 6 (étoiles de recherche, photo d'identité judiciaire, chefs d'accusation ; jusqu'au 31 octobre 2026 c'était une carte de joueur façon FIFA Ultimate Team, voir §17), belle, partageable, avec des statuts ironiques. Et deux cartes si tu donnes les deux : **ce que ton CV déclare** contre **ce que ton GitHub prouve**. L'écart entre les deux, c'est la blague, la critique et le message d'Azerit en un seul écran.

## 1. Pourquoi on le fait

- **Porter la thèse d'Azerit** sans la dire : on lit le travail public, pas les CV. L'outil le fait vivre à chacun sur son propre cas.
- **Faire circuler le nom** : chaque carte partagée sur LinkedIn ou X porte le domaine. La carte est le support, la landing est l'atterrissage.
- **Montrer ce que l'IA sait faire** sur un cas concret, avec une pointe d'ironie sur le fait qu'une IA vient de juger quelqu'un en dix secondes sur deux pages de PDF, comme un recruteur pressé.
- **Récupérer des leads** : parmi ceux qui jouent, certains recrutent. Un email optionnel après la carte, et un CTA vers azerit.tech.
- **Le coup marketing** (décision du 15 octobre 2026) : chaque semaine, les cinq meilleures cartes décrochent un entretien avec une entreprise qui recrute via Azerit. C'est la promesse en haut de l'accueil, et la raison de jouer avec son vrai GitHub plutôt que de regarder.

Audience de l'outil : les devs, en français et en anglais. Audience de la landing : ceux qui recrutent. Les deux ne se mélangent pas (voir §10).

## 2. Principes non négociables

Chaque point ci-dessous est une instruction. Si une fonctionnalité contredit l'un d'eux, c'est la fonctionnalité qu'on change.

1. **Beau avant tout.** Si la carte ne donne pas envie d'être capturée et partagée telle quelle, ce n'est pas fini. Pas de style « admin dashboard », pas de composants de librairie UI génériques.
2. **Onboarding réduit à un champ.** Pas de compte, pas de formulaire, pas d'étape intermédiaire. Pseudo GitHub ou dépôt de PDF, puis la carte.
3. **L'IA ne note jamais.** Elle lit et rend des constats structurés. Un barème fixe en code transforme les constats en chiffres. Une même entrée donne toujours la même carte.
4. **On se moque des CV et des pratiques, jamais des personnes.** Les statuts viennent d'une liste fermée, déclenchés par des règles. Aucun texte libre sur quelqu'un. Jamais sur l'origine, l'âge, le genre, le nom, la santé, l'apparence, le lieu ou l'employeur.
5. **Chaque note est explicable.** Sous la carte, « Pourquoi cette note ? » montre la formule de la note globale et chaque axe avec sa valeur. Ni le détail des faits, ni les statuts, ni la fiabilité n'y sont affichés.
6. **Le CV n'est jamais stocké.** Il est lu en mémoire, les constats sont gardés, le fichier et le texte sont jetés.
7. **Azerit est visible, pas envahissant.** Un logo discret sur la carte, une ligne de CTA sous la carte, c'est tout.
8. **Bilingue français et anglais** dès la v1, car la landing est en anglais.
9. **Fonctionne sur mobile** aussi bien que sur desktop. La majorité des clics viendront de LinkedIn sur téléphone.

## 3. La carte

*Version FIFA, remplacée par l'univers de GTA 6 le 31 octobre 2026 : voir §17. Conservée comme historique et comme liste de ce qu'on garde.*

### 3.1 Anatomie

Proportions d'une carte FUT, environ 9 sur 13. De haut en bas :

- **Haut gauche** : la note globale en très grand, dessous le poste en mono, dessous le logo du langage principal (à la place du drapeau), dessous le « club » (employeur déclaré, sinon « Agent libre »).
- **Haut droite** : la marque Azerit, petite.
- **Centre** : le portrait. Avatar GitHub détouré sur un masque en dégradé, ou la photo LinkedIn si la personne connecte son compte (§16). Sans photo, les initiales en typo condensée.
- **Bandeau** : le nom ou le pseudo.
- **Bas** : six stats sur deux colonnes, code à trois ou quatre lettres et valeur sur 99.
- **Pied** : un à trois statuts en pastilles, puis une ligne en mono : « Jugé par une IA en 9 s · fiabilité 34 % ».

### 3.2 Les tiers

Le tier découle de la note globale et pilote tout le rendu de la carte (cadre, couleurs, effet).

| Tier | Note globale | Rendu |
|---|---|---|
| Bronze | moins de 60 | cuivre mat, grain |
| Argent | 60 à 74 | acier brossé |
| Or | 75 à 89 | or, reflets chauds |
| Icon | 90 et plus | blanc irisé, holo intense |

Cartes spéciales, qui remplacent le tier quand la règle s'applique :

- **Wonderkid** : XP sous 45 et TEC à 70 ou plus. Le junior qui monte.
- **Flashback** : au moins 60 % de l'activité GitHub a plus de cinq ans.
- **Team of the Week** (plus tard) : les cinq meilleures cartes générées dans la semaine.

### 3.3 Les six stats

| Code | Nom | Ce que ça mesure |
|---|---|---|
| TEC | Technique | la profondeur de ce qui est écrit ou décrit |
| SHIP | Livraison | la régularité réelle |
| ARCH | Rigueur | tests, CI, outillage |
| DOC | Communication | README, messages de commit, clarté du CV |
| XP | Expérience | l'ancienneté réelle ou déclarée |
| BUZZ | Buzzwords | la densité de vent |

La note globale est la moyenne pondérée des cinq premières : TEC 30 %, SHIP 20 %, ARCH 20 %, DOC 15 %, XP 15 %. **BUZZ ne compte pas dans la globale**, c'est la stat qu'on affiche pour rire.

### 3.4 Le poste

Déterminé par le code à partir des langages et des dépendances dominantes, l'IA ne tranche que si c'est ambigu : FS, BE, FE, MOB, DATA, ML, OPS, SEC, EMB. Pour un CV sans GitHub, l'IA extrait le poste parmi la même liste plus PM, DESIGN, « CTO autoproclamé » (si le titre dit CTO et que l'entreprise compte moins de cinq personnes ou n'est pas identifiable).

### 3.5 La fiabilité

La part des axes qui reposent sur des données suffisantes, affichée sur la carte. Plafonnée à 95, jamais 100. Quelqu'un dont tout le travail est privé a trois repos publics et une fiabilité basse : c'est le message, on vient de le juger sur presque rien.

Seuils de suffisance par axe (carte GitHub) :

- TEC : au moins un repo avec 20 commits ou plus.
- SHIP : le calendrier de contributions sur 52 semaines est disponible.
- ARCH : au moins deux repos actifs dans les deux dernières années.
- DOC : au moins deux repos avec des commits lisibles.
- XP : au moins un repo avec 10 commits ou plus.

Fiabilité = 19 points par axe suffisant, donc 95 au maximum.

## 4. Le jugement

### 4.1 Trois rôles séparés

1. **Le code collecte des faits.** Appels GitHub, extraction du texte du PDF, comptages.
2. **L'IA lit ce que le code ne sait pas lire.** Le code source des trois repos les plus actifs, le CV. Elle rend un JSON strict validé par schéma. Elle ne produit jamais de nombre qui finit sur la carte.
3. **Le code note.** Chaque fait ou constat passe par une échelle fixe, écrite dans un seul fichier de barème, versionné.

### 4.2 Collecte GitHub

Via l'API REST et GraphQL avec un token serveur. Exclure les forks. Garder les repos archivés comme passé.

- **Profil** : date de création du compte, nom, avatar, bio, entreprise, followers.
- **Repos** : nom, description, langage principal, octets par langage, stars, dernier push, date de création, topics, licence, nombre de mots du README.
- **Arborescence** des cinq repos les plus actifs : présence de tests (`test`, `tests`, `spec`, `__tests__`), de CI (`.github/workflows`, `.gitlab-ci.yml`), d'outillage (eslint, prettier, ruff, mypy, `tsconfig` strict), et présence de `node_modules` commité.
- **Calendrier de contributions** sur 52 semaines, nombre de semaines avec au moins une contribution.
- **Messages de commit** : les 100 derniers sur les trois repos les plus actifs. Part de messages « paresseux » : moins de 8 caractères, ou qui matchent `^(fix|wip|update|test|final|stuff|asdf|changes|minor)[\s\d.!]*$` sans tenir compte de la casse.
- **Horodatage des commits** : part entre 1 h et 5 h, part le vendredi après 18 h.
- **PR fusionnées chez les autres** : recherche `type:pr author:X is:merged -user:X`.
- **Premier vrai commit** : date du plus ancien commit de l'utilisateur dans un repo qui en compte au moins 10.
- **Repos tutoriels** : nom qui matche `todo|tutorial|hello-world|clone|portfolio-v\d|test-?\d*|learn` et moins de 5 commits.

### 4.3 Lecture par l'IA

Deux appels, chacun avec un schéma de sortie imposé, température zéro, barème et consignes en cache de prompt.

**Lecture de code.** Pour chacun des trois repos les plus actifs, le code choisit jusqu'à dix fichiers (les plus modifiés, hors générés, hors vendored, 40 Ko max en tout). L'IA rend :

```json
{
  "repo": "nom",
  "level": 3,
  "evidence_file": "src/api/router.ts",
  "evidence_quote": "moins de 200 caractères",
  "observed_traits": ["handles_errors", "typed_strictly"]
}
```

`level` va de 1 à 5 : 1 tutoriel suivi, 2 fonctionnel mais brut, 3 structuré et maintenable, 4 solide avec gestion d'erreurs et tests pertinents, 5 niveau mainteneur de librairie. `observed_traits` ne prend que des valeurs de la liste fermée du §5.3.

**Lecture du CV.** Le texte extrait du PDF. L'IA rend :

```json
{
  "language": "fr",
  "position": "FS",
  "years_declared": 6,
  "seniority_claimed": "senior",
  "roles": [{ "title": "", "company": "", "start": "2021-03", "end": null, "responsibilities": [""] }],
  "technos_listed": [""],
  "technos_described": [""],
  "tests_ci_review_mentions": [{ "quote": "" }],
  "projects_with_dated_outcome": 2,
  "writing_quality": 3,
  "is_dev_profile": true
}
```

`technos_described` ne contient que les technos rattachées à une responsabilité concrète, pas celles d'une simple liste. `writing_quality` de 1 à 5 juge la structure et la clarté du CV, pas la personne. Le code compte lui-même les mots creux et la longueur.

Modèle par défaut : Haiku 5.5 (voir §16). Passer à Sonnet 5.5 pour la lecture de code seulement si la calibration (§4.6) montre qu'il le faut.

### 4.4 Le barème, carte GitHub

Toutes les échelles sont linéaires par morceaux entre les points donnés, arrondies, bornées à 99.

- **SHIP** : semaines actives sur 52. 0 → 20, 13 → 50, 26 → 70, 40 → 85, 52 → 99. Bonus 5 si au moins trois releases ou tags dans l'année.
- **ARCH** : sur les cinq repos les plus actifs, score brut = 50 × part avec tests + 30 × part avec CI + 20 × part avec outillage. Brut 0 → 25, brut 100 → 99.
- **DOC** : brut = 60 × part des cinq repos actifs avec un README de 300 mots ou plus + 40 × (1 − part de commits paresseux). Brut 0 → 25, brut 100 → 99.
- **XP** : années depuis le premier vrai commit. 0 → 25, 1 → 40, 3 → 60, 5 → 75, 8 → 88, 12 et plus → 99. Bonus jusqu'à 8 pour la largeur : 4 langages avec 10 Ko ou plus → 4, 6 ou plus → 8.
- **TEC** : moyenne des `level` des trois repos lus, pondérée par leur activité. 1 → 35, 2 → 50, 3 → 65, 4 → 80, 5 → 95. Bonus 4 si au moins cinq PR fusionnées chez les autres.
- **BUZZ** : brut = 50 × part de repos tutoriels + 50 × part de commits paresseux. Brut 0 → 10, brut 100 → 99.

### 4.5 Le barème, carte CV

Même grille, mêmes bornes, sources différentes.

- **TEC** : séniorité déclarée. junior → 50, mid → 65, senior → 80, lead ou staff → 88. Plus 2 par techno décrite (pas seulement listée), jusqu'à 99.
- **SHIP** : projets avec un résultat daté. 0 → 35, 1 → 50, 3 → 70, 5 → 85, 8 et plus → 95.
- **ARCH** : mentions concrètes de tests, CI ou revue de code. 0 → 35, 1 → 60, 2 → 75, 3 et plus → 90.
- **DOC** : `writing_quality`. 1 → 30, 2 → 50, 3 → 65, 4 → 80, 5 → 95. Moins 10 si le CV dépasse 1 200 mots.
- **XP** : années déclarées, même échelle que la carte GitHub.
- **BUZZ** : mots creux pour 100 mots. 0 → 10, 1 → 40, 2 → 65, 3 → 85, 4 et plus → 99. Liste des mots creux dans un fichier dédié, en français et en anglais : passionné, dynamique, agile, synergie, disruptif, innovant, expert, ninja, rockstar, 10x, proactif, force de proposition, IA quand aucun projet IA n'est décrit.

### 4.6 Par rapport à quoi : la calibration

Les points des échelles ci-dessus sont une première hypothèse. Avant la mise en ligne, les recaler sur de vrais profils : les dumps de campagnes de sourcing d'Azerit (`../hiring-traces`, `../App/recruiting`) contiennent des milliers de profils GitHub réels. Objectif : qu'une note de 75 sur un axe signifie « dans le quart supérieur des devs qu'Azerit a réellement sourcés ». Vérifier ensuite à la main sur cinq profils connus que les cartes paraissent justes. Noter le résultat de la calibration dans ce fichier.

### 4.7 Cas particuliers

- **Moins de trois repos publics** : carte générée, fiabilité basse, statut « Repo privé, talent privé ».
- **Compte d'organisation** : refusé avec un message.
- **CV qui n'est pas un CV** ou profil non dev : carte CV seule, poste PM ou DESIGN, pas de carte GitHub.
- **Pseudo inconnu** : message clair, pas de carte vide.
- **Même pseudo demandé deux fois** : la carte est mise en cache 24 h, on ne refait pas les appels.

## 5. Les statuts

### 5.1 Règles de composition

- Au plus trois statuts par carte, au moins un positif si un positif s'applique.
- Priorité : spéciaux, puis ceux de l'écart CV contre GitHub, puis négatifs, puis positifs.
- Un statut ne se déclenche que par une règle sur des faits, ou par l'IA qui choisit dans la liste fermée du §5.3. Aucun texte libre.
- Mode « taquin » par défaut. Mode « roast », plus dur, uniquement si la personne prouve que c'est son compte via GitHub OAuth (§6.4). On ne roaste pas quelqu'un d'autre.

### 5.2 Catalogue de départ, par règle

Les valeurs entre accolades sont remplies par le code. Ajouter au catalogue sans supprimer, chaque statut a un identifiant stable.

Depuis GitHub :

- « Commits : fix, fix2, final fix » — part de commits paresseux à 40 % ou plus.
- « Tests : bientôt » — aucun test sur les cinq repos actifs.
- « README en construction depuis {année} » — README du repo principal sous 50 mots, repo de deux ans ou plus.
- « Push sur main le vendredi soir » — 30 % ou plus des commits le vendredi après 18 h.
- « Commit de 3 h du matin » — 15 % ou plus des commits entre 1 h et 5 h.
- « A fini le tutoriel » — trois repos tutoriels ou plus.
- « {n} repos, {m} vivants » — dix repos ou plus, au plus 20 % actifs dans l'année.
- « Contributeur fantôme » — aucune PR fusionnée chez les autres, compte de trois ans ou plus.
- « Migre de framework chaque année » — quatre frameworks front ou plus sur l'ensemble des repos.
- « Stars : sa mère et lui » — deux stars au total ou moins, cinq repos ou plus.
- « Repo privé, talent privé » — moins de trois repos publics.
- « Archéologue » — 60 % ou plus de l'activité a plus de cinq ans.
- « Polyglotte (ou indécis) » — six langages ou plus avec 10 Ko ou plus.
- « node_modules commité » — dossier trouvé dans l'arborescence.
- « Ship ou rien » (positif) — SHIP à 85 ou plus.
- « Accepté chez les autres » (positif) — dix PR fusionnées chez les autres ou plus.
- « Documente (si, si) » (positif) — DOC à 80 ou plus.
- « Lu par d'autres » (positif) — 100 stars cumulées ou plus.
- « Mainteneur » (positif) — un repo avec dix contributeurs externes ou plus.

Depuis le CV :

- « Senior depuis le CV » — années déclarées supérieures d'au moins trois ans à l'ancienneté GitHub.
- « Expert en {n} frameworks (d'après le CV) » — douze technos listées ou plus.
- « Passionné (mentionné {n} fois) » — le mot apparaît deux fois ou plus.
- « A ajouté IA à son titre en {année} » — IA ou AI dans le titre, aucun repo ni projet IA décrit.
- « CV plus long que ses README » — mots du CV supérieurs à la somme des README des cinq repos actifs.
- « Agile, synergie, disruptif » — trois mots creux ou plus pour 100 mots.
- « Dit ce qu'il fait » (positif) — au moins cinq technos décrites avec une responsabilité.

Jamais : tout statut qui révèle un problème de sécurité d'une personne (secrets dans l'historique, dépendance vulnérable). On ne l'affiche pas, point.

### 5.3 Liste fermée pour l'IA

L'IA peut poser un seul statut par carte, choisi ici d'après ce qu'elle a lu dans le code :

- « Variables nommées a, b, tmp »
- « Fonction de 400 lignes repérée »
- « Commentaires en franglais »
- « console.log en prod »
- « Copié-collé en série »
- « Gère ses erreurs (rare) » (positif)
- « Typé jusqu'au bout » (positif)
- « Architecture propre, vraiment » (positif)

## 6. Le parcours

### 6.1 Entrée

Une page, un champ, deux onglets : « Ton GitHub » (pseudo ou URL) et « Ton CV » (dépôt de PDF, 5 Mo et 10 pages maximum). Un lien discret « les deux » pour la comparaison. Au-dessus du champ, la promesse en gros : « Ta carte de dev. Les 5 meilleurs ont un entretien. », et une ligne qui la précise. En face, **une seule carte d'exemple : la vraie carte de Jacques** (`jmougeot`, fondateur d'Azerit), rendue par `GET /api/showcase` et recalculée au plus une fois par semaine, avec sa photo LinkedIn (`web/public/jmougeot-linkedin.jpg`, réglable par `SHOWCASE_PHOTO`) à la place de l'avatar GitHub ; tant que le serveur ne l'a pas calculée, une maquette aux faits publics réels (nom, photo, langage, club) tient la place. Un lien sous la carte mène à sa carte complète.

**Pas un mot de plus que nécessaire.** Sur l'accueil, chaque texte doit attirer ou aider à comprendre, sinon il saute : pas de sous-titre qui répète le titre, pas de ligne de réassurance sur l'onglet GitHub (elle ne s'affiche que sur l'onglet CV, où elle rassure sur le fichier), pas de slogan en pied de page, un seul sélecteur de langue (en haut). Sous la carte, une seule ligne, cliquable : « La vraie carte de Jacques, fondateur d'Azerit ».

**Rien d'autre sur la page.** Les sections sous la ligne de flottaison (comment ça marche, les six stats, l'éventail des tiers, le rappel d'appel à l'action) et le carrousel de cartes fictives ont été retirés le 15 octobre 2026 : trop d'informations, les gens veulent aller à l'essentiel. Le thème reste de nuit, celui de la carte et de l'ascenseur ; l'essai d'accueil en thème clair avec une scène de pack opening (branche `design/accueil-azerit`) est abandonné.

Trois raccourcis qui évitent le champ ou le clic :

- **L'URL directe** `/{pseudo}` lance la carte sans rien saisir et remplace l'adresse par `/c/{id}`. C'est le lien à mettre dans les messages de sourcing d'Azerit, qui connaissent déjà le pseudo. En cas d'erreur (pseudo inconnu, limite atteinte), retour à l'entrée avec le pseudo prérempli et le message.
- **Coller une URL GitHub ou déposer un PDF n'importe où sur la page** lance la carte. Un mot collé seul ne déclenche rien : il faut une URL `github.com/…`. Un dépôt en mode comparaison remplit le CV et attend le pseudo s'il manque.
- **Le bandeau d'une carte partagée porte le champ.** La plupart des visiteurs arrivent sur `/c/{id}` depuis LinkedIn : ils saisissent leur pseudo là, sans repasser par l'accueil. Un lien « ou avec ton CV » renvoie à l'entrée, onglet CV.

Sur desktop, le champ a le focus à l'arrivée. Pas sur mobile : le clavier cacherait la carte d'exemple. Le clavier mobile affiche « Ouvrir » comme touche d'envoi.

### 6.2 Attente

*Version FIFA, remplacée par l'univers de GTA 6 le 31 octobre 2026 : voir §17. Conservée comme historique et comme liste de ce qu'on garde.*

Entre cinq et quinze secondes. Afficher des messages qui défilent, en lien avec les faits déjà collectés quand c'est possible :

- « Lecture de tes {n} commits « wip »… »
- « Comptage des buzzwords… {n} pour l'instant »
- « Recherche des tests… toujours en cours »
- « Vérification que le README dit autre chose que « TODO »… »
- « Un recruteur aurait déjà fini. On prend le temps. »
- « Comparaison avec {n} devs sourcés par Azerit… »

### 6.3 Révélation

*Version FIFA, remplacée par l'univers de GTA 6 le 31 octobre 2026 : voir §17. Conservée comme historique et comme liste de ce qu'on garde.*

Walkout calqué sur FC 27, **en vraie 3D** (Three.js, WebGL), transposé dans un décor qui parle à tout le monde : **l'ascenseur qui monte jusqu'à l'étage du dev**. Les portes d'ascenseur remplacent celles du tunnel, et le compteur d'étages fait monter le suspense. Les portes s'ouvrent sur un open space de nuit, avec la ville derrière les baies. La séquence est sautable avec le bouton ou Échap ; un clic saute aussi, sauf pendant la fenêtre des feux d'artifice. La scène finit au pixel près sur la carte HTML. Dans l'ordre :

1. **Le pack** flotte dans la cabine d'un ascenseur de nuit, devant les portes (nettes : plus de profondeur de champ depuis le 17 octobre 2026, voir le journal). Clic ou délai : il tremble, une couture de lumière s'ouvre, il éclate en étincelles, avec un flash bref. La cabine doit se reconnaître au premier coup d'œil :
   C'est un vrai modèle de cabine, pas une construction en code (décision du 16 octobre 2026) : « JNKM Design - Elevator Cab Interior » de Josh Nelson (Sketchfab, CC BY 4.0), dessiné par un studio qui conçoit des cabines d'ascenseur, préparé par `tools/bake/prepare.py`.
   - les mesures d'une vraie cabine de bureaux : 2 m de large, 2,6 m de profondeur, 2,37 m sous plafond, portes de 1 m sur 2,1 m ; le modèle n'a que 1,5 m de profondeur : il est étiré (verre, inox brossé et pierre s'y prêtent) pour que la caméra se tienne à 2,45 m des portes ;
   - deux miroirs du sol au plafond (demande de Jacques du 17 octobre 2026), au milieu de chaque paroi latérale, à la place du panneau de noyer central (z de 1 à 2 m, entre ses joints). Leur reflet est précalculé (choix de Jacques, même jour) : la cabine est photographiée une fois au chargement, nette (cube de 1 024 px par face, en demi-flottants, avec ses mipmaps), depuis le point des reflets de l'inox, et projetée sur la boîte comme eux, ce qui est exact pour tout ce qui est posé sur les parois, même quand la caméra avance. La main courante, à 9 cm devant chaque miroir, n'est pas sur la photo vue sous cet angle : son reflet est calculé dans le shader (intersection du rayon réfléchi et d'un cylindre ovale mesuré sur le modèle, inox satiné lu dans une mipmap floue). Réflectance d'un miroir argenté, 0,86 / 0,89 / 0,87. Le pack, ses étincelles et l'afficheur (noir sur la photo) n'y apparaissent pas : un premier essai en reflets rendus en direct (`Reflector`) les montrait, mais coûtait 24 → 32 ms par image ; le précalcul ne coûte rien de mesurable (33 ms par image avec ou sans, plafonné à 30 images par seconde sur le M1 chargé) ;
   - la façade autour des portes en noyer elle aussi (même jour) : deux feuilles de part et d'autre de l'axe, comme le fond, et un chambranle d'inox de 5 cm autour de l'ouverture avec ses tableaux ;
   - parois en noyer huilé du sol au plafond (demande de Jacques du 17 octobre 2026 : le soubassement sombre sous la main courante passe lui aussi en bois), mains courantes sur trois côtés fixées directement dans le bois par des tiges rondes du même inox (les platines plates du modèle sont retirées), plafond et sol calepinés en moulinet d'après une photo de cabine envoyée par Jacques le 17 octobre 2026 : une dalle centrale (x de -0,5 à 0,5 m, z de 1 à 2 m) entourée de quatre grandes dalles qui tournent autour d'elle. Au sol, marbre blanc (ambientCG Marble021), chaque dalle son morceau de la feuille, joints de 5 cm et bordure de 8 cm le long des parois en marbre noir veiné (ambientCG Marble016) réchauffé en brun foncé ; au plafond, à sa demande, le même marbre blanc en panneaux séparés par des creux noirs de 4 cm, un pavé LED carré de 48 cm au centre et un spot rond dans chacun des quatre grands panneaux (le plafond poli et la grande dalle lumineuse du modèle sont retirés ; la lumière rectangulaire en direct garde la taille de l'ancienne dalle, 1,6 × 1,6 m, pour ne pas changer l'éclairage de la cabine). Un essai en inox brossé (ambientCG Metal009) et en marbre crème (Marble014, trop taché d'ocre) a précédé;
   - le verre blanc du modèle est habillé de noyer par la scène (décision de Jacques du 16 octobre 2026, après-midi : devant la cabine en verre blanc, il a envoyé en exemple un modèle à parois de bois ; il préfère le bois chaud) : le placage est posé en mètres d'après la position dans la cabine (le modèle n'a qu'une vitre par paroi, aux uv quelconques), le fil à la verticale, en panneaux « à livre ouvert » comme les vraies cabines, trois par côté (environ 0,87 m) et deux au fond, un sur deux en miroir, chacun son morceau de la feuille, séparés par des joints de 3 mm à la tôle sombre ; la teinte du scan est foncée par un gris neutre (`#7A7A7A` : plus que le bureau, parce que le plafonnier éclaire plus fort et plus uniformément que les six spots d'avant ; la paroi sort à l'écran à la clarté de l'ancienne cabine : L* 54 mesuré sur capture, contre 59 pour l'ancienne et 70 au premier essai avec la teinte du bureau), avec le relief et la rugosité du scan, et les reflets de la cabine photographiée (capture 512 px). Le temps d'image dans la cabine ne bouge pas (32 ms sur le M1 chargé, 1440 × 756 à 2×) ;
   - façade et portes en inox brossé, seuil, boîte à boutons en inox à droite : mini-afficheur, trois colonnes de boutons cerclés de lumière ;
   - la photo en noir et blanc du fond du modèle (un joueur de baseball, droits incertains, hors sujet) est remplacée par le même verre que les côtés, habillé de noyer comme eux ;
   - la scène n'ajoute que ce qui bouge ou change par carte : l'ouverture des portes (cabine et palières), l'afficheur d'étage en verre noir dans l'imposte, le mini-afficheur qui montre la même image, l'anneau du bouton de l'étage d'arrivée à la couleur du tier, les numéros des boutons (l'étage d'arrivée en haut à droite, puis en descendant), deux filets de LED fins à la couleur du tier dans les angles des portes et sous le plafond, la lumière des paliers dans le jour entre les portes ;
   - la lumière est en direct : le plafonnier est une lumière rectangulaire chaude, la seule, avec l'éclat du pack, qu'évaluent les matières de la cabine (les projecteurs de l'open space n'y entrent pas) ;
   - toutes ses matières reflètent la cabine elle-même, photographiée de l'intérieur, reflets projetés sur ses parois (ils se décalent quand la caméra avance), jamais le studio des objets chromés.

   Un premier essai faisait de toute la paroi un écran LED : on ne comprenait pas qu'on était dans un ascenseur. Le second, une boîte inox sombre de 3,2 m (2,3 m en portrait) avec des néons aux angles et des fentes sur la gaine, a été jugé « pas du tout réaliste ». Le troisième, construit en code d'après des photos de cabines KONE et Otis (noyer, six spots, lumière précalculée dans Blender), a été remplacé par le modèle de JNKM Design : Jacques veut des modèles réalistes tirés des bibliothèques, presque rien de généré par nous. Ses 2 m de large gardent les parois, les mains courantes et les boutons dans le cadre, en portrait comme en paysage.
2. **Le départ, seul.** Après l'éclatement, l'ascenseur s'établit pendant une seconde et demie sans rien d'autre : l'afficheur passe à l'étage 00, le bouton s'allume, puis la flèche ▲, un léger tassement de la cabine, et la montée commence. Les révélations chromées n'arrivent qu'une fois la montée lancée. Avant, tout partait dans la même seconde (particules, étage, statut, premier objet) et on ne comprenait pas où l'on était.
3. **La montée : l'étage, c'est la note.** L'ascenseur monte jusqu'à la note du dev ; une carte à 95 arrive au 95e.
   - Sur l'afficheur, la flèche ▲ et l'étage à gauche. À droite, le **statut atteint** n'apparaît qu'au franchissement d'un palier (tableau ci-dessous), avec un bref parasite, et s'efface au bout de 0,9 s : le reste du temps, l'afficheur ne montre que l'étage. À l'arrivée, le statut final reste. Décision du 15 octobre 2026, pour ne montrer qu'une chose à la fois pendant que les objets chromés défilent devant les portes.
   - Les portes sont un inox plus mat que les parois : sinon le reflet du plafonnier fait une barre blanche qui écrase le joint central.
   - Une flèche pour une carte seule, deux ▲▲ pour une comparaison GitHub × CV (le « double »).
   - La cabine accélère doucement, file à vitesse constante, puis freine à l'approche (profil de vitesse en trapèze : 18 % d'accélération, 30 % de freinage). La lumière des paliers passe dans le jour entre les deux portes, à la même vitesse, de plus en plus visible avec la vitesse.
   - Le bouton de l'étage d'arrivée est allumé à la couleur du tier.
   - **Le son**, synthétisé en direct (Web Audio, aucun fichier) : le frein qui se relâche au départ, le moteur et le souffle de la gaine qui suivent la vitesse, le « ding » à l'arrivée, le moteur des portes. Un bouton en bas à droite le coupe ; le choix est mémorisé dans le navigateur.
   - L'afficheur reste sous le seuil du bloom : lisible, pas éblouissant.
3. **Les indices**, chacun en 3D chromé devant les portes, l'objet avec son nom en lettres 3D au-dessus :
   - le **poste** ;
   - le **langage principal** (le drapeau ; « Polyglotte » et des chevrons de code sans langage reconnu) ;
   - le **championnat** (Ligue GitHub, Ligue CV, ou GitHub × CV) ;
   - une attente « · · · », puis le **club** (écusson et employeur, « Agent libre » sinon).
4. **L'arrivée** : l'afficheur montre la note et le statut final. Les portes s'ouvrent. Derrière, un open space de nuit réaliste, éclairé comme un vrai : plafond blanc cassé, suspensions linéaires qui éclairent vers le bas et vers le plafond, moquette en dalles grises mates, îlots de bureaux en chêne clair sur piètement noir avec cloisons acoustiques en feutre, écrans sur pied, claviers, papiers, vrais fauteuils de travail en cuir noir, la ville derrière les baies : une vraie ville, La Défense vue de Neuilly-sur-Seine, d'un 20e étage au bord de l'axe historique, ses tours juste derrière le poste du dev (Tour First à 0,9 km, The Link, Majunga, Hekla, l'Arche à 2,4 km) ; bâtiments, rues et eau d'OpenStreetMap, logements aux fenêtres chaudes allumées au hasard ; tours de bureaux en murs-rideaux vitrés, surtout sombres comme vers 22 h, avec quelques plateaux allumés d'un bloc (ménage, une équipe tardive) et une faible veilleuse qui garde leur volume de verre lisible sur le ciel ; fenêtres en bandeau ou percées ailleurs, quelques enseignes génériques (aucune vraie marque), feux d'obstacle, de rares couronnes d'une seule teinte douce, réverbères, phares quand la circulation vient vers l'œil et feux arrière quand elle s'éloigne, brume et halo de la ville à l'horizon. Les baies reflètent faiblement le bureau éclairé, plus fort en incidence rasante. Les suspensions s'allument progressivement, rangée par rangée, et leur lumière sur le décor suit. De petits repères à la couleur du tier balisent l'allée. Des lattes de bois et deux plantes en pot, de tailles et de places différentes, encadrent le poste principal.
5. **Le dev** est un vrai humain scanné (peau, cheveux, t-shirt et jean photographiés), assis de dos à son poste, au bout de l'allée, sur un tapis. Son poste : un vrai bureau assis-debout (colonnes télescopiques noires, pieds en T, boîtier de commande à afficheur), 2,2 × 0,84 m, plateau en noyer à 77 cm, le même fauteuil de travail que l'open space, et rien de construit en code : de vrais objets modélisés ou scannés (lampe de bureau noire, tasse « Get shit done », clavier mécanique rétroéclairé à la couleur du tier, souris MX Master scannée sur un sous-main en feutre gris, casque posé à plat, carnet en cuir et stylo plume, bloc de post-it, téléphone retourné, gourde inox, petite plante grasse), trois écrans 23 pouces identiques, celui du milieu en 32 pouces, dont les dalles affichent en direct son programme de recrutement qui s'écrit dans son langage principal, un terminal où les tests passent et son graphe de contributions. Une lumière chaude sur le mobilier contraste avec la lumière bleutée des écrans. Il tape, puis son fauteuil fait un demi-tour et il se tourne vers la caméra. Ses mouvements sont calculés par code, sans clip d'animation (`web/src/three/player.ts`) :
   - les mains sont posées sur le clavier par cinématique inverse (coudes en dehors, poignets un peu au-dessus des touches) ; il frappe par rafales de mots, chaque touche enfoncée par un doigt qui plonge, la main qui glisse d'une touche à l'autre, et des pauses où il relit ;
   - il respire (buste et épaules), se balance à peine, cligne des yeux ; sa tête passe d'un écran à l'autre par petites saccades et ses yeux balaient la ligne qu'il lit ;
   - au demi-tour, ses mains quittent le clavier pour ses cuisses, ses pieds se soulèvent, sa tête devance le fauteuil et le buste traîne un peu ; une fois tourné, il se redresse et regarde la caméra, les yeux dans l'objectif ;
   - tout est fonction du temps, sans état : `hold` et `seek` donnent toujours la même image.

   Le premier dev, un avatar Ready Player Me posé par les axes de son squelette, faisait dessin animé à côté du décor précalculé : sa frappe, par sinus, paraissait mécanique. Le scan de Renderpeople le remplace (16 octobre 2026). Son t-shirt bleu très clair brûlait sous le projecteur : la scène le ramène à un gris chiné en gardant ses plis. Clic ou Espace : feux d'artifice sur la ville (L1/R1 dans le jeu), avec quelques tirs automatiques. Le mobilier reste en place derrière la carte jusqu'à la fin du fondu.
6. **La carte se forme** devant lui dans un flash : carte 3D épaisse (silhouette extrudée, tranche métal à la couleur du tier, vernis, irisation) qui tourne sur elle-même. La note en 3D claque puis se pose à sa place, avec un balayage de lumière et des éclats.
7. **La passation** : la carte 3D glisse jusqu'à l'emplacement HTML, la scène s'éteint, la carte HTML apparaît exactement par-dessus, le canvas s'efface, le partage apparaît.

**Tous les tiers ont la séquence complète**, environ dix-huit secondes (FC 27 en met vingt-cinq). Seules changent la note (l'étage d'arrivée et les statuts traversés) et la couleur du tier : filets de la cabine, liseré au pied des murs, repères de l'allée, détails du poste, tranche de la carte. Contrairement au jeu, il n'y a pas de version courte pour Bronze, Argent ou Or.

**Les statuts de la montée** (fournis par Jacques le 15 octobre 2026, affichés en français ou en anglais selon la langue) :

| Note | Statut (FR) | Statut (EN) |
|---|---|---|
| 1 à 14 | Touriste | Tourist |
| 15 à 24 | Hello World | Hello World |
| 25 à 34 | Newb | Newb |
| 35 à 44 | Ctrl+C Ctrl+V | Ctrl+C Ctrl+V |
| 45 à 59 | Padawan | Padawan |
| 60 à 66 | Fait le taf | Gets it done |
| 67 à 74 | Senior (sur LinkedIn) | Senior (on LinkedIn) |
| 75 à 79 | Crack | Cracked |
| 80 à 84 | Monstre | Monster |
| 85 à 89 | Machine | Machine |
| 90 à 94 | Boss final | Final boss |
| 95 à 99 | Cheat code | Cheat code |

**Caméra : un seul plan-séquence, sans aucune coupe.**
- Elle est dans la cabine, face aux portes, et s'en approche à peine pendant la montée.
- Quand les portes s'ouvrent, elle sort dans l'axe de l'allée et s'approche à environ 4,6 m du poste, puis vient se poser face à la carte. Le bureau et le personnage restent entièrement cadrés, nets, pour lire les matières et les écrans.
- Tout reste dans l'axe (x = 0) : elle ne fait qu'avancer, sans balayer de gauche à droite et sans revenir en arrière.
- La trajectoire est faite d'images-clés interpolées par des splines d'Hermite en temps, avec des tangentes monotones (Fritsch-Carlson). Position, visée et focale restent continues, leur vitesse aussi, sans jamais dépasser une image-clé.
- Les focales sont larges (40 à 52°), sans gros plan serré.
- Une seule petite secousse marque l'éclatement du pack, puis plus aucun mouvement parasite.
- La pose finale est exacte, pour la passation au pixel près.

Ce qui a été essayé, puis refusé par Jacques le 15 octobre 2026 :
- un découpage en douze plans montés cut : trop zoomé, trop de changements, pas fluide ;
- des allers-retours latéraux en fin de séquence ;
- le stade lui-même, trop « foot » : il fallait un décor centré sur le dev et l'entreprise, qui parle à tout le monde.

Sans WebGL, avec `prefers-reduced-motion`, ou si les assets ne sont pas là en douze secondes : affichage direct.

Le poste et ses lumières restent présents derrière les portes fermées dès le début ; seule leur intensité varie. La scène se prépare avant de jouer : un seul moteur de rendu sert toute la page, et pendant l'attente (§6.2) une scène d'échauffement, jamais affichée, y compile tous les shaders et envoie les textures au GPU. La révélation, construite ensuite avec la vraie carte, démarre presque sans à-coup (0,37 s au lieu de 1,35 s sur un M1). La mise au point passe progressivement des portes au bureau.

**Le décor de l'open space est modélisé et éclairé dans Blender** (`tools/bake/office.py`, Cycles). Tout ce qui ne bouge pas (sol, plafond, murs, baies, suspensions, îlots, fauteuils du fond, lattes, tapis) y est construit aux cotes de `walkout.ts`, et sa lumière est précalculée : rebonds, ombres douces, ombres de contact, y compris celles du poste, du dev et des plantes, qui restent en code et y figurent comme obstacles invisibles. La lumière est calculée par groupe, une texture d'éclairement en niveaux de gris par groupe, pour garder l'allumage dans le temps : trois zones de suspensions (rangées 0-2, 3-5, 6-7), le poste du dev (sa suspension, son projecteur, sa lampe, la cabine ouverte), la ville (les baies, le contre-jour bleuté, ses écrans) et le liseré à la couleur du tier. La scène mélange les groupes à chaque image avec leur couleur et leur intensité du moment (`web/src/three/baked.ts`). Les surfaces précalculées n'évaluent aucune lumière en direct : seules les reflets de la carte d'environnement s'y ajoutent. Les fauteuils, trop découpés pour l'atlas, gardent leur lumière par sommet. Les lumières en direct ne servent plus qu'à ce qui bouge (le dev, son poste, les plantes, la carte, le pack).

Pour refaire le décor : `blender -b -P tools/bake/office.py` (environ une heure sur processeur, `--preview` pour un essai en une minute), puis le GLB passe par `gltfpack` (devDependency). Les modèles tiers se préparent avec `SKETCHFAB_API_KEY=… blender -b -P tools/bake/prepare.py` (téléchargement, Poly Haven compris, cotes réelles, orientation, WebP, meshopt ; pièces gardées ou retirées, objets couchés, décimation, plateau d'un bureau séparé avec des uv en mètres et colonnes réglées à la hauteur voulue) ; pour un personnage riggé, le script garde le squelette au repos, raccourcit les noms des os et retire l'animation. Toute cote changée dans `walkout.ts` (bureaux, plantes, suspensions, poste) se reporte dans `office.py`, puis on recalcule.

**La cabine vient d'un modèle tiers** (`cabin.glb`), préparé par `tools/bake/prepare.py` comme le mobilier : remis aux cotes de la scène, sa profondeur étirée, ses coques extérieures retirées, ses deux vantaux séparés, ses boutons allégés, et les pièces que la scène anime nommées (`door_l`, `door_r`, `cop_display`, `ceiling_light`, `button_arrival` ; le centre des boutons est dans les extras de la scène). Sa lumière n'est plus précalculée : le plafonnier lumineux éclaire la cabine de façon presque uniforme, une lumière rectangulaire en direct le rend, et le temps d'image ne bouge pas (36 à 38 ms contre 39 à 56 ms avant, mesuré en alternance sur le M1 chargé, 1440 × 756 à 2×). Toute cote changée dans `cabin.ts` (`CAB_W`, `CAB_D`, `DOOR_W`, `DOOR_H`) se reporte dans `prepare.py` et, pour les portes, dans le mur de l'ascenseur d'`office.py`.

**Étalonnage photographique** (16 octobre 2026) : l'image doit passer pour une photo, sans aucun effet qu'on remarque comme tel.
- **Les matières ont leur albédo mesuré.** Le bois et la moquette scannés ne servent que pour leur grain : la texture ne donne que sa luminance, ramenée à sa moyenne, et la couleur est celle de la matière (`albedo.ts`). Le noyer de Poly Haven multiplié par une teinte beige faisait le chêne des îlots orange (L* 43, a* 12,5) ; il est maintenant à l'albédo du précalcul, `#B89A78` (L* 65, a* 6, b* 22), le chêne natif mesuré étant à L* 68, a* 10, b* 21 (Dzurenda, BioResources 2018). Les lattes passent en chêne fumé `#725941` (L* 40, a* 7, b* 18 ; elles étaient rouge orangé, a* 17), le tapis en gris `#3D3F42` (il sortait brun, L* 10). Le noyer du poste garde la teinte du scan, assombrie comme un noyer huilé (L* 38, a* 7, b* 15, au lieu de L* 30 et d'un reflet mauve). Les peintures, plastiques et poudrages sont des diélectriques (métal 0) : piètements en acier poudré noir `#202224`, coques d'écran en ABS noir `#26282B` (albédo ≈ 0,02), profils anodisés noirs `#1E2023`, montants des baies RAL 7016. Plafond à 0,72 de réflexion (`#DDDCD7`, EN 12464-1 : 0,7 à 0,9), murs gris chaud à 0,40 (`#ACAAA4`), papier à 0,78 (physicallybased.info). Le cuir des fauteuils était rangé dans le métal (la carte du modèle lui donne 0,55, au-dessus du seuil de 0,5 qui séparait le cuir du métal) et sortait gris brun : il redevient un cuir noir `#1D2023` (cuir noir mesuré : sRGB 35/36/38, Unity, *Dark Dielectric Materials*).
- **Le développement : ACES**, pas l'AgX de three.js. Celui-ci n'a que le look « Base » : noirs levés, image délavée, LED du tier pâlies ; le rendu de la ville sort déjà fini de Blender (AgX Medium High Contrast). Le tone mapping « Neutral » de Khronos donnait des halos roses au plafond.
- **Balance des blancs** : neutre dans la cabine, dont la lumière chaude est voulue ; en sortant, elle glisse en 1,5 s vers 5 600 K, comme la balance automatique d'une caméra qui découvre les suspensions (≈ 4 500 K) : il leur reste un peu de chaleur, sans la dominante orange. Gains par canal sur l'image linéaire, avant le tone mapping ; l'or et le bronze restent lisibles.
- **L'objectif** : vignettage de −0,7 IL dans les coins (il en faisait −1,7, un effet visible) ; aberration chromatique latérale radiale, nulle au centre, environ un pixel dans les coins ; saleté de l'objectif, des taches très pâles qui n'apparaissent que dans le halo des sources fortes. L'aberration de `postprocessing` décale le rouge et le bleu dans une seule direction pour tout l'écran : un petit effet maison (`lens.ts`) la fait radiale, dans la même passe. Bloom, profondeur de champ et grain sont inchangés. Sur mobile, ni aberration ni saleté.

**Assets** (`web/public/3d`, environ 7,7 Mo) : ils se téléchargent dès que le visiteur commence à saisir son pseudo, tape dans le formulaire ou y glisse un CV, sauf avec l'économiseur de données ; sinon pendant l'attente du §6.2, qui dure une dizaine de secondes.
- le décor de l'open space et sa lumière : `office.glb` et `office-lm-*.webp` (atlas 2048², un par groupe, WebP qualité 75 : l'éclairement est assez lisse pour ne montrer ni bandes ni blocs) ;
- la ville de nuit : `city.webp`, construite d'après OpenStreetMap et rendue dans Blender (`tools/bake/city.py`, vingt à trente minutes sur processeur, `--preview` en deux minutes) en projection cylindrique centrale, 100° de large, de 14° sous l'horizon à 16° au-dessus, posée sur le même morceau de cylindre derrière les baies, l'horizon à hauteur d'œil ; 4096 px de large, pas davantage : c'est la taille de texture que tous les mobiles acceptent. Les données (emprises et leurs `building:part`, hauteurs `height`, `min_height` et `building:levels`, sinon une hauteur plausible selon le type de bâtiment ; rues hors tunnels ; eau) viennent de l'API Overpass par `tools/bake/osm.py`, une fois, puis restent en cache dans `tools/bake/.cache/osm` (hors dépôt) : le rendu se refait hors ligne. L'emprise téléchargée est fixe dans `city.py` (`AREA`) : retoucher l'œil ou le cap ne relance pas de téléchargement tant qu'on reste dedans. La caméra de Blender coupe à 1 km par défaut : `city.py` la pousse à 9 km, sinon le quartier d'affaires disparaît ;
- bois et moquette : Poly Haven `black_walnut_veneer_02` et `dirty_carpet`, CC0, couleur/normales/rugosité en WebP 1K ; la moquette ne garde que la luminance de sa texture, en dalles de 50 cm posées en damier ;
- plantes : Poly Haven `potted_plant_02`, CC0 ;
- cabine d'ascenseur : « JNKM Design - Elevator Cab Interior » de Josh Nelson (Sketchfab, CC BY 4.0), `cabin.glb`, 0,54 Mo (textures 1K WebP, meshopt) ;
- fauteuil : « Ergonomic office chair with armrests » par Giimann (Sketchfab, CC BY 4.0), cuir teinté en noir par la scène ;
- objets du poste (Sketchfab, CC BY 4.0) : bureau assis-debout Ascend (Chairsolutions), écran Dell P2314H (GregorJan), clavier mécanique (FelikinRuslan), souris MX Master 3S scannée (Zhirayr), sous-main (mfk), casque Sony MDR-7506 (AndreiVNK), téléphone sans sa face avant ni son logo (DatSketch), gourde (Igrium), tasse (The Lister), lampe de bureau (nickbaker) ; et Poly Haven, CC0 : carnet en cuir, bloc de post-it, stylo plume, plante grasse. 1,3 Mo pour le bureau et les dix objets ajoutés : géométrie allégée (décimation) et textures en 512 px pour les petits objets ;
- personnage : « Balthazar » de Jungle Jim (Sketchfab, CC BY 4.0), un personnage Character Creator riggé (doigts, yeux), choisi par Jacques le 6 novembre 2026 pour se rapprocher des personnages du jeu : Nathan, le scan de Renderpeople (21 000 faces, texture 1K), « ne ressemblait à rien » à côté. Préparé par `tools/bake/prepare.py` : `developer-v4.glb`, 3,2 Mo (68 000 triangles, textures 1K WebP, meshopt), sans son animation, ses 148 expressions du visage (plusieurs mégaoctets), ses brassards de combat ni la peau des jambes (elle traversait le pantalon aux genoux) ; ses os prennent les noms de Renderpeople (`CC_BONES`) pour que `player.ts` les pose sans changement ; la pose de repos vient des nœuds glTF, car chez Character Creator la cuisse, le bras et l'avant-bras ne pèsent sur aucun sommet et leur matrice de liaison les met à l'origine. Il n'a pas d'os de paupières : il ne cligne plus des yeux ;
- la police : Barlow Condensed 800 convertie en typeface (SIL OFL), pour les textes 3D.

Sources, licences et modifications dans `web/public/3d/CREDITS.txt`, accessible depuis le pied de page. Les modèles tiers sont choisis sous licence CC0 ou CC BY : le site est public et leurs fichiers téléchargeables. La ville vient des données OpenStreetMap, sous licence ODbL : l'attribution « © OpenStreetMap contributors », avec le lien https://www.openstreetmap.org/copyright, figure dans `CREDITS.txt`. Mise au point en démo : `?wait=3` ramène l'attente simulée à trois secondes (deux au moins, le temps que la scène se prépare), pour voir vite l'ouverture du pack ; `window.__tys3d.hold(s)` fige la séquence à l'instant `s`, `seek(s)` y saute. Pendant un `hold`, la scène ne dessine pas d'image entre deux appels : un changement d'écran y reste figé en plein parasite.

### 6.4 Après la carte

Dans cet ordre, sous la carte :

1. Boutons de partage (§7) et téléchargement de l'image.
2. « Pourquoi cette note ? » déplié : la formule de la note globale et chaque axe avec sa valeur (sans description, détail des faits, statuts ni fiabilité).
3. « Contester ma note » : réponse canned et drôle, puis renvoi vers les faits. Easter egg, pas un vrai formulaire.
4. Si une seule source : « Ajoute ton CV (ou ton GitHub) pour voir l'écart ».
5. « Passer en mode roast » : demande GitHub OAuth, réservé au propriétaire du compte.
6. Email optionnel : « Reçois ta carte par email ». Un champ, un bouton. Envoie le même événement que la page Try de la landing, avec `event: "card_email"`.
7. CTA Azerit, une ligne : « Vous recrutez ? Azerit lit le GitHub de vos candidats à votre place. » Lien vers azerit.tech.

### 6.5 Comparaison

Quand les deux sources sont là : les deux cartes côte à côte sur desktop, empilées avec un curseur sur mobile. Entre les deux, le delta par stat en pastilles colorées. Un titre généré par règle : « Ton CV te vend {n} points de plus que ton code » ou l'inverse « Ton code vaut {n} points de plus que ton CV, change de CV ».

## 7. Partage

- **URL unique** par carte : `/c/{id}` avec un id court, non devinable.
- **Page de carte** rendue côté serveur avec les balises Open Graph et Twitter, pour que LinkedIn et X affichent l'image.
- **Image générée côté serveur** à partir du même composant que la carte, pas une capture d'écran. Deux formats : 1200 × 630 pour l'aperçu de lien, 1080 × 1350 pour LinkedIn et Instagram en portrait.
- **Textes préremplis**, en FR et en EN, qui citent la note, le tier et un statut. Exemple : « Carte Or, 78. Statut : « Commits : fix, fix2, final fix ». Jugé par une IA en 9 s. Fais la tienne : {url} ».
- **Boutons** : LinkedIn, X, copier le lien, télécharger le PNG. Pas de SDK tiers, des liens d'intention.
- **La carte comparée** a aussi son URL et son image, avec les deux cartes.

## 8. Le visuel

*Version FIFA, remplacée par l'univers de GTA 6 le 31 octobre 2026 : voir §17. Conservée comme historique et comme liste de ce qu'on garde.*

### 8.1 Système

- **Un seul thème, de nuit (décision du 15 octobre 2026, en fin de journée).** Un accueil en thème clair repris d'azerit.tech (fond blanc, grille de points, autocollants penchés, scène de pack opening dans un cadre de nuit, bandeau de commits) a été fusionné puis retiré le même jour : ça ne faisait pas gamer, la scène d'exemple se lisait moins bien que la carte seule, et la page portait trop d'informations. L'accueil garde le fond de nuit de la carte et de l'ascenseur, et ne montre que la promesse, le champ et la carte de Jacques. Reste ouvert : rattacher visuellement l'accueil à Azerit, reproche fait au premier accueil sombre, sans rien ajouter à la page.
- **La carte, son attente et sa révélation restent de nuit** : fond `#0a0f16`, surfaces `#101722`, bordures `#223040`, texte `#e6ecf2`, texte atténué `#8494a5`, accent teal `#52d0bd`, bleu `#6cb6ff`. La scène 3D est un ascenseur de nuit, et la carte sombre ressort mieux sur l'accueil blanc. Les tiers ont leurs propres dégradés métallisés, définis une fois en variables CSS, indépendants du thème de la page.
- **Typo** : une condensée pour les gros chiffres et le nom de la carte (Barlow Condensed en 700 et 800, via Google Fonts), Inter pour le texte, JetBrains Mono pour les codes de stats, le pied de carte et, comme sur la landing, les titres des pages claires.
- **Dimensions** : 360 × 520 sur desktop, largeur de l'écran moins les marges sur mobile, jamais de défilement horizontal.
- **Logos de langages** : SVG monochromes, inline, pas de police d'icônes.

### 8.2 Effets

- **Inclinaison 3D** au survol, douze degrés maximum, qui suit le pointeur. Sur mobile, suit le gyroscope si disponible.
- **Reflet holographique** qui se déplace avec le pointeur, intensité selon le tier, technique des cartes Pokémon en CSS. Un grain de feuille métallique par bruit SVG.
- **Balayage de lumière** à la révélation.
- La carte et ses effets (inclinaison, holo, balayage) restent en CSS. La révélation (§6.3) est la seule scène WebGL, en Three.js avec le post-traitement `postprocessing` (bloom, vignette, grain, balance des blancs, aberration chromatique et saleté d'objectif, tonemapping ACES, MSAA à deux échantillons ; voir l'étalonnage au §6.3). Pixel ratio plafonné à 1,5. Sur mobile (pointeur grossier ou petit écran) : ni reflet des baies, ni ombres, ni MSAA ; la lumière précalculée reste entière ; sans WebGL, affichage direct.
- `prefers-reduced-motion` désactive l'inclinaison et le balayage, garde le rendu statique.

### 8.3 Barre de qualité

- La carte se lit en une seconde : la note, le tier, le portrait, puis les stats.
- Aucun texte ne déborde. Les noms longs se réduisent, les statuts se tronquent avec des points de suspension.
- L'image partagée est pixel-identique à la carte à l'écran.
- Contraste suffisant sur chaque tier, y compris Or et Icon.
- Un avis extérieur valide le look avant d'écrire le backend.

## 9. Stack et architecture

Reprendre les habitudes des autres projets Azerit, pas de nouvelle stack.

- **Front** : Vite, React 19, TypeScript, CSS simple avec variables, comme `../LandingPage`. Aucune librairie UI.
- **Backend** : Node 22, TypeScript, Hono. Endpoints : `POST /api/card` (pseudo ou PDF) qui répond un id et traite en tâche de fond, `GET /api/card/:id` pour le résultat, `GET /c/:id` page rendue côté serveur avec les balises OG, `GET /og/:id.png` et `GET /og/:id-portrait.png`.
- **IA** : via OpenRouter (API compatible OpenAI, appelée en `fetch`), sortie structurée par schéma, température zéro, barème et consignes en cache de prompt. Haiku 5.5 (`anthropic/claude-haiku-5.5`) par défaut dans `.env`.
- **GitHub** : REST et GraphQL avec un token serveur. Plus tard, une app OAuth pour le mode roast.
- **PDF** : extraction de texte côté serveur, en mémoire, puis suppression.
- **Images** : rendu du composant carte en SVG puis PNG côté serveur (satori et resvg), mis en cache sur disque.
- **Stockage** : SQLite, une table `cards` avec id, date, source, pseudo, JSON de la carte, email optionnel, jeton de suppression. Jamais le texte du CV.
- **Déploiement** : Docker, docker-compose, extrait Caddy, comme `../App` et `../Linkedin_mcp`. Sous-domaine à confirmer, proposition `skills.azerit.tech`.
- **Variables d'environnement** : `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `BASE_URL`, `DB_PATH`, `LEADS_ENDPOINT`.
- **Mesure** : le même outil d'analytics que la landing, quatre événements : `card_generated`, `card_shared`, `card_email`, `cta_azerit_clicked`.

Le barème (§4.4, §4.5), le catalogue de statuts (§5) et la liste des mots creux vivent dans trois fichiers de données séparés du code, pour qu'on puisse les ajuster sans toucher à la logique.

## 10. Lien avec azerit.tech

- L'outil vit sur son sous-domaine, pas dans la landing : audiences et tons différents, et la landing reste un site statique.
- Trois points de contact, pas plus : le CTA sous la carte, une ligne sous la section « Read the work, not the CV » de la landing (« Curious what your own GitHub says about you? Get your card. »), un lien dans le pied de page.
- Pas d'entrée dans la navigation principale.

## 11. Données et RGPD

- On stocke : les faits publics GitHub déjà calculés, les constats de l'IA, les notes, les statuts, l'email si donné, la photo LinkedIn si la personne l'a connectée. On ne stocke pas : le fichier CV, son texte, les fichiers de code lus.
- Conservation : 90 jours, puis suppression automatique de la carte et de ses images, sauf si la personne a laissé son email.
- « Supprimer ma carte » : lien avec jeton envoyé sur la page de résultat et dans l'email.
- Une carte générée sur le pseudo de quelqu'un d'autre repose sur des données publiques et reste en mode taquin. Le propriétaire du pseudo peut la faire supprimer en prouvant le compte via OAuth.
- Page de confidentialité courte, en FR et EN, qui dit tout ça.

## 12. Garde-fous

- Vingt cartes par adresse IP et par jour.
- Une carte par pseudo par 24 h, servie depuis le cache.
- Timeout de 30 secondes par carte, au-delà message d'erreur honnête et pas de carte vide.
- Budget de tokens par carte plafonné, coût suivi par jour.
- Tout ce qui sort de l'IA est validé par schéma, une sortie invalide relance une fois puis rend une carte à fiabilité réduite sans TEC.

## 13. Ce qu'on mesure

Cartes générées, part partagée, part avec email, clics vers azerit.tech, demandes de démo attribuées. Un tableau par semaine, pas plus.

## 14. Ordre de construction

Chaque étape a sa définition de « fini ». On ne passe à la suivante qu'une fois la précédente validée.

1. **Maquette de la carte.** HTML et CSS dans ce repo, données fictives, les quatre tiers et les cartes spéciales, inclinaison et holo, version mobile. Fini quand Jacques et un avis extérieur veulent la partager telle quelle.
2. **Collecte GitHub et barème.** Code pur, sans IA, sortie JSON. Fini quand cinq profils connus donnent des notes qui paraissent justes et que la calibration du §4.6 est notée.
3. **Lecture par l'IA.** Les deux appels, schémas, cache de prompt. Fini quand TEC et les statuts de l'IA sont stables sur trois exécutions du même profil.
4. **La page complète.** Entrée, attente, révélation, carte, partage avec URL et images serveur. Fini quand un lien collé sur LinkedIn affiche la carte.
5. **Carte CV et comparaison.** Extraction, barème CV, vue comparée, image comparée.
6. **Déploiement.** Docker, Caddy, sous-domaine, analytics, lien depuis la landing, page de confidentialité.
7. **Après lancement** : mode roast avec OAuth, Team of the Week, percentiles.

## 15. Décisions ouvertes

- Le nom de l'outil et le sous-domaine.
- Autoriser ou non la génération sur le pseudo de quelqu'un d'autre en v1 (proposition : oui, en mode taquin).
- Le modèle pour la lecture de code, à trancher par la calibration.
- L'outil d'analytics, à aligner sur la landing.

## 16. Décisions prises

*Ajoutées le 14 octobre 2026, au lancement de la construction.*

- **Rendu de la carte : un seul composant SVG React** (`shared/card/`), rendu dans le navigateur et côté serveur par `react-dom/server` puis resvg, avec les mêmes polices TTF (`server/fonts/`). Satori n'est pas utilisé : son sous-ensemble CSS empêche d'avoir une image pixel-identique à la carte à l'écran (§8.3). Les effets (inclinaison, holo, balayage) sont des calques CSS posés au-dessus du SVG dans le navigateur, absents de l'image partagée.
- **Polices côté serveur** : resvg ne parcourt pas une liste `font-family`, il prend la police par défaut quand le premier nom est inconnu. Chaque clé de police (`shared/card/fonts.ts`) résout donc un fichier TTF précis. resvg-js 2.6 ne décode pas le webp : un avatar webp retombe sur les initiales.
- **Un seul paquet** : `web/` (Vite, React 19), `server/` (Hono, Node 22, exécuté par tsx), `shared/` (types, composant carte, fixtures), `data/` (barème, statuts, mots creux).
- **Génération sur le pseudo de quelqu'un d'autre en v1** : oui, en mode taquin (proposition du §15 retenue).
- **Analytics** : la landing n'embarque aucun outil d'analytics. Les quatre événements du §9 sont enregistrés par le serveur dans une table `events` SQLite (`POST /api/event`) et relayés à `LEADS_ENDPOINT` si défini.
- **Fournisseur IA : OpenRouter** à la place de l'API Anthropic directe (demande de Jacques, 14 octobre 2026). Mêmes modèles Claude, appelés par `https://openrouter.ai/api/v1/chat/completions` avec `response_format` json_schema strict et `cache_control` sur le prompt système. Modèles surchargeables par `AI_MODEL_CODE` et `AI_MODEL_CV`, budget du jour par `AI_DAILY_BUDGET_USD`.
- **Modèle IA : Haiku 5.5** (`anthropic/claude-haiku-5.5`) à la place de Haiku 4.5 (demande de Jacques, 14 octobre 2026) : successeur direct, 0,10 $ / 0,50 $ par million de tokens sur OpenRouter contre 1 $ / 5 $, soit dix fois moins cher, avec `structured_outputs`. Comme Sonnet et Opus 5, il refuse `temperature` : le client ne l'envoie pas (sinon OpenRouter répond 404 avec `require_parameters`). Réglé par `AI_MODEL_CODE` et `AI_MODEL_CV` ; la valeur de repli du code reste Haiku 4.5 tant que la calibration (§4.6) n'a pas tourné sur 5.5.
- **Photo LinkedIn** (demande de Jacques, 14 octobre 2026) : après la carte, le créateur (celui qui détient le jeton de suppression) peut cliquer sur « Mettre ma photo LinkedIn ». Le bouton passe par « Sign in with LinkedIn using OpenID Connect » (scopes `openid profile`) et récupère le claim `picture`. Pas de scraping de LinkedIn : c'est interdit par leurs conditions, bloqué par le mur d'authentification, et ça permettrait de mettre la photo de quelqu'un sur une carte qu'il n'a pas demandée. La photo est téléchargée, stockée avec la carte et supprimée avec elle. Le token LinkedIn n'est jamais conservé. Les variables `LINKEDIN_CLIENT_ID` et `LINKEDIN_CLIENT_SECRET` sont nécessaires ; sans elles, le bouton est masqué.
- **Nom et sous-domaine** : « Testyourskills » et `skills.azerit.tech` en attendant un choix.
- **Onboarding raccourci** (demande de Jacques, 14 octobre 2026) : les trois raccourcis du §6.1 (URL directe `/{pseudo}`, collage et dépôt n'importe où, champ dans le bandeau visiteur) et le focus automatique sur desktop. La route `/{pseudo}` est servie par le repli SPA du serveur et traitée côté navigateur : aucun appel GitHub ou IA tant que le JavaScript ne tourne pas, donc aucun coût sur un crawl. Les premiers segments `api`, `og`, `c`, `auth`, `avatar`, `assets`, `privacy` et `confidentialite` ne sont jamais pris pour un pseudo. Les onglets GitHub / CV et le lien « les deux » restent : l'idée d'un champ unique sans onglets est écartée pour l'instant, parce qu'elle cacherait le chemin CV qui porte le message.

### 16.1 Barème : ajustements de la première version (0.1.0)

Observés sur des profils publics connus. Notes obtenues sans lecture IA (TEC au repli 50), puis avec un `level` 4 simulé :

| Profil | Sans IA | Level 4 |
|---|---|---|
| sindresorhus | Or 85 | Icon 94 |
| torvalds | Argent 71 | Or 80 |
| gaearon | Argent 69 | Or 78 |
| tj | Argent 65, Flashback | Argent 74 |
| compte vide | Bronze 34 | — |

La calibration du §4.6 sur les dumps de sourcing reste à faire : leur lecture est refusée aux agents, car ce sont des données personnelles. Jacques doit la faire lui-même.

- **Flashback et Archéologue** demandent en plus 26 semaines actives sur 52 au plus. Sans cette condition, la règle des 60 % d'activité de plus de cinq ans touchait tous les vétérans encore actifs.
- **Statut de repli** « Casier vierge » (positif) quand aucune règle ne se déclenche.
- **Statut posé par l'IA** : il passe en tête de son ton. Quand la carte n'a aucun statut positif mais qu'un positif s'applique, il remplace le troisième.
- **Outillage reconnu en plus** : biome, xo, golangci, rustfmt, clippy, pre-commit. Un tsconfig qui étend une config stricte connue compte comme strict.
- **Tests reconnus en plus** des dossiers : des motifs de fichiers (`*.test.ts`, `_test.go`, `test_*.py`…).
- **Poste** : score par part d'octets du langage, plus 3 points par dépendance reconnue, plus les marqueurs d'arbre et les topics. FS quand FE et BE dépassent tous deux la moitié du meilleur score, FS par défaut.
- **« Migre de framework »** : les frameworks sont comptés par famille (react, next et gatsby font un seul framework).
- **Horaires** : l'API GitHub ne donne les dates qu'en UTC. Le fuseau dominant est lu dans l'en-tête `Date:` de six patchs de l'échantillon, UTC si inconnu.
- **IA et AI** ne comptent comme mots creux qu'en majuscules, et pas quand le CV décrit un projet IA.
- **Fiabilité de la carte CV** :
  - TEC et SHIP : au moins un rôle ;
  - ARCH, DOC et BUZZ : au moins 150 mots ;
  - XP : des années déclarées ou un rôle daté.
- **CV hors profil dev** : poste PM, sauf si l'IA a dit DESIGN.
- **Égalité dans la comparaison** : « CV et code à égalité. Rare, donc suspect. »
- **Langage principal** (barème 0.1.1) : chaque repo vote pour son langage principal avec un poids de 1 + ln(1 + activité), les octets départagent les égalités, les langages de balisage ne comptent qu'à défaut. Un seul repo énorme ne peut plus l'emporter : le repo Lean de gaearon donnait « lean », il donne maintenant « javascript ».
- **Coût GitHub** : environ 45 requêtes par carte, soit environ 200 cartes par heure avec un seul token. Le cache de 24 h est donc indispensable.
- **Révélation en 3D** (14 octobre 2026) : les deux versions CSS (tremblement-flash-retournement, puis stade en CSS) ont été refusées parce qu'elles ne ressemblaient pas au pack opening de FUT. La révélation est désormais une scène Three.js (`web/src/three/walkout.ts`), seule exception à la règle « pas de WebGL » du §8.2, avec affichage direct sans WebGL. Elle dure huit à neuf secondes au lieu de trois, reste sautable, et se termine par une passation au pixel près à la carte HTML. Le compte des stats a disparu avec elle : comme dans le jeu, seule la note claque.
- **Walkout FC 27** (15 octobre 2026) : la première scène 3D (tunnel procédural, silhouette plate, carte sans épaisseur) a été jugée « pas terrible » : elle avait l'air plate. Elle est remplacée par la séquence du walkout de FC 27 transposée en dev (§6.3), et la règle « aucun asset » tombe : photo de stade, personnage 3D et police 3D, 1,5 Mo préchargés pendant l'attente. Correspondances : nation → langage, championnat → source (GitHub, CV ou les deux), club → employeur, double walkout → comparaison. Le joueur qui sort est remplacé, à la demande de Jacques, par un dev assis à son poste qui code et se retourne. Durée allongée à environ dix-neuf secondes pour un walkout (vingt-cinq dans le jeu), toujours sautable. Bronze et Argent s'ouvraient d'abord directement et l'Or avait une version courte (« board »), comme dans le jeu ; à la demande de Jacques, tous les tiers ont maintenant la séquence complète, pour que chacun vive le moment qu'on partage. Le même jour, le stade a été remplacé, à la demande de Jacques, par un ascenseur qui monte jusqu'à l'étage du dev et s'ouvre sur un open space de nuit : un décor centré sur le dev et l'entreprise, qui parle à tout le monde, pas seulement aux joueurs de FIFA. Correspondances ajoutées : la note donne l'étage d'arrivée, chaque palier de note affiche un statut pendant la montée (« Touriste » à « Cheat code »), et le double walkout devient deux flèches ▲▲.
- **Open space précalculé dans Blender** (16 octobre 2026) : à la demande de Jacques (« le meilleur rendu possible, le plus réaliste »), le décor fixe de l'open space quitte le code pour Blender, qui en précalcule la lumière (§6.3). Mesuré sur un MacBook M1, fenêtre de 1440 × 900 : les seize lumières en direct coûtaient à elles seules environ 35 ms par image ; l'open space passe de 85 à 41 ms par image, l'ouverture des portes de 79 à 50 ms, la cabine de 64 à 44 ms, avec un rendu bien plus réaliste (rebonds, plafond éclairé par les suspensions, ombres de contact). Le reflet du sol en béton disparaît avec la moquette, qui ne reflète pas ; les baies reflètent le bureau à la place. Le mobilier vient de bibliothèques libres quand elles ont mieux que le code (Sketchfab CC BY, Poly Haven CC0), téléchargé et préparé par script ; les bureaux et suspensions sont modélisés dans Blender faute de modèle libre crédible. Les GPU Metal ne servent pas au calcul en tâche de fond : il tourne sur processeur.
- **Cabine précalculée dans Blender** (16 octobre 2026) : pour mettre la cabine au niveau de l'open space, sa lumière quitte le code pour Cycles (§6.3). La coque reste en code, parce que tout ce qui y bouge ou change par carte (portes, afficheur, boutons, filets du tier, pack) s'y accroche et que ses cotes étaient déjà justes ; aucun modèle libre de cabine n'était plus crédible. Gain visible sur les captures : festons nets sur le noyer, ombres des mains courantes et de leurs platines, rebonds de la pierre et de l'inox, plus de teinte bleue du studio dans les reflets (la boucle qui donnait la carte du studio aux matières écrasait celle de la cabine). L'atlas pèse 13 Ko ; le calcul en code qu'il remplace prenait environ 0,46 s de processeur pendant l'attente. Le temps d'image pendant la montée ne bouge pas (46 ms dans les deux cas, mesuré en alternance sur un M1 très chargé, 1440 × 756 à 2×) : il est dominé par le post-traitement, pas par la cabine.
- **Plus de profondeur de champ, MSAA à deux échantillons** (17 octobre 2026) : à la demande de Jacques, pour alléger le post-traitement. Mesuré au chronomètre du processeur graphique sur le M1 très chargé (valeurs bruitées) : le post-traitement pesait 20 à 50 ms par image selon le moment, les ombres presque rien. Le flou de profondeur était une passe plein écran entière (2160 × 1218 en demi-flottants) ; il disparaît, tout est net. L'anticrénelage passe de quatre à deux échantillons. La tonalité reste en fin de chaîne : le bloom et la balance des blancs ont besoin de l'image linéaire, avant elle.
- **Une vraie cabine à la place du code** (16 octobre 2026) : à la demande de Jacques, pour qui Sketchfab a des modèles très réalistes, ascenseurs compris, et qui veut ne générer presque rien nous-mêmes, la cabine construite en code laisse place à un modèle de Sketchfab. Candidats regardés (CC BY ou CC0, téléchargeables) : les cabines de thyssenkrupp de Mikhail-9971 (justes mais coupées pour l'exposition, sans paroi gauche ni portes, textures de 512 px), « Modern Apartment Elevator » (côté palier seulement), « Elevator Interior Scene » (gris, sans matières), « Luxury Elevator » (189 000 faces, vue de l'extérieur), plusieurs scans (graffitis, gaines) et des cabines de jeu. « JNKM Design - Elevator Cab Interior » l'emporte : une cabine complète dessinée par un studio de cabines, la façade, les portes et la boîte à boutons vues de l'intérieur, presque aux cotes de la scène (2 m de large, portes de 0,99 × 2,07 m), 46 000 faces dont 34 000 pour les boutons, ramenées à 21 000. Le précalcul de lumière de la cabine (`cabin.py`) disparaît avec elle ; restent en code les portes qui s'ouvrent, l'afficheur, le bouton et les numéros de l'étage d'arrivée, les filets du tier et la lumière de la gaine. Revue indépendante le même jour, dans une seconde session : 84 modèles d'ascenseur téléchargeables passés au crible par l'API de Sketchfab (CC BY ou CC0 seulement, un outil marketing exclut le CC BY-NC) ; la seule autre vraie cabine, « ELEVATOR » de MINH (boîte chromée d'immeuble, 232 000 faces, 37 Mo, textures bruitées), et celle de JNKM Design ont été rendues dans Cycles depuis la position de la caméra, avec six spots chauds : brutes, aucune ne vaut l'ancienne cabine en noyer ; c'est l'adaptation (verre laqué, joints, reflets de la cabine) qui fait le résultat. Les modèles d'ascenseur les plus appréciés du site ne sont pas téléchargeables (vitrine seulement) ou sont CC BY-NC ; la boutique payante de Sketchfab n'existe plus. Devant la cabine en verre blanc, Jacques a envoyé en exemple « Elevator with Animation LOWPOLY » d'EFX (CC BY, 1 072 faces, bois en une texture de 512 × 256 px, portes chromées plates, sol en tôle larmée), rendu lui aussi depuis la caméra : flou de près. Il a choisi de garder le modèle de JNKM Design en habillant ses parois du noyer de la scène, plutôt que d'importer ce modèle ou de revenir à la cabine en code.
- **Révélation préparée avant de jouer** (16 octobre 2026) : à la demande de Jacques (« une plus grande partie peut être chargée avant »), la scène 3D se télécharge dès les premières saisies dans le formulaire au lieu d'attendre l'envoi, et l'attente du scoring sert à la préparer (§6.3). Mesuré sur un M1 : 1,35 s de blocage au début de la révélation (construction 0,46 s, compilation des shaders à la première image 0,89 s) ramenées à 0,37 s. Les textures d'éclairage passent en WebP qualité 75 : 3,3 Mo → 0,84 Mo, sans différence visible ; la scène pèse environ 7 Mo au lieu de 9,4.
- **Poste du dev en vrais modèles** (16 octobre 2026) : à la demande de Jacques (Sketchfab a des modèles très réalistes : ne presque rien générer nous-mêmes), le bureau construit en code (plateau arrondi, piètement en T) devient un vrai bureau assis-debout de Sketchfab, et la souris, le sous-main et tout ce qui traîne sur le bureau sont de vrais modèles (§6.3). Le bureau passe de 2,45 × 0,9 m à 2,2 × 0,84 m (plateau), assez pour les trois écrans ; la lampe recule de 4 cm pour ne pas déborder. Le plateau garde le noyer de la scène, posé sur des uv en mètres que `prepare.py` calcule. Pas de bras d'écran : aucun modèle libre crédible. Sur le plateau, de vrais modèles aussi pour ce qui traîne sur un poste : casque, carnet en cuir et stylo plume, bloc de post-it, téléphone retourné, gourde inox, plante grasse. Temps d'image inchangé, mesuré en masquant puis montrant tous ces objets et le bureau à l'instant 13,5 (107 ms dans les deux cas, M1 très chargé).

## 17. Virage : l'univers de GTA 6 à la place de FIFA

*Décision de Jacques du 31 octobre 2026 : « je veux faire l'univers de GTA 6 plutôt que FIFA ». Cette section est la nouvelle cible. Les sections 3, 6.2, 6.3 et 8 ci-dessus décrivent la version FIFA ; elles restent comme historique et comme réservoir de ce qu'on garde, jusqu'à leur réécriture étape par étape (§17.9). Ce qui ne parle ni de carte ni de révélation (le jugement §4, les statuts §5, le partage §7, la stack §9, les données §11, les garde-fous §12) ne change pas.*

### 17.1 Pourquoi ça marche mieux que FIFA

- **Le calendrier.** GTA 6 sort le 19 novembre 2026 sur PS5 et Xbox. Pendant deux mois, c'est l'univers dont tout le monde parle, joueurs ou non. Une carte FIFA, il faut aimer le foot ; GTA, tout le monde reconnaît les étoiles de recherche, l'écran « Wasted », la police du logo et le coucher de soleil rose sur les palmiers.
- **La thèse d'Azerit tient dans la métaphore sans forcer.** Le CV, c'est le délit : il déclare ce que le code ne prouve pas. Le GitHub, c'est la pièce à conviction. L'IA, c'est le flic pressé qui boucle le dossier en neuf secondes. La carte devient une **fiche de police**, les statuts deviennent des **chefs d'accusation**, la note devient un **niveau de recherche** en étoiles, et la comparaison CV × GitHub devient **le butin** : ce que le CV a volé au code. Le statut de repli existant, « Casier vierge », était déjà dans le ton.
- **La promesse marketing s'y lit mieux** : les cinq meilleures cartes de la semaine, c'est la liste des **cinq plus recherchés**.

### 17.2 Ce qu'on prend, ce qu'on ne prend jamais

On prend l'**univers** : la côte au crépuscule, les néons rose, orange et violet, les palmiers en ombre chinoise, l'art déco, les étoiles de recherche, le HUD (mini-carte en bas à gauche, étoiles en haut à droite), la plongée de caméra du changement de personnage, les cartons de fin de mission, l'écran de chargement à illustrations peintes avec sa barre jaune, le compteur d'argent vert, la radio de police.

On ne prend **jamais** les marques ni les fichiers : ni « Grand Theft Auto », ni « GTA », ni « VI », ni « Rockstar », ni « Vice City », ni « Leonida », ni le logo, ni une capture, un modèle, une musique ou une voix du jeu, ni ses personnages. Take-Two attaque bien plus volontiers qu'EA les projets qui reprennent ses marques ; un pastiche de style est licite, une reprise de marque ne l'est pas. Les lieux et noms sont les nôtres, ou aucun. Pas d'« -ida » ni de « Vice » dans les textes.

**Typo.** La police du logo du jeu, Pricedown (Typodermic), est gratuite pour un usage bureau, commercial compris, mais **pas en police web** : il faut une licence à part (Fontspring). Donc : Barlow Condensed 800 (déjà dans le projet) pour les gros chiffres et les cartons, avec le dégradé coucher de soleil ; une licence web Pricedown s'achète seulement si Jacques veut l'écran « Wasted » à l'identique.

**Couleurs** (variables CSS, définies une fois) : nuit `#0a0a1f`, rose néon `#ff3fa4`, orange `#ff7a3d`, jaune `#ffd23f`, cyan `#3fd8ff`, violet `#7b3fe4`, étoiles blanc chaud `#fff4e0`, argent du HUD vert `#8ce06b`. Le **dégradé coucher de soleil** va du jaune à l'orange, au rose puis au violet, en diagonale.

### 17.3 La fiche (remplace la carte du §3)

Même proportions (9 sur 13, 360 × 520 sur desktop), même anatomie de données ; seul le rendu change. La note globale, les six stats, le barème, la fiabilité et les statuts sont strictement les mêmes qu'avant (§3.3 à §3.5, §4, §5). De haut en bas :

- **Haut gauche** : les **étoiles de recherche**, cinq emplacements, allumées selon la note ; dessous la note globale en très grand, remplie du dégradé coucher de soleil ; dessous, en mono, le libellé du niveau, la spécialité (le poste) et l'arme de prédilection (le langage principal, avec son logo).
- **Haut droite** : la marque Azerit, petite, inchangée.
- **Centre** : le **portrait en photo d'identité judiciaire** : un mur gris-bleu gradué (170, 180, 190 cm), l'avatar GitHub ou la photo LinkedIn devant, légèrement posterisée pour tirer vers l'illustration peinte du jeu, et dans les mains un **écriteau** noir : le pseudo ou le nom en grandes lettres, dessous le numéro de dossier (l'id court de la carte) et la date. Sans photo, les initiales sur le mur.
- **Dessous** : l'**affiliation** (l'employeur déclaré, « Loup solitaire » sinon). Pas « gang » : une entreprise ne veut pas de ce mot sur une image partagée.
- **Stats** : les six, sur deux colonnes, en **barres segmentées** façon compétences du jeu (dix segments, valeur à droite), BUZZ en orange d'alerte comme aujourd'hui.
- **Chefs d'accusation** : un à trois statuts, en liste à puces colorées par ton, à la place des pastilles. Le ton reste taquin ; on accuse des pratiques, jamais une personne (§2.4). « Casier vierge » quand rien ne s'applique.
- **Pied**, en mono : « Interrogé par une IA pendant 9 s · preuves 34 % ». La fiabilité devient les preuves.

**Les étoiles et les niveaux** (la note pilote tout le rendu, comme le tier avant) :

| Étoiles | Note | Niveau (FR) | Niveau (EN) | Rendu |
|---|---|---|---|---|
| ★ | moins de 45 | Petit délit | Petty crime | nuit sourde, un seul néon ambre |
| ★★ | 45 à 59 | Suspect | Suspect | nuit, néon rose discret |
| ★★★ | 60 à 74 | Recherché | Wanted | néon rose et cyan |
| ★★★★ | 75 à 89 | Dangereux | Dangerous | dégradé coucher de soleil, palmiers |
| ★★★★★ | 90 et plus | Ennemi public | Public enemy | dégradé complet, holo, étoiles qui pulsent |

Les quatre tiers du §3.2 restent dans le code et le barème (Bronze couvre ★ et ★★) ; seul le rendu et le vocabulaire changent. Les cartes spéciales deviennent : **Wonderkid → « Nouveau en ville »**, **Flashback → « Affaire classée »** (cold case), **Team of the Week → « Les 5 plus recherchés »** de la semaine. Mêmes règles de déclenchement.

Les effets CSS (inclinaison, reflet, balayage) sont gardés ; le reflet holographique n'est plus métallique mais néon : il prend les couleurs du dégradé.

### 17.4 La révélation (remplace le §6.3) : la plongée du changement de personnage

*Abandonnée le soir même : voir §17.10. L'ascenseur reste, transposé. Le texte ci-dessous est gardé pour mémoire : il décrit ce qu'on aurait fait, et ce qu'on pourra reprendre (ville 3D, plongée) si Jacques y revient.*

La séquence la plus reconnaissable du jeu : la caméra part du ciel, survole la ville et plonge jusqu'au personnage, surpris dans sa vie de tous les jours. Chez nous, elle plonge jusqu'au dev à son bureau. Toujours **un seul plan-séquence, dans l'axe, qui ne fait qu'avancer**, les règles de caméra du §6.3 restent. Environ dix-huit secondes, sautable. Dans l'ordre :

1. **Le ciel.** Nuages, la côte très loin en bas, l'heure bleue juste après le coucher du soleil, la mer d'un côté, la ville en néons de l'autre. Le HUD apparaît : la mini-carte en bas à gauche avec le point du dev, cinq emplacements d'étoiles vides en haut à droite. Clic ou délai : la plongée commence. (Le pack qu'on ouvrait disparaît : on ne déballe pas une fiche de police.)
2. **La plongée : les étoiles, c'est la note.** La caméra descend vers la ville, de plus en plus vite puis freine. À chaque seuil franchi (45, 60, 75, 90), une **étoile s'allume** avec le crépitement de la radio de police ; les statuts de la montée (le tableau « Touriste » à « Cheat code » du §6.3, inchangé) passent en messages radio sur le HUD, un à la fois, 0,9 s, comme les paliers de l'ascenseur. Les indices chromés (poste, langage, source, employeur) deviennent des lignes du HUD, dans le même ordre : spécialité, arme, dossier (GitHub, CV ou les deux), affiliation.
3. **La ville.** Palmiers, façades art déco aux néons rose et cyan, l'océan, une avenue du bord de mer ; la caméra traverse la baie vitrée d'une tour et entre dans l'open space.
4. **Le dev** : exactement celui d'aujourd'hui, assis à son poste, qui code puis se retourne. L'open space garde ses meubles et son précalcul de lumière ; seule la lumière change : la nuit de bureau à 4 500 K laisse place aux néons de la ville qui entrent par les baies, rose d'un côté, cyan de l'autre, avec le ciel du crépuscule derrière. Clic ou Espace : feux d'artifice sur la baie, comme avant.
5. **Le carton de fin de mission.** Plein écran, le niveau en très grand dans le dégradé (« RECHERCHÉ »), la note dessous, et le roulement de batterie du jeu synthétisé en direct (Web Audio, aucun fichier, comme le son de l'ascenseur). Même carton pour tous les niveaux : un « Wasted » gris au ralenti pour ★ serait drôle, mais il vise la personne plus que la pratique ; reste à trancher par Jacques (§17.8).
6. **La fiche se forme** et **la passation** au pixel près à la carte HTML : inchangées (§6.3, étapes 6 et 7).

**Ce qu'on garde du travail FIFA** : le dev scanné et ses animations (`player.ts`), le poste et ses objets (`workstation.ts`), l'open space et son pipeline de précalcul (`office.py`, `baked.ts`), le rail de caméra en splines, la carte 3D et la passation (`cardMesh.ts`, `cardTexture.ts`), le préchargement et l'échauffement de la scène, l'étalonnage photographique (albédos, ACES, objectif), la synthèse sonore (elle change de sons : radio, sirène lointaine, roulement, plus de moteur ni de « ding »), et le pipeline de ville (`city.py`, `osm.py`) : on remplace l'emprise `AREA` de La Défense par un front de mer de style Miami Beach, rendu à l'heure bleue avec des façades néon, et la texture de ville devient le sol de la plongée, pas seulement le fond des baies.

**Ce qui part** : la cabine d'ascenseur et tout ce qui s'y accroche (`cabin.ts`, `cabin.glb`, l'afficheur d'étage, les boutons, le son de l'ascenseur), les objets chromés de la montée, la photo de cabine, l'étape « pack ».

**Ce qu'il faut de neuf** : le ciel et les nuages, la ville vue de dessus (OSM donne les emprises, il faut un rendu praticable de haut puis de face : soit deux textures, soit des blocs extrudés simples avec les façades texturées), des palmiers (Poly Haven ou Sketchfab CC BY, comme le reste), le HUD en 2D par-dessus la scène (mini-carte, étoiles, messages), le carton de fin, les nouveaux sons.

### 17.5 L'attente (remplace le §6.2) : l'écran de chargement

L'écran de chargement du jeu, reconnaissable entre tous : des illustrations peintes qui défilent en fondu, et en bas une **barre jaune** qui avance. Les illustrations sont un jeu fixe d'une dizaine d'images de devs et de bureaux dans le style, générées une fois par IA et retouchées, jamais par visiteur (coût, délai, et droit à l'image). Les messages du §6.2 (« Lecture de tes {n} commits « wip »… ») passent sous la barre, à la place des astuces du jeu. La préparation de la scène 3D pendant l'attente ne change pas.

### 17.6 L'accueil et les textes

- Le fond de nuit garde ses hex ; le dégradé coucher de soleil entre dans le titre et sur la fiche. Deux palmiers en ombre chinoise dans les coins, rien d'autre d'ajouté : la règle « pas un mot de plus » du §6.1 tient.
- Promesse : « Ta fiche de dev. Les 5 plus recherchés ont un entretien. »
- Sous la fiche : « Pourquoi cette note ? » devient **« Pièces à conviction »** (même contenu : la formule et les axes). « Contester ma note » devient **« Appeler mon avocat »**. « Passer en mode roast » devient **« Garde à vue »** (toujours réservé au propriétaire du compte via OAuth). « Reçois ta carte par email » devient « Reçois ta fiche ». Le CTA Azerit ne change pas.
- La comparaison (§6.5) s'appelle **« Le butin »** : les deux fiches côte à côte, et entre elles le delta par stat ; le titre devient un compteur d'argent vert façon HUD : « Ton CV a volé {n} points à ton code » ou « Ton code vaut {n} points de plus que ton CV. Change de CV. ».
- Textes de partage : « Fiche ★★★★, 78. Chef d'accusation : « Commits : fix, fix2, final fix ». Interrogé par une IA en 9 s. Fais la tienne : {url} ».
- Le nom : « Grand Theft CV » dit toute la thèse en trois mots, mais c'est un dérivé direct d'une marque déposée ; à ne pas utiliser sans avis juridique. Le nom reste « Testyourskills » et le sous-domaine `skills.azerit.tech` (§16) tant que ce n'est pas tranché.

### 17.7 Maquette

`web/gta.html`, HTML et CSS sans React, données fictives (les mêmes profils que `shared/fixtures.ts`), les cinq niveaux, la fiche de Jacques et « Les 5 plus recherchés ». C'est l'étape 1 du §14 rejouée : fini quand Jacques veut la partager telle quelle. Rien de l'existant n'est retiré avant cette validation.

### 17.8 À trancher par Jacques

- Un « Wasted » gris au ralenti pour ★ (moins de 45), ou le même carton pour tous.
- Acheter la licence web de Pricedown (une cinquantaine d'euros sur Fontspring) pour les cartons et la note, ou rester sur Barlow Condensed.
- Le mot pour l'employeur sur la fiche : « Affiliation » (proposé) ou autre chose.
- Les illustrations de l'écran de chargement : générées par IA (proposé), ou commandées à un illustrateur.
- Garder le nom « Testyourskills » ou prendre un risque sur « Grand Theft CV ».

### 17.9 Ordre de construction

1. **Maquette de la fiche** (§17.7). Fini quand validée sur captures, desktop et mobile.
2. **Le composant carte** : `shared/card/Card.tsx` et `themes.ts` réécrits pour la fiche, rendu SVG identique à l'écran et en PNG, les cinq niveaux et les trois spéciales, les effets CSS adaptés. Fini quand la galerie et `render-fixtures` sortent les fiches.
3. **La révélation** : la ville de style Miami Beach depuis OSM (`city.py`), le ciel, la plongée, le HUD, la relumière de l'open space, le carton de fin, les sons ; retrait de la cabine. Fini quand la séquence tourne en un plan-séquence sautable sur M1 et mobile, aux temps d'image d'aujourd'hui ou mieux.
4. **L'attente** en écran de chargement, les illustrations.
5. **Textes et accueil** : i18n FR et EN, textes de partage, OG.
6. Réécriture des §3, §6.2, §6.3 et §8 à partir de ce qui a été construit, puis suppression du §17 devenu redondant.

### 17.10 Journal du 31 octobre 2026, soir : ce qui est construit

Jacques a dit « vasy », puis, la plongée à peine commitée : « l'ascenseur était bien quand même ». Décision : **l'ascenseur reste la colonne vertébrale de la révélation**, transposé dans l'univers GTA 6 ; la plongée du ciel (§17.4, commit `dfeb837`) est annulée le soir même. Les cinq points du §17.8 sont pris par défaut en attendant mieux : même carton pour tous (pas de « Wasted »), Barlow Condensed (pas de licence Pricedown), « Affiliation », illustrations par IA, nom inchangé.

**Construit et poussé** (quatre chantiers en parallèle, un commit par sujet) :

- **La fiche** (`shared/card/`, `web/src/card/`) : le composant SVG rend la fiche de police de la maquette, à l'identique à l'écran et en PNG (resvg 2.6.2 rend tous les filtres utilisés). `starsFor`, `LEVEL_LABELS`, `PALETTE` dans `shared/types.ts` et `shared/card/themes.ts` ; un thème par étoiles (`s1` à `s5`) plus les trois spéciales ; `themeOf(card)` est l'entrée, `themeFor(style)` ne sert plus qu'en compatibilité. Silhouette : rectangle arrondi de 16 (la carte 3D extrude donc un rectangle). Portrait « illustration » : saturation 1,3, posterisation à 8 niveaux, trait d'encre par laplacien 3 × 3 sur la luminance floutée ; doux, le visage reste reconnaissable ; pour aller vraiment vers les affiches du jeu il faudra une génération d'image. Numéro de dossier = id de la carte en majuscules (6 signes), date = `createdAt` en `jj.mm.aa`. Les compositions serveur (aperçu de lien, portrait, comparaison) lisent `themeOf` et titrent « Dangereux · 78 ».
- **La révélation** (`web/src/three/`) : la séquence de l'ascenseur de `77fd616`, inchangée jusqu'aux portes, avec par-dessus : un HUD 2D (`hud.ts`, `hud.css`) de cinq étoiles en haut à droite qui s'allument à 1, 45, 60, 75 et 90 pendant la montée, en plus de l'afficheur d'étage ; les quatre lignes du dossier en haut à gauche (Spécialité, Arme, Dossier, Affiliation) inscrites quand chaque révélation chromée repart, les révélations 3D elles-mêmes gardées et renommées (`reveal.tells`) ; les statuts de palier doublés en message radio en bas ; un crépitement radio (`radioSound.ts`) à chaque étoile par-dessus le son d'ascenseur conservé, le bouton muet coupe les deux ; un carton de fin de mission plein écran (niveau en Barlow 800 dans le dégradé, la note dessous, roulement de batterie) de 15,2 à 16,7 s, après le pivot du dev et avant la formation de la carte ; la lumière précalculée du groupe « city » teintée rose à gauche et cyan à droite (`baked.setCitySides`) et deux projecteurs rose et cyan sur le dev à la place de la lumière bleue des baies ; la couleur du niveau (`levelAccent`) pour les LED, le bouton, le clavier, la tranche de la carte, le pack et le halo. Pas de mini-carte : dans une cabine on ne va nulle part (le code reste en option). Le pack devient un scellé (« AZERIT · SCELLÉ N° 26 »), l'afficheur en veille dit « DOSSIER OUVERT ». Fin à 20,05 s (carte 16,7, claquement 17,7, passation 19,45). Mesuré sur M1, 1440 × 900 à 2× : cabine 36 à 47 ms par image, open space et carton 46 à 58 ms en course (le troisième projecteur coûte un peu ; le flou d'arrière-plan de la radio, trop cher au-dessus du canvas, a été retiré). La relumière rose et cyan se voit au plafond et sur les luminaires, peu sur le dev : à pousser si Jacques la veut plus franche.
- **L'attente** (`Waiting.tsx`, `LoadingScenes.tsx`) : l'écran de chargement, plein écran, scènes en fondu toutes les 4,6 s avec zoom lent, barre jaune sur 11 s estimées puis asymptote, messages du §6.2 dessous. **Les illustrations peintes n'ont pas pu être générées** : OpenRouter refuse toute sortie image sous 1 $ de solde et la clé du projet est à 0,26 $ (30 $ de crédits consommés). Six scènes SVG dessinées en code (toit au couchant, bureau de nuit, avenue, piscine, salle serveurs, autoroute) tiennent lieu d'illustrations : elles font plus dessin animé que le reste, c'est un bouche-trou. `scripts/gen-loading.ts` est prêt (`npx tsx --env-file=.env scripts/gen-loading.ts`, modèle `google/gemini-3.1-flash-image`, 0,50 $ / 3 $ par million de tokens, PNG dans `var/loading-src/`, WebP 1600 × 900 qualité 80 par `sharp-cli`) ; une fois les images relues et triées, les lister dans `PAINTED` suffit. Même blocage pour l'essai de portrait de Jacques « façon personnage du jeu » : à faire dès que le solde dépasse 1 $ (le modèle accepte une image en entrée).
- **Les textes** : tout le §17.6 en FR et EN ; le mot « carte » devient « fiche » partout dans l'interface (les identifiants techniques et les événements analytics gardent `card`) ; le titre du butin (« Ton CV a volé {n} points à ton code ») vit dans `data/statuses.json` ; les clés `tiers` et `tierCard` d'`i18n.ts` restent comme alias des niveaux. Accueil : titre dans le dégradé, deux palmiers en ombre chinoise, rien d'autre.
- **La ville derrière les baies** : `city.webp` est South Beach à l'heure bleue (4096 × 1258, 119 Ko, mêmes paramètres de caméra qu'avant : cylindrique 100°, −14°/+16°, donc `stage.ts` n'a pas changé). Point de vue 25,7898 N, 80,1278 O, 66 m, cap 195° : un 20e étage fictif sur la dune de la 16e rue, au nord d'Ocean Drive, face au sud. Zone OSM proche South Beach (4 457 bâtiments, 457 cocotiers), zone lointaine Brickell et le centre de Miami par une requête limitée aux tours. La requête d'eau est désactivée sur la côte (la relation de l'océan fait caler Overpass) : la terre est déduite d'une vue de dessus des rues, plages, parcs et toits, l'eau est partout ailleurs. Les cocotiers (modèle Sketchfab CC BY d'evolveduk) n'existent que dans le rendu, d'où leur mention dans `CREDITS.txt`. Vu dans la scène : ciel rose, océan à gauche, plage et hôtels de Collins Avenue à droite, tours à l'horizon. Les néons restent discrets : ils sont sur les façades qui donnent sur Ocean Drive, Collins, Washington, Española Way et Lincoln Road, vues de biais depuis la dune ; pour en voir plus, monter `E_NEON` dans `city.py` ou en poser côté plage. Les immeubles proches sont des boîtes à fenêtres en grille, plus crus que les tours de La Défense d'avant. `sky.webp` (équirectangulaire 2048 × 1024, 11 Ko) existe mais rien ne l'utilise : l'ascenseur ne montre pas de ciel. Refaire : `python3 tools/bake/osm.py`, puis `blender -b -P tools/bake/city.py -- --preview` (3 min) ou `-- --only pano,sky,check` (15 min de processeur). La ville 3D praticable prévue pour la plongée n'est plus produite.

**Non vérifié** : le rendu téléphone de la fiche, de l'attente et de l'accueil (le redimensionnement de fenêtre de Chrome par l'outil n'a pas pris, trois fois) ; à regarder sur un vrai téléphone.

**Reste à faire** : les illustrations et l'essai de portrait dès que le solde OpenRouter le permet, la vérification mobile, la réécriture des §3, §6 et §8 à partir de ce journal.

