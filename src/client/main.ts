import { clearCitedVersions, mountColophon } from "./colophon.ts";
import { renderDocument } from "./reader.ts";
import {
  getPreferredVersion,
  resolveVersionId,
  setPreferredVersion,
} from "./preferences.ts";
import {
  baseLanguage,
  defaultVersionFor,
  watchPageLanguage,
} from "./language.ts";
import { createVersionPicker } from "./version-picker.ts";
import "./styles.css";

interface DocumentResponse {
  id: string;
  title: string;
  content: { type: string; content?: unknown[] };
  sourceLang: string;
  versionId: number | null;
  canEdit: boolean;
}

const mountPoint = document.querySelector<HTMLDivElement>("#app");
if (!mountPoint) throw new Error("Missing #app mount point");
const mount: HTMLDivElement = mountPoint;

/** Path is "/" (new document), "/:id", or "/:id/edit". */
function route(): { id: string | null; editing: boolean } {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return { id: parts[0] ?? null, editing: parts[1] === "edit" };
}

async function loadDocument(id: string): Promise<DocumentResponse | null> {
  const res = await fetch(`/api/documents/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as DocumentResponse;
}

function shell(): {
  page: HTMLDivElement;
  colophon: HTMLDivElement;
  actions: HTMLDivElement;
  /** Left of the toolbar, where the notes panel slides out from. */
  lead: HTMLDivElement;
} {
  const el = document.createElement("div");
  el.className = "shell";
  el.innerHTML = `
    <header class="toolbar">
      <a class="toolbar__brand" href="/">ScripturePad</a>
      <div class="toolbar__lead"></div>
      <div class="toolbar__actions"></div>
    </header>
    <main class="surface">
      <article class="page"></article>
      <aside class="colophon" hidden></aside>
    </main>
  `;
  mount.append(el);

  return {
    page: el.querySelector<HTMLDivElement>(".page")!,
    colophon: el.querySelector<HTMLDivElement>(".colophon")!,
    actions: el.querySelector<HTMLDivElement>(".toolbar__actions")!,
    lead: el.querySelector<HTMLDivElement>(".toolbar__lead")!,
  };
}

function notFound(): void {
  mount.innerHTML = `<div class="empty"><h1>Not found</h1>
    <p>No document at this address.</p>
    <p><a href="/">Start a new one</a></p></div>`;
}

interface Me {
  signedIn: boolean;
  name?: string | null;
  avatar?: string | null;
}

async function loadMe(): Promise<Me> {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return { signedIn: false };
    return (await res.json()) as Me;
  } catch {
    return { signedIn: false };
  }
}

/** Sign-in / sign-out control, shown at the end of the toolbar. */
function mountAccount(container: HTMLElement, me: Me): void {
  if (me.signedIn) {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/auth/signout";
    form.className = "account";

    if (me.name) {
      const name = document.createElement("span");
      name.className = "account__name";
      // A person's name is not something to machine-translate.
      name.setAttribute("translate", "no");
      name.textContent = me.name;
      form.append(name);
    }

    const signOut = document.createElement("button");
    signOut.type = "submit";
    signOut.className = "toolbar__button";
    signOut.textContent = "Sign out";
    form.append(signOut);
    container.append(form);
    return;
  }

  const signIn = document.createElement("a");
  signIn.className = "toolbar__button toolbar__button--primary";
  signIn.href = `/auth/signin?return_to=${encodeURIComponent(
    window.location.pathname,
  )}`;
  signIn.textContent = "Sign in";
  container.append(signIn);
}

/**
 * The notes button, placed at the left of the toolbar so it sits where the
 * panel slides out from rather than across the page in the action cluster.
 */
async function mountNotesButton(
  container: HTMLElement,
  currentId: string | null,
): Promise<void> {
  const { createNotesPanel } = await import("./notes-list.ts");
  const panel = createNotesPanel(navigator.language, currentId);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "toolbar__button toolbar__button--notes";
  button.setAttribute("aria-label", "Your notes");
  // A list glyph, so the control reads as "open a list" at a glance.
  button.innerHTML = `<span aria-hidden="true">☰</span> Notes`;
  button.addEventListener("click", () => panel.toggle());
  container.append(button);
}

async function main(): Promise<void> {
  const { id, editing } = route();
  const [existing, me] = await Promise.all([
    id ? loadDocument(id) : Promise.resolve(null),
    loadMe(),
  ]);

  if (id && !existing) {
    notFound();
    return;
  }

  const lang =
    existing?.sourceLang ?? navigator.language.split("-")[0] ?? "en";

  // A first-time reader inherits the version the author wrote against; their
  // own explicit choice wins once made.
  let versionId = resolveVersionId(lang, existing?.versionId ?? null);

  const { page, colophon, actions, lead } = shell();
  mountColophon(colophon);

  // Machine translation skips contenteditable, so reading uses plain DOM and
  // ProseMirror is loaded only to edit. This also keeps the editor bundle off
  // the critical path for readers.
  const wantsEditor = editing || !existing;

  if (!wantsEditor && existing) {
    document.title = existing.title || "ScripturePad";
    document.documentElement.lang = existing.sourceLang;

    const rerender = renderDocument(page, existing.content as never, versionId);
    const picker = createVersionPicker(actions, {
      initialLanguage: lang,
      initialVersionId: versionId,
      onChange: (next) => {
        versionId = next.id;
        setPreferredVersion(baseLanguage(next.languageTag), next.id);
        clearCitedVersions();
        rerender(next.id);
      },
    });

    // When the page is machine-translated, the quoted scripture must come from
    // a Bible in that language — not a translation of the English text.
    watchPageLanguage(async (language) => {
      const version = await defaultVersionFor(
        language,
        getPreferredVersion(language),
      );
      if (!version || version.id === versionId) return;

      versionId = version.id;
      clearCitedVersions();
      rerender(version.id);
      picker.setLanguage(language, version.id);
    });

    if (existing.canEdit) {
      const edit = document.createElement("a");
      edit.className = "toolbar__button";
      edit.href = `/${existing.id}/edit`;
      edit.textContent = "Edit";
      actions.append(edit);
    }

    if (me.signedIn) await mountNotesButton(lead, existing.id);

    mountAccount(actions, me);
    return;
  }

  // Editor path: loaded on demand.
  const { createEditor } = await import("./editor.ts");
  const { createToolbar } = await import("./toolbar.ts");
  const { DocumentSaver } = await import("./save.ts");

  let saver: InstanceType<typeof DocumentSaver>;

  const view = createEditor({
    mount: page,
    initialContent: existing?.content,
    editable: true,
    getVersionId: () => versionId,
    onChange: () => saver?.markDirty(),
  });

  const toolbar = createToolbar(actions, view, {
    getVersionId: () => versionId,
    setVersionId: (next) => {
      versionId = next;
      setPreferredVersion(lang, next);
    },
    language: lang,
    onSave: () => {
      // Saving needs an owner, so send the user to sign in rather than letting
      // the request fail with a 401 they cannot act on.
      if (!me.signedIn) {
        window.location.href = `/auth/signin?return_to=${encodeURIComponent(
          window.location.pathname,
        )}`;
        return;
      }
      void saver.save();
    },
  });

  saver = new DocumentSaver({
    view,
    documentId: existing?.id ?? null,
    sourceLang: lang,
    getVersionId: () => versionId,
    onStateChange: (state, message) => toolbar.setSaveState(state, message),
  });

  // Somewhere to find previously saved notes. A panel rather than a page, so
  // opening it mid-edit does not lose the author's place.
  if (me.signedIn) await mountNotesButton(lead, existing?.id ?? null);

  mountAccount(actions, me);

  // Ownership is what makes a document editable later, so saving requires an
  // account. Say so up front rather than failing at the moment of saving.
  // The button stays enabled when signed out — it routes to sign-in — so the
  // prompt is actionable rather than a dead end.
  toolbar.setSaveState(
    me.signedIn ? "clean" : "signin-required",
    me.signedIn ? undefined : "Sign in to save your notes",
  );

  // Ctrl/Cmd+S is what people reach for; intercept the browser's Save Page.
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      if (!me.signedIn) {
        window.location.href = `/auth/signin?return_to=${encodeURIComponent(
          window.location.pathname,
        )}`;
        return;
      }
      void saver.save();
    }
  });

  // Losing a sermon to a stray tab close is unacceptable.
  window.addEventListener("beforeunload", (event) => {
    if (saver.currentState === "dirty" || saver.currentState === "saving") {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  view.focus();
}

void main();
