import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type Env = { key: string; value?: string; sync?: boolean; generateValue?: boolean };
type Svc = { name: string; plan: string; branch: string; autoDeploy?: boolean; disk?: { name: string; mountPath: string; sizeGB: number }; envVars: Env[]; startCommand: string; buildCommand: string };
const { services } = parse(readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8')) as { services: Svc[] };
const env = (s: Svc) => Object.fromEntries(s.envVars.map((e) => [e.key, e]));

describe('render.yaml', () => {
  it('jeden Blueprint: demo (free, modul-1) i produkcja (starter, produkcja, dysk 1 GB = DATA_DIR)', () => {
    expect(services.map((s) => s.name)).toEqual(['etner-demo', 'etner']);
    const [demo, prod] = services as [Svc, Svc];
    expect(demo).toMatchObject({ plan: 'free', branch: 'modul-1' });
    expect(env(demo).DEMO?.value).toBe('1');
    expect(prod).toMatchObject({ plan: 'starter', branch: 'produkcja', autoDeploy: true, disk: { mountPath: '/var/data', sizeGB: 1 } });
    const e = env(prod);
    expect(e.DATA_DIR?.value).toBe(prod.disk!.mountPath);
    expect(e.DEMO).toBeUndefined();
    expect(e.APP_SECRET?.generateValue).toBe(true);
    const secrets = ['ADMIN_LOGIN', 'ADMIN_NAME', 'ADMIN_PASSWORD', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_KEY', 'R2_SECRET', 'R2_BACKUP_BUCKET', 'LITESTREAM_ACCESS_KEY_ID',
      'LITESTREAM_SECRET_ACCESS_KEY', 'VAPID_PUBLIC', 'VAPID_PRIVATE', 'PUMBLE_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'BASE_URL', 'SHEETS_ID', 'GOOGLE_SA_JSON'];
    for (const k of secrets) expect(e[k], k).toEqual({ key: k, sync: false });
    expect(prod.startCommand).toContain('deploy/litestream.yml');
    expect(prod.buildCommand).toContain('bin litestream');
  });
});
