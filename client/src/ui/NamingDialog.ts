import Phaser from 'phaser';
import type { Specimen } from '../api';
import { normalizeGenus, normalizeSpecies } from '../naming';

const TEXT_COLOR = '#f2e8cf';
const HINT = 'A new genus name is tied to the first specimen given it: its holotype.';

export interface NamingDialogHandlers {
  /**Saves the name. Resolves to an error message to show in the dialog, or null on success. */
  onSubmit: (genus: string, species: string) => Promise<string | null>;
  /**Removes the name. Only provided for specimens that currently have one. */
  onRemove?: () => Promise<string | null>;
  onClose: () => void;
}

/**A modal dialog drawn inside a scene. The scene decides when to close it. */
export class NamingDialog {
  private scene: Phaser.Scene;
  private specimen: Specimen;
  private handlers: NamingDialogHandlers;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private genusInput!: HTMLInputElement;
  private speciesInput!: HTMLInputElement;
  private previewText!: Phaser.GameObjects.Text;
  private warningText!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private busy = false;
  private destroyed = false;

  constructor(scene: Phaser.Scene, specimen: Specimen, handlers: NamingDialogHandlers) {
    this.scene = scene;
    this.specimen = specimen;
    this.handlers = handlers;
    this.build();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.objects.forEach((o) => o.destroy()); //also removes the <input> elements
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
    const current = this.specimen.name;

    //The shade is interactive on purpose: it swallows clicks meant for the inventory beneath.
    this.track(this.scene.add.rectangle(cx, cy, width, height, 0x000000, 0.65).setInteractive());
    this.track(this.scene.add.rectangle(cx, cy, 580, 420, 0x3b2f2a).setStrokeStyle(3, 0xc8963e));

    this.track(
      this.scene.add
        .text(cx, 125, current ? 'Rename this specimen' : 'Name this specimen', {
          fontSize: '26px',
          color: TEXT_COLOR,
        })
        .setOrigin(0.5),
    );
    this.track(
      this.scene.add
        .text(cx, 160, this.specimen.item.name, { fontSize: '18px', color: TEXT_COLOR })
        .setOrigin(0.5),
    );

    this.genusInput = this.addInput(205, 'Genus (e.g. Toothosaurus)');
    this.speciesInput = this.addInput(255, 'species (e.g. rex)');
    if (current) {
      this.genusInput.value = current.genus;
      this.speciesInput.value = current.species;
    }

    this.previewText = this.track(
      this.scene.add.text(cx, 300, '', { fontSize: '22px', color: '#ffe9a8' }).setOrigin(0.5),
    );
    this.warningText = this.track(
      this.scene.add
        .text(cx, 345, '', {
          fontSize: '16px',
          color: TEXT_COLOR,
          align: 'center',
          wordWrap: { width: 520 },
        })
        .setOrigin(0.5),
    );
    this.errorText = this.track(
      this.scene.add
        .text(cx, 405, '', {
          fontSize: '17px',
          color: '#ff9b8a',
          align: 'center',
          wordWrap: { width: 520 },
        })
        .setOrigin(0.5),
    );

    this.addButton(cx - 195, 465, 160, 'Save', 0xc8963e, '#2b1d14', () => void this.submit());
    this.addButton(cx, 465, 160, 'Cancel', 0x6b5a4c, TEXT_COLOR, () => this.handlers.onClose());
    if (this.handlers.onRemove) {
      this.addButton(cx + 195, 465, 160, 'Remove name', 0xb5523b, TEXT_COLOR, () => void this.remove());
    }

    this.updatePreview();
    this.genusInput.focus();
  }

  private addInput(y: number, placeholder: string): HTMLInputElement {
    const dom = this.track(
      this.scene.add.dom(
        this.scene.scale.width / 2,
        y,
        'input',
        'width: 320px; font-size: 20px; padding: 6px; text-align: center;',
      ),
    );
    const input = dom.node as HTMLInputElement;
    input.maxLength = 20;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('input', () => this.updatePreview());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.submit();
      else if (e.key === 'Escape') this.handlers.onClose();
    });
    return input;
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
      this.scene.add.rectangle(x, y, w, 42, fill).setInteractive({ useHandCursor: true }),
    );
    this.track(
      this.scene.add.text(x, y, label, { fontSize: '19px', color: textColor }).setOrigin(0.5),
    );
    rect.on('pointerdown', onClick);
  }

  private updatePreview() {
    const genus = normalizeGenus(this.genusInput.value);
    const species = normalizeSpecies(this.speciesInput.value);
    const current = this.specimen.name;

    this.previewText.setText(genus && species ? `${genus} ${species}` : 'Use 3 to 20 letters for each name.');

    if (current?.isHolotype && genus && genus !== current.genus) {
      this.warningText.setText(
        `Warning: this specimen is the holotype of ${current.genus}. Naming it in another genus makes ${current.genus} invalid.`,
      );
    } else {
      this.warningText.setText(HINT);
    }
  }

  private async submit() {
    if (this.busy || this.destroyed) return;

    const genus = normalizeGenus(this.genusInput.value);
    const species = normalizeSpecies(this.speciesInput.value);
    if (!genus || !species) {
      this.errorText.setText('Each name must be 3 to 20 letters (A-Z only).');
      return;
    }

    this.busy = true;
    this.errorText.setText('Saving...');
    const error = await this.handlers.onSubmit(genus, species);
    this.busy = false;
    if (!this.destroyed && error) this.errorText.setText(error);
  }
 
  private async remove() {
    if (this.busy || this.destroyed || !this.handlers.onRemove) return;

    this.busy = true;
    this.errorText.setText('Removing...');
    const error = await this.handlers.onRemove();
    this.busy = false;
    if (!this.destroyed && error) this.errorText.setText(error);
  }
}