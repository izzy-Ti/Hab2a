import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function isAdmin(email?: string): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : ["admin@ethiopianp2p.com", "admin@p2p.com"];
  return adminEmails.includes(email.toLowerCase()) || email.toLowerCase().startsWith("admin@");
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user || !isAdmin(user.email)) {
      return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
    }

    const { action, rejectedReason } = await request.json();

    if (!action || !["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Must be APPROVE or REJECT." }, { status: 400 });
    }

    const withdrawalId = params.id;
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      return NextResponse.json({ error: "Withdrawal request not found" }, { status: 404 });
    }

    if (withdrawal.status !== "OPEN") {
      return NextResponse.json({ error: "Withdrawal has already been processed" }, { status: 400 });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id: withdrawal.walletId },
    });

    if (!wallet) {
      return NextResponse.json({ error: "Associated wallet not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (action === "APPROVE") {
        // Generate a mock TRON transaction hash
        const mockTxHash = "T" + crypto.randomBytes(32).toString("hex").substring(0, 63);

        // Deduct from frozen balance and total balance
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            frozenBalance: { decrement: withdrawal.amount },
            totalBalance: { decrement: withdrawal.amount },
          },
        });

        // Complete the withdrawal record
        await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: "RELEASED", // completed
            approvedByAdminId: user.id,
            txHash: mockTxHash,
          },
        });

        // Log transaction history
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: withdrawal.amount,
            type: "WITHDRAWAL",
            status: "COMPLETED",
            txHash: mockTxHash,
            description: `Withdrawal of ${withdrawal.amount} USDT to ${withdrawal.destinationAddress} completed successfully`,
          },
        });

        // Notify user
        await tx.notification.create({
          data: {
            profileId: wallet.profileId,
            title: "Withdrawal Completed",
            content: `Your withdrawal request of ${withdrawal.amount} USDT has been approved and completed. Tx Hash: ${mockTxHash}`,
            type: "WALLET",
          },
        });
      } else {
        // Return frozen balance back to available
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            frozenBalance: { decrement: withdrawal.amount },
            availableBalance: { increment: withdrawal.amount },
          },
        });

        // Reject the withdrawal record
        await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: "CANCELLED", // rejected
            rejectedReason: rejectedReason || "Rejected by administrator",
          },
        });

        // Log failed transaction history
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: withdrawal.amount,
            type: "WITHDRAWAL",
            status: "FAILED",
            description: `Withdrawal of ${withdrawal.amount} USDT was rejected. Reason: ${rejectedReason || "None specified"}`,
          },
        });

        // Notify user
        await tx.notification.create({
          data: {
            profileId: wallet.profileId,
            title: "Withdrawal Rejected",
            content: `Your withdrawal request of ${withdrawal.amount} USDT was rejected. Reason: ${rejectedReason || "None specified"}. Funds returned to available balance.`,
            type: "WALLET",
          },
        });
      }

      // Log admin action
      await tx.adminAction.create({
        data: {
          adminId: user.id,
          actionType: `WITHDRAWAL_${action}`,
          details: { withdrawalId, action, rejectedReason },
        },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          adminId: user.id,
          action: `WITHDRAWAL_${action}`,
          entityType: "WITHDRAWAL",
          entityId: withdrawalId,
          details: { withdrawalId, action, rejectedReason },
        },
      });
    });

    return NextResponse.json({ success: true, message: `Withdrawal request successfully ${action.toLowerCase()}d` });
  } catch (error: any) {
    console.error("Admin withdrawal action error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
