import { save, Lang } from './save';

// النصوص بثلاث لغات. العربية من اليمين لليسار.

const ar = {
  title: 'لافاج موبيل',
  tagline: 'غسيل متنقّل في كل الحومة',
  play: 'العب',
  shop: 'المتجر',
  settings: 'الإعدادات',
  levels: 'المهمّات',
  back: 'رجوع',
  locked: 'مقفول',
  howto: 'الجويستيك يسار للمشي • اسحب يمين للنظر • اضغط مطوّلًا على زر الرش',
  clean: 'النظافة',
  narrow: 'ضيّق',
  wide: 'عريض',
  turbo: 'توربو',
  spray: 'رشّ',
  nozzle: 'الرأس',
  scan: 'مسح',
  height: 'الارتفاع',
  soap: 'صابون',
  water: 'ماء',
  rustHint: 'الصدأ عنيد! جرّب الرأس الضيّق أو الصابون 🎯',
  soapHint: 'رشّ الصابون ثم اشطفه بالماء 🫧',
  doneTitle: 'نظيف ويلمع! ✨',
  time: 'الوقت',
  earned: 'ربحت',
  next: 'التالي',
  again: 'أعد',
  map: 'المهمّات',
  pause: 'استراحة',
  resume: 'كمّل',
  quit: 'خروج للمهمّات',
  rotate: 'أدِر الهاتف أفقيًا',
  dh: 'درهم',
  buy: 'شراء',
  owned: 'عندك',
  equip: 'مفعّل',
  notEnough: 'الدراهم ما كافياش',
  bought: 'تم الشراء! ✅',
  sound: 'الأصوات',
  music: 'الموسيقى',
  haptics: 'الاهتزاز',
  sens: 'حساسية الكاميرا',
  lang: 'اللغة',
  on: 'مشغّل',
  off: 'مطفأ',
  // المستويات
  l1: 'الطاكسي الصغير', l1p: 'الگراج',
  l2: 'الطاكسي الكبير', l2p: 'زنقة في الحومة',
  l3: 'النقل المدرسي', l3p: 'أمام مدرسة خاصة',
  l4: 'الكاميو', l4p: 'محطة الوقود',
  l5: 'الرموك', l5p: 'أمام المستودع',
  // المتجر
  i_power1: 'ضغط +35%', i_power1d: 'مضخّة أقوى: تنظيف أسرع',
  i_power2: 'ضغط +75%', i_power2d: 'مضخّة احترافية',
  i_power3: 'ضغط +120%', i_power3d: 'مضخّة صناعية',
  i_soap: 'صابون الرغوة', i_soapd: 'يذيب الطين والصدأ، ثم اشطفه بالماء',
  i_turbo: 'رأس توربو', i_turbod: 'قوي وعريض في نفس الوقت',
};

type Dict = typeof ar;
export type Key = keyof Dict;

const fr: Dict = {
  title: 'Lavage Mobile', tagline: 'Le lavage qui vient à vous', play: 'Jouer', shop: 'Boutique', settings: 'Réglages', levels: 'Missions',
  back: 'Retour', locked: 'Verrouillé', howto: 'Joystick à gauche pour marcher • glissez à droite pour regarder • maintenez le bouton pour arroser',
  clean: 'Propreté', narrow: 'Étroit', wide: 'Large', turbo: 'Turbo', spray: 'Arroser', nozzle: 'Buse', scan: 'Scanner', height: 'Hauteur',
  soap: 'Savon', water: 'Eau', rustHint: 'Rouille tenace ! Essayez la buse étroite ou le savon 🎯', soapHint: 'Mettez du savon puis rincez à l’eau 🫧',
  doneTitle: 'Propre et brillant ! ✨', time: 'Temps', earned: 'Gagné', next: 'Suivant', again: 'Rejouer', map: 'Missions', pause: 'Pause',
  resume: 'Continuer', quit: 'Retour aux missions', rotate: 'Tournez le téléphone en paysage', dh: 'DH', buy: 'Acheter', owned: 'Acquis',
  equip: 'Actif', notEnough: 'Pas assez de dirhams', bought: 'Acheté ! ✅', sound: 'Sons', music: 'Musique', haptics: 'Vibration',
  sens: 'Sensibilité caméra', lang: 'Langue', on: 'Oui', off: 'Non',
  l1: 'Petit taxi', l1p: 'Le garage', l2: 'Grand taxi', l2p: 'Rue du quartier', l3: 'Transport scolaire', l3p: 'Devant une école privée',
  l4: 'Camion', l4p: 'Station-service', l5: 'Semi-remorque', l5p: 'Devant le dépôt',
  i_power1: 'Pression +35 %', i_power1d: 'Pompe plus forte : nettoyage plus rapide', i_power2: 'Pression +75 %', i_power2d: 'Pompe professionnelle',
  i_power3: 'Pression +120 %', i_power3d: 'Pompe industrielle', i_soap: 'Savon moussant', i_soapd: 'Dissout boue et rouille, puis rincez',
  i_turbo: 'Buse turbo', i_turbod: 'Puissante et large à la fois',
};

const en: Dict = {
  title: 'Lavage Mobile', tagline: 'The car wash that comes to you', play: 'Play', shop: 'Shop', settings: 'Settings', levels: 'Jobs',
  back: 'Back', locked: 'Locked', howto: 'Left joystick to walk • drag right to look • hold the button to spray',
  clean: 'Clean', narrow: 'Narrow', wide: 'Wide', turbo: 'Turbo', spray: 'Spray', nozzle: 'Nozzle', scan: 'Scan', height: 'Height',
  soap: 'Soap', water: 'Water', rustHint: 'Stubborn rust! Try the narrow nozzle or soap 🎯', soapHint: 'Apply soap, then rinse with water 🫧',
  doneTitle: 'Spotless! ✨', time: 'Time', earned: 'Earned', next: 'Next', again: 'Replay', map: 'Jobs', pause: 'Paused',
  resume: 'Resume', quit: 'Back to jobs', rotate: 'Rotate your phone to landscape', dh: 'DH', buy: 'Buy', owned: 'Owned',
  equip: 'Active', notEnough: 'Not enough dirhams', bought: 'Purchased! ✅', sound: 'Sound', music: 'Music', haptics: 'Vibration',
  sens: 'Camera sensitivity', lang: 'Language', on: 'On', off: 'Off',
  l1: 'Petit taxi', l1p: 'The garage', l2: 'Grand taxi', l2p: 'Neighborhood street', l3: 'School bus', l3p: 'In front of a private school',
  l4: 'Truck', l4p: 'Fuel station', l5: 'Semi-truck', l5p: 'In front of the depot',
  i_power1: 'Pressure +35%', i_power1d: 'Stronger pump: faster cleaning', i_power2: 'Pressure +75%', i_power2d: 'Professional pump',
  i_power3: 'Pressure +120%', i_power3d: 'Industrial pump', i_soap: 'Foam soap', i_soapd: 'Dissolves mud and rust, then rinse',
  i_turbo: 'Turbo nozzle', i_turbod: 'Powerful and wide at once',
};

const DICTS: Record<Lang, Dict> = { ar, fr, en };
export const t = (k: Key) => DICTS[save.settings.lang][k] ?? ar[k];

export function applyLang() {
  const l = save.settings.lang;
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t as Key); });
}
