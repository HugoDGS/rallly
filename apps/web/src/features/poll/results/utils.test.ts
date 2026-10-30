import { describe, expect, it } from "vitest";
import { rankOptions } from "./utils";

const option = (id: string, day: number) => ({
  id,
  startTime: new Date(Date.UTC(2026, 11, day)),
});

const scores = (
  map: Record<string, { yes: number; ifNeedBe: number; no: number }>,
) => {
  return (id: string) => map[id] ?? { yes: 0, ifNeedBe: 0, no: 0 };
};

describe("rankOptions", () => {
  it("puts the option most people can make first", () => {
    const ranked = rankOptions(
      [option("a", 1), option("b", 2)],
      scores({
        a: { yes: 1, ifNeedBe: 0, no: 2 },
        b: { yes: 1, ifNeedBe: 1, no: 1 },
      }),
      3,
    );
    expect(ranked.map((o) => o.id)).toEqual(["b", "a"]);
    expect(ranked[0]?.available).toBe(2);
  });

  it("breaks availability ties with yes votes, then the earliest option", () => {
    const ranked = rankOptions(
      [option("late", 3), option("tentative", 1), option("early", 2)],
      scores({
        late: { yes: 2, ifNeedBe: 0, no: 0 },
        tentative: { yes: 1, ifNeedBe: 1, no: 0 },
        early: { yes: 2, ifNeedBe: 0, no: 0 },
      }),
      2,
    );
    expect(ranked.map((o) => o.id)).toEqual(["early", "late", "tentative"]);
  });

  it("gives tied options the same rank", () => {
    const ranked = rankOptions(
      [option("a", 1), option("b", 2), option("c", 3)],
      scores({
        a: { yes: 2, ifNeedBe: 0, no: 0 },
        b: { yes: 2, ifNeedBe: 0, no: 0 },
        c: { yes: 1, ifNeedBe: 0, no: 1 },
      }),
      2,
    );
    expect(ranked.map((o) => o.rank)).toEqual([1, 1, 3]);
    expect(ranked.map((o) => o.isTopChoice)).toEqual([true, true, false]);
  });

  it("counts participants who skipped an option as no response", () => {
    const [ranked] = rankOptions(
      [option("a", 1)],
      scores({ a: { yes: 1, ifNeedBe: 1, no: 1 } }),
      5,
    );
    expect(ranked?.noResponse).toBe(2);
  });

  it("has no top choice when nobody is available", () => {
    const ranked = rankOptions(
      [option("a", 1)],
      scores({ a: { yes: 0, ifNeedBe: 0, no: 3 } }),
      3,
    );
    expect(ranked[0]?.isTopChoice).toBe(false);
  });
});
