// Extracts text runs from a PDF rendered by @react-pdf/renderer, per page.
//
// Embedded fonts (Sora/Inter) write glyph ids, not characters, so each font's
// ToUnicode CMap is used to turn them back into text. Standard fonts
// (Helvetica) are read as plain Latin-1 bytes.
import zlib from "node:zlib";

function objects(buf) {
  const txt = buf.toString("latin1");
  const map = new Map();
  for (const m of txt.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) {
    const body = m[2];
    const s = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body);
    let data = null;
    if (s) {
      const raw = Buffer.from(s[1], "latin1");
      try {
        data = /FlateDecode/.test(body.slice(0, s.index)) ? zlib.inflateSync(raw).toString("latin1") : s[1];
      } catch {
        data = null;
      }
    }
    map.set(Number(m[1]), { dict: s ? body.slice(0, s.index) : body, data });
  }
  return map;
}

function parseCMap(data) {
  const map = new Map();
  const hexToStr = (h) => {
    const bytes = Buffer.from(h, "hex");
    let out = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes.readUInt16BE(i));
    return out;
  };
  for (const block of data.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(m[1].toUpperCase(), hexToStr(m[2]));
  }
  for (const block of data.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]+>)/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const width = m[1].length;
      if (m[3].startsWith("[")) {
        const items = [...m[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => x[1]);
        items.forEach((h, i) => map.set((lo + i).toString(16).toUpperCase().padStart(width, "0"), hexToStr(h)));
      } else {
        const base = parseInt(m[3].slice(1, -1), 16);
        for (let c = lo; c <= hi; c++) {
          map.set(c.toString(16).toUpperCase().padStart(width, "0"), String.fromCharCode(base + (c - lo)));
        }
      }
    }
  }
  return map;
}

/** Text runs of each page, in drawing order. pages[i] is page i+1. */
export function pdfPages(buf) {
  const objs = objects(buf);

  // Font resource name → CMap (null for standard fonts).
  const fonts = new Map();
  for (const { dict } of objs.values()) {
    const res = /\/Font\s*<<([\s\S]*?)>>/.exec(dict);
    if (!res) continue;
    for (const m of res[1].matchAll(/\/([\w.+-]+)\s+(\d+)\s+0\s+R/g)) {
      const font = objs.get(Number(m[2]));
      const tu = font && /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font.dict);
      const cmapObj = tu && objs.get(Number(tu[1]));
      fonts.set(m[1], cmapObj && cmapObj.data ? parseCMap(cmapObj.data) : null);
    }
  }

  // Page objects in order, each with its content stream(s).
  const root = [...objs.values()].find((o) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent\b/.test(o.dict));
  const kids = root ? [.../\/Kids\s*\[([^\]]*)\]/.exec(root.dict)[1].matchAll(/(\d+)\s+0\s+R/g)].map((x) => Number(x[1])) : [];
  const pageObjs = kids.length
    ? kids.map((id) => [id, objs.get(id)])
    : [...objs.entries()].filter(([, o]) => /\/Type\s*\/Page\b/.test(o.dict));
  const pages = [];
  for (const [, page] of pageObjs) {
    const c = /\/Contents\s+(?:(\d+)\s+0\s+R|\[([^\]]*)\])/.exec(page.dict);
    if (!c) continue;
    const ids = c[1] ? [Number(c[1])] : [...c[2].matchAll(/(\d+)\s+0\s+R/g)].map((x) => Number(x[1]));
    const content = ids.map((id) => objs.get(id)?.data || "").join("\n");
    let cmap = null;
    const runs = [];
    for (const m of content.matchAll(/\/([\w.+-]+)\s+[\d.]+\s+Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9A-Fa-f]*)>\s*Tj/g)) {
      if (m[1]) {
        cmap = fonts.get(m[1]) ?? null;
        continue;
      }
      const hexes = m[2] !== undefined ? [...m[2].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => x[1]) : [m[3]];
      let s = "";
      for (const h of hexes) {
        if (cmap) {
          for (let i = 0; i + 3 < h.length; i += 4) s += cmap.get(h.slice(i, i + 4).toUpperCase()) ?? "";
        } else {
          s += Buffer.from(h, "hex").toString("latin1");
        }
      }
      if (s.trim()) runs.push(s);
    }
    pages.push(runs);
  }
  return pages;
}

/** A page's runs joined into one searchable string. */
export const pageText = (runs) => runs.join(" ");
