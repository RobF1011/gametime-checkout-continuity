// app/checkout/[sessionId]/page.tsx
import { notFound } from "next/navigation";
import { checkoutStore } from "@/lib/store/inMemoryStore";
import { CheckoutSurface, ResumeSessionResponse } from "@/lib/types/checkout";
import CheckoutClient from "./CheckoutClient";

interface PageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ surface?: string; demo?: string }>;
}

export default async function CheckoutPage({
  params,
  searchParams,
}: PageProps) {
  const { sessionId } = await params;
  const resolvedSearchParams = await searchParams;

  const surfaceParam = resolvedSearchParams.surface as
    | CheckoutSurface
    | undefined;
  const surface: CheckoutSurface =
    surfaceParam === "mobile_web" || surfaceParam === "mobile_app"
      ? surfaceParam
      : "desktop_web";

  const isDemoSplitView = resolvedSearchParams.demo === "true";

  // Server-side direct read from store (The store handles TTL and state evaluation internally)
  const session = checkoutStore.getSession(sessionId, surface);

  if (!session) {
    notFound();
  }

  // Pure evaluation derived directly from session state without calling Date.now() during render
  const isStale = session.status === "EXPIRED";
  const canCheckout = session.status === "ACTIVE";

  // Construct initial serialized server state payload for client hydration
  const initialData: ResumeSessionResponse = {
    session,
    isStale,
    canCheckout,
    deepLink: {
      appSchemeUrl: `gametime://checkout/${session.id}`,
      webFallbackUrl: `/checkout/${session.id}?surface=mobile_web`,
    },
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
      <noscript>
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs text-amber-400">
          JavaScript is currently disabled. Critical ticket details are
          pre-rendered below, but real-time timer sync requires JavaScript.
        </div>
      </noscript>

      <CheckoutClient
        sessionId={sessionId}
        initialSurface={surface}
        initialData={initialData}
        isDemoSplitView={isDemoSplitView}
      />
    </main>
  );
}
