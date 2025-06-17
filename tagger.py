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
DB_PASSWORD = os.environ.get("DB_PASSWORD", "Paisley95")
DB_HOST = os.environ.get("DB_HOST", "32.220.174.183")
DB_PORT = os.environ.get("DB_PORT", "5432")

# === Global NLP Model and Matcher ===
nlp = spacy.load("en_core_web_sm")
matcher = None  # Will be initialized by initialize_matcher

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
def fetch_terms(conn, table, column, condition=None):
    with conn.cursor() as cur:
        schema, table_name = table.split(".")
        if condition:
            cur.execute(f'SELECT DISTINCT "{column}" FROM "{schema}"."{table_name}" WHERE {condition}')
        else:
            cur.execute(f'SELECT DISTINCT "{column}" FROM "{schema}"."{table_name}"')
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
            condition_str = entry[2] if len(entry) > 2 else None
            terms = fetch_terms(conn, table, column, condition_str)
            all_terms.extend(terms)
        if all_terms:
            temp_matcher.add(label, [current_nlp.make_doc(term) for term in all_terms])
    print("Matcher built successfully.", file=sys.stderr)
    return temp_matcher

# === Initialize Matcher (called once at startup) ===
def initialize_matcher():
    global matcher
    print("Initializing matcher...", file=sys.stderr)
    db_conn = None
    try:
        db_conn = get_db_connection()
        matcher = build_matcher_from_db(nlp, db_conn)
        print("Matcher initialized successfully.", file=sys.stderr)
    except Exception as e:
        print(f"Error initializing matcher: {e}", file=sys.stderr)
    finally:
        if db_conn:
            db_conn.close()

# === Infer label if not matched (and determine source characteristics) ===
def infer_type_and_source(ent):
    original_ner_label = ent.label_

    # Rule 1: Direct NER passthrough for PERSON and LOCATION types
    if original_ner_label == "PERSON":
        return "PERSON", "NER_PASSTHROUGH", original_ner_label
    if original_ner_label in {"GPE", "LOC", "FAC", "EVENT"}: # Added EVENT as potential location context
        return "LOCATION", "NER_PASSTHROUGH", original_ner_label
    if original_ner_label == "ORG": # ORG can sometimes be a Faction/Group (Person-like) or Location
        # Could add more context, for now, let's classify as UNKNOWN and let other rules try
        pass # Let it fall through to other rules

    # Rule 2: Item Keyword Matching (high precedence for item-like nouns)
    # Check the lemma of the root noun of the entity
    if ent.root.pos_ == "NOUN" and ent.root.lemma_.lower() in ITEM_KEYWORDS:
        return "ITEM", "RULE_KEYWORD_ITEM", original_ner_label
    # Check the lemma of the last token if it's a noun (for multi-word items like "healing potion")
    if ent[-1].pos_ == "NOUN" and ent[-1].lemma_.lower() in ITEM_KEYWORDS:
        return "ITEM", "RULE_KEYWORD_ITEM", original_ner_label


    # Rule 3: Verb/Dependency-based rules
    head = ent.root.head
    verb = head.lemma_.lower()

    if verb in SPELL_VERBS:
        return "SPELL", "RULE_VERB_SPELL", original_ner_label

    # For items, ensure it's not already caught by keyword, and verb is strong item verb
    if verb in ITEM_VERBS:
        # Avoid re-classifying if a strong item keyword already identified it.
        # This rule is now more for when the item noun isn't a keyword but context suggests item.
        # Example: "He picked up the strange orb." ('orb' might be a keyword, but if not, 'picked up' helps)
        return "ITEM", "RULE_VERB_ITEM", original_ner_label

    if verb in MONSTER_VERBS:
        return "MONSTER", "RULE_VERB_MONSTER", original_ner_label

    if verb in LOCATION_VERBS:
        return "LOCATION", "RULE_VERB_LOCATION", original_ner_label

    # Dependency check for PERSON if it's a subject/object of a verb, or possessive
    # and not an obvious other type from NER (like ORG, PRODUCT, WORK_OF_ART if those were passed through)
    if head.dep_ in PERSON_DEP_TAGS and original_ner_label not in {"ORG", "PRODUCT", "WORK_OF_ART", "LAW", "LANGUAGE"}:
        # Check if the entity itself or its head is a proper noun, more likely a person
        if ent.root.pos_ == "PROPN" or (ent.root.head.pos_ == "PROPN" and head.dep_ in {"poss"}):
             return "PERSON", "RULE_DEP_PERSON", original_ner_label


    # Fallback: If no specific D&D type inferred, return UNKNOWN
    return "UNKNOWN", "NO_SPECIFIC_RULE_MATCH", original_ner_label


