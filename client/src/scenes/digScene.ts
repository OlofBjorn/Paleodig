import Phaser from 'phaser';
import {
  ApiError,
  clearStoredPlayerId,
  dig,
  isGameEnded,
  itemImageUrl,
  type DigSite,
  type DugItem,
  type Player,
} from '../api';
import type { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { openEndGameDialog } from '../ui/endgameDialog.js';
import { revealItem } from '../ui/ItemReveal.js';
import { itemTextureKey, loadTextures, siteTextureKey } from '../ui/loadTextures.js';
import { Miner, preloadMinerTextures } from '../ui/Miner.js';

// A dark outline keeps text readable on top of any background image.
const TEXT = { color: '#f2e8cf', stroke: '#1e1612', strokeThickness: 4 };

// Layout. If the miner floats in the sky of your background, these are the numbers to change.
const MINER_FEET = { x: 170, y: 440 };
const REVEAL_TARGET = { x: 345, y: 335 };
const RESULT_TEXT = { x: 575, y: 320, width: 340 };

/** The swing runs at least this long, so even an instant answer still looks like digging. */
const MIN_DIG_MS = 900;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The dig screen for one site: a miner who digs, and the finds that spring out of the ground. */
export class DigScene extends Phaser.Scene {
  private player!: Player;
  private site!: DigSite;
  private siteId: number | null = null;
  private miner!: Miner;
  private headerText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private reveal: Phaser.GameObjects.GameObject[] = [];
  private busy = false;
  private dialog: ConfirmDialog | null = null;

  constructor() {
    super('DigScene');
  }

  init(data: { siteId?: number }) {
    // Coming back from the inventory passes no data, so fall back to the last chosen site.
    this.siteId = data.siteId ?? (this.registry.get('siteId') as number | undefined) ?? null;
  }

  preload() {
    preloadMinerTextures(this);
  }

  create() {
    const { width, height } = this.scale;
    this.busy = false;
    this.reveal = [];
    this.player = this.registry.get('player') as Player;
    this.dialog = null;
    this.events.once('shutdown', () => this.closeDialog());

    // The site list is loaded by the select screen. If it isn't there, go back and get it.
    const sites = (this.registry.get('sites') as DigSite[] | undefined) ?? [];
    const site = sites.find((s) => s.id === this.siteId);
    if (!site) {
      this.scene.start('SiteSelectScene');
      return;
    }
    this.site = site;

    const key = siteTextureKey(site.image);
    if (site.image && this.textures.exists(key)) {
      // "Cover" scaling: fill the whole screen without distorting the image.
      const background = this.add.image(width / 2, height / 2, key);
      background.setScale(Math.max(width / background.width, height / background.height));
    } else {
      this.add.rectangle(width / 2, height * 0.75, width, height * 0.5, 0x6b4f3a);
    }

    this.miner = new Miner(this, MINER_FEET.x, MINER_FEET.y);

    this.headerText = this.add.text(20, 16, '', { fontSize: '20px', ...TEXT });
    this.refreshHeader();

    this.makeButton(100, 70, 160, 36, 'Change site', () => this.scene.start('SiteSelectScene'));
    this.makeButton(width - 100, 30, 160, 40, 'Inventory', () =>
      this.scene.start('InventoryScene', { from: 'DigScene' }),
    );
    this.makeButton(width - 100, 78, 160, 40, 'Discoveries', () =>
      this.scene.start('DiscoveriesScene', { from: 'DigScene' }),
    );
    this.makeButton(100, 568, 160, 36, 'End game', () => {
      if (!this.dialog) this.dialog = openEndGameDialog(this, () => this.closeDialog());
    });

    this.add.text(width / 2, 100, site.name, { fontSize: '38px', ...TEXT }).setOrigin(0.5);

    this.resultText = this.add
      .text(RESULT_TEXT.x, RESULT_TEXT.y, 'Press DIG to search the site.', {
        fontSize: '20px',
        ...TEXT,
        align: 'center',
        wordWrap: { width: RESULT_TEXT.width },
      })
      .setOrigin(0.5);

    const button = this.add
      .rectangle(width / 2, height - 110, 200, 70, 0xc8963e)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(button.x, button.y, 'DIG', { fontSize: '32px', color: '#2b1d14' })
      .setOrigin(0.5);
    this.add
      .text(button.x, button.y + 50, `Costs ${site.digCost} per dig`, { fontSize: '18px', ...TEXT })
      .setOrigin(0.5);
    button.on('pointerdown', () => void this.onDig());
  }

  private closeDialog() {
    this.dialog?.destroy();
    this.dialog = null;
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
    const rect = this.add.rectangle(x, y, w, h, 0xc8963e).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '20px', color: '#2b1d14' }).setOrigin(0.5);
    rect.on('pointerdown', onClick);
  }

  private refreshHeader() {
    this.headerText.setText(`${this.player.name}  |  Balance: ${this.player.balance}`);
  }

  private setMessage(text: string) {
    this.tweens.killTweensOf(this.resultText);
    this.resultText.setAlpha(1).setText(text);
  }

  private clearReveal() {
    for (const object of this.reveal) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.reveal = [];
  }

  private async onDig() {
    if (this.busy) return; // ignore clicks while a dig is in progress
    this.busy = true;
    this.clearReveal();
    this.setMessage('Digging...');
    this.miner.startMining();

    try {
      // The request and the minimum swing time run side by side: the server answers at once,
      // but the animation still gets to play. If the request fails, this throws immediately.
      const [result] = await Promise.all([dig(this.player.id, this.site.id), wait(MIN_DIG_MS)]);
      if (!this.scene.isActive()) return;

      // Fetch the icon now, so it can spring up. A missing image file simply resolves.
      const { item } = result;
      if (item.image) {
        await loadTextures(this, [
          { key: itemTextureKey(item.image), url: itemImageUrl(item.image) },
        ]);
        if (!this.scene.isActive()) return;
      }

      this.miner.stopMining();

      // The server is the source of truth for the balance.
      this.player = { ...this.player, balance: result.balance };
      this.registry.set('player', this.player);
      this.refreshHeader();

      this.showFind(item);
    } catch (err) {
      if (!this.scene.isActive()) return;
      this.miner.stopMining();

      if (isGameEnded(err)) {
        // The game was ended elsewhere (for example in another tab): show the results.
        this.scene.start('BootScene');
        return;
      }
      if (err instanceof ApiError && err.status === 402) {
        this.setMessage('Not enough money to dig.');
      } else if (err instanceof ApiError && err.status === 404 && /site/i.test(err.message)) {
        // The site list is out of date (for example after a re-seed): pick again.
        this.scene.start('SiteSelectScene');
        return;
      } else if (err instanceof ApiError && err.status === 404) {
        // The server no longer knows this player (e.g. the database was reset): start over.
        clearStoredPlayerId();
        this.scene.start('BootScene');
        return;
      } else {
        this.setMessage(`Could not reach the server.\n${String(err)}`);
      }
    } finally {
      this.busy = false;
    }
  }

  /** The item springs up from where the pickaxe landed, and its details fade in beside it. */
  private showFind(item: DugItem) {
    this.reveal = revealItem(this, item, this.miner.strikePoint, REVEAL_TARGET);

    this.resultText
      .setAlpha(0)
      .setText(
        `${item.name}\n(${item.kind}, ${item.size})\n\n${item.description}\n\nWorth ${item.baseValue}`,
      );
    this.tweens.add({ targets: this.resultText, alpha: 1, duration: 300, delay: 250 });
  }
}