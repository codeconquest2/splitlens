create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  preferred_currency text default 'USD',
  created_at timestamp with time zone default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete cascade,
  name text not null,
  email text,
  note text,
  created_at timestamp with time zone default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamp with time zone default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  created_at timestamp with time zone default now()
);

create table if not exists public.statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  month date not null,
  source_filename text,
  status text default 'processing' check (status in ('processing', 'review', 'done')),
  created_at timestamp with time zone default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid references public.statements (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  date date,
  merchant text,
  amount decimal,
  currency text default 'USD',
  category text,
  is_shared boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  month date not null,
  category text not null,
  planned_amount decimal not null default 0,
  currency text default 'USD',
  created_at timestamp with time zone default now()
);

create table if not exists public.manual_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  date date not null,
  description text not null,
  amount decimal not null,
  currency text default 'USD',
  category text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  description text,
  total_amount decimal,
  currency text default 'USD',
  date date,
  created_at timestamp with time zone default now()
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references public.shared_expenses (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  amount_owed decimal,
  paid boolean default false,
  paid_at timestamp with time zone null,
  created_at timestamp with time zone default now(),
  constraint expense_splits_user_or_contact_check check (user_id is not null or contact_id is not null)
);

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.statements enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.manual_expenses enable row level security;
alter table public.shared_expenses enable row level security;
alter table public.expense_splits enable row level security;

drop policy if exists "profiles read all" on public.profiles;
drop policy if exists "profiles insert own rows" on public.profiles;
drop policy if exists "profiles update own rows" on public.profiles;
create policy "profiles read all"
  on public.profiles
  for select
  to authenticated
  using (true);
create policy "profiles insert own rows"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());
create policy "profiles update own rows"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "contacts own rows" on public.contacts;
create policy "contacts own rows"
  on public.contacts
  for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "groups read all" on public.groups;
drop policy if exists "groups insert by creator" on public.groups;
drop policy if exists "groups update by creator" on public.groups;
create policy "groups read all"
  on public.groups
  for select
  to authenticated
  using (true);
create policy "groups insert by creator"
  on public.groups
  for insert
  to authenticated
  with check (created_by = auth.uid());
create policy "groups update by creator"
  on public.groups
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "group_members read all" on public.group_members;
drop policy if exists "group_members authenticated insert" on public.group_members;
drop policy if exists "group_members authenticated update" on public.group_members;
create policy "group_members read all"
  on public.group_members
  for select
  to authenticated
  using (true);
create policy "group_members authenticated insert"
  on public.group_members
  for insert
  to authenticated
  with check (true);
create policy "group_members authenticated update"
  on public.group_members
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "statements select own rows" on public.statements;
drop policy if exists "statements insert own rows" on public.statements;
drop policy if exists "statements update own rows" on public.statements;
create policy "statements select own rows"
  on public.statements
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "statements insert own rows"
  on public.statements
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "statements update own rows"
  on public.statements
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "transactions select own rows" on public.transactions;
drop policy if exists "transactions insert own rows" on public.transactions;
drop policy if exists "transactions update own rows" on public.transactions;
create policy "transactions select own rows"
  on public.transactions
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "transactions insert own rows"
  on public.transactions
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "transactions update own rows"
  on public.transactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "budgets select own rows" on public.budgets;
drop policy if exists "budgets insert own rows" on public.budgets;
drop policy if exists "budgets update own rows" on public.budgets;
create policy "budgets select own rows"
  on public.budgets
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "budgets insert own rows"
  on public.budgets
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "budgets update own rows"
  on public.budgets
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "manual_expenses select own rows" on public.manual_expenses;
drop policy if exists "manual_expenses insert own rows" on public.manual_expenses;
drop policy if exists "manual_expenses update own rows" on public.manual_expenses;
create policy "manual_expenses select own rows"
  on public.manual_expenses
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "manual_expenses insert own rows"
  on public.manual_expenses
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "manual_expenses update own rows"
  on public.manual_expenses
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "shared_expenses read all" on public.shared_expenses;
drop policy if exists "shared_expenses insert own rows" on public.shared_expenses;
drop policy if exists "shared_expenses update own rows" on public.shared_expenses;
create policy "shared_expenses read all"
  on public.shared_expenses
  for select
  to authenticated
  using (true);
create policy "shared_expenses insert own rows"
  on public.shared_expenses
  for insert
  to authenticated
  with check (true);
create policy "shared_expenses update own rows"
  on public.shared_expenses
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "expense_splits read all" on public.expense_splits;
drop policy if exists "expense_splits authenticated insert" on public.expense_splits;
drop policy if exists "expense_splits authenticated update" on public.expense_splits;
create policy "expense_splits read all"
  on public.expense_splits
  for select
  to authenticated
  using (true);
create policy "expense_splits authenticated insert"
  on public.expense_splits
  for insert
  to authenticated
  with check (true);
create policy "expense_splits authenticated update"
  on public.expense_splits
  for update
  to authenticated
  using (true)
  with check (true);
