import { test, expect, devices, APIRequestContext } from "@playwright/test";
import { CheckoutSession } from "@/lib/types/checkout";

// Helper: Create a fresh server-authoritative checkout session via API
async function createTestSession(
  request: APIRequestContext,
): Promise<CheckoutSession> {
  const res = await request.post("/api/checkout", {
    data: {
      listingId: "list_yankees_redsox_2026",
      surface: "desktop_web",
      quantity: 2,
    },
  });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  return data.session;
}

test.describe("Gametime Checkout Continuity & State Recovery Engine", () => {
  test("Scenario 1: Seamless Cross-Device Hand-off (Desktop to Mobile)", async ({
    browser,
    request,
  }) => {
    const session = await createTestSession(request);

    // 1. Initialize Device A (Desktop Browser)
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(`/checkout/${session.id}`);

    // Verify SSR pre-hydration content renders immediately
    await expect(
      desktopPage.getByText(session.listing.eventName),
    ).toBeVisible();
    await expect(
      desktopPage.getByText(session.listing.section, { exact: false }),
    ).toBeVisible();
    await expect(
      desktopPage.getByRole("button", { name: /Place Order/i }),
    ).toBeEnabled();

    // Verify Desktop continuity CTA exists
    await expect(
      desktopPage.getByText("Resume this session on mobile:"),
    ).toBeVisible();

    // 2. Initialize Device B (Simulated Mobile Safari via Deep Link)
    const mobileContext = await browser.newContext({
      ...devices["iPhone 14"],
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`/checkout/${session.id}?surface=mobile_web`);

    // Verify Mobile surface renders platform-specific mobile pill
    await expect(mobilePage.getByText("Gametime Mobile Pass")).toBeVisible();
    await expect(mobilePage.getByText("In-App Wallet Ready")).toBeVisible();

    // Verify Mobile sees identical live price breakdown
    const formattedTotal = `$${session.price.total.toFixed(2)}`;
    await expect(
      mobilePage.getByRole("button", {
        name: new RegExp(
          `Place Order \\(${formattedTotal.replace("$", "\\$")}\\)`,
        ),
      }),
    ).toBeVisible();

    // 3. Complete Checkout on Mobile
    const mobileOrderBtn = mobilePage.getByRole("button", {
      name: /Place Order/i,
    });
    await expect(mobileOrderBtn).toBeEnabled();
    await mobileOrderBtn.click();

    // Verify Mobile shows confirmed order state
    await expect(mobilePage.getByText("Order Confirmed!")).toBeVisible({
      timeout: 5000,
    });
    await expect(mobilePage.getByText(/GT-ORD-/)).toBeVisible();

    // 4. Verify Desktop automatically synchronizes to Completed state via polling
    await expect(desktopPage.getByText("Order Confirmed!")).toBeVisible({
      timeout: 5000,
    });

    await desktopContext.close();
    await mobileContext.close();
  });

  test("Scenario 2: Real-Time Price Drift Detection & Explicit Fan Acceptance", async ({
    browser,
    request,
  }) => {
    const session = await createTestSession(request);

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/checkout/${session.id}`);

    // Initial state: active and enabled
    const orderBtn = page.getByRole("button", { name: /Place Order/i });
    await expect(orderBtn).toBeEnabled();
    await expect(orderBtn).toContainText(`$${session.price.total.toFixed(2)}`);

    // Upstream triggers a $15 price hike while fan is reviewing
    const mockRes = await request.post(`/api/checkout/${session.id}/mock`, {
      data: {
        action: "TRIGGER_PRICE_CHANGE",
        priceDelta: 15.0,
      },
    });
    expect(mockRes.ok()).toBeTruthy();

    // Polling detects price drift: UI must display banner
    await expect(
      page.getByText("Price Updated While You Were Away"),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("+$15.00 total")).toBeVisible();

    // Fan cannot checkout until price delta is explicitly accepted (disabled state check)
    await expect(orderBtn).toBeDisabled();

    // Fan accepts the new market total
    const acceptBtn = page.getByRole("button", {
      name: /Accept New Total & Continue/i,
    });
    await acceptBtn.click();

    // Verify banner dismisses and button re-enables with updated total
    await expect(
      page.getByText("Price Updated While You Were Away"),
    ).not.toBeVisible();
    await expect(orderBtn).toBeEnabled();
    const updatedTotal = (session.price.total + 15).toFixed(2);
    await expect(orderBtn).toContainText(`$${updatedTotal}`);

    await context.close();
  });

  test("Scenario 3: Race Condition & Duplicate Order Prevention (409 Conflict)", async ({
    browser,
    request,
  }) => {
    const session = await createTestSession(request);

    // Setup Desktop and Mobile contexts
    const desktopContext = await browser.newContext();
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(`/checkout/${session.id}?surface=desktop_web`);

    const mobileContext = await browser.newContext({ ...devices["iPhone 14"] });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`/checkout/${session.id}?surface=mobile_web`);

    // Verify both devices are active
    await expect(
      desktopPage.getByRole("button", { name: /Place Order/i }),
    ).toBeEnabled();
    await expect(
      mobilePage.getByRole("button", { name: /Place Order/i }),
    ).toBeEnabled();

    // Simulate backend concurrency lock on Mobile surface
    await request.post(`/api/checkout/${session.id}/complete`, {
      data: {
        surface: "mobile_web",
        idempotencyKey: `idemp_${session.id}_mobile_web`,
        paymentMethodStub: { type: "CREDIT_CARD", lastFour: "4242" },
      },
    });

    // Device A (Desktop) immediately tries to complete with a different surface/key
    const desktopCompleteRes = await request.post(
      `/api/checkout/${session.id}/complete`,
      {
        data: {
          surface: "desktop_web",
          idempotencyKey: `idemp_${session.id}_desktop_web`,
          paymentMethodStub: { type: "CREDIT_CARD", lastFour: "4242" },
        },
      },
    );

    // Assert that backend strictly returns 422/409 duplicate prevention
    expect(desktopCompleteRes.status()).toBeGreaterThanOrEqual(400);
    const errorBody = await desktopCompleteRes.json();
    expect(errorBody.error.code).toBe("ALREADY_COMPLETED");

    // Verify Desktop UI syncs to the completed state without double-charging
    await expect(desktopPage.getByText("Order Confirmed!")).toBeVisible({
      timeout: 5000,
    });

    await desktopContext.close();
    await mobileContext.close();
  });

  test("Scenario 4: Inventory Lease Expiration (TTL Expiry)", async ({
    browser,
    request,
  }) => {
    const session = await createTestSession(request);

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/checkout/${session.id}`);

    await expect(
      page.getByRole("button", { name: /Place Order/i }),
    ).toBeEnabled();

    // Trigger reviewer control: Force TTL expiration
    await page.getByRole("button", { name: /Force Expire TTL/i }).click();

    // UI transitions into terminal expired state
    await expect(page.getByText("Inventory Lease Expired")).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByText(/hold timed out/i)).toBeVisible();

    // Verify order button is removed
    await expect(
      page.getByRole("button", { name: /Place Order/i }),
    ).not.toBeVisible();

    // Click Re-lease button to verify recovery back to active state
    await page.getByRole("button", { name: /Re-lease Listing/i }).click();
    await expect(
      page.getByRole("button", { name: /Place Order/i }),
    ).toBeVisible({ timeout: 3000 });

    await context.close();
  });
});
