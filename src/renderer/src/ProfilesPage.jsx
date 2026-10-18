import React, { useMemo, useState } from 'react';
import {
  Alert, App as AntApp, Avatar, Badge, Button, Empty, Input, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, PoweroffOutlined } from '@ant-design/icons';
import api from './api';
import { avatarColor, chromeLabel, groupOptions, initialOf } from './format';

const { Text } = Typography;

function errorText(err) {
  return err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export default function ProfilesPage({ profiles, loading, onNew, onEdit, onRefresh }) {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState();
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupOptions(profiles), [profiles]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (group && profile.group !== group) return false;
      if (!term) return true;
      return profile.name.toLowerCase().includes(term)
        || (profile.group || '').toLowerCase().includes(term)
        || (profile.notes || '').toLowerCase().includes(term);
    });
  }, [profiles, query, group]);

  const act = async (fn, success) => {
    try {
      await fn();
      await onRefresh();
      if (success) message.success(success);
    } catch (err) {
      message.error(errorText(err));
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
        else await api.deleteProfile(id);
      } catch (err) {
        const profile = profiles.find((item) => item.id === id);
        failures.push(`${profile ? profile.name : id}: ${errorText(err)}`);
      }
    }
    await onRefresh();
    setSelected([]);
    setBusy(false);
    if (failures.length) message.error(failures[0]);
    else message.success(`${ids.length} profile${ids.length > 1 ? 's' : ''} updated`);
  };

  const columns = [
    {
      title: 'Profile',
      dataIndex: 'name',
      render: (_, profile) => (
        <Space size={10}>
          <Avatar shape="square" style={{ background: avatarColor(`${profile.id}${profile.name}`), flex: 'none' }}>
            {initialOf(profile.name)}
          </Avatar>
          <span>
            <div style={{ fontWeight: 500 }}>{profile.name}</div>
            <Space size={4} wrap>
              {profile.group && <Tag bordered={false}>{profile.group}</Tag>}
              <Tag bordered={false} color="blue">{chromeLabel(profile)}</Tag>
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
      width: 260,
      render: (proxy) => (proxy ? (
        <Space size={6}>
          <Tag color="geekblue" style={{ marginInlineEnd: 0, textTransform: 'uppercase', fontSize: 10 }}>{proxy.type}</Tag>
          <Text code style={{ fontSize: 12 }}>{proxy.host}:{proxy.port}</Text>
        </Space>
      ) : <Text type="secondary">Direct</Text>),
    },
    {
      title: 'Status',
      dataIndex: 'running',
      width: 170,
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
              onClick={() => act(() => (profile.running ? api.stopProfile(profile.id) : api.launchProfile(profile.id)))}
            >
              {profile.running ? 'Stop' : 'Open'}
            </Button>
          </Tooltip>
          <Tooltip title="Edit">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(profile)} />
          </Tooltip>
          <Popconfirm
            title="Delete this profile?"
            description="Cookies, cache and browser data are removed with it."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => act(() => api.deleteProfile(profile.id), 'Profile deleted')}
          >
            <Tooltip title="Delete">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
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
          style={{ width: 240 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          allowClear
          placeholder="All groups"
          style={{ width: 160 }}
          options={groups}
          value={group}
          onChange={setGroup}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>New profile</Button>
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
              <Popconfirm
                title={`Delete ${selected.length} profiles?`}
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={() => bulk('delete')}
              >
                <Button size="small" danger loading={busy}>Delete</Button>
              </Popconfirm>
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
    </>
  );
}
