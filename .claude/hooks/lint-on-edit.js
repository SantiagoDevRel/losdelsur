#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

try {
  const data = JSON.parse(fs.readFileSync(0, 'utf8'));
  const p = (data.tool_input && data.tool_input.file_path) || '';
  if (!/\.(ts|tsx)$/i.test(p)) process.exit(0);
  if (!fs.existsSync(p)) process.exit(0);

  try {
    execSync(`npx --no-install eslint --fix "${p}"`, { stdio: 'inherit' });
  } catch {
    // ESLint exits non-zero on lint errors; surface but don't block tool result
    process.exit(0);
  }
} catch {
  process.exit(0);
}
