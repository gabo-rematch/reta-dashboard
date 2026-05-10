export type PushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const aes128GcmRecordSize = 4096;

export async function sendWebPush(
  subscription: PushSubscription,
  payload: string | Uint8Array,
  vapid: VapidConfig
): Promise<{ status: number; expired: boolean }> {
  const body = await encryptPayload(subscription, payload);
  const token = await createVapidJwt(subscription.endpoint, vapid);
  const headers = new Headers({
    Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: "2419200"
  });
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers,
    body
  });

  return {
    status: response.status,
    expired: response.status === 410
  };
}

async function encryptPayload(
  subscription: PushSubscription,
  payload: string | Uint8Array
): Promise<Bytes> {
  const receiverPublicKey = urlBase64ToBytes(subscription.keys.p256dh);
  const authSecret = urlBase64ToBytes(subscription.keys.auth);
  const salt = randomBytes(16);
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const localPublicKey = bytesFromBuffer(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );
  const importedReceiverPublicKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = bytesFromBuffer(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: importedReceiverPublicKey },
      localKeyPair.privateKey,
      256
    )
  );
  const keyInfo = concatBytes(
    encodeBytes("WebPush: info\0"),
    receiverPublicKey,
    localPublicKey
  );
  const pseudoRandomKey = await hmac(authSecret, sharedSecret);
  const inputKeyMaterial = await hkdfExpand(pseudoRandomKey, keyInfo, 32);
  const contentPseudoRandomKey = await hmac(salt, inputKeyMaterial);
  const contentEncryptionKey = await hkdfExpand(
    contentPseudoRandomKey,
    encodeBytes("Content-Encoding: aes128gcm\0"),
    16
  );
  const nonce = await hkdfExpand(
    contentPseudoRandomKey,
    encodeBytes("Content-Encoding: nonce\0"),
    12
  );
  const bytes = typeof payload === "string" ? encodeBytes(payload) : toBytes(payload);
  const plaintext = concatBytes(bytes, toBytes(Uint8Array.of(2)));
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const ciphertext = bytesFromBuffer(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext)
  );

  return concatBytes(
    salt,
    uint32(aes128GcmRecordSize),
    toBytes(Uint8Array.of(localPublicKey.length)),
    localPublicKey,
    ciphertext
  );
}

async function createVapidJwt(
  endpoint: string,
  vapid: VapidConfig
): Promise<string> {
  const header = base64UrlJson({ alg: "ES256", typ: "JWT" });
  const payload = base64UrlJson({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: vapid.subject
  });
  const unsignedToken = `${header}.${payload}`;
  const key = await importVapidPrivateKey(vapid);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      encodeBytes(unsignedToken)
    )
  );

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function importVapidPrivateKey(vapid: VapidConfig): Promise<CryptoKey> {
  const publicKey = urlBase64ToBytes(vapid.publicKey);

  if (publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error("VAPID public key must be an uncompressed P-256 point");
  }

  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicKey.slice(1, 33)),
    y: base64UrlEncode(publicKey.slice(33, 65)),
    d: vapid.privateKey,
    ext: false,
    key_ops: ["sign"]
  };

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function hmac(keyBytes: Bytes, data: Bytes): Promise<Bytes> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return bytesFromBuffer(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExpand(
  pseudoRandomKey: Bytes,
  info: Bytes,
  length: number
): Promise<Bytes> {
  const blocks: Bytes[] = [];
  let previous = new Uint8Array();
  let blockIndex = 1;

  while (concatBytes(...blocks).length < length) {
    previous = await hmac(
      pseudoRandomKey,
      concatBytes(previous, info, Uint8Array.of(blockIndex))
    );
    blocks.push(previous);
    blockIndex++;
  }

  return concatBytes(...blocks).slice(0, length);
}

function base64UrlJson(value: unknown): string {
  return base64UrlEncode(encodeBytes(JSON.stringify(value)));
}

function urlBase64ToBytes(value: string): Bytes {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(`${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index++) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function concatBytes(...arrays: Bytes[]): Bytes {
  const output = new Uint8Array(
    arrays.reduce((total, array) => total + array.length, 0)
  );
  let offset = 0;

  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }

  return output;
}

function randomBytes(length: number): Bytes {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return bytes;
}

function encodeBytes(value: string): Bytes {
  return new Uint8Array(encoder.encode(value));
}

function bytesFromBuffer(value: ArrayBuffer): Bytes {
  return new Uint8Array(value);
}

function toBytes(value: Uint8Array): Bytes {
  return new Uint8Array(value);
}

function uint32(value: number): Bytes {
  return Uint8Array.from([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ]);
}
