-- Клёв на FreasyGames: таблицы лидеров по улову за рыбалку и по самой тяжёлой рыбе.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.klev_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 1000000),
    best_weight int not null default 0 check (best_weight between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists klev_scores_score on public.klev_scores (best_score desc);
create index if not exists klev_scores_weight on public.klev_scores (best_weight desc);

alter table public.klev_scores enable row level security;

drop policy if exists "klev_scores_select_all" on public.klev_scores;
create policy "klev_scores_select_all"
    on public.klev_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит лучший улов и самую тяжёлую рыбу игрока.
create or replace function public.klev_submit(new_score int, new_weight int)
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
    -- Рыбалка длится 2 минуты, на одну рыбу уходит не меньше 3 секунд, а дороже всего золотая рыбка (до 750 очков).
    -- Самый большой сом весит 25 кг.
    if new_score < 0 or new_score > 30000 or new_weight < 0 or new_weight > 25000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.klev_scores (user_id, username, best_score, best_weight)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_weight)
    on conflict (user_id) do update
        set best_score = greatest(public.klev_scores.best_score, excluded.best_score),
            best_weight = greatest(public.klev_scores.best_weight, excluded.best_weight),
            username = excluded.username,
            updated_at = case
                when excluded.best_score > public.klev_scores.best_score or excluded.best_weight > public.klev_scores.best_weight then now()
                else public.klev_scores.updated_at end;
end;
$$;

revoke all on function public.klev_submit(int, int) from public;
grant execute on function public.klev_submit(int, int) to authenticated;
