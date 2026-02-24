import { NextResponse } from 'next/server';
import { generateWellKnownResponse } from '@/lib/skills';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const response = await generateWellKnownResponse(baseUrl);

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Error generating well-known response:', error);
    return NextResponse.json(
      { error: 'Failed to generate skills index' },
      { status: 500 }
    );
  }
}
