'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'team-standards' | 'project' | 'shared'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSkills() {
      try {
        const response = await fetch('/api/admin/skills');
        const data = await response.json();
        setSkills(data.skills || []);
      } catch (error) {
        console.error('Error fetching skills:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSkills();
  }, []);

  const filteredSkills = filter === 'all'
    ? skills
    : skills.filter(s => s.category === filter);

  const handleDelete = async (id: string) => {
    if (!confirm(`确定要删除这个技能吗？`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/skills/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSkills(skills.filter(s => s.id !== id));
      } else {
        const data = await response.json();
        alert('删除失败：' + data.error);
      }
    } catch (error) {
      console.error('Error deleting skill:', error);
      alert('删除失败');
    }
  };

  const categoryNames: Record<'all' | 'team-standards' | 'project' | 'shared', string> = {
    'all': '全部',
    'team-standards': '团队规范',
    'project': '项目',
    'shared': '共享',
  };

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* 头部 - Header */}
      <header className="glass border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/admin"
                className="text-sm mb-4 inline-block"
                style={{ color: 'var(--color-primary)' }}
              >
                ← 返回管理首页
              </Link>
              <h1 className="text-4xl font-bold text-gradient">管理技能</h1>
              <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                编辑、删除技能
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 内容 - Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 筛选器 */}
        <div className="mb-6 flex flex-wrap gap-2">
          {(Object.keys(categoryNames) as (typeof filter)[]).map((category) => (
            <button
              key={category}
              onClick={() => setFilter(category)}
              className="px-4 py-2 rounded-full text-sm font-medium"
              style={{
                backgroundColor: filter === category
                  ? 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))'
                  : 'var(--bg-muted)',
                color: filter === category
                  ? '#000000'
                  : 'var(--fg)',
                borderRadius: 'var(--radius-full)',
                transition: `all var(--duration-fast) var(--ease-out)`
              }}
            >
              {categoryNames[category]}
            </button>
          ))}
        </div>

        {/* 加载状态 */}
        {loading ? (
          <div className="text-center py-12">
            <p style={{ color: 'var(--fg-muted)' }}>加载中...</p>
          </div>
        ) : (
          <>
            {/* 技能列表 */}
            {filteredSkills.length === 0 ? (
              <div className="text-center py-12">
                <p style={{ color: 'var(--fg-muted)' }}>
                  暂无技能
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="p-6 rounded-lg border"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: skill.visibility === 'public'
                        ? 'var(--border)'
                        : 'hsl(0 84% 40% / 0.5)',
                      transition: `all var(--duration-normal) var(--ease-out)`
                    }}
                  >
                    {/* 技能头部 */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>
                          {skill.name}
                        </h3>
                        <span
                          className="px-2 py-1 text-xs rounded-full"
                          style={{
                            backgroundColor: skill.visibility === 'public'
                              ? 'hsl(142 70% 45% / 0.15)'
                              : 'hsl(38 92% 50% / 0.15)',
                            color: skill.visibility === 'public'
                              ? 'hsl(142 70% 45%)'
                              : 'hsl(38 92% 50%)',
                            borderRadius: 'var(--radius-full)'
                          }}
                        >
                          {skill.visibility === 'public' ? '公开' : '私有'}
                        </span>
                        <span className="text-xs ml-2" style={{ color: 'var(--fg-muted)' }}>
                          v{skill.version}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDelete(skill.id)}
                        className="px-3 py-1 text-xs rounded-full text-red-500 hover:text-red-600"
                        style={{
                          backgroundColor: 'hsl(0 84% 60% / 0.2)',
                          color: '#ffffff',
                          borderRadius: 'var(--radius-full)',
                          transition: `all var(--duration-fast) var(--ease-out)`
                        }}
                      >
                        🗑️
                      </button>
                    </div>

                    {/* 技能信息 */}
                    <div className="text-sm space-y-1" style={{ color: 'var(--fg-muted)' }}>
                      <p>{skill.description}</p>
                      <div className="flex items-center gap-4">
                        <span>📦 作者：{skill.author}</span>
                        <span>📁 文件：{skill.fileCount}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 统计信息 */}
            <div className="mt-8 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
              <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                共 {skills.length} 个技能
              </p>
            </div>
          </>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 flex items-center justify-center z-[999]">
            <div className="p-8 rounded-lg bg-black" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)` }}>
              <p className="text-lg font-semibold mb-2" style={{ color: 'var(--fg)' }}>
                确定删除？
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setDeleteConfirm(null);
                  }}
                  className="px-6 py-3 rounded-full text-sm"
                  style={{
                    backgroundColor: 'var(--bg-muted)',
                    color: 'var(--fg)',
                    borderRadius: 'var(--radius-full)',
                    transition: `all var(--duration-fast) var(--ease-out)`
                  }}
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    await handleDelete(deleteConfirm);
                    setDeleteConfirm(null);
                  }}
                  className="px-6 py-3 rounded-full text-sm"
                  style={{
                    background: 'hsl(0 84% 60% / 0.2)',
                    color: '#ffffff',
                    borderRadius: 'var(--radius-full)',
                    transition: `all var(--duration-fast) var(--ease-out)`
                  }}
                >
                  确定删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
