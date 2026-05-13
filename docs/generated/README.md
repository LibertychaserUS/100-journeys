# 生成文档产物 / Generated Documentation Artifacts

这些文件由 `scripts/docs/generate_project_artifacts.py` 从当前代码库生成。

- `database-er.mmd` - SQLite ER 图源。
- `system-dag.mmd` - 运行时系统 DAG 图源。
- `user-cases.mmd` - 角色/用例图源。
- `delivery-gantt.mmd` - 交付 Gantt 图源。
- `api-routes.md` - 生成 API 路由矩阵。
- `frontend-routes.md` - 生成 SPA 路由矩阵。
- `test-evidence.md` - 生成测试文件证据矩阵。
- `app-test-cases.csv` - `app.xlsx` 的源数据。
- `sample-journeys.csv` - 从 SQLite 初始化脚本导出的逐条样例旅程 CSV。
- `sample-journeys.md` - 从 SQLite 初始化脚本导出的逐条样例旅程表格。
- `source-alignment.md` - 代码来源到文档产物的可追踪关系。
- `rendered/*.svg` - Mermaid 图的 SVG 渲染版本，便于不支持 Mermaid 的环境查看。
