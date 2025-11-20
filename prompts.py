from typing import Optional

class PromptManager:
    @staticmethod
    def get_planner_prompt(topic: str, granularity: str = "full", current_chapter: int = 1, current_section: int = 1, context: str = "", chapter_title: str = "") -> str:
        """
        根据颗粒度生成架构师（Planner）的 Prompt。
        
        Args:
            topic: 用户输入的主题或指令
            granularity: 规划粒度 ("novel", "chapter", "section", "full")
            current_chapter: 当前章节号
            current_section: 当前小节号
            context: 上下文信息（如已有大纲、设定等）
            chapter_title: 章节标题（章节模式时使用）
        """
        
        base_role = "你是一位畅销小说家和构思大师（架构师）。"
        
        if granularity == "novel":
            return f"""{base_role}
            任务：请基于主题 "{topic}"，创作一份**长篇小说总体大纲**。
            
            要求包含：
            1. **核心梗概**：用一句话概括整个故事（What's the story about?）。
            2. **世界观设定**：时代背景、社会结构、特殊规则、关键地点。
            3. **主要角色小传**（3-5个核心角色）：
               - 姓名与身份
               - 性格特点（用3个形容词）
               - 核心欲望与动机
               - 角色弧光（起点 → 转折 → 终点）
            4. **宏观剧情结构**：
               - 开端（序幕）：初始状态与触发事件
               - 发展（上升）：主要冲突展开
               - 高潮（决战）：最激烈的对抗
               - 结局（收束）：核心冲突的解决与余韵
            5. **章节概览**（粗略规划）：预计分为多少章（大节），每章的核心主题（一句话），不需要精确到每一章多少节，每节讲什么。
            
            注意：
            - 不要写具体场景描写或对话细节。
            - 不要展开到小节级别的情节。也不要输出小节的标题
            - 保持在宏观框架层面。
            
            请输出结构清晰的 Markdown 格式。
            """
            
        elif granularity == "chapter":
            display_title = chapter_title or topic
            user_input_section = f"\n\n【用户的想法和要求】\n{topic}" if topic else ""
            return f"""{base_role}
            任务：基于以下小说大纲，为章节「{display_title}」设计详细的章节结构。
            
            【小说大纲上下文】
            {context}
            {user_input_section}
            
            要求：
            1. **本章主题**：这一章的核心叙事目标是什么？
            2. **小节拆分**：将本章拆分为 3-5 个具体的小节（Section）。
            3. **每节概要**：简述每一节发生的关键事件。
            4. 如果用户提供了具体想法，请充分考虑并融入到章节设计中。
            5. **重要提醒**：只生成「{display_title}」这一章的大纲，不要生成其他章节的内容。
            
            请输出结构清晰的 Markdown 格式。
            """
            
        elif granularity == "section":
            return f"""{base_role}
            任务：基于以下章节结构，为**第 {current_chapter} 章 第 {current_section} 节**设计详细的写作大纲。
            
            【章节结构上下文】
            {context}
            
            要求：
            1. **场景设置**：时间、地点、环境氛围。
            2. **出场人物**：谁在这里？他们想要什么？
            3. **冲突焦点**：发生了什么冲突？
            4. **感官细节**：视觉、听觉、嗅觉等关键描写点。
            5. **对白焦点**：关键对话的内容方向。
            
            请输出结构清晰的 Markdown 格式，供作家直接参考写作。
            """
            
        else:
            # Default fallback to novel mode
            return PromptManager.get_planner_prompt(topic, "novel", current_chapter, current_section, context)

    @staticmethod
    def get_writer_prompt(section_outline: str, context: str = "", critique: str = "") -> str:
        return f"""
        你是一位技艺精湛的创意作家。
        
        【架构师的指导方案】
        {section_outline}
        
        【辅助信息（记忆库/上下文）】
        {context}
        
        {f'【之前的批评（如有，请修复）】{critique}' if critique else ''}
        
        任务：
        请根据架构师方案中的 **小节大纲**，撰写这一小节的正文草稿。
        
        要求：
        1. 严格遵循本小节的大纲。
        2. 专注于引人入胜的对话和感官细节。
        3. 不要写整个故事，只写这一个小节。
        4. 字数控制在 1000-2000 字之间。
        """

    @staticmethod
    def get_reviewer_prompt(draft: str) -> str:
        return f"""
        你是一位严格的文学编辑。请审阅以下故事草稿。
        
        草稿：
        {draft}
        
        找出3个需要改进的关键领域（情节漏洞、角色声音薄弱、节奏问题）。
        如果故事非常出色且不需要重大修改，请以 "APPROVE" 结束你的回复。
        否则，请提供具体的建设性反馈。
        """
    
    @staticmethod
    def get_extract_titles_prompt(outline: str, extract_type: str = "chapter") -> str:
        """
        提取标题的prompt
        extract_type: "chapter" 从总大纲提取章节标题, "section" 从章节大纲提取小节标题
        """
        if extract_type == "chapter":
            return f"""
            你是一位专业的编辑助手。请从以下小说总大纲中提取出章节标题列表。
            注意章节是一个大部分，其中可能包含多个小部分，不要把小部分的标题提取出来了
            总大纲：
            {outline}
            
            要求：
            1. 只输出章节标题,每行一个
            2. 格式统一为："第X章：标题"，不要输出除此以外的其他东西
            3. 不要有任何其他说明文字或解释
            4. 提取所有章节标题(通常 8-20 章)
            5. 按大纲中的顺序排列
            
            请直接输出标题列表：
            """
        else:  # section
            return f"""
            你是一位专业的编辑助手。请从以下章节大纲中提取出小节标题列表。
            
            章节大纲：
            {outline}
            
            要求：
            1. 只输出小节标题,每行一个
            2. 格式统一为："第X节：标题"，不要输出除此以外的其他东西
            3. 不要有任何其他说明文字或解释
            4. 提取所有小节标题(通常 3-8 节)
            5. 按大纲中的顺序排列
            
            请直接输出标题列表：
            """
