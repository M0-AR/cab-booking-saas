const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Never inject unvalidated strings into CSS (defense in depth: the API
 * validates too — see backend app/schemas/settings.py). */
export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim());
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function darken(hex: string, ratio = 0.16): string {
  const [r, g, b] = parseHex(hex);
  const f = (c: number) => clamp(c * (1 - ratio));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

export function readableOn(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0f172a" : "#ffffff";
}

/** Apply tenant brand to the document as CSS variables. */
export function applyBrand(brand: {
  primary_color?: string | null;
  accent_color?: string | null;
}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (isHex(brand.primary_color)) {
    root.style.setProperty("--brand", brand.primary_color.trim().toLowerCase());
    root.style.setProperty("--brand-hover", darken(brand.primary_color));
    root.style.setProperty(
      "--brand-fg",
      readableOn(brand.primary_color.trim().toLowerCase()),
    );
  }
  if (isHex(brand.accent_color)) {
    root.style.setProperty("--accent", brand.accent_color.trim().toLowerCase());
  }
}

export function resetBrand(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const name of ["--brand", "--brand-hover", "--brand-fg", "--accent"]) {
    root.style.removeProperty(name);
  }
}
