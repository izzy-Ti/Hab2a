"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [trades, setTrades] = useState([]);
  const [myAds, setMyAds] = useState([]);
  
  const [activeTab, setActiveTab] = useState<"wallet" | "payments" | "trades" | "ads">("wallet");
  const [loading, setLoading] = useState(true);

  // Deposit address states
  const [depositAddress, setDepositAddress] = useState("");
  const [depositQrCode, setDepositQrCode] = useState("");
  const [generatingAddress, setGeneratingAddress] = useState(false);

  // Withdrawal states
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPin, setWithdrawPin] = useState("");
  const [withdrawPinSetup, setWithdrawPinSetup] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [historyWithdrawals, setHistoryWithdrawals] = useState([]);

  // Payment Method form states
  const [provider, setProvider] = useState("TELEBIRR");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [pmError, setPmError] = useState("");
  const [pmSuccess, setPmSuccess] = useState("");
  const [pmLoading, setPmLoading] = useState(false);

  // KYC trigger states
  const [kycLoading, setKycLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        router.push("/auth/login");
      } else {
        setUser(session.user);
        fetchDashboardData();
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

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch wallet
      const walletRes = await fetch("/api/wallet");
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        setWallet(walletData.wallet);
        if (walletData.wallet?.addresses?.length > 0) {
          setDepositAddress(walletData.wallet.addresses[0].address);
          setDepositQrCode(walletData.wallet.addresses[0].qrCodeUrl || "");
        }
      }

      // 2. Fetch profile & KYC
      const profileRes = await fetch("/api/kyc/start");
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile({
          kycStatus: profileData.kycStatus,
          kycVerifiedAt: profileData.kycVerifiedAt,
        });
      }

      // 3. Fetch payment methods
      const pmRes = await fetch("/api/payment-methods");
      if (pmRes.ok) {
        const pmData = await pmRes.json();
        setPaymentMethods(pmData.paymentMethods || []);
      }

      // 4. Fetch trade history
      const tradesRes = await fetch("/api/trades");
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        setTrades(tradesData.trades || []);
      }

      // 5. Fetch withdrawals list
      const withdrawalsRes = await fetch("/api/wallet/withdraw");
      if (withdrawalsRes.ok) {
        const withData = await withdrawalsRes.json();
        setHistoryWithdrawals(withData.withdrawals || []);
      }

      // 6. Fetch user's ads (we can filter active ads or query a custom endpoint)
      // For simplicity, we query /api/ads and filter user's ads
      const adsRes = await fetch("/api/ads");
      if (adsRes.ok) {
        const adsData = await adsRes.json();
        const myFilteredAds = (adsData.ads || []).filter((ad: any) => ad.profileId === supabase.auth.getUser());
        setMyAds(myFilteredAds);
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAddress = async () => {
    setGeneratingAddress(true);
    try {
      const res = await fetch("/api/wallet/deposit-address", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate deposit address");
      setDepositAddress(data.address);
      setDepositQrCode(data.qrCodeUrl || "");
      // Refresh wallet balance
      fetchDashboardData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGeneratingAddress(false);
    }
  };

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError("");
    setWithdrawSuccess("");
    setWithdrawLoading(true);

    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationAddress: withdrawAddress,
          amount: Number(withdrawAmount),
          withdrawalPin: withdrawPin,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");

      setWithdrawSuccess("Withdrawal request submitted! Pending admin review.");
      setWithdrawAddress("");
      setWithdrawAmount("");
      setWithdrawPin("");
      fetchDashboardData();
    } catch (err: any) {
      setWithdrawError(err.message);
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    setPmError("");
    setPmSuccess("");
    setPmLoading(true);

    const details: any = { accountName };
    if (provider === "TELEBIRR") {
      details.mobileNumber = mobileNumber;
      details.accountNumber = mobileNumber;
    } else {
      details.accountNumber = accountNumber;
    }

    try {
      const res = await fetch("/api/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, details }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add payment method");

      setPmSuccess("Payment method added successfully!");
      setAccountName("");
      setAccountNumber("");
      setMobileNumber("");
      fetchDashboardData();
    } catch (err: any) {
      setPmError(err.message);
    } finally {
      setPmLoading(false);
    }
  };

  const handleStartKyc = async () => {
    setKycLoading(true);
    try {
      const res = await fetch("/api/kyc/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "KYC initiation failed");
      if (data.verificationUrl) {
        window.open(data.verificationUrl, "_blank");
      }
      fetchDashboardData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setKycLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-t-transparent border-[#F3BA2F] rounded-full animate-spin"></div>
          <p className="text-[#929AA5]">Loading your dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF]">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Header */}
        <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <p className="text-xs text-[#929AA5]">Welcome back,</p>
            <h2 className="text-2xl font-bold text-[#EAECEF]">{user?.email}</h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs bg-[#2B3139] px-2.5 py-1 rounded-md text-[#929AA5]">
                Account ID: {user?.id?.substring(0, 8)}...
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-md font-bold uppercase ${
                profile?.kycStatus === "APPROVED"
                  ? "bg-[#02C076]/10 text-[#02C076]"
                  : profile?.kycStatus === "PENDING"
                  ? "bg-[#F3BA2F]/10 text-[#F3BA2F]"
                  : "bg-[#E0294A]/10 text-[#E0294A]"
              }`}>
                KYC Status: {profile?.kycStatus || "PENDING"}
              </span>
            </div>
          </div>

          {profile?.kycStatus !== "APPROVED" && (
            <button
              onClick={handleStartKyc}
              disabled={kycLoading || profile?.kycStatus === "PENDING"}
              className="bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] px-6 py-2.5 rounded-lg font-bold transition-all disabled:opacity-50"
            >
              {profile?.kycStatus === "PENDING"
                ? "KYC Under Verification"
                : kycLoading
                ? "Initiating..."
                : "Verify Identity (KYC)"}
            </button>
          )}
        </div>

        {/* Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Navigation Sidebar */}
          <div className="lg:col-span-1 space-y-2">
            <button
              onClick={() => setActiveTab("wallet")}
              className={`w-full text-left px-4 py-3.5 rounded-lg text-sm font-bold transition-all flex items-center gap-3 ${
                activeTab === "wallet"
                  ? "bg-[#202630] text-[#F3BA2F] border-l-4 border-[#F3BA2F]"
                  : "text-[#929AA5] hover:bg-[#1E2329]"
              }`}
            >
              💼 Wallet & Balance
            </button>
            <button
              onClick={() => setActiveTab("payments")}
              className={`w-full text-left px-4 py-3.5 rounded-lg text-sm font-bold transition-all flex items-center gap-3 ${
                activeTab === "payments"
                  ? "bg-[#202630] text-[#F3BA2F] border-l-4 border-[#F3BA2F]"
                  : "text-[#929AA5] hover:bg-[#1E2329]"
              }`}
            >
              💳 Payment Methods
            </button>
            <button
              onClick={() => setActiveTab("trades")}
              className={`w-full text-left px-4 py-3.5 rounded-lg text-sm font-bold transition-all flex items-center gap-3 ${
                activeTab === "trades"
                  ? "bg-[#202630] text-[#F3BA2F] border-l-4 border-[#F3BA2F]"
                  : "text-[#929AA5] hover:bg-[#1E2329]"
              }`}
            >
              📊 Active Trades
            </button>
            <button
              onClick={() => setActiveTab("ads")}
              className={`w-full text-left px-4 py-3.5 rounded-lg text-sm font-bold transition-all flex items-center gap-3 ${
                activeTab === "ads"
                  ? "bg-[#202630] text-[#F3BA2F] border-l-4 border-[#F3BA2F]"
                  : "text-[#929AA5] hover:bg-[#1E2329]"
              }`}
            >
              📢 My Advertisements
            </button>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {activeTab === "wallet" && (
              <div className="space-y-8">
                {/* Balance Summary Card */}
                <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-[#929AA5] mb-1">Available Balance</p>
                    <p className="text-2xl font-bold text-[#02C076]">
                      {wallet?.availableBalance || "0.00"} <span className="text-xs font-normal">USDT</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#929AA5] mb-1">Frozen Balance</p>
                    <p className="text-2xl font-bold text-[#E0294A]">
                      {wallet?.frozenBalance || "0.00"} <span className="text-xs font-normal">USDT</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#929AA5] mb-1">Escrow Balance</p>
                    <p className="text-2xl font-bold text-[#F3BA2F]">
                      {wallet?.escrowBalance || "0.00"} <span className="text-xs font-normal">USDT</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#929AA5] mb-1">Total Assets</p>
                    <p className="text-2xl font-bold text-[#EAECEF]">
                      {wallet?.totalBalance || "0.00"} <span className="text-xs font-normal">USDT</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Deposit Address Box */}
                  <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 space-y-4">
                    <h3 className="font-bold text-lg text-[#EAECEF]">Deposit USDT (TRC20)</h3>
                    <p className="text-xs text-[#929AA5]">
                      Send only TRON (TRC20) USDT to this address. Sending any other asset will result in permanent loss.
                    </p>

                    {depositAddress ? (
                      <div className="space-y-4">
                        <div className="bg-[#181A20] p-3 rounded-lg border border-[#2B3139] flex items-center justify-between gap-4">
                          <span className="font-mono text-xs text-[#EAECEF] break-all select-all">
                            {depositAddress}
                          </span>
                        </div>
                        {depositQrCode && (
                          <div className="flex justify-center bg-white p-3 rounded-lg w-40 h-40 mx-auto">
                            <img src={depositQrCode} alt="Deposit QR Code" className="w-full h-full object-contain" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={handleGenerateAddress}
                        disabled={generatingAddress}
                        className="w-full bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] py-3 rounded-lg font-bold text-sm transition-all"
                      >
                        {generatingAddress ? "Generating..." : "Generate Deposit Address"}
                      </button>
                    )}
                  </div>

                  {/* Withdrawal Request Box */}
                  <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 space-y-4">
                    <h3 className="font-bold text-lg text-[#EAECEF]">Withdraw USDT (TRC20)</h3>
                    {profile?.kycStatus !== "APPROVED" ? (
                      <div className="bg-[#4E321E] border border-[#D97706] text-[#FBBF24] p-4 rounded-lg text-xs">
                        ⚠️ Withdrawal is gated. You must complete KYC identity verification first.
                      </div>
                    ) : (
                      <form onSubmit={handleWithdrawal} className="space-y-4">
                        {withdrawError && (
                          <p className="bg-[#4E1E24] border border-[#F84960] text-[#F84960] px-3 py-2 rounded text-xs">
                            {withdrawError}
                          </p>
                        )}
                        {withdrawSuccess && (
                          <p className="bg-[#1C4E2D] border border-[#02C076] text-[#02C076] px-3 py-2 rounded text-xs">
                            {withdrawSuccess}
                          </p>
                        )}
                        <div>
                          <label className="block text-xs text-[#929AA5] mb-1">Destination Address (TRC20)</label>
                          <input
                            type="text"
                            required
                            value={withdrawAddress}
                            onChange={(e) => setWithdrawAddress(e.target.value)}
                            placeholder="Starts with T..."
                            className="w-full bg-[#181A20] border border-[#474D57] rounded px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#929AA5] mb-1">Amount (USDT)</label>
                          <input
                            type="number"
                            required
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            placeholder="Min 5 USDT"
                            className="w-full bg-[#181A20] border border-[#474D57] rounded px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#929AA5] mb-1">Withdrawal PIN</label>
                          <input
                            type="password"
                            required
                            maxLength={4}
                            value={withdrawPin}
                            onChange={(e) => setWithdrawPin(e.target.value)}
                            placeholder="4-digit PIN"
                            className="w-full bg-[#181A20] border border-[#474D57] rounded px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={withdrawLoading}
                          className="w-full bg-[#E0294A] hover:bg-[#f63a5c] text-[#EAECEF] py-2.5 rounded font-bold text-sm transition-all"
                        >
                          {withdrawLoading ? "Processing..." : "Submit Withdrawal"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "payments" && (
              <div className="space-y-8 animate-fade-in">
                <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6">
                  <h3 className="font-bold text-lg text-[#EAECEF] mb-4">Add Payment Method</h3>

                  {pmError && <p className="bg-[#4E1E24] text-[#F84960] p-3 rounded mb-4 text-xs">{pmError}</p>}
                  {pmSuccess && <p className="bg-[#1C4E2D] text-[#02C076] p-3 rounded mb-4 text-xs">{pmSuccess}</p>}

                  <form onSubmit={handleAddPaymentMethod} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[#929AA5] mb-1">Provider type</label>
                      <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        className="w-full bg-[#181A20] border border-[#474D57] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#F3BA2F]"
                      >
                        <option value="TELEBIRR">Telebirr</option>
                        <option value="CBE">CBE (Commercial Bank of Ethiopia)</option>
                        <option value="DASHEN">Dashen Bank</option>
                        <option value="AWASH">Awash Bank</option>
                        <option value="ABYSSINIA">Bank of Abyssinia</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-[#929AA5] mb-1">Account Holder Name</label>
                      <input
                        type="text"
                        required
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="e.g. Abebe Kebede"
                        className="w-full bg-[#181A20] border border-[#474D57] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#F3BA2F]"
                      />
                    </div>

                    {provider === "TELEBIRR" ? (
                      <div>
                        <label className="block text-xs text-[#929AA5] mb-1">Telebirr Mobile Number</label>
                        <input
                          type="text"
                          required
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                          placeholder="e.g. 0912345678"
                          className="w-full bg-[#181A20] border border-[#474D57] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#F3BA2F]"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs text-[#929AA5] mb-1">Bank Account Number</label>
                        <input
                          type="text"
                          required
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          placeholder="e.g. 1000123456789"
                          className="w-full bg-[#181A20] border border-[#474D57] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#F3BA2F]"
                        />
                      </div>
                    )}

                    <div className="md:col-span-2 text-right">
                      <button
                        type="submit"
                        disabled={pmLoading}
                        className="bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] px-6 py-2.5 rounded-lg font-bold text-sm transition-all"
                      >
                        {pmLoading ? "Adding..." : "Add Method"}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6">
                  <h3 className="font-bold text-lg text-[#EAECEF] mb-4">My Payment Methods</h3>
                  {paymentMethods.length === 0 ? (
                    <p className="text-sm text-[#929AA5]">You haven&apos;t added any payment methods yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {paymentMethods.map((pm: any) => (
                        <div key={pm.id} className="bg-[#181A20] border border-[#2B3139] p-4 rounded-lg flex justify-between items-center">
                          <div>
                            <span className="bg-[#F3BA2F]/10 text-[#F3BA2F] text-[10px] px-2 py-0.5 rounded font-bold uppercase mb-1.5 inline-block">
                              {pm.provider}
                            </span>
                            <h4 className="font-bold text-sm">{pm.details?.accountName}</h4>
                            <p className="text-xs text-[#929AA5]">
                              {pm.provider === "TELEBIRR" ? pm.details?.mobileNumber : pm.details?.accountNumber}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "trades" && (
              <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 animate-fade-in">
                <h3 className="font-bold text-lg text-[#EAECEF] mb-4">My P2P Orders</h3>
                {trades.length === 0 ? (
                  <p className="text-sm text-[#929AA5]">You have no active or historical trades.</p>
                ) : (
                  <div className="space-y-4">
                    {trades.map((trade: any) => {
                      const isBuyer = trade.buyerId === user.id;
                      const role = isBuyer ? "BUY" : "SELL";
                      return (
                        <div key={trade.id} className="bg-[#181A20] border border-[#2B3139] p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-[#F3BA2F]/30 transition-all">
                          <div>
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                isBuyer ? "bg-[#02C076]/10 text-[#02C076]" : "bg-[#E0294A]/10 text-[#E0294A]"
                              }`}>
                                {role} USDT
                              </span>
                              <span className="text-xs text-[#929AA5] font-mono">ID: {trade.id.substring(0, 8)}...</span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                              <div>
                                <span className="text-[#929AA5]">Amount:</span> <strong className="text-[#EAECEF]">{trade.amount} USDT</strong>
                              </div>
                              <div>
                                <span className="text-[#929AA5]">Total:</span> <strong className="text-[#EAECEF]">{trade.fiatAmount} ETB</strong>
                              </div>
                              <div>
                                <span className="text-[#929AA5]">Counterparty:</span> <strong className="text-[#EAECEF]">{isBuyer ? trade.seller?.username : trade.buyer?.username}</strong>
                              </div>
                              <div>
                                <span className="text-[#929AA5]">Date:</span> <span className="text-[#929AA5]">{new Date(trade.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 self-stretch md:self-auto justify-between border-t md:border-t-0 border-[#2B3139] pt-3 md:pt-0">
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                              trade.status === "RELEASED"
                                ? "bg-[#02C076]/10 text-[#02C076]"
                                : trade.status === "PAID"
                                ? "bg-[#F3BA2F]/10 text-[#F3BA2F]"
                                : trade.status === "DISPUTED"
                                ? "bg-[#E0294A]/10 text-[#E0294A]"
                                : "bg-[#474D57]/30 text-[#929AA5]"
                            }`}>
                              {trade.status}
                            </span>
                            <button
                              onClick={() => router.push(`/trade/${trade.id}`)}
                              className="bg-[#2B3139] hover:bg-[#383E47] text-[#EAECEF] text-xs px-4 py-2 rounded font-bold transition-all"
                            >
                              Enter Trade Room
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "ads" && (
              <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-[#EAECEF]">My P2P Advertisements</h3>
                  <button
                    onClick={() => router.push("/ads/new")}
                    className="bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] text-xs px-4 py-2 rounded font-bold"
                  >
                    + Create New Ad
                  </button>
                </div>
                {myAds.length === 0 ? (
                  <p className="text-sm text-[#929AA5]">You haven&apos;t posted any advertisements yet.</p>
                ) : (
                  <div className="space-y-4">
                    {myAds.map((ad: any) => (
                      <div key={ad.id} className="bg-[#181A20] border border-[#2B3139] p-4 rounded-lg flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              ad.tradeType === "BUY" ? "bg-[#02C076]/10 text-[#02C076]" : "bg-[#E0294A]/10 text-[#E0294A]"
                            }`}>
                              {ad.tradeType}
                            </span>
                            <span className="text-sm font-bold text-[#EAECEF]">{ad.price} ETB/USDT</span>
                          </div>
                          <p className="text-xs text-[#929AA5] mt-1">
                            Remaining: {ad.remainingAmount} / {ad.amount} USDT | limits: {ad.minOrder} - {ad.maxOrder} ETB
                          </p>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 bg-[#02C076]/10 text-[#02C076] rounded uppercase">
                          {ad.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
