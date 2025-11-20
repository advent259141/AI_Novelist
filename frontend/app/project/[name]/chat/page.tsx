'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

interface AgentData {
  novel_outline?: string;
  draft?: string;
  critique?: string;
  revision_number?: number;
  message?: string;
  [key: string]: any;
}

interface Message {
  agent: string;
  data: AgentData;
  isFinal?: boolean; // Track if the message is complete
}

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectName = decodeURIComponent(params.name as string);
  
  const mode = searchParams.get('mode'); // 'chapter' or null
  const chapterId = searchParams.get('chapterId');

  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [chapterInfo, setChapterInfo] = useState<{title: string; outline: string} | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (mode === 'chapter' && chapterId) {
      fetchChapterInfo();
    }
  }, [mode, chapterId]);

  const fetchChapterInfo = async () => {
    if (!chapterId) return;
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}`);
      if (res.ok) {
        const data = await res.json();
        setChapterInfo({ title: data.title, outline: data.outline || '' });
      }
    } catch (e) {
      console.error('Failed to fetch chapter info', e);
    }
  };

  const fetchKnowledge = async () => {
    if (!projectName) return;
    try {
      const res = await fetch(`http://localhost:8000/api/projects/${projectName}/knowledge`);
      const data = await res.json();
      if (data.documents) {
        const formatted = data.documents.map((doc: string, i: number) => ({
          id: data.ids[i],
          content: doc,
          metadata: data.metadatas[i]
        }));
        setKnowledge(formatted);
      }
    } catch (e) {
      console.error("Failed to fetch knowledge", e);
    }
  };

  const startGeneration = async () => {
    if (!topic && mode !== 'chapter') return;
    
    // Add user message immediately
    const displayTopic = mode === 'chapter' 
      ? `生成章节大纲: ${chapterInfo?.title || ''} ${topic ? `\n\n我的想法: ${topic}` : ''}` 
      : topic;
    const userMsg: Message = { agent: 'user', data: { message: displayTopic }, isFinal: true };
    setMessages(prev => [...prev, userMsg]);
    
    const currentTopic = mode === 'chapter' 
      ? (topic || chapterInfo?.title || '')
      : topic;
    setTopic('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          topic: currentTopic, 
          project_name: projectName,
          granularity: mode === 'chapter' ? 'chapter' : 'novel',
          chapter_title: mode === 'chapter' ? (chapterInfo?.title || '') : ''
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
              
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                
                // 1. Handle Streaming Content
                if (data.type === 'stream') {
                    // Check if we can append to the last message
                    if (lastMsg && lastMsg.agent === data.agent && !lastMsg.isFinal) {
                        const newData = { ...lastMsg.data };
                        
                        // Append content to the correct field based on agent
                        if (data.agent === 'planner') {
                            newData.novel_outline = (newData.novel_outline || '') + data.content;
                        } else if (data.agent === 'writer') {
                            newData.draft = (newData.draft || '') + data.content;
                        } else if (data.agent === 'reviewer') {
                            newData.critique = (newData.critique || '') + data.content;
                        }
                        
                        return [...prev.slice(0, -1), { ...lastMsg, data: newData }];
                    } else {
                        // Start a new message for this stream
                        const initialData: AgentData = {};
                        if (data.agent === 'planner') initialData.novel_outline = data.content;
                        else if (data.agent === 'writer') initialData.draft = data.content;
                        else if (data.agent === 'reviewer') initialData.critique = data.content;
                        
                        return [...prev, { agent: data.agent, data: initialData, isFinal: false }];
                    }
                }
                
                // 2. Handle Final Node Output (End of Step)
                else if (data.type === 'end') {
                    // Update the last message with the final structured data
                    if (lastMsg && lastMsg.agent === data.agent && !lastMsg.isFinal) {
                        return [...prev.slice(0, -1), { agent: data.agent, data: data.data, isFinal: true }];
                    } else {
                        // Should rarely happen if stream came first, but handle it
                        return [...prev, { agent: data.agent, data: data.data, isFinal: true }];
                    }
                }
                
                // 3. Handle Legacy/System Messages
                else {
                    // Handle error messages specifically
                    if (data.error) {
                        return [...prev, { agent: 'system', data: { message: `Error: ${data.error}` }, isFinal: true }];
                    }
                    // Handle generic system messages
                    if (data.agent === 'system' || !data.agent) {
                         return [...prev, { agent: 'system', data: data.data || { message: JSON.stringify(data) }, isFinal: true }];
                    }
                    return [...prev, { ...data, isFinal: true }];
                }
              });

            } catch (e) {
              console.error('Error parsing JSON', e);
            }
          }
        }
      }
      
      // If in chapter mode, save the generated outline (delay to ensure messages are updated)
      if (mode === 'chapter' && chapterId) {
        setTimeout(async () => {
          setMessages(currentMessages => {
            const plannerMsg = currentMessages.find(m => m.agent === 'planner');
            const generatedOutline = plannerMsg?.data?.novel_outline;
            
            if (generatedOutline && chapterInfo?.title) {
              fetch(`http://localhost:8000/api/projects/${projectName}/chapters/${chapterId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  title: chapterInfo.title,
                  outline: generatedOutline
                })
              }).then(() => {
                console.log('Chapter outline saved successfully');
              }).catch(e => {
                console.error('Failed to save chapter outline', e);
              });
            }
            return currentMessages;
          });
        }, 500);
      }
      
      fetchKnowledge();
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { agent: 'system', data: { message: 'Error: ' + error }, isFinal: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      startGeneration();
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans text-gray-900">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-4">
                <Link href={`/project/${projectName}`} className="text-gray-500 hover:text-indigo-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-gray-800">
                      {projectName} - AI 助手
                      {mode === 'chapter' && <span className="ml-2 text-sm text-purple-600">📖 章节模式</span>}
                    </h1>
                    <p className="text-xs text-gray-500">
                      {mode === 'chapter' && chapterInfo 
                        ? `正在为《${chapterInfo.title}》生成章节大纲` 
                        : 'AI 协作小说创作'}
                    </p>
                </div>
            </div>
            <button 
                onClick={() => { setShowKnowledge(!showKnowledge); if (!showKnowledge) fetchKnowledge(); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    showKnowledge 
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
            >
                {showKnowledge ? '隐藏知识库' : '查看知识库'}
            </button>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
            {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                    <div className="text-6xl">✍️</div>
                    <p className="text-lg">开始你的创作之旅...</p>
                    <p className="text-sm">试着输入 "第一章：开端" 或 "创建一个冷酷的杀手角色"</p>
                </div>
            )}
            
            {messages.map((msg, index) => {
                const isUser = msg.agent === 'user';
                const isSystem = msg.agent === 'system';
                
                return (
                    <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] lg:max-w-[75%] rounded-2xl p-5 shadow-sm ${
                            isUser ? 'bg-indigo-600 text-white rounded-br-none' : 
                            isSystem ? 'bg-gray-200 text-gray-600 text-sm py-2 px-4 rounded-lg mx-auto' :
                            'bg-white border border-gray-100 rounded-bl-none'
                        }`}>
                            {!isUser && !isSystem && (
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                                    <span className="text-xl">
                                        {msg.agent === 'planner' ? '📋' :
                                         msg.agent === 'writer' ? '✍️' :
                                         msg.agent === 'reviewer' ? '🧐' : '🤖'}
                                    </span>
                                    <span className={`text-xs font-bold uppercase tracking-wider ${
                                        msg.agent === 'planner' ? 'text-blue-600' :
                                        msg.agent === 'writer' ? 'text-green-600' :
                                        msg.agent === 'reviewer' ? 'text-yellow-600' : 'text-gray-500'
                                    }`}>
                                        {msg.agent === 'planner' ? '架构师' :
                                         msg.agent === 'writer' ? '作家' :
                                         msg.agent === 'reviewer' ? '评论家' : 'System'}
                                    </span>
                                </div>
                            )}

                            <div className={`prose max-w-none leading-relaxed whitespace-pre-wrap ${isUser ? 'text-white' : 'text-gray-800'}`}>
                                {msg.agent === 'user' && msg.data.message}
                                
                                {msg.agent === 'planner' && (
                                    <div>
                                        {msg.data.novel_outline && (
                                            <div className="space-y-2">
                                                <div className="font-bold text-blue-800 text-sm bg-blue-50 p-2 rounded">策划方案</div>
                                                <div>{msg.data.novel_outline}</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {msg.agent === 'writer' && (
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded">
                                                第 {msg.data.revision_number} 版草稿
                                            </span>
                                        </div>
                                        <div className="font-serif text-lg leading-loose pl-4 border-l-4 border-green-200">
                                            {msg.data.draft}
                                        </div>
                                    </div>
                                )}
                                
                                {msg.agent === 'reviewer' && (
                                    <div>
                                        <div className="text-xs font-bold text-yellow-700 bg-yellow-50 px-2 py-1 rounded mb-2 inline-block">
                                            审阅意见
                                        </div>
                                        <div className="italic text-gray-600 bg-gray-50 p-3 rounded">
                                            {msg.data.critique}
                                        </div>
                                    </div>
                                )}

                                {msg.agent === 'system' && msg.data.message}
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-4 lg:p-6">
            <div className="max-w-4xl mx-auto relative">
                <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={mode === 'chapter' 
                      ? `描述你对《${chapterInfo?.title || '本章'}》的想法和要求... (可选,直接发送将使用章节标题生成)\n(Enter 发送, Shift+Enter 换行)` 
                      : "输入指令... (Enter 发送, Shift+Enter 换行)"}
                    className="w-full p-4 pr-32 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none shadow-sm transition-all"
                    rows={3}
                    disabled={isLoading}
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <span className="text-xs text-gray-400 hidden sm:inline">Enter 发送</span>
                    <button
                        onClick={startGeneration}
                        disabled={isLoading || (mode !== 'chapter' && !topic.trim())}
                        className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* Knowledge Base Sidebar */}
      {showKnowledge && (
        <div className="w-80 bg-white border-l border-gray-200 shadow-xl overflow-y-auto transition-all duration-300 ease-in-out z-20">
            <div className="p-6">
                <h2 className="text-lg font-bold mb-6 text-gray-800 flex items-center gap-2">
                    <span>📚</span> 项目知识库
                </h2>
                <div className="space-y-4">
                    {knowledge.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                            <p className="text-sm">暂无知识库内容</p>
                            <p className="text-xs mt-1">生成内容后会自动归档</p>
                        </div>
                    ) : (
                        knowledge.map((item, idx) => (
                            <div key={idx} className="group relative bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow hover:border-indigo-300">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                        {item.metadata?.type || 'General'}
                                    </span>
                                    {item.metadata?.chapter && (
                                        <span className="text-[10px] text-gray-400">Ch.{item.metadata.chapter}</span>
                                    )}
                                </div>
                                <div className="text-sm text-gray-700 line-clamp-4 group-hover:line-clamp-none transition-all duration-300 text-justify">
                                    {item.content}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
