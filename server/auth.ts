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
// before there's time to click it. A fixed short delay before auto-redirecting
// turned out to still be fast enough to dismiss it, so this waits for an
// explicit click instead — nothing navigates the page away on its own, which
// gives the save-password prompt as long as it needs to actually be used.
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
<title>Angemeldet</title>
<body style="margin:0; min-height:100vh; display:grid; place-items:center; font-family: system-ui, sans-serif; background: #f4f1ea; color: #22322d;">
  <div style="text-align:center; max-width: 320px; padding: 24px;">
    <p style="margin: 0 0 18px; font-size: 14px; color: #718079;">Angemeldet. Falls dein Browser gerade anbietet, das Passwort zu speichern, kannst du das jetzt in Ruhe tun.</p>
    <a href="${forAttribute}" id="continue-link" style="display:inline-block; border:1px solid #dedbd2; background:#fffdf8; color:#22322d; padding:10px 22px; border-radius:99px; font-size:13px; font-weight:700; text-decoration:none;">Weiter zur App</a>
  </div>
  <script>document.getElementById("continue-link").addEventListener("click", function (event) {
    event.preventDefault();
    window.location.replace(${forScript});
  });</script>
</body>`;
}
