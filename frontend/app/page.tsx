'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Project {
  name: string;
  description?: string;
  created_at?: string;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      console.error("Failed to fetch projects", e);
    }
  };

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName) return;
    
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc })
      });
      
      if (res.ok) {
        const data = await res.json();
        // Redirect to the new project
        router.push(`/project/${data.name}`);
      } else {
        alert("创建项目失败，可能项目名已存在");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteProject = async (projectName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm(`确定要删除项目 "${projectName}" 吗？此操作不可恢复！`)) {
      return;
    }
    
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        fetchProjects();
      } else {
        alert("删除失败");
      }
    } catch (e) {
      console.error(e);
      alert("删除失败");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-12 text-center text-indigo-700">AI 小说写作助手</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Create New Project */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">✨ 新建项目</h2>
            <form onSubmit={createProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">小说名称 (项目名)</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="例如：赛博朋克2077"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">简介 (可选)</label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="简单描述一下这个故事..."
                  rows={3}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50"
              >
                {isLoading ? '创建中...' : '创建并开始'}
              </button>
            </form>
          </div>

          {/* Existing Projects */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">📂 我的项目</h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {projects.length === 0 ? (
                <p className="text-gray-500 text-center py-8">还没有项目，创建一个吧！</p>
              ) : (
                projects.map((project) => (
                  <Link 
                    key={project.name} 
                    href={`/project/${project.name}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all group relative"
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-lg text-gray-800 group-hover:text-indigo-700">{project.name}</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => deleteProject(project.name, e)}
                          className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="删除项目"
                        >
                          🗑️
                        </button>
                        <span className="text-gray-400 text-sm">→</span>
                      </div>
                    </div>
                    {project.description && (
                      <p className="text-gray-500 text-sm mt-1 line-clamp-1">{project.description}</p>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
