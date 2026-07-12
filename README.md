# icpc-trainer

中文 ICPC / Codeforces 训练工作台，基于 Sites + vinext 构建。

## 当前能力

- 20 道精选 Codeforces 题的中文结构化导读
- 通过 Codeforces 公开 API 校准题名、Rating，并按 Handle 同步最近提交
- 按 Rating 分页扩展完整公开题池
- 真实随机组卷与历史原场镜像 VP，支持排除 AC、Seed、计时恢复和判题同步
- 可安装的 Chrome / Edge Manifest V3 提交桥接扩展，支持预填或单次自动提交
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

## 后续优先级

1. 国内 API 网关与数据库适配
2. 中文题面导入审核后台
3. 扩展状态回传与更多语言支持
4. 管理员邀请码账号系统（暂不实现邮箱注册）

正式接入国内服务时，在 Sites 环境变量中配置网关地址；示例见 `.env.example`。不要提交邮箱密码、Codeforces API Secret 或服务器凭据。
