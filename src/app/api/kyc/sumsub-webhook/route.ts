import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// POST /api/kyc/sumsub-webhook
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-payload-digest");
    const secret = process.env.SUMSUB_WEBHOOK_SECRET;

    // Optional signature verification
    if (secret && signature) {
      const computedSignature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");

      if (computedSignature !== signature) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const { type, externalUserId, reviewResult, applicantId } = payload;

    if (!externalUserId) {
      return NextResponse.json({ error: "Missing externalUserId" }, { status: 400 });
    }

    // Find verification record
    const kycVerification = await prisma.kycVerification.findFirst({
      where: { profileId: externalUserId },
    });

    let kycStatus = "PENDING";
    let rejectionReason: string | null = null;

    if (type === "applicantReviewed") {
      const reviewAnswer = reviewResult?.reviewAnswer;
      if (reviewAnswer === "GREEN") {
        kycStatus = "APPROVED";
      } else if (reviewAnswer === "RED") {
        kycStatus = "REJECTED";
        rejectionReason = reviewResult?.moderationComment || "Verification failed";
      } else {
        kycStatus = "REVIEWING";
      }

      await prisma.$transaction(async (tx) => {
        // Update KYC Verification record
        await tx.kycVerification.upsert({
          where: { referenceId: externalUserId },
          create: {
            profileId: externalUserId,
            provider: "SUMSUB",
            referenceId: externalUserId,
            status: kycStatus as any,
            rejectionReason,
            rawResponse: payload,
          },
          update: {
            status: kycStatus as any,
            rejectionReason,
            rawResponse: payload,
            updatedAt: new Date(),
          },
        });

        // Update Profile kycStatus
        await tx.profile.update({
          where: { id: externalUserId },
          data: {
            kycStatus: kycStatus as any,
            kycVerifiedAt: kycStatus === "APPROVED" ? new Date() : null,
          },
        });

        // Create KYC status notification
        await tx.notification.create({
          data: {
            profileId: externalUserId,
            title: kycStatus === "APPROVED" ? "KYC Approved" : "KYC Rejected",
            content: kycStatus === "APPROVED"
              ? "Congratulations, your identity verification has been approved. You can now access all trading features."
              : `Your identity verification was rejected. Reason: ${rejectionReason || "Please review your documents and try again."}`,
            type: "KYC",
          },
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sumsub webhook error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
