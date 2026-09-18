// Web Push subscription helpers — Android Chrome works directly; iOS Safari
// requires the PWA to be installed (Add to Home Screen) on iOS 16.4+.

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window.PushManager !== 'undefined'
    && typeof window.Notification !== 'undefined';
}

export function pushPermission() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Requests permission (if needed) and subscribes this device. Must run from a click handler. */
export async function subscribePush(publicKey) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!publicKey) return { ok: false, reason: 'not_configured' };
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  return { ok: true, subscription: sub.toJSON() };
}

export async function unsubscribePush() {
  if (!pushSupported()) return { ok: true, endpoint: null };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true, endpoint: null };
  const { endpoint } = sub;
  await sub.unsubscribe();
  return { ok: true, endpoint };
}
