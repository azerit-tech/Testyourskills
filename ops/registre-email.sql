-- Le profil LinkedIn d'un email vérifié, chez l'App Azerit (SPEC §18.96).
--
-- À la connexion LinkedIn, l'email vérifié que LinkedIn donne peut désigner le
-- profil d'un coup, si l'App connaît déjà cette personne (`people.email`,
-- `people.other_emails`, et son compte LinkedIn par `accounts.person_id`).
-- Le rôle `testyourskills` ne lit pas `people` et ne doit pas le lire : cette
-- fonction, au propriétaire de la table, prend un email et ne rend que des
-- adresses de profil (`handle_key`), jamais un email ni rien d'autre de `people`.
-- Sans elle, le jeu fait comme avant (la photo et le GitHub départagent encore).
--
-- À appliquer UNE fois, à la main, après ops/registre-role.sql :
--
--   scp ops/registre-email.sql azerit:/tmp/registre-email.sql
--   ssh azerit "docker exec -i azerit-postgres psql -U postgres -d azerit -v ON_ERROR_STOP=1 < /tmp/registre-email.sql && rm /tmp/registre-email.sql"
--
-- 10 448 personnes le 20 novembre 2026 : un parcours de la table, ~8 ms, sans index.

CREATE OR REPLACE FUNCTION public.testyourskills_linkedin_by_email(e text)
RETURNS TABLE (handle_key text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Les personnes d'abord (MATERIALIZED) : sinon le planificateur part des 56 000
  -- comptes LinkedIn (80 ms au lieu de 8).
  WITH m AS MATERIALIZED (
    SELECT p.id
      FROM people p
     WHERE p.deleted_at IS NULL
       AND p.merged_into_id IS NULL
       AND length(e) BETWEEN 3 AND 254
       AND (lower(p.email) = lower(btrim(e))
            OR (p.other_emails <> ''
                AND strpos(lower(p.other_emails), lower(btrim(e))) > 0
                AND lower(btrim(e)) = ANY (regexp_split_to_array(lower(p.other_emails), '[\s,;]+'))))
  )
  SELECT DISTINCT a.handle_key::text
    FROM m
    JOIN accounts a ON a.person_id = m.id AND a.platform = 'linkedin' AND a.deleted_at IS NULL
   LIMIT 5
$$;

REVOKE ALL ON FUNCTION public.testyourskills_linkedin_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.testyourskills_linkedin_by_email(text) TO testyourskills;

-- Vérifier (aucune écriture) ; attendu : t f
SELECT has_function_privilege('testyourskills', 'public.testyourskills_linkedin_by_email(text)', 'EXECUTE') AS can_call,
       has_table_privilege('testyourskills', 'public.people', 'SELECT') AS reads_people;
