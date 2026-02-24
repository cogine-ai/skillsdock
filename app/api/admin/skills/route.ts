import { NextResponse } from 'next/server';
import { getAllSkills } from '@/lib/data';

/**
 * 获取所有技能列表 API
 * GET /api/admin/skills
 */
export async function GET(request: Request) {
  try {
    const data = await getAllSkills();

    // 转换为数组格式
    const skills = Object.entries(data.skills).map(([id, skill]) => ({
      id,
      ...skill,
    }));

    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Error fetching skills:', error);
    return NextResponse.json(
      { error: '获取失败：' + (error instanceof Error ? error.message : '未知错误') },
      { status: 500 }
    );
  }
}
