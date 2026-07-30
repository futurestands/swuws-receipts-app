import { Capacitor } from '@capacitor/core';

/**
 * UNIFIED MOBILE HARDWARE BRIDGE
 *
 * Provides detection and common patterns for interacting with physical
 * device hardware (Scanner, Printer, GPS).
 */

export const isNative = () => Capacitor.isNativePlatform();
export const isAndroid = () => Capacitor.getPlatform() === 'android';

/**
 * Device Vibration for feedback (e.g. successful scan)
 */
export async function hapticFeedback() {
  if (!isNative()) return;
  // Note: Needs @capacitor/haptics if we want real vibration
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
