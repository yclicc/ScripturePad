/**
 * URL checks for values that arrive from users.
 *
 * Notes are public and anyone can sign in and publish one, so a stored link or
 * a sign-in `return_to` is attacker-controlled input.
 */

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * The link target to render, or null when it is not safe to follow.
 *
 * A `javascript:` (or `data:`, `vbscript:`…) href runs script on this origin
 * when clicked — stored XSS on a page shared with a whole congregation. Only
 * ordinary web, mail, and phone links survive; parsing with `URL` rather than
 * matching a prefix defeats the whitespace, control-character and case tricks
 * browsers tolerate in a scheme.
 */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  try {
    const url = new URL(href.trim());
    return LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    // Relative or malformed. Notes are pasted in from elsewhere, so a relative
    // link has no meaningful target here.
    return null;
  }
}

/**
 * A same-site path to return to after sign-in, else "/".
 *
 * Without this, `/auth/signin?return_to=//evil.example` sends the user to
 * another site straight after a genuine YouVersion sign-in — a convincing
 * phishing hop. Only a single-slash path on this origin is accepted; `//host`
 * and `/\host` are both read by browsers as a different host.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || /^\/[/\\]/.test(value)) return "/";
  // Control characters (a tab or newline) are stripped by URL parsers and can
  // turn "/\t/evil.example" into "//evil.example".
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const base = "https://scripturepad.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
