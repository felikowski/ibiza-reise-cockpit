// express-openid-connect is CommonJS; Node's ESM interop only picks up its
// `default` export reliably, so destructure from there instead of using
// named imports (which silently miss `requiresAuth` at runtime).
import pkg from "express-openid-connect";
import type { RequestHandler } from "express";

const { auth, requiresAuth } = pkg;

const REQUIRED_ENV_VARS = [
  "AUTH0_SECRET",
  "AUTH0_BASE_URL",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_ISSUER_BASE_URL",
] as const;

export function isAuthConfigured(): boolean {
  return REQUIRED_ENV_VARS.every((name) => Boolean(process.env[name]));
}

// Mounts req.oidc plus the /auth/login, /auth/logout and /auth/callback
// routes. Call only after isAuthConfigured() returned true.
export function authMiddleware() {
  return auth({
    authRequired: false,
    idpLogout: true,
    secret: process.env.AUTH0_SECRET,
    baseURL: process.env.AUTH0_BASE_URL,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
    routes: {
      login: "/auth/login",
      logout: "/auth/logout",
      callback: "/auth/callback",
      postLogoutRedirect: "/",
    },
  });
}

// Every route registered after this middleware requires a valid Auth0
// session; unauthenticated requests get redirected to /auth/login.
export const requireLogin: RequestHandler = requiresAuth();

// Traefik forwardAuth target for the static frontend container, which has
// no code of its own to check a session. 200 lets the request through as-is,
// anything else (a redirect to Auth0 login) is relayed to the browser by
// Traefik instead of reaching nginx.
export const verifySession: RequestHandler = (req, res) => {
  if (req.oidc?.isAuthenticated()) {
    res.status(200).end();
    return;
  }
  const forwardedUri = req.header("x-forwarded-uri") ?? "/";
  const returnTo = forwardedUri.startsWith("/") && !forwardedUri.startsWith("//") ? forwardedUri : "/";
  res.redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
};

export const currentUser: RequestHandler = (req, res) => {
  const user = req.oidc?.user;
  res.json({
    email: typeof user?.email === "string" ? user.email : null,
    name: typeof user?.name === "string" ? user.name : null,
  });
};
