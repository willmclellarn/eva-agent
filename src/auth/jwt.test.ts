import { describe, it, expect } from 'vitest';
import { base64UrlDecode } from './jwt';

describe('base64UrlDecode', () => {
  it('decodes standard base64url strings', () => {
    // "hello" in base64url
    const encoded = 'aGVsbG8';
    const result = base64UrlDecode(encoded);
    expect(new TextDecoder().decode(result)).toBe('hello');
  });

  it('handles padding correctly', () => {
    // "a" in base64url (needs padding)
    const encoded = 'YQ';
    const result = base64UrlDecode(encoded);
    expect(new TextDecoder().decode(result)).toBe('a');
  });

  it('replaces URL-safe characters', () => {
    // Base64url uses - instead of + and _ instead of /
    // Test with a string that would have + and / in standard base64
    const encoded = 'PDw_Pz4-'; // <<??>> in base64url
    const result = base64UrlDecode(encoded);
    expect(new TextDecoder().decode(result)).toBe('<<??>>');
  });

  it('decodes empty string', () => {
    const result = base64UrlDecode('');
    expect(result.length).toBe(0);
  });

  it('decodes JSON payload', () => {
    // {"test":"value"} in base64url
    const encoded = 'eyJ0ZXN0IjoidmFsdWUifQ';
    const result = base64UrlDecode(encoded);
    const json = JSON.parse(new TextDecoder().decode(result));
    expect(json).toEqual({ test: 'value' });
  });
});

describe('verifyAccessJWT', () => {
  it('rejects malformed JWT (wrong number of parts)', async () => {
    const { verifyAccessJWT } = await import('./jwt');
    
    await expect(
      verifyAccessJWT('invalid', 'team.cloudflareaccess.com', 'aud')
    ).rejects.toThrow('Invalid JWT format');

    await expect(
      verifyAccessJWT('part1.part2', 'team.cloudflareaccess.com', 'aud')
    ).rejects.toThrow('Invalid JWT format');

    await expect(
      verifyAccessJWT('part1.part2.part3.part4', 'team.cloudflareaccess.com', 'aud')
    ).rejects.toThrow('Invalid JWT format');
  });

  it('rejects JWT with missing kid', async () => {
    const { verifyAccessJWT } = await import('./jwt');
    
    // Create a JWT header without kid
    const header = btoa(JSON.stringify({ alg: 'RS256' })).replace(/=/g, '');
    const payload = btoa(JSON.stringify({ email: 'test@test.com' })).replace(/=/g, '');
    const signature = 'fakesig';
    
    await expect(
      verifyAccessJWT(`${header}.${payload}.${signature}`, 'team.cloudflareaccess.com', 'aud')
    ).rejects.toThrow('JWT header missing kid');
  });
});
