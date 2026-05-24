# 设计说明

## Data Model And Queries

本阶段不新增数据库表。新增 `RegionEvent` 类型和 `queryRegionEvents()` 查询函数，直接读取 `gdelt_events_clean`：

- 输入：`date`、`regionKey`、可选 `limit`，默认 30。
- 过滤：`event_date = date` 且 `region_key = regionKey`。
- 排序：优先 `event_datetime desc`，再 `date_added desc`，再 `global_event_id desc`。
- 字段：事件时间、事件代码、频道、QuadClass、Actor1、Actor2、Goldstein、来源 URL/域名。
- 事件中文描述先使用轻量规则：优先复用根事件代码含义，未知代码显示 `事件代码 {code}`。

新增 `/api/region-events` route handler。它只做参数校验和调用查询函数，不引入独立 API 服务。

## Frontend Interaction

`NewsMap` 的布局从两列改为最多三列：

- 左侧 `control-panel`：今日简报、筛选、数据状态、排行始终存在。
- 中间 `MapRenderer`：继续负责地图和 marker。
- 右侧 `DetailsDrawer`：当 `selectedRegion` 存在时渲染。

右侧抽屉状态：

- `detailTab`: `"region" | "source"`。
- 点击 hotspot/ranking：设置 `selectedRegion`、`detailTab="region"`，并自动预取主主题详情。
- 预取主主题详情成功后，如果需要增强，自动调用现有 `/api/hotspots/[id]/enrich` 并轮询。
- 点击主题构成圆环色块：加载该频道详情并切到 `source`。
- `来源分析` tab 不禁用；无选中详情时展示空态，加载中展示加载态。

地区态势可读性：

- 顶部从技术诊断改为普通用户可读的热点概览，优先解释“这个地区为什么热”。
- 热度优先显示等级和排行语义，例如“高热度”“今日排行第 N”，原始分数作为次级指标。
- `主题构成` 上移到趋势和态势分布之前，作为用户进入来源分析的主入口。
- 主题构成使用单个圆环图表达各主题热度占比，hover/focus 时圆心显示对应主题信息，点击色块进入来源分析。
- `态势分布`、Goldstein、QuadClass 保留为支持信息，不再作为首屏主表达。

来源分析主题切换：

- `来源分析` 顶部展示当前地区全部主题按钮。
- 当前主题高亮，切换按钮复用现有频道详情加载和来源增强逻辑。
- 加载中或尚无选中详情时仍保留主题按钮，避免用户失去上下文。
- 不改 API、不改数据库；直接复用 `region.channelBreakdown` 和 `/api/hotspots/[id]`。

地区事件追溯接口：

- `/api/region-events` 作为内部数据追溯和后续产品探索接口保留。
- MVP 前台不展示原始 GDELT 事件时间线，也不在 `selectedRegion` 变化后自动请求该接口。
- 后续若产品化，应优先设计“新闻主题时间线”或折叠式“数据追溯”，避免普通用户误解结构化事件样本。

数据信任说明：

- 作为右侧抽屉底部共享折叠面板。
- 展示 GDELT Events 来源、Goldstein 含义、热度公式、地区综合热度口径、报道量偏差提醒和当前数据更新时间。

## Component Boundaries

新增或调整组件：

- `DetailsDrawer`：右侧抽屉容器和内部 Tab。
- `RegionDetail`：地区态势内容和主题构成入口。
- `ChannelDetail`：来源分析内容。
- `ThemeDonutChart`：地区态势中的主题占比圆环和进入来源分析的交互入口。
- `DataTrustPanel`：共享数据可信度/热度说明。

左侧排行继续使用已有 `RankingList`。地图 marker 层不改视觉编码。

## Operational Impact

无数据库迁移。新增 route handler 依赖 `gdelt_events_clean` 清洗数据；如果历史清理导致事件明细不存在，接口返回空列表和状态信息，不影响热点详情。
