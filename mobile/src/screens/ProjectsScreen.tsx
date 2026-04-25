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
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProjectsScreenProps {
  navigation?: any;
}

export default function ProjectsScreen({ navigation }: ProjectsScreenProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadProjects();
    checkRole();
  }, []);

  const checkRole = async () => {
    const user = JSON.parse((await AsyncStorage.getItem('geonex_user')) || '{}');
    setIsAdmin(user.role === 'admin');
  };

  const loadProjects = async () => {
    try {
      const res = await api.get<any>('/projects');
      const data = res?.data !== undefined ? res.data : res;
      setProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  };

  const createProject = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Project name is required');
      return;
    }
    try {
      await api.post('/projects', { name: name.trim(), description: description.trim() });
      setShowModal(false);
      setName('');
      setDescription('');
      loadProjects();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create project');
    }
  };

  const deleteProject = (id: string, projectName: string) => {
    Alert.alert('Delete Project', `Delete "${projectName}" and all its data?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/projects/${id}`);
            loadProjects();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to delete');
          }
        },
      },
    ]);
  };

  const openMap = (project: any) => {
    if (navigation) {
      navigation.navigate('Map', { project });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        {isAdmin && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.projectName}>{item.name}</Text>
            <Text style={styles.projectDesc}>{item.description || 'No description'}</Text>
            <Text style={styles.projectDate}>
              Created: {new Date(item.created_at).toLocaleDateString()}
            </Text>
            {item.boundary && (
              <Text style={styles.boundaryBadge}>Boundary defined</Text>
            )}
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.mapBtn} onPress={() => openMap(item)}>
                <Text style={styles.mapBtnText}>Open Map</Text>
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteProject(item.id, item.name)}
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No projects yet.</Text>
        }
      />

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create Project</Text>
            <TextInput
              style={styles.input}
              placeholder="Project name"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowModal(false); setName(''); setDescription(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={createProject}>
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
  projectName: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 4 },
  projectDesc: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  projectDate: { fontSize: 12, color: '#9ca3af' },
  boundaryBadge: {
    fontSize: 12,
    color: '#166534',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    overflow: 'hidden',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  mapBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  mapBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  deleteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
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
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#e5e7eb', alignItems: 'center' },
  cancelBtnText: { fontWeight: '600', color: '#374151' },
  createBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center' },
  createBtnText: { fontWeight: '600', color: '#fff' },
});
