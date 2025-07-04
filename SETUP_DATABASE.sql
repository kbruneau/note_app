-- ========================================================================== --
--                              SCHEMA DEFINITIONS                            --
-- ========================================================================== --

CREATE SCHEMA IF NOT EXISTS "Note";
CREATE SCHEMA IF NOT EXISTS "DM"; -- For DM.bestiarys as it wasn't moved
CREATE SCHEMA IF NOT EXISTS "core";
CREATE SCHEMA IF NOT EXISTS "background";
CREATE SCHEMA IF NOT EXISTS "class";

-- ========================================================================== --
--                                TABLE CREATION                              --
-- ========================================================================== --

-- Schema: Note

CREATE TABLE IF NOT EXISTS "Note"."users" (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Conditionally add username column to Note.users if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'users'
        AND column_name = 'username'
    ) THEN
        ALTER TABLE "Note"."users" ADD COLUMN username TEXT;
        RAISE NOTICE 'Column username added to Note.users table.';
        -- Note: NOT NULL and UNIQUE constraints are ideally part of initial table creation
        -- or added separately if table already has data.
        -- For now, just ensuring column existence.
    ELSE
        RAISE NOTICE 'Column username already exists in Note.users table.';
    END IF;
END $$;

-- Conditionally add password_hash column to Note.users if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'users'
        AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE "Note"."users" ADD COLUMN password_hash TEXT;
        RAISE NOTICE 'Column password_hash added to Note.users table.';
        -- Note: NOT NULL constraint is ideally part of initial table creation.
    ELSE
        RAISE NOTICE 'Column password_hash already exists in Note.users table.';
    END IF;
END $$;

-- Conditionally add created_at column to Note.users if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'users'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE "Note"."users" ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Column created_at added to Note.users table.';
    ELSE
        RAISE NOTICE 'Column created_at already exists in Note.users table.';
    END IF;
END $$;

COMMENT ON TABLE "Note"."users" IS 'Stores user account information.';
COMMENT ON COLUMN "Note"."users"."id" IS 'Unique identifier for the user.';
COMMENT ON COLUMN "Note"."users"."username" IS 'Unique username for the user.';
COMMENT ON COLUMN "Note"."users"."password_hash" IS 'Hashed password for the user.';
COMMENT ON COLUMN "Note"."users"."created_at" IS 'Timestamp of when the user account was created.';


CREATE TABLE IF NOT EXISTS "Note"."notes" (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    title TEXT,
    content_tsv TSVECTOR
);

-- Conditionally add user_id column to Note.notes if the table pre-existed without it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'notes'
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE "Note"."notes" ADD COLUMN user_id INTEGER;
        RAISE NOTICE 'Column user_id added to Note.notes table.';
    ELSE
        RAISE NOTICE 'Column user_id already exists in Note.notes table.';
    END IF;
END $$;

-- Conditionally add content column to Note.notes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'notes'
        AND column_name = 'content'
    ) THEN
        ALTER TABLE "Note"."notes" ADD COLUMN content TEXT;
        RAISE NOTICE 'Column content added to Note.notes table.';
    ELSE
        RAISE NOTICE 'Column content already exists in Note.notes table.';
    END IF;
END $$;

-- Conditionally add created_at column to Note.notes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'notes'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE "Note"."notes" ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Column created_at added to Note.notes table.';
    ELSE
        RAISE NOTICE 'Column created_at already exists in Note.notes table.';
    END IF;
END $$;

-- Conditionally add updated_at column to Note.notes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'notes'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE "Note"."notes" ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Column updated_at added to Note.notes table.';
    ELSE
        RAISE NOTICE 'Column updated_at already exists in Note.notes table.';
    END IF;
END $$;

-- Conditionally add title column to Note.notes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'notes'
        AND column_name = 'title'
    ) THEN
        ALTER TABLE "Note"."notes" ADD COLUMN title TEXT;
        RAISE NOTICE 'Column title added to Note.notes table.';
    ELSE
        RAISE NOTICE 'Column title already exists in Note.notes table.';
    END IF;
END $$;

-- Conditionally add content_tsv column to Note.notes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'notes'
        AND column_name = 'content_tsv'
    ) THEN
        ALTER TABLE "Note"."notes" ADD COLUMN content_tsv TSVECTOR;
        RAISE NOTICE 'Column content_tsv added to Note.notes table.';
    ELSE
        RAISE NOTICE 'Column content_tsv already exists in Note.notes table.';
    END IF;
END $$;

