import type { JWKS } from '../types';
import { JWKS_CACHE_TTL_MS } from '../config';

/**
 * Cache for JWKS to avoid fetching on every request
 */
let jwksCache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;

/**
 * Clear the JWKS cache (useful for testing)
 */
export function clearJWKSCache(): void {
  jwksCache = null;
}

/**
 * Fetch and cache JWKS (JSON Web Key Set) from Cloudflare Access
 * 
 * @param teamDomain - The Cloudflare Access team domain
 * @returns A map of key ID to CryptoKey
 */
export async function getJWKS(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }

  const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`;
  const response = await fetch(certsUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${certsUrl}: ${response.status}`);
  }

  const jwks: JWKS = await response.json();
  const keys = new Map<string, CryptoKey>();

  for (const jwk of jwks.keys) {
    if (jwk.kid && jwk.kty === 'RSA') {
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      keys.set(jwk.kid, key);
    }
  }

  jwksCache = { keys, fetchedAt: now };
  return keys;
}
