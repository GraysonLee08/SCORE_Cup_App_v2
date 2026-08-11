-- Scheduling works in minutes from the first kickoff, which has to become a
-- wall-clock time somewhere. Doing that conversion needs a timezone: storing
-- "9:00 AM" as a timestamptz without one silently means 9am UTC, which is 3am
-- in Chicago.
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';
