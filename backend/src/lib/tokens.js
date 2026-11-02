import { randomBytes, randomUUID } from 'node:crypto';

/** 128-bit random token, URL-safe. Used for share links and guest tokens. */
export const newToken = () => randomBytes(16).toString('base64url');

export const newId = () => randomUUID();
