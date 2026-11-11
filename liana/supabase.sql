-- Лиана на FreasyGames: таблицы лидеров по дальности и по крюкам за попытку.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.liana_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_distance int not null default 0 check (best_distance between 0 and 10000000),
    best_hooks int not null default 0 check (best_hooks between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists liana_scores_distance on public.liana_scores (best_distance desc);
create index if not exists liana_scores_hooks on public.liana_scores (best_hooks desc);

alter table public.liana_scores enable row level security;

drop policy if exists "liana_scores_select_all" on public.liana_scores;
create policy "liana_scores_select_all"
    on public.liana_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит лучшие значения игрока.
create or replace function public.liana_submit(new_distance int, new_hooks int)
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
    if new_distance is null or new_hooks is null or new_distance < 0 or new_distance > 10000000 or new_hooks < 0 or new_hooks > 1000000 then
        raise exception 'Неверный результат';
    end if;
    -- Крюки стоят не чаще чем раз в 7 метров.
    if new_hooks > new_distance / 7 + 10 then
        raise exception 'Неверный результат';
    end if;
    insert into public.liana_scores (user_id, username, best_distance, best_hooks)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_distance, new_hooks)
    on conflict (user_id) do update
        set best_distance = greatest(public.liana_scores.best_distance, excluded.best_distance),
            best_hooks = greatest(public.liana_scores.best_hooks, excluded.best_hooks),
            username = excluded.username,
            updated_at = case
                when excluded.best_distance > public.liana_scores.best_distance or excluded.best_hooks > public.liana_scores.best_hooks then now()
                else public.liana_scores.updated_at end;
end;
$$;

revoke all on function public.liana_submit(int, int) from public, anon;
grant execute on function public.liana_submit(int, int) to authenticated;
