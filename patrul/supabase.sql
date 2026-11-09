-- Звёздный патруль на FreasyGames: таблицы лидеров по очкам и по самой дальней волне.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.patrul_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_wave int not null default 0 check (best_wave between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists patrul_scores_score on public.patrul_scores (best_score desc);
create index if not exists patrul_scores_wave on public.patrul_scores (best_wave desc);

alter table public.patrul_scores enable row level security;

drop policy if exists "patrul_scores_select_all" on public.patrul_scores;
create policy "patrul_scores_select_all"
    on public.patrul_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она проверяет результат и хранит лучшие значения игрока.
create or replace function public.patrul_submit(new_score int, new_wave int, new_start int, new_time int)
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
    -- Полёт начинается с волны 1 или с точки сохранения после босса (каждые 5 волн).
    if new_score < 0 or new_wave < 1 or new_wave > 100000 or new_start < 0 or new_start >= new_wave or new_start % 5 <> 0 or new_time < 0 then
        raise exception 'Неверный результат';
    end if;
    -- Волна длится хотя бы 5 секунд: врагов выпускают по одному.
    if new_wave - new_start > new_time / 5 + 1 then
        raise exception 'Неверный результат';
    end if;
    -- Враги волны N дают не больше ~70·N² очков вместе с боссами.
    if new_score > (new_wave + 5) * (new_wave + 5) * 150 + 1000 then
        raise exception 'Неверный результат';
    end if;

    insert into public.patrul_scores (user_id, username, best_score, best_wave)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_wave)
    on conflict (user_id) do update
        set best_score = greatest(public.patrul_scores.best_score, excluded.best_score),
            best_wave = greatest(public.patrul_scores.best_wave, excluded.best_wave),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.patrul_scores.best_score or excluded.best_wave > public.patrul_scores.best_wave then now() else public.patrul_scores.updated_at end;
end;
$$;

revoke all on function public.patrul_submit(int, int, int, int) from public;
grant execute on function public.patrul_submit(int, int, int, int) to authenticated;
