import { describe, expect, it } from "vitest";
import { DecryptError, decryptEnvelope } from "../src/lib/crypto";
import type { Envelope } from "../src/lib/crypto";

const knownEnvelope: Envelope = {
  v: 1,
  kdf: "pbkdf2-sha256",
  iter: 600000,
  salt: "AQIDBAUGBwgJCgsMDQ4PEA",
  iv: "FBUWFxgZGhscHR4f",
  ct: "nDtOPn0P_RG_TDTzHY6z8bodY0bGe3ESxjY"
};

describe("decryptEnvelope", () => {
  it("decrypts a known AES-256-GCM PBKDF2 envelope", async () => {
    await expect(decryptEnvelope(knownEnvelope, "correct horse")).resolves.toBe(
      "hello reta"
    );
  });

  it("rejects unsupported envelope metadata", async () => {
    await expect(
      decryptEnvelope({ ...knownEnvelope, v: 2 as 1 }, "correct horse")
    ).rejects.toThrow(new DecryptError("unsupported envelope"));

    await expect(
      decryptEnvelope(
        { ...knownEnvelope, kdf: "scrypt" as "pbkdf2-sha256" },
        "correct horse"
      )
    ).rejects.toThrow(new DecryptError("unsupported envelope"));
  });

  it("maps failed authentication to the public wrong-passphrase error", async () => {
    await expect(decryptEnvelope(knownEnvelope, "wrong")).rejects.toThrow(
      new DecryptError("wrong passphrase")
    );
  });

  it("wraps malformed base64url input as a DecryptError", async () => {
    await expect(
      decryptEnvelope({ ...knownEnvelope, salt: "not valid!!!!" }, "correct horse")
    ).rejects.toThrow(DecryptError);
  });
});
