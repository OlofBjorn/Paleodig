import Phaser from 'phaser';
import { ApiError, clearStoredPlayerId, dig, type DigSite, type Player } from '../api';
import { siteTextureKey } from '../ui/loadTextures';

// A dark outline keeps text readable on top of any background image.
const TEXT = { color: '#f2e8cf', stroke: '#1e1612', strokeThickness: 4 };

/** The dig screen for one site: shows the balance, the cost, and what each dig turns up. */
export class DigScene extends Phaser.Scene {
  private player!: Player;
  private site!: DigSite;
  private siteId: number | null = null;
  private headerText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('DigScene');
  }

  init(data: { siteId?: number }) {
    // Coming back from the inventory passes no data, so fall back to the last chosen site.
    this.siteId = data.siteId ?? (this.registry.get('siteId') as number | undefined) ?? null;
  }

  create() {
    const { width, height } = this.scale;
    this.busy = false;
    this.player = this.registry.get('player') as Player;

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

    this.headerText = this.add.text(20, 16, '', { fontSize: '20px', ...TEXT });
    this.refreshHeader();

    this.makeButton(100, 70, 160, 36, 'Change site', () => this.scene.start('SiteSelectScene'));
    this.makeButton(width - 100, 30, 160, 40, 'Inventory', () =>
      this.scene.start('InventoryScene', { from: 'DigScene' }),
    );
    this.makeButton(width - 100, 78, 160, 40, 'Discoveries', () =>
      this.scene.start('DiscoveriesScene', { from: 'DigScene' }),
    );

    this.add.text(width / 2, 100, site.name, { fontSize: '38px', ...TEXT }).setOrigin(0.5);

    this.resultText = this.add
      .text(width / 2, 240, 'Press DIG to search the site.', {
        fontSize: '22px',
        ...TEXT,
        align: 'center',
        wordWrap: { width: width - 120 },
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

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
    const rect = this.add.rectangle(x, y, w, h, 0xc8963e).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '20px', color: '#2b1d14' }).setOrigin(0.5);
    rect.on('pointerdown', onClick);
  }

  private refreshHeader() {
    this.headerText.setText(`${this.player.name}  |  Balance: ${this.player.balance}`);
  }

  private async onDig() {
    if (this.busy) return; // ignore clicks while a request is in flight
    this.busy = true;
    this.resultText.setText('Digging...');

    try {
      const result = await dig(this.player.id, this.site.id);

      // The server is the source of truth for the balance.
      this.player = { ...this.player, balance: result.balance };
      this.registry.set('player', this.player);
      this.refreshHeader();

      const { item } = result;
      this.resultText.setText(
        `${item.name}\n(${item.kind}, ${item.size})\n\n${item.description}\n\nWorth ${item.baseValue}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        this.resultText.setText('Not enough money to dig.');
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
        this.resultText.setText(`Could not reach the server.\n${String(err)}`);
      }
    } finally {
      this.busy = false;
    }
  }
}