import { createHash, timingSafeEqual } from 'node:crypto';
import bundled from './ps-control-access.json' with { type: 'json' };
// Only a digest of the independently generated 256-bit password is published.
// Setting PS_CONTROL_TOKEN overrides the bundled credential, including revocation.
export function controlAccess(env = {}, digest = bundled.sha256) {
  const override = Object.hasOwn(env, 'PS_CONTROL_TOKEN');
  const token = env.PS_CONTROL_TOKEN;
  const configured = override ? typeof token === 'string' && /^[\x21-\x7e]{24,512}$/.test(token) : /^[a-f0-9]{64}$/.test(digest || '');
  const expected = configured ? createHash('sha256').update(override ? token : '').digest() : null;
  const want = configured && !override ? Buffer.from(digest, 'hex') : expected;
  return { configured, authorize(header) {
    const match = /^Bearer\s+([\x21-\x7e]{24,512})$/i.exec(header || '');
    if (!configured || !match) return false;
    return timingSafeEqual(createHash('sha256').update(match[1]).digest(), want);
  }};
}
