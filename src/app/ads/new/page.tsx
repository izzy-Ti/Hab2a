"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

export default function NewAdPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("SELL");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxOrder, setMaxOrder] = useState("");
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [terms, setTerms] = useState("");
  
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        router.push("/auth/login");
      } else {
        setUser(session.user);
        fetchUserProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) {
          router.push("/auth/login");
        } else {
          setUser(session.user);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const res = await fetch("/api/kyc/start");
      if (res.ok) {
        const data = await res.json();
        setProfile({ kycStatus: data.kycStatus });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (provider: string) => {
    if (selectedPayments.includes(provider)) {
      setSelectedPayments(selectedPayments.filter((p) => p !== provider));
    } else {
      setSelectedPayments([...selectedPayments, provider]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (selectedPayments.length === 0) {
      setError("Please select at least one payment method.");
      return;
    }

    if (Number(minOrder) > Number(maxOrder)) {
      setError("Minimum order amount cannot exceed maximum order amount.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeType,
          price: Number(price),
          amount: Number(amount),
          minOrder: Number(minOrder),
          maxOrder: Number(maxOrder),
          paymentMethods: selectedPayments,
          terms,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create advertisement");

      setSuccess("Advertisement published successfully!");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-t-transparent border-[#F3BA2F] rounded-full animate-spin"></div>
          <p className="text-[#929AA5]">Loading profile...</p>
        </div>
      </div>
    );
  }

  const isKycApproved = profile?.kycStatus === "APPROVED";

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF]">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-8 shadow-2xl">
          <h2 className="text-2xl font-bold text-[#EAECEF] mb-2">Post P2P Advertisement</h2>
          <p className="text-sm text-[#929AA5] mb-6 border-b border-[#2B3139] pb-4">
            Create an advertisement offer to buy or sell USDT. For Sell ads, backing USDT will be locked in escrow.
          </p>

          {!isKycApproved ? (
            <div className="bg-[#4E321E] border border-[#D97706] text-[#FBBF24] p-4 rounded-lg text-sm mb-6">
              ⚠️ <strong>KYC Gated:</strong> You must complete KYC identity verification and get approved before creating trade advertisements.
              <button
                onClick={() => router.push("/dashboard")}
                className="mt-2 block bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] px-4 py-2 rounded text-xs font-bold transition-all"
              >
                Go to Dashboard KYC
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && <div className="bg-[#4E1E24] text-[#F84960] p-3 rounded-lg text-xs">{error}</div>}
              {success && <div className="bg-[#1C4E2D] text-[#02C076] p-3 rounded-lg text-xs">{success}</div>}

              {/* Trade Type */}
              <div>
                <label className="block text-sm font-bold text-[#929AA5] mb-2">Trade Type</label>
                <div className="flex gap-4">
                  <label className="flex-1 bg-[#181A20] border border-[#474D57] rounded-lg p-4 flex items-center justify-between cursor-pointer hover:border-[#F3BA2F] transition-all">
                    <div>
                      <p className="font-bold text-sm text-[#EAECEF]">SELL USDT (Offer to Sell)</p>
                      <p className="text-xs text-[#929AA5] mt-1">You sell USDT, locks your available balance in escrow.</p>
                    </div>
                    <input
                      type="radio"
                      name="tradeType"
                      value="SELL"
                      checked={tradeType === "SELL"}
                      onChange={() => setTradeType("SELL")}
                      className="accent-[#F3BA2F] w-4 h-4"
                    />
                  </label>

                  <label className="flex-1 bg-[#181A20] border border-[#474D57] rounded-lg p-4 flex items-center justify-between cursor-pointer hover:border-[#F3BA2F] transition-all">
                    <div>
                      <p className="font-bold text-sm text-[#EAECEF]">BUY USDT (Offer to Buy)</p>
                      <p className="text-xs text-[#929AA5] mt-1">You buy USDT, sellers lock their USDT when opening trades.</p>
                    </div>
                    <input
                      type="radio"
                      name="tradeType"
                      value="BUY"
                      checked={tradeType === "BUY"}
                      onChange={() => setTradeType("BUY")}
                      className="accent-[#F3BA2F] w-4 h-4"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Price */}
                <div>
                  <label className="block text-xs text-[#929AA5] font-medium mb-1">Price per 1 USDT (in ETB)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 115.50"
                    className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2.5 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F]"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs text-[#929AA5] font-medium mb-1">Total USDT Amount</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2.5 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F]"
                  />
                </div>

                {/* Min Limit */}
                <div>
                  <label className="block text-xs text-[#929AA5] font-medium mb-1">Minimum Order Limit (ETB)</label>
                  <input
                    type="number"
                    required
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2.5 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F]"
                  />
                </div>

                {/* Max Limit */}
                <div>
                  <label className="block text-xs text-[#929AA5] font-medium mb-1">Maximum Order Limit (ETB)</label>
                  <input
                    type="number"
                    required
                    value={maxOrder}
                    onChange={(e) => setMaxOrder(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2.5 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F]"
                  />
                </div>
              </div>

              {/* Payment Methods Checkboxes */}
              <div>
                <label className="block text-xs text-[#929AA5] font-bold mb-2">Supported Payment Methods</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {["TELEBIRR", "CBE", "DASHEN", "AWASH", "ABYSSINIA"].map((provider) => (
                    <label
                      key={provider}
                      className="bg-[#181A20] border border-[#474D57] rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-[#F3BA2F] select-none"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPayments.includes(provider)}
                        onChange={() => handleCheckboxChange(provider)}
                        className="accent-[#F3BA2F] w-4 h-4"
                      />
                      <span className="text-sm font-semibold text-[#EAECEF]">{provider}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Terms */}
              <div>
                <label className="block text-xs text-[#929AA5] font-medium mb-1">Payment/Trade Terms</label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Enter any specific requirements e.g. 'Only third party payments with receipt' or 'CBE transfers take 5 mins'"
                  rows={4}
                  className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2.5 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] py-3 rounded-lg font-bold text-sm transition-all"
              >
                {submitting ? "Publishing Advert..." : "Post Advertisement"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