COMMENT ON COLUMN "Note"."notes"."user_id" IS 'Identifier of the user who owns the note.';
COMMENT ON COLUMN "Note"."notes"."content" IS 'The main textual content of the note.';
COMMENT ON COLUMN "Note"."notes"."created_at" IS 'Timestamp of when the note was created.';
COMMENT ON COLUMN "Note"."notes"."updated_at" IS 'Timestamp of when the note was last updated.';
COMMENT ON COLUMN "Note"."notes"."title" IS 'Optional title for the note.';
COMMENT ON COLUMN "Note"."notes"."content_tsv" IS 'Full-text search vector for note content.';


CREATE TABLE IF NOT EXISTS "Note"."nodes" (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    sub_type TEXT,
    description TEXT,
    source TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_player_character BOOLEAN DEFAULT FALSE,
    is_party_member BOOLEAN DEFAULT FALSE
);

-- Conditionally add is_player_character column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'is_player_character'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN is_player_character BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Column is_player_character added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column is_player_character already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add is_party_member column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'is_party_member'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN is_party_member BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Column is_party_member added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column is_party_member already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add name column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'name'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN name TEXT;
        RAISE NOTICE 'Column name added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column name already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add type column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'type'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN type TEXT;
        RAISE NOTICE 'Column type added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column type already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add sub_type column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'sub_type'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN sub_type TEXT;
        RAISE NOTICE 'Column sub_type added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column sub_type already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add description column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'description'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN description TEXT;
        RAISE NOTICE 'Column description added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column description already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add source column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'source'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN source TEXT;
        RAISE NOTICE 'Column source added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column source already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add tags column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'tags'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN tags TEXT[];
        RAISE NOTICE 'Column tags added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column tags already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add created_at column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Column created_at added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column created_at already exists in Note.nodes table.';
    END IF;
END $$;

-- Conditionally add updated_at column to Note.nodes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'nodes'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE "Note"."nodes" ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Column updated_at added to Note.nodes table.';
    ELSE
        RAISE NOTICE 'Column updated_at already exists in Note.nodes table.';
    END IF;
END $$;

COMMENT ON COLUMN "Note"."nodes"."name" IS 'The primary name of the node/entity.';
COMMENT ON COLUMN "Note"."nodes"."type" IS 'The broad category of the node (e.g., PERSON, LOCATION, ITEM).';
COMMENT ON COLUMN "Note"."nodes"."sub_type" IS 'A more specific category (e.g., City, Deity, Quest Item).';
COMMENT ON COLUMN "Note"."nodes"."description" IS 'A brief description or summary of the node.';
COMMENT ON COLUMN "Note"."nodes"."source" IS 'Where this node information originated from.';
COMMENT ON COLUMN "Note"."nodes"."tags" IS 'Arbitrary tags for filtering and organization.';
COMMENT ON COLUMN "Note"."nodes"."is_player_character" IS 'Flag indicating if a PERSON node is a player character.';
COMMENT ON COLUMN "Note"."nodes"."is_party_member" IS 'Flag indicating if a PERSON node is a party member.';


CREATE TABLE IF NOT EXISTS "Note"."note_mentions" (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    start_pos INTEGER,
    end_pos INTEGER,
    mention_type TEXT,
    source TEXT,
    confidence REAL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Conditionally add note_id column to Note.note_mentions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'note_mentions'
        AND column_name = 'note_id'
    ) THEN
        ALTER TABLE "Note"."note_mentions" ADD COLUMN note_id INTEGER;
        RAISE NOTICE 'Column note_id added to Note.note_mentions table.';
    ELSE
        RAISE NOTICE 'Column note_id already exists in Note.note_mentions table.';
    END IF;
END $$;

-- Conditionally add node_id column to Note.note_mentions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'note_mentions'
        AND column_name = 'node_id'
    ) THEN
        ALTER TABLE "Note"."note_mentions" ADD COLUMN node_id INTEGER;
        RAISE NOTICE 'Column node_id added to Note.note_mentions table.';
    ELSE
        RAISE NOTICE 'Column node_id already exists in Note.note_mentions table.';
    END IF;
END $$;

-- Conditionally add start_pos column to Note.note_mentions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'note_mentions'
        AND column_name = 'start_pos'
    ) THEN
        ALTER TABLE "Note"."note_mentions" ADD COLUMN start_pos INTEGER;
        RAISE NOTICE 'Column start_pos added to Note.note_mentions table.';
    ELSE
        RAISE NOTICE 'Column start_pos already exists in Note.note_mentions table.';
    END IF;
END $$;

