import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Bell, CheckCircle, Clock, MoreVertical, AlertTriangle } from 'lucide-react-native';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';

interface ReminderCardProps {
  reminder: {
    id: string;
    title: string;
    dueAt: string;
    category: string;
    priority: 'low' | 'medium' | 'high';
    status: string;
    isCritical: boolean;
  };
  onComplete: (id: string) => void;
  onPress: (id: string) => void;
}

export const ReminderCard: React.FC<ReminderCardProps> = ({ reminder, onComplete, onPress }) => {
  const date = parseISO(reminder.dueAt);
  
  const getFormattedDate = () => {
    if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
    if (isTomorrow(date)) return `Tomorrow, ${format(date, 'h:mm a')}`;
    return format(date, 'MMM d, h:mm a');
  };

  const getPriorityColor = () => {
    switch (reminder.priority) {
      case 'high': return '#ff4d4d';
      case 'medium': return '#ffcc00';
      default: return '#4caf50';
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(reminder.id)} style={styles.container}>
      <BlurView intensity={20} tint="dark" style={styles.blur}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            {reminder.isCritical && <AlertTriangle size={16} color="#ff4d4d" style={{ marginRight: 6 }} />}
            <Text style={styles.title} numberOfLines={1}>{reminder.title}</Text>
          </View>
          <TouchableOpacity onPress={() => onComplete(reminder.id)} style={styles.checkButton}>
            {reminder.status === 'completed' ? (
              <CheckCircle size={24} color="#c799ff" />
            ) : (
              <View style={styles.checkCircle} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <View style={styles.infoRow}>
            <Clock size={14} color="rgba(252, 248, 254, 0.5)" />
            <Text style={styles.dateText}>{getFormattedDate()}</Text>
          </View>
          
          <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
            <View style={[styles.dot, { backgroundColor: getPriorityColor() }]} />
            <Text style={styles.badgeText}>{reminder.category}</Text>
          </View>
        </View>
      </BlurView>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  blur: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    color: '#fcf8fe',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  checkButton: {
    marginLeft: 12,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(199, 153, 255, 0.4)',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    color: 'rgba(252, 248, 254, 0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    color: '#fcf8fe',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
