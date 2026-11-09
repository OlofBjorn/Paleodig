import Phaser from 'phaser';
import {
  ApiError,
  clearStoredPlayerId,
  fetchDiscoveries,
  type DiscoveredGenus,
  type Player,
} from '../api';

const LIST_STYLE = [
  'width: 740px',
  'height: 440px',
  'overflow-y: auto',
  'box-sizing: border-box',
  'padding: 12px 18px',
  'background: rgba(0, 0, 0, 0.35)',
  'color: #f2e8cf',
  'font-family: "Courier New", monospace',
  'font-size: 17px',
  'line-height: 1.45',
  'border: 2px solid #c8963e',
].join('; ');

/** Lists the player's genera and species, with whether each genus is currently valid. */
export class DiscoveriesScene extends Phaser.Scene {
  private player!: Player;
  private summaryText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  private returnTo = 'WorldScene'; // the scene that opened this one

  constructor() {
    super('DiscoveriesScene');
  }

  init(data: { from?: string }) {
    this.returnTo = data.from ?? 'WorldScene';
  }

  create() {
    const { width, height } = this.scale;
    this.player = this.registry.get('player') as Player;

    this.add.text(20, 16, 'Your discoveries', { fontSize: '24px', color: '#f2e8cf' });
    this.summaryText = this.add.text(20, 50, '', { fontSize: '16px', color: '#f2e8cf' });

    const back = this.add
      .rectangle(width - 100, 30, 160, 40, 0xc8963e)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(back.x, back.y, 'Back', { fontSize: '20px', color: '#2b1d14' })
      .setOrigin(0.5);
    back.on('pointerdown', () => this.scene.start(this.returnTo));

    this.statusText = this.add
      .text(width / 2, height / 2, 'Loading your discoveries...', {
        fontSize: '22px',
        color: '#f2e8cf',
        align: 'center',
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);

    void this.loadDiscoveries();
  }

  private async loadDiscoveries() {
    try {
      const data = await fetchDiscoveries(this.player.id);
      if (!this.scene.isActive()) return; // the player left while we were waiting

      if (data.genera.length === 0) {
        this.statusText.setText('Nothing named yet.\nName a fossil in your inventory to start.');
        return;
      }

      this.statusText.setText('');
      this.summaryText.setText(this.summarise(data.genera));
      this.buildList(data.genera);
    } catch (err) {
      if (!this.scene.isActive()) return;
      if (err instanceof ApiError && err.status === 404) {
        // The server no longer knows this player: start over.
        clearStoredPlayerId();
        this.scene.start('BootScene');
        return;
      }
      this.statusText.setText(`Could not load your discoveries.\n${String(err)}`);
    }
  }

  private summarise(genera: DiscoveredGenus[]): string {
    const valid = genera.filter((g) => g.valid).length;
    const species = genera.reduce((n, g) => n + g.species.length, 0);
    const specimens = genera.reduce(
      (n, g) => n + g.species.reduce((m, s) => m + s.specimens.length, 0),
      0,
    );
    return `${valid} valid, ${genera.length - valid} invalid genera  |  ${species} species  |  ${specimens} named specimens`;
  }

  /**
   * The list is a real scrollable <div> (Phaser's DOM layer), so mouse wheel, trackpad and
   * touch scrolling all just work. Everything is added with textContent, never innerHTML.
   */
  private buildList(genera: DiscoveredGenus[]) {
    const { width, height } = this.scale;
    const dom = this.add.dom(width / 2, height / 2 + 30, 'div', LIST_STYLE);
    const root = dom.node as HTMLDivElement;
    for (const genus of genera) {
      root.appendChild(this.genusBlock(genus));
    }
  }

  private genusBlock(genus: DiscoveredGenus): HTMLElement {
    const block = this.el('div', '', 'margin-bottom: 20px;');

    const title = this.el('div', genus.name, 'font-size: 22px; font-weight: bold;');
    title.appendChild(
      this.el(
        'span',
        genus.valid ? 'valid' : 'invalid',
        `font-size: 14px; font-weight: normal; padding: 2px 8px; margin-left: 10px; border-radius: 4px; background: ${genus.valid ? '#4a7a5a' : '#b5523b'};`,
      ),
    );
    block.appendChild(title);

    const holotype = `Holotype: ${genus.holotype.itemName}${genus.holotype.sold ? ' (sold)' : ''}`;
    block.appendChild(this.el('div', holotype, 'opacity: 0.85;'));

    if (!genus.valid) {
      const note =
        genus.invalidReason === 'sold'
          ? `The name ${genus.name} is permanently taken: its holotype was sold.`
          : `The name ${genus.name} is reserved. Name its holotype ${genus.name} again to reinstate it.`;
      block.appendChild(this.el('div', note, 'color: #ff9b8a;'));
    }

    if (genus.species.length === 0) {
      block.appendChild(this.el('div', 'No species currently.', 'margin-top: 6px; opacity: 0.7;'));
    }
    for (const species of genus.species) {
      block.appendChild(
        this.el(
          'div',
          `${genus.name} ${species.name} (${species.specimens.length})`,
          'margin: 8px 0 0 16px;',
        ),
      );
      // Each specimen with where it was found: location is the player's main clue.
      for (const specimen of species.specimens) {
        const where = specimen.siteName ? `  -  ${specimen.siteName}` : '';
        block.appendChild(
          this.el('div', `${specimen.itemName}${where}`, 'margin-left: 36px; opacity: 0.85;'),
        );
      }
    }

    return block;
  }

  private el(tag: string, text: string, css: string): HTMLElement {
    const element = document.createElement(tag);
    element.textContent = text;
    element.style.cssText = css;
    return element;
  }
}