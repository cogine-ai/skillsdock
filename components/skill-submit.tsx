'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SubmitResult {
  success: boolean;
  skill?: {
    name: string;
    description: string;
    category: string;
    visibility: string;
    author?: string;
    version?: string;
    files: any[];
  };
  error?: string;
}

export function SkillSubmit() {
  const [repoUrl, setRepoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!repoUrl.trim()) {
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch('/api/skills/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      });

      const data = await response.json();
      setResult(data);

      // 成功后清空表单
      if (data.success) {
        setRepoUrl('');
      }
    } catch (error) {
      setResult({ success: false, error: '提交失败，请重试' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* 头部 - Header */}
      <header className="glass border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link href="/" className="inline-block text-sm mb-4" style={{ color: 'var(--color-primary)' }}>
            ← 返回技能列表
          </Link>
          <h1 className="text-4xl font-bold text-gradient">提交技能</h1>
          <p className="text-xl" style={{ color: 'var(--fg-muted)' }}>
            只需提供 GitHub 仓库 URL，系统会自动抓取技能信息
          </p>
        </div>
      </header>

      {/* 内容 - Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {result === null ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="repoUrl" className="block text-sm font-medium mb-2" style={{ color: 'var(--fg)' }}>
                GitHub 仓库 URL
              </label>
              <input
                id="repoUrl"
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="例如：github.com/user/repo 或 https://github.com/user/repo"
                className="w-full px-4 py-3 rounded-full text-sm focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-muted)',
                  color: 'var(--fg)',
                  borderColor: 'var(--border-input)',
                  transition: `all var(--duration-fast) var(--ease-out)`
                }}
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-6 py-3 rounded-full text-sm font-medium"
              style={{
                background: 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))',
                color: '#000000',
                borderRadius: 'var(--radius-full)',
                opacity: isSubmitting ? 0.6 : 1,
                transition: `all var(--duration-fast) var(--ease-out)`
              }}
            >
              {isSubmitting ? '扫描中...' : '提交技能'}
            </button>

            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
              <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--fg)' }}>
                支持的 URL 格式：
              </h4>
              <ul className="text-sm space-y-1" style={{ color: 'var(--fg-muted)' }}>
                <li>• <code style={{ backgroundColor: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>user/repo</code></li>
                <li>• <code style={{ backgroundColor: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>github.com/user/repo</code></li>
                <li>• <code style={{ backgroundColor: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>https://github.com/user/repo</code></li>
              </ul>
            </div>
          </form>
        ) : result.success && result.skill ? (
          /* 成功结果 */
          <div className="space-y-6">
            <div className="p-6 rounded-lg text-center" style={{ backgroundColor: 'var(--bg-subtle)', border: `1px solid var(--border)` }}>
              <div className="mb-4" style={{ fontSize: '48px' }}>✓</div>
              <h2 className="text-2xl font-bold mb-2 text-gradient">
                {result.skill.name}
              </h2>
              <p className="text-lg mb-6" style={{ color: 'var(--fg-muted)' }}>
                技能已成功提交并自动分类！
              </p>

              {/* 技能信息卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
                  <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--fg-muted)' }}>描述</h4>
                  <p className="text-base" style={{ color: 'var(--fg)' }}>{result.skill.description}</p>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
                  <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--fg-muted)' }}>分类</h4>
                  <p className="text-base" style={{ color: 'var(--fg)' }}>{result.skill.category}</p>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
                  <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--fg-muted)' }}>可见性</h4>
                  <p className="text-base" style={{ color: 'var(--fg)' }}>{result.skill.visibility}</p>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
                  <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--fg-muted)' }}>作者</h4>
                  <p className="text-base" style={{ color: 'var(--fg)' }}>{result.skill.author || '未知'}</p>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
                  <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--fg-muted)' }}>版本</h4>
                  <p className="text-base" style={{ color: 'var(--fg)' }}>{result.skill.version || '未知'}</p>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-muted)' }}>
                  <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--fg-muted)' }}>文件数</h4>
                  <p className="text-base" style={{ color: 'var(--fg)' }}>{result.skill.files.length} 个文件</p>
                </div>
              </div>

              <Link
                href="/"
                className="inline-block px-6 py-3 rounded-full text-sm font-medium"
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
        ) : (
          /* 错误结果 */
          <div className="p-6 rounded-lg text-center" style={{ backgroundColor: 'hsl(0 84% 10% / 0.1)', border: `1px solid hsl(0 84% 40%)` }}>
            <p className="text-lg font-medium" style={{ color: 'var(--fg)' }}>
              提交失败：{result.error || '未知错误'}
            </p>
            <button
              onClick={() => setResult(null)}
              className="mt-4 px-6 py-3 rounded-full text-sm font-medium"
              style={{
                background: 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))',
                color: '#000000',
                borderRadius: 'var(--radius-full)'
              }}
            >
              重新提交
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
