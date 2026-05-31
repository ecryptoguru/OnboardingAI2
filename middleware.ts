import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isPublicPage = createRouteMatcher(["/", "/sign-in", "/sign-up"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isDev = process.env.NODE_ENV === "development";
  const bypassSecret = process.env.DEV_AUTH_BYPASS_SECRET;
  const bypassEnabled = isDev && !!bypassSecret;

  if (process.env.NODE_ENV === "production") {
    // Never bypass in production regardless of env vars
  } else if (bypassEnabled) {
    const provided =
      request.headers.get("x-dev-auth-bypass") ||
      request.cookies.get("dev_auth_bypass")?.value;

    if (provided === bypassSecret) {
      console.warn("[Middleware] ⚠️ Development auth bypass is active and authorized");
      return;
    }
  }

  if (!isPublicPage(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/sign-in");
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
