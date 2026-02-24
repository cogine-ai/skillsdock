import { Skill } from '@/lib/types';
import { getCategoryDisplayName } from '@/lib/skills';
import Link from 'next/link';

interface SkillCardProps {
  skill: Skill;
}

export function SkillCard({ skill }: SkillCardProps) {
  return (
    <Link
      href={`/skills/${skill.id}`}
      className="group block p-6 rounded-xl transition-all"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid var(--border)`,
        borderRadius: '0.75rem',
        transition: `all var(--duration-normal) var(--ease-out)`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
        e.currentTarget.style.transform = 'translateY(-4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <h3
          className="text-xl font-semibold transition-colors"
          style={{
            color: 'var(--fg-card)',
            transition: `color var(--duration-fast) var(--ease-out)`
          }}
        >
          {skill.name}
        </h3>
        <span
          className={`px-3 py-1 text-xs font-medium rounded-full`}
          style={{
            backgroundColor: skill.visibility === 'public' ? 'hsl(142 70% 45% / 0.15)' : 'hsl(38 92% 50% / 0.15)',
            color: skill.visibility === 'public' ? 'hsl(142 70% 45%)' : 'hsl(38 92% 50%)',
            borderRadius: 'var(--radius-full)'
          }}
        >
          {skill.visibility === 'public' ? '公开' : '私有'}
        </span>
      </div>

      <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--fg-muted)' }}>
        {skill.description}
      </p>

      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--fg-muted)' }}>
        <div className="flex items-center gap-3">
          <span className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-muted)', borderRadius: 'var(--radius-full)' }}>
            {getCategoryDisplayName(skill.category)}
          </span>
          {skill.project && (
            <span style={{ color: 'var(--color-primary)' }}>{skill.project}</span>
          )}
          {skill.fileCount > 0 && (
            <span className="px-2 py-1 rounded-full flex items-center gap-1" style={{ backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)' }}>
              📁 {skill.fileCount} 文件
            </span>
          )}
        </div>
        <span>作者：{skill.author}</span>
      </div>
    </Link>
  );
}
