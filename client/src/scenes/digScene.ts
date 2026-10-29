import Phaser from 'phaser';
import { ApiError, clearStoredPlayerId, dig, fetchSites, type DigSite, type Player } from '../api';

const BACKGROUND_KEY = 'quarry-background';
const BACKGROUND_URL = `${import.meta.env.BASE_URL}images/quarry.png`;

// A dark outline keeps text readable on top of any background image.
const TEXT = { color: '#f2e8cf', stroke: '#1e1612', strokeThickness: 4 };

/** The dig screen: shows the player's balance, the dig cost, and what each dig turns up. */
export class DigScene extends Phaser.Scene {
  private player!: Player;
  private site: DigSite | null = null;
  private headerText!: Phaser.GameObjects.Text;
  private costText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('DigScene');
  }

  preload() {
    // A missing file is fine: no texture is created and create() falls back to a plain ground.
    if (!this.textures.exists(BACKGROUND_KEY)) {
      this.load.image(BACKGROUND_KEY, BACKGROUND_URL);
    }
  }

  create() {
    const { width, height } = this.scale;
    this.busy = false;
    this.site = null;
    this.player = this.registry.get('player') as Player;

    if (this.textures.exists(BACKGROUND_KEY)) {
      // "Cover" scaling: fill the whole screen without distorting the image.
      const background = this.add.image(width / 2, height / 2, BACKGROUND_KEY);
      background.setScale(Math.max(width / background.width, height / background.height));
    } else {
      this.add.rectangle(width / 2, height * 0.75, width, height * 0.5, 0x6b4f3a);
    }

    this.headerText = this.add.text(20, 16, '', { fontSize: '20px', ...TEXT });
    this.refreshHeader();

    const inventoryButton = this.add
      .rectangle(width - 100, 30, 160, 40, 0xc8963e)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(inventoryButton.x, inventoryButton.y, 'Inventory', {
        fontSize: '20px',
        color: '#2b1d14',
      })
      .setOrigin(0.5);
    inventoryButton.on('pointerdown', () => this.scene.start('InventoryScene'));

    const discoveriesButton = this.add
      .rectangle(width - 100, 78, 160, 40, 0xc8963e)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(discoveriesButton.x, discoveriesButton.y, 'Discoveries', {
        fontSize: '20px',
        color: '#2b1d14',
      })
      .setOrigin(0.5);
    discoveriesButton.on('pointerdown', () => this.scene.start('DiscoveriesScene'));

    this.add.text(width / 2, 90, 'Paleodig', { fontSize: '44px', ...TEXT }).setOrigin(0.5);

    this.resultText = this.add
      .text(width / 2, 230, 'Press DIG to search the quarry.', {
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
    this.costText = this.add
      .text(button.x, button.y + 50, '', { fontSize: '18px', ...TEXT })
      .setOrigin(0.5);

    button.on('pointerdown', () => void this.onDig());
    void this.loadSite();
  }

  private refreshHeader() {
    this.headerText.setText(`${this.player.name}  |  Balance: ${this.player.balance}`);
  }

  private async loadSite() {
    try {
      const sites = await fetchSites();
      if (!this.scene.isActive()) return; // the player left while we were waiting
      this.site = sites[0] ?? null;
      if (this.site) this.costText.setText(`Costs ${this.site.digCost} per dig`);
    } catch {
      // The cost label just stays empty; the server enforces the real cost either way.
    }
  }

  private async onDig() {
    if (this.busy) return; // ignore clicks while a request is in flight
    this.busy = true;
    this.resultText.setText('Digging...');

    try {
      const result = await dig(this.player.id);

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