// Shared helpers for the text-note background colour picker used by the barcode
// generator and the scan view. The generator lets an admin pick a background
// swatch; the reader must render legible text on top of it. Both sides derive
// the foreground colour from the background with the same rule so a saved note
// always looks the way it did in the preview (e.g. white text on red, never
// black text on red).

// Preset backgrounds offered in the generator. Each renders a swatch; the text
// colour is computed, not stored per preset, so a custom colour behaves the
// same way.
export const TEXT_BG_PRESETS = [
  { id: "paper", label: "Paper", bg: "#fffdf5" },
  { id: "ink", label: "Ink", bg: "#101828" },
  { id: "red", label: "Red", bg: "#dc2626" },
  { id: "orange", label: "Orange", bg: "#ea580c" },
  { id: "amber", label: "Amber", bg: "#f59e0b" },
  { id: "green", label: "Green", bg: "#16a34a" },
  { id: "teal", label: "Teal", bg: "#0d9488" },
  { id: "blue", label: "Blue", bg: "#2563eb" },
  { id: "indigo", label: "Indigo", bg: "#4f46e5" },
  { id: "purple", label: "Purple", bg: "#7c3aed" },
  { id: "pink", label: "Pink", bg: "#db2777" },
  { id: "slate", label: "Slate", bg: "#475569" },
];

// Default background for a new text note — keeps the warm "paper" look the scan
// view shipped with before backgrounds were selectable.
export const DEFAULT_TEXT_BG = "#fffdf5";

// Normalise "#rgb" / "#rrggbb" (with or without the leading #) into [r,g,b].
// Returns null when the value can't be parsed so callers can fall back.
const parseHex = (value) => {
  let hex = String(value || "").trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
};

// WCAG relative luminance for a parsed [r,g,b] triple (0..1).
const relativeLuminance = ([r, g, b]) => {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

// Pick a legible foreground for the given background. Dark backgrounds get
// near-white text; light backgrounds get near-black. This is what guarantees a
// matching pair (never red-on-red or black-on-red).
export const getContrastText = (bgColor) => {
  const rgb = parseHex(bgColor);
  if (!rgb) return "#101828";
  return relativeLuminance(rgb) > 0.45 ? "#101828" : "#ffffff";
};

// A soft, same-hue-adjacent border/muted colour so the note card still reads as
// a card on any background — derived from the chosen text colour.
export const getMutedText = (bgColor) => {
  const text = getContrastText(bgColor);
  return text === "#ffffff" ? "rgba(255,255,255,0.72)" : "rgba(16,24,40,0.6)";
};

// Validate a hex colour for persistence. Returns a normalised "#rrggbb" string
// or "" when the input isn't a usable hex colour.
export const normalizeHexColor = (value) => {
  const rgb = parseHex(value);
  if (!rgb) return "";
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};
