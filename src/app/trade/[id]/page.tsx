"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

export default function TradeRoom({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: tradeId } = use(params);

  const [user, setUser] = useState<any>(null);
  const [trade, setTrade] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Chat input
  const [newMessage, setNewMessage] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Dispute modal
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("No payment received");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);

  // Status transition loader
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        router.push("/auth/login");
      } else {
        setUser(session.user);
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

  // Poll trade details and messages
  useEffect(() => {
    if (!user) return;

    fetchTradeDetails();
    fetchMessages();

    const interval = setInterval(() => {
      fetchTradeDetails();
      fetchMessages();
    }, 3000);

    return () => clearInterval(interval);
  }, [user]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchTradeDetails = async () => {
    try {
      const res = await fetch(`/api/trades/${tradeId}`);
      if (!res.ok) throw new Error("Failed to load trade room details");
      const data = await res.json();
      setTrade(data.trade);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/trades/${tradeId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const text = newMessage;
    setNewMessage("");

    try {
      const res = await fetch(`/api/trades/${tradeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        fetchMessages();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTradeAction = async (actionName: "mark_paid" | "release" | "cancel") => {
    if (!confirm(`Are you sure you want to perform action: ${actionName.replace("_", " ")}?`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/trades/${tradeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      fetchTradeDetails();
      fetchMessages();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisputeLoading(true);

    try {
      const res = await fetch(`/api/trades/${tradeId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: disputeReason, description: disputeDesc }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dispute creation failed");

      setShowDisputeModal(false);
      setDisputeDesc("");
      fetchTradeDetails();
      fetchMessages();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDisputeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-t-transparent border-[#F3BA2F] rounded-full animate-spin"></div>
          <p className="text-[#929AA5]">Connecting to trade room...</p>
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="bg-[#4E1E24] border border-[#F84960] text-[#F84960] p-6 rounded-lg max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">Error Connecting</h3>
            <p className="text-sm">{error || "You do not have access to this trade room."}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] px-6 py-2 rounded font-bold"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isBuyer = trade.buyerId === user?.id;
  const isSeller = trade.sellerId === user?.id;
  const partnerUsername = isBuyer ? trade.seller?.username : trade.buyer?.username;
  const partnerScore = isBuyer ? trade.seller?.trustScore : trade.buyer?.trustScore;

  // Status mapping UI
  const getStatusConfig = () => {
    switch (trade.status) {
      case "OPEN":
        return {
          title: "Payment Pending",
          color: "text-[#F3BA2F]",
          bg: "bg-[#F3BA2F]/10",
          border: "border-[#F3BA2F]",
        };
      case "PAID":
        return {
          title: "Buyer Paid",
          color: "text-[#02C076]",
          bg: "bg-[#02C076]/10",
          border: "border-[#02C076]",
        };
      case "RELEASED":
        return {
          title: "Trade Completed",
          color: "text-[#02C076]",
          bg: "bg-[#02C076]/20",
          border: "border-[#02C076]",
        };
      case "DISPUTED":
        return {
          title: "Under Dispute",
          color: "text-[#E0294A]",
          bg: "bg-[#E0294A]/10",
          border: "border-[#E0294A]",
        };
      case "CANCELLED":
        return {
          title: "Trade Cancelled",
          color: "text-[#929AA5]",
          bg: "bg-[#2B3139]/30",
          border: "border-[#2B3139]",
        };
      default:
        return {
          title: trade.status,
          color: "text-[#EAECEF]",
          bg: "bg-[#1E2329]",
          border: "border-[#2B3139]",
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#EAECEF] flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Section: Trade Status & Controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Alert Banner */}
          <div className={`${statusConfig.bg} border-l-4 ${statusConfig.border} p-6 rounded-r-xl`}>
            <p className="text-xs text-[#929AA5] uppercase font-bold tracking-wider">Order Status</p>
            <h2 className={`text-2xl font-bold ${statusConfig.color} mt-1`}>{statusConfig.title}</h2>
            
            {/* Dynamic Status Instructions */}
            <div className="mt-4 text-sm text-[#EAECEF] whitespace-pre-line leading-relaxed">
              {trade.status === "OPEN" && isBuyer && (
                <>
                  Please transfer exactly <strong>{trade.fiatAmount} ETB</strong> to the seller using the payment details below.
                  Once done, you must click <strong>&quot;Confirm Payment Sent&quot;</strong> before the timer expires.
                </>
              )}
              {trade.status === "OPEN" && isSeller && (
                <>
                  Awaiting buyer to transfer exactly <strong>{trade.fiatAmount} ETB</strong> to your selected payment details.
                  Do not release USDT until you verify the funds are fully credited to your account!
                </>
              )}
              {trade.status === "PAID" && isBuyer && (
                <>
                  You have marked this trade as paid. The seller is verifying the transaction and will release the USDT shortly.
                  If the seller does not release the funds, you can initiate a dispute.
                </>
              )}
              {trade.status === "PAID" && isSeller && (
                <>
                  The buyer has marked the payment as sent. Please open your bank/wallet app and check for a deposit of{" "}
                  <strong>{trade.fiatAmount} ETB</strong>. Once received, click <strong>&quot;Confirm Receipt & Release Escrow&quot;</strong>.
                </>
              )}
              {trade.status === "DISPUTED" && (
                <>
                  This trade is under dispute. A customer service representative will evaluate the chat records and request additional proof (receipt screenshot, bank statements) to resolve the escrow.
                </>
              )}
              {trade.status === "RELEASED" && (
                <>
                  Escrow release complete! <strong>{trade.amount} USDT</strong> has been credited to the buyer&apos;s available wallet.
                  Thank you for trading on EthioP2P.
                </>
              )}
              {trade.status === "CANCELLED" && (
                <>
                  This order was cancelled. Escrowed funds have been returned to the seller.
                </>
              )}
            </div>
          </div>

          {/* Trade Info Box */}
          <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 space-y-4">
            <h3 className="font-bold text-lg border-b border-[#2B3139] pb-3 text-[#EAECEF]">Trade Information</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[#929AA5] text-xs">Total Amount</p>
                <p className="text-lg font-bold text-[#F3BA2F] mt-0.5">{trade.amount} USDT</p>
              </div>
              <div>
                <p className="text-[#929AA5] text-xs">Exchange Rate</p>
                <p className="text-lg font-bold text-[#EAECEF] mt-0.5">{trade.price} ETB/USDT</p>
              </div>
              <div>
                <p className="text-[#929AA5] text-xs">Fiat Total to Pay</p>
                <p className="text-lg font-bold text-[#02C076] mt-0.5">{trade.fiatAmount} ETB</p>
              </div>
              <div>
                <p className="text-[#929AA5] text-xs">Trading With</p>
                <p className="text-sm font-semibold text-[#EAECEF] mt-0.5">
                  {partnerUsername} ({partnerScore}% trust)
                </p>
              </div>
            </div>

            {/* Seller Payment Coordinates */}
            {trade.status !== "CANCELLED" && (
              <div className="bg-[#181A20] border border-[#2B3139] p-4 rounded-lg mt-4">
                <p className="text-xs text-[#929AA5] mb-2 uppercase font-bold tracking-wider">Payment Instructions</p>
                <div className="space-y-2 text-sm text-[#EAECEF]">
                  <p>
                    <span className="text-[#929AA5]">Method:</span>{" "}
                    <strong className="bg-[#F3BA2F]/10 text-[#F3BA2F] text-[10px] px-2 py-0.5 rounded font-bold uppercase inline-block">
                      {trade.paymentDetails?.provider || "Bank Transfer"}
                    </strong>
                  </p>
                  <p>
                    <span className="text-[#929AA5]">Account Name:</span>{" "}
                    <strong>{trade.paymentDetails?.accountName || "N/A"}</strong>
                  </p>
                  <p>
                    <span className="text-[#929AA5]">Account/Mobile Number:</span>{" "}
                    <strong className="font-mono text-[#F3BA2F] break-all select-all">
                      {trade.paymentDetails?.accountNumber || trade.paymentDetails?.mobileNumber || "N/A"}
                    </strong>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Panel */}
          {trade.status !== "RELEASED" && trade.status !== "CANCELLED" && (
            <div className="bg-[#1E2329] border border-[#2B3139] rounded-xl p-6 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-4">
                {/* Buyer Actions */}
                {isBuyer && trade.status === "OPEN" && (
                  <>
                    <button
                      onClick={() => handleTradeAction("mark_paid")}
                      disabled={actionLoading}
                      className="bg-[#02C076] hover:bg-[#03d885] text-[#181A20] px-6 py-3 rounded-lg font-bold text-sm transition-all"
                    >
                      Confirm Payment Sent
                    </button>
                    <button
                      onClick={() => handleTradeAction("cancel")}
                      disabled={actionLoading}
                      className="bg-[#2B3139] hover:bg-[#383E47] text-[#E0294A] px-6 py-3 rounded-lg font-bold text-sm transition-all"
                    >
                      Cancel Order
                    </button>
                  </>
                )}

                {/* Seller Actions */}
                {isSeller && trade.status === "PAID" && (
                  <button
                    onClick={() => handleTradeAction("release")}
                    disabled={actionLoading}
                    className="bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] px-6 py-3 rounded-lg font-bold text-sm transition-all"
                  >
                    Confirm Receipt & Release Escrow
                  </button>
                )}
              </div>

              {trade.status !== "DISPUTED" && (
                <button
                  onClick={() => setShowDisputeModal(true)}
                  className="bg-[#E0294A]/10 hover:bg-[#E0294A]/20 text-[#E0294A] px-4 py-2.5 rounded-lg text-xs font-bold transition-all border border-[#E0294A]/30"
                >
                  ⚠️ Open Dispute
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Section: Real-time Chat Room */}
        <div className="lg:col-span-1 bg-[#1E2329] border border-[#2B3139] rounded-xl flex flex-col h-[600px] overflow-hidden shadow-2xl">
          <div className="px-4 py-3 border-b border-[#2B3139] bg-[#181A20] flex items-center justify-between">
            <span className="font-bold text-sm">Trade Chat & Evidence</span>
            <span className="w-2.5 h-2.5 bg-[#02C076] rounded-full animate-pulse"></span>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 flex flex-col">
            {messages.map((msg: any) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="bg-[#202630] text-[#EAECEF] border border-[#2B3139] rounded-lg p-3 text-xs text-center leading-relaxed">
                    ⚙️ <span className="font-semibold">{msg.content}</span>
                  </div>
                );
              }

              const isMe = msg.senderId === user?.id;

              return (
                <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? "self-end items-end" : "self-start items-start"}`}>
                  <span className="text-[10px] text-[#929AA5] mb-1 font-semibold">
                    {isMe ? "You" : msg.sender?.username || partnerUsername}
                  </span>
                  <div className={`p-3 rounded-xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-[#F3BA2F] text-[#181A20] rounded-tr-none font-medium"
                      : "bg-[#2B3139] text-[#EAECEF] rounded-tl-none border border-[#474D57]/30"
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[9px] text-[#474D57] mt-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSendMessage} className="p-3 bg-[#181A20] border-t border-[#2B3139] flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Send message or instructions..."
              className="flex-1 bg-[#1E2329] border border-[#2B3139] text-[#EAECEF] text-sm px-4 py-2.5 rounded-lg focus:outline-none focus:border-[#F3BA2F]"
            />
            <button
              type="submit"
              className="bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] px-4 rounded-lg font-bold text-sm"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#1E2329] border border-[#2B3139] w-full max-w-md rounded-xl overflow-hidden shadow-2xl">
            <form onSubmit={handleOpenDispute}>
              <div className="px-6 py-4 border-b border-[#2B3139] flex justify-between items-center">
                <h3 className="font-bold text-lg text-[#EAECEF]">File a Trade Dispute</h3>
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(false)}
                  className="text-[#929AA5] hover:text-[#EAECEF] font-bold text-xl"
                >
                  &times;
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs text-[#929AA5] font-medium mb-1">Dispute Reason</label>
                  <select
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F]"
                  >
                    <option value="No payment received">No payment received (Seller)</option>
                    <option value="Incorrect payment amount">Incorrect payment amount received (Seller)</option>
                    <option value="Seller not releasing funds">Seller not releasing funds (Buyer)</option>
                    <option value="Non-cooperative partner">Non-cooperative partner (Either)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#929AA5] font-medium mb-1">Detailed Explanation</label>
                  <textarea
                    required
                    value={disputeDesc}
                    onChange={(e) => setDisputeDesc(e.target.value)}
                    placeholder="Provide transaction details, reference codes, bank transfers, or any explanation to speed up resolution..."
                    rows={4}
                    className="w-full bg-[#181A20] border border-[#474D57] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F3BA2F] resize-none"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-[#181A20] border-t border-[#2B3139] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(false)}
                  className="bg-[#2B3139] hover:bg-[#383E47] text-[#EAECEF] px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disputeLoading}
                  className="bg-[#E0294A] hover:bg-[#f63a5c] text-[#EAECEF] px-5 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
                >
                  {disputeLoading ? "Filing..." : "File Dispute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
