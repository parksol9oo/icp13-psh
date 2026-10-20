-- 나의 할 일 — Supabase 보관함(표) 만들기
-- Supabase 화면의 SQL Editor에 이 내용을 그대로 붙여 넣고 Run을 누르면 됩니다.

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 50),
  description text not null check (char_length(description) between 1 and 100),
  due_date date not null,
  estimated_minutes integer check (estimated_minutes in (15, 30, 60, 120, 180)),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- 날짜별로 빠르게 찾기 위한 색인
create index if not exists todos_user_date_idx on public.todos (user_id, due_date);

-- 행 수준 보안: 로그인한 본인의 할 일만 보고 고칠 수 있게 한다
alter table public.todos enable row level security;

drop policy if exists "own todos" on public.todos;
create policy "own todos"
  on public.todos
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
