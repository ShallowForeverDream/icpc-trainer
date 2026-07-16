# icpc-trainer

中文 ICPC / Codeforces 训练工作台，基于 Sites + vinext 构建。

## 当前能力

- 每道题首次打开时自动导入并缓存 Codeforces 原题面，默认显示原文，可像 QOJ 一样切换中文
- 保留公式、样例、表格和题面图片；缓存图片后用 OCR 识别英文，并在中文题面图片下显示译文
- 阿里云服务器优先使用快速翻译通道生成中文题面，并通过竞赛术语表、公式占位校验和版本缓存做校对；llama.cpp + Qwen2.5 与浏览器本地翻译作为双重备用
- 20 道精选题和 CF 2176C 继续提供人工整理中文题面作为即时兜底
- 通过 Codeforces 公开 API 校准题名、Rating，并按 Handle 同步最近提交
- 按 Rating 分页扩展完整公开题池
- 真实随机组卷与历史原场镜像 VP，支持排除 AC、Seed、计时恢复和判题同步
- 历届 ICPC 补题按原场提交时间轴重放真实榜单，保留封榜并插入自己的实时名次
- 国内 XCPCIO 原榜与国际 Codeforces 原榜使用同一套 VP 计分；已接入曼谷、台中、横滨等国际区域赛的站内题面、中文翻译、提交和原榜重放
- 可安装的 Chrome / Edge Manifest V3 桥接扩展：服务器被 Codeforces 限制时导入公开原题；用户在本站点击“直接提交”后，扩展使用浏览器中已有的 Codeforces、Universal Cup / QOJ 或洛谷登录会话，在隔离的后台标签页完成提交并把最终判题结果同步回本站
- 管理员账号、邀请码生成/撤销、邀请码注册、登录会话、反馈状态与密码修改
- Codeforces Handle 和每日目标作为统一训练偏好，供训练台、题库、提交记录和 VP 共用
- 题库筛选、题目编辑器、VP 构建器、模板库、收藏与训练台界面
- Sites 公开部署流程

Codeforces 公开题库与公开提交 API 不需要 API Key。少数 Gym 的原比赛榜单要求服务账号 API Key，可只在服务器 `backend/.env` 中配置 `CODEFORCES_API_KEY` 和 `CODEFORCES_API_SECRET`；密钥不会返回前端。浏览器扩展不会上传密码、Cookie 或 API Secret；题面导入只读取公开原题 HTML。只有用户在本站明确点击“直接提交”后，扩展才会把题号、语言和源码交给对应评测站并提交，评测站凭据始终留在浏览器会话中。

## 本地开发

```bash
npm install
npm run dev
npm test
```

Node.js 版本要求：`>=22.13.0`。

## 目录

- `app/data/problems.ts`：20 道离线兜底题元数据
- `app/data/problem-statements.ts`：离线中文题面与官方样例兜底
- `app/lib/statement-client.ts`：首次导入、语言切换、扩展桥接与浏览器本地翻译
- `app/api/codeforces/`：Codeforces 公开数据同步
- `app/problem/`：题库与题目训练界面
- `app/extension/`：扩展下载与安装指南
- `extension/`：浏览器扩展源码
- `public/icpc-trainer-extension.zip`：可下载扩展包
- `backend/`：部署在阿里云 ECS 的 Codeforces API、SQLite 题面缓存、图片 OCR、快速翻译与本地模型回退队列
- `deploy/`：公网 IP HTTPS、Nginx 与证书自动续期配置

## 已部署架构

Sites 托管前端，浏览器通过 HTTPS 访问阿里云 ECS 的 Node API。账号、邀请码、原文/中文题面和图片均持久化在 Docker 数据卷中的 SQLite 数据库；llama.cpp 模型只运行在服务器内网，不开放公网端口。

管理员账号通过服务器环境变量首次引导创建，密码不会写入仓库。不要提交邮箱密码、Codeforces API Secret 或服务器凭据。
