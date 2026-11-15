import Phaser from 'phaser';

export const PIXEL_ART = true;

export function applyPixelFilter(scene: Phaser.Scene, key: string) {
  if (PIXEL_ART && scene.textures.exists(key)) {
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}