import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import { App } from './App';
import { engine } from './engine/Engine';
import { buildUiAssets } from './ui/uiAssets';
import { exposeTestApi } from './testApi';
import { setupOffline } from './engine/offline';

/** Icon used when Blockfell is added to a phone's or tablet's Home Screen: a grass block. */
function addHomeScreenIcon(): void {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#101014';
    ctx.fillRect(0, 0, 180, 180);
    ctx.drawImage(engine.renderer.atlas.tileCanvas('grass_side', 1), 10, 10, 160, 160);
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.href = c.toDataURL('image/png');
    document.head.appendChild(link);
  } catch { /* not important */ }
}

async function boot(): Promise<void> {
  const root = document.getElementById('root')!;
  const gameLayer = document.createElement('div');
  gameLayer.id = 'game-layer';
  document.body.insertBefore(gameLayer, root);
  // the logo is drawn with the game's own pixel font, so wait for it
  try { await document.fonts.load('8px Blockfell'); } catch { /* fallback font */ }
  engine.init(gameLayer);
  buildUiAssets(engine.renderer.atlas);
  addHomeScreenIcon();
  exposeTestApi();
  createRoot(root).render(<App />);
  setupOffline();
  let benchStarted = false;
  const maybeBench = async () => {
    if (benchStarted || location.hash !== '#bench') return;
    benchStarted = true;
    const { runBenchmark } = await import('./bench');
    setTimeout(() => void runBenchmark(), 1500);
  };
  window.addEventListener('hashchange', () => void maybeBench());
  void maybeBench();
}

void boot();
