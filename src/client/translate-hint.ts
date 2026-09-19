/**
 * Invites the reader to machine-translate the page.
 *
 * A page cannot start its own browser translation — no API exposes it — so
 * this points at the tool rather than pretending to do it.
 *
 * The whole product rests on readers understanding the *split*: the notes are
 * machine translated, while the scripture is swapped for a published
 * translation made by human experts. Lead with that, not with the mechanics —
 * a reader who thinks we machine-translate the Bible will rightly refuse.
 */

import { placePanel } from "./position.ts";

/** True once the page has been machine-translated. */
function isTranslated(): boolean {
  const el = document.documentElement;
  return (
    el.classList.contains("translated-ltr") ||
    el.classList.contains("translated-rtl")
  );
}

export function mountTranslateHint(container: HTMLElement): () => void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "translate-hint";
  button.innerHTML =
    `<span class="translate-hint__icon" aria-hidden="true">文</span>` +
    `<span class="translate-hint__label">Translate</span>`;
  button.title = "Read these notes in another language";

  const panel = document.createElement("div");
  panel.className = "translate-hint__panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Translate this page");

  // Order matters here, and was got wrong once. Leading with "use your
  // browser's translate option" made a reader understand the offer as "we will
  // machine-translate the Bible for you" — an Amharic speaker answered "there's
  // no need, there is already an Amharic Bible", which is both correct and
  // exactly what this app does. The sentence answering her was third, by which
  // point she had dismissed the feature. So the distinction leads, and the
  // mechanics follow.
  panel.innerHTML = `
    <p class="translate-hint__lead">
      The pastor's notes are machine translated. The Bible verses are not —
      those are swapped for a published translation in your language, made by
      human experts.
    </p>
    <p class="translate-hint__how">
      To read the notes in your language, use your browser's translate option:
      in Chrome, the icon in the address bar or
      <strong>right-click &rarr; Translate</strong>; on iPhone, the
      <strong>aA</strong> menu in Safari.
    </p>
  `;

  const wrapper = document.createElement("div");
  wrapper.className = "translate-hint__wrapper";
  wrapper.append(button, panel);
  container.append(wrapper);

  const close = () => {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };

  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
    // Measured after unhiding, so the panel has real dimensions.
    if (!panel.hidden) placePanel(button, panel, { prefer: "below" });
  });

  const onDocumentClick = (event: MouseEvent) => {
    if (!wrapper.contains(event.target as Node)) close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  // Fixed panels do not travel with the page, so close rather than drift.
  const onViewportChange = () => close();

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onViewportChange, { passive: true });
  window.addEventListener("resize", onViewportChange, { passive: true });

  // Once translated the invitation has served its purpose; keep the control
  // (to translate again) but drop the nudge.
  const observer = new MutationObserver(() => {
    wrapper.classList.toggle("is-translated", isTranslated());
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "lang"],
  });
  wrapper.classList.toggle("is-translated", isTranslated());

  return () => {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", onViewportChange);
    window.removeEventListener("resize", onViewportChange);
    observer.disconnect();
    wrapper.remove();
  };
}
