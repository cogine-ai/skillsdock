import { Skill, WellKnownSkill, WellKnownResponse, SkillCategory } from './types';
import { listSkills } from './github';

export function generateInstallCommand(skill: Skill, repoName?: string): string {
  const repo = repoName || process.env.PUBLIC_SKILLS_REPO || 'cogine-ai/public-skills';
  return `npx skills add ${repo} --skill ${skill.id}`;
}

export function generateSkillUrl(skill: Skill, baseUrl?: string): string {
  return `${baseUrl || ''}/skills/${skill.id}`;
}

export function filterSkillsByCategory(skills: Skill[], category?: SkillCategory): Skill[] {
  if (!category) return skills;
  return skills.filter(s => s.category === category);
}

export function filterSkillsByVisibility(skills: Skill[], visibility?: 'public' | 'private'): Skill[] {
  if (!visibility) return skills;
  return skills.filter(s => s.visibility === visibility);
}

export function searchSkills(skills: Skill[], query: string): Skill[] {
  if (!query.trim()) return skills;

  const lowerQuery = query.toLowerCase();
  return skills.filter(s =>
    s.name.toLowerCase().includes(lowerQuery) ||
    s.description.toLowerCase().includes(lowerQuery) ||
    s.author.toLowerCase().includes(lowerQuery) ||
    (s.project && s.project.toLowerCase().includes(lowerQuery))
  );
}

export async function generateWellKnownResponse(baseUrl?: string): Promise<WellKnownResponse> {
  const skills = await listSkills();

  const wellKnownSkills: WellKnownSkill[] = skills
    .filter(s => s.visibility === 'public')
    .map(skill => {
      // 将所有文件转换为 Record<string, string> 格式
      const filesRecord: Record<string, string> = {};
      const basePath = skill.id.replace(/-/g, '/');
      for (const file of skill.files) {
        // 计算相对路径（去掉技能目录前缀）
        const relativePath = file.path.substring(basePath.length + 1);
        filesRecord[relativePath] = file.content;
      }
      // 确保 SKILL.md 存在
      filesRecord['SKILL.md'] = skill.content;

      return {
        name: skill.name,
        description: skill.description,
        installName: skill.id,
        sourceUrl: skill.sourceUrl,
        files: filesRecord,
        metadata: {
          category: skill.category,
          visibility: skill.visibility,
          project: skill.project,
        },
      };
    });

  return { skills: wellKnownSkills };
}

export function getSkillDisplayName(skill: Skill): string {
  if (skill.category === 'project' && skill.project) {
    return `${skill.project} - ${skill.name}`;
  }
  return skill.name;
}

export function getCategoryDisplayName(category: SkillCategory): string {
  const names: Record<SkillCategory, string> = {
    'team-standards': '团队规范',
    'project': '项目',
    'shared': '共享',
  };
  return names[category];
}
