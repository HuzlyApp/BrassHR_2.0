"use client";

import { useEffect, useId, useState } from "react";

/** BrassHR gold baked into hire-journey SVGs. White, green, and gray strokes stay as drawn. */
const BRASS_GOLD = /#BC8B41/gi;

const rawSvgCache = new Map<string, string>();

function scopeSvgIds(svg: string, scope: string): string {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  let next = svg;
  for (const id of ids) {
    const scoped = `${id}-${scope}`;
    next = next.split(`id="${id}"`).join(`id="${scoped}"`);
    next = next.split(`url(#${id})`).join(`url(#${scoped})`);
    next = next.split(`href="#${id}"`).join(`href="#${scoped}"`);
  }
  return next;
}

const COMPLETION_GREEN = /#12AA00/gi;

function paintSvg(
  raw: string,
  width: number,
  height: number,
  scope: string,
  tint: string,
  tintGreen: boolean
): string {
  const colored = tintGreen ? raw.replace(BRASS_GOLD, tint).replace(COMPLETION_GREEN, tint) : raw.replace(BRASS_GOLD, tint);
  const tinted = scopeSvgIds(colored, scope);
  return tinted.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs.replace(/\swidth="[^"]*"/i, "").replace(/\sheight="[^"]*"/i, "");
    return `<svg${cleaned} width="${width}" height="${height}" style="display:block">`;
  });
}

/**
 * Inline hire-journey SVG with BrassHR gold replaced by the tenant primary color.
 * Multi-color marks (white checks, green status, gray locks) keep their original fills.
 */
export function BrandColoredSvg({
  src,
  width,
  height,
  alt = "",
  className,
  tint = "var(--brand-primary)",
  tintGreen = false,
}: {
  src: string;
  width: number;
  height: number;
  alt?: string;
  className?: string;
  tint?: string;
  tintGreen?: boolean;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let raw = rawSvgCache.get(src);
        if (!raw) {
          const response = await fetch(src);
          if (!response.ok) return;
          raw = await response.text();
          rawSvgCache.set(src, raw);
        }
        if (cancelled) return;
        setMarkup(paintSvg(raw, width, height, reactId, tint, tintGreen));
      } catch {
        if (!cancelled) setMarkup(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [src, width, height, reactId, tint, tintGreen]);

  return (
    <span
      className={`inline-block shrink-0 ${className ?? ""}`}
      style={{ width, height, lineHeight: 0 }}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
    />
  );
}
