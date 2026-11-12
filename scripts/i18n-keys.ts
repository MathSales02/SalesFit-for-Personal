/**
 * Finds every Portuguese text of the translated part of the app, so the catalogues can be
 * checked against it (tests/i18n.test.ts) and extended (`npx tsx scripts/i18n-keys.ts`
 * prints the texts still missing from each language).
 *
 * A file takes part when it uses the translator (imports @/i18n/server or @/i18n/client) or
 * is listed in SOURCES below (label tables and messages that are translated where they are
 * shown). In those files, a text is either the first argument of t("...") or any string that
 * reads as Portuguese.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

/** Label tables and messages translated at the place they are displayed. */
export const SOURCES = ["src/lib/plan-features.ts", "src/lib/theme.ts", "src/lib/validation", "src/server/lib/errors.ts"];
/** Never part of the catalogues: third-party code and files of a later translation stage. */
const EXCLUDE = ["src/i18n/catalog", "src/components/ui/glass-folder-cards.tsx", "src/components/ui/liquid-glass-navbar"];

const SKIP_ATTR = new Set(["className", "href", "id", "name", "type", "role", "htmlFor", "src", "viewBox", "d", "fill", "stroke", "rel", "target", "method", "autoComplete", "inputMode", "key", "value", "lang", "tone", "variant", "layout"]);

export const looksPortuguese = (s: string) =>
  /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(s) || /^[A-ZÁÉÍÓÚ][a-záàâãéêíóôõúç]+[,:.!?]?( [a-záàâãéêíóôõúçA-Z0-9{(%]+[,:.!?)}%]*)+/.test(s) || /^[A-ZÁÉÍÓÚ][a-záàâãéêíóôõúç]{3,}$/.test(s);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

export type Found = { keys: Set<string>; loose: { file: string; line: number; text: string }[] };

/** `keys`: texts to translate. `loose`: texts with values inside that are not going through t() and so cannot be translated. */
export function collectKeys(root: string): Found {
  const keys = new Set<string>();
  const loose: Found["loose"] = [];
  const rel = (p: string) => relative(root, p).split(sep).join("/");
  for (const file of walk(join(root, "src"))) {
    const name = rel(file);
    if (EXCLUDE.some((e) => name.startsWith(e))) continue;
    const src = readFileSync(file, "utf8");
    const usesT = /from "@\/i18n\/(server|client)"/.test(src);
    if (!usesT && !SOURCES.some((s) => name === s || name.startsWith(`${s}/`))) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
      if (ts.isJsxAttribute(node) && SKIP_ATTR.has(node.name.getText())) return;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
        const first = node.arguments[0];
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
          if (first.text.trim()) keys.add(first.text);
          // The values passed in may hold more texts.
          node.arguments.slice(1).forEach(visit);
          return;
        }
      }
      const plain = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
      if (plain || ts.isTemplateExpression(node)) {
        const p = node.parent;
        const isKey = ts.isPropertyAssignment(p) && p.name === node;
        const isCompare = ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind);
        const isIndex = ts.isElementAccessExpression(p) && p.argumentExpression === node;
        // For a text with values inside, only its fixed parts are judged.
        const text = plain ? node.text : [node.head.text, ...node.templateSpans.map((x) => x.literal.text)].join(" ");
        if (!isKey && !isCompare && !isIndex && !ts.isCaseClause(p) && looksPortuguese(text) && !/^[a-z0-9_./:-]+$/.test(text)) {
          if (plain) keys.add(text);
          else if (usesT) loose.push({ file: name, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: text.replace(/\s+/g, " ").slice(0, 120) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { keys, loose };
}

// Run directly: print what each language still misses.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/i18n-keys.ts")) {
  void (async () => {
    const { en } = await import("../src/i18n/catalog/en");
    const { es } = await import("../src/i18n/catalog/es");
    const { keys, loose } = collectKeys(process.cwd());
    const missing = (c: Record<string, string>) => [...keys].filter((k) => !(k in c)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const json = process.argv.includes("--json");
    if (json) console.log(JSON.stringify({ total: keys.size, en: missing(en), es: missing(es), loose }));
    else {
      console.log(`${keys.size} texts; missing: en ${missing(en).length}, es ${missing(es).length}; not translatable as written: ${loose.length}`);
      for (const l of loose) console.log(`  ${l.file}:${l.line}  ${l.text}`);
    }
  })();
}
