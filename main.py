from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from graph import app as graph_app
from typing import AsyncGenerator, List, Optional
import json
import asyncio
import os
from dotenv import load_dotenv
from project_manager import project_manager
from novel_store import novel_store
from chroma_utils import memory_manager

load_dotenv()

app = FastAPI(title="AI Novel Writer API")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
class ChatRequest(BaseModel):
    topic: str
    project_name: str
    agent: str = "planner"  # planner, writer, reviewer - 指定调用哪个agent
    granularity: str = "novel"  # novel, chapter, section, full
    chapter_title: str = ""  # 章节标题（章节模式时使用）
    critique: str = ""  # 评论家的反馈（用于改进写作）
    section_outline: str = ""  # 小节大纲（writer使用）
    draft: str = ""  # 草稿（reviewer使用）
    current_chapter: str = ""  # 当前章节ID
    current_section: str = ""  # 当前小节ID

class ProjectCreate(BaseModel):
    name: str
    description: str = ""

class ChapterCreate(BaseModel):
    title: str
    outline: str = ""

class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    outline: Optional[str] = None

class SectionCreate(BaseModel):
    title: str
    outline: str = ""

class SectionUpdate(BaseModel):
    title: Optional[str] = None
    outline: Optional[str] = None
    content: Optional[str] = None

class OutlineUpdate(BaseModel):
    outline: str

# --- Project Endpoints ---

@app.get("/api/projects")
async def list_projects():
    return project_manager.list_projects()

@app.post("/api/projects")
async def create_project(project: ProjectCreate):
    try:
        return project_manager.create_project(project.name, project.description)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- Chapter Endpoints (must come before project detail endpoints to avoid path conflicts) ---

@app.get("/api/projects/{project_name}/chapters")
async def list_chapters(project_name: str):
    return novel_store.list_chapters(project_name)

@app.post("/api/projects/{project_name}/chapters")
async def create_chapter(project_name: str, chapter: ChapterCreate):
    return novel_store.create_chapter(project_name, chapter.title, chapter.outline)

@app.get("/api/projects/{project_name}/chapters/{chapter_id}")
async def get_chapter(project_name: str, chapter_id: str):
    data = novel_store.get_chapter(project_name, chapter_id)
    if not data:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return data

@app.put("/api/projects/{project_name}/chapters/{chapter_id}")
async def update_chapter(project_name: str, chapter_id: str, body: ChapterUpdate):
    return novel_store.update_chapter(project_name, chapter_id, body.title, body.outline)

