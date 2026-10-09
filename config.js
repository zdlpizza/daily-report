// =============================================
// 日报系统配置文件
// =============================================

const CONFIG = {
  // Gitee 仓库所有者用户名
  owner: 'YOUR_GITEE_USERNAME',

  // 存储日报的仓库名
  repo: 'daily-report',

  // 日报根目录（仓库内，不需要可留空）
  reportDir: 'reports',

  // 用户数据文件路径（存储注册用户列表）
  usersFile: 'data/users.json',

  // Gitee 仓库读写 Token（在设置页面配置，这里是默认值）
  token: 'YOUR_GITEE_TOKEN',

  // 管理员用户名（唯一，可查看所有人日报）
  adminUser: 'admin',

  // 应用标题
  appTitle: '团队日报系统',

  // Git 提交者信息
  committer: {
    name: 'Daily Report Bot',
    email: '691961576@qq.com',
  },
};
