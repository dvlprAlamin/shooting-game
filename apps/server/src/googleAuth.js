// Checks the ID token the app gets from Sign in with Google: a JWT signed by Google (RS256) with one of the
// keys it publishes, issued for our OAuth client (`aud`) and not expired. Its `sub` is the Google account.
// No library: Workers have WebCrypto.

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const SKEW_S = 60; // clock difference allowed between Google and us
const REFETCH_MS = 60_000; // an unknown key id refetches Google's keys at most this often
const ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

const bytes = (base64url) =>
    Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const json = (base64url) => JSON.parse(new TextDecoder().decode(bytes(base64url)));

/** Google's signing keys as a JWK set, and how long they may be kept (Cache-Control max-age, seconds). */
async function fetchGoogleCerts() {
    const res = await fetch(CERTS_URL);
    if (!res.ok) throw new Error(`Google's keys: ${res.status}`);
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') ?? '')?.[1] ?? 3600);
    return { keys: (await res.json()).keys ?? [], maxAge };
}

/**
 * A token checker with its own key cache. `fetchCerts` stands in for Google in tests.
 * The checker takes (token, audiences, now) and returns the token's claims, or null if it isn't a valid
 * Google ID token for one of `audiences`. It throws only when Google's keys can't be fetched.
 */
export function googleTokenVerifier(fetchCerts = fetchGoogleCerts) {
    let keys = new Map(); // kid -> CryptoKey
    let keptUntil = 0;
    let fetchedAt = -Infinity;

    const load = async (now) => {
        const { keys: jwks, maxAge } = await fetchCerts();
        const next = new Map();
        for (const k of jwks) {
            if (k.kty !== 'RSA' || typeof k.kid !== 'string') continue;
            const jwk = { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true };
            next.set(k.kid, await crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, ['verify']));
        }
        keys = next;
        fetchedAt = now;
        keptUntil = now + maxAge * 1000;
    };

    const keyFor = async (kid, now) => {
        // Google rotates its keys: a new kid means fetching them again, but not on every made-up kid.
        if (now >= keptUntil || (!keys.has(kid) && now - fetchedAt >= REFETCH_MS)) await load(now);
        return keys.get(kid) ?? null;
    };

    return async (token, audiences, now = Date.now()) => {
        const parts = typeof token === 'string' ? token.split('.') : [];
        if (parts.length !== 3) return null;
        let header, claims, signature;
        try {
            header = json(parts[0]);
            claims = json(parts[1]);
            signature = bytes(parts[2]);
        } catch {
            return null;
        }
        if (header?.alg !== 'RS256' || typeof header.kid !== 'string') return null;

        const key = await keyFor(header.kid, now);
        if (!key) return null;
        const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
        if (!(await crypto.subtle.verify(ALGORITHM, key, signature, signed))) return null;

        const t = now / 1000;
        const aud = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
        if (!ISSUERS.has(claims.iss) || !aud.some((a) => audiences.includes(a))) return null;
        if (!(claims.exp + SKEW_S > t) || !(claims.iat - SKEW_S <= t)) return null;
        if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) return null;
        return claims;
    };
}

/** The checker the server uses, fetching Google's keys from Google. */
export const verifyGoogleIdToken = googleTokenVerifier();