@app.delete("/api/projects/{project_name}/chapters/{chapter_id}")
async def delete_chapter(project_name: str, chapter_id: str):
    success = novel_store.delete_chapter(project_name, chapter_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return {"message": "Chapter deleted successfully"}

# --- Project Detail Endpoints (must come after chapter endpoints) ---

@app.get("/api/projects/{project_name}")
async def get_project(project_name: str):
    data = novel_store.get_project(project_name)
    if not data:
        raise HTTPException(status_code=404, detail="Project not found")
    return data

@app.put("/api/projects/{project_name}/outline")
async def update_project_outline(project_name: str, body: OutlineUpdate):
    return novel_store.update_project_outline(project_name, body.outline)

@app.delete("/api/projects/{project_name}")
async def delete_project(project_name: str):
    success = novel_store.delete_project(project_name)
    # Also delete the knowledge base
    memory_manager.delete_collection(project_name)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project and knowledge base deleted successfully"}

# --- Section Endpoints ---

@app.get("/api/projects/{project_name}/chapters/{chapter_id}/sections")
async def list_sections(project_name: str, chapter_id: str):
    return novel_store.list_sections(project_name, chapter_id)

@app.post("/api/projects/{project_name}/chapters/{chapter_id}/sections")
async def create_section(project_name: str, chapter_id: str, section: SectionCreate):
    return novel_store.create_section(project_name, chapter_id, section.title, section.outline)

@app.get("/api/projects/{project_name}/chapters/{chapter_id}/sections/{section_id}")
async def get_section(project_name: str, chapter_id: str, section_id: str):
    data = novel_store.get_section(project_name, chapter_id, section_id)
    if not data:
        raise HTTPException(status_code=404, detail="Section not found")
    return data

@app.put("/api/projects/{project_name}/chapters/{chapter_id}/sections/{section_id}")
async def update_section(project_name: str, chapter_id: str, section_id: str, body: SectionUpdate):
    return novel_store.update_section(project_name, chapter_id, section_id, body.title, body.outline, body.content)

@app.delete("/api/projects/{project_name}/chapters/{chapter_id}/sections/{section_id}")
async def delete_section(project_name: str, chapter_id: str, section_id: str):
    success = novel_store.delete_section(project_name, chapter_id, section_id)
    if not success:
        raise HTTPException(status_code=404, detail="Section not found")
    return {"message": "Section deleted successfully"}

# --- Knowledge & Chat ---

@app.get("/api/projects/{project_name}/knowledge")
async def get_project_knowledge(project_name: str):
    try:
        memories = memory_manager.get_all_memories(project_name)
        # 格式化返回数据
        result = []
        if memories and 'ids' in memories:
            for i, doc_id in enumerate(memories['ids']):
                result.append({
                    'id': doc_id,
                    'content': memories['documents'][i] if i < len(memories['documents']) else '',
                    'metadata': memories['metadatas'][i] if i < len(memories['metadatas']) else {}
                })
        return result
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/projects/{project_name}/knowledge/{memory_id}")
async def delete_knowledge_item(project_name: str, memory_id: str):
    """删除知识库中的特定记忆"""
    success = memory_manager.delete_memory(project_name, memory_id)
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"message": "Memory deleted successfully"}

@app.delete("/api/projects/{project_name}/knowledge")
async def clear_knowledge_base(project_name: str):
    """清空项目的整个知识库"""
    memory_manager.clear_memory(project_name)
    return {"message": "Knowledge base cleared successfully"}

# Title Extraction
class ExtractTitlesRequest(BaseModel):
    outline: str
    extract_type: str = "chapter"  # "chapter" or "section"

