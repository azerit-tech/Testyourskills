# Testyourskills

Outil de communication pour azerit.tech. On donne un profil LinkedIn, un pseudo GitHub ou un CV en PDF ; on reçoit une fiche de dev façon avis de recherche : une note, de une à six étoiles, un profil criminel, des chefs d'accusation tirés de pratiques de code, et sous la fiche la lecture d'un recruteur d'Azerit, critère par critère. Quand LinkedIn et GitHub sont là tous les deux, la fiche compare ce que la personne déclare et ce que son code prouve.

L'univers est celui d'un jeu de crime en monde ouvert sorti le 19 novembre 2026 : on en prend le style, jamais les marques ni les fichiers (SPEC §17.2).

## Documents

| Document | Rôle |
|---|---|
| `SPEC.md` | la spécification de référence ; la saison 1, en cours, est au §18 |
| `docs/bareme-recrutement.md` | la grille de recrutement : huit critères notés sur 10 (SPEC §18.37) |
| `docs/cinematique-poursuite.md` | la direction du film de révélation, rendu en 3D (SPEC §18.36) |
| `docs/brief-personnages.md` | le brief des portraits de suspects encore à générer (SPEC §18.31) |
| `docs/inspiration-gta6.md` | l'étude de style : palette mate, typographie, interdits (SPEC §18.18) |
| `ops/DEPLOY.md` | la mise en ligne, les mises à jour, le retour arrière |
| `tools/film/README.md`, `tools/film3d/README.md` | le montage et le rendu du film |

## Dev local

```sh
npm install
cp .env.example .env      # puis renseigner GITHUB_TOKEN et OPENROUTER_API_KEY
npm run dev               # Vite sur http://localhost:5180, API sur http://localhost:8787
```

Trois entrées : l'accueil (`/`), la page d'une fiche partagée (`/c/<id>`, qui porte aussi le champ pour les visiteurs) et l'adresse directe `/<pseudo>`, qui lance la fiche sans champ (route gérée côté navigateur, servie par le repli SPA). Coller une adresse GitHub ou déposer un PDF n'importe où sur la page lance aussi la fiche.

Vite proxifie `/api`, `/og`, `/c/`, `/auth` et `/avatar` vers l'API. La page `/c/:id` est rendue par l'API : en dev elle demande le `index.html` transformé au serveur Vite (`DEV_WEB_URL`) et y injecte les balises Open Graph ; si Vite ne tourne pas, elle sert une page autonome. On ouvre donc toujours `http://localhost:5180/c/<id>`.

