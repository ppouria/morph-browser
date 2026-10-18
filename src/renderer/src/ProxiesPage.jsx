import React, { useMemo } from 'react';
import { App as AntApp, Button, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import api from './api';

const { Text } = Typography;

export default function ProxiesPage({ proxies, loading, onNew, onEdit, onRefresh }) {
  const { message } = AntApp.useApp();

  const remove = async (proxy) => {
    try {
      await api.deleteProxy(proxy.id);
      await onRefresh();
      message.success('Proxy deleted');
    } catch (err) {
      message.error(err.message);
    }
  };

  const columns = useMemo(() => [
    { title: 'Name', dataIndex: 'name', render: (name) => <span style={{ fontWeight: 500 }}>{name}</span> },
    {
      title: 'Type',
      dataIndex: 'type',
      width: 110,
      render: (type) => <Tag color="geekblue" style={{ textTransform: 'uppercase', fontSize: 10 }}>{type}</Tag>,
    },
    {
      title: 'Host : Port',
      key: 'host',
      render: (_, proxy) => <Text code>{proxy.host}:{proxy.port}</Text>,
    },
    { title: 'Login', dataIndex: 'username', width: 180, render: (user) => user || <Text type="secondary">—</Text> },
    {
      title: '',
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_, proxy) => (
        <Space size={4}>
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
  ], [onEdit]);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>New proxy</Button>
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={proxies}
        columns={columns}
        pagination={false}
        locale={{ emptyText: 'No saved proxies yet' }}
      />
    </>
  );
}
