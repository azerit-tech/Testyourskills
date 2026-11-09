# Mise en ligne de Testyourskills

`https://skills.azerit.tech`, sur le VPS partagé `azerit` (167.233.42.205), dans
`/opt/testyourskills`. Pas de Caddy propre : `ruby-caddy` détient 80/443 et route
`skills.azerit.tech` vers le conteneur `testyourskills` par le réseau docker
`ruby_default`. Le port 8787 n'est pas publié sur l'hôte (`expose` seulement).
La base et les PNG vivent dans le volume `testyourskills_testyourskills-data`,
monté sur `/data`.

Tout se lance **depuis le Mac**, dans le clone principal, sur `master` à jour
avec `origin`.

## Première mise en ligne, dans cet ordre

### 1. DNS

Chez OVH, zone `azerit.tech` : enregistrement **A** `skills` → `167.233.42.205`.
Le 9 novembre 2026, il répond déjà (pas de joker sur `*.azerit.tech` : c'est bien
cet enregistrement). Vérifier avant d'aller plus loin (Caddy demande le
certificat dès le reload) :

```bash
dig +short skills.azerit.tech     # doit répondre 167.233.42.205
```

### 2. Le `.env` du serveur

Le script refuse de partir sans lui, et ne l'écrase jamais.

```bash
ssh azerit 'mkdir -p /opt/testyourskills'
scp .env.example azerit:/opt/testyourskills/.env
ssh azerit 'chmod 600 /opt/testyourskills/.env'
ssh azerit                       # puis éditer /opt/testyourskills/.env
```

Valeurs de production :

```dotenv
NODE_ENV=production
BASE_URL=https://skills.azerit.tech
DB_PATH=/data/cards.db
PORT=8787
OPENROUTER_API_KEY=…             # crédit rechargé (SPEC §18.0)
GITHUB_TOKEN=…                   # obligatoire : sans lui l'app s'arrête en production
AI_MODEL_CODE=anthropic/claude-haiku-5.5
AI_MODEL_CV=anthropic/claude-haiku-5.5
AI_DAILY_BUDGET_USD=5
LEADS_ENDPOINT=…                 # relais des emails laissés sous la carte
LINKEDIN_CLIENT_ID=…             # redirect URL : https://skills.azerit.tech/auth/linkedin/callback
LINKEDIN_CLIENT_SECRET=…
IP_SALT=…                        # openssl rand -hex 32 : sinon le sel par défaut, public
```

`NODE_ENV`, `PORT` et `DB_PATH` sont aussi posés par `docker-compose.yml` ; les
écrire ici ne change rien mais garde le fichier lisible.

### 3. Caddy

Le fichier `/opt/caddy-sites/testyourskills.caddy`, comme les autres apps (README
du dossier, `cat /opt/caddy-sites/README`) :

```bash
scp caddy-snippet.txt azerit:/opt/caddy-sites/testyourskills.caddy
ssh azerit 'chmod 600 /opt/caddy-sites/testyourskills.caddy'
ssh azerit 'docker exec ruby-caddy caddy validate --config /etc/caddy/Caddyfile'
```

**Seulement si `validate` est valide :**

```bash
ssh azerit 'docker exec ruby-caddy caddy reload --config /etc/caddy/Caddyfile'
```

Si `validate` échoue : ne pas recharger, corriger d'abord, ou retirer le fichier
(laissé en place, il empêcherait Caddy de redémarrer). Tant que le conteneur
`testyourskills` n'existe pas, Caddy répond 502 sur ce domaine, sans gêner les
autres sites.

### 4. Le déploiement

```bash
scripts/deploy.sh --plan     # vérifie tout, rsync à blanc, n'écrit rien
scripts/deploy.sh            # demande « oui », puis déploie
```

Le premier build compile tout sur le VPS (quelques minutes, en `nice -n 10`).
À la fin, le script attend que le conteneur soit `healthy` puis interroge
`https://skills.azerit.tech/api/health`.

## Mises à jour

```bash
git switch master && git pull --ff-only
scripts/deploy.sh --plan     # à lire, surtout les lignes *deleting
scripts/deploy.sh
```

Le script refuse un arbre sale, une autre branche que `master`, ou un `master`
différent d'`origin/master`. Seuls les fichiers versionnés partent. Sur le VPS,
il ne touche jamais `.env` (ni aucun `.env*`), `.deployed_commit`,
`.deployed_commit.precedent`. Codes de sortie : `0` déployé · `1` arrêt avant la
bascule, rien de ce qui sert n'a bougé · `2` la nouvelle version tourne mais n'est
pas saine, les 80 dernières lignes de `docker logs testyourskills` sont affichées.

## Revenir au commit précédent

Avant chaque build, si la version en service est saine, son image est étiquetée
`testyourskills:precedent` et son commit copié dans `.deployed_commit.precedent`.
Un seul cran de retour.

```bash
scripts/deploy.sh --retour --plan    # dit vers quel commit
scripts/deploy.sh --retour           # remet l'image précédente, sans build
```

À la main, sur le VPS, si le Mac n'est pas disponible :

```bash
cd /opt/testyourskills
docker tag testyourskills:precedent testyourskills:latest
docker compose up -d --no-build --force-recreate     # SANS --build
cat .deployed_commit.precedent > .deployed_commit    # en place, jamais mv
docker logs --tail 80 testyourskills
```

Le retour remet l'**image**, pas le dossier du VPS ni la base : le code de la
version retirée reste dans `/opt/testyourskills`, et un `--build` ultérieur le
rebâtirait. Pour un retour durable : `git revert` sur `master`, push, puis
`scripts/deploy.sh`.

## Pour voir ce qui tourne

```bash
ssh azerit 'cat /opt/testyourskills/.deployed_commit; docker ps --filter name=testyourskills'
ssh azerit 'docker logs --tail 80 testyourskills'
```

## Le tableau de la semaine

Les chiffres du §13 de la spec, dont le coefficient viral, lus dans la base de production :

```sh
ssh azerit docker exec testyourskills node_modules/.bin/tsx scripts/weekly.ts --weeks 8
```
