# NoteMind 单程序内网版本说明

本项目支持打包成单个可执行文件，用于内网环境部署，无需安装 Python、Node.js 等依赖。

## 支持的平台

- **Linux** (已测试: Kylin 10, Ubuntu)
- **Windows** (Windows 10/11, Windows Server)

## 构建方式

### Windows 版本
```powershell
cd backend
.\build_windows.ps1
```

输出: `backend\dist\notemind-server.exe`

### Linux 版本
```bash
cd backend
bash build_linux.sh
```

输出: `backend/dist/notemind-server`

## 运行方式

### Windows
```powershell
# 默认运行 (0.0.0.0:80)
.\notemind-server.exe

# 自定义端口
.\notemind-server.exe --host 127.0.0.1 --port 8080

# 或使用启动脚本
.\start_windows.ps1 -Port 8080
```

### Linux
```bash
# 默认运行 (0.0.0.0:80)
./notemind-server

# 自定义端口
./notemind-server --host 127.0.0.1 --port 8080
```

## 文件结构

运行后会在可执行文件同目录下创建：

```
notemind-server.exe (或 notemind-server)
├── .env                 # 配置文件（可选）
├── notemind.db          # SQLite 数据库（自动创建）
└── storage/             # 上传的附件（自动创建）
```

## 配置说明

在可执行文件同目录创建 `.env` 文件（参考 `.env.example`）：

```env
# JWT 密钥（建议修改）
JWT_SECRET=your-random-secret-key

# AI 功能配置（可选）
LLM_PROVIDER=dashscope
LLM_API_KEY=your-api-key
LLM_CHAT_MODEL=qwen-plus

# 其他配置
JWT_EXPIRE_DAYS=7
SEMANTIC_SIMILARITY_THRESHOLD=0.2
```

## 两个版本的区别

| 特性 | Linux 版本 | Windows 版本 |
|------|-----------|-------------|
| 构建脚本 | `build_linux.sh` | `build_windows.ps1` |
| 输出文件 | `notemind-server` | `notemind-server.exe` |
| 默认端口 | 80 | 80 |
| 数据库路径 | 自动处理 | 自动处理 |
| 路径分隔符 | `/` | `\` (代码已处理) |

## 代码兼容性

代码已经做了跨平台处理：

1. **数据库路径** (`app/database.py`):
   - Windows: `sqlite:///C:/path/to/notemind.db`
   - Linux: `sqlite:////path/to/notemind.db`

2. **存储目录** (`app/main.py`):
   - 自动检测 `sys.frozen` 状态
   - 使用 `os.path.join` 处理路径

3. **多进程支持** (`run.py`):
   - 包含 `freeze_support()` 支持 Windows

## 部署建议

### Windows 内网部署
1. 复制 `notemind-server.exe` 到目标机器
2. 创建 `.env` 配置文件
3. 双击运行或使用任务计划程序设置开机自启
4. 配置防火墙允许端口访问

### Linux 内网部署
1. 复制 `notemind-server` 到目标机器
2. 添加执行权限: `chmod +x notemind-server`
3. 创建 `.env` 配置文件
4. 使用 systemd 或其他服务管理器设置开机自启

## 注意事项

1. **端口权限**: 使用 80 端口可能需要管理员/root 权限
2. **防火墙**: 确保目标端口在防火墙中开放
3. **数据备份**: 定期备份 `notemind.db` 和 `storage/` 目录
4. **版本管理**: 建议在同一分支维护，通过构建脚本区分平台

## 开发与维护

- **不需要新建分支**: 代码已经跨平台兼容
- **统一代码库**: 只需维护一套代码
- **平台差异**: 仅在构建脚本层面处理
