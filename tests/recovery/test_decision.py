import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/recovery/record-decision.py'


class DecisionTests(unittest.TestCase):
    def run_decision(self, directory, status, decision='accept-synthetic-rehearsal'):
        report = Path(directory) / 'report.json'
        report.write_text(json.dumps({'status': status, 'checks': [{'passed': status != 'blocked'}],
                                      'destination': {'host': '127.0.0.1'}}))
        return subprocess.run(['python3', str(SCRIPT), '--report', str(report), '--reviewer', 'test operator',
                               '--release', 'synthetic-test', '--ticket', 'synthetic-change-record',
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


if __name__ == '__main__':
    unittest.main()
