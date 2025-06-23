import sys
import json
import os
import spacy
from spacy.matcher import PhraseMatcher
import psycopg2
from flask import Flask, request, jsonify
from dotenv import load_dotenv # Added import

# Load environment variables from .env file
load_dotenv() # Added call

# === Environment Variables & Defaults ===
DB_NAME = os.environ.get("DB_NAME", "dnd_app")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD") # No default for password
DB_HOST = os.environ.get("DB_HOST", "localhost") # Default to localhost
DB_PORT = os.environ.get("DB_PORT", "5432")

# Startup check for essential environment variables
if DB_PASSWORD is None:
    print("CRITICAL: DB_PASSWORD environment variable not set. Application cannot start.", file=sys.stderr)
    raise SystemExit("CRITICAL: DB_PASSWORD environment variable not set. Application cannot start.")

# === Global NLP Model and Matcher ===
nlp = spacy.load("en_core_web_sm")
matcher = None  # Will be initialized by initialize_matcher
MATCHER_INITIALIZED = False # Global flag for matcher status

# === Item Keywords Set ===
ITEM_KEYWORDS = {
    "potion", "scroll", "armor", "shield", "sword", "amulet", "ring", "gem",
    "key", "map", "book", "coin", "robe", "staff", "wand", "dagger", "axe",
    "helm", "gauntlets", "boots", "bracers", "cloak", "bag", "chest", "arrow",
    "bolt", "quiver", "focus", "orb", "tome", "instrument", "idol", "relic"
}
SPELL_VERBS = {"cast", "prepare", "learn", "invoke", "chant", "incant", "unleash"}
ITEM_VERBS = {"carry", "use", "draw", "equip", "wield", "hold", "swing", "don", "drink", "read", "find", "loot", "acquire"}
MONSTER_VERBS = {"attack", "fight", "encounter", "slay", "battle", "defeat", "ambush"}
LOCATION_VERBS = {"travel", "visit", "enter", "arrive", "leave", "explore", "reach", "return"}
PERSON_DEP_TAGS = {"nsubj", "dobj", "pobj", "poss", "attr"} # Added dobj, pobj, attr for more coverage


# === Database Connection Helper ===
def get_db_connection():
    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT
    )

# === Load terms from DB (used by build_matcher) ===
def fetch_terms(conn, table, column, condition_column=None, condition_value=None):
    with conn.cursor() as cur:
        schema, table_name = table.split(".")
        query = f'SELECT DISTINCT "{column}" FROM "{schema}"."{table_name}"'
        params = []
        if condition_column and condition_value:
            # Ensure the column name is from a trusted source or properly escaped.
            # Here, we assume column names derived from 'sources' are trusted.
            query += f' WHERE "{condition_column}" = %s'
            params.append(condition_value)

        cur.execute(query, tuple(params) if params else None)
        return [row[0] for row in cur.fetchall() if row[0]]

# === Build matcher from DB (modified to take nlp and conn) ===
def build_matcher_from_db(current_nlp, conn):
    print("Building matcher from DB...", file=sys.stderr)
    temp_matcher = PhraseMatcher(current_nlp.vocab, attr="LOWER")
    sources = {
        "PERSON": [ ("core.names", "name"), ("Note.nodes", "name", "type = 'PERSON'") ],
        "ITEM": [ ("core.items", "name"), ("core.tools", "name"), ("Note.nodes", "name", "type = 'ITEM'") ],
        "SPELL": [ ("core.spells", "name"), ("Note.nodes", "name", "type = 'SPELL'") ],
        "MONSTER": [ ("DM.bestiarys", "name"), ("Note.nodes", "name", "type = 'MONSTER'") ], # DM.bestiarys is unchanged
        "LOCATION": [ ("Note.nodes", "name", "type = 'LOCATION'") ]
    }
    for label, tables in sources.items():
        all_terms = []
        for entry in tables:
            table, column = entry[0], entry[1]
            condition_column = None
            condition_value = None
            if len(entry) > 2:
                condition_str = entry[2]
                # Basic parsing, assumes format "column = 'value'"
                parts = condition_str.split("=", 1)
                if len(parts) == 2:
                    condition_column = parts[0].strip()
                    condition_value = parts[1].strip().strip("'") # Remove spaces and single quotes

            terms = fetch_terms(conn, table, column, condition_column, condition_value)
            all_terms.extend(terms)
        if all_terms:
            temp_matcher.add(label, [current_nlp.make_doc(term) for term in all_terms])
    print("Matcher built successfully.", file=sys.stderr)
    return temp_matcher

