# 设计说明

## Layout

`NewsMap` 作为客户端工作台根组件渲染 toolbar 和地图工作区。`page.tsx` 只负责获取初始数据并挂载 `NewsMap`。toolbar 只包含品牌、今日简报和右上角最新数据日期；左侧栏顶部集中放日期、话题和统一搜索。排序控件跟随结果列表，避免顶部工具栏过重。

移动端保持纵向布局：toolbar 控件换行，左栏、地图和详情抽屉继续按现有移动端顺序排列。

## Color Semantics

主颜色语义统一为 Goldstein 态势值：

- 地图 marker 使用现有红白蓝态势色。
- 结果列表色条、圆点、热度条使用同一态势色。
- 话题用文字展示，不再作为结果列表主色。
- 右侧“话题占比”圆环保留话题色，因为该图表的唯一语义就是话题占比。

## Daily Brief And Freshness

复用 `/api/daily-brief`，返回结构扩展 `hotspotDelta`。服务端用当前日期和前一日期的 `daily_briefs.hotspot_count` 计算差值。顶部简报展示热点数、主要话题和较昨日变化，不展示长段自动摘要，也不展示数据导入完整性文案。

页面右上角只显示最新数据日期，例如 `最新数据 2026-05-23`。数据导入状态、完整性、文件进度等运维描述不作为常驻前台内容展示。

## Global Search

`/api/hotspots` 增加 `q` 参数。搜索逻辑在热点查询 CTE 中完成，搜索字段包括：

- `map_hotspots.region_name`、`summary`、`channel`、`top_actors`
- `map_hotspot_sources.title`、`source_domain`、`source_url`
- `gdelt_events_clean.actor1_name`、`actor2_name`、`region_name`、`source_url`、`source_domain`、`event_code`、`event_base_code`

搜索不依赖 GKG。关键词搜索以 `data_date` 为默认限制，继续使用现有 `limit` 上限。搜索先筛出匹配的 `map_hotspots.id`，再只用匹配频道参与地区聚合，避免把同地区但未命中的频道混入搜索结果。

前端统一搜索框放在左侧栏顶部，行为如下：

- 空输入清除 `q` 和 `region`。
- 输入命中本地地图地名时，执行地名定位并设置 `region`。
- 未命中地名时，设置 `q`，清除 `region`，重置到全球视图，并请求不带 bbox 的全局结果。
- 搜索结果排序沿用结果列表里的排序下拉选择。

## Loading And Close Interaction

简报首次加载显示简洁骨架；结果列表首次无数据加载显示列表骨架，已有数据刷新时保留旧结果并显示刷新提示。

地图空白点击关闭右侧详情抽屉：`pointerdown/up` 未发生拖拽且事件目标是地图画布背景时关闭。marker 已阻止 pointerdown 冒泡，点击 marker 不触发关闭。

## Operational Impact

不需要数据库迁移。搜索查询可能受数据量影响，先复用现有索引和日期限制；后续如搜索变慢，再单独增加全文索引或搜索表。
