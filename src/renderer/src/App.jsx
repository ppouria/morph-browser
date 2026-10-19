import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App as AntApp, ConfigProvider, Layout, Menu, Segmented, Space, Typography, theme,
} from 'antd';
import {
  AppstoreOutlined, ApiOutlined, DeleteOutlined, SettingOutlined,
} from '@ant-design/icons';
import api from './api';
import ProfilesPage from './ProfilesPage';
import ProxiesPage from './ProxiesPage';
import SettingsPage from './SettingsPage';
import TrashPage from './TrashPage';
import ProfileDialog from './ProfileDialog';
import ProxyModal from './ProxyModal';

const { Sider, Content } = Layout;
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
  const [editor, setEditor] = useState({ open: false, profile: null });
  const [proxyEditor, setProxyEditor] = useState({ open: false, proxy: null });

  const isDark = themeMode === 'system' ? systemDark : themeMode === 'dark';

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
    api.onChange(() => refresh().catch(() => {}));
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
          Layout: { siderBg: isDark ? '#141414' : '#ffffff', bodyBg: isDark ? '#0f0f0f' : '#f5f6f8' },
          Menu: { itemHeight: 38, itemMarginInline: 8 },
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          width={228}
          collapsedWidth={64}
          collapsed={!siderOpen}
          trigger={null}
          onMouseEnter={() => setSiderOpen(true)}
          onMouseLeave={() => setSiderOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            zIndex: 20,
            overflow: 'hidden',
            borderRight: `1px solid ${isDark ? '#262626' : '#f0f0f0'}`,
            background: isDark ? '#141414' : '#ffffff',
            transition: 'width 180ms ease, box-shadow 180ms ease',
            boxShadow: siderOpen ? '0 18px 50px rgba(0, 0, 0, 0.28)' : 'none',
          }}
        >
          <div className="app-brand" style={{ justifyContent: siderOpen ? 'flex-start' : 'center', padding: siderOpen ? '18px 20px 14px' : '18px 0 14px' }}>
            <img
              className="app-logo"
              src="./logo.png"
              alt="Morph Browser"
              width={30}
              height={30}
              style={{ borderRadius: 8, display: 'block', flex: 'none' }}
            />
            {siderOpen && (
              <div style={{ lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>Morph Browser</div>
                <Text type="secondary" style={{ fontSize: 11 }}>Local workspace</Text>
              </div>
            )}
          </div>

          <Menu
            mode="inline"
            selectedKeys={[page]}
            items={NAV}
            onClick={({ key }) => setPage(key)}
            style={{ borderInlineEnd: 'none' }}
          />

          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, borderTop: `1px solid ${isDark ? '#262626' : '#f0f0f0'}` }}>
            <Menu
              mode="inline"
              selectedKeys={[page]}
              items={[{ key: 'settings', icon: <SettingOutlined />, label: 'Settings' }]}
              onClick={({ key }) => setPage(key)}
              style={{ borderInlineEnd: 'none', marginBottom: 10 }}
            />
            {siderOpen && (
              <Segmented
                block
                size="small"
                value={themeMode}
                onChange={handleTheme}
                options={[
                  { value: 'system', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            )}
          </div>
        </Sider>

        <Layout style={{ marginLeft: siderOpen ? 228 : 64, minHeight: '100vh', transition: 'margin-left 180ms ease' }}>
          <Content style={{ padding: '24px 28px 40px' }}>
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>
              <div style={{ marginBottom: 20 }}>
                <Title level={4} style={{ margin: 0 }}>{pageTitle.title}</Title>
                <Text type="secondary">{pageTitle.subtitle}</Text>
              </div>

              {page === 'profiles' && (
                <ProfilesPage
                  profiles={profiles}
                  loading={loading}
                  majors={majors}
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
                  themeMode={themeMode}
                  onTheme={handleTheme}
                  onSettings={setSettings}
                  notify={message}
                />
              )}
            </div>
          </Content>
        </Layout>

        <ProfileDialog
          open={editor.open}
          profile={editor.profile}
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
