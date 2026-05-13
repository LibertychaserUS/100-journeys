# 100 Journeys 交付文件索引

> 本索引用于提交审阅。提交包仅包含正式交付文档、源码、脚本、测试和生成图表。

## 1. 必读文档

| 文件 | 用途 |
|---|---|
| `README.md` | 中英双语项目说明、运行指南、技术栈、后台账号口径、Mermaid 图 |
| `docs/INITIAL_PRD.md` | 初始作业需求与原始开端文档 |
| `docs/PRD.md` | 当前 PRD，按实际代码和功能回写 |
| `docs/BDD-spec.md` | BDD 业务行为规格与 Given/When/Then 验收场景 |
| `docs/schema/SDD-spec.md` | SDD 数据模型与 API 契约阶段说明 |
| `docs/ui-components/DDD-spec.md` | DDD/UI 设计驱动规格 |
| `docs/testing/TDD-spec.md` | TDD 测试设计与验证矩阵 |
| `docs/schema/api-contract.md` | API 文档 |
| `docs/SAMPLE_DATA.md` | 12 条样例旅程数据质量说明 |
| `docs/prompts/prompt-log.md` | 核心 Prompt 记录，含 SDD/DDD/TDD/E2E 阶段 |
| `docs/workflow/AI_DEVELOPMENT_WORKFLOW.md` | Claude Code + Kimi API 工程化 AI 开发流程说明 |
| `docs/USER_CASES.md` | 游客、正式用户、管理员用例与权限矩阵 |
| `docs/ops/LOCAL_ONE_CLICK_GUIDE.md` | 本地一键部署指南 |
| `docs/ops/LOAD_TEST_RESULTS.md` | Nginx/k6/Go stress 压测结果 |
| `docs/ops/PRODUCTION_READINESS.md` | 腾讯云与生产就绪边界 |
| `docs/ops/DISASTER_RECOVERY.md` | 备份和恢复预案 |

## 2. 图表和生成证据

| 路径 | 内容 |
|---|---|
| `docs/generated/database-er.mmd` | 数据库 ER Mermaid 源 |
| `docs/generated/user-cases.mmd` | User Case Mermaid 源 |
| `docs/generated/system-dag.mmd` | 系统设计 DAG Mermaid 源 |
| `docs/generated/delivery-gantt.mmd` | Gantt Mermaid 源 |
| `docs/generated/sample-journeys.csv` | 从 `db/schema.sql` + `db/seed.sql` 导出的逐条样例数据 |
| `docs/generated/sample-journeys.md` | 样例旅程逐条 Markdown 表 |
| `docs/generated/source-alignment.md` | 生成文档与代码来源对齐说明 |
| `docs/generated/rendered/*.svg` | 已渲染 SVG 图，便于不支持 Mermaid 的环境查看 |

## 3. 数据库、源码和脚本

| 路径 | 内容 |
|---|---|
| `db/schema.sql` | SQLite 初始化 DDL |
| `db/seed.sql` | 高质量样例数据 |
| `cmd/`、`internal/`、`web/` | Go 后端、业务层和 Vanilla SPA 源码 |
| `web/assets/images/`、`web/uploads/` | 本地优先图片和 GitHub-style 默认头像 |
| `scripts/deploy/local-one-click.sh` | 本地一键启动全栈 + SQLite + 演示数据 |
| `scripts/deploy/init-demo-data.sh` | 50 用户 + 3 管理员 + 订单/交易/统计演示数据 |
| `scripts/nginx/render-local-config.sh` | 本地 Nginx 配置生成 |
| `deploy/nginx.conf` | 腾讯云/Nginx 反代参考配置 |

## 4. 测试证据

| 路径 | 内容 |
|---|---|
| `app.xlsx` | 测试用例表，含 Summary、Test Cases、Seed Samples、Verification |
| `docs/generated/app-test-cases.csv` | 代码生成测试矩阵 CSV |
| `internal/**/*_test.go` | Go 单元/集成测试 |
| `e2e/tests/*.js` | Playwright E2E 测试 |
| `tests/load/*.k6.js` | k6 压测脚本 |
| `tests/stress/stress_test.go` | Go 中型独立站压力矩阵 |
| `docs/generated/test-evidence.md` | 测试文件清单 |

## 5. Git 提交历史查看

GitHub 仓库链接请在邮件中提供。推荐同时提供：仓库主页、`/commits/main`、当前交付分支 `/commits/codex/tencent-cloud-deploy`、PR commits 页面。

Gitee 如果没有单独镜像仓库，可以在提交邮件中说明“本次以 GitHub 为权威仓库”，或后续将 GitHub 仓库镜像到 Gitee 后补充链接。
