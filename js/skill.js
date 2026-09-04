/* ===========================================================
 * skill.js — 技能系统（升级三选一）
 * =========================================================== */

import { SKILLS } from "./config.js";
import { sfx } from "./audio.js";
import { spawnParticles } from "./particles.js";
import { discoverSkill } from "./meta.js";

export function getMaxLives(baseHp, skillMaxHp) {
  return baseHp + (skillMaxHp || 0);
}

/**
 * 生成升级选项
 * @returns {Array} 3个可选技能
 */
export function generateSkillChoices(playerSkills) {
  const pool = [];
  for (const s of SKILLS) {
    const cur = playerSkills[s.id] || 0;
    if (cur < s.max) {
      // 前置条件：requires 字段指定的技能等级 > 0 才可选
      if (s.requires) {
        if ((playerSkills[s.requires] || 0) <= 0) continue;
      }
      pool.push([s, cur === 0 ? 15 : 5]);
    }
  }
  if (pool.length === 0) return [];

  const fresh = pool.filter(([s]) => (playerSkills[s.id] || 0) === 0);
  const rest = pool.filter(([s]) => (playerSkills[s.id] || 0) > 0);
  const freshShuffled = [...fresh].sort(() => Math.random() - 0.5);
  const restShuffled = [...rest].sort(() => Math.random() - 0.5);

  const choices = [];
  const used = new Set();
  for (const [s] of freshShuffled) {
    if (choices.length >= 3) break;
    choices.push(s);
    used.add(s.id);
  }
  for (const [s] of restShuffled) {
    if (choices.length >= 3) break;
    if (used.has(s.id)) continue;
    choices.push(s);
  }
  return choices;
}

/**
 * 应用技能选择
 * @returns {object|null} toast 消息
 */
export function applySkill(skill, player) {
  player.skills[skill.id] = (player.skills[skill.id] || 0) + 1;
  discoverSkill(skill.id);   // 收录进技能图鉴
  if (skill.id === "maxhp") {
    player._heal = (player._heal || 0) + 1;
    player._maxLivesUpdate = true;  // 通知 game.js 更新 maxLives
  }
  if (skill.id === "shield") {
    player.shield = Math.min(player.maxShield, player.shield + 1);
  }
  sfx.pickup();
  const lvl = player.skills[skill.id];
  const toast = {
    text: "习得：" + skill.name + (lvl > 1 ? " " + lvl + "级" : ""),
    t: 1.4,
    color: skill.color,
  };
  return toast;
}
