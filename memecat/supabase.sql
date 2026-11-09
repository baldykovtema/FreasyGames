-- Мемный Кот: Прыг на FreasyGames: таблицы лидеров по прогрессу на встроенных уровнях и по рыбкам.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.catjump_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_progress int not null default 0 check (best_progress between 0 and 1000),
    best_fish int not null default 0 check (best_fish between 0 and 10000),
    updated_at timestamptz not null default now()
);

create index if not exists catjump_scores_progress on public.catjump_scores (best_progress desc);
create index if not exists catjump_scores_fish on public.catjump_scores (best_fish desc);

alter table public.catjump_scores enable row level security;

drop policy if exists "catjump_scores_select_all" on public.catjump_scores;
create policy "catjump_scores_select_all"
    on public.catjump_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она проверяет результат и хранит лучшие значения игрока.
create or replace function public.catjump_submit(new_progress int, new_fish int)
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
    -- До 100% за каждый встроенный уровень; рыбок на уровнях немного.
    if new_progress < 0 or new_progress > 1000 or new_fish < 0 or new_fish > 10000 then
        raise exception 'Неверный результат';
    end if;

    insert into public.catjump_scores (user_id, username, best_progress, best_fish)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_progress, new_fish)
    on conflict (user_id) do update
        set best_progress = greatest(public.catjump_scores.best_progress, excluded.best_progress),
            best_fish = greatest(public.catjump_scores.best_fish, excluded.best_fish),
            username = excluded.username,
            updated_at = case when excluded.best_progress > public.catjump_scores.best_progress or excluded.best_fish > public.catjump_scores.best_fish then now() else public.catjump_scores.updated_at end;
end;
$$;

revoke all on function public.catjump_submit(int, int) from public;
grant execute on function public.catjump_submit(int, int) to authenticated;
