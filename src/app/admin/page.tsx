"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

export default function AdminPanel() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"disputes" | "withdrawals" | "users">("disputes");

  // Dialog states
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [withdrawalActionLoading, setWithdrawalActionLoading] = useState(false);

  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [disputeActionLoading, setDisputeActionLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        router.push("/auth/login");
      } else {
        // Simple client side check, server API checks strictly
        const email = session.user.email || "";
        const isAdminEmail = email.toLowerCase().includes("admin") || email.toLowerCase().startsWith("admin@");
        if (!isAdminEmail) {
          router.push("/");
        } else {
          setUser(session.user);
          fetchAdminData();
        }
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

  const fetchAdminData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) {
        throw new Error("Failed to load admin stats");
      }
      const statsData = await res.json();
      setData(statsData);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawalAction = async (id: string, action: "APPROVE" | "REJECT") => {
    if (action === "REJECT" && !rejectReason.trim()) {
      alert("Please provide a rejection reason.");
      return;
    }
    if (!confirm(`Are you sure you want to ${action.toLowerCase()} this withdrawal?`)) return;

    setWithdrawalActionLoading(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectedReason: rejectReason }),
      });

      const dataRes = await res.json();
      if (!res.ok) throw new Error(dataRes.error || "Action failed");

      setSelectedWithdrawal(null);
      setRejectReason("");
      fetchAdminData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setWithdrawalActionLoading(false);
    }
  };

  const handleResolveDispute = async (id: string, action: "RELEASE_TO_BUYER" | "REFUND_TO_SELLER") => {
    if (!resolutionNotes.trim()) {
      alert("Please enter resolution notes.");
      return;
    }
    if (!confirm(`Confirm dispute resolution: ${action.replace("_", " ")}?`)) return;

    setDisputeActionLoading(true);
    try {
      const res = await fetch(`/api/admin/disputes/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, resolutionNotes }),
      });

      const dataRes = await res.json();
      if (!res.ok) throw new Error(dataRes.error || "Dispute resolution failed");

      setSelectedDispute(null);
      setResolutionNotes("");
      fetchAdminData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDisputeActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-t-transparent border-[#F3BA2F] rounded-full animate-spin"></div>
          <p className="text-[#929AA5]">Loading administrator workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="bg-[#4E1E24] border border-[#F84960] text-[#F84960] p-6 rounded-lg max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">Access Denied</h3>
            <p className="text-sm">{error || "You do not have administrative access to this system."}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] px-6 py-2 rounded font-bold"
            >
              Go to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { stats, activeDisputes, pendingWithdrawals, users } = data;

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF]">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 border-b border-[#2B3139] pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-[#EAECEF]">Admin Governance Portal</h2>
            <p className="text-[#929AA5] text-sm mt-1">Review disputes, verify asset withdrawals, and monitor user compliance.</p>
          </div>
          <button
            onClick={fetchAdminData}
            className="bg-[#2B3139] hover:bg-[#383E47] text-[#EAECEF] px-4 py-2 rounded font-semibold text-xs transition-all border border-[#474D57]/30"
          >
            🔄 Refresh Data
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-5 shadow-lg">
            <p className="text-[#929AA5] text-xs font-semibold">Total Registered Users</p>
            <p className="text-2xl font-bold text-[#EAECEF] mt-1">{stats.totalUsers}</p>
          </div>
          <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-5 shadow-lg">
            <p className="text-[#929AA5] text-xs font-semibold">Total Trades Conducted</p>
            <p className="text-2xl font-bold text-[#EAECEF] mt-1">{stats.totalTrades}</p>
          </div>
          <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-5 shadow-lg">
            <p className="text-[#929AA5] text-xs font-semibold">USDT Trade Volume</p>
            <p className="text-2xl font-bold text-[#02C076] mt-1">{(stats.totalUsdtVolume || 0).toLocaleString()} USDT</p>
          </div>
          <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-5 shadow-lg">
            <p className="text-[#929AA5] text-xs font-semibold">ETB Trade Volume</p>
            <p className="text-2xl font-bold text-[#F3BA2F] mt-1">{(stats.totalEtbVolume || 0).toLocaleString()} ETB</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#2B3139] mb-8">
          <button
            onClick={() => setActiveTab("disputes")}
            className={`px-6 py-3 font-bold text-sm border-b-2 transition-all ${
              activeTab === "disputes"
                ? "border-[#E0294A] text-[#E0294A]"
                : "border-transparent text-[#929AA5] hover:text-[#EAECEF]"
            }`}
          >
            ⚠️ Open Disputes ({activeDisputes.length})
          </button>
          <button
            onClick={() => setActiveTab("withdrawals")}
            className={`px-6 py-3 font-bold text-sm border-b-2 transition-all ${
              activeTab === "withdrawals"
                ? "border-[#F3BA2F] text-[#F3BA2F]"
                : "border-transparent text-[#929AA5] hover:text-[#EAECEF]"
            }`}
          >
            💵 Pending Withdrawals ({pendingWithdrawals.length})
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-6 py-3 font-bold text-sm border-b-2 transition-all ${
              activeTab === "users"
                ? "border-[#02C076] text-[#02C076]"
                : "border-transparent text-[#929AA5] hover:text-[#EAECEF]"
            }`}
          >
            👥 Users Directory ({users.length})
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "disputes" && (
          <div className="space-y-4">
            {activeDisputes.length === 0 ? (
              <div className="bg-[#1E2329] border border-[#2B3139] p-12 text-center rounded-xl">
                <p className="text-[#929AA5] text-lg">No active disputes reported</p>
                <p className="text-xs text-[#474D57] mt-1">All trade escrows are running smoothly.</p>
              </div>
            ) : (
              activeDisputes.map((disp: any) => (
                <div key={disp.id} className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 hover:border-[#E0294A]/30 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="bg-[#E0294A]/10 text-[#E0294A] text-xs px-2.5 py-1 rounded font-bold uppercase">DISPUTE</span>
                      <span className="text-xs text-[#929AA5]">Trade ID: {disp.tradeId}</span>
                    </div>
                    <h4 className="text-lg font-bold text-[#EAECEF] mt-2.5">Reason: {disp.reason}</h4>
                    <p className="text-sm text-[#929AA5] mt-1">{disp.description}</p>
                    <div className="mt-3 text-xs text-[#929AA5] grid grid-cols-2 gap-x-6 gap-y-1">
                      <div>Initiator: <strong className="text-[#EAECEF]">{disp.initiator?.username} ({disp.initiator?.email})</strong></div>
                      <div>Trade Amount: <strong className="text-[#F3BA2F]">{disp.trade?.amount} USDT ({disp.trade?.fiatAmount} ETB)</strong></div>
                      <div>Buyer: <strong className="text-[#EAECEF]">{disp.trade?.buyer?.username}</strong></div>
                      <div>Seller: <strong className="text-[#EAECEF]">{disp.trade?.seller?.username}</strong></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-stretch md:self-auto justify-end border-t md:border-t-0 border-[#2B3139] pt-4 md:pt-0">
                    <button
                      onClick={() => router.push(`/trade/${disp.tradeId}`)}
                      className="bg-[#2B3139] hover:bg-[#383E47] text-[#EAECEF] text-xs px-4 py-2.5 rounded font-bold transition-all border border-[#474D57]/30"
                    >
                      View Trade Room Chat
                    </button>
                    <button
                      onClick={() => setSelectedDispute(disp)}
                      className="bg-[#E0294A] hover:bg-[#f63a5c] text-[#EAECEF] text-xs px-4 py-2.5 rounded font-bold transition-all"
                    >
                      Resolve Escrow
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "withdrawals" && (
          <div className="space-y-4">
            {pendingWithdrawals.length === 0 ? (
              <div className="bg-[#1E2329] border border-[#2B3139] p-12 text-center rounded-xl">
                <p className="text-[#929AA5] text-lg">No pending withdrawals</p>
                <p className="text-xs text-[#474D57] mt-1">All processed withdrawals are up-to-date.</p>
              </div>
            ) : (
              pendingWithdrawals.map((withdr: any) => (
                <div key={withdr.id} className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 hover:border-[#F3BA2F]/30 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="bg-[#F3BA2F]/10 text-[#F3BA2F] text-xs px-2.5 py-1 rounded font-bold uppercase">PENDING APPROVAL</span>
                      <span className="text-xs text-[#929AA5]">Withdrawal ID: {withdr.id}</span>
                    </div>
                    <h4 className="text-lg font-bold text-[#EAECEF] mt-2.5">{withdr.amount} USDT</h4>
                    <p className="text-xs text-[#929AA5] mt-1">
                      Destination Address (TRC20): <span className="font-mono text-[#EAECEF] bg-[#181A20] px-2 py-0.5 rounded border border-[#2B3139]">{withdr.destinationAddress}</span>
                    </p>
                    <p className="text-xs text-[#929AA5] mt-2">Requested: {new Date(withdr.createdAt).toLocaleString()}</p>
                  </div>

                  <div className="flex items-center gap-3 self-stretch md:self-auto justify-end border-t md:border-t-0 border-[#2B3139] pt-4 md:pt-0">
                    <button
                      onClick={() => handleWithdrawalAction(withdr.id, "APPROVE")}
                      disabled={withdrawalActionLoading}
                      className="bg-[#02C076] hover:bg-[#03d885] text-[#181A20] text-xs px-4 py-2.5 rounded font-bold transition-all"
                    >
                      Approve (Release)
                    </button>
                    <button
                      onClick={() => setSelectedWithdrawal(withdr)}
                      className="bg-[#E0294A] hover:bg-[#f63a5c] text-[#EAECEF] text-xs px-4 py-2.5 rounded font-bold transition-all"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "users" && (
          <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2B3139] text-xs text-[#929AA5] uppercase bg-[#181A20]/30">
                  <th className="px-6 py-4">Username</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">KYC Compliance</th>
                  <th className="px-6 py-4">Completed Orders</th>
                  <th className="px-6 py-4 text-right">Trust Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2B3139]">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-[#20262D] transition-colors text-sm">
                    <td className="px-6 py-4 font-bold text-[#EAECEF]">{u.username}</td>
                    <td className="px-6 py-4 font-mono text-xs text-[#929AA5]">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        u.kycStatus === "APPROVED"
                          ? "bg-[#02C076]/10 text-[#02C076]"
                          : u.kycStatus === "PENDING"
                          ? "bg-[#F3BA2F]/10 text-[#F3BA2F]"
                          : "bg-[#E0294A]/10 text-[#E0294A]"
                      }`}>
                        {u.kycStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4">{u.completedTrades} / {u.totalTrades} trades</td>
                    <td className="px-6 py-4 text-right text-[#F3BA2F] font-bold">{u.trustScore}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject Withdrawal Modal */}
      {selectedWithdrawal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#1E2329] border border-[#2B3139] w-full max-w-md rounded-xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-[#2B3139] flex justify-between items-center">
              <h3 className="font-bold text-lg text-[#EAECEF]">Reject Withdrawal</h3>
              <button
                onClick={() => setSelectedWithdrawal(null)}
                className="text-[#929AA5] hover:text-[#EAECEF] font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-[#929AA5] font-medium mb-1">Rejection Reason</label>
                <textarea
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter rejection reason to notify user (e.g. Account mismatch, suspicious trading patterns)..."
                  rows={4}
                  className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F] resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-[#181A20] border-t border-[#2B3139] flex justify-end gap-3">
              <button
                onClick={() => setSelectedWithdrawal(null)}
                className="bg-[#2B3139] hover:bg-[#383E47] text-[#EAECEF] px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleWithdrawalAction(selectedWithdrawal.id, "REJECT")}
                disabled={withdrawalActionLoading}
                className="bg-[#E0294A] hover:bg-[#f63a5c] text-[#EAECEF] px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
              >
                {withdrawalActionLoading ? "Rejecting..." : "Reject Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Dispute Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#1E2329] border border-[#2B3139] w-full max-w-md rounded-xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-[#2B3139] flex justify-between items-center">
              <h3 className="font-bold text-lg text-[#EAECEF]">Resolve Escrow Dispute</h3>
              <button
                onClick={() => setSelectedDispute(null)}
                className="text-[#929AA5] hover:text-[#EAECEF] font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-[#929AA5] font-medium mb-1">Administrative Resolution Notes</label>
                <textarea
                  required
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Enter detailed reason for the resolution decision (will be sent to both parties and logged in audits)..."
                  rows={4}
                  className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F] resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-[#181A20] border-t border-[#2B3139] flex flex-col gap-2">
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setSelectedDispute(null)}
                  className="bg-[#2B3139] hover:bg-[#383E47] text-[#EAECEF] px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleResolveDispute(selectedDispute.id, "RELEASE_TO_BUYER")}
                  disabled={disputeActionLoading}
                  className="flex-1 bg-[#02C076] hover:bg-[#03d885] text-[#181A20] py-3 rounded-lg text-xs font-bold transition-all text-center"
                >
                  Release to Buyer
                </button>
                <button
                  onClick={() => handleResolveDispute(selectedDispute.id, "REFUND_TO_SELLER")}
                  disabled={disputeActionLoading}
                  className="flex-1 bg-[#E0294A] hover:bg-[#f63a5c] text-[#EAECEF] py-3 rounded-lg text-xs font-bold transition-all text-center"
                >
                  Refund to Seller
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
