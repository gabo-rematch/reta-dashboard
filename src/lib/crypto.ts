export type Envelope = {
  v: 1;
  kdf: "pbkdf2-sha256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
};

export class DecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptError";
  }
}

export async function decryptEnvelope(
  env: Envelope,
  passphrase: string
): Promise<string> {
  if (env.v !== 1 || env.kdf !== "pbkdf2-sha256") {
    throw new DecryptError("unsupported envelope");
  }

  try {
    const salt = b64urlToBytes(env.salt);
    const iv = b64urlToBytes(env.iv);
    const ct = b64urlToBytes(env.ct);
    const passphraseBytes = new TextEncoder().encode(passphrase);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      passphraseBytes,
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: salt as BufferSource,
        iterations: env.iter
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    try {
      const plaintextBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        ct as BufferSource
      );

      return new TextDecoder().decode(plaintextBuf);
    } catch {
      throw new DecryptError("wrong passphrase");
    }
  } catch (error) {
    if (error instanceof DecryptError) {
      throw error;
    }

    throw new DecryptError("could not decrypt envelope");
  }
}

function b64urlToBytes(s: string): Uint8Array {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${"=".repeat(padding)}`;

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    throw new DecryptError("invalid envelope");
  }
}