# === Initialize Matcher (called once at startup) ===
def initialize_matcher():
    global matcher, MATCHER_INITIALIZED
    print("Initializing matcher...", file=sys.stderr)
    db_conn = None
    try:
        db_conn = get_db_connection()
        matcher = build_matcher_from_db(nlp, db_conn)
        MATCHER_INITIALIZED = True # Set flag on successful initialization
        print("Matcher initialized successfully.", file=sys.stderr)
    except Exception as e:
        matcher = None # Ensure matcher is None if initialization fails
        MATCHER_INITIALIZED = False # Ensure flag is False on failure
        print(f"Critical: Matcher initialization failed: {e}. Tagging will be unavailable.", file=sys.stderr)
    finally:
        if db_conn:
            db_conn.close()

# === Infer label if not matched (and determine source characteristics) ===
def infer_type_and_source(ent):
    """
    Infers a D&D specific type (PERSON, ITEM, SPELL, MONSTER, LOCATION, UNKNOWN)
    for a given spaCy entity (ent).
    Returns a tuple: (final_label, source_category, original_ner_label)
    """
    original_ner_label = ent.label_

    # Rule 1: Direct NER passthrough for PERSON and some LOCATION-related types.
    # If spaCy is confident it's a PERSON, or a common location type, we trust it.
    if original_ner_label == "PERSON":
        return "PERSON", "NER_PASSTHROUGH", original_ner_label
    if original_ner_label in {"GPE", "LOC", "FAC", "EVENT"}: # GPE (Geopolitical), LOC (Location), FAC (Facility), EVENT
        return "LOCATION", "NER_PASSTHROUGH", original_ner_label

    # ORG (Organization) can be ambiguous; sometimes it's a faction (PERSON-like) or a place (LOCATION).
    # We let it fall through to other rules for more specific classification.
    if original_ner_label == "ORG":
        pass # Let it fall through

    # Rule 2: Item Keyword Matching.
    # Checks if the entity's root noun or last noun (for compounds like "healing potion") is a known item keyword.
    # This has high precedence for identifying item-like nouns.
    if ent.root.pos_ == "NOUN" and ent.root.lemma_.lower() in ITEM_KEYWORDS:
        return "ITEM", "RULE_KEYWORD_ITEM", original_ner_label
    if ent[-1].pos_ == "NOUN" and ent[-1].lemma_.lower() in ITEM_KEYWORDS: # Check last token for compound items
        return "ITEM", "RULE_KEYWORD_ITEM", original_ner_label

    # Rule 3: Verb/Dependency-based rules.
    # Looks at the verb governing the entity to infer type.
    head = ent.root.head
    verb = head.lemma_.lower()

    if verb in SPELL_VERBS: # e.g., "cast fireball"
        return "SPELL", "RULE_VERB_SPELL", original_ner_label

    if verb in ITEM_VERBS: # e.g., "picked up the orb"
        # This rule is useful if the item noun itself isn't a keyword.
        return "ITEM", "RULE_VERB_ITEM", original_ner_label

    if verb in MONSTER_VERBS: # e.g., "attacked the goblin"
        return "MONSTER", "RULE_VERB_MONSTER", original_ner_label

    if verb in LOCATION_VERBS: # e.g., "traveled to the city"
        return "LOCATION", "RULE_VERB_LOCATION", original_ner_label

    # Rule 4: Dependency-based PERSON detection.
    # Identifies PERSONs if the entity is in a subject/object relationship or possesses something,
    # and isn't an obvious other type from NER (like ORG, PRODUCT, etc.).
    # Prefers proper nouns.
    if head.dep_ in PERSON_DEP_TAGS and original_ner_label not in {"ORG", "PRODUCT", "WORK_OF_ART", "LAW", "LANGUAGE"}:
        if ent.root.pos_ == "PROPN" or (ent.root.head.pos_ == "PROPN" and head.dep_ in {"poss"}):
             return "PERSON", "RULE_DEP_PERSON", original_ner_label

    # Fallback: If no specific D&D type inferred by the above rules.
    return "UNKNOWN", "NO_SPECIFIC_RULE_MATCH", original_ner_label


# === Tagging Helper Functions ===

def _process_phrase_matcher_results(doc, current_nlp, current_matcher):
    """Processes PhraseMatcher results and returns initial mention_details."""
    mention_details = {}
    matches = current_matcher(doc)
    for match_id, start, end in matches:
        label = current_nlp.vocab.strings[match_id]
        span = doc[start:end]
        mention_details[(span.start_char, span.end_char)] = (
            span.text.strip(), label, 'PHRASEMATCHER_EXACT', 1.0
        )
    return mention_details

