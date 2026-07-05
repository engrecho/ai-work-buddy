// HTTP 客户端
// 封装所有 Buddy API v1 调用
import { loadConfig } from './config.js';

class BuddyClient {
  constructor(config) {
    this.config = config || loadConfig();
    if (!this.config) {
      throw new Error('未找到配置，请先运行: node index.js init');
    }
    if (!this.config.api_key) {
      throw new Error('配置中缺少 api_key');
    }
  }

  async request(method, path, { query, body } = {}) {
    let url = this.config.api_base.replace(/\/+$/, '') + path;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          v.forEach(item => params.append(k, item));
        } else {
          params.append(k, String(v));
        }
      }
      const qs = params.toString();
      if (qs) url += '?' + qs;
    }

    const options = {
      method,
      headers: {
        'X-API-Key': this.config.api_key,
        'Content-Type': 'application/json',
      },
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const json = await res.json();

    if (!res.ok || json.error) {
      const err = new Error(json.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = json.error?.code;
      throw err;
    }

    return json.data;
  }

  // ── 用户 ──
  me() {
    return this.request('GET', '/me');
  }

  // ── 任务 ──
  listTasks(filters = {}) {
    return this.request('GET', '/tasks', { query: filters });
  }

  getTask(id) {
    return this.request('GET', `/tasks/${id}`);
  }

  createTask(data) {
    return this.request('POST', '/tasks', { body: data });
  }

  updateTask(id, changes) {
    return this.request('PATCH', `/tasks/${id}`, { body: changes });
  }

  // 删除任务：需要 confirm=true
  deleteTask(id, { confirm = false } = {}) {
    if (!confirm) {
      throw new Error('删除任务需要 confirm=true。SKILL 必须先向用户列出待删除任务并取得确认。');
    }
    return this.request('DELETE', `/tasks/${id}`, { query: { confirm: 'true' } });
  }

  // 整理任务：默认 dry_run=true
  organizeTasks(plan, { dryRun = true } = {}) {
    return this.request('POST', '/tasks/organize', {
      body: { plan, dry_run: dryRun },
    });
  }

  // ── 任务分组 ──
  listTaskGroups() {
    return this.request('GET', '/task-groups');
  }

  // ── 备忘 ──
  listMemos(filters = {}) {
    return this.request('GET', '/memos', { query: filters });
  }

  createMemo(data) {
    return this.request('POST', '/memos', { body: data });
  }

  // ── 阅读 ──
  listReading(filters = {}) {
    return this.request('GET', '/reading', { query: filters });
  }

  getReading(id) {
    return this.request('GET', `/reading/${id}`);
  }

  createReading(data) {
    return this.request('POST', '/reading', { body: data });
  }

  // ── 随记 ──
  listQuickNotes(filters = {}) {
    return this.request('GET', '/quick-notes', { query: filters });
  }

  createQuickNote(content, tags = []) {
    return this.request('POST', '/quick-notes', { body: { content, tags } });
  }
}

export default BuddyClient;
