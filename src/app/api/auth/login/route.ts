import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const supabase = await createClient();
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const userAgent = request.headers.get("user-agent") || "";

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Log failed attempt
      const { prisma } = await import("@/lib/prisma");
      await prisma.securityEvent.create({
        data: {
          eventType: "LOGIN_FAILED",
          severity: "WARNING",
          ipAddress: ip,
          userAgent,
          details: { email, reason: error.message },
        },
      });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Log successful login
    const { prisma } = await import("@/lib/prisma");
    await prisma.securityEvent.create({
      data: {
        profileId: data.user.id,
        eventType: "LOGIN_SUCCESS",
        severity: "INFO",
        ipAddress: ip,
        userAgent,
        details: { email },
      },
    });

    return NextResponse.json({
      message: "Login successful",
      user: { id: data.user.id, email: data.user.email },
      session: data.session,
    });
  } catch (err: any) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