- `?mock=1` : données de démonstration, sans API.
- `?scene=walkout` ou `?scene=film` : la révélation jouée (l'ascenseur 3D, par défaut ; le film). Le choix tient le temps de la session.
- Tests : `npm test`. Types : `npm run typecheck`.

Sans jeton GitHub, l'API démarre en dev avec un avertissement (GitHub limite alors à 60 requêtes par heure) et refuse de démarrer en production. Sans `OPENROUTER_API_KEY`, aucune lecture par l'IA n'est possible.

## Variables

La liste commentée fait foi dans `.env.example`.

| Variable | Rôle | Défaut |
|---|---|---|
| `GITHUB_TOKENS`, `GITHUB_TOKEN` | jetons serveur pour l'API GitHub ; plusieurs jetons en rotation, séparés par des virgules | obligatoire en prod |
| `OPENROUTER_API_KEY` | lecture du code, du CV et du profil LinkedIn par l'IA, via OpenRouter | sans IA si absente |
| `AI_MODEL_CODE`, `AI_MODEL_CV` | modèles OpenRouter | `z-ai/glm-5.3-flash` |
| `AI_DAILY_BUDGET_USD` | budget IA par jour ; au-delà, « commissariat fermé », aucune fiche sans lecture | `5` |
| `AI_MIN_CREDIT_USD` | solde OpenRouter sous lequel l'IA ferme de même | `0.5` (`.env.example` : `0.05`) |
| `MAX_CONCURRENT_CARDS` | fiches traitées en même temps ; les suivantes attendent en file | `4` |
| `BASE_URL` | adresse publique, pour `og:url`, `og:image` et les liens | `https://skills.azerit.tech` en prod, `http://localhost:5180` en dev |
| `DB_PATH` | base SQLite ; le cache des PNG vit à côté, dans `og/` | `./var/cards.db` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` | « C'est moi » : revendiquer sa fiche par GitHub OAuth (SPEC §18.1) | bouton absent sans les trois |
| `LINKEDIN_PROVIDER`, `APIFY_TOKEN`, `APIFY_LINKEDIN_ACTOR`, `APIFY_LINKEDIN_INPUT`, `CRUSTDATA_API_KEY`, `LINKEDIN_AUTOFIND` | lecture d'un profil LinkedIn public par un service tiers (SPEC §18.24) | entrée LinkedIn absente sans jeton |
| `LINKEDIN_DAILY_PROFILES` | profils LinkedIn lus par jour | `300` |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | photo LinkedIn sur la fiche (voir plus bas) | désactivée si absentes |
| `HIGH_BAR_EMPLOYERS_FILE` | fichier du serveur, hors du dépôt, de la forme de `data/employers.example.json` (SPEC §18.37) | liste vide |
| `SHOWCASE_LOGIN`, `SHOWCASE_PHOTO`, `SHOWCASE_LINKEDIN` | la fiche d'exemple de l'accueil (SPEC §18.35) | voir `.env.example` |
| `LEADS_ENDPOINT` | webhook qui reçoit les emails laissés | aucun |
| `IP_SALT` | sel du hachage des IP pour les limites par jour ; une valeur aléatoire en production | constante |
| `PORT` | port de l'API | `8787` |
| `DEV_WEB_URL` | serveur Vite en dev | `http://localhost:5180` |

## Photo LinkedIn

La personne qui a créé une fiche peut y mettre sa photo LinkedIn. On passe par « Sign In with LinkedIn using OpenID Connect » (scopes `openid profile`), avec son consentement et sans collecte automatique. Le jeton d'accès n'est jamais stocké. La photo est copiée dans `avatars/`, à côté de la base, car les adresses LinkedIn expirent. Elle part avec la fiche, à la suppression comme à la purge.

1. Créer une application sur https://www.linkedin.com/developers/.
2. Dans l'onglet Products, ajouter « Sign In with LinkedIn using OpenID Connect ».
3. Dans l'onglet Auth, déclarer l'adresse de retour `${BASE_URL}/auth/linkedin/callback`.
4. Renseigner `LINKEDIN_CLIENT_ID` et `LINKEDIN_CLIENT_SECRET` dans `.env`.

Sans ces deux variables, le front masque le bouton (`GET /api/config`).

## Production et déploiement

En local : `npx vite build && npm start` sert le front de `dist/web` et l'API sur le même port.

Sur le VPS partagé : pas de Caddy propre, le Caddy commun route `skills.azerit.tech` vers le conteneur `testyourskills`. Première mise en ligne, mises à jour et retour arrière : [`ops/DEPLOY.md`](ops/DEPLOY.md). Ensuite, depuis le Mac, sur `master` à jour : `scripts/deploy.sh --plan`, puis `scripts/deploy.sh`.

La base et les PNG sont dans le volume monté sur `/data`. Les fiches de plus de 90 jours, ni revendiquées ni liées à un email, sont purgées au démarrage puis toutes les heures, avec leurs images.

## Architecture

- `web/` : front Vite et React 19 (accueil, attente, révélation, fiche, partage).
  - `web/src/three/`, `web/public/3d/` : la révélation par défaut, un ascenseur en 3D (Three.js) ; crédits des modèles dans `web/public/3d/CREDITS.txt`. Elle part quand le film est validé (SPEC §18.36).
  - `web/src/film/`, `web/public/film/` : le lecteur du film et ses fichiers.
  - `web/public/profiles/`, `web/public/characters/` : les décors peints des profils et les portraits de suspects.
- `shared/` : types, composant SVG de la fiche (`card/`), découpage et HUD du film (`film/`), textes et routes communs au front et au serveur.
- `data/` : barème, grille de recrutement, profils, peines, statuts, mots creux. Des données, séparées de la logique.
- `server/src/` : l'API Hono.
  - `app.ts` : les routes ; `pipeline.ts` : file d'attente et traitement d'une fiche en tâche de fond.
  - `github/` : collecte ; `ai/` : lecture par l'IA, budget et crédit ; `cv/` : extraction du PDF ; `linkedinProfile/` : lecture d'un profil LinkedIn.
  - `scoring/` : le barème et la grille de recrutement, en code pur ; `findings/` : les trouvailles de l'enquête.
  - `render/` : images de partage en PNG ; `html.ts` : page `/c/:id` avec ses balises d'aperçu.
  - `auth.ts` : revendication par GitHub OAuth ; `linkedin.ts` : photo LinkedIn ; `top.ts`, `jury.ts`, `denounce.ts` : top de la semaine, jury, dénonciation.
  - `db.ts` : SQLite. Jamais le CV ni son texte.
- `scripts/` : déploiement, tableau de la semaine (`npm run weekly`), centiles de référence, montage du film (`film-*.ts`).
- `tools/bake/` : la chaîne Blender de l'ascenseur ; `tools/film/` : la liste de montage du film ; `tools/film3d/` : la scène et le rendu du film.

Trois règles tiennent tout le reste (SPEC §2) : l'IA lit et ne note jamais, c'est un barème en code qui note ; une même entrée donne la même fiche ; le CV n'est jamais stocké.
