-- SCORE Cup schema, initial migration.
--
-- Two principles run through this:
--   1. Derived values are never stored. Standings and suspensions are computed
--      from fixtures and cards, so a corrected score cannot leave a stale copy
--      behind. The old app stored wins/points on `teams` and drifted.
--   2. Rules live in `config` JSONB, typed in TypeScript. Pool counts,
--      tiebreaker order and bracket size change year to year; columns would
--      mean a migration every time.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('admin', 'ref', 'coach', 'participant');

CREATE TABLE users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT NOT NULL,
    password_hash        TEXT NOT NULL,
    role                 user_role NOT NULL,
    display_name         TEXT NOT NULL,
    -- Password resets are manual: an admin generates a single-use temporary
    -- password and emails it. No transactional email provider involved.
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    temp_password_expires_at TIMESTAMPTZ,
    disabled             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness without requiring the citext extension.
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

-- ---------------------------------------------------------------------------
-- Event structure: Event -> Division -> Stage -> Fixture
-- ---------------------------------------------------------------------------

-- The day itself. Owns what divisions share: fields and the time window.
CREATE TABLE events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    season           TEXT,
    event_date       DATE NOT NULL,
    start_time       TIME NOT NULL,
    end_time         TIME NOT NULL,
    -- Minimum gap between the end of a team's game and their next kickoff.
    -- Above the changeover length this forces teams to sit out alternate
    -- slots, at which point extra fields stop reducing the finish time.
    min_rest_minutes INTEGER NOT NULL DEFAULT 5,
    status           TEXT NOT NULL DEFAULT 'setup',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT events_window_valid CHECK (end_time > start_time),
    CONSTRAINT events_rest_non_negative CHECK (min_rest_minutes >= 0)
);

CREATE TABLE fields (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (event_id, name)
);

-- One tournament within the day. 2026 runs two.
CREATE TABLE divisions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'setup',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, name)
);

-- Which fields a division may use. No rows means "any field on the event",
-- so divisions share a pool competitively. Rows pin it, e.g. 2 fields each.
CREATE TABLE division_fields (
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    field_id    UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    PRIMARY KEY (division_id, field_id)
);

CREATE TYPE stage_kind AS ENUM ('pool', 'bracket');

CREATE TABLE stages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    kind        stage_kind NOT NULL,
    name        TEXT NOT NULL,
    -- Stages run in order; a bracket cannot start before its pools finish.
    sequence    INTEGER NOT NULL,
    -- PoolStageConfig or BracketStageConfig from @scores-cup/engine.
    -- Includes scoring, tiebreakers, games per team, and match timing --
    -- timing is per stage because knockout games are shorter than group games.
    config      JSONB NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    UNIQUE (division_id, sequence)
);

CREATE TABLE pools (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id   UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (stage_id, name)
);

CREATE TABLE teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    pool_id     UUID REFERENCES pools(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    -- Shared by the coach so teammates can self-register onto the right team.
    -- Without this gate anyone could claim any team and read contact details.
    join_code   TEXT NOT NULL,
    coach_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (division_id, name)
);

CREATE UNIQUE INDEX teams_join_code_idx ON teams (upper(join_code));

-- ---------------------------------------------------------------------------
-- Rosters
-- ---------------------------------------------------------------------------

