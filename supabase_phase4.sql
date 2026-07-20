-- ══════════════════════════════════════════════════════════════════
--  Phase 4 SQL — Run in Supabase SQL Editor
--  (Table Editor → SQL Editor → New query → paste → Run)
-- ══════════════════════════════════════════════════════════════════

-- 1. Create private storage bucket for master resumes
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- 2. RLS: each user can only access files under their own user-ID folder
create policy "own_resume_all"
  on storage.objects
  for all
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  )
  with check (
    bucket_id = 'resumes'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );
