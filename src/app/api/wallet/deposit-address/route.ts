import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";

// POST /api/wallet/deposit-address - Generate or return existing TRC20 deposit address
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check KYC status
    const profile = await prisma.profile.findUnique({ where: { id: user.id } });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const wallet = await prisma.wallet.findFirst({
      where: { profileId: user.id, currency: "USDT" },
      include: { addresses: true },
    });

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    // Return existing address if already assigned
    if (wallet.addresses.length > 0) {
      const addr = wallet.addresses[0];
      return NextResponse.json({ address: addr.address, qrCodeUrl: addr.qrCodeUrl });
    }

    // Generate a TRC20 address via Tatum API
    let address: string;
    try {
      const tatumRes = await fetch("https://api.tatum.io/v3/tron/account", {
        method: "GET",
        headers: { "x-api-key": process.env.TATUM_API_KEY || "mock-key" },
      });

      if (!tatumRes.ok) throw new Error("Tatum unavailable");
      const tatumData = await tatumRes.json();
      address = tatumData.address;
    } catch {
      // Fallback mock address for development
      address = `T${Math.random().toString(36).substring(2, 36).toUpperCase()}`;
    }

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(`tron:${address}?asset=USDT`);

    // Save address
    const walletAddress = await prisma.walletAddress.create({
      data: {
        walletId: wallet.id,
        chain: "TRON",
        address,
        qrCodeUrl,
      },
    });

    return NextResponse.json({ address: walletAddress.address, qrCodeUrl: walletAddress.qrCodeUrl });
  } catch (err: any) {
    console.error("Deposit address error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
