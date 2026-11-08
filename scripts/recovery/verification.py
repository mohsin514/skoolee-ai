"""Pure recovery-evidence contracts; no database, network or credential access."""
import hashlib
import json
from pathlib import Path
import re

REQUIRED_CHECKS = {
    'redacted-environment-preflight',
    'published-artifact-bytes-and-reference-restored', 'post-restore-job-retry-and-tenant-load-smoke',
    'clean-provisioning-and-schema-drift', 'populated-schema-push-adoption-and-upgrade',
    'additive-migration-tables-initially-empty', 'enrollment-backfill-complete',
    'backup-artifact-checksum', 'all-record-counts-and-content-hashes',
    'migration-ledger-restored', 'schema-security-catalog-restored',
    'invoice-balance-and-grade', 'tenant-ownership-reconciled',
    'queued-effects-reconciled-without-execution', 'referenced-files-have-matching-manifest',
    'file-reconciliation:synthetic/attachment.txt', 'file-reconciliation:synthetic/other-attachment.txt', 'interrupted-migration-rolled-back',
    'failed-migration-blocks-replay', 'reviewed-forward-repair', 'source-inputs-unchanged',
}


def manifest_digest(manifest):
    return hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def source_manifest(root):
    """Hash only reproducibility inputs, never dotenv/secrets or database files."""
    root = Path(root)
    paths = [root / name for name in ('prisma/schema.prisma', 'package.json', 'pnpm-lock.yaml',
                                      '.github/workflows/recovery.yml', '.github/workflows/deploy.yml',
                                      'scripts/setup-vercel-envs.sh', 'scripts/provision-supabase-envs.sh',
                                      'docs/ENVIRONMENTS.md', 'src/lib/queue/outbox.ts', 'src/lib/db/tenant-context.ts',
                                      'src/lib/email/readiness.ts', 'src/lib/email.ts', 'src/lib/payments/configuration.ts',
                                      'src/lib/payments/gateway.ts', 'src/app/api/onboarding/package/route.ts',
                                      'src/app/api/stripe/checkout/route.ts')]
    paths += sorted((root / 'prisma/migrations').glob('*/migration.sql'))
    paths += [root / 'prisma/migrations/migration_lock.toml']
    paths += sorted((root / 'scripts/recovery').glob('*.py'))
    paths += sorted((root / 'scripts/recovery').glob('*.sql'))
    paths += sorted((root / 'scripts/recovery').glob('*.ts'))
    paths += sorted((root / 'tests/recovery').glob('*.py'))
    paths += sorted((root / 'tests/recovery').glob('*.ts'))
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(paths)}


def safe_object_path(root, key):
    """References may not escape the isolated object root or follow symlinks."""
    root = Path(root).resolve()
    if not isinstance(key, str) or not key or '\\' in key or '\x00' in key:
        raise ValueError('Invalid object reference')
    relative = Path(key)
    if relative.is_absolute() or any(part in ('.', '..') for part in relative.parts):
        raise ValueError('Object reference must stay inside the isolated destination')
    candidate = root / relative
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Symlinked object reference is not a restored object')
    if not candidate.resolve().is_relative_to(root):
        raise ValueError('Object reference escaped the isolated destination')
    return candidate


def acceptance_errors(report, release):
    if not isinstance(report, dict):
        return ['Recovery report must be an object']
    def hex_value(value, length):
        return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{' + str(length) + '}', value)
    errors = []
    if report.get('formatVersion') != 2 or report.get('dataClass') != 'synthetic':
        errors.append('Only current synthetic rehearsal evidence can be accepted')
    if report.get('status') != 'verified-awaiting-sign-off':
        errors.append('Cannot accept a blocked or unverified rehearsal')
    checks = report.get('checks', [])
    if not isinstance(checks, list) or not checks or any(not isinstance(c, dict) or c.get('passed') is not True for c in checks):
        errors.append('Every required check must have passed')
    names = {c.get('name') for c in checks if isinstance(c, dict) and isinstance(c.get('name'), str)} if isinstance(checks, list) else set()
    if not REQUIRED_CHECKS <= names:
        errors.append('Required recovery checks are missing')
    source = report.get('source', {})
    if not isinstance(source, dict) or not hex_value(source.get('commit'), 40) or source.get('commit') != release:
        errors.append('Release must match the exact commit recorded by the rehearsal')
    if not isinstance(source, dict) or not hex_value(source.get('inputsSha256'), 64) or not isinstance(source.get('worktreeDirty'), bool):
        errors.append('Reproducibility input provenance is missing')
    if not hex_value(report.get('databaseBackupSha256'), 64):
        errors.append('Verified backup checksum is missing')
    destination = report.get('destination', {})
    databases = destination.get('databases', {}) if isinstance(destination, dict) else {}
    if not isinstance(destination, dict) or destination.get('host') != '127.0.0.1' or not isinstance(databases, dict) or set(databases) != {'clean', 'upgrade', 'restored', 'failure'} or any(not isinstance(name, str) or not re.fullmatch(r'rehearsal_[0-9a-f]{12}_(clean|upgrade|restored|failure)', name) for name in databases.values()):
        errors.append('Isolated synthetic destination is missing')
    if not report.get('actualRestoredPointUtc') or any(not isinstance(report.get(key), (int, float)) or isinstance(report.get(key), bool) or report[key] < 0 for key in ('verifiedRestoreElapsedSeconds', 'backupAgeSecondsAtRestore')):
        errors.append('Measured recovery point, backup age and restore elapsed time are required')
    return errors
