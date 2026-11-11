#!/usr/bin/env python3
"""Prepare or verify shared inventory input for stages 2 and 4; consolidate legacy stage 2 input."""

import argparse
import ctypes
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile


SHA256 = re.compile(r'[0-9a-fA-F]{64}')
ATTEMPT_ID = re.compile(r's[24]-[a-z0-9-]+')
COPY_RESERVE_BYTES = 64 * 1024 * 1024
READ_ONLY_FILE = 0o444
READ_ONLY_DIRECTORY = 0o555


def real_path_stat(path, kind):
    info = path.lstat()
    if not kind(info.st_mode) or path.resolve(strict=True) != path:
        raise ValueError(f'Expected a real absolute path of the required type: {path}')
    return info


def inventory_path(record):
    if not isinstance(record, dict):
        raise ValueError('Invalid inventory file record.')
    name = record.get('path')
    if (not isinstance(name, str) or '\\' in name or '\0' in name
            or any(part in ('', '.', '..') for part in name.split('/'))):
        raise ValueError(f'Invalid inventory path: {name!r}')
    if record.get('kind') != 'file':
        raise ValueError(f'Inventory path is not a regular file: {name}')
    size = record.get('bytes')
    digest = record.get('sha256')
    if type(size) is not int or size < 0:
        raise ValueError(f'Invalid inventory byte count: {name}')
    if not isinstance(digest, str) or not SHA256.fullmatch(digest):
        raise ValueError(f'Invalid inventory SHA-256 digest: {name}')
    return name


def read_inventory(path, expected_hash, snapshot_id):
    real_path_stat(path, stat.S_ISREG)
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_hash:
        raise ValueError('Inventory digest differs from the registered digest.')
    inventory = json.loads(raw)
    if (not isinstance(inventory, dict) or type(inventory.get('formatVersion')) is not int
            or inventory['formatVersion'] != 1 or inventory.get('snapshotId') != snapshot_id
            or not isinstance(inventory.get('files'), list)):
        raise ValueError('Invalid inventory or wrong snapshot ID.')

    records = {}
    directories = {'.'}
    for record in inventory['files']:
        name = inventory_path(record)
        if name in records:
            raise ValueError(f'Duplicate inventory path: {name}')
        records[name] = record
        directories.update(str(parent) for parent in PurePosixPath(name).parents)
    overlap = records.keys() & directories
    if overlap:
        raise ValueError(f'Inventory file is also a directory: {min(overlap)}')
    return records, directories


def macos_copier():
    try:
        clone = ctypes.CDLL(None, use_errno=True).clonefile
    except AttributeError as error:
        raise OSError('macOS clonefile is unavailable.') from error
    clone.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint32]
    clone.restype = ctypes.c_int
    nofollow = 0x0001  # CLONE_NOFOLLOW from sys/clonefile.h

    def clone_file(source, target):
        if clone(os.fsencode(source), os.fsencode(target), nofollow) != 0:
            code = ctypes.get_errno()
            raise OSError(code, os.strerror(code), str(target))

    return clone_file


def copy_file(source, target):
    with source.open('rb') as original, target.open('xb') as output:
        shutil.copyfileobj(original, output)


def select_copier(work, byte_count):
    if sys.platform == 'darwin':
        return macos_copier(), 'macOS clonefile(2), without a full-copy fallback'
    if shutil.disk_usage(work).free < byte_count + COPY_RESERVE_BYTES:
        raise ValueError('File copy needs free space for the inventory bytes plus 64 MiB.')
    return copy_file, 'guarded file copy'


def check_source_file(path, record):
    info = real_path_stat(path, stat.S_ISREG)
    if info.st_size != record['bytes']:
        raise ValueError(f'Snapshot file byte count differs from inventory: {record["path"]}')
    return info


