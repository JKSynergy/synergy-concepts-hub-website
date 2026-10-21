// Shared look for generated PDFs (invoice, receipt): the SCH design language —
// Sora titles, Inter text, navy + restrained orange, hairline rules, square corners.
import { Font } from "@react-pdf/renderer";
import { join } from "path";

const FONT_DIR = join(process.cwd(), "public", "fonts", "pdf");

/** Registers Sora and Inter once per process. Only these weights exist: Inter 400/500/600, Sora 600. */
export function registerPdfFonts() {
  // Checked on the shared font store, so loading this module twice never registers duplicates.
  if (Font.getRegisteredFontFamilies().includes("Sora")) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: join(FONT_DIR, "Inter-Regular.ttf"), fontWeight: 400 },
      { src: join(FONT_DIR, "Inter-Medium.ttf"), fontWeight: 500 },
      { src: join(FONT_DIR, "Inter-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "Sora",
    fonts: [{ src: join(FONT_DIR, "Sora-SemiBold.ttf"), fontWeight: 600 }],
  });
  // Wrap whole words only: no mid-word hyphenation.
  Font.registerHyphenationCallback((word) => [word]);
}

const FACES = [
  { fontFamily: "Inter", fontWeight: 400 },
  { fontFamily: "Inter", fontWeight: 500 },
  { fontFamily: "Inter", fontWeight: 600 },
  { fontFamily: "Sora", fontWeight: 600 },
] as const;

type GlyphCachingFont = { characterSet?: number[]; glyphForCodePoint?: (cp: number) => unknown };

let prepared: Promise<void> | null = null;

/**
 * Loads the fonts and fills each one's glyph cache with every character it
 * supports. Call (and await) before rendering a PDF.
 *
 * Why: when fontkit embeds a font it caches glyphs used *inside* other glyphs
 * (e.g. the dots of a colon) without their characters. The cache lives as long
 * as the server process, so a later PDF that uses one of those glyphs (e.g. a
 * full stop in "18.75") would embed it with no text: it looks right but copies
 * and searches as "18 75". Caching every glyph with its character first
 * prevents that.
 */
export function preparePdfFonts(): Promise<void> {
  registerPdfFonts();
  if (!prepared) {
    prepared = (async () => {
      for (const face of FACES) {
        const source = Font.getFont({ ...face, fontStyle: "normal" }) as unknown as {
          load: () => Promise<void>;
          data: GlyphCachingFont | null;
        } | null;
        if (!source) continue;
        await source.load();
        const font = source.data;
        if (font?.characterSet && font.glyphForCodePoint) {
          for (const cp of font.characterSet) font.glyphForCodePoint(cp);
        }
      }
    })().catch((err) => {
      prepared = null;
      throw err;
    });
  }
  return prepared;
}

export const T = {
  navy: "#0B0F19",
  ink: "#161B26",
  muted: "#5B6472",
  line: "#E1DFDA",
  orange: "#ED8C22",
  white: "#FFFFFF",
} as const;

/** Page side margin (18 mm). */
export const PAGE_X = 51;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-05" → "5 Oct 2026". Timestamps are shown in East Africa Time. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) return `${Number(plain[3])} ${MONTHS[Number(plain[2]) - 1]} ${plain[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return `${eat.getUTCDate()} ${MONTHS[eat.getUTCMonth()]} ${eat.getUTCFullYear()}`;
}

/** "mobile_money" → "Mobile Money". */
export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type StampKind = "paid" | "partial" | "unpaid" | "cancelled";

/** Stamp for an invoice status. Drafts carry no stamp. */
export function stampForStatus(status: string): StampKind | null {
  if (status === "paid") return "paid";
  if (status === "partially paid") return "partial";
  if (status === "sent" || status === "overdue") return "unpaid";
  if (status === "cancelled") return "cancelled";
  return null;
}
