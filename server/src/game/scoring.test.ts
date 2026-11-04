import { describe, expect, it } from 'vitest';
import {
  SCORING,
  scoreGame,
  type ScoringGenus,
  type ScoringInput,
  type ScoringSpecimen,
  type ScoringTaxon,
  type Tier,
} from './scoring';

const ANIMALS = [
  { id: 1, genus: 'Tyrannosaurus', species: 'rex' },
  { id: 2, genus: 'Triceratops', species: 'horridus' },
];

const day = (n: number) => new Date(2026, 10, n);

function fossil(
  id: number,
  animalId: number,
  diagnostic: Tier,
  opts: { taxonId?: number | null; status?: 'owned' | 'sold' } = {},
): ScoringSpecimen {
  return {
    id,
    status: opts.status ?? 'owned',
    taxonId: opts.taxonId ?? null,
    item: { name: `${diagnostic} bone ${id}`, kind: 'fossil', animalId, diagnostic },
  };
}

const rock = (id: number, status: 'owned' | 'sold' = 'owned'): ScoringSpecimen => ({
  id,
  status,
  taxonId: null,
  item: { name: 'Rock', kind: 'rock', animalId: null, diagnostic: null },
});

const taxon = (id: number, genusId: number, speciesName: string, createdDay: number): ScoringTaxon => ({
  id,
  genusId,
  speciesName,
  createdAt: day(createdDay),
});

const genus = (
  id: number,
  name: string,
  createdDay: number,
  holotypeSpecimenId: number,
): ScoringGenus => ({ id, name, createdAt: day(createdDay), holotypeSpecimenId });

const game = (overrides: Partial<ScoringInput>): ScoringInput => ({
  balance: 0,
  specimens: [],
  taxa: [],
  genera: [],
  animals: ANIMALS,
  ...overrides,
});

const { credit, speciesPoints, genusPoints } = {
  credit: SCORING.credit,
  speciesPoints: SCORING.speciesPoints,
  genusPoints: SCORING.genusPoints,
};

describe('species verdicts', () => {
  it('a diagnostic fossil makes a correct species, scoring specimens, species and genus', () => {
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'high', { taxonId: 1 }),
          fossil(2, 1, 'low', { taxonId: 1 }),
        ],
        taxa: [taxon(1, 1, 'rex', 1)],
        genera: [genus(1, 'Toothosaurus', 1, 1)],
      }),
    );

    expect(report.species).toHaveLength(1);
    expect(report.species[0].verdict).toBe('correct');
    expect(report.species[0].hasDiagnostic).toBe(true);
    expect(report.species[0].genusValid).toBe(true);
    expect(report.genera[0].status).toBe('credited');
    expect(report.breakdown.specimenCredit).toBe(credit.high + credit.low);
    expect(report.breakdown.speciesPoints).toBe(speciesPoints);
    expect(report.breakdown.genusPoints).toBe(genusPoints);
    expect(report.score).toBe(credit.high + credit.low + speciesPoints + genusPoints);
  });

  it('a lone non-diagnostic fossil is dubious: it earns nothing, and wastes its genus', () => {
    for (const tier of ['medium', 'low'] as const) {
      const report = scoreGame(
        game({
          specimens: [fossil(1, 1, tier, { taxonId: 1 })],
          taxa: [taxon(1, 1, 'rex', 1)],
          genera: [genus(1, 'Toothosaurus', 1, 1)],
        }),
      );
      expect(report.species[0].verdict).toBe('dubious');
      expect(report.species[0].points).toBe(0);
      expect(report.genera[0]).toMatchObject({ status: 'wasted', points: 0, reason: 'unconfirmed' });
      expect(report.score).toBe(0);
    }
  });

  it('two or more non-diagnostic fossils of one animal are enough to be correct', () => {
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'low', { taxonId: 1 }),
          fossil(2, 1, 'medium', { taxonId: 1 }),
        ],
        taxa: [taxon(1, 1, 'rex', 1)],
        genera: [genus(1, 'Toothosaurus', 1, 1)],
      }),
    );

    expect(report.species[0].verdict).toBe('correct');
    expect(report.species[0].hasDiagnostic).toBe(false);
    expect(report.breakdown.specimenCredit).toBe(credit.low + credit.medium);
    expect(report.breakdown.speciesPoints).toBe(speciesPoints);
  });

  it('mixing different animals in one species is a wrong merge: nothing earned, a penalty', () => {
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'high', { taxonId: 1 }),
          fossil(2, 2, 'high', { taxonId: 1 }),
        ],
        taxa: [taxon(1, 1, 'rex', 1)],
        genera: [genus(1, 'Toothosaurus', 1, 1)],
      }),
    );

    expect(report.species[0].verdict).toBe('wrong_merge');
    expect(report.species[0].animals).toHaveLength(2);
    expect(report.breakdown.specimenCredit).toBe(0);
    expect(report.breakdown.speciesPoints).toBe(0);
    expect(report.breakdown.genusPoints).toBe(0);
    expect(report.breakdown.wrongMergePenalty).toBe(SCORING.wrongMergePenalty);
    expect(report.score).toBe(0); // never negative
  });
});

