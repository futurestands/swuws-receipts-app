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

/**
 * NATIVE PRINT BRIDGE
 *
 * Capacitor WebViews do not support window.print(). This helper
 * branches to native printing (e.g. via Bluetooth thermal printers)
 * or provides a fallback for mobile users.
 */
export async function printReceiptNative(receiptId: string) {
  if (!isNative()) return;

  try {
    // TODO: Implement Bluetooth thermal printing using @capacitor-community/bluetooth-le
    // For now, we alert the user that native printing is in development
    // or we could attempt to open the system share dialog if the plugin was available.
    console.log(`Native print requested for receipt: ${receiptId}`);

    // Fallback: Notify user to use the web portal for printing until BLE is wired
    alert("Mobile printing (Bluetooth) is coming soon. Please use the web portal to print physical receipts.");
  } catch (err) {
    console.error('Native printing error', err);
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
