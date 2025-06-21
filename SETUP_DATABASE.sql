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
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN "Note"."nodes"."name" IS 'The primary name of the node/entity.';
COMMENT ON COLUMN "Note"."nodes"."type" IS 'The broad category of the node (e.g., PERSON, LOCATION, ITEM).';
COMMENT ON COLUMN "Note"."nodes"."sub_type" IS 'A more specific category (e.g., City, Deity, Quest Item).';
COMMENT ON COLUMN "Note"."nodes"."description" IS 'A brief description or summary of the node.';
COMMENT ON COLUMN "Note"."nodes"."source" IS 'Where this node information originated from.';
COMMENT ON COLUMN "Note"."nodes"."tags" IS 'Arbitrary tags for filtering and organization.';


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
COMMENT ON COLUMN "Note"."tagging_corrections"."mention_id" IS 'ID of the mention in Note.note_mentions if this correction pertains to an existing mention. NULL if a new mention was added by user or if original mention was deleted.';
COMMENT ON COLUMN "Note"."tagging_corrections"."correction_action" IS 'Type of correction: MODIFY_TYPE, MODIFY_SPAN, CONFIRM_TAG, DELETE_TAG, ADD_TAG, etc.';


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
CREATE OR REPLACE FUNCTION tsvector_update_trigger_function()
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
FOR EACH ROW EXECUTE FUNCTION tsvector_update_trigger_function();

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
