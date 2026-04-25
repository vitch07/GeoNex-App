import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';
import { cacheAssignments, getCachedAssignments } from '../database/LocalDatabase';
import { isOnline } from '../services/SyncService';

interface AssignmentsScreenProps {
  navigation: any;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: '#d97706' },
  { value: 'in_progress', label: 'In Progress', color: '#2563eb' },
  { value: 'completed', label: 'Completed', color: '#16a34a' },
  { value: 'cancelled', label: 'Cancelled', color: '#dc2626' },
];

// Helper to extract data from API response
function extractData(response: any): any {
  if (response && response.data !== undefined) return response.data;
  return response;
}

export default function AssignmentsScreen({ navigation }: AssignmentsScreenProps) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState<any>(null);
  // Create assignment state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [createForm, setCreateForm] = useState({ project_id: '', assigned_to: '', due_date: '' });
  // Edit assignment state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ assigned_to: '', due_date: '' });

  useEffect(() => {
    loadAssignments();
    checkRole();
  }, []);

  const checkRole = async () => {
    const user = JSON.parse((await AsyncStorage.getItem('geonex_user')) || '{}');
    setIsAdmin(user.role === 'admin');
  };

  const loadAssignments = async () => {
    try {
      const networkOnline = await isOnline();
      setOnline(networkOnline);

      if (networkOnline) {
        const response = await api.get<any>('/assignments');
        const data = extractData(response);
        const list = Array.isArray(data) ? data : [];
        setAssignments(list);
        await cacheAssignments(list);
      } else {
        const cached = await getCachedAssignments();
        setAssignments(cached);
      }
    } catch (error) {
      const cached = await getCachedAssignments();
      setAssignments(cached);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAssignments();
    setRefreshing(false);
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/assignments/${id}`, { status });
      setShowStatusModal(false);
      setStatusTarget(null);
      await loadAssignments();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update status');
    }
  };

  const deleteAssignment = (id: string) => {
    Alert.alert('Delete Assignment', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/assignments/${id}`);
            await loadAssignments();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to delete');
          }
        },
      },
    ]);
  };

  const openCreateModal = async () => {
    try {
      const [pRes, uRes] = await Promise.all([
        api.get<any>('/projects'),
        api.get<any>('/auth/users').catch(() => ({ data: [] })),
      ]);
      setProjects(Array.isArray(extractData(pRes)) ? extractData(pRes) : []);
      setUsers(Array.isArray(extractData(uRes)) ? extractData(uRes) : []);
      setCreateForm({ project_id: '', assigned_to: '', due_date: '' });
      setShowCreateModal(true);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load data');
    }
  };

  const createAssignment = async () => {
    if (!createForm.project_id) {
      Alert.alert('Error', 'Please select a project');
      return;
    }
    if (!createForm.assigned_to) {
      Alert.alert('Error', 'Please select a user to assign to');
      return;
    }
    try {
      // For mobile, we create assignment without area (admin can draw area on web)
      // Or use the project boundary as default area
      const project = projects.find((p) => p.id === createForm.project_id);
      const area = project?.boundary || {
        type: 'Polygon',
        coordinates: [[[78.0, 20.0], [79.0, 20.0], [79.0, 21.0], [78.0, 21.0], [78.0, 20.0]]],
      };

      await api.post('/assignments', {
        project_id: createForm.project_id,
        assigned_to: createForm.assigned_to,
        area,
        due_date: createForm.due_date || undefined,
      });
      setShowCreateModal(false);
      await loadAssignments();
      Alert.alert('Success', 'Assignment created');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create assignment');
    }
  };

  const openEditModal = async (assignment: any) => {
    try {
      const uRes = await api.get<any>('/auth/users').catch(() => ({ data: [] }));
      setUsers(Array.isArray(extractData(uRes)) ? extractData(uRes) : []);
      setEditTarget(assignment);
      setEditForm({
        assigned_to: assignment.assigned_to || '',
        due_date: assignment.due_date ? assignment.due_date.split('T')[0] : '',
      });
      setShowEditModal(true);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load users');
    }
  };

  const updateAssignment = async () => {
    if (!editTarget) return;
    try {
      const updateData: any = {};
      if (editForm.assigned_to) updateData.assigned_to = editForm.assigned_to;
      if (editForm.due_date) updateData.due_date = editForm.due_date;
      await api.put(`/assignments/${editTarget.id}`, updateData);
      setShowEditModal(false);
      setEditTarget(null);
      await loadAssignments();
      Alert.alert('Success', 'Assignment updated');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update');
    }
  };

  const getStatusColor = (status: string) => {
    return STATUS_OPTIONS.find((s) => s.value === status)?.color || '#6b7280';
  };

  const renderAssignment = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() => navigation.navigate('Map', { assignment: item })}
        style={{ flex: 1 }}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.projectName}>{item.project_name}</Text>
          <TouchableOpacity
            style={[styles.badge, { backgroundColor: getStatusColor(item.status) + '20' }]}
            onPress={() => { setStatusTarget(item); setShowStatusModal(true); }}
          >
            <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>
              {item.status.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        </View>
        {item.assigned_user && (
          <Text style={styles.assignedUser}>Assigned to: {item.assigned_user}</Text>
        )}
        {item.due_date && (
          <Text style={styles.dueDate}>
            Due: {new Date(item.due_date).toLocaleDateString()}
          </Text>
        )}
        <Text style={styles.tapHint}>Tap to open map</Text>
      </TouchableOpacity>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.statusBtn}
          onPress={() => { setStatusTarget(item); setShowStatusModal(true); }}
        >
          <Text style={styles.statusBtnText}>Status</Text>
        </TouchableOpacity>
        {isAdmin && (
          <>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => openEditModal(item)}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cardDeleteBtn}
              onPress={() => deleteAssignment(item.id)}
            >
              <Text style={styles.cardDeleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isAdmin ? 'All Assignments' : 'My Assignments'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {!online && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          )}
          {isAdmin && online && (
            <TouchableOpacity style={styles.addBtn} onPress={openCreateModal}>
              <Text style={styles.addBtnText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={assignments}
        renderItem={renderAssignment}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No assignments found. Pull down to refresh.
          </Text>
        }
      />

      {/* Status update modal */}
      <Modal visible={showStatusModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStatusModal(false)}
        >
          <View style={styles.statusModal}>
            <Text style={styles.modalTitle}>Update Status</Text>
            {statusTarget && (
              <Text style={styles.statusModalSub}>{statusTarget.project_name}</Text>
            )}
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.statusOption,
                  statusTarget?.status === opt.value && { backgroundColor: opt.color + '20', borderColor: opt.color },
                ]}
                onPress={() => statusTarget && updateStatus(statusTarget.id, opt.value)}
              >
                <View style={[styles.statusDot, { backgroundColor: opt.color }]} />
                <Text style={[
                  styles.statusOptionText,
                  statusTarget?.status === opt.value && { color: opt.color, fontWeight: '700' },
                ]}>
                  {opt.label}
                </Text>
                {statusTarget?.status === opt.value && (
                  <Text style={[styles.currentLabel, { color: opt.color }]}>Current</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create Assignment modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.formModal}>
            <Text style={styles.modalTitle}>Create Assignment</Text>
            <ScrollView>
              <Text style={styles.formLabel}>Project</Text>
              {projects.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.optionBtn, createForm.project_id === p.id && styles.optionBtnActive]}
                  onPress={() => setCreateForm({ ...createForm, project_id: p.id })}
                >
                  <Text style={[styles.optionBtnText, createForm.project_id === p.id && styles.optionBtnTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}

              <Text style={[styles.formLabel, { marginTop: 16 }]}>Assign To</Text>
              {users.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.optionBtn, createForm.assigned_to === u.id && styles.optionBtnActive]}
                  onPress={() => setCreateForm({ ...createForm, assigned_to: u.id })}
                >
                  <Text style={[styles.optionBtnText, createForm.assigned_to === u.id && styles.optionBtnTextActive]}>
                    {u.username} ({u.role})
                  </Text>
                </TouchableOpacity>
              ))}

              <Text style={[styles.formLabel, { marginTop: 16 }]}>Due Date</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                value={createForm.due_date}
                onChangeText={(v) => setCreateForm({ ...createForm, due_date: v })}
                placeholderTextColor="#9ca3af"
              />

              <Text style={styles.formHint}>
                Note: Assignment area will use the project boundary. Use the web app to draw custom assignment areas.
              </Text>
            </ScrollView>
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelFormBtn} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.cancelFormText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitFormBtn} onPress={createAssignment}>
                <Text style={styles.submitFormText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Assignment modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.formModal}>
            <Text style={styles.modalTitle}>Edit Assignment</Text>
            {editTarget && (
              <Text style={styles.statusModalSub}>{editTarget.project_name}</Text>
            )}
            <ScrollView>
              <Text style={styles.formLabel}>Reassign To</Text>
              {users.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.optionBtn, editForm.assigned_to === u.id && styles.optionBtnActive]}
                  onPress={() => setEditForm({ ...editForm, assigned_to: u.id })}
                >
                  <Text style={[styles.optionBtnText, editForm.assigned_to === u.id && styles.optionBtnTextActive]}>
                    {u.username} ({u.role})
                  </Text>
                </TouchableOpacity>
              ))}

              <Text style={[styles.formLabel, { marginTop: 16 }]}>Due Date</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                value={editForm.due_date}
                onChangeText={(v) => setEditForm({ ...editForm, due_date: v })}
                placeholderTextColor="#9ca3af"
              />
            </ScrollView>
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelFormBtn} onPress={() => { setShowEditModal(false); setEditTarget(null); }}>
                <Text style={styles.cancelFormText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitFormBtn} onPress={updateAssignment}>
                <Text style={styles.submitFormText}>Save</Text>
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
  offlineBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offlineText: { fontSize: 12, color: '#991b1b', fontWeight: '600' },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  projectName: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  assignedUser: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  dueDate: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  tapHint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 10,
  },
  statusBtn: {
    flex: 1,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  statusBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  editBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    alignItems: 'center',
  },
  editBtnText: { color: '#92400e', fontWeight: '600', fontSize: 13 },
  cardDeleteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    alignItems: 'center',
  },
  cardDeleteBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 40, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  statusModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4, color: '#111827' },
  statusModalSub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  statusOptionText: { fontSize: 15, color: '#374151', fontWeight: '500', flex: 1 },
  currentLabel: { fontSize: 12, fontWeight: '600' },
  // Form modal styles
  formModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    maxHeight: '80%',
  },
  formLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  formInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  formHint: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 16,
  },
  optionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  optionBtnActive: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  optionBtnText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  optionBtnTextActive: { color: '#2563eb', fontWeight: '700' },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelFormBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#e5e7eb', alignItems: 'center' },
  cancelFormText: { fontWeight: '600', color: '#374151' },
  submitFormBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' },
  submitFormText: { fontWeight: '600', color: '#fff' },
});
