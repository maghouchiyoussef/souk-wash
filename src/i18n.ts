// النصوص. العربية الآن، والفرنسية والإنجليزية تأتي في المرحلة الثانية.

const ar = {
  title: 'غسّال الحومة',
  subtitle: 'المستوى 1 — الطاكسي الصغير',
  tapToStart: 'اضغط للبدء',
  howto: 'الجويستيك يسار للمشي • اسحب يمين للنظر • اضغط مطوّلًا على زر الرش',
  clean: 'النظافة',
  narrow: 'ضيّق',
  wide: 'عريض',
  spray: 'رشّ',
  nozzle: 'الرأس',
  scan: 'مسح',
  height: 'الارتفاع',
  rustHint: 'الصدأ عنيد! جرّب الرأس الضيّق 🎯',
  partDone: 'يلمع! ✨',
  doneTitle: 'نظيف ويلمع! ✨',
  time: 'الوقت',
  again: 'العب مرة أخرى',
  rotate: 'أدِر الهاتف أفقيًا',
};

export type Key = keyof typeof ar;
export const t = (k: Key) => ar[k];
