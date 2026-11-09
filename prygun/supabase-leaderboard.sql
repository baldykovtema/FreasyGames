-- Прыгун на FreasyGames: таблицы лидеров по звёздам и по времени всей игры.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.prygun_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_stars int not null default 0 check (best_stars between 0 and 18),
    best_time int check (best_time is null or best_time between 300 and 3600000),
    updated_at timestamptz not null default now()
);

create index if not exists prygun_scores_stars on public.prygun_scores (best_stars desc);
create index if not exists prygun_scores_time on public.prygun_scores (best_time asc);

alter table public.prygun_scores enable row level security;

drop policy if exists "prygun_scores_select_all" on public.prygun_scores;
create policy "prygun_scores_select_all"
    on public.prygun_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она проверяет результат и хранит лучшие значения игрока.
create or replace function public.prygun_submit(new_stars int, new_time int)
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
    -- Шесть уровней по три звезды.
    if new_stars < 0 or new_stars > 18 then
        raise exception 'Неверный результат';
    end if;
    -- Каждый уровень бежать хотя бы 5 секунд, значит вся игра — не меньше 30 (в десятых долях секунды).
    if new_time is not null and (new_time < 300 or new_time > 3600000) then
        raise exception 'Неверный результат';
    end if;

    insert into public.prygun_scores (user_id, username, best_stars, best_time)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_stars, new_time)
    on conflict (user_id) do update
        set best_stars = greatest(public.prygun_scores.best_stars, excluded.best_stars),
            best_time = case when excluded.best_time is null then public.prygun_scores.best_time when public.prygun_scores.best_time is null then excluded.best_time else least(public.prygun_scores.best_time, excluded.best_time) end,
            username = excluded.username,
            updated_at = case when excluded.best_stars > public.prygun_scores.best_stars or coalesce(excluded.best_time < public.prygun_scores.best_time, public.prygun_scores.best_time is null and excluded.best_time is not null) then now() else public.prygun_scores.updated_at end;
end;
$$;

revoke all on function public.prygun_submit(int, int) from public;
grant execute on function public.prygun_submit(int, int) to authenticated;
