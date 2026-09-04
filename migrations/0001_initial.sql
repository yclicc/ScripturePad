-- ScripturePad initial schema.
--
-- Ownership is keyed on the YouVersion `yvp_id`, which is documented as stable
-- and unique per user. Never key ownership off email, which can change.

CREATE TABLE documents (
  -- Short public slug used in the share URL, e.g. /a1b2c3
  id TEXT PRIMARY KEY,

  -- YouVersion yvp_id of the owner. NULL means an anonymous document that
  -- nobody can edit after creation.
  owner_id TEXT,

  title TEXT NOT NULL DEFAULT '',

  -- ProseMirror document as JSON. Stored structurally rather than as HTML so
  -- scripture nodes keep their attributes and can be re-rendered in whatever
  -- translation the reader picks.
  content TEXT NOT NULL,

  -- BCP-47 language tag the notes were authored in, used as the translation
  -- source and to pick a sensible default Bible version.
  source_lang TEXT NOT NULL DEFAULT 'en',

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_documents_owner ON documents (owner_id, updated_at DESC);

-- Server-side sessions. The browser only ever holds an opaque HttpOnly cookie
-- containing `id`; tokens never reach client JavaScript.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  yvp_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_sessions_expires ON sessions (expires_at);
