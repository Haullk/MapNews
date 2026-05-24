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

drop table if exists gdelt_events cascade;

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

comment on table gdelt_gkg_preserved is
  'GKG raw rows preserved for topic/entity/story-group enrichment; frontend reads only parsed P2 tables, not this raw table.';

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

alter table map_hotspots add column if not exists dominant_quad_class smallint;
alter table map_hotspots add column if not exists quad_class_breakdown jsonb not null default '[]'::jsonb;
alter table map_hotspots add column if not exists weighted_goldstein numeric;
alter table map_hotspots add column if not exists goldstein_min numeric;
alter table map_hotspots add column if not exists goldstein_max numeric;
alter table map_hotspots add column if not exists heat_delta numeric;
alter table map_hotspots add column if not exists trend_label text not null default '暂无对比';
alter table map_hotspots add column if not exists top_actors jsonb not null default '[]'::jsonb;

create table if not exists map_region_daily_metrics (
  data_date date not null,
  region_key text not null,
  region_name text not null,
  country_code text,
  centroid_lat double precision not null,
  centroid_long double precision not null,
  geom geometry(Point, 4326) not null,
  primary_channel text not null check (primary_channel in ('国际', '冲突', '政治', '经济', '灾害', '社会')),
  channel_count integer not null default 0,
  channel_breakdown jsonb not null default '[]'::jsonb,
  heat_score numeric not null default 0,
  heat_delta numeric,
  trend_label text not null default '暂无对比',
  event_count integer not null default 0,
  mention_count integer not null default 0,
  article_count integer not null default 0,
  source_count integer not null default 0,
  source_domain_count integer not null default 0,
  weighted_goldstein numeric,
  goldstein_min numeric,
  goldstein_max numeric,
  dominant_quad_class smallint,
  quad_class_breakdown jsonb not null default '[]'::jsonb,
  top_actors jsonb not null default '[]'::jsonb,
  data_updated_at timestamptz not null default now(),
  primary key (data_date, region_key)
);

create table if not exists map_hotspot_sources (
  id bigserial primary key,
  hotspot_id bigint not null references map_hotspots(id) on delete cascade,
  source_url text not null,
  source_domain text,
  title text,
  source_rank integer not null default 100,
  event_count integer not null default 0,
  mention_count integer not null default 0,
  source_score numeric not null default 0,
  first_seen_at timestamptz,
  latest_seen_at timestamptz,
  event_root_codes jsonb not null default '[]'::jsonb,
  actors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (hotspot_id, source_url)
);

create table if not exists article_metadata (
  url text primary key,
  canonical_url text,
  source_domain text,
  title text,
  description text,
  site_name text,
  author text,
  published_at timestamptz,
  language text,
  excerpt text,
  fetch_status text not null default 'pending' check (fetch_status in ('pending', 'success', 'failed', 'skipped')),
  http_status integer,
  error_message text,
  quality_flags jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gkg_documents (
  document_identifier text primary key,
  gkg_record_id text,
  source_common_name text,
  source_file_timestamp timestamptz,
  tone numeric,
  raw_tone text,
  theme_count integer not null default 0,
  entity_count integer not null default 0,
  raw_id text,
  parsed_at timestamptz not null default now()
);

create table if not exists gkg_themes (
  document_identifier text not null references gkg_documents(document_identifier) on delete cascade,
  theme text not null,
  weight integer not null default 1,
  primary key (document_identifier, theme)
);

create table if not exists gkg_entities (
  document_identifier text not null references gkg_documents(document_identifier) on delete cascade,
  entity_type text not null check (entity_type in ('person', 'organization', 'location')),
  entity_name text not null,
  weight integer not null default 1,
  primary key (document_identifier, entity_type, entity_name)
);

create table if not exists hotspot_story_groups (
  id bigserial primary key,
  hotspot_id bigint not null references map_hotspots(id) on delete cascade,
  story_key text not null,
  representative_title text not null,
  summary text not null,
  event_count integer not null default 0,
  mention_count integer not null default 0,
  source_count integer not null default 0,
  source_domain_count integer not null default 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  topics jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  quality_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotspot_id, story_key)
);

create table if not exists story_group_sources (
  id bigserial primary key,
  story_group_id bigint not null references hotspot_story_groups(id) on delete cascade,
  source_url text not null,
  source_domain text,
  title text,
  published_at timestamptz,
  source_rank integer not null default 100,
  is_duplicate boolean not null default false,
  duplicate_of_url text,
  quality_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (story_group_id, source_url)
);

