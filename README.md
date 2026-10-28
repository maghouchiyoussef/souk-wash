# غسّال الحومة — Souk Wash

لعبة 3D بمنظور الشخص الأول: رشّاش ماء مضغوط وأشياء مغربية متّسخة حتى تلمع.
ويب (Three.js + TypeScript) داخل Capacitor 8 → Android. المعرّف: `com.devfoxmy.soukwash`.

## التجربة على الهاتف
كل push يبني تلقائيًا عبر GitHub Actions وينشر في فرع `builds`:
- APK للتجربة: https://github.com/maghouchiyoussef/souk-wash/raw/builds/app-debug.apk
- AAB غير موقّع: https://github.com/maghouchiyoussef/souk-wash/raw/builds/app-unsigned.aab

## البنية
- `src/` كود اللعبة (TypeScript) — يُجمَّع بـ esbuild إلى `www/js/game.js` داخل CI.
  - `volume.ts` نظام الوسخ: قناع ثلاثي الأبعاد (voxels) يغلّف النموذج + shader
  - `taxi.ts` الطاكسي · `world.ts` الگراج (صور Canva في `www/img/garage/`) · `spray.ts` الرشّاش والجزيئات
  - `player.ts` / `input.ts` التحكّم · `audio.ts` الأصوات المولّدة · `native.ts` إضافات Capacitor
- `www/` الواجهة (عربية RTL، خط IBM Plex Sans Arabic)
- `android/` مشروع Capacitor (targetSdk/compileSdk 36، minSdk 24)
- `tools/make_icons.py` يولّد الأيقونات وشاشة البداية

## التحكّم
جويستيك يسار للمشي · سحب يمين للنظر · زر الرش (اضغط مطوّلًا، ويمكن السحب عليه للنظر أيضًا) ·
زر الرأس (عريض/ضيّق — الضيّق وحده يزيل الصدأ) · زر المسح (يُظهر الوسخ المتبقّي) · زر الارتفاع.
على الحاسوب: WASD + سحب بالفأرة + المسافة للرش، Q للرأس، E للمسح، C للارتفاع.
