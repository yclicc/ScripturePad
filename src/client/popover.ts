/**
 * Hover behaviour for popover citations.
 *
 * CSS `:hover` alone closes the panel during the moment the pointer spends
 * crossing the gap between the reference and the popover, which makes a
 * scrollable passage impossible to reach with a mouse. A short close delay
 * fixes that; touch is unaffected, since a tap sets focus instead.
 */

const CLOSE_DELAY_MS = 220;

/**
 * Watch `root` for popover citations and manage their open state.
 * Returns a teardown function.
 */
export function attachPopoverBehaviour(root: HTMLElement): () => void {
  const timers = new WeakMap<HTMLElement, number>();

  const open = (el: HTMLElement) => {
    const pending = timers.get(el);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      timers.delete(el);
    }
    el.classList.add("is-showing");
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

  root.addEventListener("mouseover", onOver);
  root.addEventListener("mouseout", onOut);

  // Escape closes an open popover, matching the rest of the app's dismissals.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    for (const el of root.querySelectorAll<HTMLElement>(".is-showing")) {
      el.classList.remove("is-showing");
    }
  };
  document.addEventListener("keydown", onKeyDown);

  return () => {
    root.removeEventListener("mouseover", onOver);
    root.removeEventListener("mouseout", onOut);
    document.removeEventListener("keydown", onKeyDown);
  };
}
