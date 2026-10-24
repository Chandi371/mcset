export interface ReleaseArtifact {
  id: string;
  platform: 'windows' | 'macos' | 'linux';
  architecture: 'x64' | 'arm64';
  format: string;
  label: string;
  fileName: string;
  sizeBytes: number;
  sizeFormatted: string;
  downloadUrl: string;
  isPrimary?: boolean;
  notes?: string;
}

export const RELEASE_CONFIG = {
  version: 'v0.1.0',
  releaseDate: 'October 2026',
  githubRepoUrl: 'https://github.com/Chandi371/mcset',
  releasesPageUrl: 'https://github.com/Chandi371/mcset/releases',
  latestReleaseTagUrl: 'https://github.com/Chandi371/mcset/releases/tag/v0.1.0',
  issuesUrl: 'https://github.com/Chandi371/mcset/issues',
  licenseUrl: 'https://github.com/Chandi371/mcset/blob/main/LICENSE',
  sourceZipUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset-v0.1.0-source.zip',
  
  artifacts: [
    // Windows
    {
      id: 'win-setup',
      platform: 'windows',
      architecture: 'x64',
      format: '.exe setup',
      label: 'Windows Setup Installer (.exe)',
      fileName: 'mcset_0.1.0_x64-setup.exe',
      sizeBytes: 4896930,
      sizeFormatted: '4.9 MB',
      downloadUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_x64-setup.exe',
      isPrimary: true,
      notes: 'Recommended for Windows 10 & 11 (64-bit). Includes desktop shortcut and uninstaller.',
    },
    {
      id: 'win-msi',
      platform: 'windows',
      architecture: 'x64',
      format: '.msi',
      label: 'Windows MSI Package (.msi)',
      fileName: 'mcset_0.1.0_x64_en-US.msi',
      sizeBytes: 7061504,
      sizeFormatted: '7.1 MB',
      downloadUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_x64_en-US.msi',
      notes: 'Standard Windows Installer package for managed deployments.',
    },
    {
      id: 'win-portable',
      platform: 'windows',
      architecture: 'x64',
      format: '.exe portable',
      label: 'Windows Portable Executable (.exe)',
      fileName: 'mcset.exe',
      sizeBytes: 19678720,
      sizeFormatted: '19.7 MB',
      downloadUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset.exe',
      notes: 'Standalone executable without installation. Runs directly from any directory.',
    },

    // macOS (Apple Silicon only in v0.1.0)
    {
      id: 'mac-dmg',
      platform: 'macos',
      architecture: 'arm64',
      format: '.dmg',
      label: 'macOS Apple Silicon (.dmg)',
      fileName: 'mcset_0.1.0_aarch64.dmg',
      sizeBytes: 7363303,
      sizeFormatted: '7.4 MB',
      downloadUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_aarch64.dmg',
      isPrimary: true,
      notes: 'Native Apple Silicon disk image (M1, M2, M3, M4). Requires macOS 11.0+.',
    },
    {
      id: 'mac-tar',
      platform: 'macos',
      architecture: 'arm64',
      format: '.app.tar.gz',
      label: 'macOS Application Archive (.app.tar.gz)',
      fileName: 'mcset_aarch64.app.tar.gz',
      sizeBytes: 7093306,
      sizeFormatted: '7.1 MB',
      downloadUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_aarch64.app.tar.gz',
      notes: 'Compressed application bundle for Apple Silicon.',
    },

    // Linux (x86_64)
    {
      id: 'linux-appimage',
      platform: 'linux',
      architecture: 'x64',
      format: '.AppImage',
      label: 'Universal Linux AppImage (.AppImage)',
      fileName: 'mcset_0.1.0_amd64.AppImage',
      sizeBytes: 88594936,
      sizeFormatted: '88.6 MB',
      downloadUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_amd64.AppImage',
      isPrimary: true,
      notes: 'Standalone package for modern 64-bit Linux distributions. Requires FUSE or --appimage-extract-and-run.',
    },
    {
      id: 'linux-deb',
      platform: 'linux',
      architecture: 'x64',
      format: '.deb',
      label: 'Debian / Ubuntu Package (.deb)',
      fileName: 'mcset_0.1.0_amd64.deb',
      sizeBytes: 8941236,
      sizeFormatted: '8.9 MB',
      downloadUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_amd64.deb',
      notes: 'For Debian, Ubuntu, and Debian-based distributions (install with sudo dpkg -i).',
    },
    {
      id: 'linux-rpm',
      platform: 'linux',
      architecture: 'x64',
      format: '.rpm',
      label: 'Fedora / RedHat Package (.rpm)',
      fileName: 'mcset-0.1.0-1.x86_64.rpm',
      sizeBytes: 8946611,
      sizeFormatted: '8.9 MB',
      downloadUrl: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset-0.1.0-1.x86_64.rpm',
      notes: 'For Fedora, RHEL, openSUSE, and RPM-based distributions (install with sudo rpm -i).',
    },
  ] as ReleaseArtifact[],
};
