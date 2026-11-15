"""Test double for rsync in the Stage 1 capture.

It supports only the three calls that the Stage 1 capture makes: --version, a
copy (-rlt) and a checksum dry run (-rcnl --delete --itemize-changes). The last
two arguments are the source and target folders. It applies the exclusion
rules of each --exclude=RULE argument and of standard input (--exclude-from=-)
as rsync does, for the rule forms that Stage 1 uses: a pattern with the
wildcards * and ?, a leading / that anchors the pattern to the source folder,
a trailing / that limits it to folders, and a "- " prefix. It ignores blank
lines and comments, and stops on any other rule form, so that a test cannot
depend on a rule that the double does not apply. The dry run prints one line
for each changed, missing or extra file, so an empty output means that the
copy is complete.
"""
import filecmp
import os
import re
import shutil
import sys


class UnsupportedRule(Exception):
    pass


def exclusion_rules(lines):
    rules = []
    for line in lines:
        if line == '' or line[0] in '#;':
            continue
        rule = line[2:] if line.startswith('- ') else line
        folders_only, anchored = rule.endswith('/'), rule.startswith('/')
        body = rule[1 if anchored else 0:len(rule) - 1 if folders_only else len(rule)]
        if line.startswith(('+ ', '!')) or not body or body.startswith('/') or body.endswith('/') or \
                any(text in rule for text in ('[', '\\', '**', '\r')):
            raise UnsupportedRule(line)
        pattern = ''.join('[^/]*' if char == '*' else '[^/]' if char == '?' else re.escape(char) for char in body)
        rules.append((folders_only, re.compile(('^' if anchored else '(?:^|/)') + pattern + '$')))
    return rules


def excluded(rules, path, is_folder):
    return any((is_folder or not folders_only) and pattern.search(path) for folders_only, pattern in rules)


def files(root, rules):
    found = set()
    for folder, folders, names in os.walk(root):
        relative = os.path.relpath(folder, root)
        prefix = '' if relative == '.' else relative + '/'
        folders[:] = [name for name in folders if not excluded(rules, prefix + name, True)]
        found.update(prefix + name for name in names if not excluded(rules, prefix + name, False))
    return found


def copy(source, target, rules):
    for path in sorted(files(source, rules)):
        os.makedirs(os.path.dirname(os.path.join(target, path)), exist_ok=True)
        shutil.copy2(os.path.join(source, path), os.path.join(target, path))


def compare(source, target, rules):
    left, right = files(source, rules), files(target, rules)
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
    lines = [arg[len('--exclude='):] for arg in args if arg.startswith('--exclude=')]
    lines += sys.stdin.buffer.read().decode('utf-8').split('\n')
    try:
        rules = exclusion_rules(lines)
    except UnsupportedRule as error:
        print('Unsupported test double exclusion rule: ' + repr(str(error)), file=sys.stderr)
        return 2
    source, target = args[-2], args[-1]
    if '-rlt' in args:
        copy(source, target, rules)
    elif '-rcnl' in args:
        compare(source, target, rules)
    else:
        print('Unsupported test double call: ' + ' '.join(args), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
