import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './dialog.css';
import api from './api';
import { totpCode, secondsLeft } from './totp';
import { versionLabel } from './format';
import {
  CPU_OPTIONS, DISPLAY_OPTIONS, FONT_OPTIONS, GPU_PAIRS, LANGUAGE_OPTIONS, LOCATION_OPTIONS,
  NOISE_OPTIONS, OS_LABELS, OS_OPTIONS, RAM_OPTIONS, RENDERERS, SCREEN_OPTIONS, SCREEN_PRESETS,
  TZ_OPTIONS, VENDORS, WEBGL_OPTIONS, WEBGPU_OPTIONS, WEBRTC_OPTIONS,
  blankDraft, draftFromProfile, userAgentFor,
} from './profileOptions';

const DialogContext = createContext(null);
const errorText = (err) => String(err && err.message ? err.message : err)
  .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function TotpBadge({ secret }) {
  const [state, setState] = useState({ code: '', left: 30 });
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const code = await totpCode(secret);
      if (!cancelled) setState({ code, left: secondsLeft() });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [secret]);
  return (
    <div className="pm-totp">
      <span className="pm-totp-code">{state.code || '······'}</span>
      <span className="pm-hint">{state.left}s</span>
    </div>
  );
}

function Chevron() {
  return (
    <svg className="chev" viewBox="0 0 20 20" width="13" height="13" aria-hidden="true">
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A select whose list is portaled into the dialog, so it inherits the dialog theme and is never
// clipped by the form's scroll container.
function PmSelect({ value, options, onChange, placeholder = 'Select…' }) {
  const root = useContext(DialogContext);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find((option) => String(option.value) === String(value));

  const place = () => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width, 190);
    const height = Math.min(menu.scrollHeight, 300);
    const up = window.innerHeight - rect.bottom < height + 12 && rect.top > height + 12;
    setPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 12)),
      top: up ? rect.top - height - 6 : rect.bottom + 6,
      width,
    });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  // Wheel over the menu belongs to the menu: without this the dialog behind it scrolls and the
  // outside-scroll handler closes the dropdown while the user is still reading it.
  useEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    if (!menu) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      menu.scrollTop += event.deltaY;
    };
    menu.addEventListener('wheel', onWheel, { passive: false });
    return () => menu.removeEventListener('wheel', onWheel);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      if (buttonRef.current && buttonRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    // Scrolling inside the menu itself must not close it; scrolling the dialog behind it should.
    const onScroll = (event) => {
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const target = root || document.body;

  return (
    <div className="pm-select-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="pm-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!open) setPos(null); setOpen((current) => !current); }}
      >
        <span className={`label${selected ? '' : ' muted'}`}>{selected ? selected.label : placeholder}</span>
        <Chevron />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="pm-menu pm-scroll"
          role="listbox"
          style={{ left: pos ? pos.left : -9999, top: pos ? pos.top : -9999, width: pos ? pos.width : 200 }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              {option.label}
              {option.note ? <span className="note">{option.note}</span> : null}
            </button>
          ))}
        </div>,
        target,
      )}
    </div>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div className="pm-seg" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'active' : ''}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, span2 = false, hint }) {
  return (
    <div className={`pm-field${span2 ? ' pm-span2' : ''}`}>
      <label>{label}</label>
      {children}
      {hint ? <span className="pm-hint">{hint}</span> : null}
    </div>
  );
}

