#!/usr/bin/env python3
"""First deployment only. Read credentials from the terminal, never argv/stdout."""
import getpass
import os
import sys

try:
    tty = os.open('/dev/tty', os.O_RDWR)
    os.close(tty)
except OSError:
    sys.exit('需要交互终端才能安全输入密码；没有写入配置。')

path = '/etc/story-writing/story.env'
if os.path.lexists(path):
    sys.exit('配置已存在，拒绝覆盖：' + path)
while True:
    password = getpass.getpass('为叙事设置独立访问密码（至少 12 字符，输入不回显）：')
    if len(password) < 12 or any(ord(c) < 32 or ord(c) == 127 for c in password):
        print('密码至少 12 字符，不能包含控制字符。')
        continue
    if password != getpass.getpass('再次输入访问密码：'):
        print('两次密码不一致。')
        continue
    break
key = getpass.getpass('可选：百炼中国内地 API Key（输入不回显；直接回车使用示例模式）：').strip()
if any(ord(c) < 32 or ord(c) == 127 for c in key):
    sys.exit('API Key 含控制字符，未写入配置。')
values = {
    'NODE_ENV': 'production', 'HOST': '127.0.0.1', 'PORT': '3101',
    'DATA_DIR': '/var/lib/story-writing/data', 'APP_PASSWORD': password,
    'AI_API_KEY': key, 'AI_MODEL': 'qwen-plus',
    'AI_BASE_URL': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'COOKIE_SECURE': 'true', 'TRUST_PROXY': 'true',
}
def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    for name, value in values.items():
        output.write(name + '=' + quote(value) + '\n')
    output.flush()
    os.fsync(output.fileno())
print('配置已安全保存；没有回显密码或密钥。')
