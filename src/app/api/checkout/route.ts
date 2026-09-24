import { NextRequest, NextResponse } from "next/server";
import { checkoutStore } from "@/lib/store/inMemoryStore";
import {
  CheckoutSurface,
  CreateSessionRequest,
  CreateSessionResponse,
} from "@/lib/types/checkout";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CreateSessionRequest>;

    if (!body.listingId) {
      return NextResponse.json(
        { error: "listingId is required" },
        { status: 400 },
      );
    }

    const surface: CheckoutSurface = body.surface || "desktop_web";
    const quantity = body.quantity || 2;

    const session = checkoutStore.createSession({
      listingId: body.listingId,
      surface,
      quantity,
    });

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    const response: CreateSessionResponse = {
      success: true,
      session,
      deepLink: {
        appSchemeUrl: `gametime://checkout/${session.id}`,
        webFallbackUrl: `${baseUrl}/checkout/${session.id}?surface=mobile_web`,
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
