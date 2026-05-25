## Context

MapNews 当前把 GDELT 清洗事件按 `data_date + region_key + channel` 聚成 `map_hotspots`，再在 API 层按地区聚成地图综合热点。现有 `heat_score` 是绝对加权求和，趋势标签基于昨日差值和固定阈值，地区 Goldstein 聚合又从频道内的 mention 权重切换为 event_count 权重。

## Goals / Non-Goals

**Goals:**

- 降低媒体发达地区因为绝对报道量更大而天然占优的影响。
- 用近期历史基线替代昨日硬阈值，减少日级噪音。
- 保持默认排序仍是普通用户可理解的“报道热度”。
- 修复现有 `weighted_goldstein` 聚合权重不一致。

**Non-Goals:**

- 不新增面向用户的复杂态势指数。
- 不做 14 天或 30 天历史回填。
- 不改变频道映射、地图聚合口径或详情来源追溯能力。

## Decisions

- 热点层使用 `effective_mentions >= 2` 过滤。`effective_mentions` 取 GDELT 事件 `num_mentions` 与清洗 mention 行数的较大值；低于阈值的事件仍保留在 raw/clean 表，只是不参与产品热点。
- `heat_score` 使用 log 证据分数：`ln(1 + event_count) + ln(1 + mention_count) + ln(1 + source_domain_count)`。文章数和来源 URL 数保留为展示/追溯字段，但不直接参与评分。
- 趋势基线按同一 `region_key + channel` 的前 7 个可用日期计算。至少 3 天才输出 Z-score；不足时 `relative_heat_zscore` 为空，`trend_label = '基线不足'`。
- Z-score 标签规则：`z >= 2` 为“显著升温”，`1 <= z < 2` 为“升温”，`-1 < z < 1` 为“平稳”，`z <= -1` 为“冷却”。
- 保存 `goldstein_weight`，频道和地区聚合都用同一权重计算 `weighted_goldstein`。该字段仍作为既有态势值保留，不在前台新增复杂解释入口。
- `score_version` 使用稳定字符串标记本次口径，便于后续回溯和重算。

## Risks / Trade-offs

- [Risk] log 公式会压低大新闻与中等新闻的数值差距 → 通过地图气泡相对归一化和排行顺序继续表达强弱。
- [Risk] 历史数据不足时趋势不可用 → 前台显示“基线不足”，等待自然积累。
- [Risk] 低提及过滤会漏掉早期小地区信号 → 阈值采用 2 而非 3，并保留原始/清洗数据便于后续调整重算。
- [Risk] 旧数据缺少新增字段 → schema 使用 `add column if not exists`，处理任务重跑目标日期后填充新字段。
