import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

const logoSource = require('../../assets/logo.jpg');

interface AppLogoProps {
  size?: number;
  ringColor?: string;
}

// The MorganyPro badge, clipped into a circle via overflow:hidden on a
// same-size rounded container (the source file is a square with a black
// background, so a plain <Image> would show square corners).
export const AppLogo = ({ size = 72, ringColor = 'rgba(242, 182, 115, 0.5)' }: AppLogoProps) => {
  return (
    <View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, borderColor: ringColor },
      ]}
    >
      <Image
        source={logoSource}
        style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }}
        resizeMode="cover"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
});
