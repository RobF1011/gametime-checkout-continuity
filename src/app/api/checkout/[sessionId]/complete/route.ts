import { NextRequest, NextResponse } from "next/server";
import { checkoutStore } from "@/lib/store/inMemoryStore";
import {
  CompleteCheckoutRequest,
  CompleteCheckoutResponse,
} from "@/lib/types/checkout";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = (await request.json()) as Partial<CompleteCheckoutRequest>;

    if (!body.surface || !body.idempotencyKey) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "surface and idempotencyKey are required",
          },
        },
        { status: 400 },
      );
    }

    if (!checkoutStore.getSession(sessionId)) {
      checkoutStore.restoreOrSeedSession(sessionId, body.surface);
    }

    const result = checkoutStore.completeCheckout(
      sessionId,
      body.surface,
      body.idempotencyKey,
    );

    if (!result.success || !result.session) {
      const statusCode =
        result.errorCode === "CONCURRENT_PROCESSING_CONFLICT"
          ? 409
          : result.errorCode === "ALREADY_COMPLETED"
            ? 409
            : 400;

      return NextResponse.json(
        {
          error: {
            code: result.errorCode || "CHECKOUT_FAILED",
            message: result.errorMessage || "Failed to complete checkout",
            conflictingSurface: result.conflictingSurface,
          },
        },
        { status: statusCode },
      );
    }

    const response: CompleteCheckoutResponse = {
      success: true,
      orderId: result.orderId,
      session: result.session,
    };

    return NextResponse.json(response, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal Server Error",
        },
      },
      { status: 500 },
    );
  }
}
