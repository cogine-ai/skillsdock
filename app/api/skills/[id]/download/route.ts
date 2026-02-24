import { NextResponse } from 'next/server';
import { getSkill } from '@/lib/github';
import JSZip from 'jszip';

/**
 * 下载技能包为 ZIP 文件
 * GET /api/skills/[id]/download - 返回 ZIP 格式的技能包
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

    // 创建 ZIP 文件
    const zip = new JSZip();

    // 添加 SKILL.md
    zip.file('SKILL.md', skill.content);

    // 添加所有其他文件（使用相对路径）
    const baseId = skill.id.replace(/-/g, '/');
    for (const file of skill.files) {
      // 计算相对路径
      const relativePath = file.path.substring(baseId.length + 1);
      if (relativePath !== 'SKILL.md') {
        zip.file(relativePath, file.content);
      }
    }

    // 生成 ZIP 文件
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    // 返回 ZIP 文件
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${skill.name}-${skill.version}.skill"`,
      },
    });
  } catch (error) {
    console.error('Error creating skill zip:', error);
    return NextResponse.json(
      { error: 'Failed to create skill package' },
      { status: 500 }
    );
  }
}
