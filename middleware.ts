import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  // Check for auth cookie/token
  const authCookie = req.cookies.get('sb-access-token') || req.cookies.get('supabase-auth-token');
  const hasToken = authCookie?.value || req.headers.get('authorization');
  
  const protectedPaths = ['/', '/scan', '/my-scans'];
  const isProtected = protectedPaths.some(path => 
    req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith(path + '/')
  );
  
  // Allow /login
  if (req.nextUrl.pathname === '/login') {
    return res;
  }
  
  if (isProtected && !hasToken) {
    // For client-side auth, we'll handle redirect in components
    // But also check for session in URL or just proceed
    return res;
  }
  
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
