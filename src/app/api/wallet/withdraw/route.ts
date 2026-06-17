import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// POST /api/wallet/withdraw
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { destinationAddress, amount, withdrawalPin } = await request.json();

    if (!destinationAddress || !amount || !withdrawalPin) {
      return NextResponse.json({ error: "Destination address, amount, and withdrawal PIN are required" }, { status: 400 });
    }

    const withdrawalAmount = new Decimal(amount);
    if (withdrawalAmount.lessThanOrEqualTo(0)) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({ where: { id: user.id } });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // KYC check
    if (profile.kycStatus !== "APPROVED") {
      return NextResponse.json({ error: "KYC verification required before withdrawals" }, { status: 403 });
    }

    // 2FA check
    if (!profile.twoFactorEnabled) {
      return NextResponse.json({ error: "Two-factor authentication must be enabled before withdrawals" }, { status: 403 });
    }

    // Withdrawal PIN check
    const bcrypt = await import("bcryptjs");
    if (!profile.withdrawalPinHash) {
      return NextResponse.json({ error: "Withdrawal PIN not set. Please set a PIN in security settings." }, { status: 403 });
    }
    const pinValid = await bcrypt.compare(withdrawalPin, profile.withdrawalPinHash);
    if (!pinValid) {
      return NextResponse.json({ error: "Invalid withdrawal PIN" }, { status: 403 });
    }

    // Balance check
    const wallet = await prisma.wallet.findFirst({
      where: { profileId: user.id, currency: "USDT" },
    });
    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const available = new Decimal(wallet.availableBalance.toString());
    if (available.lessThan(withdrawalAmount)) {
      return NextResponse.json({ error: "Insufficient available balance" }, { status: 400 });
    }

    // Minimum withdrawal: 5 USDT
    if (withdrawalAmount.lessThan(5)) {
      return NextResponse.json({ error: "Minimum withdrawal is 5 USDT" }, { status: 400 });
    }

    // Validate TRC20 address format (starts with T, 34 chars)
    if (!destinationAddress.match(/^T[A-Za-z0-9]{33}$/)) {
      return NextResponse.json({ error: "Invalid TRC20 USDT address" }, { status: 400 });
    }

    // Freeze balance and create pending withdrawal
    const withdrawal = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: { decrement: withdrawalAmount },
          frozenBalance: { increment: withdrawalAmount },
        },
      });

      return await tx.withdrawal.create({
        data: {
          walletId: wallet.id,
          amount: withdrawalAmount,
          destinationAddress,
          status: "OPEN", // Awaiting admin approval
        },
      });
    });

    // Log security event
    await prisma.securityEvent.create({
      data: {
        profileId: user.id,
        eventType: "WITHDRAWAL_REQUESTED",
        severity: "INFO",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        details: { amount, destinationAddress, withdrawalId: withdrawal.id },
      },
    });

    return NextResponse.json({
      message: "Withdrawal request submitted. Awaiting admin approval.",
      withdrawalId: withdrawal.id,
    });
  } catch (err: any) {
    console.error("Withdrawal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/wallet/withdraw - List user's withdrawals
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallet = await prisma.wallet.findFirst({ where: { profileId: user.id, currency: "USDT" } });
    if (!wallet) return NextResponse.json({ withdrawals: [] });

    const withdrawals = await prisma.withdrawal.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ withdrawals });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
