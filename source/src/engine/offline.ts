/**
 * OFFLINE PLAY AND UPDATES
 * ------------------------
 * When Blockfell is served from a web address (GitHub Pages, say) it registers a
 * small service worker (public/sw.js) that keeps a copy of the page, so the game
 * starts with no connection - a Home Screen app on an iPad on a plane. The copy is
 * only replaced when this page finds a newer build: it fetches the page quietly
 * now and then, compares the build id stamped into it with its own, stores the new
 * page in the cache and shows "Restart to update". The next start uses the new
 * page anyway. Nothing of this runs from a file (Blockfell.html), in the dev
 * server, or inside another page (the claude.ai viewer).
 */
import { ui, pushToast } from '../ui/uiStore';

declare const __BUILD_ID__: string;
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
const CACHE = 'blockfell-page-v1';   // same name as in public/sw.js
const CHECK_EVERY = 30 * 60 * 1000;

let lastCheck = 0;
let checking = false;

function servedFromWeb(): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || typeof caches === 'undefined') return false;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol !== 'https:' && !(location.protocol === 'http:' && local)) return false;
  try { if (window.top !== window) return false; } catch { return false; }
  return true;
}

/** The page's own address as the service worker stores it (the folder, not index.html). */
function pageUrl(): string {
  return new URL('./', location.href).href;
}

export function setupOffline(): void {
  if (!import.meta.env.PROD || !servedFromWeb()) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* no offline copy: still playable online */ });
  setTimeout(() => void checkForUpdate(), 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkForUpdate(); });
  window.addEventListener('online', () => void checkForUpdate(true));
}

/** Looks for a newer build; returns its version if one was found and stored. */
export async function checkForUpdate(force = false): Promise<string | null> {
  if (!servedFromWeb() || checking || !navigator.onLine) return null;
  if (!force && Date.now() - lastCheck < CHECK_EVERY) return null;
  checking = true;
  lastCheck = Date.now();
  try {
    const res = await fetch(pageUrl(), { cache: 'no-store' });
    if (!res.ok) return null;
    const html = await res.text();
    const build = /<meta name="blockfell-build" content="([^"]*)"/.exec(html)?.[1];
    if (!build || build === BUILD_ID) return null;
    const version = /<meta name="blockfell-version" content="([^"]*)"/.exec(html)?.[1] ?? '';
    const cache = await caches.open(CACHE);
    await cache.put(pageUrl(), new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    const first = !ui.get().update;
    ui.set({ update: { version } });
    // 2.0.1: in a world the title-screen banner isn't seen (a Home Screen app that reopens its
    // last world may never show the title), so say so here; the pause menu offers Save and Update
    if (first && ui.get().screen === 'game') {
      pushToast({ kind: 'info', icon: 'chest', title: version ? `Blockfell ${version} is ready` : 'A new Blockfell is ready', desc: 'Menu: Save and Update' });
    }
    return version;
  } catch {
    return null;
  } finally {
    checking = false;
  }
}

/** Starts the new version (the menus only offer this: a world in play is saved first, never interrupted). */
export function restartForUpdate(): void {
  location.reload();
}