-- Participants are adults (SCORE Cup is an adult fundraising tournament).
-- `user_id` is null for players a coach entered who never self-registered;
-- registering later with the same email merges into the existing row.
CREATE TABLE players (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id               UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    email                 TEXT,
    phone                 TEXT,
    emergency_contact_first_name TEXT,
    emergency_contact_last_name  TEXT,
    emergency_contact_phone      TEXT,
    jersey_size           TEXT,
    -- Gameplay data, not reporting data: at least 2 female-identifying players
    -- must be on the field, and penalty shooters alternate.
    gender_identity       TEXT,
    date_of_birth         DATE,
    prior_participation   BOOLEAN,
    is_captain            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX players_team_idx ON players (team_id);
CREATE UNIQUE INDEX players_team_email_idx ON players (team_id, lower(email))
    WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Fixtures and results
-- ---------------------------------------------------------------------------

CREATE TYPE fixture_status AS ENUM ('scheduled', 'in_progress', 'complete', 'cancelled');

CREATE TABLE fixtures (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id      UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    pool_id       UUID REFERENCES pools(id) ON DELETE SET NULL,
    field_id      UUID REFERENCES fields(id) ON DELETE SET NULL,

    -- The rule for who plays: a concrete team, "1st in Pool A", or
    -- "winner of SF1". Lets bracket games occupy a field and kickoff time
    -- before anyone knows who is in them.
    home_ref      JSONB NOT NULL,
    away_ref      JSONB NOT NULL,
    -- Filled in once the reference resolves. Null means still undetermined.
    home_team_id  UUID REFERENCES teams(id) ON DELETE SET NULL,
    away_team_id  UUID REFERENCES teams(id) ON DELETE SET NULL,

    round         TEXT,
    kickoff_at    TIMESTAMPTZ,
    status        fixture_status NOT NULL DEFAULT 'scheduled',

    home_score    INTEGER,
    away_score    INTEGER,
    -- Knockout draws go straight to penalties. Kept separate from goals: a
    -- 1-1 game won 4-3 on penalties is still 1-1 for goals for/against.
    home_penalties INTEGER,
    away_penalties INTEGER,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fixtures_scores_non_negative
        CHECK (home_score IS NULL OR home_score >= 0),
    CONSTRAINT fixtures_away_scores_non_negative
        CHECK (away_score IS NULL OR away_score >= 0),
    -- A completed game must have both scores or neither.
    CONSTRAINT fixtures_scores_paired
        CHECK ((home_score IS NULL) = (away_score IS NULL)),
    CONSTRAINT fixtures_penalties_paired
        CHECK ((home_penalties IS NULL) = (away_penalties IS NULL)),
    CONSTRAINT fixtures_no_self_play
        CHECK (home_team_id IS NULL OR away_team_id IS NULL OR home_team_id <> away_team_id)
);

CREATE INDEX fixtures_stage_idx ON fixtures (stage_id);
CREATE INDEX fixtures_field_kickoff_idx ON fixtures (field_id, kickoff_at);

CREATE TYPE card_type AS ENUM ('yellow', 'red');

-- Cards are logged team-level during play, because jerseys have no numbers and
-- a referee cannot identify a stranger mid-game. The captain attributes them
-- to a player at match-end sign-off, which the rules already require.
-- A card is valid and official the moment the referee records it.
CREATE TABLE cards (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixture_id       UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id        UUID REFERENCES players(id) ON DELETE SET NULL,
    -- Escape hatch for a player missing from the roster; flagged for an admin.
    player_name_note TEXT,
    -- What the referee jotted to identify them, e.g. "tall, red headband".
    identifying_note TEXT,
    type             card_type NOT NULL,
    minute           INTEGER,
    recorded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cards_minute_sane CHECK (minute IS NULL OR minute BETWEEN 0 AND 200)
);

CREATE INDEX cards_fixture_idx ON cards (fixture_id);
CREATE INDEX cards_player_idx ON cards (player_id) WHERE player_id IS NOT NULL;

-- A red card bans a player for at least the next match. The Match Commissioner
-- may extend that. The automatic one-match ban is derived from `cards`; only
-- the discretionary extension is stored.
CREATE TABLE ban_extensions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    additional_matches  INTEGER NOT NULL,
    reason              TEXT NOT NULL,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ban_extensions_positive CHECK (additional_matches > 0)
);

-- Both captains confirm score, penalties and card counts at match end.
CREATE TABLE match_signoffs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixture_id   UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    captain_name TEXT NOT NULL,
    signed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fixture_id, team_id)
);

-- "Modify any standing" without breaking the derived-standings rule: an
-- adjustment folds into the calculation as a visible, audited line item.
CREATE TABLE standings_adjustments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    points      INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Referee assignment, announcements, audit
-- ---------------------------------------------------------------------------

-- A referee may write scores and cards only for their assigned fields.
-- Enforced server-side, never trusted from the client.
CREATE TABLE ref_field_assignments (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, field_id)
);

-- Scope narrows left to right: event-wide, division-wide, or one team.
CREATE TABLE announcements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    division_id UUID REFERENCES divisions(id) ON DELETE CASCADE,
    team_id     UUID REFERENCES teams(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-editable so rules can change year to year without a deploy.
CREATE TABLE rules_pages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every mutation, so "who changed this score and when" has an answer when a
-- result is disputed on the day.
CREATE TABLE audit_log (
    id            BIGSERIAL PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    action        TEXT NOT NULL,
    before        JSONB,
    after         JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
