import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";

// POST /api/trades/[id]/dispute - Open a dispute
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tradeId } = await params;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { reason, description } = await request.json();
    if (!reason || !description) {
      return NextResponse.json({ error: "Reason and description are required" }, { status: 400 });
    }

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (trade.status === "RELEASED" || trade.status === "CANCELLED") {
      return NextResponse.json({ error: "Cannot dispute a completed or cancelled trade" }, { status: 400 });
    }

    // Check if dispute already exists
    const existingDispute = await prisma.dispute.findFirst({ where: { tradeId: tradeId, status: "OPEN" } });
    if (existingDispute) {
      return NextResponse.json({ error: "A dispute is already open for this trade" }, { status: 409 });
    }

    const [dispute] = await prisma.$transaction([
      prisma.dispute.create({
        data: {
          tradeId: tradeId,
          initiatorId: user.id,
          reason,
          description,
          status: "OPEN",
        },
      }),
      prisma.trade.update({
        where: { id: tradeId },
        data: { status: "DISPUTED", disputedAt: new Date() },
      }),
      prisma.tradeMessage.create({
        data: {
          tradeId: tradeId,
          content: `A dispute has been opened: ${reason}. An admin will review this shortly.`,
          isSystem: true,
        },
      }),
    ]);

    return NextResponse.json({ dispute }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
