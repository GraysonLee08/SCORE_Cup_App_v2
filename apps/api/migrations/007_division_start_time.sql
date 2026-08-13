-- When each division's first game kicks off, and what a card costs.
--
-- 1. Division start times.
--
-- A division's start used to be derived: the second one began a short breather
-- after the first finished. That is not the same thing as a start time, and
-- 2026 shows why -- the Community division's 1:30 PM start was published to
-- teams before a schedule existed, so it is a fixed point the schedule has to
-- honour, not a consequence of how the morning went.
--
-- NULL keeps the old derived behaviour, which is what a single-division event
-- wants and what every existing event already has.
--
-- Pinning a start does not license a double booking: a field still hosts one
-- game at a time, so two divisions whose times overlap are fitted around each
-- other exactly as before, and the build reports when a pinned division had to
-- wait for a pitch.

ALTER TABLE divisions
    ADD COLUMN IF NOT EXISTS start_time TIME NULL;

COMMENT ON COLUMN divisions.start_time IS
    'First kickoff for this division. NULL derives it from the event and the sequencing mode.';

-- 2. Card weighting.
--
-- The 2026 rules phrase the tiebreaker as "least number of cards", which reads
-- as a flat count, so both were weighted 1. The tournament director has since
-- specified the FIFA-style weighting -- a yellow counts 1, a red counts 2 --
-- and the number is now shown publicly in the standings, so the stored config
-- has to agree with what is on the board.
--
-- Only touches stages that still carry the old flat weighting, so a deliberate
-- choice made after this migration is not overwritten by re-running it.

UPDATE stages
   SET config = jsonb_set(config, '{penaltyPoints,red}', '2'::jsonb)
 WHERE kind = 'pool'
   AND config -> 'penaltyPoints' ->> 'red' = '1'
   AND config -> 'penaltyPoints' ->> 'yellow' = '1';