describe('genus points', () => {
  it('a genus earns its points once, however many species it holds', () => {
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'high', { taxonId: 1 }),
          fossil(2, 2, 'high', { taxonId: 2 }),
        ],
        taxa: [taxon(1, 1, 'rex', 1), taxon(2, 1, 'horridus', 2)],
        genera: [genus(1, 'Toothosaurus', 1, 1)],
      }),
    );

    expect(report.breakdown.speciesPoints).toBe(2 * speciesPoints);
    expect(report.breakdown.genusPoints).toBe(genusPoints);
  });

  it('species under an invalid genus still score as species, but earn no genus points', () => {
    // Specimen 1 is the holotype of both genera but now lives in Lizardodon, so Toothosaurus
    // is invalid. Specimens 2 and 3 (a different animal) are still named under it.
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'high', { taxonId: 2 }),
          fossil(2, 2, 'low', { taxonId: 1 }),
          fossil(3, 2, 'low', { taxonId: 1 }),
        ],
        taxa: [taxon(1, 1, 'rex', 1), taxon(2, 2, 'prorsus', 2)],
        genera: [genus(1, 'Toothosaurus', 1, 1), genus(2, 'Lizardodon', 2, 1)],
      }),
    );

    const rex = report.species.find((s) => s.species === 'rex');
    expect(rex).toMatchObject({ verdict: 'correct', genusValid: false, points: speciesPoints });

    expect(report.genera.find((g) => g.name === 'Toothosaurus')?.status).toBe('invalid');
    expect(report.genera.find((g) => g.name === 'Lizardodon')?.status).toBe('credited');
    expect(report.breakdown.speciesPoints).toBe(2 * speciesPoints);
    expect(report.breakdown.genusPoints).toBe(genusPoints); // only Lizardodon
    expect(report.breakdown.specimenCredit).toBe(credit.high + 2 * credit.low);
  });

  it('selling a genus holotype invalidates the genus; its species keep their own score', () => {
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'high', { status: 'sold' }),
          fossil(2, 1, 'low', { taxonId: 1 }),
          fossil(3, 1, 'low', { taxonId: 1 }),
        ],
        taxa: [taxon(1, 1, 'rex', 1)],
        genera: [genus(1, 'Toothosaurus', 1, 1)],
      }),
    );

    expect(report.genera[0].status).toBe('invalid');
    expect(report.species[0]).toMatchObject({ verdict: 'correct', genusValid: false });
    expect(report.breakdown.speciesPoints).toBe(speciesPoints);
    expect(report.breakdown.genusPoints).toBe(0);
    expect(report.lostFossils).toHaveLength(1);
  });
});

