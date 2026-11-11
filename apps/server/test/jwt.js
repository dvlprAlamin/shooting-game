// Stand-ins for Google's signing keys: RSA key pairs whose public halves go in a JWK set like Google's, and
// tokens signed with them.

const ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const b64url = (data) => Buffer.from(data).toString('base64url');

/** A signing key: `jwk` is its public half as Google publishes it. */
export async function signingKey(kid) {
    const { privateKey, publicKey } = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
    const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid, alg: 'RS256', use: 'sig' };
    return { kid, privateKey, jwk };
}

/** A JWT of `claims` signed with `key`. */
export async function signToken(key, claims, header = { alg: 'RS256', kid: key.kid, typ: 'JWT' }) {
    const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
    const signature = await crypto.subtle.sign(ALGORITHM, key.privateKey, new TextEncoder().encode(data));
    return `${data}.${b64url(new Uint8Array(signature))}`;
}

/** The claims of a Google ID token for `aud`, valid at `now` (ms). */
export const googleClaims = (aud, now, extra) => ({
    iss: 'https://accounts.google.com',
    aud,
    azp: aud,
    sub: '109876543210987654321',
    email: 'player@example.com',
    email_verified: true,
    iat: Math.floor(now / 1000) - 10,
    exp: Math.floor(now / 1000) + 3600,
    ...extra,
});
