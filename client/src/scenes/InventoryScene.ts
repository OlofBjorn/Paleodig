import Phaser from 'phaser';
import {
  ApiError,
  clearStoredPlayerId,
  fetchInventory,
  itemImageUrl,
  nameSpecimen,
  sellSpecimen,
  unnameSpecimen,
  type NameResult,
  type Player,
  type Specimen,
} from '../api';
import { NamingDialog } from '../ui/NamingDialog';

const COLS = 7;
const ROWS = 3;
const PER_PAGE = COLS * ROWS;
const TILE = 100;
const GAP = 10;
const GRID_X = 15;
const GRID_Y = 70;

// Shown behind each tile, and as the whole tile when an item has no image yet.
const KIND_COLOR = { fossil: 0xd9c9a3, rock: 0x8a8a8a, gem: 0x6fb7d9 } as const;

function describeNaming(r: NameResult): string {
  const parts = [`Named ${r.genus} ${r.species}.`];
  if (r.genusCreated) parts.push(`New genus: this specimen is the holotype of ${r.genus}.`);
  else if (r.taxonCreated) parts.push('New species in an existing genus.');
  else parts.push('Grouped with the other specimens of this species.');
  if (r.invalidatedGenus) parts.push(`Warning: ${r.invalidatedGenus} is no longer valid.`);
  return parts.join(' ');
}

