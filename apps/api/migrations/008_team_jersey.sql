-- Which kit a team plays in.
--
-- Stores the name of an image shipped with the web app, not a colour. The
-- 2026 kits were supplied as artwork and several teams share a colour --
-- there are two JPMorganChase sides in different divisions wearing orange and
-- royal blue, and three teams in some shade of navy -- so a swatch would say
-- less than the shirt does.
--
-- Deliberately a free-text key rather than an enum or a foreign key to a
-- table of kits. The images are static assets that change every year with the
-- sponsors, and a tournament that has no artwork at all should simply leave
-- this null rather than need a migration to express that.

ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS jersey TEXT NULL;

COMMENT ON COLUMN teams.jersey IS
    'Basename of a kit image in apps/web/public/jerseys, without extension. NULL shows no kit.';
