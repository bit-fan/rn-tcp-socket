import { useState, useEffect } from 'react';
import { DownloadManager } from './download-manager';

export const useDownloadQueue = () => {
  const [tasks, setTasks] = useState([]);
  const [diskSpaceInfo, setDiskSpaceInfo] = useState({});

  const dataCallback = data => {
    const { tasks = [], space } = data || {};
    setTasks([...tasks]);
    setDiskSpaceInfo(space);
  };
  useEffect(() => {
    const unsubscribe = DownloadManager.subscribeToDownloadState(dataCallback);
    return () => unsubscribe();
  }, []);

  return {
    tasks,
    diskSpaceInfo,
    toggleTask: DownloadManager.toggleTaskState,
    addTask: DownloadManager.addTask,
  };
};
