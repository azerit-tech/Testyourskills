-- Le rôle Postgres de Testyourskills dans la base de l'App Azerit (SPEC §18.95).
--
-- À appliquer UNE fois, à la main, sur le VPS (ops/DEPLOY.md, « Le registre de
-- l'App Azerit ») :
--
--   ssh azerit
--   docker exec -i azerit-postgres psql -U postgres -d azerit -v ON_ERROR_STOP=1 \
--     -v pw='<mot de passe>' < registre-role.sql
--
-- (`-v pw=…` : le mot de passe n'est jamais dans un fichier versionné ; tiré au
-- hasard, `openssl rand -hex 24`, puis écrit seulement dans le `.env` du serveur.)
--
-- Ce que le rôle peut faire, et rien d'autre :
--   - lire `accounts`, `account_links`, `cvs`, `photos`, `photo_profiles` ;
--   - ajouter des lignes à `accounts`, `account_links`, `cvs` (jamais UPDATE,
--     jamais DELETE) ;
--   - prendre un numéro dans leurs séquences (`id`) ;
--   - `sync_counter` (SELECT, UPDATE) : ce n'est pas le jeu qui l'écrit, ce sont
--     les déclencheurs de l'App (`*_sql_writer`, src/azerit/db/_sql_writers.py).
--     Ils s'exécutent avec les droits de qui insère, et prennent le `rev` de chaque
--     ligne nouvelle dans ce compteur. Sans ce droit, toute écriture échoue.
-- Aucune autre table (people, leads, users, emails…) n'est lisible.

CREATE ROLE testyourskills LOGIN PASSWORD :'pw'
  CONNECTION LIMIT 5;                                   -- l'app en ouvre trois au plus
-- Les déclencheurs de l'App ne donnent `uid` et `rev` qu'à une connexion qui se
-- déclare ; l'app le fait aussi à chaque connexion (server/src/registry/pg.ts).
ALTER ROLE testyourskills SET azerit.writer = 'testyourskills';
-- Garde-fous côté base, en plus de ceux de l'app.
ALTER ROLE testyourskills SET statement_timeout = '2s';
ALTER ROLE testyourskills SET idle_in_transaction_session_timeout = '10s';

GRANT CONNECT ON DATABASE azerit TO testyourskills;
GRANT USAGE ON SCHEMA public TO testyourskills;

GRANT SELECT ON accounts, account_links, cvs, photos, photo_profiles TO testyourskills;
GRANT INSERT ON accounts, account_links, cvs TO testyourskills;
GRANT USAGE ON SEQUENCE accounts_id_seq, account_links_id_seq, cvs_id_seq TO testyourskills;
GRANT SELECT, UPDATE ON sync_counter TO testyourskills;

-- Vérifier (aucune écriture) ; attendu : t t f f f f
SELECT has_table_privilege('testyourskills', 'public.account_links', 'INSERT') AS link_insert,
       has_table_privilege('testyourskills', 'public.cvs', 'SELECT')           AS cv_select,
       has_table_privilege('testyourskills', 'public.account_links', 'UPDATE') AS link_update,
       has_table_privilege('testyourskills', 'public.accounts', 'DELETE')      AS account_delete,
       has_table_privilege('testyourskills', 'public.people', 'SELECT')        AS people_select,
       has_table_privilege('testyourskills', 'public.photos', 'INSERT')        AS photo_insert;
