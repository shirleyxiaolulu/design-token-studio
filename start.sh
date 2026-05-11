#!/bin/bash
# 设计规范生成器 - 一键启动
# 同事访问 http://你的IP:5500 即可使用

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

# 优先用 npx serve，没有就用 python
if command -v npx &>/dev/null; then
  npx serve . -l $PORT --no-clipboard
elif command -v python3 &>/dev/null; then
  python3 -m http.server $PORT
else
  echo "  需要安装 Node.js 或 Python"
  exit 1
fi
