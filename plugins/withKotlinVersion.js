const { withGradleProperties } = require('@expo/config-plugins');

function setGradleProperty(props, key, value) {
  const index = props.findIndex(
    (item) => item.type === 'property' && item.key === key
  );

  if (index >= 0) {
    props[index].value = value;
  } else {
    props.push({ type: 'property', key, value });
  }
}

module.exports = function withKotlinVersion(config) {
  return withGradleProperties(config, (config) => {
    setGradleProperty(config.modResults, 'android.kotlinVersion', '2.0.0');
    setGradleProperty(config.modResults, 'android.kspVersion', '2.0.0-1.0.24');
    return config;
  });
};
