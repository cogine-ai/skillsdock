import { NextResponse } from 'next/server';
import { getSkill } from '@/lib/github';

/**
 * 下载技能包 API
 * GET /api/skills/[id] - 返回技能的所有文件
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = process.env.GITHUB_TOKEN;
    const skill = await getSkill(id, token);

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    // 返回技能的所有文件作为 JSON
    return NextResponse.json({
      id: skill.id,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      author: skill.author,
      category: skill.category,
      visibility: skill.visibility,
      project: skill.project,
      files: skill.files,
      sourceUrl: skill.sourceUrl,
    });
  } catch (error) {
    console.error('Error fetching skill:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill' },
      { status: 500 }
    );
  }
}
