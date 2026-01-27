# Windows 单程序打包说明

## 前置要求

1. **Python 3.7+** - 确保已安装并添加到 PATH
2. **Node.js** - 用于构建前端（如果 frontend/dist 不存在）
3. **Git Bash 或 PowerShell** - 运行构建脚本

## 构建步骤

### 1. 进入后端目录
```powershell
cd backend
```

### 2. 运行构建脚本
```powershell
.\build_windows.ps1
```

构建脚本会自动：
- 创建 Python 虚拟环境
- 安装所有依赖
- 构建前端（如果需要）
- 使用 PyInstaller 打包成单个 exe 文件

### 3. 获取可执行文件

构建完成后，可执行文件位于：
```
backend\dist\notemind-server.exe
```

## 运行说明

### 基本运行
双击 `notemind-server.exe` 即可运行，默认配置：
- 监听地址: 0.0.0.0
- 端口: 80

### 自定义端口运行
```powershell
.\notemind-server.exe --host 127.0.0.1 --port 8080
```

### 首次运行配置

1. **创建 .env 文件**（可选）
   在 exe 同目录下创建 `.env` 文件，参考 `.env.example`：
   ```env
   JWT_SECRET=your-secret-key-here
   LLM_PROVIDER=dashscope
   LLM_API_KEY=your-api-key
   LLM_CHAT_MODEL=qwen-plus
   ```

2. **数据存储**
   - 数据库文件: `notemind.db`（自动创建在 exe 同目录）
   - 上传文件: `storage/` 文件夹（自动创建）

3. **访问应用**
   打开浏览器访问: `http://localhost` 或 `http://localhost:8080`（根据你的端口）

## 部署到内网其他机器

1. 复制整个 `dist` 文件夹到目标机器
2. 确保目标机器没有端口冲突
3. 如果需要开机自启动，可以：
   - 创建快捷方式放到启动文件夹
   - 或使用 Windows 任务计划程序

## 注意事项

- **防火墙**: 首次运行可能需要允许防火墙访问
- **端口占用**: 如果 80 端口被占用，使用 `--port` 参数指定其他端口
- **管理员权限**: 使用 80 端口可能需要管理员权限
- **杀毒软件**: 某些杀毒软件可能误报，需要添加信任

## 故障排查

### 构建失败
- 检查 Python 版本是否 >= 3.7
- 检查是否安装了所有依赖
- 检查 frontend/dist 是否存在

### 运行失败
- 查看控制台错误信息
- 检查端口是否被占用
- 检查 .env 配置是否正确

### 无法访问
- 检查防火墙设置
- 确认端口号正确
- 尝试使用 127.0.0.1 而不是 0.0.0.0
