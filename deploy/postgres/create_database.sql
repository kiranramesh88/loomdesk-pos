-- Create LoomDesk's production role and database. Run once, as a PostgreSQL superuser:
--
--   psql -U postgres -h localhost -f deploy/postgres/create_database.sql
--
-- Names default to loomdesk_app and loomdesk_prod; override with -v app_role=… -v app_db=….
-- psql prompts for the new role's password (\password), so the password never appears in this file,
-- the shell history or the server log. Store it in the deployment's secret manager as POSTGRES_PASSWORD.
--
-- The script stops without changing anything if the role or the database already exists. It never
-- touches any other database, including the `loomdesk` development database.
\set ON_ERROR_STOP on

\if :{?app_role}
\else
  \set app_role loomdesk_app
\endif
\if :{?app_db}
\else
  \set app_db loomdesk_prod
\endif

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') AS role_exists,
       EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db') AS db_exists
\gset

\if :role_exists
  \echo 'Stopped: role' :app_role 'already exists. Nothing was changed.'
  \echo 'To reset its password, run in psql:  \\password' :app_role
  \quit
\endif
\if :db_exists
  \echo 'Stopped: database' :app_db 'already exists. Nothing was changed.'
  \quit
\endif

-- The application role owns its database and nothing else: no superuser, no CREATEDB, no CREATEROLE.
CREATE ROLE :"app_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
\echo 'Set the password for' :app_role '(you will be asked twice):'
\password :app_role

CREATE DATABASE :"app_db" OWNER :"app_role" ENCODING 'UTF8' TEMPLATE template0;

-- Only the app role (and superusers) may connect. Development and test roles can't reach production data.
-- As the owner, the app role can create the application's tables in the database's public schema.
REVOKE ALL ON DATABASE :"app_db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"app_db" TO :"app_role";

\echo 'Created role' :app_role 'and database' :app_db '.'
