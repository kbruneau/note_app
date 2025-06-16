import sys
import json
import os
import spacy
from spacy.matcher import PhraseMatcher
import psycopg2
from flask import Flask, request, jsonify

# === Environment Variables & Defaults ===
DB_NAME = os.environ.get("DB_NAME", "dnd_app")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "Paisley95")
DB_HOST = os.environ.get("DB_HOST", "32.220.174.183")
DB_PORT = os.environ.get("DB_PORT", "5432")

# === Global NLP Model and Matcher ===
nlp = spacy.load("en_core_web_sm")
matcher = None  # Will be initialized by initialize_matcher

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
    # Ensure conn is a valid connection object if it's None or closed
    temp_matcher = PhraseMatcher(current_nlp.vocab, attr="LOWER")
    sources = {
        "PERSON": [
            ("core.names", "name"),
            ("DM.nodes", "name", "type = 'PERSON'")
        ],
        "ITEM": [
            ("core.items", "name"),
            ("core.tools", "name"),
            ("DM.nodes", "name", "type = 'ITEM'")
        ],
        "SPELL": [
            ("core.spells", "name"),
            ("DM.nodes", "name", "type = 'SPELL'")
        ],
        "MONSTER": [
            ("DM.bestiarys", "name"),
            ("DM.nodes", "name", "type = 'MONSTER'")
        ],
        "LOCATION": [
            ("DM.nodes", "name", "type = 'LOCATION'")
        ]
    }
    for label, tables in sources.items():
        all_terms = []
        for entry in tables:
            if len(entry) == 2:
                table, column = entry
                terms = fetch_terms(conn, table, column)
            else:
                table, column, condition_str = entry
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
        # Depending on severity, might want to exit or retry
    finally:
        if db_conn:
            db_conn.close()

# === Infer label if not matched ===
def infer_type(ent):
    if ent.label_ == "PERSON":
        return "PERSON"
    if ent.label_ in {"GPE", "LOC", "FAC"}:
        return "LOCATION"

    head = ent.root.head
    verb = head.lemma_.lower()

    if verb in {"cast", "prepare", "learn", "invoke"}:
        return "SPELL"
    if verb in {"carry", "use", "draw", "equip", "wield", "hold", "swing"}:
        return "ITEM"
    if verb in {"attack", "fight", "encounter", "slay"}:
        return "MONSTER"
    if verb in {"travel", "visit", "enter", "arrive", "leave"}:
        return "LOCATION"
    if head.dep_ in {"nsubj", "poss"}: # Simplified, consider context
        return "PERSON"

    return "UNKNOWN" # Default

# === Main tagging function (adapted) ===
def tag_text(text, note_id, db_connection, current_nlp, current_matcher):
    doc = current_nlp(text)
    if current_matcher is None:
        print("Error: Matcher not initialized.", file=sys.stderr)
        raise ValueError("Matcher not initialized")

    matches = current_matcher(doc)
    mention_spans = {}

    # DB matches first
    for match_id, start, end in matches:
        label = current_nlp.vocab.strings[match_id]
        span = doc[start:end]
        mention_spans[(span.start_char, span.end_char)] = (span.text.strip(), label)

    # Add inferred types if no overlap
    for ent in doc.ents:
        key = (ent.start_char, ent.end_char)
        if key not in mention_spans:
            label = infer_type(ent)
            if label != "UNKNOWN":
                mention_spans[key] = (ent.text.strip(), label)

    tagged_nodes = []

    with db_connection.cursor() as cur:
        for (start_pos, end_pos), (name, label) in mention_spans.items():
            is_new = False
            normalized_name = name.strip()

            cur.execute("""
                SELECT id FROM "DM"."nodes"
                WHERE LOWER(name) = LOWER(%s) AND type = %s
            """, (normalized_name, label))
            row = cur.fetchone()

            if row:
                node_id_val = row[0]
            else:
                cur.execute("""
                    INSERT INTO "DM"."nodes" (name, type)
                    VALUES (%s, %s)
                    RETURNING id
                """, (normalized_name, label))
                node_id_val = cur.fetchone()[0]
                is_new = True

            tagged_nodes.append({
                "id": node_id_val,
                "name": normalized_name,
                "type": label,
                "status": "new" if is_new else "existing"
            })

            cur.execute("""
                INSERT INTO "DM"."note_mentions"
                (node_id, note_id, start_pos, end_pos, mention_type)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (node_id_val, note_id, start_pos, end_pos, label))

        node_ids = [n["id"] for n in tagged_nodes]
        for i in range(len(node_ids)):
            for j in range(i + 1, len(node_ids)):
                for x, y in [(node_ids[i], node_ids[j]), (node_ids[j], node_ids[i])]:
                    cur.execute("""
                        INSERT INTO "DM"."node_links" (source_node_id, target_node_id, note_id)
                        VALUES (%s, %s, %s)
                        ON CONFLICT DO NOTHING
                    """, (x, y, note_id))

        current_locations = [n for n in tagged_nodes if n["type"] == "LOCATION"]
        if current_locations:
            current_location_id = current_locations[0]["id"]
            for node in tagged_nodes:
                if node["type"] != "LOCATION": # Avoid self-referential location links
                    cur.execute("""
                        INSERT INTO "DM"."node_relationships"
                        (parent_node_id, child_node_id, relationship_type, note_id)
                        VALUES (%s, %s, 'located_in', %s)
                        ON CONFLICT DO NOTHING
                    """, (current_location_id, node["id"], note_id))

    # Commit is handled by the route after this function returns
    # db_connection.commit() # Removed from here
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

        # Use global nlp and matcher
        if matcher is None:
             print("Error: Matcher is not initialized. Attempting to re-initialize.", file=sys.stderr)
             initialize_matcher() # Attempt to re-initialize if it failed first time
             if matcher is None: # If still None, then critical error
                 return jsonify({"error": "Matcher could not be initialized"}), 500

        tagged_results = tag_text(text, note_id, db_conn, nlp, matcher)
        db_conn.commit() # Commit transaction after successful tagging

        return jsonify(tagged_results)

    except ValueError as ve: # Catch specific errors like "Matcher not initialized"
        if db_conn:
            db_conn.rollback()
        print(f"ValueError in /tag route: {ve}", file=sys.stderr)
        return jsonify({"error": str(ve)}), 500
    except Exception as e:
        if db_conn:
            db_conn.rollback()
        print(f"Error in /tag route: {e}", file=sys.stderr)
        return jsonify({"error": "Failed to tag text", "message": str(e)}), 500
    finally:
        if db_conn:
            db_conn.close()

# === Main Execution Block ===
if __name__ == '__main__':
    initialize_matcher() # Initialize matcher once on startup
    app.run(host='0.0.0.0', port=5001)
