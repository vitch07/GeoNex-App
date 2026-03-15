import { useState, useEffect } from 'react';
import api from '../services/api';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'field_user' });
  const [error, setError] = useState('');

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data.data || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const createUser = async () => {
    setError('');
    try {
      await api.post('/auth/register', form);
      setShowModal(false);
      setForm({ username: '', email: '', password: '', role: 'field_user' });
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>User Management</h2>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add User</button>
      </div>
      <div className="page-body">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td><span className={`badge badge-${u.role === 'admin' ? 'in_progress' : 'pending'}`}>{u.role}</span></td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add New User</h3>
            {error && <div className="error" style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}
            <div className="form-group">
              <label>Username</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Full name" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="field_user">Field User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={createUser}
                disabled={!form.username || !form.email || !form.password}
              >
                Create User
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
