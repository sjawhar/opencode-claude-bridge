import { describe, expect, test } from "bun:test";
import { asScalarString } from "../src/coerce";

describe("asScalarString", () => {
  test("returns strings unchanged", () => {
    expect(asScalarString("hello")).toBe("hello");
    expect(asScalarString("")).toBe("");
  });

  test("stringifies numbers", () => {
    expect(asScalarString(42)).toBe("42");
    expect(asScalarString(0)).toBe("0");
    expect(asScalarString(-1.5)).toBe("-1.5");
  });

  test("stringifies booleans", () => {
    expect(asScalarString(true)).toBe("true");
    expect(asScalarString(false)).toBe("false");
  });

  test("returns undefined for null/undefined", () => {
    expect(asScalarString(null)).toBeUndefined();
    expect(asScalarString(undefined)).toBeUndefined();
  });

  test("returns undefined for objects and arrays", () => {
    expect(asScalarString({})).toBeUndefined();
    expect(asScalarString({ a: 1 })).toBeUndefined();
    expect(asScalarString([])).toBeUndefined();
    expect(asScalarString(["a", "b"])).toBeUndefined();
  });
});
