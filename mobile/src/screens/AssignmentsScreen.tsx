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

export default function AssignmentsScreen({ navigation }: AssignmentsScreenProps) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState<any>(null);

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
        // Server returns { success, data: [...] }
        const data = Array.isArray(response) ? response : (response.data || []);
        setAssignments(data);
        await cacheAssignments(data);
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
          <TouchableOpacity
            style={styles.cardDeleteBtn}
            onPress={() => deleteAssignment(item.id)}
          >
            <Text style={styles.cardDeleteBtnText}>Delete</Text>
          </TouchableOpacity>
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
        {!online && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>Offline</Text>
          </View>
        )}
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
});
