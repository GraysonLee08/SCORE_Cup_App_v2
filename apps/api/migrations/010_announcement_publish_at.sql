-- Messages that are written now and revealed later.
--
-- The director writes the day's messages before the day: the welcome, the
-- lunch note, the "playoffs start in fifteen minutes", the awards call. Typing
-- them at 1:25pm with a queue at the scores table is how they end up not being
-- sent at all.
--
-- Deliberately no scheduler, no worker, no queue. Both places a message is
-- read -- the public board and a team's own page -- already re-read on a timer
-- or on load, so a message with a time in the future simply is not selected
-- until that time passes, and appears on the next poll. The board polls every
-- 20 seconds while a game is running, so "reveal at 1:30" means 1:30, give or
-- take one poll.
--
-- That distinction is what makes this small: a background process is what you
-- need to *push* something at a moment, and nothing here pushes. The reveal is
-- a read-time filter, and a read-time filter cannot fail overnight, cannot
-- double-send, and cannot drift out of sync with the database it reads.
--
-- NULL means what it has always meant: visible as soon as it is written. Every
-- existing message keeps that behaviour without being touched.

ALTER TABLE announcements
    ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN announcements.publish_at IS
    'When this message becomes visible. NULL publishes immediately. Readers filter on it; nothing pushes.';

-- Readers ask for "everything published, newest first", which is a range scan
-- over this column for the scheduled rows and a null-check for the rest.
CREATE INDEX IF NOT EXISTS announcements_event_publish_idx
    ON announcements (event_id, publish_at);
