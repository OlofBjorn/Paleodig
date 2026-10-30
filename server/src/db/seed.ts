import { sql } from 'drizzle-orm';
import { db } from './index'; // adjust if your db export is named differently
import { animals, digSites, itemTypes, siteSpawns } from './schema';

/**
 * Placeholder seed data. Each item's image is <slug of its name>.png; until that file exists
 * the client shows a coloured fallback tile.
 *
 * Built to exercise every end-game outcome:
 *  - Same animal described twice (synonymy): every animal has 2+ distinct fossils,
 *    so a player can name two of them as different genera.
 *  - Wrong merge: Tyrannosaurus, Triceratops and Velociraptor have femurs with
 *    deliberately near-identical descriptions.
 *  - Uncertain: Velociraptor has no "high" diagnostic fossil, so even a correct
 *    grouping can never be confirmed.
 */

type Tier = 'high' | 'medium' | 'low';
type Size = 'small' | 'medium' | 'large';

const TIER_VALUE: Record<Tier, number> = { high: 120, medium: 60, low: 25 };
const SIZE_MULTIPLIER: Record<Size, number> = { small: 1, medium: 1.5, large: 2 };
const TIER_WEIGHT: Record<Tier, number> = { high: 2, medium: 4, low: 6 }; // rarer = more diagnostic

// "Heavy Limb Bone" -> "heavy-limb-bone". Image files are client/public/images/items/<slug>.png
const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const animalData = [
  { genus: 'Tyrannosaurus', species: 'rex' },
  { genus: 'Triceratops', species: 'horridus' },
  { genus: 'Stegosaurus', species: 'stenops' },
  { genus: 'Parasaurolophus', species: 'walkeri' },
  { genus: 'Velociraptor', species: 'mongoliensis' },
];

const fossilData: {
  animal: string; // matches animalData.genus
  boneType: string;
  diagnostic: Tier;
  size: Size;
  name: string;
  description: string;
}[] = [
  // Tyrannosaurus
  { animal: 'Tyrannosaurus', boneType: 'skull', diagnostic: 'high', size: 'large', name: 'Massive Skull', description: 'A huge, deep skull with a robust snout and sockets for enormous teeth.' },
  { animal: 'Tyrannosaurus', boneType: 'arm', diagnostic: 'medium', size: 'small', name: 'Tiny Forelimb', description: 'A strangely small, powerful arm ending in two clawed fingers.' },
  { animal: 'Tyrannosaurus', boneType: 'tooth', diagnostic: 'medium', size: 'small', name: 'Thick Serrated Tooth', description: 'A thick, banana-shaped tooth with coarse serrations along its edges.' },
  { animal: 'Tyrannosaurus', boneType: 'femur', diagnostic: 'low', size: 'large', name: 'Heavy Limb Bone', description: 'A heavy, straight limb bone with a thick shaft.' },

  // Triceratops
  { animal: 'Triceratops', boneType: 'skull', diagnostic: 'high', size: 'large', name: 'Horned Frill Skull', description: 'A giant skull with a wide bony frill and sockets for three facial horns.' },
  { animal: 'Triceratops', boneType: 'horn', diagnostic: 'medium', size: 'medium', name: 'Curved Horn Core', description: 'A long, curved, conical bone that was once sheathed in horn.' },
  { animal: 'Triceratops', boneType: 'femur', diagnostic: 'low', size: 'large', name: 'Stout Limb Bone', description: 'A heavy, straight limb bone with a thick shaft.' },
  { animal: 'Triceratops', boneType: 'rib', diagnostic: 'low', size: 'medium', name: 'Broad Rib', description: 'A long, curved rib, broad and strongly built.' },

  // Stegosaurus
  { animal: 'Stegosaurus', boneType: 'plate', diagnostic: 'high', size: 'large', name: 'Diamond Plate', description: 'A broad, thin, diamond-shaped plate of bone with a rough surface.' },
  { animal: 'Stegosaurus', boneType: 'spike', diagnostic: 'medium', size: 'medium', name: 'Tail Spike', description: 'A long, pointed spike of bone with a hollow base.' },
  { animal: 'Stegosaurus', boneType: 'femur', diagnostic: 'low', size: 'large', name: 'Columnar Limb Bone', description: 'A tall, straight, pillar-like limb bone.' },

  // Parasaurolophus
  { animal: 'Parasaurolophus', boneType: 'skull', diagnostic: 'high', size: 'large', name: 'Crested Skull', description: 'A long skull with a hollow, backward-sweeping tube of bone on top.' },
  { animal: 'Parasaurolophus', boneType: 'jaw', diagnostic: 'medium', size: 'medium', name: 'Many-Toothed Jaw', description: 'A broad jaw packed with hundreds of tiny grinding teeth.' },
  { animal: 'Parasaurolophus', boneType: 'vertebra', diagnostic: 'low', size: 'medium', name: 'Spined Vertebra', description: 'A backbone segment with a tall spine on top.' },

  // Velociraptor (no "high" diagnostic fossil: always "uncertain" at best)
  { animal: 'Velociraptor', boneType: 'claw', diagnostic: 'medium', size: 'small', name: 'Sickle Claw', description: 'A strongly curved, razor-sharp claw from a foot.' },
  { animal: 'Velociraptor', boneType: 'femur', diagnostic: 'low', size: 'small', name: 'Slender Limb Bone', description: 'A straight limb bone with a thick shaft.' },
  { animal: 'Velociraptor', boneType: 'vertebra', diagnostic: 'low', size: 'small', name: 'Light Vertebra', description: 'A small, lightly built backbone segment.' },
];

