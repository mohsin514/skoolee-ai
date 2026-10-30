"""Offline recovery configuration checks. Never loads dotenv or contacts a provider.

Callers pass an explicit mapping; reports contain fixed variable names, purposes
and states only. Configuration presence never means a runtime integration passed.
"""
from urllib.parse import urlsplit
import re

SUBPROCESS_KEYS = frozenset(('PATH', 'HOME', 'TMPDIR', 'SystemRoot', 'PGHOST',
    'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGCONNECT_TIMEOUT', 'PRISMA_HIDE_UPDATE_MESSAGE'))


def _present(config, key):
    return isinstance(config.get(key), str) and bool(config[key].strip())


def _url(value, schemes):
    try:
        parsed = urlsplit(value)
        return parsed.scheme in schemes and bool(parsed.hostname) and (parsed.port is None or 1 <= parsed.port <= 65535)
    except (ValueError, TypeError, AttributeError):
        return False


def application_configuration(config):
    """Describe known app inputs without authorizing a destination or execution.

    This is an operator inventory, not the application's provider policy. A
    deployment must still run its provider-owned health checks and confirm tenant
    configuration. This function cannot detect valid-looking wrong credentials.
    """
    fields = []
    for key, purpose, validator in (
        ('DATABASE_URL', 'Runtime database connection', lambda v: _url(v, ('postgres', 'postgresql'))),
        ('DIRECT_URL', 'Migration database connection', lambda v: _url(v, ('postgres', 'postgresql'))),
        ('AUTH_SECRET', 'Environment-specific session signing material', lambda v: isinstance(v, str) and len(v) >= 32),
        ('NEXT_PUBLIC_APP_URL', 'Built application origin', lambda v: _url(v, ('http', 'https'))),
    ):
        state = 'missing' if not _present(config, key) else 'configured-unverified' if validator(config[key]) else 'invalid'
        fields.append({'name': key, 'purpose': purpose, 'state': state})

    def integration(name, keys, *, disabled=False, invalid=False):
        present = [key for key in keys if _present(config, key)]
        state = 'disabled' if disabled else 'invalid' if invalid else 'missing' if not present else 'configured-unverified' if len(present) == len(keys) else 'incomplete'
        return {'name': name, 'variables': list(keys), 'state': state, 'runtimeProbe': 'not-run'}

    # No default/fallback provider or implicit environment identity is inferred.
    provider = config.get('AI_PROVIDER')
    ai_keys = ('AI_PROVIDER', 'OPENAI_API_KEY') if provider == 'openai' else ('AI_PROVIDER', 'OLLAMA_BASE_URL') if provider == 'ollama' else ('AI_PROVIDER', 'AI_PROVIDER_ORDER')
    ai_invalid = _present(config, 'AI_PROVIDER') and (provider not in ('openai', 'ollama', 'auto', 'pollinations') or
        provider == 'ollama' and _present(config, 'OLLAMA_BASE_URL') and not _url(config['OLLAMA_BASE_URL'], ('http', 'https')))
    ai = integration('AI generation', ai_keys, invalid=ai_invalid)
    # An auto/public-provider configuration needs the gateway's policy validation;
    # name presence alone is insufficient even for syntactic readiness.
    if provider in ('auto', 'pollinations') and ai['state'] == 'configured-unverified':
        ai['state'] = 'policy-review-required'
    storage = integration('Private source storage', ('SCHOOL_AI_STORAGE_DIR',)) if _present(config, 'SCHOOL_AI_STORAGE_DIR') else integration('Private source storage', ('S3_BUCKET_NAME', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'))
    if _present(config, 'SCHOOL_AI_STORAGE_DIR') and not config['SCHOOL_AI_STORAGE_DIR'].startswith('/'):
        storage['state'] = 'invalid'
    integrations = [ai, storage,
        integration('Email delivery', ('SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'), disabled=config.get('EMAIL_DEV_MODE') == 'true' or config.get('DISABLE_OUTBOUND_MESSAGES') == 'true'),
        integration('Stripe payments', ('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET')),
        integration('Durable queue', ('REDIS_URL',), invalid=_present(config, 'REDIS_URL') and not _url(config['REDIS_URL'], ('redis', 'rediss')))]
    return {'fields': fields, 'integrations': integrations, 'runtimeProbes': 'not-run',
            'applicationReadiness': 'unverified',
            'nextStep': 'Confirm isolated destination and secrets ownership, then run provider-owned sandbox, storage, queue and application smoke checks. No value or valid-looking credential proves access.'}


def rehearsal_environment(env):
    """Fail before DB writes if the synthetic subprocess envelope is broadened."""
    checks = []
    def check(name, purpose, valid):
        checks.append({'name': name, 'purpose': purpose, 'state': 'valid' if valid else 'invalid'})
    check('PGHOST', 'Disposable loopback database; never a remote host', env.get('PGHOST') == '127.0.0.1')
    port = env.get('PGPORT', '')
    check('PGPORT', 'Explicit disposable database port', isinstance(port, str) and bool(re.fullmatch(r'[0-9]{1,5}', port)) and 1 <= int(port) <= 65535)
    user = env.get('PGUSER', '')
    check('PGUSER', 'Explicit synthetic database role', isinstance(user, str) and bool(re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_-]{0,62}', user)))
    check('PGCONNECT_TIMEOUT', 'Bounded local connection wait', env.get('PGCONNECT_TIMEOUT') == '5')
    check('SUBPROCESS_ENVIRONMENT', 'Only approved process and loopback database variables; no app/provider credentials', set(env) <= SUBPROCESS_KEYS and all(isinstance(v, str) for v in env.values()))
    return {'formatVersion': 1, 'environment': 'isolated-synthetic-staging', 'dataClass': 'synthetic',
            'status': 'ready-for-synthetic-rehearsal' if all(item['state'] == 'valid' for item in checks) else 'blocked',
            'networkActions': 'none', 'checks': checks,
            'application': application_configuration({}),
            'executionBoundary': 'The rehearsal starts no application server, worker entrypoint, payment, AI or notification SDK. Post-restore smoke invokes providerless handlers only. Missing app configuration is intentional for this profile.',
            'providerHealth': 'not-tested', 'productionReadiness': 'unverified'}
