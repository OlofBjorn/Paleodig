import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const itemKind = pgEnum('item_kind', ['fossil', 'rock', 'gem']);
export const itemSize = pgEnum('item_size', ['small', 'medium', 'large']);
export const diagnosticTier = pgEnum('diagnostic_tier', ['high', 'medium', 'low']);
export const specimenStatus = pgEnum('specimen_status', ['owned', 'sold']);

/* -------------------------------------------------------------------------- */
/* Seeded catalog (identical for every player)                                */
/* -------------------------------------------------------------------------- */

/** The hidden truth. Never send this table (or itemTypes.animalId) to the client before the end game. */
export const animals = pgTable(
  'animals',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    genus: text('genus').notNull(),
    species: text('species').notNull(),
  },
  (t) => [unique('animals_genus_species_unique').on(t.genus, t.species)],
);

export const itemTypes = pgTable(
  'item_types',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    kind: itemKind('kind').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    image: text('image').notNull(),
    size: itemSize('size').notNull(),
    baseValue: integer('base_value').notNull(),
    // Fossil-only fields. Null for rocks and gems.
    animalId: integer('animal_id').references(() => animals.id),
    diagnostic: diagnosticTier('diagnostic'),
    boneType: text('bone_type'), // 'skull', 'femur', 'tooth', ...
  },
  (t) => [
    check('item_types_base_value_nonneg', sql`${t.baseValue} >= 0`),
    // Fossils must have an animal and a diagnostic tier; everything else must have neither.
    check(
      'item_types_fossil_fields',
      sql`(${t.kind} = 'fossil' and ${t.animalId} is not null and ${t.diagnostic} is not null)
        or (${t.kind} <> 'fossil' and ${t.animalId} is null and ${t.diagnostic} is null)`,
    ),
  ],
);

export const digSites = pgTable('dig_sites', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  digCost: integer('dig_cost').notNull(),
});

/** Weighted random drops. Layers later = one extra column here. */
export const siteSpawns = pgTable(
  'site_spawns',
  {
    siteId: integer('site_id')
      .notNull()
      .references(() => digSites.id, { onDelete: 'cascade' }),
    itemTypeId: integer('item_type_id')
      .notNull()
      .references(() => itemTypes.id, { onDelete: 'cascade' }),
    weight: integer('weight').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.itemTypeId] }),
    check('site_spawns_weight_positive', sql`${t.weight} > 0`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Per-player state                                                           */
/* -------------------------------------------------------------------------- */

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(), // the UUID kept in localStorage
    name: text('name').notNull(), // entered at the start, used in the epilogue text
    balance: integer('balance').notNull().default(100), // placeholder starting money
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    finalScore: integer('final_score'),
  },
  (t) => [
    check('players_balance_nonneg', sql`${t.balance} >= 0`),
    check('players_name_length', sql`char_length(${t.name}) between 1 and 40`),
  ],
);

/** One row per thing the player has dug up. Sold rows are kept for scoring. */
export const specimens = pgTable(
  'specimens',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    itemTypeId: integer('item_type_id')
      .notNull()
      .references(() => itemTypes.id),
    status: specimenStatus('status').notNull().default('owned'),
    // The species this specimen is currently assigned to. Null = unnamed.
    taxonId: integer('taxon_id').references((): AnyPgColumn => taxa.id, {
      onDelete: 'set null',
    }),
    foundAt: timestamp('found_at', { withTimezone: true }).notNull().defaultNow(),
    soldAt: timestamp('sold_at', { withTimezone: true }),
  },
  (t) => [
    index('specimens_player_idx').on(t.playerId),
    index('specimens_taxon_idx').on(t.taxonId),
    // A sold specimen can't be named, and sold_at is set exactly when status = 'sold'.
    check('specimens_sold_not_named', sql`${t.status} <> 'sold' or ${t.taxonId} is null`),
    check('specimens_sold_at_matches', sql`(${t.status} = 'sold') = (${t.soldAt} is not null)`),
  ],
);

/**
 * A genus name, permanently tied to its holotype.
 * Rows are never deleted, so an invalid genus keeps holding its name.
 * Validity is derived (see taxonomy.ts), not stored.
 */
export const genera = pgTable(
  'genera',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    holotypeSpecimenId: integer('holotype_specimen_id')
      .notNull()
      .references((): AnyPgColumn => specimens.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('genera_player_name_unique').on(t.playerId, t.name)],
);

/** A species within a genus: "Toothosaurus rex". */
export const taxa = pgTable(
  'taxa',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    genusId: integer('genus_id')
      .notNull()
      .references(() => genera.id, { onDelete: 'cascade' }),
    speciesName: text('species_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('taxa_genus_species_unique').on(t.genusId, t.speciesName)],
);

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Animal = typeof animals.$inferSelect;
export type ItemType = typeof itemTypes.$inferSelect;
export type DigSite = typeof digSites.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Specimen = typeof specimens.$inferSelect;
export type Genus = typeof genera.$inferSelect;
export type Taxon = typeof taxa.$inferSelect;