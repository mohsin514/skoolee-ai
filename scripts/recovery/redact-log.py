#!/usr/bin/env python3
"""Redact credential environment values before logs become uploaded artifacts."""
import os
import re
import sys

secrets = sorted({value for key, value in os.environ.items()
                  if value and (key in ('DATABASE_URL', 'DIRECT_URL') or any(word in key for word in ('TOKEN', 'SECRET', 'PASSWORD', 'API_KEY')))}, key=len, reverse=True)
for line in sys.stdin:
    for secret in secrets:
        line = line.replace(secret, '[REDACTED]')
    line = re.sub(r'(postgres(?:ql)?://)[^\s@]+@', r'\1[REDACTED]@', line)
    sys.stdout.write(line)
    sys.stdout.flush()
