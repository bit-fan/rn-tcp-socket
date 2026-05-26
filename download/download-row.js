import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DOWNLOAD_STATUS } from './download-manager';

export const DownloadRow = ({ task, onToggle }) => {
  const { title, progress, size, status, url } = task;

  const percentDisplay = `${Math.round(progress * 100)}%`;
  const isDownloading = status === DOWNLOAD_STATUS.DOWNLOADING;

  return (
    <View style={styles.cardContainer}>
      <View style={styles.metaColumn}>
        <Text style={styles.titleText} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.detailText}>
          {status === DOWNLOAD_STATUS.COMPLETED
            ? `Completed • ${size}`
            : `${status} • ${percentDisplay} (${size})`}
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.actionButton,
          isDownloading ? styles.btnPause : styles.btnStart,
        ]}
        onPress={() => onToggle({ url, start: !isDownloading })}
        disabled={status === DOWNLOAD_STATUS.COMPLETED}
      >
        <Text style={styles.btnText}>
          {isDownloading
            ? 'Pause'
            : status === DOWNLOAD_STATUS.COMPLETED
              ? 'Done'
              : 'Resume'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#ffffff',
  },
  metaColumn: { flex: 1, marginRight: 12 },
  titleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  detailText: { fontSize: 13, color: '#757575' },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    minWidth: 85,
    alignItems: 'center',
  },
  btnStart: { backgroundColor: '#2196F3' },
  btnPause: { backgroundColor: '#FFB300' },
  btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
});
