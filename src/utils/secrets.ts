import { spawnSync } from 'node:child_process';

function runCommand(command: string, args: string[], input?: string): string | null {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

export async function getSecret(service: string, account: string): Promise<string | null> {
  const envKey = `${service}_${account}`.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (process.env[envKey]) {
    return process.env[envKey] ?? null;
  }

  if (process.platform === 'darwin') {
    return runCommand('security', ['find-generic-password', '-s', service, '-a', account, '-w']);
  }

  if (process.platform === 'linux') {
    return runCommand('secret-tool', ['lookup', 'service', service, 'account', account]);
  }

  if (process.platform === 'win32') {
    const script = [
      '$vault = New-Object Windows.Security.Credentials.PasswordVault',
      `$cred = $vault.Retrieve('${service}', '${account}')`,
      '$cred.RetrievePassword()',
      '$cred.Password',
    ].join(';');

    return runCommand('powershell', ['-NoProfile', '-Command', script]);
  }

  return null;
}

export async function setSecret(service: string, account: string, value: string): Promise<boolean> {
  if (process.platform === 'darwin') {
    return runCommand('security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', value]) !== null;
  }

  if (process.platform === 'linux') {
    return runCommand(
      'secret-tool',
      ['store', '--label', `${service}:${account}`, 'service', service, 'account', account],
      value,
    ) !== null;
  }

  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
      '$vault = New-Object Windows.Security.Credentials.PasswordVault',
      `$cred = New-Object Windows.Security.Credentials.PasswordCredential('${service}', '${account}', '${value}')`,
      '$vault.Add($cred)',
      'Write-Output ok',
    ].join(';');

    return runCommand('powershell', ['-NoProfile', '-Command', script]) !== null;
  }

  return false;
}
