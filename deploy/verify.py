#!/usr/bin/env python3
"""Probe the exact deployed version, served frontend and required authentication."""
import argparse
import http.client
import json
import ssl
import sys

parser = argparse.ArgumentParser()
parser.add_argument('revision')
parser.add_argument('--https', action='store_true')
parser.add_argument('--port', type=int)
parser.add_argument('--ca', default='/etc/story-writing/tls/server.crt')
args = parser.parse_args()
try:
    if args.https:
        context = ssl.create_default_context(cafile=args.ca)
        connection = http.client.HTTPSConnection('127.0.0.1', args.port or 8443, timeout=8, context=context)
    else:
        connection = http.client.HTTPConnection('127.0.0.1', args.port or 3101, timeout=8)
    for path in ['/api/health', '/', '/api/books']:
        connection.request('GET', path)
        response = connection.getresponse()
        body = response.read()
        if path == '/api/health':
            if response.status != 200:
                raise ValueError('健康检查 HTTP 状态不是 200')
            data = json.loads(body)
            if data.get('ok') is not True or data.get('revision') != args.revision:
                raise ValueError('实际运行的提交版本与目标不一致')
        elif path == '/':
            if response.status != 200 or '叙事' not in body.decode('utf-8'):
                raise ValueError('前端页面未正确提供')
        elif response.status != 401:
            raise ValueError('未登录的数据接口没有受到密码保护')
    connection.close()
except Exception as error:
    print('检查失败：' + str(error), file=sys.stderr)
    sys.exit(1)
print(('HTTPS' if args.https else 'HTTP') + ' 检查通过：版本、前端页面和登录保护正常。')
