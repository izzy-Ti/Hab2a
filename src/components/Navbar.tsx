"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState<string>("0.00");
  const [loading, setLoading] = useState(true);

  const fetchProfileAndBalance = async (userId: string) => {
    try {
      const res = await fetch("/api/wallet");
      if (res.ok) {
        const data = await res.json();
        setBalance(data.wallet?.availableBalance || "0.00");
      }
    } catch (err) {
      console.error("Error fetching balance:", err);
    }
  };

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchProfileAndBalance(session.user.id);
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchProfileAndBalance(session.user.id);
        } else {
          setUser(null);
          setBalance("0.00");
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await supabase.auth.signOut();
      router.push("/auth/login");
      router.refresh();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const isAdmin = user?.email && (
    user.email.toLowerCase().includes("admin") || 
    user.email.toLowerCase().startsWith("admin@")
  );

  return (
    <nav className="border-b border-[#2B3139] bg-[#181A20] text-[#EAECEF] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-[#F3BA2F]">
          <span className="bg-[#F3BA2F] text-[#181A20] w-7 h-7 rounded flex items-center justify-center font-black">E</span>
          EthioP2P
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            href="/"
            className={`hover:text-[#F3BA2F] transition-colors ${
              pathname === "/" ? "text-[#F3BA2F]" : "text-[#929AA5]"
            }`}
          >
            Marketplace
          </Link>
          {user && (
            <>
              <Link
                href="/dashboard"
                className={`hover:text-[#F3BA2F] transition-colors ${
                  pathname === "/dashboard" ? "text-[#F3BA2F]" : "text-[#929AA5]"
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/ads/new"
                className={`hover:text-[#F3BA2F] transition-colors ${
                  pathname === "/ads/new" ? "text-[#F3BA2F]" : "text-[#929AA5]"
                }`}
              >
                Post Ad
              </Link>
            </>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              className={`hover:text-[#F3BA2F] transition-colors ${
                pathname === "/admin" ? "text-[#F3BA2F]" : "text-[#929AA5]"
              }`}
            >
              Admin Panel
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {loading ? (
          <div className="w-6 h-6 border-2 border-t-transparent border-[#F3BA2F] rounded-full animate-spin"></div>
        ) : user ? (
          <div className="flex items-center gap-4 text-sm">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-[#EAECEF] font-semibold">{user.email}</span>
              <span className="text-xs text-[#F3BA2F]">{balance} USDT available</span>
            </div>
            <button
              onClick={handleLogout}
              className="bg-[#2B3139] hover:bg-[#383E47] text-[#EAECEF] px-4 py-2 rounded font-medium text-xs transition-colors"
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-[#929AA5] hover:text-[#EAECEF] px-3 py-2 text-sm font-medium transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/auth/register"
              className="bg-[#F3BA2F] hover:bg-[#FCD535] text-[#181A20] px-4 py-2 rounded text-sm font-semibold transition-colors"
            >
              Register
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
