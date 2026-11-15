import Phaser from 'phaser';
import {
  clearStoredPlayerId,
  type NameRef,
  type Player,
  type ScoreReport,
  type SpeciesResult,
} from '../api';

const LIST_STYLE = [
  'width: 760px',
  'height: 430px',
  'overflow-y: auto',
  'box-sizing: border-box',
  'padding: 12px 20px 20px',
  'background: rgba(0, 0, 0, 0.35)',
  'color: #f2e8cf',
  'font-family: "Courier New", monospace',
  'font-size: 17px',
  'line-height: 1.45',
  'border: 2px solid #c8963e',
].join('; ');

/**
 * The results: the score, and what scientists a hundred years later made of the collection.
 *
 * In the fiction of the game, the player's names ARE the real names: real dinosaurs had no names
 * until somebody coined them. So this screen never shows the true animal names. Every animal is
 * described through the player's own valid species, or as "a still undiscovered species".
 */
export class EndScene extends Phaser.Scene {
  constructor() {
    super('EndScene');
  }

  create() {
    const { width } = this.scale;
    const report = this.registry.get('report') as ScoreReport | undefined;
    const player = this.registry.get('player') as Player | undefined;
    if (!report || !player) {
      this.scene.start('BootScene'); // nothing to show: let the boot flow work out where we belong
      return;
    }

    this.add
      .text(width / 2, 28, 'A hundred years later...', { fontSize: '28px', color: '#f2e8cf' })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 70, `${player.name}'s final score: ${report.score}`, {
        fontSize: '30px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5);

    // A real scrollable <div>, so wheel, trackpad and touch scrolling all work.
    const dom = this.add.dom(width / 2, 325, 'div', LIST_STYLE);
    this.fill(dom.node as HTMLDivElement, report);

    const again = this.add
      .rectangle(width / 2, 572, 240, 40, 0xc8963e)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(again.x, again.y, 'Play again', { fontSize: '22px', color: '#2b1d14' })
      .setOrigin(0.5);
    again.on('pointerdown', () => this.playAgain());
  }

  private playAgain() {
    // Forget this game entirely. The next load asks for a name and starts a fresh one.
    clearStoredPlayerId();
    for (const key of ['player', 'report', 'sites', 'minerPos']) {
      this.registry.remove(key);
    }
    this.scene.start('NameScene');
  }

  /* ------------------------------ the report ------------------------------ */

  private fill(root: HTMLDivElement, report: ScoreReport) {
    const b = report.breakdown;

    // ---- naming helpers: the player's own names, never the true ones
    const speciesByTaxon = new Map(report.species.map((s) => [s.taxonId, s]));

    /**
     * A species name. The genus goes in quotes only when the species itself is valid but its genus
     * is not: that is the "valid species, doubtful genus" case. A dubious species in a dubious
     * genus, a chimera, or a junior synonym is just named plainly.
     */
    const nameOf = (s: SpeciesResult) => {
      const validSpecies = s.verdict === 'correct' && !s.synonymOf;
      return validSpecies && !s.genusValid ? `"${s.genus}" ${s.species}` : `${s.genus} ${s.species}`;
    };

    const refName = (ref: NameRef) => {
      const s = speciesByTaxon.get(ref.taxonId);
      return s ? nameOf(s) : `${ref.genus} ${ref.species}`;
    };

    const genusStatus = new Map(report.genera.map((g) => [g.genusId, g.status]));

    // The player's valid species for each true animal (by id), if they got it right.
    const validByAnimal = new Map<number, SpeciesResult>();
    for (const s of report.species) {
      if (s.verdict === 'correct' && !s.synonymOf) validByAnimal.set(s.animals[0].id, s);
    }
    const identityOf = (animalId: number): string | null => {
      const valid = validByAnimal.get(animalId);
      return valid ? nameOf(valid) : null;
    };

    root.appendChild(
      this.el(
        'div',
        'A century has passed. Scientists have studied the collection you left behind, and the truth about every fossil is finally known.',
        'margin: 6px 0 4px;',
      ),
    );

    // ---- score
    root.appendChild(this.heading('Your score'));
    root.appendChild(this.row('Fossils correctly grouped', `+${b.specimenCredit}`));
    root.appendChild(this.row('Valid species', `+${b.speciesPoints}`));
    root.appendChild(this.row('Valid genera', `+${b.genusPoints}`));
    root.appendChild(this.row(`Money left (${report.money})`, `+${b.moneyPoints}`));
    root.appendChild(this.penaltyRow('Fossils sold', b.soldPenalty));
    root.appendChild(this.penaltyRow('Species that mixed animals', b.wrongMergePenalty));
    root.appendChild(this.penaltyRow('Animals described twice', b.duplicatePenalty));
    root.appendChild(
      this.row(
        'Total',
        String(report.score),
        'font-weight: bold; margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(242, 232, 207, 0.5);',
      ),
    );

    // ---- valid species
    const valid = report.species.filter((s) => s.verdict === 'correct' && !s.synonymOf);
    root.appendChild(this.heading('Discoveries that stood the test of time'));
    if (valid.length === 0) {
      root.appendChild(this.el('div', 'None. Nothing you named held up.', 'opacity: 0.75;'));
    }
    for (const s of valid) {
      root.appendChild(this.el('div', `${nameOf(s)}: valid`, 'margin-top: 8px;'));
      root.appendChild(
        this.el(
          'div',
          `Based on: ${s.specimens.map((x) => x.itemName).join(', ')}`,
          'margin-left: 16px; opacity: 0.8;',
        ),
      );
      if (!s.hasDiagnostic) {
        root.appendChild(
          this.el(
            'div',
            'No single fossil was diagnostic, but the matching fossils together were enough.',
            'margin-left: 16px; opacity: 0.8;',
          ),
        );
      }
      if (!s.genusValid) {
        const why =
          genusStatus.get(s.genusId) === 'dubious'
            ? 'is dubious'
            : genusStatus.get(s.genusId) === 'synonym'
              ? 'is a junior synonym'
              : 'lacks ground';
        root.appendChild(
          this.el(
            'div',
            `The species is valid, but the genus "${s.genus}" ${why}, so scientists are debating reassigning the valid species to a new genus.`,
            'margin-left: 16px; color: #ffcf8a;',
          ),
        );
      }
    }

    // ---- described twice
    if (report.synonyms.length > 0) {
      root.appendChild(this.heading('Described twice'));
      for (const syn of report.synonyms) {
        const junior = refName(syn.junior);
        const senior = refName(syn.senior);

        let text = syn.sameGenus
          ? `${junior} is a junior synonym of ${senior}: one animal, named twice.`
          : `${junior} turned out to be the same animal as ${senior}. The older name takes priority.`;

        // If the junior's whole genus held only duplicates, the genus name was wasted too.
        const juniorGenus = report.genera.find((g) => g.name === syn.junior.genus);
        if (!syn.sameGenus && juniorGenus?.status === 'synonym') {
          text += ` ${syn.junior.genus} was synonymised into ${syn.senior.genus}.`;
        }
        root.appendChild(this.el('div', text, 'margin-top: 8px;'));
      }
    }

    // ---- wrong merges
    const chimeras = report.species.filter((s) => s.verdict === 'wrong_merge');
    if (chimeras.length > 0) {
      root.appendChild(this.heading('Chimeras: different animals, one name'));
      for (const s of chimeras) {
        root.appendChild(
          this.el('div', `${nameOf(s)} combined the bones of different animals.`, 'margin-top: 8px;'),
        );
        for (const sp of s.specimens) {
          const who = identityOf(sp.animal.id);
          root.appendChild(
            this.el(
              'div',
              `${sp.itemName}: belonged to ${who ?? 'a still undiscovered species'}`,
              'margin-left: 16px; opacity: 0.8;',
            ),
          );
        }
      }
    }

    // ---- uncertain findings: species that could not be verified, and the genera built on them
    const dubiousSpecies = report.species.filter((s) => s.verdict === 'dubious');
    const dubiousGenera = report.genera.filter((g) => g.status === 'dubious');
    if (dubiousSpecies.length > 0 || dubiousGenera.length > 0) {
      root.appendChild(this.heading('Uncertain findings'));

      for (const s of dubiousSpecies) {
        const only = s.specimens[0];
        const who = identityOf(only.animal.id);
        root.appendChild(
          this.el(
            'div',
            `${nameOf(s)} rests on a single fossil (${only.itemName}) that is not diagnostic, so the name is considered doubtful. ` +
              (who ? `It was in fact the same animal as ${who}.` : 'It was a still undiscovered species.'),
            'margin-top: 8px;',
          ),
        );
      }

      // A genus stands or falls on its holotype's species. If that can't be verified, the genus
      // is dubious, even if another species in it is valid.
      for (const g of dubiousGenera) {
        const holotypeSpecies =
          g.holotypeTaxonId !== null ? speciesByTaxon.get(g.holotypeTaxonId) : undefined;
        const basis = holotypeSpecies
          ? `it rests on its holotype species, ${nameOf(holotypeSpecies)}, which could not be verified with certainty`
          : 'its holotype species could not be verified with certainty';
        root.appendChild(
          this.el(
            'div',
            `The genus ${g.name} is dubious: ${basis}, so the genus is not considered valid.`,
            'margin-top: 8px;',
          ),
        );
      }
    }

    // ---- genera
    if (report.genera.length > 0) {
      root.appendChild(this.heading('Your genera'));
      for (const g of report.genera) {
        let text: string;
        let css = '';
        if (g.status === 'valid') {
          text = `${g.name}: valid`;
        } else if (g.status === 'dubious') {
          // Its holotype is still named in it and it isn't a synonym, but the species it is built
          // on could not be verified with certainty: not invalid, but not valid either.
          // Listed simply; "Uncertain findings" above explains why.
          text = `${g.name}: dubious`;
          css = 'opacity: 0.85;';
        } else if (g.status === 'synonym') {
          // "Described twice" above explains which name it duplicates.
          text = `${g.name}: junior synonym`;
          css = 'opacity: 0.75;';
        } else {
          text = `${g.name}: lacks ground. Its holotype is no longer named in it, and the name stays taken.`;
          css = 'color: #ffcf8a;';
        }
        root.appendChild(this.el('div', text, `margin-top: 4px; ${css}`));
      }
    }

    // ---- sold
    root.appendChild(this.heading('Lost to science'));
    if (report.lostFossils.length === 0) {
      root.appendChild(this.el('div', 'You sold no fossils.', 'opacity: 0.75;'));
    } else {
      root.appendChild(
        this.el('div', 'Fossils you sold can never be studied again.', 'opacity: 0.8; margin-bottom: 4px;'),
      );
      for (const f of report.lostFossils) {
        const who = identityOf(f.animal.id);
        root.appendChild(
          this.row(
            who ? `${f.itemName} (it belonged to ${who})` : f.itemName,
            `-${f.penalty}`,
            'color: #ff9b8a;',
          ),
        );
      }
    }

    // ---- never named
    if (report.unnamedFossils.length > 0) {
      root.appendChild(this.heading('Never studied'));
      root.appendChild(
        this.el('div', 'You kept these fossils but never named them.', 'opacity: 0.8; margin-bottom: 4px;'),
      );
      for (const f of report.unnamedFossils) {
        const who = identityOf(f.animal.id);
        root.appendChild(
          this.el('div', who ? `${f.itemName} (it belonged to ${who})` : f.itemName, 'margin-left: 16px;'),
        );
      }
    }
  }

  /* ------------------------------ DOM helpers ------------------------------ */

  /** Everything goes through textContent, never innerHTML. */
  private el(tag: string, text: string, css: string): HTMLElement {
    const element = document.createElement(tag);
    element.textContent = text;
    element.style.cssText = css;
    return element;
  }

  private heading(text: string): HTMLElement {
    return this.el(
      'div',
      text,
      'font-size: 20px; font-weight: bold; color: #ffe9a8; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(200, 150, 62, 0.6);',
    );
  }

  private row(label: string, value: string, css = ''): HTMLElement {
    const row = this.el('div', '', `display: flex; justify-content: space-between; gap: 16px; ${css}`);
    row.appendChild(this.el('span', label, ''));
    row.appendChild(this.el('span', value, ''));
    return row;
  }

  private penaltyRow(label: string, amount: number): HTMLElement {
    return this.row(label, `-${amount}`, amount > 0 ? 'color: #ff9b8a;' : 'opacity: 0.6;');
  }
}