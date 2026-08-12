-- Where the tournament is played. Shown to participants and spectators, and
-- part of the basic setup an organiser expects to fill in.
ALTER TABLE events ADD COLUMN IF NOT EXISTS location TEXT;
