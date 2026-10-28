import { save, persist } from './save';

// المتجر: ترقيات الضغط، الصابون، ورأس التوربو. كل شيء يُشترى مرة واحدة.

export type ItemId = 'power1' | 'power2' | 'power3' | 'soap' | 'turbo';

export interface ShopItem { id: ItemId; price: number; requires?: ItemId; icon: string }

export const ITEMS: ShopItem[] = [
  { id: 'soap', price: 250, icon: '🫧' },
  { id: 'power1', price: 300, icon: '⚡' },
  { id: 'power2', price: 750, requires: 'power1', icon: '⚡⚡' },
  { id: 'turbo', price: 900, icon: '🌀' },
  { id: 'power3', price: 1600, requires: 'power2', icon: '⚡⚡⚡' },
];

export const has = (id: ItemId) => save.owned.includes(id);

/** مضاعف قوة التنظيف حسب ترقيات المضخّة */
export function powerMul() {
  return has('power3') ? 2.2 : has('power2') ? 1.75 : has('power1') ? 1.35 : 1;
}

/** ضغط الشاشة الرقمية في الرشّاش (BAR) */
export function maxBar() {
  return Math.round(150 * powerMul());
}

export function buy(id: ItemId): 'ok' | 'owned' | 'locked' | 'money' {
  const it = ITEMS.find((i) => i.id === id)!;
  if (has(id)) return 'owned';
  if (it.requires && !has(it.requires)) return 'locked';
  if (save.coins < it.price) return 'money';
  save.coins -= it.price;
  save.owned.push(id);
  persist();
  return 'ok';
}