create table if not exists hotspot_explanations (
  hotspot_id bigint primary key references map_hotspots(id) on delete cascade,
  title text not null,
  what_happened text not null,
  importance_reasons jsonb not null default '[]'::jsonb,
  source_quality jsonb not null default '{}'::jsonb,
  uncertainty_warnings jsonb not null default '[]'::jsonb,
  topics jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
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
  ('enable_gkg_loader', 'false', 'boolean', '是否装载 GKG 原始数据；默认关闭，后续可按需启用'),
  ('enable_mentions_heat', 'true', 'boolean', 'Mentions 是否参与热度计算'),
  ('retention_days', '90', 'integer', '前台产品层和趋势指标保留天数'),
  ('empty_map_keep_last_result', 'false', 'boolean', '无数据时前台是否保留旧标记'),
  ('p2_enrichment_enabled', 'false', 'boolean', '是否启用批处理二阶段热点解释增强任务；关闭时由用户点击热点按需触发'),
  ('p2_top_hotspots_per_channel', '20', 'integer', '二阶段每日每频道增强的热点数量'),
  ('p2_candidate_sources_per_hotspot', '50', 'integer', '二阶段每个热点用于故事组聚类的候选来源数量'),
  ('p2_sources_per_hotspot', '12', 'integer', '二阶段每个热点抓取的代表来源数量'),
  ('p2_fetch_timeout_seconds', '8', 'integer', '二阶段来源元数据抓取超时时间'),
  ('p2_fetch_concurrency', '5', 'integer', '二阶段来源元数据并发抓取数量')
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
create index if not exists gdelt_events_raw_file_timestamp_idx on gdelt_events_raw (source_file_timestamp);
create index if not exists gdelt_mentions_raw_event_idx on gdelt_mentions_raw (global_event_id);
create index if not exists gdelt_mentions_raw_file_timestamp_idx on gdelt_mentions_raw (source_file_timestamp);
create index if not exists gdelt_gkg_raw_batch_idx on gdelt_gkg_raw (import_batch_id);
create index if not exists gdelt_gkg_raw_file_timestamp_idx on gdelt_gkg_raw (source_file_timestamp);
create index if not exists gdelt_gkg_raw_document_timestamp_idx on gdelt_gkg_raw ((raw_row->>4), source_file_timestamp);
create index if not exists gdelt_events_clean_date_channel_idx on gdelt_events_clean (event_date desc, channel);
create index if not exists gdelt_events_clean_region_idx on gdelt_events_clean (region_key);
create index if not exists gdelt_events_clean_hotspot_source_idx on gdelt_events_clean (event_date, region_key, channel, source_url);
create index if not exists gdelt_events_clean_geom_idx on gdelt_events_clean using gist (geom);
create index if not exists gdelt_mentions_clean_event_idx on gdelt_mentions_clean (global_event_id);
create index if not exists gdelt_mentions_clean_event_source_idx on gdelt_mentions_clean (global_event_id, source_url);
create index if not exists gdelt_mentions_clean_domain_idx on gdelt_mentions_clean (source_domain);
create index if not exists map_hotspots_date_channel_heat_idx on map_hotspots (data_date desc, channel, heat_score desc);
create index if not exists map_hotspots_region_idx on map_hotspots (region_key);
create index if not exists map_hotspots_geom_idx on map_hotspots using gist (geom);
create index if not exists map_region_daily_metrics_date_heat_idx on map_region_daily_metrics (data_date desc, heat_score desc);
create index if not exists map_region_daily_metrics_region_date_idx on map_region_daily_metrics (region_key, data_date);
create index if not exists map_region_daily_metrics_geom_idx on map_region_daily_metrics using gist (geom);
create index if not exists map_hotspot_sources_hotspot_rank_idx on map_hotspot_sources (hotspot_id, source_rank);
create index if not exists map_hotspot_sources_hotspot_score_idx on map_hotspot_sources (hotspot_id, source_score desc);
create index if not exists article_metadata_domain_idx on article_metadata (source_domain);
create index if not exists article_metadata_status_idx on article_metadata (fetch_status, fetched_at);
create index if not exists gkg_documents_source_time_idx on gkg_documents (source_file_timestamp);
create index if not exists gkg_themes_theme_idx on gkg_themes (theme);
create index if not exists gkg_entities_name_idx on gkg_entities (entity_name);
create index if not exists hotspot_story_groups_hotspot_rank_idx on hotspot_story_groups (hotspot_id, source_count desc, mention_count desc);
create index if not exists story_group_sources_story_rank_idx on story_group_sources (story_group_id, source_rank);
create index if not exists access_audit_logs_accessed_idx on access_audit_logs (accessed_at desc);