/** Lists what the player owns, with a detail panel and Name / Sell buttons. */
export class InventoryScene extends Phaser.Scene {
  private player!: Player;
  private specimens: Specimen[] = [];
  private page = 0;
  private selected = 0; // index into this.specimens
  private busy = false;
  private confirmSellId: number | null = null; // specimen waiting for a second click
  private dialog: NamingDialog | null = null;
  private tileObjects: Phaser.GameObjects.GameObject[] = [];
  private tileBackgrounds: { index: number; rect: Phaser.GameObjects.Rectangle }[] = [];
  private headerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private pageText!: Phaser.GameObjects.Text;
  private sellButton!: Phaser.GameObjects.Rectangle;
  private sellLabel!: Phaser.GameObjects.Text;
  private nameButton!: Phaser.GameObjects.Rectangle;
  private nameLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('InventoryScene');
  }

  create() {
    const { width, height } = this.scale;
    this.specimens = [];
    this.page = 0;
    this.selected = 0;
    this.busy = false;
    this.confirmSellId = null;
    this.dialog = null;
    this.tileObjects = [];
    this.tileBackgrounds = [];
    this.player = this.registry.get('player') as Player;
    this.events.once('shutdown', () => this.closeDialog());

    this.headerText = this.add.text(20, 16, '', { fontSize: '20px', color: '#f2e8cf' });
    this.makeButton(width - 100, 30, 160, 40, 'Back to dig', () => this.scene.start('DigScene'));

    // Leaves room on the right for the Name and Sell buttons.
    this.detailText = this.add.text(20, 428, '', {
      fontSize: '18px',
      color: '#f2e8cf',
      wordWrap: { width: 540 },
    });

    this.nameButton = this.add
      .rectangle(width - 120, 418, 200, 40, 0x4a7a5a)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.nameLabel = this.add
      .text(this.nameButton.x, this.nameButton.y, 'Name', { fontSize: '18px', color: '#f2e8cf' })
      .setOrigin(0.5)
      .setVisible(false);
    this.nameButton.on('pointerdown', () => this.openNaming());

    this.sellButton = this.add
      .rectangle(width - 120, 470, 200, 44, 0xb5523b)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.sellLabel = this.add
      .text(this.sellButton.x, this.sellButton.y, '', { fontSize: '18px', color: '#f2e8cf' })
      .setOrigin(0.5)
      .setVisible(false);
    this.sellButton.on('pointerdown', () => void this.onSellClick());

    this.noticeText = this.add
      .text(width / 2, 538, '', {
        fontSize: '18px',
        color: '#f2e8cf',
        align: 'center',
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5);

    this.makeButton(90, 570, 130, 36, 'Previous', () => this.changePage(-1));
    this.pageText = this.add
      .text(width / 2, 575, '', { fontSize: '18px', color: '#f2e8cf' })
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
      // Keep the selection valid if the list changed underneath us.
      this.selected = Math.min(this.selected, Math.max(0, this.specimens.length - 1));
      this.page = Math.floor(this.selected / PER_PAGE);
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

    this.refreshHeader();
    this.renderPage();
  }

  private refreshHeader() {
    this.headerText.setText(
      `${this.player.name}  |  Balance: ${this.player.balance}  |  Finds: ${this.specimens.length}`,
    );
    this.statusText.setText(
      this.specimens.length === 0 ? 'Nothing yet. Go dig something up!' : '',
    );
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

      // A green dot marks specimens that have been given a name.
      if (specimen.name) {
        this.tileObjects.push(
          this.add.circle(x + TILE / 2 - 13, y - TILE / 2 + 13, 7, 0x4caf50).setStrokeStyle(2, 0x1e1612),
        );
      }
    });

    this.select(this.selected);
  }

  private select(index: number) {
    this.selected = index;
    this.confirmSellId = null; // changing selection cancels a pending sale
    // Restyle in place rather than re-rendering, which would destroy the tile being clicked.
    for (const { index: i, rect } of this.tileBackgrounds) {
      const isSelected = i === index;
      rect.setStrokeStyle(isSelected ? 4 : 1, isSelected ? 0xffffff : 0x2b1d14);
    }

    const specimen = this.specimens[index];
    if (!specimen) {
      this.detailText.setText('');
    } else {
      const { item, name } = specimen;
      const named = name
        ? `\nNamed: ${name.genus} ${name.species}${name.isHolotype ? ` (holotype of ${name.genus})` : ''}`
        : '';
      this.detailText.setText(
        `${item.name}  (${item.kind}, ${item.size})\n${item.description}\nWorth ${item.baseValue}${named}`,
      );
    }
    this.updateSellButton();
    this.updateNameButton();
  }

  private updateNameButton() {
    const specimen = this.specimens[this.selected];
    const visible = Boolean(specimen && specimen.item.kind === 'fossil');
    this.nameButton.setVisible(visible);
    this.nameLabel.setVisible(visible);
    if (specimen && visible) {
      this.nameLabel.setText(specimen.name ? 'Rename' : 'Name');
    }
  }

  private updateSellButton() {
    const specimen = this.specimens[this.selected];
    const visible = Boolean(specimen);
    this.sellButton.setVisible(visible);
    this.sellLabel.setVisible(visible);
    if (!specimen) return;

    this.sellLabel.setText(
      this.confirmSellId === specimen.id ? 'Click to confirm' : `Sell for ${specimen.item.baseValue}`,
    );
  }

  /* -------------------------------- naming -------------------------------- */

  private openNaming() {
    const specimen = this.specimens[this.selected];
    if (!specimen || specimen.item.kind !== 'fossil' || this.busy || this.dialog) return;

    this.noticeText.setText('');
    this.dialog = new NamingDialog(this, specimen, {
      onSubmit: (genus, species) => this.submitName(specimen, genus, species),
      onRemove: specimen.name ? () => this.removeName(specimen) : undefined,
      onClose: () => this.closeDialog(),
    });
  }

  private closeDialog() {
    this.dialog?.destroy();
    this.dialog = null;
  }

  private async submitName(specimen: Specimen, genus: string, species: string): Promise<string | null> {
    try {
      const result = await nameSpecimen(this.player.id, specimen.id, genus, species);
      if (!this.scene.isActive()) return null;
      this.closeDialog();
      await this.loadInventory(); // names and holotype flags can change on other specimens too
      if (this.scene.isActive()) this.noticeText.setText(describeNaming(result));
      return null;
    } catch (err) {
      return this.dialogError(err);
    }
  }

  private async removeName(specimen: Specimen): Promise<string | null> {
    try {
      const result = await unnameSpecimen(this.player.id, specimen.id);
      if (!this.scene.isActive()) return null;
      this.closeDialog();
      await this.loadInventory();
      if (this.scene.isActive()) {
        this.noticeText.setText(
          result.invalidatedGenus
            ? `Name removed. Warning: ${result.invalidatedGenus} is no longer valid.`
            : 'Name removed.',
        );
      }
      return null;
    } catch (err) {
      return this.dialogError(err);
    }
  }

  /** Turns a failed request into the text shown inside the dialog (null = nothing to show). */
  private dialogError(err: unknown): string | null {
    if (!this.scene.isActive()) return null;
    if (err instanceof ApiError) {
      if (err.status === 404) {
        // The specimen or player vanished: close and refresh from the server.
        this.closeDialog();
        void this.loadInventory();
        return null;
      }
      return err.message;
    }
    return `Could not reach the server.\n${String(err)}`;
  }

  /* --------------------------------- selling ------------------------------- */

  private async onSellClick() {
    if (this.busy) return;
    const specimen = this.specimens[this.selected];
    if (!specimen) return;

    // Selling can't be undone, so the first click only arms the button.
    if (this.confirmSellId !== specimen.id) {
      this.confirmSellId = specimen.id;
      this.updateSellButton();
      this.noticeText.setText(
        specimen.name?.isHolotype
          ? `Warning: this is the holotype of ${specimen.name.genus}. Selling it makes that genus invalid for good.`
          : '',
      );
      this.time.delayedCall(3000, () => {
        if (this.confirmSellId === specimen.id) {
          this.confirmSellId = null;
          this.updateSellButton();
        }
      });
      return;
    }

    this.busy = true;
    this.confirmSellId = null;
    this.updateSellButton();
    this.noticeText.setText('Selling...');

    try {
      const result = await sellSpecimen(this.player.id, specimen.id);
      if (!this.scene.isActive()) return;

      // The server is the source of truth for the balance.
      this.player = { ...this.player, balance: result.balance };
      this.registry.set('player', this.player);

      this.specimens = this.specimens.filter((s) => s.id !== specimen.id);
      this.selected = Math.min(this.selected, Math.max(0, this.specimens.length - 1));
      this.page = Math.floor(this.selected / PER_PAGE);

      this.refreshHeader();
      this.renderPage();
      const invalidated = specimen.name?.isHolotype
        ? ` The genus ${specimen.name.genus} is now invalid.`
        : '';
      this.noticeText.setText(`Sold ${specimen.item.name} for ${result.earned}.${invalidated}`);
    } catch (err) {
      if (!this.scene.isActive()) return;
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        // Our list was out of date (for example it was sold in another tab): refresh it.
        this.noticeText.setText(err.message);
        await this.loadInventory();
      } else {
        this.noticeText.setText(`Could not sell.\n${String(err)}`);
      }
    } finally {
      this.busy = false;
    }
  }
}