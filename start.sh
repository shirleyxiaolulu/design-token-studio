#!/bin/bash
# 设计规范生成器 - 一键启动
# 同事访问 http://你的IP:5500 即可使用

# 始终在脚本所在目录运行（保证 serve.json / dev-server.py 生效）
cd "$(dirname "$0")"

PORT=5500

echo ""
echo "  设计规范生成器 Design Token Studio"
echo "  ─────────────────────────────────"

# 获取本机 IP
IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")

echo ""
echo "  本机访问: http://localhost:$PORT"
echo "  局域网:   http://$IP:$PORT"
echo ""
echo "  按 Ctrl+C 停止服务"
echo ""

# 优先用 npx serve（读取 serve.json 禁用缓存），没有就用 no-cache 的 python 服务
if command -v npx &>/dev/null; then
  npx serve . -l $PORT --no-clipboard
elif command -v python3 &>/dev/null; then
  python3 dev-server.py $PORT
else
  echo "  需要安装 Node.js 或 Python"
  exit 1
fi
