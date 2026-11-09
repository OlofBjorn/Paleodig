import Phaser from 'phaser';

/**
 * Pixel art needs "nearest neighbour" scaling or it turns blurry when enlarged.
 * Set this to false if your miner and item icons are smooth drawings instead.
 * It only affects the miner and item icon textures, never the backgrounds.
 */
export const PIXEL_ART = true;

export function applyPixelFilter(scene: Phaser.Scene, key: string) {
  if (PIXEL_ART && scene.textures.exists(key)) {
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}