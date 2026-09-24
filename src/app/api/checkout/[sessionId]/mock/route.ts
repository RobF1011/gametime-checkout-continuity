import { NextRequest, NextResponse } from "next/server";
import { checkoutStore } from "@/lib/store/inMemoryStore";
import { MockTriggerRequest, MockTriggerResponse } from "@/lib/types/checkout";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = (await request.json()) as Partial<MockTriggerRequest>;

    if (!body.action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 },
      );
    }

    let updatedSession = null;

    switch (body.action) {
      case "TRIGGER_PRICE_CHANGE":
        updatedSession = checkoutStore.triggerMockPriceChange(
          sessionId,
          body.priceDelta ?? 15.0,
        );
        break;

      case "FORCE_EXPIRE":
        updatedSession = checkoutStore.triggerMockExpiration(sessionId);
        break;

      case "RESET_SESSION":
        updatedSession = checkoutStore.resetMockSession(sessionId);
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported mock action: ${body.action}` },
          { status: 400 },
        );
    }

    if (!updatedSession) {
      return NextResponse.json(
        { error: "Session not found or cannot apply action in current state" },
        { status: 422 },
      );
    }

    const response: MockTriggerResponse = {
      success: true,
      actionApplied: body.action,
      session: updatedSession,
    };

    return NextResponse.json(response, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
