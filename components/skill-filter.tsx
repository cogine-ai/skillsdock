'use client';

import { SkillCategory } from '@/lib/types';

interface SkillFilterProps {
  selectedCategory: SkillCategory | 'all';
  onCategoryChange: (category: SkillCategory | 'all') => void;
}

const categories: (SkillCategory | 'all')[] = ['all', 'team-standards', 'project', 'shared'];

const categoryNames: Record<SkillCategory | 'all', string> = {
  'all': '全部',
  'team-standards': '团队规范',
  'project': '项目',
  'shared': '共享',
};

export function SkillFilter({ selectedCategory, onCategoryChange }: SkillFilterProps) {
  return (
    <div className="flex flex-wrap gap-2 w-full">
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => onCategoryChange(category)}
          className="px-4 py-2 rounded-full text-sm font-medium"
          style={{
            background: selectedCategory === category
              ? 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))'
              : 'var(--bg-muted)',
            color: selectedCategory === category
              ? '#000000'
              : 'var(--fg)',
            borderRadius: 'var(--radius-full)',
            transition: `all var(--duration-fast) var(--ease-out)`
          }}
          onMouseEnter={(e) => {
            if (selectedCategory !== category) {
              e.currentTarget.style.background = 'var(--bg-subtle)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedCategory !== category) {
              e.currentTarget.style.background = 'var(--bg-muted)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          {categoryNames[category]}
        </button>
      ))}
    </div>
  );
}