# === Main tagging function (adapted) ===
def tag_text(text, note_id, db_connection, current_nlp, current_matcher):
    doc = current_nlp(text)
    if current_matcher is None:
        print("Error: Matcher not initialized.", file=sys.stderr)
        raise ValueError("Matcher not initialized")

    matches = current_matcher(doc)
    mention_details = {}

    for match_id, start, end in matches:
        label = current_nlp.vocab.strings[match_id]
        span = doc[start:end]
        mention_details[(span.start_char, span.end_char)] = (
            span.text.strip(), label, 'PHRASEMATCHER_EXACT', 1.0
        )

    for ent in doc.ents:
        key = (ent.start_char, ent.end_char)
        if key not in mention_details:
            text_content = ent.text.strip()
            final_label, source_category, original_ner_label = infer_type_and_source(ent)
            source = ""
            confidence = 0.0

            if final_label != "UNKNOWN":
                if source_category == 'NER_PASSTHROUGH':
                    source = f'SPACY_NER_{final_label}' # e.g. SPACY_NER_PERSON
                    confidence = 0.85 if final_label == "PERSON" else 0.75 # Higher for PERSON
                elif source_category.startswith('RULE_KEYWORD_'):
                    source = f'INFERRED_{source_category}' # e.g. INFERRED_RULE_KEYWORD_ITEM
                    confidence = 0.70 # Keyword matches are decent
                elif source_category.startswith('RULE_VERB_'):
                    source = f'INFERRED_{source_category}' # e.g. INFERRED_RULE_VERB_SPELL
                    confidence = 0.65 # Verb rules are okay
                elif source_category.startswith('RULE_DEP_'):
                    source = f'INFERRED_{source_category}' # e.g. INFERRED_RULE_DEP_PERSON
                    confidence = 0.60 # Dependency rules a bit less certain
                else: # Should not happen if source_category is well-defined
                    source = f'INFERRED_UNCATEGORIZED_{final_label}'
                    confidence = 0.5
                mention_details[key] = (text_content, final_label, source, confidence)

            elif original_ner_label and original_ner_label not in {"CARDINAL", "ORDINAL", "MONEY", "QUANTITY", "PERCENT", "TIME", "DATE"}:
                # Fallback to raw spaCy NER if infer_type_and_source yields UNKNOWN,
                # but there was an original NER label that's not purely numeric/date.
                source = f'SPACY_NER_RAW_{original_ner_label}'
                confidence = 0.3
                mention_details[key] = (text_content, original_ner_label, source, confidence) # Store raw NER label

    tagged_nodes = []
    with db_connection.cursor() as cur:
        for (start_pos, end_pos), (name, label, source, confidence) in mention_details.items():
            is_new = False
            normalized_name = name.strip()

            cur.execute("""
                SELECT id FROM "Note"."nodes"
                WHERE LOWER(name) = LOWER(%s) AND type = %s
            """, (normalized_name, label))
            row = cur.fetchone()

            if row:
                node_id_val = row[0]
            else:
                cur.execute("""
                    INSERT INTO "Note"."nodes" (name, type)
                    VALUES (%s, %s)
                    RETURNING id
                """, (normalized_name, label))
                node_id_val = cur.fetchone()[0]
                is_new = True

            tagged_nodes.append({
                "id": node_id_val, "name": normalized_name, "type": label,
                "status": "new" if is_new else "existing",
                "source": source, "confidence": confidence
            })

            cur.execute("""
                INSERT INTO "Note"."note_mentions"
                (node_id, note_id, start_pos, end_pos, mention_type, source, confidence)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (node_id_val, note_id, start_pos, end_pos, label, source, confidence))

        node_ids = [n["id"] for n in tagged_nodes]
        for i in range(len(node_ids)):
            for j in range(i + 1, len(node_ids)):
                for x, y in [(node_ids[i], node_ids[j]), (node_ids[j], node_ids[i])]:
                    cur.execute("""
                        INSERT INTO "Note"."node_links" (source_node_id, target_node_id, note_id)
                        VALUES (%s, %s, %s)
                        ON CONFLICT DO NOTHING
                    """, (x, y, note_id))

        current_locations = [n for n in tagged_nodes if n["type"] == "LOCATION"]
        if current_locations:
            current_location_id = current_locations[0]["id"]
            for node_info in tagged_nodes:
                if node_info["type"] != "LOCATION":
                    cur.execute("""
                        INSERT INTO "Note"."node_relationships"
                        (parent_node_id, child_node_id, relationship_type, note_id)
                        VALUES (%s, %s, 'located_in', %s)
                        ON CONFLICT DO NOTHING
                    """, (current_location_id, node_info["id"], note_id))

    print(f"Tagged and linked {len(tagged_nodes)} nodes from note {note_id}", file=sys.stderr)
    return tagged_nodes

# === Flask App ===
app = Flask(__name__)

@app.route('/tag', methods=['POST'])
def handle_tag_request():
    db_conn = None
    try:
        data = request.get_json()
        if not data or 'text' not in data or 'note_id' not in data:
            return jsonify({"error": "Missing text or note_id in request"}), 400

        text = data['text']
        note_id = int(data['note_id'])
        db_conn = get_db_connection()

        if matcher is None:
             print("Error: Matcher is not initialized. Attempting to re-initialize.", file=sys.stderr)
             initialize_matcher()
             if matcher is None:
                 return jsonify({"error": "Matcher could not be initialized"}), 500

        tagged_results = tag_text(text, note_id, db_conn, nlp, matcher)
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
