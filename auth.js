// =============================================
// 认证模块：登录 / 注册 / 权限
// 密码使用 SHA-256 哈希（不明文存储）
// =============================================

const Auth = (() => {

  // ---- SHA-256 哈希 ----
  async function sha256(str) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ---- 当前登录用户（存 sessionStorage） ----
  function getCurrentUser() {
    try {
      const raw = sessionStorage.getItem('current_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setCurrentUser(user) {
    sessionStorage.setItem('current_user', JSON.stringify(user));
  }

  function logout() {
    sessionStorage.removeItem('current_user');
  }

  function isAdmin(user) {
    return user && user.username === CONFIG.adminUser;
  }

  // ---- 登录 ----
  // 返回 { ok: true, user } 或 { ok: false, msg }
  async function login(username, password) {
    if (!username || !password) {
      return { ok: false, msg: '用户名和密码不能为空' };
    }
    username = username.trim().toLowerCase();

    try {
      const { list } = await Gitee.getUsers();
      const hash = await sha256(password);
      const found = list.find(u => u.username === username && u.password === hash);
      if (!found) return { ok: false, msg: '用户名或密码错误' };

      const user = { username: found.username, nickname: found.nickname || found.username };
      setCurrentUser(user);
      return { ok: true, user };
    } catch (e) {
      // 若 users.json 不存在且用户名是 admin，允许首次初始化
      if (username === CONFIG.adminUser) {
        return { ok: false, msg: '请先完成系统初始化（见下方说明）' };
      }
      return { ok: false, msg: '网络或配置错误：' + e.message };
    }
  }

  // ---- 注册（管理员操作或开放注册） ----
  async function register(username, password, nickname = '') {
    username = username.trim().toLowerCase();

    if (!/^[a-z0-9_]{2,20}$/.test(username)) {
      return { ok: false, msg: '用户名只能包含字母、数字、下划线，2-20位' };
    }
    if (password.length < 6) {
      return { ok: false, msg: '密码不能少于6位' };
    }

    const { list, sha } = await Gitee.getUsers();
    if (list.find(u => u.username === username)) {
      return { ok: false, msg: '用户名已存在' };
    }

    const hash = await sha256(password);
    list.push({
      username,
      password: hash,
      nickname: nickname || username,
      createdAt: new Date().toISOString().slice(0, 10),
    });

    await Gitee.saveUsers(list, sha);
    return { ok: true };
  }

  // ---- 修改密码 ----
  async function changePassword(username, oldPwd, newPwd) {
    if (newPwd.length < 6) return { ok: false, msg: '新密码不能少于6位' };

    const { list, sha } = await Gitee.getUsers();
    const oldHash = await sha256(oldPwd);
    const idx = list.findIndex(u => u.username === username && u.password === oldHash);
    if (idx === -1) return { ok: false, msg: '原密码错误' };

    list[idx].password = await sha256(newPwd);
    await Gitee.saveUsers(list, sha);
    return { ok: true };
  }

  // ---- 管理员重置密码 ----
  async function resetPassword(targetUsername, newPwd) {
    if (newPwd.length < 6) return { ok: false, msg: '新密码不能少于6位' };
    const { list, sha } = await Gitee.getUsers();
    const idx = list.findIndex(u => u.username === targetUsername);
    if (idx === -1) return { ok: false, msg: '用户不存在' };
    list[idx].password = await sha256(newPwd);
    await Gitee.saveUsers(list, sha);
    return { ok: true };
  }

  // ---- 删除用户（管理员） ----
  async function deleteUser(targetUsername) {
    if (targetUsername === CONFIG.adminUser) {
      return { ok: false, msg: '不能删除管理员账号' };
    }
    const { list, sha } = await Gitee.getUsers();
    const newList = list.filter(u => u.username !== targetUsername);
    if (newList.length === list.length) return { ok: false, msg: '用户不存在' };
    await Gitee.saveUsers(newList, sha);
    return { ok: true };
  }

  // ---- 获取所有用户列表（管理员） ----
  async function getAllUsers() {
    const { list } = await Gitee.getUsers();
    return list.map(u => ({ username: u.username, nickname: u.nickname, createdAt: u.createdAt }));
  }

  // ---- 系统初始化：创建管理员账号 ----
  async function initAdmin(password) {
    if (password.length < 6) return { ok: false, msg: '密码不能少于6位' };
    const { list, sha } = await Gitee.getUsers();
    if (list.find(u => u.username === CONFIG.adminUser)) {
      return { ok: false, msg: '管理员账号已存在' };
    }
    const hash = await sha256(password);
    list.push({
      username: CONFIG.adminUser,
      password: hash,
      nickname: '管理员',
      createdAt: new Date().toISOString().slice(0, 10),
    });
    await Gitee.saveUsers(list, sha);
    return { ok: true };
  }

  return {
    login,
    logout,
    register,
    changePassword,
    resetPassword,
    deleteUser,
    getAllUsers,
    initAdmin,
    getCurrentUser,
    setCurrentUser,
    isAdmin,
    sha256,
  };
})();
