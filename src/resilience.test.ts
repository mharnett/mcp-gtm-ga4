import { describe, it, expect } from "vitest";
import { safeResponse, withResilience } from "./resilience.js";

describe("safeResponse", () => {
  it("returns small data unchanged", () => {
    const data = { name: "test" };
    expect(safeResponse(data, "test")).toEqual(data);
  });

  it("truncates large tags array", () => {
    const obj = { tags: Array.from({ length: 10000 }, (_, i) => ({ id: i, x: "y".repeat(100) })), count: 10000 };
    const result = safeResponse(obj, "test");
    expect(result.tags.length).toBeLessThan(10000);
    expect(result.truncated).toBe(true);
    expect(result.count).toBe(result.tags.length);
  });
});

describe("withResilience", () => {
  it("succeeds", async () => {
    expect(await withResilience(async () => ({ ok: true }), "test")).toEqual({ ok: true });
  });

  it("retries on transient failure", async () => {
    let n = 0;
    const result = await withResilience(async () => { n++; if (n < 2) throw new Error("500"); return { ok: true }; }, "test");
    expect(result).toEqual({ ok: true });
    expect(n).toBe(2);
  });

  it("fails after max retries", async () => {
    await expect(withResilience(async () => { throw new Error("500"); }, "test")).rejects.toThrow();
  });
});
