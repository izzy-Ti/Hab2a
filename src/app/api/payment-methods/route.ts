import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";

// GET /api/payment-methods - Retrieve user's payment methods
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { profileId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ paymentMethods });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/payment-methods - Register a new payment method
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider, details } = await request.json();

    if (!provider || !details) {
      return NextResponse.json({ error: "Provider and details are required" }, { status: 400 });
    }

    const validProviders = ["CBE", "DASHEN", "AWASH", "ABYSSINIA", "TELEBIRR"];
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: "Unsupported payment provider" }, { status: 400 });
    }

    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        profileId: user.id,
        provider: provider as any,
        details,
        status: true,
      },
    });

    return NextResponse.json({ paymentMethod }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
