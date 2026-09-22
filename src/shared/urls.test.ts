import { describe, expect, it } from "vitest";
import { safeHref, safeReturnPath } from "./urls.ts";

describe("safeHref", () => {
  it("keeps web, mail and phone links", () => {
    expect(safeHref("https://example.org/a?b=1")).toBe(
      "https://example.org/a?b=1",
    );
    expect(safeHref("http://example.org")).toBe("http://example.org/");
    expect(safeHref("mailto:pastor@example.org")).toBe(
      "mailto:pastor@example.org",
    );
    expect(safeHref("tel:+441234567890")).toBe("tel:+441234567890");
  });

  it("rejects script-running schemes however they are spelled", () => {
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "\u0001javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      expect(safeHref(href)).toBeNull();
    }
  });

  it("rejects relative, empty and non-string values", () => {
    expect(safeHref("/somewhere")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref({ href: "https://example.org" })).toBeNull();
  });
});

describe("safeReturnPath", () => {
  it("keeps same-site paths", () => {
    expect(safeReturnPath("/")).toBe("/");
    expect(safeReturnPath("/abc123/copy")).toBe("/abc123/copy");
    expect(safeReturnPath("/abc123?x=1#y")).toBe("/abc123?x=1#y");
  });

  it("rejects anything that leaves the site", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "/\t/evil.example",
      "evil.example",
      "",
      undefined,
    ]) {
      expect(safeReturnPath(value)).toBe("/");
    }
  });
});
