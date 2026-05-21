# MapNews

MapNews 是一个面向中国大陆访问的地图新闻 MVP：Python 后台每天导入 GDELT Events，PostgreSQL + PostGIS 存储事件，Next.js 前台直接在服务端查询数据库并用本地 GeoJSON 地图展示全球事件点。

## 技术栈

- 前台：Next.js + React + TypeScript
- 地图：本地 Natural Earth GeoJSON + SVG/D3
- 后台：Python 批处理脚本
- 数据库：PostgreSQL + PostGIS
- 部署：腾讯云轻量云/CVM，Nginx + systemd，不使用 Docker

## 本地开发

1. 安装前端依赖：

```bash
npm install
```

2. 安装 Python 依赖：

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

3. 准备 `.env`：

```bash
cp .env.example .env
```

4. 初始化数据库：

```bash
python -m worker.init_db
```

5. 导入一天的 GDELT Events。先用 `--limit-files` 小批量试跑：

```bash
python -m worker.gdelt_importer --date 2026-05-17 --limit-files 2
```

6. 启动前台：

```bash
npm run dev
```

访问 `http://localhost:3000`。

## 数据说明

第一版只使用 GDELT 2.0 Events 的 `*.export.CSV.zip` 文件，不抓取全文，不接入 GKG/Mentions。地图坐标使用 `ActionGeo` 的经纬度；没有有效坐标的事件不会进入地图展示。

## 腾讯云部署

1. 在 CVM 安装 Node.js、Python 3.11、PostgreSQL、PostGIS、Nginx。
2. 创建系统用户 `mapnews`，把项目放到 `/opt/mapnews/app`。
3. 在 `/opt/mapnews/app/.env` 配置 `DATABASE_URL` 和 `GDELT_DATABASE_URL`。
4. 执行 `npm ci && npm run build`，并安装 Python 依赖。
5. 执行 `python -m worker.init_db` 初始化 schema。
6. 复制 `deploy/systemd/*.service` 和 `*.timer` 到 `/etc/systemd/system/`，启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mapnews-web.service
sudo systemctl enable --now mapnews-gdelt.timer
```

7. 复制 `deploy/nginx/mapnews.conf` 到 Nginx 站点配置，替换 `server_name`，再接入 HTTPS 证书。

## 测试

```bash
python -m unittest discover -s tests
npm run typecheck
```
