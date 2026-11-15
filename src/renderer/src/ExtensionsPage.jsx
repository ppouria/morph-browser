import React, { useState } from 'react';
import { Alert, App as AntApp, Button, Empty, Switch, Tag, Typography } from 'antd';
import { AppstoreAddOutlined, DeleteOutlined } from '@ant-design/icons';
import api from './api';

const { Text } = Typography;

function errorText(err) {
  return String(err && err.message ? err.message : err)
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export default function ExtensionsPage({ extensions, loading, onRefresh }) {
  const { message } = AntApp.useApp();
  const [busy, setBusy] = useState(null);

  const add = async () => {
    setBusy('add');
    try {
      const extension = await api.addExtension();
      if (extension) {
        await onRefresh();
        message.success(`${extension.name} added`);
      }
    } catch (err) {
      message.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (extension, enabled) => {
    setBusy(extension.id);
    try {
      await api.setExtensionEnabled(extension.id, enabled);
      await onRefresh();
    } catch (err) {
      message.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (extension) => {
    if (!window.confirm(`Remove "${extension.name}" from every profile?`)) return;
    setBusy(extension.id);
    try {
      await api.removeExtension(extension.id);
      await onRefresh();
      message.success('Extension removed');
    } catch (err) {
      message.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 14 }}
        message="Extensions are loaded into every Chromium profile at launch."
        description="Add an unpacked Chrome extension folder. Built-in extensions can be disabled but not removed. Firefox profiles do not use this manager."
      />

      <div className="extensions-toolbar">
        <Text type="secondary">
          {extensions.length} extension{extensions.length === 1 ? '' : 's'}
          {' · '}
          {extensions.filter((extension) => extension.enabled).length} enabled
        </Text>
        <Button
          type="primary"
          icon={<AppstoreAddOutlined />}
          loading={busy === 'add'}
          onClick={add}
        >
          Add extension
        </Button>
      </div>

      {extensions.length === 0 && !loading ? (
        <Empty description="No extensions yet">
          <Button type="primary" icon={<AppstoreAddOutlined />} onClick={add}>Add your first extension</Button>
        </Empty>
      ) : (
        <div className="extensions-grid">
          {extensions.map((extension) => (
            <div key={extension.id} className={`extension-card${extension.enabled ? '' : ' is-off'}`}>
              <div className="extension-head">
                <div className="extension-icon"><AppstoreAddOutlined /></div>
                <div className="extension-title">
                  <Text strong ellipsis style={{ maxWidth: 220 }}>{extension.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>v{extension.version}</Text>
                </div>
                <Switch
                  checked={extension.enabled}
                  loading={busy === extension.id}
                  onChange={(checked) => toggle(extension, checked)}
                />
              </div>
              <div className="extension-meta">
                <Tag bordered={false} color={extension.builtin ? 'geekblue' : 'default'}>
                  {extension.builtin ? 'Built-in' : 'Local'}
                </Tag>
                <Text type="secondary" ellipsis={{ tooltip: extension.path }} style={{ fontSize: 11, maxWidth: 230 }}>
                  {extension.path}
                </Text>
              </div>
              {!extension.builtin && (
                <div className="extension-actions">
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === extension.id} onClick={() => remove(extension)}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
