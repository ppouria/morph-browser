import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Divider, Input, InputNumber, Row, Space, Switch, Tag, Typography,
} from 'antd';
import {
  ApiOutlined, ChromeOutlined, CopyOutlined, GlobalOutlined, LockOutlined, ReloadOutlined, ToolOutlined,
} from '@ant-design/icons';
import api from './api';

const { Text, Paragraph } = Typography;

const PROFILE_TOOLS = [
  ['list_profiles', 'List profiles, their proxy and running state'],
  ['get_profile', 'Read one profile with its full configuration'],
  ['create_profile', 'Create a profile without launching it'],
  ['update_profile', 'Edit a profile'],
  ['delete_profile', 'Delete a stopped profile and its data'],
  ['launch_profile', 'Open Chromium for a profile'],
  ['stop_profile', 'Stop a running profile'],
];

const BROWSER_TOOLS = [
  ['browser_status', 'Running profiles and open tabs'],
  ['browser_navigate', 'Open a URL in the active tab'],
  ['browser_snapshot', 'ARIA tree of the page for the model'],
  ['browser_screenshot', 'PNG screenshot'],
  ['browser_click', 'Click by CSS selector, text or coordinates'],
  ['browser_type', 'Fill an input or type with the keyboard'],
  ['browser_press', 'Press a key'],
  ['browser_evaluate', 'Run JavaScript in the page'],
  ['browser_tabs', 'List, open, select or close tabs'],
  ['browser_go_back / forward / reload', 'History and reload'],
  ['browser_wait', 'Wait up to 30 seconds'],
];

function toolRows(rows) {
  return rows.map(([name, description]) => (
    <div key={name} className="mcp-tool-row">
      <Text code style={{ fontSize: 12 }}>{name}</Text>
      <Text type="secondary" style={{ fontSize: 12 }}>{description}</Text>
    </div>
  ));
}

