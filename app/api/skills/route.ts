import { NextResponse } from 'next/server';
import { listSkills } from '@/lib/github';

export async function GET() {
  try {
    const token = process.env.GITHUB_TOKEN;
    const skills = await listSkills(token);

    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Error fetching skills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skills' },
      { status: 500 }
    );
  }
}