-- Conditionally add end_pos column to Note.note_mentions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'note_mentions'
        AND column_name = 'end_pos'
    ) THEN
        ALTER TABLE "Note"."note_mentions" ADD COLUMN end_pos INTEGER;
        RAISE NOTICE 'Column end_pos added to Note.note_mentions table.';
    ELSE
        RAISE NOTICE 'Column end_pos already exists in Note.note_mentions table.';
    END IF;
END $$;

-- Conditionally add mention_type column to Note.note_mentions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'note_mentions'
        AND column_name = 'mention_type'
    ) THEN
        ALTER TABLE "Note"."note_mentions" ADD COLUMN mention_type TEXT;
        RAISE NOTICE 'Column mention_type added to Note.note_mentions table.';
    ELSE
        RAISE NOTICE 'Column mention_type already exists in Note.note_mentions table.';
    END IF;
END $$;

-- Conditionally add source column to Note.note_mentions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'note_mentions'
        AND column_name = 'source'
    ) THEN
        ALTER TABLE "Note"."note_mentions" ADD COLUMN source TEXT;
        RAISE NOTICE 'Column source added to Note.note_mentions table.';
    ELSE
        RAISE NOTICE 'Column source already exists in Note.note_mentions table.';
    END IF;
END $$;

-- Conditionally add confidence column to Note.note_mentions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'note_mentions'
        AND column_name = 'confidence'
    ) THEN
        ALTER TABLE "Note"."note_mentions" ADD COLUMN confidence REAL;
        RAISE NOTICE 'Column confidence added to Note.note_mentions table.';
    ELSE
        RAISE NOTICE 'Column confidence already exists in Note.note_mentions table.';
    END IF;
END $$;

-- Conditionally add created_at column to Note.note_mentions if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'note_mentions'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE "Note"."note_mentions" ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Column created_at added to Note.note_mentions table.';
    ELSE
        RAISE NOTICE 'Column created_at already exists in Note.note_mentions table.';
    END IF;
END $$;

COMMENT ON COLUMN "Note"."note_mentions"."note_id" IS 'ID of the note where the mention occurs.';
COMMENT ON COLUMN "Note"."note_mentions"."node_id" IS 'ID of the canonical node this mention refers to.';
COMMENT ON COLUMN "Note"."note_mentions"."start_pos" IS 'Start character position of the mention in the note content.';
COMMENT ON COLUMN "Note"."note_mentions"."end_pos" IS 'End character position of the mention in the note content.';
COMMENT ON COLUMN "Note"."note_mentions"."mention_type" IS 'The entity type assigned to this specific mention.';
COMMENT ON COLUMN "Note"."note_mentions"."source" IS 'Source of the mention tag (e.g., NLP, User Confirmed).';
COMMENT ON COLUMN "Note"."note_mentions"."confidence" IS 'Confidence score for the generated tag.';


CREATE TABLE IF NOT EXISTS "Note"."node_links" (
    id SERIAL PRIMARY KEY,
    source_node_id INTEGER NOT NULL,
    target_node_id INTEGER NOT NULL,
    relationship_type TEXT DEFAULT 'related',
    description TEXT,
    note_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    -- Removed UNIQUE constraint from here
);

-- Conditionally add relationship_type column to Note.node_links if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'node_links'
        AND column_name = 'relationship_type'
    ) THEN
        ALTER TABLE "Note"."node_links" ADD COLUMN relationship_type TEXT DEFAULT 'related';
        RAISE NOTICE 'Column relationship_type added to Note.node_links table.';
    ELSE
        RAISE NOTICE 'Column relationship_type already exists in Note.node_links table.';
    END IF;
END $$;

COMMENT ON COLUMN "Note"."node_links"."relationship_type" IS 'Describes the nature of the link (e.g., related, allied_with).';

-- Conditionally add description column to Note.node_links if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'node_links'
        AND column_name = 'description'
    ) THEN
        ALTER TABLE "Note"."node_links" ADD COLUMN description TEXT;
        RAISE NOTICE 'Column description added to Note.node_links table.';
    ELSE
        RAISE NOTICE 'Column description already exists in Note.node_links table.';
    END IF;
END $$;

COMMENT ON COLUMN "Note"."node_links"."description" IS 'Optional text describing the link.';
COMMENT ON COLUMN "Note"."node_links"."note_id" IS 'ID of the note from which this link might have been inferred.';


CREATE TABLE IF NOT EXISTS "Note"."node_relationships" (
    id SERIAL PRIMARY KEY,
    parent_node_id INTEGER NOT NULL,
    child_node_id INTEGER NOT NULL,
    relationship_type TEXT NOT NULL,
    note_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Conditionally add parent_node_id column to Note.node_relationships if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'node_relationships'
        AND column_name = 'parent_node_id'
    ) THEN
        ALTER TABLE "Note"."node_relationships" ADD COLUMN parent_node_id INTEGER;
        RAISE NOTICE 'Column parent_node_id added to Note.node_relationships table.';
    ELSE
        RAISE NOTICE 'Column parent_node_id already exists in Note.node_relationships table.';
    END IF;
