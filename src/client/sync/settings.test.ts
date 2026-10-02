import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normaliseSettings,
  parseSettings,
  readCookie,
  serialiseSettings,
} from "./settings.ts";

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(readCookie("a=1; sp_sync=x%3Dy; b=2", "sp_sync")).toBe("x%3Dy");
    expect(readCookie("a=1", "sp_sync")).toBeNull();
    expect(readCookie("", "sp_sync")).toBeNull();
  });
});

describe("settings round trip", () => {
  it("survives being stored", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      versionIds: [113, 93],
      fontSize: 48,
      margins: { top: 10, right: 0, bottom: 20, left: 5 },
      theme: "dark" as const,
      balance: false,
    };
    expect(parseSettings(serialiseSettings(settings))).toEqual(settings);
  });

  it("treats a corrupt cookie as absent", () => {
    expect(parseSettings("%7Bnot json")).toBeNull();
    expect(parseSettings(null)).toBeNull();
  });
});

describe("normaliseSettings", () => {
  it("clamps and fills untrusted values", () => {
    expect(
      normaliseSettings({
        versionIds: [113, "x", 113, 5, 6, 7, 8],
        fontSize: 9999,
        margins: { top: -5, left: 5000, right: "a" },
        theme: "neon",
        balance: "yes",
      }),
    ).toEqual({
      versionIds: [113, 5, 6, 7],
      fontSize: 120,
      margins: { top: 0, right: 0, bottom: 0, left: 1000 },
      theme: "system",
      balance: true,
    });
  });
});
