-- Пинбол на FreasyGames: таблицы лидеров по очкам за игру и по лучшему шару.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.pinbol_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_ball int not null default 0 check (best_ball between 0 and 100000000),
    updated_at timestamptz not null default now()
);

create index if not exists pinbol_scores_score on public.pinbol_scores (best_score desc);
create index if not exists pinbol_scores_ball on public.pinbol_scores (best_ball desc);

alter table public.pinbol_scores enable row level security;

drop policy if exists "pinbol_scores_select_all" on public.pinbol_scores;
create policy "pinbol_scores_select_all"
    on public.pinbol_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_time не хранится, по нему проверяется, что результат возможен:
-- лучший шар не больше всей игры, и не больше 3000 очков в секунду (бамперы с множителем ×5).
create or replace function public.pinbol_submit(new_score int, new_ball int, new_time int)
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
    if new_score < 0 or new_ball < 0 or new_time < 0 or new_time > 1000000
       or new_ball > new_score or new_score > (new_time + 10) * 3000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.pinbol_scores (user_id, username, best_score, best_ball)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_ball)
    on conflict (user_id) do update
        set best_score = greatest(public.pinbol_scores.best_score, excluded.best_score),
            best_ball = greatest(public.pinbol_scores.best_ball, excluded.best_ball),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.pinbol_scores.best_score or excluded.best_ball > public.pinbol_scores.best_ball then now() else public.pinbol_scores.updated_at end;
end;
$$;

revoke all on function public.pinbol_submit(int, int, int) from public;
grant execute on function public.pinbol_submit(int, int, int) to authenticated;
