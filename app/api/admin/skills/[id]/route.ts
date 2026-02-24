import { NextResponse } from 'next/server';
import { deleteSkill, getSkillData } from '@/lib/data';

/**
 * 删除技能 API
 * DELETE /api/admin/skills/[id]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 从数据源中删除该技能
    await deleteSkill(id);

    return NextResponse.json({ success: true, message: '技能已删除' });
  } catch (error) {
    console.error('Error deleting skill:', error);
    return NextResponse.json(
      { error: '删除失败：' + (error instanceof Error ? error.message : '未知错误') },
      { status: 500 }
    );
  }
}

/**
 * 获取单个技能详情 API
 * GET /api/admin/skills/[id]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const skill = await getSkillData(id);

    if (!skill) {
      return NextResponse.json({ error: '技能不存在' }, { status: 404 });
    }

    return NextResponse.json({ id, ...skill });
  } catch (error) {
    console.error('Error fetching skill:', error);
    return NextResponse.json(
      { error: '获取失败：' + (error instanceof Error ? error.message : '未知错误') },
      { status: 500 }
    );
  }
}
