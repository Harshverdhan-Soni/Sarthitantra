import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";
import {
  Users, LayoutDashboard, LogOut, RefreshCw, CheckCircle2,
  Clock, Loader2, AlertCircle, ChevronUp, ChevronDown,
  ArrowLeft, Briefcase, ShieldBan, ShieldCheck, Trash2, X,
} from "lucide-react";

const ACCENT = "#4f46e5";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}
function timeAgo(d) {
  if (!d) return "Never";
  const mins = Math.floor((Date.now() - new Date(d)) / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : fmt(d);
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-slate-500 text-sm font-medium">
        <Icon size={16} style={{ color }} />{label}
      </div>
      <p className="text-3xl font-bold" style={{ color }}>{value ?? "—"}</p>
    </div>
  );
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────
function ConfirmDialog({ email, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-100">
            <Trash2 size={18} className="text-rose-600" />
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <h3 className="mb-1 font-semibold text-slate-900">Delete account?</h3>
        <p className="mb-5 text-sm text-slate-500">
          This will permanently delete <span className="font-medium text-slate-700">{email}</span> and
          all their job listings. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sort hook ─────────────────────────────────────────────────────────────────
function useSorted(users) {
  const [key, setKey] = useState("created_at");
  const [dir, setDir] = useState("desc");
  const toggle = (k) => { if (key === k) setDir(d => d === "asc" ? "desc" : "asc"); else { setKey(k); setDir("desc"); } };
  const sorted = [...users].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av == null) return 1; if (bv == null) return -1;
    return dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });
  const Icon = ({ k }) => key !== k
    ? <ChevronUp size={13} className="text-slate-300" />
    : dir === "asc" ? <ChevronUp size={13} style={{ color: ACCENT }} /> : <ChevronDown size={13} style={{ color: ACCENT }} />;
  return { sorted, toggle, Icon };
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Admin({ user, onLogout, onBack }) {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [actionLoading, setAL]    = useState({}); // { [userId]: true }
  const [confirmDelete, setCD]    = useState(null); // user object to confirm
  const [toast, setToast]         = useState("");
  const [selectedUser, setSelectedUser] = useState(null); // user row clicked

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data, error } = await supabase.rpc("get_user_stats");
      if (error) throw error;
      setUsers(data ?? []);
    } catch (e) { setError(e.message ?? "Failed to load."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setUserLoading = (uid, val) => setAL(prev => ({ ...prev, [uid]: val }));

  // ── Block / Unblock ───────────────────────────────────────────────────────
  const handleBlock = async (u) => {
    setUserLoading(u.user_id, true);
    try {
      const fn = u.is_blocked ? "admin_unblock_user" : "admin_block_user";
      const { error } = await supabase.rpc(fn, { target_user_id: u.user_id });
      if (error) throw error;
      flash(u.is_blocked ? `${u.email} unblocked.` : `${u.email} blocked.`);
      setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, is_blocked: !x.is_blocked } : x));
    } catch (e) { flash(`Error: ${e.message}`); }
    finally { setUserLoading(u.user_id, false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setUserLoading(confirmDelete.user_id, true);
    try {
      const { error } = await supabase.rpc("admin_delete_user", { target_user_id: confirmDelete.user_id });
      if (error) throw error;
      flash(`${confirmDelete.email} deleted.`);
      setUsers(prev => prev.filter(x => x.user_id !== confirmDelete.user_id));
      setCD(null);
    } catch (e) { flash(`Error: ${e.message}`); setCD(null); }
    finally { setUserLoading(confirmDelete?.user_id, false); }
  };

  const { sorted, toggle, Icon: SortIcon } = useSorted(users);
  const filtered = sorted.filter(u => !search || u.email?.toLowerCase().includes(search.toLowerCase()));

  // Stats shown in cards — either selected user or aggregate totals
  const statsSource = selectedUser ? [selectedUser] : users;
  const statListings  = statsSource.reduce((s, u) => s + Number(u.listing_count  ?? 0), 0);
  const statAwaiting  = statsSource.reduce((s, u) => s + Number(u.awaiting_count ?? 0), 0);
  const statSubmitted = statsSource.reduce((s, u) => s + Number(u.submitted_count ?? 0), 0);
  const statTailored  = statsSource.reduce((s, u) => s + Number(u.tailored_count  ?? 0), 0);

  const cols = [
    { key: "email",           label: "User" },
    { key: "created_at",      label: "Joined" },
    { key: "last_sign_in_at", label: "Last active" },
    { key: "listing_count",   label: "Listings" },
    { key: "awaiting_count",  label: "Awaiting" },
    { key: "submitted_count", label: "Submitted" },
    { key: "tailored_count",  label: "Tailored" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Confirm dialog */}
      {confirmDelete && (
        <ConfirmDialog
          email={confirmDelete.email}
          loading={!!actionLoading[confirmDelete.user_id]}
          onConfirm={handleDelete}
          onCancel={() => setCD(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: ACCENT }}>
              <LayoutDashboard size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Admin Panel</h1>
              <p className="text-xs text-slate-500">Sarthitantra · {user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
              <ArrowLeft size={15} /> Back to app
            </button>
            <button onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle size={16} className="shrink-0" />{error}
          </div>
        )}

        {/* Stat cards — aggregate or per-user */}
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500">
            {selectedUser ? (
              <span>
                Showing stats for{" "}
                <span className="font-semibold text-slate-700">{selectedUser.email}</span>
              </span>
            ) : (
              <span>All users — click a row to view individual stats</span>
            )}
          </p>
          {selectedUser && (
            <button onClick={() => setSelectedUser(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <X size={13} /> Clear selection
            </button>
          )}
        </div>
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={Users}        label={selectedUser ? "User"             : "Total users"}       value={selectedUser ? 1              : users.length}  color="#4f46e5" />
          <StatCard icon={Briefcase}    label="Listings"         value={statListings}  color="#0284c7" />
          <StatCard icon={Clock}        label="Awaiting approval" value={statAwaiting}  color="#d97706" />
          <StatCard icon={CheckCircle2} label="Submitted"         value={statSubmitted} color="#16a34a" />
        </div>

        {/* User table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-800">
              All users
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                {users.length}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <input type="text" placeholder="Search by email…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              <button onClick={load} disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
              <Loader2 size={20} className="animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              {search ? "No users match your search." : "No users yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {cols.map(({ key, label }) => (
                      <th key={key} onClick={() => toggle(key)}
                        className="cursor-pointer px-5 py-3 text-left hover:text-slate-700 select-none">
                        <span className="inline-flex items-center gap-1">{label}<SortIcon k={key} /></span>
                      </th>
                    ))}
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((u) => {
                    const isSelf   = u.user_id === user?.id;
                    const busy     = !!actionLoading[u.user_id];
                    const isSelected = selectedUser?.user_id === u.user_id;
                    return (
                      <tr key={u.user_id}
                        onClick={(e) => {
                          // Don't trigger selection when clicking action buttons
                          if (e.target.closest("button")) return;
                          setSelectedUser(isSelected ? null : u);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200"
                            : u.is_blocked
                              ? "bg-rose-50 hover:bg-rose-100"
                              : "hover:bg-slate-50"
                        }`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${u.is_blocked ? "bg-rose-400" : ""}`}
                              style={!u.is_blocked ? { background: ACCENT } : {}}>
                              {u.email?.[0]?.toUpperCase() ?? "?"}
                            </div>
                            <div>
                              <span className="font-medium text-slate-700 truncate max-w-[180px] block" title={u.email}>
                                {u.email}
                              </span>
                              {u.is_blocked && (
                                <span className="text-xs font-semibold text-rose-500">Blocked</span>
                              )}
                              {isSelf && (
                                <span className="text-xs text-indigo-400 font-medium">You</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{fmt(u.created_at)}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`text-xs font-medium ${
                            u.last_sign_in_at && Date.now() - new Date(u.last_sign_in_at) < 86400000
                              ? "text-green-600" : "text-slate-400"}`}>
                            {timeAgo(u.last_sign_in_at)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center font-semibold text-slate-700">{u.listing_count ?? 0}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${Number(u.awaiting_count) > 0 ? "bg-amber-100 text-amber-700" : "text-slate-400"}`}>
                            {u.awaiting_count ?? 0}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${Number(u.submitted_count) > 0 ? "bg-green-100 text-green-700" : "text-slate-400"}`}>
                            {u.submitted_count ?? 0}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${Number(u.tailored_count) > 0 ? "bg-sky-100 text-sky-700" : "text-slate-400"}`}>
                            {u.tailored_count ?? 0}
                          </span>
                        </td>

                        {/* Action buttons */}
                        <td className="px-5 py-3.5">
                          {isSelf ? (
                            <span className="text-xs text-slate-300">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              {/* Block / Unblock */}
                              <button
                                onClick={() => handleBlock(u)}
                                disabled={busy}
                                title={u.is_blocked ? "Unblock user" : "Block user"}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                                  u.is_blocked
                                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                }`}>
                                {busy ? <Loader2 size={12} className="animate-spin" />
                                  : u.is_blocked ? <ShieldCheck size={12} /> : <ShieldBan size={12} />}
                                {u.is_blocked ? "Unblock" : "Block"}
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => setCD(u)}
                                disabled={busy}
                                title="Delete user"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-200 disabled:opacity-50">
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
