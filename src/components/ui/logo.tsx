/* eslint-disable @next/next/no-img-element -- brand SVGs are served as files, never resized or recolored */

const DIR = "/brand/SalesFit-marca/svg";

/**
 * Background the logo sits on:
 *  - light: off-white / white surfaces (orange symbol, charcoal name)
 *  - dark: charcoal / graphite surfaces (orange symbol, white name)
 *  - orange: on #F2690F (all white)
 *  - auto: follows the app theme (light or dark)
 */
export type LogoTone = "light" | "dark" | "orange" | "auto";
type Layout = "horizontal" | "vertical" | "symbol";

const FILE: Record<Exclude<LogoTone, "auto">, Record<Layout, string>> = {
  light: { horizontal: "horizontal-cor-fundo-claro", vertical: "vertical-cor-fundo-claro", symbol: "simbolo-laranja" },
  dark: { horizontal: "horizontal-cor-fundo-escuro", vertical: "vertical-cor-fundo-escuro", symbol: "simbolo-laranja" },
  orange: { horizontal: "horizontal-branco-sobre-laranja", vertical: "vertical-branco-sobre-laranja", symbol: "simbolo-branco" },
};

// Width / height of each artwork (from the SVG viewBox).
const RATIO: Record<Layout, number> = { horizontal: 11269 / 2880, vertical: 7669 / 6952, symbol: 1 };

/**
 * The SalesFit logo, always from the official files. Size by height; the minimums
 * (horizontal 120 px wide, vertical 64 px, symbol 16 px) are enforced.
 * Clear space around it is left to the parent (at least 2× the symbol's dot).
 */
export function Logo({
  tone = "auto",
  layout = "horizontal",
  height = 32,
  className = "",
}: {
  tone?: LogoTone;
  layout?: Layout;
  height?: number;
  className?: string;
}) {
  const minWidth = layout === "horizontal" ? 120 : layout === "vertical" ? 64 : 16;
  const h = Math.max(height, minWidth / RATIO[layout]);
  const w = Math.round(h * RATIO[layout]);
  const img = (t: Exclude<LogoTone, "auto">, extra = "") => (
    <img src={`${DIR}/salesfit-${FILE[t][layout]}.svg`} alt="SalesFit" width={w} height={Math.round(h)} className={`block max-w-none ${extra}`} />
  );
  if (tone !== "auto" || layout === "symbol") return <span className={`inline-block ${className}`}>{img(tone === "auto" ? "light" : tone)}</span>;
  return (
    <span className={`inline-block ${className}`}>
      {img("light", "logo-on-light")}
      {img("dark", "logo-on-dark")}
    </span>
  );
}
