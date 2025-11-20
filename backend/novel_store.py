import os
import json
import shutil
import uuid
from typing import List, Dict, Optional
from datetime import datetime

DATA_DIR = "data/projects"

class NovelStore:
    def __init__(self):
        if not os.path.exists(DATA_DIR):
            os.makedirs(DATA_DIR)

    def _get_project_path(self, project_name: str):
        return os.path.join(DATA_DIR, project_name)

    def _ensure_dir(self, path):
        if not os.path.exists(path):
            os.makedirs(path)

    # --- Project Level ---
    def get_project(self, project_name: str):
        path = os.path.join(self._get_project_path(project_name), "project.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

    def update_project_outline(self, project_name: str, outline: str):
        data = self.get_project(project_name)
        if data:
            data["novel_outline"] = outline
            path = os.path.join(self._get_project_path(project_name), "project.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return data
        return None

    def delete_project(self, project_name: str):
        path = self._get_project_path(project_name)
        if os.path.exists(path):
            shutil.rmtree(path)
            return True
        return False

    # --- Chapter Level ---
    def list_chapters(self, project_name: str):
        proj_path = self._get_project_path(project_name)
        chapters_dir = os.path.join(proj_path, "chapters")
        if not os.path.exists(chapters_dir):
            return []
        
        chapters = []
        for chap_id in os.listdir(chapters_dir):
            chap_path = os.path.join(chapters_dir, chap_id, "chapter.json")
            if os.path.exists(chap_path):
                with open(chap_path, "r", encoding="utf-8") as f:
                    chapters.append(json.load(f))
        
        # Sort by order
        chapters.sort(key=lambda x: x.get("order", 0))
        return chapters

    def create_chapter(self, project_name: str, title: str, outline: str = ""):
        proj_path = self._get_project_path(project_name)
        chapters_dir = os.path.join(proj_path, "chapters")
        self._ensure_dir(chapters_dir)
        
        # Determine order
        existing = self.list_chapters(project_name)
        order = len(existing) + 1
        
        chap_id = str(uuid.uuid4())[:8]
        chap_dir = os.path.join(chapters_dir, chap_id)
        self._ensure_dir(chap_dir)
        
        data = {
            "id": chap_id,
            "title": title,
            "outline": outline,
            "order": order,
            "created_at": datetime.now().isoformat()
        }
        
        with open(os.path.join(chap_dir, "chapter.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        return data

    def get_chapter(self, project_name: str, chapter_id: str):
        path = os.path.join(self._get_project_path(project_name), "chapters", chapter_id, "chapter.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

    def update_chapter(self, project_name: str, chapter_id: str, title: str = None, outline: str = None):
        data = self.get_chapter(project_name, chapter_id)
        if data:
            if title is not None: data["title"] = title
            if outline is not None: data["outline"] = outline
            
            path = os.path.join(self._get_project_path(project_name), "chapters", chapter_id, "chapter.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return data
        return None

    def delete_chapter(self, project_name: str, chapter_id: str):
        path = os.path.join(self._get_project_path(project_name), "chapters", chapter_id)
        if os.path.exists(path):
            shutil.rmtree(path)
            # 重新排序剩余章节的 order
            self._reorder_chapters(project_name)
            return True
        return False
    
    def _reorder_chapters(self, project_name: str):
        """重新排序章节的 order 字段"""
        chapters = self.list_chapters(project_name)
        for idx, chapter in enumerate(chapters, start=1):
            if chapter['order'] != idx:
                chapter['order'] = idx
                path = os.path.join(self._get_project_path(project_name), "chapters", chapter['id'], "chapter.json")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(chapter, f, ensure_ascii=False, indent=2)

    # --- Section Level ---
    def list_sections(self, project_name: str, chapter_id: str):
        chap_dir = os.path.join(self._get_project_path(project_name), "chapters", chapter_id)
        sections_dir = os.path.join(chap_dir, "sections")
        if not os.path.exists(sections_dir):
            return []
            
        sections = []
        for sec_id in os.listdir(sections_dir):
            if sec_id.endswith(".json"):
                with open(os.path.join(sections_dir, sec_id), "r", encoding="utf-8") as f:
                    sections.append(json.load(f))
        
        sections.sort(key=lambda x: x.get("order", 0))
        return sections

    def create_section(self, project_name: str, chapter_id: str, title: str, outline: str = ""):
        chap_dir = os.path.join(self._get_project_path(project_name), "chapters", chapter_id)
        sections_dir = os.path.join(chap_dir, "sections")
        self._ensure_dir(sections_dir)
        
        existing = self.list_sections(project_name, chapter_id)
        order = len(existing) + 1
        
        sec_id = str(uuid.uuid4())[:8]
        
        data = {
            "id": sec_id,
            "chapter_id": chapter_id,
            "title": title,
            "outline": outline,
            "content": "",
            "order": order,
            "created_at": datetime.now().isoformat()
        }
        
        with open(os.path.join(sections_dir, f"{sec_id}.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        return data

    def get_section(self, project_name: str, chapter_id: str, section_id: str):
        path = os.path.join(self._get_project_path(project_name), "chapters", chapter_id, "sections", f"{section_id}.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

    def update_section(self, project_name: str, chapter_id: str, section_id: str, title: str = None, outline: str = None, content: str = None):
        data = self.get_section(project_name, chapter_id, section_id)
        if data:
            if title is not None: data["title"] = title
            if outline is not None: data["outline"] = outline
            if content is not None: data["content"] = content
            
            path = os.path.join(self._get_project_path(project_name), "chapters", chapter_id, "sections", f"{section_id}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return data
        return None
    
    def delete_section(self, project_name: str, chapter_id: str, section_id: str):
        """Delete a section"""
        path = os.path.join(self._get_project_path(project_name), "chapters", chapter_id, "sections", f"{section_id}.json")
        if os.path.exists(path):
            os.remove(path)
            # 重新排序剩余小节的 order
            self._reorder_sections(project_name, chapter_id)
            return True
        return False
    
    def _reorder_sections(self, project_name: str, chapter_id: str):
        """重新排序小节的 order 字段"""
        sections = self.list_sections(project_name, chapter_id)
        for idx, section in enumerate(sections, start=1):
            if section['order'] != idx:
                section['order'] = idx
                path = os.path.join(self._get_project_path(project_name), "chapters", chapter_id, "sections", f"{section['id']}.json")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(section, f, ensure_ascii=False, indent=2)

novel_store = NovelStore()
