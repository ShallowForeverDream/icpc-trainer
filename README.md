# icpc-trainer

中文 ICPC / Codeforces 训练工作台，基于 Sites + vinext 构建。

## 当前能力

- 20 道精选 Codeforces 题的中文结构化导读
- 通过 Codeforces 公开 API 校准题名、Rating，并按 Handle 同步最近提交
- 按 Rating 分页扩展完整公开题池
- 真实随机组卷与历史原场镜像 VP，支持排除 AC、Seed、计时恢复和判题同步
- 可安装的 Chrome / Edge Manifest V3 提交桥接扩展，支持预填或单次自动提交
- 管理员账号、邀请码生成、邀请码注册、登录会话与密码修改
- 题库筛选、题目编辑器、VP 构建器、模板库、收藏与训练台界面
- Sites 私密部署流程

Codeforces 公开题库与公开提交 API 不需要 API Key。浏览器扩展不会读取密码、Cookie 或 API Secret；它只把题号、语言和源码带到 Codeforces 官方提交页，最终提交由用户确认。

## 本地开发

```bash
npm install
npm run dev
npm test
```

Node.js 版本要求：`>=22.13.0`。

## 目录

- `app/data/problems.ts`：首批 20 道中文精选题
- `app/api/codeforces/`：Codeforces 公开数据同步
- `app/problem/`：题库与题目训练界面
- `app/extension/`：扩展下载与安装指南
- `extension/`：浏览器扩展源码
- `public/icpc-trainer-extension.zip`：可下载扩展包
- `backend/`：部署在阿里云 ECS 的轻量级 Codeforces API
- `deploy/`：公网 IP HTTPS、Nginx 与证书自动续期配置

## 已部署架构

Sites 托管前端，浏览器通过 HTTPS 访问阿里云 ECS 的轻量 Node API。账号、邀请码和会话持久化在 Docker 数据卷中的 SQLite 数据库；Codeforces 题库由 ECS 同步并缓存。

管理员账号通过服务器环境变量首次引导创建，密码不会写入仓库。不要提交邮箱密码、Codeforces API Secret 或服务器凭据。
