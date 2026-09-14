-- Run this file in Supabase SQL Editor.
-- The vector dimension must match GLM_EMBEDDING_DIMENSIONS in .env.local.

create extension if not exists vector;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_type text not null check (file_type in ('doc', 'docx', 'xls', 'xlsx')),
  storage_path text not null unique,
  size_bytes bigint not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  chunk_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(2048) not null,
  created_at timestamptz not null default now()
);

alter table public.documents
  drop constraint if exists documents_file_type_check;

alter table public.documents
  add constraint documents_file_type_check
  check (file_type in ('doc', 'docx', 'xls', 'xlsx'));

-- GLM embedding-3 returns 2048 dimensions. pgvector's HNSW index for vector
-- columns supports at most 2000 dimensions, so this version uses exact search.

create index if not exists document_chunks_document_id_idx
  on public.document_chunks(document_id);

create or replace function public.match_document_chunks(
  query_embedding vector(2048),
  match_count integer default 6
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  document_name text,
  similarity double precision
)
language sql
stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    d.name as document_name,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where d.status = 'completed'
  order by dc.embedding <=> query_embedding
  limit least(match_count, 12);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('knowledge-files', 'knowledge-files', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- The app uses the server-side service role for storage and database operations.
-- No public storage policy is needed for the first version.
