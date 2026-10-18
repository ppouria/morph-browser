import React, { useEffect, useState } from 'react';
import { App as AntApp, Form, Input, Modal, Select } from 'antd';
import api from './api';

const TYPE_OPTIONS = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks5', label: 'SOCKS5' },
];

export default function ProxyModal({ open, proxy, onClose, onSaved }) {
  const [form] = Form.useForm();
  const { message } = AntApp.useApp();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(proxy
      ? { ...proxy, hostPort: `${proxy.host}:${proxy.port}` }
      : { name: '', type: 'http', hostPort: '', username: '', password: '' });
  }, [open, proxy, form]);

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const parsed = await api.parseProxy(values.hostPort, values.type);
      await api.saveProxy({
        id: proxy ? proxy.id : undefined,
        name: values.name,
        type: parsed.type,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username || values.username || '',
        password: parsed.password || values.password || '',
      });
      message.success('Proxy saved');
      onSaved();
    } catch (err) {
      if (err && err.errorFields) return;
      message.error(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={proxy ? 'Edit proxy' : 'New proxy'}
      onCancel={onClose}
      onOk={submit}
      okText="Save proxy"
      confirmLoading={saving}
      destroyOnClose
      width={520}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give the proxy a name' }]}>
          <Input placeholder="Provider or use" />
        </Form.Item>
        <Form.Item name="type" label="Type">
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="hostPort"
          label="Host : Port"
          extra="Paste the whole provider line; type, login and password fill in on save."
          rules={[{ required: true, message: 'Enter host:port or a full proxy line' }]}
        >
          <Input placeholder="host:port:user:pass" spellCheck={false} />
        </Form.Item>
        <Form.Item name="username" label="Username">
          <Input spellCheck={false} />
        </Form.Item>
        <Form.Item name="password" label="Password">
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
