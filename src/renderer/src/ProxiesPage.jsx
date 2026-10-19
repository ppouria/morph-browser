import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, App as AntApp, Button, Input, Modal, Popconfirm, Progress, Space, Switch, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  CloudUploadOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined,
} from '@ant-design/icons';
import api from './api';
import { countryFlag } from './format';

const { Text } = Typography;

const FORMAT_HINT = 'One per line: host:port · host:port:user:pass · user:pass@host:port · socks5://user:pass@host:port';

function ImportModal({ open, onClose, onDone, notify }) {
  const [text, setText] = useState('');
  const [checkLocation, setCheckLocation] = useState(true);
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    setResult(null);
    setProgress(null);
    return api.onProxiesProgress((value) => setProgress(value));
  }, [open]);

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const submit = async () => {
    if (!lines.length) return;
    setBusy(true);
    setResult(null);
    setProgress({ done: 0, total: lines.length });
    try {
      const imported = await api.importProxies(text, { check: checkLocation, namePrefix: prefix.trim() });
      setResult(imported);
      await onDone();
      if (imported.imported) notify.success(`${imported.imported} proxies imported`);
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Modal
      open={open}
      title="Import proxies"
      okText={busy ? 'Importing…' : 'Import'}
      confirmLoading={busy}
      onOk={submit}
      onCancel={busy ? undefined : onClose}
      width={640}
      destroyOnClose
    >
      <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 10 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{FORMAT_HINT}</Text>
        <Input.TextArea
          rows={9}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'de.proxy.example:8000:user:pass\nsocks5://user:pass@1.2.3.4:1080\n5.6.7.8:3128'}
          spellCheck={false}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
        <Space wrap>
          <Switch checked={checkLocation} onChange={setCheckLocation} />
          <Text>Check IP and location while importing</Text>
        </Space>
        <Input
          value={prefix}
          onChange={(event) => setPrefix(event.target.value)}
          placeholder="Optional name prefix, e.g. DE"
          maxLength={40}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>{lines.length} line(s) queued</Text>
        {progress && (
          <Progress
            percent={progress.total ? Math.round((progress.done / progress.total) * 100) : 0}
            size="small"
            format={() => `${progress.done}/${progress.total}`}
          />
        )}
        {result && (
          <Alert
            type={result.errors.length ? 'warning' : 'success'}
            showIcon
            message={`${result.imported} imported · ${result.skipped} duplicates · ${result.errors.length} errors`}
            description={result.errors.length ? result.errors[0].error : undefined}
          />
        )}
      </Space>
    </Modal>
  );
}

export default function ProxiesPage({ proxies, loading, onNew, onEdit, onRefresh }) {
  const { message } = AntApp.useApp();
  const [importOpen, setImportOpen] = useState(false);
  const [checking, setChecking] = useState({});

  const remove = async (proxy) => {
    try {
      await api.deleteProxy(proxy.id);
      await onRefresh();
      message.success('Proxy deleted');
    } catch (err) {
      message.error(err.message);
    }
  };

  const recheck = async (proxy) => {
    setChecking((current) => ({ ...current, [proxy.id]: true }));
    try {
      await api.recheckProxy(proxy.id);
      await onRefresh();
      message.success('Proxy location updated');
    } catch (err) {
      message.error(err.message);
    } finally {
      setChecking((current) => ({ ...current, [proxy.id]: false }));
    }
  };

  const columns = useMemo(() => [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name, proxy) => (
        <span>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{proxy.username || 'no login'}</Text>
        </span>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 90,
      render: (type) => <Tag color="geekblue" style={{ textTransform: 'uppercase', fontSize: 10 }}>{type}</Tag>,
    },
    {
      title: 'Host : Port',
      key: 'host',
      width: 210,
      render: (_, proxy) => <Text code>{proxy.host}:{proxy.port}</Text>,
    },
    {
      title: 'Location',
      key: 'location',
      width: 230,
      render: (_, proxy) => (proxy.location && proxy.location.countryCode ? (
        <div>
          <div>{countryFlag(proxy.location.countryCode)} {proxy.location.country || proxy.location.countryCode}
            {proxy.location.city ? <Text type="secondary"> · {proxy.location.city}</Text> : null}
          </div>
          {proxy.location.ip && <Text type="secondary" style={{ fontSize: 11 }}>{proxy.location.ip}</Text>}
        </div>
      ) : <Text type="secondary">Not checked</Text>),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      align: 'right',
      render: (_, proxy) => (
        <Space size={2}>
          <Tooltip title="Check IP and location">
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              loading={Boolean(checking[proxy.id])}
              onClick={() => recheck(proxy)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(proxy)} />
          </Tooltip>
          <Popconfirm
            title="Delete this saved proxy?"
            description="Profiles keep their own copy."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(proxy)}
          >
            <Tooltip title="Delete">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ], [checking, onEdit]);

  return (
    <>
      <Space style={{ marginBottom: 14 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>New proxy</Button>
        <Button icon={<CloudUploadOutlined />} onClick={() => setImportOpen(true)}>Import proxies</Button>
      </Space>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={proxies}
        columns={columns}
        pagination={false}
        locale={{ emptyText: 'No saved proxies yet' }}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={async () => {
          await onRefresh();
        }}
        notify={message}
      />
    </>
  );
}
