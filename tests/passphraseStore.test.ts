import { afterEach, describe, expect, it } from "vitest";
import {
  clearPassphrase,
  getPassphrase,
  setPassphrase
} from "../src/lib/passphraseStore";

describe("passphraseStore", () => {
  afterEach(() => {
    clearPassphrase();
  });

  it("returns null when no passphrase is stored", () => {
    expect(getPassphrase()).toBeNull();
  });

  it("stores every passphrase in sessionStorage", () => {
    setPassphrase("session-only", false);

    expect(getPassphrase()).toBe("session-only");
    expect(localStorage.length).toBe(0);
  });

  it("stores remembered passphrases in localStorage", () => {
    setPassphrase("remembered", true);
    sessionStorage.clear();

    expect(getPassphrase()).toBe("remembered");
  });

  it("prefers sessionStorage over localStorage", () => {
    setPassphrase("remembered", true);
    sessionStorage.setItem("reta-dashboard:passphrase", "current-session");

    expect(getPassphrase()).toBe("current-session");
  });

  it("clears both storage locations", () => {
    setPassphrase("remembered", true);

    clearPassphrase();

    expect(getPassphrase()).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
});
