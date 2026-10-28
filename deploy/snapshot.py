#!/usr/bin/env python3
"""Consistent online SQLite backup. Does not overwrite business data."""
from contextlib import closing
import os
from pathlib import Path
import shutil
import sqlite3
import sys


def snapshot(output, source=Path('/var/lib/story-writing/data/story.sqlite'),
             config=Path('/etc/story-writing/story.env'), current=Path('/opt/story/current')):
    output = Path(output)
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    if source.exists():
        target = output / 'story.sqlite'
        with closing(sqlite3.connect('file:' + str(source) + '?mode=ro', uri=True, timeout=10)) as src:
            with closing(sqlite3.connect(str(target))) as dst:
                src.backup(dst, pages=256, sleep=0.05)
                if dst.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise RuntimeError('数据库备份完整性检查失败')
        os.chmod(target, 0o600)
    shutil.copy2(config, output / 'story.env')
    os.chmod(output / 'story.env', 0o600)
    if current.is_symlink():
        (output / 'previous-release').write_text(str(current.resolve()) + '\n')
    print('一致性备份已保存：' + str(output))


if __name__ == '__main__':
    snapshot(Path(sys.argv[1]))
