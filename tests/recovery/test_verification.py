import copy
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/recovery'))
from verification import acceptance_errors, manifest_digest, safe_object_path, source_manifest
from test_decision import RELEASE, valid_report


class VerificationTests(unittest.TestCase):
    def test_operator_view_escapes_text_and_omits_unselected_secret_fields(self):
        path = Path(__file__).resolve().parents[2] / 'scripts/recovery/render-report.py'
        spec = importlib.util.spec_from_file_location('recovery_report', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        report = valid_report()
        report['checks'].append({'name': '<script>unsafe()</script>', 'passed': False})
        report['secret'] = 'must-not-appear'
        report['environmentPreflight'] = {'application': {'fields': [
            {'name': 'DATABASE_URL', 'state': 'secret-value-must-not-appear'},
            {'name': 'secret-field-must-not-appear', 'state': 'missing'}]}}
        view = module.render(report)
        self.assertNotIn('<script>', view)
        self.assertIn('&lt;script&gt;', view)
        self.assertNotIn('must-not-appear', view)
        self.assertIn('Human operator sign-off is pending', view)
        with self.assertRaises(ValueError):
            module.render({**report, 'dataClass': 'production'})

    def test_manifest_digest_is_order_independent_and_detects_changed_input(self):
        self.assertEqual(manifest_digest({'a': '1', 'b': '2'}), manifest_digest({'b': '2', 'a': '1'}))
        self.assertNotEqual(manifest_digest({'a': '1'}), manifest_digest({'a': '2'}))

    def test_manifest_contains_migrations_not_secrets(self):
        root = Path(__file__).resolve().parents[2]
        manifest = source_manifest(root)
        self.assertIn('prisma/schema.prisma', manifest)
        self.assertIn('scripts/recovery/rehearse.py', manifest)
        self.assertIn('prisma/migrations/20261008000000_verified_baseline/migration.sql', manifest)
        self.assertFalse(any('.env' in path or 'database.dump' in path for path in manifest))

    def test_object_keys_cannot_escape_or_follow_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(safe_object_path(root, 'synthetic/file.txt'), root.resolve() / 'synthetic/file.txt')
            (root / 'link').symlink_to(root.parent)
            for key in ('../private', '/absolute/file', 'nested/../../private', 'link/private', 'a\\b', '', '\x00'):
                with self.subTest(key=key), self.assertRaises(ValueError):
                    safe_object_path(root, key)

    def test_complete_report_is_accepted_and_malformed_fields_fail_closed(self):
        self.assertEqual(acceptance_errors(valid_report(), RELEASE), [])
        for field in ('source', 'checks', 'destination', 'databaseBackupSha256'):
            for value in (None, [], 'invalid', 3, {}):
                report = copy.deepcopy(valid_report())
                report[field] = value
                with self.subTest(field=field, value=value):
                    self.assertTrue(acceptance_errors(report, RELEASE))

    def test_explicit_failed_check_blocks_even_when_status_claims_verified(self):
        report = valid_report()
        report['checks'].append({'name': 'unexpected-discrepancy', 'passed': False})
        self.assertTrue(acceptance_errors(report, RELEASE))


if __name__ == '__main__':
    unittest.main()
