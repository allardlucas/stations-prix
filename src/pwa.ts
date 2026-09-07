export const APP_BASE = "/stations-prix/";

export function serviceWorkerUrl(base: string): string {
  return `${base}sw.js`;
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) {
    return;
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  void navigator.serviceWorker.register(serviceWorkerUrl(import.meta.env.BASE_URL), {
    scope: import.meta.env.BASE_URL,
  });
}
