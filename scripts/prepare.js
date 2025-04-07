const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function copyRecursiveSync(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child =>
      copyRecursiveSync(path.join(src, child), path.join(dest, child)),
    );
  } else {
    fs.copyFileSync(src, dest);
  }
}

function movePackageToRoot(fromDir, toDir) {
  const items = fs.readdirSync(fromDir, { withFileTypes: true });
  items.forEach(item => {
    const src = path.join(fromDir, item.name);
    const dest = path.join(toDir, item.name);
    if (item.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      movePackageToRoot(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  });
}

function getCurrentGitBranch() {
  return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
}

function createTempBranch() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  const tempBranch = `release-temp-${timestamp}`;
  console.log(`\n📍 Creating temporary branch: ${tempBranch}`);
  execSync(`git checkout -b ${tempBranch}`, { stdio: 'inherit' });
  return tempBranch;
}

function runTurboBuild() {
  console.log('\n🔨 Running build using Turborepo...');
  execSync('turbo run build', { stdio: 'inherit' });
}

function getBumpedVersion() {
  const rootPackagePath = path.resolve(__dirname, '../package.json');
  const { version } = JSON.parse(fs.readFileSync(rootPackagePath, 'utf-8'));
  const [major, minor] = version.split('.').map(Number);
  return { major, minor: minor + 1, patch: 0 };
}

function getPackageDirs() {
  const packagesPath = path.resolve(__dirname, '../packages');
  return fs
    .readdirSync(packagesPath)
    .filter(name => fs.statSync(path.join(packagesPath, name)).isDirectory());
}

function createBranchesForPackages(version) {
  const { major, minor, patch } = version;
  const packages = getPackageDirs();
  const createdBranches = [];

  console.log(`\n🌿 Creating release branches...`);
  packages.forEach(pkgName => {
    const branchName = `release-${pkgName}-v${major}-${minor}-${patch}`;
    execSync(`git branch ${branchName}`, { stdio: 'inherit' });
    createdBranches.push(branchName);
  });

  return createdBranches;
}

function prepareTempIsolation() {
  const repoRoot = path.resolve(__dirname, '..');
  const parentDir = path.resolve(repoRoot, '..');
  const tempRoot = path.join(parentDir, '.temp-isolation');
  const packagesPath = path.join(repoRoot, 'packages');
  const packages = getPackageDirs();
  const map = {};

  if (!fs.existsSync(tempRoot)) fs.mkdirSync(tempRoot);

  console.log('\n📦 Copying packages to external temp folder...');
  packages.forEach(pkgName => {
    const src = path.join(packagesPath, pkgName);
    const dest = path.join(tempRoot, pkgName);
    copyRecursiveSync(src, dest);
    map[pkgName] = dest;
  });

  return { tempRoot, tempMap: map };
}

function cleanRepoRootExceptGit(repoRoot) {
  console.log(`🧨 Cleaning root (except .git)...`);
  fs.readdirSync(repoRoot).forEach(item => {
    if (item !== '.git') {
      fs.rmSync(path.join(repoRoot, item), { recursive: true, force: true });
    }
  });
}

function isolateBranches(version, tempMap) {
  const { major, minor, patch } = version;
  const repoRoot = path.resolve(__dirname, '..');
  const created = [];

  Object.entries(tempMap).forEach(([pkgName, pkgPath]) => {
    const branchName = `release-${pkgName}-v${major}-${minor}-${patch}`;
    console.log(`\n🌿 Switching to branch: ${branchName}`);
    execSync(`git checkout ${branchName}`, { stdio: 'inherit' });

    cleanRepoRootExceptGit(repoRoot);

    if (!fs.existsSync(pkgPath)) {
      throw new Error(`❌ Isolated content missing: ${pkgName}`);
    }

    console.log(`📁 Copying '${pkgName}' to repo root...`);
    movePackageToRoot(pkgPath, repoRoot);

    const commitMsg = `v${major}.${minor}.${patch}`;
    execSync('git add .', { stdio: 'inherit' });
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });

    created.push(branchName);
  });

  return created;
}

function updateRootVersionInPackageJson(version) {
  const { major, minor, patch } = version;
  const versionStr = `${major}.${minor}.${patch}`;
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkgJson.version = versionStr;
  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2));

  console.log('\n📦 Running npm install to update lockfile...');
  execSync('npm install', { stdio: 'inherit' });

  execSync('git add package.json package-lock.json', { stdio: 'inherit' });
  execSync(`git commit -m "chore: bump version to v${versionStr}"`, {
    stdio: 'inherit',
  });

  console.log(`\n🆙 Updated root version to: v${versionStr}`);
}

function init() {
  const startingBranch = getCurrentGitBranch();
  const tempBranch = createTempBranch();
  runTurboBuild();

  const version = getBumpedVersion();
  const createdBranches = createBranchesForPackages(version);

  const { tempRoot, tempMap } = prepareTempIsolation();
  const committedBranches = isolateBranches(version, tempMap);

  console.log(`\n🔁 Returning to original branch: ${startingBranch}`);
  execSync(`git checkout ${startingBranch}`, { stdio: 'inherit' });

  updateRootVersionInPackageJson(version);

  console.log(`\n🧹 Cleaning up temp isolation...`);
  fs.rmSync(tempRoot, { recursive: true, force: true });

  console.log(`\n🗑️ Deleting temp branch: ${tempBranch}`);
  execSync(`git branch -D ${tempBranch}`, { stdio: 'inherit' });

  console.log('\n✅ Created release branches:');
  committedBranches.forEach(b => console.log(`  • ${b}`));
}

init();
