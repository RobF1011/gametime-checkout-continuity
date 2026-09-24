import { NextRequest, NextResponse } from "next/server";
import { checkoutStore } from "@/lib/store/inMemoryStore";
import { CheckoutSurface } from "@/lib/types/checkout";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

interface MockActionRequest {
  action?: string;
  type?: string;
  delta?: number;
  priceDelta?: number;
  surface?: CheckoutSurface;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = (await request.json()) as MockActionRequest;

    const rawAction = body.action || body.type;

    if (!rawAction) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "action or type is required",
          },
        },
        { status: 400 },
      );
    }

    // Ensure session exists in store
    if (!checkoutStore.getSession(sessionId)) {
      checkoutStore.restoreOrSeedSession(
        sessionId,
        body.surface ?? "desktop_web",
      );
    }

    const action = rawAction.toUpperCase().replace(/[-\s]/g, "_");
    const delta = body.priceDelta ?? body.delta ?? 15.0;

    let updatedSession = null;

    if (
      action.includes("PRICE") ||
      action.includes("SURGE") ||
      action.includes("DRIFT")
    ) {
      updatedSession = checkoutStore.triggerMockPriceChange(sessionId, delta);
    } else if (action.includes("EXPIRE") || action.includes("TTL")) {
      updatedSession = checkoutStore.triggerMockExpiration(sessionId);
    } else {
      // Handles RESET, RELEASE, RE_LEASE, RENEW, EXTEND, etc.
      updatedSession = checkoutStore.resetMockSession(sessionId);
    }

    if (!updatedSession) {
      return NextResponse.json(
        {
          error: {
            code: "ACTION_FAILED",
            message: "Could not apply mock simulation action",
          },
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { success: true, session: updatedSession },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Internal Server Error",
        },
      },
      { status: 500 },
    );
  }
}
