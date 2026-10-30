import Phaser from 'phaser';
import { fetchSites, siteImageUrl, type DigSite, type Player } from '../api';
import { loadTextures, siteTextureKey } from '../ui/loadTextures';

const CARD_W = 240;
const CARD_H = 380;
const CARD_GAP = 20;
const CARD_Y = 330;
const THUMB_W = 220;
const THUMB_H = 165; // 4:3, matching the site background images

// Shown in place of a thumbnail until a site's image file exists.
const FALLBACK_COLORS = [0x8a5a3c, 0x4f6d7a, 0xc2a35a];

/** The first screen after the name screen: pick which dig site to visit. */
export class SiteSelectScene extends Phaser.Scene {
  private player!: Player;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('SiteSelectScene');
  }

  create() {
    const { width, height } = this.scale;
    this.player = this.registry.get('player') as Player;

    this.add.text(20, 16, `${this.player.name}  |  Balance: ${this.player.balance}`, {
      fontSize: '20px',
      color: '#f2e8cf',
    });
    this.add
      .text(width / 2, 100, 'Choose a dig site', { fontSize: '36px', color: '#f2e8cf' })
      .setOrigin(0.5);

    this.makeButton(width - 100, 30, 160, 40, 'Inventory', () =>
      this.scene.start('InventoryScene', { from: 'SiteSelectScene' }),
    );
    this.makeButton(width - 285, 30, 160, 40, 'Discoveries', () =>
      this.scene.start('DiscoveriesScene', { from: 'SiteSelectScene' }),
    );

    this.statusText = this.add
      .text(width / 2, height / 2, 'Loading dig sites...', {
        fontSize: '22px',
        color: '#f2e8cf',
        align: 'center',
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);

    void this.loadSites();
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
    const rect = this.add.rectangle(x, y, w, h, 0xc8963e).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '20px', color: '#2b1d14' }).setOrigin(0.5);
    rect.on('pointerdown', onClick);
  }

  private async loadSites() {
    try {
      const sites = await fetchSites();
      if (!this.scene.isActive()) return; // the player left while we were waiting

      // The dig scene reads the site list from here, so it never needs its own request.
      this.registry.set('sites', sites);

      await loadTextures(
        this,
        sites
          .filter((s) => s.image)
          .map((s) => ({ key: siteTextureKey(s.image), url: siteImageUrl(s.image) })),
      );
      if (!this.scene.isActive()) return;

      this.statusText.setText(sites.length === 0 ? 'No dig sites are available.' : '');
      this.renderCards(sites);
    } catch (err) {
      if (!this.scene.isActive()) return;
      this.statusText.setText(`Could not load the dig sites.\n${String(err)}\n\nClick to retry.`);
      this.input.once('pointerdown', () => this.scene.restart());
    }
  }

  /** Cards are centred as a row. The layout assumes about three sites; more would need scrolling. */
  private renderCards(sites: DigSite[]) {
    const { width } = this.scale;
    const total = sites.length * CARD_W + (sites.length - 1) * CARD_GAP;
    const startX = (width - total) / 2 + CARD_W / 2;

    sites.forEach((site, i) => {
      const x = startX + i * (CARD_W + CARD_GAP);
      const top = CARD_Y - CARD_H / 2;

      const card = this.add
        .rectangle(x, CARD_Y, CARD_W, CARD_H, 0x3b2f2a)
        .setStrokeStyle(3, 0x6b5a4c)
        .setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setStrokeStyle(3, 0xc8963e));
      card.on('pointerout', () => card.setStrokeStyle(3, 0x6b5a4c));
      card.on('pointerdown', () => {
        this.registry.set('siteId', site.id);
        this.scene.start('DigScene', { siteId: site.id });
      });

      // Thumbnail: the site's own image if it exists, otherwise a plain coloured block.
      const thumbY = top + 20 + THUMB_H / 2;
      const key = siteTextureKey(site.image);
      if (site.image && this.textures.exists(key)) {
        const img = this.add.image(x, thumbY, key);
        img.setScale(Math.min(THUMB_W / img.width, THUMB_H / img.height));
      } else {
        this.add.rectangle(x, thumbY, THUMB_W, THUMB_H, FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
      }

      // These texts aren't interactive, so clicks fall through to the card beneath.
      this.add
        .text(x, thumbY + THUMB_H / 2 + 26, site.name, {
          fontSize: '22px',
          color: '#f2e8cf',
          align: 'center',
          wordWrap: { width: CARD_W - 20 },
        })
        .setOrigin(0.5);
      this.add
        .text(x, thumbY + THUMB_H / 2 + 56, site.description, {
          fontSize: '15px',
          color: '#f2e8cf',
          align: 'center',
          wordWrap: { width: CARD_W - 28 },
        })
        .setOrigin(0.5, 0);
      this.add
        .text(x, CARD_Y + CARD_H / 2 - 26, `Costs ${site.digCost} per dig`, {
          fontSize: '17px',
          color: '#ffe9a8',
        })
        .setOrigin(0.5);
    });
  }
}