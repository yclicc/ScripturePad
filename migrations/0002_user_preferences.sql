-- Remembered Bible version preference, per user per language.
--
-- Preference is per-language by nature: someone may read BSB in English and a
-- particular Swahili translation, and should get both without re-picking.
--
-- Kept out of `documents` deliberately — the same document viewed by two
-- readers should honour each reader's own choice, not the author's.

-- The version the author wrote against. A first-time visitor inherits this, so
-- a congregation member opening a share link sees the translation being
-- preached from rather than a generic default. NULL means "no preference
-- recorded"; the reader falls back to the license-free default.
ALTER TABLE documents ADD COLUMN version_id INTEGER;

CREATE TABLE user_preferences (
  yvp_id TEXT NOT NULL,

  -- BCP-47 tag as returned by the YouVersion API (e.g. "en", "sw", "zh").
  language_tag TEXT NOT NULL,

  -- YouVersion numeric version id.
  version_id INTEGER NOT NULL,

  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  PRIMARY KEY (yvp_id, language_tag)
);
