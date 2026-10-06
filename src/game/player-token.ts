const TOKEN_KEY = "apecat-rail-player";
const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Drop this browser’s link to a name. The name and its scores stay on the server. */
export function forgetPlayerToken(): string {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
  return ensurePlayerToken();
}

export function ensurePlayerToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && TOKEN_RE.test(existing)) return existing;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return "";
  }
}
