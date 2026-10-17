/* ===========================================================
 * skill.js — 技能系统（升级三选一 + 玩法驱动自动升级）
 * =========================================================== */

import { SKILLS } from "./config.js";
import { shuffle } from "./utils.js";
import { sfx } from "./audio.js";
import { spawnParticles } from "./particles.js";
import { discoverSkill } from "./meta.js";

export function getMaxLives(baseHp, skillMaxHp) {
  return baseHp + (skillMaxHp || 0);
}

/**
 * 内部：把技能提升 count 级并应用副作用（生命/护盾）
 * 返回是否真的发生了升级
 */
function upgradeSkill(skill, player, count = 1) {
  const cur = player.skills[skill.id] || 0;
  const next = Math.min(skill.max, cur + count);
  if (next <= cur) return false;
  player.skills[skill.id] = next;
  discoverSkill(skill.id);
  const gained = next - cur;
  if (skill.id === "maxhp") {
    player._heal = (player._heal || 0) + gained;
  }
  if (skill.id === "shield") {
    player.shield = Math.min(player.maxShield, player.shield + gained);
  }
  return true;
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
      pool.push(s);
    }
  }
  if (pool.length === 0) return [];

  // 未拥有的技能优先入选，缺口由已拥有技能补足。
  // 保持确定性：先取满新技能（不足则继续从已拥有里补），
  // 避免随机导致测试与手感抖动。
  const fresh = shuffle(pool.filter(s => (playerSkills[s.id] || 0) === 0));
  const rest = shuffle(pool.filter(s => (playerSkills[s.id] || 0) > 0));

  const choices = [];
  for (const s of fresh) {
    if (choices.length >= 3) break;
    choices.push(s);
  }
  for (const s of rest) {
    if (choices.length >= 3) break;
    choices.push(s);
  }
  return choices;
}

/**
 * 应用技能选择（三选一，手动 +1 级）
 * @returns {object|null} toast 消息
 */
export function applySkill(skill, player) {
  const cur = player.skills[skill.id] || 0;
  // 上限钳制：道具/三选一并发时选项可能过期，超限直接拒绝
  if (cur >= skill.max) return null;
  // 前置校验:未满足 requires 的技能不允许授予（防御随机道具绕过）
  if (skill.requires && (player.skills[skill.requires] || 0) <= 0) {
    return { text: "需要先习得前置技能", color: "#ff8fa3", t: 1.2 };
  }
  upgradeSkill(skill, player, 1);
  sfx.pickup();
  const lvl = player.skills[skill.id];
  const toast = {
    text: "习得：" + skill.name + (lvl > 1 ? " " + lvl + "级" : ""),
    t: 1.4,
    color: skill.color,
  };
  return toast;
}
