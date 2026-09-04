/**
 * Hover behaviour for popover citations.
 *
 * CSS `:hover` alone closes the panel during the moment the pointer spends
 * crossing the gap between the reference and the popover, which makes a
 * scrollable passage impossible to reach with a mouse. A short close delay
 * fixes that; touch is unaffected, since a tap sets focus instead.
 */

import { placePanel } from "./position.ts";

const CLOSE_DELAY_MS = 220;

/**
 * Watch `root` for popover citations and manage their open state.
 * Returns a teardown function.
 */
export function attachPopoverBehaviour(root: HTMLElement): () => void {
  const timers = new WeakMap<HTMLElement, number>();

  /**
   * Place the panel against the viewport.
   *
   * `position: fixed` rather than absolute-within-the-reference, because the
   * reference is an inline element: when it wraps across a line its box is
   * *fragmented*, and an absolutely positioned child anchors to whichever
   * fragment the browser picks — so the panel landed off-screen with no
   * containing block that could clamp it.
   *
   * Measuring the reference and positioning against the viewport sidesteps
   * both that and any ancestor with `overflow: hidden`.
   */
  const reposition = (el: HTMLElement) => {
    const panel = el.querySelector<HTMLElement>(".scripture__text");
    if (panel) placePanel(el, panel, { prefer: "above" });
  };

  const open = (el: HTMLElement) => {
    const pending = timers.get(el);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      timers.delete(el);
    }
    el.classList.add("is-showing");
    // After the class lands, so the panel has real dimensions to measure.
    requestAnimationFrame(() => reposition(el));
  };

  const scheduleClose = (el: HTMLElement) => {
    const pending = timers.get(el);
    if (pending !== undefined) window.clearTimeout(pending);

    timers.set(
      el,
      window.setTimeout(() => {
        el.classList.remove("is-showing");
        timers.delete(el);
      }, CLOSE_DELAY_MS),
    );
  };

  const popoverFrom = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Node)) return null;
    const element =
      target instanceof HTMLElement ? target : target.parentElement;
    return element?.closest<HTMLElement>(".scripture--popover") ?? null;
  };

  const onOver = (event: Event) => {
    const el = popoverFrom(event.target);
    if (el) open(el);
  };

  const onOut = (event: Event) => {
    const el = popoverFrom(event.target);
    if (!el) return;

    // Moving within the same citation (reference to panel) is not a leave.
    const to = (event as MouseEvent).relatedTarget;
    if (to instanceof Node && el.contains(to)) return;

    scheduleClose(el);
  };

  // Focus opens the panel via CSS (a tap on mobile), which bypasses `open()`,
  // so it needs repositioning too.
  const onFocusIn = (event: Event) => {
    const el = popoverFrom(event.target);
    if (el) requestAnimationFrame(() => reposition(el));
  };

  root.addEventListener("mouseover", onOver);
  root.addEventListener("mouseout", onOut);
  root.addEventListener("focusin", onFocusIn);

  // Escape closes an open popover, matching the rest of the app's dismissals.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    for (const el of root.querySelectorAll<HTMLElement>(".is-showing")) {
      el.classList.remove("is-showing");
    }
  };
  document.addEventListener("keydown", onKeyDown);

  // A fixed panel does not travel with the page, so scrolling would leave it
  // stranded beside unrelated text. Close instead of chasing the anchor.
  const closeAll = (event?: Event) => {
    // Scrolling *inside* a long passage must not dismiss it — that is the
    // whole point of the scroll cap.
    if (
      event?.target instanceof Node &&
      (event.target as HTMLElement).closest?.(".scripture__text")
    ) {
      return;
    }
    for (const el of root.querySelectorAll<HTMLElement>(".is-showing")) {
      el.classList.remove("is-showing");
    }
  };
  // Capture, so scrolls inside the panel are seen before they reach window.
  window.addEventListener("scroll", closeAll, { passive: true, capture: true });
  window.addEventListener("resize", closeAll, { passive: true });

  return () => {
    root.removeEventListener("mouseover", onOver);
    root.removeEventListener("mouseout", onOut);
    root.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", closeAll, { capture: true });
    window.removeEventListener("resize", closeAll);
  };
}
