# Testyourskills

Fiche de dev dans l'univers de GTA 6 pour azerit.tech : un pseudo GitHub ou un CV en PDF, une fiche en dix secondes (étoiles de recherche, chefs d'accusation), et la comparaison des deux. La spécification de référence est `SPEC.md`.

## Dev local

```sh
npm install
cp .env.example .env      # puis renseigner GITHUB_TOKEN et OPENROUTER_API_KEY
npm run dev               # Vite sur http://localhost:5180, API sur http://localhost:8787
```

Trois entrées : la home (`/`), la page d'une carte partagée (`/c/<id>`, qui porte aussi le champ pour les visiteurs) et l'URL directe `/<pseudo>`, qui lance la carte sans champ (route gérée côté navigateur, servie par le repli SPA). Coller une URL GitHub ou déposer un PDF n'importe où sur la page lance aussi la carte.

Vite proxifie `/api`, `/og` et `/c/` vers l'API. La page `/c/:id` est rendue par l'API : en dev elle demande le `index.html` transformé au serveur Vite (`DEV_WEB_URL`, défaut `http://localhost:5180`) et y injecte les balises Open Graph ; si Vite ne tourne pas, elle sert une page autonome avec les balises et l'image. On ouvre donc toujours `http://localhost:5180/c/<id>`.

