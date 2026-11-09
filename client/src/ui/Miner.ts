import Phaser from 'phaser';
import { applyPixelFilter } from './pixelArt';

const BODY_KEY = 'miner-body';
const PICKAXE_KEY = 'miner-pickaxe';
const imageUrl = (file: string) => `${import.meta.env.BASE_URL}images/miner/${file}`;

// Everything below is measured in screen pixels, relative to the miner's feet.
const BODY_HEIGHT = 100; // on-screen height of the miner
const PICKAXE_LENGTH = 56; // on-screen length of the pickaxe
const HAND = { x: 24, y: -50 }; // where the pickaxe is held
const REACH = 56; // how far in front of the feet the pickaxe lands

const IDLE_ANGLE = -55; // leaning back over the shoulder (0 = straight up, clockwise is positive)
const STRIKE_ANGLE = 140; // down and forward into the ground
const SWING_MS = 240;

/** Starts loading the miner's art. A missing file is fine: shapes are drawn instead. */
export function preloadMinerTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(BODY_KEY)) scene.load.image(BODY_KEY, imageUrl('miner.png'));
  if (!scene.textures.exists(PICKAXE_KEY)) scene.load.image(PICKAXE_KEY, imageUrl('pickaxe.png'));
}

/**
 * A little miner standing at (x, y), facing right, who swings a pickaxe while mining.
 *
 * Uses the images in public/images/miner/ when they exist, and plain coloured shapes otherwise,
 * so the animation can be built and tested before any art is drawn.
 */
export class Miner {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Container;
  private pickaxe: Phaser.GameObjects.Container;
  private swing: Phaser.Tweens.Tween | null = null;
  private bob: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Body: feet at (0, 0), so squashing it scales around the ground.
    this.body = scene.add.container(0, 0);
    if (scene.textures.exists(BODY_KEY)) {
      applyPixelFilter(scene, BODY_KEY);
      const image = scene.add.image(0, 0, BODY_KEY).setOrigin(0.5, 1);
      image.setScale(BODY_HEIGHT / image.height);
      this.body.add(image);
    } else {
      this.body.add([
        scene.add.rectangle(0, -12, 26, 24, 0x3a4a6b), // legs
        scene.add.rectangle(0, -44, 34, 40, 0x4a78b5), // torso
        scene.add.circle(0, -76, 13, 0xf0c9a0), // head
        scene.add.rectangle(0, -91, 32, 8, 0xf2c94c), // hard hat brim
        scene.add.rectangle(0, -97, 22, 8, 0xf2c94c), // hard hat top
      ]);
    }

    // Pickaxe: the container sits at the hand and rotates around it, handle end at the origin.
    this.pickaxe = scene.add.container(HAND.x, HAND.y);
    if (scene.textures.exists(PICKAXE_KEY)) {
      applyPixelFilter(scene, PICKAXE_KEY);
      const image = scene.add.image(0, 0, PICKAXE_KEY).setOrigin(0.5, 1);
      image.setScale(PICKAXE_LENGTH / image.height);
      this.pickaxe.add(image);
    } else {
      this.pickaxe.add([
        scene.add.rectangle(0, -24, 6, 48, 0x8a5a3c), // handle
        scene.add.rectangle(0, -50, 30, 8, 0x9aa3ad), // head
      ]);
    }
    this.pickaxe.setAngle(IDLE_ANGLE);

    this.root = scene.add.container(x, y, [this.body, this.pickaxe]);
  }

  /** Where the pickaxe hits the ground: the spot a found item should spring up from. */
  get strikePoint(): { x: number; y: number } {
    return { x: this.root.x + REACH, y: this.root.y };
  }

  startMining() {
    this.stopMining();

    this.swing = this.scene.tweens.add({
      targets: this.pickaxe,
      angle: { from: IDLE_ANGLE, to: STRIKE_ANGLE },
      duration: SWING_MS,
      ease: 'Quad.easeIn',
      yoyo: true,
      hold: 30,
      repeat: -1,
      onYoyo: () => this.puff(), // fires at the moment of impact
    });

    // A small squash on every swing so the whole body puts effort in.
    this.bob = this.scene.tweens.add({
      targets: this.body,
      scaleY: 0.95,
      duration: SWING_MS / 2,
      yoyo: true,
      repeat: -1,
    });
  }

  stopMining() {
    this.swing?.stop();
    this.bob?.stop();
    this.swing = null;
    this.bob = null;

    this.body.setScale(1);
    // Ease the pickaxe back over the shoulder instead of snapping.
    this.scene.tweens.add({
      targets: this.pickaxe,
      angle: IDLE_ANGLE,
      duration: 150,
      ease: 'Quad.easeOut',
    });
  }

  /** A few grains of dust kicked up where the pickaxe lands. */
  private puff() {
    const { x, y } = this.strikePoint;
    for (let i = 0; i < 6; i++) {
      const dot = this.scene.add.circle(
        x + Phaser.Math.Between(-6, 6),
        y - 3,
        Phaser.Math.Between(3, 6),
        0xd9c9a3,
        0.9,
      );
      this.scene.tweens.add({
        targets: dot,
        x: dot.x + Phaser.Math.Between(-32, 32),
        y: dot.y - Phaser.Math.Between(10, 34),
        alpha: 0,
        scale: 0.3,
        duration: 360,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }
}