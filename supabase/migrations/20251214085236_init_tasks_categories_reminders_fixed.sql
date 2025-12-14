BEGIN;
-- Ensure required extension for UUID generation exists
create extension if not exists pgcrypto;

-- Enums (create if missing)
DO $$ BEGIN
  CREATE TYPE priority AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE task_state AS ENUM ('todo','inprogress','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE recurrence AS ENUM ('none','daily','weekly','monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  icon text not null,
  created_at timestamptz not null default now()
);

-- Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  state task_state not null default 'todo',
  category_id uuid references public.categories(id) on delete set null,
  priority priority not null default 'medium',
  due_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_category_idx on public.tasks(category_id);
create index if not exists tasks_state_idx on public.tasks(state);
create index if not exists tasks_due_idx on public.tasks(due_at);

-- Reminders
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  remind_at timestamptz not null,
  recurrence recurrence not null default 'none',
  created_at timestamptz not null default now()
);
create index if not exists reminders_task_idx on public.reminders(task_id);
create index if not exists reminders_at_idx on public.reminders(remind_at);

-- RLS
alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;

-- Policies (drop then create for idempotency)
drop policy if exists "allow read all categories" on public.categories;
drop policy if exists "allow insert categories" on public.categories;
drop policy if exists "allow update categories" on public.categories;
drop policy if exists "allow delete categories" on public.categories;
create policy "allow read all categories" on public.categories for select using (true);
create policy "allow insert categories" on public.categories for insert with check (true);
create policy "allow update categories" on public.categories for update using (true) with check (true);
create policy "allow delete categories" on public.categories for delete using (true);

drop policy if exists "allow read all tasks" on public.tasks;
drop policy if exists "allow insert tasks" on public.tasks;
drop policy if exists "allow update tasks" on public.tasks;
drop policy if exists "allow delete tasks" on public.tasks;
create policy "allow read all tasks" on public.tasks for select using (true);
create policy "allow insert tasks" on public.tasks for insert with check (true);
create policy "allow update tasks" on public.tasks for update using (true) with check (true);
create policy "allow delete tasks" on public.tasks for delete using (true);

drop policy if exists "allow read all reminders" on public.reminders;
drop policy if exists "allow insert reminders" on public.reminders;
drop policy if exists "allow update reminders" on public.reminders;
drop policy if exists "allow delete reminders" on public.reminders;
create policy "allow read all reminders" on public.reminders for select using (true);
create policy "allow insert reminders" on public.reminders for insert with check (true);
create policy "allow update reminders" on public.reminders for update using (true) with check (true);
create policy "allow delete reminders" on public.reminders for delete using (true);
COMMIT;