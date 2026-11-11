-- Отель «Полночь» на FreasyGames 3D: таблицы лидеров «Дальше всех» (до какой двери дошёл) и «Быстрее всех» (время побега).
-- Supabase-проект общий с PVZ (PVZ-Webgame), аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.hotel_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_door int not null default 0 check (best_door between 0 and 30),
    best_time int check (best_time is null or best_time between 40 and 36000),
    updated_at timestamptz not null default now()
);

create index if not exists hotel_scores_door on public.hotel_scores (best_door desc);
create index if not exists hotel_scores_time on public.hotel_scores (best_time asc);

alter table public.hotel_scores enable row level security;

drop policy if exists "hotel_scores_select_all" on public.hotel_scores;
create policy "hotel_scores_select_all"
    on public.hotel_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она проверяет результат и хранит лучшие значения игрока.
create or replace function public.hotel_submit(new_door int, new_time int)
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
    -- Тридцать дверей на этаже.
    if new_door is null or new_door < 0 or new_door > 30 then
        raise exception 'Неверный результат';
    end if;
    -- Время засчитывается только за побег; пройти 30 комнат быстрее 40 секунд нельзя.
    if new_time is not null and (new_door < 30 or new_time < 40 or new_time > 36000) then
        raise exception 'Неверный результат';
    end if;

    insert into public.hotel_scores (user_id, username, best_door, best_time)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_door, new_time)
    on conflict (user_id) do update
        set best_door = greatest(public.hotel_scores.best_door, excluded.best_door),
            best_time = case when excluded.best_time is null then public.hotel_scores.best_time
                             when public.hotel_scores.best_time is null then excluded.best_time
                             else least(public.hotel_scores.best_time, excluded.best_time) end,
            username = excluded.username,
            updated_at = case when excluded.best_door > public.hotel_scores.best_door
                                or coalesce(excluded.best_time < public.hotel_scores.best_time, public.hotel_scores.best_time is null and excluded.best_time is not null)
                              then now() else public.hotel_scores.updated_at end;
end;
$$;

revoke all on function public.hotel_submit(int, int) from public;
grant execute on function public.hotel_submit(int, int) to authenticated;
