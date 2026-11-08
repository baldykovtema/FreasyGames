-- Прыгун на FreasyGames: уровни игроков из редактора.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.prygun_levels (
    id bigint generated always as identity primary key,
    author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    author_name text not null check (char_length(author_name) between 1 and 40),
    name text not null check (char_length(name) between 1 and 30),
    data jsonb not null check (pg_column_size(data) < 20000),
    plays int not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists prygun_levels_new on public.prygun_levels (created_at desc);
create index if not exists prygun_levels_top on public.prygun_levels (plays desc);
create index if not exists prygun_levels_author on public.prygun_levels (author_id);

alter table public.prygun_levels enable row level security;

drop policy if exists "prygun_levels_select_all" on public.prygun_levels;
create policy "prygun_levels_select_all" on public.prygun_levels for select to anon, authenticated using (true);

drop policy if exists "prygun_levels_insert_own" on public.prygun_levels;
create policy "prygun_levels_insert_own" on public.prygun_levels for insert to authenticated
    with check (author_id = auth.uid() and plays = 0);

drop policy if exists "prygun_levels_delete_own" on public.prygun_levels;
create policy "prygun_levels_delete_own" on public.prygun_levels for delete to authenticated using (author_id = auth.uid());

-- Имя автора всегда берётся из аккаунта, а не из запроса.
create or replace function public.prygun_levels_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.author_name := coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок');
    return new;
end;
$$;

drop trigger if exists prygun_levels_author on public.prygun_levels;
create trigger prygun_levels_author before insert on public.prygun_levels
    for each row execute function public.prygun_levels_author();

-- Счётчик «сыграно» меняется только через функцию: +1 за запуск.
create or replace function public.prygun_played(level_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.prygun_levels set plays = plays + 1 where id = level_id;
$$;

revoke all on function public.prygun_played(bigint) from public;
grant execute on function public.prygun_played(bigint) to anon, authenticated;
