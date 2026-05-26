import ReactNativeBlobUtil from 'react-native-blob-util';
import { Parser } from 'm3u8-parser';

export const DOWNLOAD_STATUS = {
  QUEUED: 'QUEUED',
  DOWNLOADING: 'DOWNLOADING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

// --- CONFIGURATION LIMITS ---
const MAX_CONCURRENT_TASKS = 2; // Adjust concurrency limit here (e.g., 2 or 3 streams max)

let downloadTasks = new Map();
let progressListeners = new Set();
let activeNetworkRequests = new Map();

const DEFAULT_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/Downloads`;
const STATE_META_PATH = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/download_metadata.json`;

export const DownloadManager = {
  /**
   * 1. CALL THIS ON APP LAUNCH (e.g., in App.js useEffect)
   * Restores uncompleted and completed tasks back into the active queue manager.
   */
  initializeAndRestoreTasks: async () => {
    try {
      const exists = await ReactNativeBlobUtil.fs.exists(STATE_META_PATH);
      if (!exists) return;

      const savedDataRaw = await ReactNativeBlobUtil.fs.readFile(
        STATE_META_PATH,
        'utf8',
      );
      const parsedArray = JSON.parse(savedDataRaw);

      downloadTasks.clear();
      parsedArray.forEach((item) => {
        // If it was disrupted mid-download, gracefully mark it as PAUSED so it can be resumed
        if (item.status === DOWNLOAD_STATUS.DOWNLOADING) {
          item.status = DOWNLOAD_STATUS.PAUSED;
        }
        downloadTasks.set(item.url, item);
      });

      DownloadManager._notifyListeners();
      console.log('Successfully restored tasks from storage disk!');
    } catch (e) {
      console.error('Failed to restore download tasks context:', e);
    }
  },

  getAllTasks: () => {
    return Array.from(downloadTasks.values());
  },

  addTask: ({ url, title, location = DEFAULT_DIR }) => {
    if (!url) return;
    if (downloadTasks.has(url)) return downloadTasks.get(url);

    const newTask = {
      url,
      title,
      location,
      status: DOWNLOAD_STATUS.QUEUED,
      progress: 0,
      size: '0 / 0 Segs',
      downloadedSegments: 0,
      totalSegments: 0,
    };

    downloadTasks.set(url, newTask);
    DownloadManager._saveStateToDisk();
    DownloadManager._processQueue(); // Poke the orchestrator queue
    return newTask;
  },

  toggleTaskState: ({ url, start } = {}) => {
    if (url) {
      const task = downloadTasks.get(url);
      if (!task) return;

      if (start) {
        task.status = DOWNLOAD_STATUS.QUEUED; // Set to QUEUED first so the worker picks it up
      } else {
        task.status = DOWNLOAD_STATUS.PAUSED;
        DownloadManager._cancelActiveNetworkRequests(url);
      }
    } else {
      // Global Fallback (Resume All)
      downloadTasks.forEach((task) => {
        if (
          task.status === DOWNLOAD_STATUS.PAUSED ||
          task.status === DOWNLOAD_STATUS.QUEUED
        ) {
          task.status = DOWNLOAD_STATUS.QUEUED;
        }
      });
    }

    DownloadManager._saveStateToDisk();
    DownloadManager._processQueue(); // Let the manager distribute slots
  },

  subscribeToProgress: (callback) => {
    progressListeners.add(callback);
    callback(DownloadManager.getAllTasks());
    return () => progressListeners.delete(callback);
  },

  /**
   * 2. CENTRAL CONCURRENCY SLURPER (The Orchestrator)
   * Ensures no more than MAX_CONCURRENT_TASKS run at the same time.
   */
  _processQueue: () => {
    const tasks = DownloadManager.getAllTasks();

    // Count how many are currently downloading right now
    const runningCount = tasks.filter(
      (t) => t.status === DOWNLOAD_STATUS.DOWNLOADING,
    ).length;
    const availableSlots = MAX_CONCURRENT_TASKS - runningCount;

    if (availableSlots <= 0) return; // System at full capacity capacity limits!

    // Find items waiting in queue
    const queuedTasks = tasks.filter(
      (t) => t.status === DOWNLOAD_STATUS.QUEUED,
    );

    // Pick items and start running them until slots run out
    for (let i = 0; i < Math.min(availableSlots, queuedTasks.length); i++) {
      const taskToStart = queuedTasks[i];
      taskToStart.status = DOWNLOAD_STATUS.DOWNLOADING;
      DownloadManager._notifyListeners();
      DownloadManager._startExecutingDownload(taskToStart.url);
    }
  },

  _startExecutingDownload: async (url) => {
    const task = downloadTasks.get(url);
    if (!task || task.status !== DOWNLOAD_STATUS.DOWNLOADING) return;

    try {
      const res = await ReactNativeBlobUtil.config({ fileCache: false }).fetch(
        'GET',
        url,
      );
      const manifestText = res.text();

      const parser = new Parser();
      parser.push(manifestText);
      parser.end();

      const segments = parser.manifest.segments || [];
      if (segments.length === 0) throw new Error('No video segments detected');

      task.totalSegments = segments.length;
      activeNetworkRequests.set(url, []);

      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const sanitizedDir = `${task.location}/${encodeURIComponent(task.title)}`;

      for (let i = task.downloadedSegments; i < segments.length; i++) {
        // Double check: Did user pause or close down execution slot mid-run?
        if (task.status !== DOWNLOAD_STATUS.DOWNLOADING) break;

        const segment = segments[i];
        const segmentUrl = segment.uri.startsWith('http')
          ? segment.uri
          : `${baseUrl}${segment.uri}`;
        const destinationPath = `${sanitizedDir}/fileSequence_${i}.ts`;

        const downloadSession = ReactNativeBlobUtil.config({
          path: destinationPath,
          overwrite: true,
        }).fetch('GET', segmentUrl);

        activeNetworkRequests.get(url).push(downloadSession);

        await downloadSession;

        activeNetworkRequests.set(
          url,
          activeNetworkRequests
            .get(url)
            .filter((req) => req !== downloadSession),
        );

        task.downloadedSegments = i + 1;
        task.progress = task.downloadedSegments / task.totalSegments;
        task.size = `${task.downloadedSegments} / ${task.totalSegments} Segs`;

        DownloadManager._notifyListeners();
      }

      if (task.downloadedSegments === task.totalSegments) {
        task.status = DOWNLOAD_STATUS.COMPLETED;
        activeNetworkRequests.delete(url);
        DownloadManager._saveStateToDisk();
        DownloadManager._notifyListeners();

        // Essential: A slot opened up, wake up queue manager to run next task!
        DownloadManager._processQueue();
      }
    } catch (err) {
      if (task.status !== DOWNLOAD_STATUS.PAUSED) {
        task.status = DOWNLOAD_STATUS.FAILED;
        activeNetworkRequests.delete(url);
        DownloadManager._saveStateToDisk();
        DownloadManager._notifyListeners();

        // A slot opened up due to failure, try running the next item
        DownloadManager._processQueue();
      }
    }
  },

  _cancelActiveNetworkRequests: (url) => {
    const requests = activeNetworkRequests.get(url);
    if (requests && Array.isArray(requests)) {
      requests.forEach((req) => {
        if (typeof req.cancel === 'function') req.cancel();
      });
      activeNetworkRequests.set(url, []);
    }
    // A slot opened up due to user pausing, run the next queued item
    setTimeout(() => DownloadManager._processQueue(), 50);
  },

  _saveStateToDisk: async () => {
    try {
      const tasksArray = DownloadManager.getAllTasks();
      await ReactNativeBlobUtil.fs.writeFile(
        STATE_META_PATH,
        JSON.stringify(tasksArray),
        'utf8',
      );
    } catch (e) {
      console.error('Failed storing tracking index meta states:', e);
    }
  },

  _notifyListeners: () => {
    const updatedTasks = DownloadManager.getAllTasks();
    progressListeners.forEach((listener) => listener(updatedTasks));
  },
};
