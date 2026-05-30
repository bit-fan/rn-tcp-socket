import ReactNativeBlobUtil from 'react-native-blob-util';
import M3U8FileParser from 'm3u8-file-parser';
import { updateSystemDiskSpace } from './download-utils';
export const DOWNLOAD_STATUS = {
  QUEUED: 'QUEUED',
  DOWNLOADING: 'DOWNLOADING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

const MAX_CONCURRENT_TASKS = 2;

let downloadTasks = new Map();
let progressListeners = new Set();
let activeNetworkRequests = new Map();
let DisckSpaceObj = {};
export const DEFAULT_DOWNLOAD_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/Downloads`;
const STATE_META_PATH = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/download_metadata.json`;

export const DownloadManager = {
  getDiskSpace: async (refresh = false) => {
    if (refresh || Object.keys(DisckSpaceObj).length === 0) {
      const data = await updateSystemDiskSpace();
      DisckSpaceObj = data;
    }
    return DisckSpaceObj;
  },
  initializeAndRestoreTasks: async () => {
    try {
      await DownloadManager.getDiskSpace(true);
      const exists = await ReactNativeBlobUtil.fs.exists(STATE_META_PATH);
      if (!exists) {
        DownloadManager._notifyListeners();
        return;
      }
      const savedDataRaw = await ReactNativeBlobUtil.fs.readFile(
        STATE_META_PATH,
        'utf8',
      );
      const parsedArray = JSON.parse(savedDataRaw);
      downloadTasks.clear();

      parsedArray.forEach((item) => {
        if (item.status === DOWNLOAD_STATUS.DOWNLOADING) {
          item.status = DOWNLOAD_STATUS.PAUSED;
        }
        downloadTasks.set(item.url, item);
      });
    } catch (e) {}
    DownloadManager._notifyListeners();
  },

  getAllTasks: () => {
    return Array.from(downloadTasks.values());
  },

  addTask: ({ url, title, location = DEFAULT_DOWNLOAD_DIR }) => {
    if (!url) return;
    if (downloadTasks.has(url)) return downloadTasks.get(url);

    const newTask = {
      url,
      title,
      location,
      status: DOWNLOAD_STATUS.QUEUED,
      progress: 0,
      downloadedSegments: 0,
      totalSegments: 0,
    };

    downloadTasks.set(url, newTask);
    DownloadManager._saveStateToDisk();
    DownloadManager._processQueue();
    return newTask;
  },

  toggleTaskState: async ({ url, start } = {}) => {
    if (url) {
      const task = downloadTasks.get(url);
      if (!task) return;

      if (start) {
        task.status = DOWNLOAD_STATUS.QUEUED;
      } else {
        task.status = DOWNLOAD_STATUS.PAUSED;
        DownloadManager._cancelActiveNetworkRequests(url);
      }
    } else {
      downloadTasks.forEach((task) => {
        if (
          task.status === DOWNLOAD_STATUS.PAUSED ||
          task.status === DOWNLOAD_STATUS.QUEUED
        ) {
          task.status = DOWNLOAD_STATUS.QUEUED;
        }
      });
    }

    await DownloadManager._saveStateToDisk();
    DownloadManager._processQueue();
  },
  removeTask: async (url) => {
    await DownloadManager.toggleTaskState({ url, start: false });
    try {
      let task = downloadTasks.get(url);
      let folderName = task?.title;
      let baseDir =
        task?.location ||
        `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/Downloads`;

      // 1. FALLBACK ENGINE: If the task isn't in memory, attempt to find its meta metadata from disk
      if (!task) {
        try {
          const metaExists =
            await ReactNativeBlobUtil.fs.exists(STATE_META_PATH);
          if (metaExists) {
            const rawMeta = await ReactNativeBlobUtil.fs.readFile(
              STATE_META_PATH,
              'utf8',
            );
            const historicalTasks = JSON.parse(rawMeta || '[]');
            const matchedTask = historicalTasks.find((t) => t.url === url);

            if (matchedTask) {
              folderName = matchedTask.title;
              if (matchedTask.location) baseDir = matchedTask.location;
            }
          }
        } catch (fileErr) {}
      }

      // 2. Physical File Cleanups (Handles both style variants)
      if (folderName) {
        const literalFolder = `${baseDir}/${folderName}`;

        if (await ReactNativeBlobUtil.fs.exists(literalFolder)) {
          await ReactNativeBlobUtil.fs.unlink(literalFolder);
        }
      }

      // 3. Clear Runtime Tracking references if present
      downloadTasks.delete(url);

      if (activeNetworkRequests.has(url)) {
        const activeSessions = activeNetworkRequests.get(url) || [];
        activeSessions.forEach((session) => {
          try {
            session.cancel();
          } catch (e) {}
        });
        activeNetworkRequests.delete(url);
      }

      // 4. Update the Persistent Meta File Context directly to guarantee removal
      let updatedList = Array.from(downloadTasks.values());

      // If the runtime was empty, load the storage list, filter out the matching target URL, and commit
      const metaExists = await ReactNativeBlobUtil.fs.exists(STATE_META_PATH);
      if (metaExists) {
        const rawMeta = await ReactNativeBlobUtil.fs.readFile(
          STATE_META_PATH,
          'utf8',
        );
        const diskTasks = JSON.parse(rawMeta || '[]');

        // Filter out any traces matching this target url completely
        const filteredDiskTasks = diskTasks.filter((t) => t.url !== url);

        // Use whichever data set is more complete
        if (updatedList.length === 0 && filteredDiskTasks.length > 0) {
          updatedList = filteredDiskTasks;
        } else {
          // Sync whatever remains in memory with your filtered disk state
          updatedList = updatedList.filter((t) => t.url !== url);
        }
      }

      const serializedArray = JSON.stringify(updatedList);

      await ReactNativeBlobUtil.fs.writeFile(
        STATE_META_PATH,
        serializedArray,
        'utf8',
      );
      await DownloadManager.getDiskSpace(true);
      DownloadManager._notifyListeners();
    } catch (error) {}
  },
  getStats: async () => {
    return {
      tasks: DownloadManager.getAllTasks(),
      space: await DownloadManager.getDiskSpace(),
    };
  },
  subscribeToDownloadState: (callback) => {
    progressListeners.add(callback);
    DownloadManager.getStats()
      .then((stats) => {
        if (stats) callback(stats);
      })
      .catch((err) => {});

    return () => progressListeners.delete(callback);
  },

  _processQueue: () => {
    const tasks = DownloadManager.getAllTasks();
    const runningCount = tasks.filter(
      (t) => t.status === DOWNLOAD_STATUS.DOWNLOADING,
    ).length;
    const availableSlots = MAX_CONCURRENT_TASKS - runningCount;
    if (availableSlots <= 0) return;
    const tasksToStart = tasks
      .filter((t) => t.status === DOWNLOAD_STATUS.QUEUED)
      .slice(0, availableSlots);
    tasksToStart.forEach((taskToStart) => {
      taskToStart.status = DOWNLOAD_STATUS.DOWNLOADING;
      DownloadManager._startExecutingDownload(taskToStart.url);
    });
    DownloadManager._notifyListeners();
  },
  _startExecutingDownload: async (url) => {
    const task = downloadTasks.get(url);
    if (!task || task.status !== DOWNLOAD_STATUS.DOWNLOADING) return;
    const sanitizedDir = `${task.location}/${task.title}`;

    try {
      const { result, baseUrl, error, rawManifestText } =
        await parseUrlToSegments(url);
      if (error || !result) {
        throw new Error(
          error || 'Failed parsing remote streaming manifest blueprint',
        );
      }

      const segments = result.segments || [];
      if (segments.length === 0) throw new Error('No video segments detected');

      // 1. Initial M3U8 Generation Setup
      const localM3u8Path = `${sanitizedDir}/local.m3u8`;
      const hasLocalManifest =
        await ReactNativeBlobUtil.fs.exists(localM3u8Path);
      if (!hasLocalManifest) {
        await ReactNativeBlobUtil.fs.mkdir(sanitizedDir).catch(() => {});
        await convertRemoteToLocalM3u8(rawManifestText, sanitizedDir);
      }

      // 2. Clear out everything safely if the segment count changed mid-stream
      if (task.totalSegments && task.totalSegments !== segments.length) {
        if (await ReactNativeBlobUtil.fs.exists(sanitizedDir)) {
          await ReactNativeBlobUtil.fs.unlink(sanitizedDir);
        }
        await ReactNativeBlobUtil.fs.mkdir(sanitizedDir).catch(() => {});
        await convertRemoteToLocalM3u8(rawManifestText, sanitizedDir);

        task.downloadedSegments = 0;
        task.progress = 0;
      }

      task.totalSegments = segments.length;
      activeNetworkRequests.set(url, []);

      for (let i = task.downloadedSegments; i < segments.length; i++) {
        if (task.status !== DOWNLOAD_STATUS.DOWNLOADING) break;

        const segment = segments[i];
        const segmentUrl = segment.url?.startsWith('http')
          ? segment.url
          : `${baseUrl}${segment.url}`;
        const destinationPath = `${sanitizedDir}/${i}.ts`;
        const downloadSession = ReactNativeBlobUtil.config({
          path: destinationPath,
          overwrite: true,
        }).fetch('GET', segmentUrl);

        activeNetworkRequests.get(url).push(downloadSession);

        // 1. Await the response container object cleanly
        const res = await downloadSession;
        const httpStatus = res.info().status;

        // 2. 🚨 CRUCIAL GATEWAY CHECK: Verify the server actually served binary video chunks
        if (httpStatus !== 200) {
          // Silently clean up the mock 404 HTML file from disk so ExoPlayer won't trip on it
          try {
            await ReactNativeBlobUtil.fs.unlink(destinationPath);
          } catch (_) {}

          // Break out or mark task as failed depending on your preferred retry layout
          throw new Error(
            `Download stream interrupted. Fragment returned HTTP code ${httpStatus}`,
          );
        }

        activeNetworkRequests.set(
          url,
          activeNetworkRequests
            .get(url)
            .filter((req) => req !== downloadSession),
        );

        // 3. Only increment tracking steps if the data was a legitimate 200 OK stream payload
        task.downloadedSegments = i + 1;
        task.progress = task.downloadedSegments / task.totalSegments;

        if (i % 15 === 0 && downloadTasks.get(url)) {
          await DownloadManager._saveStateToDisk();
        }
        DownloadManager._notifyListeners();
      }
      if (task.downloadedSegments === task.totalSegments) {
        task.status = DOWNLOAD_STATUS.COMPLETED;
        activeNetworkRequests.delete(url);
        await DownloadManager._saveStateToDisk(); // Final state check-in must be saved immediately
        DownloadManager._processQueue();
      }
    } catch (err) {
      if (task.status !== DOWNLOAD_STATUS.PAUSED) {
        task.status = DOWNLOAD_STATUS.FAILED;
        activeNetworkRequests.delete(url);
        await DownloadManager._saveStateToDisk();
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
      await DownloadManager.getDiskSpace(true);
    } catch (e) {
      
    }
  },

  _notifyListeners: async () => {
    const stats = await DownloadManager.getStats();
    progressListeners.forEach((listener) => listener(stats));
  },
};

export const parseUrlToSegments = async (url) => {
  try {
    let res = await ReactNativeBlobUtil.config({ fileCache: false }).fetch(
      'GET',
      url,
    );
    let manifestText = res.text();
    let baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    // 2. Parse the initial manifest
    const reader = new M3U8FileParser();
    reader.read(manifestText);
    let result = reader.getResult();
    reader.reset();
    if (
      result.segments &&
      result.segments.length > 0 &&
      result.segments[0].isMasterPlaylist
    ) {
      
      const targetMediaUri = result.segments[0].url;
      const subPlaylistUrl = targetMediaUri.startsWith('http')
        ? targetMediaUri
        : `${baseUrl}${targetMediaUri}`;
      
      res = await ReactNativeBlobUtil.config({ fileCache: false }).fetch(
        'GET',
        subPlaylistUrl,
      );
      manifestText = res.text();
      baseUrl = subPlaylistUrl.substring(
        0,
        subPlaylistUrl.lastIndexOf('/') + 1,
      );
      reader.read(manifestText);
      result = reader.getResult();
      reader.reset();
    }

    
    return { result, baseUrl, rawManifestText: manifestText };
  } catch (e) {
    
    return { result, baseUrl, error: true };
  }
};

export const convertRemoteToLocalM3u8 = async (
  rawManifestText,
  localFolderDir,
) => {
  try {
    const lines = rawManifestText.split(/\r?\n/);
    let localizedLines = ['#EXTM3U'];
    let segmentIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip empty lines or duplicate headers
      if (!line || line === '#EXTM3U') continue;
      // 1. Handle Encryption Keys (AES-128)
      if (line.startsWith('#EXT-X-KEY:')) {
        const localizedKeyLine = line.replace(/URI="[^"]+"/, `URI="key.key"`);
        localizedLines.push(localizedKeyLine);
        continue;
      }
      // 2. Handle Discontinuity Markers
      if (line.startsWith('#EXT-X-DISCONTINUITY')) {
        localizedLines.push(line);
        continue;
      }
      // 3. Handle EXTINF Tags
      if (line.startsWith('#EXTINF:')) {
        localizedLines.push(line);
        continue;
      }

      if (line.startsWith('#EXT-X-')) {
        if (
          !line.startsWith('#EXT-X-MEDIA-SEQUENCE:') &&
          !line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:') &&
          !line.startsWith('#EXT-X-MAP:')
        ) {
          localizedLines.push(line);
        }
        continue;
      }

      if (line.startsWith('#')) {
        localizedLines.push(line);
        continue;
      }
      // const sanitizedDir = `${task.location}/${task.title}`;
      localizedLines.push(`${segmentIndex}.ts`);
      segmentIndex++;
    }

    if (!localizedLines.includes('#EXT-X-ENDLIST')) {
      localizedLines.push('#EXT-X-ENDLIST');
    }

    // 🚨 THE CIRCUIT BREAKER: Validate that localFolderDir is a real path
    if (
      !localFolderDir ||
      localFolderDir === 'undefined' ||
      localFolderDir.includes('undefined')
    ) {
      return null; // Exit gracefully without attempting filesystem writes
    }

    const localM3u8Path = `${localFolderDir}/local.m3u8`;

    // Ensure the parent directory actually still exists before writing to it
    const folderExists = await ReactNativeBlobUtil.fs.exists(localFolderDir);
    if (!folderExists) {
      
        `Target folder structure was cleaned up mid-flight: ${localFolderDir}`,
      );
      return null;
    }

    await ReactNativeBlobUtil.fs.writeFile(
      localM3u8Path,
      localizedLines.join('\n'),
      'utf8',
    );

    return `file://${localM3u8Path}`;
  } catch (err) {
    
    return null;
  }
};
