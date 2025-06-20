-- This script deletes all data from tables within the "Note" schema.
-- It is intended for development or testing purposes to reset the note-related data.
-- The order of deletion considers foreign key constraints and leverages ON DELETE CASCADE
-- where applicable. Explicit DELETE statements for dependent tables are included as a fallback.
-- MAKE SURE YOU HAVE A BACKUP IF YOU ARE RUNNING THIS ON IMPORTANT DATA.

-- Clearing data from Note.tagging_corrections
DELETE FROM "Note"."tagging_corrections";

-- Clearing data from Note.users
-- This is expected to cascade delete related records in Note.notes due to
-- the foreign key constraint (user_id in Note.notes referencing Note.users.id ON DELETE CASCADE).
DELETE FROM "Note"."users";

-- Clearing data from Note.nodes
-- This is expected to cascade delete related records in Note.note_mentions,
-- Note.node_links, and Note.node_relationships due to their foreign key constraints
-- referencing Note.nodes.id ON DELETE CASCADE.
DELETE FROM "Note"."nodes";

-- Clearing data from Note.notes (explicitly, as a fallback or for notes not linked to users)
DELETE FROM "Note"."notes";

-- Clearing data from Note.note_mentions (explicitly, as a fallback)
DELETE FROM "Note"."note_mentions";

-- Clearing data from Note.node_links (explicitly, as a fallback)
DELETE FROM "Note"."node_links";

-- Clearing data from Note.node_relationships (explicitly, as a fallback)
DELETE FROM "Note"."node_relationships";

-- Script finished. All specified tables in the "Note" schema should be empty.
