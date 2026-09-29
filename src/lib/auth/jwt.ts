import { jwtVerify, SignJWT } from "jose";

export async function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyToken<T extends object>(token: string, secret: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as T;
  } catch {
    return null;
  }
}
