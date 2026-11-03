-- 나의 할 일 — 보관함 업데이트 2: 하루 안에서 직접 정한 순서(sort_order) 추가
-- Supabase 화면의 SQL Editor에 이 내용을 그대로 붙여 넣고 Run을 누르면 됩니다.

alter table public.todos add column if not exists sort_order integer;
