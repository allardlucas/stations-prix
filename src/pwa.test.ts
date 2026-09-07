import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_BASE, registerServiceWorker, serviceWorkerUrl } from "./pwa";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
};

type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
};

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function pngSize(rel: string): { width: number; height: number } {
  const buf = readFileSync(resolve(root, rel));
  expect(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
    true,
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function loadManifest(): Manifest {
  return JSON.parse(read("public/manifest.webmanifest")) as Manifest;
}

describe("PWA installability artifacts", () => {
  it("keeps Vite base on /stations-prix/", () => {
    expect(read("vite.config.ts")).toMatch(/base:\s*"\/stations-prix\/"/);
    expect(APP_BASE).toBe("/stations-prix/");
  });

  it("exposes a standalone manifest scoped to the Pages base", () => {
    const manifest = loadManifest();
    expect(manifest.name).toBe("Stations-prix");
    expect(manifest.short_name).toBe("Stations");
    expect(manifest.start_url).toBe(APP_BASE);
    expect(manifest.scope).toBe(APP_BASE);
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#0b0d10");
    expect(manifest.background_color).toBe("#0b0d10");
  });

  it("ships 192 and 512 PNG icons under the same base", () => {
    const icons = loadManifest().icons;
    const bySize = Object.fromEntries(icons.map((icon) => [icon.sizes, icon]));
    expect(bySize["192x192"]?.src).toBe("/stations-prix/icons/icon-192.png");
    expect(bySize["512x512"]?.src).toBe("/stations-prix/icons/icon-512.png");
    expect(bySize["192x192"]?.type).toBe("image/png");
    expect(bySize["512x512"]?.type).toBe("image/png");
    expect(pngSize("public/icons/icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("public/icons/icon-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("public/icons/apple-touch-icon.png")).toEqual({
      width: 180,
      height: 180,
    });
  });

  it("links install tags in index.html with Vite-root paths", () => {
    const html = read("index.html");
    expect(html).toContain('name="viewport"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
  });

  it("registers the SW under the Vite base and does not cache ODS or tiles", () => {
    expect(serviceWorkerUrl(APP_BASE)).toBe("/stations-prix/sw.js");
    const sw = read("public/sw.js");
    expect(sw).toMatch(/skipWaiting/);
    expect(sw).toMatch(/clients\.claim/);
    expect(sw).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(sw).not.toMatch(/\bcaches\b/);
  });

  it("does not register a service worker outside production", () => {
    expect(import.meta.env.PROD).toBe(false);
    expect(() => registerServiceWorker()).not.toThrow();
  });
});
