const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? 'https://paleodig.vercel.app' : 'http://localhost:3000');

export type ItemKind = 'fossil' | 'rock' | 'gem';
export type ItemSize = 'small' | 'medium' | 'large';

/** What the server sends after a dig. Never includes the hidden animal or diagnostic data. */
export interface DugItem {
  id: number;
  kind: ItemKind;
  name: string;
  description: string;
  image: string;
  size: ItemSize;
  baseValue: number;
}

export async function dig(): Promise<DugItem> {
  const res = await fetch(`${API_URL}/api/dig`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { item: DugItem };
  return data.item;
}