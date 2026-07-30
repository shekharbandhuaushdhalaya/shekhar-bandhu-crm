import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/themeContext';
import { Radius } from '../constants/theme';

interface CustomDatePickerProps {
  value: string; // ISO date string "YYYY-MM-DD"
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  iconOnly?: boolean;
  alignRight?: boolean;
  height?: number;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Select Date',
  compact = false,
  iconOnly = false,
  alignRight = false,
  height,
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number } | null>(null);

  const currentDateObj = value ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(currentDateObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDateObj.getMonth());

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  const handleOpen = (e?: any) => {
    const d = value ? new Date(value) : new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());

    if (Platform.OS === 'web' && e?.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const popoverWidth = 280;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let leftPos = alignRight ? rect.right - popoverWidth : rect.left;
      if (leftPos + popoverWidth > windowWidth - 12) {
        leftPos = windowWidth - popoverWidth - 12;
      }
      if (leftPos < 12) {
        leftPos = 12;
      }

      let topPos = rect.bottom + 6;
      // If near bottom of screen, open above trigger
      if (topPos + 320 > windowHeight) {
        topPos = Math.max(12, rect.top - 310);
      }

      setPopoverCoords({ top: topPos, left: leftPos });
      setOpen(true);
    } else if (triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, width, height) => {
        const popoverWidth = 280;
        const windowWidth = Dimensions.get('window').width;
        const windowHeight = Dimensions.get('window').height;

        let leftPos = alignRight ? x + width - popoverWidth : x;
        if (leftPos + popoverWidth > windowWidth - 12) {
          leftPos = windowWidth - popoverWidth - 12;
        }
        if (leftPos < 12) {
          leftPos = 12;
        }

        let topPos = y + height + 6;
        if (topPos + 320 > windowHeight) {
          topPos = Math.max(12, y - 310);
        }

        setPopoverCoords({ top: topPos, left: leftPos });
        setOpen(true);
      });
    } else {
      setPopoverCoords({ top: 120, left: 20 });
      setOpen(true);
    }
  };

  const handleMonthChange = (offset: number) => {
    let nextMonth = viewMonth + offset;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  const handleSelectDay = (day: number) => {
    const yyyy = viewYear;
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setOpen(false);
  };

  const formattedLabel = value 
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : placeholder;

  return (
    <View style={{ width: compact ? undefined : '100%' }}>
      {label ? (
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          {label}
        </Text>
      ) : null}

      <TouchableOpacity
        ref={triggerRef}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: value ? colors.primary + '0d' : colors.bg.primary,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: value ? colors.primary + '40' : colors.border,
          paddingHorizontal: compact ? 8 : 12,
          height: height ? height : (compact ? 36 : 40),
        }}
        onPress={(e) => handleOpen(e)}
      >
        <Ionicons name="calendar" size={compact ? 14 : 16} color={value ? colors.primary : colors.text.muted} />
        {!iconOnly && (
          <Text style={{ flex: 1, color: value ? colors.text.primary : colors.text.muted, fontWeight: value ? '700' : '400', fontSize: compact ? 12 : 13 }} numberOfLines={1}>
            {formattedLabel}
          </Text>
        )}
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={12} color={colors.text.muted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'transparent',
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={[{
              position: 'absolute',
              top: popoverCoords ? popoverCoords.top : 100,
              left: popoverCoords ? popoverCoords.left : 20,
              width: 280,
              backgroundColor: colors.bg.card,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              zIndex: 999999,
              ...(Platform.OS === 'web' ? { boxShadow: '0px 10px 30px rgba(0,0,0,0.2)' } : { elevation: 16 }),
            }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Calendar Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => handleMonthChange(-1)} style={{ padding: 6, borderRadius: 6, backgroundColor: colors.bg.secondary }}>
                <Ionicons name="chevron-back" size={16} color={colors.text.primary} />
              </TouchableOpacity>
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary }}>
                {monthNames[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity onPress={() => handleMonthChange(1)} style={{ padding: 6, borderRadius: 6, backgroundColor: colors.bg.secondary }}>
                <Ionicons name="chevron-forward" size={16} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {/* Weekday Labels */}
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(w => (
                <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', color: colors.text.muted }}>{w}</Text>
              ))}
            </View>

            {/* Day Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {calendarDays.map((dayNum, i) => {
                if (dayNum === null) {
                  return <View key={`empty-${i}`} style={{ width: '14.28%', height: 32 }} />;
                }

                const dateStringCheck = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = value === dateStringCheck;

                const today = new Date();
                const isToday = today.getDate() === dayNum && today.getMonth() === viewMonth && today.getFullYear() === viewYear;

                return (
                  <TouchableOpacity
                    key={`day-${dayNum}`}
                    style={[{
                      width: '14.28%',
                      height: 32,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderRadius: 8
                    }, isSelected && { backgroundColor: colors.primary }, isToday && !isSelected && { borderWidth: 1, borderColor: colors.primary }]}
                    onPress={() => handleSelectDay(dayNum)}
                  >
                    <Text style={[{ fontSize: 12, fontWeight: isSelected || isToday ? '800' : '500', color: isSelected ? '#fff' : colors.text.primary }]}>
                      {dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer */}
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => { onChange(new Date().toISOString().split('T')[0]); setOpen(false); }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.muted }}>Close</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};