def create_view(work, source, view, records, directories):
    for name in directories:
        real_path_stat(source / name, stat.S_ISDIR)
    for name, record in records.items():
        check_source_file(source / name, record)

    byte_count = sum(record['bytes'] for record in records.values())
    copy, method = select_copier(work, byte_count)
    parents = sorted(directories - {'.'}, key=lambda name: (name.count('/'), name))
    for name in parents:
        (view / name).mkdir()
    for name, record in records.items():
        original = source / name
        target = view / name
        original_info = check_source_file(original, record)
        copy(original, target)
        target_info = real_path_stat(target, stat.S_ISREG)
        if os.path.samestat(original_info, target_info) or target_info.st_nlink != 1:
            raise ValueError(f'Expected an independent Knip input file: {name}')
        target.chmod(READ_ONLY_FILE)
    for name in reversed(parents):
        (view / name).chmod(READ_ONLY_DIRECTORY)
    view.chmod(READ_ONLY_DIRECTORY)
    return method


def verify_view_file(path, record):
    info = real_path_stat(path, stat.S_ISREG)
    if stat.S_IMODE(info.st_mode) != READ_ONLY_FILE or info.st_nlink != 1:
        raise ValueError(f'Expected an independent read-only Knip input file: {path}')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    if info.st_size != record['bytes'] or digest.hexdigest() != record['sha256'].lower():
        raise ValueError(f'Knip input differs from inventory: {record["path"]}')


def verify_view(view, records, directories):
    def scan_error(error):
        raise error

    if stat.S_IMODE(real_path_stat(view, stat.S_ISDIR).st_mode) != READ_ONLY_DIRECTORY:
        raise ValueError(f'Expected a read-only Knip input directory: {view}')
    pending_files = set(records)
    pending_dirs = directories - {'.'}
    for parent, dirs, files in os.walk(view, followlinks=False, onerror=scan_error):
        for entry in dirs:
            path = Path(parent) / entry
            name = path.relative_to(view).as_posix()
            if name not in pending_dirs:
                raise ValueError(f'Unindexed directory in Knip input: {name}')
            info = real_path_stat(path, stat.S_ISDIR)
            if stat.S_IMODE(info.st_mode) != READ_ONLY_DIRECTORY:
                raise ValueError(f'Expected a read-only Knip input directory: {name}')
            pending_dirs.remove(name)
        for entry in files:
            path = Path(parent) / entry
            name = path.relative_to(view).as_posix()
            if name not in pending_files:
                raise ValueError(f'Unindexed file in Knip input: {name}')
            verify_view_file(path, records[name])
            pending_files.remove(name)
    if pending_files or pending_dirs:
        sample = ', '.join(sorted(pending_files | pending_dirs)[:3])
        raise ValueError(f'Knip input is missing {len(pending_files)} files and '
                         f'{len(pending_dirs)} directories from the inventory. First paths: {sample}')


def remove_tree(root):
    # Only directories need write access to remove their contents.
    for parent, _, _ in os.walk(root, followlinks=False):
        directory = Path(parent)
        real_path_stat(directory, stat.S_ISDIR)
        directory.chmod(0o700)
    shutil.rmtree(root)


def publish_view(staged, view):
    if os.path.lexists(view):
        raise FileExistsError(f'Knip input already exists: {view}')
    staged.rename(view)


def prepare_view(work, source, view, attempt_id, records, directories):
    if os.path.lexists(view):
        verify_view(view, records, directories)
        return None, True
    # A same-parent rename can publish the directory while it is read-only.
    staged = Path(tempfile.mkdtemp(prefix=f'.knip-input-{attempt_id}-', dir=work))
    try:
        method = create_view(work, source, staged, records, directories)
        verify_view(staged, records, directories)
        publish_view(staged, view)
    except (OSError, ValueError) as error:
        raise ValueError(f'{error} Failed Knip input staging: {staged}') from error
    return method, False


def directory_identity(path):
    info = real_path_stat(path, stat.S_ISDIR)
    return [info.st_dev, info.st_ino]


