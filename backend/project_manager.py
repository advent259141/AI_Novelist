import os
import json
import shutil
from datetime import datetime

PROJECTS_DIR = "data/projects"

class ProjectManager:
    def __init__(self):
        if not os.path.exists(PROJECTS_DIR):
            os.makedirs(PROJECTS_DIR)

    def list_projects(self):
        projects = []
        if not os.path.exists(PROJECTS_DIR):
            return []
        for name in os.listdir(PROJECTS_DIR):
            path = os.path.join(PROJECTS_DIR, name)
            if os.path.isdir(path):
                # Try to read metadata
                meta_path = os.path.join(path, "metadata.json")
                if os.path.exists(meta_path):
                    with open(meta_path, "r", encoding="utf-8") as f:
                        try:
                            data = json.load(f)
                            projects.append(data)
                        except:
                            projects.append({"name": name})
                else:
                    projects.append({"name": name})
        return projects

    def create_project(self, name: str, description: str = ""):
        # Sanitize name slightly
        safe_name = "".join([c for c in name if c.isalnum() or c in (' ', '-', '_')]).strip()
        if not safe_name:
            raise ValueError("Invalid project name")
            
        path = os.path.join(PROJECTS_DIR, safe_name)
        if os.path.exists(path):
            raise ValueError("Project already exists")
            
        os.makedirs(path)
        
        metadata = {
            "name": safe_name,
            "description": description,
            "novel_outline": "", # Initialize empty outline
            "created_at": datetime.now().isoformat()
        }
        
        with open(os.path.join(path, "project.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
            
        # Also keep metadata.json for backward compatibility if needed, or just use project.json
        # Let's stick to project.json as the main one now, but maybe keep metadata.json for list_projects
        with open(os.path.join(path, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
            
        return metadata

    def get_project_path(self, name: str):
        return os.path.join(PROJECTS_DIR, name)

project_manager = ProjectManager()
