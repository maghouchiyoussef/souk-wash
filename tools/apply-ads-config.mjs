// يقرأ ads-config.json: يكتب معرّف التطبيق في Android، وينسخ الإعدادات إلى www.
// يُشغَّل في GitHub Actions قبل البناء (وأيضًا يمكن تشغيله محليًا).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('ads-config.json', 'utf8'));
for (const k of ['appId', 'interstitialId', 'rewardedId']) {
  if (!/^ca-app-pub-\d+[~/]\d+$/.test(cfg[k] ?? '')) throw new Error(`ads-config.json: ${k} غير صالح`);
}
const strings = 'android/app/src/main/res/values/strings.xml';
let xml = readFileSync(strings, 'utf8');
const line = `    <string name="admob_app_id">${cfg.appId}</string>`;
xml = /name="admob_app_id"/.test(xml) ? xml.replace(/ {4}<string name="admob_app_id">[^<]*<\/string>/, line) : xml.replace('</resources>', `${line}\n</resources>`);
writeFileSync(strings, xml);
const { testMode, interstitialId, rewardedId } = cfg;
mkdirSync('www/js', { recursive: true });
writeFileSync('www/js/ads-config.json', JSON.stringify({ testMode: !!testMode, interstitialId, rewardedId }));
console.log(`AdMob: ${testMode ? 'TEST' : 'LIVE'} app=${cfg.appId}`);
