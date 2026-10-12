import {
  buildBrassHrFirmaEmbedColorPalette,
  type FirmaEmbedColorPalette,
} from "@/lib/firma/embed-color-palette";

const DEFAULT_FIRMA_APP_URL = "https://app.firma.dev";

/** Same-origin path prefix; matches Firma SPA routes (`/signing/:recipientId`). */
export const FIRMA_SIGNING_EMBED_PATH_PREFIX = "/signing";

/** Same-origin asset proxy (Firma `/assets/*` bundles must not load cross-origin in the signing iframe). */
export const FIRMA_SIGNING_ASSETS_PATH_PREFIX = "/firma-signing-assets";

/** Client-safe Firma app URL (matches server `getFirmaEditorAppUrl` default). */
export function getFirmaSigningAppUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_FIRMA_EDITOR_APP_URL?.trim() ||
    process.env.FIRMA_EDITOR_APP_URL?.trim();
  return (fromEnv || DEFAULT_FIRMA_APP_URL).replace(/\/$/, "");
}

export function isFirmaSigningBrandingProxyEnabled(): boolean {
  const flag = (
    process.env.NEXT_PUBLIC_FIRMA_SIGNING_BRANDING_PROXY ??
    process.env.FIRMA_SIGNING_BRANDING_PROXY
  )
    ?.trim()
    .toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

/**
 * Rewrites `https://app.firma.dev/signing/{id}` to same-origin `/signing/{id}` so we can
 * inject a fetch patch before Firma's signing SPA loads (fixes stale teal color_palette).
 */
export function resolveFirmaSigningEmbedUrl(directUrl: string | null | undefined): string | null {
  const raw = directUrl?.trim();
  if (!raw) return null;
  if (!isFirmaSigningBrandingProxyEnabled()) return raw;

  const firmaApp = getFirmaSigningAppUrl();
  const match = raw.match(new RegExp(`^${escapeRegExp(firmaApp)}/signing/(.+)$`));
  if (!match?.[1]) return raw;

  const suffix = match[1].replace(/^\//, "");
  return `${FIRMA_SIGNING_EMBED_PATH_PREFIX}/${suffix}`;
}

/** Rewrites Firma-root `/assets/*` paths for same-origin signing proxy embeds. */
export function rewriteFirmaSigningAssetPath(url: string): string {
  if (!url.startsWith("/assets/")) return url;
  return `${FIRMA_SIGNING_ASSETS_PATH_PREFIX}${url.slice("/assets".length)}`;
}

/** Inline script injected into proxied Firma signing HTML before the SPA bundle runs. */
export function buildFirmaSigningBrandingInjectScript(
  palette: FirmaEmbedColorPalette = buildBrassHrFirmaEmbedColorPalette()
): string {
  const assetPrefix = FIRMA_SIGNING_ASSETS_PATH_PREFIX;
  return `(function(){var PALETTE=${JSON.stringify(palette)};var ASSET_PREFIX=${JSON.stringify(assetPrefix)};function rewriteAssetUrl(u){if(typeof u!=="string")return u;return u.indexOf("/assets/")===0?ASSET_PREFIX+u.slice(7):u;}function patchPalette(body){if(!body||typeof body!=="object")return body;if(body.color_palette)body.color_palette=PALETTE;return body;}var OrigWorker=window.Worker;if(OrigWorker){var PatchedWorker=function(u,o){return new OrigWorker(rewriteAssetUrl(String(u)),o);};PatchedWorker.prototype=OrigWorker.prototype;window.Worker=PatchedWorker;}var origFetch=window.fetch;window.fetch=function(input,init){if(typeof input==="string"){input=rewriteAssetUrl(input);}else if(input&&input.url){var ru=rewriteAssetUrl(input.url);if(ru!==input.url)input=new Request(ru,input);}return origFetch.call(this,input,init).then(function(res){try{var url=typeof input==="string"?input:input&&input.url?input.url:String(input);if(!url||url.indexOf("get-signing-view-data")===-1)return res;return res.clone().json().then(function(json){patchPalette(json);var headers=new Headers(res.headers);headers.set("content-type","application/json");return new Response(JSON.stringify(json),{status:res.status,statusText:res.statusText,headers:headers});}).catch(function(){return res;});}catch(e){return res;}});};})();(function(){var notified=false;function notifyComplete(){if(notified)return;notified=true;try{window.parent.postMessage({type:"signing.completed"},window.location.origin);}catch(e){}}function check(){try{if(/\\/signing\\/[^/?#]+\\/complete\\/?$/.test(location.pathname))notifyComplete();}catch(e){}}var push=history.pushState;history.pushState=function(){var r=push.apply(this,arguments);check();return r;};var replace=history.replaceState;history.replaceState=function(){var r=replace.apply(this,arguments);check();return r;};window.addEventListener("popstate",check);setInterval(check,400);check();})();(function(){try{var style=document.createElement("style");style.textContent="html, body { background-color: #1a1d24 !important; margin: 0; padding: 0; overflow-x: hidden; } ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: #1a1d24; } ::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }";(document.head||document.documentElement).appendChild(style);}catch(e){}var MAX_ZOOM=220;var userInteracted=false;function markInteracted(){userInteracted=true;}window.addEventListener("pointerdown",function(e){if(e.target&&(e.target.closest('input[type="range"]')||e.target.closest("button"))){markInteracted();}},true);window.addEventListener("keydown",markInteracted,true);function clampInitialZoom(){if(userInteracted)return;var range=document.querySelector('input[type="range"]');if(!range)return;var val=parseFloat(range.value);if(!isNaN(val)&&val>MAX_ZOOM){try{var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value");if(setter&&setter.set){setter.set.call(range,MAX_ZOOM);}else{range.value=MAX_ZOOM;}range.dispatchEvent(new Event("input",{bubbles:true}));range.dispatchEvent(new Event("change",{bubbles:true}));}catch(e){}}}var count=0;var interval=setInterval(function(){clampInitialZoom();count++;if(count>25)clearInterval(interval);},200);if(document.body){var obs=new MutationObserver(clampInitialZoom);obs.observe(document.body,{childList:true,subtree:true});setTimeout(function(){obs.disconnect();},5000);}})();`;
}

/** Rewrite Firma signing HTML so assets load same-origin and branding patch runs first. */
export function rewriteFirmaSigningProxyHtml(
  html: string,
  palette?: FirmaEmbedColorPalette
): string {
  const script = buildFirmaSigningBrandingInjectScript(palette);
  const assetPrefix = FIRMA_SIGNING_ASSETS_PATH_PREFIX;

  let out = html.replace(/\ssrc="\/assets\//g, ` src="${assetPrefix}/`);
  out = out.replace(/\shref="\/assets\//g, ` href="${assetPrefix}/`);
  // Same-origin module scripts must not use crossorigin (Firma CDN sends no ACAO header).
  out = out.replace(/\s+crossorigin/g, "");

  const injection = `<script>${script}</script>`;
  if (out.includes("<head>")) {
    return out.replace("<head>", `<head>${injection}`);
  }
  return injection + out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
