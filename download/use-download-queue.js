import { useState, useEffect, useCallback, useMemo } from 'react';
import { DOWNLOAD_STATUS, DownloadManager } from './download-manager';

export const useDownloadQueue = () => {
  const [tasks, setTasks] = useState([]);
  const [diskSpaceInfo, setDiskSpaceInfo] = useState({});

  const dataCallback = (data) => {
    const { tasks = [], space } = data || {};
    setTasks([...tasks]);
    setDiskSpaceInfo(space);
  };
  useEffect(() => {
    const unsubscribe = DownloadManager.subscribeToDownloadState(dataCallback);
    return () => unsubscribe();
  }, []);

  const completedUrl = useMemo(
    () =>
      tasks
        .filter((task) => task.status === DOWNLOAD_STATUS.COMPLETED)
        .map((a) => a.url)
        .join('/'),
    [tasks],
  );
  const downloadedMap = useMemo(() => {
    const map = {};
    tasks
      .filter((task) => task.status === DOWNLOAD_STATUS.COMPLETED)
      .map((task) => {
        map[task.url] = { url: task.localUrl, title: task.status + task.title };
      });
    return map;
  }, [completedUrl]);
  return {
    tasks,
    diskSpaceInfo,
    downloadedMap,
    toggleTask: DownloadManager.toggleTaskState,
    addTask: DownloadManager.addTask,
  };
};
