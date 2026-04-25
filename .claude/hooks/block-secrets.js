#!/usr/bin/env node
const fs = require('fs');
try {
  const data = JSON.parse(fs.readFileSync(0, 'utf8'));
  const p = (data.tool_input && (data.tool_input.file_path || data.tool_input.path)) || '';
  const norm = p.replace(/\\/g, '/').toLowerCase();
  const patterns = [
    /(^|\/)\.env(\..+)?$/,
    /\.key$/,
    /\.pem$/,
    /(^|\/)[^/]*secret[^/]*$/,
    /(^|\/)[^/]*credentials?[^/]*\.(json|ya?ml)$/,
  ];
  if (patterns.some((rx) => rx.test(norm))) {
    console.error(`[block-secrets] Blocked edit on sensitive file: ${p}`);
    process.exit(2);
  }
} catch (e) {
  // fail-open on parse errors so we don't break workflow
  process.exit(0);
}
