/** Firma signing UI is laid out for a ~1080px desktop viewport. */
export const FIRMA_SIGNING_DESKTOP_WIDTH = 1080;
export const FIRMA_SIGNING_DESKTOP_HEIGHT = 1080;

/**
 * Below this viewport width, embed Firma at 100% with no CSS scale.
 * Native fill keeps header/footer readable on phones (scaled desktop chrome gets tiny).
 */
export const FIRMA_NATIVE_EMBED_MAX_WIDTH = 639;

/**
 * Firma signature-style modal stacks Confirm/Cancel below this CSS width.
 * Applied only on scaled tablet embeds (not native phones).
 */
export const FIRMA_MIN_CSS_WIDTH_FOR_ROW_ACTIONS = 720;

/** Smaller virtual canvas → controls read larger once scaled into tablet/desktop viewports. */
export function resolveFirmaEmbedUiBoost(viewportWidth: number): number {
  if (viewportWidth < 400) return 1.75;
  if (viewportWidth < 640) return 1.65;
  if (viewportWidth < 1024) return 1.4;
  return 1.3;
}

/**
 * Virtual iframe canvas size for scaled embeds.
 * When container size is known, match its aspect ratio so the scaled UI fills the shell.
 */
export function resolveFirmaEmbedDimensions(
  viewportWidth: number,
  availableWidth?: number,
  availableHeight?: number
): {
  width: number;
  height: number;
} {
  const boost = resolveFirmaEmbedUiBoost(viewportWidth);
  let width = Math.round(FIRMA_SIGNING_DESKTOP_WIDTH / boost);

  // Tablet scaled embeds: keep Confirm/Cancel on one row.
  if (viewportWidth >= 640 && viewportWidth < 1024) {
    width = Math.max(width, FIRMA_MIN_CSS_WIDTH_FOR_ROW_ACTIONS);
  }

  if (
    typeof availableWidth === "number" &&
    typeof availableHeight === "number" &&
    availableWidth > 0 &&
    availableHeight > 0
  ) {
    const aspect = availableWidth / availableHeight;
    return {
      width,
      height: Math.max(Math.round(width / aspect), Math.round(width * 0.85)),
    };
  }

  return {
    width,
    height: Math.round(FIRMA_SIGNING_DESKTOP_HEIGHT / boost),
  };
}

export const FIRMA_EMBED_MIN_SCALE = 0.38;
export const FIRMA_EMBED_MAX_SCALE = 2;
export const FIRMA_EMBED_MOBILE_MAX_SCALE = 1.08;

export function computeFirmaEmbedScale(
  availableWidth: number,
  availableHeight: number,
  embedWidth: number,
  embedHeight: number,
  options?: { maxScale?: number }
): number {
  if (availableWidth <= 0 || availableHeight <= 0 || embedWidth <= 0 || embedHeight <= 0) {
    return FIRMA_EMBED_MAX_SCALE;
  }

  const maxScale = options?.maxScale ?? FIRMA_EMBED_MAX_SCALE;
  const widthScale = availableWidth / embedWidth;
  const heightScale = availableHeight / embedHeight;
  const fitScale = Math.min(widthScale, heightScale, maxScale);

  return Math.max(FIRMA_EMBED_MIN_SCALE, fitScale);
}
