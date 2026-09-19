module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated v4 moved its worklet transform into react-native-worklets;
    // this must stay last in the plugins list.
    plugins: ['react-native-worklets/plugin'],
  };
};
