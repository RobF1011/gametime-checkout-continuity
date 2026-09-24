/**
 * lib/store/inMemoryStore.ts
 *
 * Singleton in-memory store managing checkout session lifecycles,
 * finite state machine transitions, leasing TTLs, and cross-surface concurrency locks.
 */

import { randomUUID } from "crypto";
import {
  CheckoutSession,
  CheckoutSurface,
  CreateSessionRequest,
  EventListing,
  PriceBreakdown,
  SessionInvalidReason,
} from "../types/checkout";

// Standard 5-minute inventory hold lease
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
// 30-second processing lock to avoid permanent deadlocks if a client drops mid-payment
const PROCESSING_LOCK_TIMEOUT_MS = 30 * 1000;

// Seed sample listing
const SAMPLE_LISTING: EventListing = {
  id: "list_yankees_redsox_2026",
  eventName: "New York Yankees vs. Boston Red Sox",
  venueName: "Yankee Stadium - Bronx, NY",
  eventDate: "2026-10-04T19:05:00Z",
  section: "Main Level 114A",
  row: "8",
  quantity: 2,
  imageUrl:
    "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=600&q=80",
};

class CheckoutSessionStore {
  private sessions = new Map<string, CheckoutSession>();

  /**
   * Initialize a new checkout session and lock inventory with a TTL.
   */
  public createSession(req: CreateSessionRequest): CheckoutSession {
    const now = Date.now();
    const sessionId = randomUUID();
    const baseTicketPrice = 115.0;
    const serviceFee = 24.5;
    const facilityFee = 5.5;
    const total =
      (baseTicketPrice + serviceFee + facilityFee) * (req.quantity || 2);

    const price: PriceBreakdown = {
      basePrice: baseTicketPrice * (req.quantity || 2),
      serviceFee: serviceFee * (req.quantity || 2),
      facilityFee: facilityFee * (req.quantity || 2),
      total,
      currency: "USD",
    };

    const session: CheckoutSession = {
      id: sessionId,
      listing: { ...SAMPLE_LISTING, quantity: req.quantity || 2 },
      status: "ACTIVE",
      inventoryStatus: "HELD",
      price,
      createdAt: now,
      expiresAt: now + DEFAULT_SESSION_TTL_MS,
      ttlRemainingMs: DEFAULT_SESSION_TTL_MS,
      originSurface: req.surface,
      lastResumedSurface: req.surface,
      lastActiveAt: now,
    };

    this.sessions.set(sessionId, session);
    return this.evaluateSessionState(session);
  }

  /**
   * Resumes a session from any surface, evaluating expiration and lock validity.
   */
  public getSession(
    sessionId: string,
    currentSurface?: CheckoutSurface,
  ): CheckoutSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (currentSurface) {
      session.lastResumedSurface = currentSurface;
      session.lastActiveAt = Date.now();
    }

