/**
 * Places a floating panel against the viewport.
 *
 * Shared by the scripture popover and the translate invitation. Both are
 * anchored to inline or edge-adjacent controls, where an absolutely positioned
 * child runs off the screen: an inline element that wraps has a *fragmented*
 * box, so the panel anchors to an arbitrary fragment, and any ancestor with
 * `overflow: hidden` clips it. Measuring the anchor and positioning against
 * the viewport avoids both.
 *
 * The panel must be `position: fixed` for these coordinates to mean anything.
 */

const MARGIN = 8;
const GAP = 8;

export interface PlaceOptions {
  /** Preferred side; flips when there is not room. */
  prefer?: "above" | "below";
}

export function placePanel(
  anchor: HTMLElement,
  panel: HTMLElement,
  options: PlaceOptions = {},
): void {
  const rect = anchor.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;

  // Start aligned with the anchor, then clamp into the viewport.
  let left = rect.left;
  const maxLeft = window.innerWidth - MARGIN - width;
  if (left > maxLeft) left = maxLeft;
  if (left < MARGIN) left = MARGIN;

  const above = rect.top - height - GAP;
  const below = rect.bottom + GAP;
  const fitsAbove = above >= MARGIN;
  const fitsBelow = below + height <= window.innerHeight - MARGIN;

  let top: number;
  if (options.prefer === "below") {
    top = fitsBelow ? below : fitsAbove ? above : MARGIN;
  } else {
    top = fitsAbove ? above : fitsBelow ? below : MARGIN;
  }

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}