const otherData: {
  kind: 'rock' | 'gem';
  name: string;
  description: string;
  size: Size;
  baseValue: number;
  weight: number;
}[] = [
  { kind: 'rock', name: 'Plain Sandstone', description: 'A lump of ordinary sandstone. Not a fossil.', size: 'medium', baseValue: 1, weight: 20 },
  { kind: 'rock', name: 'Limestone Slab', description: 'A flat grey slab. Looks promising, but empty.', size: 'medium', baseValue: 2, weight: 20 },
  { kind: 'rock', name: 'Ironstone Nodule', description: 'A rusty round stone. It looks a little like a bone at first glance.', size: 'small', baseValue: 3, weight: 20 },
  { kind: 'gem', name: 'Quartz Crystal', description: 'A clear, six-sided crystal. Not a fossil, but someone will pay for it.', size: 'small', baseValue: 40, weight: 4 },
  { kind: 'gem', name: 'Amber Nugget', description: 'A warm golden lump of fossil resin. Pretty, but not a bone.', size: 'small', baseValue: 80, weight: 2 },
];

// Which animals live where, and which gems turn up. Rocks appear everywhere.
// Overlaps are deliberate, so location is a clue but never proof:
//   Tyrannosaurus + Triceratops share only Red Badlands, Tyrannosaurus + Stegosaurus/Velociraptor
//   share only Sunbaked Dunes, and Triceratops is the only one of the three
//   ambiguous-femur animals at Muddy Riverbank.
const siteData = [
  {
    name: 'Red Badlands',
    description: 'Eroded red cliffs where the bones lie close to the surface.',
    digCost: 10,
    animals: ['Tyrannosaurus', 'Triceratops', 'Parasaurolophus'],
    gems: ['Quartz Crystal'],
  },
  {
    name: 'Muddy Riverbank',
    description: 'An ancient floodplain, thick with sediment and fossilised resin.',
    digCost: 10,
    animals: ['Triceratops', 'Stegosaurus', 'Parasaurolophus'],
    gems: ['Quartz Crystal', 'Amber Nugget'],
  },
  {
    name: 'Sunbaked Dunes',
    description: 'Wind-scoured dunes hiding old giants and small, swift hunters.',
    digCost: 10,
    animals: ['Tyrannosaurus', 'Stegosaurus', 'Velociraptor'],
    gems: ['Quartz Crystal'],
  },
];

async function seed() {
  // Dev-only: wipe catalog tables. CASCADE also clears specimens, genera and taxa.
  await db.execute(
    sql`truncate table site_spawns, dig_sites, item_types, animals restart identity cascade`,
  );

  await db.transaction(async (tx) => {
    const insertedAnimals = await tx
      .insert(animals)
      .values(animalData)
      .returning({ id: animals.id, genus: animals.genus });
    const animalIdByGenus = new Map(insertedAnimals.map((a) => [a.genus, a.id]));

    const fossilRows = fossilData.map((f) => ({
      kind: 'fossil' as const,
      name: f.name,
      description: f.description,
      image: `${slug(f.name)}.png`,
      size: f.size,
      baseValue: Math.round(TIER_VALUE[f.diagnostic] * SIZE_MULTIPLIER[f.size]),
      animalId: animalIdByGenus.get(f.animal)!,
      diagnostic: f.diagnostic,
      boneType: f.boneType,
    }));

    const otherRows = otherData.map((o) => ({
      kind: o.kind,
      name: o.name,
      description: o.description,
      image: `${slug(o.name)}.png`,
      size: o.size,
      baseValue: o.baseValue,
    }));

    const insertedFossils = await tx
      .insert(itemTypes)
      .values(fossilRows)
      .returning({ id: itemTypes.id, name: itemTypes.name });
    const insertedOthers = await tx
      .insert(itemTypes)
      .values(otherRows)
      .returning({ id: itemTypes.id, name: itemTypes.name });

    // Guard against typos: every animal and gem named in siteData must exist.
    const animalNames = new Set(animalData.map((a) => a.genus));
    const otherNames = new Set(otherData.map((o) => o.name));
    for (const site of siteData) {
      for (const a of site.animals) {
        if (!animalNames.has(a)) throw new Error(`siteData: unknown animal "${a}" at ${site.name}`);
      }
      for (const g of site.gems) {
        if (!otherNames.has(g)) throw new Error(`siteData: unknown gem "${g}" at ${site.name}`);
      }
    }

    const insertedSites = await tx
      .insert(digSites)
      .values(
        siteData.map((site) => ({
          name: site.name,
          description: site.description,
          image: `${slug(site.name)}.png`, // client/public/images/sites/<slug>.png
          digCost: site.digCost,
        })),
      )
      .returning({ id: digSites.id, name: digSites.name });
    const siteIdByName = new Map(insertedSites.map((s) => [s.name, s.id]));

    // Weights are placeholders for the Sprint 5 balance pass.
    const fossilIdByName = new Map(insertedFossils.map((f) => [f.name, f.id]));
    const otherIdByName = new Map(insertedOthers.map((o) => [o.name, o.id]));

    const spawnRows = siteData.flatMap((site) => {
      const siteId = siteIdByName.get(site.name)!;

      const fossils = fossilData
        .filter((f) => site.animals.includes(f.animal))
        .map((f) => ({
          siteId,
          itemTypeId: fossilIdByName.get(f.name)!,
          weight: TIER_WEIGHT[f.diagnostic],
        }));

      const others = otherData
        .filter((o) => o.kind === 'rock' || site.gems.includes(o.name))
        .map((o) => ({ siteId, itemTypeId: otherIdByName.get(o.name)!, weight: o.weight }));

      return [...fossils, ...others];
    });
    await tx.insert(siteSpawns).values(spawnRows);
  });

  console.log(
    `Seeded ${animalData.length} animals, ${fossilData.length} fossils, ${otherData.length} other items, ${siteData.length} dig sites.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });