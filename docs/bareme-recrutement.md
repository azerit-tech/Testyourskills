# Le barème de recrutement

*Proposition du 10 novembre 2026. Document de conception : rien n'est construit. Une fois construit, il devient le barème 0.4.0 et retire le bonus d'école posé sur TEC (barème 0.3.0, SPEC §18.35).*

## 0. En bref

- **Huit critères, chacun noté sur 10**, un par un : école et sélection, expérience, parcours et employeurs, stack technique, niveau du code, activité, ownership et production, open source.
- **Une note se lit dans une table de niveaux** : ce qui vaut 10, 8, 6, 4, 2. Aucun point ajouté ni retiré, aucun bonus d'un critère sur un autre.
- **Chaque critère a sa source de preuve.** LinkedIn fait foi pour l'école, les années et le parcours. GitHub fait foi pour la stack, le code et l'activité. Quand les deux parlent, on recoupe.
- **La note générale sur 100 est la moyenne pondérée des huit notes**, coefficients affichés. Rien d'autre n'y entre.
- **À côté de chaque note, une pièce** : un fait précis, daté, sourcé, qui montre qu'on a vraiment lu le dossier. C'est la démonstration de la méthode d'Azerit, et c'est ce qui doit faire dire « ils ont vu ça ? ».
- **Un critère sans donnée sort de la moyenne**, il ne vaut pas zéro. Quelqu'un qui s'est formé seul n'a pas de note d'école, et sa note générale n'en souffre pas.
- **Pour le 19 novembre** : la fiche ne change pas de dessin. Sa note devient la note du barème, et un bloc « Voici comment un recruteur d'Azerit te lit » s'ajoute sous elle. La fiche à huit barres vient après le lancement.

## 1. Ce qui s'applique ici, ce qui ne s'applique pas

Un vrai recrutement juge une personne **pour un poste**. Ici il n'y a pas de poste : tout ce qui dépend d'une offre tombe. Le reste s'applique, parfois sous une forme de jeu : ce qui élimine en vrai devient ici une note basse ou un chef d'accusation, jamais une élimination.

| Famille de critères | Ici | Sous quelle forme |
|---|---|---|
| Le cadre d'un poste : lieu, contrat, salaire, disponibilité, langue de travail, droit de travailler | Ne s'applique pas | Aucun poste à pourvoir. Rien de tout cela n'est lu, ni gardé. |
| Les années d'expérience | S'applique tel quel | Critère **Expérience**, calculé sur les postes datés. |
| Le bon métier | Forme de jeu | Un profil hors dev reçoit sa fiche (Produit, Design) ; ses critères de code restent « non prouvés ». |
| La stack : ce qui est maîtrisé, depuis quand, encore pratiqué | S'applique tel quel | Critère **Stack technique** : profondeur, largeur, fraîcheur. |
| La correspondance avec une offre : compétences exigées, secteur | Ne s'applique pas | Pas d'offre. |
| Code encore | S'applique tel quel | Critère **Activité**. |
| Ownership et mise en production | S'applique tel quel | Critère **Ownership et production**. |
| Management et recrutement | Forme de jeu | Une condition du niveau 10 du parcours, si un fait est cité. |
| Usage de l'IA pour coder | Forme de jeu | Pas noté : une trouvaille affichée (« IA dans l'atelier »). |
| Activité GitHub, niveau du code | S'applique tel quel | Critères **Activité** et **Niveau du code**. |
| La source de preuve dépend du critère | S'applique tel quel | C'est la règle centrale de la grille (§3). |
| Projets personnels et contributions chez les autres | S'applique tel quel | Stack, niveau du code, ownership, open source. |
| Dossier lisible, identité recoupée | Forme de jeu | Pas un critère : c'est l'indice « preuves » de la fiche et la mention « recoupé ». |
| Signaux de triche | Forme de jeu | Des chefs d'accusation, et des règles de comptage (§3). Jamais d'élimination. |
| Concours, hackathons, olympiades | S'applique tel quel | Niveaux de **École et sélection**. |
| Types d'employeurs, trajectoire, sélection à l'embauche | Forme de jeu | Les niveaux de **Parcours et employeurs**. |
| Open source | S'applique tel quel | Critère **Open source**, qui ne peut pas faire baisser la note. |
| Est-ce le bon moment pour approcher la personne (ancienneté au poste, attachement, chances qu'elle dise oui) | Ne s'applique pas | Voir ci-dessous. |

**Le bloc « peut-on l'approcher »** ne garde rien, ni dans la note ni en décor. Écrire en public qu'une personne est sur le départ, ou qu'elle ne bougera pas, la met en difficulté devant son employeur, et ce n'est pas un jugement sur son travail. La seule forme acceptable est celle que la personne donne elle-même : la case « ouvert aux propositions », à l'inscription aux primes (SPEC §18.4), jamais déduite de ses données.

## 2. Les données qu'on a vraiment

| Source | Ce qui existe aujourd'hui | Ce qu'il faut ajouter |
|---|---|---|
| **GitHub, collecte** | Dépôts (langage, octets par langage, étoiles, dates de création et de dernier push, commits, dépendances, topics, releases, contributeurs externes, mots du README) ; arbre des cinq dépôts actifs (tests, CI, outillage, Dockerfile, Terraform) ; calendrier de 52 semaines ; contributions par année depuis la création du compte ; 100 derniers commits de trois dépôts ; premier vrai commit ; nombre de PR fusionnées chez les autres ; site et comptes sociaux du profil ; complices. | **Où** sont les PR fusionnées (dépôt, étoiles, date) : la même requête, avec ses résultats au lieu du seul compte. Les fichiers d'agent d'IA dans l'arbre (`CLAUDE.md`, `AGENTS.md`, règles d'assistant) : aucun appel de plus. L'adresse du site d'un dépôt (`homepage`) : déjà dans la réponse, pas gardée. |
| **GitHub, lecture IA** | Niveau de 1 à 5 par dépôt lu, fichier et extrait cités, traits observés. | Rien. |
| **LinkedIn, collecte** | Titre, résumé, postes (intitulé, entreprise, dates, description), formation (école, diplôme, domaine, années), compétences. | Le type de contrat du poste (stage, alternance, freelance), que le fournisseur donne et qu'on jette. Les distinctions et prix, à vérifier sur un vrai profil. |
| **LinkedIn et CV, lecture IA** | Métier, séniorité revendiquée, postes et responsabilités, technos listées et technos rattachées à une réalisation, mentions de tests ou de CI, résultats datés, école et rang (S, A, B, C, aucun). | Par poste : le type d'employeur (liste fermée). Les signaux de sélection, avec leur extrait (concours, olympiade, hackathon, programme sélectif). Un fait d'encadrement, avec son extrait. |
| **Listes tenues à la main** | Les 79 écoles et leur rang. | Les employeurs à forte barre d'embauche. Les familles de langages. La table « techno → trace attendue dans le code ». |

**Un constat qui pèse sur toute la grille** : la lecture IA d'un même profil LinkedIn varie d'une fois sur l'autre (un à quatre postes relevés sur quatre, « produit » puis « ML », SPEC §18.35). Or un profil LinkedIn arrive déjà rangé : postes, dates, écoles. **Tout ce qui se compte se calcule donc en code sur ces champs** (années, stages, fondations, durées, trajectoire). L'IA ne fait qu'étiqueter ce que le code ne sait pas lire (type d'employeur, technos décrites, signaux de sélection), et chaque étiquette doit citer un extrait retrouvé dans le texte.

## 3. La grille

### Les règles communes

- Chaque critère est **une seule note sur 10**, lue dans sa table de niveaux. **On obtient le niveau le plus haut dont toute la ligne est remplie.** On ne part pas d'une base, on n'ajoute rien, on ne retire rien.
- **Quatre états**, affichés à côté de la note :

| État | Français | Anglais | Dans la note générale |
|---|---|---|---|
| Noté sur sa source de preuve | (rien d'affiché) | (nothing shown) | Compte. |
| Noté sur la source qui déclare seulement | « déclaré, non prouvé » | "declared, not proven" | Compte. Sa table s'arrête à 6. |
| La source existe mais ne montre rien de jugeable | « non prouvé » | "not proven" | Sort de la moyenne. |
| Sans objet, ou rien n'est dit | « non renseigné » | "not on file" | Sort de la moyenne. |

- **Non prouvé ne veut pas dire mauvais.** Un GitHub public presque vide ne vaut pas 0 en code : il vaut « non prouvé ».
- **La pièce** : chaque critère affiche, à côté de sa note, un fait précis et sa provenance (« LinkedIn, postes », « GitHub, sequence-mail »), avec un lien vers la page publique quand elle existe. Si les deux sources se confirment, l'étiquette est « recoupé » (EN "cross-checked").
- **Les signaux d'alerte sont des chefs d'accusation**, pas des points en moins : ils s'affichent, la note ne bouge pas.

Les huit critères, leurs noms et leurs coefficients :

| Code | Français | Anglais | Source de preuve | Coefficient |
|---|---|---|---|---|
| EDU | École et sélection | School and selection | LinkedIn | 1 |
| XP | Expérience | Experience | LinkedIn | 1,5 |
| EMP | Parcours et employeurs | Career path and employers | LinkedIn | 1,5 |
| STK | Stack technique | Tech stack | GitHub | 1,5 |
| CODE | Niveau du code | Code level | GitHub | 2 |
| ACT | Activité | Activity | GitHub | 1 |
| OWN | Ownership et production | Ownership and production | Les deux | 1 |
| OSS | Open source | Open source | GitHub | 0,5 |

### 3.1 École et sélection (EDU)

**Ce que ça mesure** : par quel filtre la personne est déjà passée, à l'école ou ailleurs.

**Source** : la formation du profil LinkedIn ou du CV. La liste d'écoles fixe le rang ; hors liste, l'IA est plafonnée à B. Les concours et hackathons peuvent aussi venir de GitHub (nom, topics ou description d'un dépôt).

| Note | Ce qu'il faut |
|---|---|
| **10** | Une école de rang S. Ou une médaille internationale (olympiade internationale, finale mondiale d'un concours de programmation). |
| **8** | Une école de rang A. Ou une sélection prouvée hors école : un classement cité dans un concours de code, un prix de hackathon, un programme sélectif (Google Summer of Code, bourse au mérite). |
| **6** | Une école de rang B. |
| **4** | Une école de rang C. Ou un hackathon, un concours, fait sans classement. |
| **non renseigné** | Ni école de tech, ni sélection : le critère est sans objet. |

- Avec une école **et** une sélection, on retient la plus haute des deux.
- **Sans école de tech, pas de note d'école** : le critère sort de la moyenne, et la note générale se fait sur les sept autres. Se former seul ne coûte rien. La règle du §4 va plus loin : ce critère ne peut jamais faire baisser la note de personne.
- Ne comptent pas comme école : semestre d'échange, école d'été, MOOC, certificat, formation continue. À écrire dans la consigne de lecture : aujourd'hui, un semestre d'échange dans une école de rang S pourrait donner le rang S.
- L'école doit figurer dans le texte lu, sinon rien (déjà en place).

**La pièce affichée** : « Centrale Méditerranée, rang B. » — LinkedIn, formation. Ou : « Prix du hackathon cité en 2024, dépôt retrouvé. » — recoupé.

**Données** : le rang existe (0.3.0). À ajouter : les signaux de sélection (lecture IA avec extrait ; dépôts GitHub par mot-clé, en code), la section des distinctions.

### 3.2 Expérience (XP)

**Ce que ça mesure** : les années de métier.

**Source** : les postes datés du LinkedIn ou du CV, comptés en code. Jamais l'âge, jamais l'année du diplôme : changer les années d'études ne change pas cette note. GitHub ne sert que si LinkedIn manque.

Comment on compte les mois :

| Type de poste | Compte pour |
|---|---|
| Salarié, freelance, fondateur | 100 % |
| Stage, alternance | 50 % |
| Association étudiante, bénévolat, projet personnel | 0 % |
| Deux postes en même temps | une seule fois |

| Note | Années comptées |
|---|---|
| **10** | 10 ans et plus |
| **9** | 8 ou 9 ans |
| **8** | 6 ou 7 ans |
| **7** | 5 ans |
| **6** | 4 ans |
| **5** | 3 ans |
| **4** | 2 ans |
| **3** | 1 an |
| **2** | moins d'un an |
| **non renseigné** | aucun poste daté |

- **Sans LinkedIn** : les années actives sur GitHub (douze mois avec 50 contributions ou plus), même table, arrêtée à 8, affichée « estimée » (EN "estimated").
- Des années affirmées sans aucun poste daté : même table, arrêtée à 5.
- Le poste dont l'employeur porte le nom de l'école du profil est une association étudiante. Le stage se reconnaît à l'intitulé ou au type de contrat.
- Chef d'accusation, sans effet sur la note : **« Senior sur parole »** (EN "Senior on paper"), quand l'intitulé dit senior, lead, staff ou head avec moins de 4 ans comptés.

**La pièce affichée** : « 13 mois de stage comptés pour moitié, 7 mois à la tête d'Azerit. Le poste à Centrale Méditerranée Finance est une association de l'école : non compté. Total : 1,1 an. » — LinkedIn, postes datés.

**Données** : postes, dates et écoles existent. À ajouter : le type de contrat (gardé à la collecte), le calcul en code (aujourd'hui l'IA compte, et elle compte les stages en plein et les associations).

### 3.3 Parcours et employeurs (EMP)

**Ce que ça mesure** : où la personne a travaillé, combien de temps elle y est restée, et comment elle y a avancé.

**Source** : LinkedIn ou CV seulement. Sans eux : non renseigné.

| Note | Ce qu'il faut |
|---|---|
| **10** | Deux ans ou plus chez un employeur à forte barre d'embauche (liste), **et** une trajectoire qui monte (deux intitulés datés qui progressent) ou une équipe encadrée, avec un fait cité. |
| **8** | Deux ans ou plus dans une équipe produit exigeante : startup ou scale-up de produit, ou employeur à forte barre. Ou une entreprise fondée et tenue trois ans. |
| **6** | Un poste tenu deux ans ou plus, quel que soit l'employeur. Ou un an dans une startup ou scale-up de produit. Ou une entreprise fondée et tenue un an. |
| **4** | Un vrai poste (hors stage) ou une entreprise fondée, de moins d'un an. Ou deux stages et plus. |
| **2** | Un seul stage, ou une seule expérience de moins de six mois. |
| **non renseigné** | Aucun poste. |

- La table fait le tri sans qu'on ait à le dire : un parcours passé en entier en société de services, en agence ou en grand groupe monte jusqu'à 6 par la durée ; au-delà, il faut une équipe produit. Rien n'est affiché sur le type d'employeur de la personne.
- Un titre de CTO dans une structure non identifiable reste « CTO sur parole » (déjà en place).

**La pièce affichée** : « Cofondation d'Azerit depuis avril 2026, 7 mois. Recherche à McMaster sur la bibliothèque standard d'Agda, février–novembre 2025. » — LinkedIn, postes. « Recoupé » quand GitHub montre les contributions du poste.

**Données** : intitulés, entreprises et dates existent ; durées, fondation et trajectoire se calculent en code. À ajouter : le type d'employeur par poste (lecture IA, liste fermée : startup, scale-up, grand groupe, conseil ou agence, public ou recherche, inconnu), la liste des employeurs à forte barre (la liste gagne sur l'IA, qui ne peut pas donner ce rang seule), le fait d'encadrement avec son extrait. Sans ces ajouts, la table marche déjà jusqu'à 6.

### 3.4 Stack technique (STK)

**Ce que ça mesure** : ce que la personne sait vraiment utiliser, à quelle profondeur, sur quelle largeur, et si c'est encore frais.

**Source** : GitHub prouve, LinkedIn déclare. Avec les deux, c'est la note de GitHub qui est retenue.

Prouvée par GitHub :

| Note | Langage principal | Largeur | Fraîcheur |
|---|---|---|---|
| **10** | 1 000 commits ou plus, pratiqué depuis 3 ans | deux autres familles de langages | du code poussé depuis moins de 6 mois |
| **8** | 500 commits ou plus, pratiqué depuis 2 ans | une autre famille | moins de 6 mois |
| **6** | 200 commits ou plus, pratiqué depuis 1 an | — | moins d'un an |
| **4** | 50 commits ou plus | — | moins de 2 ans |
| **2** | du code public, en dessous de ces seuils | — | — |
| **non prouvé** | rien de jugeable | | |

Déclarée sur LinkedIn, sans GitHub pour la prouver (la table s'arrête à 6) :

| Note | Ce qu'il faut |
|---|---|
| **6** | Cinq technos ou plus rattachées à une réalisation concrète, dont deux dans un poste de moins de 2 ans. |
| **4** | Deux à quatre technos rattachées à une réalisation concrète. |
| **non renseigné** | Moins de deux. Une liste de compétences seule ne compte pas. |

Règles de comptage :
- Les commits comptés sont ceux des dépôts dont c'est le langage principal. Une « autre famille » demande un dépôt de 10 commits ou plus. TypeScript et JavaScript font une seule famille ; HTML, CSS et les scripts de build ne comptent pas.
- Ne comptent pas : les dépôts tutoriels (nom de tutoriel, moins de 5 commits) et les dépôts déposés d'un bloc (moins de 5 commits pour plus d'un Mo).

Signaux du critère, sans effet sur la note :
- **« À confirmer »** (EN "To confirm") : au moins cinq technos vérifiables nommées sur LinkedIn, moins d'un tiers retrouvées dans le code. « À confirmer : Kafka, Kubernetes. Déclarées sur LinkedIn, pas encore visibles dans 12 dépôts publics. » Vu de la personne seule. Une techno que le code public ne peut pas montrer (un outil interne, une base propriétaire) n'est jamais « à confirmer ». Pas encore visible ne veut pas dire inventé.
- **« Stack prouvée au-delà du profil »** (EN "Stack proven beyond the profile") : le code prouve une techno que le LinkedIn ne nomme pas. Vu de tous.
- **« IA dans l'atelier »** (EN "AI in the workshop") : des fichiers d'agent dans un dépôt actif.

**La pièce affichée** : « TypeScript : 329 commits dans 7 dépôts depuis novembre 2024, dernier push hier (sequence-mail). Agda retrouvé dans le code. » — GitHub. Avec LinkedIn : « Déclarées sur LinkedIn : Python, Agda, TypeScript. Retrouvées dans le code : Agda, TypeScript. » — recoupé.

**Données** : langages, commits par dépôt, dates, dépendances, topics existent. À ajouter : la table des familles de langages, la table « techno → trace attendue », les fichiers d'agent d'IA dans l'arbre.

### 3.5 Niveau du code (CODE)

**Ce que ça mesure** : la qualité de ce qui est écrit, lue dans les fichiers.

**Source** : GitHub et la lecture IA des trois dépôts les plus actifs. LinkedIn ne peut pas le prouver : sans GitHub, « non prouvé ».

| Note | Niveau lu dans le code |
|---|---|
| **10** | 5 : niveau mainteneur de bibliothèque |
| **8** | 4 : solide, erreurs gérées, tests pertinents |
| **6** | 3 : structuré et maintenable |
| **4** | 2 : fonctionnel mais brut |
| **2** | 1 : tutoriel suivi |
| **non prouvé** | aucun dépôt lisible, ou lecture en panne |

- Trois dépôts sont lus : la note est **deux fois leur niveau moyen** (pondéré par l'activité), arrondie à l'entier. Un niveau moyen de 3,6 donne 7.
- **9 et 10 demandent des tests** dans la moitié des dépôts actifs ou plus. Sinon la note s'arrête à 8.
- **7 et plus demandent un dépôt de 20 commits** : en dessous, la base est trop mince, la note s'arrête à 6.
- Plus de note de repli à 50 quand la lecture échoue : « non prouvé ».

**La pièce affichée** : « sequence-mail, `src/services/outreach.test.ts` : niveau 4 sur 5. » et l'extrait de code cité par la lecture. — GitHub. C'est la pièce la plus forte de la grille, et elle existe déjà.

**Données** : tout existe.

### 3.6 Activité (ACT)

**Ce que ça mesure** : est-ce que la personne code encore, et à quel rythme.

**Source** : le calendrier GitHub. Sans GitHub, « non prouvé ».

| Note | Semaines actives sur les 52 dernières |
|---|---|
| **10** | 48 à 52 |
| **8** | 40 à 47 |
| **6** | 26 à 39 |
| **4** | 13 à 25 |
| **2** | 4 à 12 |
| **0** | 0 à 3 |
| **non prouvé** | GitHub trop mince pour juger : moins de 3 dépôts publics et aucun de 10 commits |

- **8 et 10 demandent un dépôt public de 20 commits.** Sinon la note s'arrête à 6, avec le chef d'accusation **« Activité sans code visible »** (EN "Activity, no visible code") : on voit que ça code, pas ce que ça code.

**La pièce affichée** : « 43 semaines actives sur 52, 1 030 contributions. Commit le plus tardif : 2 h 27. » — GitHub, calendrier.

**Données** : tout existe.

### 3.7 Ownership et production (OWN)

**Ce que ça mesure** : a porté quelque chose jusqu'au bout, et d'autres s'en servent.

**Source** : les deux. Avec les deux, on retient la plus haute des deux notes.

Prouvé par GitHub :

| Note | Ce qu'il faut |
|---|---|
| **10** | Un projet dont beaucoup se servent : 1 000 étoiles ou dix contributeurs externes, et trois releases dans l'année. |
| **8** | Un projet porté plus d'un an (100 commits ou plus), publié (une release ou un site en ligne), et utilisé par d'autres (100 étoiles ou trois contributeurs externes). |
| **6** | Un projet porté 6 mois ou plus (50 commits ou plus), et de quoi mettre en production dans un dépôt actif (Dockerfile, CI ou release). |
| **4** | Un projet porté 6 mois ou plus (50 commits ou plus). |
| **2** | Des dépôts, aucun porté dans la durée. |

Déclaré sur LinkedIn, sans GitHub pour le prouver (la table s'arrête à 6) :

| Note | Ce qu'il faut |
|---|---|
| **6** | Trois résultats datés et chiffrés (mise en ligne, migration, usage). |
| **4** | Une entreprise fondée, ou un résultat daté et chiffré. |
| **non renseigné** | Ni l'un ni l'autre. |

**La pièce affichée** : « Projet_innovation : 79 commits sur 8 mois. sequence-mail : Dockerfile, CI, 4 étoiles. » — GitHub. « Recoupé » quand le LinkedIn nomme le même projet.

**Données** : tout existe, sauf l'adresse du site d'un dépôt (pour dire « en ligne »).

### 3.8 Open source (OSS)

**Ce que ça mesure** : la reconnaissance par d'autres développeurs.

**Source** : GitHub. Une mention « open source » sur LinkedIn ne donne rien sans trace.

| Note | Ce qu'il faut |
|---|---|
| **10** | Mainteneur d'un projet de 1 000 étoiles ou plus. Ou vingt PR fusionnées dans des projets de 1 000 étoiles ou plus. |
| **8** | Une PR fusionnée dans un projet de 1 000 étoiles ou plus. Ou 100 étoiles sur ses dépôts. Ou un dépôt avec dix contributeurs externes. |
| **6** | Vingt PR ou plus fusionnées chez les autres. |
| **4** | Cinq à dix-neuf. |
| **2** | Une à quatre. |
| **0** | Aucune. |

- **Ce critère ne peut pas faire baisser la note** (§4) : la plupart des bons développeurs n'ont pas d'open source, et ça ne leur coûte rien.
- Chef d'accusation, quand on saura où vont les PR : **« PR entre proches »** (EN "PRs among friends"), quand elles vont toutes chez un seul propriétaire qui est aussi le complice principal. Ces PR ne comptent alors que jusqu'au niveau 4.

**La pièce affichée** : « 72 PR fusionnées chez les autres. » aujourd'hui ; « 41 PR fusionnées dans agda/agda-stdlib, la dernière en novembre 2025. » quand la collecte dira où.

**Données** : le nombre de PR, les étoiles et les contributeurs existent. À ajouter : la destination des PR (sans elle, les niveaux 8 et 10 ne s'ouvrent que par les étoiles et les contributeurs).

## 4. La note générale sur 100

**Le calcul** : la moyenne pondérée des notes des critères, multipliée par 10. Rien d'autre.

> note = 10 × (somme des notes × coefficients) ÷ (somme des coefficients des critères notés)

| Critère | Coefficient | Part de la note | Pourquoi |
|---|---|---|---|
| Niveau du code | 2 | 20 % | C'est ce que seul le code prouve, et le cœur du métier d'Azerit. |
| Stack technique | 1,5 | 15 % | Ce qu'un recruteur cherche en premier. |
| Expérience | 1,5 | 15 % | Le premier filtre de tout recrutement. |
| Parcours et employeurs | 1,5 | 15 % | Avec l'expérience, c'est la lecture du LinkedIn. |
| Ownership et production | 1 | 10 % | Distingue qui livre de qui participe. |
| Activité | 1 | 10 % | Code encore, ou plus. |
| École et sélection | 1 | 10 % | Un signal réel, qui pèse surtout en début de carrière. |
| Open source | 0,5 | 5 % | Un plus, rare. |

LinkedIn porte 40 % de la note (école, expérience, parcours), GitHub 50 % (stack, code, activité, open source), et l'ownership, 10 %, se lit sur les deux.

**Quatre règles sur la note finale**, et pas une de plus :

1. **Un critère « non prouvé » ou « non renseigné » sort de la moyenne.** La note se fait sur les coefficients qui restent. Exemple : quelqu'un sans école de tech est noté sur 90 % des coefficients, ramenés à 100. Sa note est exactement celle de ses sept autres critères.
2. **L'école et l'open source ne peuvent pas faire baisser la note.** On calcule la moyenne sans eux ; chacun n'y entre que s'il est au-dessus. Sans cette règle, une école de rang C (4 sur 10) coûterait des points qu'une absence d'école ne coûte pas. Avec elle, personne ne perd rien à son école ni à son absence d'open source.
3. **Plafonnée à 85 si aucun code n'est prouvé.** Une fiche faite sur LinkedIn seul s'arrête à cinq étoiles : la sixième se prouve. (Les tables « déclaré » s'arrêtant à 6, le calcul y mène de lui-même ; la règle le dit en clair.)
4. **Dossier vide : 20.** Quand moins d'un quart des coefficients est noté (un GitHub presque vide, seul), la fiche reçoit la note plancher 20, une étoile, et le profil « Fantôme ».

**Trois notes, selon ce que la personne a donné** :

| Entrée | Ce qu'elle reçoit |
|---|---|
| **LinkedIn seul** | La note déclarée. École, expérience, parcours notés ; stack et ownership « déclarés » (tables arrêtées à 6) ; code, activité, open source « non prouvés », hors moyenne. |
| **GitHub seul** | La note prouvée. Stack, code, activité, ownership, open source notés ; expérience « estimée » sur les années actives (arrêtée à 8) ; école et parcours « non renseignés », hors moyenne. Une légende de l'open source atteint six étoiles sans LinkedIn. |
| **Les deux** | **Un dossier, une fiche, une note** (SPEC §18.36) : la **note du dossier** (EN "case rating"), chaque critère pris sur sa source de preuve. Les deux pièces restent rangées au dossier, sans note à l'écran. Un GitHub trop mince ne tire pas le dossier vers le bas : ses critères sont « non prouvés ». |

**Ce que disent les deux sources**, sans jamais les mettre en écart :
1. Critère par critère, la pièce où la note a été lue : « lu sur LinkedIn », « lu sur GitHub », « lu sur les deux pièces ». Aucune note par pièce, aucun titre d'écart.
2. Quand le code confirme : « Recoupé : le code public couvre la même période. »
3. Quand le code ne montre pas encore ce que LinkedIn déclare : un signal du critère, « À confirmer en entretien » ou « À confirmer : Kafka », vu de la personne seule. Il ne change aucune note.

**Arrondi** : les notes sont des entiers et les coefficients des demis, le calcul se fait donc en entiers, arrondi au supérieur à ,5. Bornes 1 à 99, comme aujourd'hui.

**La lettre, en second** : si on veut une lettre par critère, elle se déduit de la note et ne la remplace jamais. A : 9 ou 10. B : 7 ou 8. C : 5 ou 6. D : 3 ou 4. E : 0 à 2. Par défaut, elle n'est pas affichée.

## 5. Ce qui doit bluffer

La grille est aussi une démonstration : la personne doit voir qu'on a lu son dossier comme le lit un recruteur d'Azerit, et pas comme un compteur de mots-clés. Six trouvailles font la différence. Toutes sont des recoupements, ou des lectures qu'un outil générique ne fait pas.

| # | La trouvaille | Exemple affiché | Données |
|---|---|---|---|
| 1 | **Les années recomptées.** On recompte l'expérience poste par poste : stages à moitié, association étudiante repérée parce que l'employeur porte le nom de l'école. | « LinkedIn laisse lire 3 ans. On en compte 1,1 : deux stages, et un poste qui est une association de ton école. » | Existent (postes datés, formation). Calcul en code. |
| 2 | **Le poste confirmé par le code.** Un poste daté du LinkedIn, retrouvé dans GitHub sur les mêmes mois. | « LinkedIn : recherche sur la bibliothèque standard d'Agda, février–novembre 2025. GitHub : 41 PR fusionnées dans ce dépôt sur ces dix mois. Poste confirmé. » | À ajouter : destination et date des PR. Les dates de poste existent. |
| 3 | **La techno déclarée sans trace, la techno prouvée jamais déclarée.** Chaque techno du LinkedIn cherchée dans les langages, les dépendances et les fichiers. | « « Machine Learning » déclaré : scikit-learn et xgboost retrouvés dans HSMM_DUAL_SCALE. » ou « À confirmer : Kubernetes. Déclarées sur LinkedIn, pas encore visibles dans 18 dépôts publics. » ou « Stack prouvée au-delà du profil : Agda. » | Existent (compétences, technos lues, langages, dépendances). À ajouter : la table « techno → trace attendue ». |
| 4 | **Le changement de poste qui se voit dans le code.** Les contributions par année, mises en face des dates de poste. | « Passage à un poste d'encadrement en 2023 : 800 contributions par an avant, 60 depuis. » ou « Premier vrai commit trois mois avant le premier stage. » | Existent (contributions par année, premier commit, postes datés). |
| 5 | **La même société des deux côtés.** L'employeur du LinkedIn retrouvé sur le profil GitHub (site, société affichée), sans que la personne ait rien relié. | « LinkedIn : Azerit. Site du profil GitHub : azerit.tech. Identité recoupée. » | Existent (site, société et comptes sociaux du profil GitHub). |
| 6 | **Le fichier, la ligne.** Le niveau du code n'est pas une impression : on cite le dépôt, le fichier et l'extrait qui le justifient. Et, pour l'open source, le projet connu où une PR a été acceptée. | « sequence-mail, `outreach.test.ts`, niveau 4 : les erreurs d'envoi sont testées une à une. » | Existe (lecture IA). À ajouter pour le projet connu : destination des PR. |

Règles de ces trouvailles :
- **Données publiques seulement**, avec un lien vers la page publique qui prouve.
- **Jamais** d'âge, de genre, d'origine, de nationalité, de lieu, de photo, de contact, ni rien qui s'en approche. Les langues parlées ne sont ni lues ni gardées.
- **Aucun tiers exposé** : un complice n'apparaît que par son pseudo public, comme aujourd'hui. On ne lit jamais le LinkedIn de quelqu'un d'autre pour recouper.
- **Prudence sur l'absence** : « à confirmer » ne s'écrit que pour ce que le code public peut montrer, et ne se montre qu'à la personne.
- La meilleure trouvaille de recoupement entre dans l'enquête en direct (SPEC §18.26) et dans le texte de partage.

## 6. Sur la fiche

### La méthode montrée en quelques mots

Le bloc du barème s'ouvre par un titre et trois lignes, pas plus :

| | Français | Anglais |
|---|---|---|
| Titre | Voici comment un recruteur d'Azerit te lit | Here is how an Azerit recruiter reads you |
| 1 | Ce que ton LinkedIn déclare. | What your LinkedIn claims. |
| 2 | Ce que ton code prouve. | What your code proves. |
| 3 | On recoupe. Chaque note a sa pièce. | We cross-check. Every score has its exhibit. |
| Pied | C'est la lecture qu'Azerit fait pour les équipes qui recrutent. | This is how Azerit reads engineers for hiring teams. |

Dessous, huit lignes. Chacune montre : le nom du critère, **la note « n/10 »** en dix segments, l'étiquette de source (« LinkedIn », « GitHub », « recoupé »), et la pièce en une phrase. Un appui déplie la table des niveaux du critère, le niveau atteint surligné, et **ce qui manque pour le suivant** (« Pour 8 : 500 commits dans ton langage principal. Tu en as 329. »). Sous les huit lignes, la moyenne pondérée, coefficients visibles.

Ce qui est montré, c'est la grille du jeu : huit critères, leurs niveaux, leurs coefficients. Les règles internes d'Azerit pour un poste donné n'y figurent pas.

### (a) Le plus petit changement, avant le 19 novembre

**Ce qui change à l'écran**
- La **note de la fiche** devient la note du barème. Une seule note à l'écran, celle d'un recruteur.
- Sous la fiche, le **bloc « Voici comment un recruteur d'Azerit te lit »** : les huit critères en n/10, leurs pièces, la moyenne.
- Sur un dossier à deux pièces : **un dossier, une fiche, une note** (SPEC §18.36). Une seule fiche, notée par la **note du dossier**, et sous elle la ligne des pièces (« Pièces au dossier : LinkedIn · GitHub »). Chaque critère dit la pièce où il a été lu. Ni deux fiches, ni titre d'écart, ni colonnes.
- Au dos de la fiche, la ligne de formule devient celle du barème : « Code 7 × 2 + Stack 6 × 1,5 + … = 57 ».
- Les **six barres ne bougent pas** (TEC, SHIP, ARCH, DOC, XP, BUZZ) : elles restent les traits de la fiche, et continuent de décider le profil, la peine et les chefs d'accusation. Deux retouches pour ne pas se contredire : **le bonus d'école sort de TEC** (l'école est maintenant « École : n/10 », un critère à part), et la barre XP prend la note du critère Expérience (× 10).

**Ce qui casse**
- Les notes bougent. La vitrine passe de « LinkedIn 57 · GitHub 71 » à environ « 41 · 61 ».
- La fiche GitHub de la vitrine devient « Nouveau en ville » (XP sous 45, TEC à 70 ou plus) : c'est juste, et ça change son habillage.
- Les tests qui fixent des notes (barème, fixtures, démo) sont à reprendre. Le profil « Sous couverture » (`forger`) ne naît plus d'un écart : il ne tient qu'aux mots creux d'une fiche déclarative (BUZZ du CV à 85 ou plus).
- La référence des rangs (SPEC §18.3) doit être calculée avec ce barème : elle ne l'est pas encore, rien n'est perdu.
- Les fiches déjà en base gardent leur ancienne note jusqu'à leur prochain jugement ; avant le lancement, on vide la base.
- Ne casse pas : le dessin de la fiche, les images de partage, les étoiles et leurs seuils, le top de la semaine (question 7), les types (`CardData.grid` est facultatif).

**Coût** : trois tâches (§8), environ trois jours d'agents et une demi-journée de vérification à 390 px.

### (b) La version complète, après le lancement

**Ce qui change à l'écran**
- La fiche montre **les huit critères en huit barres de dix segments** (deux colonnes de quatre) : la note sur 10 se lit directement. BUZZ quitte les barres et reste un chef d'accusation.
- Fait avant le lancement : un dossier à deux pièces est une fiche, et l'image de partage porte la note du dossier.
- L'indice « preuves » devient la part des coefficients notés sur leur source de preuve.
- Profils, peines et chefs d'accusation se règlent sur les critères (la peine vient du plus faible parmi code, stack, activité, ownership).
- Le top de la semaine : voir la question 7.

**Ce qui casse** : la mise en page de la fiche (une quatrième rangée de barres bute sur les chefs d'accusation, tout le bas est à recaler), le dos (six lignes deviennent huit), les six codes dans les types, les règles de `data/profiles.json`, `data/sentences.json` et `data/statuses.json`, les textes du site, la démo, toutes les fixtures, toutes les images déjà rendues, et la référence des rangs à recalculer (environ 2 $).

**Coût** : trois à quatre jours d'agents et une revue visuelle complète. Trop pour tenir avant le 19 sans risque.

## 7. Appliqué aux deux fondateurs

Données réelles du 10 novembre 2026 (profils LinkedIn tels que lus, faits GitHub collectés). Ce sont les exemples du dossier (SPEC §18.35).

### Jacques (`@jmougeot`)

| Critère | Note | Le niveau atteint, et pourquoi pas le suivant | Source |
|---|---|---|---|
| École et sélection | **6/10** | Centrale Méditerranée, rang B. | LinkedIn, formation |
| Expérience | **3/10** | Stages de février 2025 à mars 2026 : 13 mois à 50 %. Azerit depuis avril 2026 : 7 mois. Association de l'école : 0. Total 1,1 an : le palier « 1 an ». | LinkedIn, postes datés |
| Parcours et employeurs | **4/10** | Une entreprise fondée, tenue 7 mois. Pour 6 : la tenir un an. | LinkedIn, postes |
| Stack technique | **6/10** | TypeScript : 329 commits, pratiqué depuis 2 ans, push de la veille. Pour 8 : 500 commits (la seconde famille, Agda, y est déjà). Déclarée sur LinkedIn : une seule techno décrite, non renseigné. | GitHub |
| Niveau du code | **7/10** | Niveau moyen lu 3,6 sur 5, sur trois dépôts. | GitHub, `outreach.test.ts` |
| Activité | **8/10** | 43 semaines actives sur 52. Pour 10 : 48. | GitHub, calendrier |
| Ownership et production | **6/10** | Projet_innovation, 79 commits sur 8 mois, et un Dockerfile dans un dépôt actif. Pour 8 : un projet de plus d'un an, utilisé par d'autres. Déclaré sur LinkedIn : une entreprise fondée, 4. | GitHub |
| Open source | **6/10** | 72 PR fusionnées chez les autres. Leur destination n'est pas encore collectée : le niveau 8 reste fermé. | GitHub |

- **Note du dossier** : sans l'école ni l'open source, (7 × 2 + 6 × 1,5 + 3 × 1,5 + 4 × 1,5 + 6 + 8) ÷ 8,5 = 5,6. L'école (6) et l'open source (6) sont au-dessus : ils entrent. 56,5 ÷ 10 = 5,65. **57 sur 100**, trois étoiles.
- **Fiche GitHub** (expérience estimée à 4 sur deux années actives ; l'open source, 6, n'est pas au-dessus de 6,1 et n'entre pas) : **61**, quatre étoiles.
- **Fiche LinkedIn** (école 6, expérience 3, parcours 4, ownership déclaré 4) : **41**.
- À l'écran, une seule fiche et une seule note, celle du dossier : 57 (SPEC §18.36). Avant le barème : 57 et 71.

### Lumine (`@LumBuilds0`)

| Critère | Note | Le niveau atteint, et pourquoi pas le suivant | Source |
|---|---|---|---|
| École et sélection | **8/10** | CentraleSupélec, rang A. Le semestre d'échange ne compte pas. | LinkedIn, formation |
| Expérience | **3/10** | Sejo, septembre 2024 à août 2025 : 11 mois. Azerit depuis janvier 2026 : 10 mois. Total 1,75 an : le palier « 1 an ». | LinkedIn, postes datés |
| Parcours et employeurs | **4/10** | Deux entreprises fondées, chacune tenue moins d'un an. Pour 6 : en tenir une un an. | LinkedIn, postes |
| Stack technique | non prouvé | Un dépôt public, sans commit. Aucune techno décrite sur LinkedIn. | GitHub |
| Niveau du code | non prouvé | Rien de lisible. | GitHub |
| Activité | non prouvé | 2 semaines actives sur 52 : GitHub trop mince pour juger. | GitHub, calendrier |
| Ownership et production | **4/10**, déclaré | Une entreprise fondée. Aucun résultat daté et chiffré. | LinkedIn |
| Open source | non prouvé | GitHub trop mince pour juger. | GitHub |

- **Fiche LinkedIn** : sans l'école, (3 × 1,5 + 4 × 1,5 + 4) ÷ 4 = 3,6. L'école (8) est au-dessus : elle entre. 22,5 ÷ 5 = 4,5. **45 sur 100**, trois étoiles.
- **Fiche GitHub** : dossier vide, **20**, une étoile, « Fantôme ».
- **Note du dossier** : **45**, avec la mention « code non prouvé ». Aujourd'hui : 49 et 35.

### Est-ce qu'un recruteur signerait

- **Sur le papier, Lumine passe devant** (45 contre 41) : une école mieux classée, à expérience et parcours égaux. **Avec la preuve, Jacques passe devant** (57 contre 45) : un code lu, actif, livré. C'est l'ordre qu'un recruteur donnerait, et c'est exactement ce que le jeu veut montrer.
- Deux notes basses sur l'expérience (3 et 3) : c'est juste, ce sont deux débuts de carrière, et le calcul se lit poste par poste.
- La note de Lumine ne dit pas « mauvais code », elle dit « code non prouvé ». Le jour où ses dépôts sont publics, quatre critères s'ouvrent.
- La note du dossier de Jacques (57) est sous celle de sa fiche GitHub (61) : le LinkedIn ajoute un an d'expérience et un parcours court, et un recruteur les compte.

**Ce que l'exemple a fait corriger dans la grille** (et non l'inverse) :
1. La stack donnait 9 à Jacques dans une première version (largeur comptée en octets, fraîcheur trop payée). Elle se lit maintenant en commits, en années de pratique et en familles de langages : 6.
2. L'expérience lue aujourd'hui donne 3 ans à Jacques, stages comptés en plein et association comprise. Le calcul en code en donne 1,1.
3. Un GitHub vide donnait 9 sur 100 quand chaque critère sans donnée valait zéro. D'où la règle « non prouvé sort de la moyenne » et la note plancher du dossier vide.
4. Un titre de fondateur suffisait à monter le parcours. Les niveaux demandent maintenant une durée : six mois ne valent pas deux ans.

## 8. La construction

Trois tâches pour la version (a). Les tâches 1 et 3 peuvent partir en parallèle de la 2, sur ce contrat, à poser d'abord dans `shared/types.ts` :

```ts
type CriterionCode = "EDU" | "XP" | "EMP" | "STK" | "CODE" | "ACT" | "OWN" | "OSS";
interface GridCriterion {
  code: CriterionCode;
  score: number | null;            // entier de 0 à 10 ; null si non prouvé ou non renseigné
  state: "scored" | "declared" | "unproven" | "missing";
  counted: boolean;                // false : hors moyenne (état, ou école / open source sous la moyenne)
  source: "linkedin" | "github" | "both";
  declared?: number | null;        // comparaison : la note côté LinkedIn
  proven?: number | null;          // comparaison : la note côté GitHub
  reached: Fact;                   // le niveau atteint, en clair
  next?: Fact;                     // ce qui manque pour le niveau suivant
  flags: Fact[];                   // chefs d'accusation liés, sans effet sur la note
  evidence?: { text: Fact; source: "linkedin" | "github" | "both"; proof?: string };
}
interface Grid { criteria: GridCriterion[]; overall: number; rule?: "capped_unproven" | "empty_file" }
// CardData.grid?: Grid ; ComparisonData.grid?: Grid (la note du dossier)
```

### Tâche 1 — Les données qui manquent

- **Fichiers** : `server/src/github/collect.ts`, `facts.ts`, `detect.ts` (destination des PR fusionnées : dépôt, étoiles, date, cent au plus ; fichiers d'agent d'IA dans l'arbre ; `homepage`) ; `server/src/linkedinProfile/profile.ts`, `apify.ts`, `crustdata.ts` (type de contrat par poste, distinctions) ; `server/src/ai/prompts/cv.ts`, `server/src/ai/readCv.ts`, `shared/readings.ts` (type d'employeur par poste, signaux de sélection et fait d'encadrement avec extrait, échange et MOOC exclus de l'école) ; `data/employers.example.json` et son chargeur.
- **Tests d'acceptation** :
  - Les faits et lectures déjà en base se relisent sans erreur (tout nouveau champ est facultatif).
  - Le nombre de requêtes GitHub par fiche n'augmente pas.
  - Chaque signal de sélection et chaque fait d'encadrement cite un extrait retrouvé dans le texte, sinon il est jeté.
  - L'IA ne peut pas rendre « forte barre d'embauche » : seule la liste le donne. Sans fichier de liste, les niveaux 8 et 10 du parcours ne s'ouvrent que par les startups, rien ne plante.
  - Sur les deux profils d'exemple : les deux stages sortent en stage, l'association en association étudiante, le semestre d'échange ne donne pas de rang.
  - Aucun champ d'âge, de lieu, de langue parlée ni de contact n'est ajouté au profil gardé.

### Tâche 2 — Le moteur du barème

- **Fichiers** : `data/grid.json` (tables de niveaux, coefficients, familles de langages, table « techno → trace ») ; `server/src/scoring/grid.ts` (pur, sans réseau) et `grid.test.ts` ; `server/src/scoring/github.ts`, `cv.ts`, `compare.ts`, `common.ts` (la note vient de la grille ; XP alignée) ; `data/scoring.json` (version 0.4.0, **le bloc `cv.TEC.school.bonus` et son usage dans `cv.ts` supprimés**, la liste d'écoles gardée) ; `SPEC.md` (§4 et journal).
- Le moteur tourne sur les données d'aujourd'hui : chaque donnée de la tâche 1 est facultative, son niveau s'ouvre quand elle arrive.
- **Tests d'acceptation** :
  - Aucune note de critère n'est obtenue par addition : chaque critère rend le niveau de sa table, et la note finale est la moyenne pondérée, vérifiée à la main sur un exemple.
  - Deux fixtures calquées sur les fondateurs donnent, à un point près : 41, 61 et 57 ; 45, 20 et 45.
  - Ajouter une école, quel que soit son rang, ne baisse jamais la note. Retirer toute formation non plus. Une personne sans école a exactement la moyenne de ses autres critères.
  - Plus aucune école dans TEC : la barre TEC d'une fiche déclarée ne dépend plus du rang.
  - Changer les années d'études ne change pas l'expérience. Changer l'ordre des postes non plus.
  - Un stage compte pour moitié, une association étudiante pour zéro, deux postes simultanés une fois.
  - LinkedIn seul ne dépasse jamais 85. GitHub seul peut dépasser 90.
  - Une techno absente de la table n'est jamais dite « à confirmer ». Un signal ne change aucune note.
  - Un GitHub de moins de 3 dépôts sans commit donne 20 seul, et ne baisse pas la note d'un dossier.
  - Même entrée, même sortie. Les suites existantes passent, notes mises à jour.

### Tâche 3 — L'affichage

- **Fichiers** : `shared/types.ts` (le contrat) ; `web/src/components/` (un bloc `RecruiterGrid`, monté dans la page de résultat) ; `web/src/i18n.ts` (tous les libellés des §3 et §6, français et anglais) ; `shared/card/CardBack.tsx` et `shared/card/i18n.ts` (la ligne de formule) ; `web/src/lib/mock.ts` (une grille de démo).
- **Tests d'acceptation** :
  - À 390 px, le bloc tient sans défilement horizontal ; chaque ligne montre « n/10 », l'étiquette de source et la pièce ; un appui déplie la table des niveaux et ce qui manque pour le suivant.
  - Aucun « +n » ni « −n » n'apparaît nulle part, ni dans le bloc ni sur la fiche.
  - Un dossier à deux pièces montre une note par critère, la pièce où elle a été lue, et la note du dossier.
  - Une fiche sans grille (ancienne) s'affiche comme avant.
  - La formule du dos tient en trois lignes pour huit critères.
  - Tous les textes existent dans les deux langues, sans accord au masculin ni au féminin avec la personne.
  - Sur une page partagée, vue par quelqu'un d'autre, les noms d'anciens employeurs n'apparaissent pas (question 5).

## 9. Questions pour Jacques

Seulement celles où son jugement de recruteur est nécessaire. Chacune a une valeur par défaut : rien ne bloque.

1. **Les employeurs à forte barre d'embauche.** Qui est sur la liste, et où vit-elle ? *Par défaut* : la liste reste hors du dépôt public (un fichier sur le serveur), elle part vide, et les niveaux 8 et 10 du parcours ne s'ouvrent d'abord que par les startups et scale-ups. Le dépôt ne contient qu'un exemple.
2. **Le plafond de fait du parcours** : sans équipe produit, on ne dépasse pas 6. Est-ce le bon réglage pour un jeu public ? *Par défaut* : oui, et rien n'est écrit sur le type d'employeur de la personne.
3. **Les notes de l'école** (S 10, A 8, B 6, C 4) et l'école hors liste, plafonnée à B : une personne formée à l'étranger dans une très bonne école absente de la liste y perd. *Par défaut* : ces notes, et la liste s'allonge pays par pays ; comme l'école ne peut pas faire baisser la note, personne n'est pénalisé en attendant.
4. **L'école et l'open source ne peuvent pas faire baisser la note** (règle 2 du §4). L'autre choix, plus simple : une moyenne pure, où une école de rang C pèse comme n'importe quelle note. *Par défaut* : la règle, pour qu'une école modeste ne coûte jamais plus qu'une absence d'école.
5. **Les noms sur une page partagée.** Les pièces citent l'école et d'anciens employeurs, et une fiche peut être faite sur quelqu'un d'autre. *Par défaut* : pièces complètes pour la personne qui a lancé la fiche ou qui l'a revendiquée ; sur la page partagée, le rang de l'école et les comptes (« deux stages, une entreprise fondée »), sans nom d'ancien employeur.
6. **Les coefficients, et le poids des stages** : 40 % LinkedIn, 50 % GitHub, 10 % les deux ; stage et alternance à 50 %, entreprise fondée à 100 %, association à 0 %. *Par défaut* : ces valeurs, à recaler quand la référence des rangs aura tourné.
7. **Le top de la semaine** : note de la fiche GitHub, ou note du dossier ? Depuis « un dossier, une fiche, une note » (SPEC §18.36), la page d'un dossier ne montre qu'une note, celle du dossier ; le top, lui, classe encore sur la note de la fiche GitHub, et peut donc afficher une autre note que la page. *En attente de Jacques* : rien n'est tranché ; d'ici là, le top garde la note de la fiche GitHub.
