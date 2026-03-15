import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import api from '../config/api';

export default function UsersScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'field_user' });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await api.get<any>('/auth/users');
      setUsers(Array.isArray(res) ? res : (res.data || []));
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const createUser = async () => {
    if (!form.username.trim() || !form.email.trim() || !form.password.trim()) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    try {
      await api.post('/auth/register', form);
      setShowModal(false);
      setForm({ username: '', email: '', password: '', role: 'field_user' });
      loadUsers();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create user');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Users</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Text style={styles.addBtnText}>+ New User</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.userName}>{item.username}</Text>
              <View style={[styles.roleBadge, { backgroundColor: item.role === 'admin' ? '#dbeafe' : '#f3e8ff' }]}>
                <Text style={[styles.roleText, { color: item.role === 'admin' ? '#2563eb' : '#7c3aed' }]}>
                  {item.role}
                </Text>
              </View>
            </View>
            <Text style={styles.userEmail}>{item.email}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No users found.</Text>
        }
      />

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create User</Text>
            <TextInput
              style={styles.input}
              placeholder="Username"
              value={form.username}
              onChangeText={(v) => setForm({ ...form, username: v })}
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={form.email}
              onChangeText={(v) => setForm({ ...form, email: v })}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={form.password}
              onChangeText={(v) => setForm({ ...form, password: v })}
              secureTextEntry
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.roleSelector}>
              <TouchableOpacity
                style={[styles.roleOption, form.role === 'field_user' && styles.roleOptionActive]}
                onPress={() => setForm({ ...form, role: 'field_user' })}
              >
                <Text style={[styles.roleOptionText, form.role === 'field_user' && styles.roleOptionTextActive]}>
                  Field User
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleOption, form.role === 'admin' && styles.roleOptionActive]}
                onPress={() => setForm({ ...form, role: 'admin' })}
              >
                <Text style={[styles.roleOptionText, form.role === 'admin' && styles.roleOptionTextActive]}>
                  Admin
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowModal(false); setForm({ username: '', email: '', password: '', role: 'field_user' }); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={createUser}>
                <Text style={styles.createBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  addBtn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  userName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  userEmail: { fontSize: 14, color: '#6b7280' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  roleText: { fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
  },
  roleSelector: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  roleOption: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  roleOptionActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  roleOptionText: { fontWeight: '600', color: '#374151' },
  roleOptionTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#e5e7eb', alignItems: 'center' },
  cancelBtnText: { fontWeight: '600', color: '#374151' },
  createBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' },
  createBtnText: { fontWeight: '600', color: '#fff' },
});
