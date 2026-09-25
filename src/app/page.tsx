"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ticket, ArrowRight, ShieldCheck } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const handleStartCheckout = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: "list_yankees_redsox_2026",
          surface: "desktop_web",
          quantity: 2,
        }),
      });

      const data = await res.json();
      if (res.ok && data.session?.id) {
        // Redirect directly into the dual-surface reviewer demo mode
        router.push(`/checkout/${data.session.id}?demo=true`);
      } else {
        alert("Failed to initiate checkout session");
        setIsCreating(false);
      }
    } catch (err) {
      console.error(err);
      alert("Network error initiating session");
      setIsCreating(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-linear-to-b from-neutral-950 via-neutral-900 to-neutral-950">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-black tracking-tight text-xl">
              GAMETIME
            </span>
          </div>
          <span className="text-xs font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
            Prototype
          </span>
        </div>

        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            Featured Event Listing
          </span>
          <h2 className="text-lg font-bold text-white mt-1">
            New York Yankees vs. Boston Red Sox
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Yankee Stadium • Section 114A, Row 8
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-950 border border-neutral-800/80 p-4 space-y-2">
          <div className="flex justify-between items-center text-xs text-neutral-400">
            <span>Listing Quantity</span>
            <span className="font-semibold text-neutral-200">2 Tickets</span>
          </div>
          <div className="flex justify-between items-center text-xs text-neutral-400">
            <span>Pricing Guarantee</span>
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" /> All-In Upfront
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-neutral-800 text-sm font-bold text-white">
            <span>Total with Fees</span>
            <span className="text-emerald-400 font-mono text-base">
              $290.00
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            disabled={isCreating}
            onClick={handleStartCheckout}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-emerald-500 text-neutral-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isCreating ? (
              "Locking Inventory..."
            ) : (
              <>
                <Ticket className="h-4 w-4" />
                Hold Tickets & Start Checkout
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-neutral-400 leading-relaxed">
            Clicking initiates a 5-minute inventory lease on the server and
            loads the dual-surface demo view.
          </p>
        </div>
      </div>
    </main>
  );
}
