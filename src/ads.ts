import { AdMob, AdmobConsentStatus, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { isNative } from './native';

// الإعلانات (AdMob): إعلان بمكافأة لمضاعفة الدراهم، وإعلان بيني كل مهمّتين
// (ليس في أوّل دقيقتين). لا بانر أثناء اللعب. على المتصفّح لا يعمل أي شيء.
// الأكواد تأتي من ads-config.json (أكواد اختبار Google حتى يضع صاحب اللعبة أكواده).

interface Cfg { testMode: boolean; interstitialId: string; rewardedId: string }

const NO_INTERSTITIAL_BEFORE_MS = 2 * 60 * 1000;
const INTERSTITIAL_EVERY = 2;

let cfg: Cfg | null = null;
let ready = false;
let interstitialLoaded = false;
let rewardedLoaded = false;
let privacyRequired = false;
let levelsSinceAd = 0;
const startedAt = Date.now();

async function loadConfig(): Promise<Cfg | null> {
  try {
    const r = await fetch('js/ads-config.json');
    return r.ok ? ((await r.json()) as Cfg) : null;
  } catch { return null; }
}

export async function initAds(): Promise<void> {
  if (!isNative) return;
  cfg = await loadConfig();
  if (!cfg) return;
  try {
    await AdMob.initialize({ initializeForTesting: cfg.testMode });
    // موافقة المستخدم (GDPR / UMP): النافذة تظهر فقط حيث يلزم القانون (أوروبا وغيرها)
    try {
      let info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) info = await AdMob.showConsentForm();
      privacyRequired = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
      if (info.canRequestAds === false) return;
    } catch { /* نكمل حتى إن فشلت الموافقة */ }

    AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => { interstitialLoaded = false; loadInterstitial(); });
    AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => { interstitialLoaded = false; });
    AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => { rewardedLoaded = false; });
    ready = true;
    loadInterstitial();
    loadRewarded();
  } catch { ready = false; }
}

async function loadInterstitial() {
  if (!ready || !cfg) return;
  try { await AdMob.prepareInterstitial({ adId: cfg.interstitialId, isTesting: cfg.testMode }); interstitialLoaded = true; }
  catch { interstitialLoaded = false; }
}

async function loadRewarded() {
  if (!ready || !cfg) return;
  try { await AdMob.prepareRewardVideoAd({ adId: cfg.rewardedId, isTesting: cfg.testMode }); rewardedLoaded = true; }
  catch { rewardedLoaded = false; }
}

/** هل يوجد إعلان بمكافأة جاهز الآن؟ (لإظهار زر «ضاعف الدراهم») */
export const rewardedReady = () => ready && rewardedLoaded;

/** يعرض الإعلان بمكافأة. يرجع true إذا أكمل المستخدم المشاهدة واستحقّ المكافأة. */
export async function showRewarded(): Promise<boolean> {
  if (!rewardedReady()) return false;
  rewardedLoaded = false;
  try {
    const item = await AdMob.showRewardVideoAd();
    return !!item;
  } catch { return false; }
  finally { loadRewarded(); }
}

/** يُستدعى عند نهاية كل مهمّة. يعرض إعلانًا بينيًا كل مهمّتين، وليس في أوّل دقيقتين. */
export async function maybeInterstitial(): Promise<void> {
  levelsSinceAd++;
  if (!ready || !interstitialLoaded) return;
  if (Date.now() - startedAt < NO_INTERSTITIAL_BEFORE_MS) return;
  if (levelsSinceAd < INTERSTITIAL_EVERY) return;
  levelsSinceAd = 0;
  interstitialLoaded = false;
  try { await AdMob.showInterstitial(); } catch { loadInterstitial(); }
}

/** زر «خيارات الخصوصية» في الإعدادات يظهر فقط حين يلزم (أوروبا). */
export const privacyOptionsRequired = () => privacyRequired;
export async function showPrivacyOptions() {
  try { await AdMob.showPrivacyOptionsForm(); } catch { /* */ }
}
