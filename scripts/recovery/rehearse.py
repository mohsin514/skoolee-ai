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
from urllib.parse import quote
from verification import manifest_digest, safe_object_path, source_manifest
from preflight import rehearsal_environment

ROOT = Path(__file__).resolve().parents[2]
BASELINE = '20261008000000_verified_baseline'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--user', default='postgres')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--fault', choices=['missing-file', 'corrupt-file', 'corrupt-record', 'corrupt-backup', 'schema-drift', 'migration'])
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Choose a valid port on a disposable loopback PostgreSQL instance')
    output = args.output.resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    started = time.monotonic()
    restore_started = None
    report = {'formatVersion': 2, 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'blocked',
              'dataClass': 'synthetic', 'notificationIsolation': 'No app server, worker entrypoint or provider SDK is executed; subprocess environment excludes all provider credentials. Post-restore smoke uses providerless in-process handlers only.',
              'operatorSignOff': None, 'schoolReopenDecision': 'Requires operator review; synthetic proof is not production readiness.',
              'limitations': ['Local synthetic database and files only; provider PITR, storage/KMS, credentials and traffic recovery require separate evidence.',
                              'Schema fingerprint excludes object ownership; deployed roles and grants require independent environment verification.',
                              'Pending job receipts are reconciled without running workers; provider-side effects and controlled replay require domain-owner review.',
                              'A dirty worktree is test evidence only, not evidence for promoting the recorded commit.'],
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
            password = ':' + quote(env['PGPASSWORD'], safe='') if env.get('PGPASSWORD') else ''
            url = f"postgresql://{quote(args.user, safe='')}{password}@127.0.0.1:{args.port}/{database}"
            local.update(DATABASE_URL=url, DIRECT_URL=url)
        result = subprocess.run(command, cwd=output, env=local, input=input, text=True, capture_output=True)
        with log.open('a') as handle:
            text = result.stdout + result.stderr
            if env.get('PGPASSWORD'):
                text = text.replace(env['PGPASSWORD'], '[REDACTED]')
                text = text.replace(quote(env['PGPASSWORD'], safe=''), '[REDACTED]')
            handle.write(f"\n$ {command[0]} {command[1] if len(command) > 1 else ''} [exit={result.returncode}]\n{text}")
        if (expected == 0 and result.returncode != 0) or (expected != 0 and result.returncode == 0):
            raise RuntimeError(f'{command[0]} returned unexpected status {result.returncode}; inspect diagnostics.log')
        return result.stdout.strip()

    def sql(database, statement):
        return run(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], database=database, input=statement)

    prisma = str(ROOT / 'node_modules/.bin/prisma')
    inputs = source_manifest(ROOT)
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

    def ledger(database):
        return sql(database, 'SELECT row_to_json(m)::text FROM public._prisma_migrations m ORDER BY migration_name, id;')

    def schema_fingerprint(database):
        # Compare PostgreSQL's canonical definitions, not dump text: harmless
        # nested CHECK parentheses can flatten when the dump is parsed again.
        catalog = sql(database, (ROOT / 'scripts/recovery/catalog-snapshot.sql').read_text())
        return hashlib.sha256(catalog.encode()).hexdigest()

    def check(name, condition):
        report['checks'].append({'name': name, 'passed': bool(condition)})
        if not condition:
            raise RuntimeError(name)

    def stage(name):
        report['currentStage'] = name
        print(f"Recovery stage: {name} (elapsed {time.monotonic() - started:.1f}s)", flush=True)

    try:
        stage('source-and-isolated-destination')
        preflight = rehearsal_environment(env)
        report['environmentPreflight'] = preflight
        (output / 'environment-preflight.json').write_text(json.dumps(preflight, indent=2) + '\n')
        check('redacted-environment-preflight', preflight['status'] == 'ready-for-synthetic-rehearsal')
        commit = run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'])
        dirty = bool(run(['git', '-C', str(ROOT), 'status', '--porcelain']))
        report['source'] = {'commit': commit, 'worktreeDirty': dirty, 'inputsSha256': manifest_digest(inputs)}
        report['releaseEvidenceEligible'] = not dirty
        (output / 'input-manifest.json').write_text(json.dumps(inputs, indent=2) + '\n')
        for database in databases.values():
            run(['createdb', database])
        clean, upgrade, restored, failure = (databases[name] for name in ('clean', 'upgrade', 'restored', 'failure'))
        stage('clean-provisioning-and-drift')
        migrate(clean, 'deploy')
        migrate(clean, 'status')
        migrate(clean, 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--exit-code')
        check('clean-provisioning-and-schema-drift', True)
        # The supported predecessor is dev 9c5193d's schema-push release. The frozen SQL
        # represents that schema, without inventing a successful legacy migration history.
        stage('populated-supported-upgrade')
        baseline = (execution / 'migrations' / BASELINE / 'migration.sql').read_text()
        sql(upgrade, baseline)
        sql(upgrade, (ROOT / 'scripts/recovery/fixtures.sql').read_text())
        before = snapshot(upgrade)
        migrate(upgrade, 'resolve', '--applied', BASELINE)
        migrate(upgrade, 'deploy')
        migrate(upgrade, 'status')
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
        stage('database-and-object-backup')
        sql(upgrade, 'CREATE TABLE recovery_marker (point timestamptz NOT NULL); INSERT INTO recovery_marker VALUES (clock_timestamp());')
        backup_start = dt.datetime.now(dt.timezone.utc)
        run(['pg_dump', '--format=custom', '--no-owner', '--file', str(output / 'database.dump')], database=upgrade)
        report['databaseBackupSha256'] = hashlib.sha256((output / 'database.dump').read_bytes()).hexdigest()
        restore_dump = output / 'restore-input.dump'
        shutil.copyfile(output / 'database.dump', restore_dump)
        if args.fault == 'corrupt-backup':
            restore_dump.write_bytes(b'Synthetic damaged archive. Never restore this.\n')
        check('backup-artifact-checksum', hashlib.sha256(restore_dump.read_bytes()).hexdigest() == report['databaseBackupSha256'])
        run(['pg_restore', '--list', str(restore_dump)])
        source_objects = output / 'backup-objects'
        (source_objects / 'synthetic').mkdir(parents=True)
        (source_objects / 'synthetic/attachment.txt').write_text('Synthetic recovery attachment. No pupil data.\n')
        (source_objects / 'synthetic/other-attachment.txt').write_text('Separate synthetic tenant attachment. No pupil data.\n')
        manifest = {key: hashlib.sha256((source_objects / key).read_bytes()).hexdigest()
                    for key in ('synthetic/attachment.txt', 'synthetic/other-attachment.txt')}
        (output / 'object-manifest.json').write_text(json.dumps(manifest, indent=2))
        restore_started = time.monotonic()
        stage('restore-and-reconcile')
        run(['pg_restore', '--exit-on-error', '--no-owner', '--dbname', restored, str(restore_dump)])
        destination_objects = output / 'restored-objects'
        shutil.copytree(source_objects, destination_objects)
        if args.fault == 'missing-file':
            (destination_objects / 'synthetic/attachment.txt').unlink()
        if args.fault == 'corrupt-file':
            (destination_objects / 'synthetic/attachment.txt').write_text('Synthetic wrong object bytes.\n')
        if args.fault == 'corrupt-record':
            sql(restored, "UPDATE marks SET marks_obtained=0;")
        if args.fault == 'schema-drift':
            sql(restored, "CREATE VIEW recovery_unexpected_view AS SELECT 'synthetic schema drift'::text AS value;")
        report['actualRestoredPointUtc'] = sql(restored, 'SELECT point AT TIME ZONE \'UTC\' FROM recovery_marker;') + ' UTC'
        report['backupStartedAt'] = backup_start.isoformat()
        report['backupAgeSecondsAtRestore'] = (dt.datetime.now(dt.timezone.utc) - backup_start).total_seconds()
        check('all-record-counts-and-content-hashes', snapshot(upgrade) == snapshot(restored))
        check('migration-ledger-restored', ledger(upgrade) == ledger(restored))
        report['restoredSchemaSha256'] = schema_fingerprint(restored)
        check('schema-security-catalog-restored', schema_fingerprint(upgrade) == report['restoredSchemaSha256'])
        check('invoice-balance-and-grade', sql(restored, 'SELECT count(*)=2 AND bool_and(total_amount=total_amount_paid+balance_due) FROM invoices;') == 't' and sql(restored, 'SELECT count(*)=2 AND sum(marks_obtained)=154 FROM marks;') == 't')
        check('tenant-ownership-reconciled', sql(restored, "SELECT NOT EXISTS (SELECT 1 FROM marks m JOIN students s ON s.id=m.student_id JOIN exams e ON e.id=m.exam_id WHERE m.school_id<>s.school_id OR m.school_id<>e.school_id OR m.campus_id<>s.campus_id OR m.campus_id<>e.campus_id) AND NOT EXISTS (SELECT 1 FROM student_documents d JOIN students s ON s.id=d.student_id WHERE d.school_id<>s.school_id);") == 't')
        check('queued-effects-reconciled-without-execution', sql(restored, "SELECT (SELECT count(*) FROM workflow_jobs WHERE id='recovery-event' AND state='retrying' AND checkpoint=1)=1 AND (SELECT count(*) FROM workflow_effects WHERE id='recovery-effect' AND identity='confirmed-before-crash' AND state='committed')=1;") == 't')
        check('published-artifact-bytes-and-reference-restored', sql(restored, "SELECT count(*)=1 FROM report_versions v JOIN report_cards r ON r.published_version_id=v.id AND r.school_id=v.school_id WHERE v.id='recovery-published-version' AND v.published_at IS NOT NULL AND encode(v.document_bytes,'hex')='255044462d312e340a2553796e746865746963207265636f766572792061727469666163740a2525454f460a';") == 't')
        keys = sql(restored, 'SELECT file_key FROM student_documents ORDER BY file_key;').splitlines()
        check('referenced-files-have-matching-manifest', set(keys) == set(manifest))
        for key in keys:
            path = safe_object_path(destination_objects, key)
            check('file-reconciliation:' + key, path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == manifest[key])
        report['verifiedRestoreElapsedSeconds'] = round(time.monotonic() - restore_started, 3)
        report['restoreAttemptElapsedSeconds'] = report['verifiedRestoreElapsedSeconds']
        (output / 'reconciliation.json').write_text(json.dumps(snapshot(restored), indent=2))
        stage('post-restore-providerless-workflow-smoke')
        run(['node', '--import', str(ROOT / 'node_modules/tsx/dist/loader.mjs'), str(ROOT / 'scripts/recovery/job-smoke.ts')], database=restored)
        report['jobSmoke'] = json.loads((output / 'job-smoke.json').read_text())
        check('post-restore-job-retry-and-tenant-load-smoke', report['jobSmoke'].get('status') == 'passed')
        # Exercise a failed real Prisma migration, atomic rollback, blocked replay and
        # reviewed forward repair in an isolated copy of the migration directory.
        stage('migration-failure-and-forward-recovery')
        fixture_prisma = output / 'failure-prisma'
        fixture_prisma.mkdir()
        shutil.copy(execution / 'schema.prisma', fixture_prisma / 'schema.prisma')
        shutil.copytree(execution / 'migrations', fixture_prisma / 'migrations')
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
        check('source-inputs-unchanged', inputs == source_manifest(ROOT))
        report['status'] = 'verified-awaiting-sign-off'
        report['currentStage'] = 'awaiting-human-review'
        report['baselineSqlSha256'] = hashlib.sha256(baseline.encode()).hexdigest()
    except Exception as error:
        report['error'] = str(error)
    finally:
        if restore_started is not None and 'restoreAttemptElapsedSeconds' not in report:
            report['restoreAttemptElapsedSeconds'] = round(time.monotonic() - restore_started, 3)
        # Preserve all failed destinations. Successful cleanup is itself recorded;
        # never print a successful report before the cleanup attempt finishes.
        report['cleanup'] = 'retained-for-diagnosis'
        if report['status'] != 'blocked':
            try:
                for database in databases.values():
                    run(['dropdb', database])
                report['cleanup'] = 'isolated-databases-removed'
            except Exception as error:
                report['status'] = 'blocked'
                report['cleanup'] = 'incomplete-see-diagnostics'
                report['error'] = str(error)
        report['elapsedSeconds'] = round(time.monotonic() - started, 3)
        report['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        report['diagnostics'] = 'diagnostics.log'
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, indent=2))
    return 1 if report['status'] == 'blocked' else 0


if __name__ == '__main__':
    raise SystemExit(main())
