'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Skill } from '@/lib/types';
import { getSkill } from '@/lib/github';
import { getCategoryDisplayName } from '@/lib/skills';
import { InstallCommand } from '@/components/install-command';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export default function SkillDetail() {
  const params = useParams();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSkill() {
      try {
        const fetchedSkill = await getSkill(params.id as string);
        if (fetchedSkill) {
          setSkill(fetchedSkill);
        } else {
          setError('技能未找到');
        }
      } catch (err) {
        setError('加载技能失败');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchSkill();
  }, [params.id]);

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </main>
    );
  }

  if (error || !skill) {
    return (
      <main className="min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p className="text-destructive">{error || '技能未找到'}</p>
          <Link href="/" className="inline-block mt-4 text-color-primary hover:underline">
            ← 返回技能列表
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* 头部 - Header */}
      <header className="glass border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link
            href="/"
            className="inline-block text-sm hover:underline mb-4"
            style={{ color: 'var(--color-primary)' }}
          >
            ← 返回技能列表
          </Link>
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-4xl font-bold text-gradient">{skill.name}</h1>
            <span
              className={`px-3 py-1 text-sm font-medium rounded-full`}
              style={{
                backgroundColor: skill.visibility === 'public' ? 'hsl(142 70% 45% / 0.15)' : 'hsl(38 92% 50% / 0.15)',
                color: skill.visibility === 'public' ? 'hsl(142 70% 45%)' : 'hsl(38 92% 50%)',
                borderRadius: 'var(--radius-full)'
              }}
            >
              {skill.visibility === 'public' ? '公开' : '私有'}
            </span>
          </div>
          <p className="text-xl" style={{ color: 'var(--fg-muted)' }}>{skill.description}</p>
        </div>
      </header>

      {/* 内容 - Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 元数据 - Metadata */}
        <div className="mb-8 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="mb-1" style={{ color: 'var(--fg-muted)' }}>分类</p>
              <p className="font-medium">{getCategoryDisplayName(skill.category)}</p>
            </div>
            {skill.project && (
              <div>
                <p className="mb-1" style={{ color: 'var(--fg-muted)' }}>项目</p>
                <p className="font-medium">{skill.project}</p>
              </div>
            )}
            <div>
              <p className="mb-1" style={{ color: 'var(--fg-muted)' }}>作者</p>
              <p className="font-medium">{skill.author}</p>
            </div>
            <div>
              <p className="mb-1" style={{ color: 'var(--fg-muted)' }}>版本</p>
              <p className="font-medium">{skill.version}</p>
            </div>
          </div>
          {skill.fileCount > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: `1px solid var(--border)` }}>
              <p className="mb-2" style={{ color: 'var(--fg-muted)' }}>📁 {skill.fileCount} 个文件</p>
            </div>
          )}
        </div>

        {/* 下载和安装按钮 - Download and Install */}
        <div className="mb-8 flex flex-wrap gap-4">
          <a
            href={`/api/skills/${skill.id}/download`}
            className="px-6 py-3 rounded-full text-sm font-medium"
            style={{
              background: 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))',
              color: '#000000',
              borderRadius: 'var(--radius-full)',
              transition: `all var(--duration-fast) var(--ease-out)`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            📦 下载技能包 ({skill.version})
          </a>
          <InstallCommand skill={skill} />
        </div>

        {/* 技能内容 - Skill Content */}
        <div className="mt-8 prose prose-slate dark:prose-invert max-w-none" style={{ color: 'var(--fg)' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {skill.content}
          </ReactMarkdown>
        </div>

        {/* 源码链接 - Source Link */}
        <div className="mt-8 pt-8" style={{ borderTop: `1px solid var(--border)` }}>
          <a
            href={skill.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            在 GitHub 上查看源码 →
          </a>
        </div>
      </div>
    </main>
  );
}
