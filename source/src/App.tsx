import { useEffect } from 'react';
import { useStore } from './core/store';
import { ui } from './ui/uiStore';
import { TitleScreen, WorldSelect, CreateWorld, EditWorld, LoadingScreen, QuitScreen, ImportWorld, CloudScreen } from './ui/Menus';
import { TheEnd } from './ui/TheEnd';
import { OptionsScreen, PauseMenu, DeathScreen, AdvancementsScreen, StatsScreen, SleepScreen, SignEditor, MapScreen } from './ui/GameMenus';
import { HUD, Toasts } from './ui/HUD';
import { SurvivalInventory, CraftingTableScreen, ChestScreen, FurnaceScreen, CreativeScreen, RuneTableScreen, TradeScreen } from './ui/InventoryUI';
import { engine } from './engine/Engine';
import { TouchControls, RotateHint } from './ui/TouchControls';

export function App() {
  const screen = useStore(ui, (s) => s.screen);
  const overlay = useStore(ui, (s) => s.overlay);

  useEffect(() => {
    // blur the live panorama behind menus; hide it on the loading screen
    const cls = document.body.classList;
    cls.toggle('canvas-blur', screen === 'title' || screen === 'worlds' || screen === 'import' || screen === 'options' || screen === 'cloud');
    cls.toggle('canvas-hidden', screen === 'loading' || screen === 'create' || screen === 'edit' || screen === 'quit');
  }, [screen]);

  useEffect(() => { engine.updateFocus(); }, [screen, overlay]);

  return (
    <div className="ui-root">
      {screen === 'title' && <TitleScreen />}
      {screen === 'worlds' && <WorldSelect />}
      {screen === 'import' && <ImportWorld />}
      {screen === 'cloud' && <CloudScreen />}
      {screen === 'create' && <CreateWorld />}
      {screen === 'edit' && <EditWorld />}
      {screen === 'options' && <OptionsScreen />}
      {screen === 'loading' && <LoadingScreen />}
      {screen === 'quit' && <QuitScreen />}
      {screen === 'game' && (
        <>
          <HUD />
          {overlay === 'pause' && <PauseMenu />}
          {overlay === 'options' && <OptionsScreen />}
          {overlay === 'advancements' && <AdvancementsScreen />}
          {overlay === 'stats' && <StatsScreen />}
          {overlay === 'death' && <DeathScreen />}
          {overlay === 'theend' && <TheEnd onDone={() => engine.finishTheEnd()} />}
          {overlay === 'inventory' && <SurvivalInventory />}
          {overlay === 'crafting' && <CraftingTableScreen />}
          {overlay === 'chest' && <ChestScreen />}
          {overlay === 'furnace' && <FurnaceScreen />}
          {overlay === 'creative' && <CreativeScreen />}
          {overlay === 'runes' && <RuneTableScreen />}
          {overlay === 'trade' && <TradeScreen />}
          {overlay === 'sleep' && <SleepScreen />}
          {overlay === 'sign' && <SignEditor />}
          {overlay === 'map' && <MapScreen />}
          <TouchControls />
        </>
      )}
      <RotateHint />
      {screen !== 'game' && <Toasts />}
    </div>
  );
}
