import crypto from 'node:crypto';
import { config } from '../config.js';

const key = crypto.createHash('sha256').update(config.connectorSecret).digest();
export function encryptCredentials(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}
export function decryptCredentials(value) {
  if (!value) return {};
  const [iv, tag, data] = value.split('.'); if (!iv || !tag || !data) throw new Error('Invalid connector credentials');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
}
export const redactConnector = (row) => {
  const { credentials_enc: _secret, ...safe } = row;
  return { ...safe, headers: typeof safe.headers === 'string' ? JSON.parse(safe.headers || '{}') : safe.headers, mappings: typeof safe.mappings === 'string' ? JSON.parse(safe.mappings || '{}') : safe.mappings, hasCredentials: !!_secret };
};
