-- Косынка на FreasyGames: таблицы лидеров. Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.kosynka_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000),
    best_wins int not null default 0 check (best_wins between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists kosynka_scores_score on public.kosynka_scores (best_score desc);
create index if not exists kosynka_scores_wins on public.kosynka_scores (best_wins desc);

alter table public.kosynka_scores enable row level security;

drop policy if exists "kosynka_scores_select_all" on public.kosynka_scores;
create policy "kosynka_scores_select_all"
    on public.kosynka_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Лучший счёт за пасьянс и число собранных пасьянсов.
create or replace function public.kosynka_submit(new_score int, new_wins int)
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
    if new_score < 0 or new_score > 100000 or new_wins < 0 or new_wins > 100000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.kosynka_scores (user_id, username, best_score, best_wins)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_wins)
    on conflict (user_id) do update
        set best_score = greatest(public.kosynka_scores.best_score, excluded.best_score),
            best_wins = greatest(public.kosynka_scores.best_wins, excluded.best_wins),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.kosynka_scores.best_score or excluded.best_wins > public.kosynka_scores.best_wins then now() else public.kosynka_scores.updated_at end;
end;
$$;

revoke all on function public.kosynka_submit(int, int) from public;
grant execute on function public.kosynka_submit(int, int) to authenticated;
