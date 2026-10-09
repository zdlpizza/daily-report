// =============================================
// 日报系统主逻辑（多用户版）
// =============================================

const App = (() => {
  // ---- 工具 ----
  const $ = id => document.getElementById(id);

  function getYesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function getWeekDay(dateStr) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[new Date(dateStr + 'T00:00:00').getDay()];
  }

  function showToast(msg, type = 'success', duration = 3000) {
    const el = $('toast');
    el.textContent = msg;
    el.className = `toast ${type} show`;
    setTimeout(() => { el.className = 'toast'; }, duration);
  }

  // ---- 简易 Markdown 渲染 ----
  function renderMarkdown(md) {
    if (!md || !md.trim()) return '<p class="empty-md">暂无内容</p>';
    let html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^[-*] \[x\] (.+)$/gm, '<li class="done">✅ $1</li>')
      .replace(/^[-*] \[ \] (.+)$/gm, '<li class="todo">⬜ $1</li>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/^---+$/gm, '<hr>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, match => `<ul>${match}</ul>`);
    return `<p>${html}</p>`;
  }

  // =============================================
  // 登录页逻辑
  // =============================================
  const LoginPage = (() => {
    let mode = 'login'; // 'login' | 'init'

    async function checkInit() {
      // 检查是否需要初始化（users.json 不存在或无 admin）
      try {
        const { list } = await Gitee.getUsers();
        const hasAdmin = list.find(u => u.username === CONFIG.adminUser);
        if (!hasAdmin) {
          showInitForm();
        }
      } catch (e) {
        showInitForm();
      }
    }

    function showInitForm() {
      mode = 'init';
      $('loginTitle').textContent = '🔧 系统初始化';
      $('loginSubtitle').textContent = '首次使用，请设置管理员密码';
      $('loginBtn').textContent = '初始化系统';
      $('initHint').style.display = 'block';
    }

    async function submit() {
      const username = ($('loginUser').value || '').trim().toLowerCase();
      const password = ($('loginPass').value || '').trim();
      const btn = $('loginBtn');

      btn.disabled = true;
      btn.textContent = '请稍候...';

      try {
        if (mode === 'init') {
          // 初始化：创建 admin
          const result = await Auth.initAdmin(password);
          if (!result.ok) { showToast(result.msg, 'error'); return; }
          showToast('管理员账号创建成功，请登录');
          mode = 'login';
          $('loginTitle').textContent = '登录日报系统';
          $('loginSubtitle').textContent = '请输入账号和密码';
          $('loginBtn').textContent = '登录';
          $('initHint').style.display = 'none';
          $('loginUser').value = CONFIG.adminUser;
          $('loginPass').value = '';
          return;
        }

        // 正常登录
        const result = await Auth.login(username, password);
        if (!result.ok) { showToast(result.msg, 'error'); return; }
        showToast(`欢迎回来，${result.user.nickname}`, 'success', 1500);
        setTimeout(() => MainPage.show(result.user), 800);

      } catch (e) {
        showToast('操作失败：' + e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = mode === 'init' ? '初始化系统' : '登录';
      }
    }

    function show() {
      $('loginPage').style.display = 'flex';
      $('mainPage').style.display = 'none';
      $('loginUser').value = '';
      $('loginPass').value = '';
      checkInit();
    }

    // 绑定事件
    function bind() {
      $('loginBtn').addEventListener('click', submit);
      $('loginPass').addEventListener('keydown', e => {
        if (e.key === 'Enter') submit();
      });
      $('loginUser').addEventListener('keydown', e => {
        if (e.key === 'Enter') $('loginPass').focus();
      });
    }

    return { show, bind };
  })();

  // =============================================
  // 主页面逻辑（普通用户）
  // =============================================
  const MainPage = (() => {
    let state = {
      user: null,
      currentDate: getYesterdayStr(),
      currentSha: null,
      historyList: [],
      isDirty: false,
      activeTab: 'edit',
    };

    function setLoading(flag, label = '保存中...') {
      const btn = $('saveBtn');
      btn.disabled = flag;
      btn.innerHTML = flag ? `<span class="spinner"></span>${label}` : '💾 保存日报';
    }

    function updateWordCount() {
      const text = $('editor').value;
      $('wordCount').textContent = `${text.length} 字 · ${text.split('\n').filter(l => l.trim()).length} 行`;
    }

    function switchTab(tab) {
      state.activeTab = tab;
      document.querySelectorAll('.tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab));
      if (tab === 'preview') {
        $('preview').innerHTML = renderMarkdown($('editor').value);
        $('preview').style.display = 'block';
        $('editor').style.display = 'none';
      } else {
        $('preview').style.display = 'none';
        $('editor').style.display = 'block';
        $('editor').focus();
      }
    }

    async function loadReport(date) {
      state.currentDate = date;
      state.currentSha = null;
      state.isDirty = false;
      $('datePicker').value = date;
      $('editor').value = '';
      updateWordCount();

      // 高亮历史列表
      document.querySelectorAll('.history-item').forEach(el =>
        el.classList.toggle('active', el.dataset.date === date));

      $('editor').placeholder = '⏳ 加载中...';
      try {
        const result = await Gitee.getReport(state.user.username, date);
        if (result) {
          $('editor').value = result.content;
          state.currentSha = result.sha;
        } else {
          $('editor').value = getTemplate(date);
          showToast(`${date} 暂无日报，已填入模板`, 'info', 2000);
        }
      } catch (e) {
        showToast('加载失败：' + e.message, 'error');
      } finally {
        $('editor').placeholder = '在这里写日报，支持 Markdown 语法...';
        updateWordCount();
        if (state.activeTab === 'preview') {
          $('preview').innerHTML = renderMarkdown($('editor').value);
        }
      }
    }

    async function saveReport() {
      if (!$('editor').value.trim()) { showToast('内容不能为空', 'error'); return; }
      setLoading(true);
      try {
        await Gitee.saveReport(state.user.username, state.currentDate, $('editor').value, state.currentSha);
        showToast('保存成功 ✅');
        state.isDirty = false;
        if (!state.historyList.includes(state.currentDate)) {
          state.historyList.unshift(state.currentDate);
          renderHistory();
        }
        // 刷新 sha
        const r = await Gitee.getReport(state.user.username, state.currentDate);
        if (r) state.currentSha = r.sha;
      } catch (e) {
        showToast('保存失败：' + e.message, 'error');
      } finally {
        setLoading(false);
      }
    }

    async function deleteReport(date, sha) {
      if (!confirm(`确认删除 ${date} 的日报？`)) return;
      try {
        await Gitee.deleteReport(state.user.username, date, sha);
        showToast('已删除');
        state.historyList = state.historyList.filter(d => d !== date);
        renderHistory();
        if (state.currentDate === date) loadReport(getYesterdayStr());
      } catch (e) {
        showToast('删除失败：' + e.message, 'error');
      }
    }

    function renderHistory() {
      const el = $('historyList');
      if (!state.historyList.length) {
        el.innerHTML = '<div class="empty-tip">暂无日报记录</div>';
        return;
      }
      el.innerHTML = state.historyList.map(date => `
        <div class="history-item ${date === state.currentDate ? 'active' : ''}"
             data-date="${date}" onclick="App.clickHistory('${date}')">
          <div>
            <div class="history-item-date">📄 ${date}</div>
            <div class="history-item-week">${getWeekDay(date)}</div>
          </div>
          <span class="history-item-del" title="删除"
                onclick="App.clickDelete(event,'${date}')">🗑</span>
        </div>`).join('');
    }

    function insertTemplate(type) {
      const tpls = {
        today: '## 今日工作\n- \n',
        plan:  '## 明日计划\n- \n',
        issue: '## 遇到的问题\n- \n',
        done:  '## 完成清单\n- [ ] \n',
      };
      const text = tpls[type] || '';
      const ed = $('editor');
      const pos = ed.selectionStart;
      const sep = ed.value.slice(0, pos).endsWith('\n') || pos === 0 ? '' : '\n';
      ed.value = ed.value.slice(0, pos) + sep + text + ed.value.slice(pos);
      ed.focus();
      ed.selectionStart = ed.selectionEnd = pos + sep.length + text.length;
      updateWordCount();
      state.isDirty = true;
    }

    function getTemplate(date) {
      return `# 日报 ${date}\n\n## 今日工作\n- \n\n## 明日计划\n- \n\n## 遇到的问题\n- 无\n\n## 其他备注\n- \n`;
    }

    async function show(user) {
      state.user = user;
      state.currentDate = getYesterdayStr();
      state.isDirty = false;

      $('loginPage').style.display = 'none';
      $('mainPage').style.display = 'block';
      $('adminPanel').style.display = 'none';

      // 填充用户信息
      $('navUser').textContent = user.nickname;
      $('navDate').textContent = getTodayStr() + ' ' + getWeekDay(getTodayStr());
      $('appTitle').textContent = CONFIG.appTitle;
      document.title = CONFIG.appTitle;

      // 显示管理员入口
      $('adminTabBtn').style.display = Auth.isAdmin(user) ? 'inline-flex' : 'none';

      // 设置日期选择器
      $('datePicker').value = state.currentDate;
      $('datePicker').max = getTodayStr();

      // 加载历史
      $('historyList').innerHTML = '<div class="loading"><span class="spinner"></span>加载中...</div>';
      state.historyList = await Gitee.listUserReports(user.username).catch(() => []);
      renderHistory();

      // 加载昨日日报
      await loadReport(state.currentDate);
    }

    function bind() {
      // 日期选择
      $('datePicker').addEventListener('change', () => {
        if (state.isDirty && !confirm('有未保存的修改，确认切换？')) {
          $('datePicker').value = state.currentDate;
          return;
        }
        loadReport($('datePicker').value);
      });

      // 编辑器
      $('editor').addEventListener('input', () => {
        state.isDirty = true;
        updateWordCount();
      });

      // Tab 切换
      document.querySelectorAll('.tab-btn').forEach(b =>
        b.addEventListener('click', () => switchTab(b.dataset.tab)));

      // 快捷模板
      document.querySelectorAll('.tpl-btn').forEach(b =>
        b.addEventListener('click', () => insertTemplate(b.dataset.tpl)));

      // 保存
      $('saveBtn').addEventListener('click', saveReport);

      // 清空
      $('clearBtn').addEventListener('click', () => {
        if ($('editor').value && confirm('确认清空当前内容？')) {
          $('editor').value = '';
          state.isDirty = true;
          updateWordCount();
        }
      });

      // 模板填入
      $('tplBtn').addEventListener('click', () => {
        if ($('editor').value && !confirm('将覆盖当前内容，确认？')) return;
        $('editor').value = getTemplate(state.currentDate);
        state.isDirty = true;
        updateWordCount();
      });

      // 刷新历史
      $('refreshBtn').addEventListener('click', async () => {
        $('historyList').innerHTML = '<div class="loading"><span class="spinner"></span>刷新中...</div>';
        state.historyList = await Gitee.listUserReports(state.user.username).catch(() => []);
        renderHistory();
        showToast('列表已刷新', 'info', 1500);
      });

      // 管理员面板入口
      $('adminTabBtn').addEventListener('click', () => AdminPanel.show(state.user));

      // 修改密码
      $('changePwdBtn').addEventListener('click', () => ChangePwd.show(state.user));

      // 退出登录
      $('logoutBtn').addEventListener('click', () => {
        if (state.isDirty && !confirm('有未保存的修改，确认退出？')) return;
        Auth.logout();
        LoginPage.show();
      });

      // Ctrl+S
      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          if ($('mainPage').style.display !== 'none' &&
              $('adminPanel').style.display === 'none') {
            saveReport();
          }
        }
      });

      // 离开提醒
      window.addEventListener('beforeunload', e => {
        if (state.isDirty) { e.preventDefault(); e.returnValue = ''; }
      });
    }

    // 供外部调用
    function clickHistory(date) {
      if (state.isDirty && !confirm('有未保存的修改，确认切换？')) return;
      loadReport(date);
    }

    async function clickDelete(event, date) {
      event.stopPropagation();
      try {
        const r = await Gitee.getReport(state.user.username, date);
        if (r) await deleteReport(date, r.sha);
        else showToast('文件不存在', 'error');
      } catch (e) {
        showToast('操作失败：' + e.message, 'error');
      }
    }

    return { show, bind, clickHistory, clickDelete };
  })();

  // =============================================
  // 管理员面板
  // =============================================
  const AdminPanel = (() => {
    let adminUser = null;
    let allUsers = [];
    let viewingUser = null;
    let viewingDate = null;
    let viewingReports = [];

    async function show(user) {
      adminUser = user;
      $('adminPanel').style.display = 'block';
      $('editorSection').style.display = 'none';
      $('adminBackBtn').style.display = 'inline-flex';

      // 加载所有注册用户
      $('adminUserList').innerHTML = '<div class="loading"><span class="spinner"></span>加载用户列表...</div>';
      try {
        allUsers = await Auth.getAllUsers();
        renderUserList();
      } catch (e) {
        $('adminUserList').innerHTML = `<div class="empty-tip">加载失败：${e.message}</div>`;
      }
    }

    function renderUserList() {
      if (!allUsers.length) {
        $('adminUserList').innerHTML = '<div class="empty-tip">暂无注册用户</div>';
        return;
      }
      $('adminUserList').innerHTML = allUsers.map(u => `
        <div class="admin-user-card" onclick="App.adminViewUser('${u.username}','${u.nickname}')">
          <div class="auc-avatar">${(u.nickname||u.username)[0].toUpperCase()}</div>
          <div class="auc-info">
            <div class="auc-name">${u.nickname || u.username}</div>
            <div class="auc-meta">@${u.username} · 注册于 ${u.createdAt || '未知'}</div>
          </div>
          <div class="auc-actions">
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();App.adminResetPwd('${u.username}')">重置密码</button>
            ${u.username !== CONFIG.adminUser
              ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();App.adminDelUser('${u.username}')">删除</button>`
              : ''}
          </div>
        </div>`).join('');
    }

    async function viewUser(username, nickname) {
      viewingUser = username;
      $('adminViewTitle').textContent = `👤 ${nickname}（@${username}）的日报`;
      $('adminViewPanel').style.display = 'block';
      $('adminReportList').innerHTML = '<div class="loading"><span class="spinner"></span>加载中...</div>';
      $('adminReportContent').innerHTML = '';

      try {
        viewingReports = await Gitee.listUserReports(username);
        if (!viewingReports.length) {
          $('adminReportList').innerHTML = '<div class="empty-tip">该用户暂无日报</div>';
          return;
        }
        // 默认加载昨天或最近一条
        const defaultDate = viewingReports.includes(getYesterdayStr())
          ? getYesterdayStr()
          : viewingReports[0];

        renderAdminReportList(defaultDate);
        await loadAdminReport(defaultDate);
      } catch (e) {
        $('adminReportList').innerHTML = `<div class="empty-tip">加载失败：${e.message}</div>`;
      }
    }

    function renderAdminReportList(activeDate) {
      $('adminReportList').innerHTML = viewingReports.map(d => `
        <div class="history-item ${d === activeDate ? 'active' : ''}"
             data-date="${d}" onclick="App.adminLoadReport('${d}')">
          <div>
            <div class="history-item-date">📄 ${d}</div>
            <div class="history-item-week">${getWeekDay(d)}</div>
          </div>
        </div>`).join('');
    }

    async function loadAdminReport(date) {
      viewingDate = date;
      // 高亮
      document.querySelectorAll('#adminReportList .history-item').forEach(el =>
        el.classList.toggle('active', el.dataset.date === date));

      $('adminReportContent').innerHTML = '<div class="loading"><span class="spinner"></span>加载中...</div>';
      try {
        const r = await Gitee.getReport(viewingUser, date);
        $('adminReportContent').innerHTML = r
          ? `<div class="report-preview">${renderMarkdown(r.content)}</div>`
          : '<div class="empty-tip">该日期暂无日报</div>';
      } catch (e) {
        $('adminReportContent').innerHTML = `<div class="empty-tip">加载失败：${e.message}</div>`;
      }
    }

    async function resetPwd(username) {
      const newPwd = prompt(`重置 @${username} 的密码，请输入新密码（至少6位）：`);
      if (!newPwd) return;
      try {
        const r = await Auth.resetPassword(username, newPwd);
        if (r.ok) showToast('密码已重置');
        else showToast(r.msg, 'error');
      } catch (e) {
        showToast('操作失败：' + e.message, 'error');
      }
    }

    async function delUser(username) {
      if (!confirm(`确认删除用户 @${username}？此操作不可恢复。`)) return;
      try {
        const r = await Auth.deleteUser(username);
        if (r.ok) {
          showToast('用户已删除');
          allUsers = allUsers.filter(u => u.username !== username);
          renderUserList();
          if (viewingUser === username) {
            $('adminViewPanel').style.display = 'none';
          }
        } else {
          showToast(r.msg, 'error');
        }
      } catch (e) {
        showToast('操作失败：' + e.message, 'error');
      }
    }

    function hide() {
      $('adminPanel').style.display = 'none';
      $('editorSection').style.display = 'block';
      $('adminBackBtn').style.display = 'none';
    }

    function bind() {
      $('adminBackBtn').addEventListener('click', hide);

      // 注册新用户按钮
      $('addUserBtn').addEventListener('click', () => RegisterModal.show());

      // 刷新用户列表
      $('refreshUsersBtn').addEventListener('click', async () => {
        $('adminUserList').innerHTML = '<div class="loading"><span class="spinner"></span>刷新中...</div>';
        allUsers = await Auth.getAllUsers().catch(() => []);
        renderUserList();
        showToast('已刷新', 'info', 1500);
      });
    }

    return { show, hide, viewUser, loadAdminReport, renderAdminReportList, resetPwd, delUser, bind };
  })();

  // =============================================
  // 注册新用户弹窗（管理员操作）
  // =============================================
  const RegisterModal = (() => {
    function show() {
      $('registerOverlay').classList.add('show');
      $('regUsername').value = '';
      $('regNickname').value = '';
      $('regPassword').value = '';
    }
    function hide() {
      $('registerOverlay').classList.remove('show');
    }
    async function submit() {
      const username = $('regUsername').value.trim().toLowerCase();
      const nickname = $('regNickname').value.trim();
      const password = $('regPassword').value.trim();
      try {
        const r = await Auth.register(username, password, nickname);
        if (!r.ok) { showToast(r.msg, 'error'); return; }
        showToast(`用户 @${username} 注册成功`);
        hide();
        // 刷新用户列表
        const allUsers = await Auth.getAllUsers().catch(() => []);
        $('adminUserList').innerHTML = '';
        AdminPanel.show(Auth.getCurrentUser());
      } catch (e) {
        showToast('注册失败：' + e.message, 'error');
      }
    }
    function bind() {
      $('closeRegister').addEventListener('click', hide);
      $('submitRegister').addEventListener('click', submit);
      $('registerOverlay').addEventListener('click', e => {
        if (e.target === $('registerOverlay')) hide();
      });
    }
    return { show, hide, bind };
  })();

  // =============================================
  // 修改密码弹窗
  // =============================================
  const ChangePwd = (() => {
    let currentUser = null;
    function show(user) {
      currentUser = user;
      $('cpOldPwd').value = '';
      $('cpNewPwd').value = '';
      $('cpConfirmPwd').value = '';
      $('changePwdOverlay').classList.add('show');
    }
    function hide() {
      $('changePwdOverlay').classList.remove('show');
    }
    async function submit() {
      const oldPwd = $('cpOldPwd').value;
      const newPwd = $('cpNewPwd').value;
      const confirmPwd = $('cpConfirmPwd').value;
      if (newPwd !== confirmPwd) { showToast('两次密码不一致', 'error'); return; }
      try {
        const r = await Auth.changePassword(currentUser.username, oldPwd, newPwd);
        if (!r.ok) { showToast(r.msg, 'error'); return; }
        showToast('密码修改成功');
        hide();
      } catch (e) {
        showToast('操作失败：' + e.message, 'error');
      }
    }
    function bind() {
      $('closeChangePwd').addEventListener('click', hide);
      $('submitChangePwd').addEventListener('click', submit);
      $('changePwdOverlay').addEventListener('click', e => {
        if (e.target === $('changePwdOverlay')) hide();
      });
    }
    return { show, hide, bind };
  })();

  // =============================================
  // 设置面板（Gitee Token 配置）
  // =============================================
  const Settings = (() => {
    function open() {
      $('settingsOwner').value = localStorage.getItem('gitee_owner') || CONFIG.owner;
      $('settingsRepo').value  = localStorage.getItem('gitee_repo')  || CONFIG.repo;
      $('settingsDir').value   = localStorage.getItem('gitee_dir')   !== null
        ? localStorage.getItem('gitee_dir') : CONFIG.reportDir;
      $('settingsToken').value = localStorage.getItem('gitee_token') || '';
      $('settingsOverlay').classList.add('show');
    }
    function close() {
      $('settingsOverlay').classList.remove('show');
    }
    function save() {
      const owner = $('settingsOwner').value.trim();
      const repo  = $('settingsRepo').value.trim();
      const dir   = $('settingsDir').value.trim();
      const token = $('settingsToken').value.trim();
      if (!owner || !repo || !token) {
        showToast('用户名、仓库名和 Token 不能为空', 'error');
        return;
      }
      localStorage.setItem('gitee_owner', owner);
      localStorage.setItem('gitee_repo',  repo);
      localStorage.setItem('gitee_dir',   dir);
      localStorage.setItem('gitee_token', token);
      CONFIG.owner     = owner;
      CONFIG.repo      = repo;
      CONFIG.reportDir = dir;
      CONFIG.token     = token;
      close();
      showToast('配置已保存，请重新登录');
      Auth.logout();
      LoginPage.show();
    }
    function bind() {
      $('settingsBtn').addEventListener('click', open);
      $('closeSettings').addEventListener('click', close);
      $('saveSettings').addEventListener('click', save);
      $('settingsOverlay').addEventListener('click', e => {
        if (e.target === $('settingsOverlay')) close();
      });
    }
    // 从 localStorage 加载配置
    function loadFromStorage() {
      const owner = localStorage.getItem('gitee_owner');
      const repo  = localStorage.getItem('gitee_repo');
      const dir   = localStorage.getItem('gitee_dir');
      const token = localStorage.getItem('gitee_token');
      if (owner) CONFIG.owner     = owner;
      if (repo)  CONFIG.repo      = repo;
      if (dir !== null) CONFIG.reportDir = dir;
      if (token) CONFIG.token     = token;
    }
    return { open, close, save, bind, loadFromStorage };
  })();

  // =============================================
  // 初始化入口
  // =============================================
  function init() {
    Settings.loadFromStorage();

    document.title = CONFIG.appTitle;

    // 绑定所有事件
    LoginPage.bind();
    MainPage.bind();
    AdminPanel.bind();
    RegisterModal.bind();
    ChangePwd.bind();
    Settings.bind();

    // 检查是否已登录（页面刷新恢复）
    const user = Auth.getCurrentUser();
    if (user && CONFIG.token && CONFIG.token !== 'YOUR_GITEE_TOKEN') {
      MainPage.show(user);
    } else {
      // 未配置 token 时先跳到配置
      if (!CONFIG.token || CONFIG.token === 'YOUR_GITEE_TOKEN') {
        Settings.open();
        showToast('请先完成 Gitee 配置', 'info', 5000);
      } else {
        LoginPage.show();
      }
    }
  }

  // =============================================
  // 对外暴露（供 HTML onclick 调用）
  // =============================================
  return {
    init,
    clickHistory:    (...args) => MainPage.clickHistory(...args),
    clickDelete:     (...args) => MainPage.clickDelete(...args),
    adminViewUser:   (...args) => AdminPanel.viewUser(...args),
    adminLoadReport: (...args) => AdminPanel.loadAdminReport(...args),
    adminResetPwd:   (...args) => AdminPanel.resetPwd(...args),
    adminDelUser:    (...args) => AdminPanel.delUser(...args),
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
