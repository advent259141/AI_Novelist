'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Section {
  id: string;
  title: string;
  outline: string;
  order: number;
}

interface Chapter {
  id: string;
  title: string;
  outline: string;
}

interface Project {
  name: string;
  description: string;
  novel_outline: string;
}

export default function ChapterPage() {
  const params = useParams();
  const projectName = decodeURIComponent(params.name as string);
  const chapterId = params.chapter_id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [generatingSections, setGeneratingSections] = useState(false);

  useEffect(() => {
    if (projectName && chapterId) {
      fetchChapterData();
    }
  }, [projectName, chapterId]);

  const fetchChapterData = async () => {
    setLoading(true);
    try {
      const [projRes, chapRes, secRes] = await Promise.all([
        fetch(`http://localhost:8000/api/projects/${projectName}`),
        fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}`),
        fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}/sections`)
      ]);
      
      if (projRes.ok) {
        const projData = await projRes.json();
        setProject(projData);
      }
      
      if (chapRes.ok) {
        const chapData = await chapRes.json();
        setChapter(chapData);
      }
      
      if (secRes.ok) {
        const secData = await secRes.json();
        setSections(secData);
      }
    } catch (error) {
      console.error("Failed to fetch chapter data", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteSection = async (sectionId: string, sectionTitle: string) => {
    if (!confirm(`确定要删除小节 "${sectionTitle}" 吗？此操作无法撤销。`)) {
      return;
    }

    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}/sections/${sectionId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        fetchChapterData();
      } else {
        alert('删除失败');
      }
    } catch (error) {
      console.error('Error deleting section:', error);
      alert('删除出错');
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionTitle.trim()) return;
    
    setIsCreating(true);
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSectionTitle, outline: '' })
      });
      
      if (res.ok) {
        setNewSectionTitle('');
        fetchChapterData(); // Refresh list
      }
    } catch (error) {
      console.error("Failed to create section", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateSections = async () => {
    if (!chapter?.outline) {
      alert('请先生成章节大纲');
      return;
    }
    
    if (generatingSections) return;
    setGeneratingSections(true);

    try {
      // 调用后端提取标题 API
      const response = await fetch('http://localhost:8000/api/extract-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          outline: chapter.outline,
          extract_type: 'section'
        }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data = await response.json();
      const titles = data.titles || [];

      if (titles.length === 0) {
        alert('未能从大纲中提取到小节信息，请手动创建');
        return;
      }

      // 批量创建小节
      for (const title of titles) {
        if (title.trim()) {
          try {
            await fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}/sections`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: title.trim(), outline: '' })
            });
          } catch (error) {
            console.error(`Failed to create section: ${title}`, error);
          }
        }
      }

      fetchChapterData();
    } catch (error) {
      console.error('Error:', error);
      alert('生成小节失败: ' + error);
    } finally {
      setGeneratingSections(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href={`/project/${projectName}`} className="text-sm text-gray-500 hover:text-indigo-600 mb-2 inline-block">← 返回项目概览</Link>
          <h1 className="text-3xl font-bold text-gray-900">{chapter?.title}</h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 主要内容区：小节列表 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">
              小节列表 <span className="text-sm font-normal text-gray-500 ml-2">{sections.length} 节</span>
            </h2>
            <button
              onClick={handleGenerateSections}
              disabled={generatingSections || !chapter?.outline}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                generatingSections || !chapter?.outline
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
              title={!chapter?.outline ? '请先生成章节大纲' : ''}
            >
              {generatingSections ? (
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
                  <span>自动生成小节</span>
                </>
              )}
            </button>
          </div>
          
          <div className="space-y-3">
            {sections.length === 0 ? (
              <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <p>暂无小节，开始创建你的第一节吧！</p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.id} className="group relative">
                  <Link 
                    href={`/project/${projectName}/chapters/${chapterId}/sections/${section.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-lg hover:border-indigo-300 hover:shadow-md transition-all">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full text-sm font-medium group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                          {section.order}
                        </span>
                        <span className="font-medium text-gray-700 group-hover:text-indigo-700 transition-colors">
                          {section.title}
                        </span>
                      </div>
                      <span className="text-gray-400 group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      deleteSection(section.id, section.title);
                    }}
                    className="absolute top-2 right-2 p-2 text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除小节"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Create Section Form */}
          <form onSubmit={handleCreateSection} className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                placeholder="输入新小节标题..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isCreating}
              />
              <button
                type="submit"
                disabled={isCreating || !newSectionTitle.trim()}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {isCreating ? '创建中...' : '添加小节'}
              </button>
            </div>
          </form>
            </div>
          </div>

          {/* 侧边栏：章节大纲 */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">章节大纲</h2>
                <Link
                  href={`/project/${projectName}/chat?mode=chapter&chapterId=${chapterId}`}
                  className="px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <span>✨</span>
                  <span>AI 生成</span>
                </Link>
              </div>
              <div className="prose prose-sm text-gray-600 max-h-[600px] overflow-y-auto">
                {chapter?.outline ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{chapter.outline}</div>
                ) : (
                  <p className="text-gray-400 italic text-sm">暂无章节大纲，点击上方按钮生成。</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
