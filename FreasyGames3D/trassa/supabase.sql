-- Трасса 3D на FreasyGames 3D: таблицы лидеров по самому длинному заезду и по монетам за заезд.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.trassa3d_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_distance int not null default 0 check (best_distance between 0 and 100000000),
    best_coins int not null default 0 check (best_coins between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists trassa3d_scores_distance on public.trassa3d_scores (best_distance desc);
create index if not exists trassa3d_scores_coins on public.trassa3d_scores (best_coins desc);

alter table public.trassa3d_scores enable row level security;

drop policy if exists "trassa3d_scores_select_all" on public.trassa3d_scores;
create policy "trassa3d_scores_select_all"
    on public.trassa3d_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она проверяет результат и хранит лучшие значения игрока.
create or replace function public.trassa3d_submit(new_distance int, new_coins int, new_time int)
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
    -- Пустой или отрицательный результат.
    if new_distance < 0 or new_coins < 0 or new_time < 0 then
        raise exception 'Неверный результат';
    end if;
    -- Быстрее 72 м/с (259 км/ч) машина не едет; запас — до 75 м/с.
    if new_distance > new_time * 75 + 50 then
        raise exception 'Неверный результат';
    end if;
    -- Монеты в рядах и за обгон «впритирку» — не больше нескольких в секунду.
    if new_coins > new_time * 8 + 20 then
        raise exception 'Неверный результат';
    end if;

    insert into public.trassa3d_scores (user_id, username, best_distance, best_coins)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_distance, new_coins)
    on conflict (user_id) do update
        set best_distance = greatest(public.trassa3d_scores.best_distance, excluded.best_distance),
            best_coins = greatest(public.trassa3d_scores.best_coins, excluded.best_coins),
            username = excluded.username,
            updated_at = case when excluded.best_distance > public.trassa3d_scores.best_distance or excluded.best_coins > public.trassa3d_scores.best_coins then now() else public.trassa3d_scores.updated_at end;
end;
$$;

revoke all on function public.trassa3d_submit(int, int, int) from public;
grant execute on function public.trassa3d_submit(int, int, int) to authenticated;
