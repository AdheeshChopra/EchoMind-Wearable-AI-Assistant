import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Bell, Calendar, Filter, Plus } from 'lucide-react-native';
import { ReminderCard } from '../../components/ReminderCard';
import { format, isToday, isFuture, parseISO } from 'date-fns';
import ENV from '../../lib/env';

const API_URL = ENV.API_URL;

interface Reminder {
  id: string;
  title: string;
  dueAt: string;
  status: 'pending' | 'completed';
  category: string;
  priority: 'low' | 'medium' | 'high';
  isCritical: boolean;
}

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming'); // upcoming, completed

  const fetchReminders = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/reminders`);
      const data = await response.json();
      setReminders(data);
    } catch (error) {
      console.error('[CLIENT] Failed to fetch reminders:', error);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReminders();
    setRefreshing(false);
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`${API_URL}/api/reminders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        setReminders(prev => prev.map(r => r.id === id ? { ...r, status: status as 'pending' | 'completed' } : r));
      }
    } catch (error) {
      console.error('[CLIENT] Failed to update status:', error);
    }
  };

  const todayReminders = reminders.filter(r => isToday(parseISO(r.dueAt)) && r.status !== 'completed');
  const futureReminders = reminders.filter(r => isFuture(parseISO(r.dueAt)) && !isToday(parseISO(r.dueAt)) && r.status !== 'completed');
  const completedReminders = reminders.filter(r => r.status === 'completed');

  const renderHeader = () => (
    <View style={styles.header}>
      <View>
        <Text style={styles.greeting}>Alerts</Text>
        <Text style={styles.subGreeting}>{reminders.filter(r => r.status === 'pending').length} tasks remaining</Text>
      </View>
      <TouchableOpacity style={styles.plusButton}>
        <Plus color="#0e0e12" size={24} />
      </TouchableOpacity>
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity 
        onPress={() => setActiveTab('upcoming')}
        style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
      >
        <Text style={[styles.tabText, activeTab === 'upcoming' && styles.activeTabText]}>Upcoming</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        onPress={() => setActiveTab('completed')}
        style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
      >
        <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>Completed</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={activeTab === 'upcoming' ? [...todayReminders, ...futureReminders] : completedReminders}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ReminderCard 
            reminder={item} 
            onComplete={(id) => handleUpdateStatus(id, item.status === 'completed' ? 'pending' : 'completed')}
            onPress={() => {}}
          />
        )}
        ListHeaderComponent={
          <>
            {renderHeader()}
            {renderTabs()}
            {activeTab === 'upcoming' && todayReminders.length > 0 && (
              <Text style={styles.sectionTitle}>Today</Text>
            )}
          </>
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c799ff" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Bell size={48} color="rgba(252, 248, 254, 0.1)" />
            <Text style={styles.emptyText}>
              {activeTab === 'upcoming' ? "No upcoming alerts" : "No completed alerts"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e12',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  greeting: {
    color: '#fcf8fe',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subGreeting: {
    color: 'rgba(252, 248, 254, 0.5)',
    fontSize: 15,
    fontWeight: '500',
  },
  plusButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#c799ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  activeTab: {
    backgroundColor: '#c799ff',
  },
  tabText: {
    color: 'rgba(252, 248, 254, 0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#0e0e12',
  },
  sectionTitle: {
    color: '#fcf8fe',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginBottom: 16,
    opacity: 0.4,
  },
  listContent: {
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    gap: 16,
  },
  emptyText: {
    color: 'rgba(252, 248, 254, 0.2)',
    fontSize: 16,
    fontWeight: '500',
  },
});
