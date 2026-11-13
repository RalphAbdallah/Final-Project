import { randomBytes } from 'node:crypto';

// Small helpers for checking what people type.

// "  Ralph   Abdallah " -> "Ralph Abdallah". Anything that isn't text -> "".
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  const words = value.replaceAll('\n', ' ').replaceAll('\t', ' ').split(' ');
  return words.filter((word) => word !== '').join(' ');
}

// "2026-11-12" style dates only.
export function isIsoDate(value) {
  return (
    typeof value === 'string' &&
    value.length === 10 &&
    value[4] === '-' &&
    value[7] === '-' &&
    !Number.isNaN(Date.parse(value))
  );
}

// Today as "YYYY-MM-DD".
export function today() {
  return new Date().toLocaleDateString('en-CA');
}

// A long random secret for share links and guest tokens: 128 bits, as hex (Session 19).
export function newToken() {
  return randomBytes(16).toString('hex');
}
