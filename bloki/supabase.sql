-- Блоки на FreasyGames: таблицы лидеров по очкам и по убранным линиям за одну игру.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.bloki_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_lines int not null default 0 check (best_lines between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists bloki_scores_score on public.bloki_scores (best_score desc);
create index if not exists bloki_scores_lines on public.bloki_scores (best_lines desc);

alter table public.bloki_scores enable row level security;

drop policy if exists "bloki_scores_select_all" on public.bloki_scores;
create policy "bloki_scores_select_all"
    on public.bloki_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: результат хранится лучший из всех.
create or replace function public.bloki_submit(new_score int, new_lines int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then
        raise exception 'Нужно войти в аккаунт';
    end if;
    if new_score < 0 or new_lines < 0 or new_lines > 100000 or new_score > 10000000 or new_score < new_lines * 10 then
        raise exception 'Неверный результат';
    end if;
    insert into public.bloki_scores (user_id, username, best_score, best_lines)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_lines)
    on conflict (user_id) do update
        set best_score = greatest(public.bloki_scores.best_score, excluded.best_score),
            best_lines = greatest(public.bloki_scores.best_lines, excluded.best_lines),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.bloki_scores.best_score or excluded.best_lines > public.bloki_scores.best_lines then now() else public.bloki_scores.updated_at end;
end;
$$;

revoke all on function public.bloki_submit(int, int) from public;
grant execute on function public.bloki_submit(int, int) to authenticated;
