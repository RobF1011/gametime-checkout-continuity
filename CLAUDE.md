@AGENTS.md

# Gametime Checkout Continuity Prototype — AI Developer Guidelines

## 1. Project Overview & Architectural Mission

This repository implements an end-to-end slice of Gametime's live ticket checkout continuity engine:

- **Server-Authoritative State:** Ephemeral inventory reservations governed by an in-memory Finite State Machine (FSM) with explicit TTLs (5-minute hold leases).
- **Concurrency & Idempotency:** Surface-aware mutexes to prevent double-charges and race conditions across multiple active devices (`desktop_web`, `mobile_web`, `mobile_app`).
- **Resilient Recovery:** Upstream price drift requiring explicit fan re-consent, inventory lease timeouts, and zero-JS SSR pre-hydration.

---

## 2. Core Tech Stack

- **Framework:** Next.js (App Router, Server Components + Client Boundaries inside `src/`)
- **Language & Runtime:** TypeScript (Strict), Node.js 24
- **State Management & Data Fetching:** TanStack React Query v5 (polling every 2s for cross-surface sync)
- **Styling & UI:** Tailwind CSS, Lucide React
- **Testing:** Playwright E2E (`tests/checkout-continuity.spec.ts`)

---

## 3. Directory Structure

```text
├── tests/                             # Root level: Playwright E2E test suite
│   └── checkout-continuity.spec.ts
├── src/                               # Application source root (@/* alias)
│   ├── app/
│   │   ├── layout.tsx                 # Root layout wrapping QueryClientProvider
│   │   ├── providers.tsx              # React Query client instance configuration
│   │   ├── page.tsx                   # Initial event listing & session kickoff
│   │   ├── api/checkout/
│   │   │   ├── route.ts               # POST: Create new checkout session
│   │   │   └── [sessionId]/
│   │   │       ├── route.ts           # GET: Resume session / poll live state
│   │   │       ├── complete/route.ts  # POST: Atomic lock & idempotent completion
│   │   │       ├── accept-price/route.ts # POST: Fan consent to price drift
│   │   │       └── mock/route.ts      # POST: Reviewer simulation triggers
│   │   └── checkout/[sessionId]/
│   │       ├── page.tsx               # SSR server entry; pre-hydrates ticket context
│   │       └── CheckoutClient.tsx     # Dual-mode UI (split demo view vs standalone)
│   └── lib/                           # Domain primitives, state store, and hooks
│       ├── store/inMemoryStore.ts     # Server FSM, inventory leases, and mutex locks
│       ├── hooks/useCheckoutSession.ts # React Query polling and mutation abstractions
│       └── types/checkout.ts          # Canonical domain contracts and state enums
```

---

## 4. Architectural Rules & Guardrails for AI

### A. React Compiler & SSR Hydration Purity

- **No Impure Renders:** Never invoke `Date.now()`, `new Date()`, or `Math.random()` in render functions, Server Components, or `useState` initializers.
- **Derived Clocks:** Initialize countdown clocks using server-calculated `session.ttlRemainingMs`. Confine runtime ticking (`Date.now()`) exclusively inside client-side `useEffect` intervals.
- **Hydration Safe:** Viewport detection and user-agent checks must happen client-side after mount to prevent server-client markup drift.

### B. Finite State Machine & Mutations

- All state transitions (`ACTIVE` -> `PROCESSING` -> `COMPLETED`, `PRICE_CHANGED`, `EXPIRED`) belong in `src/lib/store/inMemoryStore.ts`.
- **Never mutate session objects directly in route handlers.** Route all mutations through store methods (`acquireLock`, `completeSession`, `updatePrice`, `releaseSession`).
- **Surface Awareness:** Always pass the caller's `CheckoutSurface` parameter to distinguish between cross-device conflicts and single-device network retries.

### C. UI & Testing Standards

- **Playwright Strict Locators:** Avoid generic text matching for values that appear in multiple places (such as prices shown in both itemized summaries and CTA buttons). Use scoped role locators: `page.getByRole('button', { name: /Place Order/i })`.
- **Sequential Execution:** The test suite runs with `workers: 1` and `fullyParallel: false` to avoid polluting the state of the shared in-memory singleton.

---

## 5. Verification Commands

- **Development Server:** `npm run dev`
- **Type Check & Lint:** `npm run lint`
- **End-to-End Suite:** `npm run test:e2e`
- **End-to-End Suite (with UI):** `npm run test:e2e:ui`
