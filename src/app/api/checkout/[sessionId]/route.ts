import { NextRequest, NextResponse } from "next/server";
import { checkoutStore } from "@/lib/store/inMemoryStore";
import { CheckoutSurface, ResumeSessionResponse } from "@/lib/types/checkout";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  const { searchParams } = new URL(request.url);
  const currentSurface = searchParams.get("surface") as CheckoutSurface | null;
  const surface: CheckoutSurface = currentSurface ?? "desktop_web";

  let session = checkoutStore.getSession(sessionId, surface);

  // Vercel Serverless Fallback: restore/seed if polled on a fresh container instance
  if (!session) {
    session = checkoutStore.restoreOrSeedSession(sessionId, surface);
  }

  if (!session) {
    return NextResponse.json(
      { error: "Checkout session not found" },
      { status: 404 },
    );
  }

  const now = Date.now();
  const isStale = session.status === "EXPIRED" || now >= session.expiresAt;
  const canCheckout = session.status === "ACTIVE" && !isStale;

  const host = request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const baseUrl = `${protocol}://${host}`;

  const response: ResumeSessionResponse = {
    session,
    isStale,
    canCheckout,
    deepLink: {
      appSchemeUrl: `gametime://checkout/${session.id}`,
      webFallbackUrl: `${baseUrl}/checkout/${session.id}?surface=mobile_web`,
    },
  };

  return NextResponse.json(response, { status: 200 });
}
