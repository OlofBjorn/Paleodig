import Phaser from 'phaser';
import type { DugItem } from '../api';
import { itemTextureKey } from './loadTextures';
import { applyPixelFilter } from './pixelArt';

const ICON_SIZE = 96;
const KIND_COLOR = { fossil: 0xd9c9a3, rock: 0x8a8a8a, gem: 0x6fb7d9 } as const;

export interface Point {
  x: number;
  y: number;
}

/**
 * Makes a found item's icon spring up out of the ground and settle at `to`.
 * Fossils and gems also get an expanding sparkle ring; plain rocks don't, so finds feel different.
 *
 * Uses the item's image if it has loaded, otherwise a coloured tile with the item's name, the same
 * fallback as the inventory. Returns everything it created so the caller can clear it later.
 */
export function revealItem(
  scene: Phaser.Scene,
  item: DugItem,
  from: Point,
  to: Point,
): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];

  const icon = scene.add.container(from.x, from.y).setScale(0);
  const key = itemTextureKey(item.image);
  if (item.image && scene.textures.exists(key)) {
    applyPixelFilter(scene, key);
    const image = scene.add.image(0, 0, key);
    image.setScale(ICON_SIZE / Math.max(image.width, image.height));
    icon.add(image);
  } else {
    icon.add([
      scene.add.rectangle(0, 0, ICON_SIZE, ICON_SIZE, KIND_COLOR[item.kind], 0.95).setStrokeStyle(3, 0x2b1d14),
      scene.add
        .text(0, 0, item.name, {
          fontSize: '14px',
          color: '#2b1d14',
          align: 'center',
          wordWrap: { width: ICON_SIZE - 12 },
        })
        .setOrigin(0.5),
    ]);
  }
  objects.push(icon);

  // Springs up from the ground and overshoots a little before settling.
  scene.tweens.add({
    targets: icon,
    x: to.x,
    y: to.y,
    scale: 1,
    duration: 520,
    ease: 'Back.easeOut',
  });

  if (item.kind !== 'rock') {
    const ring = scene.add
      .circle(to.x, to.y, 10)
      .setFillStyle(0xffffff, 0)
      .setStrokeStyle(4, 0xffe9a8)
      .setVisible(false);
    objects.push(ring);

    // Starts as the icon lands.
    scene.time.delayedCall(380, () => {
      if (!ring.active) return;
      ring.setVisible(true);
      scene.tweens.add({
        targets: ring,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 6 },
        duration: 520,
        ease: 'Quad.easeOut',
        onComplete: () => ring.destroy(),
      });
    });
  }

  return objects;
}