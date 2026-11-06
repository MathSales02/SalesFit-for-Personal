#!/bin/sh
# Creates two roles with least privilege:
#   cadencia_owner - owns the schema, runs migrations. Never used by the app at runtime.
#   cadencia_app   - runtime role. DML only, no DDL, NOT a superuser, no BYPASSRLS,
#                    so Row-Level Security policies always apply to it.
set -e
psql -v ON_ERROR_STOP=1 --username postgres <<SQL
CREATE ROLE cadencia_owner LOGIN PASSWORD '${CADENCIA_OWNER_PASSWORD}';
CREATE ROLE cadencia_app LOGIN PASSWORD '${CADENCIA_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE cadencia OWNER cadencia_owner;
CREATE DATABASE cadencia_test OWNER cadencia_owner;
SQL
for db in cadencia cadencia_test; do
psql -v ON_ERROR_STOP=1 --username postgres --dbname "$db" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO cadencia_owner;
GRANT USAGE ON SCHEMA public TO cadencia_app;
REVOKE CONNECT ON DATABASE $db FROM PUBLIC;
GRANT CONNECT ON DATABASE $db TO cadencia_owner, cadencia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cadencia_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cadencia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cadencia_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cadencia_app;
SQL
done
