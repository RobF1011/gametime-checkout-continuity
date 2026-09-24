import { NextRequest, NextResponse } from "next/server";
import { checkoutStore } from "@/lib/store/inMemoryStore";
import {
  CompleteCheckoutRequest,
  CompleteCheckoutResponse,
} from "@/lib/types/checkout";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = (await request.json()) as Partial<CompleteCheckoutRequest>;

    if (!body.surface || !body.idempotencyKey) {
      return NextResponse.json(
        { error: "surface and idempotencyKey are required" },
        { status: 400 },
      );
    }

    const result = checkoutStore.completeCheckout(
      sessionId,
      body.surface,
      body.idempotencyKey,
    );

    if (!result.success || !result.session) {
      const statusCode =
        result.errorCode === "CONCURRENT_PROCESSING_CONFLICT" ? 409 : 422;

      const failureResponse: CompleteCheckoutResponse = {
        success: false,
        session: checkoutStore.getSession(sessionId)!,
        error: {
          code: result.errorCode || "INVENTORY_UNAVAILABLE",
          message: result.errorMessage || "Unable to complete checkout",
          conflictingSurface: result.conflictingSurface,
        },
      };

      return NextResponse.json(failureResponse, { status: statusCode });
    }

    const response: CompleteCheckoutResponse = {
      success: true,
      orderId: result.orderId,
      session: result.session,
    };

    return NextResponse.json(response, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
