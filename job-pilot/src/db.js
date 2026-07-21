/**
 * db.js — Supabase persistence layer for Job Pilot
 *
 * Strategy: localStorage for instant reads (no loading spinner),
 * Supabase for cloud persistence (survives device/browser changes).
 *
 * All functions are fire-and-forget safe — they never throw to the caller,
 * they just log errors so the UI stays responsive even if the network is down.
 */
import { supabase } from "./supabase.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const err = (fn, e) => console.warn(`[db.${fn}]`, e?.message ?? e);

// ── Career Profiles (multi-track support) ────────────────────────────────────

/** List all career tracks for a user. Returns [{profile_id, profile_name, is_default}] */
export async function listProfiles(userId) {
  try {
    const { data, error } = await supabase
      .from("career_profiles")
      .select("profile_id, profile_name, is_default, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  } catch (e) { err("listProfiles", e); return []; }
}

/** Fetch profile data + preferences for a specific track. */
export async function fetchCareerProfile(userId, profileName = "Main") {
  try {
    const { data, error } = await supabase
      .from("career_profiles")
      .select("profile_id, profile_name, is_default, data, preferences")
      .eq("user_id", userId)
      .eq("profile_name", profileName)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data ?? null;
  } catch (e) { err("fetchCareerProfile", e); return null; }
}

/** Fetch the default career profile (used on login). */
export async function fetchDefaultProfile(userId) {
  try {
    // Try to get the default-flagged profile first
    const { data, error } = await supabase
      .from("career_profiles")
      .select("profile_id, profile_name, is_default, data, preferences")
      .eq("user_id", userId)
      .eq("is_default", true)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    if (data) return data;
    // Fallback: get the first profile (Main)
    const { data: first, error: e2 } = await supabase
      .from("career_profiles")
      .select("profile_id, profile_name, is_default, data, preferences")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    if (e2 && e2.code !== "PGRST116") throw e2;
    return first ?? null;
  } catch (e) { err("fetchDefaultProfile", e); return null; }
}

/** Save (upsert) profile data + preferences for a specific track. */
export async function saveCareerProfile(userId, profileName, profileData, preferences) {
  try {
    const { error } = await supabase
      .from("career_profiles")
      .upsert({
        user_id:      userId,
        profile_name: profileName,
        data:         profileData,
        preferences:  preferences ?? {},
      }, { onConflict: "user_id,profile_name" });
    if (error) throw error;
  } catch (e) { err("saveCareerProfile", e); }
}

/** Create a new blank career track. Returns the new profile or null. */
export async function createCareerProfile(userId, profileName) {
  try {
    const { data, error } = await supabase
      .from("career_profiles")
      .insert({
        user_id:      userId,
        profile_name: profileName,
        is_default:   false,
        data:         { onboardingComplete: true },
        preferences:  {},
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) { err("createCareerProfile", e); return null; }
}

/** Delete a career track (cannot delete last remaining profile). */
export async function deleteCareerProfile(userId, profileName) {
  try {
    const { error } = await supabase
      .from("career_profiles")
      .delete()
      .eq("user_id", userId)
      .eq("profile_name", profileName);
    if (error) throw error;
  } catch (e) { err("deleteCareerProfile", e); }
}

/** Set a profile as the default. Clears is_default on all others first. */
export async function setDefaultProfile(userId, profileName) {
  try {
    // Clear all defaults for this user
    await supabase
      .from("career_profiles")
      .update({ is_default: false })
      .eq("user_id", userId);
    // Set the chosen one
    const { error } = await supabase
      .from("career_profiles")
      .update({ is_default: true })
      .eq("user_id", userId)
      .eq("profile_name", profileName);
    if (error) throw error;
  } catch (e) { err("setDefaultProfile", e); }
}

// ── Legacy profile functions (kept for Onboarding backward compat) ───────────

/** @deprecated Use saveCareerProfile instead. Kept for Onboarding.jsx. */
export async function fetchProfile(userId) {
  const row = await fetchDefaultProfile(userId);
  return row?.data ?? null;
}

/** @deprecated Use saveCareerProfile instead. */
export async function saveProfile(userId, profile) {
  try {
    // Try career_profiles first (new path)
    const { error } = await supabase
      .from("career_profiles")
      .upsert({
        user_id:      userId,
        profile_name: "Main",
        is_default:   true,
        data:         profile,
      }, { onConflict: "user_id,profile_name" });
    if (error) throw error;
  } catch (e) { err("saveProfile", e); }
}

// ── Job Listings (profile-aware) ─────────────────────────────────────────────

export async function fetchListings(userId, profileName = "Main") {
  try {
    const { data, error } = await supabase
      .from("job_listings")
      .select("listing_id, data")
      .eq("user_id", userId)
      .eq("profile_name", profileName)
      .order("data->dateAdded", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => r.data);
  } catch (e) { err("fetchListings", e); return null; }
}

/** Upsert a single listing (called on every individual edit). */
export async function saveListing(userId, listing, profileName = "Main") {
  try {
    const { error } = await supabase
      .from("job_listings")
      .upsert({
        listing_id:   listing.id,
        user_id:      userId,
        profile_name: profileName,
        data:         listing,
      });
    if (error) throw error;
  } catch (e) { err("saveListing", e); }
}

/** Sync the full listings array: upsert all current, delete removed. */
export async function syncListings(userId, listings, profileName = "Main") {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("job_listings")
      .select("listing_id")
      .eq("user_id", userId)
      .eq("profile_name", profileName);
    if (fetchErr) throw fetchErr;

    const existingIds = new Set((existing ?? []).map((r) => r.listing_id));
    const currentIds  = new Set(listings.map((l) => l.id));

    const toDelete = [...existingIds].filter((id) => !currentIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("job_listings")
        .delete()
        .eq("user_id", userId)
        .eq("profile_name", profileName)
        .in("listing_id", toDelete);
      if (delErr) throw delErr;
    }

    if (listings.length > 0) {
      const rows = listings.map((l) => ({
        listing_id:   l.id,
        user_id:      userId,
        profile_name: profileName,
        data:         l,
      }));
      const { error: upsertErr } = await supabase
        .from("job_listings")
        .upsert(rows);
      if (upsertErr) throw upsertErr;
    }
  } catch (e) { err("syncListings", e); }
}

export async function deleteListing(userId, listingId, profileName = "Main") {
  try {
    const { error } = await supabase
      .from("job_listings")
      .delete()
      .eq("user_id", userId)
      .eq("listing_id", listingId)
      .eq("profile_name", profileName);
    if (error) throw error;
  } catch (e) { err("deleteListing", e); }
}

// ── Preferences (kept for backward compat; new code uses career_profiles) ────

export async function fetchPrefs(userId) {
  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("data")
      .eq("id", userId)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data?.data ?? null;
  } catch (e) { err("fetchPrefs", e); return null; }
}

export async function savePrefs(userId, prefs) {
  try {
    const { error } = await supabase
      .from("user_preferences")
      .upsert({ id: userId, data: prefs });
    if (error) throw error;
  } catch (e) { err("savePrefs", e); }
}

// ── Skill State ───────────────────────────────────────────────────────────────

export async function fetchSkillState(userId) {
  try {
    const { data, error } = await supabase
      .from("skill_state")
      .select("data")
      .eq("id", userId)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data?.data ?? null;
  } catch (e) { err("fetchSkillState", e); return null; }
}

export async function saveSkillState(userId, state) {
  try {
    const { error } = await supabase
      .from("skill_state")
      .upsert({ id: userId, data: state });
    if (error) throw error;
  } catch (e) { err("saveSkillState", e); }
}

// ── Full cloud fetch (called once on login) ───────────────────────────────────

/**
 * Load all data in parallel for a given career track.
 * Returns { careerProfile, listings, skillState } — nulls if not found yet.
 */
export async function fetchAll(userId, profileName = "Main") {
  const [careerProfile, listings, skillState] = await Promise.all([
    fetchCareerProfile(userId, profileName),
    fetchListings(userId, profileName),
    fetchSkillState(userId),
  ]);
  // Extract data + preferences from the career profile row
  const profile = careerProfile?.data ?? null;
  const prefs   = careerProfile?.preferences ?? null;
  return { profile, prefs, listings, skillState };
}

// ── Active Track (persists last selected career track across sessions) ────────

/**
 * Write the user's currently active career track to Supabase.
 * Called every time the user switches tracks in the web app.
 * fetch_profile.py reads this so it always syncs the right track.
 */
export async function setActiveTrack(userId, trackName) {
  try {
    const { error } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, active_track: trackName, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (error) throw error;
  } catch (e) { err("setActiveTrack", e); }
}

/**
 * Read the user's last active career track from Supabase.
 * Returns the track name string, or null if not set yet.
 * Called on login in main.jsx to restore the track the user was last on.
 */
export async function getActiveTrack(userId) {
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("active_track")
      .eq("user_id", userId)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data?.active_track ?? null;
  } catch (e) { err("getActiveTrack", e); return null; }
}

// ── Debounce helper ───────────────────────────────────────────────────────────

const timers = {};
export function debounced(key, fn, delay = 1500) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(fn, delay);
}
