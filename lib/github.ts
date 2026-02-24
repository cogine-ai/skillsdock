import { Skill, SkillMetadata, SkillCategory } from './types';
import { autoClassify, inferVisibility } from './classifier';

const GITHUB_API_BASE = 'https://api.github.com';

interface GitHubRepoConfig {
  owner: string;
  repo: string;
  branch?: string;
}

export function parseRepoName(repoName: string): GitHubRepoConfig {
  const [owner, repo] = repoName.split('/');
  return { owner, repo, branch: 'main' };
}

export async function fetchGitHubContent(
  config: GitHubRepoConfig,
  path: string,
  token?: string
): Promise<any> {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return response.json();
}

async function searchSkillFiles(
  config: GitHubRepoConfig,
  path: string,
  token?: string,
  depth = 0
): Promise<string[]> {
  const skillFiles: string[] = [];

  if (depth > 5) {
    return skillFiles;
  }

  try {
    const content = await fetchGitHubContent(config, path, token);

    if (!Array.isArray(content)) {
      // It's a file, check if it's SKILL.md
      if (path.endsWith('SKILL.md')) {
        skillFiles.push(path);
      }
      return skillFiles;
    }

    // It's a directory, recurse
    for (const item of content) {
      if (item.type === 'dir') {
        const subFiles = await searchSkillFiles(
          config,
          item.path,
          token,
          depth + 1
        );
        skillFiles.push(...subFiles);
      } else if (item.name === 'SKILL.md') {
        skillFiles.push(item.path);
      }
    }
  } catch (error) {
    console.warn(`Error fetching ${path}:`, error);
  }

  return skillFiles;
}

/**
 * 获取技能目录下的所有文件
 */
async function fetchSkillDirectory(
  config: GitHubRepoConfig,
  skillPath: string,
  token?: string
): Promise<{ path: string; name: string; content: string }[]> {
  const files: { path: string; name: string; content: string }[] = [];

  try {
    // 获取 SKILL.md 所在目录的内容
    const dirPath = skillPath.replace(/\/SKILL\.md$/, '');
    const content = await fetchGitHubContent(config, dirPath, token);

    if (!Array.isArray(content)) {
      // 如果不是目录，说明只有 SKILL.md
      return files;
    }

    // 递归获取所有文件
    async function fetchAllFiles(path: string) {
      const dirContent = await fetchGitHubContent(config, path, token);

      if (!Array.isArray(dirContent)) {
        // 是文件，获取内容
        if (dirContent.encoding === 'base64') {
          const decoded = atob(dirContent.content);
          files.push({
            path: dirContent.path,
            name: dirContent.name,
            content: decoded,
          });
        }
        return;
      }

      // 是目录，递归
      for (const item of dirContent) {
        await fetchAllFiles(item.path);
      }
    }

    await fetchAllFiles(dirPath);

  } catch (error) {
    console.warn(`Error fetching skill directory ${skillPath}:`, error);
  }

  return files;
}

function parseFrontmatter(content: string): { metadata: SkillMetadata; content: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }

  const frontmatter = match[1];
  const body = match[2];

  const metadata: any = {};
  frontmatter.split('\n').forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      metadata[key] = value;
    }
  });

  return {
    metadata: metadata as SkillMetadata,
    content: body.trim(),
  };
}

