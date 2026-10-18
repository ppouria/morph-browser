import React, { useMemo, useState } from 'react';
import {
  Alert, App as AntApp, Avatar, Badge, Button, Dropdown, Empty, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  DeleteOutlined, DownloadOutlined, EditOutlined, EllipsisOutlined, ExportOutlined, ImportOutlined, PlusOutlined, PoweroffOutlined, TagsOutlined, UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from './api';
import { avatarColor, chromeLabel, groupOptions, initialOf } from './format';

const { Text } = Typography;

const errorText = (err) => String(err && err.message ? err.message : err)
  .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export default function ProfilesPage({ profiles, loading, onNew, onEdit, onRefresh }) {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState();
  const [tag, setTag] = useState();
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchForm] = Form.useForm();

  const groups = useMemo(() => groupOptions(profiles), [profiles]);
  const tags = useMemo(() => [...new Set(profiles.flatMap((profile) => profile.tags || []))]
    .sort()
    .map((value) => ({ value, label: value })), [profiles]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (group && profile.group !== group) return false;
      if (tag && !(profile.tags || []).includes(tag)) return false;
      if (!term) return true;
      return profile.name.toLowerCase().includes(term)
        || (profile.group || '').toLowerCase().includes(term)
        || (profile.notes || '').toLowerCase().includes(term)
        || (profile.tags || []).some((value) => value.toLowerCase().includes(term));
    });
  }, [profiles, query, group, tag]);

  const run = async (fn, success) => {
    try {
      await fn();
      await onRefresh();
      if (success) message.success(success);
      return true;
    } catch (err) {
      message.error(errorText(err));
      return false;
    }
  };

  const bulk = async (kind) => {
    const ids = [...selected];
    setBusy(true);
    const failures = [];
    for (const id of ids) {
      try {
        if (kind === 'launch') await api.launchProfile(id);
        else if (kind === 'stop') await api.stopProfile(id);
        else await api.trashProfile(id);
      } catch (err) {
        failures.push(errorText(err));
      }
    }
    setSelected([]);
    setBusy(false);
    await onRefresh();
    if (failures.length) message.error(failures[0]);
    else message.success(`${ids.length} profile${ids.length > 1 ? 's' : ''} updated`);
  };

  const applyBatch = async () => {
    const values = await batchForm.validateFields();
    const patch = {};
    if (values.group !== undefined) patch.group = values.group || '';
    if (values.tags !== undefined) patch.tags = String(values.tags || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    setBusy(true);
    const ok = await run(() => api.batchUpdate([...selected], patch), 'Profiles updated');
    setBusy(false);
    if (ok) {
      setBatchOpen(false);
      setSelected([]);
    }
  };

  const exportProfiles = async (ids) => {
    try {
      const result = await api.exportProfiles(ids);
      if (!result.canceled) message.success(`${result.count} profile(s) exported`);
    } catch (err) {
      message.error(errorText(err));
    }
  };

  const importProfiles = async () => {
    try {
      const result = await api.importProfiles();
      if (!result.canceled) {
        await onRefresh();
        message.success(`${result.count} profile(s) imported`);
      }
    } catch (err) {
      message.error(errorText(err));
    }
  };

  const columns = [
    {
      title: 'Profile',
      dataIndex: 'name',
      render: (_, profile) => (
        <Space size={10} align="start">
          <Avatar shape="square" style={{ background: avatarColor(`${profile.id}${profile.name}`), flex: 'none' }}>
            {initialOf(profile.name)}
          </Avatar>
          <span>
            <div style={{ fontWeight: 500 }}>{profile.name}</div>
            <Space size={4} wrap>
              {profile.group && <Tag bordered={false}>{profile.group}</Tag>}
              {profile.tags.map((value) => <Tag key={value} bordered={false} color="purple">{value}</Tag>)}
              <Tag bordered={false} color="blue">{chromeLabel(profile)}</Tag>
              {profile.totp && <Tag bordered={false} color="green">2FA</Tag>}
              {profile.startUrls.length > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>{profile.startUrls.length} start tab{profile.startUrls.length > 1 ? 's' : ''}</Text>
              )}
            </Space>
          </span>
        </Space>
      ),
    },
    {
      title: 'Proxy',
      dataIndex: 'proxy',
      width: 250,
      render: (proxy) => (proxy ? (
        <Space size={6}>
          <Tag color="geekblue" style={{ marginInlineEnd: 0, textTransform: 'uppercase', fontSize: 10 }}>{proxy.type}</Tag>
          <Text code style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{proxy.host}:{proxy.port}</Text>
        </Space>
      ) : <Text type="secondary">Direct</Text>),
    },
    {
      title: 'Last opened',
      dataIndex: 'lastOpenedAt',
      width: 175,
      sorter: (a, b) => String(a.lastOpenedAt || '').localeCompare(String(b.lastOpenedAt || '')),
      render: (value) => (value ? <Text type="secondary">{dayjs(value).format('MMM D, HH:mm')}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Status',
      dataIndex: 'running',
      width: 160,
      render: (running, profile) => (
        <Space direction="vertical" size={0}>
          <Badge status={running ? 'processing' : 'default'} text={running ? 'Running' : 'Stopped'} />
          {running && profile.debugPort && <Text type="secondary" style={{ fontSize: 11 }}>CDP :{profile.debugPort}</Text>}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 150,
      align: 'right',
      render: (_, profile) => (
        <Space size={4}>
          <Tooltip title={profile.running ? 'Stop this browser' : 'Launch this profile'}>
            <Button
              size="small"
              type={profile.running ? 'default' : 'primary'}
              icon={profile.running ? <PoweroffOutlined /> : null}
              onClick={() => run(() => (profile.running ? api.stopProfile(profile.id) : api.launchProfile(profile.id)))}
            >
              {profile.running ? 'Stop' : 'Open'}
            </Button>
          </Tooltip>
          <Tooltip title="Edit">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(profile)} />
          </Tooltip>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'duplicate', icon: <TagsOutlined />, label: 'Duplicate' },
                { key: 'export', icon: <ExportOutlined />, label: 'Export' },
                { key: 'cookies', icon: <DeleteOutlined />, label: 'Clear cookies' },
                { type: 'divider' },
                { key: 'trash', danger: true, icon: <DeleteOutlined />, label: 'Move to trash' },
              ],
              onClick: ({ key }) => {
                if (key === 'duplicate') run(() => api.duplicateProfile(profile.id), 'Profile duplicated');
                if (key === 'export') exportProfiles([profile.id]);
                if (key === 'cookies') run(() => api.clearCookies(profile.id), 'Cookies cleared');
                if (key === 'trash') run(() => api.trashProfile(profile.id), 'Moved to trash');
              },
            }}
          >
            <Button size="small" type="text" icon={<EllipsisOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 14 }} wrap>
        <Input.Search
          allowClear
          placeholder="Search profiles"
          style={{ width: 230 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select allowClear placeholder="All groups" style={{ width: 150 }} options={groups} value={group} onChange={setGroup} />
        <Select allowClear placeholder="All tags" style={{ width: 150 }} options={tags} value={tag} onChange={setTag} />
        <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>New profile</Button>
        <Tooltip title="Import profiles">
          <Button icon={<DownloadOutlined />} onClick={importProfiles} />
        </Tooltip>
        <Tooltip title="Export all profiles">
          <Button icon={<UploadOutlined />} onClick={() => exportProfiles([])} />
        </Tooltip>
      </Space>

      {selected.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${selected.length} selected`}
          action={(
            <Space>
              <Button size="small" loading={busy} onClick={() => bulk('launch')}>Launch</Button>
              <Button size="small" loading={busy} onClick={() => bulk('stop')}>Stop</Button>
              <Button size="small" icon={<TagsOutlined />} onClick={() => setBatchOpen(true)}>Edit</Button>
              <Button size="small" icon={<ExportOutlined />} onClick={() => exportProfiles([...selected])}>Export</Button>
              <Button size="small" danger loading={busy} onClick={() => bulk('delete')}>Delete</Button>
            </Space>
          )}
        />
      )}

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={false}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        onRow={(profile) => ({ onDoubleClick: () => onEdit(profile) })}
        locale={{
          emptyText: (
            <Empty description="No profiles yet">
              <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>Create your first profile</Button>
            </Empty>
          ),
        }}
      />

      <Modal
        open={batchOpen}
        title={`Edit ${selected.length} profile(s)`}
        okText="Apply"
        confirmLoading={busy}
        onOk={applyBatch}
        onCancel={() => setBatchOpen(false)}
        destroyOnClose
      >
        <Form form={batchForm} layout="vertical" preserve={false} style={{ marginTop: 12 }}>
          <Form.Item name="group" label="Group" extra="Leave empty to clear the group.">
            <Input placeholder="Group name" />
          </Form.Item>
          <Form.Item name="tags" label="Tags" extra="Comma separated; replaces the current tags.">
            <Input placeholder="shop, warmup" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
