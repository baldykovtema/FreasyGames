-- Шашки на FreasyGames: таблицы лидеров по очкам за все победы и по лучшей серии побед подряд.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.shashki_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    points int not null default 0 check (points between 0 and 10000000),
    best_streak int not null default 0 check (best_streak between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists shashki_scores_points on public.shashki_scores (points desc);
create index if not exists shashki_scores_streak on public.shashki_scores (best_streak desc);

alter table public.shashki_scores enable row level security;

drop policy if exists "shashki_scores_select_all" on public.shashki_scores;
create policy "shashki_scores_select_all"
    on public.shashki_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию; игра отправляет результат после каждой победы.
-- Победа стоит 1–3 очка (по сложности бота), поэтому очки растут не больше чем на 3 за раз, а серия — на 1.
-- Первая отправка (вход после игры без аккаунта) переносит накопленное локально целиком.
create or replace function public.shashki_submit(new_points int, new_streak int)
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
    if new_points < 1 or new_points > 10000000 or new_streak < 0 or new_streak > 1000000 or new_streak > new_points then
        raise exception 'Неверный результат';
    end if;
    insert into public.shashki_scores (user_id, username, points, best_streak)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_points, new_streak)
    on conflict (user_id) do update
        set points = least(greatest(public.shashki_scores.points, excluded.points), public.shashki_scores.points + 3),
            best_streak = greatest(public.shashki_scores.best_streak, least(excluded.best_streak, public.shashki_scores.best_streak + 1)),
            username = excluded.username,
            updated_at = now();
end;
$$;

revoke all on function public.shashki_submit(int, int) from public;
grant execute on function public.shashki_submit(int, int) to authenticated;
