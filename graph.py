import os
from typing import TypedDict, Annotated, List, Dict
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv
from chroma_utils import memory_manager

# Load environment variables
load_dotenv()

from prompts import PromptManager
from novel_store import novel_store

# --- 1. 定义状态 ---
class AgentState(TypedDict):
    topic: str
    project_name: str       # 新增：项目名称，用于隔离记忆
    granularity: str        # 新增：规划粒度 ("novel", "chapter", "section", "full")
    # 进度控制
    current_chapter: int    # 当前章节号
    current_section: int    # 当前小节号
    
    # Level 1: 宏观
    novel_outline: str      # 文章总大纲
    character_bios: str     # 角色小传
    world_building: str     # 世界观
    # Level 2: 章节
    chapter_structure: str  # 本章结构（分节）
    # Level 3: 小节
    section_outline: str    # 当前小节大纲
    
    draft: str
    critique: str
    revision_number: int
    final_content: str

# --- 2. 初始化 LLM ---
# 通过环境变量支持自定义 API 端点和模型
llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL_NAME", "gpt-3.5-turbo"),
    temperature=0.7,
    base_url=os.getenv("OPENAI_BASE_URL"), # 可选：用于自定义端点，如 Ollama 或 vLLM
    api_key=os.getenv("OPENAI_API_KEY"),
    streaming=True
)

# --- 3. 定义 Agent 节点 ---

def planner_node(state: AgentState):
    """
    策划 Agent (架构师)：负责分层生成故事结构。
    1. 文章总大纲
    2. 本章结构
    3. 当前小节大纲
    """
    topic = state["topic"]
    project_name = state["project_name"]
    chapter_num = state.get("current_chapter", 1)
    section_num = state.get("current_section", 1)
    granularity = state.get("granularity", "full")
    
    print(f"--- 架构师: 正在为 '{topic}' (项目: {project_name}) 构思 [粒度: {granularity}] ---")
    
    # 准备上下文
    context = ""
    chapter_title = state.get("chapter_title", "")  # 获取章节标题
    
    if granularity == "chapter":
        # 优先从 state 获取，如果没有则从记忆库检索项目大纲
        context = state.get("novel_outline", "")
        if not context:
            # 从 ChromaDB 检索项目总大纲（使用项目名称而非topic）
            retrieved = memory_manager.search_memory(project_name, f"{project_name} 总大纲 世界观 角色", n_results=3)
            context = "\n\n".join(retrieved) if retrieved else ""
    elif granularity == "section":
        context = state.get("chapter_structure", "")
        if not context:
            # 从 ChromaDB 检索章节大纲
            retrieved = memory_manager.search_memory(project_name, f"{topic} 章节大纲", n_results=2)
            context = "\n\n".join(retrieved) if retrieved else ""
    
    # 1. 生成 Prompt
    prompt = PromptManager.get_planner_prompt(
        topic=topic,
        granularity=granularity,
        current_chapter=chapter_num,
        current_section=section_num,
        context=context,
        chapter_title=chapter_title
    )
    
    response = llm.invoke([HumanMessage(content=prompt)])
    content = response.content
    
    # 2. 存入长期记忆 (RAG)
    try:
        memory_manager.add_memory(project_name, content, metadata={"type": f"plan_{granularity}", "chapter": chapter_num})
    except Exception as e:
        print(f"--- 记忆存储失败: {e} ---")
    
    # 3. 自动保存到文件系统 (NovelStore)
    try:
        if granularity in ["novel", "full"]:
            novel_store.update_project_outline(project_name, content)
            print(f"--- 已自动保存项目大纲 ---")
            
        elif granularity == "chapter":
            # 尝试查找对应的章节并保存大纲
            chapters = novel_store.list_chapters(project_name)
            # 假设 current_chapter 是基于 1 的索引，且 chapters 按 order 排序
            # 找到 order 匹配的章节
            target_chapter = next((c for c in chapters if c.get("order") == chapter_num), None)
            
            if target_chapter:
                novel_store.update_chapter(project_name, target_chapter["id"], outline=content)
                print(f"--- 已自动保存第 {chapter_num} 章大纲 ---")
            else:
                print(f"--- 未找到第 {chapter_num} 章，跳过自动保存 ---")

        elif granularity == "section":
            # 尝试查找对应的章节和小节
            chapters = novel_store.list_chapters(project_name)
            target_chapter = next((c for c in chapters if c.get("order") == chapter_num), None)
            
            if target_chapter:
                sections = novel_store.list_sections(project_name, target_chapter["id"])
                target_section = next((s for s in sections if s.get("order") == section_num), None)
                
                if target_section:
                    novel_store.update_section(project_name, target_chapter["id"], target_section["id"], outline=content)
                    print(f"--- 已自动保存第 {chapter_num} 章 第 {section_num} 节大纲 ---")
    except Exception as e:
        print(f"--- 自动保存失败: {e} ---")

    # 根据粒度更新不同的状态字段
    updates = {"revision_number": 0}
    
    if granularity == "novel":
        updates["novel_outline"] = content
        updates["character_bios"] = content # 简化处理，通常应该分开解析
    elif granularity == "chapter":
        updates["chapter_structure"] = content
    elif granularity == "section":
        updates["section_outline"] = content
    else: # full
        updates["novel_outline"] = content
        updates["chapter_structure"] = "（包含在总策划内容中）"
        updates["section_outline"] = "（包含在总策划内容中）"
        updates["character_bios"] = content

    return updates

