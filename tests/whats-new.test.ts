import { describe, expect, it } from "vitest";
import { en } from "@/i18n/catalog/en";
import { es } from "@/i18n/catalog/es";
import { NEWS, newsFor, type NewsItem } from "@/lib/whats-new";

const item = (id: string, releasedAt: string, audience: NewsItem["audience"]): NewsItem => ({ id, releasedAt, audience, title: id, body: id });

describe("what's new", () => {
  const all = [item("a", "2026-11-10T12:00:00Z", ["student"]), item("b", "2026-11-12T12:00:00Z", ["trainer", "student"]), item("c", "2026-11-14T12:00:00Z", ["trainer"])];

  it("tells each person about what launched for them after they joined", () => {
    expect(newsFor("student", "2026-11-01T00:00:00Z", all).map((n) => n.id)).toEqual(["a", "b"]);
    expect(newsFor("trainer", "2026-11-01T00:00:00Z", all).map((n) => n.id)).toEqual(["b", "c"]);
    // Joined after "a" and "b": for them that is simply how the app works.
    expect(newsFor("student", "2026-11-13T00:00:00Z", all)).toEqual([]);
    expect(newsFor("trainer", "2026-11-13T00:00:00Z", all).map((n) => n.id)).toEqual(["c"]);
  });

  it("every entry has a unique id, a full date, newest first, and is translated", () => {
    expect(new Set(NEWS.map((n) => n.id)).size).toBe(NEWS.length);
    for (const n of NEWS) expect(Number.isNaN(Date.parse(n.releasedAt)) || !n.releasedAt.includes("T"), n.id).toBe(false);
    const dates = NEWS.map((n) => Date.parse(n.releasedAt));
    expect(dates).toEqual([...dates].sort((x, y) => y - x));
    for (const n of NEWS)
      for (const text of [n.title, n.body, n.cta?.label].filter((x): x is string => !!x)) {
        expect(en[text], `en: ${text}`).toBeTruthy();
        expect(es[text], `es: ${text}`).toBeTruthy();
      }
  });
});
