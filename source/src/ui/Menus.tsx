import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { engine } from '../engine/Engine';
import { useStore } from '../core/store';
import { ui, pushToast } from './uiStore';
import { Button, Title } from './widgets';
import { hudIcons } from './uiAssets';
import type { WorldRecord, GameRules, WorldArchive } from '../systems/SaveManager';
import { DEFAULT_RULES } from '../systems/SaveManager';
import type { Difficulty, GameMode } from '../player/Player';
import { GAME_VERSION } from '../world/constants';
import { restartForUpdate, checkForUpdate } from '../engine/offline';
import { CloudSync } from '../systems/CloudSync';
import {
  backups, embedded, createBackup, downloadBlob, backupFileName, readBackup, importBackup, pickBackupFile,
  type BackupEntry, type BackupFile,
} from '../systems/WorldBackup';

const SPLASHES = [
  'Now with greedy meshing!', 'Made of 100% voxels!', 'Seeded and deterministic!', 'Punch a tree!',
  'Dig responsibly!', 'Sixteen by sixteen!', 'Mind the drop!', 'Torch your caves!', 'Ask the Bone Archer!',
  'Chunk by chunk!', 'Original pixels!', 'Now in your browser!',
];

export function TitleScreen() {
  const splash = useMemo(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)], []);
  // phones in landscape are short: a smaller logo keeps every button clear of the footer
  const gui = useStore(ui, (st) => st.gui);
  const short = window.innerHeight / gui < 230;
  const scale = short ? 0.72 : 1;
  // Continue: straight back into the world played last
  const version = useStore(ui, (st) => st.worldsVersion);
  const [last, setLast] = useState<WorldRecord | null>(null);
  useEffect(() => {
    let live = true;
    void engine.lastWorld().then((w) => { if (live) setLast(w); });
    return () => { live = false; };
  }, [version]);
  return (
    <div className="screen" data-testid="title-screen">
      <div className="logo-wrap" style={{ width: `${hudIcons.logoW * scale}rem`, height: `${hudIcons.logoH * scale}rem`, marginTop: short ? '12rem' : undefined }}>
        <img src={hudIcons.logo} alt="Blockfell" style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />
        <div className="splash" style={short ? { fontSize: '6rem', lineHeight: '8rem' } : undefined}>{splash}</div>
      </div>
      <div className="col" style={{ marginTop: short ? '14rem' : '30rem' }}>
        {last && (
          <Button testId="btn-continue" title={`Carry on in '${last.name}'`} onClick={() => void engine.playWorld(last.id)}>
            <span className="continue-label">Continue: {last.name}</span>
          </Button>
        )}
        <Button testId="btn-singleplayer" onClick={() => ui.set({ screen: 'worlds', selectedWorld: last?.id ?? null })}>Singleplayer</Button>
        {!last && <Button disabled title="Multiplayer is not available in this version">Multiplayer (unavailable)</Button>}
        <div style={{ height: '8rem' }} />
        <div className="row">
          <Button size="half" onClick={() => ui.set({ screen: 'options', optionsReturn: 'title' })}>Options...</Button>
          <Button size="half" onClick={() => engine.quitGame()}>Quit Game</Button>
        </div>
      </div>
      <div className="version shadow">Blockfell {GAME_VERSION}</div>
      <div className="copyright shadow">Original assets. Not affiliated with Mojang.</div>
      <UpdateBanner />
    </div>
  );
}

/** "A new version is ready": shown on the title screen and the world list only, never over a world in play. */
export function UpdateBanner() {
  const upd = useStore(ui, (s) => s.update);
  if (!upd) return null;
  return (
    <div className="update-banner shadow" data-testid="update-banner">
      <span>{upd.version ? `Blockfell ${upd.version} is ready` : 'A new version of Blockfell is ready'}</span>
      <Button size="third" testId="btn-restart-update" onClick={restartForUpdate}>Restart</Button>
    </div>
  );
}