Tests du serveur : `npx vitest run --root . server/src` (la config Vite a `root: "web"`, d'où le `--root .`).

Sans `GITHUB_TOKEN`, l'API démarre en dev avec un avertissement (GitHub limite alors à 60 requêtes par heure) et refuse de démarrer en production. Sans `OPENROUTER_API_KEY`, les cartes GitHub sortent sans lecture du code et les CV ne peuvent pas être lus.

## Variables

| Variable | Rôle | Défaut |
|---|---|---|
| `GITHUB_TOKEN` | token serveur pour l'API GitHub (REST et GraphQL) | obligatoire en prod |
| `OPENROUTER_API_KEY` | lecture du code et du CV par l'IA, via OpenRouter | sans IA si absent |
| `AI_MODEL_CODE` | modèle OpenRouter pour la lecture du code | `anthropic/claude-haiku-4.5` (`.env.example` : `anthropic/claude-haiku-5.5`) |
| `AI_MODEL_CV` | modèle OpenRouter pour la lecture du CV | `anthropic/claude-haiku-4.5` (`.env.example` : `anthropic/claude-haiku-5.5`) |
| `AI_DAILY_BUDGET_USD` | budget IA par jour ; au-delà, cartes sans lecture IA | `5` |
| `BASE_URL` | URL publique, pour `og:url`, `og:image` et les liens | `https://skills.azerit.tech` en prod, `http://localhost:5180` en dev |
| `DB_PATH` | base SQLite ; le cache des PNG vit à côté, dans `og/` | `./var/cards.db` |
| `LEADS_ENDPOINT` | webhook qui reçoit les emails laissés, au format de la landing | aucun |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | photo LinkedIn sur la carte (voir plus bas) | désactivée si absentes |
| `PORT` | port de l'API | `8787` |
| `IP_SALT` | sel du hash des IP pour la limite par jour | constante |
| `DEV_WEB_URL` | serveur Vite en dev | `http://localhost:5180` |

## Photo LinkedIn

Le créateur d'une carte peut y mettre sa photo LinkedIn. On passe par « Sign In with LinkedIn using OpenID Connect » (scopes `openid profile`), avec le consentement de la personne et sans scraping. Le token d'accès n'est jamais stocké. La photo est copiée dans `avatars/`, à côté de la base, car les URL LinkedIn expirent. Elle part avec la carte, à la suppression comme à la purge.

1. Créer une app sur https://www.linkedin.com/developers/.
2. Dans l'onglet Products, ajouter « Sign In with LinkedIn using OpenID Connect ».
3. Dans l'onglet Auth, déclarer la redirect URL `${BASE_URL}/auth/linkedin/callback` (en prod `https://skills.azerit.tech/auth/linkedin/callback`, en dev `http://localhost:5180/auth/linkedin/callback`).
4. Renseigner `LINKEDIN_CLIENT_ID` et `LINKEDIN_CLIENT_SECRET` dans `.env`.

Sans ces deux variables, `GET /api/config` renvoie `{ "linkedin": false }` et le front masque le bouton. Le flux démarre par `GET /auth/linkedin/start?card=ID&token=DELETE_TOKEN`, puis revient sur `/c/ID?photo=linkedin`, ou `?photo=error` en cas d'échec.

## Production et déploiement

En local : `npx vite build && npm start` sert le front de `dist/web` et l'API sur le même port.

Sur le VPS partagé, comme `../App` : pas de Caddy propre, ruby-caddy route `skills.azerit.tech` vers le conteneur `testyourskills` par le réseau docker `ruby_default`.

Première mise en ligne (DNS, `.env` du serveur, fichier Caddy), mises à jour et retour arrière : [`ops/DEPLOY.md`](ops/DEPLOY.md). Ensuite, depuis le Mac, sur `master` à jour : `scripts/deploy.sh --plan`, puis `scripts/deploy.sh`.

La base et les PNG sont dans le volume `testyourskills-data` (`/data`). Les cartes de plus de 90 jours sans email sont purgées au démarrage puis toutes les heures, avec leurs images.

## Architecture

- `web/` : front Vite + React 19 (entrée, attente, révélation, carte, partage).
- `web/src/three/` : la révélation en 3D (Three.js + `postprocessing`), walkout façon FC 27 dans un ascenseur qui monte jusqu'à l'étage du dev : `walkout.ts` (séquence, cabine, open space, caméra, lumières), `ledWall.ts` (écran LED des portes), `workstation.ts` (le poste du dev), `player.ts` (le dev assis), `cardMesh.ts` (carte épaisse), `stage.ts` (ville de nuit, reflets), `assets.ts` (préchargement).
- `web/public/3d/` : assets de la scène, environ 1 Mo. Panorama de nuit `shanghai_bund` (recadré) et grain `garage_floor` de Poly Haven (CC0), personnage Xbot des exemples three.js (sans animations, meshopt), Barlow Condensed 800 en typeface (SIL OFL).
- `shared/` : types (`CardData`, `JobState`…), constats de l'IA, composant carte SVG, fixtures.
- `data/` : barème, catalogue de statuts, mots creux.
- `server/src/index.ts` : lit l'environnement, ouvre la base, lance Hono, purge horaire, statique en prod.
- `server/src/app.ts` : routes `POST /api/card`, `GET /api/card/:id`, `DELETE /api/card/:id?token=`, `GET /api/card/:id/delete?token=`, `POST /api/event`, `POST /api/email`, `GET /og/:id(.png|-portrait.png|-card.png)`, `GET /c/:id`, `GET /api/health`.
- `server/src/pipeline.ts` : jobs en tâche de fond, timeout 30 s, progression, erreurs fr/en. Collecte GitHub → lecture IA → barème ; PDF → comptages → lecture IA → barème ; puis comparaison.
- `server/src/deps.ts` : câble les vrais modules (`github/`, `ai/`, `scoring/`, `cv/`, `render/`) ; les tests injectent des faux.
- `server/src/db.ts` : SQLite en WAL, tables `cards`, `events`, `ratelimit`. Jamais le CV ni son texte.
- `server/src/html.ts` : page `/c/:id` avec Open Graph et Twitter, lisible par les robots sans JS.
- `server/src/ratelimit.ts` : 20 cartes par IP et par jour, IP hashée, `X-Forwarded-For` derrière Caddy.
- `server/src/events.ts` : quatre événements en base, relais des emails à `LEADS_ENDPOINT`.
- `server/src/linkedin.ts` : photo LinkedIn par OpenID Connect, `/auth/linkedin/*` et `/avatar/:file`.
- Cache : même pseudo dans les 24 h → même id, sans nouvel appel ; jobs en cours dédupliqués.
- Le PDF n'est jamais écrit sur disque : lu en mémoire, texte jeté après les comptages et la lecture IA.
