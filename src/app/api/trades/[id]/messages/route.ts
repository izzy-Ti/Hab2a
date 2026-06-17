import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";

// POST /api/trades/[id]/messages - Send a chat message
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tradeId } = await params;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { content, fileUrl, fileType } = await request.json();
    if (!content && !fileUrl) {
      return NextResponse.json({ error: "Message content or file required" }, { status: 400 });
    }

    const message = await prisma.tradeMessage.create({
      data: {
        tradeId: tradeId,
        senderId: user.id,
        content: content || "",
        fileUrl,
        fileType,
        isSystem: false,
      },
      include: {
        sender: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/trades/[id]/messages - Get trade messages
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tradeId } = await params;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const messages = await prisma.tradeMessage.findMany({
      where: { tradeId: tradeId },
      include: { sender: { select: { id: true, username: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ messages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
