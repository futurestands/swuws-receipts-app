import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * UNIFIED MOBILE HARDWARE BRIDGE
 *
 * Provides detection and common patterns for interacting with physical
 * device hardware (Scanner, Printer, GPS).
 */

export const isNative = () => {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
};

export const isAndroid = () => {
  if (typeof window === 'undefined') return false;
  return Capacitor.getPlatform() === 'android';
};

/**
 * STATUS BAR CONFIGURATION
 *
 * Sets the system status bar style and color to match the app branding.
 * Should be called once on app initialization.
 */
export async function setupStatusBar() {
  if (!isNative()) return;

  try {
    // Style.Dark = White icons/text (best for dark backgrounds)
    // Style.Light = Dark icons/text (best for white/light backgrounds)
    await StatusBar.setStyle({ style: Style.Dark });

    // Official SWUWS Brand Blue
    await StatusBar.setBackgroundColor({ color: '#2C4A5E' });

    // Ensure it's visible (some devices hide it by default)
    await StatusBar.show();
  } catch (err) {
    console.warn('StatusBar configuration failed', err);
  }
}

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
