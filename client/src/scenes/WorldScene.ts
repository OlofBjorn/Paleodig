import Phaser from 'phaser';
import {
  ApiError,
  clearStoredPlayerId,
  dig,
  fetchSites,
  isGameEnded,
  itemImageUrl,
  siteImageUrl,
  type DigSite,
  type DugItem,
  type Player,
} from '../api';
import type { ConfirmDialog } from '../ui/ConfirmDialog';
import { openEndGameDialog } from '../ui/endgameDialog';
import { revealItem } from '../ui/ItemReveal';
import { itemTextureKey, loadTextures, siteTextureKey } from '../ui/loadTextures';
import { Miner, preloadMinerTextures } from '../ui/Miner';
import { stepPosition, zoneIndexAt, type Bounds, type Rect } from '../ui/worldLogic';

// A dark outline keeps text readable on top of any background image.
const TEXT = { color: '#f2e8cf', stroke: '#1e1612', strokeThickness: 4 };

const WORLD_KEY = 'world-map';
const WORLD_URL = `${import.meta.env.BASE_URL}images/world.png`;

// ---- Layout. The map image, if you make one, has to line up with these numbers. ----

/** One dig area per site, in the order the server lists the sites. */
const ZONES: Rect[] = [
  { x: 40, y: 250, w: 210, h: 170 },
  { x: 295, y: 250, w: 210, h: 170 },
  { x: 550, y: 250, w: 210, h: 170 },
];

/** Where the miner's feet can go. Keeps him clear of the buttons above and the text panel below. */
const WALK_BOUNDS: Bounds = { minX: 30, maxX: 770, minY: 170, maxY: 455 };
const START = { x: 400, y: 440 };
const MOVE_SPEED = 230; // pixels per second

// Colours for a zone until the map or its site image exists.
const FALLBACK_COLORS = [0x8a5a3c, 0x4f6d7a, 0xc2a35a];

/** The swing runs at least this long, so even an instant answer still looks like digging. */
const MIN_DIG_MS = 900;
/** How long a found item's icon stays up before fading. */
const REVEAL_LINGER_MS = 3500;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Zone {
  site: DigSite;
  rect: Rect;
  outline: Phaser.GameObjects.Rectangle;
}

interface SavedPosition {
  x: number;
  y: number;
  facing: 1 | -1;
}

