# AI Novel Writer Framework (FastAPI + Next.js)

这是一个基于 Python 和 Next.js 的多 Agent 小说写作框架，使用了以下技术栈：
- **Backend**: FastAPI, LangGraph, ChromaDB, LangChain
- **Frontend**: Next.js, Tailwind CSS, React

## 🏗️ 多 Agent 架构

- **Planner (架构师)**: 负责分层生成故事结构（总纲 -> 章纲 -> 节纲）
- **Writer (作家)**: 根据架构师的细纲撰写具体小节
- **Reviewer (评论家)**: 审阅草稿，提出改进建议
- **Memory Manager (档案员)**: 使用 ChromaDB 管理长期记忆

## 快速开始

### 1. 后端配置 (Backend)

```bash
cd backend

# 创建虚拟环境
python -m venv venv
.\venv\Scripts\Activate.ps1

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
copy .env.example .env
# 编辑 .env 填入 API Key

# 初始化 (可选)
python init_setup.py

# 启动后端服务
uvicorn main:app --reload
# 服务将运行在 http://localhost:8000
```

### 2. 前端配置 (Frontend)

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

## 🌟 使用指南

1. 打开浏览器访问 `http://localhost:3000`。
2. **项目管理**：
   - 在首页可以看到现有的项目列表。
   - 输入小说名称（例如 "赛博朋克2077"）并点击“创建并开始”来新建一个项目。
3. **写作界面**：
   - 进入项目后，在输入框中输入你的指令（例如：“第一章：夜之城的雨”）。
   - 点击“开始创作”。
   - 系统会自动调用 Planner -> Writer -> Reviewer 进行多轮协作。
4. **知识库**：
   - 点击右上角的“查看知识库”按钮，可以查看该项目积累的所有设定（角色小传、世界观、大纲等）。
   - 这些记忆会持久化保存，并在后续的写作中被自动检索使用。

## 项目结构

- `backend/`: Python 后端
  - `main.py`: FastAPI 入口
  - `graph.py`: LangGraph 逻辑
  - `chroma_utils.py`: 向量数据库工具 (支持多项目)
  - `project_manager.py`: 项目管理逻辑
  - `data/projects/`: 存储项目元数据
- `frontend/`: Next.js 前端
  - `app/page.tsx`: 项目列表页
  - `app/project/[name]/page.tsx`: 写作工作台

## API 接口

- `GET /api/projects`: 获取项目列表
- `POST /api/projects`: 创建新项目
- `POST /api/chat`: 接收 `{topic: string, project_name: string}`，返回 SSE 流式响应。
- `GET /api/projects/{name}/knowledge`: 获取项目知识库内容。

