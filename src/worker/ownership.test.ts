import { describe, expect, it } from "vitest";
import { canEdit } from "./ownership.ts";

describe("canEdit", () => {
  it("lets the owner edit their own document", () => {
    expect(canEdit("yvp-123", "yvp-123")).toBe(true);
  });

  it("refuses a different signed-in user", () => {
    expect(canEdit("yvp-123", "yvp-456")).toBe(false);
  });

  it("refuses an anonymous visitor", () => {
    expect(canEdit("yvp-123", null)).toBe(false);
  });

  it("locks unowned documents against everyone", () => {
    // Documents created before sign-in exists have no owner. Nobody may edit
    // them — otherwise anyone with the link could rewrite a pastor's notes.
    expect(canEdit(null, null)).toBe(false);
    expect(canEdit(null, "yvp-123")).toBe(false);
  });
});
