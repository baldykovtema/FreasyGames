-- Орбита на FreasyGames: таблицы лидеров по звёздам за полёт и по самому долгому полёту.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.orbita_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 1000000),
    best_time int not null default 0 check (best_time between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists orbita_scores_score on public.orbita_scores (best_score desc);
create index if not exists orbita_scores_time on public.orbita_scores (best_time desc);

alter table public.orbita_scores enable row level security;

drop policy if exists "orbita_scores_select_all" on public.orbita_scores;
create policy "orbita_scores_select_all"
    on public.orbita_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит больше всего звёзд и самый долгий полёт игрока.
create or replace function public.orbita_submit(new_score int, new_time int)
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
    if new_score < 0 or new_score > 1000000 or new_time < 0 or new_time > 1000000 then
        raise exception 'Неверный результат';
    end if;
    -- Даже на самой высокой скорости звёзды попадаются не чаще нескольких раз в секунду.
    if new_score > new_time * 8 + 5 then
        raise exception 'Неверный результат';
    end if;
    insert into public.orbita_scores (user_id, username, best_score, best_time)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_time)
    on conflict (user_id) do update
        set best_score = greatest(public.orbita_scores.best_score, excluded.best_score),
            best_time = greatest(public.orbita_scores.best_time, excluded.best_time),
            username = excluded.username,
            updated_at = case
                when excluded.best_score > public.orbita_scores.best_score or excluded.best_time > public.orbita_scores.best_time then now()
                else public.orbita_scores.updated_at end;
end;
$$;

revoke all on function public.orbita_submit(int, int) from public;
grant execute on function public.orbita_submit(int, int) to authenticated;
