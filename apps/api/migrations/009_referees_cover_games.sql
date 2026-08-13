-- Referees are assigned to games, not to pitches.
--
-- Both models existed: a referee could be named on a fixture, or marked as
-- covering a field and thereby inherit every game played on it. Two ways to
-- answer one question is one too many -- it meant a referee's permissions
-- could not be read off the schedule, which is the only place anyone looks.
--
-- The tournament assigns referees game by game, so that is the model that
-- stays. The consequence is deliberate and worth stating: a game with no
-- referee named cannot be scored by any referee, only by an admin. The
-- schedule grid counts those games precisely so they are visible before the
-- day rather than discovered during it.

DROP TABLE IF EXISTS ref_field_assignments;
