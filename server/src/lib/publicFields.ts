import { itemTypes } from '../db/schema.js';

/**
 * The only item columns the client ever sees. animalId and diagnostic are the hidden
 * answers, so always select items through this object, never with a bare select().
 */
export const publicItemFields = {
  id: itemTypes.id,
  kind: itemTypes.kind,
  name: itemTypes.name,
  description: itemTypes.description,
  image: itemTypes.image,
  size: itemTypes.size,
  baseValue: itemTypes.baseValue,
};