import type Phaser from 'phaser';
import { ApiError, endGame, type Player } from '../api';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Opens the "end the game?" confirmation. On confirm it ends and scores the game on the server,
 * stores the report, and moves to the results screen. Shared by every scene with an End game button.
 */
export function openEndGameDialog(scene: Phaser.Scene, onClose: () => void): ConfirmDialog {
  const player = scene.registry.get('player') as Player;

  return new ConfirmDialog(scene, {
    title: 'End the game?',
    message:
      'Your collection will be scored and the truth about every fossil revealed. ' +
      'You will not be able to dig, sell or name anything afterwards.',
    confirmLabel: 'End game',
    onClose,
    onConfirm: async () => {
      try {
        const result = await endGame(player.id);
        if (!scene.scene.isActive()) return null;

        scene.registry.set('player', {
          id: result.player.id,
          name: result.player.name,
          balance: result.player.balance,
          ended: true,
        } satisfies Player);
        scene.registry.set('report', result.report);
        scene.scene.start('EndScene');
        return null;
      } catch (err) {
        if (!scene.scene.isActive()) return null;
        return err instanceof ApiError ? err.message : `Could not reach the server.\n${String(err)}`;
      }
    },
  });
}