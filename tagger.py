import sys
import json
import spacy
from spacy.matcher import PhraseMatcher
import psycopg2

# === Load NLP model ===
nlp = spacy.load("en_core_web_sm")

# === Connect to PostgreSQL ===
conn = psycopg2.connect(
    dbname="dnd_app",
    user="postgres",
    password="Paisley95",
    host="32.220.174.183",
    port="5432"
)

# === Load terms from DB ===
def fetch_terms(conn, table, column):
    with conn.cursor() as cur:
        schema, table_name = table.split(".")
        cur.execute(f'SELECT DISTINCT "{column}" FROM "{schema}"."{table_name}"')
        return [row[0] for row in cur.fetchall() if row[0]]

# === Build matcher from DB ===
def build_matcher(nlp, conn):
    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
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
                table, column, condition = entry
                schema, table_name = table.split(".")
                with conn.cursor() as cur:
                    cur.execute(f'SELECT DISTINCT "{column}" FROM "{schema}"."{table_name}" WHERE {condition}')
                    terms = [row[0] for row in cur.fetchall() if row[0]]
            all_terms.extend(terms)

        if all_terms:
            matcher.add(label, [nlp.make_doc(term) for term in all_terms])

    return matcher
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
    if head.dep_ in {"nsubj", "poss"}:
        return "PERSON"

    return "UNKNOWN"

# === Main tagging function ===
def tag_text(text, note_id, conn):
    doc = nlp(text)
    matcher = build_matcher(nlp, conn)
    matches = matcher(doc)

    mention_spans = {}

    # DB matches first
    for match_id, start, end in matches:
        label = nlp.vocab.strings[match_id]
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

    with conn.cursor() as cur:
        for (start_pos, end_pos), (name, label) in mention_spans.items():
            is_new = False
            normalized_name = name.strip()

            # Lookup existing node case-insensitively
            cur.execute("""
                SELECT id FROM "DM"."nodes"
                WHERE LOWER(name) = LOWER(%s) AND type = %s
            """, (normalized_name, label))
            row = cur.fetchone()

            if row:
                node_id = row[0]
            else:
                cur.execute("""
                    INSERT INTO "DM"."nodes" (name, type)
                    VALUES (%s, %s)
                    RETURNING id
                """, (normalized_name, label))
                node_id = cur.fetchone()[0]
                is_new = True

            tagged_nodes.append({
                "id": node_id,
                "name": normalized_name,
                "type": label,
                "status": "new" if is_new else "existing"
            })

            # Add mention
            cur.execute("""
                INSERT INTO "DM"."note_mentions"
                (node_id, note_id, start_pos, end_pos, mention_type)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (node_id, note_id, start_pos, end_pos, label))

        # Link co-mentioned nodes (bidirectional)
        node_ids = [n["id"] for n in tagged_nodes]
        for i in range(len(node_ids)):
            for j in range(i + 1, len(node_ids)):
                for x, y in [(node_ids[i], node_ids[j]), (node_ids[j], node_ids[i])]:
                    cur.execute("""
                        INSERT INTO "DM"."node_links" (source_node_id, target_node_id, note_id)
                        VALUES (%s, %s, %s)
                        ON CONFLICT DO NOTHING
                    """, (x, y, note_id))

        # Infer parent-child location relationships
        current_locations = [n for n in tagged_nodes if n["type"] == "LOCATION"]
        if current_locations:
            current_location_id = current_locations[0]["id"]
            for node in tagged_nodes:
                if node["type"] != "LOCATION":
                    cur.execute("""
                        INSERT INTO "DM"."node_relationships"
                        (parent_node_id, child_node_id, relationship_type, note_id)
                        VALUES (%s, %s, 'located_in', %s)
                        ON CONFLICT DO NOTHING
                    """, (current_location_id, node["id"], note_id))

    conn.commit()
    print(f"Tagged and linked {len(tagged_nodes)} nodes from note {note_id}", file=sys.stderr)
    return tagged_nodes



# === Entrypoint for subprocess ===
if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read())
        note_id = int(payload["note_id"])
        text = payload["text"]

        results = tag_text(text, note_id, conn)
        print(json.dumps(results))  # ← ONLY this goes to stdout

    except Exception as e:
        print(f"Error in tagger.py: {e}", file=sys.stderr)
        sys.exit(1)

    finally:
        conn.close()
