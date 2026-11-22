-- Четыре в ряд на FreasyGames: таблицы лидеров по очкам и по победам над Енотом подряд.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.chetyre_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_streak int not null default 0 check (best_streak between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists chetyre_scores_score on public.chetyre_scores (best_score desc);
create index if not exists chetyre_scores_streak on public.chetyre_scores (best_streak desc);

alter table public.chetyre_scores enable row level security;

drop policy if exists "chetyre_scores_select_all" on public.chetyre_scores;
create policy "chetyre_scores_select_all"
    on public.chetyre_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. За победу в раунде n — не больше 52 + 5·n очков (10 + 5·n + до 42 за быструю победу),
-- а на победу нужно хотя бы четыре своих хода, то есть несколько секунд.
create or replace function public.chetyre_submit(new_score int, new_streak int, new_time int)
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
    if new_score < 0 or new_streak < 0 or new_time < 0 or new_time > 10000000 or new_streak > 100000
       or new_streak > new_time / 3 + 1
       or new_score::bigint > 52::bigint * new_streak + 5::bigint * new_streak * (new_streak + 1) / 2 then
        raise exception 'Неверный результат';
    end if;
    insert into public.chetyre_scores (user_id, username, best_score, best_streak)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_streak)
    on conflict (user_id) do update
        set best_score = greatest(public.chetyre_scores.best_score, excluded.best_score),
            best_streak = greatest(public.chetyre_scores.best_streak, excluded.best_streak),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.chetyre_scores.best_score or excluded.best_streak > public.chetyre_scores.best_streak then now() else public.chetyre_scores.updated_at end;
end;
$$;

revoke all on function public.chetyre_submit(int, int, int) from public;
grant execute on function public.chetyre_submit(int, int, int) to authenticated;
