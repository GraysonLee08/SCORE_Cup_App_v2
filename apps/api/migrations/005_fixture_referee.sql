-- A referee can be assigned to an individual match, not only to a field.
--
-- Field assignment stays as the broad default (a referee covering Field 2 all
-- day), and this is the specific override for a match that needs a named
-- official -- a final, or a game where the usual referee has a conflict.
--
-- Access is the union of the two: whoever covers the field, plus whoever is
-- named on the match. Making a named assignment exclusive would leave nobody
-- able to enter a score if that person did not turn up.
ALTER TABLE fixtures
    ADD COLUMN IF NOT EXISTS referee_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fixtures_referee_idx
    ON fixtures (referee_user_id) WHERE referee_user_id IS NOT NULL;
