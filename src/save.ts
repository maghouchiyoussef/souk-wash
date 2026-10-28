import { Preferences } from '@capacitor/preferences';

// حفظ التقدّم على الهاتف (Capacitor Preferences، وعلى المتصفّح localStorage).

export type Lang = 'ar' | 'fr' | 'en';

export interface SaveData {
  coins: number;
  stars: Record<string, number>;      // أفضل عدد نجوم لكل مستوى
  best: Record<string, number>;       // أفضل وقت بالثواني
  owned: string[];                    // أغراض المتجر المشتراة
  settings: { sound: boolean; music: boolean; haptics: boolean; sens: number; lang: Lang };
}

const KEY = 'lavage-mobile-save-v1';

export const save: SaveData = {
  coins: 0,
  stars: {},
  best: {},
  owned: [],
  settings: { sound: true, music: true, haptics: true, sens: 1, lang: 'ar' },
};

export async function loadSave() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      const d = JSON.parse(value) as Partial<SaveData>;
      Object.assign(save, d, { settings: { ...save.settings, ...(d.settings ?? {}) } });
    } else {
      // أول تشغيل: نختار اللغة حسب الهاتف
      const l = (navigator.language || 'ar').slice(0, 2);
      save.settings.lang = l === 'fr' ? 'fr' : l === 'en' ? 'en' : 'ar';
    }
  } catch { /* نبدأ من الصفر */ }
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => { Preferences.set({ key: KEY, value: JSON.stringify(save) }).catch(() => {}); }, 150);
}
