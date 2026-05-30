import ReactNativeBlobUtil from 'react-native-blob-util';

export const convertSpaceToText = (num, unit = 'MB') => {
  try {
    const freeBytes = parseInt(num, 10);
    const freeSize =
      unit === 'GB'
        ? (freeBytes / (1024 * 1024 * 1024)).toFixed(1)
        : unit === 'MB'
          ? (freeBytes / (1024 * 1024)).toFixed(1)
          : unit === 'KB'
            ? (freeBytes / 1024).toFixed(1)
            : '';
    return `${freeSize}`;
  } catch (e) {
    return 'invalid';
  }
};
export const updateSystemDiskSpace = async () => {
  try {
    const spaceData = await ReactNativeBlobUtil.fs.df();
    return spaceData;
  } catch (err) {
    return {};
  }
};
