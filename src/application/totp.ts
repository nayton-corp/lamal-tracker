import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Mots de passe à usage unique basés sur le temps (TOTP, RFC 6238) : 6 chiffres, pas de 30 s,
 * HMAC-SHA1, comme les applications d'authentification courantes. Un pas d'écart est toléré de
 * chaque côté pour les horloges un peu décalées.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) throw new Error("Clé base32 invalide");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  const binary = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Pas correspondant au code saisi, ou null. `lastStep` refuse un code déjà utilisé (ou plus
 * ancien) : un code intercepté ne sert pas une seconde fois.
 */
export function verifyTotp(secret: string, code: string, nowMs: number, lastStep: number | null): number | null {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const now = totpStep(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(given))) return step;
  }
  return null;
}

/** Adresse à transformer en QR code pour l'application d'authentification. */
export function totpUri(secret: string, account: string, issuer = "Primes LAMal"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
