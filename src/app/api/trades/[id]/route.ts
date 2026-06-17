import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { releaseEscrowToBuyer, refundEscrowToSeller } from "@/lib/escrow";

// GET /api/trades/[id] - Get trade details
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const trade = await prisma.trade.findUnique({
      where: { id: params.id },
      include: {
        advertisement: { select: { tradeType: true, paymentMethods: true, terms: true } },
        buyer: { select: { id: true, username: true, trustScore: true, completedTrades: true, totalTrades: true } },
        seller: { select: { id: true, username: true, trustScore: true, completedTrades: true, totalTrades: true } },
        messages: { orderBy: { createdAt: "asc" } },
        evidence: true,
        disputes: true,
      },
    });

    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({ trade });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/trades/[id] - Update trade status (mark paid, release, cancel)
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { action } = await request.json();
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });

    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    let result;

    if (action === "mark_paid") {
      // Only buyer can mark paid
      if (trade.buyerId !== user.id) return NextResponse.json({ error: "Only buyer can mark payment" }, { status: 403 });
      if (trade.status !== "OPEN") return NextResponse.json({ error: "Trade is not in OPEN state" }, { status: 400 });

      result = await prisma.trade.update({
        where: { id: params.id },
        data: { status: "PAID", buyerPaidAt: new Date() },
      });

      await prisma.tradeMessage.create({
        data: {
          tradeId: trade.id,
          content: "Buyer has marked the payment as sent. Seller please verify and release USDT.",
          isSystem: true,
        },
      });
    } else if (action === "release") {
      // Only seller can release
      if (trade.sellerId !== user.id) return NextResponse.json({ error: "Only seller can release USDT" }, { status: 403 });
      if (trade.status !== "PAID") return NextResponse.json({ error: "Trade must be in PAID state to release" }, { status: 400 });

      result = await releaseEscrowToBuyer(params.id);

      await prisma.tradeMessage.create({
        data: {
          tradeId: trade.id,
          content: "Seller has released USDT. Trade completed successfully! Funds transferred to buyer.",
          isSystem: true,
        },
      });

      // Update reputation stats
      await prisma.$transaction([
        prisma.profile.update({
          where: { id: trade.sellerId },
          data: { completedTrades: { increment: 1 }, totalTrades: { increment: 1 } },
        }),
        prisma.profile.update({
          where: { id: trade.buyerId },
          data: { completedTrades: { increment: 1 }, totalTrades: { increment: 1 } },
        }),
      ]);
    } else if (action === "cancel") {
      if (trade.status !== "OPEN") return NextResponse.json({ error: "Only OPEN trades can be cancelled" }, { status: 400 });

      result = await refundEscrowToSeller(params.id);

      await prisma.tradeMessage.create({
        data: {
          tradeId: trade.id,
          content: "Trade has been cancelled. Funds returned to seller.",
          isSystem: true,
        },
      });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ trade: result });
  } catch (err: any) {
    console.error("Trade action error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
