import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * 生成一个随机的 bigint id（10位数字），与数据库现有数据格式一致。
 * 数据库 id 字段为 bigint 类型，无自动序列，需前端生成后传入。
 */
export function genId() {
  return Math.floor(1000000000 + Math.random() * 9000000000);
}

const TASK_GROUPS_STORAGE_KEY = "nocode.taskGroups";
const TASK_GROUP_ASSIGNMENTS_STORAGE_KEY = "nocode.taskGroupAssignments";

function readJsonStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getStoredTaskGroups() {
  return readJsonStorage(TASK_GROUPS_STORAGE_KEY, []);
}

export function saveStoredTaskGroups(groups) {
  writeJsonStorage(TASK_GROUPS_STORAGE_KEY, groups);
}

export function getStoredTaskGroupAssignments() {
  return readJsonStorage(TASK_GROUP_ASSIGNMENTS_STORAGE_KEY, {});
}

export function setStoredTaskGroupAssignment(taskId, groupId) {
  const assignments = getStoredTaskGroupAssignments();
  if (groupId == null) {
    delete assignments[String(taskId)];
  } else {
    assignments[String(taskId)] = groupId;
  }
  writeJsonStorage(TASK_GROUP_ASSIGNMENTS_STORAGE_KEY, assignments);
}

export function clearStoredTaskAssignmentsByGroup(groupId) {
  const assignments = getStoredTaskGroupAssignments();
  const next = Object.fromEntries(
    Object.entries(assignments).filter(([, value]) => Number(value) !== Number(groupId))
  );
  writeJsonStorage(TASK_GROUP_ASSIGNMENTS_STORAGE_KEY, next);
}

export function applyStoredTaskGroups(tasks) {
  const assignments = getStoredTaskGroupAssignments();
  return tasks.map((task) => ({
    ...task,
    group_id: assignments[String(task.id)] ?? task.group_id ?? null,
  }));
}

// ─── 任务扩展字段（importance / urgency / owner_ids / supporter_ids）存 localStorage ───
// 注意：related_member_ids / predecessor_ids / successor_ids 已迁移到数据库字段，不再用 localStorage
const TASK_EXTRA_STORAGE_KEY = "nocode.taskExtra";

export function getStoredTaskExtra() {
  return readJsonStorage(TASK_EXTRA_STORAGE_KEY, {});
}

export function setStoredTaskExtra(taskId, patch) {
  const all = getStoredTaskExtra();
  all[String(taskId)] = { ...(all[String(taskId)] || {}), ...patch };
  writeJsonStorage(TASK_EXTRA_STORAGE_KEY, all);
}

export function applyStoredTaskExtra(tasks) {
  const all = getStoredTaskExtra();
  return tasks.map((task) => {
    const extra = all[String(task.id)] || {};
    return {
      ...task,
      importance: extra.importance ?? task.importance ?? "normal",
      urgency: extra.urgency ?? task.urgency ?? "normal",
      owner_ids: extra.owner_ids ?? task.owner_ids ?? (task.owner_id ? [task.owner_id] : []),
      supporter_ids: extra.supporter_ids ?? task.supporter_ids ?? (task.supporter_id ? [task.supporter_id] : []),
      // related_member_ids / predecessor_ids / successor_ids 直接从数据库字段读取，不从 localStorage 覆盖
      related_member_ids: task.related_member_ids ?? [],
      predecessor_ids: task.predecessor_ids ?? [],
      successor_ids: task.successor_ids ?? [],
    };
  });
}
