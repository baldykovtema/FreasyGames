-- Клипы FreasyGames: опубликованные клипы, лайки, комментарии, подписки и хранилище видео.
-- Выполнить один раз в Supabase → SQL Editor (проект PVZ-Webgame, ywqxrbmgmvpbeytxjkpi). Можно запускать повторно.

-- ---------- хранилище видео ----------
-- Публичная корзина clips: файлы лежат в папке <id игрока>/…; загружать и удалять можно только в своей папке.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', true, 15728640, array['video/webm', 'video/mp4', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 15728640, allowed_mime_types = array['video/webm', 'video/mp4', 'image/jpeg'];

drop policy if exists "clips upload own" on storage.objects;
create policy "clips upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "clips delete own" on storage.objects;
create policy "clips delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- клипы ----------
create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  username text not null default '',
  avatar text,
  game text not null check (game ~ '^[a-z0-9-]{1,40}$'),
  game_title text not null default '' check (char_length(game_title) <= 60),
  game_url text not null default '' check (char_length(game_url) <= 200),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  overlay jsonb not null default '[]'::jsonb check (jsonb_typeof(overlay) = 'array' and pg_column_size(overlay) < 8000),
  video_path text not null check (char_length(video_path) <= 200),
  thumb_path text check (char_length(thumb_path) <= 200),
  duration real not null default 0 check (duration between 0 and 31),
  likes int not null default 0,
  comments int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists clips_created on public.clips (created_at desc);
create index if not exists clips_user on public.clips (user_id, created_at desc);
alter table public.clips enable row level security;

-- Ник, аватарка и счётчики ставит сервер, а не игрок; видео — только из своей папки.
create or replace function public.clips_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb;
begin
  select raw_user_meta_data into m from auth.users where id = auth.uid();
  new.user_id := auth.uid();
  new.username := coalesce(m ->> 'username', 'Игрок');
  new.avatar := case when length(coalesce(m ->> 'avatar', '')) < 12000 then m ->> 'avatar' end;
  new.likes := 0; new.comments := 0; new.created_at := now();
  if split_part(new.video_path, '/', 1) <> auth.uid()::text or (new.thumb_path is not null and split_part(new.thumb_path, '/', 1) <> auth.uid()::text) then
    raise exception 'wrong file path';
  end if;
  if (select count(*) from public.clips where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate limit: too many clips';
  end if;
  return new;
end $$;
drop trigger if exists clips_before_insert on public.clips;
create trigger clips_before_insert before insert on public.clips for each row execute function public.clips_before_insert();

-- Свой клип можно переименовать (только название и описание).
create or replace function public.clips_before_update() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id; new.user_id := old.user_id; new.username := old.username; new.avatar := old.avatar; new.game := old.game;
    new.game_title := old.game_title; new.game_url := old.game_url; new.video_path := old.video_path; new.thumb_path := old.thumb_path;
    new.duration := old.duration; new.likes := old.likes; new.comments := old.comments; new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists clips_before_update on public.clips;
create trigger clips_before_update before update on public.clips for each row execute function public.clips_before_update();

drop policy if exists "clips read" on public.clips;
create policy "clips read" on public.clips for select using (true);
drop policy if exists "clips insert own" on public.clips;
create policy "clips insert own" on public.clips for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "clips update own" on public.clips;
create policy "clips update own" on public.clips for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "clips delete own" on public.clips;
create policy "clips delete own" on public.clips for delete to authenticated using (user_id = auth.uid());
grant select on public.clips to anon, authenticated;
grant insert, update, delete on public.clips to authenticated;

-- ---------- лайки ----------
create table if not exists public.clip_likes (
  clip_id uuid not null references public.clips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);
alter table public.clip_likes enable row level security;
drop policy if exists "clip likes read" on public.clip_likes;
create policy "clip likes read" on public.clip_likes for select using (true);
drop policy if exists "clip likes own" on public.clip_likes;
create policy "clip likes own" on public.clip_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "clip likes remove own" on public.clip_likes;
create policy "clip likes remove own" on public.clip_likes for delete to authenticated using (user_id = auth.uid());
grant select on public.clip_likes to anon, authenticated;
grant insert, delete on public.clip_likes to authenticated;

create or replace function public.clip_likes_count() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.clips set likes = likes + 1 where id = new.clip_id;
  else update public.clips set likes = greatest(0, likes - 1) where id = old.clip_id; end if;
  return null;
end $$;
drop trigger if exists clip_likes_count on public.clip_likes;
create trigger clip_likes_count after insert or delete on public.clip_likes for each row execute function public.clip_likes_count();

-- ---------- комментарии ----------
create table if not exists public.clip_comments (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  username text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists clip_comments_clip on public.clip_comments (clip_id, created_at);
alter table public.clip_comments enable row level security;

create or replace function public.clip_comments_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.username := coalesce((select raw_user_meta_data ->> 'username' from auth.users where id = auth.uid()), 'Игрок');
  new.created_at := now();
  if (select count(*) from public.clip_comments where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate limit: too many comments';
  end if;
  return new;
end $$;
drop trigger if exists clip_comments_before_insert on public.clip_comments;
create trigger clip_comments_before_insert before insert on public.clip_comments for each row execute function public.clip_comments_before_insert();

create or replace function public.clip_comments_count() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.clips set comments = comments + 1 where id = new.clip_id;
  else update public.clips set comments = greatest(0, comments - 1) where id = old.clip_id; end if;
  return null;
end $$;
drop trigger if exists clip_comments_count on public.clip_comments;
create trigger clip_comments_count after insert or delete on public.clip_comments for each row execute function public.clip_comments_count();

drop policy if exists "clip comments read" on public.clip_comments;
create policy "clip comments read" on public.clip_comments for select using (true);
drop policy if exists "clip comments write" on public.clip_comments;
create policy "clip comments write" on public.clip_comments for insert to authenticated with check (user_id = auth.uid());
-- удалить комментарий может его автор и автор клипа
drop policy if exists "clip comments delete" on public.clip_comments;
create policy "clip comments delete" on public.clip_comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.clips c where c.id = clip_id and c.user_id = auth.uid()));
grant select on public.clip_comments to anon, authenticated;
grant insert, delete on public.clip_comments to authenticated;

-- ---------- подписки ----------
create table if not exists public.clip_follows (
  follower uuid not null default auth.uid() references auth.users (id) on delete cascade,
  followee uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists clip_follows_followee on public.clip_follows (followee);
alter table public.clip_follows enable row level security;
drop policy if exists "clip follows read" on public.clip_follows;
create policy "clip follows read" on public.clip_follows for select using (true);
drop policy if exists "clip follows own" on public.clip_follows;
create policy "clip follows own" on public.clip_follows for insert to authenticated with check (follower = auth.uid());
drop policy if exists "clip follows remove own" on public.clip_follows;
create policy "clip follows remove own" on public.clip_follows for delete to authenticated using (follower = auth.uid());
grant select on public.clip_follows to anon, authenticated;
grant insert, delete on public.clip_follows to authenticated;

-- Профиль автора: подписчики, подписки, клипы и лайки.
create or replace function public.clip_profile(uid uuid) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'followers', (select count(*) from public.clip_follows where followee = uid),
    'following', (select count(*) from public.clip_follows where follower = uid),
    'clips', (select count(*) from public.clips where user_id = uid),
    'likes', (select coalesce(sum(likes), 0) from public.clips where user_id = uid)
  );
$$;
grant execute on function public.clip_profile(uuid) to anon, authenticated;
