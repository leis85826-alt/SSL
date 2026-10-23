import { collections, validateSnapshot } from './entities.mjs';
export function canonicalSnapshot(snapshot) {
  validateSnapshot(snapshot);
  const sorted = structuredClone(snapshot);
  for (const [name, pk] of Object.entries(collections)) sorted[name].sort((a,b) => a[pk] < b[pk] ? -1 : a[pk] > b[pk] ? 1 : 0);
  const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return JSON.stringify(stable(sorted));
}
export async function checksumSnapshot(snapshot) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSnapshot(snapshot)))), b => b.toString(16).padStart(2,'0')).join('');
}
