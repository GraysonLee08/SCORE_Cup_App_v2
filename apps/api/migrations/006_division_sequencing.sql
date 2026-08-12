-- How divisions share the venue when they run on the same day.
--
-- A field can host one game at a time. Scheduling each division on its own
-- ignored that and happily put two tournaments on Field 1 at 9:00, so the
-- choice now has to be made explicitly rather than assumed.
--
--   separate_fields  each division has its own pitches (division_fields);
--                    they never interact
--   sequential       one division plays out, then the next starts
--   alternating      divisions take turns on the same pitches: Community at
--                    9:00, Competitive at 9:35, Community at 10:10

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS division_sequencing TEXT NOT NULL DEFAULT 'separate_fields';

ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_division_sequencing_valid;

ALTER TABLE events
    ADD CONSTRAINT events_division_sequencing_valid
    CHECK (division_sequencing IN ('separate_fields', 'sequential', 'alternating'));