function formatDate(t: number, seconds = false): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}${seconds ? ':' + p(d.getSeconds()) : ''}`;
}

export function WorldSelect() {
  const version = useStore(ui, (s) => s.worldsVersion);
  const selected = useStore(ui, (s) => s.selectedWorld);
  const cloud = useStore(ui, (s) => s.cloud);
  const prompt = useStore(ui, (s) => s.syncPrompt);
  const [worlds, setWorlds] = useState<WorldRecord[] | null>(null);
  const [filter, setFilter] = useState('');
  const [confirm, setConfirm] = useState<WorldRecord | null>(null);
  const [deleting, setDeleting] = useState('');
  const lastClick = useRef({ id: '', t: 0 });
  // opening the world list syncs with Dropbox: worlds played on other devices come in
  useEffect(() => { void engine.cloud.syncAll(); }, []);

  useEffect(() => {
    let live = true;
    void engine.listWorlds().then((w) => {
      if (!live) return;
      setWorlds(w);
      // the world played last is ready to go: Play Selected World is one tap
      const cur = ui.get().selectedWorld;
      if ((!cur || !w.some((x) => x.id === cur)) && w.length) ui.set({ selectedWorld: w[0].id });
    });
    return () => { live = false; };
  }, [version]);

  const sel = worlds?.find((w) => w.id === selected) ?? null;
  const shown = (worlds ?? []).filter((w) => w.name.toLowerCase().includes(filter.toLowerCase()));
  useEffect(() => { document.querySelector('.world-entry.selected')?.scrollIntoView({ block: 'nearest' }); }, [worlds]);

  if (prompt) return <SyncPrompt id={prompt.id} kind={prompt.kind} />;

  if (confirm) {
    const inDropbox = cloud.linked && !!engine.cloud.state(confirm.id)?.rev && !engine.cloud.state(confirm.id)?.gone;
    const del = async (everywhere: boolean) => {
      setDeleting('');
      try {
        await engine.deleteWorld(confirm.id, everywhere);
        setConfirm(null);
      } catch (e) {
        setDeleting(`Could not delete it from Dropbox: ${errText(e)}. Nothing was deleted.`);
      }
    };
    return (
      <div className="screen dirt-bg" style={{ justifyContent: 'center', gap: '8rem' }} data-testid="delete-confirm">
        <Title>Are you sure you want to delete this world?</Title>
        {inDropbox ? (
          <div className="gray" style={{ maxWidth: '320rem', textAlign: 'center', whiteSpace: 'normal' }}>
            '{confirm.name}' is also in your Dropbox. Delete Here Only keeps the Dropbox copy (it comes back if it is played on another device).
            Delete Everywhere removes it from Dropbox too (Dropbox keeps deleted files for a while).
          </div>
        ) : <Title><span className="gray">'{confirm.name}' will be lost forever! (A long time!)</span></Title>}
        {deleting && <div className="yellow" style={{ maxWidth: '320rem', textAlign: 'center', whiteSpace: 'normal' }}>{deleting}</div>}
        {inDropbox ? (
          <>
            <div className="row" style={{ marginTop: '20rem' }}>
              <Button size="small" testId="btn-confirm-delete" onClick={() => void del(false)}>Delete Here Only</Button>
              <Button size="small" testId="btn-delete-everywhere" onClick={() => void del(true)}>Delete Everywhere</Button>
            </div>
            <Button size="small" onClick={() => { setConfirm(null); setDeleting(''); }}>Cancel</Button>
          </>
        ) : (
          <div className="row" style={{ marginTop: '20rem' }}>
            <Button size="small" testId="btn-confirm-delete" onClick={() => void del(false)}>Delete</Button>
            <Button size="small" onClick={() => { setConfirm(null); setDeleting(''); }}>Cancel</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen" data-testid="world-select">
      <UpdateBanner />
      <div className="menu-header" style={{ flexDirection: 'column', height: '44rem', gap: '4rem', paddingTop: '6rem' }}>
        <Title>Select World</Title>
        <input className="field" placeholder="Search..." value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: '200rem' }} />
      </div>
      <div className="list-area">
        {worlds === null && <div className="gray" style={{ marginTop: '20rem' }}>Loading...</div>}
        {worlds !== null && shown.length === 0 && <div className="gray" style={{ marginTop: '20rem' }}>{worlds.length ? 'No matching worlds' : 'No worlds yet - create one!'}</div>}
        {shown.map((w) => (
          <div
            key={w.id}
            className={'world-entry' + (w.id === selected ? ' selected' : '') + (cloud.worlds[w.id] ? ' with-cloud' : '')}
            data-testid="world-entry"
            onClick={() => {
              const now = Date.now();
              if (lastClick.current.id === w.id && now - lastClick.current.t < 350) void engine.playWorld(w.id);
              lastClick.current = { id: w.id, t: now };
              ui.set({ selectedWorld: w.id });
            }}
          >
            <div className="thumb" style={{ backgroundImage: `url(${hudIcons.grassThumb})` }} />
            <div className="meta">
              <div>{w.name}</div>
              <div className="gray">{formatDate(w.lastPlayed)}</div>
              <div className="gray">{w.gameMode === 'creative' ? 'Creative' : 'Survival'} Mode, {cap(w.difficulty)}, v{w.version}</div>
              {cloud.worlds[w.id] && (
                <div className={'cloud-line ' + (cloud.worlds[w.id].warn ? 'warn' : cloud.worlds[w.id].kind)} data-testid="cloud-status">{cloud.worlds[w.id].text}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="menu-footer">
        {cloud.linked || cloud.relink
          ? <div className="tip" data-testid="cloud-summary" style={{ textAlign: 'center', color: cloud.relink || cloud.message ? '#ffcc55' : undefined }}>{CloudSync.summary(cloud)}</div>
          : sel && !embedded && <BackupNote w={sel} />}
        <div className="row">
          <Button size="small" testId="btn-play-selected" disabled={!sel} onClick={() => sel && void engine.playWorld(sel.id)}>Play Selected World</Button>
          <Button size="small" testId="btn-create-new" onClick={() => ui.set({ screen: 'create' })}>Create New World</Button>
        </div>
        <div className="row">
          <Button size="third" testId="btn-edit-world" disabled={!sel} onClick={() => sel && ui.set({ screen: 'edit', editWorld: sel.id })}>Edit</Button>
          <Button size="third" testId="btn-delete-world" disabled={!sel} onClick={() => sel && setConfirm(sel)}>Delete</Button>
          <Button size="third" disabled={!sel} onClick={() => sel && recreate(sel)}>Re-Create</Button>
          <Button size="third" onClick={() => ui.set({ screen: 'title' })}>Cancel</Button>
        </div>
        <div className="row">
          <Button size="half" testId="btn-export-world" disabled={!sel} onClick={() => sel && void exportWorld(sel)}
            title={backups.supported ? 'Save a backup of this world into your backup folder' : 'Download a backup file of this world'}>Export World</Button>
          <Button size="half" testId="btn-import-world" onClick={() => ui.set({ screen: 'import' })}>Import World...</Button>
          <Button size="half" testId="btn-dropbox" title="Keep your worlds in Dropbox and play them on your other devices"
            onClick={() => ui.set({ screen: 'cloud', cloudReturn: 'worlds' })}>Dropbox...</Button>
        </div>
      </div>
    </div>
  );
}

/** How long ago, in words ("today", "yesterday", "12 days ago"). */
function ago(t: number): string {
  const days = Math.floor((Date.now() - t) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * Backup reminder for the selected world. On an iPad nothing is backed up by
 * itself, and deleting the Home Screen icon deletes its worlds, so a world that
 * has been played since its last export (or never exported) gets a nudge after a week.
 */
function BackupNote({ w }: { w: WorldRecord }) {
  const b = w.lastBackup;
  const stale = !b || (w.lastPlayed > b + 60000 && Date.now() - b > 7 * 86400000);
  const text = b ? `Last backup ${ago(b)}` : 'Not backed up yet';
  return (
    <div className="tip" data-testid="backup-note" style={{ color: stale ? '#ffcc55' : undefined, textAlign: 'center' }}>
      {text}{stale ? ' - use Export World to keep a copy' : ''}
    </div>
  );
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Export: into the remembered folder where supported, otherwise a normal download. */
async function exportWorld(w: WorldRecord): Promise<void> {
  if (embedded) {
    pushToast({ kind: 'info', icon: 'bedrock', title: 'Export not available here', desc: 'Open Blockfell.html in Chrome or Edge' });
    return;
  }
  try {
    if (backups.supported) {
      const first = !backups.handle;
      if (first) { if (!(await backups.choose())) return; }
      else if (!(await backups.permission(true))) {
        pushToast({ kind: 'info', icon: 'bedrock', title: 'Not exported', desc: `No permission for ${backups.folderName}` });
        return;
      }
      const file = await backups.exportWorld(w.id);
      await engine.markBackedUp(w.id);
      pushToast({ kind: 'info', icon: 'chest', title: 'World exported', desc: `${backups.folderName}/${file}` });
      if (first && backups.autoBackup) pushToast({ kind: 'info', icon: 'chest', title: 'Auto backup is on', desc: 'Worlds back up on Save and Quit' });
    } else {
      const { blob, backup } = await createBackup(engine.saves, w.id);
      downloadBlob(blob, backupFileName(backup.world.name));
      await engine.markBackedUp(w.id);
      pushToast({ kind: 'info', icon: 'chest', title: 'World exported', desc: 'Saved to your Downloads folder' });
    }
  } catch (e) {
    console.warn('export failed', e);
    pushToast({ kind: 'info', icon: 'bedrock', title: 'Export failed', desc: errText(e) });
  }
}

type FolderState = 'loading' | 'unsupported' | 'nofolder' | 'needperm' | 'ready';

/** Import World: lists the backups in the backup folder, or imports any .blockfell file. */
export function ImportWorld() {
  const [state, setState] = useState<FolderState>('loading');
  const [entries, setEntries] = useState<BackupEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ b: BackupFile; local: WorldRecord } | null>(null);
  const [auto, setAuto] = useState(backups.autoBackup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async (request = false) => {
    setError('');
    if (!backups.supported) { setState('unsupported'); return; }
    if (!backups.handle) { setState('nofolder'); return; }
    if (!(await backups.permission(request))) { setState('needperm'); return; }
    try {
      const list = await backups.list();
      setEntries(list);
      setState('ready');
    } catch (e) {
      setError(`Could not open ${backups.folderName}: ${errText(e)}`);
      setState('nofolder');
    }
  };
  useEffect(() => { void refresh(false); }, []);

  const back = () => ui.set((s) => ({ screen: 'worlds', worldsVersion: s.worldsVersion + 1 }));
  const finish = async (b: BackupFile, mode: 'replace' | 'copy') => {
    setBusy(true);
    try {
      const id = await importBackup(engine.saves, b, mode);
      engine.cloud.markDirty(id);
      pushToast({ kind: 'info', icon: 'chest', title: 'World imported', desc: b.world.name });
      ui.set((s) => ({ screen: 'worlds', selectedWorld: id, worldsVersion: s.worldsVersion + 1 }));
    } catch (e) {
      setError(`Import failed: ${errText(e)}`);
      setConflict(null);
    } finally { setBusy(false); }
  };
  const start = async (b: BackupFile) => {
    const local = await engine.saves.getWorld(b.world.id);
    if (local) setConflict({ b, local });
    else await finish(b, 'replace');
  };
  const fromFile = async () => {
    const f = await pickBackupFile();
    if (!f) return;
    try { await start(await readBackup(f)); } catch (e) { setError(`${f.name}: ${errText(e)}`); }
  };
  const choose = async () => {
    try { if (await backups.choose()) await refresh(true); } catch (e) { setError(errText(e)); }
  };

  if (conflict) {
    const { b, local } = conflict;
    const newer = local.lastPlayed > b.world.lastPlayed;
    return (
      <div className="screen dirt-bg" style={{ justifyContent: 'center', gap: '6rem' }} data-testid="import-conflict">
        <Title>This world is already on this computer</Title>
        <div className="gray">On this computer: '{local.name}', last played {formatDate(local.lastPlayed)}</div>
        <div className="gray">In the backup: '{b.world.name}', last played {formatDate(b.world.lastPlayed)}</div>
        {newer && <div className="yellow" style={{ maxWidth: '300rem', textAlign: 'center' }}>The copy on this computer has been played since this backup was made.</div>}
        <div className="row" style={{ marginTop: '14rem' }}>
          <Button size="small" testId="btn-import-replace" disabled={busy} onClick={() => void finish(b, 'replace')}>Replace with Backup</Button>
          <Button size="small" testId="btn-import-copy" disabled={busy} onClick={() => void finish(b, 'copy')}>Keep Both</Button>
        </div>
        <Button size="small" onClick={() => setConflict(null)}>Cancel</Button>
      </div>
    );
  }

  const sel = entries.find((e) => e.fileName === selected) ?? null;
  const folder = backups.folderName;
  const message = (() => {
    switch (state) {
      case 'loading': return 'Loading...';
      case 'unsupported': return embedded
        ? 'Backups to a folder are not available inside this page. Open Blockfell.html in Chrome or Edge to export and import worlds. You can still try Import From File... below.'
        : 'This browser cannot open a folder directly. Use Import From File... and choose a .blockfell file, for example from Dropbox > MineCraft. Exported worlds are saved to your Downloads folder.';
      case 'nofolder': return 'Choose the folder where you keep your Blockfell backups, for example Dropbox > MineCraft. Exported worlds are saved there, and every world is backed up there on Save and Quit.';
      case 'needperm': return `Blockfell needs your permission to open the folder '${folder}'.`;
      default: return entries.length ? '' : `No backups in '${folder}' yet. Select a world and press Export World.`;
    }
  })();

  return (
    <div className="screen" data-testid="import-world">
      <div className="menu-header" style={{ flexDirection: 'column', height: '40rem', gap: '3rem', paddingTop: '6rem' }}>
        <Title>Import World</Title>
        <div className="shadow">{state === 'unsupported' ? 'From a backup file' : folder ? `Backup folder: ${folder}` : 'No backup folder chosen'}</div>
      </div>
      <div className="list-area">
        {message && <div className="gray" style={{ marginTop: '14rem', maxWidth: '300rem', textAlign: 'center', whiteSpace: 'normal' }}>{message}</div>}
        {state === 'needperm' && <div style={{ marginTop: '8rem' }}><Button size="small" testId="btn-allow-folder" onClick={() => void refresh(true)}>Allow Access</Button></div>}
        {state === 'ready' && entries.map((e) => (
          <div key={e.fileName} data-testid="backup-entry"
            className={'world-entry' + (e.fileName === selected ? ' selected' : '')}
            onClick={() => setSelected(e.fileName)}
            onDoubleClick={() => e.backup && void start(e.backup)}>
            <div className="thumb" style={{ backgroundImage: `url(${hudIcons.grassThumb})`, opacity: e.backup ? 1 : 0.4 }} />
            <div className="meta">
              <div>{e.backup ? e.backup.world.name : e.fileName}</div>
              <div className="gray">{e.backup ? `Backed up ${formatDate(e.backup.exported)}` : `Can't read this file: ${e.error ?? ''}`}</div>
              <div className="gray">{e.backup ? `${e.backup.world.gameMode === 'creative' ? 'Creative' : 'Survival'} Mode, ${cap(e.backup.world.difficulty)} · ${Math.max(1, Math.round(e.size / 1024))} KB` : ''}</div>
            </div>
          </div>
        ))}
        {error && <div className="yellow" style={{ marginTop: '8rem', maxWidth: '300rem', textAlign: 'center', whiteSpace: 'normal' }} data-testid="import-error">{error}</div>}
      </div>
      <div className="menu-footer">
        <div className="row">
          <Button size="small" testId="btn-import-selected" disabled={!sel?.backup || busy} onClick={() => sel?.backup && void start(sel.backup)}>Import Selected</Button>
          <Button size="small" testId="btn-import-file" disabled={busy} onClick={() => void fromFile()}>Import From File...</Button>
        </div>
        <div className="row">
          {state !== 'unsupported' && <Button size="half" testId="btn-choose-folder" onClick={() => void choose()}>{folder ? 'Change Folder...' : 'Choose Folder...'}</Button>}
          {state !== 'unsupported' && (
            <Button size="half" testId="btn-auto-backup" title="Back up each world to this folder when you Save and Quit"
              onClick={() => { void backups.setAutoBackup(!auto); setAuto(!auto); }}>Auto Backup: {auto ? 'ON' : 'OFF'}</Button>
          )}
          <Button size="half" onClick={back}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

