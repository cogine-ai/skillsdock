'use client';

import { useEffect, useState } from 'react';
import { Skill, SkillCategory } from '@/lib/types';
import { SkillCard } from '@/components/skill-card';
import { SkillFilter } from '@/components/skill-filter';
import { listSkills } from '@/lib/github';
import { filterSkillsByCategory as filterByCategoryHelper, searchSkills } from '@/lib/skills';

export default function Home() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [filteredSkills, setFilteredSkills] = useState<Skill[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSkills() {
      try {
        const fetchedSkills = await listSkills();
        setSkills(fetchedSkills);
        setFilteredSkills(fetchedSkills);
      } catch (error) {
        console.error('获取技能失败:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSkills();
  }, []);

  useEffect(() => {
    let result = skills;

    if (selectedCategory !== 'all') {
      result = filterByCategoryHelper(result, selectedCategory);
    }

    if (searchQuery.trim()) {
      result = searchSkills(result, searchQuery);
    }

    setFilteredSkills(result);
  }, [selectedCategory, searchQuery, skills]);

  const categoryNames: Record<SkillCategory | 'all', string> = {
    'all': '全部技能',
    'team-standards': '团队规范',
    'project': '项目',
    'shared': '共享',
  };

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* 头部 - Header */}
      <header className="glass border-b sticky top-0 z-[200]" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold mb-2 text-gradient">Cogine 技能库</h1>
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            管理和共享团队技能、编码规范和项目指南
          </p>
        </div>
      </header>

      {/* 内容 - Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 搜索和筛选 - Search and Filter */}
        <div className="mb-8 space-y-4">
          {/* 搜索框 - Search Input */}
          <input
            type="text"
            placeholder="搜索技能：名称、描述、作者或项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 rounded-full text-sm placeholder:text-[var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all"
            style={{
              backgroundColor: 'var(--bg-muted)',
              color: 'var(--fg)',
              transition: `all var(--duration-normal) var(--ease-out)`
            }}
          />
          {/* 分类筛选器 - Category Filter */}
          <div className="w-full">
            <SkillFilter
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          </div>
        </div>

        {/* 技能网格 - Skills Grid */}
        {loading ? (
          <div className="text-center py-12">
            <p style={{ color: 'var(--fg-muted)' }}>加载技能中...</p>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="text-center py-12">
            <p style={{ color: 'var(--fg-muted)' }}>
              {skills.length === 0
                ? '未找到技能。请检查仓库配置。'
                : '没有匹配的技能。'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        )}

        {/* 统计 - Stats */}
        {!loading && skills.length > 0 && (
          <div className="mt-8 pt-8 text-sm" style={{ color: 'var(--fg-muted)', borderTop: `1px solid var(--border)` }}>
            显示 {filteredSkills.length} / {skills.length} 个技能
          </div>
        )}
      </div>
    </main>
  );
}
