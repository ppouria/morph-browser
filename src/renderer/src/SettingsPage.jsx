import React, { useEffect, useState } from 'react';
import {
  App as AntApp, Button, Card, Col, Descriptions, Divider, Input, Popconfirm, Row, Segmented, Select, Space, Switch, Tag, Typography,
} from 'antd';
import {
  DeleteOutlined, FolderOpenOutlined, GithubOutlined, ReloadOutlined,
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

export default function SettingsPage({ settings, kernels = [], themeMode, onTheme, onSettings, notify }) {
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
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="Appearance" size="small">
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
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Window" size="small">
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
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Launch behaviour" size="small">
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
          </Space>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title="New profile defaults" size="small">
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
      </Col>

      <Col span={24}>
        <Card
          title={(
            <Space>
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
      </Col>

      <Col xs={24} lg={12}>
        <Card title="System Chromium" size="small">
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
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Maintenance" size="small">
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
      </Col>

      <Col span={24}>
        <Card title="About" size="small">
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
      </Col>
    </Row>
  );
}
