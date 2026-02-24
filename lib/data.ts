/**
 * 技能数据持久化模块
 * 使用本地 JSON 文件存储技能数据
 */

import { promises } from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'lib/data.json');
const BACKUP_FILE = path.join(process.cwd(), 'lib/data.backup.json');

interface SkillsData {
  skills: Record<string, {
    name: string;
    description: string;
    category: string;
    visibility: string;
    author?: string;
    version?: string;
    sourceUrl: string;
    fileCount: number;
    isTrusted: boolean;
    lastUpdated?: string;
  }>;
  lastUpdated: string;
}

/**
 * 读取所有技能数据
 */
export async function getAllSkills(): Promise<SkillsData> {
  try {
    const data = await promises.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 文件不存在时返回空数据
    return {
      skills: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * 保存所有技能数据
 */
export async function saveAllSkills(data: SkillsData): Promise<void> {
  await promises.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 添加或更新单个技能
 */
export async function upsertSkill(skillId: string, skillData: Omit<SkillsData['skills'][string], 'lastUpdated'>): Promise<void> {
  const data = await getAllSkills();

  data.skills[skillId] = {
    ...data.skills[skillId],
    ...skillData,
    lastUpdated: new Date().toISOString(),
  };

  data.lastUpdated = new Date().toISOString();
  await saveAllSkills(data);
}

/**
 * 删除技能
 */
export async function deleteSkill(skillId: string): Promise<void> {
  const data = await getAllSkills();

  if (data.skills[skillId]) {
    delete data.skills[skillId];

    // 更新最后修改时间
    data.lastUpdated = new Date().toISOString();

    await saveAllSkills(data);
  }
}

/**
 * 备份数据
 */
export async function backupData(): Promise<void> {
  try {
    const data = await promises.readFile(DATA_FILE, 'utf-8');
    await promises.writeFile(BACKUP_FILE, data, 'utf-8');
  } catch (error) {
    console.error('Backup failed:', error);
  }
}

/**
 * 获取单个技能数据
 */
export async function getSkillData(skillId: string): Promise<SkillsData['skills'][string] | null> {
  const data = await getAllSkills();
  return data.skills[skillId] || null;
}
