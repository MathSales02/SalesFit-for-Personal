"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassFolder, { type ArtRecipe } from "@/components/ui/glass-folder-cards";
import { useT } from "@/i18n/client";

/** The brand's charcoal and orange, folded like ink: the picture on the back of every folder. */
const BRAND_ART: ArtRecipe = {
  style: "marble",
  colors: ["#0e0f11", "#2a2d32", "#5a2a0a", "#a94706", "#f2690f", "#f79a5e", "#f7f5f2"],
  scale: 0.68,
  warp: 3.2,
  angle: -0.5,
  gloss: 0.5,
  veins: 0.45,
};

export type RecordSheet = { name: string; meta?: string; href: string };

/**
 * A folder of records on the home page: the student's workout sheets, or the trainer's students
 * and programs. Tap it to open; each sheet goes to the real page. The folder shows the first
 * four sheets; `allHref` leads to the complete list.
 */
export function RecordFolder({
  label,
  meta,
  sheets,
  seed = 3,
  allHref,
  allLabel,
  empty,
}: {
  label: string;
  /** Second line on the folder, e.g. "12 alunos". */
  meta: string;
  sheets: RecordSheet[];
  seed?: number;
  allHref: string;
  allLabel: string;
  /** Shown under an empty folder. */
  empty: string;
}) {
  const t = useT();
  const router = useRouter();
  // The folder draws its last file in front, so the first sheet goes last.
  const shown = sheets.slice(0, 4).reverse();
  return (
    // Sheets rise above the folder when it opens: the top padding is their room.
    <div className="flex flex-col items-center pt-16" data-no-swipe>
      <GlassFolder
        // The folder reads its files once; a new list is a new folder.
        key={shown.map((s) => s.href).join("|")}
        label={label}
        meta={meta}
        art={BRAND_ART}
        seed={seed}
        action="none"
        appear={false}
        width={300}
        files={shown.map((s) => ({ name: s.name, meta: s.meta }))}
        onFileSelect={(_file, index) => {
          const sheet = shown[index];
          if (sheet) router.push(sheet.href);
        }}
      />
      <p className="mt-3 max-w-[300px] text-center text-sm text-ink-soft">
        {sheets.length === 0 ? `${empty} ` : t("Toque na pasta para abrir. ")}
        <Link href={allHref} className="font-semibold text-turf underline-offset-4 hover:underline">
          {allLabel}
        </Link>
      </p>
    </div>
  );
}
