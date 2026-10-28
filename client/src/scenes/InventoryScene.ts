import Phaser from 'phaser';
import {
  ApiError,
  clearStoredPlayerId,
  fetchInventory,
  itemImageUrl,
  type Player,
  type Specimen,
} from '../api';

const COLS = 7;
const ROWS = 3;
const PER_PAGE = COLS * ROWS;
const TILE = 100;
const GAP = 10;
const GRID_X = 15;
const GRID_Y = 70;

// Shown behind each tile, and as the whole tile when an item has no image yet.
const KIND_COLOR = { fossil: 0xd9c9a3, rock: 0x8a8a8a, gem: 0x6fb7d9 } as const;

/** Lists what the player owns, a page at a time, with a detail panel for the selected item. */
export class InventoryScene extends Phaser.Scene {
  private player!: Player;
  private specimens: Specimen[] = [];
  private page = 0;
  private selected = 0; // index into this.specimens
  private tileObjects: Phaser.GameObjects.GameObject[] = [];
  private tileBackgrounds: { index: number; rect: Phaser.GameObjects.Rectangle }[] = [];
  private headerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private pageText!: Phaser.GameObjects.Text;

  constructor() {
    super('InventoryScene');
  }

  create() {
    const { width, height } = this.scale;
    this.specimens = [];
    this.page = 0;
    this.selected = 0;
    this.tileObjects = [];
    this.tileBackgrounds = [];
    this.player = this.registry.get('player') as Player;

    this.headerText = this.add.text(20, 16, '', { fontSize: '20px', color: '#f2e8cf' });
    this.makeButton(width - 100, 30, 160, 40, 'Back to dig', () => this.scene.start('DigScene'));

    this.detailText = this.add.text(20, 428, '', {
      fontSize: '18px',
      color: '#f2e8cf',
      wordWrap: { width: width - 40 },
    });

    this.makeButton(90, 570, 130, 36, 'Previous', () => this.changePage(-1));
    this.pageText = this.add
      .text(width / 2, 570, '', { fontSize: '18px', color: '#f2e8cf' })
      .setOrigin(0.5);
    this.makeButton(width - 90, 570, 130, 36, 'Next', () => this.changePage(1));

    this.statusText = this.add
      .text(width / 2, height / 2 - 40, 'Loading your finds...', {
        fontSize: '24px',
        color: '#f2e8cf',
        align: 'center',
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);

    void this.loadInventory();
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
    const rect = this.add.rectangle(x, y, w, h, 0xc8963e).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '20px', color: '#2b1d14' }).setOrigin(0.5);
    rect.on('pointerdown', onClick);
  }

  private textureKey(image: string) {
    return `item-image:${image}`;
  }

  private async loadInventory() {
    try {
      const data = await fetchInventory(this.player.id);
      if (!this.scene.isActive()) return; // the player left while we were waiting
      this.player = data.player;
      this.registry.set('player', this.player);
      this.specimens = data.specimens;
    } catch (err) {
      if (!this.scene.isActive()) return;
      if (err instanceof ApiError && err.status === 404) {
        // The server no longer knows this player: start over.
        clearStoredPlayerId();
        this.scene.start('BootScene');
        return;
      }
      this.statusText.setText(`Could not load your finds.\n${String(err)}`);
      return;
    }

    await this.loadImages();
    if (!this.scene.isActive()) return;

    this.headerText.setText(
      `${this.player.name}  |  Balance: ${this.player.balance}  |  Finds: ${this.specimens.length}`,
    );
    this.statusText.setText(
      this.specimens.length === 0 ? 'Nothing yet. Go dig something up!' : '',
    );
    this.renderPage();
  }

  /**
   * Loads each distinct item image once. A missing file is not an error here: Phaser simply
   * doesn't create that texture, and the tile falls back to a coloured box with the item's name.
   */
  private loadImages(): Promise<void> {
    const wanted = new Set(this.specimens.map((s) => s.item.image).filter(Boolean));
    const missing = [...wanted].filter((image) => !this.textures.exists(this.textureKey(image)));
    if (missing.length === 0) return Promise.resolve();

    return new Promise((resolve) => {
      this.load.once('complete', () => resolve()); // fires even if some files 404
      for (const image of missing) {
        this.load.image(this.textureKey(image), itemImageUrl(image));
      }
      this.load.start();
    });
  }

  private pageCount() {
    return Math.max(1, Math.ceil(this.specimens.length / PER_PAGE));
  }

  private changePage(delta: number) {
    const next = Phaser.Math.Clamp(this.page + delta, 0, this.pageCount() - 1);
    if (next === this.page) return;
    this.page = next;
    this.selected = this.page * PER_PAGE;
    this.renderPage();
  }

  private renderPage() {
    this.tileObjects.forEach((o) => o.destroy());
    this.tileObjects = [];
    this.tileBackgrounds = [];

    this.pageText.setText(`Page ${this.page + 1} / ${this.pageCount()}`);

    const start = this.page * PER_PAGE;
    this.specimens.slice(start, start + PER_PAGE).forEach((specimen, i) => {
      const index = start + i;
      const x = GRID_X + (i % COLS) * (TILE + GAP) + TILE / 2;
      const y = GRID_Y + Math.floor(i / COLS) * (TILE + GAP) + TILE / 2;

      const rect = this.add
        .rectangle(x, y, TILE, TILE, KIND_COLOR[specimen.item.kind], 0.9)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.select(index));
      this.tileObjects.push(rect);
      this.tileBackgrounds.push({ index, rect });

      const key = this.textureKey(specimen.item.image);
      if (specimen.item.image && this.textures.exists(key)) {
        const img = this.add.image(x, y, key);
        img.setScale(Math.min((TILE - 16) / img.width, (TILE - 16) / img.height));
        this.tileObjects.push(img);
      } else {
        this.tileObjects.push(
          this.add
            .text(x, y, specimen.item.name, {
              fontSize: '14px',
              color: '#2b1d14',
              align: 'center',
              wordWrap: { width: TILE - 12 },
            })
            .setOrigin(0.5),
        );
      }
    });

    this.select(this.selected);
  }

  private select(index: number) {
    this.selected = index;
    // Restyle in place rather than re-rendering, which would destroy the tile being clicked.
    for (const { index: i, rect } of this.tileBackgrounds) {
      const isSelected = i === index;
      rect.setStrokeStyle(isSelected ? 4 : 1, isSelected ? 0xffffff : 0x2b1d14);
    }

    const specimen = this.specimens[index];
    if (!specimen) {
      this.detailText.setText('');
      return;
    }
    const { item } = specimen;
    this.detailText.setText(
      `${item.name}  (${item.kind}, ${item.size})\n${item.description}\nWorth ${item.baseValue}`,
    );
  }
}