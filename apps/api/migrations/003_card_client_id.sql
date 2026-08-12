-- Referees submit from phones with a local retry queue, so the same card can
-- arrive twice after a dead zone. A score is naturally idempotent (setting it
-- twice is harmless) but a card is not -- a retry would record two yellows.
--
-- The client generates an id per card and reuses it on retry, so the second
-- arrival is recognised rather than duplicated.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS cards_client_id_idx
    ON cards (client_id) WHERE client_id IS NOT NULL;
