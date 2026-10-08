"use strict";
/*
 * Login file encryption (browser Web Crypto, no libraries).
 *
 * Each user entry in data/users.enc.json:
 *   { id, v, kdf, iterations, salt, iv, data }
 *   id   = SHA-256("autometrik-hd|" + username)  -> usernames are not readable in the file
 *   key  = PBKDF2-SHA256(password, salt, iterations) -> AES-256-GCM key
 *   data = AES-GCM(key, iv, JSON{name, role, token}), with id as additional authenticated data
 *
 * The file is public on GitHub Pages; without the password an entry cannot be decrypted.
 */
const HDCrypto = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const toB64 = buf => {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  };
  const fromB64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  const toHex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");

  async function userId(username) {
    const norm = String(username || "").trim().toLowerCase();
    return toHex(await crypto.subtle.digest("SHA-256", enc.encode("autometrik-hd|" + norm)));
  }

  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptEntry(username, password, payload, iterations) {
    const id = await userId(username);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, iterations);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(id) },
      key,
      enc.encode(JSON.stringify(payload))
    );
    return { id, v: 1, kdf: "PBKDF2-SHA256", iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(ct) };
  }

  /** Throws if the password is wrong (AES-GCM authentication fails). */
  async function decryptEntry(entry, password) {
    const key = await deriveKey(password, fromB64(entry.salt), entry.iterations);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(entry.iv), additionalData: enc.encode(entry.id) },
      key,
      fromB64(entry.data)
    );
    return JSON.parse(dec.decode(pt));
  }

  /** Same work as a real login when the user doesn't exist, so timing doesn't reveal it. */
  async function burn(password) {
    await deriveKey(password || "x", crypto.getRandomValues(new Uint8Array(16)), window.HD_CONFIG.pbkdf2Iterations);
  }

  return { userId, encryptEntry, decryptEntry, burn };
})();
