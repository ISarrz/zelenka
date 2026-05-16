// Browser-side push registration helpers.
//
// On iOS Safari: requires the user to first install the PWA via "Add to Home
// Screen". Web Push only works inside the installed PWA on iOS 16.4+.

function urlBase64ToArrayBuffer(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const b = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  const out = new ArrayBuffer(raw.length);
  const view = new Uint8Array(out);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalonePWA(): boolean {
  // iOS Safari uses navigator.standalone; everything else exposes the same via
  // matchMedia.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((navigator as any).standalone) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export async function registerSw(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription> {
  const reg = await registerSw();
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('notifications denied');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
    });
  }
  return sub;
}

export async function unsubscribeFromPush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
