-- Ритм на FreasyGames: таблицы лидеров по очкам за песню и по самой длинной серии без промахов.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.ritm_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_combo int not null default 0 check (best_combo between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists ritm_scores_score on public.ritm_scores (best_score desc);
create index if not exists ritm_scores_combo on public.ritm_scores (best_combo desc);

alter table public.ritm_scores enable row level security;

drop policy if exists "ritm_scores_select_all" on public.ritm_scores;
create policy "ritm_scores_select_all"
    on public.ritm_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Нот не больше 6 в секунду (восьмые на 170 BPM и аккорды),
-- нота даёт не больше 300 × 4 очков, серия не длиннее числа попаданий.
create or replace function public.ritm_submit(new_score int, new_combo int, new_hits int, new_time int)
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
    if new_score < 0 or new_combo < 0 or new_hits < 0 or new_time < 0 or new_time > 100000
        or new_hits > new_time * 6 + 10 or new_score > new_hits * 1200 or new_combo > new_hits then
        raise exception 'Неверный результат';
    end if;
    insert into public.ritm_scores (user_id, username, best_score, best_combo)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_combo)
    on conflict (user_id) do update
        set best_score = greatest(public.ritm_scores.best_score, excluded.best_score),
            best_combo = greatest(public.ritm_scores.best_combo, excluded.best_combo),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.ritm_scores.best_score or excluded.best_combo > public.ritm_scores.best_combo then now() else public.ritm_scores.updated_at end;
end;
$$;

revoke all on function public.ritm_submit(int, int, int, int) from public;
grant execute on function public.ritm_submit(int, int, int, int) to authenticated;
