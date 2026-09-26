"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AcceptPriceChangeRequest,
  AcceptPriceChangeResponse,
  CheckoutSurface,
  CompleteCheckoutRequest,
  CompleteCheckoutResponse,
  ResumeSessionResponse,
} from "@/lib/types/checkout";

interface UseCheckoutSessionOptions {
  sessionId: string;
  surface: CheckoutSurface;
  initialData?: ResumeSessionResponse;
}

export function useCheckoutSession({
  sessionId,
  surface,
  initialData,
}: UseCheckoutSessionOptions) {
  const queryClient = useQueryClient();
  const queryKey = ["checkout-session", sessionId, surface];

  // 1. Polling Query: Syncs server state every 2 seconds across all devices
  const sessionQuery = useQuery<ResumeSessionResponse, Error>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/checkout/${sessionId}?surface=${surface}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch checkout session (${res.status})`);
      }
      return res.json();
    },
    initialData,
    staleTime: 1000,
    refetchInterval: (query) => {
      const status = query.state.data?.session?.status;
      // Stop continuous polling once in a terminal state
      if (status === "COMPLETED" || status === "EXPIRED") {
        return false;
      }
      return 2000;
    },
    refetchOnWindowFocus: true,
  });

  // Resume Reconciliation: polling pauses while the tab is hidden, and mobile
  // browsers may freeze or restore the page from bfcache without a focus event.
  // Force a server read on return so an elapsed lease surfaces as EXPIRED.
  const { refetch } = sessionQuery;
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refetch();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [refetch]);

  // 2. Mutation: Complete checkout with idempotency guard
  const completeMutation = useMutation<
    CompleteCheckoutResponse,
    Error,
    { idempotencyKey: string; paymentType?: "APPLE_PAY" | "CREDIT_CARD" }
  >({
    mutationFn: async ({ idempotencyKey, paymentType = "APPLE_PAY" }) => {
      const payload: CompleteCheckoutRequest = {
        surface,
        idempotencyKey,
        paymentMethodStub: {
          type: paymentType,
          lastFour: "4242",
        },
      };

      const res = await fetch(`/api/checkout/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok && !data.error) {
        throw new Error("Failed to process checkout transaction");
      }
      return data;
    },
    onSuccess: (data) => {
      // Instantly update query cache so the order confirmation renders on the next frame
      if (data?.session) {
        queryClient.setQueriesData<ResumeSessionResponse>(
          { queryKey: ["checkout-session", sessionId] },
          (old) => {
            const prev = old || initialData;
            if (!prev) return undefined;
            return {
              ...prev,
              session: data.session,
              canCheckout: false,
              isStale: false,
            };
          },
        );
      }
      // Revalidate in background to ensure all surface caches remain synchronized
      queryClient.invalidateQueries({
        queryKey: ["checkout-session", sessionId],
      });
    },
  });

  // 3. Mutation: Acknowledge and accept price drift
  const acceptPriceMutation = useMutation<
    AcceptPriceChangeResponse,
    Error,
    { acceptedTotal: number }
  >({
    mutationFn: async ({ acceptedTotal }) => {
      const payload: AcceptPriceChangeRequest = {
        surface,
        acceptedTotal,
      };

      const res = await fetch(`/api/checkout/${sessionId}/accept-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.error || "Failed to acknowledge price change",
        );
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Instantly clear the price drift alert and return status to ACTIVE
      if (data?.session) {
        queryClient.setQueriesData<ResumeSessionResponse>(
          { queryKey: ["checkout-session", sessionId] },
          (old) => {
            const prev = old || initialData;
            if (!prev) return undefined;
            return {
              ...prev,
              session: data.session,
              canCheckout: data.session.status === "ACTIVE",
              isStale: data.session.status === "EXPIRED",
            };
          },
        );
      }
      queryClient.invalidateQueries({
        queryKey: ["checkout-session", sessionId],
      });
    },
  });

  // 4. Mutation: Reviewer simulator controls
  const mockActionMutation = useMutation({
    mutationFn: async ({
      action,
      priceDelta,
    }: {
      action: string;
      priceDelta?: number;
    }) => {
      const res = await fetch(`/api/checkout/${sessionId}/mock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, priceDelta }),
      });
      if (!res.ok) {
        throw new Error("Failed to execute simulation trigger");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.session) {
        queryClient.setQueriesData<ResumeSessionResponse>(
          { queryKey: ["checkout-session", sessionId] },
          (old) => {
            const prev = old || initialData;
            if (!prev) return undefined;
            return {
              ...prev,
              session: data.session,
              isStale: data.session.status === "EXPIRED",
              canCheckout: data.session.status === "ACTIVE",
            };
          },
        );
      }
      queryClient.invalidateQueries({
        queryKey: ["checkout-session", sessionId],
      });
    },
  });

  return {
    session: sessionQuery.data?.session,
    orderId: completeMutation.data?.orderId,
    isStale: sessionQuery.data?.isStale ?? false,
    canCheckout: sessionQuery.data?.canCheckout ?? false,
    deepLink: sessionQuery.data?.deepLink,
    isLoading: sessionQuery.isLoading,
    isError: sessionQuery.isError,
    error: sessionQuery.error,
    refetch,
    // Actions
    completeCheckout: completeMutation.mutateAsync,
    isCompleting: completeMutation.isPending,
    completionError: completeMutation.data?.error,
    acceptPriceChange: acceptPriceMutation.mutateAsync,
    isAcceptingPrice: acceptPriceMutation.isPending,
    triggerMockAction: mockActionMutation.mutateAsync,
    isTriggeringMock: mockActionMutation.isPending,
  };
}
