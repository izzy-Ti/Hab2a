import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// POST /api/trades - Open a trade from an advertisement
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await prisma.profile.findUnique({ where: { id: user.id } });
    if (!profile || profile.kycStatus !== "APPROVED") {
      return NextResponse.json({ error: "KYC required to trade" }, { status: 403 });
    }

    const { adId, amount, paymentMethodId } = await request.json();
    if (!adId || !amount || !paymentMethodId) {
      return NextResponse.json({ error: "adId, amount, and paymentMethodId are required" }, { status: 400 });
    }

    const ad = await prisma.advertisement.findUnique({
      where: { id: adId },
      include: { profile: true },
    });

    if (!ad || ad.status !== "ACTIVE") {
      return NextResponse.json({ error: "Advertisement not found or not active" }, { status: 404 });
    }

    if (ad.profileId === user.id) {
      return NextResponse.json({ error: "You cannot trade with yourself" }, { status: 400 });
    }

    const tradeAmount = new Decimal(amount);
    const fiatAmount = tradeAmount.mul(ad.price);

    if (fiatAmount.lessThan(ad.minOrder) || fiatAmount.greaterThan(ad.maxOrder)) {
      return NextResponse.json({
        error: `Amount must be between ${ad.minOrder} and ${ad.maxOrder} ETB`,
      }, { status: 400 });
    }

    if (tradeAmount.greaterThan(ad.remainingAmount)) {
      return NextResponse.json({ error: "Insufficient remaining amount in advertisement" }, { status: 400 });
    }

    const buyerPaymentMethod = await prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, profileId: user.id },
    });
    if (!buyerPaymentMethod) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    // Determine buyer/seller from ad type
    const buyerId = ad.tradeType === "SELL" ? user.id : ad.profileId;
    const sellerId = ad.tradeType === "SELL" ? ad.profileId : user.id;

    const trade = await prisma.$transaction(async (tx) => {
      // Reduce remaining amount on ad
      const updated = await tx.advertisement.update({
        where: { id: adId },
        data: { remainingAmount: { decrement: tradeAmount } },
      });

      if (updated.remainingAmount.lessThan(0)) throw new Error("Race condition on ad amount");

      // For BUY ads, lock seller (the ad owner) funds now
      if (ad.tradeType === "BUY") {
        const sellerWallet = await tx.wallet.findFirst({ where: { profileId: sellerId, currency: "USDT" } });
        if (!sellerWallet) throw new Error("Seller wallet not found");
        const available = new Decimal(sellerWallet.availableBalance.toString());
        if (available.lessThan(tradeAmount)) throw new Error("Seller has insufficient balance");
        await tx.wallet.update({
          where: { id: sellerWallet.id },
          data: { availableBalance: { decrement: tradeAmount }, escrowBalance: { increment: tradeAmount } },
        });
      }

      const newTrade = await tx.trade.create({
        data: {
          adId,
          buyerId,
          sellerId,
          amount: tradeAmount,
          price: ad.price,
          fiatAmount,
          escrowStatus: "LOCKED",
          status: "OPEN",
          paymentMethodId,
          paymentDetails: buyerPaymentMethod.details as any,
        },
      });

      // Create system message
      await tx.tradeMessage.create({
        data: {
          tradeId: newTrade.id,
          content: `Trade opened for ${tradeAmount} USDT at ${ad.price} ETB/USDT. Total: ${fiatAmount} ETB. Please complete the payment within 15 minutes.`,
          isSystem: true,
        },
      });

      return newTrade;
    });

    return NextResponse.json({ trade }, { status: 201 });
  } catch (err: any) {
    console.error("Open trade error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/trades - List user's trades
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: any = {
      OR: [{ buyerId: user.id }, { sellerId: user.id }],
    };
    if (status) where.status = status;

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        include: {
          advertisement: { select: { tradeType: true, paymentMethods: true } },
          buyer: { select: { id: true, username: true, trustScore: true, completedTrades: true } },
          seller: { select: { id: true, username: true, trustScore: true, completedTrades: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trade.count({ where }),
    ]);

    return NextResponse.json({ trades, total, page, limit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
