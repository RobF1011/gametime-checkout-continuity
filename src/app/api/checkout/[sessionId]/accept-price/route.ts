import { NextRequest, NextResponse } from "next/server";
import { checkoutStore } from "@/lib/store/inMemoryStore";
import {
  AcceptPriceChangeRequest,
  AcceptPriceChangeResponse,
} from "@/lib/types/checkout";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = (await request.json()) as Partial<AcceptPriceChangeRequest>;

    if (body.acceptedTotal === undefined || !body.surface) {
      return NextResponse.json(
        { error: "acceptedTotal and surface are required" },
        { status: 400 },
      );
    }

    const result = checkoutStore.acceptPriceChange(
      sessionId,
      body.surface,
      body.acceptedTotal,
    );

    if (!result.success || !result.session) {
      return NextResponse.json(
        { error: result.error || "Failed to accept price change" },
        { status: 422 },
      );
    }

    const response: AcceptPriceChangeResponse = {
      success: true,
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
