import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { lockFundsIntoEscrow } from "@/lib/escrow";

// GET /api/ads - List all active advertisements
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "BUY" | "SELL" | null;
    const payment = searchParams.get("payment");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: any = {
      status: "ACTIVE",
      deletedAt: null,
    };
    if (type) where.tradeType = type;
    if (payment) where.paymentMethods = { array_contains: payment };

    const [ads, total] = await Promise.all([
      prisma.advertisement.findMany({
        where,
        include: {
          profile: {
            select: {
              id: true,
              username: true,
              trustScore: true,
              completedTrades: true,
              totalTrades: true,
              kycStatus: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.advertisement.count({ where }),
    ]);

    return NextResponse.json({ ads, total, page, limit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/ads - Create new advertisement
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.profile.findUnique({ where: { id: user.id } });
    if (!profile || profile.kycStatus !== "APPROVED") {
      return NextResponse.json({ error: "KYC verification required to create ads" }, { status: 403 });
    }

    const body = await request.json();
    const { tradeType, price, amount, minOrder, maxOrder, paymentMethods, terms } = body;

    if (!tradeType || !price || !amount || !minOrder || !maxOrder || !paymentMethods?.length) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const adAmount = new Decimal(amount);
    const adPrice = new Decimal(price);
    const adMin = new Decimal(minOrder);
    const adMax = new Decimal(maxOrder);

    if (adMin.greaterThan(adMax)) {
      return NextResponse.json({ error: "Min order cannot exceed max order" }, { status: 400 });
    }

    // For SELL ads, lock funds in escrow
    if (tradeType === "SELL") {
      const wallet = await prisma.wallet.findFirst({ where: { profileId: user.id, currency: "USDT" } });
      if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
      const available = new Decimal(wallet.availableBalance.toString());
      if (available.lessThan(adAmount)) {
        return NextResponse.json({ error: "Insufficient balance to back this sell advertisement" }, { status: 400 });
      }
      await lockFundsIntoEscrow(user.id, adAmount);
    }

    const ad = await prisma.advertisement.create({
      data: {
        profileId: user.id,
        tradeType,
        price: adPrice,
        amount: adAmount,
        remainingAmount: adAmount,
        minOrder: adMin,
        maxOrder: adMax,
        paymentMethods,
        terms,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ ad }, { status: 201 });
  } catch (err: any) {
    console.error("Create ad error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
