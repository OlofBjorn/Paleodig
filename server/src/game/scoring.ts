/**
 * End-game scoring. A pure function: it takes a snapshot of one player's game and returns the
 * score plus everything the "100 years later" reveal needs. No database access in here, so it's
 * easy to test and to re-run.
 *
 * Rules, in short:
 *  - Only fossils count. Rocks and gems are just money.
 *  - A species (genus + species name) is judged by the true animals behind its specimens:
 *      * more than one animal            -> wrong merge: no credit and a penalty
 *      * one animal, a high-diagnostic
 *        fossil or 2+ specimens          -> correct
 *      * one animal, 1 non-diagnostic
 *        specimen                        -> dubious: earns nothing (clutter and a wasted name)
 *  - If several correct species turn out to be the same animal, the oldest name is kept. Newer
 *    ones are junior synonyms: their specimens still count, but they earn no species or genus
 *    points and cost a small duplicate penalty.
 *  - Points: per correctly grouped specimen (by diagnostic tier), per correct senior species,
 *    and per valid genus.
 *  - A genus stands or falls on its HOLOTYPE'S SPECIES, the one every other species in it is
 *    compared against:
 *      * holotype no longer named in it (moved or sold)  -> invalid
 *      * holotype's species not verified (dubious, or
 *        a mix of animals)                               -> dubious, even if another species
 *                                                           in the genus is valid
 *      * holotype's species duplicates an older name in
 *        another genus                                   -> junior synonym
 *      * otherwise                                       -> valid
 *    A valid species in a genus that isn't valid still scores as a species, it just earns no
 *    genus points.
 *  - Every fossil sold costs points, more for more diagnostic fossils.
 *  - Money counts for a little, so it can never outweigh the science.
 */

export type Tier = 'high' | 'medium' | 'low';

/** Every number here is a placeholder for the Sprint 5 balance pass. */
export const SCORING = {
  /** Points per correctly grouped specimen, by diagnostic tier. */
  credit: { high: 30, medium: 15, low: 5 },
  /** Points per correct species that isn't a junior synonym. */
  speciesPoints: 40,
  /** Points per valid genus holding at least one such species. */
  genusPoints: 25,
  /** Points lost per fossil sold, by diagnostic tier. */
  soldPenalty: { high: 40, medium: 20, low: 8 },
  /** Points lost per species that mixes different animals. */
  wrongMergePenalty: 25,
  /** Points lost per species that duplicates an older name for the same animal. Set to 0 to make duplicates merely worthless. */
  duplicatePenalty: 15,
  /** One point per this much money left at the end. */
  moneyDivisor: 25,
} as const;

/* ---------------------------------- input ---------------------------------- */

export interface ScoringSpecimen {
  id: number;
  status: 'owned' | 'sold';
  taxonId: number | null;
  item: {
    name: string;
    kind: 'fossil' | 'rock' | 'gem';
    animalId: number | null;
    diagnostic: Tier | null;
  };
}

export interface ScoringTaxon {
  id: number;
  genusId: number;
  speciesName: string;
  createdAt: Date;
}

export interface ScoringGenus {
  id: number;
  name: string;
  createdAt: Date;
  holotypeSpecimenId: number;
}

export interface ScoringAnimal {
  id: number;
  genus: string;
  species: string;
}

export interface ScoringInput {
  balance: number;
  specimens: ScoringSpecimen[];
  taxa: ScoringTaxon[];
  genera: ScoringGenus[];
  animals: ScoringAnimal[];
}

/* --------------------------------- output ---------------------------------- */

export type SpeciesVerdict = 'correct' | 'dubious' | 'wrong_merge';

export interface NameRef {
  taxonId: number;
  genus: string;
  species: string;
}

export interface SpeciesResult extends NameRef {
  genusId: number;
  /** Whether its genus is valid. False for a dubious, synonymised or invalid genus. */
  genusValid: boolean;
  verdict: SpeciesVerdict;
  /** At least one specimen is a high-diagnostic fossil. */
  hasDiagnostic: boolean;
  specimens: {
    id: number;
    itemName: string;
    diagnostic: Tier;
    animal: ScoringAnimal;
    credit: number;
  }[];
  /** The real animals behind the specimens: several for a wrong merge, otherwise one. */
  animals: ScoringAnimal[];
  /** Set when this name duplicates an older one for the same animal. */
  synonymOf: (NameRef & { sameGenus: boolean }) | null;
  /** Species points earned: only correct species that aren't junior synonyms earn any. */
  points: number;
}

export interface SynonymResult {
  junior: NameRef;
  senior: NameRef;
  animal: ScoringAnimal;
  sameGenus: boolean;
}

/**
 *  valid    - its holotype's species was verified
 *  dubious  - its holotype is still named in it, but that species could not be verified
 *             with certainty. Not a synonym, not invalid: just not considered valid
 *  synonym  - its holotype's species duplicates an older name in another genus
 *  invalid  - its holotype is no longer named within it; the name stays taken
 */
