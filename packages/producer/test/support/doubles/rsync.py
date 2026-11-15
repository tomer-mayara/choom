"""Test double for rsync in the Stage 1 capture.

It supports only the three calls that the Stage 1 capture makes: --version, a
copy (-rlt) and a checksum dry run (-rcnl --delete --itemize-changes). The last
two arguments are the source and target folders. It reads the exclusion list
from standard input and does not apply it, so a test target must not contain a
path that the exclusions remove. The dry run prints one line for each changed,
missing or extra file, so an empty output means that the copy is complete.
"""
import filecmp
import os
import shutil
import sys


def files(root):
    found = set()
    for folder, _, names in os.walk(root):
        for name in names:
            found.add(os.path.relpath(os.path.join(folder, name), root))
    return found


def copy(source, target):
    for path in sorted(files(source)):
        os.makedirs(os.path.dirname(os.path.join(target, path)), exist_ok=True)
        shutil.copy2(os.path.join(source, path), os.path.join(target, path))


def compare(source, target):
    left, right = files(source), files(target)
    for path in sorted(left | right):
        if path not in right:
            print('>f+++++++++ ' + path)
        elif path not in left:
            print('*deleting   ' + path)
        elif not filecmp.cmp(os.path.join(source, path), os.path.join(target, path), shallow=False):
            print('>fc........ ' + path)


def main(args):
    if args == ['--version']:
        print('rsync test double')
        return 0
    sys.stdin.buffer.read()
    source, target = args[-2], args[-1]
    if '-rlt' in args:
        copy(source, target)
    elif '-rcnl' in args:
        compare(source, target)
    else:
        print('Unsupported test double call: ' + ' '.join(args), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
