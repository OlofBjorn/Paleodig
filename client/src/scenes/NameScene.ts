import Phaser from 'phaser';
import { createPlayer, storePlayerId } from '../api';

const MAX_NAME_LENGTH = 40;

/** Asks for the player's name and creates their session. */
export class NameScene extends Phaser.Scene {
  private nameInput!: HTMLInputElement;
  private message!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('NameScene');
  }

  create() {
    const { width } = this.scale;
    this.busy = false;

    this.add
      .text(width / 2, 90, 'Paleodig', { fontSize: '44px', color: '#f2e8cf' })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 200, 'What is your name, collector?', {
        fontSize: '24px',
        color: '#f2e8cf',
      })
      .setOrigin(0.5);

    // A real <input> (via Phaser's DOM layer) gives us typing, paste and mobile keyboards for free.
    const dom = this.add.dom(
      width / 2,
      270,
      'input',
      'width: 320px; font-size: 24px; padding: 8px; text-align: center;',
    );
    this.nameInput = dom.node as HTMLInputElement;
    this.nameInput.maxLength = MAX_NAME_LENGTH;
    this.nameInput.placeholder = 'Your name';
    this.nameInput.autocomplete = 'off';
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.submit();
    });
    this.nameInput.focus();

    const button = this.add
      .rectangle(width / 2, 380, 200, 60, 0xc8963e)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(button.x, button.y, 'START', { fontSize: '28px', color: '#2b1d14' })
      .setOrigin(0.5);
    button.on('pointerdown', () => void this.submit());

    this.message = this.add
      .text(width / 2, 460, '', {
        fontSize: '20px',
        color: '#f2e8cf',
        align: 'center',
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);
  }

  private async submit() {
    if (this.busy) return;

    const name = this.nameInput.value.trim();
    if (!name) {
      this.message.setText('Please enter a name.');
      return;
    }

    this.busy = true;
    this.message.setText('Creating your session...');

    try {
      const player = await createPlayer(name);
      storePlayerId(player.id);
      this.registry.set('player', player);
      this.scene.start('WorldScene');
    } catch (err) {
      this.message.setText(`Could not create a session.\n${String(err)}`);
      this.busy = false;
    }
  }
}