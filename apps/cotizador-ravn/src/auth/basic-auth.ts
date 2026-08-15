export type BasicCredentials = {
  username: string;
  password: string;
};

const MAX_AUTHORIZATION_LENGTH = 4_096;
const BASIC_HEADER = /^Basic ([A-Za-z0-9+/]+={0,2})$/i;

function decodeBase64Utf8(value: string): string | null {
  if (value.length === 0 || value.length % 4 !== 0) return null;

  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Parser puro para middleware. Cualquier ambigüedad o dato incompleto se
 * rechaza: Basic Auth protege el producto, no intenta reparar clientes rotos.
 */
export function parseBasicAuthorization(
  header: string | null | undefined
): BasicCredentials | null {
  if (typeof header !== "string" || header.length > MAX_AUTHORIZATION_LENGTH) return null;

  const match = BASIC_HEADER.exec(header);
  if (!match) return null;

  const decoded = decodeBase64Utf8(match[1]);
  if (decoded == null) return null;

  const separator = decoded.indexOf(":");
  if (separator <= 0 || separator === decoded.length - 1) return null;

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

/** Comparación de duración aproximadamente constante, sin APIs exclusivas de Node. */
export function safeTextEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

export function verifyBasicAuthorization(
  header: string | null | undefined,
  expectedUsername: string | null | undefined,
  expectedPassword: string | null | undefined
): boolean {
  if (!expectedUsername || !expectedPassword) return false;

  const credentials = parseBasicAuthorization(header);
  if (!credentials) return false;

  const usernameMatches = safeTextEqual(credentials.username, expectedUsername);
  const passwordMatches = safeTextEqual(credentials.password, expectedPassword);
  return usernameMatches && passwordMatches;
}
