import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/catalog/en";
import { es } from "@/i18n/catalog/es";
import { fill, matchLocale, translator } from "@/i18n/config";
import { collectKeys } from "../scripts/i18n-keys";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("language choice", () => {
  it("picks our language closest to what the browser asks for", () => {
    expect(matchLocale("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt-BR");
    expect(matchLocale("pt-PT")).toBe("pt-BR");
    expect(matchLocale("en-US,en;q=0.9")).toBe("en");
    expect(matchLocale("es-AR,es;q=0.9,en;q=0.8")).toBe("es");
    // The order of preference is the browser's, not ours.
    expect(matchLocale("en;q=0.5,es;q=0.9")).toBe("es");
    // A language we do not have: English, the most widely read of the three.
    expect(matchLocale("de-DE,de;q=0.9")).toBe("en");
    expect(matchLocale("fr,pt;q=0.4")).toBe("pt-BR");
    // No header (tools, crawlers) or nonsense: the app's own language.
    expect(matchLocale(null)).toBe("pt-BR");
    expect(matchLocale("")).toBe("pt-BR");
    expect(matchLocale("*")).toBe("pt-BR");
  });
});

describe("translating", () => {
  it("Portuguese is the text itself; the others come from their catalogue; a missing text shows in Portuguese", () => {
    expect(translator("pt-BR", null)("Alunos")).toBe("Alunos");
    expect(translator("en", en)("Alunos")).toBe("Students");
    expect(translator("es", es)("Alunos")).toBe("Alumnos");
    expect(translator("en", en)("Um texto que ninguém traduziu")).toBe("Um texto que ninguém traduziu");
    expect(translator("en", en)(undefined)).toBe("");
  });

  it("fills the values in, in every language", () => {
    expect(fill("{n} de {max}", { n: 3, max: 10 })).toBe("3 de 10");
    expect(fill("{n} de {max}", { n: 3 })).toBe("3 de {max}");
    expect(translator("pt-BR", null)("{0} exercícios encontrados", { 0: 12 })).toBe("12 exercícios encontrados");
    expect(translator("en", en)("{0} exercícios encontrados", { 0: 12 })).toBe("12 exercises found");
    expect(translator("es", es)("Nova mensagem de {who}", { who: "Ana" })).toBe("Nuevo mensaje de Ana");
  });
});

describe("catalogues", () => {
  const { keys, loose } = collectKeys(process.cwd());

  it("every text of the translated screens exists in English and in Spanish", () => {
    expect(keys.size).toBeGreaterThan(800);
    expect([...keys].filter((k) => !(k in en))).toEqual([]);
    expect([...keys].filter((k) => !(k in es))).toEqual([]);
  });

  it("no text with values inside is left outside the translator", () => {
    expect(loose).toEqual([]);
  });

  it("translations keep the same values and the same spacing at the edges as the original", () => {
    for (const [name, catalog] of [["en", en], ["es", es]] as const) {
      for (const [pt, text] of Object.entries(catalog)) {
        expect(placeholders(text), `${name}: ${pt}`).toBe(placeholders(pt));
        expect(/^\s/.test(text), `${name}: leading space of ${JSON.stringify(pt)}`).toBe(/^\s/.test(pt));
        expect(/\s$/.test(text), `${name}: trailing space of ${JSON.stringify(pt)}`).toBe(/\s$/.test(pt));
        expect(text.trim(), `${name}: ${pt}`).not.toBe("");
      }
    }
  });
});

describe("server-only translator", () => {
  /** Every .ts/.tsx file under src, keyed by its path relative to the project. */
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) files.set(relative(process.cwd(), p).split(sep).join("/"), readFileSync(p, "utf8"));
    }
  };
  walk(join(process.cwd(), "src"));
  const isClient = (src: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);
  const resolveImport = (from: string, spec: string) => {
    const base = spec.startsWith("@/") ? join("src", spec.slice(2)) : spec.startsWith(".") ? join(dirname(from), spec) : null;
    if (!base) return null;
    const norm = relative(process.cwd(), resolve(base)).split(sep).join("/");
    return [`${norm}.tsx`, `${norm}.ts`, `${norm}/index.tsx`, `${norm}/index.ts`].find((c) => files.has(c)) ?? null;
  };

  it("no module that browser code imports reads the language on the server", () => {
    // A file without "use client" is still bundled for the browser when a client component
    // imports it; if it calls getT (server only) every page that uses it breaks.
    const bad: string[] = [];
    for (const [file, src] of files) {
      if (!isClient(src)) continue;
      for (const m of src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)) {
        const target = resolveImport(file, m[1]!);
        if (!target) continue;
        const code = files.get(target)!;
        if (!isClient(code) && code.includes('from "@/i18n/server"')) bad.push(`${file} -> ${target}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
