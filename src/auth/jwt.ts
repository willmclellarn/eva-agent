import type { JWTPayload } from '../types';
import { getJWKS } from './jwks';

/**
 * Decode a base64url-encoded string to bytes
 */
export function base64UrlDecode(str: string): Uint8Array {
  // Replace URL-safe chars and add padding
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify a Cloudflare Access JWT token
 * 
 * @param token - The JWT token string
 * @param teamDomain - The Cloudflare Access team domain (e.g., 'myteam.cloudflareaccess.com')
 * @param expectedAud - The expected audience (Application AUD tag)
 * @returns The decoded JWT payload if valid
 * @throws Error if the token is invalid, expired, or doesn't match expected values
 */
export async function verifyAccessJWT(
  token: string,
  teamDomain: string,
  expectedAud: string
): Promise<JWTPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header to get kid
  const headerJson = new TextDecoder().decode(base64UrlDecode(headerB64));
  const header = JSON.parse(headerJson);
  const kid = header.kid;

  if (!kid) {
    throw new Error('JWT header missing kid');
  }

  // Get signing keys
  const keys = await getJWKS(teamDomain);
  const key = keys.get(kid);

  if (!key) {
    throw new Error(`Unknown signing key: ${kid}`);
  }

  // Verify signature
  const signatureData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlDecode(signatureB64);
  // Get the underlying ArrayBuffer for the signature
  const signature = signatureBytes.buffer.slice(
    signatureBytes.byteOffset,
    signatureBytes.byteOffset + signatureBytes.byteLength
  ) as ArrayBuffer;

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    signatureData
  );

  if (!valid) {
    throw new Error('Invalid JWT signature');
  }

  // Decode and validate payload
  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
  const payload: JWTPayload = JSON.parse(payloadJson);

  // Verify expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('JWT has expired');
  }

  // Verify audience
  if (!payload.aud.includes(expectedAud)) {
    throw new Error('JWT audience mismatch');
  }

  // Verify issuer
  const expectedIss = `https://${teamDomain}`;
  if (payload.iss !== expectedIss) {
    throw new Error('JWT issuer mismatch');
  }

  return payload;
}
