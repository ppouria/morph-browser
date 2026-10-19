import React, { useEffect, useState } from 'react';
import {
  App as AntApp, Button, Card, Col, Descriptions, Divider, Input, Popconfirm, Progress, Row, Segmented, Select, Space, Switch, Tag, Typography,
} from 'antd';
import {
  BgColorsOutlined, ChromeOutlined, CloudDownloadOutlined, DeleteOutlined, DesktopOutlined,
  FolderOpenOutlined, GithubOutlined, IdcardOutlined, InfoCircleOutlined, ReloadOutlined,
  RocketOutlined, ToolOutlined,
} from '@ant-design/icons';
import api from './api';
import { versionLabel } from './format';
import { OS_OPTIONS, SCREEN_PRESETS } from './profileOptions';

const { Text, Paragraph } = Typography;

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

export default function SettingsPage({ settings, kernels = [], update, themeMode, onTheme, onSettings, notify }) {
  const [path, setPath] = useState(settings.chromiumPath || '');
  const [stats, setStats] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [info, setInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => onSettings(await api.getSettings());

  const patch = async (value, success) => {
    try {
      await api.setSettings(value);
      await refresh();
      if (success) notify.success(success);
    } catch (err) {
      notify.error(err.message);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      setStats(await api.buildStats());
    } catch (err) {
      notify.error(err.message);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => { loadStats(); }, [kernels.length]);
  useEffect(() => { api.appInfo().then(setInfo).catch(() => {}); }, []);
  useEffect(() => { setPath(settings.chromiumPath || ''); }, [settings.chromiumPath]);

  const savePath = async () => {
    setSaving(true);
    try {
      await api.setSettings({ chromiumPath: path.trim() });
      await refresh();
      notify.success('Chromium path saved');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeBuild = async (kernel, version) => {
    try {
      await api.removeBuild(kernel, version);
      await loadStats();
      notify.success('Build removed');
    } catch (err) {
      notify.error(err.message);
    }
  };

  const removeAll = async (kernel) => {
    try {
      await api.removeAllBuilds(kernel);
      await loadStats();
      notify.success('Builds removed');
    } catch (err) {
      notify.error(err.message);
    }
  };

  const total = stats.reduce((sum, group) => sum + group.builds.reduce((n, build) => n + build.size, 0), 0);
  const withBuilds = stats.filter((group) => group.builds.length);
  const defaults = settings.defaults || {};

  return (
    <div className="settings-grid">
      <div className="settings-columns">
        <div className="settings-column">
        <div className="settings-card">
          <Card title={<Space size={8}><BgColorsOutlined />Appearance</Space>} size="small">
            <Paragraph type="secondary">Follow the system, or pin a theme for this app.</Paragraph>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Segmented
                value={themeMode}
                onChange={onTheme}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Table density</Text>
                <Segmented
                  value={settings.density || 'middle'}
                  onChange={(value) => patch({ density: value })}
                  options={[
                    { value: 'middle', label: 'Comfortable' },
                    { value: 'small', label: 'Compact' },
                  ]}
                />
              </div>
            </Space>
          </Card>
        </div>

        <div className="settings-card">
          <Card title={<Space size={8}><RocketOutlined />Launch behaviour</Space>} size="small">
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space>
                <Switch
                  checked={Boolean(settings.openCheckPage)}
                  onChange={(checked) => patch({ openCheckPage: checked })}
                />
                <Text>Open the connection check page when a profile launches</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                The page shows the exit IP, location, WebRTC status and whether Google, Facebook,
                Amazon and other services are reachable from that profile. It also shows the profile
                note and its number.
              </Text>
              <Divider style={{ margin: '4px 0' }} />
              <Space>
                <Switch
                  checked={Boolean(settings.launchOnBoot)}
                  onChange={(checked) => patch({ launchOnBoot: checked })}
                />
                <Text>Start Morph Browser when the system starts</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Adds the app to the login items of this system.
              </Text>
            </Space>
          </Card>
        </div>

        <div className="settings-card">
          <Card title={<Space size={8}><DesktopOutlined />Window</Space>} size="small">
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space>
                <Switch
                  checked={settings.rememberWindow !== false}
                  onChange={(checked) => patch({ rememberWindow: checked })}
                />
                <Text>Remember window size and position</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                The window opens where you left it. Turn this off to always start at the default size.
              </Text>
            </Space>
          </Card>
        </div>

        <div className="settings-card">
          <Card title={<Space size={8}><ToolOutlined />Maintenance</Space>} size="small">
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Button icon={<FolderOpenOutlined />} onClick={() => api.openDataDir().catch((err) => notify.error(err.message))}>
                Open data folder
              </Button>
              <Popconfirm
                title="Reset all settings?"
                description="Profiles, proxies and downloaded browsers stay untouched."
                okText="Reset"
                okButtonProps={{ danger: true }}
                onConfirm={async () => {
                  try {
                    onSettings(await api.resetSettings());
                    notify.success('Settings reset');
                  } catch (err) {
                    notify.error(err.message);
                  }
                }}
              >
                <Button danger>Reset settings</Button>
              </Popconfirm>
            </Space>
          </Card>
        </div>

        </div>
        <div className="settings-column">
        <div className="settings-card">
          <Card title={<Space size={8}><IdcardOutlined />New profile defaults</Space>} size="small">
            <Paragraph type="secondary">Values a new profile starts with. You can still change them per profile.</Paragraph>
            <Row gutter={[10, 10]}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Kernel</Text>
                <Select
                  style={{ width: '100%' }}
                  value={defaults.kernel}
                  onChange={(value) => patch({ defaults: { kernel: value } })}
                  options={kernels.map((kernel) => ({ value: kernel.id, label: kernel.label }))}
                />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Operating system</Text>
                <Select
                  style={{ width: '100%' }}
                  value={defaults.os}
                  onChange={(value) => patch({ defaults: { os: value } })}
                  options={OS_OPTIONS}
                />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Screen</Text>
                <Select
                  style={{ width: '100%' }}
                  value={defaults.screen}
                  onChange={(value) => patch({ defaults: { screen: value } })}
                  options={SCREEN_PRESETS}
                />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Timezone</Text>
                <Select
                  style={{ width: '100%' }}
                  value={defaults.timezone}
                  onChange={(value) => patch({ defaults: { timezone: value } })}
                  options={[{ value: 'real', label: 'Real' }, { value: 'ip', label: 'Based on IP' }]}
                />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Language</Text>
                <Select
                  style={{ width: '100%' }}
                  value={defaults.language}
                  onChange={(value) => patch({ defaults: { language: value } })}
                  options={[{ value: 'real', label: 'Real' }, { value: 'ip', label: 'Based on IP' }]}
                />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Fingerprint</Text>
                <div style={{ marginTop: 4 }}>
                  <Space>
                    <Switch
                      size="small"
                      checked={Boolean(defaults.randomFingerprint)}
                      onChange={(checked) => patch({ defaults: { randomFingerprint: checked } })}
                    />
                    <Text style={{ fontSize: 12 }}>New seed on every launch</Text>
                  </Space>
                </div>
              </Col>
            </Row>
          </Card>
        </div>

        <div className="settings-card">
          <Card title={<Space size={8}><CloudDownloadOutlined />Updates</Space>} size="small">
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Text>
                Current version <Text code>v{info ? info.version : '—'}</Text>
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {update && update.status === 'checking' && 'Checking GitHub for a new stable release…'}
                {update && update.detail ? update.detail : null}
                {update && update.status === 'downloading' && `Downloading ${update.version || 'the update'}…`}
                {update && update.status === 'downloaded' && `Version ${update.version} is ready to install.`}
                {update && update.status === 'error' && `Update check failed: ${update.error}`}
                {(!update || update.status === 'idle') && 'Checks the GitHub releases of this project.'}
              </Text>
              {update && update.status === 'downloading' && (
                <Progress percent={update.progress || 0} size="small" status="active" />
              )}
              <Space wrap>
                <Button
                  icon={<ReloadOutlined />}
                  loading={update && update.status === 'checking'}
                  onClick={() => api.checkUpdates().catch((err) => notify.error(err.message))}
                >
                  Check now
                </Button>
                {update && update.status === 'available' && !update.dev && (
                  <Button type="primary" onClick={() => api.downloadUpdate().catch((err) => notify.error(err.message))}>
                    Download update
                  </Button>
                )}
                {update && update.status === 'downloaded' && (
                  <Button type="primary" onClick={() => api.installUpdate().catch((err) => notify.error(err.message))}>
                    Restart to update
                  </Button>
                )}
              </Space>
              <Divider style={{ margin: '2px 0' }} />
              <Space>
                <Switch
                  checked={settings.updates ? settings.updates.checkOnLaunch !== false : true}
                  onChange={(checked) => patch({ updates: { checkOnLaunch: checked } })}
                />
                <Text>Check for updates on launch</Text>
              </Space>
              <Space>
                <Switch
                  checked={settings.updates ? settings.updates.autoDownload !== false : true}
                  onChange={(checked) => patch({ updates: { autoDownload: checked } })}
                />
                <Text>Download new versions automatically</Text>
              </Space>
              <Space>
                <Switch
                  checked={Boolean(settings.updates && settings.updates.installOnQuit)}
                  onChange={(checked) => patch({ updates: { installOnQuit: checked } })}
                />
                <Text>Install the downloaded update when the app quits</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Updates come from the stable GitHub releases. A downloaded update can always be installed
                with “Restart to update”.
              </Text>
            </Space>
          </Card>
        </div>

        <div className="settings-card">
          <Card title={<Space size={8}><ChromeOutlined />System Chromium</Space>} size="small">
            <Paragraph type="secondary">
              {settings.detected ? `Detected: ${settings.detected}` : 'No Chrome or Chromium found. Set a path or pin a Chrome version per profile.'}
            </Paragraph>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="Path to a Chrome or Chromium binary"
              />
              <Button type="primary" loading={saving} onClick={savePath}>Save</Button>
            </Space.Compact>
          </Card>
        </div>

        </div>
      </div>

      <div className="settings-card wide">
        <Card
          title={(
            <Space>
              <CloudDownloadOutlined />
              <span>Downloaded browsers</span>
              <Tag bordered={false}>{formatBytes(total)}</Tag>
            </Space>
          )}
          size="small"
          extra={(
            <Button size="small" icon={<ReloadOutlined />} loading={loadingStats} onClick={loadStats}>
              Refresh
            </Button>
          )}
        >
          <Paragraph type="secondary">
            Every build a profile has downloaded. Removing one frees disk space; the profile downloads
            it again the next time it launches.
          </Paragraph>

          {withBuilds.length === 0 && <Text type="secondary">Nothing downloaded yet.</Text>}

          {withBuilds.map((group) => (
            <div key={group.id} className="build-group">
              <div className="build-group-head">
                <Space>
                  <Text strong>{group.label}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatBytes(group.builds.reduce((sum, build) => sum + build.size, 0))}
                  </Text>
                </Space>
                <Popconfirm
                  title={`Remove every ${group.label} build?`}
                  description="Profiles download them again when they launch."
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => removeAll(group.id)}
                >
                  <Button size="small" danger>Remove all</Button>
                </Popconfirm>
              </div>
              {group.builds.map((build) => (
                <div className="build-row" key={build.version}>
                  <Text code>{versionLabel(group.id, build.version)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{formatBytes(build.size)}</Text>
                  <Space size={2}>
                    <Button
                      size="small"
                      type="text"
                      icon={<FolderOpenOutlined />}
                      onClick={() => api.openPath(build.dir).catch((err) => notify.error(err.message))}
                    />
                    <Popconfirm
                      title="Remove this build?"
                      description="A profile using it downloads it again."
                      okText="Remove"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => removeBuild(group.id, build.version)}
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>

      <div className="settings-card wide">
        <Card title={<Space size={8}><InfoCircleOutlined />About</Space>} size="small">
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="Version">{info ? info.version : '—'}</Descriptions.Item>
            <Descriptions.Item label="Electron">{info ? info.electron : '—'}</Descriptions.Item>
            <Descriptions.Item label="Platform">{info ? info.platform : '—'}</Descriptions.Item>
          </Descriptions>
          <Divider style={{ margin: '10px 0' }} />
          <Button icon={<GithubOutlined />} onClick={() => api.openExternal('https://github.com/ppouria/morph-browser').catch(() => {})}>
            Project on GitHub
          </Button>
          <Divider style={{ margin: '10px 0' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Profiles, proxies and settings live in <Text code>store.json</Text>; each profile keeps its
            browser data in <Text code>profiles/&lt;id&gt;</Text>. Proxy passwords are stored in plain text
            for now.
          </Text>
        </Card>
      </div>
    </div>
  );
}
