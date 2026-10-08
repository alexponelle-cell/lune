// Chiffre content.mjs avec le mot de passe et génère index.html à partir de template.html.
// Usage : node build.mjs <mot de passe>
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const pw = process.argv[2];
if (!pw || !pw.trim()) { console.error('Usage : node build.mjs <mot de passe>'); process.exit(1); }

const dir = new URL('.', import.meta.url);
const { default: categories } = await import(new URL('content.mjs', dir));
const ITER = 310000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));

const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.trim().toLowerCase()), 'PBKDF2', false, ['deriveBits']);
const raw = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, 256);
const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(categories)));

const b64 = b => Buffer.from(b).toString('base64');
const payload = JSON.stringify({ iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) });
const html = readFileSync(new URL('template.html', dir), 'utf8').replace('/*PAYLOAD*/null', payload);
writeFileSync(new URL('index.html', dir), html);
console.log('index.html généré (' + categories.flatMap(c => c.modules).length + ' modules chiffrés).');