let recreateFrom: WorldRecord | null = null;
function recreate(w: WorldRecord): void {
  recreateFrom = w;
  ui.set({ screen: 'create' });
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

const MODE_DESC: Record<GameMode, string> = {
  survival: 'Search for resources, craft, gain levels, health and hunger',
  creative: 'Unlimited resources, free flying and destroy blocks instantly',
};
const DIFFS: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];

export function CreateWorld() {
  const src = recreateFrom;
  const [name, setName] = useState(src ? src.name + ' (copy)' : 'New World');
  const [mode, setMode] = useState<GameMode>(src?.gameMode ?? 'survival');
  const [diff, setDiff] = useState<Difficulty>(src?.difficulty ?? 'normal');
  const [seed, setSeed] = useState(src ? String(src.seed) : '');
  const [structures, setStructures] = useState(src?.structures ?? true);
  const [bonus, setBonus] = useState(src?.bonusChest ?? false);
  const [rules, setRules] = useState<GameRules>({ ...DEFAULT_RULES, ...(src?.rules ?? {}) });
  const [showRules, setShowRules] = useState(false);
  useEffect(() => () => { recreateFrom = null; }, []);

  if (showRules) {
    const entries: [keyof GameRules, string][] = [
      ['keepInventory', 'Keep inventory after death'],
      ['doDaylightCycle', 'Advance time of day'],
      ['doMobSpawning', 'Spawn creatures'],
      ['naturalRegeneration', 'Natural health regeneration'],
      ['doWeatherCycle', 'Weather changes'],
    ];
    return (
      <div className="screen dirt-bg">
        <div className="menu-header"><Title>Game Rules</Title></div>
        <div className="col" style={{ flex: 1, justifyContent: 'center' }}>
          {entries.map(([k, label]) => (
            <div key={k} className="row" style={{ alignItems: 'center', width: '310rem', justifyContent: 'space-between' }}>
              <span className="shadow">{label}</span>
              <Button size="third" onClick={() => setRules({ ...rules, [k]: !rules[k] })}>{rules[k] ? 'ON' : 'OFF'}</Button>
            </div>
          ))}
        </div>
        <div className="menu-footer"><Button onClick={() => setShowRules(false)}>Done</Button></div>
      </div>
    );
  }

  return (
    <div className="screen dirt-bg" data-testid="create-world">
      <div className="menu-header" style={{ height: '26rem' }}><Title>Create New World</Title></div>
      <div className="col" style={{ flex: 1, gap: '4rem', overflowY: 'auto', width: '100%' }}>
        <div className="col" style={{ gap: '2rem', alignItems: 'flex-start' }}>
          <span className="shadow gray">World Name</span>
          <input className="field" data-testid="world-name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button testId="btn-gamemode" onClick={() => setMode(mode === 'survival' ? 'creative' : 'survival')}>Game Mode: {cap(mode)}</Button>
        <div className="gray" style={{ textAlign: 'center', width: '380rem' }}>{MODE_DESC[mode]}</div>
        <Button testId="btn-difficulty" onClick={() => setDiff(DIFFS[(DIFFS.indexOf(diff) + 1) % 4])}>Difficulty: {cap(diff)}</Button>
        <div className="col" style={{ gap: '2rem', alignItems: 'flex-start' }}>
          <span className="shadow gray">Seed for the World Generator</span>
          <input className="field" data-testid="world-seed" value={seed} placeholder="Leave blank for a random seed" onChange={(e) => setSeed(e.target.value)} />
        </div>
        <div className="row">
          <Button size="half" title="Villages, and abandoned ruins with loot chests" onClick={() => setStructures(!structures)}>Structures: {structures ? 'ON' : 'OFF'}</Button>
          <Button size="half" onClick={() => setBonus(!bonus)}>Bonus Chest: {bonus ? 'ON' : 'OFF'}</Button>
        </div>
        <Button onClick={() => setShowRules(true)}>Game Rules...</Button>
      </div>
      <div className="menu-footer">
        <div className="row">
          <Button size="small" testId="btn-create-world" onClick={() => void engine.createWorld({
            name, seedText: seed, gameMode: mode, difficulty: diff, structures, bonusChest: bonus, rules,
          })}>Create New World</Button>
          <Button size="small" onClick={() => ui.set({ screen: 'worlds' })}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function EditWorld() {
  const id = useStore(ui, (s) => s.editWorld);
  const [rec, setRec] = useState<WorldRecord | null>(null);
  const [name, setName] = useState('');
  const [archive, setArchive] = useState<WorldArchive | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (id) void engine.saves.getWorld(id).then((r) => { if (r) { setRec(r); setName(r.name); } });
    if (id) void engine.saves.getArchive(id).then((a) => setArchive(a ?? null)).catch(() => setArchive(null));
  }, [id]);
  if (!rec) return <div className="screen dirt-bg" />;
  const back = () => ui.set((s) => ({ screen: 'worlds', worldsVersion: s.worldsVersion + 1 }));
  return (
    <div className="screen dirt-bg">
      <div className="menu-header"><Title>Edit World</Title></div>
      <div className="col" style={{ flex: 1, gap: '6rem', justifyContent: 'center' }}>
        <div className="col" style={{ gap: '2rem', alignItems: 'flex-start' }}>
          <span className="shadow gray">World Name</span>
          <input className="field" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="gray">Seed: {rec.seed}</div>
        <div className="gray">Created {formatDate(rec.created)} · {Object.keys(rec.stats ?? {}).length ? 'played' : 'never played'}</div>
        <Button onClick={async () => {
          const nid = 'w' + Date.now().toString(36);
          await engine.saves.duplicate(rec, nid, rec.name + ' (backup)');
          back();
        }}>Make Backup Copy</Button>
        {archive && (
          <>
            <Button testId="btn-restore-archive" disabled={restoring} onClick={async () => {
              setRestoring(true);
              try {
                const b = await readBackup(new Blob([archive.bytes as BlobPart]));
                const nid = await importBackup(engine.saves, b, 'copy', { name: `${rec.name} (before 1.10)` });
                engine.cloud.markDirty(nid);
                pushToast({ kind: 'info', icon: 'chest', title: 'Old copy restored', desc: `As it was in Blockfell ${archive.gameVersion}` });
                ui.set((s) => ({ screen: 'worlds', selectedWorld: nid, worldsVersion: s.worldsVersion + 1 }));
              } catch (e) {
                pushToast({ kind: 'info', icon: 'bedrock', title: 'Could not restore', desc: errText(e) });
                setRestoring(false);
              }
            }}>Restore Pre-1.10 Copy</Button>
            <div className="gray" style={{ maxWidth: '300rem', textAlign: 'center', marginTop: '-3rem' }}>Kept when it was updated on {formatDate(archive.made)}. Restoring adds it as a separate world.</div>
          </>
        )}
      </div>
      <div className="menu-footer">
        <div className="row">
          <Button size="small" onClick={async () => {
            await engine.saves.putWorld({ ...rec, name: name.trim() || rec.name });
            engine.cloud.markDirty(rec.id);
            back();
          }}>Save</Button>
          <Button size="small" onClick={back}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/** Real progress: each cell is one chunk around the spawn, coloured by its pipeline state. */
function ChunkMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const g = engine.game;
      const c = ref.current;
      if (!g || !c) return;
      const ctx = c.getContext('2d')!;
      const R = g.chunks.renderDistance + 1;
      const n = R * 2 + 1;
      const cell = 4;
      c.width = n * cell; c.height = n * cell;
      const pcx = Math.floor(g.player.x) >> 4, pcz = Math.floor(g.player.z) >> 4;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const ch = g.world.getChunk(pcx + dx, pcz + dz);
        let col = '#1d1d1d';
        if (ch) col = ch.meshedVersion > 0 ? '#5fd34a' : '#d8c65a';
        ctx.fillStyle = col;
        ctx.fillRect((dx + R) * cell, (dz + R) * cell, cell - 1, cell - 1);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ width: '76rem', height: '76rem', imageRendering: 'pixelated' }} />;
}