@app.post("/api/extract-titles")
async def extract_titles(request: ExtractTitlesRequest):
    """从大纲中提取标题列表"""
    from prompts import PromptManager
    from langchain_core.messages import HumanMessage
    from langchain_openai import ChatOpenAI
    
    # 初始化 LLM
    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL_NAME", "gpt-3.5-turbo"),
        temperature=0.3,
        base_url=os.getenv("OPENAI_BASE_URL"),
        api_key=os.getenv("OPENAI_API_KEY")
    )
    
    prompt = PromptManager.get_extract_titles_prompt(request.outline, request.extract_type)
    
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content
        
        # 解析标题
        lines = content.split('\n')
        titles = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            # 移除编号前缀
            if request.extract_type == "chapter":
                title = line.replace('第', '').replace('章', '').replace('：', ':').replace('、', '')
                # 如果以数字开头,移除数字和分隔符
                import re
                title = re.sub(r'^\d+[\:：\.\s]+', '', title).strip()
            else:  # section
                title = line.replace('第', '').replace('节', '').replace('：', ':').replace('、', '')
                import re
                title = re.sub(r'^\d+[\:：\.\s]+', '', title).strip()
            
            if title:
                titles.append(title)
        
        return {"titles": titles, "count": len(titles)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def event_generator(
    agent: str,
    topic: str, 
    project_name: str, 
    granularity: str = "full", 
    critique: str = "", 
    chapter_title: str = "",
    section_outline: str = "",
    draft: str = "",
    current_chapter: str = "",
    current_section: str = ""
    ) -> AsyncGenerator[str, None]:
    from langchain_core.messages import HumanMessage
    from langchain_openai import ChatOpenAI
    from prompts import PromptManager
    from chroma_utils import MemoryManager
    # 初始化 LLM
    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL_NAME", "gpt-3.5-turbo"),
        temperature=0.7,
        base_url=os.getenv("OPENAI_BASE_URL"),
        api_key=os.getenv("OPENAI_API_KEY"),
        streaming=True
    )
    
    memory_manager = MemoryManager()
    
    try:
        yield f"data: {json.dumps({'agent': 'system', 'data': {'message': f'开始{agent}工作...'}})}\n\n"
        
        # 根据agent类型生成不同的prompt
        if agent == "planner":
            # 准备上下文
            context = ""
            if granularity == "chapter":
                retrieved = memory_manager.search_memory(project_name, f"{project_name} 总大纲 世界观 角色", n_results=3)
                context = "\n\n".join(retrieved) if retrieved else ""
            elif granularity == "section":
                retrieved = memory_manager.search_memory(project_name, f"{topic} 章节大纲", n_results=2)
                context = "\n\n".join(retrieved) if retrieved else ""

            # 获取章节/小节 order（序号）
            chapter_order = 1
            section_order = 1
            if current_chapter:
                from novel_store import novel_store
                chapter_data = novel_store.get_chapter(project_name, current_chapter)
                if chapter_data and "order" in chapter_data:
                    chapter_order = chapter_data["order"]
            if current_chapter and current_section:
                from novel_store import novel_store
                section_data = novel_store.get_section(project_name, current_chapter, current_section)
                if section_data and "order" in section_data:
                    section_order = section_data["order"]

            prompt = PromptManager.get_planner_prompt(
                topic=topic,
                granularity=granularity,
                current_chapter=chapter_order,
                current_section=section_order,
                context=context,
                chapter_title=chapter_title
            )
            
        elif agent == "writer":
            # 从记忆中检索相关上下文
            context_results = memory_manager.search_memory(project_name, "character setting style", n_results=3)
            context_str = "\n".join(context_results) if context_results else ""
            
            prompt = PromptManager.get_writer_prompt(
                section_outline=section_outline or topic,
                context=context_str,
                critique=critique
            )
            
        elif agent == "reviewer":
            prompt = PromptManager.get_reviewer_prompt(draft or topic)
            
        else:
            raise ValueError(f"Unknown agent: {agent}")
        
        # 流式调用LLM
        full_content = ""
        async for chunk in llm.astream([HumanMessage(content=prompt)]):
            content = chunk.content
            if content:
                full_content += content
                yield f"data: {json.dumps({'agent': agent, 'type': 'stream', 'content': content})}\n\n"
        
        # 存储到记忆库（仅planner）
        if agent == "planner" and full_content:
            try:
                memory_manager.add_memory(project_name, full_content, metadata={"type": f"plan_{granularity}", "chapter": current_chapter or 1, "section": current_section or ""})
            except Exception as e:
                print(f"记忆存储失败: {e}")
        
        # 发送完成信号
        result_data = {}
        if agent == "planner":
            if granularity == "novel":
                result_data = {"novel_outline": full_content}
            elif granularity == "chapter":
                result_data = {"chapter_structure": full_content}
            elif granularity == "section":
                result_data = {"section_outline": full_content}
        elif agent == "writer":
            result_data = {"draft": full_content}
        elif agent == "reviewer":
            result_data = {"critique": full_content}
        
        yield f"data: {json.dumps({'agent': agent, 'type': 'end', 'data': result_data})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    yield "data: [DONE]\n\n"

@app.post("/api/chat")
async def chat(request: ChatRequest):
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        event_generator(
            agent=request.agent,
            topic=request.topic, 
            project_name=request.project_name, 
            granularity=request.granularity, 
            critique=request.critique, 
            chapter_title=request.chapter_title,
            section_outline=request.section_outline,
            draft=request.draft,
            current_chapter=request.current_chapter,
            current_section=request.current_section
        ), 
        media_type="text/event-stream"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

