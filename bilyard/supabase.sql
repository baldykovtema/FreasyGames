-- Бильярд на FreasyGames: таблицы лидеров по очкам и по очищенным столам за одну игру.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.bilyard_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_rack int not null default 0 check (best_rack between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists bilyard_scores_score on public.bilyard_scores (best_score desc);
create index if not exists bilyard_scores_rack on public.bilyard_scores (best_rack desc);

alter table public.bilyard_scores enable row level security;

drop policy if exists "bilyard_scores_select_all" on public.bilyard_scores;
create policy "bilyard_scores_select_all"
    on public.bilyard_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. На столе не больше 15 шаров, шар за удар с n шарами стоит 10·n (n ≤ 15),
-- за очищенный стол — до 7 запасных ударов по 20 и 25 за номер партии.
create or replace function public.bilyard_submit(new_score int, new_rack int, new_potted int)
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
    if new_score < 0 or new_rack < 0 or new_potted < 0 or new_rack > 100000
       or new_potted > (new_rack + 1) * 15
       or new_score::bigint > new_potted::bigint * 150 + new_rack::bigint * (140 + 25 * (new_rack + 1)) then
        raise exception 'Неверный результат';
    end if;
    insert into public.bilyard_scores (user_id, username, best_score, best_rack)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_rack)
    on conflict (user_id) do update
        set best_score = greatest(public.bilyard_scores.best_score, excluded.best_score),
            best_rack = greatest(public.bilyard_scores.best_rack, excluded.best_rack),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.bilyard_scores.best_score or excluded.best_rack > public.bilyard_scores.best_rack then now() else public.bilyard_scores.updated_at end;
end;
$$;

revoke all on function public.bilyard_submit(int, int, int) from public;
grant execute on function public.bilyard_submit(int, int, int) to authenticated;
