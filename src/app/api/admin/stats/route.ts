import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";

function isAdmin(email?: string): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : ["admin@ethiopianp2p.com", "admin@p2p.com"];
  return adminEmails.includes(email.toLowerCase()) || email.toLowerCase().startsWith("admin@");
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user || !isAdmin(user.email)) {
      return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
    }

    // Fetch stats
    const totalUsers = await prisma.profile.count();
    const totalTrades = await prisma.trade.count();
    const completedTradesCount = await prisma.trade.count({ where: { status: "RELEASED" } });
    
    const volumeResult = await prisma.trade.aggregate({
      where: { status: "RELEASED" },
      _sum: { amount: true, fiatAmount: true },
    });

    const activeDisputes = await prisma.dispute.findMany({
      where: { status: "OPEN" },
      include: {
        trade: {
          include: {
            buyer: { select: { username: true, email: true } },
            seller: { select: { username: true, email: true } },
          },
        },
        initiator: { select: { username: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const pendingWithdrawals = await prisma.withdrawal.findMany({
      where: { status: "OPEN" }, // Managed state OPEN in Prisma schema for Withdrawal is TradeStatus or custom, let's check
      orderBy: { createdAt: "desc" },
    });

    const users = await prisma.profile.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        kycStatus: true,
        trustScore: true,
        completedTrades: true,
        totalTrades: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      stats: {
        totalUsers,
        totalTrades,
        completedTradesCount,
        totalUsdtVolume: volumeResult._sum.amount || 0,
        totalEtbVolume: volumeResult._sum.fiatAmount || 0,
      },
      activeDisputes,
      pendingWithdrawals,
      users,
    });
  } catch (error: any) {
    console.error("Admin stats fetch error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
