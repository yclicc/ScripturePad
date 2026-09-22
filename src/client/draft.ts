/**
 * An unsaved note, set aside while its author signs in.
 *
 * Saving needs an owner, so a signed-out author who presses Save is sent to
 * YouVersion and back — a full page load that would otherwise throw away
 * everything they had written, including a copy of someone else's note they
 * had just started adapting. The draft rides out the round trip in
 * `sessionStorage`, which is scoped to this tab and gone when it closes.
 */

const STORAGE_KEY = "scripturepad:draft";

/** Long enough for a slow sign-in, short enough not to resurrect old work. */
const MAX_AGE_MS = 60 * 60 * 1000;

export interface Draft {
  /** The editor path the draft belongs to, e.g. "/" or "/abc123/copy". */
  path: string;
  content: unknown;
  versionId: number;
  savedAt: number;
}

export function stashDraft(draft: Omit<Draft, "savedAt">): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Storage unavailable (private mode, quota): sign-in still proceeds, the
    // draft is simply not recovered — no worse than before.
  }
}

/** The draft for `path`, removed as it is taken so it is restored only once. */
export function takeDraft(path: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (draft.path !== path) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    if (Date.now() - draft.savedAt > MAX_AGE_MS) return null;
    return draft;
  } catch {
    return null;
  }
}
