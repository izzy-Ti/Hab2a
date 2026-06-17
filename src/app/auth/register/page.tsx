"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      // Log in client side too
      const { error: supabaseError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (supabaseError) {
        throw new Error(supabaseError.message);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#181A20] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-[#1E2329] p-8 rounded-xl border border-[#2B3139] shadow-2xl">
        <div>
          <div className="flex justify-center text-[#F3BA2F]">
            <span className="bg-[#F3BA2F] text-[#181A20] w-12 h-12 rounded-lg flex items-center justify-center font-black text-2xl">E</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-[#EAECEF]">
            Create a free account
          </h2>
          <p className="mt-2 text-center text-sm text-[#929AA5]">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-medium text-[#F3BA2F] hover:text-[#FCD535]">
              Log In here
            </Link>
          </p>
        </div>

        {error && (
          <div className="bg-[#4E1E24] border border-[#F84960] text-[#F84960] px-4 py-3 rounded-lg text-sm relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[#929AA5]">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-3 border border-[#474D57] placeholder-[#474D57] text-[#EAECEF] bg-[#181A20] rounded-lg focus:outline-none focus:ring-[#F3BA2F] focus:border-[#F3BA2F] sm:text-sm"
                placeholder="Enter username"
              />
            </div>
            <div>
              <label htmlFor="email-address" className="block text-sm font-medium text-[#929AA5]">
                Email Address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-3 border border-[#474D57] placeholder-[#474D57] text-[#EAECEF] bg-[#181A20] rounded-lg focus:outline-none focus:ring-[#F3BA2F] focus:border-[#F3BA2F] sm:text-sm"
                placeholder="Enter email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#929AA5]">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-3 border border-[#474D57] placeholder-[#474D57] text-[#EAECEF] bg-[#181A20] rounded-lg focus:outline-none focus:ring-[#F3BA2F] focus:border-[#F3BA2F] sm:text-sm"
                placeholder="Enter password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-[#181A20] bg-[#F3BA2F] hover:bg-[#FCD535] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F3BA2F] transition-all disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-t-transparent border-[#181A20] rounded-full animate-spin"></div>
              ) : (
                "Register Account"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
