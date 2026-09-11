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
    // The library defaults to the implicit flow (response_type: 'id_token'),
    // which a Regular Web Application's default Auth0 grant types don't
    // allow. This is a confidential client with a client secret, so use the
    // Authorization Code flow instead.
    authorizationParams: {
      response_type: "code",
      scope: "openid profile email",
    },
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
//
// The redirect must be an absolute URL: Traefik's forwardAuth resolves a
// relative Location header from the auth check against the auth service's
// own (internal, container-only) address instead of leaving it for the
// browser to resolve against the page it's on — https://github.com/traefik/traefik/issues/11313.
// A relative Location here sends real visitors to an unroutable
// http://<container-name>:<port>/... URL.
export const verifySession: RequestHandler = (req, res) => {
  if (req.oidc?.isAuthenticated()) {
    res.status(200).end();
    return;
  }
  const forwardedUri = req.header("x-forwarded-uri") ?? "/";
  const returnTo = forwardedUri.startsWith("/") && !forwardedUri.startsWith("//") ? forwardedUri : "/";
  res.redirect(`${process.env.AUTH0_BASE_URL}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
};

export const currentUser: RequestHandler = (req, res) => {
  const user = req.oidc?.user;
  res.json({
    email: typeof user?.email === "string" ? user.email : null,
    name: typeof user?.name === "string" ? user.name : null,
  });
};

// express-openid-connect finishes /auth/callback with an instant `res.redirect`
// straight back into the app. That lands so fast after the password field was
// submitted on Auth0's hosted login page that the browser's "save password"
// prompt gets shown and then immediately dismissed by the next navigation,
// before there's time to click it. Swapping that one redirect for a brief
// self-redirecting HTML page gives the prompt a moment to actually be usable.
// Must run before authMiddleware() so it wraps res.redirect first.
export const delayCallbackRedirect: RequestHandler = (req, res, next) => {
  if (req.path !== "/auth/callback") {
    next();
    return;
  }
  res.redirect = ((...args: unknown[]) => {
    const target = String(args.length > 1 ? args[1] : args[0]);
    res.status(200).type("html").send(callbackRedirectHtml(target));
  }) as typeof res.redirect;
  next();
};

function callbackRedirectHtml(target: string): string {
  const forAttribute = target.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const forScript = JSON.stringify(target).replace(/</g, "\\u003c");
  return `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="2;url=${forAttribute}">
<title>Angemeldet</title>
<body style="font: 14px system-ui, sans-serif; padding: 48px; color: #22322d;">
  <p>Angemeldet — du wirst weitergeleitet …</p>
  <script>setTimeout(function () { window.location.replace(${forScript}); }, 1200);</script>
</body>`;
}
