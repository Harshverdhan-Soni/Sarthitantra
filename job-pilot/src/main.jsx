import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import JobPilot from "./JobPilot.jsx";
import Auth from "./Auth.jsx";
import Admin from "./Admin.jsx";
import { supabase } from "./supabase.js";
import "./index.css";

// ── Simple hash-based router ─────────────────────────────────────────────────
function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return hash;
}

// ── Root app ─────────────────────────────────────────────────────────────────
function App() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [isAdmin, setIsAdmin] = useState(false);
  const hash = useHash();

  // ── Session listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const checkAndSet = async (session) => {
      if (!session) { setSession(null); return; }
      // Enforce block: sign out immediately if account is blocked
      const { data: blocked } = await supabase
        .from("blocked_users")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (blocked) {
        await supabase.auth.signOut();
        setSession(null);
        alert("Your account has been suspended. Please contact the administrator.");
        return;
      }
      setSession(session);
    };

    supabase.auth.getSession().then(({ data: { session } }) => checkAndSet(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => checkAndSet(session)
    );
    return () => subscription.unsubscribe();
  }, []);

  // ── Admin check (runs whenever user logs in/out) ───────────────────────────
  useEffect(() => {
    if (!session?.user) { setIsAdmin(false); return; }
    supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [session?.user?.id]);

  const handleLogout = () => {
    supabase.auth.signOut();
    window.location.hash = "";
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!session) return <Auth />;

  // ── Admin panel route ──────────────────────────────────────────────────────
  if (hash === "#admin" && isAdmin) {
    return (
      <Admin
        user={session.user}
        onLogout={handleLogout}
        onBack={() => { window.location.hash = ""; }}
      />
    );
  }

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <JobPilot
      user={session.user}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      onAdmin={() => { window.location.hash = "admin"; }}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