const TIPS = [
  'Hold Shift to sneak - you will not fall off edges while sneaking.',
  'In Creative, double-tap Space to fly. Space rises, Shift descends.',
  'Hostile creatures spawn in the dark. Torches keep an area safe.',
  'Press F3 to show performance and position details.',
  'Punch a tree to get logs, then open your inventory with E.',
  'Coal and iron hide in stone. You need a pickaxe to mine them.',
  'Shift-click moves a whole stack between inventory sections.',
  'One piece of coal smelts eight items in a furnace.',
];

export function LoadingScreen() {
  const l = useStore(ui, (s) => s.loading);
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);
  return (
    <div className="screen dirt-bg" style={{ justifyContent: 'center', gap: '8rem' }} data-testid="loading-screen">
      <Title>{l.title}</Title>
      <div className="gray">{l.stage}{l.progress >= 0 ? ` ${Math.round(l.progress * 100)}%` : '...'}</div>
      {l.progress >= 0 && <div className="progress-bar"><div style={{ width: `${Math.round(l.progress * 198)}rem` }} /></div>}
      {engine.game && l.title === 'Loading world' && <ChunkMap />}
      <div className="gray" style={{ fontSize: '8rem' }}>{l.detail}</div>
      <div className="shadow" style={{ marginTop: '12rem', maxWidth: '300rem', textAlign: 'center' }}><span className="yellow">Tip:</span> {tip}</div>
    </div>
  );
}

