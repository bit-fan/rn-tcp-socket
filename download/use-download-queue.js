import { useState, useEffect } from 'react';
import { DownloadManager } from './download-manager';

export const useDownloadQueue = () => {
  const [tasks, setTasks] = useState(DownloadManager.getAllTasks());
  const [metrics, setMetrics] = useState(DownloadManager.getStorageMetrics());

  useEffect(() => {
    const unsubscribe = DownloadManager.subscribeToProgress((updatedTasks) => {
      setTasks([...updatedTasks]);
      setMetrics(DownloadManager.getStorageMetrics());
    });

    return () => unsubscribe();
  }, []);

  return {
    tasks,
    metrics,
    toggleTask: DownloadManager.toggleTaskState,
    addTask: DownloadManager.addTask,
  };
};
