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
AI_MIN_CREDIT_USD=0.5            # sous ce solde OpenRouter, commissariat fermé
LEADS_ENDPOINT=…                 # relais des emails laissés sous la carte
LINKEDIN_CLIENT_ID=…             # redirect URL : https://skills.azerit.tech/auth/linkedin/callback
LINKEDIN_CLIENT_SECRET=…
GITHUB_OAUTH_CLIENT_ID=…         # « Se connecter avec GitHub » (§18.80) ; retour : https://skills.azerit.tech/auth/github/callback
GITHUB_OAUTH_CLIENT_SECRET=…     # absentes : l'application de « C'est moi » sert, sinon le bouton ouvre le champ
BRAVE_SEARCH_API_KEY=…           # recherche des profils LinkedIn par nom (§18.90), 0,005 $ la requête
SERPER_API_KEY=…                 # le repli (Google), 0,001 $ la requête ; sans les deux : pas de suggestions LinkedIn
LINKEDIN_DAILY_SEARCHES=2000     # plafond du jour des recherches par nom (10 $ au plus chez Brave)
IP_SALT=…                        # openssl rand -hex 32 : sinon le sel par défaut, public
HIGH_BAR_EMPLOYERS_FILE=/data/employers.json   # listes privées : voir « Les listes privées »
SCHOOL_TIERS_FILE=/data/schools.json
AZERIT_DB_URL=postgres://testyourskills:…@azerit-postgres:5432/azerit   # registre de l'App : voir « Le registre de l'App Azerit » ; absent, rien ne change
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

## Le registre de l'App Azerit

Le jeu lit et enrichit la base de l'App (SPEC §18.95) : `azerit-postgres`, base
`azerit`, sur le même réseau docker `ruby_default`. Il y entre sous un rôle à
lui, `testyourskills`, jamais le superutilisateur : lecture de `accounts`,
`account_links`, `cvs`, `photos`, `photo_profiles` ; ajout seul dans `accounts`,
`account_links`, `cvs`. Une fois, à la main :

```bash
PW=$(openssl rand -hex 24); echo "$PW"      # à garder pour le .env, nulle part ailleurs
scp ops/registre-role.sql azerit:/tmp/registre-role.sql
ssh azerit "docker exec -i azerit-postgres psql -U postgres -d azerit -v ON_ERROR_STOP=1 -v pw='$PW' < /tmp/registre-role.sql && rm /tmp/registre-role.sql"
```

La dernière requête du fichier affiche `t | t | f | f | f | f` (insérer un lien,
lire un CV : oui ; modifier un lien, supprimer un compte, lire `people`, ajouter
une photo : non). Puis, dans `/opt/testyourskills/.env` :

```dotenv
AZERIT_DB_URL=postgres://testyourskills:<le mot de passe>@azerit-postgres:5432/azerit
```

et `ssh azerit 'cd /opt/testyourskills && docker compose up -d'` (un `.env`
changé demande de recréer le conteneur ; le prochain `scripts/deploy.sh` le fait
aussi). Au démarrage, le journal dit `Registre de l'App Azerit : branché`.

Vérifier, sans rien écrire :

```bash
ssh azerit "docker exec azerit-postgres psql -U postgres -d azerit -c \"SELECT updated_by, count(*) FROM account_links WHERE source = 'testyourskills' GROUP BY 1\""
ssh azerit 'docker logs --tail 200 testyourskills | grep registre'   # une panne : « [registre] … indisponible »
```

Couper : retirer `AZERIT_DB_URL` du `.env` et recréer le conteneur. Retirer le
rôle (il ne possède aucun objet : `DROP OWNED` ne fait que lui reprendre ses
droits) : `DROP OWNED BY testyourskills; DROP ROLE testyourskills;`. Les lignes
déjà écrites restent à l'App (elles sont à elle).

## Les listes privées (employeurs, écoles)

Deux listes ne sont pas dans le dépôt public (SPEC §18.37, §18.50) : les
employeurs à forte barre d'embauche (`data/employers.json`) et les écoles avec
leur rang (`data/schools.json`). Elles vivent dans le clone principal du Mac,
ignorées par git ; le dépôt n'en garde que les exemples
(`data/employers.example.json`, `data/schools.example.json`). `scripts/deploy.sh`
ne les envoie pas (seuls les fichiers versionnés partent) : elles se posent à la
main dans le volume `/data`, à côté de la base, où aucun déploiement ne les
efface.

Sans elles, rien ne plante, mais les notes changent : aucun employeur à forte
barre, et chaque école prend le rang lu par l'IA, plafonné à B. Le démarrage le
dit (`docker logs testyourskills`), et `scripts/deploy.sh` affiche une ligne
`ATTENTION : liste privée non posée` tant que l'une manque.

