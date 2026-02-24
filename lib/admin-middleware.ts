import { NextResponse } from 'next/server';

/**
 * 管理后台 API Key 验证中间件
 */
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'your-secret-admin-key';

export function verifyAdminAuth(request: Request): boolean {
  const apiKey = request.headers.get('x-admin-api-key');

  return apiKey === ADMIN_API_KEY;
}

/**
 * 响应未授权错误
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: '未授权访问' },
    { status: 401 }
  );
}
