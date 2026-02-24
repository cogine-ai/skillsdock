'use client';

import { useState } from 'react';
import { generateInstallCommand } from '@/lib/skills';
import { Skill } from '@/lib/types';

interface InstallCommandProps {
  skill: Skill;
}

export function InstallCommand({ skill }: InstallCommandProps) {
  const [copied, setCopied] = useState(false);
  const command = generateInstallCommand(skill);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)', borderRadius: '0.5rem' }}>
      <h4 className="text-sm font-medium mb-2">安装此技能：</h4>
      <div className="flex gap-2">
        <code
          className="flex-1 px-4 py-2 text-sm font-mono overflow-x-auto"
          style={{
            backgroundColor: 'var(--bg)',
            border: `1px solid var(--border-input)`,
            borderRadius: '0.5rem',
            color: 'var(--fg)'
          }}
        >
          {command}
        </code>
        <button
          onClick={handleCopy}
          className="px-4 py-2 rounded-full text-sm font-medium"
          style={{
            background: 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))',
            color: 'var(--bg)',
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
          {copied ? '已复制！' : '复制'}
        </button>
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--fg-muted)' }}>
        技能将安装到 <code style={{ backgroundColor: 'var(--bg-muted)', padding: '2px 6px', borderRadius: '4px' }}>.claude/skills/{skill.id}</code>
      </p>
    </div>
  );
}
