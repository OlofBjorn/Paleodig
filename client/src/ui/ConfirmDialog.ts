import Phaser from 'phaser';

const TEXT_COLOR = '#f2e8cf';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Runs when confirmed. Resolves to an error message to show in the dialog, or null on success. */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}

/** A modal "are you sure?" dialog drawn inside a scene. The scene decides when to close it. */
export class ConfirmDialog {
  private scene: Phaser.Scene;
  private options: ConfirmDialogOptions;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private errorText!: Phaser.GameObjects.Text;
  private busy = false;
  private destroyed = false;
  private onEscape = () => this.options.onClose();

  constructor(scene: Phaser.Scene, options: ConfirmDialogOptions) {
    this.scene = scene;
    this.options = options;
    this.build();
    this.scene.input.keyboard?.on('keydown-ESC', this.onEscape);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.input.keyboard?.off('keydown-ESC', this.onEscape);
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private build() {
    const { width, height } = this.scene.scale;
    const cx = width / 2;
    const cy = height / 2;

    // The shade is interactive on purpose: it swallows clicks meant for the scene underneath.
    this.track(this.scene.add.rectangle(cx, cy, width, height, 0x000000, 0.65).setInteractive());
    this.track(this.scene.add.rectangle(cx, cy, 560, 300, 0x3b2f2a).setStrokeStyle(3, 0xc8963e));

    this.track(
      this.scene.add
        .text(cx, cy - 100, this.options.title, { fontSize: '28px', color: TEXT_COLOR })
        .setOrigin(0.5),
    );
    this.track(
      this.scene.add
        .text(cx, cy - 55, this.options.message, {
          fontSize: '18px',
          color: TEXT_COLOR,
          align: 'center',
          wordWrap: { width: 480 },
        })
        .setOrigin(0.5, 0),
    );
    this.errorText = this.track(
      this.scene.add
        .text(cx, cy + 62, '', {
          fontSize: '17px',
          color: '#ff9b8a',
          align: 'center',
          wordWrap: { width: 480 },
        })
        .setOrigin(0.5),
    );

    this.addButton(cx - 110, cy + 108, 190, this.options.confirmLabel, 0xb5523b, TEXT_COLOR, () =>
      void this.confirm(),
    );
    this.addButton(cx + 110, cy + 108, 190, 'Cancel', 0x6b5a4c, TEXT_COLOR, () =>
      this.options.onClose(),
    );
  }

  private addButton(
    x: number,
    y: number,
    w: number,
    label: string,
    fill: number,
    textColor: string,
    onClick: () => void,
  ) {
    const rect = this.track(
      this.scene.add.rectangle(x, y, w, 44, fill).setInteractive({ useHandCursor: true }),
    );
    this.track(
      this.scene.add.text(x, y, label, { fontSize: '20px', color: textColor }).setOrigin(0.5),
    );
    rect.on('pointerdown', onClick);
  }

  private async confirm() {
    if (this.busy || this.destroyed) return;
    this.busy = true;
    this.errorText.setText('Working...');

    const error = await this.options.onConfirm();
    this.busy = false;
    // On success the scene usually changes underneath us, which destroys these objects.
    if (!this.destroyed && this.errorText.active) this.errorText.setText(error ?? '');
  }
}