    return this.evaluateSessionState(session);
  }

  /**
   * Acknowledges and accepts an updated market price, moving session back to ACTIVE.
   */
  public acceptPriceChange(
    sessionId: string,
    surface: CheckoutSurface,
    acceptedTotal: number,
  ): { success: boolean; session?: CheckoutSession; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: "Session not found" };

    this.evaluateSessionState(session);

    if (session.status === "EXPIRED") {
      return {
        success: false,
        error: "Session expired before price acceptance",
      };
    }

    if (session.status !== "PRICE_CHANGED") {
      return { success: false, error: "Session is not in PRICE_CHANGED state" };
    }

    if (Math.abs(session.price.total - acceptedTotal) > 0.01) {
      return {
        success: false,
        error: "Acknowledged total does not match current price",
      };
    }

    // Accept price and resume active hold
    session.status = "ACTIVE";
    session.priceDrift = undefined;
    session.lastResumedSurface = surface;
    session.lastActiveAt = Date.now();

    return { success: true, session: this.evaluateSessionState(session) };
  }

  /**
   * Atomically acquire a processing lock and complete the checkout session.
   * Handles idempotency, cross-surface lock conflicts, and expired leases.
   */
  public completeCheckout(
    sessionId: string,
    surface: CheckoutSurface,
    idempotencyKey: string,
  ): {
    success: boolean;
    session?: CheckoutSession;
    orderId?: string;
    errorCode?: SessionInvalidReason;
    errorMessage?: string;
    conflictingSurface?: CheckoutSurface;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        errorCode: "INVENTORY_UNAVAILABLE",
        errorMessage: "Checkout session does not exist.",
      };
    }

    // Evaluate state machine transitions
    this.evaluateSessionState(session);

    // 1. Idempotency Check (Already Completed)
    if (session.status === "COMPLETED") {
      if (session.idempotencyKey === idempotencyKey) {
        return {
          success: true,
          session,
          orderId: session.orderId,
        };
      }
      return {
        success: false,
        errorCode: "ALREADY_COMPLETED",
        errorMessage: "This order has already been finalized.",
      };
    }

    // 2. Lease Expiration Check
    if (session.status === "EXPIRED") {
      return {
        success: false,
        errorCode: "TTL_EXPIRED",
        errorMessage: "Inventory hold expired. Tickets have been released.",
      };
    }

    // 3. Unresolved Price Drift Check
    if (session.status === "PRICE_CHANGED") {
      return {
        success: false,
        errorCode: "PRICE_DRIFT_UNACCEPTED",
        errorMessage:
          "Price has changed. You must review and accept the new total.",
      };
    }

    const now = Date.now();

    // 4. Concurrency Mutex Lock Check (Device A vs Device B)
    if (session.status === "PROCESSING" && session.activeLock) {
      if (
        session.activeLock.lockedBySurface !== surface &&
        now < session.activeLock.lockExpiresAt
      ) {
        return {
          success: false,
          errorCode: "CONCURRENT_PROCESSING_CONFLICT",
          errorMessage: `Payment is already being processed on ${session.activeLock.lockedBySurface}.`,
          conflictingSurface: session.activeLock.lockedBySurface,
        };
      }
    }

    // 5. Acquire Atomic Lock
    session.status = "PROCESSING";
    session.activeLock = {
      lockedBySurface: surface,
      lockedAt: now,
      lockExpiresAt: now + PROCESSING_LOCK_TIMEOUT_MS,
    };
    session.idempotencyKey = idempotencyKey;

    // Simulate completion
    session.status = "COMPLETED";
    session.inventoryStatus = "PURCHASED";
    session.orderId = `GT-ORD-${randomUUID().slice(0, 8).toUpperCase()}`;
    session.activeLock = undefined;

    return {
      success: true,
      session: this.evaluateSessionState(session),
      orderId: session.orderId,
    };
  }

  // ---------------------------------------------------------------------------
  // Reviewer Mock & Simulation Triggers
  // ---------------------------------------------------------------------------

  public triggerMockPriceChange(
    sessionId: string,
    delta: number = 15.0,
  ): CheckoutSession | null {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      session.status === "COMPLETED" ||
      session.status === "EXPIRED"
    )
      return null;

    const previousTotal = session.price.total;
    const newTotal = previousTotal + delta;

    session.price.basePrice += delta;
    session.price.total = newTotal;
    session.status = "PRICE_CHANGED";
    session.priceDrift = {
      previousTotal,
      newTotal,
      delta,
      reason: "SURGE_DYNAMIC_PRICING",
      occurredAt: Date.now(),
    };

    return this.evaluateSessionState(session);
  }

  public triggerMockExpiration(sessionId: string): CheckoutSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === "COMPLETED") return null;

    session.expiresAt = Date.now() - 1000;
    return this.evaluateSessionState(session);
  }

  public resetMockSession(sessionId: string): CheckoutSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();
    session.status = "ACTIVE";
    session.inventoryStatus = "HELD";
    session.expiresAt = now + DEFAULT_SESSION_TTL_MS;
    session.priceDrift = undefined;
    session.activeLock = undefined;
    session.orderId = undefined;
    session.idempotencyKey = undefined;

    return this.evaluateSessionState(session);
  }

  // ---------------------------------------------------------------------------
  // Internal State Machine Evaluator
  // ---------------------------------------------------------------------------

  private evaluateSessionState(session: CheckoutSession): CheckoutSession {
    const now = Date.now();
    session.ttlRemainingMs = Math.max(0, session.expiresAt - now);

    // If completed, terminal state
    if (session.status === "COMPLETED") {
      return session;
    }

    // Check expiration rule
    if (session.ttlRemainingMs <= 0 && session.status !== "EXPIRED") {
      session.status = "EXPIRED";
      session.inventoryStatus = "RELEASED";
      session.activeLock = undefined;
    }

    // Clear stale processing locks if timeout exceeded without completion
    if (
      session.status === "PROCESSING" &&
      session.activeLock &&
      now > session.activeLock.lockExpiresAt
    ) {
      session.status = "ACTIVE";
      session.activeLock = undefined;
    }

    return session;
  }
}

// Global singleton declaration to preserve state across Next.js dev server hot-reloads
const globalForStore = globalThis as unknown as {
  checkoutStoreInstance?: CheckoutSessionStore;
};

export const checkoutStore =
  globalForStore.checkoutStoreInstance ?? new CheckoutSessionStore();

if (process.env.NODE_ENV !== "production") {
  globalForStore.checkoutStoreInstance = checkoutStore;
}