À faire une fois, **avant** le déploiement qui les lit, puis à chaque changement
d'une liste (depuis le clone principal, conteneur en marche) :

```bash
ssh azerit 'docker exec -i testyourskills sh -c "cat > /data/employers.json"' < data/employers.json
ssh azerit 'docker exec -i testyourskills sh -c "cat > /data/schools.json"' < data/schools.json
ssh azerit                       # dans /opt/testyourskills/.env :
                                 #   HIGH_BAR_EMPLOYERS_FILE=/data/employers.json
                                 #   SCHOOL_TIERS_FILE=/data/schools.json
```

Puis `scripts/deploy.sh` (la nouvelle image lit le `.env` et les fichiers). Pour
une liste changée sans nouveau commit, relancer le conteneur, qui les lit au
démarrage :

```bash
ssh azerit 'cd /opt/testyourskills && docker compose up -d --no-build --force-recreate'
ssh azerit 'docker logs testyourskills 2>&1 | grep -E "^(Écoles|Employeurs)|_FILE"'   # « Écoles : … rangs lus dans /data/schools.json. »
```

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

## Sauvegarde de la base

`scripts/backup.ts` copie la base par l'API de sauvegarde de SQLite : une copie
cohérente pendant que le site tourne (jamais un `cp` du fichier, en mode WAL une
page peut être à moitié écrite), vérifiée (`quick_check`), autonome (sans fichier
`-wal`), horodatée en UTC dans `/data/backups/cards-AAAAMMJJ-HHMMSSZ.db`, sur le
volume. Il garde les 14 dernières (`--keep N` pour changer). Code de sortie 1 si
la copie échoue ; les anciennes ne sont alors pas touchées. La base seule : ni
les PNG (`/data/og`, refaits à la demande) ni les photos LinkedIn
(`/data/avatars`).

À la main, sur le VPS :

```sh
ssh azerit docker exec testyourskills node_modules/.bin/tsx scripts/backup.ts
ssh azerit docker exec testyourskills ls -l /data/backups
```

Tous les jours à 3 h 17 (heure du serveur), proposé pour la crontab de l'hôte
(`ssh azerit`, puis `crontab -e`) :

```cron
17 3 * * * docker exec testyourskills nice -n 10 node_modules/.bin/tsx scripts/backup.ts >> /opt/testyourskills/backup.log 2>&1
```

Les copies vivent sur le même disque que la base : elles protègent d'une erreur
ou d'une base abîmée, pas de la perte du VPS. Pour en garder une ailleurs, depuis
le Mac :

```sh
ssh azerit 'docker exec testyourskills sh -c "ls -1 /data/backups | tail -1"'   # la dernière
ssh azerit 'docker cp testyourskills:/data/backups/cards-….db /tmp/' && scp azerit:/tmp/cards-….db ~/Sauvegardes/
```

### Restaurer

Site coupé le temps de la copie (une minute). La base en place est d'abord mise
de côté dans `/data/avant-restauration/`.

```sh
ssh azerit
cd /opt/testyourskills
docker exec testyourskills ls -1 /data/backups          # choisir la copie
docker compose stop testyourskills                      # la base se ferme proprement
docker run --rm -v testyourskills_testyourskills-data:/data node:22-slim sh -c '
  set -e
  mkdir -p /data/avant-restauration
  cp -p /data/cards.db* /data/avant-restauration/
  cp /data/backups/cards-AAAAMMJJ-HHMMSSZ.db /data/cards.db
  rm -f /data/cards.db-wal /data/cards.db-shm
  chown node:node /data/cards.db'
docker compose start testyourskills
docker logs --tail 20 testyourskills
curl -s https://skills.azerit.tech/api/health
```

Au démarrage, le serveur migre la base restaurée si elle date d'une version
plus ancienne. Le cache des PNG (`/data/og`) peut montrer une fiche qui n'existe
plus dans la copie : il ne sert que les fiches présentes en base.

## Le tableau de la semaine

Les chiffres du §13 de la spec, dont le coefficient viral, lus dans la base de production :

```sh
ssh azerit docker exec testyourskills node_modules/.bin/tsx scripts/weekly.ts --weeks 8
```

## Relire les bandes de boîte

Le nom d'une boîte hors de la table d'alias est tapé par son premier membre. Il
n'a ni page publique ni image avant trois dossiers, mais il se relit à la main
(chaque jour la première semaine) :

```sh
ssh azerit docker exec testyourskills node_modules/.bin/tsx scripts/bands-review.ts
```

Pour fermer une bande : ajouter `"boite/<id>"` à `blocked` dans
`data/bands.json`, puis redéployer. Elle répond alors 404 partout, sort du
tableau, et personne ne peut plus y entrer. Un mot à refuser partout :
`companies.refusedWords` (mot entier) ou `companies.refusedStems` (n'importe où
dans le nom), même fichier.
