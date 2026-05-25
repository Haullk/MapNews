## Overview

新增一个前端动态 Goldstein 色阶，以当前查询结果集为样本计算 P5/P95，并在地图 marker、hover 卡片和排行列表中复用。详情页和趋势图保留固定 `[-10,+10]` 量表。

## Design

- 在前端共享工具中定义 `GoldsteinColorScale`、`buildGoldsteinColorScale()`、`goldsteinColor()` 和 `goldsteinPosition()`。
- `NewsMap` 从 `displayHotspots[].weightedGoldstein` 构建动态色阶，并传给地图渲染和排行列表。
- `MapRenderer` 使用动态色阶渲染图例渐变和范围文案；中性点保持在 Goldstein `0` 对应位置。
- `AttitudeIndicator` 增加可选色阶参数，只在 hover compact 场景使用动态色阶；默认调用保持固定量表。
- 当有效样本过少、全为空或 P5/P95 过窄时，色阶回退到固定 `[-10,+10]` 或最小可读范围，避免异常颜色跳变。

## Non-Goals

- 不改变 Goldstein 数值计算、态势标签阈值、排序规则或趋势图坐标轴。
- 不修改后端接口、数据库 schema 或导入任务。
- 不把动态色阶应用到 90 天趋势或数据可信度说明。

## Risks

- 动态色阶会让同一个 Goldstein 数值在不同筛选范围下颜色略有变化，因此图例必须显示当前色阶范围。
- 当前结果集很小时动态色阶可能过度放大差异，需要最小范围兜底。