END $$;

-- Conditionally add child_node_id column to Note.node_relationships if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'node_relationships'
        AND column_name = 'child_node_id'
    ) THEN
        ALTER TABLE "Note"."node_relationships" ADD COLUMN child_node_id INTEGER;
        RAISE NOTICE 'Column child_node_id added to Note.node_relationships table.';
    ELSE
        RAISE NOTICE 'Column child_node_id already exists in Note.node_relationships table.';
    END IF;
END $$;

-- Conditionally add relationship_type column to Note.node_relationships if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'node_relationships'
        AND column_name = 'relationship_type'
    ) THEN
        ALTER TABLE "Note"."node_relationships" ADD COLUMN relationship_type TEXT;
        RAISE NOTICE 'Column relationship_type added to Note.node_relationships table.';
    ELSE
        RAISE NOTICE 'Column relationship_type already exists in Note.node_relationships table.';
    END IF;
END $$;

-- Conditionally add note_id column to Note.node_relationships if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'node_relationships'
        AND column_name = 'note_id'
    ) THEN
        ALTER TABLE "Note"."node_relationships" ADD COLUMN note_id INTEGER;
        RAISE NOTICE 'Column note_id added to Note.node_relationships table.';
    ELSE
        RAISE NOTICE 'Column note_id already exists in Note.node_relationships table.';
    END IF;
END $$;

-- Conditionally add created_at column to Note.node_relationships if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'node_relationships'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE "Note"."node_relationships" ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Column created_at added to Note.node_relationships table.';
    ELSE
        RAISE NOTICE 'Column created_at already exists in Note.node_relationships table.';
    END IF;
END $$;

COMMENT ON COLUMN "Note"."node_relationships"."relationship_type" IS 'Type of hierarchical or possessive relationship (e.g., located_in, member_of).';