/**
 * All three dig sites on one screen. Walk the miner with WASD or the arrow keys, and press Space
 * or click to dig at whichever site he's standing in.
 */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private zones: Zone[] = [];
  private currentZone: Zone | null = null;
  private miner: Miner | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> | null = null;
  private headerText!: Phaser.GameObjects.Text;
  private findText!: Phaser.GameObjects.Text;
  private zoneText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private reveal: Phaser.GameObjects.GameObject[] = [];
  private revealTimer: Phaser.Time.TimerEvent | null = null;
  private busy = false;
  private dialog: ConfirmDialog | null = null;

  constructor() {
    super('WorldScene');
  }

  preload() {
    preloadMinerTextures(this);
  }

  create() {
    const { width, height } = this.scale;
    this.zones = [];
    this.currentZone = null;
    this.miner = null;
    this.keys = null;
    this.reveal = [];
    this.revealTimer = null;
    this.busy = false;
    this.dialog = null;
    this.player = this.registry.get('player') as Player;

    this.events.once('shutdown', () => {
      this.closeDialog();
      this.savePosition();
    });

    this.statusText = this.add
      .text(width / 2, height / 2, 'Loading the dig sites...', {
        fontSize: '22px',
        ...TEXT,
        align: 'center',
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);

    void this.setup();
  }

  private async setup() {
    try {
      // The site list is cached for the session, so coming back from the inventory is instant.
      let sites = this.registry.get('sites') as DigSite[] | undefined;
      if (!sites) {
        sites = await fetchSites();
        if (!this.scene.isActive()) return;
        this.registry.set('sites', sites);
      }

      // The world map and the site images are optional: anything missing falls back to plain colour.
      await loadTextures(this, [
        { key: WORLD_KEY, url: WORLD_URL },
        ...sites
          .filter((s) => s.image)
          .map((s) => ({ key: siteTextureKey(s.image), url: siteImageUrl(s.image) })),
      ]);
      if (!this.scene.isActive()) return;

      this.statusText.destroy();
      this.buildWorld(sites);
    } catch (err) {
      if (!this.scene.isActive()) return;
      this.statusText.setText(`Could not load the dig sites.\n${String(err)}\n\nClick to retry.`);
      this.input.once('pointerdown', () => this.scene.restart());
    }
  }

  /* -------------------------------- building -------------------------------- */

  private buildWorld(sites: DigSite[]) {
    const { width, height } = this.scale;
    const hasMap = this.textures.exists(WORLD_KEY);

    // Ground: the painted map if there is one, otherwise plain earth with coloured dig areas.
    if (hasMap) {
      // "Cover" scaling: fill the whole screen without distorting the image.
      const map = this.add.image(width / 2, height / 2, WORLD_KEY);
      map.setScale(Math.max(width / map.width, height / map.height));
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x6b4f3a);
    }

    sites.slice(0, ZONES.length).forEach((site, i) => {
      const rect = ZONES[i];
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;

      if (!hasMap) {
        this.add.rectangle(cx, cy, rect.w, rect.h, FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
        // If the site has its own background image, show it inside its area.
        const key = siteTextureKey(site.image);
        if (site.image && this.textures.exists(key)) {
          const image = this.add.image(cx, cy, key);
          image.setScale(Math.min(rect.w / image.width, rect.h / image.height));
        }
      }

      // A faint outline always marks the area; it lights up when the miner stands in it.
      const outline = this.add
        .rectangle(cx, cy, rect.w, rect.h)
        .setFillStyle(0xffe9a8, 0)
        .setStrokeStyle(2, 0xffe9a8, 0.35);

      this.add.text(cx, rect.y - 18, site.name, { fontSize: '20px', ...TEXT }).setOrigin(0.5);
      this.add
        .text(cx, rect.y + rect.h + 16, `Costs ${site.digCost}`, { fontSize: '15px', ...TEXT })
        .setOrigin(0.5);

      this.zones.push({ site, rect, outline });
    });

    // The miner, where we left him if we're coming back from another screen.
    const saved = this.registry.get('minerPos') as SavedPosition | undefined;
    this.miner = new Miner(this, saved?.x ?? START.x, saved?.y ?? START.y);
    if (saved) this.miner.setFacing(saved.facing);

    this.buildHud();
    this.setupInput();
    this.refreshZone();
  }

  private buildHud() {
    const { width } = this.scale;

    this.headerText = this.add.text(20, 16, '', { fontSize: '20px', ...TEXT });
    this.refreshHeader();

    this.makeButton(445, 30, 130, 36, 'Inventory', () =>
      this.scene.start('InventoryScene', { from: 'WorldScene' }),
    );
    this.makeButton(585, 30, 130, 36, 'Discoveries', () =>
      this.scene.start('DiscoveriesScene', { from: 'WorldScene' }),
    );
    this.makeButton(725, 30, 130, 36, 'End game', () => {
      if (!this.dialog) this.dialog = openEndGameDialog(this, () => this.closeDialog());
    });

    // The panel is interactive on purpose, so clicking it doesn't count as "click to dig".
    this.add.rectangle(width / 2, 531, width - 20, 134, 0x000000, 0.45).setInteractive();
    this.findText = this.add.text(
      24,
      472,
      'Walk with WASD or the arrow keys. Press Space or click to dig.',
      { fontSize: '17px', color: '#f2e8cf', wordWrap: { width: width - 48 } },
    );
    this.zoneText = this.add
      .text(width / 2, 580, '', { fontSize: '18px', color: '#ffe9a8' })
      .setOrigin(0.5);
  }

  private setupInput() {
    // Keys are added without "capture", so the game never swallows keystrokes that other screens
    // (the name fields) need for typing.
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keys = keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE', false) as Record<
        string,
        Phaser.Input.Keyboard.Key
      >;
    }

    // Clicking digs, unless the click landed on a button, the text panel or a dialog.
    this.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (over.length > 0 || !pointer.leftButtonDown()) return;
        void this.onDig();
      },
    );
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
    const rect = this.add.rectangle(x, y, w, h, 0xc8963e).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '18px', color: '#2b1d14' }).setOrigin(0.5);
    rect.on('pointerdown', onClick);
  }

  /* -------------------------------- each frame ------------------------------- */

  update(_time: number, delta: number) {
    const miner = this.miner;
    const k = this.keys;
    if (!miner || !k) return;

    // Read every frame, even when frozen, so a press during a dig isn't remembered for later.
    const spacePressed = Phaser.Input.Keyboard.JustDown(k.SPACE);

    if (this.busy || this.dialog) {
      miner.setWalking(false);
      return;
    }
    if (spacePressed) {
      void this.onDig();
      return;
    }

    const dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    const dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);

    if (dx === 0 && dy === 0) {
      miner.setWalking(false);
    } else {
      const next = stepPosition(miner.position, dx, dy, MOVE_SPEED, delta, WALK_BOUNDS);
      miner.moveTo(next.x, next.y);
      if (dx !== 0) miner.setFacing(dx > 0 ? 1 : -1);
      miner.setWalking(true);
    }

    this.refreshZone();
  }

  /** Works out which dig area he's standing in, and updates the highlight and hint to match. */
  private refreshZone() {
    if (!this.miner) return;
    const { x, y } = this.miner.position;
    const index = zoneIndexAt(
      this.zones.map((z) => z.rect),
      x,
      y,
    );
    const zone = index >= 0 ? this.zones[index] : null;
    if (zone === this.currentZone && this.zoneText.text !== '') return;

    this.currentZone?.outline.setFillStyle(0xffe9a8, 0).setStrokeStyle(2, 0xffe9a8, 0.35);
    zone?.outline.setFillStyle(0xffe9a8, 0.14).setStrokeStyle(4, 0xffe9a8, 1);
    this.currentZone = zone;
    this.showZoneHint();
  }

  private showZoneHint() {
    this.zoneText.setText(
      this.currentZone
        ? `${this.currentZone.site.name}: costs ${this.currentZone.site.digCost} per dig. Press Space or click to dig.`
        : 'Walk to a dig site to dig.',
    );
  }

  private refreshHeader() {
    const name = this.player.name;
    const shown = name.length > 14 ? `${name.slice(0, 13)}...` : name;
    this.headerText.setText(`${shown}  |  Balance: ${this.player.balance}`);
  }

  private savePosition() {
    if (!this.miner) return;
    const { x, y } = this.miner.position;
    this.registry.set('minerPos', {
      x,
      y,
      facing: this.miner.facingDirection,
    } satisfies SavedPosition);
  }

  private closeDialog() {
    this.dialog?.destroy();
    this.dialog = null;
  }

  /* --------------------------------- digging -------------------------------- */

  private async onDig() {
    const miner = this.miner;
    if (!miner || this.busy || this.dialog) return;

    // He digs where he stands. Outside every dig area there is nothing to dig.
    const zone = this.currentZone;
    if (!zone) {
      this.zoneText.setText('Walk into a dig site first.');
      this.time.delayedCall(2000, () => this.showZoneHint());
      return;
    }

    this.busy = true;
    this.clearReveal();
    this.findText.setText('Digging...');
    miner.startMining();

    try {
      // The request and the minimum swing time run side by side: the server answers at once,
      // but the animation still gets to play. If the request fails, this throws immediately.
      const [result] = await Promise.all([dig(this.player.id, zone.site.id), wait(MIN_DIG_MS)]);
      if (!this.scene.isActive()) return;

      // Fetch the icon now, so it can spring up. A missing image file simply resolves.
      const { item } = result;
      if (item.image) {
        await loadTextures(this, [
          { key: itemTextureKey(item.image), url: itemImageUrl(item.image) },
        ]);
        if (!this.scene.isActive()) return;
      }

      miner.stopMining();

      // The server is the source of truth for the balance.
      this.player = { ...this.player, balance: result.balance };
      this.registry.set('player', this.player);
      this.refreshHeader();

      this.showFind(item);
    } catch (err) {
      if (!this.scene.isActive()) return;
      miner.stopMining();

      if (isGameEnded(err)) {
        // The game was ended elsewhere (for example in another tab): show the results.
        this.scene.start('BootScene');
        return;
      }
      if (err instanceof ApiError && err.status === 402) {
        this.findText.setText('Not enough money to dig.');
      } else if (err instanceof ApiError && err.status === 404 && /site/i.test(err.message)) {
        // The cached site list is out of date (for example after a re-seed): reload it.
        this.registry.remove('sites');
        this.scene.restart();
        return;
      } else if (err instanceof ApiError && err.status === 404) {
        // The server no longer knows this player (e.g. the database was reset): start over.
        clearStoredPlayerId();
        this.scene.start('BootScene');
        return;
      } else {
        this.findText.setText(`Could not reach the server.\n${String(err)}`);
      }
    } finally {
      this.busy = false;
    }
  }

  /** The item springs up above where the pickaxe landed; its details appear in the panel below. */
  private showFind(item: DugItem) {
    if (!this.miner) return;
    const { width } = this.scale;
    const strike = this.miner.strikePoint;
    const target = {
      x: Phaser.Math.Clamp(strike.x, 70, width - 70),
      y: Math.max(165, strike.y - 125),
    };

    this.reveal = revealItem(this, item, strike, target);
    this.findText.setText(
      `${item.name} (${item.kind}, ${item.size}) - worth ${item.baseValue}\n${item.description}`,
    );

    this.revealTimer = this.time.delayedCall(REVEAL_LINGER_MS, () => this.fadeReveal());
  }

  private fadeReveal() {
    const live = this.reveal.filter((o) => o.active);
    if (live.length === 0) {
      this.clearReveal();
      return;
    }
    this.tweens.add({
      targets: live,
      alpha: 0,
      duration: 400,
      onComplete: () => this.clearReveal(),
    });
  }

  private clearReveal() {
    this.revealTimer?.remove(false);
    this.revealTimer = null;
    for (const object of this.reveal) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.reveal = [];
  }
}