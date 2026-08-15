import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasAuthToken =
    request.cookies.has("__convexAuthJWT") ||
    request.cookies.has("__Host-__convexAuthJWT") ||
    request.cookies.has("__convexAuthRefreshToken") ||
    request.cookies.has("__Host-__convexAuthRefreshToken");

  const isAuthPage =
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  const isProtectedRoute = pathname.startsWith("/dashboard");

  if (isAuthPage && hasAuthToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedRoute && !hasAuthToken) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export default middleware;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
  ],
};