export function QuitScreen() {
  return (
    <div className="screen dirt-bg" style={{ justifyContent: 'center', gap: '10rem' }}>
      <Title>Thanks for playing Blockfell!</Title>
      <div className="gray">Your worlds are saved in this browser. You can close this tab now.</div>
      <Button onClick={() => ui.set({ screen: 'title' })}>Back to Title Screen</Button>
    </div>
  );
}

// ======================================================================= Dropbox sync (1.9)

/**
 * A world that can't be opened as it is: changed on this device and on another one
 * (the player picks a copy), or last saved by a newer Blockfell (update first).
 */
function SyncPrompt({ id, kind }: { id: string; kind: 'conflict' | 'newer' }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof engine.cloud.conflictInfo>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const load = () => { setInfo(null); void engine.cloud.conflictInfo(id).then(setInfo); };
  useEffect(load, [id]);
  const close = () => ui.set((s) => ({ syncPrompt: null, worldsVersion: s.worldsVersion + 1 }));
  const choose = async (c: 'mine' | 'theirs' | 'both') => {
    setBusy(true);
    const { out } = await engine.cloud.resolve(id, c);
    setBusy(false);
    if (out === 'offline') { setNote('Dropbox could not be reached. Try again when you are online.'); return; }
    if (out === 'conflict') { setNote('It was just saved on another device again. Look at the two copies once more.'); load(); return; }
    if (out === 'error' || out === 'relink') { setNote(`That didn't work: ${ui.get().cloud.message || 'link Dropbox again'}`); return; }
    pushToast({ kind: 'info', icon: 'chest', title: c === 'mine' ? 'Kept this copy' : c === 'theirs' ? 'Using the Dropbox copy' : 'Kept both copies', desc: info?.local?.name ?? '' });
    close();
  };
  const update = async () => {
    setBusy(true);
    const v = await checkForUpdate(true);
    setBusy(false);
    if (v) restartForUpdate();
    else setNote('No newer version found yet. Connect to the internet and try again, or reload Blockfell.');
  };
  const local = info?.local, remote = info?.remote;
  const device = info?.device ?? 'this device';
  const short = device.replace(/ \(.*\)$/, '');
  return (
    <div className="screen dirt-bg" style={{ justifyContent: 'center', gap: '6rem' }} data-testid="sync-prompt">
      {!info && <Title>Checking Dropbox...</Title>}
      {info && kind === 'conflict' && (
        <>
          <Title>'{local?.name ?? remote?.world.name ?? 'This world'}' was changed on two devices</Title>
          <div className="gray" data-testid="conflict-local">On this {short}: last played {local ? formatDate(local.lastPlayed, true) : '-'}</div>
          <div className="gray" data-testid="conflict-remote">{remote ? `In Dropbox${remote.savedBy ? ` (from ${remote.savedBy})` : ''}: last played ${formatDate(remote.world.lastPlayed, true)}` : 'In Dropbox: could not be read just now'}</div>
          <div className="tip" style={{ maxWidth: '330rem', textAlign: 'center', whiteSpace: 'normal' }}>
            Keep This Copy sends this {short}&apos;s world to Dropbox. Use Dropbox Copy replaces it here. Keep Both keeps this one as &apos;{local?.name} ({short} copy)&apos;.
          </div>
          <div className="row" style={{ marginTop: '10rem' }}>
            <Button size="small" testId="btn-keep-mine" disabled={busy} onClick={() => void choose('mine')}>Keep This Copy</Button>
            <Button size="small" testId="btn-use-dropbox" disabled={busy || !remote} onClick={() => void choose('theirs')}>Use Dropbox Copy</Button>
          </div>
          <Button size="small" testId="btn-keep-both" disabled={busy || !remote} onClick={() => void choose('both')}>Keep Both</Button>
        </>
      )}
      {info && kind === 'newer' && (
        <>
          <Title>A newer Blockfell saved this world</Title>
          <div className="gray" style={{ maxWidth: '330rem', textAlign: 'center', whiteSpace: 'normal' }}>
            {remote ? `'${remote.world.name}' was saved by Blockfell ${remote.gameVersion}${remote.savedBy ? ` on ${remote.savedBy}` : ''}. ` : ''}
            This {short} has Blockfell {GAME_VERSION}. Update Blockfell here to carry on with the latest copy.
          </div>
          <Button testId="btn-update-blockfell" disabled={busy} onClick={() => void update()}>Update Blockfell</Button>
        </>
      )}
      {note && <div className="yellow" data-testid="sync-note" style={{ maxWidth: '320rem', textAlign: 'center', whiteSpace: 'normal' }}>{note}</div>}
      <Button size="small" testId="btn-sync-cancel" onClick={close}>Cancel</Button>
    </div>
  );
}

