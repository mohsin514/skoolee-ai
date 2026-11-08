import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import sys

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/recovery/record-decision.py'
sys.path.insert(0, str(SCRIPT.parent))
from verification import REQUIRED_CHECKS

RELEASE = 'a' * 40


def valid_report():
    return {'formatVersion': 2, 'status': 'verified-awaiting-sign-off', 'dataClass': 'synthetic',
            'checks': [{'name': name, 'passed': True} for name in sorted(REQUIRED_CHECKS)],
            'source': {'commit': RELEASE, 'worktreeDirty': False, 'inputsSha256': 'b' * 64},
            'databaseBackupSha256': 'c' * 64, 'actualRestoredPointUtc': '2026-10-15 10:00:00 UTC',
            'verifiedRestoreElapsedSeconds': 2.3, 'backupAgeSecondsAtRestore': 3,
            'destination': {'host': '127.0.0.1', 'databases': {key: 'rehearsal_abcdef123456_' + key for key in ('clean', 'upgrade', 'restored', 'failure')}}}


class DecisionTests(unittest.TestCase):
    def run_decision(self, directory, status, decision='accept-synthetic-rehearsal', release=RELEASE, change=None):
        report = Path(directory) / 'report.json'
        data = valid_report()
        data['status'] = status
        if change:
            change(data)
        report.write_text(json.dumps(data))
        return subprocess.run(['python3', str(SCRIPT), '--report', str(report), '--reviewer', 'test operator',
                               '--release', release, '--ticket', 'synthetic-change-record',
                               '--decision', decision, '--notes', 'synthetic test only',
                               '--output', str(Path(directory) / 'decision.json')], capture_output=True)

    def test_acceptance_binds_original_report_without_production_authorization(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(self.run_decision(directory, 'verified-awaiting-sign-off').returncode, 0)
            result = json.loads((Path(directory) / 'decision.json').read_text())
            self.assertEqual(result['reportSha256'], hashlib.sha256((Path(directory) / 'report.json').read_bytes()).hexdigest())
            self.assertFalse(result['productionRestoreAuthorized'])
            self.assertFalse(result['schoolReopenAuthorized'])
            self.assertNotEqual(self.run_decision(directory, 'verified-awaiting-sign-off').returncode, 0)

    def test_blocked_report_cannot_be_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertNotEqual(self.run_decision(directory, 'blocked').returncode, 0)
            self.assertFalse((Path(directory) / 'decision.json').exists())
            self.assertEqual(self.run_decision(directory, 'blocked', 'blocked').returncode, 0)

    def test_stale_release_cannot_be_bound_to_new_rehearsal(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertNotEqual(self.run_decision(directory, 'verified-awaiting-sign-off', release='d' * 40).returncode, 0)
            self.assertFalse((Path(directory) / 'decision.json').exists())

    def test_missing_evidence_and_string_success_are_rejected(self):
        changes = [lambda r: r['checks'].pop(), lambda r: r['checks'][0].update(passed='true'),
                   lambda r: r.pop('source'), lambda r: r.update(verifiedRestoreElapsedSeconds=-1),
                   lambda r: r['destination'].update(host='remote.invalid')]
        for change in changes:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                self.assertNotEqual(self.run_decision(directory, 'verified-awaiting-sign-off', change=change).returncode, 0)
                self.assertFalse((Path(directory) / 'decision.json').exists())


if __name__ == '__main__':
    unittest.main()
