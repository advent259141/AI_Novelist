'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Chapter {
  id: string;
  title: string;
  outline: string;
  order: number;
}

interface Project {
  name: string;
  description: string;
  novel_outline: string;
}

interface KnowledgeItem {
  id: string;
  content: string;
  metadata: {
    type?: string;
    chapter?: number;
  };
}

export default function ProjectDashboard() {
  const params = useParams();
  const projectName = decodeURIComponent(params.name as string);
  
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [generatingChapters, setGeneratingChapters] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);

  useEffect(() => {
    if (projectName) {
      fetchProjectData();
    }
  }, [projectName]);

  const fetchProjectData = async () => {
    setLoading(true);
    try {
      const [projRes, chapRes, knowRes] = await Promise.all([
        fetch(`http://localhost:8000/api/projects/${projectName}`),
        fetch(`http://localhost:8000/api/projects/${projectName}/chapters`),
        fetch(`http://localhost:8000/api/projects/${projectName}/knowledge`)
      ]);
      
      if (projRes.ok) {
        const projData = await projRes.json();
        setProject(projData);
      }
      
      if (chapRes.ok) {
        const chapData = await chapRes.json();
        setChapters(chapData);
      }
      
      if (knowRes.ok) {
        const knowData = await knowRes.json();
        setKnowledge(Array.isArray(knowData) ? knowData : []);
      }
    } catch (error) {
      console.error("Failed to fetch project data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterTitle.trim()) return;
    
    setIsCreating(true);
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newChapterTitle, outline: '' })
      });
      
      if (res.ok) {
        setNewChapterTitle('');
        fetchProjectData(); // Refresh list
      }
    } catch (error) {
      console.error("Failed to create chapter", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateChapters = async () => {
    if (!project?.novel_outline) {
      alert('请先生成项目大纲');
      return;
    }
    
    if (generatingChapters) return;
    setGeneratingChapters(true);

    try {
      // 调用后端提取标题 API
      const response = await fetch('http://localhost:8000/api/extract-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          outline: project.novel_outline,
          extract_type: 'chapter'
        }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data = await response.json();
      const titles = data.titles || [];

      if (titles.length === 0) {
        alert('未能从大纲中提取到章节信息，请手动创建');
        return;
      }

      // 批量创建章节
      for (const title of titles) {
        if (title.trim()) {
          try {
            await fetch(`http://localhost:8000/api/projects/${projectName}/chapters`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: title.trim(), outline: '' })
            });
          } catch (error) {
            console.error(`Failed to create chapter: ${title}`, error);
          }
        }
      }

      // 刷新章节列表
      fetchProjectData();
    } catch (error) {
      console.error('Error:', error);
      alert('生成章节失败: ' + error);
    } finally {
      setGeneratingChapters(false);
    }
  };

  const deleteChapter = async (chapterId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('确定要删除这个章节吗？此操作不可恢复！')) {
      return;
    }
    
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        fetchProjectData();
      } else {
        alert("删除失败");
      }
    } catch (error) {
      console.error("Failed to delete chapter", error);
      alert("删除失败");
    }
  };

  const deleteKnowledgeItem = async (memoryId: string) => {
    if (!confirm('确定要删除这条知识库记录吗？')) {
      return;
    }
    
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/knowledge/${memoryId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        fetchProjectData();
      } else {
        alert("删除失败");
      }
    } catch (error) {
      console.error("Failed to delete knowledge", error);
      alert("删除失败");
    }
  };

  const clearKnowledgeBase = async () => {
    if (!confirm('确定要清空整个知识库吗？此操作不可恢复！')) {
      return;
    }
    
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/knowledge`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        fetchProjectData();
        alert('知识库已清空');
      } else {
        alert("清空失败");
      }
    } catch (error) {
      console.error("Failed to clear knowledge", error);
      alert("清空失败");
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <Link href="/" className="text-sm text-gray-500 hover:text-indigo-600 mb-2 inline-block">← 返回首页</Link>
            <h1 className="text-3xl font-bold text-gray-900">{project?.name}</h1>
            <p className="text-gray-600 mt-2">{project?.description}</p>
          </div>

        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: Chapters List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  章节列表 <span className="text-sm font-normal text-gray-500 ml-2">{chapters.length} 章</span>
                </h2>
                <button
                  onClick={handleGenerateChapters}
                  disabled={generatingChapters || !project?.novel_outline}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    generatingChapters || !project?.novel_outline
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                  title={!project?.novel_outline ? '请先生成项目大纲' : ''}
                >
                  {generatingChapters ? (
                    <>
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>生成中...</span>
                    </>
                  ) : (
                    <>
                      <span>🚀</span>
                      <span>自动生成章节</span>
                    </>
                  )}
                </button>
              </div>
              
              <div className="space-y-3">
                {chapters.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <p>暂无章节，开始创建你的第一章吧！</p>
                  </div>
                ) : (
                  chapters.map((chapter) => (
                    <Link 
                      key={chapter.id} 
                      href={`/project/${projectName}/chapters/${chapter.id}`}
                      className="block group"
                    >
                      <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-lg hover:border-indigo-300 hover:shadow-md transition-all">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full text-sm font-medium group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                            {chapter.order}
                          </span>
                          <span className="font-medium text-gray-700 group-hover:text-indigo-700 transition-colors">
                            {chapter.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => deleteChapter(chapter.id, e)}
                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="删除章节"
                          >
                            🗑️
                          </button>
                          <span className="text-gray-400 group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>

              {/* Create Chapter Form */}
              <form onSubmit={handleCreateChapter} className="mt-6 pt-6 border-t border-gray-100">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newChapterTitle}
                    onChange={(e) => setNewChapterTitle(e.target.value)}
                    placeholder="输入新章节标题..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={isCreating}
                  />
                  <button
                    type="submit"
                    disabled={isCreating || !newChapterTitle.trim()}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {isCreating ? '创建中...' : '添加章节'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Sidebar: Project Outline and Knowledge */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">项目大纲</h2>
                <Link 
                  href={`/project/${projectName}/chat`}
                  className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1"
                >
                  <span>💬</span>
                  <span>进入 AI 助手</span>
                </Link>
              </div>
              <div className="prose prose-sm text-gray-600 max-h-[500px] overflow-y-auto">
                {project?.novel_outline ? (
                  <div className="whitespace-pre-wrap">{project.novel_outline}</div>
                ) : (
                  <p className="text-gray-400 italic">暂无大纲内容，点击上方按钮生成。</p>
                )}
              </div>
            </div>

            {/* Knowledge Base Management */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">
                  知识库 <span className="text-sm font-normal text-gray-500 ml-2">{knowledge.length} 条</span>
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowKnowledge(!showKnowledge)}
                    className="px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                  >
                    {showKnowledge ? '隐藏' : '显示'}
                  </button>
                  {knowledge.length > 0 && (
                    <button
                      onClick={clearKnowledgeBase}
                      className="px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>
              
              {showKnowledge && (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {knowledge.length === 0 ? (
                    <p className="text-gray-400 italic text-sm">知识库为空</p>
                  ) : (
                    knowledge.map((item) => (
                      <div key={item.id} className="group relative border border-gray-100 rounded-lg p-3 hover:border-gray-300 transition-colors">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            <div className="text-xs text-gray-500 mb-1">
                              {item.metadata?.type || 'general'} {item.metadata?.chapter && `- 第${item.metadata.chapter}章`}
                            </div>
                            <div className="text-sm text-gray-700 line-clamp-3">{item.content}</div>
                          </div>
                          <button
                            onClick={() => deleteKnowledgeItem(item.id)}
                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="删除"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

