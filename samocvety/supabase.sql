-- Самоцветы на FreasyGames: таблицы лидеров по пройденным уровням и по очкам за все уровни.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.samocvety_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_level int not null default 0 check (best_level between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists samocvety_scores_score on public.samocvety_scores (best_score desc);
create index if not exists samocvety_scores_level on public.samocvety_scores (best_level desc);

alter table public.samocvety_scores enable row level security;

drop policy if exists "samocvety_scores_select_all" on public.samocvety_scores;
create policy "samocvety_scores_select_all"
    on public.samocvety_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Прогресс игрока копится на устройстве, поэтому проверяем только,
-- что очков не больше, чем можно получить за пройденные уровни (до 20 000 за уровень: каскады, спецкамни и сэкономленные ходы).
create or replace function public.samocvety_submit(new_score int, new_level int)
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
    if new_score < 0 or new_level < 1 or new_level > 100000 or new_score > new_level * 20000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.samocvety_scores (user_id, username, best_score, best_level)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_level)
    on conflict (user_id) do update
        set best_score = greatest(public.samocvety_scores.best_score, excluded.best_score),
            best_level = greatest(public.samocvety_scores.best_level, excluded.best_level),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.samocvety_scores.best_score or excluded.best_level > public.samocvety_scores.best_level then now() else public.samocvety_scores.updated_at end;
end;
$$;

revoke all on function public.samocvety_submit(int, int) from public;
grant execute on function public.samocvety_submit(int, int) to authenticated;
