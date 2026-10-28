import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';

// طبقة رقيقة فوق إضافات Capacitor. على المتصفّح لا تفعل شيئًا.

export const isNative = Capacitor.isNativePlatform();

export async function nativeReady(onBack: () => void) {
  if (!isNative) return;
  try { await StatusBar.hide(); } catch { /* */ }
  try { await SplashScreen.hide(); } catch { /* */ }
  App.addListener('backButton', onBack);
}

export function hapticLight() {
  if (isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  else navigator.vibrate?.(15);
}

export function hapticSuccess() {
  if (isNative) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else navigator.vibrate?.([20, 60, 30]);
}

export function minimize() {
  if (isNative) App.minimizeApp().catch(() => {});
}
