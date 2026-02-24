'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    const expectedPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
    if (!expectedPassword) {
      setError('管理员密码未配置');
      return;
    }

    if (password === expectedPassword) {
      setIsAuthenticated(true);
      localStorage.setItem('admin-auth', 'true');
      setError('');
    } else {
      setError('密码错误');
    }
  };

  // 如果已经认证过，可以存储在 localStorage
  useEffect(() => {
    const saved = localStorage.getItem('admin-auth');
    if (saved === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="w-full max-w-md p-6">
          <div className="p-8 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)` }}>
            <h1 className="text-2xl font-bold mb-2 text-gradient">管理后台</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--fg-muted)' }}>
              请输入管理员密码
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="管理员密码"
                  className="w-full px-4 py-3 rounded-full text-sm"
                  style={{
                    backgroundColor: 'var(--bg-muted)',
                    color: 'var(--fg)',
                    borderColor: error ? 'var(--color-error)' : 'var(--border-input)',
                    transition: `all var(--duration-fast) var(--ease-out)`
                  }}
                />
              </div>

              {error && (
                <p className="text-sm" style={{ color: 'hsl(0 84% 60%)' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="w-full px-6 py-3 rounded-full text-sm font-medium"
                style={{
                  background: 'linear-gradient(to right, #ffffff, hsl(195 100% 70%))',
                  color: '#000000',
                  borderRadius: 'var(--radius-full)'
                }}
              >
                登录
              </button>
            </form>

            <div className="mt-6 pt-6 text-center" style={{ borderTop: `1px solid var(--border)` }}>
              <Link
                href="/"
                className="text-sm"
                style={{ color: 'var(--color-primary)' }}
              >
                ← 返回首页
              </Link>
            </div>
          </div>
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
              <h1 className="text-4xl font-bold text-gradient">管理后台</h1>
              <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
                管理技能、查看反馈
              </p>
            </div>
            <div className="flex gap-4">
              <Link
                href="/"
                className="text-sm px-4 py-2 rounded-full"
                style={{
                  backgroundColor: 'var(--bg-muted)',
                  color: 'var(--fg)',
                  borderRadius: 'var(--radius-full)',
                  transition: `all var(--duration-fast) var(--ease-out)`
                }}
              >
                ← 返回首页
              </Link>
              <button
                onClick={() => {
                  localStorage.removeItem('admin-auth');
                  setIsAuthenticated(false);
                }}
                className="text-sm px-4 py-2 rounded-full"
                style={{
                  backgroundColor: 'hsl(0 84% 10% / 0.1)',
                  color: 'var(--fg)',
                  borderRadius: 'var(--radius-full)',
                  transition: `all var(--duration-fast) var(--ease-out)`
                }}
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 内容 - Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)` }}>
            <h3 className="text-lg font-semibold mb-2">📋 团队规范</h3>
            <p className="text-3xl font-bold text-gradient">0</p>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>个技能</p>
          </div>
          <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)` }}>
            <h3 className="text-lg font-semibold mb-2">🚀 项目</h3>
            <p className="text-3xl font-bold text-gradient">0</p>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>个技能</p>
          </div>
          <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)` }}>
            <h3 className="text-lg font-semibold mb-2">🤝 共享</h3>
            <p className="text-3xl font-bold text-gradient">0</p>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>个技能</p>
          </div>
          <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)` }}>
            <h3 className="text-lg font-semibold mb-2">📥 总下载</h3>
            <p className="text-3xl font-bold text-gradient">0</p>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>次</p>
          </div>
          <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)` }}>
            <h3 className="text-lg font-semibold mb-2">⭐ 可信技能</h3>
            <p className="text-3xl font-bold text-gradient">0</p>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>个</p>
          </div>
          <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)` }}>
            <h3 className="text-lg font-semibold mb-2">⚠️ 待审核</h3>
            <p className="text-3xl font-bold text-gradient">0</p>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>个技能</p>
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/admin/skills"
            className="block p-6 rounded-lg text-center"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid var(--border)`,
              transition: `all var(--duration-normal) var(--ease-out)`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-glow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <h3 className="text-lg font-semibold mb-2">📦 管理所有技能</h3>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>编辑、删除技能</p>
          </Link>

          <Link
            href="/submit"
            className="block p-6 rounded-lg text-center"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid var(--border)`,
              transition: `all var(--duration-normal) var(--ease-out)`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-glow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <h3 className="text-lg font-semibold mb-2">➕ 提交新技能</h3>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>快速提交 GitHub 仓库</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
