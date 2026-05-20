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

alter table gdelt_import_batches add column if not exists events_status text not null default 'pending';
alter table gdelt_import_batches add column if not exists mentions_status text not null default 'pending';
alter table gdelt_import_batches add column if not exists gkg_status text not null default 'pending';
alter table gdelt_import_batches add column if not exists processing_status text not null default 'pending';
alter table gdelt_import_batches add column if not exists events_rows integer not null default 0;
alter table gdelt_import_batches add column if not exists mentions_rows integer not null default 0;
alter table gdelt_import_batches add column if not exists gkg_rows integer not null default 0;

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

create table if not exists gdelt_import_files (
  id bigserial primary key,
  batch_id bigint references gdelt_import_batches(id) on delete set null,
  import_date date not null,
  dataset text not null check (dataset in ('events', 'mentions', 'gkg')),
  file_timestamp timestamptz not null,
  file_name text not null,
  source_url text not null,
  local_path text,
  status text not null default 'pending' check (status in ('pending', 'downloaded', 'imported', 'skipped', 'failed')),
  rows_seen integer not null default 0,
  rows_inserted integer not null default 0,
  rows_skipped integer not null default 0,
  error_type text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (dataset, file_name)
);

create table if not exists gdelt_events_raw (
  global_event_id bigint primary key,
  import_batch_id bigint references gdelt_import_batches(id) on delete set null,
  source_file text not null,
  source_file_timestamp timestamptz not null,
  raw_row jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists gdelt_mentions_raw (
  raw_id text primary key,
  global_event_id bigint not null,
  import_batch_id bigint references gdelt_import_batches(id) on delete set null,
  source_file text not null,
  source_file_timestamp timestamptz not null,
  mention_identifier text,
  mention_time_date timestamptz,
  raw_row jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists gdelt_gkg_raw (
  raw_id text primary key,
  import_batch_id bigint references gdelt_import_batches(id) on delete set null,
  source_file text not null,
  source_file_timestamp timestamptz not null,
  document_identifier text,
  raw_row jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists gdelt_channel_mappings (
  id bigserial primary key,
  event_code_prefix text not null unique,
  channel text not null check (channel in ('国际', '冲突', '政治', '经济', '灾害', '社会')),
  description text,
  priority integer not null default 100,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into gdelt_channel_mappings (event_code_prefix, channel, description, priority) values
  ('01', '政治', '公开声明', 10),
  ('02', '政治', '呼吁与倡议', 10),
  ('03', '国际', '合作意向', 10),
  ('04', '国际', '磋商与外交接触', 10),
  ('05', '国际', '外交合作', 10),
  ('06', '经济', '物质合作', 10),
  ('07', '社会', '援助与救助', 10),
  ('08', '政治', '让步与妥协', 10),
  ('09', '政治', '调查', 10),
  ('10', '政治', '要求', 10),
  ('11', '政治', '反对', 10),
  ('12', '政治', '拒绝', 10),
  ('13', '冲突', '威胁', 10),
  ('14', '社会', '抗议', 10),
  ('15', '冲突', '军事姿态', 10),
  ('16', '国际', '关系削减', 10),
  ('17', '冲突', '胁迫', 10),
  ('18', '冲突', '攻击', 10),
  ('19', '冲突', '战斗', 10),
  ('20', '冲突', '非常规暴力', 10)
on conflict (event_code_prefix) do update
set channel = excluded.channel,
    description = excluded.description,
    priority = excluded.priority,
    enabled = true,
    updated_at = now();

create table if not exists gdelt_events_clean (
  global_event_id bigint primary key,
  import_batch_id bigint references gdelt_import_batches(id) on delete set null,
  event_date date not null,
  event_datetime timestamptz,
  date_added timestamptz,
  actor1_name text,
  actor1_country_code text,
  actor2_name text,
  actor2_country_code text,
  event_code text,
  event_base_code text,
  event_root_code text,
  channel text not null check (channel in ('国际', '冲突', '政治', '经济', '灾害', '社会')),
  quad_class smallint,
  goldstein_scale numeric,
  num_mentions integer not null default 0,
  num_sources integer not null default 0,
  num_articles integer not null default 0,
  avg_tone numeric,
  action_geo_type smallint,
  action_geo_fullname text,
  action_geo_country_code text,
  action_geo_adm1_code text,
  action_geo_feature_id text,
  region_key text not null,
  region_name text not null,
  action_geo_lat double precision not null,
  action_geo_long double precision not null,
  source_url text,
  source_domain text,
  geom geometry(Point, 4326) not null,
  cleaned_at timestamptz not null default now()
);

create table if not exists gdelt_mentions_clean (
  raw_id text primary key,
  global_event_id bigint not null,
  mention_time_date timestamptz,
  event_time_date timestamptz,
  mention_source_name text,
  mention_identifier text,
  source_url text,
  source_domain text,
  confidence integer,
  mention_doc_tone numeric,
  cleaned_at timestamptz not null default now()
);

create table if not exists gdelt_gkg_preserved (
  raw_id text primary key,
  document_identifier text,
  source_file text not null,
  source_file_timestamp timestamptz not null,
  raw_row jsonb not null,
  preserved_at timestamptz not null default now()
);

create table if not exists map_hotspots (
  id bigserial primary key,
  hotspot_uid text not null unique,
  data_date date not null,
  region_key text not null,
  region_name text not null,
  country_code text,
  channel text not null check (channel in ('国际', '冲突', '政治', '经济', '灾害', '社会')),
  centroid_lat double precision not null,
  centroid_long double precision not null,
  geom geometry(Point, 4326) not null,
  event_count integer not null default 0,
  mention_count integer not null default 0,
  article_count integer not null default 0,
  source_count integer not null default 0,
  source_domain_count integer not null default 0,
  heat_score numeric not null default 0,
  summary text not null,
  data_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists map_hotspot_sources (
  id bigserial primary key,
  hotspot_id bigint not null references map_hotspots(id) on delete cascade,
  source_url text not null,
  source_domain text,
  title text,
  source_rank integer not null default 100,
  created_at timestamptz not null default now(),
  unique (hotspot_id, source_url)
);

create table if not exists daily_briefs (
  data_date date primary key,
  hotspot_count integer not null default 0,
  top_regions jsonb not null default '[]'::jsonb,
  top_channels jsonb not null default '[]'::jsonb,
  completeness jsonb not null default '{}'::jsonb,
  brief_text text not null,
  data_updated_at timestamptz not null default now()
);

create table if not exists system_parameters (
  key text primary key,
  value text not null,
  value_type text not null default 'string',
  description text,
  updated_at timestamptz not null default now()
);

insert into system_parameters (key, value, value_type, description) values
  ('default_days', '1', 'integer', '首页默认展示最近可用日期'),
  ('ranking_limit', '20', 'integer', '热点排行默认数量'),
  ('enable_gkg_loader', 'true', 'boolean', '是否装载 GKG 原始数据'),
  ('enable_mentions_heat', 'true', 'boolean', 'Mentions 是否参与热度计算'),
  ('retention_days', '365', 'integer', '历史数据保留天数'),
  ('empty_map_keep_last_result', 'false', 'boolean', '无数据时前台是否保留旧标记')
on conflict (key) do update
set value = excluded.value,
    value_type = excluded.value_type,
    description = excluded.description,
    updated_at = now();

create table if not exists access_audit_logs (
  id bigserial primary key,
  accessed_at timestamptz not null default now(),
  path text not null,
  query_params jsonb not null default '{}'::jsonb,
  anonymous_session text,
  ip inet,
  user_agent text,
  hotspot_id bigint,
  response_status integer,
  duration_ms integer,
  error_message text
);

create index if not exists gdelt_import_files_date_dataset_idx on gdelt_import_files (import_date desc, dataset, status);
create index if not exists gdelt_events_raw_batch_idx on gdelt_events_raw (import_batch_id);
create index if not exists gdelt_mentions_raw_event_idx on gdelt_mentions_raw (global_event_id);
create index if not exists gdelt_gkg_raw_batch_idx on gdelt_gkg_raw (import_batch_id);
create index if not exists gdelt_events_clean_date_channel_idx on gdelt_events_clean (event_date desc, channel);
create index if not exists gdelt_events_clean_region_idx on gdelt_events_clean (region_key);
create index if not exists gdelt_events_clean_geom_idx on gdelt_events_clean using gist (geom);
create index if not exists gdelt_mentions_clean_event_idx on gdelt_mentions_clean (global_event_id);
create index if not exists gdelt_mentions_clean_domain_idx on gdelt_mentions_clean (source_domain);
create index if not exists map_hotspots_date_channel_heat_idx on map_hotspots (data_date desc, channel, heat_score desc);
create index if not exists map_hotspots_region_idx on map_hotspots (region_key);
create index if not exists map_hotspots_geom_idx on map_hotspots using gist (geom);
create index if not exists map_hotspot_sources_hotspot_rank_idx on map_hotspot_sources (hotspot_id, source_rank);
create index if not exists access_audit_logs_accessed_idx on access_audit_logs (accessed_at desc);
