import React from 'react';
import { App as AntApp, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from './api';

const { Text } = Typography;

export default function TrashPage({ trash, loading, onRefresh }) {
  const { message } = AntApp.useApp();

  const act = async (fn, success) => {
    try {
      await fn();
      await onRefresh();
      message.success(success);
    } catch (err) {
      message.error(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };

  const columns = [
    { title: 'Profile', dataIndex: 'name', render: (name) => <span style={{ fontWeight: 500 }}>{name}</span> },
    { title: 'Group', dataIndex: 'group', width: 160, render: (group) => group || <Text type="secondary">—</Text> },
    {
      title: 'Deleted',
      dataIndex: 'deletedAt',
      width: 180,
      render: (value) => <Text type="secondary">{value ? dayjs(value).format('MMM D, YYYY HH:mm') : '—'}</Text>,
    },
    {
      title: 'Tags',
      dataIndex: 'tags',
      render: (tags) => (tags && tags.length
        ? <Space size={4} wrap>{tags.map((tag) => <Tag key={tag} bordered={false}>{tag}</Tag>)}</Space>
        : <Text type="secondary">—</Text>),
    },
    {
      title: '',
      key: 'actions',
      width: 230,
      align: 'right',
      render: (_, profile) => (
        <Space size={4}>
          <Button size="small" icon={<UndoOutlined />} onClick={() => act(() => api.restoreProfile(profile.id), 'Profile restored')}>
            Restore
          </Button>
          <Popconfirm
            title="Delete permanently?"
            description="The profile and all of its browser data are removed."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => act(() => api.purgeProfile(profile.id), 'Profile deleted')}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      size="middle"
      loading={loading}
      dataSource={trash}
      columns={columns}
      pagination={false}
      locale={{ emptyText: 'The trash is empty' }}
    />
  );
}
