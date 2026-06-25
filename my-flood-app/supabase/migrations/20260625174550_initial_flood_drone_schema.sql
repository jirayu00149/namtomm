-- Supabase setup for Thai Flood Relief
-- Run this SQL in the Supabase SQL editor, then set the env vars from .env.example.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  role text not null default 'citizen' check (role in ('citizen', 'operator', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flood_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  reporter_name text,
  image_path text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  details text,
  source text not null default 'citizen' check (source in ('citizen', 'drone', 'operator')),
  drone_capture_id uuid,
  yolo_depth_cm numeric(8,2),
  yolo_risk text not null default 'pending' check (yolo_risk in ('pending', 'safe', 'watch', 'danger')),
  yolo_confidence numeric(5,4),
  yolo_labels text[] not null default '{}',
  priority text not null default 'normal' check (priority in ('critical', 'warning', 'normal')),
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'assigned', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flood_reports add column if not exists source text not null default 'citizen' check (source in ('citizen', 'drone', 'operator'));
alter table public.flood_reports add column if not exists drone_capture_id uuid;

create table if not exists public.drones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'offline' check (status in ('offline', 'ready', 'in_mission', 'returning', 'maintenance')),
  current_lat double precision check (current_lat between -90 and 90),
  current_lng double precision check (current_lng between -180 and 180),
  battery_percent integer check (battery_percent between 0 and 100),
  signal_percent integer check (signal_percent between 0 and 100),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drone_missions (
  id uuid primary key default gen_random_uuid(),
  drone_id uuid references public.drones(id) on delete set null,
  assigned_report_id uuid references public.flood_reports(id) on delete set null,
  mission_type text not null default 'survey' check (mission_type in ('survey', 'verify', 'route', 'delivery')),
  status text not null default 'queued' check (status in ('queued', 'active', 'completed', 'aborted')),
  target_lat double precision check (target_lat between -90 and 90),
  target_lng double precision check (target_lng between -180 and 180),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drone_telemetry (
  id bigserial primary key,
  drone_id uuid not null references public.drones(id) on delete cascade,
  mission_id uuid references public.drone_missions(id) on delete set null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  altitude_m numeric(8,2),
  speed_mps numeric(8,2),
  heading_deg numeric(6,2),
  battery_percent integer check (battery_percent between 0 and 100),
  signal_percent integer check (signal_percent between 0 and 100),
  recorded_at timestamptz not null default now()
);

create table if not exists public.drone_water_events (
  id uuid primary key default gen_random_uuid(),
  drone_id uuid references public.drones(id) on delete set null,
  device_code text not null,
  source_type text not null default 'yolo' check (source_type in ('yolo', 'mobile_photo', 'telemetry')),
  method text,
  model_path text,
  yolo_depth_cm numeric(8,2),
  yolo_risk text not null default 'pending' check (yolo_risk in ('pending', 'safe', 'watch', 'danger')),
  raw_severity text,
  confidence numeric(5,4),
  level_percent numeric(6,2),
  waterline_y numeric(10,2),
  frame_width integer,
  frame_height integer,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  location_accuracy_m numeric(10,2),
  detections jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.drone_captures (
  id uuid primary key default gen_random_uuid(),
  drone_id uuid references public.drones(id) on delete set null,
  mission_id uuid references public.drone_missions(id) on delete set null,
  flood_report_id uuid references public.flood_reports(id) on delete set null,
  image_path text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  yolo_depth_cm numeric(8,2),
  yolo_risk text not null default 'pending' check (yolo_risk in ('pending', 'safe', 'watch', 'danger')),
  yolo_confidence numeric(5,4),
  yolo_labels text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.flood_reports
  drop constraint if exists flood_reports_drone_capture_id_fkey;
alter table public.flood_reports
  add constraint flood_reports_drone_capture_id_fkey foreign key (drone_capture_id) references public.drone_captures(id) on delete set null;

create index if not exists flood_reports_created_at_idx on public.flood_reports (created_at desc);
create index if not exists flood_reports_status_idx on public.flood_reports (status);
create index if not exists flood_reports_priority_idx on public.flood_reports (priority);
create index if not exists flood_reports_user_id_idx on public.flood_reports (user_id);
create index if not exists drones_status_idx on public.drones (status);
create index if not exists drone_missions_status_idx on public.drone_missions (status);
create index if not exists drone_missions_drone_id_idx on public.drone_missions (drone_id);
create index if not exists drone_telemetry_drone_recorded_idx on public.drone_telemetry (drone_id, recorded_at desc);
create index if not exists drone_water_events_created_at_idx on public.drone_water_events (created_at desc);
create index if not exists drone_water_events_drone_created_idx on public.drone_water_events (drone_id, created_at desc);
create index if not exists drone_captures_created_at_idx on public.drone_captures (created_at desc);

insert into storage.buckets (id, name, public)
values ('flood-images', 'flood-images', false)
on conflict (id) do nothing;

grant usage on schema public to authenticated, service_role;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.flood_reports to authenticated;
grant select on table public.drones to authenticated;
grant select on table public.drone_missions to authenticated;
grant select on table public.drone_telemetry to authenticated;
grant select on table public.drone_water_events to authenticated;
grant select on table public.drone_captures to authenticated;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.flood_reports to service_role;
grant select, insert, update, delete on table public.drones to service_role;
grant select, insert, update, delete on table public.drone_missions to service_role;
grant select, insert, update, delete on table public.drone_telemetry to service_role;
grant select, insert, update, delete on table public.drone_water_events to service_role;
grant select, insert, update, delete on table public.drone_captures to service_role;
grant usage, select on sequence public.drone_telemetry_id_seq to service_role;

alter table public.profiles enable row level security;
alter table public.flood_reports enable row level security;
alter table public.drones enable row level security;
alter table public.drone_missions enable row level security;
alter table public.drone_telemetry enable row level security;
alter table public.drone_water_events enable row level security;
alter table public.drone_captures enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "reports_select_own" on public.flood_reports;
drop policy if exists "reports_insert_own" on public.flood_reports;
drop policy if exists "reports_update_own_unresolved" on public.flood_reports;
drop policy if exists "operator_select_drones" on public.drones;
drop policy if exists "operator_select_drone_missions" on public.drone_missions;
drop policy if exists "operator_select_drone_telemetry" on public.drone_telemetry;
drop policy if exists "operator_select_drone_water_events" on public.drone_water_events;
drop policy if exists "operator_select_drone_captures" on public.drone_captures;
drop policy if exists "storage_insert_own_report_images" on storage.objects;
drop policy if exists "storage_select_own_report_images" on storage.objects;
drop policy if exists "storage_insert_drone_captures" on storage.objects;
drop policy if exists "storage_select_drone_captures" on storage.objects;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "reports_select_own"
  on public.flood_reports for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "reports_insert_own"
  on public.flood_reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "reports_update_own_unresolved"
  on public.flood_reports for update
  to authenticated
  using ((select auth.uid()) = user_id and status <> 'resolved')
  with check ((select auth.uid()) = user_id);

create policy "operator_select_drones"
  on public.drones for select
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('operator', 'admin')));

create policy "operator_select_drone_missions"
  on public.drone_missions for select
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('operator', 'admin')));

create policy "operator_select_drone_telemetry"
  on public.drone_telemetry for select
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('operator', 'admin')));

create policy "operator_select_drone_water_events"
  on public.drone_water_events for select
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('operator', 'admin')));

create policy "operator_select_drone_captures"
  on public.drone_captures for select
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('operator', 'admin')));

create policy "storage_insert_own_report_images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'flood-images'
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "storage_select_own_report_images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'flood-images'
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "storage_insert_drone_captures"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'flood-images'
    and (storage.foldername(name))[1] = 'drone-captures'
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('operator', 'admin'))
  );

create policy "storage_select_drone_captures"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'flood-images'
    and (storage.foldername(name))[1] = 'drone-captures'
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('operator', 'admin'))
  );
