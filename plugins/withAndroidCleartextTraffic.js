const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const buildProfile = (process.env.EAS_BUILD_PROFILE || '').toLowerCase();
    const explicitFlag = (process.env.EXPO_PUBLIC_ALLOW_CLEARTEXT || '').toLowerCase();
    const shouldEnableCleartext =
      explicitFlag === 'true' ||
      buildProfile === 'development' ||
      buildProfile === 'preview';

    const mainApplication = AndroidConfig.Manifest.getMainApplication(config.modResults);
    if (!mainApplication) {
      return config;
    }

    mainApplication.$['android:usesCleartextTraffic'] = shouldEnableCleartext ? 'true' : 'false';
    return config;
  });
};
