import Phaser from 'phaser';
import { dig } from '../api';

/** Sprint 1 hello-world: one digsite, one button, one result. */
export class DigScene extends Phaser.Scene {
  private resultText!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('DigScene');
  }

  create() {
    const { width, height } = this.scale;

    // Placeholder ground
    this.add.rectangle(width / 2, height * 0.75, width, height * 0.5, 0x6b4f3a);

    this.add
      .text(width / 2, 50, 'Paleodig', { fontSize: '44px', color: '#f2e8cf' })
      .setOrigin(0.5);

    this.resultText = this.add
      .text(width / 2, 210, 'Press DIG to search the quarry.', {
        fontSize: '22px',
        color: '#f2e8cf',
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

    button.on('pointerdown', () => void this.onDig());
  }

  private async onDig() {
    if (this.busy) return; // ignore clicks while a request is in flight
    this.busy = true;
    this.resultText.setText('Digging...');

    try {
      const item = await dig();
      this.resultText.setText(
        `${item.name}\n(${item.kind}, ${item.size})\n\n${item.description}\n\nWorth ${item.baseValue}`,
      );
    } catch (err) {
      this.resultText.setText(`Could not reach the server.\n${String(err)}`);
    } finally {
      this.busy = false;
    }
  }
}