def _process_ner_entities(doc, current_nlp, mention_details):
    """Processes NER entities, calls infer_type_and_source, and updates mention_details."""
    for ent in doc.ents:
        key = (ent.start_char, ent.end_char)
        if key not in mention_details: # Only process if not already caught by PhraseMatcher
            text_content = ent.text.strip()
            final_label, source_category, original_ner_label = infer_type_and_source(ent)
            source = ""
            confidence = 0.0

            if final_label != "UNKNOWN":
                if source_category == 'NER_PASSTHROUGH':
                    source = f'SPACY_NER_{final_label}'
                    confidence = 0.85 if final_label == "PERSON" else 0.75
                elif source_category.startswith('RULE_KEYWORD_'):
                    source = f'INFERRED_{source_category}'
                    confidence = 0.70
                elif source_category.startswith('RULE_VERB_'):
                    source = f'INFERRED_{source_category}'
                    confidence = 0.65
                elif source_category.startswith('RULE_DEP_'):
                    source = f'INFERRED_{source_category}'
                    confidence = 0.60
                else: # Should ideally not happen if source_category is well-defined
                    source = f'INFERRED_UNCATEGORIZED_{final_label}'
                    confidence = 0.50 # Lower confidence for uncategorized
                mention_details[key] = (text_content, final_label, source, confidence)
            elif original_ner_label and original_ner_label not in {"CARDINAL", "ORDINAL", "MONEY", "QUANTITY", "PERCENT", "TIME", "DATE"}:
                # Fallback for raw spaCy NER if infer_type_and_source yields UNKNOWN,
                # but original NER label is somewhat useful (not purely numeric/date).
                source = f'SPACY_NER_RAW_{original_ner_label}'
                confidence = 0.30 # Low confidence for raw, un-inferred NER
                mention_details[key] = (text_content, original_ner_label, source, confidence)
    return mention_details

def _get_or_create_node(cur, normalized_name, label, user_id, node_cache): # Added user_id
    """Fetches a node ID from cache or DB, or creates a new node if it doesn't exist for the user."""
    is_new = False
    cache_key = (normalized_name, label, user_id) # Added user_id to cache key

    if cache_key in node_cache:
        node_id_val = node_cache[cache_key]
    else:
        cur.execute("""
            SELECT id FROM "Note"."nodes"
            WHERE LOWER(name) = LOWER(%s) AND type = %s AND user_id = %s
        """, (normalized_name, label, user_id)) # Added user_id to query
        row = cur.fetchone()

        if row:
            node_id_val = row[0]
        else:
            cur.execute("""
                INSERT INTO "Note"."nodes" (name, type, user_id)
                VALUES (%s, %s, %s)
                RETURNING id
            """, (normalized_name, label, user_id)) # Added user_id to insert
            node_id_val = cur.fetchone()[0]
            is_new = True
        node_cache[cache_key] = node_id_val
    return node_id_val, is_new

def _insert_note_mention(cur, node_id, note_id, start_pos, end_pos, label, source, confidence):
    """Inserts a record into Note.note_mentions."""
    cur.execute("""
        INSERT INTO "Note"."note_mentions"
        (node_id, note_id, start_pos, end_pos, mention_type, source, confidence)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
    """, (node_id, note_id, start_pos, end_pos, label, source, confidence))

