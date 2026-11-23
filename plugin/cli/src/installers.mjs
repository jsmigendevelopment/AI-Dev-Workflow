// Install plans per OS. A plan is { run: [argv...], print: [lines] }: run is what doctor --fix
// may run after a yes, print is what the person does themselves.
const PACKAGES = {
  git: { winget: "Git.Git", brew: "git", apt: "git", dnf: "git", pacman: "git", link: "https://git-scm.com/downloads" },
  gh: { winget: "GitHub.cli", brew: "gh", apt: "gh", dnf: "gh", pacman: "github-cli", link: "https://cli.github.com" },
};

export function packageManager({ platform, has }) {
  if (platform === "win32") return has("winget") ? "winget" : null;
  if (platform === "darwin") return has("brew") ? "brew" : null;
  if (has("apt-get")) return "apt";
  return ["dnf", "pacman"].find(has) ?? null;
}

const NO_MANAGER = {
  win32: "winget not found: install App Installer from the Microsoft Store",
  darwin: "Homebrew not found: install it from https://brew.sh",
  linux: "No apt, dnf or pacman found",
};

export function installPlan(tool, sys) {
  const pkg = PACKAGES[tool];
  const pm = packageManager(sys);
  const sudo = sys.isRoot ? [] : ["sudo"];
  switch (pm) {
    case "winget":
      return { run: [["winget", "install", "--id", pkg.winget, "-e", "--source", "winget", "--accept-source-agreements", "--accept-package-agreements"]] };
    case "brew": return { run: [["brew", "install", pkg.brew]] };
    case "apt": return { run: [[...sudo, "apt-get", "update"], [...sudo, "apt-get", "install", "-y", pkg.apt]] };
    case "dnf": return { run: [[...sudo, "dnf", "install", "-y", pkg.dnf]] };
    case "pacman": return { run: [[...sudo, "pacman", "-S", "--needed", "--noconfirm", pkg.pacman]] };
    default:
      return { print: [`${NO_MANAGER[sys.platform] ?? NO_MANAGER.linux}, or install ${tool} from ${pkg.link}`] };
  }
}

// pnpm comes from corepack, which Node 25 and later no longer ship, so get it from npm if missing.
export function pnpmPlan(sys) {
  const run = [["corepack", "enable"], ["corepack", "prepare", "pnpm@latest", "--activate"]];
  return { run: sys.has("corepack") ? run : [["npm", "install", "-g", "corepack"], ...run] };
}

// Vendor installers change, so these are only printed, never run.
export function agentInstallLines(platform) {
  const claude = platform === "win32"
    ? "Claude Code (PowerShell): irm https://claude.ai/install.ps1 | iex"
    : "Claude Code: curl -fsSL https://claude.ai/install.sh | bash";
  return [
    claude,
    "  or: npm install -g @anthropic-ai/claude-code   (docs: https://docs.claude.com/en/docs/claude-code/setup)",
    "Codex: npm install -g @openai/codex   (docs: https://developers.openai.com/codex/cli)",
  ];
}