export default function ProfileDialog({ open, profile, proxies, majors, kernels, settings, isDark, onClose, onSaved }) {
  const [draft, setDraft] = useState(blankDraft);
  const [tab, setTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [check, setCheck] = useState(null);
  const [rootEl, setRootEl] = useState(null);
  const [builds, setBuilds] = useState(majors);
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const base = draftFromProfile(profile);
    // A new profile starts from the defaults chosen in Settings.
    if (!profile && settings && settings.defaults) {
      const defaults = settings.defaults;
      base.kernel = defaults.kernel || base.kernel;
      base.os = defaults.os || base.os;
      base.fingerprint = {
        ...base.fingerprint,
        screen: { ...base.fingerprint.screen, mode: 'preset', preset: defaults.screen || base.fingerprint.screen.preset },
        timezone: { ...base.fingerprint.timezone, mode: defaults.timezone === 'ip' ? 'ip' : 'real' },
        language: { ...base.fingerprint.language, mode: defaults.language === 'ip' ? 'ip' : 'real' },
        randomFingerprint: Boolean(defaults.randomFingerprint),
      };
    }
    setDraft(base);
    setTab('general');
    setError('');
    setCheck(null);
  }, [open, profile]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && nameRef.current) setTimeout(() => nameRef.current.focus(), 30);
  }, [open]);

  // The version list depends on the kernel: Chrome ships fixed majors, the patched kernel ships
  // releases on GitHub.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.listMajors(draft.kernel)
      .then((list) => {
        if (cancelled) return;
        setBuilds(list);
        // Kernels that download their own builds need a version; pick the newest one by default.
        if (draft.kernel !== 'chrome' && !draft.browserVersion && list.length) {
          patch({ browserVersion: list[0].major });
        }
      })
      .catch(() => { if (!cancelled) setBuilds([]); });
    return () => { cancelled = true; };
  }, [open, draft.kernel]);

  const patch = (values) => setDraft((current) => ({ ...current, ...values }));
  const patchFp = (values) => setDraft((current) => ({ ...current, fingerprint: { ...current.fingerprint, ...values } }));

  const kernelOptions = useMemo(() => (kernels.length ? kernels : [
    { id: 'chrome', label: 'Google Chrome' },
    { id: 'fingerprint', label: 'Fingerprint Chromium' },
  ]).map((kernel) => ({ value: kernel.id, label: kernel.label })), [kernels]);

  const kernelDescription = useMemo(() => {
    const found = (kernels || []).find((kernel) => kernel.id === draft.kernel);
    return found ? found.description : '';
  }, [kernels, draft.kernel]);

  const versionOptions = useMemo(() => [
    { value: '', label: draft.kernel === 'chrome' ? 'System Chrome' : 'Choose a build' },
    ...builds.map(({ major, installed }) => ({
      value: major,
      label: versionLabel(draft.kernel, major),
      note: installed ? 'installed' : '',
    })),
  ], [builds, draft.kernel]);

  const uaPresets = useMemo(() => [
    { value: '', label: 'Automatic (browser default)' },
    ...builds.slice(0, 8).map(({ major }) => ({ value: major, label: `${versionLabel(draft.kernel, major)} on ${OS_LABELS[draft.os]}` })),
  ], [builds, draft.os]);

  const savedProxyOptions = proxies.map((proxy) => ({
    value: proxy.id,
    label: proxy.name,
    note: `${proxy.host}:${proxy.port}`,
  }));

  const importProxyLine = async () => {
    const text = draft.hostPort.trim();
    if (!text) return;
    try {
      const parsed = await api.parseProxy(text, draft.proxyType);
      patch({
        proxyType: parsed.type,
        hostPort: `${parsed.host}:${parsed.port}`,
        proxyUser: parsed.username || draft.proxyUser,
        proxyPass: parsed.password || draft.proxyPass,
      });
    } catch (err) {
      setCheck({ ok: false, text: errorText(err) });
    }
  };

  const checkProxy = async () => {
    setCheck({ loading: true });
    try {
      const parsed = await api.parseProxy(draft.hostPort, draft.proxyType);
      const result = await api.checkProxy({
        ...parsed,
        username: parsed.username || draft.proxyUser,
        password: parsed.password || draft.proxyPass,
      });
      setCheck({ ok: true, text: `Exit IP ${result.ip}` });
    } catch (err) {
      setCheck({ ok: false, text: errorText(err) });
    }
  };

  const randomize = () => {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const gpu = pick(GPU_PAIRS);
    const os = pick(['windows', 'macos', 'linux']);
    patch({
      os,
      fingerprint: {
        ...draft.fingerprint,
        webgl: { mode: 'custom', vendor: gpu.vendor, renderer: gpu.renderer },
        screen: { ...draft.fingerprint.screen, mode: 'preset', preset: pick(SCREEN_PRESETS).value },
        hardware: { cpu: pick([4, 6, 8, 12, 16]), ram: pick([4, 8]) },
        fonts: { mode: os },
        noise: { canvas: true, webglImage: true, audioContext: true, mediaDevice: true, clientRects: true, speechVoices: true },
      },
    });
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError('A profile needs a name');
      setTab('general');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let proxy = null;
      if (draft.proxyMode === 'saved') {
        const saved = proxies.find((item) => item.id === draft.savedProxy);
        if (saved) proxy = { type: saved.type, host: saved.host, port: saved.port, username: saved.username, password: saved.password };
      } else if (draft.hostPort.trim()) {
        const parsed = await api.parseProxy(draft.hostPort, draft.proxyType);
        proxy = {
          type: parsed.type,
          host: parsed.host,
          port: parsed.port,
          username: parsed.username || draft.proxyUser,
          password: parsed.password || draft.proxyPass,
        };
      }

      let cookies = [];
      if (draft.cookies.trim()) {
        try {
          cookies = JSON.parse(draft.cookies);
        } catch {
          setError('Cookies must be valid JSON');
          setTab('general');
          return;
        }
      }

      await api.saveProfile({
        id: profile ? profile.id : undefined,
        name: draft.name,
        group: draft.group,
        tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        notes: draft.notes,
        kernel: draft.kernel,
        os: draft.os,
        userAgent: { mode: draft.uaValue.trim() ? 'custom' : 'auto', value: draft.uaValue.trim() },
        browserVersion: draft.browserVersion || null,
        startUrls: draft.startUrls,
        cookies,
        changeIpUrl: draft.changeIpUrl,
        executablePath: draft.executablePath.trim(),
        launchArgs: draft.launchArgs,
        prefs: draft.prefs,
        totp: draft.totpSecret.trim() ? { secret: draft.totpSecret.trim() } : null,
        proxy,
        fingerprint: draft.fingerprint,
      });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const fp = draft.fingerprint;
  const overview = [
    ['Profile ID', draft.number ? `#${draft.number}` : 'assigned on save'],
    ['Kernel', (kernels || []).find((kernel) => kernel.id === draft.kernel)?.label || draft.kernel],
    ['Browser', versionLabel(draft.kernel, draft.browserVersion)],
    ['OS', OS_LABELS[draft.os]],
    ['User-Agent', draft.uaValue.trim() ? 'Custom' : 'Browser default'],
    ['WebRTC', WEBRTC_OPTIONS.find((option) => option.value === fp.webRtc).label],
    ['Timezone', fp.timezone.mode === 'custom' ? fp.timezone.value : TZ_OPTIONS.find((option) => option.value === fp.timezone.mode).label],
    ['Language', fp.language.mode === 'custom' ? fp.language.value : LANGUAGE_OPTIONS.find((option) => option.value === fp.language.mode).label],
    ['Screen', fp.screen.mode === 'custom' ? `${fp.screen.width} × ${fp.screen.height}` : fp.screen.mode === 'preset' ? fp.screen.preset.replace('x', ' × ') : 'Default'],
    ['CPU / RAM', `${fp.hardware.cpu ? `${fp.hardware.cpu} cores` : 'real'} / ${fp.hardware.ram ? `${fp.hardware.ram} GB` : 'real'}`],
    ['Fonts', fp.fonts.mode === 'default' ? 'Default' : fp.fonts.mode],
    ['Proxy', draft.proxyMode === 'saved'
      ? (proxies.find((item) => item.id === draft.savedProxy) || {}).name || 'choose one'
      : draft.hostPort || 'Direct'],
  ];

  const general = (
    <>
      <div className="pm-section">
        <div className="pm-section-title">Identity</div>
        <div className="pm-grid2">
          <Field label="Name" span2>
            <input ref={nameRef} className="pm-input" value={draft.name} maxLength={100} onChange={(event) => patch({ name: event.target.value })} placeholder="e.g. shop@proton.me" />
          </Field>
          <Field label="Group">
            <input className="pm-input" value={draft.group} maxLength={60} onChange={(event) => patch({ group: event.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Kernel" hint={kernelDescription}>
            <PmSelect
              value={draft.kernel}
              options={kernelOptions}
              onChange={(value) => patch({ kernel: value, browserVersion: '' })}
            />
          </Field>
          <Field label="Tags" span2 hint="Comma separated. Shown as chips in the profile list.">
            <input
              className="pm-input"
              value={draft.tags}
              onChange={(event) => patch({ tags: event.target.value })}
              placeholder="shop, warmup, client-a"
            />
          </Field>
          <Field
            label="Browser"
            hint={builds.length === 0 ? 'No builds are available for this kernel here; set a custom binary or install the browser.' : undefined}
          >
            <PmSelect value={draft.browserVersion} options={versionOptions} onChange={(value) => patch({ browserVersion: value })} />
          </Field>
          <Field label="OS">
            <PmSelect value={draft.os} options={OS_OPTIONS} onChange={(value) => patch({ os: value })} />
          </Field>
          <Field label="User-Agent preset">
            <PmSelect
              value=""
              options={uaPresets}
              onChange={(major) => patch({ uaValue: major ? userAgentFor(draft.os, major) : '' })}
            />
          </Field>
          <Field label="Custom user-agent" span2 hint="Leave empty to use the browser's own user-agent and matching Client Hints.">
            <input className="pm-input" value={draft.uaValue} onChange={(event) => patch({ uaValue: event.target.value })} spellCheck={false} />
          </Field>
        </div>
      </div>

      <div className="pm-section">
        <div className="pm-section-title">Notes</div>
        <Field label="Note" hint="Shown as an icon in the list and on the profile's start page.">
          <textarea className="pm-textarea" rows={2} maxLength={2000} value={draft.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder="Anything worth remembering about this profile" />
        </Field>
      </div>

      <div className="pm-section">
        <div className="pm-section-title">Session</div>
        <Field label="Start tabs" hint="One URL per line. They open after launch, once cookies are in place.">
          <textarea className="pm-textarea" rows={3} value={draft.startUrls} onChange={(event) => patch({ startUrls: event.target.value })} spellCheck={false} placeholder="https://example.com" />
        </Field>
        <Field label="Cookies" hint="JSON array in the shape cookie extensions export.">
          <textarea className="pm-textarea" rows={4} value={draft.cookies} onChange={(event) => patch({ cookies: event.target.value })} spellCheck={false} placeholder='[{"name":"session","value":"…","domain":".example.com"}]' style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        </Field>
      </div>
    </>
  );

  const proxyPane = (
    <>
      <div className="pm-section">
        <div className="pm-section-title">Proxy source</div>
        <div className="pm-grid2">
          <Field label="Mode" span2>
            <Seg
              value={draft.proxyMode}
              onChange={(value) => patch({ proxyMode: value })}
              options={[{ value: 'custom', label: 'Custom' }, { value: 'saved', label: 'Saved proxy' }]}
            />
          </Field>

          {draft.proxyMode === 'saved' ? (
            <Field label="Saved proxy" span2>
              <PmSelect
                value={draft.savedProxy}
                options={savedProxyOptions}
                onChange={(value) => patch({ savedProxy: value })}
                placeholder="Choose a saved proxy"
              />
            </Field>
          ) : (
            <>
              <Field label="Type">
                <PmSelect
                  value={draft.proxyType}
                  options={[
                    { value: 'http', label: 'HTTP' },
                    { value: 'https', label: 'HTTPS' },
                    { value: 'socks5', label: 'SOCKS5' },
                  ]}
                  onChange={(value) => patch({ proxyType: value })}
                />
              </Field>
              <Field label="Username">
                <input className="pm-input" value={draft.proxyUser} onChange={(event) => patch({ proxyUser: event.target.value })} spellCheck={false} />
              </Field>
              <Field label="Host : Port" span2 hint="Paste the whole provider line; type, login and password fill in automatically.">
                <input
                  className="pm-input"
                  value={draft.hostPort}
                  onChange={(event) => patch({ hostPort: event.target.value })}
                  onBlur={importProxyLine}
                  onPaste={() => setTimeout(importProxyLine, 0)}
                  placeholder="host:port, or host:port:user:pass"
                  spellCheck={false}
                />
              </Field>
              <Field label="Password">
                <input className="pm-input" type="password" value={draft.proxyPass} onChange={(event) => patch({ proxyPass: event.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Check">
                <div className="pm-row-tight">
                  <button type="button" className="pm-btn small" onClick={checkProxy} disabled={!draft.hostPort.trim() || (check && check.loading)}>
                    {check && check.loading ? 'Checking…' : 'Check proxy'}
                  </button>
                  {check && !check.loading && (
                    <span className="pm-hint" style={{ color: check.ok ? 'var(--ok)' : 'var(--danger)' }}>{check.text}</span>
                  )}
                </div>
              </Field>
            </>
          )}

          <Field label="Change IP URL" span2 hint="Called before every launch. A non-2xx answer stops the launch.">
            <input className="pm-input" value={draft.changeIpUrl} onChange={(event) => patch({ changeIpUrl: event.target.value })} spellCheck={false} placeholder="https://provider.example/rotate?key=…" />
          </Field>
        </div>
      </div>
    </>
  );

  const fingerprint = (
    <>
      {draft.kernel === 'firefox' && (
        <div className="pm-section">
          <div className="pm-note">
            Firefox runs on Gecko. The user-agent, languages, timezone and WebRTC policy are spoofed,
            but canvas, WebGL and fonts stay real. Imported cookies are written through WebDriver BiDi.
          </div>
        </div>
      )}
      {draft.kernel === 'fingerprint' && (
        <div className="pm-section">
          <div className="pm-note">
            This kernel spoofs the user-agent, platform, fonts, canvas, audio, WebRTC and CPU count
            inside the browser. Screen size, device memory, geolocation and a custom user-agent are
            still applied by the app.
          </div>
        </div>
      )}
      <div className="pm-section">
        <div className="pm-section-title">WebRTC</div>
        <div className="pm-grid2">
          <Field label="Policy" span2>
            <Seg value={fp.webRtc} options={WEBRTC_OPTIONS} onChange={(value) => patchFp({ webRtc: value })} />
          </Field>
        </div>
      </div>

      <div className="pm-section">
        <div className="pm-section-title">Locale</div>
        <div className="pm-grid2">
          <Field label="Timezone" span2>
            <Seg value={fp.timezone.mode} options={TZ_OPTIONS} onChange={(value) => patchFp({ timezone: { ...fp.timezone, mode: value } })} />
            {fp.timezone.mode === 'custom' && (
              <input
                className="pm-input"
                value={fp.timezone.value}
                onChange={(event) => patchFp({ timezone: { ...fp.timezone, value: event.target.value } })}
                placeholder="Asia/Tehran"
                style={{ marginTop: 8 }}
              />
            )}
          </Field>
          <Field label="Location" span2 hint="Geolocation is granted only for the start URLs, and only when Always allow is picked.">
            <Seg value={fp.location.mode} options={LOCATION_OPTIONS} onChange={(value) => patchFp({ location: { ...fp.location, mode: value } })} />
            {fp.location.mode === 'custom' && (
              <div className="pm-row-tight" style={{ marginTop: 8 }}>
                <input
                  className="pm-input"
                  inputMode="decimal"
                  placeholder="Latitude"
                  value={fp.location.latitude === null ? '' : fp.location.latitude}
                  onChange={(event) => patchFp({ location: { ...fp.location, latitude: event.target.value === '' ? null : Number(event.target.value) } })}
                />
                <input
                  className="pm-input"
                  inputMode="decimal"
                  placeholder="Longitude"
                  value={fp.location.longitude === null ? '' : fp.location.longitude}
                  onChange={(event) => patchFp({ location: { ...fp.location, longitude: event.target.value === '' ? null : Number(event.target.value) } })}
                />
              </div>
            )}
            <div className="pm-row-tight" style={{ marginTop: 8 }}>
              <label className="pm-check-row"><input type="radio" name="loc-prompt" checked={fp.location.prompt === 'ask'} onChange={() => patchFp({ location: { ...fp.location, prompt: 'ask' } })} /> Ask each time</label>
              <label className="pm-check-row"><input type="radio" name="loc-prompt" checked={fp.location.prompt === 'allow'} onChange={() => patchFp({ location: { ...fp.location, prompt: 'allow' } })} /> Always allow</label>
            </div>
          </Field>
          <Field label="Language">
            <Seg value={fp.language.mode} options={LANGUAGE_OPTIONS} onChange={(value) => patchFp({ language: { ...fp.language, mode: value } })} />
            {fp.language.mode === 'custom' && (
              <input className="pm-input" style={{ marginTop: 8 }} value={fp.language.value} onChange={(event) => patchFp({ language: { ...fp.language, value: event.target.value } })} placeholder="en-US" />
            )}
          </Field>
          <Field label="Display language">
            <Seg value={fp.displayLanguage.mode} options={DISPLAY_OPTIONS} onChange={(value) => patchFp({ displayLanguage: { ...fp.displayLanguage, mode: value } })} />
            {fp.displayLanguage.mode === 'custom' && (
              <input className="pm-input" style={{ marginTop: 8 }} value={fp.displayLanguage.value} onChange={(event) => patchFp({ displayLanguage: { ...fp.displayLanguage, value: event.target.value } })} placeholder="en-US" />
            )}
          </Field>
        </div>
      </div>

      <div className="pm-section">
        <div className="pm-section-title">Display</div>
        <div className="pm-grid2">
          <Field label="Screen resolution" span2>
            <Seg value={fp.screen.mode} options={SCREEN_OPTIONS} onChange={(value) => patchFp({ screen: { ...fp.screen, mode: value } })} />
            {fp.screen.mode === 'preset' && (
              <div style={{ marginTop: 8, maxWidth: 220 }}>
                <PmSelect value={fp.screen.preset} options={SCREEN_PRESETS} onChange={(value) => patchFp({ screen: { ...fp.screen, preset: value } })} />
              </div>
            )}
            {fp.screen.mode === 'custom' && (
              <div className="pm-row-tight" style={{ marginTop: 8 }}>
                <input className="pm-input" inputMode="numeric" value={fp.screen.width} onChange={(event) => patchFp({ screen: { ...fp.screen, width: Number(event.target.value) || 0 } })} />
                <input className="pm-input" inputMode="numeric" value={fp.screen.height} onChange={(event) => patchFp({ screen: { ...fp.screen, height: Number(event.target.value) || 0 } })} />
              </div>
            )}
          </Field>
          <Field label="Fonts" span2 hint="Pages probing document.fonts.check get the chosen platform's list.">
            <Seg value={fp.fonts.mode} options={FONT_OPTIONS} onChange={(value) => patchFp({ fonts: { mode: value } })} />
          </Field>
        </div>
      </div>

      <div className="pm-section">
        <div className="pm-section-title">Hardware</div>
        <div className="pm-grid2">
          <Field label="CPU cores">
            <PmSelect
              value={fp.hardware.cpu === null ? '' : String(fp.hardware.cpu)}
              options={CPU_OPTIONS}
              onChange={(value) => patchFp({ hardware: { ...fp.hardware, cpu: value === '' ? null : Number(value) } })}
            />
          </Field>
          <Field label="Device memory">
            <PmSelect
              value={fp.hardware.ram === null ? '' : String(fp.hardware.ram)}
              options={RAM_OPTIONS}
              onChange={(value) => patchFp({ hardware: { ...fp.hardware, ram: value === '' ? null : Number(value) } })}
            />
          </Field>
          <Field label="Hardware noise" span2>
            <div className="pm-grid2" style={{ gap: '8px 16px' }}>
              {NOISE_OPTIONS.map((option) => (
                <label key={option.value} className="pm-check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(fp.noise[option.value])}
                    disabled={draft.kernel === 'fingerprint'}
                    onChange={(event) => patchFp({ noise: { ...fp.noise, [option.value]: event.target.checked } })}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <div className="pm-section">
        <div className="pm-section-title">GPU</div>
        <div className="pm-grid2">
          <Field label="WebGL metadata" span2>
            <Seg value={fp.webgl.mode} options={WEBGL_OPTIONS} onChange={(value) => patchFp({ webgl: { ...fp.webgl, mode: value } })} />
            {fp.webgl.mode === 'custom' && (
              <div className="pm-row-tight" style={{ marginTop: 8 }}>
                <div style={{ flex: '1 1 220px' }}>
                  <PmSelect value={fp.webgl.vendor} options={VENDORS.map((value) => ({ value, label: value }))} onChange={(value) => patchFp({ webgl: { ...fp.webgl, vendor: value } })} />
                </div>
                <div style={{ flex: '2 1 320px' }}>
                  <PmSelect
                    value={fp.webgl.renderer}
                    options={RENDERERS.map((value) => ({ value, label: value.length > 52 ? `${value.slice(0, 50)}…` : value }))}
                    onChange={(value) => patchFp({ webgl: { ...fp.webgl, renderer: value } })}
                  />
                </div>
              </div>
            )}
          </Field>
          <Field label="WebGPU" span2>
            <Seg value={fp.webgpu} options={WEBGPU_OPTIONS} onChange={(value) => patchFp({ webgpu: value })} />
          </Field>
        </div>
      </div>
    </>
  );

  const advanced = (
    <>
      <div className="pm-section">
        <div className="pm-section-title">Fingerprint stability</div>
        <Field label="Random fingerprint" hint="A new noise seed on every launch. Leave it off to keep one stable identity.">
          <label className="pm-check-row">
            <input type="checkbox" checked={fp.randomFingerprint} onChange={(event) => patchFp({ randomFingerprint: event.target.checked })} />
            New seed on every launch
          </label>
        </Field>
      </div>

      <div className="pm-section">
        <div className="pm-section-title">Startup</div>
        <Field label="Preferences" span2 hint="Applied to the browser profile before the first page loads.">
          <div className="pm-grid2" style={{ gap: '10px 16px' }}>
            <label className="pm-check-row">
              <input type="checkbox" checked={draft.prefs.blockImages} onChange={(event) => patch({ prefs: { ...draft.prefs, blockImages: event.target.checked } })} />
              Block images
            </label>
            <label className="pm-check-row">
              <input type="checkbox" checked={draft.prefs.restorePages} onChange={(event) => patch({ prefs: { ...draft.prefs, restorePages: event.target.checked } })} />
              Offer to restore pages
            </label>
            <label className="pm-check-row">
              <input type="checkbox" checked={draft.prefs.savePasswords} onChange={(event) => patch({ prefs: { ...draft.prefs, savePasswords: event.target.checked } })} />
              Save passwords
            </label>
          </div>
        </Field>
        <Field label="Custom binary" hint="Absolute path to a Chromium-family binary. Overrides the kernel download for this profile.">
          <input
            className="pm-input"
            value={draft.executablePath}
            onChange={(event) => patch({ executablePath: event.target.value })}
            placeholder="/usr/bin/brave-browser"
            spellCheck={false}
          />
        </Field>
        <Field label="Launch arguments" hint="Extra Chromium flags, one group per line or space separated.">
          <textarea
            className="pm-textarea"
            rows={2}
            value={draft.launchArgs}
            onChange={(event) => patch({ launchArgs: event.target.value })}
            placeholder="--disable-gpu --lang=en-US"
            spellCheck={false}
          />
        </Field>
        <Field label="2FA secret" hint="Base32 secret from the account's authenticator setup. The current code is shown in the overview.">
          <input
            className="pm-input"
            value={draft.totpSecret}
            onChange={(event) => patch({ totpSecret: event.target.value })}
            placeholder="JBSWY3DPEHPK3PXP"
            spellCheck={false}
          />
        </Field>
      </div>

      <div className="pm-section">
        <div className="pm-section-title">Storage</div>
        <Field label="Data folder">
          <code className="pm-hint" style={{ wordBreak: 'break-all' }}>
            {profile && settings ? `${settings.dataDir.replace(/[\\/]$/, '')}/profiles/${profile.id}` : 'Available after the first save'}
          </code>
        </Field>
        <Field label="Scope">
          <span className="pm-hint">
            Runs entirely on this machine: no account, no cloud sync, no team features. Cookies, the proxy
            password and profile data stay in the folder above.
          </span>
        </Field>
      </div>
    </>
  );

  const panes = { general, proxy: proxyPane, fingerprint, advanced };

  return createPortal(
    <div className="pm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={setRootEl}
        className="pm-scope"
        data-theme={isDark ? 'dark' : 'light'}
        role="dialog"
        aria-modal="true"
        aria-label="Profile editor"
      >
        <header className="pm-head">
          <div className="pm-title">
            <h2>{profile ? 'Edit profile' : 'New profile'}</h2>
            <p>{profile ? `Changes apply the next time “${profile.name}” launches.` : 'Everything below is applied when this profile launches.'}</p>
          </div>
          <button type="button" className="pm-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="pm-tabs" role="tablist">
          {[['general', 'General'], ['proxy', 'Proxy'], ['fingerprint', 'Fingerprint'], ['advanced', 'Advanced']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              className={`pm-tab${tab === key ? ' active' : ''}`}
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <DialogContext.Provider value={rootEl}>
          <div className="pm-body">
            <div className="pm-form pm-scroll">
              {panes[tab]}
            </div>
            <aside className="pm-overview pm-scroll">
              <h3>Overview</h3>
              <button type="button" className="pm-btn block" onClick={randomize} style={{ marginBottom: 4 }}>
                New fingerprint
              </button>
              {draft.totpSecret.trim() && (
                <div style={{ marginTop: 14 }}>
                  <h3 style={{ marginBottom: 6 }}>2FA code</h3>
                  <TotpBadge secret={draft.totpSecret.trim()} />
                </div>
              )}
              <dl>
                {overview.map(([term, value]) => (
                  <React.Fragment key={term}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </aside>
          </div>
        </DialogContext.Provider>

        <footer className="pm-foot">
          <span className="pm-error">{error}</span>
          <div className="pm-row-tight">
            <button type="button" className="pm-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="pm-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
