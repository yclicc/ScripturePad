import type { EditorView } from "prosemirror-view";

/**
 * Saving a document.
 *
 * A new document is created on first save (POST) and updated thereafter (PUT).
 * The URL is rewritten to the new id without a reload, so the author can share
 * the link immediately.
 */

export type SaveState =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  /** Signed out: the button routes to sign-in rather than attempting a save. */
  | "signin-required";

interface SaveOptions {
  view: EditorView;
  /** Null until the document has been saved for the first time. */
  documentId: string | null;
  sourceLang: string;
  getVersionId: () => number;
  onStateChange: (state: SaveState, message?: string) => void;
}

/** The first heading, else the first line of text — used as the page title. */
function deriveTitle(view: EditorView): string {
  let title = "";

  view.state.doc.descendants((node) => {
    if (title) return false;
    if (node.type.name === "heading" && node.textContent.trim()) {
      title = node.textContent.trim();
      return false;
    }
    return true;
  });

  if (!title) {
    view.state.doc.descendants((node) => {
      if (title) return false;
      if (node.isTextblock && node.textContent.trim()) {
        title = node.textContent.trim().slice(0, 80);
        return false;
      }
      return true;
    });
  }

  return title;
}

export class DocumentSaver {
  private state: SaveState = "clean";
  private documentId: string | null;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly options: SaveOptions) {
    this.documentId = options.documentId;
  }

  get currentState(): SaveState {
    return this.state;
  }

  get id(): string | null {
    return this.documentId;
  }

  private setState(state: SaveState, message?: string): void {
    this.state = state;
    this.options.onStateChange(state, message);
  }

  markDirty(): void {
    if (this.state === "saving") return;
    this.setState("dirty");
  }

  async save(): Promise<void> {
    // Coalesce concurrent saves rather than racing two writes.
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.perform().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async perform(): Promise<void> {
    const { view, sourceLang, getVersionId } = this.options;
    this.setState("saving");

    const body = JSON.stringify({
      content: view.state.doc.toJSON(),
      title: deriveTitle(view),
      sourceLang,
      versionId: getVersionId(),
    });

    try {
      const res = this.documentId
        ? await fetch(`/api/documents/${this.documentId}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body,
          })
        : await fetch("/api/documents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          });

      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        this.setState(
          "error",
          detail.error ??
            (res.status === 403
              ? "You do not have permission to edit this document."
              : "Could not save."),
        );
        return;
      }

      if (!this.documentId) {
        const created = (await res.json()) as { id: string };
        this.documentId = created.id;
        // Move to the document's own URL so the link can be shared, without
        // reloading and losing editor state.
        window.history.replaceState(null, "", `/${created.id}/edit`);
      }

      this.setState("saved");
    } catch {
      this.setState("error", "Could not reach the server.");
    }
  }
}
