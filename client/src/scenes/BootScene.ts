import Phaser from 'phaser';
import { clearStoredPlayerId, fetchPlayer, getStoredPlayerId } from '../api';

/** First scene: resume a saved session if the server still knows it, otherwise ask for a name. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    const { width, height } = this.scale;
    const status = this.add
      .text(width / 2, height / 2, 'Loading...', {
        fontSize: '24px',
        color: '#f2e8cf',
        align: 'center',
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);

    void this.resume(status);
  }

  private async resume(status: Phaser.GameObjects.Text) {
    const storedId = getStoredPlayerId();
    if (!storedId) {
      this.scene.start('NameScene');
      return;
    }

    try {
      const player = await fetchPlayer(storedId);
      if (player) {
        this.registry.set('player', player);
        this.scene.start('SiteSelectScene');
      } else {
        // The server doesn't know this id (e.g. the database was reset): start fresh.
        clearStoredPlayerId();
        this.scene.start('NameScene');
      }
    } catch (err) {
      // Network or server trouble: keep the stored id so the player doesn't lose their game.
      status.setText(`Could not reach the server.\n${String(err)}\n\nClick to retry.`);
      this.input.once('pointerdown', () => this.scene.restart());
    }
  }
}