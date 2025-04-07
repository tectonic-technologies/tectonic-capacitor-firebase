const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getCurrentVersion() {
  const rootPkgPath = path.resolve(__dirname, '../package.json');
  const { version } = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

function getPackageNames() {
  const packagesDir = path.resolve(__dirname, '../packages');
  return fs.readdirSync(packagesDir).filter(name => {
    const fullPath = path.join(packagesDir, name);
    return fs.statSync(fullPath).isDirectory();
  });
}

function getLocalBranches() {
  return execSync('git branch', { encoding: 'utf-8' })
    .split('\n')
    .map(b => b.trim())
    .filter(Boolean);
}

function pushMatchingBranches(version, packages) {
  const { major, minor, patch } = version;
  const expectedBranches = packages.map(
    pkg => `release-${pkg}-v${major}-${minor}-${patch}`,
  );

  const localBranches = getLocalBranches();

  const toPush = expectedBranches.filter(branch =>
    localBranches.includes(branch),
  );

  if (toPush.length === 0) {
    console.log('\n❌ No matching release branches found to push.');
    return;
  }

  console.log(`\n🚀 Pushing ${toPush.length} matching release branches:`);
  toPush.forEach(branch => {
    console.log(`🌿 Pushing ${branch}`);
    execSync(`git push origin ${branch}`, { stdio: 'inherit' });
  });

  console.log('\n✅ Pushed all matching release branches.');
}

function run() {
  const version = getCurrentVersion();
  const packages = getPackageNames();
  pushMatchingBranches(version, packages);
}

run();
