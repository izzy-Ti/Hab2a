import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { releaseEscrowToBuyer, refundEscrowToSeller } from "@/lib/escrow";

function isAdmin(email?: string): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : ["admin@ethiopianp2p.com", "admin@p2p.com"];
  return adminEmails.includes(email.toLowerCase()) || email.toLowerCase().startsWith("admin@");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user || !isAdmin(user.email)) {
      return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
    }

    const { action, resolutionNotes } = await request.json();

    if (!action || !["RELEASE_TO_BUYER", "REFUND_TO_SELLER"].includes(action)) {
      return NextResponse.json({ error: "Invalid resolution action" }, { status: 400 });
    }

    const { id: disputeId } = await params;
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { trade: true },
    });

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    if (dispute.status !== "OPEN") {
      return NextResponse.json({ error: "Dispute is already resolved" }, { status: 400 });
    }

    const tradeId = dispute.tradeId;

    await prisma.$transaction(async (tx) => {
      // Execute the escrow release or refund based on action
      if (action === "RELEASE_TO_BUYER") {
        await releaseEscrowToBuyer(tradeId);
      } else {
        await refundEscrowToSeller(tradeId);
      }

      // Update the dispute status
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: "RESOLVED",
          resolutionNotes,
          resolvedByAdminId: user.id,
          resolvedAt: new Date(),
        },
      });

      // Notify the buyer
      await tx.notification.create({
        data: {
          profileId: dispute.trade.buyerId,
          title: `Dispute Resolved: Trade #${dispute.tradeId.substring(0, 8)}`,
          content: `The dispute has been resolved by an administrator. Action taken: ${
            action === "RELEASE_TO_BUYER" ? "Released to Buyer" : "Refunded to Seller"
          }. Notes: ${resolutionNotes || "None"}`,
          type: "TRADE",
        },
      });

      // Notify the seller
      await tx.notification.create({
        data: {
          profileId: dispute.trade.sellerId,
          title: `Dispute Resolved: Trade #${dispute.tradeId.substring(0, 8)}`,
          content: `The dispute has been resolved by an administrator. Action taken: ${
            action === "RELEASE_TO_BUYER" ? "Released to Buyer" : "Refunded to Seller"
          }. Notes: ${resolutionNotes || "None"}`,
          type: "TRADE",
        },
      });

      // Create admin action log
      await tx.adminAction.create({
        data: {
          adminId: user.id,
          actionType: `RESOLVE_DISPUTE_${action}`,
          details: { disputeId, tradeId, action, resolutionNotes },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          adminId: user.id,
          action: `RESOLVE_DISPUTE_${action}`,
          entityType: "DISPUTE",
          entityId: disputeId,
          details: { disputeId, tradeId, action, resolutionNotes },
        },
      });
    });

    return NextResponse.json({ success: true, message: "Dispute resolved successfully" });
  } catch (err: any) {
    console.error("Dispute resolution error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
