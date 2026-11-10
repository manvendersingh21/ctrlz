import { NextResponse, type NextRequest } from "next/server";
import { configuredCredentials, isAuthorized, unauthorizedResponse } from "@/lib/auth";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Next injects inline bootstrap scripts without nonces, React Flow / framer-motion write inline styles, and
 * dev mode needs eval (React Refresh) plus a websocket for HMR.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const PUBLIC_PATHS = new Set(["/api/health"]);

function requestIdFrom(req: NextRequest): string {
  const incoming = req.headers.get("x-request-id");
  return incoming && /^[\w.:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
}

function withHeaders<R extends Response>(res: R, requestId: string): R {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  res.headers.set("x-request-id", requestId);
  return res;
}

export async function proxy(request: NextRequest) {
  const requestId = requestIdFrom(request);

  const creds = configuredCredentials();
  if (creds && !PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    if (!(await isAuthorized(request.headers.get("authorization"), creds))) {
      return withHeaders(unauthorizedResponse(), requestId);
    }
  }

  // Forward the id upstream so route handlers log the same one.
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  return withHeaders(NextResponse.next({ request: { headers } }), requestId);
}

export const config = {
  // Everything except Next build assets and image optimization (those carry no data and must load freely).
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
