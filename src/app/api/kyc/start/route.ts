import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { KycService } from "@/lib/kyc";

// POST /api/kyc/start - Initiate KYC verification
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await prisma.profile.findUnique({ where: { id: user.id } });
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    if (profile.kycStatus === "APPROVED") {
      return NextResponse.json({ error: "KYC already approved" }, { status: 409 });
    }

    const provider = KycService.getProvider();
    const verificationUrl = await provider.generateVerificationUrl(user.id);

    // Create or update KYC record
    await prisma.kycVerification.upsert({
      where: { referenceId: user.id },
      create: {
        profileId: user.id,
        provider: provider.name,
        referenceId: user.id,
        status: "PENDING",
      },
      update: {
        status: "PENDING",
        updatedAt: new Date(),
      },
    });

    await prisma.profile.update({
      where: { id: user.id },
      data: { kycStatus: "PENDING" },
    });

    return NextResponse.json({ verificationUrl, provider: provider.name });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/kyc/start - Get KYC status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const kyc = await prisma.kycVerification.findFirst({
      where: { profileId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { kycStatus: true, kycVerifiedAt: true },
    });

    return NextResponse.json({ kyc, kycStatus: profile?.kycStatus, kycVerifiedAt: profile?.kycVerifiedAt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
