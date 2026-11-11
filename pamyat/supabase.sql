-- Цветная память на FreasyGames: таблицы лидеров по раундам и по очкам.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.pamyat_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_round int not null default 0 check (best_round between 0 and 100000),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    updated_at timestamptz not null default now()
);

create index if not exists pamyat_scores_distance on public.pamyat_scores (best_round desc);
create index if not exists pamyat_scores_hooks on public.pamyat_scores (best_score desc);

alter table public.pamyat_scores enable row level security;

drop policy if exists "pamyat_scores_select_all" on public.pamyat_scores;
create policy "pamyat_scores_select_all"
    on public.pamyat_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит лучшие значения игрока.
create or replace function public.pamyat_submit(new_round int, new_score int)
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
    if new_round is null or new_score is null or new_round < 0 or new_round > 100000 or new_score < 0 or new_score > 100000000 then
        raise exception 'Неверный результат';
    end if;
    -- Очки растут с раундами: за R раундов их не больше примерно R³/4 + 6R².
    if new_score > (new_round + 1)::bigint * (new_round + 1) * (new_round + 1) + 10 * (new_round + 1) * (new_round + 1) + 50 then
        raise exception 'Неверный результат';
    end if;
    insert into public.pamyat_scores (user_id, username, best_round, best_score)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_round, new_score)
    on conflict (user_id) do update
        set best_round = greatest(public.pamyat_scores.best_round, excluded.best_round),
            best_score = greatest(public.pamyat_scores.best_score, excluded.best_score),
            username = excluded.username,
            updated_at = case
                when excluded.best_round > public.pamyat_scores.best_round or excluded.best_score > public.pamyat_scores.best_score then now()
                else public.pamyat_scores.updated_at end;
end;
$$;

revoke all on function public.pamyat_submit(int, int) from public, anon;
grant execute on function public.pamyat_submit(int, int) to authenticated;
