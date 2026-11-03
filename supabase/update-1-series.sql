-- 나의 할 일 — 보관함 업데이트 1: 여러 날·반복으로 함께 만든 할 일을 묶는 번호(series_id) 추가
-- Supabase 화면의 SQL Editor에 이 내용을 그대로 붙여 넣고 Run을 누르면 됩니다.
-- (처음부터 schema.sql로 만든 경우에도 한 번 더 실행해도 괜찮습니다)

alter table public.todos add column if not exists series_id uuid;

create index if not exists todos_user_series_idx on public.todos (user_id, series_id);
