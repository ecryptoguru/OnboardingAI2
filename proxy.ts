import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  "https://energetic-raven-535.convex.cloud";

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    if (isSignInPage(request) && (await convexAuth.isAuthenticated())) {
      return nextjsMiddlewareRedirect(request, "/dashboard");
    }
    if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
      return nextjsMiddlewareRedirect(request, "/sign-in");
    }
  },
  {
    convexUrl,
  },
);

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