def _link_nodes_in_note(cur, node_ids, note_id):
    """Creates bidirectional links between all pairs of node_ids for a given note_id."""
    for i in range(len(node_ids)):
        for j in range(i + 1, len(node_ids)):
            # Insert links in both directions to ensure queryability, or handle directionality if needed
            for x, y in [(node_ids[i], node_ids[j]), (node_ids[j], node_ids[i])]:
                cur.execute("""
                    INSERT INTO "Note"."node_links" (source_node_id, target_node_id, note_id)
                    VALUES (%s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (x, y, note_id))

def _relate_entities_to_location(cur, tagged_nodes_with_details, note_id):
    """Relates non-LOCATION entities to the primary LOCATION entity in the note."""
    current_locations = [n for n in tagged_nodes_with_details if n["type"] == "LOCATION"]
    if not current_locations:
        return # No location to relate things to

    # Assuming the first detected location is the primary one for this context
    current_location_id = current_locations[0]["id"]

    for node_info in tagged_nodes_with_details:
        if node_info["type"] != "LOCATION":
            cur.execute("""
                INSERT INTO "Note"."node_relationships"
                (parent_node_id, child_node_id, relationship_type, note_id)
                VALUES (%s, %s, 'located_in', %s)
                ON CONFLICT DO NOTHING
            """, (current_location_id, node_info["id"], note_id))


# === Main tagging function (refactored) ===
def tag_text(text, note_id, user_id, db_connection, current_nlp, current_matcher): # Added user_id
    """
    Main function to tag text, identify entities, and store them in the database.
    Uses helper functions to structure the process.
    """
    if current_matcher is None: # Should be caught by MATCHER_INITIALIZED check in Flask route, but good practice
        print(f"Error processing note_id {note_id}: Matcher not initialized.", file=sys.stderr)
        raise ValueError("Matcher not initialized")

    doc = current_nlp(text)

    # 1. Process PhraseMatcher results
    mention_details = _process_phrase_matcher_results(doc, current_nlp, current_matcher)

    # 2. Process NER entities and apply inference rules
    mention_details = _process_ner_entities(doc, current_nlp, mention_details)

    if not mention_details:
        print(f"No mentions found for note_id {note_id}.", file=sys.stderr)
        return []

    tagged_nodes_for_return = []
    node_cache = {} # Cache for node lookups (name, type) -> id

    with db_connection.cursor() as cur:
        # 3. Get or create nodes and insert mentions
        for (start_pos, end_pos), (name, label, source, confidence) in mention_details.items():
            normalized_name = name.strip()
            # Pass user_id to _get_or_create_node
            node_id_val, is_new = _get_or_create_node(cur, normalized_name, label, user_id, node_cache)

            tagged_nodes_for_return.append({
                "id": node_id_val, "name": normalized_name, "type": label,
                "status": "new" if is_new else "existing",
                "source": source, "confidence": confidence
            })

            _insert_note_mention(cur, node_id_val, note_id, start_pos, end_pos, label, source, confidence)

        # 4. Link nodes within the note
        if len(tagged_nodes_for_return) > 1: # Only need to link if there's more than one node
            node_ids = [n["id"] for n in tagged_nodes_for_return]
            _link_nodes_in_note(cur, node_ids, note_id)

        # 5. Relate entities to location
        _relate_entities_to_location(cur, tagged_nodes_for_return, note_id)

    print(f"Tagged and linked {len(tagged_nodes_for_return)} nodes from note {note_id}", file=sys.stderr)
    return tagged_nodes_for_return

# === Flask App ===
app = Flask(__name__)

@app.route('/tag', methods=['POST'])
def handle_tag_request():
    global MATCHER_INITIALIZED # Ensure we are checking the global flag

    if not MATCHER_INITIALIZED:
        return jsonify({
            "error": "Matcher is not initialized; tagging service is currently unavailable. "
                     "Please try again later or contact an administrator if the issue persists."
        }), 503

    db_conn = None
    try:
        data = request.get_json()
        if not data or 'text' not in data or 'note_id' not in data or 'user_id' not in data: # Added user_id check
            return jsonify({"error": "Missing text, note_id, or user_id in request"}), 400

        text = data['text']
        note_id = int(data['note_id'])
        user_id = data['user_id'] # Extract user_id

        # Validate user_id (basic check, could be more robust if needed)
        if not isinstance(user_id, int) or user_id <= 0:
            return jsonify({"error": "Invalid user_id format or value"}), 400

        db_conn = get_db_connection()

        # The re-initialization logic is removed as per requirements.
        # If MATCHER_INITIALIZED is true, matcher should be valid.
        # If matcher was somehow None despite MATCHER_INITIALIZED being true,
        # tag_text itself would raise an error, which is handled by the generic Exception block.

        tagged_results = tag_text(text, note_id, user_id, db_conn, nlp, matcher) # Pass user_id
        db_conn.commit()
        return jsonify(tagged_results)

    except ValueError as ve:
        if db_conn: db_conn.rollback()
        print(f"ValueError in /tag route: {ve}", file=sys.stderr)
        return jsonify({"error": str(ve)}), 500
    except Exception as e:
        if db_conn: db_conn.rollback()
        print(f"Error in /tag route: {e}", file=sys.stderr)
        return jsonify({"error": "Failed to tag text", "message": str(e)}), 500
    finally:
        if db_conn: db_conn.close()

# === Main Execution Block ===
if __name__ == '__main__':
    initialize_matcher()
    app.run(host='0.0.0.0', port=5001)
