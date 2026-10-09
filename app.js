// =============================================
// 日报系统主逻辑（多用户 · 块状编辑器版）
// =============================================

const App = (() => {
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
    const days = ['周日','周一','周二','周三','周四','周五','周六'];
    return days[new Date(dateStr + 'T00:00:00').getDay()];
  }
  function showToast(msg, type = 'success', duration = 3000) {
    const el = $('toast');
    el.textContent = msg;
    el.className = `toast ${type} show`;
    setTimeout(() => { el.className = 'toast'; }, duration);
  }

  // =============================================
  // 块状编辑器模块
  // 四个区块：today / plan / issue / done
  // 每块是 <ol> 列表，每条是 <li contenteditable>
  // 回车 → 新增下一条；空行回车 → 删除该条
  // =============================================
  const BlockEditor = (() => {
    const BLOCKS = [
      { id: 'today', title: '今日工作' },
      { id: 'done',  title: '完成清单' },
      { id: 'issue', title: '遇到的问题' },
      { id: 'plan',  title: '明日计划' },
    ];

    let onChangeCallback = null;

    // 创建一个 <li>
    function createLi(text = '') {
      const li = document.createElement('li');
      li.contentEditable = 'true';
      li.className = 'block-item';
      li.textContent = text;
      li.addEventListener('keydown', handleKeydown);
      li.addEventListener('input', () => { if (onChangeCallback) onChangeCallback(); });
      return li;
    }

    // 键盘事件：Enter 新增，Backspace 空行删除
    function handleKeydown(e) {
      const li = e.currentTarget;
      const ol = li.parentElement;

      if (e.key === 'Enter') {
        e.preventDefault();
        const text = li.textContent;

        // 如果当前行为空，不新增（防止连续空行）
        if (!text.trim()) return;

        const newLi = createLi('');
        const next = li.nextSibling;
        if (next) ol.insertBefore(newLi, next);
        else ol.appendChild(newLi);
        newLi.focus();
        // 光标到行首
        const range = document.createRange();
        range.setStart(newLi, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (onChangeCallback) onChangeCallback();
      }

      if (e.key === 'Backspace') {
        const text = li.textContent;
        if (text === '') {
          e.preventDefault();
          const items = ol.querySelectorAll('li');
          if (items.length <= 1) return; // 保留最后一行
          const prev = li.previousSibling;
          li.remove();
          if (prev) {
            prev.focus();
            // 光标到末尾
            const range = document.createRange();
            range.selectNodeContents(prev);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
          if (onChangeCallback) onChangeCallback();
        }
      }
    }

    // 初始化每个区块，确保至少有一条空行
    function initBlock(blockId) {
      const ol = $(`block-${blockId}`);
      ol.innerHTML = '';
      const li = createLi('');
      ol.appendChild(li);
    }

    // 初始化所有区块
    function init(onChange) {
      onChangeCallback = onChange;
      BLOCKS.forEach(b => initBlock(b.id));
    }

    // 读取某区块的所有条目文本（过滤空行）
    function getBlockItems(blockId) {
      const ol = $(`block-${blockId}`);
      return Array.from(ol.querySelectorAll('li'))
        .map(li => li.textContent.trim())
        .filter(t => t.length > 0);
    }

    // 将编辑器内容序列化为 Markdown
    function toMarkdown(date) {
      const titles = {
        today: '今日工作',
        done:  '完成清单',
        issue: '遇到的问题',
        plan:  '明日计划',
      };
      let md = `# 日报 ${date}\n`;
      BLOCKS.forEach(b => {
        const items = getBlockItems(b.id);
        md += `\n## ${titles[b.id]}\n`;
        if (items.length === 0) {
          md += '- 无\n';
        } else {
          items.forEach((item, i) => {
            md += `${i + 1}. ${item}\n`;
          });
        }
      });
      return md;
    }

    // 从 Markdown 解析内容填入编辑器
    function fromMarkdown(md) {
      BLOCKS.forEach(b => initBlock(b.id));
      if (!md) return;

      const sectionMap = {
        '今日工作': 'today',
        '明日计划': 'plan',
        '遇到的问题': 'issue',
        '完成清单': 'done',
      };

      let currentBlock = null;
      const lines = md.split('\n');

      lines.forEach(line => {
        const h2 = line.match(/^##\s+(.+)$/);
        if (h2) {
          currentBlock = sectionMap[h2[1].trim()] || null;
          return;
        }
        if (!currentBlock) return;

        // 只解析有序列表 "1. xxx" 或无序列表 "- xxx" / "* xxx"
        const ordered   = line.match(/^\d+\.\s+(.+)$/);
        const unordered = line.match(/^[-*]\s+(.+)$/);
        const text = ordered ? ordered[1].trim() : (unordered ? unordered[1].trim() : null);

        if (text && text !== '无') {
          const ol = $(`block-${currentBlock}`);
          const items = ol.querySelectorAll('li');
          if (items.length === 1 && items[0].textContent === '') {
            items[0].textContent = text;
          } else {
            ol.appendChild(createLi(text));
          }
        }
      });
    }

    // 清空所有区块
    function clear() {
      BLOCKS.forEach(b => initBlock(b.id));
    }

    // 检查是否有内容
    function hasContent() {
      return BLOCKS.some(b => getBlockItems(b.id).length > 0);
    }

    // 更新底部字数统计
    function updateCount() {
      const total = BLOCKS.reduce((sum, b) => sum + getBlockItems(b.id).length, 0);
      $('wordCount').textContent = `${total} 条记录`;
    }

    return { init, toMarkdown, fromMarkdown, clear, hasContent, updateCount };
  })();

  // =============================================
  // 登录页逻辑
  // =============================================
  const LoginPage = (() => {
    let mode = 'login';

    async function checkInit() {
      try {
        const { list } = await Gitee.getUsers();
        const hasAdmin = list.find(u => u.username === CONFIG.adminUser);
        if (!hasAdmin) showInitForm();
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

    function bind() {
      $('loginBtn').addEventListener('click', submit);
      $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      $('loginUser').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginPass').focus(); });
    }

    return { show, bind };
  })();

  // =============================================
  // 主页面逻辑
  // =============================================
  const MainPage = (() => {
    let state = {
      user: null,
      currentDate: getYesterdayStr(),
      currentSha: null,
      historyList: [],
      isDirty: false,
    };

    function setLoading(flag) {
      const btn = $('saveBtn');
      btn.disabled = flag;
      btn.innerHTML = flag ? '<span class="spinner"></span>保存中...' : '💾 保存日报';
    }

    async function loadReport(date) {
      state.currentDate = date;
      state.currentSha = null;
      state.isDirty = false;
      $('datePicker').value = date;

      document.querySelectorAll('.history-item').forEach(el =>
        el.classList.toggle('active', el.dataset.date === date));

      // 显示加载遮罩
      $('blocksEditor').style.opacity = '0.5';
      $('blocksEditor').style.pointerEvents = 'none';

      try {
        const result = await Gitee.getReport(state.user.username, date);
        if (result) {
          BlockEditor.fromMarkdown(result.content);
          state.currentSha = result.sha;
        } else {
          BlockEditor.clear();
        }
      } catch (e) {
        showToast('加载失败：' + e.message, 'error');
        BlockEditor.clear();
      } finally {
        $('blocksEditor').style.opacity = '';
        $('blocksEditor').style.pointerEvents = '';
        BlockEditor.updateCount();
        state.isDirty = false;
      }
    }

    async function saveReport() {
      if (!BlockEditor.hasContent()) {
        showToast('请至少填写一条内容', 'error');
        return;
      }
      setLoading(true);
      try {
        const md = BlockEditor.toMarkdown(state.currentDate);
        await Gitee.saveReport(state.user.username, state.currentDate, md, state.currentSha);
        showToast('保存成功 ✅');
        state.isDirty = false;
        if (!state.historyList.includes(state.currentDate)) {
          state.historyList.unshift(state.currentDate);
          renderHistory();
        }
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

    async function show(user) {
      state.user = user;
      state.currentDate = getYesterdayStr();
      state.isDirty = false;

      $('loginPage').style.display = 'none';
      $('mainPage').style.display = 'block';
      $('adminPanel').style.display = 'none';
      $('editorSection').style.display = 'block';
      $('adminBackBtn').style.display = 'none';

      $('navUser').textContent = user.nickname;
      $('navUserAvatar').textContent = (user.nickname || user.username)[0].toUpperCase();
      $('navDate').textContent = getTodayStr() + ' ' + getWeekDay(getTodayStr());
      $('appTitle').textContent = CONFIG.appTitle;
      document.title = CONFIG.appTitle;

      $('adminTabBtn').style.display = Auth.isAdmin(user) ? 'inline-flex' : 'none';
      $('datePicker').value = state.currentDate;
      $('datePicker').max = getTodayStr();

      // 初始化块编辑器
      BlockEditor.init(() => {
        state.isDirty = true;
        BlockEditor.updateCount();
      });

      $('historyList').innerHTML = '<div class="loading"><span class="spinner"></span>加载中...</div>';
      state.historyList = await Gitee.listUserReports(user.username).catch(() => []);
      renderHistory();

      await loadReport(state.currentDate);
    }

    function bind() {
      $('datePicker').addEventListener('change', () => {
        if (state.isDirty && !confirm('有未保存的修改，确认切换？')) {
          $('datePicker').value = state.currentDate;
          return;
        }
        loadReport($('datePicker').value);
      });

      $('saveBtn').addEventListener('click', saveReport);

      $('clearBtn').addEventListener('click', () => {
        if (BlockEditor.hasContent() && confirm('确认清空所有内容？')) {
          BlockEditor.clear();
          state.isDirty = true;
          BlockEditor.updateCount();
        }
      });

      $('refreshBtn').addEventListener('click', async () => {
        $('historyList').innerHTML = '<div class="loading"><span class="spinner"></span>刷新中...</div>';
        state.historyList = await Gitee.listUserReports(state.user.username).catch(() => []);
        renderHistory();
        showToast('已刷新', 'info', 1500);
      });

      $('adminTabBtn').addEventListener('click', () => AdminPanel.show(state.user));
      $('changePwdBtn').addEventListener('click', () => ChangePwd.show(state.user));

      $('logoutBtn').addEventListener('click', () => {
        if (state.isDirty && !confirm('有未保存的修改，确认退出？')) return;
        Auth.logout();
        LoginPage.show();
      });

      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          if ($('mainPage').style.display !== 'none' &&
              $('adminPanel').style.display === 'none') {
            saveReport();
          }
        }
      });

      window.addEventListener('beforeunload', e => {
        if (state.isDirty) { e.preventDefault(); e.returnValue = ''; }
      });
    }

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
  // 管理员面板（查看日报用 Markdown 渲染）
  // =============================================
  function renderMarkdown(md) {
    if (!md || !md.trim()) return '<p style="color:#ccc">暂无内容</p>';
    let html = md
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/^### (.+)$/gm,'<h3>$1</h3>')
      .replace(/^## (.+)$/gm,'<h2>$1</h2>')
      .replace(/^# (.+)$/gm,'<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`(.+?)`/g,'<code>$1</code>')
      .replace(/^\d+\.\s+(.+)$/gm,'<li>$1</li>')
      .replace(/^[-*]\s+(.+)$/gm,'<li>$1</li>')
      .replace(/^---+$/gm,'<hr>')
      .replace(/\n\n/g,'</p><p>')
      .replace(/\n/g,'<br>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, m => `<ol>${m}</ol>`);
    return `<p>${html}</p>`;
  }

  const AdminPanel = (() => {
    let adminUser = null;
    let allUsers = [];
    let viewingUser = null;
    let viewingReports = [];

    async function show(user) {
      adminUser = user;
      $('adminPanel').style.display = 'block';
      $('editorSection').style.display = 'none';
      $('adminBackBtn').style.display = 'inline-flex';
      $('adminUserList').innerHTML = '<div class="loading"><span class="spinner"></span>加载用户列表...</div>';
      try {
        allUsers = await Auth.getAllUsers();
        renderUserList();
      } catch (e) {
        $('adminUserList').innerHTML = `<div class="empty-tip">加载失败：${e.message}</div>`;
      }
    }

    function renderUserList() {
      if (!allUsers.length) { $('adminUserList').innerHTML = '<div class="empty-tip">暂无注册用户</div>'; return; }
      $('adminUserList').innerHTML = allUsers.map(u => `
        <div class="admin-user-card" onclick="App.adminViewUser('${u.username}','${u.nickname||u.username}')">
          <div class="auc-avatar">${(u.nickname||u.username)[0].toUpperCase()}</div>
          <div class="auc-info">
            <div class="auc-name">${u.nickname||u.username}</div>
            <div class="auc-meta">@${u.username} · ${u.createdAt||'未知'}</div>
          </div>
          <div class="auc-actions">
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();App.adminResetPwd('${u.username}')">重置密码</button>
            ${u.username !== CONFIG.adminUser
              ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();App.adminDelUser('${u.username}')">删除</button>` : ''}
          </div>
        </div>`).join('');
    }

    async function viewUser(username, nickname) {
      viewingUser = username;
      $('adminViewTitle').textContent = `👤 ${nickname}（@${username}）的日报`;
      $('adminViewPanel').style.display = 'block';
      $('adminViewEmpty').style.display = 'none';
      $('adminReportList').innerHTML = '<div class="loading"><span class="spinner"></span>加载中...</div>';
      $('adminReportContent').innerHTML = '';
      try {
        viewingReports = await Gitee.listUserReports(username);
        if (!viewingReports.length) { $('adminReportList').innerHTML = '<div class="empty-tip">暂无日报</div>'; return; }
        const defaultDate = viewingReports.includes(getYesterdayStr()) ? getYesterdayStr() : viewingReports[0];
        renderAdminReportList(defaultDate);
        await loadAdminReport(defaultDate);
      } catch (e) {
        $('adminReportList').innerHTML = `<div class="empty-tip">加载失败：${e.message}</div>`;
      }
    }

    function renderAdminReportList(activeDate) {
      $('adminReportList').innerHTML = viewingReports.map(d => `
        <div class="history-item ${d===activeDate?'active':''}" data-date="${d}"
             onclick="App.adminLoadReport('${d}')">
          <div>
            <div class="history-item-date">📄 ${d}</div>
            <div class="history-item-week">${getWeekDay(d)}</div>
          </div>
        </div>`).join('');
    }

    async function loadAdminReport(date) {
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
        if (r.ok) showToast('密码已重置'); else showToast(r.msg, 'error');
      } catch (e) { showToast('操作失败：' + e.message, 'error'); }
    }

    async function delUser(username) {
      if (!confirm(`确认删除用户 @${username}？`)) return;
      try {
        const r = await Auth.deleteUser(username);
        if (r.ok) {
          showToast('用户已删除');
          allUsers = allUsers.filter(u => u.username !== username);
          renderUserList();
          if (viewingUser === username) { $('adminViewPanel').style.display = 'none'; $('adminViewEmpty').style.display = 'flex'; }
        } else showToast(r.msg, 'error');
      } catch (e) { showToast('操作失败：' + e.message, 'error'); }
    }

    function hide() {
      $('adminPanel').style.display = 'none';
      $('editorSection').style.display = 'block';
      $('adminBackBtn').style.display = 'none';
    }

    function bind() {
      $('adminBackBtn').addEventListener('click', hide);
      $('addUserBtn').addEventListener('click', () => RegisterModal.show());
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
  // 注册弹窗
  // =============================================
  const RegisterModal = (() => {
    function show() {
      $('registerOverlay').classList.add('show');
      $('regUsername').value = ''; $('regNickname').value = ''; $('regPassword').value = '';
    }
    function hide() { $('registerOverlay').classList.remove('show'); }
    async function submit() {
      const username = $('regUsername').value.trim().toLowerCase();
      const nickname = $('regNickname').value.trim();
      const password = $('regPassword').value.trim();
      try {
        const r = await Auth.register(username, password, nickname);
        if (!r.ok) { showToast(r.msg, 'error'); return; }
        showToast(`用户 @${username} 注册成功`);
        hide();
        AdminPanel.show(Auth.getCurrentUser());
      } catch (e) { showToast('注册失败：' + e.message, 'error'); }
    }
    function bind() {
      $('closeRegister').addEventListener('click', hide);
      $('submitRegister').addEventListener('click', submit);
      $('registerOverlay').addEventListener('click', e => { if (e.target === $('registerOverlay')) hide(); });
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
      $('cpOldPwd').value = ''; $('cpNewPwd').value = ''; $('cpConfirmPwd').value = '';
      $('changePwdOverlay').classList.add('show');
    }
    function hide() { $('changePwdOverlay').classList.remove('show'); }
    async function submit() {
      const oldPwd = $('cpOldPwd').value;
      const newPwd = $('cpNewPwd').value;
      const confirmPwd = $('cpConfirmPwd').value;
      if (newPwd !== confirmPwd) { showToast('两次密码不一致', 'error'); return; }
      try {
        const r = await Auth.changePassword(currentUser.username, oldPwd, newPwd);
        if (!r.ok) { showToast(r.msg, 'error'); return; }
        showToast('密码修改成功'); hide();
      } catch (e) { showToast('操作失败：' + e.message, 'error'); }
    }
    function bind() {
      $('closeChangePwd').addEventListener('click', hide);
      $('submitChangePwd').addEventListener('click', submit);
      $('changePwdOverlay').addEventListener('click', e => { if (e.target === $('changePwdOverlay')) hide(); });
    }
    return { show, hide, bind };
  })();

  // =============================================
  // 设置面板：保存时直接写入 Gitee 仓库的 config.js
  // =============================================
  const Settings = (() => {
    function open() {
      $('settingsOwner').value = localStorage.getItem('gitee_owner') || CONFIG.owner;
      $('settingsRepo').value  = localStorage.getItem('gitee_repo')  || CONFIG.repo;
      $('settingsDir').value   = localStorage.getItem('gitee_dir') !== null ? localStorage.getItem('gitee_dir') : CONFIG.reportDir;
      $('settingsToken').value = localStorage.getItem('gitee_token') || (CONFIG.token !== 'YOUR_GITEE_TOKEN' ? CONFIG.token : '');
      $('settingsOverlay').classList.add('show');
    }
    function close() { $('settingsOverlay').classList.remove('show'); }

    async function save() {
      const owner = $('settingsOwner').value.trim();
      const repo  = $('settingsRepo').value.trim();
      const dir   = $('settingsDir').value.trim();
      const token = $('settingsToken').value.trim();
      if (!owner || !repo || !token) {
        showToast('用户名、仓库名和 Token 不能为空', 'error'); return;
      }

      const btn = $('saveSettings');
      btn.disabled = true;
      btn.textContent = '保存中...';

      // 生成新的 config.js 内容
      const newConfig = `// =============================================
// Gitee 日报系统配置文件（自动生成，请勿手动修改）
// =============================================

const CONFIG = {
  owner: '${owner}',
  repo: '${repo}',
  reportDir: '${dir}',
  usersFile: 'data/users.json',
  token: '${token}',
  adminUser: 'admin',
  appTitle: '团队日报系统',
  committer: {
    name: 'Daily Report Bot',
    email: '691961576@qq.com',
  },
};
`;

      try {
        // 先用当前 token 获取 config.js 的 sha
        const BASE = 'https://gitee.com/api/v5';
        const shaRes = await fetch(
          `${BASE}/repos/${owner}/${repo}/contents/config.js?access_token=${token}`
        );
        let sha = null;
        if (shaRes.ok) {
          const shaData = await shaRes.json();
          sha = shaData.sha;
        }

        // 编码内容
        const encoded = btoa(
          Array.from(new TextEncoder().encode(newConfig))
            .map(b => String.fromCharCode(b)).join('')
        );

        const body = {
          access_token: token,
          message: '更新系统配置',
          content: encoded,
          committer: { name: 'Daily Report Bot', email: '691961576@qq.com' },
        };
        if (sha) body.sha = sha;

        const res = await fetch(`${BASE}/repos/${owner}/${repo}/contents/config.js`, {
          method: sha ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = Array.isArray(err.message) ? err.message.join('; ') : (err.message || `HTTP ${res.status}`);
          throw new Error(msg);
        }

        // 更新内存中的 CONFIG
        CONFIG.owner     = owner;
        CONFIG.repo      = repo;
        CONFIG.reportDir = dir;
        CONFIG.token     = token;

        close();
        showToast('配置已保存到仓库，请重新登录');
        Auth.logout();
        setTimeout(() => LoginPage.show(), 1000);

      } catch (e) {
        showToast('保存失败：' + e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '保存配置';
      }
    }

    function loadFromStorage() {
      const owner = localStorage.getItem('gitee_owner');
      const repo  = localStorage.getItem('gitee_repo');
      const dir   = localStorage.getItem('gitee_dir');
      const token = localStorage.getItem('gitee_token');
      if (owner) CONFIG.owner = owner;
      if (repo)  CONFIG.repo  = repo;
      if (dir !== null) CONFIG.reportDir = dir;
      if (token) CONFIG.token = token;
    }

    function bind() {
      const btn = $('settingsBtn');
      if (btn) btn.addEventListener('click', open);
      $('closeSettings').addEventListener('click', close);
      $('saveSettings').addEventListener('click', save);
      $('settingsOverlay').addEventListener('click', e => {
        if (e.target === $('settingsOverlay')) close();
      });
    }

    return { open, close, bind, loadFromStorage };
  })();

  // =============================================
  // 初始化
  // =============================================
  function init() {
    Settings.loadFromStorage();
    document.title = CONFIG.appTitle;
    LoginPage.bind();
    MainPage.bind();
    AdminPanel.bind();
    RegisterModal.bind();
    ChangePwd.bind();
    Settings.bind();

    const user = Auth.getCurrentUser();
    if (user) {
      MainPage.show(user);
    } else if (!CONFIG.token || CONFIG.token === 'YOUR_GITEE_TOKEN') {
      Settings.open();
      showToast('请先完成 Gitee 配置', 'info', 5000);
    } else {
      LoginPage.show();
    }
  }

  return {
    init,
    clickHistory:    (...a) => MainPage.clickHistory(...a),
    clickDelete:     (...a) => MainPage.clickDelete(...a),
    adminViewUser:   (...a) => AdminPanel.viewUser(...a),
    adminLoadReport: (...a) => AdminPanel.loadAdminReport(...a),
    adminResetPwd:   (...a) => AdminPanel.resetPwd(...a),
    adminDelUser:    (...a) => AdminPanel.delUser(...a),
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