CREATE TABLE IF NOT EXISTS "Note"."tagging_corrections" (
    id SERIAL PRIMARY KEY,
    note_id INTEGER,
    mention_id INTEGER,
    original_text_segment TEXT,
    original_mention_type TEXT,
    original_source TEXT,
    original_confidence REAL,
    corrected_text_segment TEXT,
    corrected_mention_type TEXT,
    correction_action TEXT NOT NULL,
    user_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Conditionally add note_id column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'note_id'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN note_id INTEGER;
        RAISE NOTICE 'Column note_id added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column note_id already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add mention_id column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'mention_id'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN mention_id INTEGER;
        RAISE NOTICE 'Column mention_id added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column mention_id already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add original_text_segment column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'original_text_segment'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN original_text_segment TEXT;
        RAISE NOTICE 'Column original_text_segment added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column original_text_segment already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add original_mention_type column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'original_mention_type'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN original_mention_type TEXT;
        RAISE NOTICE 'Column original_mention_type added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column original_mention_type already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add original_source column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'original_source'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN original_source TEXT;
        RAISE NOTICE 'Column original_source added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column original_source already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add original_confidence column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'original_confidence'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN original_confidence REAL;
        RAISE NOTICE 'Column original_confidence added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column original_confidence already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add corrected_text_segment column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'corrected_text_segment'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN corrected_text_segment TEXT;
        RAISE NOTICE 'Column corrected_text_segment added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column corrected_text_segment already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add corrected_mention_type column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'corrected_mention_type'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN corrected_mention_type TEXT;
        RAISE NOTICE 'Column corrected_mention_type added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column corrected_mention_type already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add correction_action column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'correction_action'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN correction_action TEXT;
        RAISE NOTICE 'Column correction_action added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column correction_action already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add user_id column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN user_id INTEGER;
        RAISE NOTICE 'Column user_id added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column user_id already exists in Note.tagging_corrections table.';
    END IF;
END $$;

-- Conditionally add created_at column to Note.tagging_corrections if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'Note'
        AND table_name = 'tagging_corrections'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE "Note"."tagging_corrections" ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Column created_at added to Note.tagging_corrections table.';
    ELSE
        RAISE NOTICE 'Column created_at already exists in Note.tagging_corrections table.';
    END IF;
END $$;

COMMENT ON COLUMN "Note"."tagging_corrections"."mention_id" IS 'ID of the mention in Note.note_mentions if this correction pertains to an existing mention. NULL if a new mention was added by user or if original mention was deleted.';
COMMENT ON COLUMN "Note"."tagging_corrections"."correction_action" IS 'Type of correction: MODIFY_TYPE, MODIFY_SPAN, CONFIRM_TAG, DELETE_TAG, ADD_TAG, etc.';

CREATE TABLE IF NOT EXISTS "Note"."character_sheets" (
    node_id INTEGER PRIMARY KEY, -- FK constraint added below
    race_id INTEGER,             -- FK constraint added below
    main_class TEXT,
    level INTEGER DEFAULT 1,
    background_id INTEGER,       -- FK constraint added below
    alignment TEXT,
    experience_points INTEGER DEFAULT 0,
    player_name TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add FK constraint for node_id separately to ensure it's named if needed later
ALTER TABLE "Note"."character_sheets" DROP CONSTRAINT IF EXISTS fk_character_sheet_node;
ALTER TABLE "Note"."character_sheets" ADD CONSTRAINT fk_character_sheet_node
    FOREIGN KEY (node_id) REFERENCES "Note"."nodes"(id) ON DELETE CASCADE;

-- Add FK constraint for race_id
ALTER TABLE "Note"."character_sheets" DROP CONSTRAINT IF EXISTS fk_character_sheet_race;
ALTER TABLE "Note"."character_sheets" ADD CONSTRAINT fk_character_sheet_race
    FOREIGN KEY (race_id) REFERENCES race.races(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add FK constraint for background_id
ALTER TABLE "Note"."character_sheets" DROP CONSTRAINT IF EXISTS fk_character_sheet_background;
ALTER TABLE "Note"."character_sheets" ADD CONSTRAINT fk_character_sheet_background
    FOREIGN KEY (background_id) REFERENCES background.backgrounds(id) ON DELETE SET NULL ON UPDATE CASCADE;


COMMENT ON TABLE "Note"."character_sheets" IS 'Stores detailed character sheet information linked to a node.';
COMMENT ON COLUMN "Note"."character_sheets"."node_id" IS 'Link to the character node in Note.nodes.';
COMMENT ON COLUMN "Note"."character_sheets"."race_id" IS 'FK to race.races table.';
COMMENT ON COLUMN "Note"."character_sheets"."main_class" IS 'Primary class name of the character (e.g., Fighter, Wizard).';
COMMENT ON COLUMN "Note"."character_sheets"."level" IS 'Character level.';
COMMENT ON COLUMN "Note"."character_sheets"."background_id" IS 'FK to background.backgrounds table.';
COMMENT ON COLUMN "Note"."character_sheets"."alignment" IS 'Character alignment.';
COMMENT ON COLUMN "Note"."character_sheets"."experience_points" IS 'Character experience points.';
COMMENT ON COLUMN "Note"."character_sheets"."player_name" IS 'Name of the player playing the character.';
COMMENT ON COLUMN "Note"."character_sheets"."created_at" IS 'Timestamp of when the character sheet was created.';
COMMENT ON COLUMN "Note"."character_sheets"."updated_at" IS 'Timestamp of when the character sheet was last updated.';

-- Trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION "Note".update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to Note.character_sheets
-- Ensure this trigger name is unique or drop existing if re-applying to other tables with same name
DROP TRIGGER IF EXISTS character_sheets_updated_at_trigger ON "Note"."character_sheets";
CREATE TRIGGER character_sheets_updated_at_trigger
BEFORE UPDATE ON "Note"."character_sheets"
FOR EACH ROW
EXECUTE FUNCTION "Note".update_modified_column();


-- Schema: DM
CREATE TABLE IF NOT EXISTS "DM"."bestiarys" (
    id integer NOT NULL,
    name text,
    description text,
    meta text,
    "Armor Class" text,
    "Hit Points" text,
    "Speed" text,
    "STR" text,
    "DEX" text,
    "CON" text,
    "INT" text,
    "WIS" text,
    "CHA" text,
    "Saving Throws" text,
    "Skills" text,
    "Damage Vulnerabilities" text,
    "Damage Resistances" text,
    "Damage Immunities" text,
    "Condition Immunities" text,
    "Senses" text,
    "Languages" text,
    "Challenge" text,
    "Proficiency Bonus" text,
    "Special Abilities" text,
    "Actions" text,
    "Bonus Actions" text,
    "Reactions" text,
    "Legendary Actions" text,
    "Mythic Actions" text,
    "Lair Actions" text,
    "Regional Effects" text,
    img text,
    source text
);
-- Example Primary Key (uncomment and adjust if 'id' is the intended PK):
-- ALTER TABLE "DM"."bestiarys" ADD CONSTRAINT pk_bestiarys PRIMARY KEY (id);


-- Schema: core
CREATE TABLE IF NOT EXISTS "core"."items" (
    id integer NOT NULL,
    name text,
    type text,
    magic smallint,
    detail text,
    weight text,
    cost text,
    source text,
    "Item Type" text,
    "Requires Attunement" text,
    "Rarity" text
);

-- Conditionally add "Rarity" column to core.items if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'core'
        AND table_name = 'items'
        AND column_name = 'Rarity' -- Case-sensitive match
    ) THEN
        ALTER TABLE "core"."items" ADD COLUMN "Rarity" TEXT; -- Add with quotes to preserve case
        RAISE NOTICE 'Column "Rarity" added to core.items table.';
    ELSE
        RAISE NOTICE 'Column "Rarity" already exists in core.items table.';
    END IF;
END $$;

-- Example Primary Key (uncomment and adjust if 'id' is the intended PK):
-- ALTER TABLE "core"."items" ADD CONSTRAINT pk_items PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS "core"."spells" (
    id integer NOT NULL,
    name text,
    description text,
    higher_level text,
    page text,
    range text,
    components text,
    material text,
    ritual text,
    duration text,
    concentration text,
    casting_time text,
    level text,
    school text,
    class text,
    source text,
    domains text,
    oaths text,
    circles text,
    patrons text,
    archetype text,
    level_int smallint
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'core'
          AND table_name = 'spells'
          AND column_name = 'level_int'
    ) THEN
        ALTER TABLE "core"."spells" ADD COLUMN level_int SMALLINT;
        RAISE NOTICE 'Column level_int added to core.spells table.';

        -- Populate level_int based on level text (if it's a number)
        EXECUTE '
            UPDATE "core"."spells"
            SET level_int = CASE
                WHEN level ~ ''^\d+$'' THEN level::smallint
                ELSE NULL
            END
        ';
    ELSE
        RAISE NOTICE 'Column level_int already exists in core.spells table.';
    END IF;
END $$;

COMMENT ON COLUMN "core"."spells"."level_int" IS 'Integer representation of spell level for sorting/filtering.';
-- Example Primary Key (uncomment and adjust if 'id' is the intended PK):
-- ALTER TABLE "core"."spells" ADD CONSTRAINT pk_spells PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS "core"."tools" (
    name text,
    cost text,
    weight text,
    type text,
    source text
);
-- Note: "core"."tools" seems to lack a primary key. If 'name' is unique, it could be a PK.
-- Example Primary Key (uncomment and adjust if 'name' is the intended PK):
-- ALTER TABLE "core"."tools" ADD CONSTRAINT pk_tools PRIMARY KEY (name);


CREATE TABLE IF NOT EXISTS "core"."name_tables" (
    id SERIAL PRIMARY KEY,
    race_name TEXT NOT NULL,
    option TEXT
);

CREATE TABLE IF NOT EXISTS "core"."names" (
    id SERIAL PRIMARY KEY,
    name_table_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    min_roll INTEGER,
    max_roll INTEGER
);


-- Schema: background
CREATE TABLE IF NOT EXISTS "background"."backgrounds" (
    id integer NOT NULL,
    name text,
    description text,
    source text,
    "Skill Proficiencies" text,
    "Tool Proficiencies" text,
    "Languages" text,
    "Equipment" text,
    "Feature" text,
    "Feature Description" text,
    "Suggested Characteristics" text
);
-- Example Primary Key (uncomment and adjust if 'id' is the intended PK):
-- ALTER TABLE "background"."backgrounds" ADD CONSTRAINT pk_backgrounds PRIMARY KEY (id);


-- Schema: class
CREATE TABLE IF NOT EXISTS "class"."classes" (
    id integer NOT NULL,
    name text,
    description text,
    source text,
    "Hit Dice" text,
    "Hit Points at 1st Level" text,
    "Hit Points at Higher Levels" text,
    "Proficiencies Armor" text,
    "Proficiencies Weapons" text,
    "Proficiencies Tools" text,
    "Proficiencies Saving Throws" text,
    "Proficiencies Skills" text,
    "Equipment" text,
    "Spellcasting Ability" text,
    "Cantrips Known" text,
    "Spell Slots" text,
    "Spells Known" text,
    "Class Features" text
);
-- Example Primary Key (uncomment and adjust if 'id' is the intended PK):
-- ALTER TABLE "class"."classes" ADD CONSTRAINT pk_classes PRIMARY KEY (id);


-- ========================================================================== --
--                      FULL-TEXT SEARCH SETUP for Note.notes                 --
-- ========================================================================== --

-- The content_tsv column is already part of CREATE TABLE "Note"."notes"

-- Create the GIN index on content_tsv
CREATE INDEX IF NOT EXISTS notes_content_tsv_idx ON "Note"."notes" USING GIN(content_tsv);

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION "Note".tsvector_update_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', COALESCE(NEW.content,'') || ' ' || COALESCE(NEW.title,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS notes_tsv_update_trigger ON "Note"."notes";
CREATE TRIGGER notes_tsv_update_trigger
BEFORE INSERT OR UPDATE ON "Note"."notes"
FOR EACH ROW EXECUTE FUNCTION "Note".tsvector_update_trigger_function();

-- Comment: To populate existing rows, run this manually after setup:
-- UPDATE "Note"."notes" SET content_tsv = to_tsvector('english', COALESCE(content,'') || ' ' || COALESCE(title,''));


-- ========================================================================== --
--                             FOREIGN KEY CONSTRAINTS                        --
-- ========================================================================== --

-- Constraints for "Note" schema
ALTER TABLE "Note"."notes" DROP CONSTRAINT IF EXISTS fk_notes_user;
ALTER TABLE "Note"."notes" ADD CONSTRAINT fk_notes_user
    FOREIGN KEY (user_id) REFERENCES "Note"."users"(id) ON DELETE CASCADE;

ALTER TABLE "Note"."note_mentions" DROP CONSTRAINT IF EXISTS fk_note_mentions_note;
ALTER TABLE "Note"."note_mentions" ADD CONSTRAINT fk_note_mentions_note
    FOREIGN KEY (note_id) REFERENCES "Note"."notes"(id) ON DELETE CASCADE;

ALTER TABLE "Note"."note_mentions" DROP CONSTRAINT IF EXISTS fk_note_mentions_node;
ALTER TABLE "Note"."note_mentions" ADD CONSTRAINT fk_note_mentions_node
    FOREIGN KEY (node_id) REFERENCES "Note"."nodes"(id) ON DELETE CASCADE;

ALTER TABLE "Note"."node_links" DROP CONSTRAINT IF EXISTS fk_node_links_source_node;
ALTER TABLE "Note"."node_links" ADD CONSTRAINT fk_node_links_source_node
    FOREIGN KEY (source_node_id) REFERENCES "Note"."nodes"(id) ON DELETE CASCADE;

ALTER TABLE "Note"."node_links" DROP CONSTRAINT IF EXISTS fk_node_links_target_node;
ALTER TABLE "Note"."node_links" ADD CONSTRAINT fk_node_links_target_node
    FOREIGN KEY (target_node_id) REFERENCES "Note"."nodes"(id) ON DELETE CASCADE;

ALTER TABLE "Note"."node_links" DROP CONSTRAINT IF EXISTS fk_node_links_note;
ALTER TABLE "Note"."node_links" ADD CONSTRAINT fk_node_links_note
    FOREIGN KEY (note_id) REFERENCES "Note"."notes"(id) ON DELETE SET NULL;

ALTER TABLE "Note"."node_relationships" DROP CONSTRAINT IF EXISTS fk_node_relationships_parent_node;
ALTER TABLE "Note"."node_relationships" ADD CONSTRAINT fk_node_relationships_parent_node
    FOREIGN KEY (parent_node_id) REFERENCES "Note"."nodes"(id) ON DELETE CASCADE;

ALTER TABLE "Note"."node_relationships" DROP CONSTRAINT IF EXISTS fk_node_relationships_child_node;
ALTER TABLE "Note"."node_relationships" ADD CONSTRAINT fk_node_relationships_child_node
    FOREIGN KEY (child_node_id) REFERENCES "Note"."nodes"(id) ON DELETE CASCADE;

ALTER TABLE "Note"."node_relationships" DROP CONSTRAINT IF EXISTS fk_node_relationships_note;
ALTER TABLE "Note"."node_relationships" ADD CONSTRAINT fk_node_relationships_note
    FOREIGN KEY (note_id) REFERENCES "Note"."notes"(id) ON DELETE SET NULL;

ALTER TABLE "Note"."tagging_corrections" DROP CONSTRAINT IF EXISTS fk_tagging_corrections_note;
ALTER TABLE "Note"."tagging_corrections" ADD CONSTRAINT fk_tagging_corrections_note
    FOREIGN KEY (note_id) REFERENCES "Note"."notes"(id) ON DELETE SET NULL;

ALTER TABLE "Note"."tagging_corrections" DROP CONSTRAINT IF EXISTS fk_tagging_corrections_mention;
ALTER TABLE "Note"."tagging_corrections" ADD CONSTRAINT fk_tagging_corrections_mention
    FOREIGN KEY (mention_id) REFERENCES "Note"."note_mentions"(id) ON DELETE SET NULL;

-- Apply unique constraint for source_node_id, target_node_id, relationship_type on Note.node_links
ALTER TABLE "Note"."node_links" DROP CONSTRAINT IF EXISTS node_links_src_tgt_rel_type_key;
ALTER TABLE "Note"."node_links" ADD CONSTRAINT node_links_src_tgt_rel_type_key
    UNIQUE (source_node_id, target_node_id, relationship_type);

-- Constraints for "core" schema
ALTER TABLE "core"."names" DROP CONSTRAINT IF EXISTS fk_names_name_table;
ALTER TABLE "core"."names" ADD CONSTRAINT fk_names_name_table
    FOREIGN KEY (name_table_id) REFERENCES "core"."name_tables"(id) ON DELETE CASCADE;


-- ========================================================================== --
--                                INDEX CREATION                              --
-- ========================================================================== --

-- Indexes for "Note" schema
CREATE INDEX IF NOT EXISTS idx_notes_created_at_desc ON "Note"."notes" (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_mentions_node_id ON "Note"."note_mentions" (node_id);
CREATE INDEX IF NOT EXISTS idx_note_mentions_note_id ON "Note"."note_mentions" (note_id);
CREATE INDEX IF NOT EXISTS idx_note_mentions_mention_type ON "Note"."note_mentions" (mention_type);
CREATE INDEX IF NOT EXISTS idx_note_mentions_source ON "Note"."note_mentions" (source);


CREATE INDEX IF NOT EXISTS idx_nodes_lower_name_type ON "Note"."nodes" (LOWER(name), type);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON "Note"."nodes" (type);
CREATE INDEX IF NOT EXISTS idx_nodes_tags ON "Note"."nodes" USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_node_links_source_node_id ON "Note"."node_links" (source_node_id);
CREATE INDEX IF NOT EXISTS idx_node_links_target_node_id ON "Note"."node_links" (target_node_id);
CREATE INDEX IF NOT EXISTS idx_node_links_relationship_type ON "Note"."node_links" (relationship_type);

CREATE INDEX IF NOT EXISTS idx_node_relationships_parent_node_id ON "Note"."node_relationships" (parent_node_id);
CREATE INDEX IF NOT EXISTS idx_node_relationships_child_node_id ON "Note"."node_relationships" (child_node_id);
CREATE INDEX IF NOT EXISTS idx_node_relationships_type ON "Note"."node_relationships" (relationship_type);

CREATE INDEX IF NOT EXISTS idx_tagging_corrections_note_id ON "Note"."tagging_corrections" (note_id);
CREATE INDEX IF NOT EXISTS idx_tagging_corrections_mention_id ON "Note"."tagging_corrections" (mention_id);
CREATE INDEX IF NOT EXISTS idx_tagging_corrections_action ON "Note"."tagging_corrections" (correction_action);


-- Indexes for "core" schema
CREATE INDEX IF NOT EXISTS idx_core_items_name ON "core"."items" (name);
CREATE INDEX IF NOT EXISTS idx_core_items_type ON "core"."items" (type);
CREATE INDEX IF NOT EXISTS idx_core_items_rarity ON "core"."items" ("Rarity");

CREATE INDEX IF NOT EXISTS idx_core_spells_name ON "core"."spells" (name);
CREATE INDEX IF NOT EXISTS idx_core_spells_level_int ON "core"."spells" (level_int);
CREATE INDEX IF NOT EXISTS idx_core_spells_school ON "core"."spells" (school);

CREATE INDEX IF NOT EXISTS idx_core_name_tables_race_option ON "core"."name_tables" (race_name, option);
CREATE INDEX IF NOT EXISTS idx_core_names_table_id_min_max_roll ON "core"."names" (name_table_id, min_roll, max_roll);
CREATE INDEX IF NOT EXISTS idx_core_names_name ON "core"."names" (name);


-- Indexes for "DM" schema
CREATE INDEX IF NOT EXISTS idx_dm_bestiarys_name ON "DM"."bestiarys" (name);

-- Example indexes for "background" and "class" schemas
-- CREATE INDEX IF NOT EXISTS idx_background_backgrounds_name ON "background"."backgrounds" (name);
-- CREATE INDEX IF NOT EXISTS idx_class_classes_name ON "class"."classes" (name);

-- ========================================================================== --
--                        END OF SETUP_DATABASE.SQL                           --
-- ========================================================================== --
