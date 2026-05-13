# System Design DAG — 100 Journeys

```mermaid
graph TD
    subgraph Client
        B[Browser — Mobile Web]
        AP[AI Pet Float Widget]
    end

    subgraph Frontend["Frontend (web/)"]
        H[index.html + SPA]
        R[Hash Router]
        API_JS[api.js — HTTP Client]
        PAGES[Pages: Home / Explore / Detail]
        COMP[Components: Card / Nav / Filter / Hero]
        ANIM[Animation Engine]
        AI_JS[AI Pet JS — IntersectionObserver]
    end

    subgraph CDN["CDN / Static"]
        IMG[Images / Assets]
        CSS[CSS Layer Stack]
    end

    subgraph Backend["Backend (internal/)"]
        subgraph Handler["Handler Layer (Gin)"]
            GH[/api/journeys]
            GD[/api/journeys/:slug]
            GT[/api/tags]
            GA[/api/ai/chat]
            GR[/api/recommend]
            GB[/api/journeys/:slug/book]
            GHCH[/api/health]
        end

        subgraph Service["Service Layer"]
            SVC_J[JourneyService]
            SVC_AI[AIService]
            SVC_R[RecommendService]
            SVC_M[MediaProvider]
        end

        subgraph Repository["Repository Layer"]
            REPO_J[JourneyRepository<br/>SQLite]
            REPO_U[UserRepository<br/>SQLite]
            REPO_L[LogRepository<br/>SQLite]
        end

        subgraph Cache["Cache Layer"]
            CACHE[sync.Map LRU<br/>TTL 60s]
        end

        subgraph AI_Adapter["AI Adapter Layer"]
            AI_MOCK[MockAI]
            AI_DS[DeepSeekAI]
            AI_KI[KimiAI]
        end
    end

    subgraph Database["Database"]
        DB[(SQLite WAL)]
    end

    subgraph External["External APIs"]
        EXT_DS[DeepSeek API]
        EXT_KI[Kimi / Moonshot API]
    end

    %% Client → Frontend
    B --> H
    AP --> AI_JS

    %% Frontend → Backend
    H --> R
    R --> PAGES
    PAGES --> COMP
    COMP --> ANIM
    PAGES --> API_JS
    AI_JS --> API_JS
    API_JS --> GH
    API_JS --> GD
    API_JS --> GT
    API_JS --> GA
    API_JS --> GR
    API_JS --> GB

    %% CDN
    H --> CSS
    SVC_M --> IMG
    PAGES --> IMG

    %% Handler → Service
    GH --> SVC_J
    GD --> SVC_J
    GT --> SVC_J
    GA --> SVC_AI
    GR --> SVC_R
    GB --> SVC_J
    GHCH --> SVC_J

    %% Service → Cache → Repository
    SVC_J --> CACHE
    CACHE -. miss .-> REPO_J
    CACHE -. hit .-> SVC_J
    SVC_R --> CACHE
    SVC_R --> REPO_J

    %% Service → MediaProvider
    SVC_J --> SVC_M

    %% AI Service → Adapter
    SVC_AI --> AI_MOCK
    SVC_AI -. API_KEY .-> AI_DS
    SVC_AI -. API_KEY .-> AI_KI

    %% AI Adapter → External
    AI_DS --> EXT_DS
    AI_KI --> EXT_KI

    %% Repository → Database
    REPO_J --> DB
    REPO_U --> DB
    REPO_L --> DB

    %% User auth (optional)
    GH --> REPO_U
    GA --> REPO_L
```

---

## DAG 关键路径说明

### 读取路径（热数据，95% 请求）
```
Browser → api.js → Gin Handler → JourneyService → Cache HIT → JSON Response
```
延迟目标：**< 5ms p95**

### 读取路径（冷数据，5% 请求）
```
Browser → api.js → Gin Handler → JourneyService → Cache MISS → Repository → SQLite WAL → Cache Store → JSON Response
```
延迟目标：**< 50ms p95**

### AI Pet 对话路径
```
AI Pet Widget → /api/ai/chat → AIService → AIAdapter(mock/deepseek/kimi) → Response
```
延迟目标：**< 1s p95**（受外部 API 制约）

### 推荐路径
```
User browsing → AI Pet observes → /api/recommend → RecommendService → Cache → Repository → personalized cards
```

---

## 并行开发工作区（Worktree）

| Worktree | 分支 | 负责文件 | 开发重点 |
|---|---|---|---|
| `main/` | `main` | 全部 | 基线整合、CI/CD |
| `.worktrees/frontend-dev/` | `frontend-dev` | `web/` | UI组件、动画、AI Pet |
| `.worktrees/backend-dev/` | `backend-dev` | `internal/` `cmd/` | API、Service、Cache、AI Adapter |
| `.worktrees/sql-dev/` | `sql-dev` | `db/` `internal/repository/` | Schema、Migration、Seed |

### Merge 流程
```
frontend-dev ──┐
backend-dev  ──┼──→ main (PR / fast-forward merge)
sql-dev      ──┘
```
每完成一个 Phase Gate，对应 worktree 合并到 main，打 tag。
