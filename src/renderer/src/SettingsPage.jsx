import React, { useEffect, useState } from 'react';
import {
  App as AntApp, Button, Card, Col, Descriptions, Divider, Input, List, Row, Segmented, Space, Switch, Typography,
} from 'antd';
import { DeleteOutlined, FolderOpenOutlined } from '@ant-design/icons';
import api from './api';

const { Text, Paragraph } = Typography;

export default function SettingsPage({ settings, themeMode, onTheme, onSettings, notify }) {
  const [path, setPath] = useState(settings.chromiumPath || '');
  const [builds, setBuilds] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadBuilds = () => api.listInstalledBuilds().then(setBuilds).catch(() => setBuilds([]));

  useEffect(() => { loadBuilds(); }, []);
  useEffect(() => { setPath(settings.chromiumPath || ''); }, [settings.chromiumPath]);

  const savePath = async () => {
    setSaving(true);
    try {
      await api.setSettings({ chromiumPath: path.trim() });
      onSettings(await api.getSettings());
      notify.success('Chromium path saved');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeBuild = async (version) => {
    try {
      await api.removeBuild(version);
      await loadBuilds();
      notify.success(`Chrome ${version} removed`);
    } catch (err) {
      notify.error(err.message);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="Appearance" size="small">
          <Paragraph type="secondary">Follow the system, or pin a theme for this app.</Paragraph>
          <Segmented
            value={themeMode}
            onChange={onTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Launch behaviour" size="small">
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space>
              <Switch
                checked={Boolean(settings.openCheckPage)}
                onChange={async (checked) => {
                  try {
                    await api.setSettings({ openCheckPage: checked });
                    onSettings(await api.getSettings());
                  } catch (err) {
                    notify.error(err.message);
                  }
                }}
              />
              <Text>Open the connection check page when a profile launches</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              The page shows the exit IP, location, WebRTC status and whether Google, Facebook,
              Amazon and other services are reachable from that profile.
            </Text>
          </Space>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Chromium" size="small">
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
        <Card title="Downloaded builds" size="small">
          <Paragraph type="secondary">
            Builds pinned by profiles. Removing one frees disk space; a profile downloads it again when needed.
          </Paragraph>
          <List
            size="small"
            dataSource={builds}
            locale={{ emptyText: 'Nothing downloaded yet' }}
            renderItem={(version) => (
              <List.Item
                actions={[
                  <Button key="remove" size="small" danger icon={<DeleteOutlined />} onClick={() => removeBuild(version)} />,
                ]}
              >
                <Text code>Chrome {version}</Text>
              </List.Item>
            )}
          />
        </Card>
      </Col>

      <Col span={24}>
        <Card title="Data folder" size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Application data">
              <Space>
                <FolderOpenOutlined />
                <Text code>{settings.dataDir || '—'}</Text>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          <Divider style={{ margin: '10px 0' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Profiles, proxies and settings live in <Text code>store.json</Text>. Each profile keeps its
            browser data in <Text code>profiles/&lt;id&gt;</Text>. Proxy passwords are stored in plain text
            for now.
          </Text>
        </Card>
      </Col>
    </Row>
  );
}