def check_identity(path, expected):
    if directory_identity(path) != expected:
        raise ValueError(f'Knip input directory changed since migration began: {path}')


def write_receipt(path, receipt, initial=False):
    def write(stream):
        json.dump(receipt, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())

    if initial:
        with path.open('x') as stream:
            write(stream)
        return
    with tempfile.TemporaryDirectory(prefix='.knip-input-migration-', dir=path.parent.parent) as temp:
        staged = Path(temp) / path.name
        with staged.open('x') as stream:
            write(stream)
        staged.replace(path)


def consolidate_view(work, view, attempt_id, retire, records, directories, result):
    evidence = work / 'evidence'
    real_path_stat(evidence, stat.S_ISDIR)
    receipt_path = evidence / f'knip-input-migration-{attempt_id}.json'
    legacy = {key: work / f'knip-input-{key}' for key in [attempt_id, *retire]}
    retired = {key: work / f'.knip-input-retired-{key}' for key in legacy}
    shared_exists = os.path.lexists(view)
    if shared_exists:
        verify_view(view, records, directories)

    initial = not os.path.lexists(receipt_path)
    result['retireRequested'] = sorted(retire)
    if initial:
        for key, path in legacy.items():
            verify_view(path, records, directories)
            if os.path.lexists(retired[key]):
                raise FileExistsError(f'Retirement path already exists: {retired[key]}')
        helper = Path(__file__).resolve(strict=True)
        receipt = {
            **result,
            'status': 'pending',
            'checkedAt': utc_now(),
            'reused': shared_exists,
            'adoptedFrom': None if shared_exists else str(legacy[attempt_id]),
            'sharedIdentity': directory_identity(view if shared_exists else legacy[attempt_id]),
            'legacyIdentities': {key: directory_identity(path) for key, path in legacy.items()},
            'command': [sys.executable, *sys.argv],
            'helperSha256': hashlib.sha256(helper.read_bytes()).hexdigest(),
        }
        write_receipt(receipt_path, receipt, initial=True)
    else:
        real_path_stat(receipt_path, stat.S_ISREG)
        receipt = json.loads(receipt_path.read_bytes())
        if (not isinstance(receipt, dict) or any(receipt.get(key) != value for key, value in result.items()
                if key not in ('status', 'checkedAt', 'reused'))
                or receipt.get('status') not in ('pending', 'failed', 'verified')
                or type(receipt.get('reused')) is not bool
                or receipt.get('adoptedFrom') != (None if receipt['reused'] else str(legacy[attempt_id]))
                or not isinstance(receipt.get('legacyIdentities'), dict)
                or receipt['legacyIdentities'].keys() != legacy.keys()):
            raise ValueError(f'Migration receipt does not match this operation: {receipt_path}')
        if shared_exists:
            check_identity(view, receipt.get('sharedIdentity'))
        elif (receipt['reused'] or receipt['status'] == 'verified'
                or not all(os.path.lexists(path) for path in legacy.values())
                or any(os.path.lexists(path) for path in retired.values())
                or receipt.get('sharedIdentity') != receipt['legacyIdentities'][attempt_id]):
            raise ValueError(f'Shared Knip input is missing during migration: {view}')
        for key, path in legacy.items():
            original_exists = os.path.lexists(path)
            retired_exists = os.path.lexists(retired[key])
            if ((original_exists or retired_exists) and (receipt['status'] == 'verified'
                    or (shared_exists and key == attempt_id and not receipt['reused'])
                    or (original_exists and retired_exists))):
                raise ValueError(f'Unexpected migration path for {key}')
            if original_exists:
                verify_view(path, records, directories)
            if original_exists or retired_exists:
                current = path if original_exists else retired[key]
                check_identity(current, receipt['legacyIdentities'][key])
        if receipt['status'] == 'verified':
            return receipt

    try:
        if not shared_exists:
            check_identity(legacy[attempt_id], receipt['sharedIdentity'])
            publish_view(legacy[attempt_id], view)
        check_identity(view, receipt['sharedIdentity'])
        for key, path in legacy.items():
            identity = receipt['legacyIdentities'][key]
            if os.path.lexists(path):
                # Keep the verified root's identity for retries if removal stops midway.
                check_identity(path, identity)
                publish_view(path, retired[key])
            if os.path.lexists(retired[key]):
                check_identity(retired[key], identity)
                remove_tree(retired[key])
    except (OSError, ValueError) as error:
        receipt.update(status='failed', error=str(error), checkedAt=utc_now())
        write_receipt(receipt_path, receipt)
        raise
    receipt.pop('error', None)
    receipt.update(status='verified', checkedAt=utc_now(),
                   retiredViews=[str(path) for path in legacy.values() if str(path) != receipt['adoptedFrom']])
    write_receipt(receipt_path, receipt)
    return receipt


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['prepare', 'verify', 'consolidate'])
    parser.add_argument('work', type=Path)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('inventory_sha256')
    parser.add_argument('snapshot_id')
    parser.add_argument('attempt_id')
    parser.add_argument('--retire', action='append', default=[], metavar='ATTEMPT_ID')
    args = parser.parse_args()
    if not SHA256.fullmatch(args.inventory_sha256) or not args.snapshot_id.strip():
        parser.error('Supply a registered SHA-256 digest and snapshot ID.')
    if not all(ATTEMPT_ID.fullmatch(key) for key in [args.attempt_id, *args.retire]):
        parser.error('Use an attempt ID of the form s2-[a-z0-9-]+ or s4-[a-z0-9-]+.')
    if args.operation == 'consolidate' and not all(
            re.fullmatch(r's2-[a-z0-9-]+', key) for key in [args.attempt_id, *args.retire]):
        parser.error('Legacy input consolidation accepts only s2-... attempt IDs.')
    if args.retire and args.operation != 'consolidate':
        parser.error('Only consolidation accepts --retire.')
    if args.attempt_id in args.retire or len(set(args.retire)) != len(args.retire):
        parser.error('Use distinct --retire IDs other than the source attempt ID.')

    expected_hash = args.inventory_sha256.lower()
    source = args.work / 'snapshot'
    view = args.work / f'knip-input-{expected_hash}'
    real_path_stat(args.work, stat.S_ISDIR)
    real_path_stat(source, stat.S_ISDIR)
    records, directories = read_inventory(args.inventory.absolute(), expected_hash, args.snapshot_id)
    result = {
        'formatVersion': 1,
        'snapshotRef': args.snapshot_id,
        'attemptId': args.attempt_id,
        'status': 'verified',
        'operation': args.operation,
        'checkedAt': None,
        'sourceRoot': str(source),
        'viewRoot': str(view),
        'inventorySha256': expected_hash,
        'files': len(records),
        'bytes': sum(record['bytes'] for record in records.values()),
        'copyMethod': None,
        'unindexedInputsAvailable': False,
        'reused': True,
    }
    work_fd = os.open(args.work, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        lock = fcntl.LOCK_SH if args.operation == 'verify' else fcntl.LOCK_EX
        try:
            fcntl.flock(work_fd, lock | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError('Another inventory view operation is using this work directory.') from error
        if args.operation == 'consolidate':
            result = consolidate_view(args.work, view, args.attempt_id, args.retire, records, directories, result)
        else:
            if args.operation == 'prepare':
                result['copyMethod'], result['reused'] = prepare_view(
                    args.work, source, view, args.attempt_id, records, directories)
            else:
                verify_view(view, records, directories)
            result['checkedAt'] = utc_now()
    finally:
        os.close(work_fd)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        print(f'Inventory view failed: {error}', file=sys.stderr)
        sys.exit(1)
