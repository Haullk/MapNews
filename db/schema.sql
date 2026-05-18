create extension if not exists postgis;

create table if not exists gdelt_import_batches (
  id bigserial primary key,
  import_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  files_attempted integer not null default 0,
  files_imported integer not null default 0,
  rows_seen integer not null default 0,
  rows_inserted integer not null default 0,
  rows_skipped integer not null default 0,
  error_message text,
  unique (import_date)
);

create table if not exists gdelt_events (
  global_event_id bigint primary key,
  event_date date not null,
  date_added timestamptz,
  actor1_name text,
  actor1_country_code text,
  actor2_name text,
  actor2_country_code text,
  event_code text,
  event_base_code text,
  event_root_code text,
  quad_class smallint,
  goldstein_scale numeric,
  num_mentions integer,
  num_sources integer,
  num_articles integer,
  avg_tone numeric,
  action_geo_type smallint,
  action_geo_fullname text,
  action_geo_country_code text,
  action_geo_adm1_code text,
  action_geo_lat double precision,
  action_geo_long double precision,
  action_geo_feature_id text,
  source_url text,
  geom geometry(Point, 4326),
  imported_at timestamptz not null default now()
);

create index if not exists gdelt_events_event_date_idx on gdelt_events (event_date desc);
create index if not exists gdelt_events_event_code_idx on gdelt_events (event_code);
create index if not exists gdelt_events_action_country_idx on gdelt_events (action_geo_country_code);
create index if not exists gdelt_events_num_articles_idx on gdelt_events (num_articles desc);
create index if not exists gdelt_events_geom_idx on gdelt_events using gist (geom);
