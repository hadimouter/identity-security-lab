-- Creation des deux bases du lab.
--
-- Ce script est joue par l'entrypoint Postgres au tout premier
-- demarrage du conteneur, quand le volume de donnees est vide.
-- Il n'est pas rejoue ensuite. Pour le relancer :
--
--   docker compose down -v && docker compose up -d
--
-- Un seul conteneur Postgres, deux bases distinctes :
--
--   keycloak     schema interne de l'Identity Provider
--   identitylab  donnees applicatives (users, access_requests,
--                access_grants, audit_logs)
--
-- La separation est volontaire. L'application ne lit jamais la base de
-- Keycloak : elle conserve seulement un mapping entre le claim "sub" du
-- token et l'utilisateur local.
--
-- Aucun mot de passe n'apparait ici. Les deux bases appartiennent a
-- l'utilisateur POSTGRES_USER, defini dans .env.

CREATE DATABASE keycloak;
CREATE DATABASE identitylab;

COMMENT ON DATABASE keycloak IS 'Identity Provider Keycloak - ne pas modifier depuis l''application';
COMMENT ON DATABASE identitylab IS 'Donnees applicatives du lab IAM';
