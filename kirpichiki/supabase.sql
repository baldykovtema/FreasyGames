-- Кирпичики на FreasyGames: таблицы лидеров по очкам и по самому дальнему уровню.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.kirpichiki_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_level int not null default 0 check (best_level between 0 and 10000),
    updated_at timestamptz not null default now()
);

create index if not exists kirpichiki_scores_score on public.kirpichiki_scores (best_score desc);
create index if not exists kirpichiki_scores_level on public.kirpichiki_scores (best_level desc);

alter table public.kirpichiki_scores enable row level security;

drop policy if exists "kirpichiki_scores_select_all" on public.kirpichiki_scores;
create policy "kirpichiki_scores_select_all"
    on public.kirpichiki_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она проверяет результат и хранит лучшие значения игрока.
create or replace function public.kirpichiki_submit(new_score int, new_level int, new_time int)
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
    -- Игра начинается с первого уровня.
    if new_score < 0 or new_level < 1 or new_level > 10000 or new_time < 0 then
        raise exception 'Неверный результат';
    end if;
    -- Разбить все кирпичи уровня быстрее чем за 5 секунд не выйдет.
    if new_level > new_time / 5 + 1 then
        raise exception 'Неверный результат';
    end if;
    -- На уровне не больше 80 кирпичей по 4 удара, удар даёт до 50 очков, плюс бонус 100·N за уровень.
    if new_score > new_level * 17000 + 100 * new_level * new_level then
        raise exception 'Неверный результат';
    end if;

    insert into public.kirpichiki_scores (user_id, username, best_score, best_level)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_level)
    on conflict (user_id) do update
        set best_score = greatest(public.kirpichiki_scores.best_score, excluded.best_score),
            best_level = greatest(public.kirpichiki_scores.best_level, excluded.best_level),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.kirpichiki_scores.best_score or excluded.best_level > public.kirpichiki_scores.best_level then now() else public.kirpichiki_scores.updated_at end;
end;
$$;

revoke all on function public.kirpichiki_submit(int, int, int) from public;
grant execute on function public.kirpichiki_submit(int, int, int) to authenticated;
