import type { Env } from "./env.ts";

export interface DocumentRecord {
  id: string;
  ownerId: string | null;
  title: string;
  /** ProseMirror document JSON, serialised. */
  content: string;
  sourceLang: string;
  createdAt: number;
  updatedAt: number;
}

interface DocumentRow {
  id: string;
  owner_id: string | null;
  title: string;
  content: string;
  source_lang: string;
  created_at: number;
  updated_at: number;
}

function toRecord(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    content: row.content,
    sourceLang: row.source_lang,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

/**
 * Generate a short URL slug. Ambiguous characters (l, 1, 0, o) are excluded so
 * slugs survive being read aloud or written on a handout.
 */
export function generateId(length = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) {
    out += ID_ALPHABET[byte % ID_ALPHABET.length];
  }
  return out;
}

export async function getDocument(
  env: Env,
  id: string,
): Promise<DocumentRecord | null> {
  const row = await env.DB.prepare(
    `SELECT id, owner_id, title, content, source_lang, created_at, updated_at
     FROM documents WHERE id = ?`,
  )
    .bind(id)
    .first<DocumentRow>();

  return row ? toRecord(row) : null;
}

export async function createDocument(
  env: Env,
  input: {
    ownerId: string | null;
    title: string;
    content: string;
    sourceLang: string;
  },
): Promise<DocumentRecord> {
  // Retry on the vanishingly unlikely slug collision rather than trusting luck.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateId();
    const result = await env.DB.prepare(
      `INSERT INTO documents (id, owner_id, title, content, source_lang)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING
       RETURNING id, owner_id, title, content, source_lang,
                 created_at, updated_at`,
    )
      .bind(
        id,
        input.ownerId,
        input.title,
        input.content,
        input.sourceLang,
      )
      .first<DocumentRow>();

    if (result) return toRecord(result);
  }

  throw new Error("Could not allocate a unique document id");
}

export async function updateDocument(
  env: Env,
  id: string,
  input: { title: string; content: string },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE documents
     SET title = ?, content = ?, updated_at = unixepoch()
     WHERE id = ?`,
  )
    .bind(input.title, input.content, id)
    .run();
}

export async function deleteDocument(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM documents WHERE id = ?`).bind(id).run();
}

export async function listDocumentsByOwner(
  env: Env,
  ownerId: string,
  limit = 50,
): Promise<DocumentRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, owner_id, title, content, source_lang, created_at, updated_at
     FROM documents
     WHERE owner_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
  )
    .bind(ownerId, limit)
    .all<DocumentRow>();

  return results.map(toRecord);
}
