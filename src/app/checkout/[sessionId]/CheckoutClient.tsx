"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useCheckoutSession } from "@/lib/hooks/useCheckoutSession";
import { CheckoutSurface, ResumeSessionResponse } from "@/lib/types/checkout";
import { QRCodeSVG } from "qrcode.react";
import {
  Clock,
  ShieldCheck,
  AlertTriangle,
  Smartphone,
  CheckCircle2,
  XCircle,
  Copy,
  RefreshCw,
  Zap,
  QrCode,
} from "lucide-react";

interface CheckoutClientProps {
  sessionId: string;
  initialSurface: CheckoutSurface;
  initialData: ResumeSessionResponse;
  isDemoSplitView?: boolean;
}

export default function CheckoutClient({
  sessionId,
  initialSurface,
  initialData,
  isDemoSplitView = false,
}: CheckoutClientProps) {
  // Client-side viewport detection for standalone mode
  const [isClientMobile, setIsClientMobile] = useState<boolean>(() => {
    return initialSurface === "mobile_web" || initialSurface === "mobile_app";
  });

  useEffect(() => {
    const checkViewport = () => {
      const isNarrow = window.innerWidth < 768;
      const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(
        navigator.userAgent,
      );
      setIsClientMobile(
        initialSurface === "mobile_web" || isNarrow || isMobileUA,
      );
    };

    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, [initialSurface]);

  // Demo split view
  if (isDemoSplitView) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="text-emerald-500 font-black">GAMETIME</span>
              <span className="text-neutral-500 text-sm font-normal">
                | Checkout Continuity Demo
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              Live dual-surface demonstration running on a single active
              checkout session.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time Polling Active (2s)
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Surface 1: Desktop Web (7 cols) */}
          <section className="lg:col-span-7 bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-200">
                  Desktop Web Experience
                </h2>
              </div>
              <span className="text-xs text-neutral-400 font-mono">
                desktop_web
              </span>
            </div>
            <SingleCheckoutSurface
              sessionId={sessionId}
              surface="desktop_web"
              initialData={initialData}
              isMobileLayout={false}
            />
          </section>

          {/* Surface 2: Mobile Simulation Frame (5 cols) */}
          <section className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-95 bg-neutral-950 border-4 border-neutral-800 rounded-[2.5rem] p-4 shadow-2xl overflow-hidden relative">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 h-4 w-28 bg-neutral-800 rounded-full z-20" />

              <div className="mt-4 mb-2 flex items-center justify-between border-b border-neutral-800/80 pb-2 px-1">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-neutral-300">
                    Mobile Deep Link View
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">
                  mobile_web
                </span>
              </div>

              <SingleCheckoutSurface
                sessionId={sessionId}
                surface="mobile_web"
                initialData={initialData}
                isMobileLayout={true}
              />
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Standalone Single-Surface View (Responsive)
  return (
    <div
      className={`mx-auto px-4 py-8 ${isClientMobile ? "max-w-md" : "max-w-xl"}`}
    >
      <SingleCheckoutSurface
        sessionId={sessionId}
        surface={isClientMobile ? "mobile_web" : initialSurface}
        initialData={initialData}
        isMobileLayout={isClientMobile}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-Component: Individual Surface Interactive Card
// -----------------------------------------------------------------------------

interface SingleCheckoutSurfaceProps {
  sessionId: string;
  surface: CheckoutSurface;
  initialData: ResumeSessionResponse;
  isMobileLayout: boolean;
}

function SingleCheckoutSurface({
  sessionId,
  surface,
  initialData,
  isMobileLayout,
}: SingleCheckoutSurfaceProps) {
  const {
    session,
    canCheckout,
    completeCheckout,
    isCompleting,
    completionError,
    acceptPriceChange,
    isAcceptingPrice,
    triggerMockAction,
    isTriggeringMock,
  } = useCheckoutSession({
    sessionId,
    surface,
    initialData,
  });

  const [copiedLink, setCopiedLink] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const deepLinkUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/${sessionId}?surface=mobile_web`
      : `/checkout/${sessionId}?surface=mobile_web`;

  // Deterministic initial timestamp matching the server payload
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(() => {
    const s = initialData.session;
    return s ? s.expiresAt - (s.ttlRemainingMs ?? 300000) : Date.now();
  });

  // Pure interval subscription: NO synchronous setState in effect body
  useEffect(() => {
    if (
      !session ||
      session.status === "COMPLETED" ||
      session.status === "EXPIRED"
    ) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.status, session?.expiresAt]);

  // Purely derived countdown timer value
  const timeLeftMs = useMemo(() => {
    if (!session) return 0;
    return Math.max(0, session.expiresAt - currentTimestamp);
  }, [session, currentTimestamp]);

  const formattedTimer = useMemo(() => {
    const totalSeconds = Math.floor(timeLeftMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }, [timeLeftMs]);

  const idempotencyKey = useMemo(() => {
    return `idemp_${sessionId}_${surface}`;
  }, [sessionId, surface]);

  if (!session) return null;

  // Server-authoritative status flags
  const isExpired = session.status === "EXPIRED";
  const isPriceChanged = session.status === "PRICE_CHANGED";
  const isCompleted = session.status === "COMPLETED";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(deepLinkUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* 1. Terminal Success State */}
      {isCompleted && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-5 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400 mb-2" />
          <h3 className="text-lg font-bold text-white">Order Confirmed!</h3>
          <p className="text-xs text-neutral-300 mt-1">
            Order Reference:{" "}
            <span className="font-mono text-emerald-400 font-semibold">
              {session.orderId}
            </span>
          </p>
          <p className="text-xs text-neutral-400 mt-2">
            Tickets will appear in your Gametime wallet. Inventory is locked and
            confirmed.
          </p>
        </div>
      )}

      {/* 2. Terminal Expired State */}
      {isExpired && !isCompleted && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-center">
          <XCircle className="mx-auto h-8 w-8 text-rose-400 mb-1" />
          <h3 className="text-sm font-bold text-rose-200">
            Inventory Lease Expired
          </h3>
          <p className="text-xs text-neutral-300 mt-1">
            Your 5-minute hold timed out and tickets were returned to the
            marketplace.
          </p>
          <button
            onClick={() => triggerMockAction({ action: "RESET_SESSION" })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 transition cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" /> Re-lease Listing
          </button>
        </div>
      )}

      {/* 3. Non-Terminal Active View */}
      {!isCompleted && !isExpired && (
        <>
          {/* Expiration Timer Banner */}
          <div className="flex items-center justify-between rounded-xl bg-neutral-800/80 px-4 py-2.5 border border-neutral-700/50">
            <div className="flex items-center gap-2">
              <Clock
                className={`h-4 w-4 ${timeLeftMs < 60000 ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}
              />
              <span className="text-xs font-medium text-neutral-300">
                Holding Tickets
              </span>
            </div>
            <div
              suppressHydrationWarning
              className="font-mono text-sm font-bold text-white tracking-wider"
            >
              {formattedTimer}
            </div>
          </div>

          {/* Price Drift Recovery Banner */}
          {isPriceChanged && session.priceDrift && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Price Updated While You Were Away
                  </h4>
                  <p className="text-xs mt-1 text-neutral-300 leading-relaxed">
                    Market pricing updated from{" "}
                    <span className="line-through text-neutral-400 font-mono">
                      ${session.priceDrift.previousTotal.toFixed(2)}
                    </span>{" "}
                    to{" "}
                    <span className="font-bold text-white font-mono">
                      ${session.priceDrift.newTotal.toFixed(2)}
                    </span>{" "}
                    (+${session.priceDrift.delta.toFixed(2)} total).
                  </p>
                  <button
                    disabled={isAcceptingPrice}
                    onClick={() =>
                      acceptPriceChange({ acceptedTotal: session.price.total })
                    }
                    className="mt-3 w-full rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-neutral-950 hover:bg-amber-400 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                  >
                    {isAcceptingPrice
                      ? "Updating Lock..."
                      : "Accept New Total & Continue"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Concurrency Error Banner */}
          {completionError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3.5 text-rose-200 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Checkout Blocked: </span>
                {completionError.message}
              </div>
            </div>
          )}

          {/* Ticket Listing Card */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/90 p-4 space-y-3">
            {/* Mobile-Optimized Ticket Header & Pill */}
            {isMobileLayout && (
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2.5 mb-1 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold tracking-wide">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Gametime Mobile Pass
                </span>
                <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                  In-App Wallet Ready
                </span>
              </div>
            )}

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Confirmed Listing
              </span>
              <h3 className="text-sm font-bold text-white mt-0.5">
                {session.listing.eventName}
              </h3>
              <p className="text-xs text-neutral-400">
                {session.listing.venueName}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg bg-neutral-950 p-2.5 text-center border border-neutral-800/80">
              <div>
                <div className="text-[10px] uppercase text-neutral-400 font-semibold">
                  Section
                </div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {session.listing.section}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-neutral-400 font-semibold">
                  Row
                </div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {session.listing.row}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-neutral-400 font-semibold">
                  Quantity
                </div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {session.listing.quantity} Tickets
                </div>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="border-t border-neutral-800 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Tickets ({session.listing.quantity}x)</span>
                <span className="font-mono text-neutral-200">
                  ${session.price.basePrice.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Service & Facility Fees</span>
                <span className="font-mono text-neutral-200">
                  $
                  {(
                    session.price.serviceFee + session.price.facilityFee
                  ).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-neutral-800">
                <span>All-In Total</span>
                <span className="font-mono text-emerald-400">
                  ${session.price.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2">
            <button
              disabled={!canCheckout || isCompleting}
              onClick={() =>
                completeCheckout({ idempotencyKey, paymentType: "CREDIT_CARD" })
              }
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide transition flex items-center justify-center gap-2 ${
                canCheckout && !isCompleting
                  ? "bg-emerald-500 text-neutral-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 active:scale-[0.99] cursor-pointer"
                  : "bg-neutral-800 text-neutral-400 cursor-not-allowed border border-neutral-700"
              }`}
            >
              {isCompleting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Securing Tickets...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Place Order (${session.price.total.toFixed(2)})
                </>
              )}
            </button>
            {isMobileLayout && (
              <div className="text-[11px] text-center text-neutral-500 mt-2">
                1-Click Purchase via Mobile Session
              </div>
            )}
          </div>
        </>
      )}

      {/* Continuity Share / Deep Link & QR Code (Desktop Only) */}
      {!isMobileLayout && (
        <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <Smartphone className="h-4 w-4 text-emerald-400" />
              <span>Resume this session on mobile:</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowQr((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition border ${
                  showQr
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 cursor-pointer"
                    : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700 cursor-pointer"
                }`}
              >
                <QrCode className="h-3.5 w-3.5" />
                {showQr ? "Hide QR" : "Show QR"}
              </button>
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1 rounded-lg bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 transition cursor-pointer"
              >
                <Copy className="h-3 w-3" />
                {copiedLink ? "Copied!" : "Copy Link"}
              </button>
            </div>
          </div>

          {/* Expandable QR Code Scanner Card */}
          {showQr && deepLinkUrl && (
            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-lg bg-neutral-950 p-4 border border-neutral-800 animate-in fade-in zoom-in-95 duration-150">
              <div className="p-2.5 bg-white rounded-xl shadow-md shrink-0">
                <QRCodeSVG
                  value={deepLinkUrl}
                  size={128}
                  level="M"
                  marginSize={0}
                />
              </div>
              <div className="text-center sm:text-left space-y-1">
                <div className="text-xs font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  Live Cross-Device Hand-off
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Scan with your mobile camera to resume this exact reservation.
                  Both screens will synchronize in real time.
                </p>
                <div className="pt-1 font-mono text-[10px] text-neutral-500 max-w-70">
                  {deepLinkUrl}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reviewer Simulation Control Panel */}
      <div className="mt-4 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/80 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
          <Zap className="h-3.5 w-3.5 text-amber-400" /> Reviewer State Controls
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            disabled={isTriggeringMock || isCompleted || isExpired}
            onClick={() =>
              triggerMockAction({
                action: "TRIGGER_PRICE_CHANGE",
                priceDelta: 15.0,
              })
            }
            className="rounded bg-neutral-800/90 py-1.5 px-2 text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-40 transition cursor-pointer"
          >
            + $15 Price Surge
          </button>
          <button
            disabled={isTriggeringMock || isCompleted || isExpired}
            onClick={() => triggerMockAction({ action: "FORCE_EXPIRE" })}
            className="rounded bg-neutral-800/90 py-1.5 px-2 text-[11px] font-medium text-rose-300 hover:bg-neutral-700 disabled:opacity-40 transition cursor-pointer"
          >
            Force Expire TTL
          </button>
          <button
            disabled={isTriggeringMock}
            onClick={() => triggerMockAction({ action: "RESET_SESSION" })}
            className="rounded bg-neutral-800/90 py-1.5 px-2 text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-40 transition cursor-pointer"
          >
            Reset Session
          </button>
        </div>
      </div>
    </div>
  );
}
