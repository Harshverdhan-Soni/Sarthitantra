import { useState } from "react";
import { supabase } from "./supabase.js";
import { Briefcase, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

const ACCENT = "#4f46e5";

// ── Google icon (inline SVG, no external dependency) ─────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export default function Auth() {
  const [mode, setMode]       = useState("signin"); // "signin" | "signup"
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]     = useState("");
  const [message, setMessage] = useState("");

  const clearState = () => { setError(""); setMessage(""); };

  // ── Email / Password ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    clearState();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Account created! Check your email to confirm your address, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange in main.jsx handles the redirect
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth ────────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    clearState();
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message || "Google sign-in failed.");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">

        {/* ── Logo ── */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <img src="/logo-icon.svg" alt="Sarthitantra" className="h-16 w-16 rounded-2xl shadow-lg shadow-indigo-200" />
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-1.5 mt-2">
              <span className="text-3xl font-bold tracking-tight text-indigo-900">Sarthi</span>
              <span className="text-2xl font-light tracking-[0.2em] text-violet-600">tantra</span>
            </div>
            <p className="mt-1 text-sm text-slate-500 tracking-wide">AI career navigator</p>
          </div>
        </div>

        {/* ── Card ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">

          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            {["signin", "signup"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); clearState(); }}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                  mode === m
                    ? "border-b-2 text-indigo-600"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                style={mode === m ? { borderBottomColor: ACCENT } : {}}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <div className="p-6">

            {/* ── Error / Success banners ── */}
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            {message && (
              <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                {message}
              </div>
            )}

            {/* ── Google button ── */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
              Continue with Google
            </button>

            {/* ── Divider ── */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex-1 border-t border-slate-200" />
              <span className="text-xs text-slate-400">or</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            {/* ── Email / Password form ── */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    minLength={mode === "signup" ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || googleLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: ACCENT }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Your data stays in your browser and your own files.
        </p>
      </div>
    </div>
  );
}
