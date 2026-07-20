import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import JobPilot from "./JobPilot.jsx";
import Auth from "./Auth.jsx";
import Admin from "./Admin.jsx";
import Onboarding from "./Onboarding.jsx";
import { supabase } from "./supabase.js";
import { fetchProfile, fetchDefaultProfile, listProfiles } from "./db.js";
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
  const [profileChecked, setProfileChecked] = useState(false); // have we fetched from Supabase?
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [activeProfile, setActiveProfile] = useState("Main"); // active career track name
  const hash = useHash();

  // ── Session listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const checkAndSet = async (session) => {
      if (!session) { setSession(null); setProfileChecked(false); setNeedsOnboarding(false); setActiveProfile("Main"); return; }
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
      // Check onboarding status via career_profiles (falls back to user_profiles)
      const careerRow = await fetchDefaultProfile(session.user.id);
      const profile = careerRow?.data ?? (await fetchProfile(session.user.id));
      if (careerRow?.profile_name) setActiveProfile(careerRow.profile_name);
      setNeedsOnboarding(!profile?.onboardingComplete);
      setProfileChecked(true);
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
  if (session === undefined || (session && !profileChecked)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!session) return <Auth />;

  // ── Onboarding (new users / incomplete profile) ───────────────────────────
  if (needsOnboarding) {
    return (
      <Onboarding
        user={session.user}
        onComplete={(profile) => {
          // profile is null if user clicked "Skip" on the welcome step
          setNeedsOnboarding(false);
        }}
      />
    );
  }

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
      activeProfile={activeProfile}
      onProfileSwitch={setActiveProfile}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