export default function McpPage({ settings, onSettings, notify }) {
  const mcp = settings.mcp || { enabled: false, port: 19777, token: '' };
  const [port, setPort] = useState(mcp.port || 19777);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setPort(mcp.port || 19777), [mcp.port]);
  useEffect(() => {
    let active = true;
    const load = () => api.mcpStatus().then((result) => { if (active) setStatus(result); }).catch(() => {});
    load();
    const timer = setInterval(load, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [mcp.enabled, mcp.port]);

  const patch = async (value, success) => {
    setBusy(true);
    try {
      await api.setSettings(value);
      onSettings(await api.getSettings());
      if (success) notify.success(success);
      api.mcpStatus().then(setStatus).catch(() => {});
    } catch (err) {
      notify.error(String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      notify.success(`${label} copied`);
    } catch {
      notify.error('Could not copy to the clipboard');
    }
  };

  const rotate = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    patch({ mcp: { token } }, 'MCP token regenerated');
  };

  const portNumber = Number(mcp.port) || 19777;
  const url = `http://127.0.0.1:${portNumber}/mcp`;
  const token = mcp.token || '';
  const config = JSON.stringify({
    mcpServers: {
      'morph-browser': {
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }, null, 2);
  const stdioConfig = JSON.stringify({
    mcpServers: {
      'morph-browser': {
        command: 'npx',
        args: ['-y', 'mcp-remote', url, '--header', `Authorization: Bearer ${token}`],
      },
    },
  }, null, 2);

  const serverState = status && status.error
    ? { type: 'error', text: `Server failed: ${status.error}` }
    : status && status.running
      ? { type: 'success', text: `Listening on 127.0.0.1:${status.port}` }
      : mcp.enabled
        ? { type: 'info', text: 'Starting the local server…' }
        : { type: 'warning', text: 'MCP server is off' };

  return (
    <div className="mcp-page">
      <Card className="mcp-hero" size="small">
        <div className="mcp-hero-row">
          <div className="mcp-hero-icon"><ApiOutlined /></div>
          <div className="mcp-hero-copy">
            <Space size={8} align="center">
              <Text strong style={{ fontSize: 15 }}>Local MCP server</Text>
              <Tag bordered={false} color={mcp.enabled ? (status && status.running ? 'green' : 'orange') : 'default'}>
                {mcp.enabled ? (status && status.running ? 'RUNNING' : 'STARTING') : 'OFF'}
              </Tag>
            </Space>
            <Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
              Let an AI client create, edit and open profiles, then control the browser it opened.
              Only localhost is bound; every request needs the token.
            </Text>
          </div>
          <Switch
            checked={Boolean(mcp.enabled)}
            loading={busy}
            onChange={(checked) => patch({ mcp: { enabled: checked } }, checked ? 'MCP server enabled' : 'MCP server disabled')}
          />
        </div>
        <Alert
          style={{ marginTop: 12 }}
          type={serverState.type}
          showIcon
          message={serverState.text}
        />
      </Card>

      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={24} lg={12}>
          <Card title={<Space size={8}><ToolOutlined />Server settings</Space>} size="small">
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Port</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber style={{ width: 140 }} min={1024} max={65535} value={port} onChange={setPort} />
                  <Button loading={busy} onClick={() => patch({ mcp: { port: Number(port) } }, 'MCP port saved')}>Save port</Button>
                </Space.Compact>
                <Text type="secondary" style={{ fontSize: 11 }}>The server binds to 127.0.0.1 only.</Text>
              </div>

              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Bearer token</Text>
                <Input
                  readOnly
                  value={token}
                  addonAfter={(
                    <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(token, 'Token')}>Copy</Button>
                  )}
                />
                <Button size="small" icon={<ReloadOutlined />} style={{ marginTop: 6 }} loading={busy} onClick={rotate}>
                  Regenerate token
                </Button>
              </div>

              <Divider style={{ margin: '2px 0' }} />
              <Space size={8}>
                <LockOutlined />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Restarting the server or regenerating the token disconnects current MCP clients.
                </Text>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={<Space size={8}><GlobalOutlined />Connection</Space>} size="small">
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Endpoint</Text>
                <Input
                  readOnly
                  value={url}
                  addonAfter={<Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(url, 'Endpoint')}>Copy</Button>}
                />
              </div>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Client config (HTTP)</Text>
                <Input.TextArea readOnly value={config} autoSize={{ minRows: 7, maxRows: 12 }} />
                <Button size="small" icon={<CopyOutlined />} style={{ marginTop: 6 }} onClick={() => copy(config, 'Config')}>
                  Copy HTTP config
                </Button>
              </div>
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>For stdio-only clients</Text>
                <Input.TextArea readOnly value={stdioConfig} autoSize={{ minRows: 6, maxRows: 10 }} />
                <Button size="small" icon={<CopyOutlined />} style={{ marginTop: 6 }} onClick={() => copy(stdioConfig, 'stdio config')}>
                  Copy stdio config
                </Button>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title={<Space size={8}><ChromeOutlined />Available tools</Space>} size="small" style={{ marginTop: 14 }}>
        <Paragraph type="secondary" style={{ marginBottom: 10 }}>
          The client sees these tools while the server is enabled. Profile changes are reflected in
          this app immediately; browser tools attach to the DevTools port of the running profile.
        </Paragraph>
        <Row gutter={[18, 10]}>
          <Col xs={24} md={12}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Profile management</Text>
            <div className="mcp-tool-list">{toolRows(PROFILE_TOOLS)}</div>
          </Col>
          <Col xs={24} md={12}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Browser control</Text>
            <div className="mcp-tool-list">{toolRows(BROWSER_TOOLS)}</div>
          </Col>
        </Row>
      </Card>

      <Alert
        style={{ marginTop: 14 }}
        type="warning"
        showIcon
        message="Local control is powerful"
        description="The token grants profile deletion and full browser automation. Keep it private and disable the server when you are not using an AI client. The server never binds to a non-loopback address."
      />
    </div>
  );
}
