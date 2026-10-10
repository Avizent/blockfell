import * as THREE from 'three';
import { World, BlockEntity, ChestEntity, FurnaceEntity, SignEntity, posKey, UNLOADED } from '../world/World';
import { ChunkManager } from '../world/ChunkManager';
import * as B from '../world/BlockRegistry';
import { SEA_LEVEL, TICKS_PER_SECOND, WORLD_HEIGHT, chunkKey, GAME_VERSION, SAVE_FORMAT, localIndex } from '../world/constants';
import { Player, MoveInput, Difficulty } from '../player/Player';
import { AABB, boxCollides } from '../player/PlayerPhysics';
import { PlayerInventory, Container, ARMOR_START, OFFHAND } from '../inventory/Inventory';
import { ItemStack, Slot, makeStack, cloneStack, stacksMatch } from '../inventory/ItemStack';
import { getItem, itemForBlock, maxStackOf } from '../inventory/ItemRegistry';
import { ScreenHandler } from '../inventory/ScreenHandler';
import { canInscribe, runeLevel, runeOffers } from '../inventory/Enchantments';
import { EntityManager } from '../entities/EntityManager';
import type { ItemEntity } from '../entities/Drops';
import { EntityHost, lightToBrightness } from '../entities/Entity';
import { Mob, MOB_SPECS } from '../entities/Mob';
import type { MobType } from '../entities/mobModels';
import { DayNightSystem } from '../systems/DayNightSystem';
import { Progress } from '../systems/Progress';
import type { WorldRecord, WorldExtra, GameRules } from '../systems/SaveManager';
import { DEFAULT_RULES } from '../systems/SaveManager';
import { type DimId, type Arrival, OVERWORLD } from '../world/dims';
import { LAVA_SEA } from '../world/Cinderdeep';
import { BIOME_CINDERDEEP, BIOME_STARHOLLOW } from '../world/BiomeSystem';
import { newestGenVersion } from '../world/generators';
import { WeatherSystem, WeatherKind } from '../systems/WeatherSystem';
import { Precipitation, PrecipSource, PRECIP_NONE, PRECIP_RAIN, PRECIP_SNOW } from '../render/Precipitation';
import { BIOME_DESERT, BIOME_BADLANDS, BIOME_SNOWY, BIOME_MOUNTAINS } from '../world/BiomeSystem';
import { raycast, RayHit } from '../interaction/VoxelRaycaster';
import { breakProgressPerTick, canHarvest } from '../interaction/BlockBreaking';
import { resolvePlacement, needsSupport, supportOk, partnerOf, lookFacing, faceFacing } from '../interaction/BlockPlacement';
import { SignRenderer } from '../render/SignRenderer';
import { SpawnerRenderer } from '../render/SpawnerRenderer';
import { SpawnerSystem } from './Spawners';
import { Painting, placePainting } from '../entities/Painting';
import { Boat, BOAT_SEAT, BOAT_HEIGHT, BOAT_WIDTH, BOAT_DRAFT, waterSurfaceAt } from '../entities/Boat';
import { Bobber, rollCatch } from '../entities/Fishing';
import { DYE_COLORS } from '../world/dyes';
import { FluidSystem, waterFlow } from '../world/Fluids';
import { Chunk } from '../world/Chunk';
import { FirstPerson } from '../render/FirstPerson';
import { BlockOutline, CrackOverlay, Particles, EffectKind } from '../render/Effects';
import { ui, pushChat, pushToast, Overlay } from '../ui/uiStore';
import type { EngineServices } from '../engine/services';
import { mulberry32, hash4 } from '../core/rng';
import { VillageManager, GIFT_FOOD } from './VillageManager';
import { Villager } from '../entities/Villager';
import { Sentinel } from '../entities/Sentinel';
import { MAP_ITEMS } from '../inventory/ItemRegistry';
import { compassName } from '../render/mapImage';
import { Hound, HOUND_FOOD, HOUND_TAMING_FOOD } from '../entities/Hound';
import { ArmourStand, STAND_HAND, STAND_HEIGHT, STAND_WIDTH } from '../entities/ArmourStand';
import { Ashboar, ASHBOAR_FOOD } from '../entities/Ashboar';
import { StarhollowSystem } from './StarhollowSystem';
import { ROOST, ARRIVAL } from '../world/Starhollow';
import type { Trade } from '../entities/Trades';
import type { VillagePlan } from '../world/Villages';

const ORES = new Set<number>([B.COAL_ORE, B.IRON_ORE, B.RUNE_ORE]);
const HOTBAR_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

interface Breaking {
  x: number; y: number; z: number;
  block: number;
  progress: number;
}

/**
 * A running world session: owns the world, chunk streaming, player, inventory,
 * entities, time, and all per-tick gameplay rules. Rendering-side helpers
 * (hand, outline, cracks, particles) are driven from here too.
 */
const UNLIT_EFFECT: Partial<Record<EffectKind, true>> = { smoke: true, poof: true, splash: true, drip: true, ash: true };
/** 2.2: the Starhollow's islands are lit by the stars: a cool, soft light everywhere. */
const STAR_AMBIENT = 0.6;
/** 2.0: the Cinderdeep is never pitch dark: a dull red glow from the lava sea everywhere. */
export const DEEP_AMBIENT = 0.44;
/** A standing or wall torch. */
const isTorchBlock = (id: number): boolean => id === B.TORCH || id === B.WALL_TORCH.n || id === B.WALL_TORCH.e || id === B.WALL_TORCH.s || id === B.WALL_TORCH.w;

export class Game implements EntityHost, PrecipSource {
  readonly world: World;
  readonly chunks: ChunkManager;
  readonly player = new Player();
  readonly inventory = new PlayerInventory();
  readonly cursor: { stack: Slot } = { stack: null };
  readonly entities = new EntityManager();
  readonly dayNight = new DayNightSystem();
  readonly progress = new Progress();
  readonly craft2 = new Container(4);
  readonly craftOut2 = new Container(1);
  readonly craft3 = new Container(9);
  readonly craftOut3 = new Container(1);
  /** Rune Table slots: [item, shards]. */
  readonly runeSlots = new Container(2);
  readonly particles: Particles;
  readonly outline: BlockOutline;
  readonly crack: CrackOverlay;
  readonly hand: FirstPerson;
  record: WorldRecord;
  difficulty: Difficulty;
  rules: GameRules;
  tickCount = 0;
  started = false;
  paused = false;

  target: RayHit | null = null;
  targetMob: Mob | null = null;
  private breaking: Breaking | null = null;
  private breakDelay = 0;
  private useDelay = 0;
  private eatTicks = 0;
  private bowTicks = 0;
  private jumpTap = 0;
  private forwardTap = 0;
  private stepDist = 0;
  private scheduled = new Map<string, number>();
  private furnaces = new Set<string>();
  readonly fluids: FluidSystem;
  readonly villages: VillageManager;
  readonly weather = new WeatherSystem();
  private precip!: Precipitation;
  private precipCache = new Map<number, number>();
  /** Where the last bolt of lightning came down (tests and debugging). */
  lastStrike: { x: number; y: number; z: number; tick: number } | null = null;
  /** The villager whose trade screen is open. */
  tradeWith: Villager | null = null;
  /** Signs: boards and text drawn from their block entities. */
  readonly signs: SignRenderer;
  readonly spawners: SpawnerSystem;
  readonly spawnerFigures: SpawnerRenderer;
  /** The sign whose text is being edited. */
  signPos: { x: number; y: number; z: number } | null = null;
  /** The painting under the crosshair (nearer than any block). */
  targetPainting: Painting | null = null;
  /** The boat the player is sitting in (1.6). */
  riding: Boat | null = null;
  /** The boat under the crosshair. */
  targetBoat: Boat | null = null;
  /** 2.1: the armour stand under the crosshair, and how high up it the aim lands (blocks above its feet). */
  targetStand: ArmourStand | null = null;
  private targetStandAt = 0;
  /** The fishing float while a line is out. */
  bobber: Bobber | null = null;
  private readonly fishLine: THREE.Line;
  private readonly lineV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** The player was sitting in a boat when the world was saved. */
  private rideOnLoad = false;
  /** Ticks spent asleep in a bed (0 = awake). */
  sleepTicks = 0;
  private sleepBed: { x: number; y: number; z: number } | null = null;
  screen: ScreenHandler | null = null;
  openPos: { x: number; y: number; z: number } | null = null;
  openKind: Overlay = null;
  creativeTab = 'building';
  private autosaveTimer = 0;
  private hudCache = '';
  private lastSelected = -1;
  private lastSelectedId = '';
  private fovCurrent = 1;
  private hurtTilt = 0;
  private wasNight = false;
  private debugTimer = 0;
  private lastInvVersion = -1;
  private musicTimer = 0;
  saving = false;
  /** Scripted movement (benchmark / automated tests); overrides keyboard input. */
  autopilot: MoveInput | null = null;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();

  /** The dimension this session plays (1.10; the world may hold others). */
  readonly dim: DimId;
  /** 2.0: how the player came in (through a Deepgate, or back to the surface after dying below). */
  private arrival: Arrival | null;
  /** 2.0: set while the player is being carried to another dimension (the next save records it). */
  private leaving: DimId | null = null;
  /** 2.2: where the player will come out there (saved as their position, so the right chunks load first). */
  private leavingAt: { x: number; y: number; z: number } | null = null;
  /** 2.0: ticks spent standing in a Deepgate; when it fills up, the gate carries you away. */
  gateTicks = 0;
  /** 2.0: no travelling again straight after arriving. */
  private gateCooldown = 0;
  /** 2.2: is the gate being stood in a Stargate (rather than a Deepgate)? */
  gateStar = false;
  /** 2.2: the Starhollow's rules (only while playing there). */
  readonly star: StarhollowSystem | null;
  /** 2.2: ticks spent gliding (Starwings wear by one every second). */
  private glideTicks = 0;