def writer_node(state: AgentState):
    """
    作家 Agent：根据分层大纲撰写当前小节。
    """
    full_plan = state.get("novel_outline", "")
    section_outline = state.get("section_outline", "")
    # 如果是 full 模式，section_outline 可能混在 novel_outline 里，这里简化处理，假设 full_plan 包含所有信息
    # 如果是 section 模式，section_outline 是独立的
    
    guide_content = section_outline if state.get("granularity") == "section" else full_plan
    
    project_name = state["project_name"]
    critique = state.get("critique", "")
    revision_number = state.get("revision_number", 0)
    chapter_num = state.get("current_chapter", 1)
    section_num = state.get("current_section", 1)
    
    print(f"--- 作家: 正在撰写第 {chapter_num} 章 第 {section_num} 节 (第 {revision_number} 版) ---")
    
    # 从记忆中检索相关上下文
    context = memory_manager.search_memory(project_name, "character setting style")
    context_str = "\n".join(context) if context else "No context found."

    prompt = PromptManager.get_writer_prompt(
        section_outline=guide_content,
        context=context_str,
        critique=critique
    )
    
    response = llm.invoke([HumanMessage(content=prompt)])
    return {"draft": response.content, "revision_number": revision_number + 1}

def reviewer_node(state: AgentState):
    """
    评论家 Agent：评论草稿。
    """
    draft = state["draft"]
    print("--- 评论家: 正在分析草稿 ---")
    
    prompt = PromptManager.get_reviewer_prompt(draft)
    
    response = llm.invoke([HumanMessage(content=prompt)])
    return {"critique": response.content}


# --- 4. 定义条件逻辑 ---

def should_write(state: AgentState):
    """
    决定 Planner 之后是否需要进入 Writer。
    如果是 novel 或 chapter 模式（只生成大纲），则直接结束。
    """
    granularity = state.get("granularity", "full")
    
    # 只有 section 模式才需要写作
    if granularity == "section":
        return "write"
    
    # novel, chapter 模式只需要规划，不需要写作
    return "end"

def should_continue(state: AgentState):
    """决定是应该修改还是结束。"""
    critique = state["critique"]
    revision_number = state["revision_number"]
    
    # 最多修改2次以防止死循环
    if revision_number > 2:
        return "end"
    
    if "APPROVE" in critique:
        return "end"
    
    return "revise"

# --- 5. 构建图 ---

workflow = StateGraph(AgentState)

workflow.add_node("planner", planner_node)
workflow.add_node("writer", writer_node)
workflow.add_node("reviewer", reviewer_node)

workflow.set_entry_point("planner")

# Planner 之后根据 granularity 决定是否进入 Writer
workflow.add_conditional_edges(
    "planner",
    should_write,
    {
        "write": "writer",
        "end": END
    }
)

# 手动模式：每个agent完成后直接结束，由前端控制下一步
workflow.add_edge("writer", END)
workflow.add_edge("reviewer", END)

app = workflow.compile()

