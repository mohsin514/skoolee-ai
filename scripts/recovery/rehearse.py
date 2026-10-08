#!/usr/bin/env python3
"""Disposable loopback-only synthetic recovery proof. Never loads .env or starts the app."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
BASELINE = '20261008000000_verified_baseline'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--user', default='postgres')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--fault', choices=['missing-file', 'corrupt-record', 'migration'])
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    restore_started = None
    report = {'startedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'blocked',
              'dataClass': 'synthetic', 'notificationIsolation': 'No app, worker or notification SDK is executed; subprocess environment excludes all provider credentials.',
              'operatorSignOff': None, 'schoolReopenDecision': 'Requires operator review; synthetic proof is not production readiness.',
              'checks': [], 'fault': args.fault}
    # Do not inherit DATABASE_URL, dotenv configuration, SMTP, cloud credentials or runtime hooks.
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR', 'SystemRoot') if key in os.environ}
    env.update({'PGHOST': '127.0.0.1', 'PGPORT': str(args.port), 'PGUSER': args.user,
                'PGCONNECT_TIMEOUT': '5', 'PRISMA_HIDE_UPDATE_MESSAGE': '1'})
    # CI's disposable PostgreSQL service may use a password. Never include it in command/log text.
    if os.environ.get('RECOVERY_PG_PASSWORD'):
        env['PGPASSWORD'] = os.environ['RECOVERY_PG_PASSWORD']
    prefix = 'rehearsal_' + uuid.uuid4().hex[:12]
    databases = {name: prefix + '_' + name for name in ('clean', 'upgrade', 'restored', 'failure')}
    report['destination'] = {'host': '127.0.0.1', 'port': args.port, 'databases': databases}
    log = output / 'diagnostics.log'

    def run(command, *, database=None, input=None, expected=0):
        local = dict(env)
        if database:
            local['PGDATABASE'] = database
            # Prisma URL is passed only through a scrubbed environment, never command arguments.
            from urllib.parse import quote
            password = ':' + quote(env['PGPASSWORD'], safe='') if env.get('PGPASSWORD') else ''
            url = f"postgresql://{quote(args.user, safe='')}{password}@127.0.0.1:{args.port}/{database}"
            local.update(DATABASE_URL=url, DIRECT_URL=url)
        result = subprocess.run(command, cwd=output, env=local, input=input, text=True, capture_output=True)
        with log.open('a') as handle:
            text = result.stdout + result.stderr
            if env.get('PGPASSWORD'):
                text = text.replace(env['PGPASSWORD'], '[REDACTED]')
            handle.write(f"\n$ {command[0]} {command[1] if len(command) > 1 else ''} [exit={result.returncode}]\n{text}")
        if (expected == 0 and result.returncode != 0) or (expected != 0 and result.returncode == 0):
            raise RuntimeError(f'{command[0]} returned unexpected status {result.returncode}; inspect diagnostics.log')
        return result.stdout.strip()

    def sql(database, statement):
        return run(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], database=database, input=statement)

    prisma = str(ROOT / 'node_modules/.bin/prisma')
    execution = output / 'execution-prisma'
    execution.mkdir()
    shutil.copy(ROOT / 'prisma/schema.prisma', execution / 'schema.prisma')
    shutil.copytree(ROOT / 'prisma/migrations', execution / 'migrations')
    schema = str(execution / 'schema.prisma')

    def migrate(database, *arguments):
        return run([prisma, 'migrate', *arguments, '--schema', schema], database=database) if arguments[0] != 'diff' else run([prisma, 'migrate', *arguments], database=database)

    def snapshot(database, predecessor=None):
        # Restore compares every column. Upgrade compares every predecessor column;
        # adding a column must not masquerade as changing an existing record.
        names = sql(database, "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename;").splitlines()
        result = {}
        for name in names:
            if not name.replace('_', '').isalnum():
                raise RuntimeError('Unexpected table identifier')
            columns = predecessor[name]['columns'] if predecessor and name in predecessor else sql(database,
                f"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='{name}' ORDER BY ordinal_position;").splitlines()
            if any(not column.replace('_', '').isalnum() for column in columns):
                raise RuntimeError('Unexpected column identifier')
            projection = ', '.join(f'"{column}"' for column in columns)
            rows = sql(database, f'SELECT row_to_json(t)::text FROM (SELECT {projection} FROM public."{name}") t ORDER BY row_to_json(t)::text;')
            result[name] = {'rows': len(rows.splitlines()), 'sha256': hashlib.sha256(rows.encode()).hexdigest(), 'columns': columns}
        return result

    def check(name, condition):
        report['checks'].append({'name': name, 'passed': bool(condition)})
        if not condition:
            raise RuntimeError(name)

    try:
        for database in databases.values():
            run(['createdb', database])
        clean, upgrade, restored, failure = (databases[name] for name in ('clean', 'upgrade', 'restored', 'failure'))
        migrate(clean, 'deploy')
        migrate(clean, 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--exit-code')
        check('clean-provisioning-and-schema-drift', True)
        # The supported predecessor is dev 9c5193d's schema-push release. The frozen SQL
        # represents that schema, without inventing a successful legacy migration history.
        baseline = (ROOT / 'prisma/migrations' / BASELINE / 'migration.sql').read_text()
        sql(upgrade, baseline)
        sql(upgrade, (ROOT / 'scripts/recovery/fixtures.sql').read_text())
        before = snapshot(upgrade)
        migrate(upgrade, 'resolve', '--applied', BASELINE)
        migrate(upgrade, 'deploy')
        after = snapshot(upgrade)
        preserved = snapshot(upgrade, predecessor=before)
        check('populated-schema-push-adoption-and-upgrade', all(preserved.get(name) == value for name, value in before.items()))
        # Enrollment migration deliberately backfills retained source context;
        # every other newly introduced table must still start empty.
        check('additive-migration-tables-initially-empty', all(value['rows'] == 0 for name, value in after.items() if name not in before and name != 'student_enrollments'))
        check('enrollment-backfill-complete', sql(upgrade, "SELECT (SELECT count(*) FROM student_enrollments) = (SELECT count(*) FROM students) + (SELECT count(*) FROM attendance) + (SELECT count(*) FROM report_cards) + (SELECT count(*) FROM invoices) AND NOT EXISTS (SELECT 1 FROM invoices WHERE enrollment_id IS NULL);") == 't')
        sql(upgrade, (ROOT / 'scripts/recovery/outbox-fixtures.sql').read_text())
        migrate(upgrade, 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--exit-code')
        report['supportedUpgradePaths'] = ['dev-9c5193d-schema-push-to-versioned-baseline', 'verified-baseline-to-head']
        # Quiesced synthetic source. Marker is written immediately before dump and recovered
        # from the restored DB; it is not inferred from a provider plan or upload timestamp.
        sql(upgrade, 'CREATE TABLE recovery_marker (point timestamptz NOT NULL); INSERT INTO recovery_marker VALUES (clock_timestamp());')
        backup_start = dt.datetime.now(dt.timezone.utc)
        run(['pg_dump', '--format=custom', '--no-owner', '--file', str(output / 'database.dump')], database=upgrade)
        source_objects = output / 'backup-objects'
        (source_objects / 'synthetic').mkdir(parents=True)
        (source_objects / 'synthetic/attachment.txt').write_text('Synthetic recovery attachment. No pupil data.\n')
        manifest = {'synthetic/attachment.txt': hashlib.sha256((source_objects / 'synthetic/attachment.txt').read_bytes()).hexdigest()}
        (output / 'object-manifest.json').write_text(json.dumps(manifest, indent=2))
        restore_started = time.monotonic()
        run(['pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname', restored, str(output / 'database.dump')])
        destination_objects = output / 'restored-objects'
        shutil.copytree(source_objects, destination_objects)
        if args.fault == 'missing-file':
            (destination_objects / 'synthetic/attachment.txt').unlink()
        if args.fault == 'corrupt-record':
            sql(restored, "UPDATE marks SET marks_obtained=0;")
        report['actualRestoredPointUtc'] = sql(restored, 'SELECT point AT TIME ZONE \'UTC\' FROM recovery_marker;') + ' UTC'
        report['backupStartedAt'] = backup_start.isoformat()
        report['backupAgeSecondsAtRestore'] = (dt.datetime.now(dt.timezone.utc) - backup_start).total_seconds()
        check('all-record-counts-and-content-hashes', snapshot(upgrade) == snapshot(restored))
        check('invoice-balance-and-grade', sql(restored, 'SELECT total_amount=total_amount_paid+balance_due FROM invoices;') == 't' and sql(restored, 'SELECT marks_obtained FROM marks;') == '83')
        keys = sql(restored, 'SELECT file_key FROM student_documents ORDER BY file_key;').splitlines()
        check('referenced-files-have-matching-manifest', set(keys) == set(manifest))
        for key in keys:
            path = destination_objects / key
            check('file-reconciliation:' + key, path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == manifest[key])
        report['verifiedRestoreElapsedSeconds'] = round(time.monotonic() - restore_started, 3)
        report['restoreAttemptElapsedSeconds'] = report['verifiedRestoreElapsedSeconds']
        (output / 'reconciliation.json').write_text(json.dumps(snapshot(restored), indent=2))
        # Exercise a failed real Prisma migration, atomic rollback, blocked replay and
        # reviewed forward repair in an isolated copy of the migration directory.
        fixture_prisma = output / 'failure-prisma'
        fixture_prisma.mkdir()
        shutil.copy(ROOT / 'prisma/schema.prisma', fixture_prisma / 'schema.prisma')
        shutil.copytree(ROOT / 'prisma/migrations', fixture_prisma / 'migrations')
        broken = fixture_prisma / 'migrations/29990101000000_failure_drill'
        broken.mkdir()
        (broken / 'migration.sql').write_text('BEGIN; CREATE TABLE recovery_probe(id int); SELECT 1/0; COMMIT;\n')
        command = [prisma, 'migrate', 'deploy', '--schema', str(fixture_prisma / 'schema.prisma')]
        run(command, database=failure, expected=1)
        check('interrupted-migration-rolled-back', sql(failure, "SELECT to_regclass('public.recovery_probe') IS NULL;") == 't')
        run(command, database=failure, expected=1)
        check('failed-migration-blocks-replay', True)
        if args.fault == 'migration':
            raise RuntimeError('Injected failed migration: release promotion blocked')
        run([prisma, 'migrate', 'resolve', '--rolled-back', broken.name, '--schema', str(fixture_prisma / 'schema.prisma')], database=failure)
        (broken / 'migration.sql').write_text('BEGIN; CREATE TABLE recovery_probe(id int); COMMIT;\n')
        run(command, database=failure)
        check('reviewed-forward-repair', sql(failure, "SELECT to_regclass('public.recovery_probe') IS NOT NULL;") == 't')
        report['status'] = 'verified-awaiting-sign-off'
        report['databaseBackupSha256'] = hashlib.sha256((output / 'database.dump').read_bytes()).hexdigest()
        report['baselineSqlSha256'] = hashlib.sha256(baseline.encode()).hexdigest()
    except Exception as error:
        report['error'] = str(error)
    finally:
        if restore_started is not None and 'restoreAttemptElapsedSeconds' not in report:
            report['restoreAttemptElapsedSeconds'] = round(time.monotonic() - restore_started, 3)
        report['elapsedSeconds'] = round(time.monotonic() - started, 3)
        report['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        report['diagnostics'] = 'diagnostics.log'
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))
        # Deliberately retain isolated DBs and artifacts on failure for diagnosis.
        if report['status'] != 'blocked':
            for database in databases.values():
                run(['dropdb', database])
    return 1 if report['status'] == 'blocked' else 0


if __name__ == '__main__':
    raise SystemExit(main())