  constructor(private engine: EngineServices, record: WorldRecord, deltas: Map<string, Map<number, number>>, extra: WorldExtra | undefined, dim: DimId = OVERWORLD, arrival: Arrival | null = null) {
    this.record = record;
    this.dim = dim;
    this.arrival = arrival;
    this.difficulty = record.difficulty;
    this.rules = { ...DEFAULT_RULES, ...record.rules };
    this.weather.load(record.weather);
    const r = engine.renderer;
    this.world = new World(record.seed, record.structures, dim === OVERWORLD ? record.genVersion ?? 1 : record.dims?.[dim]?.genVersion ?? newestGenVersion(dim), dim);
    for (const [k, v] of deltas) this.world.deltas.set(k, v);
    if (extra) {
      for (const [k, v] of extra.blockEntities) {
        this.world.blockEntities.set(k, v);
        if (v.type === 'furnace') this.furnaces.add(k);
      }
    }
    this.chunks = new ChunkManager(this.world, engine.pool, r.materials, engine.options.renderDistance);
    this.fluids = new FluidSystem(this.world, (x, y, z, id, lava) => (lava ? this.burnOut(x, y, z) : this.washOut(x, y, z, id)));
    this.fluids.onReact = (x, y, z, formed) => this.onFluidsMeet(x, y, z, formed);
    this.spawners = new SpawnerSystem(this.world, this.entities, this);
    this.villages = new VillageManager(this);
    this.villages.load(extra?.villages);
    this.star = dim === 'starhollow' ? new StarhollowSystem(this) : null;
    // water the player changed keeps flowing when its chunk is loaded again; villages get their people
    this.chunks.onChunkLoaded = (c) => { this.wakeWater(c); this.villages.onChunkLoaded(c); this.spawners.scanChunk(c); };
    this.chunks.greedy = engine.options.greedyMeshing;
    r.scene.add(this.chunks.group);
    r.scene.add(this.entities.group);
    this.particles = new Particles(r.scene);
    this.precip = new Precipitation(r.scene);
    this.signs = new SignRenderer(r.atlas);
    r.scene.add(this.signs.group);
    this.spawnerFigures = new SpawnerRenderer();
    r.scene.add(this.spawnerFigures.group);
    this.outline = new BlockOutline(r.scene);
    this.crack = new CrackOverlay(r.scene, engine.models);
    this.hand = new FirstPerson(r.overlayScene, engine.models);
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(17 * 3), 3));
      this.fishLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x1c1c1c }));
      this.fishLine.frustumCulled = false;
      this.fishLine.visible = false;
      r.scene.add(this.fishLine);
    }
    this.entities.simulationDistance = engine.options.simulationDistance * 16;
    this.entities.mobSpawning = this.rules.doMobSpawning;

    this.world.events.on('blockChanged', (e) => this.onBlockChanged(e.x, e.y, e.z, e.old, e.id, e.cause));

    // ---- player state
    const p = this.player;
    p.gameMode = record.gameMode;
    if (record.player) {
      const s = record.player;
      p.setPosition(s.x, s.y, s.z);
      p.yaw = s.yaw; p.pitch = s.pitch;
      p.health = s.health; p.food = s.food; p.saturation = s.saturation; p.exhaustion = s.exhaustion;
      p.air = s.air; p.xpLevel = s.xpLevel; p.xpProgress = s.xpProgress; p.xpTotal = s.xpTotal;
      if (s.runeSeed !== undefined) p.runeSeed = s.runeSeed;
      p.flying = s.flying && s.gameMode === 'creative';
      p.gameMode = s.gameMode;
      p.dead = s.dead;
      p.spawnX = s.spawn.x; p.spawnY = s.spawn.y; p.spawnZ = s.spawn.z;
      p.bed = s.bed ?? null;
      this.inventory.load(s.inventory);
      this.inventory.selected = s.selected;
      this.rideOnLoad = s.riding === true;
      this.started = true;
    } else {
      const sp = this.world.generator.findSpawn();
      p.spawnX = sp.x; p.spawnY = sp.y; p.spawnZ = sp.z;
      p.setPosition(sp.x, sp.y + 1, sp.z);
      p.yaw = Math.PI * 0.75;
    }
    // 2.0: arriving from another dimension: wait over the gate's spot (or the way home) until the land is ready
    if (arrival?.kind === 'gate') p.setPosition(arrival.x + 0.5, 72, arrival.z + 0.5);
    else if (arrival?.kind === 'respawn') {
      const b = p.bed;
      p.setPosition((b ? b.x : p.spawnX) + 0.5, (b ? b.y : p.spawnY) + 1, (b ? b.z : p.spawnZ) + 0.5);
    }
    p.onLanded = (d) => this.onLanded(d);
    this.dayNight.time = record.time;
    this.dayNight.day = record.day;
    this.progress.load(record.stats, record.advancements);
    this.progress.onGrant = (a) => {
      pushToast({ title: 'Advancement Made!', desc: a.title, icon: a.icon, kind: 'advancement' });
      this.engine.audio.play('levelup', undefined, undefined, undefined, 0.5, 1.3);
    };
    this.inventory.onChange = () => ui.set({ invVersion: this.inventory.version });
    if (extra?.entities) this.entities.load(extra.entities, this);
    this.wasNight = this.dayNight.isNight();
  }

  // ======================================================================= EntityHost
  get models() { return this.engine.models; }
  daylightFactor(): number { return this.dayNight.light.daylight; }
  weatherRain(): number { return this.weather.rain; }
  weatherThunder(): number { return this.weather.thunder; }
  isDay(): boolean { return !this.dayNight.isNight(); }
  brightnessAt(x: number, y: number, z: number): number {
    const l = this.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    const b = lightToBrightness(l, this.dayNight.light.daylight);
    return this.dim === 'cinderdeep' ? Math.max(DEEP_AMBIENT, b) : this.dim === 'starhollow' ? Math.max(STAR_AMBIENT, b) : b;
  }
  sound(name: string, x?: number, y?: number, z?: number, volume = 1, pitch = 1): void {
    this.engine.audio.play(name, x, y, z, volume, pitch);
  }
  /** Particles; the unlit kinds (smoke, splashes, drips) take the light where they appear, so smoke in a dark cave isn't white. */
  effect(kind: EffectKind, x: number, y: number, z: number, count: number): void {
    this.particles.effect(kind, x, y, z, count, UNLIT_EFFECT[kind] ? this.brightnessAt(x, y, z) : 1);
  }
  giveItem(stack: ItemStack): number {
    const left = this.inventory.add(stack);
    const got = stack.count - left;
    if (got > 0) {
      if (stack.id === 'log') this.progress.grant('wood');
    }
    return left;
  }
  addXp(n: number): void {
    const before = this.player.xpLevel;
    this.player.addXp(n);
    if (this.player.xpLevel > before && this.player.xpLevel % 5 === 0) this.sound('levelup');
  }
  onMobKilled(type: string, byPlayer: boolean, mob?: Mob): void {
    if (!byPlayer) return;
    this.progress.add('mobs_killed');
    const m = type as MobType;
    if (MOB_SPECS[m]?.hostile) {
      this.progress.grant('kill');
      if (mob) this.villages.onHostileKilled(mob.x, mob.z);   // defending a village earns standing there
    }
    if (type === 'hollowdrake') this.star?.victory();
  }
  spawnItem(stack: ItemStack, x: number, y: number, z: number, vel?: [number, number, number]): void {
    this.entities.spawnItem(stack, x, y, z, vel);
  }
  spawnXp(value: number, x: number, y: number, z: number): void {
    this.entities.spawnXp(value, x, y, z);
  }
  spawnArrow(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromPlayer: boolean, damage: number, shooter: Mob | null = null): void {
    this.entities.spawnArrow(x, y, z, vx, vy, vz, fromPlayer, damage, shooter);
  }
  spawnEmber(x: number, y: number, z: number, vx: number, vy: number, vz: number, shooter: Mob): void {
    this.entities.spawnEmber(x, y, z, vx, vy, vz, shooter);
  }
  timeOfDay(): number { return this.dayNight.timeOfDay; }
  villagePlan(id: string): VillagePlan | null { return this.villages.plan(id); }
  raidActive(id: string | null): boolean { return this.villages.raidActive(id); }
  isClaimed(x: number, y: number, z: number, by: import('../entities/Entity').Entity): boolean { return this.villages.isClaimed(x, y, z, by); }
  alertSentinels(x: number, z: number): void { this.villages.alertSentinels(x, z); }
  discount(id: string | null): number { return this.villages.discount(id); }
  // ---- village life (1.8)
  villageStanding(id: string | null): number { return this.villages.rep(id); }
  meetingPoint(id: string | null): { x: number; y: number; z: number } | null { return this.villages.meetingPoint(id); }
  folkHurt(m: Mob, villageId: string | null, killed: boolean): void { this.villages.onFolkHurt(m, villageId, killed); }
  villagerDied(v: Mob, byPlayer: boolean, killer: Mob | null): void { if (v instanceof Villager) this.villages.onVillagerDied(v, byPlayer, killer); }
  addVillageFood(id: string | null, n: number): void { this.villages.addFood(id, n); }
  villagerGrewUp(v: Mob): void {
    const p = this.player;
    if (v instanceof Villager && Math.hypot(v.x - p.x, v.z - p.z) < 64) pushChat(`${v.name} of ${this.villages.name(v.villageId)} has grown up.`);
  }

  // ---- companions
  private lastAttacked: { mob: Mob; tick: number } | null = null;
  private lastHurtBy: { mob: Mob; tick: number } | null = null;

  playerAttacked(mob: Mob): void {
    if (!mob.petOfPlayer) this.lastAttacked = { mob, tick: this.tickCount };
  }

  ownerFightTarget(): Mob | null {
    const ok = (e: { mob: Mob; tick: number } | null) => !!e && this.tickCount - e.tick < 300 && e.mob.alive && !e.mob.removed && !e.mob.spec.folk && !e.mob.petOfPlayer;
    if (ok(this.lastHurtBy)) return this.lastHurtBy!.mob;
    if (ok(this.lastAttacked)) return this.lastAttacked!.mob;
    return null;
  }

  petDied(pet: Mob): void {
    pushChat(`Your ${pet.spec.name} has died.`);
    this.progress.add('pets_lost');
  }

  // ---- 2.2
  spawnStarBolt(x: number, y: number, z: number, vx: number, vy: number, vz: number, shooter: Mob, damage: number): void {
    this.entities.spawnStarBolt(x, y, z, vx, vy, vz, shooter, damage);
  }
  drakeShieldHit(): void { this.star?.shieldHit(); }

  // ---- 2.1
  spawnMob(type: MobType, x: number, y: number, z: number): Mob {
    return this.entities.spawnMob(type, x, y, z, this);
  }

  animalBred(type: string): void {
    const p = this.player;
    this.progress.add('animals_bred');
    if (type === 'ashboar') this.progress.grant('ashboar_breed');
    void p;
  }

  damagePlayer(amount: number, source: { x: number; y: number; z: number; kind: string; mob?: Mob }): void {
    const p = this.player;
    if (source.mob && !p.creative && !p.dead) this.lastHurtBy = { mob: source.mob, tick: this.tickCount };
    if (p.creative || p.dead || p.invulnerable > 0 || amount <= 0) return;
    let dmg = amount;
    if (source.kind !== 'fall' && source.kind !== 'drown' && source.kind !== 'starve' && source.kind !== 'burn') {
      const armor = this.inventory.armorPoints();
      dmg *= 1 - Math.min(20, armor) / 25;
      if (armor > 0) for (let i = 0; i < 4; i++) {
        if (this.inventory.get(ARMOR_START + i) && this.inventory.damageItem(ARMOR_START + i, Math.max(1, Math.floor(amount / 4)))) this.sound('tool_break');
      }
      if (source.kind !== 'cactus' && source.kind !== 'lava') {
        const dx = p.x - source.x, dz = p.z - source.z, l = Math.hypot(dx, dz) || 1;
        p.vx += (dx / l) * 0.4; p.vz += (dz / l) * 0.4; p.vy = Math.max(p.vy, 0.36);
      }
    }
    if (source.kind !== 'starve' && source.kind !== 'void') dmg *= 1 - this.protection(source.kind) * 0.04;
    if ((source.kind === 'lava' || source.kind === 'burn' || source.kind === 'ember') && this.hasCharm()) dmg *= 0.5;
    p.health = Math.max(0, p.health - dmg);
    p.invulnerable = 10;
    p.hurtTime = 10;
    this.hurtTilt = 1;
    p.addExhaustion(0.1);
    this.progress.add('damage_taken', dmg);
    this.sound('hurt', p.x, p.y + 1, p.z, 0.7, 0.9 + Math.random() * 0.2);
    if (p.health <= 0) this.die(source.kind);
  }

  // ======================================================================= lifecycle
  /** 0..1 progress of the initial terrain around the player. */
  loadingProgress(): { ready: number; total: number } {
    const p = this.player;
    return this.chunks.readiness(p.x, p.z, Math.min(3, this.chunks.renderDistance));
  }

  /** Called once the spawn area is meshed: finalise spawn height, bonus chest. */
  begin(): void {
    const p = this.player;
    if (!this.started) {
      const x = Math.floor(p.spawnX), z = Math.floor(p.spawnZ);
      const top = this.world.highestSolid(x, z);
      if (top > 0) { p.spawnY = top + 1; p.setPosition(p.spawnX, top + 1, p.spawnZ); }
      if (this.record.bonusChest && !this.record.bonusChestPlaced) this.placeBonusChest(x, z);
      if (p.creative) this.giveCreativeStarter();
      this.started = true;
      pushChat(`Welcome to ${this.record.name}!`);
    }
    // 2.0: coming in through a Deepgate, or back on the surface after dying in the Cinderdeep
    const arr = this.arrival;
    this.arrival = null;
    if (arr?.kind === 'gate') this.arriveThroughGate(arr.x, arr.z, arr.gate === 'star');
    else if (arr?.kind === 'respawn') this.respawn();
    else if (arr?.kind === 'home') this.wakeAtHome(arr.note);
    else if (this.started && !p.dead && this.insideRock()) this.freeFromRock();
    if (p.dead) ui.set({ overlay: 'death' });
    // back into the boat the player was sitting in
    if (this.rideOnLoad && !p.dead) {
      let best: Boat | null = null, bd = 3;
      for (const b of this.entities.boats()) { const d = b.distanceTo(p.x, p.y - BOAT_SEAT, p.z); if (d < bd) { bd = d; best = b; } }
      if (best) this.mount(best, true);
    }
    this.rideOnLoad = false;
    this.pushHud(true);
  }

  private giveCreativeStarter(): void {
    const kit = ['grass', 'cobblestone', 'planks', 'log', 'glass', 'stone_bricks', 'torch', 'lumen', 'spawn_pig'];
    kit.forEach((id, i) => { if (!this.inventory.get(i)) this.inventory.slots[i] = makeStack(id, maxStackOf(id)); });
    this.inventory.changed();
  }

  private placeBonusChest(x: number, z: number): void {
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2]]) {
      const cx = x + dx, cz = z + dz;
      const top = this.world.highestSolid(cx, cz);
      if (top < SEA_LEVEL - 1 || top > WORLD_HEIGHT - 3) continue;
      const y = top + 1;
      const here = this.world.getBlock(cx, y, cz);
      if (!B.getBlock(here).replaceable || B.IS_WATER[here]) continue;
      this.world.setBlock(cx, y, cz, B.CHEST[2], 'system');
      const items: Slot[] = new Array(27).fill(null);
      const loot: [string, number][] = [['log', 4], ['planks', 8], ['wooden_pickaxe', 1], ['wooden_axe', 1], ['apple', 3], ['stick', 4]];
      let i = 0;
      for (const [id, n] of loot) if (n > 0) items[(i++ * 5) % 27] = makeStack(id, n);
      this.world.blockEntities.set(posKey(cx, y, cz), { type: 'chest', items });
      // a torch-lit marker so the chest is easy to find
      const tx = cx + 1;
      if (B.getBlock(this.world.getBlock(tx, y, cz)).replaceable && B.IS_OPAQUE[this.world.getBlock(tx, y - 1, cz)]) this.world.setBlock(tx, y, cz, B.TORCH, 'system');
      this.record.bonusChestPlaced = true;
      return;
    }
  }

  dispose(): void {
    this.chunks.dispose();
    this.entities.clear();
    this.entities.group.removeFromParent();
    this.particles.dispose();
    this.precip.dispose();
    this.engine.audio.stopWeather();
    this.outline.dispose();
    this.crack.dispose();
    this.hand.dispose();
    this.signs.dispose();
    this.spawnerFigures.dispose();
    this.spawnerFigures.group.removeFromParent();
    this.fishLine.removeFromParent();
    this.fishLine.geometry.dispose();
    (this.fishLine.material as THREE.Material).dispose();
    this.world.events.clear();
    // the Cinderdeep hid the sky and raised the ambient light: put them back for the title screen
    const r = this.engine.renderer;
    r.sky.group.visible = true;
    r.uniforms.uAmbient.value = 0.045;
    r.uniforms.uAmbientTint.value.setRGB(1, 1, 1);
  }

  // ======================================================================= save
  snapshot(): { record: WorldRecord; extra: WorldExtra } {
    const p = this.player;
    this.progress.stats.walk = (this.progress.stats.walk ?? 0) + p.statWalk; p.statWalk = 0;
    this.progress.stats.sprint = (this.progress.stats.sprint ?? 0) + p.statSprint; p.statSprint = 0;
    this.progress.stats.swim = (this.progress.stats.swim ?? 0) + p.statSwim; p.statSwim = 0;
    this.progress.stats.fly = (this.progress.stats.fly ?? 0) + p.statFly; p.statFly = 0;
    this.progress.stats.jumps = (this.progress.stats.jumps ?? 0) + p.statJumps; p.statJumps = 0;
    this.progress.stats.glide = (this.progress.stats.glide ?? 0) + Math.round(p.statGlide); p.statGlide = 0;
    // items sitting in a crafting grid or on the cursor are folded into the SAVED
    // copy of the inventory (live UI state is left untouched)
    const invCopy = new PlayerInventory();
    invCopy.load(this.inventory.toJSON());
    for (const s of [...this.craft2.slots, ...this.craft3.slots, ...this.runeSlots.slots, this.cursor.stack]) if (s) invCopy.add({ ...s });
    const rec: WorldRecord = {
      ...this.record,
      gameMode: p.gameMode,
      difficulty: this.difficulty,
      rules: { ...this.rules },
      lastPlayed: Date.now(),
      version: GAME_VERSION,
      time: this.dayNight.time,
      day: this.dayNight.day,
      weather: this.weather.save(),
      stats: { ...this.progress.stats },
      advancements: [...this.progress.done],
      player: {
        x: this.leavingAt?.x ?? p.x, y: this.leavingAt?.y ?? p.y, z: this.leavingAt?.z ?? p.z, yaw: p.yaw, pitch: p.pitch,
        health: p.health, food: p.food, saturation: p.saturation, exhaustion: p.exhaustion, air: p.air,
        xpLevel: p.xpLevel, xpProgress: p.xpProgress, xpTotal: p.xpTotal, runeSeed: p.runeSeed,
        flying: p.flying, gameMode: p.gameMode, dead: p.dead,
        spawn: { x: p.spawnX, y: p.spawnY, z: p.spawnZ },
        bed: p.bed,
        inventory: invCopy.toJSON(), selected: this.inventory.selected,
        riding: !!this.riding,
        dim: this.leaving ?? this.dim,
      },
      format: SAVE_FORMAT,
    };
    this.record = rec;
    const extra: WorldExtra = {
      blockEntities: [...this.world.blockEntities.entries()],
      entities: this.entities.serialize(),
      villages: this.villages.save(),
    };
    return { record: rec, extra };
  }

  private savePromise: Promise<number> | null = null;

  /**
   * Persists the session. Concurrent callers share the running save and then run
   * one more so nothing changed during the first save is missed. Chunk keys whose
   * write failed are re-queued.
   */
  /** `urgent`: upload to Dropbox now (leaving the app); `quiet`: the save made on opening the world, which changes nothing worth uploading. */
  async save(opts: { urgent?: boolean; quiet?: boolean } = {}): Promise<number> {
    // a new world that is still loading has nothing to save yet; saving it now would
    // mark it as started and skip the spawn fix-up and starting items on the next load
    if (!this.started) return 0;
    while (this.savePromise) await this.savePromise.catch(() => 0);
    const run = async () => {
      const { record, extra } = this.snapshot();
      const saves = this.engine.saves;
      const dirty = [...this.world.dirtyDeltaChunks];
      this.world.dirtyDeltaChunks.clear();
      try {
        const n = await saves.putDeltas(record.id, this.dim, this.world.deltas, dirty);
        await saves.putExtra(record.id, this.dim, extra);
        await saves.putWorld(record);
        if (!opts.quiet) this.engine.worldSaved?.(record.id, !!opts.urgent);
        return n;
      } catch (e) {
        for (const k of dirty) this.world.dirtyDeltaChunks.add(k);
        console.error('Save failed', e);
        pushChat('Saving failed - your browser storage may be full');
        throw e;
      }
    };
    this.saving = true;
    this.savePromise = run();
    try {
      return await this.savePromise;
    } finally {
      this.savePromise = null;
      this.saving = false;
    }
  }

  // ======================================================================= inventory screens
  private returnTransientItems(): void {
    for (const grid of [this.craft2, this.craft3, this.runeSlots]) {
      for (let i = 0; i < grid.size; i++) {
        const s = grid.get(i);
        if (s) { const left = this.inventory.add(s); if (left > 0) this.dropStack({ ...s, count: left }); grid.slots[i] = null; }
      }
      grid.changed();
    }
    for (const out of [this.craftOut2, this.craftOut3]) { out.slots[0] = null; out.changed(); }
    if (this.cursor.stack) {
      const left = this.inventory.add(this.cursor.stack);
      if (left > 0) this.dropStack({ ...this.cursor.stack, count: left });
      this.cursor.stack = null;
    }
  }

  private makeHandler(): ScreenHandler {
    return new ScreenHandler(this.cursor, {
      onCraft: (r) => this.onCrafted(r),
      onFurnaceTake: (s, xp) => this.onFurnaceTake(s, xp),
      onDrop: (s) => { this.dropStack(s); this.progress.add('items_dropped', s.count); },
    });
  }

  private addPlayerSlots(h: ScreenHandler): void {
    h.addGroup('main', this.inventory, 9, 27);
    h.addGroup('hotbar', this.inventory, 0, 9);
  }

  openInventory(): void {
    if (this.player.creative) {
      const h = this.makeHandler();
      h.addGroup('armor', this.inventory, ARMOR_START, 4);
      h.addGroup('offhand', this.inventory, OFFHAND, 1);
      h.addCrafting(this.craft2, this.craftOut2, 2);
      this.addPlayerSlots(h);
      this.screen = h;
      this.openKind = 'creative';
    } else {
      const h = this.makeHandler();
      h.addCrafting(this.craft2, this.craftOut2, 2);
      h.addGroup('armor', this.inventory, ARMOR_START, 4);
      h.addGroup('offhand', this.inventory, OFFHAND, 1);
      this.addPlayerSlots(h);
      this.screen = h;
      this.openKind = 'inventory';
    }
    ui.set({ overlay: this.openKind });
  }

  openBlockUI(x: number, y: number, z: number, kind: 'crafting' | 'furnace' | 'chest' | 'runes'): void {
    const h = this.makeHandler();
    const key = posKey(x, y, z);
    if (kind === 'runes') {
      h.addGroup('rune_item', this.runeSlots, 0, 1);
      h.addGroup('rune_shards', this.runeSlots, 1, 1);
    } else if (kind === 'crafting') {
      h.addCrafting(this.craft3, this.craftOut3, 3);
    } else if (kind === 'chest') {
      let be = this.world.blockEntities.get(key) as ChestEntity | undefined;
      if (!be || be.type !== 'chest') { be = { type: 'chest', items: new Array(27).fill(null) }; this.world.blockEntities.set(key, be); }
      if (be.loot) {
        if (be.loot === 'dungeon') this.progress.grant('dungeon');
        if (be.loot === 'shrine') this.progress.grant('shrine');
        this.fillLoot(be, x, y, z);
        delete be.loot;
      }
      const c = new Container(27);
      c.slots = be.items;
      h.addGroup('chest', c, 0, 27);
      this.sound('chest_open', x + 0.5, y + 0.5, z + 0.5, 0.6);
      this.progress.grant('chest');
    } else {
      let be = this.world.blockEntities.get(key) as FurnaceEntity | undefined;
      if (!be || be.type !== 'furnace') {
        be = { type: 'furnace', items: [null, null, null], burnTime: 0, burnTotal: 0, cookTime: 0, xp: 0 };
        this.world.blockEntities.set(key, be);
        this.furnaces.add(key);
      }
      const c = new Container(3);
      c.slots = be.items;
      h.addGroup('furnace_in', c, 0, 1);
      h.addGroup('furnace_fuel', c, 1, 1);
      h.addGroup('furnace_out', c, 2, 1);
      const fe = be;
      h.furnaceXp = () => { const v = fe.xp; fe.xp = 0; return v; };
    }
    this.addPlayerSlots(h);
    this.screen = h;
    this.openPos = { x, y, z };
    this.openKind = kind;
    ui.set({ overlay: kind });
  }

  // ======================================================================= village life (1.8)
  /** A gift for a villager: food goes to the village store; it all raises the player's standing. */
  giveGift(v: Villager): void {
    const held = this.inventory.selectedStack;
    if (!held || !this.villages.gift(v, held.id)) return;
    const name = getItem(held.id).name;
    if (!this.player.creative) this.consume(this.inventory.selected);
    this.hand.swing();
    this.useDelay = 4;
    this.effect('heart', v.x, v.y + v.height + 0.3, v.z, 3);
    this.sound('villager_yes', v.x, v.y + v.height * 0.82, v.z, 0.6, v.isChild ? 1.5 : 1.15);
    pushChat(`${v.name} thanks you for the ${name.toLowerCase()}.`);
  }

  /**
   * Right-clicking with an explorer map looks at it. A map from the Creative
   * catalogue (not drawn yet) is drawn first, to the nearest place of its kind.
   */
  useMap(slot: number): void {
    const held = this.inventory.get(slot);
    if (!held) return;
    if (this.dim !== OVERWORLD) { pushChat('Maps only work on the surface'); return; }
    const kind = MAP_ITEMS[held.id];
    if (!held.map) {
      const p = this.player;
      const t = this.villages.findMapTarget(kind, p.x, p.z, null);
      if (!t) { pushChat(`There ${kind === 'village' ? 'are no other villages' : `are no ${kind}s`} near here to map.`); return; }
      held.map = t;
      this.inventory.changed();
      this.sound('page', p.x, p.eyeY, p.z, 0.6, 1);
    }
    this.mapSlot = slot;
    this.engine.openOverlay('map');
  }
  /** The hotbar slot of the map being looked at (map screen). */
  mapSlot = -1;

  /** Info card for the villager (or Sentinel) under the crosshair, and the compass of a held map. */
  private updateVillageUi(): void {
    const p = this.player;
    // ---- the info card: the villager (or Sentinel) within 8 blocks under the crosshair
    let card: import('../ui/uiStore').VillagerCard | null = null;
    if (!p.dead && ui.get().overlay === null) {
      const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
      const hit = this.entities.rayHitMob(p.x, p.eyeY, p.z, fx, fy, fz, 8);
      const blocked = hit && this.target && this.target.dist < hit.t;
      const m = hit && !blocked ? hit.mob : null;
      if (m instanceof Villager || m instanceof Sentinel) {
        const vid = m.villageId;
        const rep = this.villages.rep(vid);
        const st = this.villages.standing(vid);
        const village = vid ? this.villages.name(vid) : '';
        card = m instanceof Villager
          ? { name: m.name, title: m.title, activity: m.activity, village, standing: st.name, standingKey: st.key, rep, home: !!m.home, child: m.isChild }
          : { name: 'Sentinel', title: vid ? `Guardian of ${village}` : 'Guardian', activity: m.angry > 0 ? 'Angry with you' : 'On guard', village, standing: st.name, standingKey: st.key, rep, home: true, child: false };
      }
    }
    const cur = ui.get().villagerCard;
    if (JSON.stringify(cur) !== JSON.stringify(card)) ui.set({ villagerCard: card });
    // ---- a held map: which way, how far, and whether you're there
    const held = this.inventory.selectedStack;
    let mh: import('../ui/uiStore').MapHud | null = null;
    if (held && MAP_ITEMS[held.id]) {
      const t = held.map;
      if (this.dim !== OVERWORLD) mh = { label: getItem(held.id).name, text: 'Maps only work on the surface', arrow: null, found: false };
      else if (!t) mh = { label: getItem(held.id).name, text: 'Not drawn yet: right-click to draw it', arrow: null, found: false };
      else {
        const dx = t.x + 0.5 - p.x, dz = t.z + 0.5 - p.z, dist = Math.hypot(dx, dz), dy = t.y - p.y;
        const label = t.kind === 'village' ? `Village of ${t.name ?? '?'}` : t.kind === 'dungeon' ? 'Dungeon' : 'Ruin';
        const reached = dist < 5 && Math.abs(dy) < 4;
        if (reached && !t.found) {
          t.found = true;
          this.inventory.changed();
          pushChat(t.kind === 'village' ? `You have reached ${t.name}.` : `You found the ${t.kind} marked on your map!`);
          this.progress.grant('map');
          this.progress.add('maps_followed');
          this.sound('levelup', p.x, p.y, p.z, 0.5, 1.4);
        }
        let text: string;
        if (t.found && dist < 24) text = t.kind === 'village' ? 'You are here' : 'Found: this is the place';
        else if (dist < 6 && dy < -3) text = `Right below you: dig down about ${Math.round(-dy)} blocks`;
        else text = `${Math.round(dist)} blocks ${compassName(dx, dz)}${t.kind === 'dungeon' && dist < 40 ? `, ${Math.max(0, Math.round(-dy))} down` : ''}`;
        // the arrow: the target's direction relative to where the player is facing
        // (CSS turns clockwise: a target to the right of the view gives +90)
        const arrow = dist < 2 ? null : Math.round((((p.yaw - Math.atan2(-dx, -dz)) * 180) / Math.PI % 360 + 720) % 360);
        mh = { label, text, arrow, found: !!t.found };
      }
    }
    const curM = ui.get().mapHud;
    if (JSON.stringify(curM) !== JSON.stringify(mh)) ui.set({ mapHud: mh });
  }

  /** Right-clicking a villager with a job opens its trades. */
  openTrade(v: Villager): void {
    const h = this.makeHandler();
    this.addPlayerSlots(h);
    this.screen = h;
    this.openPos = null;
    this.openKind = 'trade';
    this.tradeWith = v;
    v.tradingWith = true;
    this.sound('villager', v.x, v.y + 1.6, v.z, 0.7, 1.1);
    ui.set({ overlay: 'trade' });
  }

  /**
   * What a trade costs the player, after the village's view of them (1.8): from 30%
   * less when Honoured to 30% more when Hostile - on Amber they pay and on goods the
   * villager buys alike.
   */
  tradeCost(v: Villager, t: Trade): { cost: [string, number]; cost2?: [string, number] } {
    const f = this.villages.priceFactor(v.villageId);
    const adj = (c: [string, number]): [string, number] => (f === 1 ? c : [c[0], Math.max(1, Math.round(c[1] * f))]);
    return { cost: adj(t.cost), cost2: t.cost2 ? adj(t.cost2) : undefined };
  }

  canTrade(v: Villager, i: number): boolean {
    const t = v.trades[i];
    if (!t || t.uses >= t.maxUses) return false;
    if (this.player.creative) return true;
    const { cost, cost2 } = this.tradeCost(v, t);
    return this.inventory.countItem(cost[0]) >= cost[1] && (!cost2 || this.inventory.countItem(cost2[0]) >= cost2[1]);
  }

  /** Performs trade `i` once (or as many times as possible with `all`). Returns the number done. */
  trade(v: Villager, i: number, all = false): number {
    let done = 0;
    while (this.canTrade(v, i) && (all || done === 0) && done < 64) {
      const t = v.trades[i];
      const { cost, cost2 } = this.tradeCost(v, t);
      const stack: ItemStack = { id: t.result[0], count: t.result[1], ...(t.ench ? { ench: { ...t.ench } } : {}) };
      // a map is drawn as it is sold: to the nearest place this village hasn't mapped yet
      const mapKind = MAP_ITEMS[stack.id];
      if (mapKind) {
        const plan = v.villageId ? this.villages.plan(v.villageId) : null;
        const target = this.villages.findMapTarget(mapKind, plan?.x ?? v.x, plan?.z ?? v.z, v.villageId);
        if (!target) {
          pushChat(`${v.name} doesn't know of any ${mapKind === 'village' ? 'other villages' : mapKind + 's'} near here.`);
          break;
        }
        stack.map = { ...target, name: target.name ?? this.villages.name(v.villageId) };
        this.villages.markMapped(v.villageId, target);
      }
      if (!this.player.creative) {
        this.inventory.consumeItem(cost[0], cost[1]);
        if (cost2) this.inventory.consumeItem(cost2[0], cost2[1]);
      }
      const left = this.inventory.add(stack);
      if (left > 0) this.dropStack({ ...stack, count: left });
      t.uses++;
      done++;
      const levelled = v.gainXp(t.xp);
      this.spawnXp(3 + Math.floor(Math.random() * 4), v.x, v.y + 1, v.z);
      if (levelled) { this.effect('happy', v.x, v.y + 2, v.z, 12); this.sound('levelup', v.x, v.y + 1, v.z, 0.6, 1.3); }
    }
    if (done) {
      this.progress.grant('trade');
      this.progress.add('trades', done);
      this.villages.onTrade(v, done);
      this.sound('villager_yes', v.x, v.y + 1.6, v.z, 0.7, 1);
      this.inventory.changed();
    } else this.sound('villager_no', v.x, v.y + 1.6, v.z, 0.6, 1);
    return done;
  }

  closeScreen(): void {
    if (this.openKind === 'chest' && this.openPos) this.sound('chest_close', this.openPos.x + 0.5, this.openPos.y + 0.5, this.openPos.z + 0.5, 0.6);
    if (this.tradeWith) { this.tradeWith.tradingWith = false; this.tradeWith = null; }
    this.returnTransientItems();
    this.screen = null;
    this.openPos = null;
    this.openKind = null;
  }

  private fillLoot(be: ChestEntity, x: number, y: number, z: number): void {
    const rng = mulberry32(hash4(this.world.seed, x, y, z));
    if (be.loot === 'dungeon') { this.fillDungeonLoot(be, rng); return; }
    if (be.loot === 'shrine') { this.fillShrineLoot(be, rng); return; }
    if (be.loot === 'starfall') { this.fillStarfallLoot(be, rng); return; }
    const table: [string, number, number, number][] = be.loot === 'village' ? [
      ['bread', 1, 4, 0.7], ['wheat', 2, 8, 0.5], ['wheat_seeds', 2, 6, 0.5], ['carrot', 1, 5, 0.5], ['apple', 1, 3, 0.4],
      ['amber', 1, 3, 0.45], ['torch', 2, 6, 0.4], ['iron_ingot', 1, 2, 0.2], ['stone_hoe', 1, 1, 0.15], ['bone_meal', 2, 6, 0.3],
      ['wool', 1, 3, 0.25], ['coal', 1, 4, 0.3],
    ] : [
      ['coal', 2, 8, 0.7], ['iron_ingot', 1, 3, 0.45], ['raw_iron', 1, 4, 0.5], ['apple', 1, 3, 0.5],
      ['torch', 2, 6, 0.5], ['bone', 1, 4, 0.4], ['string', 1, 3, 0.35], ['arrow', 4, 8, 0.3],
      ['leather', 1, 3, 0.3], ['bow', 1, 1, 0.12], ['iron_pickaxe', 1, 1, 0.06], ['stone_sword', 1, 1, 0.2],
      ['cooked_porkchop', 1, 3, 0.3], ['iron_helmet', 1, 1, 0.08],
    ];
    for (const [id, a, b, chance] of table) {
      if (rng() > chance) continue;
      const slot = Math.floor(rng() * 27);
      if (be.items[slot]) continue;
      be.items[slot] = makeStack(id, a + Math.floor(rng() * (b - a + 1)));
    }
  }

  /** Dungeon chests: food, bones and string from the creatures, iron, a little treasure. */
  private fillDungeonLoot(be: ChestEntity, rng: () => number): void {
    const table: [string, number, number, number][] = [
      ['bread', 1, 3, 0.5], ['spoiled_flesh', 2, 5, 0.5], ['bone', 2, 6, 0.6], ['string', 2, 5, 0.5],
      ['coal', 3, 8, 0.5], ['iron_ingot', 1, 4, 0.5], ['wheat', 2, 5, 0.3], ['apple', 1, 3, 0.3],
      ['arrow', 6, 12, 0.35], ['bucket', 1, 1, 0.25], ['rune_shard', 1, 3, 0.35], ['amber', 2, 6, 0.4],
      ['bow', 1, 1, 0.15], ['iron_chestplate', 1, 1, 0.08], ['iron_helmet', 1, 1, 0.08],
    ];
    let filled = 0;
    const put = (st: ItemStack) => {
      for (let tries = 0; tries < 8; tries++) {
        const slot = Math.floor(rng() * 27);
        if (be.items[slot]) continue;
        be.items[slot] = st;
        filled++;
        return;
      }
    };
    for (const [id, a, b, chance] of table) if (rng() <= chance) put(makeStack(id, a + Math.floor(rng() * (b - a + 1))));
    // the prize: an iron tool or sword already carved with a rune
    const r = rng();
    if (r < 0.14) put({ ...makeStack('iron_pickaxe'), ench: { [rng() < 0.5 ? 'swift' : 'sturdy']: 1 + Math.floor(rng() * 2) } });
    else if (r < 0.28) put({ ...makeStack('iron_sword'), ench: { [rng() < 0.5 ? 'plunder' : 'keen']: 1 + Math.floor(rng() * 2) } });
    if (filled === 0) put(makeStack('bone', 3));
  }

  private onCrafted(r: ItemStack): void {
    this.progress.add('items_crafted', r.count);
    const g = (id: string) => this.progress.grant(id);
    if (r.id === 'planks') g('planks');
    if (r.id === 'crafting_table') g('table');
    if (r.id === 'wooden_pickaxe') g('pickaxe');
    if (r.id === 'stone_pickaxe') g('stone_pick');
    if (r.id === 'iron_pickaxe') g('iron_pick');
    if (r.id === 'furnace') g('furnace');
    if (r.id === 'cinder_charm') g('charm');
    if (r.id.endsWith('_sword')) g('sword');
    if (r.id.endsWith('_wool') || r.id.endsWith('_dye')) g('dye');
    if (r.color !== undefined) g('dye_armour');
    this.sound('click', undefined, undefined, undefined, 0.3, 1.4);
  }

  private onFurnaceTake(s: ItemStack, xp: number): void {
    if (s.id === 'iron_ingot') this.progress.grant('iron');
    if (xp > 0) {
      const whole = Math.floor(xp) + (Math.random() < xp % 1 ? 1 : 0);
      if (whole > 0) this.addXp(whole);
    }
  }

  // ======================================================================= helpers
  private eye(): [number, number, number] {
    return [this.player.x, this.player.eyeY, this.player.z];
  }

  lookDir(): [number, number, number] {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  }

  dropStack(stack: ItemStack): ItemEntity {
    const [ex, ey, ez] = this.eye();
    const [dx, dy, dz] = this.lookDir();
    return this.entities.spawnItem(stack, ex + dx * 0.3, ey - 0.3, ez + dz * 0.3, [dx * 0.3 + (Math.random() - 0.5) * 0.02, dy * 0.3 + 0.1, dz * 0.3 + (Math.random() - 0.5) * 0.02], 40);
  }

  private scatter(stack: ItemStack, x: number, y: number, z: number): void {
    this.entities.spawnItem(stack, x, y, z, [(Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.2, (Math.random() - 0.5) * 0.4], 40);
  }

  private reach(): number {
    return this.player.creative ? 5 : 4.5;
  }

  private schedule(x: number, y: number, z: number, delay: number): void {
    const k = posKey(x, y, z);
    const due = this.tickCount + delay;
    const cur = this.scheduled.get(k);
    if (cur === undefined || cur > due) this.scheduled.set(k, due);
  }

  private onBlockChanged(x: number, y: number, z: number, old: number, id: number, cause = 'player'): void {
    // neighbours may need to react (falling sand, plants/torches/doors losing support, water)
    this.schedule(x, y + 1, z, 2);
    this.schedule(x, y - 1, z, 2);
    this.schedule(x + 1, y, z, 2); this.schedule(x - 1, y, z, 2);
    this.schedule(x, y, z + 1, 2); this.schedule(x, y, z - 1, 2);
    this.fluids.onBlockChanged(x, y, z, this.tickCount);
    if (id === B.SAND || id === B.GRAVEL) this.schedule(x, y, z, 2);
    if (id !== B.DEEPGATE && id !== B.STARGATE) this.checkGatesAround(x, y, z);
    if (B.GATE_RING.includes(id) && cause === 'player') this.lightWaitingTorch(x, y, z);
    if (B.getBlock(old).interact === 'furnace' && B.getBlock(id).interact !== 'furnace') this.furnaces.delete(posKey(x, y, z));
    if (B.getBlock(old).interact === 'sign' || B.getBlock(id).interact === 'sign') this.signs.refresh();
    if (id === B.SPAWNER || old === B.SPAWNER) this.spawners.onBlockChanged(x, y, z, old, id, cause);
    if (id === B.BELL || old === B.BELL) this.villages.onBlockChanged(x, y, z, old, id);
  }

  private runScheduled(): void {
    if (this.scheduled.size === 0) return;
    const due: string[] = [];
    for (const [k, t] of this.scheduled) if (t <= this.tickCount) due.push(k);
    for (const k of due) {
      this.scheduled.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      const b = this.world.getBlock(x, y, z);
      if (b === UNLOADED) continue;
      if (b === B.SAND || b === B.GRAVEL) {
        const below = this.world.getBlock(x, y - 1, z);
        if (y > 0 && below !== UNLOADED && (below === B.AIR || B.IS_WATER[below] || B.getBlock(below).replaceable && !B.IS_SOLID[below])) {
          this.world.setBlock(x, y, z, B.AIR, 'physics');
          this.world.setBlock(x, y - 1, z, b, 'physics');
          this.schedule(x, y - 1, z, 1);
        }
      } else if (needsSupport(b) && !supportOk(this.world, b, x, y, z)) {
        this.breakBlockAt(x, y, z, true, false);
      } else if (B.IS_FARMLAND(b)) {
        const above = this.world.getBlock(x, y + 1, z);
        if (above !== UNLOADED && B.IS_SOLID[above]) this.world.setBlock(x, y, z, B.DIRT, 'physics');
      }
    }
  }

  // ======================================================================= water
  /** Currents push the player along (toward weaker water and drops); falling water pushes down. */
  private pushByCurrent(): void {
    const p = this.player;
    let fx = 0, fz = 0, falling = false;
    for (const dy of [0, 1]) {
      const [x, z, f] = waterFlow(this.world, Math.floor(p.x), Math.floor(p.y + dy * 0.9), Math.floor(p.z));
      fx += x; fz += z; falling ||= f;
    }
    const l = Math.hypot(fx, fz);
    if (l > 0) { p.vx += (fx / l) * 0.014; p.vz += (fz / l) * 0.014; }
    if (falling && !this.engine.input.isDown('Space')) p.vy -= 0.02;
  }

  /** A plant or torch in the way of flowing water drops as an item. */
  private washOut(x: number, y: number, z: number, id: number): void {
    const def = B.getBlock(id);
    for (const d of def.drops) {
      if (d.chance !== undefined && Math.random() > d.chance) continue;
      const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (n > 0) this.entities.spawnItem({ id: d.item, count: n }, x + 0.5, y + 0.3, z + 0.5);
    }
  }

  /** A plant or torch in the way of lava burns up. */
  private burnOut(x: number, y: number, z: number): void {
    this.sound('fizz', x + 0.5, y + 0.5, z + 0.5, 0.4, 1.3);
    this.effect('smoke', x + 0.5, y + 0.4, z + 0.5, 4);
  }

  /** Lava and water met: a hiss, a puff of steam, and maybe an advancement. */
  private onFluidsMeet(x: number, y: number, z: number, formed: number): void {
    this.sound('fizz', x + 0.5, y + 0.5, z + 0.5, 0.7, 0.8 + Math.random() * 0.3);
    this.effect('smoke', x + 0.5, y + 1.05, z + 0.5, 8);
    const p = this.player;
    if (formed === B.CINDERSTONE && !p.dead && Math.hypot(p.x - x - 0.5, p.y - y, p.z - z - 0.5) < 12) this.progress.grant('cinder');
  }

  /**
   * Lava lakes near the player glow, pop and spit the odd ember: a few random
   * cells around the player are sampled every tick (cheap, and busier near lots of lava).
   */
  private tickLavaAmbience(): void {
    const p = this.player;
    for (let n = 0; n < 6; n++) {
      const x = Math.floor(p.x + (Math.random() - 0.5) * 24), z = Math.floor(p.z + (Math.random() - 0.5) * 24);
      const y = Math.floor(p.y + (Math.random() - 0.5) * 16);
      const id = this.world.getBlock(x, y, z);
      if (!B.IS_LAVA[id] || B.FLUID_LEVEL[id] !== 0 || this.world.getBlock(x, y + 1, z) !== B.AIR) continue;
      this.effect('flame', x + Math.random(), y + 1, z + Math.random(), 1);
      if (Math.random() < 0.15) this.sound('lava_pop', x + 0.5, y + 1, z + 0.5, 0.35, 0.8 + Math.random() * 0.4);
    }
    // the Cinderdeep groans now and then, and ash drifts in the air
    if (this.dim === 'cinderdeep') {
      if (Math.random() < 1 / 600) this.sound('deep_rumble', p.x + (Math.random() - 0.5) * 30, p.y - 6, p.z + (Math.random() - 0.5) * 30, 0.8, 0.8 + Math.random() * 0.4);
      if (this.tickCount % 3 === 0) this.effect('ash', p.x + (Math.random() - 0.5) * 20, p.y + (Math.random() - 0.3) * 10, p.z + (Math.random() - 0.5) * 20, 1);
    }
  }

  /** Re-schedules flowing water saved in a chunk's changes when the chunk loads. */
  private wakeWater(c: Chunk): void {
    const d = this.world.deltas.get(chunkKey(c.cx, c.cz));
    if (!d) return;
    for (const [i, id] of d) {
      if (!B.IS_FLUID[id] || c.blocks[i] !== id) continue;
      const x = c.cx * 16 + (i & 15), z = c.cz * 16 + ((i >> 4) & 15), y = i >> 8;
      this.fluids.schedule(x, y, z, this.tickCount, 10);
    }
    void localIndex;
  }

  // ======================================================================= doors and beds
  toggleDoor(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    const d = B.getBlock(id);
    if (d.shape !== 'door' || !d.facing || !d.hinge) return;
    const open = !d.open;
    const lowerY = d.half === 'lower' ? y : y - 1;
    this.world.setBlock(x, lowerY, z, B.doorId('lower', d.facing, open, d.hinge), 'player');
    if (B.getBlock(this.world.getBlock(x, lowerY + 1, z)).shape === 'door') this.world.setBlock(x, lowerY + 1, z, B.doorId('upper', d.facing, open, d.hinge), 'player');
    this.sound(open ? 'door_open' : 'door_close', x + 0.5, y + 0.5, z + 0.5, 0.7, 0.9 + Math.random() * 0.2);
  }

  /** Right-clicking a bed: set the respawn point and, at night, sleep until morning. */
  trySleep(x: number, y: number, z: number): void {
    const p = this.player;
    if (this.dim === 'cinderdeep') { pushChat('It is far too hot to sleep down here'); return; }
    if (this.dim === 'starhollow') { pushChat('There is no night to sleep through up here, only the stars'); return; }
    const id = this.world.getBlock(x, y, z);
    const d = B.getBlock(id);
    if (d.shape !== 'bed' || !d.facing) return;
    const [fx, fz] = B.FACING_VEC[d.facing];
    const foot = d.half === 'foot' ? { x, y, z } : { x: x - fx, y, z: z - fz };
    if (Math.hypot(foot.x + 0.5 - p.x, foot.z + 0.5 - p.z) > 4) { pushChat('You are too far away from the bed'); return; }
    const set = !p.bed || p.bed.x !== foot.x || p.bed.y !== foot.y || p.bed.z !== foot.z;
    p.bed = foot;
    if (set) pushChat('Respawn point set');
    if (!this.dayNight.isNight() && !this.weather.stormy) { pushChat('You can only sleep at night or during a thunderstorm'); return; }
    for (const e of this.entities.list) {
      if (e instanceof Mob && e.alive && e.spec.hostile && Math.hypot(e.x - p.x, e.z - p.z) < 8 && Math.abs(e.y - p.y) < 5) {
        pushChat('You may not rest now, there are monsters nearby');
        return;
      }
    }
    this.sleepTicks = 1;
    this.sleepBed = foot;
    const head = { x: foot.x + fx, z: foot.z + fz };
    p.setPosition((foot.x + head.x) / 2 + 0.5, y + 0.5625, (foot.z + head.z) / 2 + 0.5);
    p.yaw = Math.atan2(fx, fz);
    p.pitch = 0;
    this.breaking = null;
    this.engine.input.exitLock();
    ui.set({ overlay: 'sleep', sleep: 0 });
    this.progress.grant('sleep');
  }

  private tickSleep(): void {
    this.sleepTicks++;
    ui.set({ sleep: Math.min(1, this.sleepTicks / 80) });
    const bed = this.sleepBed;
    if (bed && B.getBlock(this.world.getBlock(bed.x, bed.y, bed.z)).shape !== 'bed') { this.wake(false); return; }
    if (this.sleepTicks >= 100) this.wake(true);
  }

  /** Leaves the bed; `morning` skips the night (after a full sleep). */
  wake(morning: boolean): void {
    if (this.sleepTicks === 0) return;
    this.sleepTicks = 0;
    const p = this.player;
    const bed = this.sleepBed;
    this.sleepBed = null;
    if (morning) {
      const dn = this.dayNight;
      dn.time = dn.time - dn.timeOfDay + 24000;
      dn.day++;
      this.wasNight = false;
      this.progress.grant('night');
      pushChat(`Good morning! Day ${dn.day + 1}`);
      // sleeping through the night (or a storm) also clears the weather
      if (this.weather.kind !== 'clear') this.weather.set('clear', undefined, true);
    }
    if (bed) {
      const spot = this.freeSpotNear(bed.x, bed.y, bed.z);
      p.setPosition(spot.x, spot.y, spot.z);
    }
    if (ui.get().overlay === 'sleep') ui.set({ overlay: null, sleep: 0 });
    this.engine.closeOverlay?.();
  }

  /** A standing spot next to (or on) a block: used when leaving a bed and respawning at one. */
  private freeSpotNear(x: number, y: number, z: number): { x: number; y: number; z: number } {
    const free = (ax: number, ay: number, az: number) =>
      !B.IS_SOLID[this.world.getBlock(ax, ay, az)] && !B.IS_SOLID[this.world.getBlock(ax, ay + 1, az)] &&
      B.IS_SOLID[this.world.getBlock(ax, ay - 1, az)] && this.world.getBlock(ax, ay, az) !== UNLOADED;
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1], [0, 2], [2, 0], [0, -2], [-2, 0]]) {
      for (const dy of [0, 1, -1]) if (free(x + dx, y + dy, z + dz)) return { x: x + dx + 0.5, y: y + dy, z: z + dz + 0.5 };
    }
    return { x: x + 0.5, y: y + 0.5625, z: z + 0.5 };
  }

  // ======================================================================= tick
  tick(): void {
    if (this.paused || !this.started) return;
    this.tickCount++;
    const input = this.engine.input;
    const p = this.player;
    const inGame = ui.get().overlay === null;

    // ---- keys
    if (inGame) {
      for (let i = 0; i < 9; i++) if (input.consumePress(HOTBAR_KEYS[i])) this.select(i);
      const w = input.takeWheel();
      if (w !== 0) this.select((this.inventory.selected + (w > 0 ? 1 : -1) + 9) % 9);
      if (input.consumePress('KeyQ')) this.dropSelected(input.isDown('ControlLeft') || input.isDown('MetaLeft'));
      if (input.consumePress('KeyF')) this.swapOffhand();
    }

    // ---- movement
    const jumpDown = inGame && input.isDown('Space');
    // taps are taken from the key-press queue so quick double taps are never missed
    for (let n = input.consumePresses('Space'); n > 0 && inGame; n--) {
      if (p.creative && this.jumpTap > 0) { p.flying = !p.flying; if (p.flying) { p.vy = 0; p.gliding = false; } this.jumpTap = 0; }
      else if (this.canStartGlide()) { p.gliding = true; this.glideTicks = 0; this.sound('glide', p.x, p.y + 1, p.z, 0.6, 1); this.jumpTap = input.touchMode ? 10 : 7; }
      else this.jumpTap = input.touchMode ? 10 : 7; // a thumb on glass double-taps a little slower than a finger on a key
    }
    this.tickGlide();
    for (let n = input.consumePresses('KeyW'); n > 0 && inGame; n--) {
      if (this.forwardTap > 0) p.sprinting = true;
      this.forwardTap = 7;
    }
    if (this.jumpTap > 0) this.jumpTap--;
    if (this.forwardTap > 0) this.forwardTap--;
    const move: MoveInput = {
      forward: inGame && !p.dead ? (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0) : 0,
      strafe: inGame && !p.dead ? (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0) : 0,
      jump: jumpDown && !p.dead,
      sneak: inGame && (input.isDown('ShiftLeft') || input.isDown('ShiftRight') || input.sneakLatch),
      sprint: inGame && (input.isDown('ControlLeft') || input.isDown('ControlRight')),
    };
    // the on-screen joystick gives analog movement (and sprints when pushed past its rim)
    const stick = input.stick;
    if (stick && inGame && !p.dead) {
      move.forward = stick.forward;
      move.strafe = stick.strafe;
      if (stick.sprint) move.sprint = true;
    }
    if (this.autopilot) Object.assign(move, this.autopilot);
    if (this.eatTicks > 0 || this.bowTicks > 0) { move.forward *= 0.2; move.strafe *= 0.2; move.sprint = false; p.sprinting = false; }
    if (this.sleepTicks > 0) { move.forward = 0; move.strafe = 0; move.jump = false; move.sneak = false; move.sprint = false; }
    // ---- in a boat: W/S row, A/D turn, Shift (the Sneak button) climbs out
    if (this.riding && (this.riding.removed || p.dead)) this.dismount();
    if (this.riding && inGame && (input.consumePress('ShiftLeft') || input.consumePress('ShiftRight'))) this.dismount();
    if (this.riding) {
      this.riding.control.forward = inGame ? move.forward : 0;
      this.riding.control.turn = inGame ? move.strafe : 0;
    } else {
      const wasInWater = p.inWater;
      if (p.inWater && !p.flying && this.sleepTicks === 0) this.pushByCurrent();
      if (this.sleepTicks === 0) p.tickMovement(this.world, move);
      else { p.prevX = p.x; p.prevY = p.y; p.prevZ = p.z; }
      if (!wasInWater && p.inWater && p.vy < -0.3) { this.sound('splash', p.x, p.y, p.z, 0.5); this.effect('splash', p.x, p.y + 0.5, p.z, 12); }
      this.footsteps();
    }

    // ---- survival rules
    if (!p.dead) this.tickSurvival();
    // ---- 2.2: the Starhollow's rules (the Hollowdrake, the Storm Bells, Drifters, the void)
    if (this.star && !p.dead) this.star.tick();

    // ---- interaction
    this.tickInteraction(inGame);

    // ---- world systems
    this.dayNight.tick(this.rules.doDaylightCycle);
    this.weather.tick(this.rules.doWeatherCycle);
    this.tickWeather();
    this.entities.mobSpawning = this.rules.doMobSpawning;
    this.entities.tick(this);
    if (this.riding) this.carryRider();
    this.tickFishing();
    this.villages.tick();
    if (this.tickCount % 4 === 0) this.updateVillageUi();
    // the trade screen closes if the villager dies or you walk away
    const tw = this.tradeWith;
    if (tw && ui.get().overlay === 'trade' && (!tw.alive || tw.removed || tw.distanceTo(p.x, p.y, p.z) > 8)) this.engine.closeOverlay();
    this.tickFurnaces();
    this.runScheduled();
    this.fluids.tick(this.tickCount);
    this.spawners.tick();
    this.tickLavaAmbience();
    this.tickRandom();
    if (this.sleepTicks > 0) this.tickSleep();
    this.particles.tick((x, y, z) => B.IS_SOLID[this.world.getBlock(x, y, z)] === 1 && this.world.getBlock(x, y, z) !== UNLOADED);
    this.hand.tick(this.inventory.selectedStack);
    this.progress.add('play_time');
    if (p.hurtTime > 0) p.hurtTime--;
    if (p.invulnerable > 0) p.invulnerable--;

    // ---- milestones
    if (this.dim === OVERWORLD && p.y < 20) this.progress.grant('deep');
    if (this.dim === OVERWORLD && p.y > 105) this.progress.grant('summit');
    this.tickGate();
    const night = this.dayNight.isNight();
    if (this.wasNight && !night && !p.dead) this.progress.grant('night');
    this.wasNight = night;

    if (++this.autosaveTimer >= 60 * TICKS_PER_SECOND) {
      this.autosaveTimer = 0;
      void this.save();
    }
    if (++this.musicTimer >= 20) { this.musicTimer = 0; this.engine.audio.updateMusic(1, night, this.dim === 'cinderdeep' ? 'deep' : this.dim === 'starhollow' ? 'star' : false); }
    this.pushHud(false);
  }

  /** Hotbar slot chosen by tapping it (touch controls). */
  selectSlot(i: number): void {
    this.select(Math.max(0, Math.min(8, i)));
    this.pushHud(true);
  }

  /** Drops one of the held item (touch controls: long press on the hotbar). */
  /** Touch: drops one of the selected item (long press on the hotbar); returns what was dropped. */
  dropOne(): { item: ItemEntity; slot: number } | null {
    const slot = this.inventory.selected;
    const item = this.dropSelected(false);
    return item ? { item, slot } : null;
  }

  /** Touch: puts back an item dropped by a long press that turned out to be a quick tap
   *  (a slow frame let the long-press timer run before the lift was seen). */
  takeBackDrop(d: { item: ItemEntity; slot: number }): boolean {
    const e = d.item;
    if (e.removed || this.player.dead) return false;
    const cur = this.inventory.get(d.slot);
    if (cur && (!stacksMatch(cur, e.stack) || cur.count + e.stack.count > maxStackOf(cur.id))) return false;
    this.inventory.slots[d.slot] = cur ? { ...cur, count: cur.count + e.stack.count } : cloneStack(e.stack);
    this.inventory.changed();
    e.removed = true;
    this.progress.add('items_dropped', -e.stack.count);
    return true;
  }

  private select(i: number): void {
    if (i === this.inventory.selected) return;
    this.inventory.selected = i;
    this.breaking = null;
    this.eatTicks = 0;
    this.bowTicks = 0;
    this.inventory.changed();
  }

  private dropSelected(all: boolean): ItemEntity | null {
    const i = this.inventory.selected;
    const s = this.inventory.get(i);
    if (!s || this.player.dead) return null;
    const out = this.inventory.take(i, all ? s.count : 1);
    if (!out) return null;
    const e = this.dropStack(out);
    this.progress.add('items_dropped', out.count);
    this.hand.swing();
    return e;
  }

  private swapOffhand(): void {
    const i = this.inventory.selected;
    const a = this.inventory.get(i), b = this.inventory.get(OFFHAND);
    this.inventory.slots[i] = b;
    this.inventory.slots[OFFHAND] = a;
    this.inventory.changed();
  }

  private footsteps(): void {
    const p = this.player;
    if (!p.onGround || p.sneaking || p.flying || p.inWater) return;
    const d = p.walkDist - p.prevWalkDist;
    this.stepDist += d;
    if (this.stepDist > 1.1) {
      this.stepDist = 0;
      const b = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
      if (b !== B.AIR && b !== UNLOADED) this.sound('step:' + B.getBlock(b).sound, p.x, p.y, p.z, 0.4, 0.9 + Math.random() * 0.2);
    }
  }

  private onLanded(dist: number): void {
    const p = this.player;
    this.progress.add('fall', dist * 100);
    const bx = Math.floor(p.x), by = Math.floor(p.y - 0.05), bz = Math.floor(p.z);
    const under = this.world.getBlock(bx, by, bz);
    if (B.IS_FARMLAND(under) && dist > 1 && !p.flying) this.world.setBlock(bx, by, bz, B.DIRT, 'player');
    if (p.creative || p.inWater) return;
    let dmg = Math.ceil(dist - 3);
    if (under === B.HAY_BALE) dmg = Math.floor(dmg * 0.2);
    if (dmg > 0) {
      this.sound('fall', p.x, p.y, p.z, 0.8);
      this.damagePlayer(dmg, { x: p.x, y: p.y, z: p.z, kind: 'fall' });
    }
  }

  private tickSurvival(): void {
    const p = this.player;
    if (p.creative) { p.air = 300; p.fireTicks = 0; return; }
    this.tickFire();
    // cactus spines
    if (this.tickCount % 10 === 0) {
      const b = p.box, e = 0.02;
      const probe = new AABB(b.minX - e, b.minY - e, b.minZ - e, b.maxX + e, b.maxY, b.maxZ + e);
      let touching = false;
      for (let y = Math.floor(probe.minY); y <= Math.floor(probe.maxY) && !touching; y++) {
        for (let z = Math.floor(probe.minZ); z <= Math.floor(probe.maxZ) && !touching; z++) {
          for (let x = Math.floor(probe.minX); x <= Math.floor(probe.maxX) && !touching; x++) {
            if (this.world.getBlock(x, y, z) === B.CACTUS && probe.intersects(new AABB(x + 1 / 16, y, z + 1 / 16, x + 15 / 16, y + 1, z + 15 / 16))) touching = true;
          }
        }
      }
      if (touching) this.damagePlayer(1, { x: p.x, y: p.y, z: p.z, kind: 'cactus' });
    }
    // exhaustion -> saturation -> food
    if (p.exhaustion > 4) {
      p.exhaustion -= 4;
      if (p.saturation > 0) p.saturation = Math.max(0, p.saturation - 1);
      else if (this.difficulty !== 'peaceful') p.food = Math.max(0, p.food - 1);
    }
    if (this.difficulty === 'peaceful') {
      if (this.tickCount % 20 === 0 && p.health < 20) p.health = Math.min(20, p.health + 1);
      if (this.tickCount % 20 === 0 && p.food < 20) p.food++;
    } else if (p.food >= 18 && p.health < 20 && this.rules.naturalRegeneration) {
      if (++p.regenTimer >= 80) { p.regenTimer = 0; p.health = Math.min(20, p.health + 1); p.addExhaustion(6); }
    } else if (p.food <= 0) {
      if (++p.starveTimer >= 80) {
        p.starveTimer = 0;
        const floor = this.difficulty === 'easy' ? 10 : this.difficulty === 'normal' ? 1 : 0;
        if (p.health > floor) this.damagePlayer(1, { x: p.x, y: p.y, z: p.z, kind: 'starve' });
      }
    } else { p.regenTimer = 0; p.starveTimer = 0; }
    // air / drowning
    if (p.eyeInWater) {
      p.air--;
      if (p.air <= -20) {
        p.air = 0;
        this.damagePlayer(2, { x: p.x, y: p.y, z: p.z, kind: 'drown' });
      }
    } else if (p.air < 300) p.air = Math.min(300, p.air + 4);
    if (p.y < -30) this.damagePlayer(4, { x: p.x, y: p.y, z: p.z, kind: 'void' });
  }

  /**
   * Lava: 2 hearts every half second (armour helps a little) and it sets you alight
   * for 15 seconds. Burning costs half a heart a second (armour doesn't help) until
   * it burns out or water or rain puts it out.
   */
  private tickFire(): void {
    const p = this.player;
    if (this.riding) return;
    if (p.touchingLava) {
      p.fireTicks = this.hasCharm() ? 100 : 300;
      if (this.tickCount % 10 === 0) this.damagePlayer(4, { x: p.x, y: p.y, z: p.z, kind: 'lava' });
      if (this.tickCount % 6 === 0) this.sound('lava_pop', p.x, p.y + 0.5, p.z, 0.3, 1.2);
    } else if (p.fireTicks > 0) {
      if (p.inWater || p.eyeInWater || this.rainingOn(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z))) {
        p.fireTicks = 0;
        this.sound('fizz', p.x, p.y + 1, p.z, 0.6, 1.1);
        this.effect('smoke', p.x, p.y + 1, p.z, 8);
        return;
      }
      if (this.hasCharm() && p.fireTicks > 100) p.fireTicks = 100;   // the charm puts fire out sooner
      p.fireTicks--;
      if (p.fireTicks % 20 === 0) this.damagePlayer(1, { x: p.x, y: p.y, z: p.z, kind: 'burn' });
    }
  }

  private die(kind: string): void {
    const p = this.player;
    p.dead = true;
    p.health = 0;
    p.fireTicks = 0;
    this.breaking = null;
    this.progress.add('deaths');
    const messages: Record<string, string> = {
      fall: 'You hit the ground too hard', mob: 'You were slain by a creature', arrow: 'You were shot by a Bone Archer',
      drown: 'You drowned', starve: 'You starved to death', void: 'You fell out of the world', cactus: 'You were pricked to death',
      lightning: 'You were struck by lightning', hound: 'You were mauled by a pack of Fellhounds',
      lava: 'You sank into the lava', burn: 'You burned to death', ember: 'You were burned by a Smoulderer\'s ember',
    };
    const score = p.xpTotal;
    if (this.screen) this.closeScreen();
    if (!this.rules.keepInventory) {
      for (let i = 0; i < this.inventory.size; i++) {
        const s = this.inventory.get(i);
        if (s) this.scatter(s, p.x, p.y + 1, p.z);
        this.inventory.slots[i] = null;
      }
      this.inventory.changed();
      const xp = Math.min(100, p.xpLevel * 7);
      if (xp > 0) this.spawnXp(xp, p.x, p.y + 1, p.z);
      p.xpLevel = 0; p.xpProgress = 0; p.xpTotal = 0;
    }
    this.engine.input.exitLock();
    ui.set({ overlay: 'death', deathMessage: messages[kind] ?? 'You died', score });
  }

  respawn(): void {
    const p = this.player;
    if (this.dim !== OVERWORLD && this.engine.changeDimension) {
      // dying down there: you wake up at home on the surface
      void this.engine.changeDimension(OVERWORLD, { kind: 'respawn' });
      return;
    }
    p.dead = false;
    p.health = 20; p.food = 20; p.saturation = 5; p.exhaustion = 0; p.air = 300;
    p.flying = false;
    p.invulnerable = 60;
    const bed = p.bed;
    if (bed && this.world.isLoaded(bed.x, bed.z) && B.getBlock(this.world.getBlock(bed.x, bed.y, bed.z)).shape === 'bed') {
      const spot = this.freeSpotNear(bed.x, bed.y, bed.z);
      p.setPosition(spot.x, spot.y, spot.z);
    } else {
      if (bed) { pushChat('Your home bed was missing or obstructed'); p.bed = null; }
      const top = this.world.isLoaded(Math.floor(p.spawnX), Math.floor(p.spawnZ)) ? this.world.highestSolid(Math.floor(p.spawnX), Math.floor(p.spawnZ)) : -1;
      p.setPosition(p.spawnX, top > 0 ? top + 1 : p.spawnY, p.spawnZ);
    }
    ui.set({ overlay: null });
    this.pushHud(true);
  }

  // ======================================================================= 2.0: Deepgates and the Cinderdeep
  /** Is a Cinder Charm held in the off hand? */
  hasCharm(): boolean {
    return this.inventory.get(OFFHAND)?.id === 'cinder_charm';
  }

  /** Ticks of standing in a Deepgate before it carries you away (3 s; 1 s in Creative). */
  gateTime(): number {
    return this.player.creative ? 20 : 60;
  }

  /** The eight cells round a gate's centre. */
  private static readonly RING: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  /** A complete ring of Cinderstone (or, 2.2, of Glimmerstone for a Stargate) round (x, y, z), with something solid underneath the centre. */
  gateRingComplete(x: number, y: number, z: number, ring: number[] = B.GATE_RING): boolean {
    if (!B.IS_SOLID[this.world.getBlock(x, y - 1, z)]) return false;
    for (const [dx, dz] of Game.RING) if (!ring.includes(this.world.getBlock(x + dx, y, z + dz))) return false;
    return true;
  }

  /**
   * 2.2: a Star Lens used on the open middle of a ring of eight Glimmerstone lights a
   * Stargate (on the surface, or in the Starhollow; the Cinderdeep is too far from the
   * stars). Used on the Roost's gate after a victory it calls the Hollowdrake back.
   */
  private tryLightStargate(t: RayHit, slot: number): boolean {
    if (this.star && t.block === B.STARGATE && t.x === ROOST.x && t.y === ROOST.y && t.z === ROOST.z) {
      if (!this.star.summon()) return false;
      if (!this.player.creative) this.consume(slot);
      return true;
    }
    const cands: [number, number, number][] = [[t.px, t.py, t.pz]];
    if (B.STAR_RING.includes(t.block)) for (const [dx, dz] of Game.RING) cands.push([t.x + dx, t.y, t.z + dz]);
    for (const [x, y, z] of cands) {
      const here = this.world.getBlock(x, y, z);
      if (here === UNLOADED || here === B.STARGATE || B.IS_FLUID[here] || (here !== B.AIR && !B.getBlock(here).replaceable)) continue;
      if (!this.gateRingComplete(x, y, z, B.STAR_RING)) continue;
      if (this.dim === 'cinderdeep') { pushChat('The stars are too far away down here: light a Stargate on the surface.'); return true; }
      this.world.setBlock(x, y, z, B.STARGATE, 'player');
      this.sound('star_light', x + 0.5, y + 0.8, z + 0.5, 1, 1);
      this.effect('star', x + 0.5, y + 0.9, z + 0.5, 24);
      if (!this.player.creative) this.consume(slot);
      pushChat(this.dim === OVERWORLD ? 'The Stargate is lit: stand in it to rise to the Starhollow' : 'The Stargate is lit: it leads home');
      return true;
    }
    return false;
  }

  /** A torch or a lava bucket used on the open middle of a ring lights a Deepgate there. */
  private tryLightGate(t: RayHit, slot: number): boolean {
    const cands: [number, number, number][] = [[t.px, t.py, t.pz]];
    if (isTorchBlock(t.block)) cands.unshift([t.x, t.y, t.z]);
    if (B.GATE_RING.includes(t.block)) for (const [dx, dz] of Game.RING) cands.push([t.x + dx, t.y, t.z + dz]);
    for (const [x, y, z] of cands) {
      const here = this.world.getBlock(x, y, z);
      if (here === UNLOADED || here === B.DEEPGATE || B.IS_FLUID[here] || (here !== B.AIR && !isTorchBlock(here) && !B.getBlock(here).replaceable)) continue;
      if (!this.gateRingComplete(x, y, z)) continue;
      this.world.setBlock(x, y, z, B.DEEPGATE, 'player');
      this.sound('gate_light', x + 0.5, y + 0.8, z + 0.5, 1, 1);
      this.effect('flame', x + 0.5, y + 0.9, z + 0.5, 16);
      this.effect('smoke', x + 0.5, y + 1.1, z + 0.5, 6);
      const p = this.player;
      if (!p.creative) {
        const held = this.inventory.get(slot)!;
        if (held.id === 'lava_bucket') { this.inventory.slots[slot] = makeStack('bucket'); this.inventory.changed(); }
        else this.consume(slot);
      }
      pushChat('The Deepgate is lit: stand in it to go down into the Cinderdeep');
      return true;
    }
    return false;
  }

  /** 2.0.1: the ring was finished around a torch already standing in the middle: that torch lights the gate. */
  private lightWaitingTorch(x: number, y: number, z: number): void {
    for (const [dx, dz] of Game.RING) {
      const cx = x - dx, cz = z - dz;
      if (!isTorchBlock(this.world.getBlock(cx, y, cz)) || !this.gateRingComplete(cx, y, cz)) continue;
      this.world.setBlock(cx, y, cz, B.DEEPGATE, 'player');
      this.sound('gate_light', cx + 0.5, y + 0.8, cz + 0.5, 1, 1);
      this.effect('flame', cx + 0.5, y + 0.9, cz + 0.5, 16);
      pushChat('The Deepgate is lit: stand in it to go down into the Cinderdeep');
      return;
    }
  }

  /** A Deepgate (or Stargate) goes out when its ring or the block under it is broken. */
  private checkGatesAround(x: number, y: number, z: number): void {
    const check = (gx: number, gy: number, gz: number) => {
      const id = this.world.getBlock(gx, gy, gz);
      if (id === B.DEEPGATE ? this.gateRingComplete(gx, gy, gz) : id === B.STARGATE ? this.gateRingComplete(gx, gy, gz, B.STAR_RING) : true) return;
      this.world.setBlock(gx, gy, gz, B.AIR, 'physics');
      this.sound('fizz', gx + 0.5, gy + 0.8, gz + 0.5, 0.7, 0.7);
      this.effect('smoke', gx + 0.5, gy + 0.9, gz + 0.5, 10);
    };
    for (const [dx, dz] of Game.RING) check(x + dx, y, z + dz);
    check(x, y + 1, z);
  }

  /** Standing in a Deepgate fills a glow; when it is full you are carried to the other side. */
  private tickGate(): void {
    const p = this.player;
    if (this.gateCooldown > 0) this.gateCooldown--;
    const gx = Math.floor(p.x), gz = Math.floor(p.z);
    let gy = Math.floor(p.y + 0.05);
    // in the glow, or just above it (flying in Creative, or not yet dropped into the middle)
    const isGate = (id: number) => id === B.DEEPGATE || id === B.STARGATE;
    if (!isGate(this.world.getBlock(gx, gy, gz)) && isGate(this.world.getBlock(gx, gy - 1, gz))) gy--;
    const gid = this.world.getBlock(gx, gy, gz);
    const inGate = !p.dead && !this.riding && isGate(gid) && ui.get().overlay !== 'theend';
    if (inGate) this.gateStar = gid === B.STARGATE;
    // ambient: gates nearby breathe out sparks
    if (this.tickCount % 6 === 0) {
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(p.x + (Math.random() - 0.5) * 24), y = Math.floor(p.y + (Math.random() - 0.5) * 12), z = Math.floor(p.z + (Math.random() - 0.5) * 24);
        const id = this.world.getBlock(x, y, z);
        if (id === B.DEEPGATE) this.effect('flame', x + Math.random(), y + 0.85, z + Math.random(), 1);
        else if (id === B.STARGATE) this.effect('star', x + Math.random(), y + 0.85, z + Math.random(), 1);
      }
    }
    if (!inGate || this.gateCooldown > 0) { this.gateTicks = Math.max(0, this.gateTicks - 2); return; }
    this.gateTicks++;
    if (this.gateTicks % 4 === 0) this.effect(this.gateStar ? 'star' : 'flame', p.x + (Math.random() - 0.5), p.y + Math.random() * 1.8, p.z + (Math.random() - 0.5), 2);
    if (this.gateTicks % 20 === 1) this.sound('gate_hum', p.x, p.y + 1, p.z, 0.8, (this.gateStar ? 1.4 : 0.8) + this.gateTicks / this.gateTime() * 0.5);
    if (this.gateTicks >= this.gateTime() && this.engine.changeDimension) {
      this.gateTicks = 0;
      this.gateCooldown = 100;
      if (this.gateStar) { this.travelByStargate(gx, gz); return; }
      const target: DimId = this.dim === OVERWORLD ? 'cinderdeep' : OVERWORLD;
      this.sound('gate_travel', p.x, p.y + 1, p.z, 1, 1);
      void this.engine.changeDimension(target, { kind: 'gate', x: gx, z: gz });
    }
  }

  /**
   * 2.2: a Stargate's glow is full. From the surface: up to the Starhollow (the spot is
   * remembered: the way back comes out there). From the Starhollow: home - after a
   * victory, the Roost's gate shows the End screen first (once per world).
   */
  private travelByStargate(gx: number, gz: number): void {
    const p = this.player, change = this.engine.changeDimension!;
    this.sound('star_travel', p.x, p.y + 1, p.z, 1, 1);
    if (this.dim !== 'starhollow') {
      const st = this.record.star ?? (this.record.star = { dragon: 'alive', health: 200 });
      st.from = { x: gx, z: gz };
      void change.call(this.engine, 'starhollow', { kind: 'gate', x: gx, z: gz, gate: 'star' });
      return;
    }
    const st = this.record.star;
    if (gx === ROOST.x && gz === ROOST.z && st?.dragon === 'dead' && !st.seenEnd && this.engine.showTheEnd) {
      this.gateCooldown = 400;
      this.engine.showTheEnd();
      return;
    }
    if (st?.from) void change.call(this.engine, OVERWORLD, { kind: 'gate', x: st.from.x, z: st.from.z, gate: 'star' });
    else void change.call(this.engine, OVERWORLD, { kind: 'home' });
  }

  /** 2.2: are Starwings worn (and not worn out)? */
  wearingWings(): boolean {
    const w = this.inventory.get(ARMOR_START + 1);
    return !!w && w.id === 'star_wings' && (w.damage ?? 0) < (getItem('star_wings').durability ?? 1) - 1;
  }

  /** 2.2: jump in mid-air while falling, wearing Starwings, to start gliding. */
  private canStartGlide(): boolean {
    const p = this.player;
    return !p.onGround && !p.flying && !p.inWater && !p.inLava && !p.gliding && !this.riding && p.vy < 0.08 && !p.dead && this.wearingWings();
  }

  /** 2.2: gliding stops on landing, in water, when flying or without wings; the wings wear a little every second. */
  private tickGlide(): void {
    const p = this.player;
    if (!p.gliding) return;
    if (p.onGround || p.inWater || p.inLava || p.flying || p.dead || this.riding || !this.wearingWings()) { p.gliding = false; return; }
    if (++this.glideTicks % 20 === 0) {
      this.progress.grant('glide');
      if (!p.creative && this.inventory.damageItem(ARMOR_START + 1, 1)) { this.sound('tool_break', p.x, p.eyeY, p.z); p.gliding = false; }
    }
    if (this.glideTicks % 30 === 1) this.sound('glide', p.x, p.y + 1, p.z, 0.25, 0.9 + Math.random() * 0.2);
  }

  /** 2.2: fallen off the Starhollow: the stars catch you and carry you home, with everything you had. */
  catchFromVoid(): void {
    this.player.vy = 0;
    void this.engine.changeDimension?.(OVERWORLD, { kind: 'home', note: 'You fell from the Starhollow, but the stars caught you and carried you home.' });
  }

  /** 2.2: arriving home (not by dying): at your bed, or the world's spawn point; nothing is lost. */
  private wakeAtHome(note?: string): void {
    const p = this.player;
    p.flying = false;
    const bed = p.bed;
    if (bed && this.world.isLoaded(bed.x, bed.z) && B.getBlock(this.world.getBlock(bed.x, bed.y, bed.z)).shape === 'bed') {
      const spot = this.freeSpotNear(bed.x, bed.y, bed.z);
      p.setPosition(spot.x, spot.y, spot.z);
    } else {
      const top = this.world.isLoaded(Math.floor(p.spawnX), Math.floor(p.spawnZ)) ? this.world.highestSolid(Math.floor(p.spawnX), Math.floor(p.spawnZ)) : -1;
      p.setPosition(p.spawnX, top > 0 ? top + 1 : p.spawnY, p.spawnZ);
    }
    p.invulnerable = 40;
    this.gateCooldown = 100;
    if (note) pushChat(note);
  }

  /** Prepares the next save to put the player in another dimension (the Engine then reloads). */
  leaveFor(dim: DimId, arrival?: Arrival): void {
    this.leaving = dim;
    // 2.2: the next landscape loads round where the player will come out (the Starhollow's
    // arrival gate, the Stargate on the surface, or home), not round where they stand now
    const p = this.player;
    if (arrival?.kind === 'gate' && dim === 'starhollow') this.leavingAt = { x: ARRIVAL.x + 0.5, y: ARRIVAL.y + 1, z: ARRIVAL.z - 0.5 };
    else if (arrival?.kind === 'gate' && arrival.gate === 'star') this.leavingAt = { x: arrival.x + 0.5, y: Math.max(p.y, 70), z: arrival.z + 0.5 };
    else if (arrival && arrival.kind !== 'gate') {
      const b = p.bed;
      this.leavingAt = b ? { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 } : { x: p.spawnX, y: p.spawnY, z: p.spawnZ };
    }
    if (this.riding) this.dismount();
  }

  /** The nearest lit Deepgate (or Stargate) within `r` blocks of (x, z), at any height, among loaded chunks. */
  findGate(x: number, z: number, r = 16, gate: number = B.DEEPGATE): { x: number; y: number; z: number } | null {
    let best: { x: number; y: number; z: number } | null = null, bd = Infinity;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const wx = x + dx, wz = z + dz;
      const c = this.world.getChunk(wx >> 4, wz >> 4);
      if (!c) continue;
      for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
        if (c.blocks[localIndex(wx & 15, y, wz & 15)] !== gate) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = { x: wx, y, z: wz }; }
      }
    }
    return best;
  }

  /**
   * Builds a lit Deepgate at (or near) (x, z): on the ground in the overworld (on a
   * little platform over water), on a cavern floor in the Cinderdeep - or, if there is
   * none close by, in a chamber carved out of the rock.
   */
  buildGate(x: number, z: number, star = false): { x: number; y: number; z: number } {
    const w = this.world;
    let gx = x, gz = z, gy = -1;
    if (this.dim === 'cinderdeep') {
      // a cavern floor near (x, z) with room above, as close to the middle height as can be found
      let bestScore = Infinity;
      for (let r = 0; r <= 10 && gy < 0; r++) {
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (let y = LAVA_SEA + 3; y < 110; y++) {
            const fx = x + dx, fz = z + dz;
            const fl = w.getBlock(fx, y, fz);
            if (!B.IS_SOLID[fl] || fl === B.BEDROCK) continue;
            let ok = true;
            for (let ox = -1; ox <= 1 && ok; ox++) for (let oz = -1; oz <= 1 && ok; oz++) {
              if (!B.IS_SOLID[w.getBlock(fx + ox, y, fz + oz)]) ok = false;
              for (let oy = 1; oy <= 3 && ok; oy++) if (w.getBlock(fx + ox, y + oy, fz + oz) !== B.AIR) ok = false;
            }
            if (!ok) continue;
            const score = Math.abs(y - 64) + r * 4;
            if (score < bestScore) { bestScore = score; gx = fx; gz = fz; gy = y; }
          }
        }
      }
      if (gy < 0) {
        // nothing open nearby: carve a chamber in the rock (or over the lava sea) at height 64
        gy = 64;
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          for (let dy = 1; dy <= 4; dy++) w.setBlock(x + dx, gy + dy, z + dz, B.AIR, 'system');
          w.setBlock(x + dx, gy, z + dz, B.ASHROCK, 'system');
          if (!B.IS_SOLID[w.getBlock(x + dx, gy - 1, z + dz)]) w.setBlock(x + dx, gy - 1, z + dz, B.ASHROCK, 'system');
        }
        gx = x; gz = z;
      }
    } else {
      // the ground, not a tree top
      let top = w.highestSolid(x, z);
      while (top > 1 && /leaves|log/.test(B.getBlock(w.getBlock(x, top, z)).key)) top--;
      gy = top;
      if (top < 1 || B.IS_FLUID[w.getBlock(x, top + 1, z)]) {
        // over water: a small cobblestone platform at the surface
        gy = Math.max(top + 1, SEA_LEVEL);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          w.setBlock(x + dx, gy, z + dz, B.COBBLESTONE, 'system');
          w.setBlock(x + dx, gy - 1, z + dz, B.COBBLESTONE, 'system');
        }
      }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 1; dy <= 3; dy++) if (gy + dy < WORLD_HEIGHT) w.setBlock(x + dx, gy + dy, z + dz, B.AIR, 'system');
      }
    }
    if (!B.IS_SOLID[w.getBlock(gx, gy - 1, gz)]) w.setBlock(gx, gy - 1, gz, this.dim === 'cinderdeep' ? B.ASHROCK : B.STONE, 'system');
    for (const [dx, dz] of Game.RING) w.setBlock(gx + dx, gy, gz + dz, star ? B.GLIMMERSTONE : B.CINDERSTONE, 'system');
    w.setBlock(gx, gy, gz, star ? B.STARGATE : B.DEEPGATE, 'system');
    return { x: gx, y: gy, z: gz };
  }

  /** Coming out of a Deepgate (or Stargate): beside the gate that leads back (built if there isn't one). */
  private arriveThroughGate(x: number, z: number, star = false): void {
    if (this.dim === 'starhollow') { x = ARRIVAL.x; z = ARRIVAL.z; star = true; }
    const gate = star ? this.findGate(x, z, 16, B.STARGATE) ?? this.buildGate(x, z, true) : this.findGate(x, z) ?? this.buildGate(x, z);
    const p = this.player;
    // stand on the ring, facing away from the gate, where there is head room
    let spot: [number, number] = [gate.x + 1, gate.z];
    // (in the Starhollow, on the side facing the Roost, so the pylons are the first thing you see)
    const sides = this.dim === 'starhollow' ? [[0, -1], [1, 0], [-1, 0], [0, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of sides) {
      const sx = gate.x + dx, sz = gate.z + dz;
      if (!B.IS_SOLID[this.world.getBlock(sx, gate.y + 1, sz)] && !B.IS_SOLID[this.world.getBlock(sx, gate.y + 2, sz)]) { spot = [sx, sz]; break; }
    }
    p.setPosition(spot[0] + 0.5, gate.y + 1, spot[1] + 0.5);
    p.vx = p.vy = p.vz = 0;
    p.yaw = Math.atan2(-(spot[0] - gate.x), -(spot[1] - gate.z)) + Math.PI;
    p.flying = p.flying && p.creative;
    this.gateCooldown = 100;
    this.gateTicks = 0;
    if (this.dim === 'cinderdeep') {
      this.progress.grant('deepgate');
      this.progress.add('deep_visits');
    }
    if (this.dim === 'starhollow') {
      this.progress.grant('stargate');
      this.progress.add('star_visits');
      if (this.record.star?.dragon !== 'dead') pushChat('Somewhere above the Roost, the Hollowdrake is circling. Four Storm Bells shield it.');
    }
  }

  /** Is the player standing inside solid rock (an old save, or a world changed elsewhere)? */
  private insideRock(): boolean {
    const p = this.player;
    const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y);
    return B.IS_SOLID[this.world.getBlock(x, y, z)] === 1 || B.IS_SOLID[this.world.getBlock(x, y + 1, z)] === 1;
  }

  /** Moves the player to the nearest open spot above or below. */
  private freeFromRock(): void {
    const p = this.player;
    const x = Math.floor(p.x), z = Math.floor(p.z), y0 = Math.floor(p.y);
    for (let d = 1; d < WORLD_HEIGHT; d++) {
      for (const y of [y0 + d, y0 - d]) {
        if (y < 1 || y >= WORLD_HEIGHT - 2) continue;
        if (!B.IS_SOLID[this.world.getBlock(x, y, z)] && !B.IS_SOLID[this.world.getBlock(x, y + 1, z)] && B.IS_SOLID[this.world.getBlock(x, y - 1, z)] && !B.IS_FLUID[this.world.getBlock(x, y, z)]) {
          p.setPosition(x + 0.5, y, z + 0.5);
          return;
        }
      }
    }
  }

  /** 2.2: Starfall shrine chests: Glimmer Dust, Starblooms, Drift Silk, Rune Shards, and now and then a Star Lens or a Star Scale. */
  private fillStarfallLoot(be: ChestEntity, rng: () => number): void {
    const table: [string, number, number, number][] = [
      ['glimmer_dust', 3, 8, 0.85], ['starbloom', 1, 4, 0.6], ['drift_silk', 1, 3, 0.5], ['rune_shard', 1, 4, 0.5], ['amber', 2, 6, 0.4],
      ['fire_opal', 1, 1, 0.2], ['star_lens', 1, 1, 0.18], ['star_scale', 1, 2, 0.15], ['roast_ashboar', 2, 5, 0.3], ['arrow', 6, 14, 0.3],
    ];
    const free = () => { for (let t = 0; t < 40; t++) { const i = Math.floor(rng() * 27); if (!be.items[i]) return i; } return be.items.indexOf(null); };
    for (const [id, lo, hi, ch] of table) {
      if (rng() >= ch) continue;
      const i = free();
      if (i >= 0) be.items[i] = makeStack(id, lo + Math.floor(rng() * (hi - lo + 1)));
    }
  }

  /** Ember Shrine chests: embers and Fire Opal, iron, rune shards, amber - and now and then a Cinder Charm. */
  private fillShrineLoot(be: ChestEntity, rng: () => number): void {
    const table: [string, number, number, number][] = [
      ['ember', 2, 6, 0.85], ['iron_ingot', 1, 4, 0.55], ['rune_shard', 1, 3, 0.45], ['amber', 2, 5, 0.45],
      ['fire_opal', 1, 1, 0.3], ['glowcap', 1, 3, 0.3], ['glimmer_dust', 2, 5, 0.4], ['bread', 1, 3, 0.3], ['arrow', 4, 10, 0.25], ['cinder_charm', 1, 1, 0.08],
    ];
    const free = () => { for (let t = 0; t < 40; t++) { const i = Math.floor(rng() * 27); if (!be.items[i]) return i; } return be.items.indexOf(null); };
    for (const [id, lo, hi, ch] of table) {
      if (rng() >= ch) continue;
      const i = free();
      if (i >= 0) be.items[i] = makeStack(id, lo + Math.floor(rng() * (hi - lo + 1)));
    }
    if (rng() < 0.18) {
      const i = free();
      if (i >= 0) be.items[i] = { id: rng() < 0.5 ? 'iron_chestplate' : 'iron_helmet', count: 1, ench: { warding: 2 } };
    }
  }

  // ======================================================================= interaction
  private tickInteraction(inGame: boolean): void {
    const p = this.player;
    const input = this.engine.input;
    if (this.breakDelay > 0) this.breakDelay--;
    if (this.useDelay > 0) this.useDelay--;
    if (p.dead) { this.target = null; this.targetMob = null; this.crack.hide(); return; }

    const [ex, ey, ez] = this.eye();
    const [dx, dy, dz] = this.lookDir();
    const hit = raycast(this.world, ex, ey, ez, dx, dy, dz, this.reach());
    const mobHit = this.entities.rayHitMob(ex, ey, ez, dx, dy, dz, p.creative ? 5 : 3);
    this.targetMob = mobHit && (!hit || mobHit.t < hit.dist) ? mobHit.mob : null;
    this.target = this.targetMob ? null : hit;
    const paintHit = this.entities.rayHitPainting(ex, ey, ez, dx, dy, dz, this.reach());
    this.targetPainting = paintHit && (!hit || paintHit.t < hit.dist) && (!mobHit || !this.targetMob || paintHit.t < mobHit.t) ? paintHit.painting : null;
    if (this.targetPainting) { this.target = null; this.targetMob = null; }
    const boatHit = this.entities.rayHitBoat(ex, ey, ez, dx, dy, dz, this.reach(), this.riding);
    this.targetBoat = boatHit && !this.targetPainting && (!hit || boatHit.t < hit.dist) && (!this.targetMob || !mobHit || boatHit.t < mobHit.t) ? boatHit.boat : null;
    if (this.targetBoat) { this.target = null; this.targetMob = null; }
    const standHit = this.entities.rayHitStand(ex, ey, ez, dx, dy, dz, this.reach());
    this.targetStand = standHit && !this.targetPainting && (!this.targetBoat || standHit.t < boatHit!.t) && (!hit || standHit.t < hit.dist)
      && (!this.targetMob || !mobHit || standHit.t < mobHit.t) ? standHit.stand : null;
    if (this.targetStand) {
      this.target = null; this.targetMob = null; this.targetBoat = null;
      this.targetStandAt = ey + dy * standHit!.t - this.targetStand.y;
    }

    const lmb = inGame && input.mouseIsDown(0);
    const lmbPress = inGame && input.consumeMouse(0);
    const rmb = inGame && input.mouseIsDown(2);
    const rmbPress = inGame && input.consumeMouse(2);
    const mmbPress = inGame && input.consumeMouse(1);
    const rmbRelease = input.consumeMouseRelease(2);

    // ---- paintings: hit to take down, right-click to show another picture of the same size
    const pt = this.targetPainting;
    if (pt && (lmbPress || (rmbPress && !p.sneaking))) {
      this.hand.swing();
      if (this.breaking) this.breaking = null;
      this.crack.hide();
      if (lmbPress) { this.breakPainting(pt, !p.creative); this.breakDelay = 5; }
      else { pt.cycle(); this.sound('place:wood', pt.x, pt.y, pt.z, 0.6, 1.2); this.useDelay = 4; }
      return;
    }

    // ---- boats: hit to break, right-click to climb in
    const tb = this.targetBoat;
    if (tb && (lmbPress || (rmbPress && !p.sneaking))) {
      this.hand.swing();
      if (this.breaking) this.breaking = null;
      this.crack.hide();
      if (lmbPress) { this.hitBoat(tb); this.breakDelay = 5; }
      else if (!this.riding && !tb.rider) { this.mount(tb); this.useDelay = 4; }
      return;
    }

    // ---- armour stands: right-click to dress it (or take a piece back), hit twice to knock it down
    const st = this.targetStand;
    if (st && (lmbPress || (lmb && this.breakDelay === 0) || rmbPress)) {
      this.hand.swing();
      if (this.breaking) this.breaking = null;
      this.crack.hide();
      if (lmbPress || lmb) { this.hitStand(st); this.breakDelay = 6; }
      else { this.useStand(st, this.targetStandAt); this.useDelay = 4; }
      return;
    }

    // ---- attack
    if (lmbPress && this.targetMob) this.attack(this.targetMob);
    else if (lmbPress && !this.target) this.hand.swing();

    // ---- break
    if ((lmb || lmbPress) && this.target && !this.targetMob) this.continueBreaking(lmbPress);
    else { if (this.breaking) this.breaking = null; this.crack.hide(); }

    // ---- pick block
    if (mmbPress && this.target) {
      const item = itemForBlock(this.target.block);
      if (item) this.inventory.pickBlock(item, p.creative);
    } else if (mmbPress && this.targetPainting) this.inventory.pickBlock('painting', p.creative);
    else if (mmbPress && this.targetStand) this.inventory.pickBlock('armour_stand', p.creative);

    // ---- Fellhounds: tame with raw meat, heal with meat, sit / follow
    if (rmbPress && this.targetMob instanceof Hound && this.targetMob.alive && !p.sneaking) {
      const h = this.targetMob;
      const held = this.inventory.selectedStack;
      const food = held && HOUND_FOOD[held.id] !== undefined ? held.id : null;
      if (h.tamed || (food && HOUND_TAMING_FOOD.includes(food))) {
        const r = food ? h.feed(this, food) : 'no';
        if ((r === 'tamed' || r === 'failed' || r === 'healed') && !p.creative) this.consume(this.inventory.selected);
        if (r === 'tamed') {
          this.progress.grant('tame');
          this.progress.add('hounds_tamed');
          pushChat('The Fellhound is now your companion. Right-click it to make it sit or follow.');
        } else if (r === 'angry') pushChat('The Fellhound is too angry to take food.');
        else if (h.tamed && (r === 'no' || r === 'full')) h.toggleSit(this);
        this.hand.swing();
        this.useDelay = 4;
        return;
      }
    }

    // ---- Ashboars: a Glowcap brings two grown-ups together (or makes a piglet grow up sooner)
    if (rmbPress && this.targetMob instanceof Ashboar && this.targetMob.alive && this.inventory.selectedStack?.id === ASHBOAR_FOOD) {
      const r = this.targetMob.feed(this);
      if (r !== 'no') { if (!p.creative) this.consume(this.inventory.selected); this.hand.swing(); this.useDelay = 4; return; }
    }

    // ---- villagers: a gift (food or a flower: sneak, or to a child or a villager without a job),
    // a trade, or a shake of the head (no job, too young, or the village distrusts you)
    if (rmbPress && this.targetMob instanceof Villager && this.targetMob.alive) {
      const v = this.targetMob;
      const held = this.inventory.selectedStack;
      const giftable = !!held && GIFT_FOOD[held.id] !== undefined;
      if (giftable && (p.sneaking || v.isChild || !v.job)) { this.giveGift(v); return; }
      if (!p.sneaking) {
        this.hand.swing();
        this.useDelay = 4;
        const st = this.villages.standing(v.villageId);
        const eyes = v.y + v.height * 0.82;
        if (v.isChild) { this.sound('villager', v.x, eyes, v.z, 0.6, 1.5); pushChat(`${v.name} is too young to trade.`); }
        else if (st.key === 'distrustful' || st.key === 'hostile') { this.sound('villager_no', v.x, eyes, v.z, 0.6, 1); pushChat(`${v.name} won't trade with you. (Your standing in ${this.villages.name(v.villageId)}: ${st.name})`); }
        else if (v.job && v.trades.length) this.engine.openTrade(v);
        else { this.sound('villager_no', v.x, eyes, v.z, 0.6, 1); pushChat(`${v.name} has no job yet. Put a workstation near them.`); }
        return;
      }
    }

    // ---- functional blocks take priority over item use (bow, food...)
    if (rmbPress && this.target && !p.sneaking && B.getBlock(this.target.block).interact) {
      const t = this.target;
      this.hand.swing();
      this.useDelay = 4;
      this.interactWith(t.x, t.y, t.z, B.getBlock(t.block).interact!);
      return;
    }

    // ---- use / place
    const held = this.inventory.selectedStack;
    const heldDef = held ? getItem(held.id) : null;
    if (heldDef?.kind === 'bow') {
      if (rmb && (p.creative || this.inventory.countItem('arrow') > 0)) {
        this.bowTicks++;
        this.hand.drawing = this.bowTicks;
      } else if (this.bowTicks > 0 && (rmbRelease || !rmb)) {
        this.releaseBow();
      }
    } else if (this.bowTicks) { this.bowTicks = 0; this.hand.drawing = 0; }

    const planting = heldDef?.block !== undefined && !!this.target && this.target.face === 2 && B.IS_FARMLAND(this.target.block);
    if (heldDef?.kind === 'food' && rmb && p.food < 20 && !p.creative && !planting) {
      this.eatTicks++;
      this.hand.eating = this.eatTicks;
      if (this.eatTicks % 4 === 0) this.sound('eat', p.x, p.eyeY, p.z, 0.4, 0.8 + Math.random() * 0.4);
      if (this.eatTicks >= 32) this.finishEating();
      return;
    } else if (this.eatTicks) { this.eatTicks = 0; this.hand.eating = 0; }

    if ((rmb || rmbPress) && (rmbPress || this.useDelay === 0) && heldDef?.kind !== 'bow') {
      this.useDelay = 4;
      this.use(rmbPress);
    }
  }

  private attack(mob: Mob): void {
    const p = this.player;
    if (mob.petOfPlayer) {   // your own companion shrugs off a stray swipe
      this.hand.swing();
      return;
    }
    this.playerAttacked(mob);
    const held = this.inventory.selectedStack;
    const def = held ? getItem(held.id) : null;
    let dmg = def ? def.attack : 1;
    const keen = runeLevel(held, 'keen');
    if (keen) dmg += 0.5 * keen + 0.5;
    const crit = !p.onGround && p.vy < 0 && !p.inWater && !p.flying;
    if (crit) { dmg *= 1.5; this.effect('crit', mob.x, mob.y + mob.height * 0.7, mob.z, 10); }
    const [dx, , dz] = this.lookDir();
    mob.hurt(dmg, this, dx * (p.sprinting ? 1.6 : 1), dz * (p.sprinting ? 1.6 : 1), true);
    this.progress.add('damage_dealt', dmg);
    p.addExhaustion(0.1);
    this.sound('hit', mob.x, mob.y + 1, mob.z, 0.6, 1);
    if (held && def?.tool && !p.creative) {
      if (this.inventory.damageItem(this.inventory.selected, def.tool.type === 'sword' ? 1 : 2)) this.sound('tool_break', p.x, p.eyeY, p.z);
    }
    if (p.sprinting) p.sprinting = false;
    this.hand.swing();
  }

  private continueBreaking(pressed: boolean): void {
    const p = this.player;
    const t = this.target!;
    const held = this.inventory.selectedStack;
    if (this.breakDelay > 0) return;
    if (p.creative) {
      if (!pressed && this.tickCount % 5 !== 0) return;
      if (held && getItem(held.id).tool?.type === 'sword') return;
      this.hand.swing();
      this.breakBlockAt(t.x, t.y, t.z, false, true);
      this.breakDelay = 5;
      return;
    }
    const b = this.breaking;
    if (!b || b.x !== t.x || b.y !== t.y || b.z !== t.z || b.block !== t.block) {
      this.breaking = { x: t.x, y: t.y, z: t.z, block: t.block, progress: 0 };
    }
    const br = this.breaking!;
    const inc = breakProgressPerTick(t.block, held, p.eyeInWater, p.onGround || p.flying);
    if (inc <= 0) { this.crack.hide(); return; }
    br.progress += inc;
    if (this.tickCount % 4 === 0) {
      this.hand.swing();
      this.sound('hit:' + B.getBlock(t.block).sound, t.x + 0.5, t.y + 0.5, t.z + 0.5, 0.5, 0.6);
      this.particles.hitSpark(t.x + 0.5 + t.nx * 0.51, t.y + 0.5 + t.ny * 0.51, t.z + 0.5 + t.nz * 0.51, this.models.particleColors(t.block), this.brightnessAt(t.px, t.py, t.pz));
    }
    if (br.progress >= 1) {
      this.breakBlockAt(t.x, t.y, t.z, true, true);
      this.breaking = null;
      this.breakDelay = 5;
      this.crack.hide();
    } else this.crack.show(t.x, t.y, t.z, br.progress, this.selectionOf(t.block, t.x, t.y, t.z));
  }

  /** Removes a block with drops/effects. `byPlayer` applies tool wear and stats. */
  breakBlockAt(x: number, y: number, z: number, drops: boolean, byPlayer: boolean): void {
    const id = this.world.getBlock(x, y, z);
    if (id === B.AIR || id === UNLOADED || B.IS_WATER[id]) return;
    const def = B.getBlock(id);
    const p = this.player;
    const held = this.inventory.selectedStack;
    if (def.hardness < 0 && !(byPlayer && p.creative)) return;
    const light = this.brightnessAt(x, y + 1, z);
    // containers spill their contents
    const be = this.world.blockEntities.get(posKey(x, y, z));
    if (be && (be.type === 'chest' || be.type === 'furnace')) {
      if (be.type === 'chest' && (be as ChestEntity).loot) this.fillLoot(be as ChestEntity, x, y, z);
      for (const s of be.items) if (s) this.scatter(s, x + 0.5, y + 0.5, z + 0.5);
    }
    this.world.setBlock(x, y, z, B.AIR, byPlayer ? 'player' : 'physics');
    this.particles.blockBreak(x, y, z, this.models.particleColors(id), light);
    // two-block structures (doors, beds) go together and drop one item
    let dropDef = def;
    const partner = partnerOf(id, x, y, z);
    if (partner) {
      const pid = this.world.getBlock(partner[0], partner[1], partner[2]);
      const pd = B.getBlock(pid);
      if (pd.variantOf === def.variantOf && pd.half !== def.half) {
        this.world.setBlock(partner[0], partner[1], partner[2], B.AIR, byPlayer ? 'player' : 'physics');
        if (!def.drops.length) dropDef = pd;
      }
    }
    this.sound('break:' + def.sound, x + 0.5, y + 0.5, z + 0.5, 0.8, 0.9 + Math.random() * 0.2);
    const harvest = !byPlayer || canHarvest(def, held);
    if (drops && !(byPlayer && p.creative) && harvest) {
      const bounty = byPlayer && ORES.has(id) ? runeLevel(held, 'bounty') : 0;
      for (const d of dropDef.drops) {
        if (d.chance !== undefined && Math.random() > d.chance) continue;
        let n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        if (bounty) n *= 1 + Math.max(0, Math.floor(Math.random() * (bounty + 2)) - 1);
        if (n > 0) this.entities.spawnItem({ id: d.item, count: n }, x + 0.5, y + 0.3, z + 0.5);
      }
      if (def.xp[1] > 0) {
        const xp = def.xp[0] + Math.floor(Math.random() * (def.xp[1] - def.xp[0] + 1));
        if (xp > 0) this.spawnXp(xp, x + 0.5, y + 0.5, z + 0.5);
      }
    }
    if (byPlayer) {
      this.progress.add('blocks_mined');
      if (id === B.WHEAT[7] || id === B.CARROTS[3]) this.progress.grant('harvest');
      p.addExhaustion(0.005);
      if (id === B.STONE && harvest) this.progress.grant('stone');
      if (id === B.SPAWNER) { this.progress.grant('spawner'); this.progress.add('spawners_broken'); }
      if (id === B.EMBER_ORE && harvest) this.progress.grant('ember');
      const tool = held ? getItem(held.id).tool : undefined;
      if (tool && !p.creative && def.hardness > 0) {
        if (this.inventory.damageItem(this.inventory.selected, tool.type === 'sword' ? 2 : 1)) this.sound('tool_break', p.x, p.eyeY, p.z);
      }
    }
  }

  private use(pressed: boolean): void {
    const p = this.player;
    const t = this.target;
    // interact with functional blocks
    if (t && !p.sneaking && pressed) {
      const def = B.getBlock(t.block);
      if (def.interact) {
        this.hand.swing();
        this.interactWith(t.x, t.y, t.z, def.interact);
        return;
      }
    }
    for (const slotIndex of [this.inventory.selected, OFFHAND]) {
      const held = this.inventory.get(slotIndex);
      if (!held) continue;
      const def = getItem(held.id);
      if (def.kind === 'armor' && pressed && slotIndex !== OFFHAND) {
        const a = ARMOR_START + def.armor!.slot;
        if (!this.inventory.get(a)) {
          this.inventory.slots[a] = held;
          this.inventory.slots[slotIndex] = null;
          this.inventory.changed();
          this.progress.grant('armor');
          this.sound('place:wool', p.x, p.y, p.z, 0.5);
          return;
        }
      }
      if (def.kind === 'spawn' && t && pressed && t.block === B.SPAWNER) {
        // a spawn egg on a Monster Cage changes the creature it makes
        this.spawners.entity(t.x, t.y, t.z).mob = def.spawn as string;
        if (!p.creative) this.consume(slotIndex);
        this.sound('pop', t.x + 0.5, t.y + 0.5, t.z + 0.5, 0.5, 0.8);
        this.hand.swing();
        return;
      }
      if (def.kind === 'spawn' && t && pressed) {
        const m = this.entities.spawnMob(def.spawn as MobType, t.px + 0.5, t.py, t.pz + 0.5, this);
        m.persistent = true;
        if (!p.creative) this.consume(slotIndex);
        this.hand.swing();
        return;
      }
      if (t && pressed && (held.id === 'torch' || held.id === 'lava_bucket') && this.tryLightGate(t, slotIndex)) { this.hand.swing(); return; }
      if (t && pressed && held.id === 'star_lens' && this.tryLightStargate(t, slotIndex)) { this.hand.swing(); return; }
      if (def.kind === 'bucket' && pressed) {
        const pour = held.id === 'water_bucket' ? B.WATER : held.id === 'lava_bucket' ? B.LAVA : null;
        if (this.useBucket(slotIndex, pour)) { this.hand.swing(); return; }
        continue;
      }
      if (def.kind === 'boat' && pressed) {
        if (this.placeBoat(slotIndex)) { this.hand.swing(); return; }
        continue;
      }
      if (MAP_ITEMS[held.id] && pressed && slotIndex !== OFFHAND) {
        this.useMap(slotIndex);
        this.hand.swing();
        return;
      }
      if (def.kind === 'rod' && pressed && slotIndex !== OFFHAND) {
        this.useRod(slotIndex);
        this.hand.swing();
        return;
      }
      if (t && pressed && (def.tool?.type === 'hoe' || def.tool?.type === 'shovel') && this.tillOrPath(t, slotIndex, def.tool.type)) { this.hand.swing(); return; }
      if (t && pressed && held.id === 'painting') {
        const f = faceFacing(t.face);
        const pt = f ? placePainting(this, t.x, t.y, t.z, f, t.hx, t.hy, t.hz) : null;
        if (pt) {
          this.sound('place:wood', pt.x, pt.y, pt.z, 0.8, 1);
          this.progress.grant('painting');
          if (!p.creative) this.consume(slotIndex);
          this.hand.swing();
          return;
        }
        continue;
      }
      if (t && pressed && held.id === 'armour_stand' && slotIndex !== OFFHAND) {
        if (this.placeStand(t, slotIndex)) { this.hand.swing(); return; }
        continue;
      }
      if (t && pressed && held.id === 'bone_meal') {
        if (this.useBoneMeal(t.x, t.y, t.z)) { if (!p.creative) this.consume(slotIndex); this.hand.swing(); return; }
        continue;
      }
      if (def.block !== undefined && t) {
        const boxes: AABB[] = [];
        for (const e of this.entities.list) if ((e instanceof Mob && e.alive) || (e instanceof ArmourStand && !e.removed)) boxes.push(e.box);
        const place = resolvePlacement(this.world, t, def.block, p.box, p.yaw, boxes);
        if (!place) continue;
        const [ex, ey, ez] = this.eye();
        if (Math.hypot(place.x + 0.5 - ex, place.y + 0.5 - ey, place.z + 0.5 - ez) > this.reach() + 1) return;
        for (const b of place.all) {
          const old = this.world.getBlock(b.x, b.y, b.z);
          if (needsSupport(old) && !B.IS_SOLID[old]) this.washOut(b.x, b.y, b.z, old);
          this.world.setBlock(b.x, b.y, b.z, b.block, 'player');
        }
        this.sound('place:' + B.getBlock(place.block).sound, place.x + 0.5, place.y + 0.5, place.z + 0.5, 0.8, 0.8);
        this.progress.add('blocks_placed');
        if (place.block === B.TORCH) this.progress.grant('torch');
        if (!p.creative) this.consume(slotIndex);
        this.hand.swing();
        const pd = B.getBlock(place.block);
        if (pd.shape === 'sign' || pd.shape === 'wall_sign') {
          // a new sign: blank text, turned to face the player, and straight into the editor
          const be: SignEntity = { type: 'sign', lines: ['', '', '', ''] };
          if (pd.shape === 'sign') be.rot = ((Math.round(p.yaw / (Math.PI / 8)) % 16) + 16) % 16;
          this.world.blockEntities.set(posKey(place.x, place.y, place.z), be);
          this.signs.refresh();
          this.engine.openSignEditor(place.x, place.y, place.z);
        }
        return;
      }
    }
  }

  /** Rune Table: inscribes offer `tier` (1..3) on the item in the table. Returns true on success. */
  inscribe(tier: number): boolean {
    const p = this.player;
    const item = this.runeSlots.get(0), shards = this.runeSlots.get(1);
    if (!item || !canInscribe(item)) return false;
    const offer = runeOffers(item, p.runeSeed)[tier - 1];
    if (!offer) return false;
    if (!p.creative) {
      if (p.xpLevel < offer.minLevel || !shards || shards.count < offer.cost) return false;
      p.xpLevel -= offer.cost;
      shards.count -= offer.cost;
      if (shards.count <= 0) this.runeSlots.slots[1] = null;
    }
    this.runeSlots.slots[0] = { ...item, ench: { ...(offer.runes as Record<string, number>) } };
    this.runeSlots.changed();
    p.runeSeed = (Math.random() * 0x7fffffff) | 0;
    this.progress.grant('runes');
    this.progress.add('items_inscribed');
    this.sound('runes', p.x, p.eyeY, p.z, 0.8);
    this.pushHud(true);
    return true;
  }

  /** Total Warding on worn armour plus Soft Landing on boots for falls (reference-game "protection points"). */
  private protection(kind: string): number {
    let epf = 0;
    for (let i = 0; i < 4; i++) {
      const a = this.inventory.get(ARMOR_START + i);
      epf += runeLevel(a, 'warding');
      if (kind === 'fall' && i === 3) epf += 3 * runeLevel(a, 'soft_landing');
    }
    return Math.min(20, epf);
  }

  plunderLevel(): number {
    return runeLevel(this.inventory.selectedStack, 'plunder');
  }

  private interactWith(x: number, y: number, z: number, kind: NonNullable<B.Interaction>): void {
    if (kind === 'door') this.toggleDoor(x, y, z);
    else if (kind === 'bed') this.trySleep(x, y, z);
    else if (kind === 'gate') this.toggleGate(x, y, z);
    else if (kind === 'trapdoor') this.toggleTrapdoor(x, y, z);
    else if (kind === 'sign') this.useSign(x, y, z);
    else if (kind === 'pot') this.usePot(x, y, z);
    else if (kind === 'bell') this.villages.ring(x, y, z);
    else if (kind === 'storm_bell') { if (this.star) this.star.ringBell(x, y, z); else pushChat('The Storm Bell is silent here.'); }
    else this.engine.openBlockScreen(x, y, z, kind);
  }

  /** Selection box of a block at a position (fences and panes depend on their neighbours). */
  selectionOf(block: number, x: number, y: number, z: number): number[] {
    return B.selectionAt((a, b, c) => this.world.getBlock(a, b, c), block, x, y, z);
  }

  // ======================================================================= decoration
  /** Fence gates swing open away from the player (turning round if opened from the other side). */
  toggleGate(x: number, y: number, z: number): void {
    const d = B.getBlock(this.world.getBlock(x, y, z));
    if (d.shape !== 'gate' || !d.facing) return;
    let f = d.facing;
    if (!d.open) {
      const look = lookFacing(this.player.yaw);
      if (look === B.OPPOSITE[f]) f = look;
    }
    this.world.setBlock(x, y, z, B.gateId(f, !d.open), 'player');
    this.sound(d.open ? 'door_close' : 'door_open', x + 0.5, y + 0.5, z + 0.5, 0.6, 1.15 + Math.random() * 0.1);
  }

  toggleTrapdoor(x: number, y: number, z: number): void {
    const d = B.getBlock(this.world.getBlock(x, y, z));
    if (d.shape !== 'trapdoor' || !d.facing) return;
    this.world.setBlock(x, y, z, B.trapdoorId(d.facing, d.half === 'top' ? 'top' : 'bottom', !d.open), 'player');
    this.sound(d.open ? 'door_close' : 'door_open', x + 0.5, y + 0.5, z + 0.5, 0.6, 1.3 + Math.random() * 0.1);
  }

  /** Right-clicking a sign: a dye colours its text, anything else opens the editor. */
  useSign(x: number, y: number, z: number): void {
    const key = posKey(x, y, z);
    let be = this.world.blockEntities.get(key) as SignEntity | undefined;
    if (!be || be.type !== 'sign') { be = { type: 'sign', lines: ['', '', '', ''] }; this.world.blockEntities.set(key, be); }
    const held = this.inventory.selectedStack;
    const dye = held && held.id.endsWith('_dye') ? held.id.slice(0, -4) : null;
    if (dye && (DYE_COLORS as readonly string[]).includes(dye)) {
      if ((be.color ?? 'black') === dye) return;
      be.color = dye;
      if (!this.player.creative) this.consume(this.inventory.selected);
      this.signs.refresh();
      this.sound('place:wool', x + 0.5, y + 0.5, z + 0.5, 0.5, 1.4);
      return;
    }
    this.engine.openSignEditor(x, y, z);
  }

  /** Text typed into the sign editor (up to four lines). */
  setSignText(lines: string[]): void {
    const s = this.signPos;
    if (!s) return;
    const be = this.world.blockEntities.get(posKey(s.x, s.y, s.z)) as SignEntity | undefined;
    if (!be || be.type !== 'sign') return;
    be.lines = [0, 1, 2, 3].map((i) => (lines[i] ?? '').slice(0, 24));
    this.signs.refresh();
  }

  /** The sign editor closed. */
  finishSign(): void {
    const s = this.signPos;
    this.signPos = null;
    if (!s) return;
    const be = this.world.blockEntities.get(posKey(s.x, s.y, s.z)) as SignEntity | undefined;
    if (be?.type === 'sign' && be.lines.some((l) => l.trim())) this.progress.grant('sign');
    this.signs.refresh();
  }

  /** Flower pots: put a flower, cactus or dry shrub in, or take the plant back out. */
  usePot(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    const plant = B.potPlant(id);
    const p = this.player;
    if (plant) {
      this.world.setBlock(x, y, z, B.FLOWER_POT, 'player');
      if (!p.creative) { const left = this.giveItem(makeStack(plant)); if (left) this.scatter(makeStack(plant), x + 0.5, y + 0.6, z + 0.5); }
      this.sound('place:grass', x + 0.5, y + 0.5, z + 0.5, 0.7, 1.1);
      return;
    }
    const held = this.inventory.selectedStack;
    if (id !== B.FLOWER_POT || !held || B.POTTED[held.id] === undefined) return;
    this.world.setBlock(x, y, z, B.POTTED[held.id], 'player');
    if (!p.creative) this.consume(this.inventory.selected);
    this.sound('place:grass', x + 0.5, y + 0.5, z + 0.5, 0.7, 1);
  }

  /** Takes a painting off the wall (dropping it unless in Creative). */
  breakPainting(pt: Painting, drop: boolean): void {
    if (pt.removed) return;
    pt.removed = true;
    this.sound('break:wood', pt.x, pt.y, pt.z, 0.8, 1);
    this.particles.blockBreak(pt.x - 0.5, pt.y - 0.5, pt.z - 0.5, this.models.particleColors(B.PLANKS), this.brightnessAt(pt.x, pt.y, pt.z), 12);
    if (drop) this.entities.spawnItem(makeStack('painting'), pt.x, pt.y, pt.z);
  }

  // ======================================================================= armour stands (2.1)
  /** Stands an armour stand on the spot the player is looking at, facing them. */
  private placeStand(t: RayHit, slot: number): boolean {
    const p = this.player;
    const x = t.px, y = t.py, z = t.pz;
    const here = this.world.getBlock(x, y, z), up = this.world.getBlock(x, y + 1, z);
    if (here === UNLOADED || up === UNLOADED || B.IS_SOLID[here] || B.IS_SOLID[up] || B.IS_LAVA[here]) return false;
    if (needsSupport(here) && !B.IS_FLUID[here]) return false;      // not on top of a flower or a torch
    if (this.entities.stands().some((s) => Math.floor(s.x) === x && Math.floor(s.z) === z && Math.abs(s.y - y) < 1.5)) return false;
    const box = AABB.fromFeet(x + 0.5, y, z + 0.5, STAND_WIDTH, STAND_HEIGHT);
    if (boxCollides(this.world, box)) return false;
    // face the player, turned to the nearest eighth of a circle
    const yaw = Math.round(Math.atan2(-(p.x - (x + 0.5)), -(p.z - (z + 0.5))) / (Math.PI / 4)) * (Math.PI / 4);
    const st = new ArmourStand(yaw);
    st.setPos(x + 0.5, y, z + 0.5);
    this.entities.add(st);
    this.sound('place:wood', x + 0.5, y + 0.5, z + 0.5, 0.8, 0.9);
    if (!p.creative) this.consume(slot);
    return true;
  }

  /**
   * Right-click on a stand. Holding armour: it goes on (swapping what was there);
   * holding anything else: it goes in the stand's hand. Empty hand: take back the
   * piece you aim at (or what it holds, or whatever is left); sneaking with an
   * empty hand swaps your whole set of armour with the stand's.
   */
  useStand(st: ArmourStand, at: number): void {
    const p = this.player;
    const inv = this.inventory;
    const sel = inv.selected;
    const held = inv.get(sel);
    const loud = (pitch: number) => this.sound('place:wool', st.x, st.y + 1, st.z, 0.6, pitch);
    if (!held && p.sneaking) {
      let moved = false;
      for (let i = 0; i < 4; i++) {
        const mine = inv.get(ARMOR_START + i), theirs = st.items[i];
        if (!mine && !theirs) continue;
        inv.slots[ARMOR_START + i] = theirs;
        st.items[i] = mine;
        moved = true;
      }
      if (moved) {
        inv.changed();
        loud(1.1);
        if (st.items.slice(0, 4).some(Boolean)) this.progress.grant('stand');
        if (inv.armorPoints() > 0) this.progress.grant('armor');
      }
      return;
    }
    if (held) {
      const def = getItem(held.id);
      const slot = def.armor ? def.armor.slot : STAND_HAND;
      const old = st.items[slot];
      st.items[slot] = { ...cloneStack(held)!, count: 1 };
      held.count--;
      inv.slots[sel] = held.count > 0 ? held : null;
      if (old) {
        if (!inv.slots[sel]) inv.slots[sel] = old;
        else { const left = inv.add(old); if (left > 0) this.entities.spawnItem({ ...old, count: left }, st.x, st.y + 1, st.z); }
      }
      inv.changed();
      loud(def.armor ? 1 : 1.3);
      if (def.armor) this.progress.grant('stand');
      return;
    }
    // empty hand: the piece at the height aimed at, else what it holds, else anything
    const band = at >= 1.45 ? 0 : at >= 0.95 ? 1 : at >= 0.3 ? 2 : 3;
    const order = [band, STAND_HAND, 0, 1, 2, 3];
    const i = order.find((k) => st.items[k]);
    if (i === undefined) return;
    inv.slots[sel] = st.items[i];
    st.items[i] = null;
    inv.changed();
    loud(0.85);
  }

  /** A hit on a stand: it wobbles; a second hit soon after knocks it down. */
  hitStand(st: ArmourStand): void {
    const p = this.player;
    this.sound('hit:wood', st.x, st.y + 1, st.z, 0.6, 1.1);
    if (!st.hit(p.creative)) return;
    st.removed = true;
    this.sound('break:wood', st.x, st.y + 1, st.z, 0.8, 1);
    this.particles.blockBreak(st.x - 0.5, st.y, st.z - 0.5, this.models.particleColors(B.PLANKS), this.brightnessAt(st.x, st.y + 1, st.z), 14);
    st.dropAll(this.entities, !p.creative);
  }

  // ======================================================================= boats
  /** Climbs into a boat. */
  mount(b: Boat, quiet = false): void {
    if (this.riding || b.rider || b.removed) return;
    const p = this.player;
    this.riding = b;
    b.rider = true;
    this.breaking = null; this.eatTicks = 0; this.bowTicks = 0;
    this.hand.eating = 0; this.hand.drawing = 0;
    p.ride(b.x, b.y + BOAT_SEAT, b.z);
    p.prevX = p.x; p.prevY = p.y; p.prevZ = p.z;
    if (!quiet) {
      this.sound('place:wood', b.x, b.y + 0.4, b.z, 0.5, 1.2);
      pushChat(this.engine.input.touchMode ? 'Row with the joystick. Tap Sneak to climb out.' : 'Row with W and S, steer with A and D. Press Shift to climb out.');
    }
  }

  /** Climbs out of the boat: onto dry land next to it if there is some, otherwise into the water. */
  dismount(): void {
    const b = this.riding;
    if (!b) return;
    this.riding = null;
    b.rider = false;
    b.control.forward = 0; b.control.turn = 0;
    this.engine.input.sneakLatch = false;
    const spot = this.landingSpot(b);
    this.player.setPosition(spot.x, spot.y, spot.z);
  }

  private landingSpot(b: Boat): { x: number; y: number; z: number } {
    const w = this.world;
    const x = Math.floor(b.x), y = Math.floor(b.y + 0.5), z = Math.floor(b.z);
    const free = (ax: number, ay: number, az: number) => {
      const here = w.getBlock(ax, ay, az), up = w.getBlock(ax, ay + 1, az), below = w.getBlock(ax, ay - 1, az);
      return here !== UNLOADED && !B.IS_SOLID[here] && !B.IS_WATER[here] && !B.IS_SOLID[up] && B.IS_SOLID[below] === 1;
    };
    for (const r of [1, 2]) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const dy of [0, 1, -1]) if (free(x + dx, y + dy, z + dz)) return { x: x + dx + 0.5, y: y + dy, z: z + dz + 0.5 };
      }
    }
    return { x: b.x, y: b.y + BOAT_HEIGHT, z: b.z };
  }

  /** Keeps the player in the seat after the boat has moved; counts the distance rowed. */
  private carryRider(): void {
    const b = this.riding!, p = this.player;
    const ox = p.x, oz = p.z;
    p.ride(b.x, b.y + BOAT_SEAT, b.z);
    const d = Math.hypot(p.x - ox, p.z - oz);
    if (b.afloat && d > 0.001) {
      this.progress.add('boat', d * 100);
      if (d > 0.05) this.progress.grant('boat');
    }
  }

  private hitBoat(b: Boat): void {
    const p = this.player;
    this.sound('hit:wood', b.x, b.y + 0.3, b.z, 0.6, 1);
    if (!b.hit(p.creative)) return;
    b.removed = true;
    this.sound('break:wood', b.x, b.y + 0.3, b.z, 0.8, 1);
    this.particles.blockBreak(b.x - 0.5, b.y, b.z - 0.5, this.models.particleColors(B.PLANKS), this.brightnessAt(b.x, b.y + 0.6, b.z), 16);
    if (!p.creative) this.entities.spawnItem(makeStack('boat'), b.x, b.y + 0.4, b.z);
  }

  /** Puts a boat on the water (or on the ground) where the player is looking. */
  private placeBoat(slot: number): boolean {
    const p = this.player;
    const [ex, ey, ez] = this.eye();
    const [dx, dy, dz] = this.lookDir();
    const hit = raycast(this.world, ex, ey, ez, dx, dy, dz, this.reach(), true);
    if (!hit) return false;
    let y: number;
    if (B.IS_WATER[hit.block]) {
      const s = waterSurfaceAt(this.world, hit.x, hit.y, hit.z);
      if (s === null) return false;
      y = s - BOAT_DRAFT;
    } else if (hit.face === 2 && B.IS_SOLID[hit.block]) y = hit.y + 1;
    else return false;
    const others = this.entities.boats();
    const fits = (x: number, z: number) => {
      const box = AABB.fromFeet(x, y, z, BOAT_WIDTH, BOAT_HEIGHT);
      if (boxCollides(this.world, box)) return false;
      return !others.some((o) => Math.abs(o.x - x) < BOAT_WIDTH && Math.abs(o.z - z) < BOAT_WIDTH && Math.abs(o.y - y) < 1);
    };
    const spots: [number, number][] = [[hit.hx, hit.hz], [hit.x + 0.5, hit.z + 0.5]];
    const at = spots.find(([x, z]) => fits(x, z));
    if (!at) return false;
    this.entities.spawnBoat(at[0], y, at[1], p.yaw);
    this.sound('place:wood', at[0], y + 0.3, at[1], 0.8, 1);
    if (!p.creative) this.consume(slot);
    return true;
  }

  // ======================================================================= fishing
  /** Right-click with a fishing rod: cast the line, or reel it in. */
  private useRod(slot: number): void {
    if (this.bobber && !this.bobber.removed) { this.reel(slot); return; }
    const p = this.player;
    const [ex, ey, ez] = this.eye();
    const [dx, dy, dz] = this.lookDir();
    const rx = Math.cos(p.yaw) * 0.25, rz = -Math.sin(p.yaw) * 0.25;   // from the right hand
    const v = 0.9;
    this.bobber = this.entities.spawnBobber(ex + dx * 0.4 + rx, ey + dy * 0.4 - 0.15, ez + dz * 0.4 + rz, dx * v, dy * v + 0.15, dz * v);
    this.sound('cast', p.x, p.eyeY, p.z, 0.5, 0.9 + Math.random() * 0.2);
  }

  /** Reels in: a fish (or something else) if one is biting right now. */
  private reel(slot: number): void {
    const b = this.bobber!;
    const p = this.player;
    this.bobber = null;
    b.removed = true;
    this.sound('reel', p.x, p.eyeY, p.z, 0.5, 1);
    let wear = 0;
    if (b.bite > 0) {
      const { stack, kind } = rollCatch();
      // the catch flies out of the water towards the player
      const dx = p.x - b.x, dy = p.eyeY - b.y, dz = p.z - b.z;
      const d = Math.hypot(dx, dy, dz);
      this.entities.spawnItem(stack, b.x, b.y + 0.3, b.z, [dx * 0.1, dy * 0.1 + Math.sqrt(d) * 0.08, dz * 0.1], 0);
      this.spawnXp(1 + Math.floor(Math.random() * 6), p.x, p.y + 0.5, p.z);
      this.progress.add('fish_caught');
      if (kind === 'fish') this.progress.grant('fish');
      this.sound('splash', b.x, b.y, b.z, 0.4, 1.3);
      wear = 1;
    } else if (b.state === 'ground') wear = 2;
    if (wear && !p.creative && this.inventory.damageItem(slot, wear)) this.sound('tool_break', p.x, p.eyeY, p.z);
  }

  /** The line snaps if the rod is put away, the player dies or walks too far off. */
  private tickFishing(): void {
    const b = this.bobber;
    if (!b) return;
    const p = this.player;
    const held = this.inventory.selectedStack;
    if (b.removed || !held || getItem(held.id).kind !== 'rod' || p.dead || b.distanceTo(p.x, p.y, p.z) > 32) {
      b.removed = true;
      this.bobber = null;
    }
  }

  /** Draws the fishing line from the rod's tip (lower right of the view) to the float, sagging a little. */
  private drawFishLine(cam: THREE.PerspectiveCamera, alpha: number): void {
    const b = this.bobber;
    const line = this.fishLine;
    if (!b || b.removed) { line.visible = false; return; }
    const [fwd, right, up, tip, end] = this.lineV;
    if (this.hand.tipOnScreen(this.engine.renderer.overlayCamera, tip)) {
      // the rod tip as drawn by the first-person hand, carried into the world a little ahead of the eye
      tip.z = 0.5;
      tip.unproject(cam);
      fwd.copy(tip).sub(cam.position).normalize();
      tip.copy(cam.position).addScaledVector(fwd, 0.9);
    } else {
      cam.getWorldDirection(fwd);
      right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      tip.copy(cam.position).addScaledVector(fwd, 0.9).addScaledVector(right, 0.44).addScaledVector(up, -0.1);
    }
    end.set(b.prevX + (b.x - b.prevX) * alpha, b.prevY + (b.y - b.prevY) * alpha + 0.28, b.prevZ + (b.z - b.prevZ) * alpha);
    const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count - 1;
    const sag = Math.min(1.2, tip.distanceTo(end) * 0.07) * (b.state === 'flying' ? 0.3 : 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pos.setXYZ(i, tip.x + (end.x - tip.x) * t, tip.y + (end.y - tip.y) * t - sag * 4 * t * (1 - t), tip.z + (end.z - tip.z) * t);
    }
    pos.needsUpdate = true;
    line.visible = true;
  }

  /** Buckets: scoop up a water source, or pour one out. */
  /**
   * Buckets. An empty bucket scoops up a water or lava source (a Water / Lava Bucket);
   * a full one pours its source where you point. `pour` is the fluid in the bucket.
   */
  private useBucket(slotIndex: number, pour: number | null): boolean {
    const p = this.player;
    const [ex, ey, ez] = this.eye();
    const [dx, dy, dz] = this.lookDir();
    const hit = raycast(this.world, ex, ey, ez, dx, dy, dz, this.reach(), pour === null);
    if (!hit) return false;
    if (pour === null) {
      if (B.FLUID_LEVEL[hit.block] !== 0 || !B.IS_FLUID[hit.block]) return false;
      const filled = B.IS_LAVA[hit.block] ? 'lava_bucket' : 'water_bucket';
      this.world.setBlock(hit.x, hit.y, hit.z, B.AIR, 'player');
      this.sound(filled === 'lava_bucket' ? 'lava_fill' : 'bucket_fill', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 0.7);
      if (!p.creative) {
        const s = this.inventory.get(slotIndex)!;
        if (s.count <= 1) this.inventory.slots[slotIndex] = makeStack(filled);
        else { s.count--; const left = this.inventory.add(makeStack(filled)); if (left) this.dropStack(makeStack(filled)); }
        this.inventory.changed();
      }
      return true;
    }
    let x = hit.px, y = hit.py, z = hit.pz;
    const at = B.getBlock(hit.block);
    if (at.replaceable || B.IS_FLUID[hit.block]) { x = hit.x; y = hit.y; z = hit.z; }
    const cur = this.world.getBlock(x, y, z);
    if (cur === UNLOADED || (!B.getBlock(cur).replaceable && !needsSupport(cur)) || (B.IS_FLUID[cur] && B.FLUID_LEVEL[cur] === 0) || B.IS_SOLID[cur]) return false;
    if (needsSupport(cur) && !B.IS_SOLID[cur]) {
      if (pour === B.LAVA) this.burnOut(x, y, z); else this.washOut(x, y, z, cur);
    }
    if (pour === B.WATER && this.dim === 'cinderdeep') {
      // far too hot down here: the water hisses away as steam
      this.sound('fizz', x + 0.5, y + 0.5, z + 0.5, 0.8, 0.9);
      this.effect('smoke', x + 0.5, y + 0.4, z + 0.5, 14);
      if (!p.creative) { this.inventory.slots[slotIndex] = makeStack('bucket'); this.inventory.changed(); }
      return true;
    }
    this.world.setBlock(x, y, z, pour, 'player');
    this.sound(pour === B.LAVA ? 'lava_empty' : 'bucket_empty', x + 0.5, y + 0.5, z + 0.5, 0.7);
    if (!p.creative) { this.inventory.slots[slotIndex] = makeStack('bucket'); this.inventory.changed(); }
    return true;
  }

  private consume(slot: number): void {
    const s = this.inventory.get(slot);
    if (!s) return;
    s.count--;
    if (s.count <= 0) this.inventory.slots[slot] = null;
    this.inventory.changed();
  }

  private finishEating(): void {
    const p = this.player;
    const s = this.inventory.selectedStack;
    this.eatTicks = 0;
    this.hand.eating = 0;
    if (!s) return;
    const f = getItem(s.id).food;
    if (!f) return;
    p.food = Math.min(20, p.food + f.hunger);
    p.saturation = Math.min(p.food, p.saturation + f.saturation);
    this.sound('burp', p.x, p.eyeY, p.z, 0.4);
    this.progress.add('food_eaten');
    this.progress.grant('eat');
    if (!p.creative) this.consume(this.inventory.selected);
  }

  private releaseBow(): void {
    const p = this.player;
    const f = Math.min(1, this.bowTicks / 20);
    const power = (f * f + f * 2) / 3;
    this.bowTicks = 0;
    this.hand.drawing = 0;
    if (power < 0.1) return;
    if (!p.creative && !this.inventory.consumeItem('arrow', 1)) return;
    const [ex, ey, ez] = this.eye();
    const [dx, dy, dz] = this.lookDir();
    const v = power * 3;
    const might = runeLevel(this.inventory.selectedStack, 'might');
    this.entities.spawnArrow(ex + dx * 0.5, ey - 0.1 + dy * 0.5, ez + dz * 0.5, dx * v, dy * v, dz * v, true, 2 * (power >= 1 ? 1.25 : 1) * (might ? 1 + 0.25 * (might + 1) : 1));
    this.sound('bow', p.x, p.eyeY, p.z, 0.7, 1 / (0.9 + Math.random() * 0.3) + power * 0.5);
    if (!p.creative && this.inventory.damageItem(this.inventory.selected, 1)) this.sound('tool_break');
    this.progress.add('arrows_shot');
  }

  /** Called when a player arrow hits a mob (for the advancement). */
  onArrowHit(): void {
    this.progress.grant('bow');
  }

  // ======================================================================= weather
  /** What falls from the sky in this column: nothing in deserts and badlands, snow where it is cold. */
  precipAt(x: number, z: number): number {
    const key = ((x & 0xffff) | ((z & 0xffff) << 16)) >>> 0;
    let v = this.precipCache.get(key);
    if (v !== undefined) return v;
    const col = this.world.generator.column(x, z);
    const b = col.biome;
    if (b === BIOME_DESERT || b === BIOME_BADLANDS || b === BIOME_CINDERDEEP || b === BIOME_STARHOLLOW) v = PRECIP_NONE;
    else if (b === BIOME_SNOWY || (b === BIOME_MOUNTAINS && col.height >= 90) || col.height >= 108) v = PRECIP_SNOW;
    else v = PRECIP_RAIN;
    if (this.precipCache.size > 60000) this.precipCache.clear();
    this.precipCache.set(key, v);
    return v;
  }

  /** The highest block that stops rain in a column (solid or water), -1 if none or not loaded. */
  rainTop(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const b = this.world.getBlock(x, y, z);
      if (b === UNLOADED) return -1;
      if (B.IS_SOLID[b] || B.IS_WATER[b]) return y;
    }
    return -1;
  }

  isLoaded(x: number, z: number): boolean {
    return this.world.isLoaded(x, z);
  }

  /** Is rain (not snow) falling on this spot right now? */
  rainingOn(x: number, y: number, z: number): boolean {
    return this.weather.rain > 0.2 && this.precipAt(x, z) === PRECIP_RAIN && this.rainTop(x, z) < y;
  }

  /** Changes the weather now (Creative option / tests). */
  setWeather(kind: WeatherKind): void {
    this.weather.set(kind);
  }

  private tickWeather(): void {
    const w = this.weather, p = this.player;
    if (w.rain < 0.05) return;
    // raindrops splash on the ground around the player
    const drops = Math.floor(w.rain * 3 + Math.random());
    for (let i = 0; i < drops; i++) {
      const x = Math.floor(p.x + (Math.random() - 0.5) * 16), z = Math.floor(p.z + (Math.random() - 0.5) * 16);
      if (this.precipAt(x, z) !== PRECIP_RAIN) continue;
      const top = this.rainTop(x, z);
      if (top < 0 || Math.abs(top - p.y) > 10) continue;
      this.effect('drip', x + 0.5, top + 1.02, z + 0.5, 1);
    }
    // lightning during thunderstorms
    if (w.stormy && Math.random() < 1 / 200) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 50;
      const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      if (this.world.isLoaded(x, z) && this.precipAt(x, z) !== PRECIP_NONE) this.strike(x, z);
    }
  }

  /** A bolt of lightning hits the highest block of column (x, z). */
  strike(x: number, z: number): void {
    const top = this.rainTop(x, z);
    if (top < 0) return;
    const y = top + 1, cx = x + 0.5, cz = z + 0.5;
    const p = this.player;
    this.precip.bolt(cx, y, cz);
    this.weather.flash = 1;
    const d = Math.hypot(cx - p.x, cz - p.z);
    this.engine.audio.thunder(Math.max(0.25, 1 - d / 160), Math.min(1.2, d / 100));
    for (const m of this.entities.mobsNear(cx, y, cz, 3.5)) {
      if (m.alive && Math.hypot(m.x - cx, m.z - cz) < 3.5) m.hurt(5, this, m.x - cx, m.z - cz, false);
    }
    if (Math.hypot(p.x - cx, p.z - cz) < 3 && Math.abs(p.y - y) < 4) this.damagePlayer(5, { x: cx, y, z: cz, kind: 'lightning' });
    this.effect('smoke', cx, y + 0.3, cz, 8);
    if (d < 32) this.progress.grant('storm');
    this.lastStrike = { x, y, z, tick: this.tickCount };
  }

  // ======================================================================= farming
  /** Hoe: grass or dirt -> farmland. Shovel: grass -> village path. */
  private tillOrPath(t: RayHit, slot: number, tool: 'hoe' | 'shovel'): boolean {
    if (t.face !== 2) return false;
    const above = this.world.getBlock(t.x, t.y + 1, t.z);
    if (above !== B.AIR && B.RENDER[above] !== B.RENDER_CROSS) return false;
    if (B.CROP_STAGE[above] >= 0) return false;
    let to = -1;
    if (tool === 'hoe' && (t.block === B.GRASS || t.block === B.DIRT || t.block === B.PATH)) to = B.FARMLAND;
    if (tool === 'shovel' && t.block === B.GRASS) to = B.PATH;
    if (to < 0) return false;
    if (above !== B.AIR) this.world.setBlock(t.x, t.y + 1, t.z, B.AIR, 'player');
    this.world.setBlock(t.x, t.y, t.z, to, 'player');
    if (to === B.FARMLAND && this.waterNear(t.x, t.y, t.z)) this.world.setBlock(t.x, t.y, t.z, B.FARMLAND_MOIST, 'player');
    this.sound('step:gravel', t.x + 0.5, t.y + 1, t.z + 0.5, 0.9, 0.9);
    if (!this.player.creative && this.inventory.damageItem(slot, 1)) this.sound('tool_break');
    return true;
  }

  /** Bone meal: crops grow a few stages; on grass, tall grass and flowers sprout around. */
  useBoneMeal(x: number, y: number, z: number): boolean {
    const id = this.world.getBlock(x, y, z);
    const stages = B.cropStages(id);
    if (stages) {
      const s = B.CROP_STAGE[id];
      if (s >= stages.length - 1) return false;
      const next = Math.min(stages.length - 1, s + (stages.length === 8 ? 2 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 2)));
      this.world.setBlock(x, y, z, stages[next], 'player');
      this.effect('happy', x + 0.5, y + 0.4, z + 0.5, 8);
      return true;
    }
    if (id === B.GRASS) {
      let n = 0;
      for (let i = 0; i < 24; i++) {
        const gx = x + Math.round((Math.random() - 0.5) * 6), gz = z + Math.round((Math.random() - 0.5) * 6);
        for (const gy of [y + 1, y, y - 1]) {
          if (this.world.getBlock(gx, gy, gz) === B.GRASS && this.world.getBlock(gx, gy + 1, gz) === B.AIR) {
            const r = Math.random();
            this.world.setBlock(gx, gy + 1, gz, r < 0.8 ? B.TALL_GRASS : r < 0.85 ? B.FLOWER_RED : r < 0.9 ? B.FLOWER_YELLOW : r < 0.95 ? B.FLOWER_BLUE : B.FLOWER_WHITE, 'player');
            this.effect('happy', gx + 0.5, gy + 1.3, gz + 0.5, 2);
            n++;
            break;
          }
        }
      }
      return n > 0;
    }
    return false;
  }

  /** Farmland is moist when water is within 4 blocks at its level or one above. */
  waterNear(x: number, y: number, z: number): boolean {
    for (let dy = 0; dy <= 1; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (B.IS_WATER[this.world.getBlock(x + dx, y + dy, z + dz)]) return true;
    }
    return false;
  }

  /** Random ticks: 3 random cells per 16-high section of every chunk near the player. */
  private tickRandom(): void {
    const p = this.player;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    const R = Math.max(2, Math.min(6, Math.floor(this.entities.simulationDistance / 16)));
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const c = this.world.getChunk(pcx + dx, pcz + dz);
      if (!c) continue;
      const blocks = c.blocks;
      for (let sec = 0; sec < WORLD_HEIGHT / 16; sec++) {
        for (let k = 0; k < 3; k++) {
          const r = (Math.random() * 4096) | 0;
          const i = r + sec * 4096;   // index = x | z<<4 | y<<8, so a section is 4096 consecutive cells
          const id = blocks[i];
          if (!B.RANDOM_TICK[id]) continue;
          this.randomTick(c.cx * 16 + (i & 15), i >> 8, c.cz * 16 + ((i >> 4) & 15), id);
        }
      }
    }
  }

  randomTick(x: number, y: number, z: number, id: number): void {
    if (B.CROP_STAGE[id] >= 0) {
      const below = this.world.getBlock(x, y - 1, z);
      if (!B.IS_FARMLAND(below)) return;
      const l = this.world.getLight(x, y, z);
      if (Math.max(l >> 4, l & 15) < 9) return;
      if (Math.random() < (below === B.FARMLAND_MOIST || this.rainingOn(x, y, z) ? 0.5 : 0.25)) {
        const stages = B.cropStages(id)!;
        const s = B.CROP_STAGE[id];
        if (s < stages.length - 1) this.world.setBlock(x, y, z, stages[s + 1], 'growth');
      }
      return;
    }
    if (B.IS_FARMLAND(id)) {
      const wet = this.waterNear(x, y, z) || this.rainingOn(x, y + 1, z);
      const above = this.world.getBlock(x, y + 1, z);
      if (wet && id === B.FARMLAND) this.world.setBlock(x, y, z, B.FARMLAND_MOIST, 'growth');
      else if (!wet && id === B.FARMLAND_MOIST) this.world.setBlock(x, y, z, B.FARMLAND, 'growth');
      else if (!wet && B.CROP_STAGE[above] < 0 && Math.random() < 0.15) this.world.setBlock(x, y, z, B.DIRT, 'growth');
    }
  }

  // ======================================================================= furnaces
  private tickFurnaces(): void {
    for (const key of this.furnaces) {
      const be = this.world.blockEntities.get(key) as FurnaceEntity | undefined;
      if (!be || be.type !== 'furnace') { this.furnaces.delete(key); continue; }
      const [x, y, z] = key.split(',').map(Number);
      const block = this.world.getBlock(x, y, z);
      if (block === UNLOADED) continue;
      if (B.getBlock(block).interact !== 'furnace') { this.furnaces.delete(key); continue; }
      const [input, fuel, output] = be.items;
      const smelt = input ? getItem(input.id).smelt : undefined;
      const canSmelt = !!smelt && (!output || (output.id === smelt.result && output.count < maxStackOf(output.id)));
      const wasBurning = be.burnTime > 0;
      let changed = false;
      if (be.burnTime > 0) be.burnTime--;
      if (be.burnTime === 0 && canSmelt && fuel) {
        const burn = getItem(fuel.id).fuel ?? 0;
        if (burn > 0) {
          be.burnTime = be.burnTotal = burn;
          fuel.count--;
          if (fuel.count <= 0) be.items[1] = fuel.id === 'lava_bucket' ? makeStack('bucket') : null;
          changed = true;
        }
      }
      if (be.burnTime > 0 && canSmelt) {
        be.cookTime++;
        if (be.cookTime >= 200) {
          be.cookTime = 0;
          input!.count--;
          if (input!.count <= 0) be.items[0] = null;
          if (output) output.count++;
          else be.items[2] = makeStack(smelt!.result, 1);
          be.xp += smelt!.xp;
          changed = true;
        }
      } else if (be.cookTime > 0) be.cookTime = Math.max(0, be.cookTime - 2);
      const burning = be.burnTime > 0;
      if (burning !== wasBurning) {
        const def = B.getBlock(block);
        const facing = def.facing ?? 's';
        this.world.setBlock(x, y, z, B.facingVariant(burning ? 'furnace_lit' : 'furnace', facing), 'system');
      }
      if (burning && this.tickCount % 10 === 0 && Math.random() < 0.3) this.effect('smoke', x + 0.5, y + 1.1, z + 0.5, 1);
      if (changed && this.openPos && posKey(this.openPos.x, this.openPos.y, this.openPos.z) === key) ui.set({ invVersion: ui.get().invVersion + 1 });
      if (this.openPos && posKey(this.openPos.x, this.openPos.y, this.openPos.z) === key) {
        ui.set({ furnace: { burn: be.burnTotal ? be.burnTime / be.burnTotal : 0, cook: be.cookTime / 200 } });
      }
    }
  }

  // ======================================================================= frame
  frame(dt: number, alpha: number): void {
    const eng = this.engine;
    const r = eng.renderer;
    const p = this.player;
    const opts = eng.options;
    const input = eng.input;

    // ---- mouse look (per frame for responsiveness)
    const [mdx, mdy] = input.takeMouseDelta();
    if (!p.dead && ui.get().overlay === null && !this.paused) {
      const s = 0.0006 + opts.sensitivity * 0.0044;
      p.yaw -= mdx * s;
      p.pitch -= mdy * s * (opts.invertY ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
    }

    // ---- camera
    const a = this.paused ? 1 : alpha;
    const px = p.prevX + (p.x - p.prevX) * a;
    const py = p.prevY + (p.y - p.prevY) * a;
    const pz = p.prevZ + (p.z - p.prevZ) * a;
    const eye = p.prevEyeHeight + (p.eyeHeight - p.prevEyeHeight) * a;
    const cam = r.camera;
    const walk = p.prevWalkDist + (p.walkDist - p.prevWalkDist) * a;
    const bobAmt = opts.viewBobbing ? (p.prevBob + (p.bob - p.prevBob) * a) : 0;
    cam.position.set(px, py + eye, pz);
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    if (bobAmt > 0.001) {
      const ph = walk * Math.PI;
      cam.position.y += -Math.abs(Math.cos(ph)) * bobAmt * 0.8;
      cam.position.x += Math.cos(p.yaw) * Math.sin(ph) * bobAmt * 0.5;
      cam.position.z += -Math.sin(p.yaw) * Math.sin(ph) * bobAmt * 0.5;
      cam.rotation.z += Math.sin(ph) * bobAmt * 0.3;
      cam.rotation.x += Math.abs(Math.cos(ph - 0.2)) * bobAmt * 0.5;
    }
    this.hurtTilt = Math.max(0, this.hurtTilt - dt * 3);
    cam.rotation.z += Math.sin(this.hurtTilt * Math.PI) * 0.12 * this.hurtTilt;
    if (p.dead) { cam.rotation.z = 0.6; cam.position.y = py + 0.3; }

    let fovMul = 1;
    if (p.sprinting) fovMul *= 1.12;
    if (p.flying) fovMul *= 1.06;
    if (this.bowTicks > 0) fovMul *= 1 - Math.min(1, this.bowTicks / 20) * 0.15;
    if (p.eyeInWater) fovMul *= 0.9;
    if (p.gliding) fovMul *= 1.12;
    this.fovCurrent += (fovMul - this.fovCurrent) * Math.min(1, dt * 10);
    const fov = opts.fov * this.fovCurrent;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();

    // ---- sky & lighting
    this.weather.flash = Math.max(0, this.weather.flash - dt * 3.5);
    if (this.dim === 'starhollow') {
      // 2.2: the Starhollow's sky is always a clear night full of stars (the world's own clock runs on)
      const t = this.dayNight.time;
      this.dayNight.time = 18000;
      this.dayNight.update(0, { rain: 0, thunder: 0, flash: 0 });
      this.dayNight.time = t;
    } else this.dayNight.update(this.paused ? 0 : alpha, this.weather);
    const L = this.dayNight.light;
    const u = r.uniforms;
    u.uDaylight.value = L.daylight;
    u.uSkyColor.value.copy(L.skyTint);
    u.uSunDir.value.copy(this.dayNight.sky.sunDir);
    u.uSunStrength.value = L.sunStrength;
    u.uGamma.value = opts.brightness;
    u.uWaterFrame.value = Math.floor(performance.now() / 150) % 8;
    u.uLavaFrame.value = Math.floor(performance.now() / 260) % 8;
    const far = this.chunks.renderDistance * 16;
    const deep = this.dim === 'cinderdeep';
    // the Cinderdeep has no sky: a warm glow from the lava sea lights everything a little (the Brightness option scales it)
    u.uAmbient.value = deep ? DEEP_AMBIENT * (0.85 + 0.3 * opts.brightness) : 0.045;
    if (deep) u.uAmbientTint.value.setRGB(1, 0.8, 0.7); else u.uAmbientTint.value.setRGB(1, 1, 1);
    const starry = this.dim === 'starhollow';
    if (starry) { u.uAmbient.value = STAR_AMBIENT * (0.85 + 0.3 * opts.brightness); u.uAmbientTint.value.setRGB(0.82, 0.82, 1); }
    if (deep) { u.uDaylight.value = 0; u.uSunStrength.value = 0; }
    r.sky.group.visible = !deep;
    if (p.eyeInLava) {
      u.uFogColor.value.setRGB(0.85, 0.32, 0.06);
      u.uFogNear.value = 0;
      u.uFogFar.value = 1.6;
    } else if (p.eyeInWater) {
      u.uFogColor.value.setRGB(0.08, 0.16, 0.42).multiplyScalar(0.4 + 0.6 * L.daylight);
      u.uFogNear.value = 0;
      u.uFogFar.value = 18;
    } else if (starry) {
      // the islands fade into a deep violet haze of starlight
      u.uFogColor.value.setRGB(0.1, 0.075, 0.21);
      u.uFogNear.value = far * 0.55;
      u.uFogFar.value = far;
    } else if (deep) {
      // a smoky red haze: the far caverns fade into the glow of the lava sea
      u.uFogColor.value.setRGB(0.2, 0.06, 0.04);
      u.uFogNear.value = Math.min(24, far * 0.3);
      u.uFogFar.value = Math.min(far, 96);
    } else {
      u.uFogColor.value.copy(L.fog);
      const wet = this.weather.rain * (this.precipAt(Math.floor(p.x), Math.floor(p.z)) === PRECIP_NONE ? 0.3 : 1);
      u.uFogNear.value = far * (0.62 - 0.32 * wet);
      u.uFogFar.value = far * (1 - 0.12 * wet);
    }
    r.sky.cloudsEnabled = opts.clouds && !starry;
    r.sky.update(cam.position, this.dayNight.sky, performance.now() / 1000, far);
    r.sunLight.position.set(cam.position.x + 30, cam.position.y + 100, cam.position.z + 50);
    r.sunLight.target.position.copy(cam.position);
    r.sunLight.target.updateMatrixWorld();

    // ---- world streaming & culling
    this.projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    this.chunks.update(px, pz, this.frustum);

    // ---- entities, effects
    this.entities.render(a, this);
    this.particles.render();
    // ---- rain and snow around the camera, and its sound
    this.precip.update(this, cam.position, this.weather.rain, L.daylight, performance.now() / 1000, dt);
    {
      const kind = this.precipAt(Math.floor(p.x), Math.floor(p.z));
      const sheltered = this.rainTop(Math.floor(p.x), Math.floor(p.z)) > p.eyeY;
      eng.audio.setWeather(kind === PRECIP_NONE || this.paused ? 0 : this.weather.rain, sheltered, kind === PRECIP_SNOW);
    }
    const t = this.target;
    if (t && !p.dead && ui.get().overlay === null) this.outline.show(t.x, t.y, t.z, this.selectionOf(t.block, t.x, t.y, t.z));
    else if (this.targetPainting && !p.dead && ui.get().overlay === null) this.outline.show(0, 0, 0, this.targetPainting.bounds);
    else if (this.targetBoat && !p.dead && ui.get().overlay === null) {
      const bb = this.targetBoat.box;
      this.outline.show(0, 0, 0, [bb.minX, bb.minY, bb.minZ, bb.maxX, bb.maxY, bb.maxZ]);
    }
    else if (this.targetStand && !p.dead && ui.get().overlay === null) this.outline.show(0, 0, 0, this.targetStand.hitBounds());
    else this.outline.hide();
    this.signs.update(this.world, cam.position, (x, y, z) => this.brightnessAt(x, y, z));
    this.spawnerFigures.update(this.spawners, cam.position, (x, y, z) => this.brightnessAt(x, y, z), this.paused ? 0 : dt);
    const handLight = this.brightnessAt(p.x, p.eyeY, p.z);
    this.hand.root.visible = this.sleepTicks === 0;   // no hand while lying in bed
    this.hand.update(a, walk, bobAmt * 2.2, handLight, this.fovCurrent);
    this.drawFishLine(cam, a);

    // ---- audio listener
    const al = eng.audio.listener;
    al.x = cam.position.x; al.y = cam.position.y; al.z = cam.position.z; al.yaw = p.yaw;

    r.render(!ui.get().hideHud && !p.dead);

    // ---- debug overlay (4 Hz)
    this.debugTimer += dt;
    if (ui.get().showDebug && this.debugTimer > 0.25) {
      this.debugTimer = 0;
      eng.updateDebug(this);
    }
  }

  // ======================================================================= HUD
  pushHud(force: boolean): void {
    const p = this.player;
    const hud = {
      health: Math.ceil(p.health), food: p.food, xpLevel: p.xpLevel,
      xpProgress: Math.round(p.xpProgress * 182) / 182, armor: this.inventory.armorPoints(),
      air: p.air, selected: this.inventory.selected, creative: p.creative,
      hurtTick: p.invulnerable > 0 && p.hurtTime > 0 ? p.hurtTime : 0,
      regenTick: 0, underwater: p.eyeInWater, offhand: !!this.inventory.get(OFFHAND),
      inLava: p.eyeInLava, burning: p.fireTicks > 0 && !p.creative && !p.dead,
      gate: this.gateTicks > 0 ? Math.round(Math.min(1, this.gateTicks / this.gateTime()) * 20) / 20 : 0,
      gateStar: this.gateStar,
      gliding: this.player.gliding,
      saturationShake: p.food <= 4 && p.food > 0,
    };
    const key = JSON.stringify(hud);
    if (force || key !== this.hudCache) {
      this.hudCache = key;
      ui.set({ hud });
    }
    const sel = this.inventory.selectedStack;
    const selId = sel?.id ?? '';
    if (this.inventory.selected !== this.lastSelected || selId !== this.lastSelectedId) {
      if (selId && (this.inventory.selected !== this.lastSelected || this.lastSelectedId !== selId)) {
        ui.set({ heldName: { text: getItem(selId).name, key: Date.now() } });
      }
      this.lastSelected = this.inventory.selected;
      this.lastSelectedId = selId;
    }
    if (this.inventory.version !== this.lastInvVersion) {
      this.lastInvVersion = this.inventory.version;
      ui.set({ invVersion: this.inventory.version });
    }
  }

  setGameMode(mode: 'survival' | 'creative'): void {
    this.player.gameMode = mode;
    if (mode === 'survival') this.player.flying = false;
    this.pushHud(true);
  }

  /** Teleports player (debug/testing). */
  teleport(x: number, y: number, z: number): void {
    if (this.riding) this.dismount();
    this.player.setPosition(x, y, z);
  }

  chunkKeyAt(): string {
    return chunkKey(Math.floor(this.player.x) >> 4, Math.floor(this.player.z) >> 4);
  }

  blockEntityAt(x: number, y: number, z: number): BlockEntity | undefined {
    return this.world.blockEntities.get(posKey(x, y, z));
  }
}
