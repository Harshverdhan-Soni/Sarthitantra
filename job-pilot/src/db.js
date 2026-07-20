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

// ── Profile ──────────────────────────────────────────────────────────────────

export async function fetchProfile(userId) {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("data")
      .eq("id", userId)
      .single();
    if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
    return data?.data ?? null;
  } catch (e) { err("fetchProfile", e); return null; }
}

export async function saveProfile(userId, profile) {
  try {
    const { error } = await supabase
      .from("user_profiles")
      .upsert({ id: userId, data: profile });
    if (error) throw error;
  } catch (e) { err("saveProfile", e); }
}

// ── Preferences ──────────────────────────────────────────────────────────────

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

// ── Job Listings ──────────────────────────────────────────────────────────────

export async function fetchListings(userId) {
  try {
    const { data, error } = await supabase
      .from("job_listings")
      .select("listing_id, data")
      .eq("user_id", userId)
      .order("data->dateAdded", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => r.data);
  } catch (e) { err("fetchListings", e); return null; }
}

/** Upsert a single listing (called on every individual edit). */
export async function saveListing(userId, listing) {
  try {
    const { error } = await supabase
      .from("job_listings")
      .upsert({ listing_id: listing.id, user_id: userId, data: listing });
    if (error) throw error;
  } catch (e) { err("saveListing", e); }
}

/** Sync the full listings array: upsert all current, delete removed. */
export async function syncListings(userId, listings) {
  try {
    // 1. Fetch existing IDs from Supabase
    const { data: existing, error: fetchErr } = await supabase
      .from("job_listings")
      .select("listing_id")
      .eq("user_id", userId);
    if (fetchErr) throw fetchErr;

    const existingIds = new Set((existing ?? []).map((r) => r.listing_id));
    const currentIds  = new Set(listings.map((l) => l.id));

    // 2. Delete listings that no longer exist
    const toDelete = [...existingIds].filter((id) => !currentIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("job_listings")
        .delete()
        .eq("user_id", userId)
        .in("listing_id", toDelete);
      if (delErr) throw delErr;
    }

    // 3. Upsert all current listings
    if (listings.length > 0) {
      const rows = listings.map((l) => ({
        listing_id: l.id,
        user_id:    userId,
        data:       l,
      }));
      const { error: upsertErr } = await supabase
        .from("job_listings")
        .upsert(rows);
      if (upsertErr) throw upsertErr;
    }
  } catch (e) { err("syncListings", e); }
}

export async function deleteListing(userId, listingId) {
  try {
    const { error } = await supabase
      .from("job_listings")
      .delete()
      .eq("user_id", userId)
      .eq("listing_id", listingId);
    if (error) throw error;
  } catch (e) { err("deleteListing", e); }
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
 * Load all four data types in parallel.
 * Returns { profile, prefs, listings, skillState } — nulls if not found yet.
 */
export async function fetchAll(userId) {
  const [profile, prefs, listings, skillState] = await Promise.all([
    fetchProfile(userId),
    fetchPrefs(userId),
    fetchListings(userId),
    fetchSkillState(userId),
  ]);
  return { profile, prefs, listings, skillState };
}

// ── Debounce helper ───────────────────────────────────────────────────────────

const timers = {};
export function debounced(key, fn, delay = 1500) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(fn, delay);
}
