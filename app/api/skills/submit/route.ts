import { NextResponse } from 'next/server';
import { scanRepository } from '@/lib/github';

/**
 * 技能提交 API
 * POST /api/skills/submit
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoUrl } = body;

    // 验证仓库 URL
    if (!repoUrl || typeof repoUrl !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的 GitHub 仓库 URL' },
        { status: 400 }
      );
    }

    // 基础 URL 格式验证
    const validPatterns = [
      /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/,
      /^https?:\/\/github\.com\/[\w.-]+$/,
      /^[\w.-]+\/[\w.-]+$/,
    ];

    const isValid = validPatterns.some(pattern => pattern.test(repoUrl));

    if (!isValid) {
      return NextResponse.json(
        { error: '仓库 URL 格式无效。支持的格式：user/repo 或 github.com/user/repo' },
        { status: 400 }
      );
    }

    // 扫描仓库
    const token = process.env.GITHUB_TOKEN;
    const result = await scanRepository(repoUrl, token);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || '扫描仓库失败' },
        { status: 400 }
      );
    }

    if (!result.skill) {
      return NextResponse.json(
        { error: '未找到有效的 SKILL.md 文件' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      skill: result.skill
    });
  } catch (error) {
    console.error('Error submitting skill:', error);
    return NextResponse.json(
      { error: '提交失败' },
      { status: 500 }
    );
  }
}
