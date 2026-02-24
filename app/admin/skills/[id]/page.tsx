'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SkillCategory } from '@/lib/types';
import Link from 'next/link';

export default function AdminEditSkillPage() {
  const params = useParams();
  const [skill, setSkill] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchSkill() {
      try {
        const response = await fetch(`/api/admin/skills/${params.id}`);
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await response.json();
        setSkill(data);
      } catch (err) {
        console.error('Error fetching skill:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    fetchSkill();
  }, [params.id]);

  if (loading) {
    return (
      <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <p style={{ color: 'var(--fg-muted)' }}>加载中...</p>
        </div>
      </main>
    );
  }

  if (notFound || !skill) {
    return (
      <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <p style={{ color: 'var(--fg-muted)' }}>技能不存在</p>
          <Link
            href="/admin/skills"
            className="inline-block mt-4 px-6 py-3 rounded-full text-sm font-medium"
            style={{
              background: 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))',
              color: '#000000',
              borderRadius: 'var(--radius-full)'
            }}
          >
            返回技能列表
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
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/admin/skills"
                className="text-sm mb-4 inline-block"
                style={{ color: 'var(--color-primary)' }}
              >
                ← 返回技能列表
              </Link>
              <h1 className="text-4xl font-bold text-gradient">
                编辑技能
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* 内容 - Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                技能名称
              </label>
              <p className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>
                {skill.name}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                描述
              </label>
              <p style={{ color: 'var(--fg)' }}>
                {skill.description}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                分类
              </label>
              <p style={{ color: 'var(--fg)' }}>
                {skill.category === 'team-standards' ? '团队规范' :
                 skill.category === 'project' ? '项目' : '共享'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                可见性
              </label>
              <p style={{ color: 'var(--fg)' }}>
                {skill.visibility === 'public' ? '公开' : '私有'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                  作者
                </label>
                <p style={{ color: 'var(--fg)' }}>{skill.author || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                  版本
                </label>
                <p style={{ color: 'var(--fg)' }}>{skill.version || '-'}</p>
              </div>
            </div>

            <div className="pt-4" style={{ borderTop: `1px solid var(--border)` }}>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                    技能 ID
                  </label>
                  <p style={{ color: 'var(--fg)', fontFamily: 'monospace' }}>{skill.id}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                    文件数
                  </label>
                  <p style={{ color: 'var(--fg)' }}>{skill.fileCount}</p>
                </div>
              </div>
              {skill.sourceUrl && (
                <div className="mt-4">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-muted)' }}>
                    源仓库
                  </label>
                  <a
                    href={skill.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {skill.sourceUrl}
                  </a>
                </div>
              )}
            </div>

            <div className="pt-4">
              <Link
                href="/admin/skills"
                className="block w-full text-center px-6 py-3 rounded-full text-sm font-medium"
                style={{
                  background: 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))',
                  color: '#000000',
                  borderRadius: 'var(--radius-full)'
                }}
              >
                返回技能列表
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
