/**
 * Who may modify a document.
 *
 * Ownership is keyed on the YouVersion `yvp_id`, which is stable per user.
 */

/**
 * A document with no owner is locked to everyone.
 *
 * Documents created before Sign in with YouVersion is wired up have a null
 * owner. Treating "unowned" as "editable by anyone" would let any visitor with
 * the link rewrite a pastor's notes, so unowned means read-only instead.
 */
export function canEdit(
  ownerId: string | null,
  userId: string | null,
): boolean {
  if (ownerId === null) return false;
  return ownerId === userId;
}
