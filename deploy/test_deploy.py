"""Run with python3 -m unittest discover -s deploy -p 'test_*.py'."""
import http.server
import json
from pathlib import Path
import sqlite3
import ssl
import stat
import subprocess
import tempfile
import threading
import unittest
from snapshot import snapshot

HERE = Path(__file__).resolve().parent
REVISION = 'a' * 40


class DeploymentChecks(unittest.TestCase):
    def test_online_backup_includes_committed_wal_and_preserves_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            db = root / 'live.sqlite'
            source = sqlite3.connect(db)
            source.execute('PRAGMA journal_mode=WAL')
            source.execute('CREATE TABLE drafts(body TEXT)')
            source.execute('INSERT INTO drafts VALUES (?)', ('不能丢失的正文',))
            source.commit()
            self.assertTrue(Path(str(db) + '-wal').exists())
            env = root / 'story.env'
            env.write_text('APP_PASSWORD="test-only-synthetic"\n')
            old = root / 'release'
            old.mkdir()
            current = root / 'current'
            current.symlink_to(old)
            backup = root / 'backup'
            snapshot(backup, db, env, current)
            copy = sqlite3.connect(backup / 'story.sqlite')
            self.assertEqual(copy.execute('SELECT body FROM drafts').fetchone()[0], '不能丢失的正文')
            self.assertEqual(source.execute('SELECT COUNT(*) FROM drafts').fetchone()[0], 1)
            self.assertEqual(stat.S_IMODE((backup / 'story.env').stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o700)
            self.assertEqual((backup / 'previous-release').read_text().strip(), str(old))
            with self.assertRaises(FileExistsError):
                snapshot(backup, db, env, current)
            copy.close()
            source.close()

    def test_https_gate_validates_revision_and_authentication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            key, cert = root / 'key.pem', root / 'cert.pem'
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                            '-keyout', str(key), '-out', str(cert), '-subj', '/CN=127.0.0.1',
                            '-addext', 'subjectAltName=IP:127.0.0.1'], check=True, capture_output=True)
            state = {'revision': REVISION, 'protected': True}

            class Handler(http.server.BaseHTTPRequestHandler):
                def do_GET(self):
                    code, body = 200, b''
                    if self.path == '/api/health':
                        body = json.dumps({'ok': True, 'revision': state['revision']}).encode()
                    elif self.path == '/':
                        body = '<title>叙事</title>'.encode()
                    else:
                        code = 401 if state['protected'] else 200
                        body = b'{}'
                    self.send_response(code)
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

                def log_message(self, *_args):
                    pass

            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(str(cert), str(key))
            server.socket = context.wrap_socket(server.socket, server_side=True)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            command = ['python3', str(HERE / 'verify.py'), REVISION, '--https',
                       '--port', str(server.server_port), '--ca', str(cert)]
            try:
                self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
                state['revision'] = 'b' * 40
                self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
                state['revision'] = REVISION
                state['protected'] = False
                self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            finally:
                server.shutdown()
                server.server_close()
                worker.join()


if __name__ == '__main__':
    unittest.main()
