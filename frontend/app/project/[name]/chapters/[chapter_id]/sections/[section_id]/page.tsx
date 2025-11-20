'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Section {
  id: string;
  title: string;
  outline: string;
  content: string;
}

interface AgentOutput {
  planner: string;
  writer: string;
  reviewer: string;
}

export default function SectionPage() {
  const params = useParams();
  const projectName = decodeURIComponent(params.name as string);
  const chapterId = params.chapter_id as string;
  const sectionId = params.section_id as string;

  const [section, setSection] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingPlanner, setGeneratingPlanner] = useState(false);
  const [generatingWriter, setGeneratingWriter] = useState(false);
  const [generatingReviewer, setGeneratingReviewer] = useState(false);
  const [agentOutput, setAgentOutput] = useState<AgentOutput>({
    planner: '',
    writer: '',
    reviewer: ''
  });
  
  const plannerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HTMLDivElement>(null);
  const reviewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projectName && chapterId && sectionId) {
      fetchSectionData();
    }
  }, [projectName, chapterId, sectionId]);

  useEffect(() => {
    // Auto-scroll to bottom of active agent's output
    if (generatingPlanner && plannerRef.current) {
      plannerRef.current.scrollTop = plannerRef.current.scrollHeight;
    } else if (generatingWriter && writerRef.current) {
      writerRef.current.scrollTop = writerRef.current.scrollHeight;
    } else if (generatingReviewer && reviewerRef.current) {
      reviewerRef.current.scrollTop = reviewerRef.current.scrollHeight;
    }
  }, [agentOutput, generatingPlanner, generatingWriter, generatingReviewer]);

  const fetchSectionData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}/sections/${sectionId}`);
      if (res.ok) {
        const data = await res.json();
        setSection(data);
        setAgentOutput({
          planner: data.outline || '',
          writer: data.content || '',
          reviewer: ''
        });
      }
    } catch (error) {
      console.error("Failed to fetch section data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}/sections/${sectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: section?.title,
          outline: agentOutput.planner,
          content: agentOutput.writer
        })
      });
      
      if (res.ok) {
        alert('保存成功！');
      }
    } catch (error) {
      console.error("Failed to save section", error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePlanner = async () => {
    if (generatingPlanner) return;
    setGeneratingPlanner(true);
    setAgentOutput(prev => ({ ...prev, planner: '' }));

    const prompt = section?.title || '撰写本节内容';

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            agent: 'planner',
            topic: prompt, 
            project_name: projectName,
            granularity: "section",
            current_chapter: chapterId,
            current_section: sectionId
        }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '');
            if (dataStr === '[DONE]') break;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'stream' && data.agent === 'planner') {
                setAgentOutput(prev => ({
                  ...prev,
                  planner: prev.planner + data.content
                }));
              }
            } catch (e) {
              console.error('Error parsing JSON', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alert('架构生成出错: ' + error);
    } finally {
      setGeneratingPlanner(false);
    }
  };

  const handleGenerateWriter = async () => {
    if (generatingWriter) return;
    if (!agentOutput.planner) {
      alert('请先生成架构！');
      return;
    }
    setGeneratingWriter(true);
    setAgentOutput(prev => ({ ...prev, writer: '' }));

    // 构建请求体，如果有评论则包含
    const requestBody: any = { 
      topic: agentOutput.planner, 
      project_name: projectName,
      granularity: "section",
      current_chapter: chapterId,
      current_section: sectionId
    };
    // 如果有评论家的反馈，传递给后端用于改进
    if (agentOutput.reviewer) {
      requestBody.critique = agentOutput.reviewer;
    }

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: 'writer',
          topic: agentOutput.planner,
          project_name: projectName,
          granularity: "section",
          section_outline: agentOutput.planner,
          critique: requestBody.critique || '',
          current_chapter: chapterId,
          current_section: sectionId
        }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '');
            if (dataStr === '[DONE]') break;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'stream' && data.agent === 'writer') {
                setAgentOutput(prev => ({
                  ...prev,
                  writer: prev.writer + data.content
                }));
              }
            } catch (e) {
              console.error('Error parsing JSON', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alert('正文生成出错: ' + error);
    } finally {
      setGeneratingWriter(false);
    }
  };

  const handleGenerateReviewer = async () => {
    if (generatingReviewer) return;
    if (!agentOutput.writer) {
      alert('请先生成正文！');
      return;
    }
    setGeneratingReviewer(true);
    setAgentOutput(prev => ({ ...prev, reviewer: '' }));

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            agent: 'reviewer',
            topic: agentOutput.writer,
            project_name: projectName,
            granularity: "section",
            draft: agentOutput.writer,
            current_chapter: chapterId,
            current_section: sectionId
        }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '');
            if (dataStr === '[DONE]') break;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'stream' && data.agent === 'reviewer') {
                setAgentOutput(prev => ({
                  ...prev,
                  reviewer: prev.reviewer + data.content
                }));
              }
            } catch (e) {
              console.error('Error parsing JSON', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alert('评论生成出错: ' + error);
    } finally {
      setGeneratingReviewer(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除小节 "${section?.title}" 吗？此操作无法撤销。`)) {
      return;
    }

    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}/sections/${sectionId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        alert('小节已删除');
        window.location.href = `/project/${projectName}/chapters/${chapterId}`;
      } else {
        alert('删除失败');
      }
    } catch (error) {
      console.error('Error deleting section:', error);
      alert('删除出错');
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href={`/project/${projectName}/chapters/${chapterId}`} className="text-gray-500 hover:text-indigo-600 transition-colors">
            ← 返回章节
          </Link>
          <h1 className="text-xl font-bold text-gray-800">{section?.title}</h1>
        </div>
        <div className="flex gap-3">
            <button 
            onClick={handleSave}
            disabled={saving || generatingPlanner || generatingWriter || generatingReviewer}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm font-medium"
            >
            {saving ? '保存中...' : '💾 保存内容'}
            </button>
            <button 
            onClick={handleDelete}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors shadow-sm font-medium"
            title="删除小节"
            >
            🗑️
            </button>
        </div>
      </header>

      {/* Three-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Planner (架构师) - 20% */}
        <div className="w-[20%] bg-white border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-100 bg-blue-50 flex items-center justify-between">
            <h2 className="font-bold text-blue-900 flex items-center gap-2 text-sm">
              <span>🏗️</span>
              <span>架构师</span>
            </h2>
            <button
              onClick={handleGeneratePlanner}
              disabled={generatingPlanner}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                generatingPlanner 
                  ? 'bg-blue-300 text-blue-800 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {generatingPlanner ? '生成中...' : '✨ 生成'}
            </button>
          </div>
          <div 
            ref={plannerRef}
            className="flex-1 p-4 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-gray-700"
          >
            {agentOutput.planner || <span className="text-gray-400 italic">点击"生成"按钮创建小节架构...</span>}
          </div>
        </div>

        {/* Middle: Writer (作家) - 55% */}
        <div className="w-[55%] bg-white border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-100 bg-green-50 flex items-center justify-between">
            <h2 className="font-bold text-green-900 flex items-center gap-2 text-sm">
              <span>✍️</span>
              <span>作家</span>
            </h2>
            <button
              onClick={handleGenerateWriter}
              disabled={generatingWriter || !agentOutput.planner}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                generatingWriter 
                  ? 'bg-green-300 text-green-800 cursor-not-allowed' 
                  : !agentOutput.planner
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : agentOutput.reviewer
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
              title={agentOutput.reviewer ? '根据评论家反馈重新写作' : '首次创作正文'}
            >
              {generatingWriter ? '写作中...' : agentOutput.reviewer ? '🔄 重写' : '✨ 写作'}
            </button>
          </div>
          <div 
            ref={writerRef}
            className="flex-1 p-6 overflow-y-auto text-base leading-loose whitespace-pre-wrap text-gray-800 font-serif"
          >
            {agentOutput.writer || <span className="text-gray-400 italic not-italic">架构完成后，点击"写作"按钮生成正文...</span>}
          </div>
        </div>

        {/* Right: Reviewer (评论家) - 25% */}
        <div className="w-[25%] bg-white flex flex-col">
          <div className="p-3 border-b border-gray-100 bg-amber-50 flex items-center justify-between">
            <h2 className="font-bold text-amber-900 flex items-center gap-2 text-sm">
              <span>🎭</span>
              <span>评论家</span>
            </h2>
            <button
              onClick={handleGenerateReviewer}
              disabled={generatingReviewer || !agentOutput.writer}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                generatingReviewer 
                  ? 'bg-amber-300 text-amber-800 cursor-not-allowed' 
                  : !agentOutput.writer
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}
            >
              {generatingReviewer ? '评审中...' : '✨ 评审'}
            </button>
          </div>
          <div 
            ref={reviewerRef}
            className="flex-1 p-4 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-gray-700"
          >
            {agentOutput.reviewer || <span className="text-gray-400 italic">正文完成后，点击"评审"按钮获取反馈...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