export type GenusStatus = 'valid' | 'dubious' | 'synonym' | 'invalid';

export interface GenusResult {
  genusId: number;
  name: string;
  status: GenusStatus;
  points: number;
  /** The species the holotype is named in, which decides the genus. Null if it has none. */
  holotypeTaxonId: number | null;
}

export interface LostFossil {
  specimenId: number;
  itemName: string;
  diagnostic: Tier;
  animal: ScoringAnimal;
  penalty: number;
}

export interface ScoreReport {
  score: number;
  money: number;
  breakdown: {
    specimenCredit: number;
    speciesPoints: number;
    genusPoints: number;
    moneyPoints: number;
    soldPenalty: number;
    wrongMergePenalty: number;
    duplicatePenalty: number;
  };
  species: SpeciesResult[];
  genera: GenusResult[];
  synonyms: SynonymResult[];
  lostFossils: LostFossil[];
  /** Owned fossils the player never named. */
  unnamedFossils: { specimenId: number; itemName: string; animal: ScoringAnimal }[];
}

/* -------------------------------- the scoring ------------------------------- */

interface Fossil {
  id: number;
  status: 'owned' | 'sold';
  taxonId: number | null;
  itemName: string;
  animalId: number;
  diagnostic: Tier;
}

function asFossil(s: ScoringSpecimen): Fossil | null {
  const { kind, animalId, diagnostic, name } = s.item;
  if (kind !== 'fossil' || animalId === null || diagnostic === null) return null;
  return {
    id: s.id,
    status: s.status,
    taxonId: s.taxonId,
    itemName: name,
    animalId,
    diagnostic,
  };
}

