import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/backoffice(.*)',
  '/infra(.*)',
  // `ringee login` sends the user here to approve a terminal.
  '/cli(.*)'
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (isProtectedRoute(req)) await auth.protect();

  const headers = new Headers(req.headers);
  headers.delete('x-ringee-locale');
  if (
    req.nextUrl.pathname === '/es' ||
    req.nextUrl.pathname.startsWith('/es/')
  ) {
    headers.set('x-ringee-locale', 'es');
  }
  return NextResponse.next({ request: { headers } });
});
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)'
  ]
};
