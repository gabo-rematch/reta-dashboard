import { webcrypto } from "node:crypto";

type CryptoConstructor = new () => Crypto;

async function loadCrypto(): Promise<Crypto> {
  try {
    const dynamicImport = new Function(
      "specifier",
      "return import(specifier)"
    ) as (specifier: string) => Promise<{ Crypto: CryptoConstructor }>;
    const peculiar = await dynamicImport("@peculiar/webcrypto");

    return new peculiar.Crypto();
  } catch {
    return webcrypto as Crypto;
  }
}

const cryptoImpl = await loadCrypto();

Object.defineProperty(globalThis, "crypto", {
  value: cryptoImpl,
  configurable: true
});

if (globalThis.window) {
  Object.defineProperty(globalThis.window, "crypto", {
    value: cryptoImpl,
    configurable: true
  });
}

// jsdom in this Vitest config doesn't expose Web Storage; install minimal in-memory
// shims for `localStorage` and `sessionStorage` so the passphrase store can run.
class InMemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
}

function installStorage(name: "localStorage" | "sessionStorage"): void {
  const stub = new InMemoryStorage();
  Object.defineProperty(globalThis, name, { value: stub, configurable: true });
  if (globalThis.window) {
    Object.defineProperty(globalThis.window, name, { value: stub, configurable: true });
  }
}

installStorage("localStorage");
installStorage("sessionStorage");
