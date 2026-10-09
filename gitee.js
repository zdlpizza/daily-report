// =============================================
// Gitee API 封装模块（多用户版）
// =============================================

const Gitee = (() => {
  const BASE = 'https://gitee.com/api/v5';

  function token()  { return CONFIG.token; }
  function owner()  { return CONFIG.owner; }
  function repo()   { return CONFIG.repo; }

  // 某用户的日报文件路径
  function reportPath(username, date) {
    const base = CONFIG.reportDir ? CONFIG.reportDir + '/' : '';
    return `${base}${username}/${date}.md`;
  }

  // 用户数据文件路径
  function usersPath() {
    return CONFIG.usersFile;
  }

  // 通用 GET 文件
  async function getFile(path) {
    const url = `${BASE}/repos/${owner()}/${repo()}/contents/${path}?access_token=${token()}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // 兼容 Gitee 返回数组（目录）或无 content 字段的情况
    if (!data || !data.content) return null;
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, '')), c => c.charCodeAt(0));
    const content = new TextDecoder().decode(bytes);
    return { content, sha: data.sha };
  }

  // 通用写文件（新建或更新）
  async function putFile(path, content, sha = null, message = '') {
    const url = `${BASE}/repos/${owner()}/${repo()}/contents/${path}`;
    // 兼容中文及特殊字符的 Base64 编码
    const encoded = btoa(
      Array.from(new TextEncoder().encode(content))
        .map(b => String.fromCharCode(b)).join('')
    );
    const body = {
      access_token: token(),
      message: message || (sha ? `更新 ${path}` : `新建 ${path}`),
      content: encoded,
      committer: CONFIG.committer,
    };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
      method: sha ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = Array.isArray(err.message) ? err.message.join('; ') : (err.message || `写入失败 HTTP ${res.status}`);
      throw new Error(msg);
    }
    return await res.json();
  }

  // 通用删除文件
  async function delFile(path, sha, message = '') {
    const url = `${BASE}/repos/${owner()}/${repo()}/contents/${path}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token(),
        message: message || `删除 ${path}`,
        sha,
        committer: CONFIG.committer,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = Array.isArray(err.message) ? err.message.join('; ') : (err.message || `删除失败 HTTP ${res.status}`);
      throw new Error(msg);
    }
  }

  // 列出某目录下的文件
  async function listDir(path) {
    const url = `${BASE}/repos/${owner()}/${repo()}/contents/${path}?access_token=${token()}`;
    const res = await fetch(url);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  // ---- 用户数据 ----

  async function getUsers() {
    try {
      const result = await getFile(usersPath());
      if (!result) return { list: [], sha: null };
      try {
        return { list: JSON.parse(result.content), sha: result.sha };
      } catch {
        return { list: [], sha: result.sha };
      }
    } catch (e) {
      return { list: [], sha: null };
    }
  }

  async function saveUsers(users, sha) {
    const content = JSON.stringify(users, null, 2);
    // sha=null 时新建文件，Gitee API 会自动创建父目录
    await putFile(usersPath(), content, sha, '更新用户列表');
  }

  // ---- 日报操作 ----

  async function getReport(username, date) {
    return await getFile(reportPath(username, date));
  }

  async function saveReport(username, date, content, sha = null) {
    const path = reportPath(username, date);
    await putFile(path, content, sha, `${sha ? '更新' : '新建'}日报 ${username}/${date}`);
  }

  async function deleteReport(username, date, sha) {
    await delFile(reportPath(username, date), sha, `删除日报 ${username}/${date}`);
  }

  // 列出某用户的所有日报日期
  async function listUserReports(username) {
    const base = CONFIG.reportDir ? `${CONFIG.reportDir}/${username}` : username;
    const files = await listDir(base);
    return files
      .filter(f => f.type === 'file' && f.name.endsWith('.md'))
      .map(f => f.name.replace('.md', ''))
      .sort((a, b) => b.localeCompare(a));
  }

  // 列出所有有日报的用户（管理员用）
  async function listAllUsers() {
    const base = CONFIG.reportDir || '';
    const items = await listDir(base);
    // 过滤出目录（即用户文件夹），排除 data 目录
    return items
      .filter(f => f.type === 'dir' && f.name !== 'data')
      .map(f => f.name)
      .sort();
  }

  return {
    getUsers,
    saveUsers,
    getReport,
    saveReport,
    deleteReport,
    listUserReports,
    listAllUsers,
    getFile,
    putFile,
  };
})();
