const PASSPHRASE_KEY = "reta-dashboard:passphrase";

export function getPassphrase(): string | null {
  return readStorage(sessionStorage) ?? readStorage(localStorage);
}

export function setPassphrase(pw: string, remember: boolean): void {
  sessionStorage.setItem(PASSPHRASE_KEY, pw);

  if (remember) {
    localStorage.setItem(PASSPHRASE_KEY, pw);
  } else {
    localStorage.removeItem(PASSPHRASE_KEY);
  }
}

export function clearPassphrase(): void {
  sessionStorage.removeItem(PASSPHRASE_KEY);
  localStorage.removeItem(PASSPHRASE_KEY);
}

function readStorage(storage: Storage): string | null {
  const value = storage.getItem(PASSPHRASE_KEY);

  return value && value.length > 0 ? value : null;
}