const NOT_HERE: Record<string, string> = {
  file: 'Dropbox sync works when Blockfell is opened from its web address (https://avizent.github.io/blockfell/), not from a file. Worlds in a file copy stay on this computer: use Export World to move them.',
  embedded: 'Dropbox sync is not available inside this page. Open Blockfell from its web address: https://avizent.github.io/blockfell/',
  insecure: 'Dropbox sync needs a secure (https) web address.',
  nocrypto: 'This browser is too old for Dropbox sync.',
};

/** Options for Dropbox sync: link, unlink, sync now, and worlds kept in Dropbox only. */
export function CloudScreen() {
  const c = useStore(ui, (s) => s.cloud);
  const ret = useStore(ui, (s) => s.cloudReturn);
  const [key, setKey] = useState('');
  const [codeUrl, setCodeUrl] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void engine.cloud.refreshUi(); }, []);
  const back = () => ui.set((s) => ({ screen: ret, worldsVersion: s.worldsVersion + 1 }));
  const run = async (fn: () => Promise<void>) => {
    setErr(''); setBusy(true);
    try { await fn(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const linkCode = () => run(async () => {
    const url = await engine.cloud.dbx.beginCodeLink();
    setCodeUrl(url);
    window.open(url, '_blank', 'noopener');
  });
  const finishCode = () => run(async () => {
    await engine.cloud.dbx.finishCodeLink(code);
    await engine.cloud.onLinked();
    setCodeUrl(''); setCode('');
    await engine.cloud.syncAll();
  });
  const text = { maxWidth: '330rem', textAlign: 'center' as const, whiteSpace: 'normal' as const };
  let body: ReactNode;
  if (!c.available) {
    body = <div className="gray" style={text} data-testid="cloud-unavailable">{NOT_HERE[c.why] ?? 'Dropbox sync is not available here.'}</div>;
  } else if (!c.hasKey) {
    body = (
      <>
        <div className="gray" style={text}>One-time setup: paste the App key of your Blockfell app from the Dropbox App Console (see the guide, &apos;Dropbox sync&apos;).</div>
        <input className="field" data-testid="dropbox-app-key" placeholder="App key" value={key} onChange={(e) => setKey(e.target.value)} style={{ width: '200rem' }} />
        <Button size="small" testId="btn-save-app-key" disabled={!/^[a-z0-9]{8,32}$/i.test(key.trim())} onClick={() => { engine.cloud.dbx.setAppKey(key); void engine.cloud.refreshUi(); }}>Save</Button>
      </>
    );
  } else if (!c.linked) {
    body = (
      <>
        {c.relink && <div className="yellow" style={text} data-testid="cloud-relink">The link to Dropbox has expired or was switched off. Link again to carry on syncing.</div>}
        <div className="gray" style={text}>
          Keep your worlds in your Dropbox so you can carry on playing on another device, such as a Mac and an iPad.
          Blockfell only gets its own folder (Dropbox &gt; Apps &gt; Blockfell); it never sees the rest of your Dropbox.
        </div>
        {!codeUrl && !c.builtInKey && (
          <div className="tip">App key: {engine.cloud.dbx.appKey} <a className="yellow" href="#" data-testid="btn-change-key" onClick={(e) => { e.preventDefault(); engine.cloud.dbx.setAppKey(''); void engine.cloud.refreshUi(); }}>change</a></div>
        )}
        {!codeUrl && (
          <div className="row" style={{ marginTop: '8rem' }}>
            <Button size="small" testId="btn-link-dropbox" disabled={busy} onClick={() => void run(() => engine.cloud.dbx.beginLink())}>Link to Dropbox</Button>
            <Button size="small" testId="btn-link-code" disabled={busy} onClick={() => void linkCode()}>Link With a Code...</Button>
          </div>
        )}
        {codeUrl && (
          <>
            <div className="gray" style={text}>Dropbox has opened in another tab (or <a href={codeUrl} target="_blank" rel="noopener" className="yellow">open it here</a>). Choose Allow, copy the code it shows, come back and paste it here:</div>
            <input className="field" data-testid="dropbox-code" placeholder="Code from Dropbox" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: '220rem' }} />
            <div className="row">
              <Button size="small" testId="btn-finish-code" disabled={busy || code.trim().length < 8} onClick={() => void finishCode()}>Finish Linking</Button>
              <Button size="small" onClick={() => { setCodeUrl(''); setCode(''); }}>Back</Button>
            </div>
          </>
        )}
      </>
    );
  } else {
    body = (
      <>
        <div className="shadow" data-testid="cloud-account">Linked to {c.account || 'your Dropbox'}</div>
        <div className="tip" data-testid="cloud-state" style={{ ...text, color: c.relink || c.message ? '#ffcc55' : undefined }}>{CloudSync.summary(c)}</div>
        <div className="gray" style={text}>
          Your worlds are kept in Dropbox &gt; Apps &gt; Blockfell. They sync when you open the world list, every 2 minutes while you play,
          when you switch away from Blockfell and when you Save and Quit. Link this Dropbox on your other devices too.
        </div>
        {c.remoteOnly.length > 0 && (
          <div className="col" style={{ gap: '3rem', marginTop: '4rem' }} data-testid="cloud-remote-only">
            <div className="shadow">In Dropbox, not on this device:</div>
            {c.remoteOnly.map((r) => (
              <div key={r.id} className="row" style={{ alignItems: 'center', gap: '6rem' }}>
                <span className="gray">{r.name} · {formatDate(r.lastPlayed)}{r.newer ? ` · needs Blockfell ${r.newer}` : ''}</span>
                <Button size="third" testId="btn-download-world" disabled={busy || !!r.newer} onClick={() => void run(async () => {
                  const out = await engine.cloud.downloadWorld(r.id);
                  if (out === 'downloaded') pushToast({ kind: 'info', icon: 'chest', title: 'World downloaded', desc: r.name });
                  else if (out === 'offline') setErr('Dropbox could not be reached');
                })}>Download</Button>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: '8rem' }}>
          <Button size="small" testId="btn-sync-now" disabled={busy || c.busy} onClick={() => void run(() => engine.cloud.syncAll())}>{c.busy ? 'Syncing...' : 'Sync Now'}</Button>
          <Button size="small" testId="btn-unlink-dropbox" disabled={busy} onClick={() => void run(() => engine.cloud.unlink())}>Unlink</Button>
        </div>
      </>
    );
  }
  return (
    <div className="screen dirt-bg" data-testid="cloud-screen">
      <div className="menu-header"><Title>Dropbox Sync</Title></div>
      <div className="col" style={{ flex: 1, gap: '6rem', justifyContent: 'center', overflowY: 'auto', width: '100%' }}>
        {body}
        {err && <div className="yellow" style={text} data-testid="cloud-error">{err}</div>}
      </div>
      <div className="menu-footer"><Button testId="btn-cloud-done" onClick={back}>Done</Button></div>
    </div>
  );
}
