/**
 * AI 自动分类模块
 * 基于仓库名称和关键词自动分配技能分类
 */

import { SkillCategory } from './types';

/**
 * 分类关键词映射
 */
const categoryKeywords: Record<SkillCategory, string[]> = {
  'team-standards': [
    '标准', '规范', '编码规范', 'code style', 'lint', 'eslint', 'prettier',
    '团队', 'team', '协作', '规范', 'convention', '最佳实践', 'best practice',
    'guide', '指南', '手册', '文档', 'documentation', 'readme'
  ],
  'project': [
    '项目', 'project', '工程', 'application', 'app', '项目模板', 'template',
    '示例', 'example', 'demo', '原型', 'prototype', '框架', 'framework',
    '组件', 'component', 'ui', 'user interface', '工具', 'tool', 'utility'
  ],
  'shared': [
    '共享', 'shared', '通用', 'common', '实用', 'utility', 'helper',
    '扩展', 'extension', 'plugin', '插件', 'snippet', '代码片段'
  ]
};

/**
 * 从仓库名称推断分类
 */
export function classifyByRepoName(repoName: string): SkillCategory {
  const name = repoName.toLowerCase();

  // 直接匹配关键词
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => name.includes(keyword))) {
      return category as SkillCategory;
    }
  }

  // 默认判断：包含 team/standard → team-standards
  if (name.includes('team') || name.includes('standard')) {
    return 'team-standards';
  }

  // 包含 project/app/template → project
  if (name.includes('project') || name.includes('app') || name.includes('template')) {
    return 'project';
  }

  // 默认：shared
  return 'shared';
}

/**
 * 从描述推断分类
 */
export function classifyByDescription(description: string): SkillCategory {
  const desc = description.toLowerCase();

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => desc.includes(keyword))) {
      return category as SkillCategory;
    }
  }

  return 'shared';
}

/**
 * 综合分类（仓库名 + 描述）
 */
export function autoClassify(
  repoName: string,
  description: string
): SkillCategory {
  // 优先使用仓库名称
  const repoCategory = classifyByRepoName(repoName);

  // 如果仓库名判断为 shared，尝试描述
  if (repoCategory === 'shared') {
    const descCategory = classifyByDescription(description);
    return descCategory;
  }

  return repoCategory;
}

/**
 * 推断可见性
 * 基于仓库名称和描述中的关键词判断是否为团队内部技能
 */
export function inferVisibility(repoName: string, description: string): 'public' | 'private' {
  const lowerRepo = repoName.toLowerCase();
  const lowerDesc = description.toLowerCase();

  // 内部技能关键词
  const internalKeywords = [
    '内部', 'internal', '团队', 'team', '私有', 'private',
    '仅限', 'internal only', '团队专用', 'team only'
  ];

  if (internalKeywords.some(keyword =>
    lowerRepo.includes(keyword) || lowerDesc.includes(keyword)
  )) {
    return 'private';
  }

  return 'public';
}
