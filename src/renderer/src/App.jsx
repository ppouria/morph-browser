import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, App as AntApp, Button, ConfigProvider, Layout, Popover, Progress, Space, Typography, theme,
} from 'antd';
import {
  AppstoreOutlined, ApiOutlined, CloudDownloadOutlined, DeleteOutlined, DownloadOutlined,
  GithubOutlined, SettingOutlined,
} from '@ant-design/icons';
import api from './api';
import ProfilesPage from './ProfilesPage';
import ProxiesPage from './ProxiesPage';
import SettingsPage from './SettingsPage';
import TrashPage from './TrashPage';
import ProfileDialog from './ProfileDialog';
import ProxyModal from './ProxyModal';

const { Content } = Layout;
const { Title, Text } = Typography;

const NAV = [
  { key: 'profiles', icon: <AppstoreOutlined />, label: 'Profiles' },
  { key: 'proxies', icon: <ApiOutlined />, label: 'Proxies' },
  { key: 'trash', icon: <DeleteOutlined />, label: 'Trash' },
];

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event) => setDark(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);
  return dark;
}

function formatSize(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

function updaterMessage(update) {
  if (update.status === 'available') return `Version ${update.version} is available`;
  if (update.status === 'downloading') return `Downloading update ${update.version || ''}…`.replace('  ', ' ');
  if (update.status === 'downloaded') return `Update ${update.version} is ready to install`;
  if (update.status === 'error') return 'Update check failed';
  return '';
}

function DownloadsPanel({ tasks, onDismiss }) {
  if (!tasks.length) {
    return (
      <div className="dl-empty">
        No downloads yet. Launch a profile pinned to a build that is not on disk and it appears here.
      </div>
    );
  }
  return (
    <div className="dl-list">
      {tasks.map((task) => (
        <div className="dl-item" key={task.key}>
          <div className="dl-head">
            <span className="dl-name">{task.label}</span>
            <span className="dl-version">{task.version}</span>
          </div>
          {task.status === 'downloading' && (
            <Progress
              percent={task.total ? Math.min(100, Math.round((task.received / task.total) * 100)) : 0}
              size="small"
              showInfo={false}
              status="active"
            />
          )}
          <div className="dl-meta">
            {task.status === 'downloading' && (
              <span>{formatSize(task.received)}{task.total ? ` / ${formatSize(task.total)}` : ''}</span>
            )}
            {task.status === 'done' && <span className="dl-ok">Downloaded</span>}
            {task.status === 'error' && <span className="dl-error">{task.error}</span>}
            {task.status !== 'downloading' && (
              <Button size="small" type="link" onClick={() => onDismiss(task.key)}>Dismiss</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const { message } = AntApp.useApp();
  const systemDark = useSystemDark();

  const [page, setPage] = useState('profiles');
  const [themeMode, setThemeMode] = useState('system');
  const [profiles, setProfiles] = useState([]);
  const [trash, setTrash] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [majors, setMajors] = useState([]);
  const [kernels, setKernels] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [siderOpen, setSiderOpen] = useState(false);
  const [downloads, setDownloads] = useState([]);
  const [update, setUpdate] = useState(null);
  const [version, setVersion] = useState('');
  const [editor, setEditor] = useState({ open: false, profile: null });
  const [proxyEditor, setProxyEditor] = useState({ open: false, proxy: null });

  const isDark = themeMode === 'system' ? systemDark : themeMode === 'dark';

  // Native controls (scrollbars, selects, focus rings) follow the app theme, not the OS theme.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = isDark ? 'dark' : 'light';
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const refresh = useCallback(async () => {
    const [nextProfiles, nextProxies, nextSettings, nextTrash] = await Promise.all([
      api.listProfiles(),
      api.listProxies(),
      api.getSettings(),
      api.listTrash(),
    ]);
    setProfiles(nextProfiles);
    setTrash(nextTrash);
    setProxies(nextProxies);
    setSettings(nextSettings);
    setThemeMode(nextSettings.theme || 'system');
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch((err) => message.error(err.message));
    api.listMajors().then(setMajors).catch(() => setMajors([]));
    api.listKernels().then(setKernels).catch(() => setKernels([]));
    api.appInfo().then((info) => setVersion(info.version)).catch(() => {});
    api.listDownloadTasks().then(setDownloads).catch(() => {});
    api.updateState().then(setUpdate).catch(() => {});
    api.onChange(() => refresh().catch(() => {}));
    api.onDownloads(setDownloads);
    api.onUpdateState(setUpdate);
    api.onNotice((notice) => {
      if (!notice) return;
      if (notice.level === 'error') message.error(notice.text);
      else message.warning(notice.text);
    });
  }, [refresh, message]);

  const openEditor = useCallback((profile) => setEditor({ open: true, profile }), []);
  const openProxyEditor = useCallback((proxy) => setProxyEditor({ open: true, proxy }), []);

  const run = useCallback(async (action, successText) => {
    try {
      await action();
      await refresh();
      if (successText) message.success(successText);
      return true;
    } catch (err) {
      message.error(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      return false;
    }
  }, [message, refresh]);

  const applySettings = useCallback((next) => {
    setSettings(next);
    setThemeMode(next.theme || 'system');
  }, []);

  const handleTheme = async (mode) => {
    setThemeMode(mode);
    try {
      await api.setSettings({ theme: mode });
    } catch (err) {
      message.error(err.message);
    }
  };

  const pageTitle = useMemo(() => ({
    profiles: { title: 'Profiles', subtitle: 'Isolated Chrome profiles with their own data, proxy and fingerprint.' },
    proxies: { title: 'Proxies', subtitle: 'Saved proxies you can attach to any profile.' },
    trash: { title: 'Trash', subtitle: 'Deleted profiles stay here until you restore or purge them.' },
    settings: { title: 'Settings', subtitle: 'Everything runs on this machine. Nothing is uploaded.' },
  }[page]), [page]);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#4f7cff',
          borderRadius: 8,
          fontSize: 13,
          fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
        },
        components: {
          Layout: { bodyBg: isDark ? '#0f0f0f' : '#f5f6f8' },
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <aside
          className={`app-sider ${isDark ? 'dark' : 'light'}${siderOpen ? '' : ' collapsed'}`}
          style={{ width: siderOpen ? 228 : 64, boxShadow: siderOpen ? '0 18px 50px rgba(0, 0, 0, 0.28)' : 'none' }}
          onMouseEnter={() => setSiderOpen(true)}
          onMouseLeave={() => setSiderOpen(false)}
        >
          <div className="app-brand">
            <img
              className="app-logo"
              src="./logo.png"
              alt="Morph Browser"
              width={30}
              height={30}
              style={{ borderRadius: 8, display: 'block', flex: 'none' }}
            />
            {siderOpen && (
              <div className="app-brand-text">
                <div className="app-brand-name">Morph Browser</div>
                <div className="app-brand-sub">Local workspace</div>
              </div>
            )}
          </div>

          <nav className="side-nav">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`side-item${page === item.key ? ' active' : ''}`}
                onClick={() => setPage(item.key)}
                title={siderOpen ? undefined : item.label}
              >
                <span className="side-icon">{item.icon}</span>
                {siderOpen && <span className="side-label">{item.label}</span>}
              </button>
            ))}
          </nav>

          <div className="side-bottom">
            <Popover
              title="Downloads"
              trigger={['hover', 'click']}
              placement="rightBottom"
              content={(
                <DownloadsPanel
                  tasks={downloads}
                  onDismiss={(key) => api.dismissDownloadTask(key).catch(() => {})}
                />
              )}
            >
              <button type="button" className="side-item" title="Downloads">
                <span className="side-icon">
                  <CloudDownloadOutlined />
                  {downloads.some((task) => task.status === 'downloading') && <span className="side-dot" />}
                </span>
                {siderOpen && <span className="side-label">Downloads</span>}
                {siderOpen && downloads.length > 0 && <span className="side-badge">{downloads.length}</span>}
              </button>
            </Popover>
            <button
              type="button"
              className={`side-item${page === 'settings' ? ' active' : ''}`}
              onClick={() => setPage('settings')}
              title={siderOpen ? undefined : 'Settings'}
            >
              <span className="side-icon"><SettingOutlined /></span>
              {siderOpen && <span className="side-label">Settings</span>}
            </button>
            <button
              type="button"
              className="side-item side-github"
              onClick={() => api.openExternal('https://github.com/ppouria/morph-browser').catch(() => {})}
              title="Project on GitHub"
            >
              <span className="side-icon"><GithubOutlined /></span>
              {siderOpen && <span className="side-label">GitHub</span>}
            </button>
            {siderOpen && (
              <button
                type="button"
                className="side-version"
                onClick={() => setPage('settings')}
                title={update && ['available', 'downloading', 'downloaded'].includes(update.status)
                  ? 'An update is available'
                  : 'Version'}
              >
                v{version || '—'}
                {update && ['available', 'downloading', 'downloaded'].includes(update.status) && (
                  <span className="side-version-dot" />
                )}
              </button>
            )}
          </div>
        </aside>

        <Layout style={{ marginLeft: siderOpen ? 228 : 64, minHeight: '100vh', transition: 'margin-left 180ms ease' }}>
          <Content style={{ padding: '24px 28px 40px' }}>
            <div style={{ maxWidth: 1560, margin: '0 auto' }}>
              {update && ['available', 'downloading', 'downloaded', 'error'].includes(update.status) && (
                <Alert
                  style={{ marginBottom: 16 }}
                  showIcon
                  icon={<DownloadOutlined />}
                  type={update.status === 'error' ? 'error' : update.status === 'downloaded' ? 'success' : 'info'}
                  message={updaterMessage(update)}
                  description={update.status === 'downloading' ? (
                    <Progress percent={update.progress || 0} size="small" status="active" />
                  ) : update.status === 'available' && update.dev ? (
                    'This is the development build; the packaged app can download and install it.'
                  ) : undefined}
                  action={(
                    <Space>
                      {update.status === 'available' && !update.dev && (
                        <Button size="small" type="primary" onClick={() => api.downloadUpdate().catch(() => {})}>
                          Download
                        </Button>
                      )}
                      {update.status === 'downloaded' && (
                        <Button size="small" type="primary" onClick={() => api.installUpdate().catch(() => {})}>
                          Restart to update
                        </Button>
                      )}
                      {update.status === 'error' && (
                        <Button size="small" onClick={() => api.checkUpdates().catch(() => {})}>Try again</Button>
                      )}
                    </Space>
                  )}
                />
              )}
              <div style={{ marginBottom: 20 }}>
                <Title level={4} style={{ margin: 0 }}>{pageTitle.title}</Title>
                <Text type="secondary">{pageTitle.subtitle}</Text>
              </div>

              {page === 'profiles' && (
                <ProfilesPage
                  profiles={profiles}
                  loading={loading}
                  majors={majors}
                  density={settings ? settings.density : 'middle'}
                  onNew={() => openEditor(null)}
                  onEdit={openEditor}
                  onRefresh={refresh}
                />
              )}

              {page === 'proxies' && (
                <ProxiesPage
                  proxies={proxies}
                  loading={loading}
                  onNew={() => openProxyEditor(null)}
                  onEdit={openProxyEditor}
                  onDelete={async (proxy) => {
                    if (!window.confirm(`Delete the saved proxy "${proxy.name}"?`)) return;
                    await run(() => api.deleteProxy(proxy.id), 'Proxy deleted');
                  }}
                />
              )}

              {page === 'trash' && (
                <TrashPage trash={trash} loading={loading} onRefresh={refresh} />
              )}

              {page === 'settings' && settings && (
                <SettingsPage
                  settings={settings}
                  kernels={kernels}
                  update={update}
                  themeMode={themeMode}
                  onTheme={handleTheme}
                  onSettings={applySettings}
                  notify={message}
                />
              )}
            </div>
          </Content>
        </Layout>

        <ProfileDialog
          open={editor.open}
          profile={editor.profile}
          profiles={profiles}
          proxies={proxies}
          majors={majors}
          kernels={kernels}
          settings={settings}
          isDark={isDark}
          onClose={() => setEditor({ open: false, profile: null })}
          onSaved={async () => { await refresh(); setEditor({ open: false, profile: null }); }}
        />

        <ProxyModal
          open={proxyEditor.open}
          proxy={proxyEditor.proxy}
          onClose={() => setProxyEditor({ open: false, proxy: null })}
          onSaved={async () => { await refresh(); setProxyEditor({ open: false, proxy: null }); }}
        />
      </Layout>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <AntApp>
      <Shell />
    </AntApp>
  );
}