export async function fetchSkillsFromRepo(
  repoName: string,
  token?: string
): Promise<Skill[]> {
  const config = parseRepoName(repoName);

  try {
    const skillFilePaths = await searchSkillFiles(config, '', token);

    const skills: Skill[] = [];

    for (const skillPath of skillFilePaths) {
      try {
        // 获取 SKILL.md
        const fileContent = await fetchGitHubContent(config, skillPath, token);

        if (fileContent.encoding === 'base64') {
          const decoded = atob(fileContent.content);
          const { metadata, content } = parseFrontmatter(decoded);

          // 获取技能目录下的所有文件
          const skillFiles = await fetchSkillDirectory(config, skillPath, token);

          // Generate ID from path (remove SKILL.md)
          const id = skillPath.replace(/\/SKILL\.md$/, '').replace(/\//g, '-');

          skills.push({
            id,
            name: metadata.name,
            description: metadata.description,
            category: metadata.category,
            visibility: metadata.visibility,
            project: metadata.project,
            author: metadata.author,
            version: metadata.version,
            content,
            files: skillFiles.map(f => ({
              path: f.path,
              name: f.name,
              content: f.content,
              encoding: 'utf-8' as const,
            })),
            sourceUrl: `https://github.com/${config.owner}/${config.repo}/blob/${config.branch}/${skillPath}`,
            fileCount: skillFiles.length,
          });
        }
      } catch (error) {
        console.warn(`Error parsing ${skillPath}:`, error);
      }
    }

    return skills;
  } catch (error) {
    console.error(`Error fetching skills from ${repoName}:`, error);
    return [];
  }
}

export async function listSkills(token?: string): Promise<Skill[]> {
  const publicSkillsRepo = process.env.PUBLIC_SKILLS_REPO || 'cogine-ai/public-skills';
  const privateSkillsRepo = process.env.PRIVATE_SKILLS_REPO;

  const [publicSkills, privateSkills] = await Promise.all([
    fetchSkillsFromRepo(publicSkillsRepo),
    privateSkillsRepo ? fetchSkillsFromRepo(privateSkillsRepo, token) : Promise.resolve([]),
  ]);

  return [...publicSkills, ...privateSkills];
}

export async function getSkill(id: string, token?: string): Promise<Skill | null> {
  const skills = await listSkills(token);
  return skills.find(s => s.id === id) || null;
}

/**
 * 扫描用户提交的仓库，检测 SKILL.md 并解析技能信息
 */
export async function scanRepository(repoUrl: string, token?: string): Promise<{
  success: boolean;
  skill?: {
    name: string;
    description: string;
    category: SkillCategory;
    visibility: 'public' | 'private';
    author?: string;
    version?: string;
    files: { path: string; name: string; content: string }[];
  };
  error?: string;
}> {
  try {
    // 解析仓库 URL
    let repoName = repoUrl.trim();

    // 处理各种 URL 格式
    if (repoName.startsWith('http://')) {
      repoName = repoName.replace('http://', '');
    } else if (repoName.startsWith('https://')) {
      repoName = repoName.replace('https://', '');
    } else if (repoName.startsWith('github.com/')) {
      // github.com/user/repo 格式
      repoName = repoName.replace('github.com/', '');
    }

    // 移除末尾斜杠和 .git
    repoName = repoName.replace(/\/$/, '').replace(/\.git$/, '');

    const config = parseRepoName(repoName);

    // 搜索 SKILL.md
    const skillFilePaths = await searchSkillFiles(config, '', token);

    if (skillFilePaths.length === 0) {
      return {
        success: false,
        error: '未找到 SKILL.md 文件'
      };
    }

    // 只取第一个找到的 SKILL.md
    const skillPath = skillFilePaths[0];

    // 获取 SKILL.md 内容
    const fileContent = await fetchGitHubContent(config, skillPath, token);

    if (fileContent.encoding !== 'base64') {
      return {
        success: false,
        error: '无法读取文件内容'
      };
    }

    const decoded = atob(fileContent.content);
    const { metadata } = parseFrontmatter(decoded);

    // AI 自动分类
    const category = metadata.category || autoClassify(repoName, metadata.description || '');

    // 推断可见性
    const visibility = metadata.visibility || inferVisibility(repoName, metadata.description || '');

    // 获取所有文件
    const allFiles = await fetchSkillDirectory(config, skillPath, token);

    return {
      success: true,
      skill: {
        name: metadata.name,
        description: metadata.description,
        category,
        visibility,
        author: metadata.author,
        version: metadata.version,
        files: allFiles.map(f => ({
          path: f.path,
          name: f.name,
          content: f.content
        }))
      }
    };
  } catch (error: unknown) {
    console.error('Error scanning repository:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '扫描失败'
    };
  }
}
