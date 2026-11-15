"""Test double for the Docker command line in Stage 2.

It supports the calls that the Stage 2 tool image and Knip steps make. Each call
appends its arguments, and the standard input that it reads, as one JSON line to
the file in DOCKER_DOUBLE_LOG. These settings select a failure:

- DOCKER_DOUBLE_VERSION_EXIT: exit code of `docker --version` (default 0).
- DOCKER_DOUBLE_BUILD, DOCKER_DOUBLE_INSPECT, DOCKER_DOUBLE_CHECK: `fail` makes
  the image build, the image inspection or the image check fail.
- DOCKER_DOUBLE_KNIP: `invalid` makes a Knip run print text that is not JSON.
"""
import json
import os
import sys

BUILD_ID = 'sha256:' + 'b' * 64
IMAGE_ID = 'sha256:' + 'a' * 64
ENDPOINT = 'unix:///var/run/docker.sock'


def setting(name, default='pass'):
    return os.environ.get('DOCKER_DOUBLE_' + name, default)


def log(stdin):
    # Record the complete call, including a leading --host option.
    with open(os.environ['DOCKER_DOUBLE_LOG'], 'a', encoding='utf-8') as file:
        file.write(json.dumps({'args': sys.argv[1:], 'stdin': stdin}) + '\n')


def option(args, name):
    return args[args.index(name) + 1]


def build(args):
    stdin = sys.stdin.read()
    log(stdin)
    if setting('BUILD') == 'fail':
        print('ERROR: test double build failed', file=sys.stderr)
        return 1
    with open(option(args, '--iidfile'), 'w', encoding='utf-8') as file:
        file.write(BUILD_ID)
    print('#1 test double build')
    return 0


def inspect(args):
    log(None)
    if args[0] == 'image' and setting('INSPECT') == 'fail':
        print('Error: No such image', file=sys.stderr)
        return 1
    if args[0] == 'image':
        print(IMAGE_ID)
    else:
        print(json.dumps({'name': 'default', 'endpoint': ENDPOINT}))
    return 0


def image_check(args):
    log(sys.stdin.read())
    if setting('CHECK') == 'fail':
        print('test double image check failed', file=sys.stderr)
        return 1
    image = next(value.split('=', 1)[1] for value in args if value.startswith('CHOOM_KNIP_IMAGE_ID='))
    print(json.dumps({'imageId': image, 'knip': '6.44.1', 'toolRoot': '/opt/choom-tools',
                      'environment': {'KNIP_DISABLE_RAW_TRANSFER': '1'}, 'packageLock': {'lockfileVersion': 3},
                      'check': {'status': 'passed', 'runs': [{'mode': 'normal', 'exitCode': 1},
                                                             {'mode': 'production', 'exitCode': 1}]}}))
    return 0


def knip():
    log(None)
    if setting('KNIP', 'report') == 'invalid':
        print('test double output that is not JSON')
    else:
        print(json.dumps({'issues': [{'file': 'app.ts', 'files': [{'name': 'app.ts'}]}]}))
    return 1


def main(args):
    if args[:1] == ['--host']:
        args = args[2:]
    if args == ['--version']:
        log(None)
        print('Docker version 0.0.0, build test-double')
        return int(setting('VERSION_EXIT', '0'))
    if args[:1] == ['build']:
        return build(args)
    if args[:2] in (['image', 'inspect'], ['context', 'inspect']):
        return inspect(args)
    if args[:1] == ['run']:
        return image_check(args) if '--input-type=module' in args else knip()
    log(None)
    print('Unsupported test double call: ' + ' '.join(args), file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
