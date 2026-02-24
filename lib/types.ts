export type SkillCategory = 'team-standards' | 'project' | 'shared';
export type Visibility = 'public' | 'private';

export interface SkillFile {
  path: string;
  name: string;
  content: string;
  encoding: 'base64' | 'utf-8';
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  visibility: Visibility;
  project?: string;
  author: string;
  version: string;
  // SKILL.md 内容（用于预览）
  content: string;
  // 技能包的所有文件
  files: SkillFile[];
  sourceUrl: string;
  // 文件数量
  fileCount: number;
}

export interface SkillMetadata {
  name: string;
  description: string;
  category: SkillCategory;
  visibility: Visibility;
  project?: string;
  author: string;
  version: string;
}

export interface WellKnownSkillFile {
  path: string;
  content: string;
}

export interface WellKnownSkill {
  name: string;
  description: string;
  installName: string;
  sourceUrl: string;
  files: Record<string, string>;
  metadata: {
    category: SkillCategory;
    visibility: Visibility;
    project?: string;
  };
}

export interface WellKnownResponse {
  skills: WellKnownSkill[];
}