describe('synonymy', () => {
  it('keeps the oldest name; the newer one earns no species or genus points', () => {
    // Passed in "wrong" order on purpose: age decides, not array position.
    const report = scoreGame(
      game({
        specimens: [
          fossil(2, 1, 'medium', { taxonId: 2 }),
          fossil(3, 1, 'low', { taxonId: 2 }),
          fossil(1, 1, 'high', { taxonId: 1 }),
        ],
        taxa: [taxon(2, 2, 'prorsus', 3), taxon(1, 1, 'rex', 1)],
        genera: [genus(2, 'Lizardodon', 3, 2), genus(1, 'Toothosaurus', 1, 1)],
      }),
    );

    expect(report.synonyms).toHaveLength(1);
    expect(report.synonyms[0].senior).toMatchObject({ genus: 'Toothosaurus', species: 'rex' });
    expect(report.synonyms[0].junior).toMatchObject({ genus: 'Lizardodon', species: 'prorsus' });
    expect(report.synonyms[0].sameGenus).toBe(false);
    expect(report.synonyms[0].animal.genus).toBe('Tyrannosaurus');

    const junior = report.species.find((s) => s.species === 'prorsus');
    expect(junior?.synonymOf).toMatchObject({ genus: 'Toothosaurus', species: 'rex' });
    expect(junior?.points).toBe(0);

    // The junior's genus name is used up in vain.
    expect(report.genera.find((g) => g.name === 'Lizardodon')).toMatchObject({
      status: 'wasted',
      points: 0,
      reason: 'synonyms',
    });
    expect(report.genera.find((g) => g.name === 'Toothosaurus')?.status).toBe('credited');

    // Its specimens still count; the one senior species and genus earn their points once.
    expect(report.breakdown.specimenCredit).toBe(credit.high + credit.medium + credit.low);
    expect(report.breakdown.speciesPoints).toBe(speciesPoints);
    expect(report.breakdown.genusPoints).toBe(genusPoints);
    expect(report.breakdown.duplicatePenalty).toBe(SCORING.duplicatePenalty);
  });

  it('two species of one animal inside the same genus are flagged as the same genus', () => {
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'high', { taxonId: 1 }),
          fossil(2, 1, 'low', { taxonId: 2 }),
          fossil(3, 1, 'low', { taxonId: 2 }),
        ],
        taxa: [taxon(1, 1, 'rex', 1), taxon(2, 1, 'magnus', 2)],
        genera: [genus(1, 'Toothosaurus', 1, 1)],
      }),
    );

    expect(report.synonyms).toHaveLength(1);
    expect(report.synonyms[0].sameGenus).toBe(true);
    expect(report.synonyms[0].junior.species).toBe('magnus');
    expect(report.genera[0].status).toBe('credited'); // the genus is shared, so not wasted
  });

  it('different animals are never synonyms', () => {
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'high', { taxonId: 1 }),
          fossil(2, 2, 'high', { taxonId: 2 }),
        ],
        taxa: [taxon(1, 1, 'rex', 1), taxon(2, 2, 'horridus', 2)],
        genera: [genus(1, 'Toothosaurus', 1, 1), genus(2, 'Hornosaurus', 2, 2)],
      }),
    );

    expect(report.synonyms).toHaveLength(0);
    expect(report.breakdown.duplicatePenalty).toBe(0);
    expect(report.breakdown.genusPoints).toBe(2 * genusPoints);
  });

  it('a dubious name is just a waste, not a duplicate', () => {
    const report = scoreGame(
      game({
        specimens: [
          fossil(1, 1, 'high', { taxonId: 1 }),
          fossil(2, 1, 'low', { taxonId: 2 }), // lone femur of the same animal under a new name
        ],
        taxa: [taxon(1, 1, 'rex', 1), taxon(2, 2, 'prorsus', 2)],
        genera: [genus(1, 'Toothosaurus', 1, 1), genus(2, 'Lizardodon', 2, 2)],
      }),
    );

    expect(report.species.find((s) => s.species === 'prorsus')?.verdict).toBe('dubious');
    expect(report.synonyms).toHaveLength(0);
    expect(report.breakdown.duplicatePenalty).toBe(0);
    expect(report.genera.find((g) => g.name === 'Lizardodon')?.status).toBe('wasted');
  });
});

describe('sold and unnamed fossils', () => {
  it('selling fossils costs points by tier, selling rocks costs nothing', () => {
    const report = scoreGame(
      game({
        balance: 2000,
        specimens: [
          fossil(1, 1, 'high', { status: 'sold' }),
          fossil(2, 1, 'low', { status: 'sold' }),
          rock(3, 'sold'),
        ],
      }),
    );

    expect(report.lostFossils).toHaveLength(2);
    expect(report.breakdown.soldPenalty).toBe(SCORING.soldPenalty.high + SCORING.soldPenalty.low);
    expect(report.score).toBe(
      Math.floor(2000 / SCORING.moneyDivisor) - SCORING.soldPenalty.high - SCORING.soldPenalty.low,
    );
  });

  it('selling a fossil is always worse than naming it, even for the money', () => {
    const named = scoreGame(
      game({
        balance: 100,
        specimens: [fossil(1, 1, 'high', { taxonId: 1 })],
        taxa: [taxon(1, 1, 'rex', 1)],
        genera: [genus(1, 'Toothosaurus', 1, 1)],
      }),
    );
    const sold = scoreGame(
      game({ balance: 100 + 240, specimens: [fossil(1, 1, 'high', { status: 'sold' })] }),
    );

    expect(sold.score).toBeLessThan(named.score);
  });

  it('owned fossils that were never named are listed but earn nothing', () => {
    const report = scoreGame(game({ specimens: [fossil(1, 1, 'high')] }));

    expect(report.unnamedFossils).toHaveLength(1);
    expect(report.breakdown.specimenCredit).toBe(0);
    expect(report.score).toBe(0);
  });
});

describe('money', () => {
  it('counts for one point per moneyDivisor, rounded down', () => {
    const report = scoreGame(game({ balance: 260 }));

    expect(report.breakdown.moneyPoints).toBe(Math.floor(260 / SCORING.moneyDivisor));
    expect(report.score).toBe(report.breakdown.moneyPoints);
    expect(report.money).toBe(260);
  });
});