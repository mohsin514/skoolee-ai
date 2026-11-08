import json
from pathlib import Path
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/recovery'))
from preflight import application_configuration, rehearsal_environment

ROOT = Path(__file__).resolve().parents[2]


class PreflightTests(unittest.TestCase):
    def envelope(self):
        return {'PATH': '/synthetic/bin', 'PGHOST': '127.0.0.1', 'PGPORT': '55439',
                'PGUSER': 'synthetic', 'PGCONNECT_TIMEOUT': '5'}

    def test_isolated_config_is_not_application_or_provider_readiness(self):
        report = rehearsal_environment(self.envelope())
        self.assertEqual(report['status'], 'ready-for-synthetic-rehearsal')
        self.assertEqual(report['application']['applicationReadiness'], 'unverified')
        self.assertEqual(report['providerHealth'], 'not-tested')
        self.assertTrue(all(item['state'] == 'missing' for item in report['application']['fields']))

    def test_external_or_malformed_destination_is_blocked_without_values(self):
        for key, value in [('PGHOST', 'secret-db.invalid'), ('PGPORT', '99999'),
                           ('PGPORT', 'bad-port-secret'), ('PGUSER', 'bad-role-secret\n'),
                           ('PGCONNECT_TIMEOUT', 'unbounded')]:
            with self.subTest(key=key, value=value):
                report = rehearsal_environment({**self.envelope(), key: value})
                self.assertEqual(report['status'], 'blocked')
                self.assertNotIn(value, json.dumps(report))

    def test_any_inherited_application_secret_or_runtime_hook_blocks(self):
        for key in ('DATABASE_URL', 'DIRECT_URL', 'SMTP_PASS', 'OPENAI_API_KEY', 'NODE_OPTIONS', 'PGSERVICEFILE', 'PGOPTIONS', 'BASH_ENV', 'unknown-secret-name'):
            report = rehearsal_environment({**self.envelope(), key: 'never-display-this'})
            self.assertEqual(report['status'], 'blocked')
            self.assertNotIn('never-display-this', json.dumps(report))
            self.assertNotIn('unknown-secret-name', json.dumps(report))
        report = rehearsal_environment({**self.envelope(), 'PGPASSWORD': 'synthetic-local-password'})
        self.assertEqual(report['status'], 'ready-for-synthetic-rehearsal')
        self.assertNotIn('synthetic-local-password', json.dumps(report))

    def test_application_presence_is_never_a_successful_probe(self):
        config = {'DATABASE_URL': 'postgresql://private:secret@private-db.invalid/secret-data',
                  'DIRECT_URL': 'postgresql://private:secret@private-db.invalid/secret-data',
                  'AUTH_SECRET': 'synthetic-session-secret-only-' * 2,
                  'NEXT_PUBLIC_APP_URL': 'https://private-app.invalid',
                  'AI_PROVIDER': 'openai', 'OPENAI_API_KEY': 'secret-provider',
                  'S3_BUCKET_NAME': 'secret-bucket', 'S3_ACCESS_KEY_ID': 'secret-storage', 'S3_SECRET_ACCESS_KEY': 'secret-object',
                  'SMTP_HOST': 'secret-mail.invalid', 'SMTP_USER': 'secret-sender', 'SMTP_PASS': 'secret-mail',
                  'STRIPE_SECRET_KEY': 'secret-payment', 'STRIPE_WEBHOOK_SECRET': 'secret-webhook',
                  'REDIS_URL': 'rediss://private:secret@private-queue.invalid'}
        report = application_configuration(config)
        self.assertTrue(all(item['state'] == 'configured-unverified' for item in report['fields'] + report['integrations']))
        self.assertTrue(all(item['runtimeProbe'] == 'not-run' for item in report['integrations']))
        serialized = json.dumps(report)
        for value in config.values():
            self.assertNotIn(value, serialized)

    def test_missing_partial_invalid_and_disabled_are_distinct(self):
        report = application_configuration({'DATABASE_URL': 'secret-invalid', 'AI_PROVIDER': 'unknown',
                                            'S3_BUCKET_NAME': 'secret-bucket', 'REDIS_URL': 'https://secret.invalid',
                                            'EMAIL_DEV_MODE': 'true'})
        fields = {item['name']: item for item in report['fields']}
        integrations = {item['name']: item for item in report['integrations']}
        self.assertEqual(fields['DATABASE_URL']['state'], 'invalid')
        self.assertEqual(fields['DIRECT_URL']['state'], 'missing')
        self.assertEqual(integrations['AI generation']['state'], 'invalid')
        self.assertEqual(integrations['Private source storage']['state'], 'incomplete')
        self.assertEqual(integrations['Email delivery']['state'], 'disabled')
        self.assertEqual(integrations['Durable queue']['state'], 'invalid')
        self.assertNotIn('secret-invalid', json.dumps(report))
        disabled = application_configuration({'DISABLE_OUTBOUND_MESSAGES': 'true'})
        self.assertEqual(next(item for item in disabled['integrations'] if item['name'] == 'Email delivery')['state'], 'disabled')

    def test_named_examples_do_not_prove_deployed_destinations(self):
        for path in (ROOT / 'scripts/setup-vercel-envs.sh', ROOT / 'scripts/provision-supabase-envs.sh'):
            self.assertEqual(subprocess.run(['bash', '-n', str(path)], capture_output=True).returncode, 0)
        # --print is read-only and must not invoke Vercel, provision or read dotenv.
        result = subprocess.run(['bash', str(ROOT / 'scripts/setup-vercel-envs.sh'), '--print'],
                                capture_output=True, text=True, env={'PATH': '/usr/bin:/bin'})
        self.assertEqual(result.returncode, 0)
        self.assertIn('distinct Supabase DB', result.stdout)
        self.assertIn('Keep Git auto-deploy disabled', result.stdout)
        self.assertNotIn('SAME Supabase DB', result.stdout)


if __name__ == '__main__':
    unittest.main()