export function scoreGame(input: ScoringInput): ScoreReport {
  const animalById = new Map(input.animals.map((a) => [a.id, a]));
  const animalRef = (id: number): ScoringAnimal =>
    animalById.get(id) ?? { id, genus: 'Unknown', species: 'animal' };

  const specimenById = new Map(input.specimens.map((s) => [s.id, s]));
  const taxonById = new Map(input.taxa.map((t) => [t.id, t]));
  const genusById = new Map(input.genera.map((g) => [g.id, g]));

  // A genus is valid exactly when its holotype is currently named within it.
  const validGenusIds = new Set<number>();
  for (const genus of input.genera) {
    const holotype = specimenById.get(genus.holotypeSpecimenId);
    const holotypeTaxon =
      holotype && holotype.taxonId !== null ? taxonById.get(holotype.taxonId) : undefined;
    if (holotypeTaxon && holotypeTaxon.genusId === genus.id) {
      validGenusIds.add(genus.id);
    }
  }

  // Sort every fossil into one bucket.
  interface Group {
    taxon: ScoringTaxon;
    genus: ScoringGenus;
    members: Fossil[];
  }
  const groups = new Map<number, Group>();
  const lostFossils: LostFossil[] = [];
  const unnamedFossils: ScoreReport['unnamedFossils'] = [];

  for (const specimen of input.specimens) {
    const fossil = asFossil(specimen);
    if (!fossil) continue; // rocks and gems never affect the science score

    if (fossil.status === 'sold') {
      lostFossils.push({
        specimenId: fossil.id,
        itemName: fossil.itemName,
        diagnostic: fossil.diagnostic,
        animal: animalRef(fossil.animalId),
        penalty: SCORING.soldPenalty[fossil.diagnostic],
      });
      continue;
    }

    const taxon = fossil.taxonId !== null ? taxonById.get(fossil.taxonId) : undefined;
    const genus = taxon ? genusById.get(taxon.genusId) : undefined;
    if (!taxon || !genus) {
      unnamedFossils.push({
        specimenId: fossil.id,
        itemName: fossil.itemName,
        animal: animalRef(fossil.animalId),
      });
      continue;
    }

    // Species under an invalid genus are still species, so they're judged like any other.
    const group = groups.get(taxon.id) ?? { taxon, genus, members: [] };
    groups.set(taxon.id, group);
    group.members.push(fossil);
  }

  // Judge each species.
  const judged: { result: SpeciesResult; createdAt: number }[] = [];
  for (const { taxon, genus, members } of groups.values()) {
    const animalIds = [...new Set(members.map((m) => m.animalId))];
    const hasDiagnostic = members.some((m) => m.diagnostic === 'high');

    let verdict: SpeciesVerdict;
    if (animalIds.length > 1) verdict = 'wrong_merge';
    else if (hasDiagnostic || members.length >= 2) verdict = 'correct';
    else verdict = 'dubious';

    judged.push({
      createdAt: taxon.createdAt.getTime(),
      result: {
        taxonId: taxon.id,
        genusId: genus.id,
        genusValid: false, // set once the genera have been judged
        genus: genus.name,
        species: taxon.speciesName,
        verdict,
        hasDiagnostic,
        specimens: members.map((m) => ({
          id: m.id,
          itemName: m.itemName,
          diagnostic: m.diagnostic,
          animal: animalRef(m.animalId),
          credit: verdict === 'correct' ? SCORING.credit[m.diagnostic] : 0,
        })),
        animals: animalIds.map(animalRef),
        synonymOf: null,
        points: 0, // filled in once synonyms are known
      },
    });
  }

  // Synonymy: among correct species of the same animal, the oldest name wins.
  const byAge = (a: { result: SpeciesResult; createdAt: number }, b: typeof a) =>
    a.createdAt - b.createdAt || a.result.taxonId - b.result.taxonId;

  const correctByAnimal = new Map<number, typeof judged>();
  for (const entry of judged) {
    if (entry.result.verdict !== 'correct') continue;
    const animalId = entry.result.animals[0].id;
    const list = correctByAnimal.get(animalId) ?? [];
    correctByAnimal.set(animalId, list);
    list.push(entry);
  }

  const synonyms: SynonymResult[] = [];
  for (const list of correctByAnimal.values()) {
    if (list.length < 2) continue;
    list.sort(byAge);
    const [senior, ...juniors] = list;
    for (const junior of juniors) {
      const sameGenus = junior.result.genusId === senior.result.genusId;
      const seniorRef: NameRef = {
        taxonId: senior.result.taxonId,
        genus: senior.result.genus,
        species: senior.result.species,
      };
      junior.result.synonymOf = { ...seniorRef, sameGenus };
      synonyms.push({
        junior: {
          taxonId: junior.result.taxonId,
          genus: junior.result.genus,
          species: junior.result.species,
        },
        senior: seniorRef,
        animal: senior.result.animals[0],
        sameGenus,
      });
    }
  }

  const species = judged.sort(byAge).map((e) => e.result);

  // Species points: correct species that aren't junior synonyms.
  for (const sp of species) {
    if (sp.verdict === 'correct' && sp.synonymOf === null) sp.points = SCORING.speciesPoints;
  }

  // Genera. Each one is judged by the species its holotype is named in.
  const speciesByTaxonId = new Map(species.map((sp) => [sp.taxonId, sp]));

  const genera: GenusResult[] = [...input.genera]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
    .map((g): GenusResult => {
      // The holotype left (moved, unnamed or sold): the name stays taken but has no ground.
      if (!validGenusIds.has(g.id)) {
        return { genusId: g.id, name: g.name, status: 'invalid', points: 0, holotypeTaxonId: null };
      }

      const holotype = specimenById.get(g.holotypeSpecimenId);
      const holotypeTaxonId = holotype?.taxonId ?? null;
      const holotypeSpecies =
        holotypeTaxonId !== null ? speciesByTaxonId.get(holotypeTaxonId) : undefined;

      let status: GenusStatus;
      if (!holotypeSpecies || holotypeSpecies.verdict !== 'correct') {
        // Nothing verifies the species the genus is built on, so nothing else in it can rescue it.
        status = 'dubious';
      } else if (holotypeSpecies.synonymOf && !holotypeSpecies.synonymOf.sameGenus) {
        // Its founding species is just another name for an animal in an older genus.
        status = 'synonym';
      } else {
        // Either a verified species, or a junior synonym of an older species in this same genus,
        // which still stands on that older species.
        status = 'valid';
      }

      return {
        genusId: g.id,
        name: g.name,
        status,
        points: status === 'valid' ? SCORING.genusPoints : 0,
        holotypeTaxonId,
      };
    });

  // Now that every genus is judged, tell each species whether its genus is valid.
  const genusStatusById = new Map(genera.map((g) => [g.genusId, g.status]));
  for (const sp of species) {
    sp.genusValid = genusStatusById.get(sp.genusId) === 'valid';
  }

  // Totals.
  const specimenCredit = species.reduce(
    (sum, sp) => sum + sp.specimens.reduce((n, s) => n + s.credit, 0),
    0,
  );
  const speciesPoints = species.reduce((sum, sp) => sum + sp.points, 0);
  const genusPoints = genera.reduce((sum, g) => sum + g.points, 0);
  const wrongMergePenalty =
    species.filter((sp) => sp.verdict === 'wrong_merge').length * SCORING.wrongMergePenalty;
  const duplicatePenalty = synonyms.length * SCORING.duplicatePenalty;
  const soldPenalty = lostFossils.reduce((sum, f) => sum + f.penalty, 0);
  const moneyPoints = Math.floor(Math.max(0, input.balance) / SCORING.moneyDivisor);

  const score = Math.max(
    0,
    specimenCredit +
      speciesPoints +
      genusPoints +
      moneyPoints -
      soldPenalty -
      wrongMergePenalty -
      duplicatePenalty,
  );

  return {
    score,
    money: input.balance,
    breakdown: {
      specimenCredit,
      speciesPoints,
      genusPoints,
      moneyPoints,
      soldPenalty,
      wrongMergePenalty,
      duplicatePenalty,
    },
    species,
    genera,
    synonyms,
    lostFossils,
    unnamedFossils,
  };
}