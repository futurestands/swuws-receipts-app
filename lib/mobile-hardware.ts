import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * UNIFIED MOBILE HARDWARE BRIDGE
 *
 * Provides detection and common patterns for interacting with physical
 * device hardware (Scanner, Printer, GPS).
 */

export const isNative = () => Capacitor.isNativePlatform();
export const isAndroid = () => Capacitor.getPlatform() === 'android';

let vibrationEnabled = true;

/**
 * Updates the local vibration preference.
 */
export function setVibrationPreference(enabled: boolean) {
  vibrationEnabled = enabled;
}

/**
 * Device Vibration for feedback (e.g. successful scan)
 */
export async function hapticFeedback() {
  if (!isNative() || !vibrationEnabled) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (err) {
    console.warn('Haptics not available', err);
  }
}

/**
 * URL Builder for mobile vs web
 */
export function getAssetPath(path: string) {
  if (isNative()) {
    // Assets are usually relative in native builds
    return path.startsWith('/') ? path.substring(1) : path;
  }
  return path;
}
