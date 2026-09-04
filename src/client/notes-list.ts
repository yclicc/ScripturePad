/**
 * The signed-in user's own notes, in a slide-in panel.
 *
 * A panel rather than a separate page: a pastor opening their notes mid-edit
 * should not lose their place, and it keeps `/notes` from becoming a reserved
 * slug that collides with document URLs.
 */

interface NoteSummary {
  id: string;
  title: string;
  updatedAt: number;
}

/** "today", "yesterday", or a plain date — sermon notes are dated things. */
function formatWhen(updatedAt: number, locale: string): string {
  const date = new Date(updatedAt * 1000);
  const now = new Date();

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(now) - startOfDay(date)) / (1000 * 60 * 60 * 24),
  );

  if (days === 0) {
    return date.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(locale, { weekday: "long" });

  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export interface NotesPanel {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export function createNotesPanel(
  locale: string,
  currentId: string | null,
): NotesPanel {
  const backdrop = document.createElement("div");
  backdrop.className = "notes-backdrop";
  backdrop.hidden = true;

  const panel = document.createElement("aside");
  panel.className = "notes-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Your notes");
  // Focus is moved into the panel while it is open, so it behaves as a dialog.
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const header = document.createElement("div");
  header.className = "notes-panel__header";

  const heading = document.createElement("h2");
  heading.className = "notes-panel__heading";
  heading.textContent = "Your notes";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "notes-panel__close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "✕";

  header.append(heading, closeButton);

  const body = document.createElement("div");
  body.className = "notes-panel__body";

  panel.append(header, body);
  document.body.append(backdrop, panel);

  let isOpen = false;
  /** Restored when the panel closes, so keyboard users are not stranded. */
  let previouslyFocused: HTMLElement | null = null;

  async function load(): Promise<void> {
    body.innerHTML = "";

    const loading = document.createElement("p");
    loading.className = "notes-panel__message";
    loading.textContent = "Loading…";
    body.append(loading);

    let notes: NoteSummary[];
    try {
      const res = await fetch("/api/documents");

      if (res.status === 401) {
        body.innerHTML = "";
        const prompt = document.createElement("p");
        prompt.className = "notes-panel__message";
        const link = document.createElement("a");
        link.href = `/auth/signin?return_to=${encodeURIComponent(
          window.location.pathname,
        )}`;
        link.textContent = "Sign in";
        prompt.append(link, document.createTextNode(" to see your saved notes."));
        body.append(prompt);
        return;
      }

      if (!res.ok) throw new Error(String(res.status));
      notes = (await res.json()) as NoteSummary[];
    } catch {
      body.innerHTML = "";
      const error = document.createElement("p");
      error.className = "notes-panel__message";
      error.textContent = "Could not load your notes.";
      body.append(error);
      return;
    }

    body.innerHTML = "";

    if (notes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "notes-panel__message";
      empty.textContent = "Nothing saved yet.";
      body.append(empty);
      return;
    }

    const list = document.createElement("ul");
    list.className = "notes-panel__list";

    for (const note of notes) {
      const item = document.createElement("li");

      const link = document.createElement("a");
      link.className = "notes-panel__item";
      link.href = `/${note.id}/edit`;
      // Mark the note being edited so the panel orients the reader.
      if (note.id === currentId) {
        link.classList.add("notes-panel__item--current");
        link.setAttribute("aria-current", "page");
      }

      const title = document.createElement("span");
      title.className = "notes-panel__title";
      title.textContent = note.title || "Untitled";

      const when = document.createElement("span");
      when.className = "notes-panel__when";
      when.setAttribute("translate", "no");
      when.textContent = formatWhen(note.updatedAt, locale);

      link.append(title, when);
      item.append(link);
      list.append(item);
    }

    body.append(list);
  }

  function open(): void {
    if (isOpen) return;
    isOpen = true;
    previouslyFocused = document.activeElement as HTMLElement | null;

    backdrop.hidden = false;
    panel.hidden = false;
    // Next frame, so the transition runs from the off-screen position.
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
      panel.classList.add("is-open");
    });

    closeButton.focus();
    // Refetched each time: notes saved since the last open should appear.
    void load();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;

    backdrop.classList.remove("is-open");
    panel.classList.remove("is-open");

    const hide = () => {
      backdrop.hidden = true;
      panel.hidden = true;
    };
    // Wait for the transition so it does not vanish abruptly.
    panel.addEventListener("transitionend", hide, { once: true });
    setTimeout(hide, 300);

    previouslyFocused?.focus();
  }

  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      close();
    }
  });

  return {
    open,
    close,
    toggle: () => (isOpen ? close() : open()),
  };
}
